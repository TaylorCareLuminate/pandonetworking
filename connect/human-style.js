/**
 * human-style.js - "Human-like messaging" for PandoConnect pages.
 *
 * Rewrites AI-written LinkedIn DMs so they read like a busy professional typed
 * them quickly on a phone ("sound quick, not sloppy"). Default is OFF.
 *
 *   Off     - messages are saved exactly as the AI wrote them (default).
 *   Light   - "human mistakes": keep the wording, strip AI tells, add 1-2 Tier 1
 *             forms (no comma before a name, no closing period, ...). No Tier 2.
 *   Medium  - "human writing style": the full style guide (spoken rhythm, light
 *             shorthand, one Tier 2 form where the message type allows it).
 *
 * Used by generate_messages.html, full_pipeline.html and the reply drafts in
 * index_admin.html. Each page keeps its own setting (localStorage, per "scope").
 *
 * What this file does
 *   1. HumanStyle.humanize()        - rewrite one message (calls /api/ai-profile-eval).
 *   2. HumanStyle.humanizeReply()   - same, for a reply to a prospect.
 *   3. HumanStyle.mount()           - renders the Off / Light / Medium selector.
 *   4. Queue hook                   - while a page has a mode other than Off, every NEW
 *                                     connect_queue doc this page saves (set/add) is
 *                                     humanized on the way in. Nothing else is touched.
 *   5. Fetch hook                   - adds `humanStyle` to the POST body of the Railway
 *                                     endpoints that save connect_queue docs on the
 *                                     SERVER (async jobs), so the backend can do the same.
 *
 * Safety: if the model call fails, or the rewrite drops a URL / email / number /
 * first name / company name, grows past the length cap, or looks truncated, the
 * ORIGINAL message is kept. A rewrite never blocks a save.
 *
 * Keep STYLE_GUIDE in sync with RailwayCLemail/human-style.js (server copy).
 */
(function (global) {
    'use strict';
    if (global.HumanStyle) return;

    const RAILWAY = 'https://railwayclemail-production.up.railway.app';
    const MODEL = 'anthropic/claude-sonnet-5.5';
    const LS_PREFIX = 'pandoHumanStyle:';

    const MODES = {
        off: {
            label: 'Off (default)',
            desc: 'Messages are saved exactly as the AI wrote them.'
        },
        light: {
            label: 'Light - human mistakes',
            desc: "Keeps the AI's wording, strips AI tells, adds 1-2 small natural slips (no comma before a name, no closing period, etc.)."
        },
        medium: {
            label: 'Medium - human writing style',
            desc: 'Full human-style rewrite: spoken rhythm, light shorthand, at most one extra casual form. Names, facts and links never change.'
        }
    };

    // ------------------------------------------------------------------
    // The style guide (verbatim) - this is the system prompt for every rewrite.
    // ------------------------------------------------------------------
    const STYLE_GUIDE = `# ROLE
You rewrite outgoing LinkedIn DMs for B2B healthcare outreach so they read like a busy professional typed them quickly on a phone between meetings. The rule is: sound quick, not sloppy. Every change you make should be something real people do constantly in business messages without anyone thinking less of them.

# INPUT
You will receive:
1. The draft message.
2. The message type: CONNECTION NOTE, FIRST FOLLOW-UP, ENGAGED REPLY, SCHEDULING, or SENIOR EXEC.
3. Optionally, the prospect's most recent reply.

If the message type is missing, treat it as CONNECTION NOTE (the most conservative).

# OUTPUT
Return the rewritten message only, ready to paste. Then add one line starting with "Forms used:" listing the human forms you applied. If I say "message only," skip that line.

Never change facts, names, companies, offers, prices, dates, links, or the call to action. You are changing voice, not content.

# STEP 1: STRIP AI TELLS
Remove all of these before doing anything else.

Punctuation:
- Em dashes and en dashes. Replace with a spaced hyphen ( - ), a comma, or a period.
- Semicolons.
- Colons that introduce a list.
- Bullets, bold, or headers inside the message.

Phrases (cut or replace with plain words):
- "I hope this message finds you well"
- "I came across your profile and was impressed by"
- "explore potential synergies"
- delve, leverage, streamline, seamless, robust, elevate, navigate the landscape
- "I wanted to reach out because"
- "Just circling back" / "Just following up to see if you had a chance to"
- "Would you be open to a brief 15-minute call to discuss"
- "Looking forward to hearing from you!" as an automatic closer

Structure:
- Lists of three ("faster, cheaper, and more accurate"). Cut to one or two.
- Perfect parallel structure across sentences.
- Every paragraph the same length.
- The template shape: compliment, pivot, value prop, call to action.
- Restating the prospect's job title back to them.
- Title Case in openers.

# STEP 2: MAKE IT SOUND SPOKEN
- One idea per message.
- Vary sentence length. A long one, then a short one. A fragment is fine.
- Use numerals: 2 quick questions, 15 mins, 3 hospitals.
- Real hedges and softeners where natural: probably, I think, not sure if, just, quick, no rush.
- Casual connectors: honestly, totally, for sure, makes sense.
- It is fine to start a sentence with So, And, But, or Anyway.
- A short aside in parentheses is fine.
- At most one exclamation point.
- On follow-ups, skip the greeting and start with the point.
- Sign off with a first name, an initial, or nothing. Never a signature block.
- If a prospect reply is provided, roughly match its length and formality.

# STEP 3: ADD HUMAN FORMS (WITHIN BUDGET)

TIER 1 (always safe):
- No comma before a name: "Thanks Jean." "Hi Rachel."
- No comma after yes/sure/no: "Yes absolutely!"
- Dropped "I" or "It" at the start: "Would love to hear more." "Sounds good."
- Dropped "I" on a second clause: "Safe travels and look forward to meeting you"
- No comma before but/and/so: "Not a fit right now but happy to stay connected"
- Spaced hyphen as a pause: "Sure - happy to share." "Hi Taylor - quick question"
- No closing period on the last line.
- Clipped opener: "Work email is jane@co.com"
- Missing apostrophe, max one per message, only in: lets, dont, ill, im, thats, cant, wont. Never "well" for we'll.
- Unhyphenated compound: day to day, part time, follow up call.

TIER 2 (max one per message, never in the first line):
- Trailing double period at the end of a casual line: "Talk soon.."
- Trailing ellipsis as a soft close: "Let me know..."
- Dropped small connector word the reader fills in (out, the, a, to): "Just tried filling the form"
- Light run-on, two short clauses max: "Great to hear that I'll send over the deck"
- Loose time format: "10 or 11am", "2:30pm MT", "Tue at 4". Time must stay unambiguous.
- Split compound that is still a real word: "some time", "any time"
- Lowercase start: short replies and confirmations only, never a first touch.

SHORTHAND (with where it is allowed):
- Any message type: fyi, EOD, EOW, convo, info, w/, & or +, re:, Mon/Tue/Wed/Thu/Fri, 11/4 style dates, 15 mins / 30 min, ok
- Follow-ups and scheduling only: thx, pls, np, lmk, btw, fwiw, asap, mtg, wk/mo/yr, yep, yeah, sure thing
- Scheduling only: ty, @ (as in "Tue @ 2")
- Only if the prospect was light first, max one: haha, ha, :)
- Only if the prospect used it first: u
- Never: k

MIRROR RULE: shorthand is safest right after the prospect uses it. If they write "thx," you can write "np." If they write in full sentences, stay in full (still casual) sentences.

# BUDGET BY MESSAGE TYPE
- CONNECTION NOTE: 1-2 Tier 1, 0 Tier 2, "any message type" shorthand only.
- FIRST FOLLOW-UP: 1-2 Tier 1, 0-1 Tier 2, "any message type" shorthand only.
- ENGAGED REPLY: 2-3 Tier 1, 0-1 Tier 2, mirror their shorthand.
- SCHEDULING: 2-3 Tier 1, 1 Tier 2, shorthand freely (1-2 items).
- SENIOR EXEC (C-suite, physician leaders): 1-2 Tier 1, 0 Tier 2, minimal shorthand.

Never more than 3 forms total in a message under 50 words. If you are rewriting several messages in a sequence, rotate forms so they do not repeat in every message.

# NEVER DO THESE
- Misspellings of any kind (teh, realted, completly).
- Homophone errors (your/you're, their/there, its/it's, then/than).
- Compounds that change meaning (everyday vs every day, any way vs anyway).
- Stray quote marks in place of apostrophes (I"m).
- Long or confusing run-ons.
- Any change to how a name, title, company, number, price, date, phone number, email, or link is written. These are always perfect.
- A form in the first line of a CONNECTION NOTE or FIRST FOLLOW-UP. The first line is always clean.
- Forms in anything other than a DM (no proposals, attachments, or emails meant to be forwarded).

# FINAL CHECK
Read the result as if out loud. It should sound like something a person would say on the phone. If it sounds careless, remove a form. If it still sounds templated, cut more words.

# EXAMPLES

Type: CONNECTION NOTE
Draft: Hi Sarah, I hope this message finds you well! I came across your profile and was impressed by your work leading revenue cycle at Intermountain. I'd love to connect and explore potential synergies around pricing transparency, payer negotiations, and chargemaster optimization.
Rewrite: Hi Sarah - saw your post on the price transparency rule and thought it was spot on. I do chargemaster work for a few systems in the region. Would be good to be connected
Forms used: spaced hyphen, dropped "It", no closing period

Type: ENGAGED REPLY
Draft: Thank you so much for getting back to me, Mark. I would be happy to send over some additional information. Would you be available for a brief call next week to discuss further?
Rewrite: Thanks Mark. Happy to send more info - I'll get a one pager over today. Want to grab 20 mins next wk? Tue or Thu afternoon works on my end
Forms used: no vocative comma, spaced hyphen, unhyphenated compound, shorthand (info, mins, wk), no closing period

Type: SCHEDULING
Draft: Perfect, Tuesday, November 10 at 2:00 PM Mountain Time works great. I've sent a calendar invitation. Looking forward to speaking with you!
Rewrite: Perfect, Tue 11/10 @ 2pm MT works. Invite sent, talk then..
Forms used: shorthand (Tue, 11/10, @), loose time format, dropped subject, trailing double period

Type: ENGAGED REPLY
Prospect reply: not a fit for us right now but thx for reaching out
Draft: No problem at all, I completely understand. Would it be alright if I followed up with you again in the spring?
Rewrite: np, totally understand. Mind if I check back in the spring?
Forms used: mirrored shorthand, lowercase start, dropped "Do you"`;

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    let activeScope = 'default';
    const stats = { humanized: 0, unchanged: 0, skipped: 0 };
    const recentForms = [];          // forms used by the last few messages (for rotation)
    const statListeners = [];
    const _modeCache = {};

    function normalizeMode(m) {
        m = String(m || '').toLowerCase();
        return MODES[m] ? m : 'off';
    }

    function getMode(scope) {
        scope = scope || activeScope;
        try {
            return normalizeMode(localStorage.getItem(LS_PREFIX + scope));
        } catch (_) {
            return normalizeMode(_modeCache[scope]);
        }
    }

    function setMode(mode, scope) {
        scope = scope || activeScope;
        mode = normalizeMode(mode);
        _modeCache[scope] = mode;
        try { localStorage.setItem(LS_PREFIX + scope, mode); } catch (_) { /* private mode */ }
        try { global.dispatchEvent(new CustomEvent('humanstylechange', { detail: { scope, mode } })); } catch (_) {}
    }

    function notifyStats() {
        statListeners.forEach(fn => { try { fn({ ...stats }); } catch (_) {} });
    }

    // ------------------------------------------------------------------
    // Message type
    // ------------------------------------------------------------------
    const EXEC_RE = /\b(chief|c[a-z]{1,2}o|ceo|cfo|coo|cio|cto|cmo|cmio|cno|cnio|(?<!vice[\s-])president|founder|co-founder|owner|managing partner|chair(?:man|woman|person)?|physician|m\.?d\.?|medical director)\b/i;

    function isSeniorExec(title) {
        return !!title && EXEC_RE.test(String(title));
    }

    /** Returns one of: CONNECTION NOTE, FIRST FOLLOW-UP, ENGAGED REPLY, SCHEDULING, SENIOR EXEC. */
    function resolveMessageType(o) {
        if (isSeniorExec(o.title)) return 'SENIOR EXEC';
        if (o.messageType) return String(o.messageType).toUpperCase();
        const raw = String(o.docMessageType || '').toLowerCase();
        if (raw === 'message' || /follow/.test(raw)) return 'FIRST FOLLOW-UP';
        return 'CONNECTION NOTE';
    }

    // ------------------------------------------------------------------
    // Prompt
    // ------------------------------------------------------------------
    function buildPrompt(o, mode, messageType, cap) {
        const lines = [STYLE_GUIDE, '', '# THIS REQUEST (overrides anything above that conflicts)'];

        if (mode === 'light') {
            lines.push(
                '- INTENSITY: LIGHT (human mistakes). Keep the draft\'s wording and structure as intact as possible.',
                '  Do Step 1 only where an AI tell actually appears. Skip the heavier rewriting in Step 2.',
                '  Then add at most 1-2 TIER 1 forms. Use NO Tier 2 forms and only the "any message type" shorthand (and only if it already fits).',
                '  If the draft already sounds natural, change very little.'
            );
        } else {
            lines.push(
                '- INTENSITY: MEDIUM (human writing style). Apply the full guide: Step 1, Step 2 and Step 3, within the budget for the message type.'
            );
        }
        lines.push(
            '- MESSAGE TYPE: ' + messageType,
            '- OUTPUT FORMAT: the rewritten message, then a final line starting with "Forms used:" (comma separated, or "Forms used: none"). No quotes around the message, no preamble, no other commentary.',
            '- LENGTH: the rewrite must be ' + cap + ' characters or fewer. Shorter is fine.',
            '- Keep every URL, email address, number, name, company name and {{placeholder}} exactly as written in the draft.',
            '- If you cannot improve the draft without breaking a NEVER rule, return it unchanged with "Forms used: none".'
        );

        const ctx = [];
        if (o.firstName) ctx.push('Recipient first name: ' + o.firstName);
        if (o.company) ctx.push('Recipient company: ' + o.company);
        if (ctx.length) lines.push('', '# CONTEXT (do not add facts from this, it is only so you do not break names)', ...ctx);

        if (recentForms.length) {
            lines.push('', '# ROTATION',
                'Forms used in the last few messages of this batch (prefer different ones this time): ' +
                recentForms.slice(-6).map(f => f.join(' / ')).filter(Boolean).join(' | '));
        }

        if (o.prospectReply) {
            lines.push('', '# PROSPECT\'S MOST RECENT REPLY', String(o.prospectReply).trim());
        }

        lines.push('', '# DRAFT MESSAGE', String(o.text).trim(), '', 'Type: ' + messageType, 'Rewrite:');
        return lines.join('\n');
    }

    // ------------------------------------------------------------------
    // Model call
    // ------------------------------------------------------------------
    async function callModel(prompt) {
        let lastErr;
        for (let attempt = 1; attempt <= 2; attempt++) {
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = ctrl ? setTimeout(() => ctrl.abort(), 60000) : null;
            try {
                const resp = await fetch(RAILWAY + '/api/ai-profile-eval', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: ctrl ? ctrl.signal : undefined,
                    body: JSON.stringify({
                        provider: 'openrouter',
                        model: MODEL,
                        prompt,
                        temperature: 0.7,
                        max_tokens: 700
                    })
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                const text = String(data.message || data.response || '').trim();
                if (!text) throw new Error('empty response');
                return text;
            } catch (e) {
                lastErr = e;
                if (attempt === 1) await new Promise(r => setTimeout(r, 1500));
            } finally {
                if (timer) clearTimeout(timer);
            }
        }
        throw lastErr || new Error('AI call failed');
    }

    function parseOutput(raw) {
        let t = String(raw || '').trim();
        t = t.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
        let forms = [];
        const m = t.match(/(?:^|\n)\s*\**Forms used:?\**\s*:?\s*([^\n]*)\s*$/i);
        if (m) {
            forms = m[1].split(/[,;]/).map(s => s.trim()).filter(Boolean);
            if (forms.length === 1 && /^none\.?$/i.test(forms[0])) forms = [];
            t = t.slice(0, m.index).trim();
        }
        t = t.replace(/^(rewrite|message|draft)\s*:\s*/i, '');
        if ((t.startsWith('"') && t.endsWith('"') && t.indexOf('"', 1) === t.length - 1) ||
            (t.startsWith('\u201C') && t.endsWith('\u201D'))) {
            t = t.slice(1, -1).trim();
        }
        return { text: t, forms };
    }

    // ------------------------------------------------------------------
    // Validation: a rewrite changes voice, never content.
    // ------------------------------------------------------------------
    function cleanTrail(s) { return String(s).replace(/[)\].,;:!?'"]+$/, ''); }

    function verify(orig, out, o, cap) {
        if (!out) return 'empty rewrite';
        if (/forms used/i.test(out)) return 'rewrite contained commentary';
        if (/\*\*|^#{1,6}\s|^\s*[-*\u2022]\s+\S/m.test(out)) return 'rewrite contained markdown/bullets';
        if (out.length > cap) return 'rewrite longer than allowed (' + out.length + ' > ' + cap + ')';
        if (out.length < 12 || out.length < orig.length * 0.3) return 'rewrite looks truncated';

        const lowOut = out.toLowerCase();
        const urls = (orig.match(/(?:https?:\/\/|www\.)\S+/gi) || []).map(cleanTrail);
        for (const u of urls) if (!lowOut.includes(u.toLowerCase())) return 'URL changed: ' + u;
        const emails = orig.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
        for (const e of emails) if (!lowOut.includes(cleanTrail(e).toLowerCase())) return 'email changed: ' + e;
        const placeholders = orig.match(/\{\{[^}]+\}\}/g) || [];
        for (const p of placeholders) if (!out.includes(p)) return 'placeholder changed: ' + p;

        if (o.checkNumbers !== false) {
            const outNums = new Set(out.match(/\d+/g) || []);
            for (const n of (orig.match(/\d+/g) || [])) if (!outNums.has(n)) return 'number changed: ' + n;
        }
        const first = String(o.firstName || '').trim();
        if (first && orig.toLowerCase().includes(first.toLowerCase()) && !lowOut.includes(first.toLowerCase())) {
            return 'first name dropped: ' + first;
        }
        const company = String(o.company || '').trim();
        if (company && orig.toLowerCase().includes(company.toLowerCase()) && !lowOut.includes(company.toLowerCase())) {
            return 'company name changed: ' + company;
        }
        return '';
    }

    // ------------------------------------------------------------------
    // Core: humanize one message
    // ------------------------------------------------------------------
    /**
     * @param {object} o
     *   text            {string}  the draft (required)
     *   mode            {string}  'light' | 'medium' (default: this page's setting)
     *   messageType     {string}  explicit type, otherwise derived from docMessageType/title
     *   docMessageType  {string}  connect_queue message_type ('connect' | 'message')
     *   title           {string}  recipient title (SENIOR EXEC detection)
     *   firstName, company {string} guard values (must survive the rewrite)
     *   prospectReply   {string}  prospect's most recent message (replies)
     *   checkNumbers    {boolean} default true
     *   maxLen          {number}  hard cap, default derived from the draft length
     * @returns {Promise<{text:string, changed:boolean, skipped:boolean, reason:string, forms:string[], mode:string, messageType:string}>}
     */
    async function humanize(o) {
        const original = String((o && o.text) || '');
        const mode = normalizeMode((o && o.mode) || getMode());
        const base = { text: original, changed: false, skipped: true, reason: '', forms: [], mode, messageType: '' };

        if (mode === 'off') return { ...base, reason: 'off' };
        if (!original.trim()) return { ...base, reason: 'empty' };

        const messageType = resolveMessageType(o);
        base.messageType = messageType;

        let cap = Math.floor(original.length * 1.05);
        if (messageType === 'CONNECTION NOTE' && original.length <= 300) cap = Math.min(cap, 300);
        if (o.maxLen) cap = Math.min(cap, o.maxLen);
        cap = Math.max(cap, original.length);

        let parsed;
        try {
            parsed = parseOutput(await callModel(buildPrompt({ ...o, text: original }, mode, messageType, cap)));
        } catch (e) {
            stats.skipped++; notifyStats();
            console.warn('[HumanStyle] AI call failed - keeping original:', e.message);
            return { ...base, reason: 'AI call failed: ' + e.message };
        }

        // Dashes are an AI tell; normalise rather than reject.
        parsed.text = parsed.text.replace(/\s*[\u2014\u2013]\s*/g, ' - ').replace(/;\s+/g, '. ').trim();
        const problem = verify(original, parsed.text, o, cap);
        if (problem) {
            stats.skipped++; notifyStats();
            console.warn('[HumanStyle] Rewrite rejected (' + problem + ') - keeping original.');
            return { ...base, reason: 'rejected: ' + problem };
        }

        const changed = parsed.text !== original.trim();
        if (changed) { stats.humanized++; recentForms.push(parsed.forms); if (recentForms.length > 12) recentForms.shift(); }
        else stats.unchanged++;
        notifyStats();
        return { text: changed ? parsed.text : original, changed, skipped: false, reason: '', forms: parsed.forms, mode, messageType };
    }

    /** Humanize a reply to a prospect (ENGAGED REPLY, or SCHEDULING when it proposes/confirms a time). */
    function humanizeReply(o) {
        const text = String((o && o.text) || '');
        const schedulingCue = /(calendly|calendar|cal\.com|hubspot\.com\/meetings|\b(mon|tue|wed|thu|fri)[a-z]*\b|tomorrow|\b\d{1,2}(:\d{2})?\s?(am|pm)\b)/i;
        return humanize({
            checkNumbers: false,
            ...o,
            messageType: o && o.messageType ? o.messageType : (schedulingCue.test(text) ? 'SCHEDULING' : 'ENGAGED REPLY')
        });
    }

    // ------------------------------------------------------------------
    // connect_queue save hook (client-side saves)
    // ------------------------------------------------------------------
    function installQueueHook() {
        const db = global.clemailDb;
        if (!db || typeof db.collection !== 'function' || installQueueHook.done) return !!installQueueHook.done;
        let colProto, docProto;
        try {
            const col = db.collection('connect_queue');
            colProto = Object.getPrototypeOf(col);
            docProto = Object.getPrototypeOf(col.doc('human_style_probe'));
        } catch (_) { return false; }
        if (!colProto || !docProto || typeof colProto.add !== 'function' || typeof docProto.set !== 'function') return false;

        const origAdd = colProto.add;
        const origSet = docProto.set;

        colProto.add = async function (data) {
            if (this._collectionName === 'connect_queue') data = await humanizeQueueDoc(data);
            return origAdd.call(this, data);
        };
        docProto.set = async function (data, options) {
            if (this._collectionName === 'connect_queue' && !(options && options.merge)) data = await humanizeQueueDoc(data);
            return origSet.call(this, data, options);
        };
        installQueueHook.done = true;
        return true;
    }

    /** Humanizes a NEW generated connect_queue doc. Returns the doc to save (never throws). */
    async function humanizeQueueDoc(data) {
        try {
            const mode = getMode();
            if (mode === 'off' || !data || typeof data.message_to_contact !== 'string') return data;
            const text = data.message_to_contact;
            if (!text.trim() || data.human_style_mode !== undefined) return data;               // empty / already processed
            if (!(data.generated_by_system || data.original_ai_message !== undefined)) return data; // not an AI-generated doc
            if (data.message_prefix || data.message_suffix) return data;                          // BDR-authored prefix/suffix text

            const res = await humanize({
                text, mode,
                docMessageType: data.message_type,
                title: data.contact_title || data.contactTitle || data.prospect_title || '',
                firstName: data.contact_first_name || data.contactFirstName || '',
                company: data.prospect_company || data.company_name || data.contactCompany || ''
            });
            const out = { ...data, human_style_mode: mode, human_style_applied: !!res.changed };
            if (res.changed) {
                out.pre_humanize_message = text;
                out.message_to_contact = res.text;
                if (typeof data.message_text === 'string' && data.message_text === text) out.message_text = res.text;
                out.human_style_forms = res.forms;
                out.human_style_message_type = res.messageType;
                console.log('[HumanStyle] ' + mode + ' (' + res.messageType + '): ' + res.forms.join(', '));
            } else if (res.reason && res.reason !== 'off') {
                out.human_style_skip_reason = String(res.reason).slice(0, 200);
            }
            return out;
        } catch (e) {
            console.warn('[HumanStyle] queue hook error - saving original:', e && e.message);
            return data;
        }
    }

    // ------------------------------------------------------------------
    // fetch hook: tell the backend which style to use for server-side saves
    // ------------------------------------------------------------------
    const SERVER_WRITE_RE = /\/api\/connect\/(generate-(?:internet-messages|organization-story-messages|contact-org-story-messages|harvest-questions|org-complement|messages|post-topic-messages|post-topic-messages-multi|mass-messages)(?:-async)?|recover-worthy-posts)(?:\?|$)/;

    function installFetchHook() {
        if (installFetchHook.done || typeof global.fetch !== 'function') return;
        const origFetch = global.fetch.bind(global);
        global.fetch = function (input, init) {
            try {
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                if (init && /^post$/i.test(init.method || '') && typeof init.body === 'string' && SERVER_WRITE_RE.test(url)) {
                    const mode = getMode();
                    if (mode !== 'off') {
                        const body = JSON.parse(init.body);
                        if (body && typeof body === 'object' && !Array.isArray(body) && body.humanStyle === undefined) {
                            body.humanStyle = mode;
                            init = { ...init, body: JSON.stringify(body) };
                        }
                    }
                }
            } catch (_) { /* never block a request */ }
            return origFetch(input, init);
        };
        installFetchHook.done = true;
    }

    // ------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('humanStyleCss')) return;
        const st = document.createElement('style');
        st.id = 'humanStyleCss';
        st.textContent = `
        .hs-widget{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 14px;border-radius:10px;
            background:linear-gradient(135deg,#f0fdf4,#ecfeff);border:1.5px solid #86efac;font-size:13px;color:#14532d;}
        .hs-widget.hs-compact{padding:6px 10px;gap:8px;font-size:12px;}
        .hs-widget .hs-title{font-weight:700;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;}
        .hs-widget select{padding:5px 8px;border:1.5px solid #86efac;border-radius:6px;font-size:13px;font-weight:600;color:#14532d;background:#fff;cursor:pointer;}
        .hs-widget.hs-on{background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-color:#10b981;}
        .hs-widget .hs-desc{flex:1;min-width:200px;opacity:.9;}
        .hs-widget .hs-note{flex-basis:100%;font-size:11px;opacity:.75;}
        .hs-widget .hs-stats{font-size:11px;font-weight:600;white-space:nowrap;}`;
        document.head.appendChild(st);
    }

    /**
     * Renders the Off / Light / Medium selector into `target` (element or id).
     * opts: { scope, compact, note, title }
     */
    function mount(target, opts) {
        opts = opts || {};
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return null;
        const scope = opts.scope || activeScope;
        injectStyles();

        const wrap = document.createElement('div');
        wrap.className = 'hs-widget' + (opts.compact ? ' hs-compact' : '');
        wrap.innerHTML =
            '<span class="hs-title"><i class="fas fa-user-pen"></i> ' + (opts.title || 'Human-like messaging') + '</span>' +
            '<select class="hs-select" aria-label="Human-like messaging">' +
            Object.keys(MODES).map(k => '<option value="' + k + '">' + MODES[k].label + '</option>').join('') +
            '</select>' +
            '<span class="hs-desc"></span>' +
            '<span class="hs-stats" style="display:none"></span>' +
            (opts.note ? '<span class="hs-note">' + opts.note + '</span>' : '');
        el.appendChild(wrap);

        const sel = wrap.querySelector('.hs-select');
        const desc = wrap.querySelector('.hs-desc');
        const statEl = wrap.querySelector('.hs-stats');

        function render() {
            const mode = getMode(scope);
            sel.value = mode;
            const text = MODES[mode].desc + (mode !== 'off' ? ' (one extra AI call per message)' : '');
            desc.textContent = text;
            if (opts.hideDesc) { desc.style.display = 'none'; sel.title = text; }
            wrap.classList.toggle('hs-on', mode !== 'off');
        }
        sel.addEventListener('change', () => { setMode(sel.value, scope); render(); });
        global.addEventListener('humanstylechange', render);
        statListeners.push(s => {
            const n = s.humanized + s.unchanged + s.skipped;
            if (!n) { statEl.style.display = 'none'; return; }
            statEl.style.display = '';
            statEl.textContent = s.humanized + ' humanized' + (s.skipped ? ', ' + s.skipped + ' kept as-is' : '');
        });
        render();
        return wrap;
    }

    /**
     * Call once per page. scope: 'generate_messages' | 'full_pipeline' | 'replies'.
     * opts.queueHook (default true) / opts.fetchHook (default true).
     */
    function init(opts) {
        opts = opts || {};
        if (opts.scope) activeScope = opts.scope;
        if (opts.fetchHook !== false) installFetchHook();
        if (opts.queueHook !== false && !installQueueHook()) {
            // clemailDb may not exist yet: retry for ~30s
            let tries = 0;
            const t = setInterval(() => {
                if (installQueueHook() || ++tries > 60) clearInterval(t);
            }, 500);
        }
    }

    global.HumanStyle = {
        MODES, MODEL, STYLE_GUIDE,
        init, mount, humanize, humanizeReply, humanizeQueueDoc,
        getMode, setMode, isSeniorExec, resolveMessageType, stats,
        _verify: verify, _parseOutput: parseOutput, _buildPrompt: buildPrompt   // exposed for tests
    };
})(typeof window !== 'undefined' ? window : globalThis);
