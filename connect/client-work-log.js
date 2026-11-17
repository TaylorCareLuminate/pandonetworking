/**
 * Client Work Log  (client-work-log.js)
 * ---------------------------------------------------------------------------
 * Tiny, fire-and-forget helper that records "work we did for a client" as one
 * Firestore document per notable action, in the `client_work_log` collection.
 *
 * Why this exists: most of the work done in Fast Connect Review, Generate
 * Messages, Full Pipeline and Manage Data leaves no durable record of the
 * *run itself* (e.g. an Opus/Final-AI review result, a batch submit summary, a
 * pipeline run finishing, a CSV import).  The weekly client report built on
 * export_outreach_history.html reads this collection so that work shows up in
 * the report.
 *
 * Usage (never throws, never blocks the caller):
 *
 *   window.ClientWorkLog?.log({
 *       page:     'fast_connect_review',          // which page did it
 *       category: 'review',                       // generation | review | pipeline | data_management
 *       action:   'batch_submitted',              // short snake_case action name
 *       summary:  'Submitted 40 messages …',      // one human-readable sentence
 *       bdrEmail: 'jane@client.com',              // who the work was FOR (used to attribute to a client)
 *       hypothesisGroupId / hypothesisGroupName,  // optional, also used for attribution
 *       runId / batchId,                          // optional correlation ids
 *       counts:   { approved: 30, deleted: 10 },  // optional numeric tallies
 *       detail:   { ... }                         // optional small extra context
 *   });
 *
 * The Railway CLemail API stamps `createdAt` and `createdBy` on every document
 * server-side, so those two fields cannot be spoofed from the browser.
 *
 * Collection: client_work_log    (schemaVersion 1)
 */
(function () {
    'use strict';
    if (window.ClientWorkLog) return;

    var COLLECTION = 'client_work_log';
    var SCHEMA_VERSION = 1;
    var MAX_STR = 1500;
    var MAX_ARR = 40;

    function actorEmail() {
        try {
            var u = (window.auth && window.auth.currentUser) ||
                    (window.getCurrentAuthState && window.getCurrentAuthState() && window.getCurrentAuthState().user) ||
                    (window.auth && window.auth._cachedCurrentUser) || null;
            return (u && u.email) ? String(u.email).toLowerCase() : '';
        } catch (e) { return ''; }
    }

    // Strip undefined/functions/DOM nodes, trim long strings, cap arrays + depth so a
    // log write can never be huge or fail serialization.
    function clean(v, depth) {
        depth = depth || 0;
        if (v === null || v === undefined) return null;
        var t = typeof v;
        if (t === 'string') return v.length > MAX_STR ? v.slice(0, MAX_STR) + '…' : v;
        if (t === 'number') return isFinite(v) ? v : null;
        if (t === 'boolean') return v;
        if (v instanceof Date) return v.toISOString();
        if (t === 'function' || t === 'symbol') return null;
        if (depth >= 3) return null;
        if (Array.isArray(v)) return v.slice(0, MAX_ARR).map(function (x) { return clean(x, depth + 1); });
        if (t === 'object') {
            if (typeof v.nodeType === 'number') return null; // DOM node
            var out = {};
            Object.keys(v).slice(0, 60).forEach(function (k) {
                var c = clean(v[k], depth + 1);
                if (c !== undefined) out[k] = c;
            });
            return out;
        }
        return null;
    }

    function lower(s) { return s ? String(s).toLowerCase() : ''; }

    function log(entry) {
        try {
            if (!entry || !entry.action) return Promise.resolve(null);
            var fs = window.clemailFirestore;
            var db = window.clemailDb;
            if (!fs || !db || typeof fs.addDoc !== 'function') return Promise.resolve(null);

            var now = new Date();
            var payload = {
                schemaVersion: SCHEMA_VERSION,
                page: entry.page || '',
                category: entry.category || '',
                action: entry.action,
                summary: entry.summary ? String(entry.summary).slice(0, 600) : '',
                actor: lower(entry.actor) || actorEmail(),
                bdrEmail: lower(entry.bdrEmail),
                bdrName: entry.bdrName || '',
                clientCompany: entry.clientCompany || '',
                customerId: entry.customerId || '',
                hypothesisGroupId: entry.hypothesisGroupId || '',
                hypothesisGroupName: entry.hypothesisGroupName || '',
                runId: entry.runId || '',
                batchId: entry.batchId || '',
                counts: clean(entry.counts) || {},
                detail: clean(entry.detail) || {},
                occurredAt: now.toISOString(),
                occurredAtMs: now.getTime()
            };
            return fs.addDoc(fs.collection(db, COLLECTION), payload).then(function (ref) {
                return ref || null;
            }).catch(function (err) {
                console.warn('[ClientWorkLog] write failed (non-fatal):', err && err.message ? err.message : err);
                return null;
            });
        } catch (e) {
            console.warn('[ClientWorkLog] failed (non-fatal):', e && e.message ? e.message : e);
            return Promise.resolve(null);
        }
    }

    window.ClientWorkLog = { log: log, COLLECTION: COLLECTION, SCHEMA_VERSION: SCHEMA_VERSION };
})();
