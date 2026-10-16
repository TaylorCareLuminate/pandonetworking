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
        return {
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
@media print{
  body>*:not(.sop-overlay){display:none!important}
  .sop-overlay{position:static;background:none;padding:0;overflow:visible}
  .sop-modal{box-shadow:none;width:100%;border-radius:0}
  .sop-modal-tools{display:none}
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
     * options.editHref — adds an "Edit" button linking there (e.g. sop_builder.html?edit=<id>)
     * options.shareUrl — adds a "Copy link" button that copies this URL
     */
    function openViewer(sop, options = {}) {
        injectStyles();
        closeViewer();
        const s = normalize(sop);

        const overlay = document.createElement('div');
        overlay.className = 'sop-overlay';
        overlay.innerHTML = `
            <div class="sop-modal" role="dialog" aria-modal="true" aria-label="${esc(s.title)}">
                <div class="sop-modal-head">
                    <div>
                        <div class="sop-modal-cat">${esc(s.category)} &middot; How-To Guide</div>
                        <h2>${esc(s.title)}</h2>
                    </div>
                    <div class="sop-modal-tools">
                        ${options.shareUrl ? '<button class="sop-tool-btn" data-act="copy"><i class="fas fa-link"></i> Copy link</button>' : ''}
                        <button class="sop-tool-btn" data-act="print"><i class="fas fa-print"></i> Print</button>
                        ${options.editHref ? `<a class="sop-tool-btn" href="${esc(options.editHref)}" target="_blank" rel="noopener"><i class="fas fa-pen"></i> Edit</a>` : ''}
                        <button class="sop-tool-btn" data-act="close" aria-label="Close"><i class="fas fa-xmark"></i></button>
                    </div>
                </div>
                <div class="sop-modal-body">${renderBody(s)}</div>
            </div>`;

        overlay.addEventListener('click', e => {
            if (e.target === overlay) return closeViewer();
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'close') closeViewer();
            else if (act === 'print') window.print();
            else if (act === 'copy' && options.shareUrl) {
                const done = () => { btn.innerHTML = '<i class="fas fa-check"></i> Copied'; setTimeout(() => { btn.innerHTML = '<i class="fas fa-link"></i> Copy link'; }, 1800); };
                if (navigator.clipboard) navigator.clipboard.writeText(options.shareUrl).then(done, () => window.prompt('Copy this link:', options.shareUrl));
                else window.prompt('Copy this link:', options.shareUrl);
            }
        });

        _keyHandler = e => { if (e.key === 'Escape') closeViewer(); };
        document.addEventListener('keydown', _keyHandler);

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        _overlay = overlay;
    }

    window.SopShared = {
        COLLECTION, esc, richText, slugify, newId, safeHref, normalize,
        loadAll, save, remove,
        renderBody, injectStyles, openViewer, closeViewer, fmtDate,
    };
})();
