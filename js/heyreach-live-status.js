/**
 * Shared HeyReach live-status classification helpers.
 *
 * Single source of truth for how we decide, from HeyReach's own live API data,
 * whether a lead has already had a connection request / message sent, or is
 * terminally dead (failed / stopped / bounced), versus genuinely still pending.
 *
 * Used by both connect/sent_messages.html ("Upcoming Outreach") and
 * connect/in_processes_today.html ("In Processes Today") so the two reports
 * never drift apart again. The backend twin of this file is
 * RailwayCLemail/services/heyreachClassify.js — keep the constants and
 * classification rules in both files identical.
 */

// LinkedIn profile URLs often end with a short trailing hash HeyReach/webhooks
// sometimes append (e.g. "-a4a9ab9"). Strip it so URLs from different sources
// (connect_queue, heyreach_activity webhooks, HeyReach's live API) always
// normalize to the same key for Set/Map lookups.
export const LI_HASH_RE = /-[0-9a-f]{4,10}$/i;

export function canonicalLinkedInUrl(url = '') {
    if (!url) return '';
    return String(url).toLowerCase().trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/+$/, '')
        .replace(LI_HASH_RE, '');
}

// Returns true if a LinkedIn /in/ slug looks like a HeyReach internal ID or other
// garbled/encoded value rather than a real person's URL slug. Ported from
// in_processes_today.html so sent_messages.html can apply the identical
// exclusion when tallying "still in HeyReach queue".
export function isGarbledSlug(url) {
    const m = (url || '').match(/\/in\/([^/?&#]+)/i);
    const slug = m ? m[1].replace(LI_HASH_RE, '').toLowerCase() : (url || '').toLowerCase().replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '');
    if (!slug) return true;
    const parts = slug.split('-');
    for (const part of parts) {
        if (part.length > 15) return true;              // no real name segment is >15 chars
        if (/[^aeiou\d\-]{5,}/i.test(part)) return true; // 5+ consecutive consonants
        if (/[a-z]\d[a-z]/i.test(part)) return true;     // embedded digit like "nlut8blee"
    }
    // Also reject if the whole slug is >30 chars with no hyphens
    if (slug.length > 30 && !slug.includes('-')) return true;
    return false;
}

// Same 3-week cutoff in_processes_today.html uses to drop queue entries that
// were pushed to HeyReach so long ago they're presumed dead (HeyReach never
// reported them sent, terminal, or even present in the campaign's live lead
// list — so they'll likely never resolve one way or the other).
export const STALE_QUEUE_MS = 21 * 24 * 60 * 60 * 1000;

// HeyReach's lead object does NOT have a generic `status` field — it returns
// leadCampaignStatus / leadConnectionStatus / leadMessageStatus / errorCode /
// failedTime / finishedTime instead. Cross-checking against these (instead of
// trusting our own webhook-derived "sent" tracking alone) catches leads whose
// webhook event was missed or never fired.
export const HR_TERMINAL_STATUSES = new Set([
    'FAILED', 'ERROR', 'STOPPED', 'CONTACT_NOT_FOUND', 'BOUNCED', 'COMPLETED',
    'CONNECTION_REQUEST_FAILED', 'INMAIL_FAILED', 'MESSAGE_FAILED',
    'PROFILE_NOT_FOUND', 'ACCOUNT_PAUSED',
]);
export const HR_ALREADY_SENT_PATTERNS = ['SENT', 'ACCEPT', 'PENDING', 'CONNECTED'];
export const HR_NOT_SENT_PATTERNS     = ['NOT_SENT', 'NOTSENT', 'NONE', 'NOT_CONNECTED', 'WAITING'];

export function hrLooksAlreadySent(val) {
    if (!val) return false;
    if (HR_NOT_SENT_PATTERNS.some(p => val.includes(p))) return false;
    return HR_ALREADY_SENT_PATTERNS.some(p => val.includes(p));
}

// Classifies one HeyReach lead object (from /lead/GetLead, /lead/GetAll, or
// /campaign/GetLeadsFromCampaign — all three share this field shape).
export function classifyHrLead(lead) {
    const campaignStatus   = String(lead.leadCampaignStatus || lead.status || '').toUpperCase().replace(/[\s_-]/g, '_');
    const connectionStatus = String(lead.leadConnectionStatus || '').toUpperCase().replace(/[\s_-]/g, '_');
    const messageStatus    = String(lead.leadMessageStatus || '').toUpperCase().replace(/[\s_-]/g, '_');
    const errCode          = lead.errorCode;
    const hasFailed        = !!lead.failedTime;
    const isTerminal = hasFailed || campaignStatus === 'FAILED' || campaignStatus === 'FINISHED'
        || HR_TERMINAL_STATUSES.has(campaignStatus)
        || (errCode != null && errCode !== 0 && String(errCode) !== '0' && String(errCode).toUpperCase() !== 'NONE');
    const isAlreadySent = hrLooksAlreadySent(connectionStatus) || hrLooksAlreadySent(messageStatus);
    return { isAlreadySent, isTerminal };
}

// Pulls the LinkedIn profile URL out of a HeyReach lead object, regardless of
// which endpoint/shape it came from (flat fields vs nested linkedInUserProfile).
export function extractLeadProfileUrl(lead) {
    const prof = lead.linkedInUserProfile || lead.leadProfile || {};
    const usernameUrl = prof.username ? `https://www.linkedin.com/in/${prof.username}` : '';
    return lead.profileUrl || lead.linkedinUrl || lead.linkedInUrl || lead.leadProfileUrl
        || prof.profileUrl || prof.linkedInUrl || prof.url || usernameUrl || '';
}

// Extracts the {{content}} campaign variable from any Firestore document or
// HeyReach API lead object. connect_queue stores it as message_to_contact
// (primary), customMessage / custom_message (top-level), or inside
// customVariables.content / customUserFields (HeyReach's live API shape).
export function extractHeyReachContent(data) {
    if (!data) return '';
    if (data.message_to_contact) return String(data.message_to_contact);
    if (data.customMessage)   return String(data.customMessage);
    if (data.custom_message)  return String(data.custom_message);
    if (data.customVariables && typeof data.customVariables === 'object') {
        const v = data.customVariables.content || data.customVariables.Content || '';
        if (v) return String(v);
    }
    if (Array.isArray(data.customUserFields)) {
        const f = data.customUserFields.find(f => (f.name||f.key||f.fieldName||'').toLowerCase() === 'content');
        if (f) return String(f.value || f.fieldValue || '');
    }
    if (Array.isArray(data.variables)) {
        const f = data.variables.find(f => (f.name||f.key||'').toLowerCase() === 'content');
        if (f && f.value) return String(f.value);
    }
    if (Array.isArray(data.userVariables)) {
        const f = data.userVariables.find(f => (f.name||f.key||'').toLowerCase() === 'content');
        if (f && f.value) return String(f.value);
    }
    return data.content || data.message || data.connection_message || data.message_text || '';
}

/**
 * Pulls every lead in one HeyReach campaign via the bulk /leads/getall proxy
 * endpoint (paginated) and classifies each with classifyHrLead() — a single
 * request per page instead of one request per lead, so a BDR with hundreds of
 * tracked leads can be reclassified in a couple of seconds instead of minutes.
 *
 * Returns a Map<canonicalUrl, { isAlreadySent, isTerminal, lead }>.
 */
export async function fetchLiveCampaignStatusMap({ backendUrl, apiKey, campaignId }) {
    const map = new Map();
    const campIdInt = parseInt(campaignId, 10);
    if (!apiKey || isNaN(campIdInt)) return map;
    try {
        const PAGE = 100;
        let offset = 0, keepFetching = true, pages = 0;
        while (keepFetching && pages < 50) {
            const res = await fetch(`${backendUrl}/proxy/heyreach/leads/getall`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ campaignId: campIdInt, status: 'all', offset, limit: PAGE })
            });
            if (!res.ok) break;
            const j = await res.json().catch(() => ({}));
            const page = j.items || j.leads || j.data || (Array.isArray(j) ? j : []);
            for (const lead of page) {
                const u = canonicalLinkedInUrl(extractLeadProfileUrl(lead));
                if (!u) continue;
                map.set(u, { ...classifyHrLead(lead), lead });
            }
            pages++;
            offset += PAGE;
            keepFetching = page.length >= PAGE;
        }
    } catch (e) {
        console.warn(`[heyreach-live-status] bulk status fetch failed for campaign ${campaignId}:`, e.message);
    }
    return map;
}
