/**
 * weekly_client_report.js
 * ---------------------------------------------------------------------------
 * Pure report-assembly logic for the ADMIN "Weekly Client Report" on
 * export_outreach_history.html.  No Firestore / DOM access in here — the page
 * loads the data, hands it to assembleReport(), then buildWorkbook() writes one
 * Excel file whose first sheet (README_FOR_CHATGPT) explains every other sheet
 * so the file can be uploaded straight to ChatGPT to draft the client report.
 *
 * Loaded lazily by the page with:  await import('./weekly_client_report.js?v=1')
 * Also importable from Node for tests (no browser globals used).
 */

export const REPORT_VERSION = '2026-11-19.1';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');
const lc = s => (s === null || s === undefined) ? '' : String(s).trim().toLowerCase();
const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;

export function toDate(ts) {
    if (!ts) return null;
    if (ts instanceof Date) return isNaN(ts) ? null : ts;
    if (typeof ts.toDate === 'function') { try { return ts.toDate(); } catch (e) { return null; } }
    if (ts.seconds !== undefined) return new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6);
    if (ts._seconds !== undefined) return new Date(ts._seconds * 1000 + (ts._nanoseconds || 0) / 1e6);
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d) ? null : d; }
    return null;
}

/** Local calendar day ('YYYY-MM-DD') of a Date / timestamp / ISO string. Date-only strings pass through untouched. */
export function dayKey(v) {
    if (!v) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = toDate(v);
    if (!d || isNaN(d)) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d + n, 12));
}

export function listDays(a, b) {
    const out = [];
    for (let d = a, guard = 0; d <= b && guard < 800; d = addDays(d, 1), guard++) out.push(d);
    return out;
}

export function prevPeriod(p) {
    const len = listDays(p.start, p.end).length;
    return { start: addDays(p.start, -len), end: addDays(p.start, -1) };
}

const inP = (day, a, b) => !!day && day >= a && day <= b;

function fmtDT(v) {
    const d = toDate(v);
    if (!d) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
const fmtD = v => dayKey(v);
const trunc = (s, n) => { s = (s === null || s === undefined) ? '' : String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const pct = (n, d) => d ? Math.round(n / d * 1000) / 10 : null;
const ratio = (n, d) => d ? Math.round(n / d * 10) / 10 : null;
const yn = v => v ? 'Yes' : 'No';
const joinList = a => (Array.isArray(a) ? a : []).filter(x => x !== null && x !== undefined && x !== '').join('; ');
const normName = s => lc(s).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

export function normUrl(url) {
    if (!url) return '';
    return String(url).toLowerCase().trim().split(/[?#]/)[0].replace(/\/$/, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}

/** Extract the LinkedIn `/in/<slug>` identifier for cross-source matching (handles country subdomains & URL encoding). */
export function liSlug(url) {
    if (!url) return '';
    const raw = String(url).trim().split(/[?#]/)[0];
    const m = raw.match(/linkedin\.com\/in\/([^/]+)/i);
    if (!m) return '';
    let slug = m[1].toLowerCase().trim();
    try { slug = decodeURIComponent(slug).toLowerCase().trim(); } catch (_) {}
    return slug;
}

const normConvId = s => String(s || '').replace(/^webhook_/, '');
const isTrue = v => v === true || v === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Pando / HealthLuminate origin helpers
// ─────────────────────────────────────────────────────────────────────────────
// The executive's LinkedIn inbox (`heyreach_inbox`) and connection list (`heyreach_contacts`)
// mirror their ENTIRE LinkedIn account — including pre-existing connections, personal chats,
// inbound cold pitches/recruiters where the other person wrote first, and mirrored post comments
// (`kind: 'post_reply'`). None of those originated from Pando/HealthLuminate and none belong in
// the Weekly Client Report.
const LEAD_SENDERS = new Set(['correspondent', 'lead', 'them', 'inbound', 'contact']);
const OUR_SENDERS  = new Set(['me', 'account', 'outbound', 'bdr']);

/** Activity types recorded from non-Pando personal-inbox tools (personal_messages.html). */
export const NON_PANDO_ACTIVITY_TYPES = new Set(['personal_message_reply']);

/** Activity types that themselves initiate Pando/HealthLuminate outreach to a contact. */
export const PANDO_ORIGINATING_ACTIVITY_TYPES = new Set([
    'fast_outreach_message',
    'fast_outreach_bulk_message',
    'fast_message_via_conversation',
    'bulk_follow_up_message',
    'harvest_follow_up_message'
]);

export function extractQueueUrl(d) {
    if (!d) return '';
    return normUrl(
        d.prospect_li_url || d.contact_linkedin_url || d.prospect_linkedin_url ||
        d.linkedin_url || d.linkedInUrl || d.contactLinkedInUrl || ''
    );
}

export function isQueueItemSent(d) {
    if (!d) return false;
    return isTrue(d.pushed_to_heyreach) || Boolean(d.pushed_to_heyreach_at || d.pushed_at) || lc(d.status) === 'sent';
}

export function isConnectInviteItem(d) {
    const t = lc((d && d.message_type) || 'connect');
    return t === 'connect' || t === 'connection' || t === 'connect_only';
}

/**
 * True when the conversation thread was initiated by our side (BDR / Pando) rather than inbound
 * by the contact. Mirrors `company_review_replies.html` (`convFirstMessageInbound`),
 * `index_admin.html` (`_liAlertFirstMessageInbound`), `inbox_interest.js`, and server
 * `conversationStartedByUs()`, with an explicit allowance for `connect_only` blank connection
 * requests sent prior to the contact's first message.
 */
export function conversationStartedByUs(rawMessages, opts = {}) {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return true;
    const nonEmpty = rawMessages.filter(m => m && String(m.body ?? m.text ?? m.message ?? '').trim().length > 0);
    const list = nonEmpty.length ? nonEmpty : rawMessages;
    let ordered = list;
    const dated = list.map(m => ({ m, at: toDate(m && (m.createdAt || m.timestamp || m.created_at || m.sentAt || m.date || m.datetime)) }));
    if (dated.every(x => x.at)) {
        ordered = dated.slice().sort((a, b) => a.at - b.at).map(x => x.m);
    }
    const first = ordered[0] || {};
    const sender = lc(first.senderType || first.sender || first.direction || '');
    if (LEAD_SENDERS.has(sender)) {
        if (opts && opts.hadPriorBlankInvite) {
            const firstAt = toDate(first.createdAt || first.timestamp || first.created_at || first.sentAt || first.date || first.datetime);
            if (!opts.blankInviteAt || !firstAt || opts.blankInviteAt <= firstAt) return true;
        }
        return false;
    }
    return OUR_SENDERS.has(sender);
}

/**
 * Build the allowlist of contacts whose outreach or connection originated from Pando/HealthLuminate.
 */
export function buildPandoOriginAllowlist(src = {}) {
    const outreachUrls       = new Set();
    const outreachSlugs      = new Set();
    const connectInviteUrls  = new Set();
    const connectInviteSlugs = new Set();
    const blankInviteAtByKey = new Map();
    const manualHlDates      = new Map();

    const addOutreach = rawUrl => {
        const u = normUrl(rawUrl);
        if (u) outreachUrls.add(u);
        const sl = liSlug(rawUrl);
        if (sl) outreachSlugs.add(sl);
    };
    const addConnectInvite = rawUrl => {
        addOutreach(rawUrl);
        const u = normUrl(rawUrl);
        if (u) connectInviteUrls.add(u);
        const sl = liSlug(rawUrl);
        if (sl) connectInviteSlugs.add(sl);
    };
    const recordBlankInvite = (rawUrl, at) => {
        const dt = toDate(at);
        for (const k of [normUrl(rawUrl), liSlug(rawUrl)]) {
            if (!k) continue;
            const prev = blankInviteAtByKey.get(k);
            if (prev === undefined || (dt && (!prev || dt < prev))) blankInviteAtByKey.set(k, dt || null);
        }
    };

    // 1) connect_queue items actually sent/pushed by PandoConnect
    (src.queue || []).forEach(raw => {
        const d = raw && raw.d ? raw.d : raw;
        if (!isQueueItemSent(d)) return;
        const u = extractQueueUrl(d);
        if (!u) return;
        if (isConnectInviteItem(d)) {
            addConnectInvite(u);
            const noteText = String(
                d.message_to_contact || d.message || d.messageText || d.messageContent ||
                d.custom_message || d.note || d.connection_note || ''
            ).trim();
            if (isTrue(d.connection_only) || !noteText) {
                recordBlankInvite(u, d.pushed_to_heyreach_at || d.pushed_at || d.adminApprovedAt || d.customerApprovedAt || d.created_at || d.uploaded_date || d.generated_at);
            }
        } else {
            addOutreach(u);
        }
    });

    // 2) connect_activity push records (excluding profile-search logs and failed pushes)
    (src.connectActivity || []).forEach(a => {
        if (!a) return;
        if (lc(a.activityType) === 'search' || lc(a.status) === 'failed') return;
        const u = a.contactLinkedInUrl || a.prospect_li_url || a.linkedin_url || a.linkedInUrl || a.leadProfileUrl || '';
        if (!u) return;
        const via = lc(a.via);
        const actionType = lc(a.actionType);
        const isMsgOnly = via.includes('quick_message') || via.includes('message_campaign') || actionType.includes('message') || lc(a.activityType) === 'message';
        if (isMsgOnly) addOutreach(u);
        else addConnectInvite(u);
    });

    // 3) Quick Message campaign leads pushed by PandoConnect
    (src.quickEvents || []).forEach(e => {
        if (e) addOutreach(e.liUrl || e.linkedinUrl || '');
    });

    // 4) Scheduled DM slots queued & sent via PandoConnect (linkedin_message_queue)
    (src.slotEvents || []).forEach(e => {
        if (e) addOutreach(e.liUrl || e.recipientLinkedInUrl || '');
    });

    // 5) Outbound Pando tools in activity_tracking (fast outreach, fast message, bulk/harvest follow-ups)
    (src.activityEvents || []).forEach(e => {
        if (!e) return;
        const kind = e.kind || e.activity_type || '';
        if (NON_PANDO_ACTIVITY_TYPES.has(kind)) return;
        if (PANDO_ORIGINATING_ACTIVITY_TYPES.has(kind)) addOutreach(e.liUrl || e.contact_linkedin_url || '');
    });

    // 6) Contacts manually labeled "Pando Executive Networking originated" in Harvest Pool Admin
    (src.manualHarvest || []).forEach(m => {
        if (!m || m.originType !== 'healthluminate') return;
        const raw = m.linkedInUrl || m.normalizedUrl || '';
        const u = normUrl(raw);
        if (!u) return;
        addConnectInvite(u);
        const dt = toDate(m.referenceDate);
        if (dt && (!manualHlDates.has(u) || dt < manualHlDates.get(u))) manualHlDates.set(u, dt);
    });

    const hasOutreach = rawUrl => {
        if (!rawUrl) return false;
        const u = normUrl(rawUrl);
        if (u && outreachUrls.has(u)) return true;
        const sl = liSlug(rawUrl);
        return Boolean(sl && outreachSlugs.has(sl));
    };
    const hasConnectInvite = rawUrl => {
        if (!rawUrl) return false;
        const u = normUrl(rawUrl);
        if (u && connectInviteUrls.has(u)) return true;
        const sl = liSlug(rawUrl);
        return Boolean(sl && connectInviteSlugs.has(sl));
    };
    const blankInviteInfo = rawUrl => {
        if (!rawUrl) return { hadPriorBlankInvite: false, blankInviteAt: null };
        const u = normUrl(rawUrl);
        if (u && blankInviteAtByKey.has(u)) return { hadPriorBlankInvite: true, blankInviteAt: blankInviteAtByKey.get(u) };
        const sl = liSlug(rawUrl);
        if (sl && blankInviteAtByKey.has(sl)) return { hadPriorBlankInvite: true, blankInviteAt: blankInviteAtByKey.get(sl) };
        return { hadPriorBlankInvite: false, blankInviteAt: null };
    };

    return {
        outreachUrls,
        outreachSlugs,
        connectInviteUrls,
        connectInviteSlugs,
        manualHlDates,
        size: outreachUrls.size,
        hasOutreach,
        hasConnectInvite,
        blankInviteInfo
    };
}

/**
 * True when a `heyreach_inbox` conversation originated from Pando/HealthLuminate for this client:
 * not a post comment (`kind: 'post_reply'`), belongs to a BDR in scope, has a Pando outreach
 * record for the contact, and was initiated by our side rather than inbound by the contact.
 */
export function isPandoConversation(entry, allowlist, allowedEmails = null) {
    if (!entry || lc(entry.kind) === 'post_reply') return false;
    if (allowedEmails && allowedEmails.size && entry.bdrEmail && !allowedEmails.has(lc(entry.bdrEmail))) return false;
    if (!entry.liUrl || !allowlist || !allowlist.hasOutreach(entry.liUrl)) return false;
    const bi = allowlist.blankInviteInfo(entry.liUrl);
    return conversationStartedByUs(entry.rawMessages || [], bi);
}
const bump = (map, key, n = 1) => { if (key) map.set(key, (map.get(key) || 0) + n); };
const sumRange = (map, a, b) => { let t = 0; map.forEach((v, k) => { if (k >= a && k <= b) t += v; }); return t; };

const col = (k, h, w, d) => ({ k, h, w: w || 16, d: d || '' });

// ─────────────────────────────────────────────────────────────────────────────
// Analysis payload (connect_analysis/latest.json) helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reduce the (huge, all-clients) analysis payload to just the selected company's
 * segment so the big object can be garbage-collected right after parsing.
 */
export function pickAnalysisClient(payload, companyName) {
    if (!payload || !payload.clients) return null;
    const entries = Object.entries(payload.clients);
    const candidates = entries.map(([k, c]) => c.name || k);
    const target = normName(companyName);
    let hit = entries.find(([k, c]) => normName(c.name || k) === target || normName(k) === target);
    if (!hit && target.length >= 4) {
        hit = entries.find(([k, c]) => {
            const n = normName(c.name || k);
            return n.length >= 4 && (n.includes(target) || target.includes(n));
        });
    }
    return {
        meta: payload.meta || {},
        overall: payload.overall ? { name: payload.overall.name, id: payload.overall.id, funnel: payload.overall.funnel } : null,
        modelDrivers: (payload.model_quality && payload.model_quality.top_drivers) || [],
        clientKey: hit ? hit[0] : '',
        client: hit ? hit[1] : null,
        candidates
    };
}

function segmentRows(analysis) {
    // [{level, key, seg}] — the client overall segment first, then every hypothesis group
    const out = [];
    if (!analysis || !analysis.client) return out;
    out.push({ level: 'client', groupName: '(whole client — all hypothesis groups)', seg: analysis.client });
    Object.entries(analysis.client.hypothesis_groups || {}).forEach(([k, seg]) => {
        out.push({ level: 'hypothesis_group', groupName: seg.name || k, seg });
    });
    return out;
}

const DIM_LABELS = {
    reason_to_connect: 'Reason to connect', hook_type: 'Hook type', tone: 'Tone', question_type: 'Question type',
    opener_type: 'Opener type', message_type: 'Message type', message_length: 'Message length (characters)',
    readability: 'Readability', personal_sharing: 'Personal sharing', connect_phrasing: 'Connect phrasing',
    exclamation_use: 'Exclamation marks', emoji_use: 'Emoji use', abbreviation_use: 'Abbreviations / texting shorthand',
    day_of_week: 'Day of week (first message)', time_of_day: 'Time of day (first message, US Central)', day_time: 'Day x time (first message)',
    request_day_of_week: 'Day of week (invite sent)', request_time_of_day: 'Time of day (invite sent, US Central)', request_day_time: 'Day x time (invite sent)',
    by_connections: 'Prospect connection count', total_messages: 'Total messages in thread', audience_seniority: 'Audience seniority',
    audience_org_type: 'Audience organization type', bdr_performance: 'BDR performance', message_type_overview: 'Message type overview'
};

// ─────────────────────────────────────────────────────────────────────────────
// Main assembly
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} inp  see the page (export_outreach_history.html → buildWeeklyReport) for the exact shape
 * @returns {{meta:object, sheets:Array, kpis:Array, instructions:string, counts:object}}
 */
export function assembleReport(inp) {
    const P = inp.period;
    const PV = prevPeriod(P);
    const days = listDays(P.start, P.end);
    const periodLabel = `${P.start} to ${P.end}`;
    const prevLabel = `${PV.start} to ${PV.end}`;
    const scopeAll = inp.options && inp.options.historyScope === 'all';
    const canon = inp.canon || {};
    const canonical = e => { e = lc(e); return canon[e] || e; };
    const bdrNameOf = e => (inp.bdrNames && inp.bdrNames[canonical(e)]) || canonical(e) || '';
    const clientName = inp.company.name;
    const diag = (inp.diagnostics || []).slice();
    const emailSet = new Set((inp.company.emails || []).map(lc));
    const canonEmailSet = new Set([...emailSet, ...[...emailSet].map(canonical), ...((inp.company.bdrs || []).map(b => canonical(b.email)))].filter(Boolean));
    const groupName = {};
    (inp.hypothesisGroups || []).forEach(g => { groupName[g.id] = g.name || g.id; });

    // ── Queue documents (connect_queue) ─────────────────────────────────────
    const queue = (inp.queue || []).map(d => {
        const bdr = canonical(d.account_email || d.bdr_auth_email || d.bdr_email || '');
        const rs = lc(d.reviewStatus);
        const fn = d.contactFirstName || d.prospect_first_name || d.firstName || '';
        const ln = d.contactLastName || d.prospect_last_name || d.lastName || '';
        return {
            d, id: d.id, bdr,
            url: extractQueueUrl(d),
            name: (fn + ' ' + ln).trim() || d.leadName || d.prospect_name || '',
            title: d.contactTitle || d.prospect_title || d.prospect_position || d.position || d.title || '',
            company: d.contactCompany || d.prospect_company || d.company || d.company_name || '',
            genAt: toDate(d.uploaded_date || d.generated_at || d.generatedAt || d.created_at || d.createdAt),
            // adminReviewedAt can also be stamped on rejected messages, so only count it as an approval if the record wasn't removed
            approvedAt: toDate(d.adminApprovedAt || (isTrue(d.deleted) ? null : d.adminReviewedAt)),
            custApprovedAt: toDate(d.customerApprovedAt),
            editedAt: toDate(d.lastEditedAt),
            deleted: isTrue(d.deleted),
            deletedAt: toDate(d.deleted_date || d.deletedAt),
            deletedBy: d.deleted_by || d.deletedBy || '',
            deletedReason: d.deleted_reason || d.deletionMethod || '',
            pushed: isQueueItemSent(d),
            pushedAt: toDate(d.pushed_to_heyreach_at || d.pushed_at),
            sentAt: toDate(d.pushed_to_heyreach_at || d.pushed_at || d.adminApprovedAt || d.customerApprovedAt || d.created_at || d.uploaded_date || d.generated_at),
            reviewStatus: rs
        };
    });
    const sentQ = queue.filter(q => q.pushed);

    // ── Pando / HealthLuminate origin filter ────────────────────────────────
    // Exclude connections, messages, and conversations that did not originate from Pando/HealthLuminate
    // (organic LinkedIn chats, pre-existing connections, inbound-initiated conversations, post comments,
    // and personal_messages.html replies).
    const allowlist = inp.allowlist || buildPandoOriginAllowlist({
        queue: inp.queue || [],
        connectActivity: inp.allConnectActivity || inp.connectActivity || [],
        quickEvents: (inp.sendEvents || []).filter(e => e && e.kind === 'quick_message_campaign'),
        slotEvents: (inp.sendEvents || []).filter(e => e && e.kind === 'scheduled_message'),
        activityEvents: inp.sendEvents || [],
        manualHarvest: inp.manualHarvest || []
    });
    const hasOriginAllowlist = Boolean(
        inp.allowlist ||
        (inp.queue && inp.queue.length) ||
        (inp.allConnectActivity && inp.allConnectActivity.length) ||
        (inp.connectActivity && inp.connectActivity.length) ||
        (inp.sendEvents && inp.sendEvents.length) ||
        (inp.manualHarvest && inp.manualHarvest.length)
    );

    const nonPandoConvIds = new Set();
    const inboundPairs = new Set();
    const pandoInbox = [];
    (inp.inbox || []).forEach(e => {
        if (isPandoConversation(e, allowlist, canonEmailSet)) {
            pandoInbox.push(e);
        } else {
            if (e && e.id) nonPandoConvIds.add(normConvId(e.id));
            if (e && e.conversationId) nonPandoConvIds.add(normConvId(e.conversationId));
            const bi = allowlist.blankInviteInfo(e && e.liUrl);
            if (e && e.liUrl && !conversationStartedByUs(e.rawMessages || [], bi)) {
                const b = canonical(e.bdrEmail || '');
                inboundPairs.add(`${normUrl(e.liUrl)}||${b}`);
                const sl = liSlug(e.liUrl);
                if (sl) inboundPairs.add(`${sl}||${b}`);
            }
        }
    });

    const queuePage = q => {
        const d = q.d;
        if (d.pipelineRunId) return 'full_pipeline';
        return 'generate_messages';
    };
    const approvalPage = q => {
        const m = lc(q.d.approvalMethod);
        if (m.includes('profile_messages')) return 'generate_messages';
        return 'fast_connect_review';
    };

    // ── Series (day → count) used by Daily_Activity + KPIs ──────────────────
    const S = {};
    ['generated', 'adminApproved', 'customerApproved', 'edited', 'deleted', 'sentToHeyreach', 'accepted', 'repliedContacts',
        'contactMessages', 'bdrMessages', 'meetings', 'crmNotes', 'followUps', 'exclusions', 'pipelineRuns', 'contactScans',
        'contactsImported', 'workLogEntries'].forEach(k => { S[k] = new Map(); });

    queue.forEach(q => {
        bump(S.generated, dayKey(q.genAt));
        bump(S.adminApproved, dayKey(q.approvedAt));
        bump(S.customerApproved, dayKey(q.custApprovedAt));
        bump(S.edited, dayKey(q.editedAt));
        if (q.deleted) bump(S.deleted, dayKey(q.deletedAt));
    });
    // "contacts reached" = distinct contact+BDR whose invite went out that day
    const sentKeyDay = new Map(); // key -> earliest day
    sentQ.forEach(q => {
        const k = `${q.url}||${q.bdr}`;
        const day = dayKey(q.sentAt);
        if (!day) return;
        if (!sentKeyDay.has(k) || day < sentKeyDay.get(k)) sentKeyDay.set(k, day);
    });
    sentKeyDay.forEach(day => bump(S.sentToHeyreach, day));

    // ── Dataset rows (contact-level history built by the page's buildRows) ──
    const rowInfo = new Map();
    const dataset = (inp.dataset || []).filter(r => {
        if (!r) return false;
        const bdr = canonical(r.bdr_email || '');
        if (bdr && canonEmailSet.size && !canonEmailSet.has(bdr)) return false;
        if (r.outreach_sources === 'HeyReach conversation') return false;
        if (hasOriginAllowlist && !allowlist.hasOutreach(r.contact_linkedin_url)) return false;
        const u = normUrl(r.contact_linkedin_url || '');
        const sl = liSlug(r.contact_linkedin_url || '');
        if ((u && inboundPairs.has(`${u}||${bdr}`)) || (sl && inboundPairs.has(`${sl}||${bdr}`))) return false;
        if (!conversationStartedByUs(r.conversation_history || [], allowlist.blankInviteInfo(r.contact_linkedin_url))) return false;
        return true;
    });
    dataset.forEach(r => {
        const hist = r.conversation_history || [];
        const bdrDays = new Set(), contactDays = new Set();
        let firstBdr = '';
        hist.forEach(m => {
            const dk = m.datetime ? dayKey(m.datetime) : (m.date || '');
            if (!dk) return;
            if (m.sender === 'Contact') contactDays.add(dk);
            else { bdrDays.add(dk); if (!firstBdr || dk < firstBdr) firstBdr = dk; }
            if (m.sender === 'Contact') bump(S.contactMessages, dk); else bump(S.bdrMessages, dk);
        });
        contactDays.forEach(dk => bump(S.repliedContacts, dk));
        const connDay = r.connection_datetime ? dayKey(r.connection_datetime) : (r.connection_date || '');
        const pandoConn = r.connected === 1 && (!hasOriginAllowlist || allowlist.hasConnectInvite(r.contact_linkedin_url));
        if (pandoConn && connDay) bump(S.accepted, connDay);
        rowInfo.set(r, { bdrDays, contactDays, connDay: pandoConn ? connDay : '', pandoConn, firstDay: firstBdr || r.first_outreach_date || '' });
    });

    // ── Meetings scheduled (activity_tracking meeting_scheduled, deduped per contact) ──
    const meetingByUrl = new Map();
    (inp.meetingEvents || []).forEach(m => {
        if (m.conversation_id && nonPandoConvIds.has(normConvId(m.conversation_id))) return;
        const url = normUrl(m.contact_linkedin_url || '');
        const sl = liSlug(m.contact_linkedin_url || '');
        const bdr = canonical(m.bdr_email || m.bdr_auth_email || '');
        if (bdr && canonEmailSet.size && !canonEmailSet.has(bdr)) return;
        if (hasOriginAllowlist && url && !allowlist.hasOutreach(url)) return;
        if ((url && inboundPairs.has(`${url}||${bdr}`)) || (sl && inboundPairs.has(`${sl}||${bdr}`))) return;
        const day = dayKey(m.scheduled_at || m.meeting_scheduled_date || m.timestamp || m.created_at || m.createdAt);
        if (!day) return;
        const key = url || m.id;
        if (!meetingByUrl.has(key) || day < meetingByUrl.get(key).day) {
            meetingByUrl.set(key, { day, by: m.scheduled_by || '', bdr, name: m.contact_name || '', company: m.contact_company || '', url });
        }
    });
    meetingByUrl.forEach(v => bump(S.meetings, v.day));

    // ── Follow-up / reply / fast-outreach sends from the review pages ───────
    const sendEvents = (inp.sendEvents || []).map(e => {
        const known = (e.rawBdrs || []).find(x => canon[lc(x)]);
        return { ...e, bdr: e.bdrEmail ? canonical(e.bdrEmail) : (known ? canonical(known) : ''), day: dayKey(e.date) };
    }).filter(e => {
        if (NON_PANDO_ACTIVITY_TYPES.has(e.kind)) return false;
        if (e.bdr && canonEmailSet.size && !canonEmailSet.has(e.bdr)) return false;
        if (e.conversationId && nonPandoConvIds.has(normConvId(e.conversationId))) return false;
        const u = normUrl(e.liUrl || '');
        const sl = liSlug(e.liUrl || '');
        if ((u && inboundPairs.has(`${u}||${e.bdr}`)) || (sl && inboundPairs.has(`${sl}||${e.bdr}`))) return false;
        if (PANDO_ORIGINATING_ACTIVITY_TYPES.has(e.kind) || e.kind === 'quick_message_campaign' || e.kind === 'scheduled_message') return true;
        return !hasOriginAllowlist || (Boolean(e.liUrl) && allowlist.hasOutreach(e.liUrl));
    });
    sendEvents.forEach(e => bump(S.followUps, e.day));

    const pandoCrmNotes = (inp.crmNotes || []).filter(n => {
        const bdr = canonical(n.bdrEmail || '');
        if (bdr && canonEmailSet.size && !canonEmailSet.has(bdr)) return false;
        if (n.conversationId && nonPandoConvIds.has(normConvId(n.conversationId))) return false;
        const u = normUrl(n.linkedInUrl || '');
        const sl = liSlug(n.linkedInUrl || '');
        if ((u && inboundPairs.has(`${u}||${bdr}`)) || (sl && inboundPairs.has(`${sl}||${bdr}`))) return false;
        if (hasOriginAllowlist && u && !allowlist.hasOutreach(u)) return false;
        return true;
    });
    pandoCrmNotes.forEach(n => bump(S.crmNotes, dayKey(n.createdAt)));
    (inp.exclusions || []).forEach(x => bump(S.exclusions, dayKey(x.excludedAt)));
    (inp.pipelineRuns || []).forEach(r => bump(S.pipelineRuns, dayKey(r.startedAt)));
    (inp.contactSearches || []).forEach(j => bump(S.contactScans, dayKey(j.submittedAt)));
    (inp.importedContacts || []).forEach(c => bump(S.contactsImported, dayKey(c.uploadedAt || c.createdAt)));
    (inp.workLog || []).forEach(w => bump(S.workLogEntries, dayKey(w.occurredAt || w.createdAt)));

    // ── Funnel helper (contact cohort) ──────────────────────────────────────
    const funnel = rows => {
        const n = rows.length;
        const connected = rows.filter(r => { const info = rowInfo.get(r); return info ? info.pandoConn : r.connected === 1; }).length;
        const replied = rows.filter(r => r.replied === 1).length;
        const scheduled = rows.filter(r => r.scheduled === 1).length;
        return {
            contacts: n, connected, replied, scheduled,
            accept_rate: pct(connected, n), reply_rate: pct(replied, n), meeting_rate: pct(scheduled, n),
            replied_of_accepted: pct(replied, connected), scheduled_of_replied: pct(scheduled, replied),
            contacts_per_meeting: ratio(n, scheduled)
        };
    };
    const cohortRows = dataset.filter(r => inP(rowInfo.get(r).firstDay, P.start, P.end));
    const cohortPrevRows = dataset.filter(r => inP(rowInfo.get(r).firstDay, PV.start, PV.end));
    const fAll = funnel(dataset), fCohort = funnel(cohortRows), fCohortPrev = funnel(cohortPrevRows);

    // distinct contacts who replied / were reached in range
    const repliedIn = (a, b) => dataset.filter(r => { const i = rowInfo.get(r); for (const d of i.contactDays) if (inP(d, a, b)) return true; return false; }).length;

    // ── KPI table ───────────────────────────────────────────────────────────
    const kpi = (label, cur, prev, note) => ({ label, cur, prev, change: (typeof cur === 'number' && typeof prev === 'number') ? Math.round((cur - prev) * 10) / 10 : '', note: note || '' });
    const kpis = [];
    const sec = t => kpis.push({ section: t });
    sec('A. Outreach results — events that happened during the period');
    kpis.push(kpi('Connection requests / outreach sent (distinct contacts)', sumRange(S.sentToHeyreach, P.start, P.end), sumRange(S.sentToHeyreach, PV.start, PV.end), 'Contacts whose message was pushed to the sending platform in the period (date = push/approval date).'));
    kpis.push(kpi('Connections accepted', sumRange(S.accepted, P.start, P.end), sumRange(S.accepted, PV.start, PV.end), 'Acceptance date, among contacts we reached out to.'));
    kpis.push(kpi('Contacts who replied (distinct)', repliedIn(P.start, P.end), repliedIn(PV.start, PV.end), 'A contact counts if they sent at least one message during the period.'));
    kpis.push(kpi('Inbound messages received from contacts', sumRange(S.contactMessages, P.start, P.end), sumRange(S.contactMessages, PV.start, PV.end), 'Every message sent BY a prospect in the period (can exceed distinct repliers).'));
    kpis.push(kpi('Meetings scheduled', sumRange(S.meetings, P.start, P.end), sumRange(S.meetings, PV.start, PV.end), 'Meeting-scheduled records logged in the period (one per contact).'));
    kpis.push(kpi('Messages we sent (all follow-ups + openers)', sumRange(S.bdrMessages, P.start, P.end), sumRange(S.bdrMessages, PV.start, PV.end), 'All outbound messages found in conversation threads.'));
    kpis.push(kpi('Follow-ups / replies sent from the review tools', sumRange(S.followUps, P.start, P.end), sumRange(S.followUps, PV.start, PV.end), 'Follow-ups, replies, fast-outreach and scheduled DMs logged outside the connection-request queue.'));
    kpis.push(kpi('Conversation notes added (CRM notes)', sumRange(S.crmNotes, P.start, P.end), sumRange(S.crmNotes, PV.start, PV.end), 'Team notes/comments on conversations.'));
    sec('B. Outcomes for contacts first reached during the period (status as of today)');
    kpis.push(kpi('Contacts first reached in period', fCohort.contacts, fCohortPrev.contacts, 'Cohort — "previous" column is the cohort reached in the previous period.'));
    kpis.push(kpi('…of which accepted the connection', fCohort.connected, fCohortPrev.connected));
    kpis.push(kpi('…of which replied', fCohort.replied, fCohortPrev.replied));
    kpis.push(kpi('…of which scheduled a meeting', fCohort.scheduled, fCohortPrev.scheduled));
    kpis.push(kpi('Acceptance rate (% of cohort)', fCohort.accept_rate === null ? '' : fCohort.accept_rate, fCohortPrev.accept_rate === null ? '' : fCohortPrev.accept_rate, 'Newer cohorts are still maturing — recent contacts have had less time to accept/reply.'));
    kpis.push(kpi('Reply rate (% of cohort)', fCohort.reply_rate === null ? '' : fCohort.reply_rate, fCohortPrev.reply_rate === null ? '' : fCohortPrev.reply_rate));
    kpis.push(kpi('Meeting rate (% of cohort)', fCohort.meeting_rate === null ? '' : fCohort.meeting_rate, fCohortPrev.meeting_rate === null ? '' : fCohortPrev.meeting_rate));
    sec('C. Work performed for the client during the period');
    kpis.push(kpi('Messages written/generated', sumRange(S.generated, P.start, P.end), sumRange(S.generated, PV.start, PV.end), 'New message records created in the review queue (Generate Messages / Full Pipeline).'));
    kpis.push(kpi('Messages reviewed & approved by our team', sumRange(S.adminApproved, P.start, P.end), sumRange(S.adminApproved, PV.start, PV.end), 'Admin approval in Fast Connect Review.'));
    kpis.push(kpi('Messages approved by the client', sumRange(S.customerApproved, P.start, P.end), sumRange(S.customerApproved, PV.start, PV.end)));
    kpis.push(kpi('Messages edited by our team', sumRange(S.edited, P.start, P.end), sumRange(S.edited, PV.start, PV.end)));
    kpis.push(kpi('Messages removed (deleted / excluded / skipped)', sumRange(S.deleted, P.start, P.end), sumRange(S.deleted, PV.start, PV.end), 'Quality control: messages rejected before sending.'));
    kpis.push(kpi('Contacts excluded from outreach', sumRange(S.exclusions, P.start, P.end), sumRange(S.exclusions, PV.start, PV.end)));
    kpis.push(kpi('Pipeline runs executed', sumRange(S.pipelineRuns, P.start, P.end), sumRange(S.pipelineRuns, PV.start, PV.end), 'Full Pipeline runs (research → scan → target filter → message → AI review).'));
    kpis.push(kpi('Contact searches / scans submitted', sumRange(S.contactScans, P.start, P.end), sumRange(S.contactScans, PV.start, PV.end)));
    kpis.push(kpi('Contacts added to the prospect database', sumRange(S.contactsImported, P.start, P.end), sumRange(S.contactsImported, PV.start, PV.end), 'New prospect records (imports + scans) attributed to this client.'));
    kpis.push(kpi('Logged work-session records', sumRange(S.workLogEntries, P.start, P.end), sumRange(S.workLogEntries, PV.start, PV.end), 'Entries in the client work log (review submits, AI review runs, imports, pipeline runs…). Logging started when the feature shipped — earlier weeks will read low.'));
    sec('D. All-time program totals (everything on record for this client)');
    kpis.push({ label: 'Contacts reached (all time)', cur: fAll.contacts, prev: '', change: '', note: '' });
    kpis.push({ label: 'Connections accepted (all time)', cur: fAll.connected, prev: '', change: '', note: fAll.accept_rate === null ? '' : `${fAll.accept_rate}% of contacts` });
    kpis.push({ label: 'Contacts who replied (all time)', cur: fAll.replied, prev: '', change: '', note: fAll.reply_rate === null ? '' : `${fAll.reply_rate}% of contacts` });
    kpis.push({ label: 'Meetings scheduled (all time)', cur: fAll.scheduled, prev: '', change: '', note: fAll.meeting_rate === null ? '' : `${fAll.meeting_rate}% of contacts; ${fAll.contacts_per_meeting === null ? 'n/a' : fAll.contacts_per_meeting} contacts per meeting` });

    // ── Sheet: Summary ──────────────────────────────────────────────────────
    const summarySheet = {
        name: 'Summary', source: 'export_outreach_history (this report)',
        purpose: `Headline numbers for ${periodLabel} versus the previous equal-length period (${prevLabel}). Start the client report here.`,
        kind: 'summary', kpis,
        meta: [
            ['Client', clientName],
            ['BDRs included', (inp.company.bdrs || []).map(b => `${b.name || b.email} <${b.email}>`).join('; ')],
            ['Report period', periodLabel],
            ['Comparison period', prevLabel],
            ['Generated', fmtDT(inp.generatedAt)],
            ['Time zone for all dates/times', inp.timezone || ''],
            ['Exported by', inp.exportedBy || ''],
            ['Analysis model run date', inp.analysis && inp.analysis.meta ? (inp.analysis.meta.run_date || '') : '(not included)']
        ]
    };

    // ── Sheet: Daily_Activity ───────────────────────────────────────────────
    const dailyCols = [
        col('date', 'Date', 12, 'Calendar day (local time).'),
        col('weekday', 'Weekday', 11),
        col('sent', 'Outreach Sent', 12, 'Distinct contacts whose message was pushed to the sending platform that day.'),
        col('accepted', 'Connections Accepted', 13),
        col('replied', 'Contacts Replied', 12, 'Distinct contacts who sent a message that day.'),
        col('inbound', 'Inbound Messages', 12),
        col('meetings', 'Meetings Scheduled', 12),
        col('outbound', 'Our Messages Sent', 12, 'All outbound messages in conversation threads that day.'),
        col('followups', 'Follow-ups From Review Tools', 14),
        col('generated', 'Messages Generated', 12),
        col('adminApproved', 'Approved By Our Team', 12),
        col('customerApproved', 'Approved By Client', 12),
        col('edited', 'Edited By Our Team', 12),
        col('deleted', 'Removed / Skipped', 12),
        col('exclusions', 'Contacts Excluded', 12),
        col('crmNotes', 'CRM Notes Added', 12),
        col('pipelineRuns', 'Pipeline Runs', 10),
        col('contactScans', 'Contact Scans', 10),
        col('contactsImported', 'Contacts Added To Database', 14),
        col('workLogEntries', 'Work-Log Records', 11)
    ];
    const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dailyRows = days.map(d => {
        const [y, m, dd] = d.split('-').map(Number);
        return {
            date: d, weekday: WEEKDAYS[new Date(y, m - 1, dd, 12).getDay()],
            sent: S.sentToHeyreach.get(d) || 0, accepted: S.accepted.get(d) || 0, replied: S.repliedContacts.get(d) || 0,
            inbound: S.contactMessages.get(d) || 0, meetings: S.meetings.get(d) || 0, outbound: S.bdrMessages.get(d) || 0,
            followups: S.followUps.get(d) || 0, generated: S.generated.get(d) || 0, adminApproved: S.adminApproved.get(d) || 0,
            customerApproved: S.customerApproved.get(d) || 0, edited: S.edited.get(d) || 0, deleted: S.deleted.get(d) || 0,
            exclusions: S.exclusions.get(d) || 0, crmNotes: S.crmNotes.get(d) || 0, pipelineRuns: S.pipelineRuns.get(d) || 0,
            contactScans: S.contactScans.get(d) || 0, contactsImported: S.contactsImported.get(d) || 0, workLogEntries: S.workLogEntries.get(d) || 0
        };
    });
    const dailyTotal = { date: 'TOTAL', weekday: '' };
    dailyCols.slice(2).forEach(c => { dailyTotal[c.k] = dailyRows.reduce((s, r) => s + r[c.k], 0); });
    dailyRows.push(dailyTotal);

    // ── Outcome tables (types / BDR / hypothesis) ───────────────────────────
    const TYPE_LABELS = {
        post: 'Post reply', org_news: 'Organization news', contact_news: 'Contact news', story_search: 'Story search',
        recovered_post: 'Recovered post', news: 'News', profile: 'Profile-based', complement: 'Organization complement',
        fast_prospect: 'Fast prospect', about_me_connect: 'Common ground (About Me)', follow_up: 'Follow-up / reply',
        quick_message: 'Quick message', other: 'Other'
    };
    const outcomeCols = (firstKey, firstHeader, firstDesc) => [
        col(firstKey, firstHeader, 30, firstDesc),
        col('cohort_contacts', 'Period: Contacts Reached', 12, 'Contacts first reached during the report period.'),
        col('cohort_connected', 'Period: Accepted', 11),
        col('cohort_replied', 'Period: Replied', 11),
        col('cohort_scheduled', 'Period: Meetings', 11),
        col('cohort_accept_rate', 'Period: Accept %', 11),
        col('cohort_reply_rate', 'Period: Reply %', 11),
        col('cohort_meeting_rate', 'Period: Meeting %', 11),
        col('all_contacts', 'All Time: Contacts Reached', 12),
        col('all_connected', 'All Time: Accepted', 11),
        col('all_replied', 'All Time: Replied', 11),
        col('all_scheduled', 'All Time: Meetings', 11),
        col('all_accept_rate', 'All Time: Accept %', 11, 'Accepted ÷ contacts reached.'),
        col('all_reply_rate', 'All Time: Reply %', 11, 'Replied ÷ contacts reached.'),
        col('all_meeting_rate', 'All Time: Meeting %', 11, 'Meetings ÷ contacts reached.'),
        col('all_replied_of_accepted', 'All Time: Replied % Of Accepted', 13),
        col('all_scheduled_of_replied', 'All Time: Meetings % Of Replied', 13),
        col('all_contacts_per_meeting', 'All Time: Contacts Per Meeting', 13, 'Contacts reached ÷ meetings (lower is better).')
    ];
    const groupOutcome = (keyFn, labelFn, keyName) => {
        const buckets = new Map();
        dataset.forEach(r => { const k = keyFn(r); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(r); });
        const out = [];
        buckets.forEach((rows, k) => {
            const c = funnel(rows.filter(r => inP(rowInfo.get(r).firstDay, P.start, P.end)));
            const a = funnel(rows);
            out.push({
                [keyName]: labelFn(k),
                cohort_contacts: c.contacts, cohort_connected: c.connected, cohort_replied: c.replied, cohort_scheduled: c.scheduled,
                cohort_accept_rate: c.accept_rate, cohort_reply_rate: c.reply_rate, cohort_meeting_rate: c.meeting_rate,
                all_contacts: a.contacts, all_connected: a.connected, all_replied: a.replied, all_scheduled: a.scheduled,
                all_accept_rate: a.accept_rate, all_reply_rate: a.reply_rate, all_meeting_rate: a.meeting_rate,
                all_replied_of_accepted: a.replied_of_accepted, all_scheduled_of_replied: a.scheduled_of_replied, all_contacts_per_meeting: a.contacts_per_meeting
            });
        });
        out.sort((x, y) => y.all_contacts - x.all_contacts);
        return out;
    };
    const byTypeRows = groupOutcome(r => r.message_type || 'other', k => TYPE_LABELS[k] || k, 'message_type');
    const byHypRows = groupOutcome(r => r.hypothesis_group_id || '', k => k ? (groupName[k] || k) : '(not assigned to a hypothesis group)', 'hypothesis_group');

    // By BDR: outcomes + the work each BDR's queue saw in the period
    const bdrCols = outcomeCols('bdr', 'BDR', 'BDR (sender) name.').concat([
        col('p_generated', 'Period: Messages Generated', 12),
        col('p_approved', 'Period: Approved By Our Team', 12),
        col('p_removed', 'Period: Removed / Skipped', 12),
        col('p_sent', 'Period: Outreach Sent', 12),
        col('p_followups', 'Period: Follow-ups From Review Tools', 14),
        col('p_meetings', 'Period: Meetings Scheduled', 12)
    ]);
    const bdrKeys = new Set([...dataset.map(r => r.bdr_email), ...queue.map(q => q.bdr)].filter(Boolean));
    const byBdrRows = [];
    bdrKeys.forEach(email => {
        const rows = dataset.filter(r => r.bdr_email === email);
        const c = funnel(rows.filter(r => inP(rowInfo.get(r).firstDay, P.start, P.end)));
        const a = funnel(rows);
        const qs = queue.filter(q => q.bdr === email);
        const sentKeys = new Set();
        qs.filter(q => q.pushed && inP(dayKey(q.sentAt), P.start, P.end)).forEach(q => sentKeys.add(q.url));
        byBdrRows.push({
            bdr: bdrNameOf(email),
            cohort_contacts: c.contacts, cohort_connected: c.connected, cohort_replied: c.replied, cohort_scheduled: c.scheduled,
            cohort_accept_rate: c.accept_rate, cohort_reply_rate: c.reply_rate, cohort_meeting_rate: c.meeting_rate,
            all_contacts: a.contacts, all_connected: a.connected, all_replied: a.replied, all_scheduled: a.scheduled,
            all_accept_rate: a.accept_rate, all_reply_rate: a.reply_rate, all_meeting_rate: a.meeting_rate,
            all_replied_of_accepted: a.replied_of_accepted, all_scheduled_of_replied: a.scheduled_of_replied, all_contacts_per_meeting: a.contacts_per_meeting,
            p_generated: qs.filter(q => inP(dayKey(q.genAt), P.start, P.end)).length,
            p_approved: qs.filter(q => inP(dayKey(q.approvedAt), P.start, P.end)).length,
            p_removed: qs.filter(q => q.deleted && inP(dayKey(q.deletedAt), P.start, P.end)).length,
            p_sent: sentKeys.size,
            p_followups: sendEvents.filter(e => e.bdr === email && inP(e.day, P.start, P.end)).length,
            p_meetings: [...meetingByUrl.values()].filter(m => m.bdr === email && inP(m.day, P.start, P.end)).length
        });
    });
    byBdrRows.sort((x, y) => y.all_contacts - x.all_contacts);

    // ── Sheet: Outreach_History ─────────────────────────────────────────────
    const histRowsAll = dataset.map(r => {
        const i = rowInfo.get(r);
        const hist = r.conversation_history || [];
        const lastContact = [...hist].reverse().find(m => m.sender === 'Contact');
        const firstMsg = hist.find(m => m.sender !== 'Contact');
        const meet = meetingByUrl.get(r.contact_linkedin_url);
        const flags = {
            reached_in_period: inP(i.firstDay, P.start, P.end),
            connected_in_period: inP(i.connDay, P.start, P.end),
            bdr_msg_in_period: [...i.bdrDays].some(d => inP(d, P.start, P.end)),
            contact_msg_in_period: [...i.contactDays].some(d => inP(d, P.start, P.end)),
            meeting_in_period: !!(meet && inP(meet.day, P.start, P.end))
        };
        return {
            _r: r, _i: i, _flags: flags,
            contact_name: r.contact_name, contact_title: r.contact_title, contact_company: r.contact_company,
            linkedin_url: r.contact_linkedin_url, bdr_name: r.bdr_name, bdr_email: r.bdr_email, client_company: r.client_company || clientName,
            message_type: TYPE_LABELS[r.message_type] || r.message_type, outreach_sources: r.outreach_sources,
            hypothesis_group: r.hypothesis_group_id ? (groupName[r.hypothesis_group_id] || r.hypothesis_group_name || r.hypothesis_group_id) : '',
            hypothesis_variation: r.hypothesis_variation_label || '',
            first_outreach_date: i.firstDay, last_message_date: r.last_message_date,
            connected: yn(i.pandoConn), connection_date: i.pandoConn ? r.connection_date : '',
            replied: yn(r.replied === 1), scheduled: yn(r.scheduled === 1), meeting_date: meet ? meet.day : '',
            reached_in_period: yn(flags.reached_in_period), connected_in_period: yn(flags.connected_in_period),
            bdr_msg_in_period: yn(flags.bdr_msg_in_period), contact_msg_in_period: yn(flags.contact_msg_in_period), meeting_in_period: yn(flags.meeting_in_period),
            total_messages: r.total_messages, bdr_messages: r.bdr_messages, contact_messages: r.contact_messages,
            first_message: trunc(firstMsg && firstMsg.text, 1200), latest_contact_reply: trunc(lastContact && lastContact.text, 1200),
            latest_contact_reply_date: lastContact ? (lastContact.date || '') : ''
        };
    });
    const histKeep = x => scopeAll || Object.values(x._flags).some(Boolean);
    const histRows = histRowsAll.filter(histKeep);
    const histCols = [
        col('contact_name', 'Contact Name', 22), col('contact_title', 'Title', 28), col('contact_company', 'Company', 26),
        col('linkedin_url', 'LinkedIn URL', 34), col('bdr_name', 'BDR', 20), col('bdr_email', 'BDR Email', 26), col('client_company', 'Client', 20),
        col('message_type', 'Message Type', 20, 'How the opening message was written (post reply, news, profile, etc.).'),
        col('outreach_sources', 'How We Reached Them', 28, 'Every Pando/HealthLuminate route used: connection request, campaign message, follow-up/reply, quick message, fast outreach, scheduled DM.'),
        col('hypothesis_group', 'Hypothesis Group', 28, 'The targeting hypothesis (audience + angle) this contact belongs to.'),
        col('hypothesis_variation', 'Message Variation', 22, 'A/B message variation used (if any).'),
        col('first_outreach_date', 'First Outreach Date', 14), col('last_message_date', 'Last Message Date', 14),
        col('connected', 'Connection Accepted', 11, 'Yes if a connection request originated by Pando/HealthLuminate was accepted.'),
        col('connection_date', 'Connection Date', 14),
        col('replied', 'Replied', 9), col('scheduled', 'Meeting Scheduled', 11), col('meeting_date', 'Meeting Logged Date', 14),
        col('reached_in_period', 'First Reached In Period', 12), col('connected_in_period', 'Accepted In Period', 12),
        col('bdr_msg_in_period', 'We Messaged In Period', 12), col('contact_msg_in_period', 'They Replied In Period', 12), col('meeting_in_period', 'Meeting In Period', 12),
        col('total_messages', 'Total Messages', 9), col('bdr_messages', 'Messages Sent', 9), col('contact_messages', 'Messages Received', 9),
        col('first_message', 'Opening Message', 60), col('latest_contact_reply', 'Latest Reply From Contact', 60), col('latest_contact_reply_date', 'Latest Reply Date', 14)
    ];
    const histSheet = {
        name: 'Outreach_History', source: 'export_outreach_history (original export, extended)',
        purpose: `One row per contact we reached out to${scopeAll ? ' (ALL TIME)' : ' that had any activity in the report period (first outreach, acceptance, a message either way, or a meeting)'}. Columns ending "In Period" show why the contact is included.`,
        columns: histCols, rows: histRows
    };

    // ── Sheet: Conversation_Messages (every message of threads active in the period) ──
    const msgCols = [
        col('contact_name', 'Contact', 22), col('contact_company', 'Contact Company', 26), col('bdr_name', 'BDR', 20),
        col('message_date', 'Message Date', 12), col('message_time', 'Message Time', 9), col('direction', 'Direction', 14, '"We sent" or "Contact replied".'),
        col('in_period', 'In Report Period', 10), col('text', 'Message Text', 90), col('linkedin_url', 'LinkedIn URL', 34)
    ];
    const msgRows = [];
    const MSG_CAP = 40000;
    let msgTruncated = false;
    if (!inp.options || inp.options.includeMessages !== false) {
        histRowsAll.forEach(x => {
            if (msgRows.length >= MSG_CAP) { msgTruncated = true; return; }
            const anyInPeriod = [...x._i.bdrDays, ...x._i.contactDays].some(d => inP(d, P.start, P.end));
            if (!anyInPeriod) return;
            (x._r.conversation_history || []).forEach(m => {
                if (msgRows.length >= MSG_CAP) { msgTruncated = true; return; }
                const dk = m.datetime ? dayKey(m.datetime) : (m.date || '');
                msgRows.push({
                    contact_name: x.contact_name, contact_company: x.contact_company, bdr_name: x.bdr_name,
                    message_date: dk, message_time: m.datetime ? fmtDT(m.datetime).slice(11) : '',
                    direction: m.sender === 'Contact' ? 'Contact replied' : 'We sent', in_period: yn(inP(dk, P.start, P.end)),
                    text: trunc(m.text, 8000), linkedin_url: x.linkedin_url
                });
            });
        });
        msgRows.sort((a, b) => (a.contact_name || '').localeCompare(b.contact_name || '') || (a.message_date + a.message_time).localeCompare(b.message_date + b.message_time));
    }
    const msgSheet = {
        name: 'Conversation_Messages', source: 'company_review_replies (conversation threads)',
        purpose: `Full text of every message in conversations that had activity in the period (context messages outside the period are included and flagged). Use for quotes and reply highlights.${msgTruncated ? ' NOTE: capped at ' + MSG_CAP + ' rows.' : ''}`,
        columns: msgCols, rows: msgRows
    };

    // ── Sheet: Reply_Review (company_review_replies) ────────────────────────
    const ovByConv = new Map();
    (inp.overrides || []).forEach(o => {
        const key = normConvId(o.conversationId);
        if (!key) return;
        const prev = ovByConv.get(key);
        // later-updated doc wins, but keep any manual lock / ignore / flag seen on any doc
        const merged = Object.assign({}, prev || {}, o);
        if (prev && prev.manualCategoryOverride === true && o.manualCategoryOverride !== true) {
            merged.manualCategoryOverride = true; merged.responseCategory = prev.responseCategory; merged.followUpCategory = prev.followUpCategory;
        }
        if (prev && prev.flaggedForClientReview) merged.flaggedForClientReview = true;
        ovByConv.set(key, merged);
    });
    const notesByConv = new Map(), notesByUrlBdr = new Map();
    pandoCrmNotes.forEach(n => {
        const k = normConvId(n.conversationId);
        if (k) { if (!notesByConv.has(k)) notesByConv.set(k, []); notesByConv.get(k).push(n); }
        const uk = `${normUrl(n.linkedInUrl)}||${canonical(n.bdrEmail)}`;
        if (!notesByUrlBdr.has(uk)) notesByUrlBdr.set(uk, []);
        notesByUrlBdr.get(uk).push(n);
    });
    const isLeadMsg = m => m.sender === 'CORRESPONDENT' || m.sender === 'lead' || m.direction === 'inbound';
    const replyRowsAll = [];
    pandoInbox.forEach(e => {
        if (!e.hasLeadReply) return;
        const ov = ovByConv.get(normConvId(e.id)) || ovByConv.get(normConvId(e.conversationId)) || {};
        const msgs = (e.rawMessages || []).map(m => ({ lead: isLeadMsg(m), at: toDate(m.createdAt || m.timestamp || m.created_at), text: (m.body || m.text || m.message || '').trim() }));
        const leadMsgs = msgs.filter(m => m.lead && m.at).sort((a, b) => a.at - b.at);
        const lastLead = leadMsgs[leadMsgs.length - 1];
        const firstLead = leadMsgs[0];
        const lastAny = msgs.filter(m => m.at).sort((a, b) => a.at - b.at).pop();
        const manual = ov.manualCategoryOverride === true;
        const notes = (notesByConv.get(normConvId(e.id)) || notesByConv.get(normConvId(e.conversationId)) || notesByUrlBdr.get(`${e.liUrl}||${e.bdrEmail}`) || [])
            .slice().sort((a, b) => (toDate(a.createdAt) || 0) - (toDate(b.createdAt) || 0));
        const meet = meetingByUrl.get(e.liUrl);
        const leadInPeriod = leadMsgs.some(m => inP(dayKey(m.at), P.start, P.end));
        const noteInPeriod = notes.some(n => inP(dayKey(n.createdAt), P.start, P.end));
        const meetInPeriod = !!(meet && inP(meet.day, P.start, P.end));
        const responseCategory = (manual && ov.responseCategory) || e.responseCategory || '';
        const followUpCategory = (manual && ov.followUpCategory) || e.followUpCategory || '';
        replyRowsAll.push({
            _keep: leadInPeriod || noteInPeriod || meetInPeriod,
            contact_name: e.leadName, contact_title: e.leadTitle, contact_company: e.leadCompany, linkedin_url: e.liUrl,
            bdr_name: bdrNameOf(e.bdrEmail), bdr_email: e.bdrEmail,
            response_category: responseCategory, category_source: manual ? 'Set by a person (locked)' : (responseCategory ? 'Automatic / AI' : ''),
            follow_up_category: followUpCategory, follow_up_invites_sent: e.followUpInvitesSent === undefined ? '' : e.followUpInvitesSent,
            // "Ignored" only hides a conversation until it gets new messages (same rule as the review page)
            ignored: yn((isTrue(ov.ignored) && !(typeof ov.lastMessageCountWhenIgnored === 'number' && msgs.length > ov.lastMessageCountWhenIgnored)) || isTrue(e.ignored)), flagged_for_client_review: yn(isTrue(ov.flaggedForClientReview)),
            meeting_date_time: ov.meetingDateTime ? fmtDT(ov.meetingDateTime) : (meet ? meet.day : ''), meeting_date_source: ov.meetingDateSource || (meet ? 'activity log' : ''),
            replied_in_period: yn(leadInPeriod), first_reply_date: firstLead ? fmtDT(firstLead.at) : '', latest_reply_date: lastLead ? fmtDT(lastLead.at) : '',
            latest_reply_text: trunc(lastLead && lastLead.text, 1500),
            awaiting_our_response: yn(lastAny && lastAny.lead), total_messages: msgs.length,
            crm_notes_count: notes.length, crm_notes_latest: trunc(notes.length ? notes[notes.length - 1].notes : '', 1500),
            conversation_id: e.id
        });
    });
    const replyRows = replyRowsAll.filter(r => scopeAll || r._keep);
    const replyCols = [
        col('contact_name', 'Contact', 22), col('contact_title', 'Title', 26), col('contact_company', 'Company', 26), col('linkedin_url', 'LinkedIn URL', 34),
        col('bdr_name', 'BDR', 20), col('bdr_email', 'BDR Email', 26),
        col('response_category', 'Response Category', 22, 'Response / Response Engaged / Response Willing to Meet / Scheduled / Declined to Meet.'),
        col('category_source', 'Category Source', 20, 'Whether a person locked this category or it came from the automatic classifier.'),
        col('follow_up_category', 'Follow-Up Category', 24, 'No Follow Up / Followed Up No Invite / Followed Up Soft Invite / Followed Up Calendar Link.'),
        col('follow_up_invites_sent', 'Follow-Up Invites Sent', 10, 'Number of meeting invitations already sent in the follow-up sequence (0-3).'),
        col('ignored', 'Hidden (Ignored)', 9), col('flagged_for_client_review', 'Flagged For Client Review', 11),
        col('meeting_date_time', 'Meeting Date/Time', 17), col('meeting_date_source', 'Meeting Date Source', 16),
        col('replied_in_period', 'Replied In Period', 10), col('first_reply_date', 'First Reply', 16), col('latest_reply_date', 'Latest Reply', 16),
        col('latest_reply_text', 'Latest Reply Text', 70), col('awaiting_our_response', 'Awaiting Our Response', 11, 'Yes if the contact spoke last.'),
        col('total_messages', 'Messages In Thread', 9), col('crm_notes_count', 'CRM Notes', 8), col('crm_notes_latest', 'Latest CRM Note', 60), col('conversation_id', 'Conversation ID', 24)
    ];
    const replySheet = {
        name: 'Reply_Review', source: 'company_review_replies.html (Company Conversations)',
        purpose: `Two-way conversations (contact replied at least once)${scopeAll ? '' : ' with a reply, CRM note or meeting during the period'}, with the response / follow-up category our team assigned, meeting dates and the latest CRM note. Mirrors what the Company Conversations page shows.`,
        columns: replyCols, rows: replyRows
    };

    // Category summary (grid on the reviews page) — excludes hidden conversations
    const catRows = [];
    {
        const live = replyRowsAll.filter(r => r.ignored !== 'Yes');
        const resp = ['Response', 'Response Engaged', 'Response Willing to Meet', 'Scheduled', 'Declined to Meet', '(uncategorized)'];
        const fups = ['No Follow Up', 'Followed Up No Invite', 'Followed Up Soft Invite', 'Followed Up Calendar Link', '(none)'];
        resp.forEach(rc => {
            const subset = live.filter(r => (r.response_category || '(uncategorized)') === rc);
            const row = { response_category: rc, total: subset.length, replied_in_period: subset.filter(r => r.replied_in_period === 'Yes').length };
            fups.forEach(fc => { row['fu_' + fc] = subset.filter(r => (r.follow_up_category || '(none)') === fc).length; });
            catRows.push(row);
        });
    }
    const catCols = [col('response_category', 'Response Category', 28, 'Rows of the conversation-category grid.'), col('total', 'Conversations', 13, 'All two-way conversations in this category (hidden ones excluded).'), col('replied_in_period', 'Replied In Period', 13)]
        .concat(['No Follow Up', 'Followed Up No Invite', 'Followed Up Soft Invite', 'Followed Up Calendar Link', '(none)'].map(f => col('fu_' + f, 'Follow-Up: ' + f, 16)));
    const catSheet = {
        name: 'Category_Summary', source: 'company_review_replies.html (category grid)',
        purpose: 'Counts of two-way conversations by response category (rows) and follow-up category (columns), all time.',
        columns: catCols, rows: catRows
    };

    // ── Sheet: CRM_Notes (comments) ─────────────────────────────────────────
    const noteRows = pandoCrmNotes.filter(n => scopeAll || inP(dayKey(n.createdAt), P.start, P.end))
        .map(n => ({
            created_at: fmtDT(n.createdAt), created_by: n.createdBy || '', bdr_name: bdrNameOf(n.bdrEmail), bdr_email: canonical(n.bdrEmail),
            contact_name: n.leadName || '', contact_title: n.leadPosition || '', contact_company: n.leadCompany || '', linkedin_url: normUrl(n.linkedInUrl),
            note: trunc(n.notes, 6000), conversation_id: n.conversationId || '', in_period: yn(inP(dayKey(n.createdAt), P.start, P.end))
        })).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const noteSheet = {
        name: 'CRM_Notes', source: 'company_review_replies.html (CRM Notes = team comments on conversations)',
        purpose: `Notes/comments our team wrote on conversations${scopeAll ? ' (all time)' : ' during the period'}. These capture qualitative context (what the prospect said, next steps).`,
        columns: [col('created_at', 'Written At', 16), col('created_by', 'Written By', 26), col('bdr_name', 'BDR', 20), col('bdr_email', 'BDR Email', 26),
        col('contact_name', 'Contact', 22), col('contact_title', 'Title', 26), col('contact_company', 'Company', 26), col('linkedin_url', 'LinkedIn URL', 34),
        col('note', 'Note', 90), col('conversation_id', 'Conversation ID', 24), col('in_period', 'In Report Period', 10)],
        rows: noteRows
    };

    // ── Hypothesis sheets (connect_hypothesis_documentation) ────────────────
    const hypGroups = inp.hypothesisGroups || [];
    const hypPerf = new Map(); // groupId -> {gen, sent, ...} from queue
    queue.forEach(q => {
        const gid = q.d.hypothesisGroupId; if (!gid) return;
        if (!hypPerf.has(gid)) hypPerf.set(gid, { generated: 0, genP: 0, sent: 0, sentP: 0, removed: 0 });
        const h = hypPerf.get(gid);
        h.generated++; if (inP(dayKey(q.genAt), P.start, P.end)) h.genP++;
        if (q.pushed) { h.sent++; if (inP(dayKey(q.sentAt), P.start, P.end)) h.sentP++; }
        if (q.deleted) h.removed++;
    });
    const hypRows = hypGroups.map(g => {
        const perf = hypPerf.get(g.id) || {};
        const out = byHypRows.find(r => r.hypothesis_group === (g.name || g.id)) || {};
        const contactCount = g._chunked ? (g._totalContactCount || 0) : (Array.isArray(g.contactLinkedInUrls) ? g.contactLinkedInUrls.length : (g._totalContactCount || 0));
        return {
            name: g.name || g.id, id: g.id, description: trunc(g.description, 3000),
            bdrs: joinList([].concat(g.bdrEmails || [], g.bdrEmail || []).map(e => bdrNameOf(e) || e).filter((v, i, a) => a.indexOf(v) === i)),
            contact_source: trunc(g.contactSource, 1500), workspace: g.workspaceName || '', target_contacts_in_group: contactCount,
            created_at: fmtD(g.createdAt), created_by: g.createdBy || '', updated_at: fmtD(g.updatedAt),
            variations: Array.isArray(g.messageVariations) ? g.messageVariations.length : 0,
            target_contact_instructions: trunc(g.targetContactInstructions, 6000),
            message_review_instructions: trunc(g.messageReviewInstructions, 6000),
            message_creation_instructions: trunc(g.messageCreationInstructions, 6000),
            source_prompts: trunc((g.sourcePrompts || []).map(p => `${p.label || ''}: ${p.prompt || ''}`).join('\n'), 6000),
            messages_generated_all_time: perf.generated || 0, messages_generated_in_period: perf.genP || 0,
            outreach_sent_all_time: perf.sent || 0, outreach_sent_in_period: perf.sentP || 0, removed_all_time: perf.removed || 0,
            accepted_all_time: out.all_connected || 0, replied_all_time: out.all_replied || 0, meetings_all_time: out.all_scheduled || 0,
            accept_rate: out.all_accept_rate === undefined ? '' : out.all_accept_rate, reply_rate: out.all_reply_rate === undefined ? '' : out.all_reply_rate, meeting_rate: out.all_meeting_rate === undefined ? '' : out.all_meeting_rate
        };
    }).sort((a, b) => b.outreach_sent_all_time - a.outreach_sent_all_time);
    const hypSheet = {
        name: 'Hypothesis_Groups', source: 'connect_hypothesis_documentation.html',
        purpose: 'The targeting strategy documented for this client: each hypothesis group (audience + angle), who it is assigned to, the instructions given to the AI for finding contacts and writing/reviewing messages, and how many messages/outreach it has produced with outcome rates to date.',
        columns: [col('name', 'Hypothesis Group', 30), col('id', 'Group ID', 22), col('description', 'Description', 60), col('bdrs', 'BDRs', 24), col('contact_source', 'Where Contacts Come From', 40),
        col('workspace', 'Workspace', 20), col('target_contacts_in_group', 'Target Contacts In Group', 12), col('created_at', 'Created', 12), col('created_by', 'Created By', 24), col('updated_at', 'Last Updated', 12),
        col('variations', 'Message Variations', 10), col('target_contact_instructions', 'Target Contact / Exclude Rules (AI Instructions)', 60, 'Instructions that decide who is a good vs. bad target.'),
        col('message_review_instructions', 'Message Review Instructions (AI)', 60, 'Criteria the AI reviewer applies to each message.'),
        col('message_creation_instructions', 'Message Creation Instructions (AI)', 60, 'Guidance given to the AI that writes the messages.'),
        col('source_prompts', 'Source Prompts', 50),
        col('messages_generated_all_time', 'Messages Generated (All Time)', 12), col('messages_generated_in_period', 'Messages Generated (Period)', 12),
        col('outreach_sent_all_time', 'Outreach Sent (All Time)', 12), col('outreach_sent_in_period', 'Outreach Sent (Period)', 12), col('removed_all_time', 'Removed In Review (All Time)', 12),
        col('accepted_all_time', 'Accepted (All Time)', 11), col('replied_all_time', 'Replied (All Time)', 11), col('meetings_all_time', 'Meetings (All Time)', 11),
        col('accept_rate', 'Accept %', 9), col('reply_rate', 'Reply %', 9), col('meeting_rate', 'Meeting %', 9)],
        rows: hypRows
    };

    // Variations
    const varPerf = new Map(); // variationId -> counts
    const varOutcome = new Map();
    dataset.forEach(r => {
        if (!r.hypothesis_variation_id) return;
        const k = r.hypothesis_variation_id;
        if (!varOutcome.has(k)) varOutcome.set(k, []);
        varOutcome.get(k).push(r);
    });
    queue.forEach(q => {
        const vid = q.d.hypothesisVariationId; if (!vid) return;
        if (!varPerf.has(vid)) varPerf.set(vid, { generated: 0, sent: 0 });
        const v = varPerf.get(vid); v.generated++; if (q.pushed) v.sent++;
    });
    const varRows = [];
    hypGroups.forEach(g => {
        (g.messageVariations || []).forEach(v => {
            const f = funnel(varOutcome.get(v.id) || []);
            const perf = varPerf.get(v.id) || {};
            varRows.push({
                hypothesis_group: g.name || g.id, variation_label: v.label || v.id, variation_id: v.id || '',
                writing_prompt: trunc(v.prompt, 5000), example_message: trunc(v.exampleMessage, 3000), ai_criteria: trunc(typeof v.aiCriteria === 'string' ? v.aiCriteria : JSON.stringify(v.aiCriteria || ''), 3000),
                messages_generated: perf.generated || 0, outreach_sent: perf.sent || 0, contacts_tracked: f.contacts, accepted: f.connected, replied: f.replied, meetings: f.scheduled,
                accept_rate: f.accept_rate === null ? '' : f.accept_rate, reply_rate: f.reply_rate === null ? '' : f.reply_rate, meeting_rate: f.meeting_rate === null ? '' : f.meeting_rate
            });
        });
    });
    const varSheet = {
        name: 'Hypothesis_Variations', source: 'connect_hypothesis_documentation.html (A/B message variations)',
        purpose: 'Each A/B message variation defined inside the hypothesis groups: its writing prompt, example message, and the results it produced.',
        columns: [col('hypothesis_group', 'Hypothesis Group', 28), col('variation_label', 'Variation', 24), col('variation_id', 'Variation ID', 18), col('writing_prompt', 'Writing Prompt', 70), col('example_message', 'Example Message', 60), col('ai_criteria', 'AI Criteria', 40),
        col('messages_generated', 'Messages Generated', 11), col('outreach_sent', 'Outreach Sent', 11), col('contacts_tracked', 'Contacts Tracked', 11), col('accepted', 'Accepted', 9), col('replied', 'Replied', 9), col('meetings', 'Meetings', 9),
        col('accept_rate', 'Accept %', 9), col('reply_rate', 'Reply %', 9), col('meeting_rate', 'Meeting %', 9)],
        rows: varRows
    };

    // ── Analysis sheets (analysis_results) ──────────────────────────────────
    const analysisSheets = buildAnalysisSheets(inp.analysis, clientName, diag);

    // ── Msg_Generation_Review (generate_messages + fast_connect_review records) ──
    const genKeep = q => ['genAt', 'approvedAt', 'custApprovedAt', 'editedAt', 'deletedAt', 'pushedAt'].some(f => q[f] && inP(dayKey(q[f]), P.start, P.end));
    const GEN_CAP = 20000;
    const genQ = queue.filter(q => scopeAll || genKeep(q));
    const genTruncated = genQ.length > GEN_CAP;
    const genRows = genQ.slice(0, GEN_CAP).map(q => {
        const d = q.d;
        const orig = (d.original_ai_message || '').trim(), fin = (d.message_to_contact || '').trim();
        const concerns = Array.isArray(d.finalAiConcerns) ? d.finalAiConcerns.map(c => (typeof c === 'string' ? c : (c.concern || c.text || c.rule || JSON.stringify(c)))).join(' | ') : (d.finalAiConcerns || '');
        return {
            contact_name: q.name, contact_title: q.title, contact_company: q.company, linkedin_url: q.url,
            bdr_name: bdrNameOf(q.bdr), bdr_email: q.bdr,
            message_type: d.message_type || '', message_source: d.source || '', generated_via: d.generated_via || '',
            hypothesis_group: d.hypothesisGroupId ? (groupName[d.hypothesisGroupId] || d.hypothesisGroupName || d.hypothesisGroupId) : '', hypothesis_variation: d.hypothesisVariationLabel || '',
            pipeline_run_id: d.pipelineRunId || '', batch: d.source_batch_label || d.source_batch_id || '',
            generated_at: fmtDT(q.genAt), review_status: d.reviewStatus || '',
            original_ai_message: trunc(orig, 1500), final_message: trunc(fin, 1500), edited_from_ai_version: yn(orig && fin && orig !== fin), characters: fin.length,
            opus_review_status: d.opusReviewStatus || '', opus_rating: d.opusRating === undefined ? '' : d.opusRating, opus_reason: trunc(d.opusRatingReason || '', 600),
            final_ai_status: d.finalAiReviewStatus || '', final_ai_flagged: d.finalAiFlagged === undefined ? '' : yn(d.finalAiFlagged), final_ai_concerns: trunc(concerns, 800),
            edited_by: d.lastEditedByAdmin || '', edited_at: fmtDT(q.editedAt),
            approved_by: d.adminApprovedBy || '', approved_at: fmtDT(q.approvedAt), approval_method: d.approvalMethod || '', client_approved_at: fmtDT(q.custApprovedAt),
            pushed_to_sending_platform: yn(q.pushed), pushed_at: fmtDT(q.pushedAt), pushed_by: d.pushed_by || '', routed_via: d.routed_via || '',
            removed: yn(q.deleted), removed_reason: trunc(q.deletedReason, 300), removed_by: q.deletedBy, removed_at: fmtDT(q.deletedAt),
            generated_in_period: yn(inP(dayKey(q.genAt), P.start, P.end)), approved_in_period: yn(inP(dayKey(q.approvedAt), P.start, P.end)),
            removed_in_period: yn(q.deleted && inP(dayKey(q.deletedAt), P.start, P.end)), sent_in_period: yn(q.pushed && inP(dayKey(q.sentAt), P.start, P.end)),
            queue_doc_id: q.id
        };
    }).sort((a, b) => b.generated_at.localeCompare(a.generated_at));
    const genSheet = {
        name: 'Msg_Generation_Review', source: 'generate_messages.html + fast_connect_review.html + full_pipeline.html (connect_queue records)',
        purpose: `One row per message record that was created, edited, approved, removed or sent${scopeAll ? ' (all time)' : ' during the period'}: who/what generated it, AI review ratings, human edits (original AI text vs. final text), approver, and what happened to it. This is the audit trail of message creation and quality review.${genTruncated ? ' NOTE: capped at ' + GEN_CAP + ' rows (newest first).' : ''}`,
        columns: [col('contact_name', 'Contact', 22), col('contact_title', 'Title', 26), col('contact_company', 'Company', 26), col('linkedin_url', 'LinkedIn URL', 32), col('bdr_name', 'BDR', 18), col('bdr_email', 'BDR Email', 24),
        col('message_type', 'Type', 10, '"connect" = connection request note; "message" = direct message.'), col('message_source', 'Source', 22, 'Generator source (Post Reply, Organization News, Profile, etc.).'), col('generated_via', 'Generated Via', 20),
        col('hypothesis_group', 'Hypothesis Group', 26), col('hypothesis_variation', 'Variation', 18), col('pipeline_run_id', 'Pipeline Run ID', 24), col('batch', 'Batch', 22),
        col('generated_at', 'Generated At', 16), col('review_status', 'Review Status', 18),
        col('original_ai_message', 'Original AI Message', 60), col('final_message', 'Final Message', 60), col('edited_from_ai_version', 'Edited From AI Version', 10), col('characters', 'Characters', 9),
        col('opus_review_status', 'Opus Review Status', 14), col('opus_rating', 'Opus Rating', 9, 'AI quality rating (typically 1-10; 7+ is approvable).'), col('opus_reason', 'Opus Reason', 40),
        col('final_ai_status', 'Final AI Review', 12), col('final_ai_flagged', 'Final AI Flagged', 9), col('final_ai_concerns', 'Final AI Concerns', 40),
        col('edited_by', 'Edited By', 24), col('edited_at', 'Edited At', 16), col('approved_by', 'Approved By', 24), col('approved_at', 'Approved At', 16), col('approval_method', 'Approval Method', 24), col('client_approved_at', 'Client Approved At', 16),
        col('pushed_to_sending_platform', 'Pushed To Sending Platform', 11), col('pushed_at', 'Pushed At', 16), col('pushed_by', 'Pushed By', 22), col('routed_via', 'Routed Via', 18),
        col('removed', 'Removed', 9), col('removed_reason', 'Removed Reason', 30), col('removed_by', 'Removed By', 22), col('removed_at', 'Removed At', 16),
        col('generated_in_period', 'Generated In Period', 10), col('approved_in_period', 'Approved In Period', 10), col('removed_in_period', 'Removed In Period', 10), col('sent_in_period', 'Sent In Period', 10), col('queue_doc_id', 'Queue Record ID', 22)],
        rows: genRows
    };

    // ── Work_Log: unified timeline of every kind of activity ────────────────
    const wl = [];
    // `when` is a Date/ISO string for exact-time events, or { aggDay } for daily roll-ups (no time of day shown)
    const add = (when, page, category, action, actor, bdr, summary, count, ref, source) => wl.push({
        _sort: when ? (when.aggDay ? Date.parse(when.aggDay + 'T12:00:00') : (toDate(when) ? toDate(when).getTime() : 0)) : 0,
        date: when && when.aggDay ? when.aggDay : dayKey(when), time: (when && !when.aggDay && toDate(when)) ? fmtDT(when).slice(11) : '',
        page, category, action, actor: actor || '', bdr_name: bdr ? bdrNameOf(bdr) : '', bdr_email: bdr ? canonical(bdr) : '', summary, count: count === undefined ? '' : count, reference_id: ref || '', data_source: source
    });
    const noon = day => ({ aggDay: day });
    const aggregate = (items, keyFn, emit) => {
        const m = new Map();
        items.forEach(it => { const k = keyFn(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); });
        m.forEach((arr, k) => emit(arr, k));
    };
    // queue-derived (aggregated per day)
    const inPQ = (q, f) => q[f] && inP(dayKey(q[f]), P.start, P.end);
    aggregate(queue.filter(q => inPQ(q, 'genAt')), q => [dayKey(q.genAt), q.bdr, queuePage(q), q.d.source || ''].join('|'), (arr, k) => {
        const [day, bdr, page, source] = k.split('|');
        add(noon(day), page, 'generation', 'messages_generated', '', bdr, `${arr.length} message(s) generated${source ? ` (source: ${source})` : ''}${arr[0].d.pipelineRunId ? ' by the Full Pipeline' : ''}`, arr.length, '', 'connect_queue (inferred from record timestamps)');
    });
    aggregate(queue.filter(q => inPQ(q, 'approvedAt')), q => [dayKey(q.approvedAt), q.bdr, approvalPage(q), q.d.adminApprovedBy || '', q.d.approvalMethod || ''].join('|'), (arr, k) => {
        const [day, bdr, page, actor, method] = k.split('|');
        add(noon(day), page, 'review', 'messages_approved_by_team', actor, bdr, `${arr.length} message(s) reviewed & approved${method ? ` (method: ${method})` : ''}`, arr.length, '', 'connect_queue (inferred from record timestamps)');
    });
    aggregate(queue.filter(q => inPQ(q, 'custApprovedAt')), q => [dayKey(q.custApprovedAt), q.bdr].join('|'), (arr, k) => {
        const [day, bdr] = k.split('|');
        add(noon(day), 'customer review (Queue 2)', 'review', 'messages_approved_by_client', '', bdr, `${arr.length} message(s) approved by the client`, arr.length, '', 'connect_queue (inferred from record timestamps)');
    });
    aggregate(queue.filter(q => inPQ(q, 'editedAt')), q => [dayKey(q.editedAt), q.bdr, q.d.lastEditedByAdmin || ''].join('|'), (arr, k) => {
        const [day, bdr, actor] = k.split('|');
        add(noon(day), 'fast_connect_review', 'review', 'messages_edited', actor, bdr, `${arr.length} message(s) edited by the team`, arr.length, '', 'connect_queue (inferred from record timestamps)');
    });
    aggregate(queue.filter(q => q.deleted && inPQ(q, 'deletedAt')), q => [dayKey(q.deletedAt), q.bdr, q.deletedBy, trunc(q.deletedReason, 80)].join('|'), (arr, k) => {
        const [day, bdr, actor, reason] = k.split('|');
        add(noon(day), 'fast_connect_review / generate_messages', 'review', 'messages_removed', actor, bdr, `${arr.length} message(s) removed${reason ? ` — ${reason}` : ''}`, arr.length, '', 'connect_queue (inferred from record timestamps)');
    });
    aggregate(sentQ.filter(q => inPQ(q, 'sentAt')), q => [dayKey(q.sentAt), q.bdr].join('|'), (arr, k) => {
        const [day, bdr] = k.split('|');
        add(noon(day), 'sending platform', 'outreach', 'outreach_sent', '', bdr, `${new Set(arr.map(q => q.url)).size} contact(s) sent outreach`, new Set(arr.map(q => q.url)).size, '', 'connect_queue (inferred from record timestamps)');
    });
    // connect_activity (quick-message pushes etc.)
    aggregate((inp.connectActivity || []).filter(a => inP(dayKey(a.timestamp || a.createdAt), P.start, P.end)), a => [dayKey(a.timestamp || a.createdAt), canonical(a.bdrEmail || a.account_email), a.actionType || '', a.via || '', a.pushedBy || ''].join('|'), (arr, k) => {
        const [day, bdr, type, via, actor] = k.split('|');
        add(noon(day), 'fast_connect_review', 'review', type || 'connect_activity', actor, bdr, `${arr.length} contact(s) pushed to the sending platform${via ? ` via ${via}` : ''}`, arr.length, '', 'connect_activity');
    });
    // exclusions
    aggregate((inp.exclusions || []).filter(x => inP(dayKey(x.excludedAt), P.start, P.end)), x => [dayKey(x.excludedAt), canonical(x.excludedByBdr), x.excludedBy || '', x.excludedByTool || x.messageType || ''].join('|'), (arr, k) => {
        const [day, bdr, actor, tool] = k.split('|');
        add(noon(day), tool.includes('pipeline') ? 'full_pipeline' : (tool.includes('generate') ? 'generate_messages' : 'fast_connect_review'), 'review', 'contacts_excluded', actor, bdr, `${arr.length} contact(s) excluded from outreach${tool ? ` (${tool})` : ''}`, arr.length, '', 'prospect_exclusions / connect_exclusions');
    });
    // follow-ups/replies/fast outreach events
    const KIND_PAGE = { follow_up_message: 'company_review_replies', bulk_follow_up_message: 'company_review_replies', harvest_follow_up_message: 'company_review_replies', fast_message_via_conversation: 'fast_message_speedup', fast_outreach_message: 'current_connections_fast_outreach', fast_outreach_bulk_message: 'current_connections_fast_outreach', quick_message_campaign: 'quick message campaign', scheduled_message: 'linkedin scheduled DMs' };
    aggregate(sendEvents.filter(e => inP(e.day, P.start, P.end)), e => [e.day, e.bdr, e.kind].join('|'), (arr, k) => {
        const [day, bdr, kind] = k.split('|');
        add(noon(day), KIND_PAGE[kind] || kind, 'follow-up', kind, '', bdr, `${arr.length} follow-up/reply message(s) sent (${kind})`, arr.length, '', 'activity_tracking / quick_message_campaign_leads / linkedin_message_queue');
    });
    meetingByUrl.forEach(m => {
        if (!inP(m.day, P.start, P.end)) return;
        add(noon(m.day), 'company_review_replies', 'outcome', 'meeting_scheduled', m.by, m.bdr, `Meeting scheduled with ${m.name || m.url}${m.company ? ' (' + m.company + ')' : ''}`, 1, '', 'activity_tracking');
    });
    aggregate(pandoCrmNotes.filter(n => inP(dayKey(n.createdAt), P.start, P.end)), n => [dayKey(n.createdAt), canonical(n.bdrEmail), n.createdBy || ''].join('|'), (arr, k) => {
        const [day, bdr, actor] = k.split('|');
        add(noon(day), 'company_review_replies', 'review', 'crm_notes_added', actor, bdr, `${arr.length} conversation note(s) added`, arr.length, '', 'connect_linkedin_crm');
    });
    // pipeline runs / scans
    (inp.pipelineRuns || []).filter(r => inP(dayKey(r.startedAt), P.start, P.end)).forEach(r => {
        const t = r.totals || {};
        add(r.startedAt, 'full_pipeline', 'pipeline', 'pipeline_run_' + (r.status || 'unknown'), r.startedBy,
            ((r.bdrPlan || [])[0] || {}).bdrEmail || '',
            `Pipeline run on "${r.hypothesisGroupName || r.hypothesisGroupId || ''}" (${r.status}): ${(r.orgs || []).length} organizations, ${t.contactsScanned || 0} contacts scanned, ${t.matched || 0} matched target rules, ${t.messages || 0} messages generated`,
            t.messages || 0, r.runId || r.id, 'full_pipeline_runs');
    });
    (inp.contactSearches || []).filter(j => inP(dayKey(j.submittedAt), P.start, P.end)).forEach(j => {
        add(j.submittedAt, 'full_pipeline / manage_data', 'data', 'contact_scan_' + (j.status || 'submitted'), j.submittedBy, j.bdrEmail,
            `Contact scan "${j.scanLabel || j.batchName || ''}" for ${j.companyCount || (j.companies || []).length || 0} organization(s)${j.pipelineRunId ? ' (part of a pipeline run)' : ''}`,
            (j.results && (j.results.contacts_saved || j.results.contactsSaved)) || '', j.id, 'connect_contact_search_log');
    });
    // data management (contacts added/removed)
    aggregate((inp.importedContacts || []).filter(c => inP(dayKey(c.uploadedAt || c.createdAt), P.start, P.end)), c => [dayKey(c.uploadedAt || c.createdAt), canonical(c.userEmail || c.bdrEmail), c.source || '', c.importBatchLabel || c.sourceJobId || ''].join('|'), (arr, k) => {
        const [day, bdr, source, batch] = k.split('|');
        add(noon(day), 'manage_data / full_pipeline', 'data', 'contacts_added', arr[0].importedBy || arr[0].uploadedBy || '', bdr && canon[bdr] ? bdr : '', `${arr.length} contact(s) added to the prospect database (source: ${source || 'unknown'}${batch ? ', batch: ' + batch : ''})`, arr.length, '', 'prospect_contacts');
    });
    aggregate((inp.deletedContacts || []).filter(c => inP(dayKey(c.deletedAt), P.start, P.end)), c => [dayKey(c.deletedAt), c.deletedReason || '', c.deletedBy || ''].join('|'), (arr, k) => {
        const [day, reason, by] = k.split('|');
        add(noon(day), 'full_pipeline / manage_data', 'data', 'contacts_removed', by, '', `${arr.length} contact(s) removed from the prospect database (${reason || 'no reason recorded'})`, arr.length, '', 'prospect_contacts_deleted');
    });
    // explicit work-log entries (the new client_work_log collection)
    (inp.workLog || []).forEach(w => {
        add(w.occurredAt || w.createdAt, w.page, w.category, w.action, w.actor || w.createdBy, w.bdrEmail, w.summary || w.action, (w.counts && (w.counts.processed ?? w.counts.messages_generated ?? w.counts.saved ?? w.counts.contacts_created ?? w.counts.reviewed ?? w.counts.deleted)) ?? '', w.id, 'client_work_log');
    });
    wl.sort((a, b) => b._sort - a._sort);
    const logSheet = {
        name: 'Work_Log', source: 'fast_connect_review + generate_messages + full_pipeline + manage_data + company_review_replies',
        purpose: `Chronological record of the work performed for this client during the period, merged from every system. Rows with data_source "connect_queue (inferred…)" are daily roll-ups derived from record timestamps; rows from "client_work_log" are explicit work-session records written by the tools (batch submits, AI review runs, imports, pipeline runs). Newest first.`,
        columns: [col('date', 'Date', 12), col('time', 'Time', 8), col('page', 'Tool / Page', 26, 'Which internal tool the work happened in (describe in plain language for the client).'),
        col('category', 'Category', 14, 'generation | review | outreach | follow-up | outcome | pipeline | data'), col('action', 'Action', 30),
        col('actor', 'Done By', 26), col('bdr_name', 'On Behalf Of (BDR)', 20), col('bdr_email', 'BDR Email', 26), col('summary', 'What Happened', 90), col('count', 'Count', 8),
        col('reference_id', 'Reference ID', 24), col('data_source', 'Data Source', 36)],
        rows: wl
    };

    // ── Pipeline sheets (full_pipeline) ─────────────────────────────────────
    const runs = (inp.pipelineRuns || []).slice().sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    const runRows = runs.map(r => {
        const t = r.totals || {}, s = r.settings || {};
        const mins = (r.finishedAt && r.startedAt) ? Math.round((new Date(r.finishedAt) - new Date(r.startedAt)) / 60000) : '';
        return {
            run_id: r.runId || r.id, started_at: fmtDT(r.startedAt), finished_at: fmtDT(r.finishedAt), minutes: mins, status: r.status || '', started_by: r.startedBy || '',
            hypothesis_group: r.hypothesisGroupName || groupName[r.hypothesisGroupId] || r.hypothesisGroupId || '',
            bdr_targets: (r.bdrPlan || []).map(b => `${bdrNameOf(b.bdrEmail)}: ${b.generated}/${b.target}`).join('; '),
            organizations_processed: (r.orgs || []).length, contacts_scanned: t.contactsScanned || 0, cross_bdr_imported: t.crossBdrImported || 0,
            matched_target_rules: t.matched || 0, dropped_by_rules: t.dropped || 0, messages_generated: t.messages || 0,
            ai_approved: t.opusApproved || 0, ai_needs_attention: t.opusNeedsAttention || 0, ai_flagged_exclude: t.opusExcluded || 0, ai_pre_excluded: t.opusPreExcluded || 0, final_review_flagged: t.finalReviewFlagged || 0,
            dnc_skipped_orgs: t.dncSkippedOrgs || 0, already_connected: t.alreadyConnected || 0, duplicate_skipped_orgs: t.duplicateSkippedOrgs || 0, org_limit_skipped_orgs: t.orgLimitSkippedOrgs || 0,
            scan_name: s.scanName || '', build_model: (r.models && r.models.buildModel) || '', review_model: (r.models && r.models.opusModel) || '', error: r.error || ''
        };
    });
    const runSheet = {
        name: 'Pipeline_Runs', source: 'full_pipeline.html (full_pipeline_runs)',
        purpose: 'Each Full Pipeline run in the period: research organizations → scan employees → filter to target roles → write messages → AI quality review. One row per run with totals. (Internal cost figures are intentionally omitted.)',
        columns: [col('run_id', 'Run ID', 26), col('started_at', 'Started', 16), col('finished_at', 'Finished', 16), col('minutes', 'Minutes', 8), col('status', 'Status', 12, 'completed | stopped | cost_limit | error | running | finished_incomplete'),
        col('started_by', 'Started By', 26), col('hypothesis_group', 'Hypothesis Group', 28), col('bdr_targets', 'BDR Targets (Generated/Target)', 36),
        col('organizations_processed', 'Organizations Processed', 12), col('contacts_scanned', 'Contacts Scanned', 11), col('cross_bdr_imported', 'Imported From Other BDRs', 11),
        col('matched_target_rules', 'Matched Target Rules', 11, 'Contacts that fit the hypothesis group\'s target-contact rules.'), col('dropped_by_rules', 'Dropped By Rules', 11),
        col('messages_generated', 'Messages Generated', 11), col('ai_approved', 'AI Review: Approved', 10), col('ai_needs_attention', 'AI Review: Needs Attention', 11), col('ai_flagged_exclude', 'AI Review: Flagged To Exclude', 11),
        col('ai_pre_excluded', 'Pre-Excluded By Rules', 11), col('final_review_flagged', 'Final Review Flagged', 11), col('dnc_skipped_orgs', 'Do-Not-Contact Orgs Skipped', 11),
        col('already_connected', 'Already Connected (Skipped)', 11), col('duplicate_skipped_orgs', 'Duplicate Orgs Skipped', 11), col('org_limit_skipped_orgs', '30-Day Org Limit Skipped', 11),
        col('scan_name', 'Scan Name', 22), col('build_model', 'Writing Model', 22), col('review_model', 'Review Model', 22), col('error', 'Error', 30)],
        rows: runRows
    };
    const orgRows = [];
    runs.forEach(r => (r.orgs || []).forEach(o => {
        const reasons = o.noMessageReasons ? Object.entries(o.noMessageReasons).map(([k, v]) => `${k}: ${v}`).join('; ') : '';
        orgRows.push({
            run_id: r.runId || r.id, started_at: fmtDT(r.startedAt), hypothesis_group: r.hypothesisGroupName || '', organization: o.name || '', linkedin_url: o.linkedinUrl || '',
            bdr_name: bdrNameOf(o.bdrEmail), org_type: o.orgType || '', url_researched: yn(o.urlResearched), contacts_scanned: o.contactsScanned || 0, cross_bdr_imported: o.crossBdrImported || 0,
            matched: o.matched || 0, dropped: o.dropped || 0, messages_generated: o.messagesGenerated || 0, ai_approved: (o.opus && o.opus.approved) || 0, ai_needs_attention: (o.opus && o.opus.needsAttention) || 0,
            ai_excluded: (o.opus && o.opus.excluded) || 0, final_review_flagged: (o.finalReview && o.finalReview.flagged) || 0, already_connected: o.alreadyConnected || 0,
            skipped_reason: o.error ? String(o.error) : (o.dncMatch ? 'Do-Not-Contact match' : ''), no_message_reasons: trunc(reasons, 400)
        });
    }));
    const orgSheet = {
        name: 'Pipeline_Org_Detail', source: 'full_pipeline.html (full_pipeline_runs.orgs[])',
        purpose: 'Organization-by-organization result of each Full Pipeline run in the period: what was scanned, how many contacts fit, how many messages resulted, and why an organization was skipped.',
        columns: [col('run_id', 'Run ID', 26), col('started_at', 'Run Started', 16), col('hypothesis_group', 'Hypothesis Group', 26), col('organization', 'Organization', 30), col('linkedin_url', 'Company LinkedIn URL', 34),
        col('bdr_name', 'BDR', 18), col('org_type', 'Organization Type', 18), col('url_researched', 'LinkedIn URL Researched', 10), col('contacts_scanned', 'Contacts Scanned', 10), col('cross_bdr_imported', 'Imported From Other BDRs', 10),
        col('matched', 'Matched Rules', 9), col('dropped', 'Dropped', 9), col('messages_generated', 'Messages Generated', 10), col('ai_approved', 'AI Approved', 9), col('ai_needs_attention', 'AI Needs Attention', 10),
        col('ai_excluded', 'AI Flagged Exclude', 10), col('final_review_flagged', 'Final Review Flagged', 10), col('already_connected', 'Already Connected', 10), col('skipped_reason', 'Skipped / Error', 28), col('no_message_reasons', 'Why Contacts Got No Message', 50)],
        rows: orgRows
    };
    const scanRows = (inp.contactSearches || []).filter(j => scopeAll || inP(dayKey(j.submittedAt), P.start, P.end)).map(j => ({
        submitted_at: fmtDT(j.submittedAt), submitted_by: j.submittedBy || '', bdr_name: bdrNameOf(j.bdrEmail), status: j.status || '', scan_label: j.scanLabel || '', batch_name: j.batchName || '',
        source: j.source || '', pipeline_run_id: j.pipelineRunId || '', hypothesis_group: groupName[j.hypothesisGroupId] || j.hypothesisGroupId || '', organizations: j.companyCount || (j.companies || []).length || 0,
        contacts_saved: (j.results && (j.results.contacts_saved ?? j.results.contactsSaved)) ?? '', job_id: j.id
    })).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
    const scanSheet = {
        name: 'Contact_Searches', source: 'full_pipeline.html + manage_data.html (connect_contact_search_log)',
        purpose: 'Employee/contact search jobs submitted for this client\'s BDRs (from Full Pipeline or the Manage Data tools).',
        columns: [col('submitted_at', 'Submitted', 16), col('submitted_by', 'Submitted By', 26), col('bdr_name', 'BDR', 18), col('status', 'Status', 12), col('scan_label', 'Scan Label', 24), col('batch_name', 'Batch', 24),
        col('source', 'Source', 22), col('pipeline_run_id', 'Pipeline Run ID', 26), col('hypothesis_group', 'Hypothesis Group', 26), col('organizations', 'Organizations Searched', 11), col('contacts_saved', 'Contacts Saved', 10), col('job_id', 'Job ID', 22)],
        rows: scanRows
    };

    // ── Data management (manage_data) ───────────────────────────────────────
    const dmAgg = new Map();
    (inp.importedContacts || []).forEach(c => {
        const day = dayKey(c.uploadedAt || c.createdAt); if (!inP(day, P.start, P.end)) return;
        const key = [day, c.source || '(unknown)', c.importBatchLabel || c.csvFileName || c.sourceJobId || '', c.hypothesisGroupName || groupName[c.hypothesisGroupId] || ''].join('|');
        dmAgg.set(key, (dmAgg.get(key) || 0) + 1);
    });
    const dmRows = [...dmAgg.entries()].map(([k, n]) => { const [day, source, batch, group] = k.split('|'); return { date: day, source, batch, hypothesis_group: group, contacts_added: n }; })
        .sort((a, b) => b.date.localeCompare(a.date) || b.contacts_added - a.contacts_added);
    const dmSheet = {
        name: 'Data_Mgmt_Summary', source: 'manage_data.html (+ the tools embedded in it) and full_pipeline.html',
        purpose: 'Prospect-database growth during the period: contacts added, grouped by day, source (CSV upload, employee scan, cross-BDR import…), import batch and hypothesis group. Only contacts attributable to this client (by BDR or hypothesis group) are counted.',
        columns: [col('date', 'Date', 12), col('source', 'Source', 28), col('batch', 'Batch / File / Scan Job', 40), col('hypothesis_group', 'Hypothesis Group', 28), col('contacts_added', 'Contacts Added', 12)],
        rows: dmRows
    };

    // ── Diagnostics + sheet order ───────────────────────────────────────────
    const sheets = [summarySheet,
        { name: 'Daily_Activity', source: 'all sources', purpose: 'Day-by-day counts for the period (use for a weekly trend line/bar chart).', columns: dailyCols, rows: dailyRows },
        { name: 'Outcomes_By_Type', source: 'outcomes.html', purpose: 'Funnel results by how the opening message was written (outcomes.html "by message type"). Period columns = contacts first reached in the period; All Time columns = everything on record.', columns: outcomeCols('message_type', 'Message Type', 'How the opening message was written.'), rows: byTypeRows },
        { name: 'Outcomes_By_BDR', source: 'outcomes.html', purpose: 'Funnel results and work volume per BDR (sender).', columns: bdrCols, rows: byBdrRows },
        { name: 'Outcomes_By_Hypothesis', source: 'outcomes.html + connect_hypothesis_documentation.html', purpose: 'Funnel results per hypothesis group (targeting strategy), from contact-level data.', columns: outcomeCols('hypothesis_group', 'Hypothesis Group', 'Targeting strategy the contact was reached through.'), rows: byHypRows },
        histSheet, msgSheet, replySheet, catSheet, noteSheet, hypSheet, varSheet,
        ...analysisSheets,
        genSheet, logSheet, runSheet, orgSheet, scanSheet, dmSheet
    ];

    const counts = {};
    sheets.forEach(s => { counts[s.name] = s.kind === 'summary' ? kpis.length : (s.rows || []).length; });
    diag.push({ source: 'assembled sheets', rows: sheets.length, note: sheets.map(s => `${s.name}=${counts[s.name]}`).join(', ') });

    const meta = {
        client: clientName, period: periodLabel, previousPeriod: prevLabel, generatedAt: inp.generatedAt, exportedBy: inp.exportedBy || '', timezone: inp.timezone || '',
        scope: scopeAll ? 'all time' : 'activity in period', version: REPORT_VERSION, analysisRunDate: inp.analysis && inp.analysis.meta ? inp.analysis.meta.run_date : ''
    };
    const report = { meta, sheets, kpis, counts, diagnostics: diag, cohort: { current: fCohort, previous: fCohortPrev, allTime: fAll } };
    report.instructions = buildInstructions(report);
    // README sheet goes first
    report.sheets.unshift({ name: 'README_FOR_CHATGPT', kind: 'readme', purpose: 'Instructions + data dictionary for ChatGPT (or any analyst).', text: report.instructions });
    report.sheets.push({ name: 'Load_Diagnostics', source: 'this export', purpose: 'What was loaded, how many records each source returned, and any load problems — check this before trusting a zero.', columns: [col('source', 'Source', 40), col('rows', 'Records', 10), col('note', 'Note', 110)], rows: diag });
    return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis sheets
// ─────────────────────────────────────────────────────────────────────────────
function buildAnalysisSheets(analysis, clientName, diag) {
    if (!analysis) return [];
    const meta = analysis.meta || {};
    if (!analysis.client) {
        diag.push({ source: 'analysis_results', rows: 0, note: `No analysis segment matched "${clientName}". Available clients: ${(analysis.candidates || []).join(', ')}` });
        return [];
    }
    const segs = segmentRows(analysis);
    const funnelRows = [], keyRows = [], researchRows = [], trendRows = [], exampleRows = [], phraseRows = [];
    const f = (o, k) => (o && o[k] !== undefined && o[k] !== null) ? o[k] : '';
    if (analysis.overall && analysis.overall.funnel) {
        const o = analysis.overall.funnel;
        funnelRows.push({ level: 'benchmark', group: '(ALL clients combined — benchmark)', group_id: 'overall', sufficient_data: 'Yes', n: f(o, 'n'), connected: f(o, 'connected'), replied: f(o, 'replied'), scheduled: f(o, 'scheduled'), connect_rate: f(o, 'connect_rate'), reply_rate: f(o, 'reply_rate'), meeting_rate: f(o, 'meeting_rate'), cond_reply_rate: f(o, 'cond_reply_rate'), cond_meeting_rate: f(o, 'cond_meeting_rate'), blended_score: f(o, 'blended_score'), note: 'Benchmark across every client in the dataset.', message_prompt: '' });
    }
    segs.forEach(({ level, groupName, seg }) => {
        const fn = seg.funnel || {};
        funnelRows.push({
            level, group: groupName, group_id: seg.id || '', sufficient_data: yn(seg.sufficient_data), n: f(fn, 'n'), connected: f(fn, 'connected'), replied: f(fn, 'replied'), scheduled: f(fn, 'scheduled'),
            connect_rate: f(fn, 'connect_rate'), reply_rate: f(fn, 'reply_rate'), meeting_rate: f(fn, 'meeting_rate'), cond_reply_rate: f(fn, 'cond_reply_rate'), cond_meeting_rate: f(fn, 'cond_meeting_rate'),
            blended_score: f(fn, 'blended_score'), note: seg.note || (seg.sufficient_data === false ? 'Fewer than 40 contacts — keys/research suppressed.' : ''), message_prompt: trunc(seg.message_prompt || '', 6000)
        });
        ((seg.keys && seg.keys.working) || []).forEach(k => keyRows.push(keyRow(groupName, level, 'working', k)));
        ((seg.keys && seg.keys.not_working) || []).forEach(k => keyRows.push(keyRow(groupName, level, 'not working', k)));
        (seg.trend || []).forEach(t => trendRows.push({ group: groupName, level, month: t.month, n: f(t, 'n'), connect_rate: f(t, 'connect_rate'), reply_rate: f(t, 'reply_rate'), meeting_rate: f(t, 'meeting_rate') }));
        const rs = seg.research || {};
        const pushRows = (dimKey, arr) => (arr || []).forEach(r => researchRows.push({ group: groupName, level, dimension: DIM_LABELS[dimKey] || dimKey, level_value: r.level, n: f(r, 'n'), connect_rate: f(r, 'connect_rate'), reply_rate: f(r, 'reply_rate'), meeting_rate: f(r, 'meeting_rate') }));
        Object.keys(rs).forEach(k => {
            const v = rs[k];
            if (Array.isArray(v) && v.length && v[0] && v[0].level !== undefined) pushRows(k, v);
        });
        pushRows('message_type_overview', seg.message_type_overview);
        if (rs.ai_feel) {
            researchRows.push({ group: groupName, level, dimension: 'AI-feel score (1=human … 5=obviously AI)', level_value: 'average', n: '', connect_rate: '', reply_rate: f(rs.ai_feel, 'avg_ai_score'), meeting_rate: '' });
            (rs.ai_feel.by_ai_score || []).forEach(r => researchRows.push({ group: groupName, level, dimension: 'AI-feel score (1=human … 5=obviously AI)', level_value: `Score ${r.ai_score}`, n: f(r, 'n'), connect_rate: '', reply_rate: f(r, 'reply_rate'), meeting_rate: f(r, 'meeting_rate') }));
        }
        if (rs.company_vs_prospect) {
            (rs.company_vs_prospect.by_focus_bucket || []).forEach(r => researchRows.push({ group: groupName, level, dimension: 'Share of message about the prospect (vs about us)', level_value: r.bucket, n: f(r, 'n'), connect_rate: '', reply_rate: f(r, 'reply_rate'), meeting_rate: f(r, 'meeting_rate') }));
        }
        if (rs.followup) {
            (rs.followup.by_approach || []).forEach(r => researchRows.push({ group: groupName, level, dimension: 'Follow-up approach (meeting rate)', level_value: r.approach, n: f(r, 'n'), connect_rate: '', reply_rate: '', meeting_rate: f(r, 'meeting_rate') }));
            (rs.followup.by_speed || []).forEach(r => researchRows.push({ group: groupName, level, dimension: 'Follow-up speed (meeting rate)', level_value: r.speed, n: f(r, 'n'), connect_rate: '', reply_rate: '', meeting_rate: f(r, 'meeting_rate') }));
        }
        if (rs.top_phrases) {
            (rs.top_phrases.working || []).forEach(p => phraseRows.push({ group: groupName, level, direction: 'working', phrase: p.phrase, n: f(p, 'n'), reply_rate_with: f(p, 'reply_rate_with'), reply_rate_without: f(p, 'reply_rate_without'), effect_pp: f(p, 'effect_pp'), p_value: f(p, 'p_value') }));
            (rs.top_phrases.not_working || []).forEach(p => phraseRows.push({ group: groupName, level, direction: 'not working', phrase: p.phrase, n: f(p, 'n'), reply_rate_with: f(p, 'reply_rate_with'), reply_rate_without: f(p, 'reply_rate_without'), effect_pp: f(p, 'effect_pp'), p_value: f(p, 'p_value') }));
        }
        const ex = seg.examples || {};
        [['meetings_won', 'Meeting booked'], ['high_potential_open', 'High-potential, still open']].forEach(([k, label]) => (ex[k] || []).forEach(e => exampleRows.push({ group: groupName, level, kind: label, contact: e.contact || '', title: e.title || '', company: e.company || '', message_type: e.message_type || '', opportunity: f(e, 'opportunity'), message: trunc(e.message, 1500) })));
    });
    diag.push({ source: 'analysis_results', rows: funnelRows.length, note: `Matched analysis client "${analysis.client.name}" (run date ${meta.run_date || '?'}, generated ${meta.generated_at || '?'}, ${meta.n_contacts || '?'} contacts in model). ${segs.length - 1} hypothesis group segment(s).` });

    const src = 'analysis_results.html (connect_analysis/latest.json)';
    const note = ` Statistical model refreshed weekly (run date ${meta.run_date || 'unknown'}); it covers the client's whole history, not just the report week.`;
    return [
        {
            name: 'Analysis_Funnel', source: src, purpose: 'Success-analysis funnel per segment: contacts (n), connected, replied, meetings and the rates, plus the blended score (0.15×connect% + 0.35×reply% + 0.50×meeting%). First row is the all-clients benchmark.' + note,
            columns: [col('level', 'Level', 16), col('group', 'Segment / Hypothesis Group', 36), col('group_id', 'Group ID', 22), col('sufficient_data', 'Enough Data', 9, 'No = fewer than 40 contacts; treat rates as unreliable.'),
            col('n', 'Contacts (n)', 10), col('connected', 'Connected', 10), col('replied', 'Replied', 10), col('scheduled', 'Meetings', 10),
            col('connect_rate', 'Connect Rate %', 10), col('reply_rate', 'Reply Rate %', 10), col('meeting_rate', 'Meeting Rate %', 10),
            col('cond_reply_rate', 'Reply % Of Connected', 11), col('cond_meeting_rate', 'Meeting % Of Replied', 11), col('blended_score', 'Blended Score', 10, 'Headline KPI.'), col('note', 'Note', 40), col('message_prompt', 'AI-Built Message Prompt (what works for this segment)', 70)],
            rows: funnelRows
        },
        {
            name: 'Analysis_Keys', source: src, purpose: '"Keys to success": tested signals that raise (working) or lower (not working) an outcome, with effect size in percentage points, confidence and sample sizes.' + note,
            columns: [col('group', 'Segment / Hypothesis Group', 36), col('level', 'Level', 16), col('direction', 'Direction', 11), col('label', 'Signal', 36), col('category', 'Category', 16), col('outcome', 'Outcome Affected', 11, 'connected | replied | scheduled'),
            col('effect_pp', 'Effect (pp)', 10, 'Connection-adjusted change in outcome rate, percentage points.'), col('overall_effect_pp', 'Effect Across All Data (pp)', 12), col('rate_with', 'Rate With %', 10), col('rate_without', 'Rate Without %', 10),
            col('n_with', 'n With', 8), col('n_without', 'n Without', 8), col('p_value', 'p-value', 8), col('confidence', 'Confidence', 10), col('connection_controlled', 'Adjusted For Connection Count', 12)],
            rows: keyRows
        },
        {
            name: 'Analysis_Research', source: src, purpose: 'Deep-dive breakdowns: outcome rates by message tone, hook, length, send day/time, audience seniority, org type, BDR, AI-feel, etc. One row per level of each dimension.' + note,
            columns: [col('group', 'Segment / Hypothesis Group', 36), col('level', 'Level', 16), col('dimension', 'Dimension', 36), col('level_value', 'Value', 28), col('n', 'n', 8, 'Sample size — rates with n < 20 are unreliable.'), col('connect_rate', 'Connect Rate %', 10), col('reply_rate', 'Reply Rate %', 10), col('meeting_rate', 'Meeting Rate %', 10)],
            rows: researchRows
        },
        {
            name: 'Analysis_Trend', source: src, purpose: 'Monthly trend of connect / reply / meeting rates per segment.' + note,
            columns: [col('group', 'Segment / Hypothesis Group', 36), col('level', 'Level', 16), col('month', 'Month', 10), col('n', 'n', 8), col('connect_rate', 'Connect Rate %', 10), col('reply_rate', 'Reply Rate %', 10), col('meeting_rate', 'Meeting Rate %', 10)],
            rows: trendRows
        },
        {
            name: 'Analysis_Phrases', source: src, purpose: 'Phrases in messages that raise or lower reply rate (connection-controlled).' + note,
            columns: [col('group', 'Segment / Hypothesis Group', 36), col('level', 'Level', 16), col('direction', 'Direction', 11), col('phrase', 'Phrase', 36), col('n', 'Messages Containing', 10), col('reply_rate_with', 'Reply % With', 10), col('reply_rate_without', 'Reply % Without', 10), col('effect_pp', 'Effect (pp)', 10), col('p_value', 'p-value', 8)],
            rows: phraseRows
        },
        {
            name: 'Analysis_Examples', source: src, purpose: 'Real example messages: ones that booked meetings, and high-potential ones still open. Contains real names — handle per client privacy.' + note,
            columns: [col('group', 'Segment / Hypothesis Group', 36), col('level', 'Level', 16), col('kind', 'Kind', 22), col('contact', 'Contact', 22), col('title', 'Title', 26), col('company', 'Company', 26), col('message_type', 'Message Type', 16), col('opportunity', 'Model Opportunity Score', 11), col('message', 'First Message', 90)],
            rows: exampleRows
        }
    ];
}

function keyRow(group, level, direction, k) {
    const f = v => (v === undefined || v === null) ? '' : v;
    return {
        group, level, direction, label: k.label, category: k.category, outcome: k.outcome, effect_pp: f(k.effect_pp), overall_effect_pp: f(k.overall_effect_pp),
        rate_with: f(k.rate_with), rate_without: f(k.rate_without), n_with: f(k.n_with), n_without: f(k.n_without), p_value: f(k.p_value),
        confidence: k.confidence || '', connection_controlled: k.connection_controlled === null || k.connection_controlled === undefined ? '' : yn(k.connection_controlled)
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatGPT instructions (Markdown) — also written into the README sheet
// ─────────────────────────────────────────────────────────────────────────────
export function buildInstructions(report) {
    const m = report.meta;
    const L = [];
    const w = s => L.push(s === undefined ? '' : s);
    w(`# Weekly Client Progress Report — instructions for the analyst (ChatGPT)`);
    w('');
    w(`**Client:** ${m.client}`);
    w(`**Report period:** ${m.period}   |   **Comparison period:** ${m.previousPeriod}`);
    w(`**Workbook generated:** ${fmtDT(m.generatedAt)} (${m.timezone || 'local time'})   |   **History scope:** ${m.scope}`);
    if (m.analysisRunDate) w(`**Statistical analysis model run date:** ${m.analysisRunDate}`);
    w('');
    w('## 1. Your job');
    w(`Write a clear, honest, client-ready progress report for **${m.client}** covering **${m.period}**. The client is a business that pays us to run LinkedIn outreach (connection requests + follow-up conversations) to book meetings with their target prospects. They want to know: (a) what results came in this week, (b) what work our team did for them, (c) what we are learning, and (d) what happens next.`);
    w('');
    w('### Rules');
    w('- Use **only** the numbers and text in this workbook. Never invent figures, quotes, names or trends. If something is not in the workbook, say it is not available.');
    w('- Quote exact numbers from the **Summary** sheet; compare to the previous period and say whether each metric went up, down or stayed flat (with the change). Do not call a one-week change a trend unless the Daily_Activity / Analysis_Trend sheets support it.');
    w('- Be candid about small samples. Rates with fewer than ~20 contacts (n) are unreliable — say "early signal" rather than claiming a win. The Analysis sheets mark segments with `Enough Data = No`.');
    w('- Write in plain client-friendly language. Describe the work ("our team reviewed and approved 85 personalised messages") — do **not** mention internal page names, Firestore, collection names or sheet names in the client-facing text. Do not include internal costs or margins.');
    w('- Protect privacy: you may quote prospect replies and name companies/titles, but avoid listing large numbers of individual prospects; use a few representative examples.');
    w('- Newer contacts have had less time to accept or reply, so cohort rates for the latest week will understate their final result. Say so.');
    w('');
    w('## 2. Suggested report structure');
    w('1. **Executive summary** (4-6 bullets): headline results, biggest win, biggest concern, one recommendation.');
    w('2. **This week at a glance** — table of the key metrics vs. previous period (from `Summary` section A and B).');
    w('3. **Results & conversations** — meetings booked, notable replies (use `Reply_Review`, `Conversation_Messages`, `CRM_Notes`), what prospects are saying, and any follow-ups awaiting a response (`Awaiting Our Response = Yes`).');
    w('4. **Work performed for you** — messages written, reviewed, edited and approved; contacts researched/scanned/added; pipeline runs; quality-control removals (`Summary` section C, `Work_Log`, `Msg_Generation_Review`, `Pipeline_Runs`, `Data_Mgmt_Summary`). Describe the quality process (AI review ratings + human edits) using `Msg_Generation_Review`.');
    w('5. **Targeting & message performance** — which hypothesis groups / message types / BDRs are performing (`Outcomes_By_*`, `Hypothesis_Groups`, `Hypothesis_Variations`).');
    w('6. **What we are learning** — keys to success, best send times, tone/length findings (`Analysis_*` sheets). Mention the analysis run date and that it reflects the whole history.');
    w('7. **Next steps / recommendations** — 3-5 concrete actions grounded in the data (e.g. double down on a high-performing hypothesis, retire a weak one, test a variation).');
    w('8. **Appendix: data notes** — any caveats (see section 5 below and the `Load_Diagnostics` sheet).');
    w('');
    w('## 3. Key definitions');
    w('- **Pando / HealthLuminate-originated only** — every sheet in this workbook is filtered to connections, messages and conversations that originated from our outreach platform. Pre-existing LinkedIn connections, inbound-initiated conversations (where the other person messaged first) and personal LinkedIn chats outside our campaigns are excluded.');
    w('- **Outreach sent / contacts reached** — distinct prospects whose connection request or message was pushed to the sending platform by our team. The date used is the push/approval date.');
    w('- **Accepted (connected)** — LinkedIn recorded the prospect accepting a connection request originated by us.');
    w('- **Replied** — the prospect sent at least one message back (any time, or "in period" when stated).');
    w('- **Meeting scheduled** — a meeting-scheduled record was logged (or the conversation was categorised "Scheduled").');
    w('- **Accept % / Reply % / Meeting %** — each divided by contacts reached. **Replied % of accepted** and **Meetings % of replied** are the step conversion rates. **Contacts per meeting** = contacts reached ÷ meetings (lower is better).');
    w('- **Cohort ("Period: …" columns)** — contacts *first reached* during the report period, with their outcome *to date*. **All Time** columns cover every contact on record.');
    w('- **Activity in period** (Summary section A, Daily_Activity) — events that *happened* in the period regardless of when the contact was first reached (e.g. someone contacted last month who accepted this week).');
    w('- **Response categories** (Reply_Review): Response → Response Engaged → Response Willing to Meet → Scheduled (or Declined to Meet). **Follow-up categories** track our meeting-invite sequence: No Follow Up, Followed Up No Invite, Followed Up Soft Invite, Followed Up Calendar Link.');
    w('- **Hypothesis group** — a documented targeting strategy (a specific audience + angle + message instructions). A/B **variations** are alternative message styles inside a group.');
    w('- **Blended score** (Analysis_Funnel) = 0.15×connect% + 0.35×reply% + 0.50×meeting%.');
    w('- **Effect (pp)** (Analysis_Keys) — change in an outcome rate, in percentage points, adjusted for the prospect\'s connection count; "High/Medium/Low" is statistical confidence.');
    w('');
    w('## 4. Sheet guide (what each sheet is and its columns)');
    report.sheets.forEach(s => {
        if (s.kind === 'readme') return;
        const n = s.kind === 'summary' ? report.kpis.filter(k => !k.section).length : (s.rows || []).length;
        w(`### ${s.name}  (${n} ${s.kind === 'summary' ? 'metrics' : 'rows'})`);
        w(`*Source in our system:* ${s.source || ''}`);
        w(s.purpose);
        if (s.columns) {
            const described = s.columns.filter(c => c.d);
            if (described.length) { w('Column notes:'); described.forEach(c => w(`- **${c.h}** — ${c.d}`)); }
        }
        w('');
    });
    w('## 5. Known limitations — mention where relevant');
    w('- **Dates are approximate for sends:** "Outreach sent" uses the date the message was pushed/approved for sending; the sending platform may deliver over the following days.');
    w('- **Activity logging is new:** the `Work_Log` rows labelled `client_work_log` only exist from the day the logging feature was deployed. Earlier work is reconstructed from record timestamps (`connect_queue (inferred…)`) — counts are reliable, but AI-review results and batch summaries for earlier weeks are not available.');
    w('- **Manage Data tools** run inside embedded pages; only CSV imports, contact additions (by source/batch) and which tools were opened are recorded. Clean-up/merge actions inside those tools are not individually logged.');
    w('- **Attribution:** work is attributed to this client through its BDRs and hypothesis groups. Prospect records stored under a shared workspace (not a BDR) may not be attributed.');
    w('- **Replies come from HeyReach conversation threads;** replies captured only in other channels may be missing. Check `Load_Diagnostics` for any source that failed to load (a 0 there means "could not load", not necessarily "none").');
    w('- **Analysis sheets** come from a weekly statistical model refresh across the client\'s full history and may predate the report week.');
    w('');
    w('## 6. Prompt to paste into ChatGPT (with this workbook attached)');
    w('```');
    w(buildChatGptPrompt(m));
    w('```');
    return L.join('\n');
}

/** The short prompt the admin pastes into ChatGPT together with the uploaded workbook. */
export function buildChatGptPrompt(m) {
    return `You are a senior B2B growth analyst. I have attached an Excel workbook for the client "${m.client}" covering ${m.period}. Read the README_FOR_CHATGPT sheet first — it defines every metric and sheet. Then write a polished weekly progress report for the client following the suggested structure (executive summary, this week at a glance with comparison to ${m.previousPeriod}, results & conversations, work performed, targeting & message performance, what we are learning, next steps, data notes). Use only data in the workbook, quote exact numbers, flag small samples honestly, and use client-friendly language (no internal tool names or costs). Include 1-2 simple charts or chart-ready tables from Daily_Activity and Outcomes_By_*. Format the output as a document I can paste into Google Docs.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workbook writer
// ─────────────────────────────────────────────────────────────────────────────
const EXCEL_MAX = 32000;
function xlCell(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return fmtDT(v);
    if (typeof v === 'number') return isFinite(v) ? v : '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > EXCEL_MAX ? s.slice(0, EXCEL_MAX - 1) + '…' : s;
}

export function buildWorkbook(XLSX, report) {
    const wb = XLSX.utils.book_new();
    const used = new Set();
    const uniqueName = n => { let base = n.slice(0, 31), nm = base, i = 2; while (used.has(nm)) nm = base.slice(0, 28) + '_' + i++; used.add(nm); return nm; };

    report.sheets.forEach(s => {
        let ws;
        if (s.kind === 'readme') {
            const aoa = s.text.split('\n').map(line => [line]);
            ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 160 }];
        } else if (s.kind === 'summary') {
            const aoa = [['WEEKLY CLIENT REPORT — SUMMARY'], [s.purpose], []];
            s.meta.forEach(r => aoa.push([r[0], xlCell(r[1])]));
            aoa.push([]);
            aoa.push(['Metric', 'This Period', 'Previous Period', 'Change', 'Notes']);
            s.kpis.forEach(k => {
                if (k.section) { aoa.push([]); aoa.push([k.section]); }
                else aoa.push([k.label, xlCell(k.cur), xlCell(k.prev), xlCell(k.change), k.note || '']);
            });
            ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 62 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 110 }];
        } else {
            const cols = s.columns || [];
            const aoa = [cols.map(c => c.h)];
            (s.rows || []).forEach(r => aoa.push(cols.map(c => xlCell(r[c.k]))));
            ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = cols.map(c => ({ wch: c.w || 16 }));
            if (aoa.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: Math.max(0, cols.length - 1) } }) };
        }
        XLSX.utils.book_append_sheet(wb, ws, uniqueName(s.name));
    });
    return wb;
}
