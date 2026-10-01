/**
 * variation-performance.js
 *
 * "Auto-optimize by performance" Message Variation mode, shared by full_pipeline.html and
 * generate_messages.html (exposed as window.VariationPerformance).
 *
 * How the split is decided
 * ────────────────────────
 *  1. LEARNING — every variation is guaranteed MIN_SAMPLE (100) messages before it is judged.
 *     "Messages" = connect_queue docs of the hypothesis group stamped with that variation that
 *     were sent to HeyReach, plus ones already generated and waiting to be sent (so a new batch
 *     isn't over-assigned to a variation just because earlier ones haven't gone out yet), plus
 *     messages assigned earlier in the current run.
 *     Variations still under 100 each get an equal share (1 / number of active variations).
 *     If every variation is under 100 (e.g. a brand-new group), that is simply an even split.
 *
 *  2. OPTIMIZING — once a variation has 100, it competes for whatever share is left
 *     (100% minus the equal shares held by variations still learning). That remainder is split
 *     in proportion to each variation's weighted success per message sent:
 *
 *         score = (0.50 × meetings + 0.35 × replies + 0.15 × connections accepted) / messages sent
 *
 *     e.g. if one variation holds 80% of the combined score, it receives 80% of the remainder.
 *     (Per message sent rather than raw totals, so a variation isn't rewarded merely for having
 *     been sent more.) If nobody has any successes yet, the remainder is split evenly.
 *
 * Outcome data uses the same sources and matching as outcomes.html: connections accepted from
 * heyreach_activity, replies from heyreach_inbox, meetings from activity_tracking +
 * heyreach_inbox "Scheduled" + conversation_category_overrides.
 */
(function () {
    'use strict';

    const WEIGHTS = { meetings: 0.5, replies: 0.35, connections: 0.15 };
    const MIN_SAMPLE = 100;       // messages each variation gets before it is judged on results
    const MIN_SHARE = 0;          // optional floor (0–1) for an established variation; 0 = pure proportional
    const CACHE_TTL_MS = 15 * 60 * 1000;
    const PENDING_STATUSES = new Set(['pending_admin_review', 'pending_customer_review', 'approved']);

    const statsCache = new Map(); // groupId -> { at, stats }

    // ── helpers (same URL matching rules as outcomes.html) ──────────────
    function normalizeUrl(url) {
        if (!url) return '';
        return String(url).toLowerCase().trim()
            .replace(/^https?:\/\//i, '').replace(/^www\./i, '')
            .replace(/\/+$/, '').replace(/\?.*$/, '');
    }
    function liSlug(url) {
        if (!url) return null;
        const m = String(url).match(/linkedin\.com\/in\/([^\/\?#]+)/i);
        return m ? m[1].toLowerCase().trim() : null;
    }
    const keyOf = (url) => liSlug(url) || normalizeUrl(url);
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const pct = x => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;

    function chunked(arr, n) {
        const out = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
    }

    // ── data loading ─────────────────────────────────────────────────────
    // Returns { byVariation: Map(id -> {sentKeys:Set, pendingKeys:Set, accepted, replied, scheduled}),
    //           issues: string[] }. Never throws — anything that fails is reported in `issues`
    // and the affected outcome simply counts as zero.
    async function loadStats(group, { forceRefresh = false, log } = {}) {
        const cached = statsCache.get(group.id);
        if (!forceRefresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.stats;

        const fs = window.clemailFirestore;
        const db = window.clemailDb;
        const { collection, getDocs, query, where, orderBy } = fs;
        const issues = [];
        const say = (m) => { try { log && log(m, 'dim'); } catch (_) { /* ignore */ } };

        const byVariation = new Map();
        const ensure = (id) => {
            if (!byVariation.has(id)) byVariation.set(id, { sentKeys: new Set(), pendingKeys: new Set(), accepted: 0, replied: 0, scheduled: 0 });
            return byVariation.get(id);
        };

        // 1. This group's connect_queue docs → sent / pending per variation + contact → variation map
        const keyToVariation = new Map();
        const emails = new Set();
        try {
            const snap = await getDocs(query(collection(db, 'connect_queue'), where('hypothesisGroupId', '==', group.id)));
            snap.forEach(d => {
                const m = d.data();
                if (m.account_email) { emails.add(m.account_email); emails.add(String(m.account_email).toLowerCase()); }
                if (m.bdr_auth_email) { emails.add(m.bdr_auth_email); emails.add(String(m.bdr_auth_email).toLowerCase()); }
                const vId = m.hypothesisVariationId;
                if (!vId) return;
                const key = keyOf(m.prospect_li_url || m.contact_linkedin_url || m.linkedin_url || '') || `doc:${d.id}`;
                const v = ensure(vId);
                if (m.pushed_to_heyreach) {
                    v.sentKeys.add(key);
                    v.pendingKeys.delete(key);
                    keyToVariation.set(key, vId);
                } else if (PENDING_STATUSES.has(m.reviewStatus) && !v.sentKeys.has(key)) {
                    v.pendingKeys.add(key);
                }
            });
        } catch (e) {
            issues.push(`connect_queue load failed: ${e.message || e}`);
        }

        // 2. Outcomes for those contacts — only worth loading if anything has been sent
        if (keyToVariation.size && emails.size) {
            const emailArr = [...emails];
            const emailChunks = chunked(emailArr, 30);
            const emailSetLower = new Set(emailArr.map(e => e.toLowerCase()));
            const credit = (set, field, seen) => {
                set.forEach(k => {
                    const vId = keyToVariation.get(k);
                    if (!vId || seen.has(k)) return;
                    seen.add(k);
                    ensure(vId)[field]++;
                });
            };

            // 2a. Connections accepted (heyreach_activity, by the BDRs' HeyReach account IDs)
            const acceptedKeys = new Set();
            try {
                const ids = [];
                const acctSnap = await getDocs(collection(db, 'linkedin_accounts'));
                acctSnap.forEach(d => {
                    const a = d.data();
                    if (a.heyreachAccountId && a.bdrEmail && emailSetLower.has(String(a.bdrEmail).toLowerCase())) {
                        const n = parseInt(a.heyreachAccountId, 10);
                        if (!isNaN(n)) ids.push(n);
                        ids.push(String(a.heyreachAccountId));
                    }
                });
                const uniqIds = [...new Set(ids)];
                if (!uniqIds.length) {
                    issues.push('no HeyReach account IDs resolved for this group\'s BDRs — accepted connections not counted');
                } else {
                    const snaps = await Promise.all(chunked(uniqIds, 30).map(chunk => getDocs(query(
                        collection(db, 'heyreach_activity'),
                        where('eventType', '==', 'CONNECTION_REQUEST_ACCEPTED'),
                        where('linkedInAccountId', 'in', chunk),
                        orderBy('timestamp', 'desc')
                    )).catch(e => { issues.push(`accepted-connection batch failed: ${e.message || e}`); return null; })));
                    snaps.forEach(s => s && s.forEach(d => {
                        const k = keyOf(d.data().leadProfileUrl || '');
                        if (k) acceptedKeys.add(k);
                    }));
                }
            } catch (e) { issues.push(`accepted connections load failed: ${e.message || e}`); }

            // 2b. Replies + inbox-"Scheduled" conversations (heyreach_inbox)
            const repliedKeys = new Set();
            const scheduledKeys = new Set();
            const inboxConvs = []; // { id, key, category }
            const convIdToKey = new Map();
            try {
                const seenConv = new Set();
                const promises = [];
                for (const field of ['accountEmail', 'bdrEmail', 'linkedInAccountEmail', 'uploadedByEmail']) {
                    for (const chunk of emailChunks) {
                        promises.push(getDocs(query(collection(db, 'heyreach_inbox'), where(field, 'in', chunk)))
                            .catch(e => { issues.push(`inbox query (${field}) failed: ${e.message || e}`); return null; }));
                    }
                }
                const snaps = await Promise.all(promises);
                snaps.forEach(s => s && s.forEach(d => {
                    const data = d.data();
                    const convId = data.conversationId || d.id;
                    if (seenConv.has(convId)) return;
                    seenConv.add(convId);
                    const key = keyOf(data.leadProfileUrl || data.rawData?.correspondentProfile?.profileUrl || '');
                    const messages = data.rawData?.messages || [];
                    const hasLeadReply = messages.some(m => m.sender === 'CORRESPONDENT' || m.sender === 'lead');
                    if (key) {
                        convIdToKey.set(convId, key);
                        if (hasLeadReply) repliedKeys.add(key);
                        if (data.responseCategory === 'Scheduled') scheduledKeys.add(key);
                    }
                    inboxConvs.push({ key, category: data.responseCategory || '' });
                }));
            } catch (e) { issues.push(`inbox replies load failed: ${e.message || e}`); }

            // 2c. Meetings — activity_tracking + conversation_category_overrides
            try {
                const trackingKeys = new Set();
                for (const chunk of emailChunks) {
                    const s = await getDocs(query(collection(db, 'activity_tracking'),
                        where('activity_type', '==', 'meeting_scheduled'), where('bdr_email', 'in', chunk)))
                        .catch(e => { issues.push(`activity_tracking batch failed: ${e.message || e}`); return null; });
                    if (s) s.forEach(d => { const k = keyOf(d.data().contact_linkedin_url || ''); if (k) trackingKeys.add(k); });
                }
                for (const chunk of emailChunks) {
                    const s = await getDocs(query(collection(db, 'conversation_category_overrides'),
                        where('bdrEmail', 'in', chunk), where('responseCategory', '==', 'Scheduled')))
                        .catch(e => { issues.push(`category overrides batch failed: ${e.message || e}`); return null; });
                    if (!s) continue;
                    s.forEach(d => {
                        const data = d.data();
                        let k = convIdToKey.get(d.id) || (data.conversationId && convIdToKey.get(data.conversationId));
                        if (!k) {
                            const raw = d.id.startsWith('webhook_') ? d.id : (data.conversationId || '');
                            if (raw.startsWith('webhook_')) {
                                let rest = raw.slice('webhook_'.length);
                                const us = rest.lastIndexOf('_');
                                if (us > -1 && rest.slice(us + 1).includes('@')) rest = rest.slice(0, us);
                                if (rest) k = rest.toLowerCase();
                            }
                        }
                        if (k) scheduledKeys.add(k);
                    });
                }
                // activity_tracking is append-only: drop a meeting if the contact's inbox
                // conversations now show a non-Scheduled category and none show Scheduled
                // (same correction outcomes.html applies).
                const currentlyScheduled = new Set(inboxConvs.filter(c => c.key && c.category === 'Scheduled').map(c => c.key));
                const recategorized = new Set(inboxConvs.filter(c => c.key && c.category && c.category !== 'Scheduled' && !currentlyScheduled.has(c.key)).map(c => c.key));
                trackingKeys.forEach(k => { if (!recategorized.has(k)) scheduledKeys.add(k); });
            } catch (e) { issues.push(`scheduled meetings load failed: ${e.message || e}`); }

            credit(acceptedKeys, 'accepted', new Set());
            credit(repliedKeys, 'replied', new Set());
            credit(scheduledKeys, 'scheduled', new Set());
        }

        if (issues.length) say(`   ⚠️ Variation performance: ${issues.length} data issue(s) — ${issues.slice(0, 3).join(' | ')}`);
        const stats = { byVariation, issues, loadedAt: Date.now() };
        if (!issues.length) statsCache.set(group.id, { at: Date.now(), stats });
        return stats;
    }

    // ── allocation (pure) ────────────────────────────────────────────────
    // variations: active variations of the group. extra: Map(id -> messages assigned so far this run).
    function allocate(variations, stats, extra) {
        const n = variations.length;
        const rows = variations.map(v => {
            const s = stats?.byVariation?.get(v.id);
            const sent = s ? s.sentKeys.size : 0;
            const pending = s ? s.pendingKeys.size : 0;
            const inRun = extra?.get(v.id) || 0;
            const accepted = s?.accepted || 0, replied = s?.replied || 0, scheduled = s?.scheduled || 0;
            const weighted = WEIGHTS.meetings * scheduled + WEIGHTS.replies * replied + WEIGHTS.connections * accepted;
            const committed = sent + pending + inRun;
            return {
                id: v.id, label: v.label || v.id, color: v.color,
                sent, pending, inRun, committed, accepted, replied, scheduled,
                score: sent > 0 ? weighted / sent : 0,
                learning: committed < MIN_SAMPLE,
                share: 0
            };
        });
        if (!n) return { phase: 'none', rows };

        const learning = rows.filter(r => r.learning);
        const established = rows.filter(r => !r.learning);
        const equal = 1 / n;
        learning.forEach(r => { r.share = equal; });

        if (established.length) {
            const remainder = 1 - learning.length * equal;
            const total = established.reduce((s, r) => s + r.score, 0);
            established.forEach(r => { r.share = total > 0 ? remainder * (r.score / total) : remainder / established.length; });
            if (MIN_SHARE > 0 && total > 0) {
                // lift anyone below the floor, taking the difference proportionally from the rest
                const floor = MIN_SHARE * remainder;
                const low = established.filter(r => r.share < floor);
                const high = established.filter(r => r.share >= floor);
                if (low.length && high.length) {
                    const need = low.reduce((s, r) => s + (floor - r.share), 0);
                    const highSum = high.reduce((s, r) => s + r.share, 0);
                    low.forEach(r => { r.share = floor; });
                    high.forEach(r => { r.share -= need * (r.share / highSum); });
                }
            }
        }
        const phase = !established.length ? 'learning' : learning.length ? 'mixed' : 'optimizing';
        return { phase, rows };
    }

    function weightedPick(allocation, variations) {
        const rows = allocation.rows;
        let r = Math.random() * rows.reduce((s, x) => s + x.share, 0);
        for (let i = 0; i < rows.length; i++) {
            r -= rows[i].share;
            if (r <= 0) return variations.find(v => v.id === rows[i].id) || variations[i];
        }
        return variations[variations.length - 1];
    }

    // ── public: picker for one run ───────────────────────────────────────
    async function createPicker(group, variations, opts = {}) {
        let stats;
        try { stats = await loadStats(group, opts); }
        catch (e) { stats = { byVariation: new Map(), issues: [String(e.message || e)] }; }
        const extra = new Map();
        return {
            stats,
            allocation() { return allocate(variations, stats, extra); },
            pick() {
                if (!variations.length) return null;
                const v = weightedPick(allocate(variations, stats, extra), variations);
                extra.set(v.id, (extra.get(v.id) || 0) + 1);
                return v;
            }
        };
    }

    // ── public: human-readable output ────────────────────────────────────
    function describe(allocation) {
        const phase = { learning: 'learning phase — even split', mixed: 'new variations get an equal share; the rest follows performance', optimizing: 'weighted by performance', none: '' }[allocation.phase] || '';
        const lines = allocation.rows.map(r => r.learning
            ? `   • ${r.label}: ${pct(r.share)} — learning (${r.committed}/${MIN_SAMPLE} messages)`
            : `   • ${r.label}: ${pct(r.share)} — ${r.sent} sent, ${r.accepted} accepted, ${r.replied} replied, ${r.scheduled} meetings`);
        return { phase, lines };
    }

    function renderTable(allocation, issues) {
        const th = 'padding:4px 8px;text-align:right;border-bottom:1px solid #e5e7eb;font-weight:600;';
        const td = 'padding:4px 8px;text-align:right;';
        const body = allocation.rows.map(r => `<tr>
            <td style="padding:4px 8px;text-align:left;">${esc(r.label)}</td>
            <td style="${td}">${r.sent}${r.pending ? ` <span style="color:#9ca3af;">(+${r.pending} queued)</span>` : ''}</td>
            <td style="${td}">${r.accepted}</td><td style="${td}">${r.replied}</td><td style="${td}">${r.scheduled}</td>
            <td style="${td}">${r.learning ? '—' : r.score.toFixed(3)}</td>
            <td style="${td}font-weight:700;">${pct(r.share)}</td>
            <td style="padding:4px 8px;text-align:left;color:${r.learning ? '#b45309' : '#047857'};">${r.learning ? `Learning ${r.committed}/${MIN_SAMPLE}` : 'Optimizing'}</td>
        </tr>`).join('');
        return `<table style="border-collapse:collapse;font-size:12px;margin-top:6px;">
            <thead><tr><th style="${th}text-align:left;">Variation</th><th style="${th}">Sent</th><th style="${th}">Accepted</th><th style="${th}">Replied</th><th style="${th}">Meetings</th><th style="${th}" title="(0.5×meetings + 0.35×replies + 0.15×accepted) ÷ sent">Score / msg</th><th style="${th}">Share</th><th style="${th}text-align:left;">Status</th></tr></thead>
            <tbody>${body}</tbody></table>
            ${issues && issues.length ? `<div style="color:#b45309;font-size:11px;margin-top:4px;">⚠️ Some data could not be loaded (${esc(issues[0])}) — numbers may be understated.</div>` : ''}`;
    }

    // Fills `el` with the current split for a group (used by each page's "Show current split" button).
    async function showSplit(group, el, { forceRefresh = true } = {}) {
        if (!el) return;
        const variations = (group?.messageVariations || []).filter(v => !v.inactive);
        if (variations.length < 2) { el.innerHTML = ''; return; }
        el.innerHTML = '<span style="font-size:12px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading variation results…</span>';
        const picker = await createPicker(group, variations, { forceRefresh });
        const alloc = picker.allocation();
        el.innerHTML = renderTable(alloc, picker.stats.issues);
    }

    window.VariationPerformance = { WEIGHTS, MIN_SAMPLE, loadStats, allocate, createPicker, describe, renderTable, showSplit };
})();
