/**
 * Shared helpers for post_comments.html, post_replies_review.html and posts_reposts.html.
 * Everything goes through the Railway API (/post-comments); these pages never touch Firestore or Unipile directly.
 * Auth follows .cursor/rules/auth-patterns.mdc: window.firebaseReady / window.auth, no redirects from here.
 */
window.PostComments = (function () {
    const API = 'https://railwayclemail-production.up.railway.app/post-comments';
    const CENTRAL = 'America/Chicago';
    const COMMENT_MAX = 1250;                 // LinkedIn's own limit for a comment

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toDate = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };
    const fmt = (v) => { const d = toDate(v); return d ? d.toLocaleString('en-US', { timeZone: CENTRAL, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' : '—'; };
    const fmtDay = (v) => { const d = toDate(v); return d ? d.toLocaleDateString('en-US', { timeZone: CENTRAL, month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
    function ago(v) {
        const d = toDate(v); if (!d) return '';
        const days = Math.floor((Date.now() - d.getTime()) / 86400000);
        return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
    }

    /** Only ever link out to LinkedIn itself; anything else found in stored data is shown as text, not as a link. */
    function linkedInUrl(raw) {
        try {
            const u = new URL(String(raw || ''));
            return u.protocol === 'https:' && /(^|\.)linkedin\.com$/i.test(u.hostname) ? u.href : null;
        } catch (_) { return null; }
    }
    /** An image address is only used when it is on LinkedIn's media hosts. */
    function linkedInImage(raw) {
        try {
            const u = new URL(String(raw || ''));
            return u.protocol === 'https:' && /(^|\.)(licdn\.com|linkedin\.com)$/i.test(u.hostname) ? u.href : null;
        } catch (_) { return null; }
    }

    /** The signed-in user. During a token refresh Firebase reports "no user" for a moment, so wait rather than give up. */
    async function signedInUser() {
        await window.firebaseReady;
        for (let i = 0; i < 24; i++) {
            const u = (window.auth && window.auth.currentUser) || window.getCurrentAuthState?.()?.user;
            if (u && typeof u.getIdToken === 'function') return u;
            if (window.isTrulyLoggedOut?.()) break;
            await new Promise(r => setTimeout(r, 250));
        }
        throw new Error('You are not signed in, or your session is refreshing. Try again in a moment.');
    }

    async function request(path, opts = {}) {
        const user = await signedInUser();
        const token = await user.getIdToken();
        return fetch(API + path, {
            method: opts.method || 'GET',
            headers: { 'Authorization': `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
    }
    async function api(path, opts = {}) {
        const resp = await request(path, opts);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json.success === false) throw new Error(json.error || `The server answered ${resp.status}`);
        return json;
    }
    /** A saved image, as an object URL (the image route needs the sign-in token, so it cannot be a plain <img src>). */
    async function apiImage(path) {
        const resp = await request(path);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return /^image\/(jpeg|png|webp|gif)$/.test(blob.type) ? URL.createObjectURL(blob) : null;
    }

    function say(id, msg, isError) {
        const el = document.getElementById(id); if (!el) return;
        el.textContent = msg || ''; el.className = 'status-line' + (isError ? ' error' : '');
    }

    // ── Pieces of a found post, shared by the admin queue and the BDR's review ──

    const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

    function personHtml(c) {
        c = c || {};
        const url = linkedInUrl(c.profileUrl);
        const img = linkedInImage(c.imageUrl);
        const role = [c.title, c.company].filter(Boolean).join(' at ');
        return `<div class="pc-person">
            ${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" loading="lazy" data-hide-on-error>` : `<span class="avatar">${esc(initials(c.name))}</span>`}
            <div class="who"><strong>${esc(c.name || 'Unknown')}</strong>
                <span class="sub">${esc(role)}</span>
                ${url ? `<span class="sub"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">LinkedIn profile</a></span>` : ''}
            </div></div>`;
    }

    function postHtml(p, { type } = {}) {
        p = p || {};
        const url = linkedInUrl(p.url);
        const counts = [p.reactions != null ? `${p.reactions} reactions` : '', p.comments != null ? `${p.comments} comments` : '', p.reposts != null ? `${p.reposts} reposts` : ''].filter(Boolean).join(' · ');
        const long = String(p.text || '').length > 520 || String(p.text || '').split('\n').length > 7;
        return `<div class="pc-meta">
                ${type ? `<span class="badge ${esc(type)}">${type === 'congratulations' ? 'Congratulations' : type === 'interesting' ? 'Interesting post' : esc(type)}</span>` : ''}
                <span>Posted ${esc(fmtDay(p.createdAt))} (${esc(ago(p.createdAt))})</span>
                ${counts ? `<span>${esc(counts)}</span>` : ''}
                ${p.hasImage ? '<span><i class="fas fa-image"></i> has an image</span>' : ''}
                ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open the post</a>` : ''}
            </div>
            <div class="pc-post ${long ? 'clamped' : ''}">${esc(p.text || '(no text)')}</div>
            ${long ? '<button type="button" class="link-btn" data-toggle-post>Show the whole post</button>' : ''}`;
    }

    function scoreHtml(label, n, reason) {
        if (n === null || n === undefined) return '';
        const cls = n >= 80 ? 'high' : n < 50 ? 'low' : '';
        return `<div class="score ${cls}"><b>${esc(n)}</b><span class="lbl">${esc(label)}</span>${reason ? `<p>${esc(reason)}</p>` : ''}</div>`;
    }

    /** Wire the small behaviours the pieces above need. Call once per page. */
    function wire(root = document) {
        root.addEventListener('click', (e) => {
            const t = e.target.closest('[data-toggle-post]'); if (!t) return;
            const post = t.previousElementSibling;
            const open = post.classList.toggle('clamped') === false;
            t.textContent = open ? 'Show less' : 'Show the whole post';
        });
        root.addEventListener('error', (e) => { if (e.target instanceof HTMLImageElement && e.target.hasAttribute('data-hide-on-error')) e.target.style.display = 'none'; }, true);
        root.addEventListener('input', (e) => {
            const ta = e.target.closest('textarea[data-count]'); if (!ta) return;
            updateCount(ta);
        });
    }
    function updateCount(ta) {
        const el = ta.parentElement.querySelector('.pc-count'); if (!el) return;
        const n = ta.value.trim().length;
        el.textContent = `${n} / ${COMMENT_MAX} characters`;
        el.classList.toggle('over', n > COMMENT_MAX);
    }

    /**
     * The "which BDR am I looking at" chooser used on the two customer pages.
     * Customers with one BDR never see it. Admins and viewers with several choose; the choice is remembered for the tab.
     */
    async function chooseBdr({ selectId, wrapId, onChange }) {
        const me = await api('/me');
        const sel = document.getElementById(selectId), wrap = document.getElementById(wrapId);
        if (!me.bdrs.length) return { me, bdrId: null };
        const wanted = new URLSearchParams(location.search).get('bdr') || sessionStorage.getItem('pc_bdr_id') || sessionStorage.getItem('hc_viewer_bdr_id');
        const start = me.bdrs.find(b => b.id === wanted) || (me.isAdmin ? null : me.bdrs[0]);
        sel.innerHTML = (me.isAdmin ? '<option value="">Choose a BDR…</option>' : '') + me.bdrs.map(b => `<option value="${esc(b.id)}">${esc(b.name)}${b.email ? ' (' + esc(b.email) + ')' : ''}</option>`).join('');
        if (start) sel.value = start.id;
        wrap.hidden = !(me.isAdmin || me.bdrs.length > 1);
        sel.addEventListener('change', () => { if (sel.value) sessionStorage.setItem('pc_bdr_id', sel.value); onChange(sel.value || null); });
        return { me, bdrId: start ? start.id : null };
    }

    return { API, COMMENT_MAX, esc, toDate, fmt, fmtDay, ago, linkedInUrl, linkedInImage, api, apiImage, say, personHtml, postHtml, scoreHtml, wire, updateCount, chooseBdr, signedInUser };
})();
