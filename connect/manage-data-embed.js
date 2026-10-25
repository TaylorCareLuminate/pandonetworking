/**
 * Manage Data suite — embed-mode helper
 * Version: 1.0.0
 *
 * Loaded by every tool page that can be mounted inside manage_data.html
 * (Prospect Organizations, Prospect Org Admin, Contact Search by Keyword,
 * AI Database Screener, Manage Organization Contacts, Prospect Cleanup,
 * Prospect Contacts, My Leads).
 *
 * It does NOTHING unless the page was opened with ?embed=1 — i.e. inside the
 * suite — so every page keeps working exactly as before when opened directly.
 *
 * In embed mode it:
 *   1. Hides the duplicate site header (the suite owns the chrome) and tightens
 *      the page's top spacing so the tool gets the room.
 *   2. Turns links that point at sibling suite tools into "switch tab" requests
 *      to the parent shell (postMessage) instead of navigating inside the frame.
 *   3. Exposes window.ManageDataEmbed for pages that want to talk to the shell.
 */
(function () {
    'use strict';

    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    if (params.get('embed') !== '1') return;

    const MESSAGE_TYPE = 'pando-manage-data';

    // File name -> tool key used by manage_data.html?tool=<key>
    const SUITE_PAGES = {
        'prospect_organizations_admin.html': 'prospect_organizations_admin',
        'prospect_organizations.html': 'prospect_organizations',
        'contact_search_by_keyword.html': 'contact_search_by_keyword',
        'contact_ai_screen.html': 'contact_ai_screen',
        'manage_organization_contacts.html': 'manage_organization_contacts',
        'prospect_cleanup.html': 'prospect_cleanup',
        'prospect_contacts.html': 'prospect_contacts',
        'my_leads.html': 'my_leads'
    };

    const currentFile = (window.location.pathname.split('/').pop() || '').split('?')[0];
    const currentTool = SUITE_PAGES[currentFile] || null;

    document.documentElement.classList.add('md-embedded');

    // ── 1. Styling ───────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.id = 'manage-data-embed-styles';
    style.textContent = `
        /* Suite owns the chrome: never show a second site header inside a tool */
        html.md-embedded .healthconnect-header { display: none !important; }
        html.md-embedded body { padding-top: 0 !important; }
        html.md-embedded .container { padding-top: 1rem !important; }
        /* Compact page hero — the suite already shows the tool's name + purpose */
        html.md-embedded .page-header,
        html.md-embedded .admin-header {
            padding: .85rem 1.2rem .8rem !important;
            margin-bottom: 1rem !important;
        }
        html.md-embedded .page-header h1,
        html.md-embedded .admin-header h1 { font-size: 1.15rem !important; margin-bottom: .15rem !important; }
        html.md-embedded .page-header p,
        html.md-embedded .admin-header p { font-size: .82rem !important; }
        /* "Back to Connect Home" style links make no sense inside the suite */
        html.md-embedded .page-header a[href="index.html"],
        html.md-embedded .page-header a[href="./index.html"],
        html.md-embedded .admin-header a[href="index.html"] { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);

    // ── 2. Talk to the shell ─────────────────────────────────────────────────
    function post(message) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(Object.assign({ type: MESSAGE_TYPE, from: currentTool }, message), window.location.origin);
            }
        } catch (e) { /* ignore */ }
    }

    function navigateShell(tool, extraParams, hash) {
        post({ action: 'navigate', tool: tool, params: extraParams || {}, hash: hash || '' });
    }

    // Links to sibling suite pages switch tabs in the shell instead of
    // navigating inside this frame (Ctrl/Cmd/Shift-click still opens a new tab).
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
        let tool = SUITE_PAGES[file] || null;
        const extra = {};
        url.searchParams.forEach((v, k) => { if (k !== 'embed' && k !== 'tool') extra[k] = v; });

        if (!tool && file === 'manage_data.html') {
            tool = url.searchParams.get('tool') || 'overview';
        }

        if (tool) {
            e.preventDefault();
            e.stopPropagation();
            navigateShell(tool, extra, url.hash);
            return;
        }

        // Any other same-origin page (e.g. Harvest Pool, Fast Outreach) is outside
        // the suite: leave the suite properly instead of loading that page — with
        // its own header — inside this frame. Links that already target a new tab
        // are left alone.
        const target = (a.getAttribute('target') || '').toLowerCase();
        if (target && target !== '_self') return;
        if (!/\.html?$/i.test(url.pathname) && !url.pathname.endsWith('/')) return;
        e.preventDefault();
        e.stopPropagation();
        try { window.top.location.href = url.href; } catch (err) { window.location.href = url.href; }
    }, true);

    // Keep the shell's tab title in sync with the tool's <title> (some tools
    // change it as you pick a BDR / workspace).
    function reportTitle() { post({ action: 'title', title: document.title || '' }); }
    try {
        const titleEl = document.querySelector('title');
        if (titleEl && window.MutationObserver) {
            new MutationObserver(reportTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
        }
    } catch (e) { /* ignore */ }

    function reportReady() { post({ action: 'ready' }); reportTitle(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reportReady);
    } else {
        reportReady();
    }

    // ── 3. Public helper for tool pages ──────────────────────────────────────
    window.ManageDataEmbed = {
        isEmbedded: true,
        tool: currentTool,
        /** Switch the suite to another tool, e.g. navigate('prospect_contacts', { workspaceId }) */
        navigate: navigateShell,
        /** Send an arbitrary message to the shell */
        post: post
    };

    console.log('🧩 Manage Data embed mode active for', currentTool || currentFile);
})();
