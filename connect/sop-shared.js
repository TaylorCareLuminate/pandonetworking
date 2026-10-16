/**
 * SOP Shared Library  (window.SopShared)
 * ======================================
 * Everything the SOP tool needs on more than one page:
 *
 *   • sop_builder.html  — builds / edits SOPs from call + training transcripts
 *   • index_admin.html  — searches SOPs and shows them in the step-by-step viewer
 *
 * SOPs live in Firestore (CLEmail project, via js/clemail-firestore-wrapper.js) in the
 * collection  sop_documents  — one doc per SOP, doc id = SOP id:
 *
 *   {
 *     id, title, summary, category, tags[], whenToUse, audience, prerequisites[],
 *     steps: [{ title, instruction, pageHref, pageTitle, tip, warning, verify }],
 *     troubleshooting: [{ problem, fix }],
 *     source: { name, date, trainer },
 *     createdAt, updatedAt (ISO strings), createdBy, updatedBy, revision
 *   }
 *
 * Also provides the editor (openEditor) and the verified check mark logic.
 * Requires js/clemail-firestore-wrapper.js to be loaded first (for load/save/remove).
 * Rendering / viewer helpers work without it.
 */
(function () {
    'use strict';

    const COLLECTION = 'sop_documents';

    // ── Small helpers ────────────────────────────────────────────────────────
    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Escaped text with **bold** (used for button / tab names) and line breaks.
    function richText(s) {
        return esc(s)
            .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    function slugify(s) {
        return String(s || 'sop').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'sop';
    }

    function newId(title) {
        return `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const asStr = v => (v == null ? '' : String(v).trim());
    const asList = v => (Array.isArray(v) ? v : []).map(asStr).filter(Boolean);

    // Page links must be plain relative page names (optionally ../folder/page.html with a
    // query string). Anything else — including javascript: URLs a model might emit — is
    // dropped, because these values end up in href attributes.
    const SAFE_HREF = /^(\.\.\/)?([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.html(\?[A-Za-z0-9_=&%.-]*)?(#[A-Za-z0-9_-]*)?$/;
    function safeHref(h) {
        const v = asStr(h);
        return SAFE_HREF.test(v) ? v : '';
    }

    /**
     * Coerces any object (AI output, Firestore doc, editor state) into the SOP shape.
     * validHrefs (optional Set of page file names) — links to pages that don't exist
     * are blanked and reported in sop._badLinks so the UI can flag them.
     */
    function normalize(raw, validHrefs) {
        const r = raw || {};
        const badLinks = [];
        const steps = (Array.isArray(r.steps) ? r.steps : []).map(s => {
            s = s || {};
            let href = safeHref(s.pageHref);
            if (href && validHrefs && !validHrefs.has(href.split(/[?#]/)[0])) {
                badLinks.push(href);
                href = '';
            }
            return {
                title: asStr(s.title),
                instruction: asStr(s.instruction),
                pageHref: href,
                pageTitle: href ? asStr(s.pageTitle) : '',
                tip: asStr(s.tip),
                warning: asStr(s.warning),
                verify: !!s.verify,
            };
        }).filter(s => s.title || s.instruction);

        const src = r.source || {};
        const ver = r.verification || {};
        return {
            verification: ver.verifiedAt ? {
                verifiedBy: asStr(ver.verifiedBy),
                verifiedAt: asStr(ver.verifiedAt),
                note: asStr(ver.note),
                revision: Number(ver.revision) || 1,
            } : null,
            id: asStr(r.id),
            title: asStr(r.title),
            summary: asStr(r.summary),
            category: asStr(r.category) || 'General',
            tags: asList(r.tags).map(t => t.toLowerCase()),
            whenToUse: asStr(r.whenToUse),
            audience: asStr(r.audience),
            prerequisites: asList(r.prerequisites),
            steps,
            troubleshooting: (Array.isArray(r.troubleshooting) ? r.troubleshooting : [])
                .map(t => ({ problem: asStr(t && t.problem), fix: asStr(t && t.fix) }))
                .filter(t => t.problem && t.fix),
            source: { name: asStr(src.name), date: asStr(src.date), trainer: asStr(src.trainer) },
            createdAt: asStr(r.createdAt),
            updatedAt: asStr(r.updatedAt),
            createdBy: asStr(r.createdBy),
            updatedBy: asStr(r.updatedBy),
            revision: Number(r.revision) || 1,
            _badLinks: badLinks,
        };
    }

    // ── Firestore access ─────────────────────────────────────────────────────
    function fs() {
        const f = window.clemailFirestore;
        if (!f) throw new Error('clemail-firestore-wrapper.js is not loaded');
        return f;
    }

    async function loadAll() {
        if (window.firebaseReady) await window.firebaseReady;
        const f = fs();
        const snap = await f.getDocs(f.collection(f.db, COLLECTION));
        const out = [];
        snap.forEach(d => {
            const sop = normalize({ ...d.data(), id: d.id });
            if (sop.title) out.push(sop);
        });
        out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        return out;
    }

    async function save(sop) {
        if (window.firebaseReady) await window.firebaseReady;
        const f = fs();
        const clean = normalize(sop);
        if (!clean.title) throw new Error('An SOP needs a title');
        if (!clean.steps.length) throw new Error('An SOP needs at least one step');
        const now = new Date().toISOString();
        const email = window.auth?.currentUser?.email || window.getCurrentAuthState?.()?.user?.email || '';
        clean.id = clean.id || newId(clean.title);
        clean.createdAt = clean.createdAt || now;
        clean.createdBy = clean.createdBy || email;
        clean.updatedAt = now;
        clean.updatedBy = email;
        delete clean._badLinks;
        await f.setDoc(f.doc(f.db, COLLECTION, clean.id), clean);
        return clean;
    }

    // ── Verification ─────────────────────────────────────────────────────────
    // A guide is "verified" when someone has followed it and confirmed it works.
    // The check mark applies to the revision that was verified: once the guide's
    // content is edited (revision goes up) the old verification no longer counts,
    // so a verified badge always means "this exact text was tested".
    //   'verified' – current revision verified
    //   'stale'    – was verified, but the guide has been edited since
    //   'none'     – never verified
    function verificationStatus(sop) {
        const v = sop && sop.verification;
        if (!v || !v.verifiedAt) return 'none';
        return Number(v.revision) === Number(sop.revision || 1) ? 'verified' : 'stale';
    }
    const isVerified = sop => verificationStatus(sop) === 'verified';

    // "taylor.davis@x.com" -> "taylor.davis"
    const whoIs = email => String(email || '').split('@')[0] || 'someone';

    function currentEmail() {
        return window.auth?.currentUser?.email || window.getCurrentAuthState?.()?.user?.email || '';
    }

    // Reads the latest copy, writes only the verification block (content, revision and
    // updatedAt are untouched), and returns the updated SOP.
    async function writeVerification(id, buildVerification) {
        if (window.firebaseReady) await window.firebaseReady;
        const f = fs();
        const ref = f.doc(f.db, COLLECTION, id);
        const snap = await f.getDoc(ref);
        const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
        if (!exists) throw new Error('This guide no longer exists');
        const sop = normalize({ ...snap.data(), id });
        sop.verification = buildVerification(sop);
        delete sop._badLinks;
        await f.setDoc(ref, sop);
        return normalize(sop);
    }

    function verify(id, note) {
        const email = currentEmail();
        if (!email) return Promise.reject(new Error('You need to be signed in to verify a guide'));
        return writeVerification(id, sop => ({
            verifiedBy: email,
            verifiedAt: new Date().toISOString(),
            note: asStr(note),
            revision: sop.revision || 1,
        }));
    }

    function unverify(id) {
        return writeVerification(id, () => null);
    }

    async function remove(id) {
        if (window.firebaseReady) await window.firebaseReady;
        const f = fs();
        await f.deleteDoc(f.doc(f.db, COLLECTION, id));
    }

    // ── Rendering ────────────────────────────────────────────────────────────
    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function pageLink(href, title, label) {
        if (!href) return '';
        return `<a class="sop-page-link" href="${esc(href)}" target="_blank" rel="noopener">` +
            `<i class="fas fa-up-right-from-square"></i> ${esc(label || title || href)}</a>`;
    }

    /** The full step-by-step body (no outer chrome). Safe to inject with innerHTML. */
    function renderBody(sop) {
        const s = normalize(sop);
        const parts = [];

        if (s.summary) parts.push(`<p class="sop-summary">${richText(s.summary)}</p>`);

        const facts = [];
        if (s.whenToUse) facts.push(`<div class="sop-fact"><div class="sop-fact-label"><i class="fas fa-bullseye"></i> When to use this</div>${richText(s.whenToUse)}</div>`);
        if (s.audience) facts.push(`<div class="sop-fact"><div class="sop-fact-label"><i class="fas fa-user-group"></i> Who does this</div>${richText(s.audience)}</div>`);
        if (s.prerequisites.length) {
            facts.push(`<div class="sop-fact"><div class="sop-fact-label"><i class="fas fa-list-check"></i> Before you start</div><ul>${
                s.prerequisites.map(p => `<li>${richText(p)}</li>`).join('')}</ul></div>`);
        }
        if (facts.length) parts.push(`<div class="sop-facts">${facts.join('')}</div>`);

        parts.push('<ol class="sop-steps">' + s.steps.map((st, i) => `
            <li class="sop-step">
                <div class="sop-step-num">${i + 1}</div>
                <div class="sop-step-body">
                    ${st.title ? `<div class="sop-step-title">${richText(st.title)}</div>` : ''}
                    ${st.instruction ? `<div class="sop-step-text">${richText(st.instruction)}</div>` : ''}
                    ${st.pageHref ? `<div class="sop-step-page">${pageLink(st.pageHref, st.pageTitle, 'Open ' + (st.pageTitle || st.pageHref))}</div>` : ''}
                    ${st.tip ? `<div class="sop-callout sop-tip"><i class="fas fa-lightbulb"></i><div>${richText(st.tip)}</div></div>` : ''}
                    ${st.warning ? `<div class="sop-callout sop-warn"><i class="fas fa-triangle-exclamation"></i><div>${richText(st.warning)}</div></div>` : ''}
                    ${st.verify ? `<div class="sop-callout sop-verify"><i class="fas fa-circle-question"></i><div>This step wasn't fully clear in the training. Confirm it with the team before relying on it.</div></div>` : ''}
                </div>
            </li>`).join('') + '</ol>');

        if (s.troubleshooting.length) {
            parts.push(`<div class="sop-trouble"><div class="sop-section-title"><i class="fas fa-screwdriver-wrench"></i> If something goes wrong</div>${
                s.troubleshooting.map(t => `<div class="sop-trouble-item"><div class="sop-trouble-q">${richText(t.problem)}</div><div>${richText(t.fix)}</div></div>`).join('')}</div>`);
        }

        const pages = [];
        const seen = new Set();
        s.steps.forEach(st => {
            if (st.pageHref && !seen.has(st.pageHref)) { seen.add(st.pageHref); pages.push(st); }
        });
        if (pages.length) {
            parts.push(`<div class="sop-pages"><div class="sop-section-title"><i class="fas fa-link"></i> Pages used in this guide</div>${
                pages.map(p => pageLink(p.pageHref, p.pageTitle)).join('')}</div>`);
        }

        const meta = [];
        if (s.source.name) meta.push(`From: ${esc(s.source.name)}`);
        if (s.source.trainer) meta.push(`Trainer: ${esc(s.source.trainer)}`);
        if (s.source.date) meta.push(`Training date: ${esc(s.source.date)}`);
        if (s.updatedAt) meta.push(`Last updated ${esc(fmtDate(s.updatedAt))}${s.updatedBy ? ' by ' + esc(s.updatedBy) : ''}`);
        if (meta.length) parts.push(`<div class="sop-meta">${meta.join(' &middot; ')}</div>`);

        return parts.join('');
    }

    // ── Styles (injected once) ───────────────────────────────────────────────
    const CSS = `
.sop-summary{font-size:1rem;line-height:1.6;color:#374151;margin:0 0 18px}
.sop-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:22px}
.sop-fact{background:#F6F4EF;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;font-size:.88rem;line-height:1.5;color:#1f2937}
.sop-fact ul{margin:4px 0 0;padding-left:18px}
.sop-fact-label{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#4E6E4A;margin-bottom:5px}
.sop-fact-label i{margin-right:4px}
.sop-steps{list-style:none;margin:0;padding:0}
.sop-step{display:flex;gap:14px;padding:16px 0;border-top:1px solid #eef0f3}
.sop-step:first-child{border-top:none}
.sop-step-num{flex:0 0 34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#12314C,#4E6E4A);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:.95rem}
.sop-step-body{flex:1;min-width:0}
.sop-step-title{font-weight:800;font-size:1.02rem;color:#111827;margin-bottom:4px}
.sop-step-text{font-size:.93rem;line-height:1.6;color:#374151}
.sop-step-page{margin-top:10px}
.sop-page-link{display:inline-flex;align-items:center;gap:7px;background:#12314C;color:#fff!important;text-decoration:none;font-weight:700;font-size:.82rem;padding:7px 14px;border-radius:999px;margin:0 8px 6px 0;transition:background .15s}
.sop-page-link:hover{background:#4E6E4A}
.sop-callout{display:flex;gap:10px;align-items:flex-start;margin-top:10px;padding:10px 12px;border-radius:10px;font-size:.86rem;line-height:1.5}
.sop-callout i{margin-top:2px}
.sop-tip{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}
.sop-warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
.sop-verify{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}
.sop-section-title{font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#12314C;margin:26px 0 10px}
.sop-section-title i{margin-right:6px;color:#4E6E4A}
.sop-trouble-item{border-left:3px solid #B9A77E;padding:4px 0 4px 12px;margin-bottom:10px;font-size:.9rem;line-height:1.5;color:#374151}
.sop-trouble-q{font-weight:700;color:#111827}
.sop-meta{margin-top:26px;padding-top:12px;border-top:1px solid #eef0f3;font-size:.76rem;color:#9ca3af}
.sop-overlay{position:fixed;inset:0;background:rgba(17,24,39,.6);z-index:5000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow-y:auto}
.sop-modal{background:#fff;border-radius:18px;width:min(860px,100%);box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden;margin-bottom:4vh}
.sop-modal-head{background:linear-gradient(135deg,#12314C,#4E6E4A);color:#fff;padding:22px 28px;border-bottom:2px solid #B9A77E;display:flex;gap:16px;align-items:flex-start}
.sop-modal-head h2{margin:0;font-size:1.45rem;line-height:1.3}
.sop-modal-cat{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;opacity:.8;margin-bottom:4px}
.sop-modal-tools{margin-left:auto;display:flex;gap:8px;flex-shrink:0}
.sop-tool-btn{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:8px;padding:6px 11px;font-size:.8rem;font-weight:700;cursor:pointer;text-decoration:none;font-family:inherit}
.sop-tool-btn:hover{background:rgba(255,255,255,.3)}
.sop-modal-body{padding:24px 28px 30px}
.sop-check{color:#16a34a;margin-left:6px;font-size:.95em}
.sop-ed-overlay{position:fixed;inset:0;background:rgba(17,24,39,.65);z-index:6000;display:flex;align-items:flex-start;justify-content:center;padding:3vh 14px;overflow-y:auto}
.sop-ed-modal{background:#fff;border-radius:16px;width:min(900px,100%);box-shadow:0 24px 80px rgba(0,0,0,.4);margin-bottom:3vh;color:#111827;font-size:14px}
.sop-ed-head{padding:14px 22px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:#fff;border-radius:16px 16px 0 0;z-index:2}
.sop-ed-head h3{margin:0;font-size:17px;flex:1}
.sop-ed-body{padding:4px 24px 26px}
.sop-ed-lbl{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#4b5563;margin:14px 0 5px}
.sop-ed-modal input[type=text],.sop-ed-modal select,.sop-ed-modal textarea{width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;font-family:inherit;color:#111827;background:#fff}
.sop-ed-modal input:focus,.sop-ed-modal select:focus,.sop-ed-modal textarea:focus{outline:none;border-color:#4E6E4A;box-shadow:0 0 0 3px rgba(78,110,74,.15)}
.sop-ed-modal textarea{resize:vertical;line-height:1.5}
.sop-ed-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.sop-ed-btn{display:inline-flex;align-items:center;gap:7px;border:1.5px solid #d1d5db;background:#fff;color:#374151;padding:7px 14px;border-radius:9px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
.sop-ed-btn:hover{background:#f3f4f6}
.sop-ed-btn:disabled{opacity:.5;cursor:default}
.sop-ed-primary{background:#12314C;border-color:#12314C;color:#fff}
.sop-ed-primary:hover{background:#4E6E4A;border-color:#4E6E4A}
.sop-ed-step{border:1.5px solid #e5e7eb;border-radius:12px;padding:12px 14px;margin-top:12px;background:#fcfcfb}
.sop-ed-step-head{display:flex;align-items:center;gap:8px;font-weight:800;color:#12314C}
.sop-ed-mini{background:#fff;border:1px solid #d1d5db;border-radius:6px;width:28px;height:28px;cursor:pointer;color:#4b5563}
.sop-ed-mini:hover{background:#f3f4f6}
.sop-ed-mini:disabled{opacity:.35;cursor:default}
.sop-ed-pair{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-top:8px;align-items:start}
.sop-ed-check{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:#374151}
.sop-ed-check input{width:auto!important}
.sop-ed-warn{margin-top:14px;padding:11px 14px;border-radius:10px;font-size:13.5px;line-height:1.5;background:#fffbeb;border:1px solid #fde68a;color:#92400e}
.sop-vbadge{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:.76rem;font-weight:700;padding:4px 12px;border-radius:999px}
.sop-vbadge-ok{background:#dcfce7;color:#166534}
.sop-vbadge-stale{background:#fef3c7;color:#92400e}
.sop-vbadge-none{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.35);font-weight:600}
.sop-vpanel{margin-top:28px;padding:16px 18px;border-radius:12px;background:#F6F4EF;border:1px solid #e5e7eb;font-size:.9rem;line-height:1.5;color:#1f2937}
.sop-vpanel-ok{background:#f0fdf4;border-color:#86efac;display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.sop-vpanel-ok i{color:#16a34a}
.sop-vnote{margin-top:6px;font-style:italic;color:#4b5563}
.sop-verify-note{width:100%;margin:12px 0 10px;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font:inherit;font-size:.86rem;resize:vertical}
.sop-vbtn{background:#16a34a;color:#fff;border:none;border-radius:9px;padding:10px 18px;font-weight:800;font-size:.88rem;cursor:pointer;font-family:inherit}
.sop-vbtn:hover{background:#15803d}
.sop-vbtn:disabled{opacity:.6;cursor:default}
.sop-vhint{margin-top:8px;font-size:.76rem;color:#6b7280}
.sop-vlink{background:none;border:none;color:#6b7280;font-size:.78rem;text-decoration:underline;cursor:pointer;font-family:inherit}
@media print{
  body>*:not(.sop-overlay){display:none!important}
  .sop-overlay{position:static;background:none;padding:0;overflow:visible}
  .sop-modal{box-shadow:none;width:100%;border-radius:0}
  .sop-modal-tools,.sop-verify-slot{display:none}
  .sop-modal-head{background:none!important;color:#000;border-bottom:2px solid #000}
  .sop-page-link{background:none;color:#000!important;border:1px solid #999}
}`;

    function injectStyles() {
        if (document.getElementById('sop-shared-styles')) return;
        const style = document.createElement('style');
        style.id = 'sop-shared-styles';
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    // ── Editor ───────────────────────────────────────────────────────────────
    // A full-screen form for editing an SOP. Used by the viewer's Edit button (so people
    // can fix a guide right where they're reading it) and by sop_builder.html.
    // The page list for the "Link to page" dropdown comes from sop_page_index.json.
    let _pageIndex = null;
    let _pageIndexPromise = null;

    function setPageIndex(idx) { _pageIndex = idx; }

    function loadPageIndex() {
        if (_pageIndex) return Promise.resolve(_pageIndex);
        if (!_pageIndexPromise) {
            _pageIndexPromise = fetch('sop_page_index.json?v=' + Date.now())
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(j => (_pageIndex = j))
                .catch(() => { _pageIndexPromise = null; return { pages: [] }; });
        }
        return _pageIndexPromise;
    }

    /**
     * options.onSave(editedSop) — async; throw to keep the editor open and show the error
     * options.label            — text for the save button (default "Save")
     * options.categories       — extra category suggestions
     */
    async function openEditor(sop, options = {}) {
        injectStyles();
        const idx = await loadPageIndex();
        const pages = (idx.pages || []).slice().sort((a, b) => a.title.localeCompare(b.title));
        const valid = new Set(pages.map(p => p.href));
        // Work on a copy so Cancel really cancels.
        const st = normalize(JSON.parse(JSON.stringify(sop || {})));
        if (!st.steps.length) st.steps.push({ title: '', instruction: '', pageHref: '', pageTitle: '', tip: '', warning: '', verify: false });
        const wasVerified = verificationStatus(st) !== 'none';
        const prevOverflow = document.body.style.overflow;

        const overlay = document.createElement('div');
        overlay.className = 'sop-ed-overlay';
        overlay.innerHTML = `
            <div class="sop-ed-modal" role="dialog" aria-modal="true" aria-label="Edit guide">
                <div class="sop-ed-head">
                    <h3>${st.id ? 'Edit guide' : 'New guide'}</h3>
                    <button type="button" class="sop-ed-btn" data-do="preview"><i class="fas fa-eye"></i> Preview</button>
                    <button type="button" class="sop-ed-btn" data-do="cancel">Cancel</button>
                    <button type="button" class="sop-ed-btn sop-ed-primary" data-do="save"><i class="fas fa-check"></i> ${esc(options.label || 'Save')}</button>
                </div>
                <div class="sop-ed-body"></div>
            </div>`;
        const body = overlay.querySelector('.sop-ed-body');

        const pageOptions = current => {
            let html = '<option value="">(no page: happens elsewhere)</option>';
            if (current && !valid.has(current.split(/[?#]/)[0])) html += `<option value="${esc(current)}" selected>${esc(current)}</option>`;
            return html + pages.map(p => `<option value="${esc(p.href)}" ${p.href === current ? 'selected' : ''}>${esc(p.title)} (${esc(p.href)})</option>`).join('');
        };

        const input = (label, key, val, ph = '') => `<label class="sop-ed-lbl">${label}</label><input type="text" data-f="${key}" value="${esc(val)}" placeholder="${esc(ph)}">`;
        const area = (label, key, val, rows = 2) => `<label class="sop-ed-lbl">${label}</label><textarea data-f="${key}" rows="${rows}">${esc(val)}</textarea>`;

        const render = () => {
            const cats = [...new Set(['Outreach', 'Reporting', 'Admin', 'Onboarding', 'Prospects', ...(options.categories || []), st.category])];
            body.innerHTML = `
                ${wasVerified ? '<div class="sop-ed-warn">This guide has been verified. Saving changes removes the green check mark until someone follows the updated version and verifies it again.</div>' : ''}
                ${input('Title', 'title', st.title, 'How to …')}
                <div class="sop-ed-row">
                    <div><label class="sop-ed-lbl">Category</label><input type="text" list="sopEdCats" data-f="category" value="${esc(st.category)}"><datalist id="sopEdCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
                    <div>${input('Tags (comma separated)', 'tags', st.tags.join(', '), 'search words people might type')}</div>
                </div>
                ${area('Summary', 'summary', st.summary)}
                ${area('When to use this', 'whenToUse', st.whenToUse)}
                <div class="sop-ed-row">
                    <div>${input('Who does this', 'audience', st.audience)}</div>
                    <div>${input('Training source', 'source.name', st.source.name)}</div>
                </div>
                ${area('Before you start (one per line)', 'prerequisites', st.prerequisites.join('\n'), 3)}

                <label class="sop-ed-lbl" style="margin-top:22px">Steps</label>
                ${st.steps.map((x, i) => `
                    <div class="sop-ed-step" data-i="${i}">
                        <div class="sop-ed-step-head">Step ${i + 1}<span style="flex:1"></span>
                            <button type="button" class="sop-ed-mini" data-do="up" ${i === 0 ? 'disabled' : ''} title="Move up"><i class="fas fa-chevron-up"></i></button>
                            <button type="button" class="sop-ed-mini" data-do="down" ${i === st.steps.length - 1 ? 'disabled' : ''} title="Move down"><i class="fas fa-chevron-down"></i></button>
                            <button type="button" class="sop-ed-mini" data-do="del" title="Delete step"><i class="fas fa-trash"></i></button>
                        </div>
                        <label class="sop-ed-lbl">Step title</label><input type="text" data-s="title" value="${esc(x.title)}">
                        <label class="sop-ed-lbl">Instructions (use **bold** for button names)</label><textarea data-s="instruction" rows="3">${esc(x.instruction)}</textarea>
                        <label class="sop-ed-lbl">Link to page</label><select data-s="pageHref">${pageOptions(x.pageHref)}</select>
                        <div class="sop-ed-row">
                            <div><label class="sop-ed-lbl">Tip</label><input type="text" data-s="tip" value="${esc(x.tip)}"></div>
                            <div><label class="sop-ed-lbl">Warning</label><input type="text" data-s="warning" value="${esc(x.warning)}"></div>
                        </div>
                        <label class="sop-ed-check"><input type="checkbox" data-s="verify" ${x.verify ? 'checked' : ''}> Needs confirmation (the training wasn't clear on this)</label>
                    </div>`).join('')}
                <button type="button" class="sop-ed-btn" data-do="addstep" style="margin-top:12px"><i class="fas fa-plus"></i> Add step</button>

                <label class="sop-ed-lbl" style="margin-top:22px">If something goes wrong</label>
                ${st.troubleshooting.map((t, i) => `
                    <div class="sop-ed-pair" data-t="${i}">
                        <input type="text" data-tf="problem" value="${esc(t.problem)}" placeholder="Problem">
                        <input type="text" data-tf="fix" value="${esc(t.fix)}" placeholder="What to do">
                        <button type="button" class="sop-ed-mini" data-do="deltrouble" title="Remove"><i class="fas fa-xmark"></i></button>
                    </div>`).join('')}
                <button type="button" class="sop-ed-btn" data-do="addtrouble" style="margin-top:12px"><i class="fas fa-plus"></i> Add problem / fix</button>`;
        };

        const close = () => { overlay.remove(); document.body.style.overflow = prevOverflow; };

        body.addEventListener('input', e => {
            const el = e.target;
            if (el.dataset.f) {
                const k = el.dataset.f;
                if (k === 'tags') st.tags = el.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                else if (k === 'prerequisites') st.prerequisites = el.value.split('\n').map(t => t.trim()).filter(Boolean);
                else if (k === 'source.name') st.source.name = el.value;
                else st[k] = el.value;
            } else if (el.dataset.s) {
                const step = st.steps[Number(el.closest('.sop-ed-step').dataset.i)];
                const k = el.dataset.s;
                if (k === 'verify') step.verify = el.checked;
                else if (k === 'pageHref') {
                    step.pageHref = el.value;
                    const p = pages.find(x => x.href === el.value);
                    step.pageTitle = p ? p.title : '';
                } else step[k] = el.value;
            } else if (el.dataset.tf) {
                st.troubleshooting[Number(el.closest('.sop-ed-pair').dataset.t)][el.dataset.tf] = el.value;
            }
        });

        overlay.addEventListener('click', async e => {
            const btn = e.target.closest('[data-do]');
            if (!btn) return;
            const stepEl = btn.closest('.sop-ed-step');
            const i = stepEl ? Number(stepEl.dataset.i) : -1;
            switch (btn.dataset.do) {
                case 'cancel': close(); return;
                case 'preview': openViewer(normalize(st), { canVerify: false, stacked: true }); return;
                case 'save': {
                    const edited = normalize(st);
                    if (!edited.title) { alert('Give the guide a title.'); return; }
                    if (!edited.steps.length) { alert('Add at least one step.'); return; }
                    btn.disabled = true;
                    try {
                        await options.onSave(edited);
                        close();
                    } catch (err) {
                        alert('Save failed: ' + err.message);
                        btn.disabled = false;
                    }
                    return;
                }
                case 'up': [st.steps[i - 1], st.steps[i]] = [st.steps[i], st.steps[i - 1]]; break;
                case 'down': [st.steps[i + 1], st.steps[i]] = [st.steps[i], st.steps[i + 1]]; break;
                case 'del': if (!confirm('Delete this step?')) return; st.steps.splice(i, 1); break;
                case 'addstep': st.steps.push({ title: '', instruction: '', pageHref: '', pageTitle: '', tip: '', warning: '', verify: false }); break;
                case 'addtrouble': st.troubleshooting.push({ problem: '', fix: '' }); break;
                case 'deltrouble': st.troubleshooting.splice(Number(btn.closest('.sop-ed-pair').dataset.t), 1); break;
                default: return;
            }
            render();
        });

        render();
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    // ── Verification UI ──────────────────────────────────────────────────────
    /** Small green "check mark" used next to a verified guide's title in lists. */
    function checkMark(sop) {
        return isVerified(sop)
            ? '<i class="fas fa-circle-check sop-check" title="Verified: someone followed this guide and confirmed it works"></i>'
            : '';
    }

    function verifyBadgeHtml(s) {
        const st = verificationStatus(s);
        const v = s.verification;
        if (st === 'verified') {
            return `<span class="sop-vbadge sop-vbadge-ok"><i class="fas fa-circle-check"></i> Verified by ${esc(whoIs(v.verifiedBy))} on ${esc(fmtDate(v.verifiedAt))}</span>`;
        }
        if (st === 'stale') {
            return '<span class="sop-vbadge sop-vbadge-stale"><i class="fas fa-circle-exclamation"></i> Edited since it was last verified</span>';
        }
        return '<span class="sop-vbadge sop-vbadge-none">Not verified yet</span>';
    }

    function verifyPanelHtml(s) {
        const st = verificationStatus(s);
        const v = s.verification;
        if (st === 'verified') {
            return `<div class="sop-vpanel sop-vpanel-ok">
                <div><i class="fas fa-circle-check"></i> <strong>Verified by ${esc(whoIs(v.verifiedBy))}</strong> on ${esc(fmtDate(v.verifiedAt))}. They followed these steps and confirmed they work.
                ${v.note ? `<div class="sop-vnote">&ldquo;${esc(v.note)}&rdquo;</div>` : ''}</div>
                <button type="button" class="sop-vlink" data-act="unverify">Remove verification</button>
            </div>`;
        }
        const intro = st === 'stale'
            ? `<strong>This guide needs to be verified again.</strong> ${esc(whoIs(v.verifiedBy))} verified an earlier version on ${esc(fmtDate(v.verifiedAt))}, but it has been edited since.`
            : '<strong>Have you followed this guide start to finish?</strong> If it worked, verify it. Verified guides show a green check mark and appear first in search.';
        return `<div class="sop-vpanel">
            <div>${intro}</div>
            <textarea class="sop-verify-note" rows="2" placeholder="Optional: anything that was different, or that you had to work around"></textarea>
            <button type="button" class="sop-vbtn" data-act="verify"><i class="fas fa-circle-check"></i> I followed this and it works: mark verified</button>
            <div class="sop-vhint">Please only verify after doing the steps yourself.</div>
        </div>`;
    }

    // ── Viewer modal ─────────────────────────────────────────────────────────
    let _overlay = null;
    let _keyHandler = null;

    function closeViewer() {
        if (_overlay) { _overlay.remove(); _overlay = null; }
        if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
        document.body.style.overflow = '';
    }

    /**
     * Opens the step-by-step viewer.
     * options.onChange — called with the updated SOP after it is edited / verified / un-verified
     * options.canEdit  — set false to hide the Edit button (saved guides show it by default)
     * options.shareUrl — adds a "Copy link" button that copies this URL
     */
    function openViewer(sop, options = {}) {
        injectStyles();
        // options.stacked — a preview opened on top of the editor: leave whatever is
        // already open alone, and close only itself.
        if (!options.stacked) closeViewer();
        let s = normalize(sop);

        const overlay = document.createElement('div');
        overlay.className = 'sop-overlay';
        overlay.innerHTML = `
            <div class="sop-modal" role="dialog" aria-modal="true" aria-label="${esc(s.title)}">
                <div class="sop-modal-head">
                    <div>
                        <div class="sop-modal-cat">${esc(s.category)} &middot; How-To Guide</div>
                        <h2>${esc(s.title)}</h2>
                        <div class="sop-vbadge-slot"></div>
                    </div>
                    <div class="sop-modal-tools">
                        ${options.shareUrl ? '<button class="sop-tool-btn" data-act="copy"><i class="fas fa-link"></i> Copy link</button>' : ''}
                        <button class="sop-tool-btn" data-act="print"><i class="fas fa-print"></i> Print</button>
                        ${(s.id && options.canVerify !== false && options.canEdit !== false) ? '<button class="sop-tool-btn" data-act="edit"><i class="fas fa-pen"></i> Edit</button>' : ''}
                        <button class="sop-tool-btn" data-act="close" aria-label="Close"><i class="fas fa-xmark"></i></button>
                    </div>
                </div>
                <div class="sop-modal-body"><div class="sop-body-slot"></div><div class="sop-verify-slot"></div></div>
            </div>`;

        // Verification only applies to saved guides (a draft has no id yet).
        const paint = () => {
            overlay.querySelector('.sop-vbadge-slot').innerHTML = verifyBadgeHtml(s);
            overlay.querySelector('.sop-body-slot').innerHTML = renderBody(s);
            overlay.querySelector('.sop-verify-slot').innerHTML = (s.id && options.canVerify !== false) ? verifyPanelHtml(s) : '';
        };
        paint();

        let stackedKey = null;
        const closeSelf = () => {
            if (!options.stacked) return closeViewer();
            overlay.remove();
            if (stackedKey) document.removeEventListener('keydown', stackedKey);
        };

        overlay.addEventListener('click', async e => {
            if (e.target === overlay) return closeSelf();
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'verify' || act === 'unverify') {
                if (act === 'unverify' && !confirm('Remove the verified check mark from this guide?')) return;
                const note = overlay.querySelector('.sop-verify-note');
                btn.disabled = true;
                try {
                    s = act === 'verify' ? await verify(s.id, note ? note.value : '') : await unverify(s.id);
                    paint();
                    if (options.onChange) options.onChange(s);
                } catch (err) {
                    btn.disabled = false;
                    alert((act === 'verify' ? 'Could not verify: ' : 'Could not remove verification: ') + err.message);
                }
                return;
            }
            if (act === 'edit') {
                // Edit right here: the editor opens on top of the guide and saving refreshes it.
                openEditor(s, {
                    label: 'Save changes',
                    onSave: async edited => {
                        edited.id = s.id;
                        edited.revision = (s.revision || 1) + 1;   // any edit invalidates the old verification
                        s = await save(edited);
                        const title = overlay.querySelector('h2');
                        if (title) title.textContent = s.title;
                        const cat = overlay.querySelector('.sop-modal-cat');
                        if (cat) cat.innerHTML = `${esc(s.category)} &middot; How-To Guide`;
                        paint();
                        if (options.onChange) options.onChange(s);
                    },
                });
                return;
            }
            if (act === 'close') closeSelf();
            else if (act === 'print') window.print();
            else if (act === 'copy' && options.shareUrl) {
                const done = () => { btn.innerHTML = '<i class="fas fa-check"></i> Copied'; setTimeout(() => { btn.innerHTML = '<i class="fas fa-link"></i> Copy link'; }, 1800); };
                if (navigator.clipboard) navigator.clipboard.writeText(options.shareUrl).then(done, () => window.prompt('Copy this link:', options.shareUrl));
                else window.prompt('Copy this link:', options.shareUrl);
            }
        });

        // Escape closes the guide, but not while the editor is open on top of it (avoids losing edits).
        if (options.stacked) {
            overlay.style.zIndex = 7000;
            stackedKey = e => { if (e.key === 'Escape') closeSelf(); };
            document.addEventListener('keydown', stackedKey);
            document.body.appendChild(overlay);
            return;
        }

        _keyHandler = e => { if (e.key === 'Escape' && !document.querySelector('.sop-ed-overlay')) closeViewer(); };
        document.addEventListener('keydown', _keyHandler);

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        _overlay = overlay;
    }

    window.SopShared = {
        COLLECTION, esc, richText, slugify, newId, safeHref, normalize,
        loadAll, save, remove,
        renderBody, injectStyles, openViewer, closeViewer, fmtDate,
        verify, unverify, verificationStatus, isVerified, checkMark, whoIs,
        openEditor, setPageIndex,
    };
})();
