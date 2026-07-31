/**
 * contact-fields.js — canonical title/company resolution for contact documents.
 *
 * The database has accumulated many alias fields for the same two concepts:
 *   Job title : title, position, jobTitle, prospect_title, contactTitle, contact_title
 *   Company   : company, companyName, organization, company_name, prospect_company, contactCompany
 * plus `searchedOrganization` (the org that was searched when the contact was found)
 * and `experience` (enrichment data: JSON string OR raw array of role entries).
 *
 * Every page should resolve title/company through these helpers instead of
 * hand-rolling its own fallback chain, and every writer should use
 * buildCanonicalFields() so all aliases stay in sync.
 *
 * NOTE: `headline` is deliberately NEVER used as a job title. Auto-generated
 * LinkedIn headlines are frequently just the company name, which is how
 * companies ended up in title fields in the first place.
 */
(function () {
    'use strict';

    // ── Experience parsing ──────────────────────────────────────────────────
    // `experience` may be a JSON string (most writers) or a raw array
    // (apify_actor_selector historically). Tolerate both.
    function parseExperience(raw) {
        if (!raw) return [];
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
    }

    function expTitle(exp) {
        return String(exp?.title || exp?.jobTitle || exp?.position || '').trim();
    }

    function expCompany(exp) {
        const v = exp?.companyName || exp?.company || exp?.subtitle || exp?.organization || '';
        // Some actor formats nest the company as an object ({name: ...})
        if (v && typeof v === 'object') return String(v.name || v.companyName || '').trim();
        return String(v || '').trim();
    }

    function isCurrentPosition(exp) {
        if (!exp) return false;
        if (exp.jobStillWorking === true || exp.isCurrent === true) return true;
        const endDate = exp.endDate?.text ?? exp.endDate ?? exp.jobEndedOn ?? exp.end ?? '';
        const endStr = typeof endDate === 'object' ? '' : String(endDate || '');
        if (/present|current/i.test(endStr)) return true;
        if (!endStr) {
            const startDate = exp.startDate ?? exp.jobStartedOn ?? exp.start ?? '';
            if (startDate) return true;
        }
        const dr = String(exp.dateRange || exp.caption || '');
        if (/\bpresent\b|\bcurrent\b/i.test(dr)) return true;
        return false;
    }

    /**
     * Pick the best "current role" entry from experience data.
     * Prefers a current entry whose company matches searchedOrganization
     * (the org this contact was found under), then the first current entry,
     * then the first entry overall.
     * Returns { title, company } or null when no usable experience exists.
     */
    function getCurrentRole(contact) {
        const exps = parseExperience(contact.experience);
        if (exps.length === 0) return null;

        const currentExps = exps.filter(isCurrentPosition);
        const candidates = currentExps.length > 0 ? currentExps : [exps[0]];

        const searched = String(contact.searchedOrganization || '').toLowerCase().trim();
        let chosen = null;
        if (searched) {
            chosen = candidates.find(e => expCompany(e).toLowerCase() === searched) || null;
        }
        if (!chosen) chosen = candidates.find(e => expCompany(e) || expTitle(e)) || candidates[0];
        if (!chosen) return null;

        const role = { title: expTitle(chosen), company: expCompany(chosen) };
        if (!role.title && !role.company) return null;
        return role;
    }

    // ── Heuristics for swapped fields ───────────────────────────────────────
    const TITLE_WORDS = /\b(director|manager|vp|svp|evp|avp|vice\s+president|president|chief|officer|ceo|cfo|coo|cio|cto|chro|cmo|cno|head\s+of|lead|coordinator|specialist|consultant|analyst|administrator|supervisor|executive|founder|co-?founder|owner|partner|principal|nurse|rn|np|physician|md|do|pharmd|surgeon|therapist|dietitian|advisor|adviser|engineer|architect|recruiter|strategist|scientist|professor|instructor|liaison|planner|controller|treasurer|chairman|chairwoman|chairperson|superintendent|dean|provost|generalist|practitioner|clinician)\b/i;

    const COMPANY_WORDS = /\b(inc\.?|llc|l\.l\.c\.?|corp\.?|corporation|company|co\.|ltd\.?|plc|group|holdings?|partners|associates|solutions|systems|services|health(care)?|hospital|clinic|medical\s+(center|centre|group)|university|college|institute|foundation|agency|consulting|labs?|technolog(y|ies)|pharmaceuticals?|pharma|insurance|benefits|network|alliance|enterprises)\b/i;

    function looksLikeTitle(str)   { return !!str && TITLE_WORDS.test(str); }
    function looksLikeCompany(str) { return !!str && COMPANY_WORDS.test(str) && !TITLE_WORDS.test(str); }

    /**
     * Detect a likely title<->company swap on a contact document.
     * Returns { swapped: boolean, reason: string }.
     */
    function detectSwap(contact) {
        const title = String(contact.title || contact.position || contact.jobTitle || '').trim();
        const company = String(contact.company || contact.companyName || contact.organization || '').trim();
        if (!title || !company) return { swapped: false, reason: '' };

        // Strongest signal: cross-match against experience entries.
        const exps = parseExperience(contact.experience);
        if (exps.length > 0) {
            const titleLc = title.toLowerCase();
            const companyLc = company.toLowerCase();
            const titleIsAnExpCompany = exps.some(e => expCompany(e).toLowerCase() === titleLc);
            const companyIsAnExpTitle = exps.some(e => expTitle(e).toLowerCase() === companyLc);
            if (titleIsAnExpCompany && companyIsAnExpTitle) {
                return { swapped: true, reason: 'title matches an experience company AND company matches an experience title' };
            }
            if (titleIsAnExpCompany && looksLikeTitle(company)) {
                return { swapped: true, reason: 'title matches an experience company; company reads like a job title' };
            }
        }

        // Keyword heuristics (no experience needed).
        if (looksLikeTitle(company) && looksLikeCompany(title)) {
            return { swapped: true, reason: 'company reads like a job title and title reads like an organization' };
        }
        // searchedOrganization cross-check: the title field holds the searched org.
        const searched = String(contact.searchedOrganization || '').toLowerCase().trim();
        if (searched && title.toLowerCase() === searched && looksLikeTitle(company)) {
            return { swapped: true, reason: 'title equals searchedOrganization; company reads like a job title' };
        }
        return { swapped: false, reason: '' };
    }

    // ── Canonical read helpers ──────────────────────────────────────────────
    function resolveTitle(contact) {
        const direct = contact.title || contact.position || contact.jobTitle ||
                       contact.prospect_title || contact.contactTitle || contact.contact_title || '';
        if (direct && String(direct).trim()) return String(direct).trim();
        const role = getCurrentRole(contact);
        return role ? role.title : '';
    }

    function resolveCompany(contact) {
        const direct = contact.company || contact.companyName || contact.organization ||
                       contact.company_name || contact.prospect_company || contact.contactCompany || '';
        if (direct && String(direct).trim()) return String(direct).trim();
        if (contact.searchedOrganization) return String(contact.searchedOrganization).trim();
        const role = getCurrentRole(contact);
        return role ? role.company : '';
    }

    // ── Canonical write helper ──────────────────────────────────────────────
    /**
     * Build a Firestore update payload that keeps every title/company alias in
     * sync so that any page's fallback chain resolves to the same value.
     * Pass isHeyreach=true for heyreach_contacts (same aliases apply; position/
     * companyName are that collection's primary fields and are included anyway).
     */
    function buildCanonicalFields(title, company) {
        const t = String(title || '').trim();
        const c = String(company || '').trim();
        return {
            title: t,
            position: t,
            jobTitle: t,
            company: c,
            companyName: c,
            organization: c,
            fieldsSyncedAt: new Date().toISOString(),
            fieldsSyncedBy: 'contact-fields.js'
        };
    }

    /**
     * Normalize an experience value to the canonical JSON-string format
     * (max 10 entries). Returns null when no write is needed.
     */
    function normalizeExperienceForWrite(raw) {
        if (!raw) return null;
        if (typeof raw === 'string') return null;         // already canonical
        if (Array.isArray(raw)) {
            return raw.length ? JSON.stringify(raw.slice(0, 10)) : '';
        }
        return null;                                       // unknown shape — leave alone
    }

    window.ContactFields = {
        parseExperience,
        expTitle,
        expCompany,
        isCurrentPosition,
        getCurrentRole,
        looksLikeTitle,
        looksLikeCompany,
        detectSwap,
        resolveTitle,
        resolveCompany,
        buildCanonicalFields,
        normalizeExperienceForWrite
    };
})();
