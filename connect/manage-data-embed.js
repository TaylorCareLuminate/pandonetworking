/**
 * Manage Data — embed-mode bridge
 * Version: 2.2.0 (adds linkedin_url_finder)
 *
 * Loaded by every page whose panels are composed into manage_data.html
 * (Prospect Organizations, Prospect Org Admin, Contact Search by Keyword,
 * AI Database Screener, Manage Organization Contacts, Prospect Cleanup,
 * Prospect Contacts, My Leads).
 *
 * It does NOTHING unless the page was opened with ?embed=1 — i.e. inside the
 * suite — so every page keeps working exactly as before when opened directly.
 *
 * In embed mode the suite drives the page through postMessage:
 *   setContext   — select the BDR / Workspace / Snapshot / Unassigned Pool the
 *                  suite is working in, in this page's own selector(s), exactly
 *                  as if the user had picked it here (the page's change handlers run)
 *   showSections — show only the listed panels (by element id) and hide the
 *                  page's other panels, hero and tabs; null = whole page
 * and the page reports back:
 *   ready, title, contextApplied / contextUnsupported, contextChanged
 *   (user changed the selector inside the page), sectionsState (how many of
 *   the requested panels are actually visible), navigate (link to a sibling).
 */
(function () {
    'use strict';

    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    if (params.get('embed') !== '1') return;

    const MESSAGE_TYPE = 'pando-manage-data';

    // File name -> tool key used by manage_data.html
    const SUITE_PAGES = {
        'prospect_organizations_admin.html': 'prospect_organizations_admin',
        'prospect_organizations.html': 'prospect_organizations',
        'contact_search_by_keyword.html': 'contact_search_by_keyword',
        'contact_ai_screen.html': 'contact_ai_screen',
        'manage_organization_contacts.html': 'manage_organization_contacts',
        'prospect_cleanup.html': 'prospect_cleanup',
        'prospect_contacts.html': 'prospect_contacts',
        'my_leads.html': 'my_leads',
        'linkedin_url_finder.html': 'linkedin_url_finder'
    };

    // Per-page knowledge: which <select>s hold the working context, and which
    // page chrome is redundant inside the suite (the suite shows its own).
    const PAGE_CONFIG = {
        prospect_organizations_admin: {
            contextSelects: ['bdrFilter'],
            chromeHide: ['#contextSection .form-group > label', '#contextSection select', '#contextSection .form-help']
        },
        prospect_organizations: {
            contextSelects: ['bdrFilter'],
            chromeHide: ['#adminBdrSection']
        },
        contact_search_by_keyword: {
            contextSelects: ['bdrSelect'],
            chromeHide: ['#contextSection .form-group > label', '#contextSection select', '#contextSection .form-help']
        },
        prospect_contacts: {
            contextSelects: ['bdrSelector'],
            chromeHide: ['#adminBdrSelector .form-group', '#selectedBdrInfo']
        },
        my_leads: {
            contextSelects: ['bdrSelect'],
            chromeHide: ['#adminBadge', '#bdrSelectorSection']
        },
        prospect_cleanup: {
            contextSelects: ['bdrSelectKeyword', 'bdrSelectSmart', 'bdrSelectLowConn', 'bdrSelectOverlap', 'aiProfileBdrSelect', 'groupBdrSelect', 'dupBdrSelect'],
            chromeHide: ['.warning-box', '.tabs']
        },
        manage_organization_contacts: {
            // Only the "Export contacts with enrichment" panel is bound to the suite's working context;
            // the other panels of this page have their own source/destination pickers.
            contextSelects: ['exportSourceSelect'],
            chromeHide: ['#exportEnrichedSection .export-source-group']
        },
        contact_ai_screen: { contextSelects: [], chromeHide: ['.page-header a[href="index.html"]'] },
        // Steps 1-4 (upload, map, search, review) don't depend on the context; Step 5's destination does,
        // and it stays visible so you can always see where "Save" will put the contacts.
        linkedin_url_finder: { contextSelects: ['wsTargetSelect'], chromeHide: [] }
    };

    // Elements that count as "panels" — the only things showSections hides.
    // Modals, overlays, toasts and anything else are never touched.
    const PANEL_KINDS = '.page-header, .admin-header, .warning-box, .tabs, .section, .filters-section, .tab-content, .admin-only-section, #adminBadge, #bdrSelectorSection';

    const currentFile = (window.location.pathname.split('/').pop() || '').split('?')[0];
    const currentTool = SUITE_PAGES[currentFile] || null;
    const cfg = PAGE_CONFIG[currentTool] || { contextSelects: [], chromeHide: [] };

    document.documentElement.classList.add('md-embedded');

    // ── Styling ──────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.id = 'manage-data-embed-styles';
    style.textContent = `
        html.md-embedded .healthconnect-header { display: none !important; }
        html.md-embedded body { padding-top: 0 !important; }
        html.md-embedded .container { padding-top: 1rem !important; }
        html.md-embedded .page-header,
        html.md-embedded .admin-header { padding: .85rem 1.2rem .8rem !important; margin-bottom: 1rem !important; }
        html.md-embedded .page-header h1,
        html.md-embedded .admin-header h1 { font-size: 1.15rem !important; margin-bottom: .15rem !important; }
        html.md-embedded .page-header p,
        html.md-embedded .admin-header p { font-size: .82rem !important; }
        html.md-embedded .page-header a[href="index.html"],
        html.md-embedded .page-header a[href="./index.html"],
        html.md-embedded .admin-header a[href="index.html"] { display: none !important; }
        /* Panels the suite asked us to hide */
        html.md-embedded [data-md-hidden] { display: none !important; }
        html.md-embedded.md-sectioned .container { padding-top: .5rem !important; }
        ${(cfg.chromeHide || []).map(sel => `html.md-embedded.md-sectioned ${sel} { display: none !important; }`).join('\n')}
    `;
    (document.head || document.documentElement).appendChild(style);

    // ── Talk to the shell ────────────────────────────────────────────────────
    function post(message) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(Object.assign({ type: MESSAGE_TYPE, from: currentTool }, message), window.location.origin);
            }
        } catch (e) { /* ignore */ }
    }
    function navigateShell(view, extraParams, hash) {
        post({ action: 'navigate', view: view, params: extraParams || {}, hash: hash || '' });
    }

    // ── Links ────────────────────────────────────────────────────────────────
    // Links to sibling suite pages switch panels in the shell; links to other
    // pages leave the suite at the top level (never load a foreign page in here).
    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return;
        let url;
        try { url = new URL(href, window.location.href); } catch (err) { return; }
        if (url.origin !== window.location.origin) return;

        const file = url.pathname.split('/').pop();
        const extra = {};
        url.searchParams.forEach((v, k) => { if (k !== 'embed' && k !== 'view' && k !== 'tool') extra[k] = v; });

        let view = null;
        if (SUITE_PAGES[file]) view = 'page:' + SUITE_PAGES[file];
        else if (file === 'manage_data.html') view = url.searchParams.get('view') || url.searchParams.get('tool') || 'overview';

        if (view) {
            e.preventDefault(); e.stopPropagation();
            navigateShell(view, extra, url.hash);
            return;
        }
        const target = (a.getAttribute('target') || '').toLowerCase();
        if (target && target !== '_self') return;
        if (!/\.html?$/i.test(url.pathname) && !url.pathname.endsWith('/')) return;
        e.preventDefault(); e.stopPropagation();
        try { window.top.location.href = url.href; } catch (err) { window.location.href = url.href; }
    }, true);

    // ── Context (BDR / Workspace / Snapshot / Pool) ──────────────────────────
    let applying = false;          // true while WE set a selector (ignore its change event)
    let wantedContext = null;      // last value the shell asked for
    let applyTimer = null;

    function cssEscape(v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'); }
    function contextSelects() { return (cfg.contextSelects || []).map(id => document.getElementById(id)).filter(Boolean); }
    function optionFor(sel, value) { return sel.querySelector(`option[value="${cssEscape(value)}"]`); }
    function labelOf(sel) { const o = sel.selectedOptions && sel.selectedOptions[0]; return o ? o.textContent.trim() : ''; }

    function applyContextNow(value) {
        const selects = contextSelects();
        if (!selects.length) return { done: true, supported: false, reason: 'no-selector' };
        let anyHasOption = false, allApplied = true;
        selects.forEach(sel => {
            const opt = optionFor(sel, value);
            if (!opt) { allApplied = false; return; }
            anyHasOption = true;
            if (sel.value === value) return;
            applying = true;
            try {
                sel.value = value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            } finally { applying = false; }
        });
        if (!anyHasOption) return { done: false, supported: false };
        return { done: allApplied, supported: true, label: labelOf(selects.find(s => s.value === value) || selects[0]) };
    }

    // Selectors fill asynchronously (after auth, after Firestore loads), so keep
    // trying for a while; a value that never shows up means this page doesn't
    // support that kind of context (e.g. My Leads has no workspaces).
    function applyContext(value) {
        wantedContext = value;
        if (applyTimer) { clearInterval(applyTimer); applyTimer = null; }
        if (!value) return;
        let tries = 0;
        const stop = () => { if (applyTimer) { clearInterval(applyTimer); applyTimer = null; } };
        const attempt = () => {
            if (wantedContext !== value) { stop(); return true; }     // superseded
            const r = applyContextNow(value);
            tries++;
            if (!r.done && tries < 100) return false;                  // keep waiting (100 × 300ms = 30s)
            stop();
            if (r.supported) post({ action: 'contextApplied', value: value, label: r.label || '', partial: !r.done });
            else post({ action: 'contextUnsupported', value: value, reason: r.reason || 'no-option' });
            scheduleStateReports();
            return true;
        };
        if (!attempt()) applyTimer = setInterval(attempt, 300);
    }

    // The user changed the context inside this page → tell the shell.
    document.addEventListener('change', function (e) {
        if (applying) return;
        const sel = e.target;
        if (!sel || sel.tagName !== 'SELECT' || !(cfg.contextSelects || []).includes(sel.id)) return;
        wantedContext = sel.value;
        post({ action: 'contextChanged', value: sel.value, label: labelOf(sel) });
        scheduleStateReports();
    }, true);

    // ── Sections ─────────────────────────────────────────────────────────────
    let requestedIds = null; // null = whole page

    function isPanelTopLevel(el) {
        // Only the outermost panel of any nesting is hidden/shown by us
        const parentPanel = el.parentElement && el.parentElement.closest(PANEL_KINDS);
        return !parentPanel;
    }
    function applySections() {
        const html = document.documentElement;
        const containers = document.querySelectorAll('.container');
        const scope = containers.length ? [...containers] : [document.body];
        const requested = requestedIds ? requestedIds.map(id => document.getElementById(id)).filter(Boolean) : [];

        if (requestedIds === null) {
            html.classList.add('md-sectioned'); // chromeHide still applies (hero/duplicate selectors)
            scope.forEach(root => root.querySelectorAll('[data-md-hidden]').forEach(el => el.removeAttribute('data-md-hidden')));
            scope.forEach(root => root.querySelectorAll('.page-header, .admin-header').forEach(el => el.setAttribute('data-md-hidden', '1')));
            return;
        }
        html.classList.add('md-sectioned');
        scope.forEach(root => {
            root.querySelectorAll(PANEL_KINDS).forEach(el => {
                if (el.closest('.modal, .modal-overlay, [role="dialog"]')) return;
                if (!isPanelTopLevel(el)) return;
                const keep = requested.some(r => r === el || el.contains(r) || r.contains(el));
                if (keep) el.removeAttribute('data-md-hidden'); else el.setAttribute('data-md-hidden', '1');
            });
        });
        // Tab panels: activate the requested tab the way the page would
        requested.forEach(el => {
            if (!el.classList.contains('tab-content')) return;
            const name = el.id.replace(/^tab-/, '');
            if (typeof window.switchTab === 'function') {
                try { window.switchTab(name); return; } catch (e) { /* fall through */ }
            }
            el.parentElement.querySelectorAll(':scope > .tab-content').forEach(t => t.classList.toggle('active', t === el));
        });
    }

    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return el.offsetParent !== null || cs.position === 'fixed';
    }
    let lastState = '';
    function reportState() {
        if (requestedIds === null) return;
        const els = requestedIds.map(id => document.getElementById(id)).filter(Boolean);
        const visible = els.filter(isVisible).length;
        const sig = `${els.length}:${visible}`;
        if (sig === lastState) return;
        lastState = sig;
        post({ action: 'sectionsState', requested: els.length, visible: visible, ids: requestedIds });
    }
    let stateTimer = null;
    function scheduleStateReports() {
        lastState = '';
        if (stateTimer) clearInterval(stateTimer);
        let n = 0;
        stateTimer = setInterval(() => { reportState(); if (++n >= 12) { clearInterval(stateTimer); stateTimer = null; } }, 700);
        reportState();
    }

    // ── Workspaces: tell the suite when one is created / renamed / merged / deleted ──
    // Every page writes to the `workspaces` collection through the CLEmail wrapper's
    // CollectionReference.add / DocumentReference.set|update|delete. Wrapping those (on the
    // prototypes, so it works no matter how a page imported them) lets the suite learn about a
    // change made from ANY panel and refresh every other panel's dropdowns.
    // Only structural changes count — not the frequent `lastActivity` touches.
    const WS_SHAPE_KEYS = ['name', 'mergedInto', 'isSource', 'clientIds', 'routingWorkspaceIds', 'sourceWorkspaceId'];
    const touchesWorkspaceShape = data => !!data && typeof data === 'object' && WS_SHAPE_KEYS.some(k => k in data);
    function notifyWorkspaceChange(kind, id) { post({ action: 'workspacesChanged', kind: kind, id: id || '' }); }

    function installWorkspaceWatch() {
        const F = window.clemailFirestore;
        if (!F || !F.CollectionReference || !F.DocumentReference) return false;
        if (F.__mdWorkspaceWatch) return true;
        F.__mdWorkspaceWatch = true;
        const CR = F.CollectionReference.prototype, DR = F.DocumentReference.prototype;
        const add = CR.add, set = DR.set, update = DR.update, del = DR.delete;
        CR.add = async function (data) {
            const ref = await add.call(this, data);
            if (this._collectionName === 'workspaces') notifyWorkspaceChange('created', ref && (ref.id || ref._docId));
            return ref;
        };
        DR.set = async function (data, options) {
            const r = await set.call(this, data, options);
            if (this._collectionName === 'workspaces' && touchesWorkspaceShape(data)) notifyWorkspaceChange('updated', this._docId);
            return r;
        };
        DR.update = async function (data) {
            const r = await update.call(this, data);
            if (this._collectionName === 'workspaces' && touchesWorkspaceShape(data)) notifyWorkspaceChange('updated', this._docId);
            return r;
        };
        DR.delete = async function () {
            const r = await del.call(this);
            if (this._collectionName === 'workspaces') notifyWorkspaceChange('deleted', this._docId);
            return r;
        };
        return true;
    }
    if (!installWorkspaceWatch()) {
        let n = 0;
        const t = setInterval(() => { if (installWorkspaceWatch() || ++n > 300) clearInterval(t); }, 100);
    }

    // The suite says the workspace list changed: run the page's own refresh (each page defines
    // window.__mdRefreshWorkspaces next to the code that fills its workspace dropdowns), keeping
    // whatever the user had selected, then re-assert the shared working context.
    let wsRefreshRunning = false, wsRefreshAgain = false;
    async function refreshWorkspaces() {
        if (wsRefreshRunning) { wsRefreshAgain = true; return; }
        const fn = window.__mdRefreshWorkspaces;
        if (typeof fn !== 'function') return;
        wsRefreshRunning = true;
        try {
            do {
                wsRefreshAgain = false;
                const keep = new Map();
                document.querySelectorAll('select[id]').forEach(s => { if (s.value) keep.set(s.id, s.value); });
                try { await fn(); } catch (err) { console.warn('Manage Data: workspace refresh failed', err); }
                keep.forEach((v, id) => {
                    const s = document.getElementById(id);
                    if (s && s.value !== v && Array.from(s.options).some(o => o.value === v)) s.value = v;
                });
            } while (wsRefreshAgain);
        } finally { wsRefreshRunning = false; }
        if (wantedContext) applyContext(wantedContext);
    }

    // ── Messages from the shell ──────────────────────────────────────────────
    window.addEventListener('message', function (e) {
        if (e.origin !== window.location.origin) return;
        const m = e.data;
        if (!m || m.type !== MESSAGE_TYPE) return;
        if (m.action === 'setContext') {
            applyContext(m.value || '');
        } else if (m.action === 'refreshWorkspaces') {
            refreshWorkspaces();
        } else if (m.action === 'showSections') {
            requestedIds = Array.isArray(m.ids) ? m.ids.slice() : null;
            applySections();
            scheduleStateReports();
            // Page scripts may rebuild panels later; re-assert a few times
            let n = 0;
            const t = setInterval(() => { applySections(); if (++n >= 5) clearInterval(t); }, 800);
        }
    });

    // ── Title + ready ────────────────────────────────────────────────────────
    function reportTitle() { post({ action: 'title', title: document.title || '' }); }
    try {
        const titleEl = document.querySelector('title');
        if (titleEl && window.MutationObserver) {
            new MutationObserver(reportTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
        }
    } catch (e) { /* ignore */ }
    function reportReady() { post({ action: 'ready', contextSelects: (cfg.contextSelects || []).length > 0 }); reportTitle(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reportReady);
    else reportReady();

    // ── Public helper for tool pages ─────────────────────────────────────────
    window.ManageDataEmbed = {
        isEmbedded: true,
        tool: currentTool,
        navigate: navigateShell,
        post: post,
        applyContext: applyContext
    };

    console.log('🧩 Manage Data embed mode active for', currentTool || currentFile);
})();
