/**
 * Shared AI Model Catalog
 * =======================
 * Single source of truth for every AI-model dropdown across the Connect pages.
 *
 * The catalog lives in Firestore at  ai_model_catalog/catalog  →
 *   { models: [{ slug, label, group: 'low'|'medium'|'high', note, active, isDefault }], updatedAt, updatedBy }
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
        { slug: 'anthropic/claude-sonnet-5',       label: 'Claude Sonnet 5',        group: 'medium', note: 'Current default for message writing and Opus review — excellent quality.', isDefault: true },
        { slug: 'anthropic/claude-sonnet-4.6',     label: 'Claude Sonnet 4.6',      group: 'medium', note: 'Fantastic writing and analysis — top-tier reasoning at mid range cost.' },
        { slug: 'anthropic/claude-sonnet-4',       label: 'Claude Sonnet 4',        group: 'medium', note: 'Proven enterprise favorite — reliable, accurate, moderate cost.' },
        { slug: 'openai/gpt-5.2',                  label: 'GPT-5.2',                group: 'medium', note: 'Strong general-purpose model — excellent classification accuracy.' },
        { slug: 'openai/gpt-5.2-chat',             label: 'GPT-5.2 Chat',           group: 'medium', note: 'Cheaper GPT-5 family option — good balance of quality and cost.' },
        { slug: 'openai/gpt-5.4',                  label: 'GPT-5.4',                group: 'medium', note: 'Excellent reasoning — handles nuanced criteria well.' },
        { slug: 'openai/gpt-5.3-codex',            label: 'GPT-5.3 Codex',          group: 'medium', note: 'Coding-focused GPT — surprisingly strong at structured JSON classification tasks.' },
        { slug: 'qwen/qwen3.6-max-preview',        label: 'Qwen 3.6 Max',           group: 'medium', note: 'Strong frontier contender — Qwen\'s most capable model.' },
        { slug: 'x-ai/grok-4.3',                   label: 'Grok 4.3',               group: 'medium', note: 'Very good reasoning — solid mid-tier option from xAI.' },
        { slug: 'z-ai/glm-5.2',                    label: 'GLM-5.2',                group: 'medium', note: 'High-performing newer GLM — improved over GLM-5.1.' },
        // ── High cost ──
        { slug: 'openai/gpt-5.5',                  label: 'GPT-5.5',                group: 'high',   note: 'Top-tier reasoning — OpenAI\'s best for complex, nuanced classification.' },
        { slug: 'openai/gpt-5.5-pro',              label: 'GPT-5.5 Pro',            group: 'high',   note: 'Maximum capability — best possible accuracy, highest cost.' },
        { slug: 'openai/gpt-5.4-pro',              label: 'GPT-5.4 Pro',            group: 'high',   note: 'Premium GPT — exceptional reasoning and accuracy.' },
        { slug: 'openai/gpt-5.2-pro',              label: 'GPT-5.2 Pro',            group: 'high',   note: 'Premium GPT — strong general-purpose at premium tier.' },
        { slug: 'anthropic/claude-opus-4.7',       label: 'Claude Opus 4.7',        group: 'high',   note: 'Premium Claude — outstanding analysis and nuanced judgment.' },
        { slug: 'anthropic/claude-opus-4.7-fast',  label: 'Claude Opus 4.7 Fast',   group: 'high',   note: 'Fast premium Claude — Opus 4.7 quality at higher throughput.' },
        { slug: 'anthropic/claude-opus-4.6',       label: 'Claude Opus 4.6',        group: 'high',   note: 'Elite writing and analysis — excellent for complex org research.' },
        { slug: 'anthropic/claude-opus-4',         label: 'Claude Opus 4',          group: 'high',   note: 'Enterprise flagship Claude — proven, highly accurate, premium cost.' },
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

    /**
     * Loads active catalog models from Firestore (cached per page load).
     * Falls back to SEED_MODELS if Firestore is unavailable or the catalog is empty.
     */
    async function load({ force = false, includeInactive = false } = {}) {
        if (_loadPromise && !force && !includeInactive) return _loadPromise;
        const p = (async () => {
            try {
                if (window.firebaseReady) await window.firebaseReady;
                const fs = window.clemailFirestore;
                const snap = await fs.getDoc(fs.doc(fs.db, 'ai_model_catalog', 'catalog'));
                const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
                const models = (exists ? (snap.data().models || []) : [])
                    .filter(m => m && m.slug)
                    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                const usable = includeInactive ? models : models.filter(m => m.active !== false);
                if (usable.length > 0) return usable;
            } catch (e) {
                console.warn('[AiModelCatalog] Firestore load failed — using built-in list:', e.message);
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

    function noteFor(models, slug)  { return (models.find(m => m.slug === slug) || {}).note  || ''; }
    function labelFor(models, slug) { return (models.find(m => m.slug === slug) || {}).label || slug; }

    window.AiModelCatalog = { SEED_MODELS, GROUP_LABELS, GROUP_ORDER, load, populateSelect, noteFor, labelFor };
})();
