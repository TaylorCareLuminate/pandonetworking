/**
 * Shared AI Model Catalog
 * =======================
 * Single source of truth for every AI-model dropdown across the Connect pages.
 *
 * The catalog lives in Firestore at  ai_model_catalog/catalog  →
 *   { models: [{ slug, label, group: 'low'|'medium'|'high', note, active, isDefault,
 *                defaultScan, defaultResearch, defaultWrite, defaultCheck }], updatedAt, updatedBy }
 * (isDefault mirrors defaultScan for older pages; the four default* flags are the per-job
 * defaults — several models may be checked per job and are then used interchangeably.)
 * and is managed on connect/ai_models_admin.html.
 *
 * If Firestore is unreachable (or the catalog has never been saved) the built-in
 * SEED_MODELS list below is used, so pages always have a working dropdown.
 *
 * Usage (any page that already loads clemail-firestore-wrapper.js):
 *   <script src="../js/ai-model-catalog.js"></script>
 *   const models = await AiModelCatalog.load();
 *   AiModelCatalog.populateSelect(document.getElementById('aiModelSelect'), models);
 *
 * populateSelect keeps the select's current value selected (so each page keeps
 * its own default), and appends a "(not in catalog)" option if that value is
 * missing from the catalog rather than silently changing the user's model.
 */
(function () {
    'use strict';

    // Built-in list — mirrors the most complete dropdown in the app
    // (manage_organization_contacts.html) plus the models other pages default to.
    // Also used by "Seed defaults" on ai_models_admin.html.
    const SEED_MODELS = [
        // ── Low cost ──
        { slug: 'deepseek/deepseek-v4-pro',        label: 'DeepSeek V4 Pro',        group: 'low',    note: 'Probably the best value model available. Excellent accuracy at very low cost.' },
        { slug: 'google/gemini-3.1-flash-lite',    label: 'Gemini 3.1 Flash Lite',  group: 'low',    note: 'One of the best high-volume models — very cheap, great for large bulk runs.' },
        { slug: 'qwen/qwen3.6-plus',               label: 'Qwen 3.6 Plus',          group: 'low',    note: 'Strong reasoning for the price — solid all-round low-cost option.' },
        { slug: 'qwen/qwen3.6-35b-a3b',            label: 'Qwen 3.6 35B',           group: 'low',    note: 'Excellent cheap workhorse — larger model at minimal cost.' },
        { slug: 'moonshotai/kimi-k2.6',            label: 'Kimi K2.6',              group: 'low',    note: 'Excellent long-context model — handles orgs with lots of web data well.' },
        { slug: 'minimax/minimax-m2.7',            label: 'MiniMax M2.7',           group: 'low',    note: 'Very inexpensive and capable — good for simple classifications at scale.' },
        { slug: 'xiaomi/mimo-v2.5',                label: 'Mimo V2.5',              group: 'low',    note: 'Extremely cheap for its quality — great for high-volume runs.' },
        { slug: 'xiaomi/mimo-v2.5-pro',            label: 'Mimo V2.5 Pro',          group: 'low',    note: 'Better quality while still cheap — step up from Mimo V2.5.' },
        { slug: 'z-ai/glm-5',                      label: 'GLM-5',                  group: 'low',    note: 'Strong Chinese + English performance — good for organizations in both markets.' },
        { slug: 'z-ai/glm-5.1',                    label: 'GLM-5.1',                group: 'low',    note: 'Improved reasoning over GLM-5 — better at ambiguous cases.' },
        { slug: 'x-ai/grok-4.20',                  label: 'Grok 4.20',              group: 'low',    note: 'Good quality for low cost — solid Grok entry point.' },
        { slug: 'meta-llama/llama-4-maverick',     label: 'Llama 4 Maverick',       group: 'low',    note: 'Meta\'s workhorse model — proven, fast, and a long-time default for filtering tools.' },
        { slug: 'meta-llama/llama-4-scout',        label: 'Llama 4 Scout',          group: 'low',    note: 'Lighter Llama 4 variant — cheaper and faster, good for simple criteria.' },
        { slug: 'deepseek/deepseek-chat-v3-0324',  label: 'DeepSeek V3',            group: 'low',    note: 'Older DeepSeek chat model — still a capable budget option.' },
        { slug: 'qwen/qwen3-235b-a22b',            label: 'Qwen3 235B',             group: 'low',    note: 'Large open-weights Qwen — good quality at low cost.' },
        { slug: 'anthropic/claude-haiku-4-5',      label: 'Claude Haiku 4.5',       group: 'low',    note: 'Fastest, cheapest Claude — good for quick checks and rewrites.' },
        // ── Medium cost ──
        { slug: 'google/gemini-3.5-flash',         label: 'Gemini 3.5 Flash',       group: 'medium', note: 'Arguably the best overall value today — highly recommended for most runs.' },
        { slug: 'google/gemini-3.1-pro-preview',   label: 'Gemini 3.1 Pro',         group: 'medium', note: 'Excellent research model — great at synthesizing web search data.' },
        { slug: 'anthropic/claude-sonnet-5.5',       label: 'Claude Sonnet 5.5',        group: 'medium', note: 'Current default for message writing and Opus review — excellent quality.', isDefault: true, defaultScan: true, defaultWrite: true },
        { slug: 'openai/gpt-5.2',                  label: 'GPT-5.2',                group: 'medium', note: 'Strong general-purpose model — excellent classification accuracy.' },
        { slug: 'openai/gpt-5.2-chat',             label: 'GPT-5.2 Chat',           group: 'medium', note: 'Cheaper GPT-5 family option — good balance of quality and cost.' },
        { slug: 'openai/gpt-5.4',                  label: 'GPT-5.4',                group: 'medium', note: 'Excellent reasoning — handles nuanced criteria well.' },
        { slug: 'openai/gpt-5.3-codex',            label: 'GPT-5.3 Codex',          group: 'medium', note: 'Coding-focused GPT — surprisingly strong at structured JSON classification tasks.' },
        { slug: 'qwen/qwen3.6-max-preview',        label: 'Qwen 3.6 Max',           group: 'medium', note: 'Strong frontier contender — Qwen\'s most capable model.' },
        { slug: 'x-ai/grok-4.3',                   label: 'Grok 4.3',               group: 'medium', note: 'Very good reasoning — solid mid-tier option from xAI.', defaultResearch: true },
        { slug: 'z-ai/glm-5.2',                    label: 'GLM-5.2',                group: 'medium', note: 'High-performing newer GLM — improved over GLM-5.1.' },
        { slug: 'moonshotai/kimi-k3',               label: 'Kimi K3',                group: 'medium', note: 'Moonshot\'s newest flagship — 2.8T-parameter MoE with native vision and a 1M-token context; excellent at long-horizon reasoning and research synthesis.' },
        // ── High cost ──
        { slug: 'openai/gpt-5.5',                  label: 'GPT-5.5',                group: 'high',   note: 'Top-tier reasoning — OpenAI\'s best for complex, nuanced classification.' },
        { slug: 'openai/gpt-5.5-pro',              label: 'GPT-5.5 Pro',            group: 'high',   note: 'Maximum capability — best possible accuracy, highest cost.' },
        { slug: 'openai/gpt-5.4-pro',              label: 'GPT-5.4 Pro',            group: 'high',   note: 'Premium GPT — exceptional reasoning and accuracy.' },
        { slug: 'openai/gpt-5.2-pro',              label: 'GPT-5.2 Pro',            group: 'high',   note: 'Premium GPT — strong general-purpose at premium tier.' },
        { slug: 'anthropic/claude-opus-5.5',       label: 'Claude Opus 5.5',        group: 'high',   note: 'Premium Claude — outstanding analysis and nuanced judgment.', defaultCheck: true },
    ].map((m, i) => ({ active: true, sortOrder: i, ...m }));

    const GROUP_LABELS = {
        low:    '💚 Low Cost',
        medium: '🎯 Medium Cost',
        high:   '🧠 High Cost (Most Accurate)',
        other:  'Other'
    };
    const GROUP_ORDER = ['low', 'medium', 'high', 'other'];

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    let _loadPromise = null;

    const RAILWAY_CATALOG_URL = 'https://railwayclemail-production.up.railway.app/api/ai-models/list';

    /**
     * Loads active catalog models from Firestore (cached per page load).
     * If the page doesn't load clemail-firestore-wrapper.js (or Firestore fails), falls back to
     * Railway's /api/ai-models/list endpoint (which reads the same Firestore doc), and finally
     * SEED_MODELS so pages always have a working model list.
     */
    async function load({ force = false, includeInactive = false } = {}) {
        if (_loadPromise && !force && !includeInactive) return _loadPromise;
        const p = (async () => {
            try {
                if (window.firebaseReady) await window.firebaseReady;
                const fs = window.clemailFirestore;
                if (fs && fs.getDoc && fs.doc && fs.db) {
                    const snap = await fs.getDoc(fs.doc(fs.db, 'ai_model_catalog', 'catalog'));
                    const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
                    const models = (exists ? (snap.data().models || []) : [])
                        .filter(m => m && m.slug)
                        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                    const usable = includeInactive ? models : models.filter(m => m.active !== false);
                    if (usable.length > 0) return usable;
                }
            } catch (e) {
                console.warn('[AiModelCatalog] Firestore load failed — trying API fallback:', e.message);
            }
            if (!includeInactive && typeof fetch === 'function') {
                try {
                    const r = await fetch(RAILWAY_CATALOG_URL);
                    const j = await r.json();
                    if (j && j.success && Array.isArray(j.models) && j.models.length > 0) {
                        const mapped = j.models.map((m, i) => ({
                            slug: m.slug || m.id,
                            label: m.label || m.slug || m.id,
                            group: m.group || 'other',
                            note: m.note || '',
                            active: true,
                            isDefault: !!m.default,
                            defaultScan: m.defaultScan !== undefined ? !!m.defaultScan : !!m.default,
                            defaultResearch: !!m.defaultResearch,
                            defaultWrite: !!m.defaultWrite,
                            defaultCheck: !!m.defaultCheck,
                            sortOrder: i
                        })).filter(m => m.slug);
                        if (mapped.length > 0) return mapped;
                    }
                } catch (e2) {
                    console.warn('[AiModelCatalog] API fallback failed — using built-in list:', e2.message);
                }
            }
            return SEED_MODELS.slice();
        })();
        if (!includeInactive) _loadPromise = p;
        return p;
    }

    /**
     * Rebuilds a <select> from catalog models, grouped by cost tier.
     *
     * options:
     *   selected     — value to select (defaults to the select's current value,
     *                  preserving each page's own default)
     *   valuePrefix  — prepended to every option value (e.g. 'openrouter:' for
     *                  pages whose backend expects prefixed slugs)
     *   extraOptions — [{ value, label }] pinned above the catalog groups
     *                  (for page-specific modes like legacy Opus slugs)
     */
    function populateSelect(sel, models, { selected, valuePrefix = '', extraOptions = [] } = {}) {
        if (!sel || !models || models.length === 0) return;
        const keep = selected !== undefined ? selected : sel.value;

        const groups = new Map();
        models.forEach(m => {
            const g = GROUP_ORDER.includes(m.group) ? m.group : 'other';
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(m);
        });

        let html = extraOptions.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
        for (const g of GROUP_ORDER) {
            const items = groups.get(g);
            if (!items || !items.length) continue;
            html += `<optgroup label="${esc(GROUP_LABELS[g])}">` +
                items.map(m => `<option value="${esc(valuePrefix + m.slug)}">${esc(m.label || m.slug)}</option>`).join('') +
                '</optgroup>';
        }
        sel.innerHTML = html;

        if (keep) {
            if (![...sel.options].some(o => o.value === keep)) {
                // Never silently change the page's model — keep the old value visible.
                const opt = document.createElement('option');
                opt.value = keep;
                opt.textContent = `${keep} (not in catalog)`;
                sel.appendChild(opt);
            }
            sel.value = keep;
        }
    }

    // ── Role defaults ─────────────────────────────────────────────────────
    // ai_models_admin.html lets an admin check any number of models as the default for each
    // job: scanning, web research, writing messages, and checking (reviewing) messages. When
    // several are checked they are used interchangeably — each call picks one of them at random.
    //   scan     → defaultScan     (filters, bulk screens, cleanup scans, conversation/meeting scanners)
    //   research → defaultResearch (web search + AI discovery, LinkedIn URL finder, :online company research)
    //   write    → defaultWrite    (message & reply writing, human-style rewrites, quick text / bulk AI edits, SOPs)
    //   check    → defaultCheck    (Opus Review, Final AI Review, rule audits, provenance & send checks)
    const ROLE_FIELD = {
        scan: 'defaultScan',
        research: 'defaultResearch',
        write: 'defaultWrite',
        check: 'defaultCheck'
    };
    const ROLE_LABELS = {
        scan: 'Scans',
        research: 'Research',
        write: 'Writing messages',
        check: 'Checking messages'
    };
    // <option> values that mean "pick a random model from the checked defaults, per call/message".
    const RANDOM_VALUE = {
        scan: '__random_scan__',
        research: '__random_research__',
        write: '__random_write__',
        check: '__random_check__'
    };
    const DEFAULT_SENTINEL = {
        scan: '__default_scan__',
        research: '__default_research__',
        write: '__default_write__',
        check: '__default_check__'
    };
    const SENTINEL_TO_ROLE = {};
    Object.keys(ROLE_FIELD).forEach(r => {
        SENTINEL_TO_ROLE[RANDOM_VALUE[r]] = r;
        SENTINEL_TO_ROLE[DEFAULT_SENTINEL[r]] = r;
    });

    function stripPrefix(slug) {
        return String(slug || '').replace(/^openrouter:/i, '');
    }

    function noteFor(models, slug) {
        const s = String(slug || '');
        const sentinelRole = SENTINEL_TO_ROLE[s];
        if (sentinelRole) {
            const sum = roleSummary(models, sentinelRole);
            return sum
                ? `Uses the ${ROLE_LABELS[sentinelRole].toLowerCase()} default(s) from AI Models Admin (${sum}) — picked at random when multiple are checked.`
                : '';
        }
        const clean = stripPrefix(s);
        return ((models || []).find(m => m.slug === clean) || {}).note || '';
    }

    function labelFor(models, slug) {
        const s = String(slug || '');
        const sentinelRole = SENTINEL_TO_ROLE[s];
        if (sentinelRole) {
            const sum = roleSummary(models, sentinelRole);
            return sum ? `AI Models Admin default (${sum})` : `AI Models Admin (${ROLE_LABELS[sentinelRole]})`;
        }
        const clean = stripPrefix(s);
        return ((models || []).find(m => m.slug === clean) || {}).label || slug;
    }

    function roleFlag(m, role) {
        const field = ROLE_FIELD[role];
        if (!field || !m) return false;
        if (m[field] !== undefined) return !!m[field];
        // Catalogs saved before role defaults existed only had a single "isDefault" (the
        // meeting-date scanner's model) — that is the scan default.
        return role === 'scan' && !!m.isDefault;
    }

    /** Active models checked as the default for a role ('scan' | 'research' | 'write' | 'check'). */
    function roleModels(models, role) {
        return (models || []).filter(m => m && m.slug && m.active !== false && roleFlag(m, role));
    }

    /** One checked model for the role, chosen at random (so several are used interchangeably). `fallback` when none are checked. */
    function pickForRole(models, role, fallback = '') {
        const pool = roleModels(models, role);
        return pool.length ? pool[Math.floor(Math.random() * pool.length)].slug : fallback;
    }

    /** Async convenience for headless / inline AI calls: loads the catalog (cached) and picks a model for `role`. */
    async function pickForRoleAsync(role, fallback = '') {
        try {
            const models = await load();
            return pickForRole(models, role, fallback);
        } catch (_) {
            return fallback;
        }
    }

    /**
     * Resolves a dropdown/rule value to a real slug: a RANDOM_VALUE or DEFAULT_SENTINEL becomes a
     * fresh random pick from the role's checked models (call it once per message/batch); anything
     * else passes through. Falls back to `fallback` if a sentinel is chosen when nothing is checked.
     */
    function resolveRoleChoice(value, models, role, fallback = '') {
        const v = String(value || '');
        const matchedRole = SENTINEL_TO_ROLE[v] || (v === RANDOM_VALUE[role] || v === DEFAULT_SENTINEL[role] ? role : null);
        if (matchedRole) return pickForRole(models, matchedRole, fallback);
        return v || fallback;
    }

    /**
     * Expands any '__default_<role>__' / '__random_<role>__' entries in an array of model IDs
     * (e.g. Final AI Review `rule.models`) into all active models checked for that role on AI Models Admin.
     */
    function expandRoleSentinels(list, models, fallback = 'anthropic/claude-sonnet-5.5') {
        const out = [];
        const seen = new Set();
        const push = s => { if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
        for (const item of (list || [])) {
            const r = SENTINEL_TO_ROLE[item];
            if (r) {
                const pool = roleModels(models, r);
                if (pool.length) pool.forEach(m => push(m.slug));
                else if (fallback) push(fallback);
            } else {
                push(item);
            }
        }
        return out;
    }

    /** "Claude Sonnet 5.5, GPT-5.5" — display names of the models checked for a role. */
    function roleSummary(models, role) {
        return roleModels(models, role).map(m => m.label || m.slug).join(', ');
    }

    /**
     * Adds a "🎲 Random from checked defaults" option at the top of a <select> when at least one
     * model is checked for the role. When `select` is true it becomes the selected option.
     */
    function addRandomOption(sel, models, role, { select = true } = {}) {
        if (!sel) return false;
        const pool = roleModels(models, role);
        if (pool.length === 0) return false;
        const old = sel.querySelector(`option[value="${RANDOM_VALUE[role]}"]`);
        if (old) old.remove();
        const opt = document.createElement('option');
        opt.value = RANDOM_VALUE[role];
        opt.textContent = pool.length > 1
            ? `🎲 Random from checked ${ROLE_LABELS[role].toLowerCase()} defaults (${pool.length}: ${roleSummary(models, role)})`
            : `🎯 ${ROLE_LABELS[role]} default (${roleSummary(models, role)})`;
        sel.insertBefore(opt, sel.firstChild);
        if (select) sel.value = opt.value;
        return true;
    }

    /**
     * Populates a <select> from the catalog AND selects the model configured for `role` on
     * ai_models_admin.html (picking one at random if several are checked, or inserting the
     * per-call random option when `randomOption: true`). Falls back to `fallback` (or the
     * select's initial value) only when NO active model is ticked for `role` on AI Models Admin.
     */
    function populateForRole(sel, models, role, {
        fallback,
        valuePrefix = '',
        extraOptions = [],
        randomOption = false,
        catalogModels
    } = {}) {
        if (!sel || !models || models.length === 0) return '';
        const picked = pickForRole(models, role, '');
        const fallbackVal = fallback !== undefined
            ? (fallback && valuePrefix && !String(fallback).startsWith(valuePrefix) && !extraOptions.some(o => o.value === fallback)
                ? valuePrefix + fallback
                : fallback)
            : sel.value;
        const target = picked ? (valuePrefix + picked) : fallbackVal;
        populateSelect(sel, catalogModels || models, { selected: target, valuePrefix, extraOptions });
        if (randomOption) addRandomOption(sel, models, role, { select: true });
        return sel.value;
    }

    window.AiModelCatalog = {
        SEED_MODELS, GROUP_LABELS, GROUP_ORDER, ROLE_FIELD, ROLE_LABELS, RANDOM_VALUE, DEFAULT_SENTINEL,
        load, populateSelect, populateForRole, noteFor, labelFor,
        roleFlag, roleModels, pickForRole, pickForRoleAsync, resolveRoleChoice, expandRoleSentinels, roleSummary, addRandomOption
    };
})();
