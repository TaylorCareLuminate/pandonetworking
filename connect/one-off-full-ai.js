/**
 * One-Off Full AI  (reusable)
 * ---------------------------------------------------------------------------------------------
 * Runs the real "Full AI Generate" pipeline (generate_messages.html -> Railway) as a ONE-OFF for a
 * TEMPORARY leader and TEMPORARY hypothesis group. Nothing is saved to Firestore.
 *
 *   1. Leader  : LinkedIn URL -> About Me (I / We statements) built automatically, exactly like
 *                about_me.html "Generate AI Suggestions", plus a plain "what we do" summary.
 *   2. Prospect: LinkedIn URL -> profile scrape + a temporary hypothesis group for
 *                (company + prospect).
 *   3. Message : the Full AI pipeline (Post Reply / About Me Connect / Internet Search) writes the
 *                personalization; one short "what we do" sentence (~100 chars) is then appended.
 *                Soft and interesting, never a pitch.
 *
 * Needs on the page: window.auth (Firebase auth from ../js/auth.js) so a token can be sent to Railway.
 * Backend: RailwayCLemail  /api/connect/one-off/*  (see services/one_off_outreach_service.js).
 *
 * ---- Headless API -------------------------------------------------------------------------
 *   const leader  = await OneOffFullAi.buildLeader({ linkedInUrl, name?, companyName, companyWebsite, companyBlurb?, onLog? });
 *   const result  = await OneOffFullAi.generateForProspect({ leader, linkedInUrl, onLog? });
 *   const results = await OneOffFullAi.run({ leader, prospectUrls, onProgress?, onResult?, onLog? });
 *   result = { ok, linkedInUrl, error?, skipped?, skipReason?, source, prospect:{name,title,company},
 *              hypothesis, composed:[{message, original, chars, overLimit, fromProfile}], best,
 *              candidates, recentPosts, logs }
 *
 * ---- Drop-in widget ---------------------------------------------------------------------------
 *   OneOffFullAi.mount('#container', {
 *     companyName:    () => document.getElementById('org').value,     // string or function
 *     companyWebsite: () => document.getElementById('site').value,
 *     prospectCount:  3,
 *     maxChars:       275,
 *     useTargets:     [{ id: 'post', label: 'Post Reply' }, ...],      // optional "use as ..." menu
 *     onUse:          ({ message, targetId, result }) => { ... },      // called by "Use in report"
 *     onResults:      (results) => { ... }
 *   });                                  // returns { getState, setState, getLeader, getResults, destroy }
 *   // Save with a host page's own data:  saved.liveExample = widget.getState();
 *   // Restore later:                     widget.setState(saved.liveExample);
 *
 * ---- Proposal page ------------------------------------------------------------------------
 *   var page = OneOffFullAi.renderShowcase(widget.getResults(), { companyName, leader: widget.getLeader() });
 *   // page.title = "Three Examples of Outreach to <Company> Prospects"; page.body = print-ready HTML
 */
(function (global) {
    'use strict';

    var MAIN_API = 'https://railwayclemail-production.up.railway.app';
    var HEAVY_API = 'https://heavy-api-production.up.railway.app';
    var DEFAULT_MAX_CHARS = 275;
    var STATEMENT_LABELS = {
        background: 'Background & upbringing',
        education: 'College / schooling',
        pastExperience: 'Past experience',
        industryViewpoints: 'Industry viewpoints',
        industryConcerns: 'Industry concerns',
        passion: 'Passion',
        otherInsights: 'Other insights'
    };
    var heavyBadUntil = 0;

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Utilities
    // ───────────────────────────────────────────────────────────────────────────────────────
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function resolveValue(v) { try { return typeof v === 'function' ? v() : v; } catch (_) { return ''; } }
    function makeTempEmail() {
        var rnd = Math.random().toString(16).slice(2, 14).padEnd(12, '0');
        return 'oneoff-' + rnd + '@oneoff.invalid';
    }

    function normalizeLinkedInUrl(raw) {
        var s = String(raw || '').trim();
        if (!s) return { ok: false, error: 'Enter a LinkedIn profile URL.' };
        if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
        var m = s.match(/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^\/?#\s]+)/i);
        if (!m) return { ok: false, error: 'That does not look like a LinkedIn profile URL (linkedin.com/in/...).' };
        var slug = m[1];
        if (/^ACo/i.test(slug)) return { ok: false, error: 'Use the public profile URL (linkedin.com/in/firstname-lastname), not the encoded one.' };
        return { ok: true, url: 'https://www.linkedin.com/in/' + slug.replace(/\/+$/, '') + '/', slug: slug };
    }

    // "jane-doe-1a2b3c4" -> "Jane Doe"
    function nameFromLinkedInUrl(url) {
        var n = normalizeLinkedInUrl(url);
        if (!n.ok) return '';
        var parts = decodeURIComponent(n.slug).split('-').filter(Boolean);
        while (parts.length > 1 && /\d/.test(parts[parts.length - 1])) parts.pop();
        return parts.map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
    }

    async function getToken(force) {
        var user = global.auth && global.auth.currentUser;
        if (!user) throw new Error('You are not signed in. Sign in and try again.');
        return user.getIdToken(!!force);
    }

    // POST to Railway. Heavy API first (falls back to the main API if unreachable, same as
    // generate_messages.html), one token refresh on 401, brief retries on Railway restarts.
    async function post(path, body, opts) {
        opts = opts || {};
        var label = opts.label || path;
        var onLog = opts.onLog || function () { };
        var retries = opts.retries == null ? 2 : opts.retries;
        var timeoutMs = opts.timeoutMs || 280000;
        var token = await getToken(false);
        var refreshed = false;

        for (var attempt = 0; attempt <= retries; attempt++) {
            var controller = new AbortController();
            var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
            try {
                var init = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify(body),
                    signal: controller.signal
                };
                var res;
                if (opts.heavy && Date.now() >= heavyBadUntil) {
                    var started = Date.now();
                    try { res = await fetch(HEAVY_API + path, init); }
                    catch (err) {
                        if (err && err.name === 'AbortError') throw err;
                        if (Date.now() - started > 5000) throw err;
                        heavyBadUntil = Date.now() + 5 * 60 * 1000;
                        res = await fetch(MAIN_API + path, init);
                    }
                } else {
                    res = await fetch(MAIN_API + path, init);
                }

                if (res.status === 401 && !refreshed) {
                    refreshed = true;
                    token = await getToken(true);
                    attempt--; // free retry with a fresh token
                    continue;
                }
                if ([502, 503, 504].indexOf(res.status) >= 0 && attempt < retries) {
                    onLog(label + ': server busy (HTTP ' + res.status + '), retrying...');
                    await sleep(4000);
                    continue;
                }
                var data = null;
                try { data = await res.json(); } catch (_) { /* non-JSON */ }
                if (res.status === 404 && (!data || !data.error)) {
                    throw new Error(label + ' is not available yet. The Railway backend needs the one-off update deployed.');
                }
                if (!res.ok) throw new Error((data && (data.error || data.message)) || (label + ' failed (HTTP ' + res.status + ')'));
                if (!data) throw new Error(label + ' returned an unreadable response.');
                return data;
            } catch (err) {
                var e = err && err.name === 'AbortError' ? new Error(label + ' timed out after ' + Math.round(timeoutMs / 1000) + 's') : err;
                if (attempt < retries && /network|failed to fetch|load failed/i.test(String(e && e.message))) {
                    onLog(label + ': network error, retrying...');
                    await sleep(4000);
                    continue;
                }
                throw e;
            } finally { clearTimeout(timer); }
        }
        throw new Error(label + ' failed.');
    }

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Headless API
    // ───────────────────────────────────────────────────────────────────────────────────────

    /** Steps 1: build the temporary leader (About Me + "what we do"). */
    async function buildLeader(opts) {
        opts = opts || {};
        var onLog = opts.onLog || function () { };
        var li = normalizeLinkedInUrl(opts.linkedInUrl);
        if (!li.ok) throw new Error(li.error);
        var companyName = String(opts.companyName || '').trim();
        var companyWebsite = String(opts.companyWebsite || '').trim();
        var name = String(opts.name || '').trim() || nameFromLinkedInUrl(li.url) || 'The leader';
        var email = opts.email || makeTempEmail();
        var blurb = String(opts.companyBlurb || '').trim();

        onLog('Researching ' + name + ' (LinkedIn profile, posts, public bio). This takes 1-2 minutes...');
        var aboutP = post('/api/bdr/generate-about-me-statements', {
            bdrEmail: email, bdrName: name, linkedInUrl: li.url, companyName: companyName
        }, { label: 'About Me builder', onLog: onLog, retries: 0, timeoutMs: 300000 });

        var summaryP = (companyName || companyWebsite) && !blurb
            ? post('/api/connect/one-off/company-summary', { companyName: companyName, companyWebsite: companyWebsite, companyBlurb: blurb },
                { label: 'Company summary', onLog: onLog, retries: 1, timeoutMs: 90000 }).catch(function (err) {
                    onLog('Could not auto-summarize the company (' + err.message + '). Type what the company does instead.');
                    return null;
                })
            : Promise.resolve(null);

        var results = await Promise.all([aboutP, summaryP]);
        var about = results[0], summary = results[1];
        if (!about || !about.success) throw new Error((about && about.error) || 'About Me generation failed.');

        var iCount = Object.keys(about.iStatements || {}).reduce(function (n, k) { return n + (about.iStatements[k] || []).length; }, 0);
        var meta = about.metadata || {};
        onLog('Leader profile ready: ' + iCount + ' I statements, ' + (about.weStatements || []).length + ' company statements'
            + (meta.hasProfile ? '' : ' (LinkedIn profile could not be read)') + '.');

        return {
            email: email,
            name: name,
            linkedInUrl: li.url,
            companyName: companyName,
            companyWebsite: companyWebsite,
            companyBlurb: blurb || (summary && summary.summary) || '',
            companyBlurbConfidence: summary && summary.confidence || null,
            statements: about.iStatements || {},
            weStatements: about.weStatements || [],
            aiInstructions: {},
            toneInstructions: '',
            meta: meta
        };
    }

    /** Steps 2-3 for one prospect: scrape + temporary hypothesis group, then Full AI + compose. */
    async function generateForProspect(opts) {
        opts = opts || {};
        var onLog = opts.onLog || function () { };
        var leader = opts.leader;
        if (!leader) throw new Error('Build the leader profile first.');
        var li = normalizeLinkedInUrl(opts.linkedInUrl);
        var out = { ok: false, linkedInUrl: li.ok ? li.url : String(opts.linkedInUrl || ''), logs: [] };
        if (!li.ok) { out.error = li.error; return out; }

        try {
            onLog('Reading the prospect and building a temporary hypothesis group...');
            var prep = await post('/api/connect/one-off/prepare-prospect',
                { leader: leader, prospect: { linkedInUrl: li.url } },
                { heavy: true, label: 'Prospect setup', onLog: onLog, timeoutMs: 200000 });
            (prep.logs || []).forEach(function (l) { out.logs.push(l); });
            if (!prep.success) { out.error = prep.error || 'Could not read this prospect.'; return out; }

            onLog('Running Full AI Generate for ' + [prep.prospect.firstName, prep.prospect.lastName].filter(Boolean).join(' ') + '...');
            var gen = await post('/api/connect/one-off/generate', {
                leader: leader,
                hypothesis: prep.hypothesis,
                prospect: prep.prospect,
                profile: prep.profile,
                routingMode: opts.routingMode || 'smart',
                formality: opts.formality,
                maxChars: opts.maxChars || DEFAULT_MAX_CHARS
            }, { heavy: true, label: 'Full AI Generate', onLog: onLog, timeoutMs: 280000 });
            (gen.logs || []).forEach(function (l) { out.logs.push(l); });
            if (!gen.success) { out.error = gen.error || 'Full AI Generate failed.'; return out; }
            if (gen.skipped) { out.skipped = true; out.skipReason = gen.skipReason; out.error = 'Skipped: ' + (gen.skipReason || 'no usable profile data'); return out; }

            out.ok = true;
            out.source = gen.source;
            // prep.prospect carries the photo / network size; gen.prospect has the refreshed title.
            out.prospect = Object.assign({}, prep.prospect || {}, gen.prospect || {});
            if (!out.prospect.name) out.prospect.name = [out.prospect.firstName, out.prospect.lastName].filter(Boolean).join(' ');
            out.hypothesis = gen.hypothesis;
            out.maxChars = gen.maxChars;
            out.composed = gen.composed || [];
            out.best = gen.best || out.composed[0] || null;
            out.candidates = gen.candidates || [];
            out.recentPosts = gen.recentPosts || [];
            out.findings = gen.findings || null;
            out.explain = gen.explain || null;
            out.generatedAt = new Date().toISOString();
            return out;
        } catch (err) {
            out.error = err && err.message ? err.message : String(err);
            return out;
        }
    }

    /** Runs every prospect URL (sequentially by default). Never throws; failures come back as { ok:false, error }. */
    async function run(opts) {
        opts = opts || {};
        var urls = (opts.prospectUrls || []).map(function (u) { return String(u || '').trim(); }).filter(Boolean);
        var results = new Array(urls.length);
        var concurrency = Math.max(1, Math.min(opts.concurrency || 1, 3));
        var next = 0, done = 0;
        async function worker() {
            while (next < urls.length) {
                var i = next++;
                if (opts.onProgress) opts.onProgress({ index: i, total: urls.length, stage: 'start', url: urls[i] });
                var res = await generateForProspect({
                    leader: opts.leader, linkedInUrl: urls[i], routingMode: opts.routingMode,
                    formality: opts.formality, maxChars: opts.maxChars,
                    onLog: function (m) { if (opts.onLog) opts.onLog(m, i); }
                });
                results[i] = res;
                done++;
                if (opts.onResult) opts.onResult(i, res);
                if (opts.onProgress) opts.onProgress({ index: i, total: urls.length, stage: 'done', url: urls[i], done: done });
            }
        }
        var workers = [];
        for (var w = 0; w < concurrency; w++) workers.push(worker());
        await Promise.all(workers);
        return results;
    }

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Drop-in widget
    // ───────────────────────────────────────────────────────────────────────────────────────
    var STYLE_ID = 'oofa-styles';
    var CSS = '\
.oofa{font-family:var(--sans,Inter,-apple-system,"Segoe UI",sans-serif);color:var(--ink,#1B2430);font-size:.9rem;line-height:1.5}\
.oofa *{box-sizing:border-box}\
.oofa-step{border:1px solid var(--line,#E4E0D6);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:1rem;background:var(--paper,#fff)}\
.oofa-step-hd{display:flex;align-items:center;gap:.6rem;margin-bottom:.8rem;font-weight:700;color:var(--navy,#12314C)}\
.oofa-num{display:inline-flex;align-items:center;justify-content:center;width:1.6rem;height:1.6rem;border-radius:50%;background:var(--navy,#12314C);color:#fff;font-size:.8rem}\
.oofa-step.is-locked{opacity:.55}\
.oofa-grid{display:grid;grid-template-columns:2fr 1fr;gap:.8rem}\
.oofa-grid.three{grid-template-columns:1fr 1fr 1fr}\
@media(max-width:760px){.oofa-grid,.oofa-grid.three{grid-template-columns:1fr}}\
.oofa label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft,#4B5563);margin-bottom:.3rem}\
.oofa input[type=text],.oofa input[type=url],.oofa textarea{width:100%;padding:.55rem .7rem;border:1px solid var(--line-strong,#CFC9BA);border-radius:7px;font:inherit;background:#fff;color:inherit}\
.oofa textarea{resize:vertical;min-height:3.2rem}\
.oofa input:focus,.oofa textarea:focus{outline:2px solid var(--gold,#B9A77E);outline-offset:0}\
.oofa-row{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-top:.8rem}\
.oofa-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1rem;border-radius:7px;border:1px solid var(--navy,#12314C);background:var(--navy,#12314C);color:#fff;font:inherit;font-weight:600;cursor:pointer}\
.oofa-btn:hover:not(:disabled){background:var(--navy-soft,#1F4462)}\
.oofa-btn:disabled{opacity:.5;cursor:not-allowed}\
.oofa-btn.ghost{background:transparent;color:var(--navy,#12314C);border-color:var(--line-strong,#CFC9BA)}\
.oofa-btn.sm{padding:.3rem .65rem;font-size:.78rem}\
.oofa-status{font-size:.82rem;color:var(--muted,#7C8594)}\
.oofa-status.err{color:var(--danger,#A23B3B)}.oofa-status.ok{color:var(--sage,#4E6E4A)}\
.oofa-help{font-size:.78rem;color:var(--muted,#7C8594);margin-top:.35rem}\
.oofa details{margin-top:.8rem;border-top:1px dashed var(--line,#E4E0D6);padding-top:.6rem}\
.oofa summary{cursor:pointer;font-weight:600;color:var(--navy,#12314C);font-size:.82rem}\
.oofa-stmt{margin-top:.6rem}\
.oofa-log{margin-top:.8rem;max-height:11rem;overflow:auto;background:#0C2236;color:#D7E3EE;border-radius:8px;padding:.6rem .8rem;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap}\
.oofa-results{display:grid;gap:.9rem;margin-top:1rem}\
.oofa-card{border:1px solid var(--line,#E4E0D6);border-radius:10px;padding:1rem 1.1rem;background:var(--paper,#fff)}\
.oofa-card.err{border-color:var(--danger,#A23B3B);background:var(--danger-tint,#F7ECEC)}\
.oofa-card-hd{display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap;align-items:baseline;margin-bottom:.5rem}\
.oofa-who{font-weight:700;color:var(--navy,#12314C)}.oofa-sub{color:var(--ink-soft,#4B5563);font-size:.82rem}\
.oofa-badge{display:inline-block;padding:.12rem .5rem;border-radius:999px;background:var(--gold-soft,#EFE9DA);color:var(--navy,#12314C);font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}\
.oofa-count{font-size:.74rem;color:var(--muted,#7C8594);text-align:right;margin-top:.2rem}\
.oofa-count.over{color:var(--danger,#A23B3B);font-weight:700}\
.oofa-alt{margin-top:.5rem;padding:.55rem .7rem;background:var(--cream,#F6F4EF);border-radius:7px;font-size:.84rem}\
.oofa-kv{font-size:.82rem;margin-top:.4rem}.oofa-kv b{color:var(--navy,#12314C)}\
.oofa select{padding:.35rem .5rem;border:1px solid var(--line-strong,#CFC9BA);border-radius:7px;font:inherit;font-size:.82rem;background:#fff}\
.oofa-who-row{display:flex;align-items:center;gap:.7rem}\
.oofa-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--gold,#B9A77E);flex:none;background:var(--cream,#F6F4EF)}\
.oofa-avatar-txt{display:inline-flex;align-items:center;justify-content:center;background:var(--navy,#12314C);color:#fff;font-weight:700;font-size:.9rem}\
.oofa-found{margin:.3rem 0 .7rem;padding:.6rem .8rem;background:var(--cream,#F6F4EF);border-radius:8px;font-size:.82rem}\
.oofa-found-k{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#7C8594);font-weight:600}.oofa-found-k b{color:var(--navy,#12314C)}\
.oofa-found-t{font-weight:600;color:var(--ink,#1B2430);margin-top:.2rem}\
.oofa-found-q{margin-top:.25rem;padding-left:.6rem;border-left:2px solid var(--gold,#B9A77E);font-style:italic;color:var(--ink,#1B2430)}\
.oofa-found-b{margin-top:.2rem;color:var(--ink-soft,#4B5563)}';

    function initialsOf(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        var s = parts.map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
        return s || '?';
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var st = document.createElement('style');
        st.id = STYLE_ID; st.textContent = CSS;
        document.head.appendChild(st);
    }

    function mount(target, options) {
        options = options || {};
        var root = typeof target === 'string' ? document.querySelector(target) : target;
        if (!root) throw new Error('OneOffFullAi.mount: container not found');
        injectStyles();

        var prospectCount = options.prospectCount || 3;
        var maxChars = options.maxChars || DEFAULT_MAX_CHARS;
        var useTargets = options.useTargets || [];
        var state = { leader: null, results: [], busy: false };
        var uid = 'oofa' + Math.random().toString(36).slice(2, 7);

        var prospectInputs = '';
        for (var i = 0; i < prospectCount; i++) {
            prospectInputs += '<div><label for="' + uid + '_p' + i + '">Prospect ' + (i + 1) + ' LinkedIn URL</label>'
                + '<input type="url" id="' + uid + '_p' + i + '" placeholder="https://www.linkedin.com/in/..."></div>';
        }

        root.innerHTML = '<div class="oofa">'
            + '<div class="oofa-step" id="' + uid + '_s1">'
            + '<div class="oofa-step-hd"><span class="oofa-num">1</span>Sales leader sending the messages</div>'
            + '<div class="oofa-grid"><div><label for="' + uid + '_li">Leader LinkedIn URL</label>'
            + '<input type="url" id="' + uid + '_li" placeholder="https://www.linkedin.com/in/..."></div>'
            + '<div><label for="' + uid + '_nm">Leader name</label><input type="text" id="' + uid + '_nm" placeholder="Filled from the URL"></div></div>'
            + '<div class="oofa-grid" style="margin-top:.8rem"><div><label for="' + uid + '_co">Company</label><input type="text" id="' + uid + '_co" placeholder="Company the leader works for"></div>'
            + '<div><label for="' + uid + '_web">Website</label><input type="url" id="' + uid + '_web" placeholder="https://"></div></div>'
            + '<div style="margin-top:.8rem"><label for="' + uid + '_blurb">What we do (about 1 sentence, filled automatically, edit freely)</label>'
            + '<textarea id="' + uid + '_blurb" rows="2" placeholder="Plain description of what the company does"></textarea></div>'
            + '<div class="oofa-row"><button type="button" class="oofa-btn" id="' + uid + '_build"><i class="fas fa-user-gear"></i> Build leader profile</button>'
            + '<span class="oofa-status" id="' + uid + '_s1st"></span></div>'
            + '<div class="oofa-help">Like About Me in the BDR profile: we read the leader\'s LinkedIn and public bio and write the "I" and "We" statements. Nothing is saved.</div>'
            + '<details id="' + uid + '_stmts" style="display:none"><summary>Review the leader\'s About Me statements (one per line, editable)</summary><div id="' + uid + '_stmtbody"></div></details>'
            + '</div>'
            + '<div class="oofa-step is-locked" id="' + uid + '_s2">'
            + '<div class="oofa-step-hd"><span class="oofa-num">2</span>Prospects to write to</div>'
            + '<div class="oofa-grid three">' + prospectInputs + '</div>'
            + '<div class="oofa-row"><button type="button" class="oofa-btn" id="' + uid + '_gen" disabled><i class="fas fa-wand-magic-sparkles"></i> Generate example messages</button>'
            + '<span class="oofa-status" id="' + uid + '_s2st"></span></div>'
            + '<div class="oofa-help">For each prospect we build a temporary hypothesis group (their company + role), run Full AI Generate for the leader, then add one short, non-salesy sentence (about 100 characters) on what the company does. Takes 1-3 minutes per prospect.</div>'
            + '<div class="oofa-log" id="' + uid + '_log" style="display:none"></div>'
            + '</div>'
            + '<div class="oofa-results" id="' + uid + '_res"></div>'
            + '</div>';

        function $(suffix) { return document.getElementById(uid + suffix); }
        var elLi = $('_li'), elNm = $('_nm'), elCo = $('_co'), elWeb = $('_web'), elBlurb = $('_blurb');
        var btnBuild = $('_build'), btnGen = $('_gen');
        var elLog = $('_log'), elRes = $('_res');

        function setStatus(id, msg, kind) { var el = $(id); el.textContent = msg || ''; el.className = 'oofa-status' + (kind ? ' ' + kind : ''); }
        function log(msg) {
            elLog.style.display = 'block';
            elLog.textContent += '[' + new Date().toLocaleTimeString() + '] ' + msg + '\n';
            elLog.scrollTop = elLog.scrollHeight;
        }
        function setBusy(b) {
            state.busy = b;
            btnBuild.disabled = b;
            btnGen.disabled = b || !state.leader;
        }
        function syncCompanyFields() {
            if (!elCo.value.trim()) elCo.value = String(resolveValue(options.companyName) || '').trim();
            if (!elWeb.value.trim()) elWeb.value = String(resolveValue(options.companyWebsite) || '').trim();
        }
        syncCompanyFields();
        elLi.addEventListener('blur', function () { if (!elNm.value.trim()) elNm.value = nameFromLinkedInUrl(elLi.value); });
        elLi.addEventListener('focus', syncCompanyFields);

        function renderStatements() {
            var l = state.leader; if (!l) return;
            var html = '';
            Object.keys(STATEMENT_LABELS).forEach(function (k) {
                var arr = (l.statements && l.statements[k]) || [];
                if (!arr.length) return;
                html += '<div class="oofa-stmt"><label>' + esc(STATEMENT_LABELS[k]) + '</label><textarea data-k="' + k + '" rows="' + Math.min(5, arr.length + 1) + '">' + esc(arr.join('\n')) + '</textarea></div>';
            });
            var we = l.weStatements || [];
            html += '<div class="oofa-stmt"><label>Company statements (We)</label><textarea data-k="__we" rows="' + Math.min(6, we.length + 1) + '" placeholder="Nothing found. Optional.">' + esc(we.join('\n')) + '</textarea></div>';
            $('_stmtbody').innerHTML = html;
            $('_stmts').style.display = '';
        }
        function collectLeader() {
            var l = state.leader;
            l.name = elNm.value.trim() || l.name;
            l.companyName = elCo.value.trim();
            l.companyWebsite = elWeb.value.trim();
            l.companyBlurb = elBlurb.value.trim();
            $('_stmtbody').querySelectorAll('textarea[data-k]').forEach(function (ta) {
                var lines = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
                if (ta.getAttribute('data-k') === '__we') l.weStatements = lines; else l.statements[ta.getAttribute('data-k')] = lines;
            });
            return l;
        }

        btnBuild.addEventListener('click', async function () {
            syncCompanyFields();
            var li = normalizeLinkedInUrl(elLi.value);
            if (!li.ok) { setStatus('_s1st', li.error, 'err'); elLi.focus(); return; }
            if (!elNm.value.trim()) elNm.value = nameFromLinkedInUrl(li.url);
            setBusy(true);
            setStatus('_s1st', 'Building the leader profile...', '');
            elLog.textContent = '';
            var original = btnBuild.innerHTML;
            btnBuild.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building...';
            try {
                var leader = await buildLeader({
                    linkedInUrl: li.url, name: elNm.value.trim(), companyName: elCo.value.trim(),
                    companyWebsite: elWeb.value.trim(), companyBlurb: elBlurb.value.trim(), onLog: log
                });
                state.leader = leader;
                elLi.value = leader.linkedInUrl;
                if (!elBlurb.value.trim()) elBlurb.value = leader.companyBlurb || '';
                renderStatements();
                $('_s2').classList.remove('is-locked');
                setStatus('_s1st', 'Leader profile ready.', 'ok');
                if (!leader.companyBlurb) setStatus('_s1st', 'Leader ready, but type what the company does above before generating.', 'err');
            } catch (err) {
                state.leader = null;
                setStatus('_s1st', err.message, 'err');
                log('Error: ' + err.message);
            } finally {
                btnBuild.innerHTML = original;
                setBusy(false);
            }
        });

        // ── Results ────────────────────────────────────────────────────────────────────
        function counterHtml(len, limit) {
            return '<div class="oofa-count' + (len > limit ? ' over' : '') + '">' + len + ' / ' + limit + ' characters</div>';
        }
        function renderResult(idx, res) {
            var card = document.getElementById(uid + '_card' + idx);
            if (!card) { card = document.createElement('div'); card.id = uid + '_card' + idx; elRes.appendChild(card); }
            if (!res.ok) {
                card.className = 'oofa-card err';
                card.innerHTML = '<div class="oofa-card-hd"><span class="oofa-who">' + esc(res.linkedInUrl || 'Prospect ' + (idx + 1)) + '</span></div>'
                    + '<div>' + esc(res.error || 'Something went wrong.') + '</div>'
                    + (res.logs && res.logs.length ? '<details><summary>Log</summary><div class="oofa-log" style="display:block">' + esc(res.logs.join('\n')) + '</div></details>' : '');
                return;
            }
            var p = res.prospect || {};
            var best = res.best || {};
            var h = res.hypothesis || {};
            var limit = res.maxChars || maxChars;
            var alts = (res.composed || []).slice(1);
            var useMenu = useTargets.length && typeof options.onUse === 'function'
                ? '<div class="oofa-row"><select id="' + uid + '_use' + idx + '">' + useTargets.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.label) + '</option>'; }).join('') + '</select>'
                + '<button type="button" class="oofa-btn sm" data-act="use"><i class="fas fa-arrow-right-to-bracket"></i> Use in report</button></div>'
                : '';
            var photo = p.photoDataUrl || p.photoUrl || '';
            var avatar = photo
                ? '<img class="oofa-avatar" src="' + esc(photo) + '" alt="">'
                : '<span class="oofa-avatar oofa-avatar-txt">' + esc(initialsOf(p.name)) + '</span>';
            var f = res.findings || {}; var hook = f.hook || {}; var ex = res.explain || {};
            var foundHtml = (hook.label || hook.detail)
                ? '<div class="oofa-found"><div class="oofa-found-k">What we found: <b>' + esc(hook.label || '') + (hook.date ? ' (' + esc(hook.date) + ')' : '') + '</b></div>'
                + (hook.title && hook.kind !== 'post' ? '<div class="oofa-found-t">' + esc(hook.title) + '</div>' : '')
                + (hook.detail ? '<div class="oofa-found-q">' + esc(hook.detail) + '</div>' : '')
                + (ex.noticed || ex.built ? '<div class="oofa-found-k" style="margin-top:.45rem">How we built it</div><div class="oofa-found-b">' + esc([ex.noticed, ex.built].filter(Boolean).join(' ')) + '</div>' : '')
                + '</div>'
                : '';
            card.className = 'oofa-card';
            card.innerHTML = '<div class="oofa-card-hd"><div class="oofa-who-row">' + avatar + '<div><span class="oofa-who">' + esc(p.name || 'Prospect ' + (idx + 1)) + '</span><div class="oofa-sub">' + esc([p.title, p.company].filter(Boolean).join(' at ')) + (p.location ? ' · ' + esc(p.location) : '') + '</div></div></div>'
                + '<span class="oofa-badge">' + esc(res.source || 'Full AI') + '</span></div>'
                + foundHtml
                + '<textarea data-role="msg" rows="4">' + esc(best.message || '') + '</textarea>'
                + '<div data-role="count">' + counterHtml((best.message || '').length, limit) + '</div>'
                + '<div class="oofa-row" style="margin-top:.4rem"><button type="button" class="oofa-btn ghost sm" data-act="copy"><i class="fas fa-copy"></i> Copy</button></div>'
                + useMenu
                + '<details><summary>Pipeline details</summary>'
                + (best.original ? '<div class="oofa-kv"><b>Personalization from Full AI:</b> ' + esc(best.original) + '</div>' : '<div class="oofa-kv"><b>Personalization:</b> written from the LinkedIn profile (no post, shared ground, or news hook was found).</div>')
                + '<div class="oofa-kv"><b>Temporary hypothesis group:</b> ' + esc(h.name || '') + '</div>'
                + (h.hypothesis ? '<div class="oofa-kv"><b>Hypothesis:</b> ' + esc(h.hypothesis) + '</div>' : '')
                + (h.companyLine ? '<div class="oofa-kv"><b>What-we-do line:</b> ' + esc(h.companyLine) + '</div>' : '')
                + (alts.length ? '<div class="oofa-kv"><b>Other options:</b></div>' + alts.map(function (a) { return '<div class="oofa-alt">' + esc(a.message) + ' <span class="oofa-sub">(' + a.chars + ' chars)</span></div>'; }).join('') : '')
                + (res.logs && res.logs.length ? '<div class="oofa-kv"><b>Pipeline log</b></div><div class="oofa-log" style="display:block">' + esc(res.logs.join('\n')) + '</div>' : '')
                + '</details>';

            var ta = card.querySelector('[data-role=msg]');
            ta.addEventListener('input', function () {
                card.querySelector('[data-role=count]').innerHTML = counterHtml(ta.value.length, limit);
                if (state.results[idx] && state.results[idx].best) state.results[idx].best.message = ta.value;
            });
            card.querySelector('[data-act=copy]').addEventListener('click', function () {
                if (navigator.clipboard) navigator.clipboard.writeText(ta.value);
                else { ta.select(); document.execCommand('copy'); }
            });
            var useBtn = card.querySelector('[data-act=use]');
            if (useBtn) useBtn.addEventListener('click', function () {
                var sel = document.getElementById(uid + '_use' + idx);
                options.onUse({ message: ta.value.trim(), targetId: sel ? sel.value : null, result: res });
            });
        }

        btnGen.addEventListener('click', async function () {
            if (!state.leader) { setStatus('_s2st', 'Build the leader profile first.', 'err'); return; }
            var leader = collectLeader();
            if (!leader.companyBlurb) { setStatus('_s2st', 'Add a short description of what the company does first.', 'err'); elBlurb.focus(); return; }
            var urls = [];
            for (var i = 0; i < prospectCount; i++) {
                var v = $('_p' + i).value.trim();
                if (!v) continue;
                var n = normalizeLinkedInUrl(v);
                if (!n.ok) { setStatus('_s2st', 'Prospect ' + (i + 1) + ': ' + n.error, 'err'); $('_p' + i).focus(); return; }
                urls.push(n.url); $('_p' + i).value = n.url;
            }
            if (!urls.length) { setStatus('_s2st', 'Enter at least one prospect LinkedIn URL.', 'err'); return; }

            setBusy(true);
            elRes.innerHTML = '';
            state.results = [];
            elLog.textContent = '';
            setStatus('_s2st', 'Working on 0 of ' + urls.length + '...', '');
            var original = btnGen.innerHTML;
            btnGen.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            try {
                var results = await run({
                    leader: leader, prospectUrls: urls, maxChars: maxChars,
                    onLog: function (m, i) { log('[' + (i + 1) + '/' + urls.length + '] ' + m); },
                    onProgress: function (p) { if (p.stage === 'done') setStatus('_s2st', 'Finished ' + p.done + ' of ' + p.total + '...', ''); },
                    onResult: function (i, res) { state.results[i] = res; renderResult(i, res); }
                });
                state.results = results;
                var okCount = results.filter(function (r) { return r && r.ok; }).length;
                setStatus('_s2st', okCount + ' of ' + results.length + ' messages ready.', okCount ? 'ok' : 'err');
                if (typeof options.onResults === 'function') options.onResults(results);
            } catch (err) {
                setStatus('_s2st', err.message, 'err');
            } finally {
                btnGen.innerHTML = original;
                setBusy(false);
            }
        });

        // ── Save / restore (so a host page can store this section inside its own saved data) ──
        // The snapshot is plain JSON: typed inputs, the built leader profile, prospect URLs and the
        // generated messages. Long diagnostic logs are left out to keep the saved record small.
        function slimResult(r) {
            if (!r) return null;
            var out = {
                ok: !!r.ok, linkedInUrl: r.linkedInUrl || '', error: r.error || '', skipped: !!r.skipped,
                source: r.source || '', maxChars: r.maxChars || maxChars,
                prospect: r.prospect || null, hypothesis: r.hypothesis || null,
                composed: r.composed || [], best: r.best || null,
                findings: r.findings || null, explain: r.explain || null, generatedAt: r.generatedAt || ''
            };
            out.candidates = (r.candidates || []).slice(0, 3);
            return out;
        }
        function getState() {
            var prospects = [];
            for (var i = 0; i < prospectCount; i++) prospects.push($('_p' + i).value.trim());
            var leader = state.leader ? JSON.parse(JSON.stringify(collectLeader())) : null;
            var hasInputs = elLi.value.trim() || prospects.some(Boolean);
            if (!leader && !hasInputs && !state.results.length) return null;
            return {
                version: 1,
                inputs: { linkedInUrl: elLi.value.trim(), name: elNm.value.trim(), companyName: elCo.value.trim(), companyWebsite: elWeb.value.trim(), companyBlurb: elBlurb.value.trim() },
                leader: leader,
                prospectUrls: prospects,
                results: state.results.map(slimResult)
            };
        }
        function setState(snap) {
            if (!snap || typeof snap !== 'object') return false;
            var inp = snap.inputs || {};
            elLi.value = inp.linkedInUrl || '';
            elNm.value = inp.name || '';
            elCo.value = inp.companyName || '';
            elWeb.value = inp.companyWebsite || '';
            elBlurb.value = inp.companyBlurb || '';
            for (var i = 0; i < prospectCount; i++) $('_p' + i).value = (snap.prospectUrls && snap.prospectUrls[i]) || '';

            state.leader = snap.leader ? JSON.parse(JSON.stringify(snap.leader)) : null;
            if (state.leader) {
                state.leader.statements = state.leader.statements || {};
                state.leader.weStatements = state.leader.weStatements || [];
                renderStatements();
                $('_s2').classList.remove('is-locked');
                setStatus('_s1st', 'Leader profile restored from the saved proposal.', 'ok');
            } else {
                $('_stmtbody').innerHTML = '';
                $('_stmts').style.display = 'none';
                $('_s2').classList.add('is-locked');
                setStatus('_s1st', '', '');
            }
            elLog.textContent = ''; elLog.style.display = 'none';
            elRes.innerHTML = '';
            state.results = (snap.results || []).filter(Boolean).map(function (r) { return r; });
            state.results.forEach(function (r, idx) { renderResult(idx, r); });
            var okCount = state.results.filter(function (r) { return r && r.ok; }).length;
            setStatus('_s2st', state.results.length ? okCount + ' of ' + state.results.length + ' saved messages restored.' : '', okCount ? 'ok' : '');
            btnGen.disabled = state.busy || !state.leader;
            return true;
        }

        return {
            getLeader: function () { return state.leader ? collectLeader() : null; },
            getResults: function () { return state.results.slice(); },
            getState: getState,
            setState: setState,
            destroy: function () { root.innerHTML = ''; }
        };
    }

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Proposal page renderer ("Three Examples of Outreach to <Company> Prospects")
    //
    //   var page = OneOffFullAi.renderShowcase(results, { companyName, leader, theme?, maxItems? });
    //   page = { count, title, lede, eyebrow, body, header, html }
    //     body   : the prospect bands + closing note (inline styles only, print safe)
    //     header : a default title block for hosts without their own PDF helpers
    //     html   : header + body
    //   Hosts with their own page chrome (outcomes_calculator.html) wrap `body` themselves.
    // ───────────────────────────────────────────────────────────────────────────────────────
    var SHOWCASE_THEME = {
        navy: '#12314C', navyDeep: '#0C2236', cream: '#F6F4EF', gold: '#B9A77E', goldSoft: '#EFE9DA',
        sage: '#4E6E4A', sageTint: '#EEF2EC', ink: '#1B2430', inkSoft: '#4B5563', muted: '#7C8594', line: '#E4E0D6', lineStrong: '#CFC9BA',
        serif: "font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:500;letter-spacing:-0.01em;",
        sans: 'font-family:Inter,Arial,Helvetica,sans-serif;'
    };
    var COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

    function trimTo(text, n) {
        var t = String(text || '').replace(/\s+/g, ' ').trim();
        if (t.length <= n) return t;
        var cut = t.slice(0, n);
        var sp = cut.lastIndexOf(' ');
        return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\s]+$/, '') + '...';
    }
    function fmtCount(n) {
        var v = Number(n);
        if (!isFinite(v) || v <= 0) return '';
        return v >= 1000 ? (Math.round(v / 100) / 10).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(v);
    }
    function showcaseTitle(count, companyName) {
        var word = COUNT_WORDS[count] || String(count);
        return word + ' Example' + (count === 1 ? '' : 's') + ' of Outreach to ' + (String(companyName || '').trim() || 'Your') + ' Prospects';
    }

    function renderShowcase(results, opts) {
        opts = opts || {};
        var T = Object.assign({}, SHOWCASE_THEME, opts.theme || {});
        var items = (results || []).filter(function (r) { return r && r.ok && r.best && r.best.message; }).slice(0, opts.maxItems || 3);
        var count = items.length;
        var company = String(opts.companyName || '').trim();
        var leader = opts.leader || {};
        var leaderName = leader.name || 'Your sales leader';
        var title = showcaseTitle(count, company);
        var eyebrow = 'Live examples · written for real people';
        var lede = 'We researched ' + (count === 1 ? 'one real person' : COUNT_WORDS[count].toLowerCase() + ' real people')
            + (company ? ' ' + company + ' would want to reach' : ' you would want to reach')
            + ', read what they have posted and published, and wrote to each one as we would on your team\'s behalf. Nothing here is a template.';
        if (!count) return { count: 0, title: title, lede: lede, eyebrow: eyebrow, body: '', header: '', html: '' };

        var compact = count >= 3;
        var quoteMax = compact ? 170 : 280;
        var builtMax = compact ? 330 : 400;
        var eb = function (n, label) {
            return '<div style="' + T.sans + 'font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:' + T.gold + ';font-weight:600;">'
                + '<span style="color:' + T.navy + ';margin-right:6px;">' + n + '</span>' + label + '</div>';
        };
        var chip = function (text) {
            return '<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.86);' + T.sans + 'font-size:7.5px;letter-spacing:.06em;text-transform:uppercase;margin:0 4px 4px 0;white-space:nowrap;">' + text + '</span>';
        };

        var bands = items.map(function (r, i) {
            var p = r.prospect || {}; var f = r.findings || {}; var hook = f.hook || {}; var ex = r.explain || {}; var fp = f.profile || {};
            var msg = String(r.best.message || '');
            var photo = p.photoDataUrl || p.photoUrl || '';
            var size = compact ? 56 : 68;
            var avatar = photo
                ? '<img src="' + esc(photo) + '" alt="" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;display:block;border:2px solid ' + T.gold + ';background:#fff;">'
                : '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:rgba(255,255,255,0.12);border:2px solid ' + T.gold + ';display:flex;align-items:center;justify-content:center;' + T.serif + 'font-size:' + Math.round(size * 0.36) + 'px;color:#fff;">' + esc(initialsOf(p.name)) + '</div>';
            var chips = [];
            if (f.postsFound) chips.push(chip(f.postsFound + ' recent post' + (f.postsFound === 1 ? '' : 's')));
            else if (f.source) chips.push(chip('Profile scanned'));
            if (fmtCount(fp.connections || p.connections)) chips.push(chip(fmtCount(fp.connections || p.connections) + ' connections'));
            else if (fmtCount(fp.followers || p.followers)) chips.push(chip(fmtCount(fp.followers || p.followers) + ' followers'));
            if (hook.kind === 'news') chips.push(chip('In the news'));
            if (hook.kind === 'common') chips.push(chip('Common ground'));

            var foundTitle = hook.label || 'Their LinkedIn profile';
            var foundMeta = hook.date ? ' <span style="font-weight:400;color:' + T.muted + ';">· ' + esc(hook.date) + '</span>' : '';
            var foundHead = hook.title && hook.kind !== 'post' ? '<div style="' + T.sans + 'font-size:10px;font-weight:600;color:' + T.ink + ';margin-top:4px;line-height:1.4;">' + esc(trimTo(hook.title, 110)) + '</div>' : '';
            var quote = hook.detail
                ? '<div style="margin-top:5px;padding:6px 10px;border-left:2px solid ' + T.gold + ';background:#fff;border-radius:0 6px 6px 0;' + T.serif + 'font-weight:400;font-style:italic;font-size:' + (compact ? 10 : 10.5) + 'px;line-height:1.5;color:' + T.ink + ';">' + esc(trimTo(hook.detail, quoteMax)) + '</div>'
                : '<div style="margin-top:5px;' + T.sans + 'font-size:10px;color:' + T.inkSoft + ';line-height:1.5;">' + esc(trimTo(fp.headline || [p.title, p.company].filter(Boolean).join(' at '), 140)) + '</div>';
            var builtText = [ex.noticed, ex.built].filter(Boolean).join(' ') || ('The note opens with that detail in plain words, then adds one short line on what ' + (leader.companyName || 'we') + ' does. No ask, no pitch.');

            var identity = '<td style="width:27%;vertical-align:top;background:' + T.navy + ';border-radius:8px 0 0 8px;padding:0;">'
                + '<div style="height:3px;background:' + T.gold + ';border-radius:8px 0 0 0;"></div>'
                + '<div style="padding:' + (compact ? '14px 14px 12px' : '18px 16px 16px') + ';">'
                + '<div style="display:flex;align-items:center;gap:10px;">' + avatar + '<div style="min-width:0;">'
                + '<div style="' + T.serif + 'font-size:' + (compact ? 14 : 16) + 'px;line-height:1.15;color:#fff;">' + esc(p.name || 'Prospect ' + (i + 1)) + '</div>'
                + '</div></div>'
                + '<div style="' + T.sans + 'font-size:9.5px;line-height:1.4;color:rgba(255,255,255,0.9);margin-top:9px;">' + esc(trimTo(p.title || fp.headline || '', 70)) + '</div>'
                + (p.company ? '<div style="' + T.sans + 'font-size:9.5px;color:' + T.gold + ';margin-top:2px;">' + esc(trimTo(p.company, 50)) + '</div>' : '')
                + (p.location || fp.location ? '<div style="' + T.sans + 'font-size:8.5px;color:rgba(255,255,255,0.6);margin-top:3px;">' + esc(trimTo(p.location || fp.location, 50)) + '</div>' : '')
                + (chips.length ? '<div style="margin-top:9px;">' + chips.join('') + '</div>' : '')
                + '</div></td>';

            var builtHtml = ex.noticed && ex.built
                ? '<div style="' + T.sans + 'font-size:' + (compact ? 9.5 : 10.5) + 'px;color:' + T.ink + ';line-height:1.5;margin-top:5px;">' + esc(trimTo(ex.noticed, 200)) + '</div>'
                + '<div style="' + T.sans + 'font-size:' + (compact ? 9.5 : 10.5) + 'px;color:' + T.inkSoft + ';line-height:1.5;margin-top:3px;">' + esc(trimTo(ex.built, 240)) + '</div>'
                : '<div style="' + T.sans + 'font-size:' + (compact ? 9.5 : 10.5) + 'px;color:' + T.inkSoft + ';line-height:1.5;margin-top:5px;">' + esc(trimTo(builtText, builtMax)) + '</div>';

            var found = '<td style="width:43%;vertical-align:top;background:' + T.cream + ';padding:' + (compact ? '13px 14px' : '16px 18px') + ';border-top:1px solid ' + T.line + ';border-bottom:1px solid ' + T.line + ';">'
                + eb('01', 'What we found')
                + '<div style="' + T.sans + 'font-size:10.5px;font-weight:600;color:' + T.navy + ';margin-top:6px;">' + esc(foundTitle) + foundMeta + '</div>'
                + foundHead + quote
                + '<div style="margin-top:9px;">' + eb('02', 'How we built it') + '</div>'
                + builtHtml
                + '</td>';

            var bubble = '<td style="width:30%;vertical-align:top;background:' + T.cream + ';border-radius:0 8px 8px 0;padding:' + (compact ? '13px 14px 13px 2px' : '16px 18px 16px 2px') + ';border-top:1px solid ' + T.line + ';border-bottom:1px solid ' + T.line + ';border-right:1px solid ' + T.line + ';">'
                + eb('03', 'The message')
                + '<div style="margin-top:6px;background:#fff;border:1px solid ' + T.line + ';border-radius:12px 12px 12px 3px;padding:9px 11px;">'
                + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:' + T.navy + ';color:#fff;' + T.sans + 'font-size:7px;font-weight:600;">' + esc(initialsOf(leaderName)) + '</span>'
                + '<span style="' + T.sans + 'font-size:8px;color:' + T.muted + ';">' + esc(trimTo(leaderName, 28)) + ' · connection request</span></div>'
                + '<div style="' + T.sans + 'font-size:' + (compact ? 10 : 10.5) + 'px;line-height:1.55;color:' + T.ink + ';">' + esc(msg) + '</div>'
                + '</div>'
                + '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:2px 10px;' + T.sans + 'font-size:7.5px;color:' + T.muted + ';margin-top:5px;"><span style="white-space:nowrap;">' + msg.length + ' characters</span><span style="white-space:nowrap;">Reviewed by a person before sending</span></div>'
                + '</td>';

            return '<table style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;margin-bottom:' + (compact ? 10 : 14) + 'px;break-inside:avoid;page-break-inside:avoid;"><tr>' + identity + found + bubble + '</tr></table>';
        }).join('');

        var note = '<table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:' + (compact ? 4 : 8) + 'px;"><tr><td style="padding:0;">'
            + '<div style="border:1px solid ' + T.line + ';border-radius:6px;padding:9px 14px;background:#fff;display:flex;justify-content:space-between;gap:14px;align-items:center;break-inside:avoid;page-break-inside:avoid;">'
            + '<div style="' + T.sans + 'font-size:9.5px;color:' + T.inkSoft + ';line-height:1.5;">' + (compact
                ? 'Same process every time: read the person, write to the one thing worth saying, and a person reviews it before it goes out.'
                : 'Every message above came from the same process ' + (company ? esc(company) : 'you') + ' would get: we read the person\'s LinkedIn, their recent posts and news about their organization, write to the one specific thing worth saying, and a person reviews it before it goes out.') + '</div>'
            + '<div style="' + T.sans + 'font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:' + T.gold + ';font-weight:600;white-space:nowrap;">Scan · Write · Review</div>'
            + '</div></td></tr></table>';

        var header = '<div style="margin-bottom:' + (compact ? 18 : 24) + 'px;">'
            + '<div style="' + T.sans + 'font-size:9.5px;letter-spacing:0.2em;text-transform:uppercase;color:' + T.gold + ';font-weight:600;display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:22px;height:1px;background:' + T.gold + ';"></span>' + esc(eyebrow) + '</div>'
            + '<div style="margin:10px 0 10px;' + T.serif + 'font-size:26px;line-height:1.18;color:' + T.navy + ';">' + esc(title) + '</div>'
            + '<div style="' + T.sans + 'font-size:12.5px;line-height:1.65;color:' + T.inkSoft + ';max-width:640px;">' + esc(lede) + '</div></div>';

        var body = bands + note;
        return { count: count, title: title, lede: lede, eyebrow: eyebrow, body: body, header: header, html: header + body };
    }

    global.OneOffFullAi = {
        buildLeader: buildLeader,
        generateForProspect: generateForProspect,
        run: run,
        mount: mount,
        renderShowcase: renderShowcase,
        showcaseTitle: showcaseTitle,
        normalizeLinkedInUrl: normalizeLinkedInUrl,
        nameFromLinkedInUrl: nameFromLinkedInUrl
    };
})(window);
