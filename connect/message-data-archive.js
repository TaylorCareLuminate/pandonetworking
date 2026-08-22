/**
 * Message Generation Data Archive — shared helper
 *
 * WHY THIS EXISTS
 * When a message is generated (About Me Connect, Post Reply, Internet Search,
 * Profile Message, or Full AI Generate's smart routing across all of those),
 * a lot of research goes into it: the prospect's LinkedIn profile, their recent
 * posts, company/contact news articles, About Me commonalities, and the sending
 * BDR's own About Me statements/instructions. Historically only a trimmed
 * subset of that ever got saved (see connect_queue_ai_context), which meant
 * about_me_message_lookup.html often had to re-scrape LinkedIn live just to
 * show "what did this message key off of?", and Final AI Review only ever saw
 * a truncated slice of the real research.
 *
 * This module saves EVERY bit of that research, in full, to one Firestore
 * collection keyed by the connect_queue message id — then auto-expires it
 * after RETENTION_DAYS (90) via the scheduled cleanupExpiredMessageGenerationData
 * Cloud Function in functions/index.js.
 *
 * IMPORTANT — this is NOT the same store as profile enrichment:
 *   - linkedin_profile_cache / prospect_contacts enrichment fields = the
 *     reusable, PERMANENT enrichment cache. Never touched by this module or
 *     by the 90-day cleanup job. That's "the enrich file."
 *   - message_generation_archive (this collection) = a point-in-time snapshot
 *     of exactly what was used to build ONE specific message. Auto-deleted
 *     after 90 days because it's an audit/lookup trail, not live data.
 *
 * USAGE (any connect page that generates messages or needs to look up
 * archived research)
 *   <script src="../js/clemail-firestore-wrapper.js"></script>
 *   <script src="message-data-archive.js"></script>
 *
 *   await window.MessageDataArchive.save(msgId, {
 *       bdrEmail, bdrName, prospectLinkedInUrl, source, sourceKey, messageText,
 *       profileRaw, profile, posts, news, aboutMeFindings, bdrProfile,
 *       finalReviewContext
 *   });
 *
 *   const archived = await window.MessageDataArchive.load(msgId);
 *   // archived === null when nothing was ever archived for this id, OR it
 *   // aged out past RETENTION_DAYS and was deleted by the cleanup job.
 *
 *   // One well-labeled text block (profile, posts, news, About Me, BDR profile)
 *   // instead of a dozen separate fields — used for {{full_research_data}} in
 *   // Final AI Review (see final_ai_review.html's "Full Research Archive" field).
 *   const text = window.MessageDataArchive.formatForReview(archived);
 */
(function () {
    'use strict';

    const COLLECTION      = 'message_generation_archive';
    const RETENTION_DAYS  = 90;
    const MS_PER_DAY      = 86400000;

    function requireDb() {
        if (!window.clemailDb) {
            throw new Error('clemail-firestore-wrapper.js is not loaded — cannot reach the message generation archive');
        }
        return window.clemailDb;
    }

    function stripUndefined(obj) {
        Object.keys(obj).forEach(k => {
            if (obj[k] === undefined) delete obj[k];
        });
        return obj;
    }

    /**
     * Saves (or merges into) the full research archive for one generated
     * message. Safe to call more than once for the same msgId (e.g. once at
     * generation time, once after Final AI Review runs and adds its context) —
     * later calls merge in rather than overwrite.
     *
     * Never throws — archiving failures are logged but must never block message
     * generation, exactly like the connect_queue_ai_context side-doc it extends.
     */
    async function save(msgId, fields) {
        if (!msgId) return;
        fields = fields || {};
        const db = requireDb();
        const nowMs = Date.now();
        const expiresAtMs = nowMs + RETENTION_DAYS * MS_PER_DAY;

        const payload = stripUndefined({
            id:      msgId,
            queueId: msgId,
            ...fields,
            archivedAt:         new Date(nowMs).toISOString(),
            lastArchivedAt:     new Date(nowMs).toISOString(),
            expiresAt:          new Date(expiresAtMs).toISOString(),
            expiresAtMs:        expiresAtMs,
            retentionPolicyDays: RETENTION_DAYS,
            dataNote: 'Point-in-time research snapshot used to build this message. ' +
                      'Auto-deleted 90 days after archivedAt. Profile enrichment ' +
                      '(linkedin_profile_cache / prospect_contacts) is stored separately and is NOT deleted.'
        });

        try {
            await db.collection(COLLECTION).doc(msgId).set(payload, { merge: true });
        } catch (e) {
            console.warn(`[MessageDataArchive] Failed to save archive for ${msgId}:`, e.message);
        }
    }

    /** Loads the full archive for one message id, or null if none exists (never archived, or aged out). */
    async function load(msgId) {
        if (!msgId) return null;
        const db = requireDb();
        try {
            const snap = await db.collection(COLLECTION).doc(msgId).get();
            const exists = snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists);
            if (!exists) return null;
            return snap.data() || null;
        } catch (e) {
            console.warn(`[MessageDataArchive] Failed to load archive for ${msgId}:`, e.message);
            return null;
        }
    }

    /**
     * Turns a research bundle (either a loaded archive doc, or the same-shaped
     * object built at generation time before it's even saved) into ONE clearly
     * labeled, human-readable text block — instead of scattering profile/posts/
     * news/About Me/BDR data across a dozen separate {{variable}} placeholders.
     *
     * Used for the {{full_research_data}} template variable and as the "Full
     * Research Archive" context field option in Final AI Review — see
     * final_ai_review.html. Accepts the same field names as save(): profile,
     * profileRaw, posts, post, news, aboutMeFindings, bdrProfile, bdrEmail, bdrName.
     *
     * profileRaw (the unprocessed Apify scrape) is intentionally left out of
     * this text — it's noisy JSON meant for human debugging in
     * about_me_message_lookup.html, not for feeding to a review model.
     */
    function formatForReview(bundle) {
        bundle = bundle || {};
        const { profile, posts, post, news, aboutMeFindings, bdrProfile, bdrEmail, bdrName } = bundle;
        const sections = [];

        if (profile && (profile.headline || profile.about || profile.experienceParagraph || profile.educationParagraph)) {
            const lines = ['=== PROSPECT LINKEDIN PROFILE ==='];
            if (profile.name)                lines.push(`Name: ${profile.name}`);
            if (profile.headline)            lines.push(`Headline: ${profile.headline}`);
            if (profile.currentTitle)        lines.push(`Title: ${profile.currentTitle}`);
            if (profile.currentCompany)      lines.push(`Company: ${profile.currentCompany}`);
            if (profile.location)            lines.push(`Location: ${profile.location}`);
            if (profile.about)               lines.push(`About:\n${profile.about}`);
            if (profile.experienceParagraph) lines.push(`Experience:\n${profile.experienceParagraph}`);
            if (profile.educationParagraph)  lines.push(`Education:\n${profile.educationParagraph}`);
            sections.push(lines.join('\n'));
        }

        if (Array.isArray(posts) && posts.length) {
            const lines = [`=== PROSPECT'S RECENT LINKEDIN POSTS (${posts.length}) ===`];
            posts.forEach((p, i) => {
                lines.push(`--- Post ${p.index != null ? p.index : i + 1}${p.date ? ` (${p.date})` : ''} ---`);
                lines.push(p.text || '(no text)');
            });
            sections.push(lines.join('\n'));
        }

        if (post && (post.text || post.url)) {
            const lines = ['=== SPECIFIC LINKEDIN POST THIS MESSAGE REPLIES TO ==='];
            if (post.type && post.type !== 'regular') lines.push(`Type: ${post.type}`);
            if (post.date) lines.push(`Date: ${post.date}`);
            if (post.url)  lines.push(`URL: ${post.url}`);
            lines.push(post.resharedText || post.text || '');
            const resharedAuthor = [post.resharedAuthorFirstName, post.resharedAuthorLastName].filter(Boolean).join(' ');
            if (resharedAuthor) lines.push(`Original post author (reshared/quoted): ${resharedAuthor}`);
            sections.push(lines.join('\n'));
        }

        const newsData = news?.newsData || (news && (news.headline || news.content) ? news : null);
        if (newsData && (newsData.headline || newsData.content)) {
            const lines = ['=== NEWS ARTICLE THIS MESSAGE IS BASED ON ==='];
            if (newsData.headline) lines.push(`Headline: ${newsData.headline}`);
            if (newsData.url)      lines.push(`URL: ${newsData.url}`);
            if (newsData.date)     lines.push(`Date: ${newsData.date}`);
            if (newsData.content)  lines.push(`Article text:\n${newsData.content}`);
            sections.push(lines.join('\n'));
        }
        if (news?.aiCompanyNews || news?.aiContactNews) {
            const lines = ['=== AI-SUMMARIZED NEWS HEADLINES ==='];
            if (news.aiCompanyNews) lines.push(`Company news: ${news.aiCompanyNews}`);
            if (news.aiContactNews) lines.push(`Contact news: ${news.aiContactNews}`);
            sections.push(lines.join('\n'));
        }

        if (aboutMeFindings && Object.keys(aboutMeFindings).length) {
            const f = aboutMeFindings;
            const lines = ['=== ABOUT ME CONNECT — COMMONALITY FINDINGS ==='];
            if (f.bestCommonality)   lines.push(`Top match used in message: ${f.bestCommonality}${f.bestType ? ` (${f.bestType})` : ''}`);
            if (f.secondCommonality) lines.push(`Runner-up: ${f.secondCommonality}`);
            if (f.bdrReference)      lines.push(`BDR's own statement referenced: ${f.bdrReference}`);
            if (f.prospectReference) lines.push(`Prospect's hook referenced: ${f.prospectReference}`);
            if (Array.isArray(f.commonalities) && f.commonalities.length) {
                lines.push('All commonalities found (ranked):');
                f.commonalities.forEach((c, i) => {
                    const text = typeof c === 'string' ? c : (c.text || c.commonality || JSON.stringify(c));
                    lines.push(`  ${i + 1}. ${text}`);
                });
            }
            if (f.findings) lines.push(`Full AI analysis:\n${f.findings}`);
            sections.push(lines.join('\n'));
        }

        if (bdrProfile && Object.keys(bdrProfile).length) {
            const sc = bdrProfile.bdrSalesConfig        || {};
            const ai = bdrProfile.aboutMeAiInstructions || {};
            const lines = ['=== SENDER (BDR) BACKGROUND & AI INSTRUCTIONS ==='];
            if (bdrName)  lines.push(`BDR name: ${bdrName}`);
            if (bdrEmail) lines.push(`BDR email: ${bdrEmail}`);
            if (sc.companyValueProposition)     lines.push(`Company value proposition: ${sc.companyValueProposition}`);
            if (sc.companySalesApproach)        lines.push(`Sales approach: ${sc.companySalesApproach}`);
            if (sc.targetProspectContacts)      lines.push(`Target prospect roles: ${sc.targetProspectContacts}`);
            if (sc.targetProspectOrganizations) lines.push(`Target organizations: ${sc.targetProspectOrganizations}`);
            if (sc.newsStoryTypes)              lines.push(`News story types used: ${sc.newsStoryTypes}`);
            if (sc.otherOutreachNotes)          lines.push(`Outreach notes: ${sc.otherOutreachNotes}`);
            if (ai.tone)                lines.push(`Message tone guidance: ${ai.tone}`);
            if (ai.commonalityPriority) lines.push(`Commonality priority: ${ai.commonalityPriority}`);
            if (ai.length)              lines.push(`Message length guidance: ${ai.length}`);
            if (ai.avoid)               lines.push(`Things to avoid: ${ai.avoid}`);
            if (ai.openClose)           lines.push(`Opening/closing style: ${ai.openClose}`);
            if (ai.additional)          lines.push(`Additional instructions: ${ai.additional}`);
            const stmts = bdrProfile.statements || {};
            for (const [topic, arr] of Object.entries(stmts)) {
                const topicStmts = (Array.isArray(arr) ? arr : []).map(s => typeof s === 'string' ? s : (s?.text || '')).filter(Boolean);
                if (topicStmts.length) lines.push(`BDR "I" statements [${topic}]: ${topicStmts.join(' | ')}`);
            }
            const weStmts = (bdrProfile.weStatements || []).map(s => typeof s === 'string' ? s : (s?.text || '')).filter(Boolean);
            if (weStmts.length) lines.push(`Company "We" statements: ${weStmts.join(' | ')}`);
            sections.push(lines.join('\n'));
        }

        return sections.length ? sections.join('\n\n') : '(no archived research data available for this message)';
    }

    function isExpired(data) {
        if (!data) return true;
        const exp = data.expiresAtMs || (data.expiresAt ? new Date(data.expiresAt).getTime() : null);
        return exp != null && exp <= Date.now();
    }

    function daysUntilExpiry(data) {
        if (!data) return null;
        const exp = data.expiresAtMs || (data.expiresAt ? new Date(data.expiresAt).getTime() : null);
        if (exp == null) return null;
        return Math.round((exp - Date.now()) / MS_PER_DAY);
    }

    window.MessageDataArchive = { COLLECTION, RETENTION_DAYS, save, load, isExpired, daysUntilExpiry, formatForReview };
})();
