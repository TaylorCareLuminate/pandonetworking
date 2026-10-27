/**
 * meeting-notify.js  (v1.0)
 *
 * "Notify BDR" dialog shared by index_admin.html and company_review_replies.html.
 *
 * When we schedule a meeting for a BDR, this opens a dialog that:
 *   1. Drafts the heads-up email with AI, in the voice Taylor / Sam / Joe use when they write these
 *      by hand (see buildPrompt below), using the BDR's settings from bdr_review_settings.html
 *      (bdr_leaders.meetingEmail* fields: To, CC, greeting name, default sender, AI notes).
 *   2. Lets the person adjust every part: sender, To, CC, subject, the short personal note, the
 *      "Here is a bit about them" employer details, and whether the conversation snapshot is attached.
 *   3. Sends it from the chosen pandonetworking.com mailbox (Taylor, Sam or Joe) through the OAuth
 *      Email Connections backend (POST /oauth/test/send) with that mailbox's saved signature, so it
 *      lands in their Sent folder and reads like one they typed themselves.
 *
 * The host page supplies the contact/conversation context. Usage:
 *
 *   window.PandoMeetingNotify.open({
 *     key: 'unique-conversation-id',                  // remembers "already notified"
 *     contact: { name, firstName, title, company, location, linkedinUrl },
 *     bdr: { emails: ['primary@x.com', 'alias@x.com'], name: 'Scott Smith' },
 *     meetingDate: Date | null,
 *     messages: [{ fromBdr: true|false, text: '...', at: Date|null }],   // oldest first
 *     getEmployers: async () => [{ name, role, summary }],               // summary optional
 *     captureSnapshot: async ({ includeDraft }) => 'data:image/png;base64,...',
 *     hasDraft: () => boolean                                            // optional
 *   });
 */
(function () {
    'use strict';

    if (window.PandoMeetingNotify) return;

    const RAILWAY = 'https://railwayclemail-production.up.railway.app';
    const AI_MODEL = 'anthropic/claude-opus-4.7';
    const EMPLOYER_MODEL = AI_MODEL + ':online'; // web-enabled, same as the employer cards on Index Admin
    const SENDER_DOMAIN = 'pandonetworking.com';
    const SENDER_FIRST_NAMES = ['taylor', 'sam', 'joe'];
    const NOTIFIED_KEY_PREFIX = 'pandoMeetingNotified:';
    const MAX_TRANSCRIPT_MESSAGES = 25;
    const MAX_MESSAGE_CHARS = 700;

    // ── Small helpers ────────────────────────────────────────────────────────────
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const nl2br = (s) => esc(s).replace(/\r?\n/g, '<br>');
    const lower = (s) => String(s || '').trim().toLowerCase();
    const isEmail = (s) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s || '').trim());
    const splitEmails = (s) => String(s || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    const firstNameOf = (s) => String(s || '').trim().split(/\s+/)[0] || '';

    function toDate(v) {
        if (!v) return null;
        if (v instanceof Date) return isNaN(v) ? null : v;
        if (typeof v.toDate === 'function') return v.toDate();
        if (v.seconds !== undefined) return new Date(v.seconds * 1000);
        if (v._seconds !== undefined) return new Date(v._seconds * 1000);
        const d = new Date(v);
        return isNaN(d) ? null : d;
    }

    function toLocalInputValue(d) {
        if (!d) return '';
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    function describeMeetingDate(d) {
        if (!d) return '';
        const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
        const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
        const rel = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : `${Math.abs(days)} day(s) ago`;
        return `${day} at ${time} (${rel})`;
    }

    async function authHeaders() {
        if (!window.auth || !window.auth.currentUser) throw new Error('Not signed in');
        const token = await window.auth.currentUser.getIdToken();
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    }

    async function callAi(prompt, opts = {}) {
        const resp = await fetch(`${RAILWAY}/api/ai-profile-eval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: 'openrouter',
                model: opts.model || AI_MODEL,
                prompt,
                temperature: opts.temperature ?? 0.5,
                max_tokens: opts.max_tokens ?? 900
            })
        });
        if (!resp.ok) throw new Error(`AI request failed (HTTP ${resp.status})`);
        const data = await resp.json();
        const text = String(data.message || data.response || '').trim();
        if (!text) throw new Error('Empty AI response');
        return text;
    }

    // ── Data: BDR settings + sender mailboxes ────────────────────────────────────
    let _leadersCache = { at: 0, list: null };
    async function loadBdrLeaders() {
        if (_leadersCache.list && Date.now() - _leadersCache.at < 60000) return _leadersCache.list;
        const { collection, getDocs } = window.clemailFirestore;
        const snap = await getDocs(collection(window.clemailDb, 'bdr_leaders'));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        _leadersCache = { at: Date.now(), list };
        return list;
    }

    function findBdr(leaders, emails, name) {
        const set = new Set((emails || []).map(lower).filter(Boolean));
        let hit = leaders.find(b => set.has(lower(b.primaryEmail)));
        if (!hit) hit = leaders.find(b => set.has(lower(b.linkedInEmail)) || (b.emailAccountIds || []).some(e => set.has(lower(e))));
        if (!hit && name) hit = leaders.find(b => lower(b.name) === lower(name));
        return hit || null;
    }

    let _sendersCache = { at: 0, list: null };
    async function loadSenders() {
        if (_sendersCache.list && Date.now() - _sendersCache.at < 60000) return _sendersCache.list;
        const res = await fetch(`${RAILWAY}/oauth/accounts/signatures`, { headers: await authHeaders() });
        if (!res.ok) throw new Error(`Could not load mailboxes (HTTP ${res.status})`);
        const { accounts } = await res.json();
        const org = (accounts || []).filter(a =>
            a.status !== 'expired' && lower(a.email).endsWith('@' + SENDER_DOMAIN));
        const first = (s) => lower(s).split(/[\s._-]+/)[0];
        const named = org.filter(a =>
            SENDER_FIRST_NAMES.includes(first(String(a.email).split('@')[0])) || SENDER_FIRST_NAMES.includes(first(a.displayName)));
        const list = (named.length ? named : org).map(a => ({
            accountId: a.accountId,
            provider: a.provider,
            email: lower(a.email),
            displayName: a.displayName && !String(a.displayName).includes('@') ? a.displayName : '',
            signatureHtml: a.signatureHtml || '',
            signatureText: a.signatureText || ''
        }));
        _sendersCache = { at: Date.now(), list };
        return list;
    }

    function senderFirstName(sender) {
        if (!sender) return '';
        if (sender.displayName) return firstNameOf(sender.displayName);
        const local = sender.email.split('@')[0].split(/[._-]/)[0];
        return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
    }

    function signatureHtmlFor(sender) {
        if (!sender) return '';
        if (String(sender.signatureHtml).replace(/<[^>]*>/g, '').trim()) return sender.signatureHtml;
        if (String(sender.signatureText).trim()) return nl2br(sender.signatureText);
        return '';
    }

    // ── Employer research (used when the host page has no summary yet) ───────────
    function cleanSummary(text) {
        return String(text || '')
            .replace(/```[a-z]*\n?/gi, '')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
            .replace(/\[\d+\]/g, '')
            .replace(/\*\*|__/g, '')
            .replace(/\s*[\u2014\u2013]\s*/g, ', ')   // no em/en dashes anywhere in these emails
            .replace(/\s*\n+\s*/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    async function summarizeCompany(name, role) {
        const prompt = `Use web search to research the company "${name}"${role ? ` (a person works there as "${role}", which may help you pick the right company if the name is ambiguous)` : ''}.

Write ONE paragraph (3-5 sentences, under 700 characters) summarizing what the company is and what it does: the kind of company, its main products or services, who its customers or markets are, and (only if easy to find) its headquarters and approximate size.

Rules:
- Plain text only: no markdown, no bullet points, no headings, no citations or links, no preamble.
- Only state facts you found; never invent details.
- If you cannot confidently identify the company, say so in a single sentence instead of guessing.`;
        return cleanSummary(await callAi(prompt, { model: EMPLOYER_MODEL, temperature: 0.2, max_tokens: 700 }));
    }

    function buildDetailsText(employers) {
        const withText = (employers || []).filter(e => e && e.summary);
        return withText.map(e => {
            const s = String(e.summary).trim();
            const startsWithName = lower(s).startsWith(lower(e.name));
            return withText.length > 1 && !startsWithName ? `${e.name}: ${s}` : s;
        }).join('\n\n');
    }

    // ── The AI prompt ────────────────────────────────────────────────────────────
    function buildPrompt(S) {
        const sender = senderFirstName(S.sender) || 'the sender';
        const bdrName = S.bdrDoc?.name || S.ctx.bdr?.name || 'the BDR';
        const greeting = (S.bdrDoc?.meetingEmailGreeting || '').trim() || firstNameOf(bdrName) || 'there';
        const c = S.ctx.contact || {};
        const contactLine = [c.name, c.title && `title: ${c.title}`, c.company && `company: ${c.company}`, c.location && `location: ${c.location}`]
            .filter(Boolean).join(' | ');

        const msgs = (S.ctx.messages || []).filter(m => m && String(m.text || '').trim()).slice(-MAX_TRANSCRIPT_MESSAGES);
        const contactFirst = c.firstName || firstNameOf(c.name) || 'Contact';
        const transcript = msgs.map(m => {
            const who = m.fromBdr ? 'US (Pando, on behalf of the BDR)' : contactFirst.toUpperCase();
            let t = String(m.text).replace(/\s+/g, ' ').trim();
            if (t.length > MAX_MESSAGE_CHARS) t = t.slice(0, MAX_MESSAGE_CHARS) + '...';
            return `${who}: ${t}`;
        }).join('\n') || '(no conversation text available)';

        const meeting = S.meetingDate ? describeMeetingDate(S.meetingDate) : 'NOT PROVIDED (do not mention or guess a date or time)';
        const perBdr = (S.bdrDoc?.meetingEmailAiNotes || '').trim();
        const extra = (S.el.aiNotes.value || '').trim();
        const hasEmployerDetails = !!S.el.incDetails.checked;

        return `You are ${sender}, writing a quick email to a business development rep (BDR) because your team at Pando Executive Networking just scheduled a meeting for them. Write exactly the way ${sender} writes these personally. The BDR must not be able to tell this was drafted by AI or by a tool.

HOW ${sender.toUpperCase()} WRITES THESE (follow closely)
- The flow is: booking news, then the person and context, then an honest assessment, then timing or an action needed (only if something needs doing).
- Start immediately. The first words are "${greeting}-" and then the news on the same line, for example "${greeting}- Just scheduled you with ...". No "Hi", no "Hope you are well", no introduction of yourself.
- Opening language comes from phrases like: "Booked you with...", "Got you another meeting...", "Just scheduled you...", "You should have just gotten a meeting request...". Pick the one that fits. Do not stack them.
- Explain why the meeting matters in plain language using the person's role, their company, or what they actually said in the conversation.
- Keep a candid assessment. Phrases in this spirit are natural: "Seems like a good meeting." "I think this meeting is really promising." If qualification is light, say so plainly. Preserve honesty. Never invent enthusiasm or concerns.
- Short fragments are good. ("Booked for next week.") Keep logistics conversational: "You are scheduled for October 29th." Make a direct request only when something needs doing.
- Close lightly: "Thanks-", "Thanks!", or no closing at all. No formal sign-off and no name at the end, because the signature is added automatically.
- This is a brief personal note, usually 2 to 5 short sentences. The system appends the conversation snapshot${hasEmployerDetails ? ' and a "Here is a bit about them:" section with company details' : ''} below your note, so do NOT restate company details, do NOT paste or summarize the whole conversation, and do NOT write "Here is a bit about them:" yourself.

HARD RULES
- Plain text only. No markdown, no bullets, no bold, no emoji, no placeholders like [Name].
- Never use em dashes or en dashes. Use commas, periods, or separate sentences. The only dash allowed is the hyphen right after the greeting name.
- Use only facts from the context below. Never invent a reason for the meeting, pain points, budget, authority, enthusiasm, or concerns. If nothing supports calling the meeting strong, do not call it strong. If the conversation shows only that they agreed to a call, say that plainly.
- If the meeting date is not provided, do not mention a date or time.
- Do not mention AI, automation, or tools.

WHO YOU ARE WRITING TO
BDR: ${bdrName}. Open with: ${greeting}-
${perBdr ? `\nNOTES ABOUT THIS BDR (from the account manager, follow these):\n${perBdr}\n` : ''}
THE MEETING
Contact: ${contactLine || '(unknown)'}
Meeting date and time: ${meeting}
Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
${extra ? `\nYOUR OWN NOTES FOR THIS EMAIL (the sender's real take; weave it in and keep the sender's candor):\n${extra}\n` : '\nThe sender gave no extra assessment for this one. Stay factual from the conversation and do not add praise or doubts you cannot support.\n'}
CONVERSATION (oldest to newest)
${transcript}

OUTPUT FORMAT (exactly this, nothing else)
SUBJECT: <a short, plain subject written the way a person would type it, under 8 words, no exclamation marks, no "Meeting Booked" announcement style, for example "Meeting with Jane Doe at Acme">
BODY:
<the email note>`;
    }

    function parseDraft(raw) {
        let t = String(raw || '').trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
        let subject = '';
        let body = t;
        const m = t.match(/^\s*SUBJECT:\s*(.+?)\s*\n+\s*(?:BODY:\s*\n?)?([\s\S]*)$/i);
        if (m) { subject = m[1].trim(); body = m[2].trim(); }
        const clean = (s) => s
            .replace(/^(\S+?)\s*[\u2014\u2013]\s*/, '$1- ')     // "Scott— Just" -> "Scott- Just"
            .replace(/\s*[\u2014\u2013]\s*/g, ', ')             // any other long dash
            .replace(/[ \t]+\n/g, '\n')
            .trim();
        return { subject: clean(subject).replace(/^["']|["']$/g, ''), body: clean(body.replace(/^["']|["']$/g, '')) };
    }

    // ── Styles ───────────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('pmn-styles')) return;
        const st = document.createElement('style');
        st.id = 'pmn-styles';
        st.textContent = `
        #pmn-overlay{position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif}
        #pmn-box{background:#fff;border-radius:14px;width:min(1180px,100%);max-height:94vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden}
        .pmn-head{background:#12314C;color:#fff;padding:.9rem 1.25rem;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #B9A77E}
        .pmn-head h3{margin:0;font-size:1.05rem;font-weight:700;display:flex;gap:.55rem;align-items:center}
        .pmn-head .pmn-sub{font-size:.78rem;color:#cbd5e1;font-weight:400;margin-top:2px}
        .pmn-x{background:none;border:none;color:#fff;font-size:1.5rem;line-height:1;cursor:pointer;opacity:.8}
        .pmn-x:hover{opacity:1}
        .pmn-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;overflow:hidden;min-height:0;flex:1}
        .pmn-col{padding:1rem 1.25rem;overflow-y:auto;min-height:0}
        .pmn-col.pmn-form{border-right:1px solid #e2e8f0}
        .pmn-col.pmn-prev{background:#f8fafc}
        @media (max-width:900px){.pmn-body{grid-template-columns:1fr;overflow-y:auto}.pmn-col{overflow:visible}.pmn-col.pmn-form{border-right:none}}
        .pmn-row{margin-bottom:.8rem}
        .pmn-row label.pmn-l{display:block;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#475569;margin-bottom:.25rem}
        .pmn-row .pmn-hint{font-size:.74rem;color:#64748b;margin-top:.2rem}
        .pmn-in,.pmn-ta,.pmn-sel{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:.5rem .65rem;font:inherit;font-size:.88rem;color:#0f172a;background:#fff}
        .pmn-ta{resize:vertical;line-height:1.45}
        .pmn-in:focus,.pmn-ta:focus,.pmn-sel:focus{outline:2px solid #94AD82;border-color:#94AD82}
        .pmn-2{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
        .pmn-chk{display:flex;gap:.5rem;align-items:flex-start;font-size:.84rem;color:#1e293b;margin:.3rem 0;cursor:pointer}
        .pmn-chk input{margin-top:.2rem}
        .pmn-btn{border:none;border-radius:8px;padding:.55rem 1rem;font-weight:600;font-size:.85rem;cursor:pointer;display:inline-flex;gap:.4rem;align-items:center}
        .pmn-btn:disabled{opacity:.55;cursor:not-allowed}
        .pmn-btn.pri{background:#12314C;color:#fff}
        .pmn-btn.pri:hover:not(:disabled){background:#1a4468}
        .pmn-btn.ai{background:#4E6E4A;color:#fff}
        .pmn-btn.ai:hover:not(:disabled){background:#5e8359}
        .pmn-btn.sec{background:#fff;color:#475569;border:1px solid #cbd5e1}
        .pmn-foot{padding:.8rem 1.25rem;border-top:1px solid #e2e8f0;display:flex;gap:.6rem;align-items:center;justify-content:space-between;background:#fff;flex-wrap:wrap}
        .pmn-status{font-size:.8rem;color:#475569;flex:1;min-width:200px}
        .pmn-status.err{color:#b91c1c}
        .pmn-status.ok{color:#15803d}
        .pmn-warn{background:#fffbeb;border:1px solid #fcd34d;color:#92400e;border-radius:8px;padding:.5rem .7rem;font-size:.8rem;margin-bottom:.7rem}
        .pmn-warn.bad{background:#fef2f2;border-color:#fca5a5;color:#991b1b}
        .pmn-ptitle{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#475569;margin-bottom:.4rem}
        .pmn-meta{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:.5rem .75rem;font-size:.8rem;color:#334155;margin-bottom:.6rem;line-height:1.5}
        .pmn-meta b{color:#0f172a}
        #pmn-frame{width:100%;height:520px;border:1px solid #e2e8f0;border-radius:8px;background:#fff}
        .pmn-toast{position:fixed;right:1.2rem;bottom:1.2rem;background:#12314C;color:#fff;padding:.7rem 1.1rem;border-radius:10px;font-size:.88rem;z-index:100001;box-shadow:0 8px 24px rgba(0,0,0,.3)}
        `;
        document.head.appendChild(st);
    }

    function toast(msg) {
        const t = document.createElement('div');
        t.className = 'pmn-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4500);
    }

    // ── Notified-before memory ───────────────────────────────────────────────────
    function getNotified(key) {
        try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY_PREFIX + key) || 'null'); } catch (_) { return null; }
    }
    function setNotified(key, info) {
        try { localStorage.setItem(NOTIFIED_KEY_PREFIX + key, JSON.stringify(info)); } catch (_) { /* ignore */ }
    }

    // ── The dialog ───────────────────────────────────────────────────────────────
    async function open(ctx) {
        injectStyles();
        close(); // only one at a time

        const S = {
            ctx,
            sender: null, senders: [], bdrDoc: null,
            meetingDate: toDate(ctx.meetingDate),
            employers: [], snapshotUrl: '', snapshotW: 720, snapshotBusy: false,
            subjectTouched: false, noteTouched: false, detailsTouched: false,
            generating: false, sending: false, closed: false, el: {}
        };
        window.__pmnState = S;

        const overlay = document.createElement('div');
        overlay.id = 'pmn-overlay';
        overlay.innerHTML = `
          <div id="pmn-box" role="dialog" aria-modal="true" aria-label="Notify BDR of scheduled meeting">
            <div class="pmn-head">
              <div>
                <h3><i class="fas fa-calendar-check"></i> Notify BDR: meeting scheduled</h3>
                <div class="pmn-sub">${esc((ctx.contact && ctx.contact.name) || 'Contact')}${ctx.contact && ctx.contact.company ? ' · ' + esc(ctx.contact.company) : ''}</div>
              </div>
              <button class="pmn-x" id="pmn-close" title="Close">&times;</button>
            </div>
            <div class="pmn-body">
              <div class="pmn-col pmn-form">
                <div id="pmn-warnings"></div>
                <div class="pmn-row">
                  <label class="pmn-l" for="pmn-from">From</label>
                  <select class="pmn-sel" id="pmn-from"><option>Loading mailboxes…</option></select>
                  <div class="pmn-hint" id="pmn-sig-hint"></div>
                </div>
                <div class="pmn-2">
                  <div class="pmn-row">
                    <label class="pmn-l" for="pmn-to">To</label>
                    <input class="pmn-in" id="pmn-to" type="text" placeholder="bdr@company.com">
                  </div>
                  <div class="pmn-row">
                    <label class="pmn-l" for="pmn-cc">CC</label>
                    <input class="pmn-in" id="pmn-cc" type="text" placeholder="(none)">
                  </div>
                </div>
                <div class="pmn-row">
                  <label class="pmn-l" for="pmn-subject">Subject</label>
                  <input class="pmn-in" id="pmn-subject" type="text">
                </div>
                <div class="pmn-row">
                  <label class="pmn-l" for="pmn-when">Meeting date and time</label>
                  <input class="pmn-in" id="pmn-when" type="datetime-local" value="${esc(toLocalInputValue(S.meetingDate))}">
                  <div class="pmn-hint">Used by the AI when it writes the note. Leave blank and it will not mention a date.</div>
                </div>
                <div class="pmn-row">
                  <label class="pmn-l" for="pmn-ainotes">Your take (optional)</label>
                  <textarea class="pmn-ta" id="pmn-ainotes" rows="2" placeholder="Your honest read, or anything the AI should know for this one. e.g. &quot;Light qualification but she asked for the call.&quot; or &quot;Invite just went out, ask him to accept.&quot;"></textarea>
                  <div style="margin-top:.4rem"><button class="pmn-btn ai" id="pmn-gen"><i class="fas fa-wand-magic-sparkles"></i> <span id="pmn-gen-label">Write with AI</span></button></div>
                </div>
                <div class="pmn-row">
                  <label class="pmn-l" for="pmn-note">Personal note</label>
                  <textarea class="pmn-ta" id="pmn-note" rows="6" placeholder="Drafting…"></textarea>
                </div>
                <div class="pmn-row">
                  <label class="pmn-chk"><input type="checkbox" id="pmn-inc-details" checked> <span>Add "Here is a bit about them:" with the employer details</span></label>
                  <textarea class="pmn-ta" id="pmn-details" rows="6" placeholder="Researching their employers…"></textarea>
                  <div class="pmn-hint" id="pmn-details-hint"></div>
                </div>
                <div class="pmn-row">
                  <label class="pmn-chk"><input type="checkbox" id="pmn-inc-snap" checked> <span>Attach the conversation snapshot</span></label>
                  <label class="pmn-chk" id="pmn-snapfirst-row"><input type="checkbox" id="pmn-snap-first"> <span>Put the snapshot above the employer details</span></label>
                  <label class="pmn-chk" id="pmn-draft-row" style="display:none"><input type="checkbox" id="pmn-inc-draft"> <span>Include my unsent reply draft in the snapshot as if it was sent</span></label>
                  <div class="pmn-hint" id="pmn-snap-hint"></div>
                </div>
              </div>
              <div class="pmn-col pmn-prev">
                <div class="pmn-ptitle">Preview (what the BDR will see)</div>
                <div class="pmn-meta" id="pmn-meta"></div>
                <iframe id="pmn-frame" sandbox title="Email preview"></iframe>
              </div>
            </div>
            <div class="pmn-foot">
              <div class="pmn-status" id="pmn-status">Loading…</div>
              <div style="display:flex;gap:.5rem">
                <button class="pmn-btn sec" id="pmn-cancel">Cancel</button>
                <button class="pmn-btn pri" id="pmn-send" disabled><i class="fas fa-paper-plane"></i> Send email</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        const $ = (id) => overlay.querySelector('#' + id);
        S.el = {
            from: $('pmn-from'), sigHint: $('pmn-sig-hint'), to: $('pmn-to'), cc: $('pmn-cc'), subject: $('pmn-subject'),
            when: $('pmn-when'), aiNotes: $('pmn-ainotes'), gen: $('pmn-gen'), genLabel: $('pmn-gen-label'),
            note: $('pmn-note'), incDetails: $('pmn-inc-details'), details: $('pmn-details'), detailsHint: $('pmn-details-hint'),
            incSnap: $('pmn-inc-snap'), snapFirst: $('pmn-snap-first'), draftRow: $('pmn-draft-row'), incDraft: $('pmn-inc-draft'),
            snapHint: $('pmn-snap-hint'), warnings: $('pmn-warnings'), meta: $('pmn-meta'), frame: $('pmn-frame'),
            status: $('pmn-status'), send: $('pmn-send'), cancel: $('pmn-cancel')
        };

        const setStatus = (msg, cls) => { S.el.status.textContent = msg || ''; S.el.status.className = 'pmn-status' + (cls ? ' ' + cls : ''); };
        S.setStatus = setStatus;

        $('pmn-close').onclick = close;
        S.el.cancel.onclick = close;
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) S._downOnOverlay = true; else S._downOnOverlay = false; });
        overlay.addEventListener('click', (e) => { if (e.target === overlay && S._downOnOverlay && !S.sending) close(); });
        document.addEventListener('keydown', onKey);

        S.el.subject.addEventListener('input', () => { S.subjectTouched = true; refreshPreview(S); });
        S.el.note.addEventListener('input', () => { S.noteTouched = true; refreshPreview(S); });
        S.el.details.addEventListener('input', () => { S.detailsTouched = true; refreshPreview(S); });
        ['to', 'cc'].forEach(k => S.el[k].addEventListener('input', () => refreshPreview(S)));
        S.el.from.addEventListener('change', () => { S.sender = S.senders.find(a => a.email === S.el.from.value) || null; refreshPreview(S); });
        S.el.when.addEventListener('change', () => { S.meetingDate = S.el.when.value ? new Date(S.el.when.value) : null; refreshPreview(S); });
        [S.el.incDetails, S.el.incSnap, S.el.snapFirst].forEach(el => el.addEventListener('change', () => refreshPreview(S)));
        S.el.incDraft.addEventListener('change', () => captureSnapshot(S));
        S.el.gen.onclick = () => generate(S);
        S.el.send.onclick = () => send(S);

        // Kick everything off in parallel. Mailboxes + BDR settings gate the AI draft; employers and
        // the snapshot run alongside it.
        setStatus('Loading BDR settings and mailboxes…');
        const settingsP = Promise.all([
            loadBdrLeaders().catch(err => { console.warn('[MeetingNotify] bdr_leaders failed:', err.message); return []; }),
            loadSenders().catch(err => { S.sendersError = err.message; return []; })
        ]).then(([leaders, senders]) => {
            if (S.closed) return;
            S.senders = senders;
            S.bdrDoc = findBdr(leaders, ctx.bdr && ctx.bdr.emails, ctx.bdr && ctx.bdr.name);
            applySettings(S);
        });

        loadEmployers(S);
        if (typeof ctx.hasDraft === 'function' && ctx.hasDraft()) S.el.draftRow.style.display = 'flex';
        captureSnapshot(S);

        await settingsP;
        if (S.closed) return;
        refreshPreview(S);
        await generate(S);
    }

    function onKey(e) {
        if (e.key === 'Escape' && !(window.__pmnState && window.__pmnState.sending)) close();
    }

    function close() {
        document.removeEventListener('keydown', onKey);
        const o = document.getElementById('pmn-overlay');
        if (o) o.remove();
        if (window.__pmnState) window.__pmnState.closed = true;
        window.__pmnState = null;
    }

    function applySettings(S) {
        const { el, bdrDoc, ctx } = S;
        const warnings = [];

        // Sender dropdown
        if (S.senders.length) {
            el.from.innerHTML = S.senders.map(a =>
                `<option value="${esc(a.email)}">${esc((a.displayName ? a.displayName + ' ' : '') + '<' + a.email + '>')}</option>`).join('');
            const me = lower(window.auth && window.auth.currentUser && window.auth.currentUser.email);
            const pick = S.senders.find(a => a.email === lower(bdrDoc && bdrDoc.meetingEmailFromEmail))
                || S.senders.find(a => a.email === me)
                || S.senders[0];
            el.from.value = pick.email;
            S.sender = pick;
        } else {
            el.from.innerHTML = '<option value="">No sending mailbox available</option>';
            warnings.push({ bad: true, text: S.sendersError
                ? `Could not load the connected mailboxes (${esc(S.sendersError)}). Refresh and try again.`
                : `No connected @${SENDER_DOMAIN} mailbox was found. Connect Taylor, Sam or Joe on the OAuth Email Connections page first.` });
        }

        // Recipients
        if (bdrDoc) {
            el.to.value = (bdrDoc.meetingEmailTo || bdrDoc.primaryEmail || '').trim();
            el.cc.value = (bdrDoc.meetingEmailCc || '').trim();
            if (!bdrDoc.meetingEmailTo && !bdrDoc.meetingEmailCc && !bdrDoc.meetingEmailAiNotes) {
                warnings.push({ text: `Nothing is set up for ${esc(bdrDoc.name || 'this BDR')} yet, so it defaulted to their primary email. Set To, CC and AI notes under <b>Meeting Booked Email</b> on the BDR Review Settings page.` });
            }
        } else {
            warnings.push({ text: `Could not match this conversation to a BDR (${esc(((ctx.bdr && ctx.bdr.emails) || []).filter(Boolean).join(', ') || 'no email')}). Fill in To by hand.` });
            el.to.value = '';
        }

        if (!S.meetingDate) warnings.push({ text: 'No meeting date is recorded for this contact. Add one above for a better note.' });

        el.warnings.innerHTML = warnings.map(w => `<div class="pmn-warn${w.bad ? ' bad' : ''}">${w.text}</div>`).join('');
        updateSigHint(S);
    }

    function updateSigHint(S) {
        const sig = signatureHtmlFor(S.sender);
        S.el.sigHint.innerHTML = !S.sender ? ''
            : sig ? `<span style="color:#15803d"><i class="fas fa-check-circle"></i> ${esc(senderFirstName(S.sender))}'s saved signature will be added.</span>`
                  : `<span style="color:#b91c1c"><i class="fas fa-exclamation-triangle"></i> No signature is saved for ${esc(S.sender.email)}. Add one on the OAuth Email Connections page, or it will send without one.</span>`;
    }

    // ── Employers ────────────────────────────────────────────────────────────────
    async function loadEmployers(S) {
        const { el, ctx } = S;
        el.detailsHint.textContent = 'Researching their employers…';
        try {
            let list = typeof ctx.getEmployers === 'function' ? await ctx.getEmployers() : [];
            list = (list || []).filter(e => e && e.name).map(e => ({ name: e.name, role: e.role || '', summary: e.summary || '' }));
            if (!list.length && ctx.contact && ctx.contact.company) {
                list = [{ name: ctx.contact.company, role: ctx.contact.title || '', summary: '' }];
            }
            S.employers = list;
            applyDetails(S);
            await Promise.all(list.filter(e => !e.summary).map(async e => {
                try { e.summary = await summarizeCompany(e.name, e.role); }
                catch (err) { e.error = err.message; }
                if (!S.closed) applyDetails(S);
            }));
            if (S.closed) return;
            const failed = list.filter(e => !e.summary);
            el.detailsHint.textContent = !list.length
                ? 'No employer found for this contact, so there is nothing to add here.'
                : failed.length ? `Could not research ${failed.map(e => e.name).join(', ')}. Type it in or uncheck the box.`
                : 'Researched from the contact\'s profile. Edit freely.';
            if (!list.length) el.incDetails.checked = false;
        } catch (err) {
            if (S.closed) return;
            el.detailsHint.textContent = 'Could not load employer details: ' + err.message;
        }
    }

    function applyDetails(S) {
        if (S.detailsTouched) { refreshPreview(S); return; }
        S.el.details.value = buildDetailsText(S.employers);
        refreshPreview(S);
    }

    // ── Snapshot ─────────────────────────────────────────────────────────────────
    async function captureSnapshot(S) {
        const { el, ctx } = S;
        if (typeof ctx.captureSnapshot !== 'function') { el.incSnap.checked = false; el.incSnap.disabled = true; return; }
        S.snapshotBusy = true;
        el.snapHint.textContent = 'Capturing the conversation snapshot…';
        refreshSendState(S);
        try {
            const url = await ctx.captureSnapshot({ includeDraft: !!el.incDraft.checked });
            if (S.closed) return;
            if (!url) throw new Error('No image returned');
            S.snapshotUrl = url;
            // Read the real pixel width so the <img> is pasted at its native size (never stalls the dialog).
            await new Promise(res => {
                const im = new Image();
                const t = setTimeout(res, 2000);
                im.onload = () => { clearTimeout(t); S.snapshotW = im.naturalWidth || 720; res(); };
                im.onerror = () => { clearTimeout(t); res(); };
                im.src = url;
            });
            el.snapHint.textContent = `Snapshot ready (${S.snapshotW}px wide). It is pasted into the email like a screenshot.`;
        } catch (err) {
            if (S.closed) return;
            S.snapshotUrl = '';
            el.incSnap.checked = false;
            el.snapHint.textContent = 'Could not capture the snapshot: ' + err.message;
        } finally {
            S.snapshotBusy = false;
            if (!S.closed) { refreshPreview(S); refreshSendState(S); }
        }
    }

    // ── AI draft ─────────────────────────────────────────────────────────────────
    async function generate(S) {
        if (S.generating || S.closed) return;
        S.generating = true;
        const { el } = S;
        el.gen.disabled = true;
        el.genLabel.textContent = 'Writing…';
        if (!el.note.value.trim()) el.note.placeholder = 'Drafting…';
        S.setStatus('AI is drafting the note…');
        refreshSendState(S);
        try {
            const raw = await callAi(buildPrompt(S), { temperature: 0.5, max_tokens: 700 });
            if (S.closed) return;
            const draft = parseDraft(raw);
            if (!draft.body) throw new Error('The AI returned an empty note');
            el.note.value = draft.body;
            S.noteTouched = false;
            if (draft.subject && (!S.subjectTouched || !el.subject.value.trim())) {
                el.subject.value = draft.subject;
                S.subjectTouched = false;
            }
            if (!el.subject.value.trim()) {
                el.subject.value = `Meeting with ${(S.ctx.contact && S.ctx.contact.name) || 'new contact'}`;
            }
            S.setStatus('Draft ready. Read it, adjust anything, then send.', 'ok');
        } catch (err) {
            if (S.closed) return;
            console.error('[MeetingNotify] AI draft failed:', err);
            S.setStatus('The AI draft failed: ' + err.message + '. You can write the note yourself or try again.', 'err');
            if (!el.subject.value.trim()) el.subject.value = `Meeting with ${(S.ctx.contact && S.ctx.contact.name) || 'new contact'}`;
        } finally {
            S.generating = false;
            if (!S.closed) {
                el.gen.disabled = false;
                el.genLabel.textContent = el.note.value.trim() ? 'Rewrite with AI' : 'Write with AI';
                refreshPreview(S);
                refreshSendState(S);
            }
        }
    }

    // ── Email assembly ───────────────────────────────────────────────────────────
    function snapshotIsInline(S) {
        return !!(S.sender && S.sender.accountId && S.sender.accountId.startsWith('microsoft_'));
    }

    /**
     * Same structure as the OAuth Email Connections test sender: plain <div> blocks with no custom
     * fonts or colors, so the recipient's mail client renders it in its own default style, with the
     * sender's saved signature underneath.
     * @param {boolean} forPreview  inline the snapshot even for providers that need it attached
     */
    function buildEmailHtml(S, forPreview) {
        const note = S.el.note.value.trim();
        const details = S.el.details.value.trim();
        const blocks = [];
        const snap = (S.el.incSnap.checked && S.snapshotUrl && (forPreview || snapshotIsInline(S)))
            ? `<div><br><img src="${S.snapshotUrl}" width="${S.snapshotW}" alt="Conversation snapshot" style="max-width:100%;height:auto"></div>` : '';
        const det = (S.el.incDetails.checked && details)
            ? `<div><br>Here is a bit about them:<br><br>${nl2br(details)}</div>` : '';

        blocks.push(`<div>${nl2br(note)}</div>`);
        if (S.el.snapFirst.checked) { blocks.push(snap, det); } else { blocks.push(det, snap); }
        const sig = signatureHtmlFor(S.sender);
        if (sig) blocks.push(`<br><div>${sig}</div>`);
        return blocks.filter(Boolean).join('\n');
    }

    function refreshPreview(S) {
        if (S.closed || !S.el.frame) return;
        const to = splitEmails(S.el.to.value);
        const cc = splitEmails(S.el.cc.value);
        const sender = S.sender;
        S.el.meta.innerHTML = `
            <div><b>From:</b> ${sender ? esc((sender.displayName ? sender.displayName + ' ' : '') + '<' + sender.email + '>') : '<i>no mailbox</i>'}</div>
            <div><b>To:</b> ${to.length ? esc(to.join(', ')) : '<i>none</i>'}</div>
            ${cc.length ? `<div><b>CC:</b> ${esc(cc.join(', '))}</div>` : ''}
            <div><b>Subject:</b> ${esc(S.el.subject.value || '(none)')}</div>`;
        S.el.frame.srcdoc = `<!doctype html><html><body style="margin:12px;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:14px;color:#000">${buildEmailHtml(S, true)}</body></html>`;
        updateSigHint(S);
        refreshSendState(S);
    }

    function refreshSendState(S) {
        if (S.closed || !S.el.send) return;
        const ready = !S.sending && !S.generating && !S.snapshotBusy && S.sender
            && S.el.note.value.trim() && S.el.subject.value.trim() && splitEmails(S.el.to.value).length;
        S.el.send.disabled = !ready;
    }

    // ── Send ─────────────────────────────────────────────────────────────────────
    async function send(S) {
        const { el, ctx } = S;
        const to = splitEmails(el.to.value);
        const cc = splitEmails(el.cc.value);
        const subject = el.subject.value.trim();
        const bad = [...to, ...cc].find(e => !isEmail(e));
        if (!S.sender) return S.setStatus('Pick a mailbox to send from.', 'err');
        if (!to.length) return S.setStatus('Add at least one To address.', 'err');
        if (bad) return S.setStatus(`"${bad}" is not a valid email address.`, 'err');
        if (!subject) return S.setStatus('Add a subject.', 'err');
        if (!el.note.value.trim()) return S.setStatus('The note is empty.', 'err');
        if (/\[[A-Za-z ]+\]|calendarlink/i.test(el.note.value + ' ' + el.subject.value)) {
            return S.setStatus('The note still has a placeholder in it. Replace it first.', 'err');
        }

        const prior = ctx.key ? getNotified(ctx.key) : null;
        if (prior && !confirm(`${prior.to || 'The BDR'} was already emailed about this meeting on ${new Date(prior.at).toLocaleString()}. Send another?`)) return;
        if (!signatureHtmlFor(S.sender) && !confirm(`There is no saved signature for ${S.sender.email}, so this will go out without one. Send anyway?`)) return;

        S.sending = true;
        el.send.disabled = true;
        el.send.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
        S.setStatus('Sending from ' + S.sender.email + '…');
        try {
            const payload = {
                accountId: S.sender.accountId,
                to: to.join(', '),
                subject,
                body: buildEmailHtml(S, false)
            };
            if (cc.length) payload.cc = cc.join(', ');
            // Outlook mailboxes get the snapshot inline (the backend converts it to a CID image, exactly
            // like a pasted screenshot). Gmail has no inline support there, so it goes as an attachment.
            if (el.incSnap.checked && S.snapshotUrl && !snapshotIsInline(S)) {
                payload.attachments = [{ filename: 'conversation_snapshot.png', contentType: 'image/png', contentBase64: S.snapshotUrl }];
            }
            const res = await fetch(`${RAILWAY}/oauth/test/send`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(payload) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);

            if (ctx.key) setNotified(ctx.key, { at: Date.now(), to: to.join(', '), from: S.sender.email });
            toast(`Sent to ${to.join(', ')} from ${S.sender.email}`);
            if (typeof ctx.onSent === 'function') { try { ctx.onSent({ to, cc, subject, from: S.sender.email }); } catch (_) { /* ignore */ } }
            close();
        } catch (err) {
            console.error('[MeetingNotify] send failed:', err);
            S.sending = false;
            el.send.innerHTML = '<i class="fas fa-paper-plane"></i> Send email';
            S.setStatus('Send failed: ' + err.message, 'err');
            refreshSendState(S);
        }
    }

    window.PandoMeetingNotify = {
        open,
        close,
        getNotified,
        // Exposed for the host pages' button labels
        wasNotified: (key) => !!getNotified(key)
    };
})();
