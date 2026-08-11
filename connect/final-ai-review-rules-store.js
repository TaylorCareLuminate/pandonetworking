/**
 * Final AI Review — shared rules store
 *
 * WHY THIS EXISTS
 * Rules used to live ONLY in this browser's localStorage under 'finalAiReviews_v2'.
 * That meant every browser profile / device / site (pandonetworking vs
 * healthluminate) had its own private copy — rules configured in one place
 * silently didn't exist anywhere else, and generation runs would quietly skip
 * the Final AI Review step.
 *
 * HOW IT WORKS NOW
 *  - Source of truth: ONE Firestore document, connect_settings/final_ai_review_rules,
 *    accessed through the clemail Railway wrapper (window.clemailDb) that every
 *    connect page already loads. Same doc for every browser, device, and site.
 *  - localStorage ('finalAiReviews_v2') is kept as a warm cache + offline
 *    fallback, so all the existing synchronous loadRules()/loadFinalAiReviewRules()
 *    readers keep working unchanged after a sync() has refreshed the cache.
 *  - One-time migration: the first page that calls sync() while the cloud doc
 *    doesn't exist yet uploads its cached local rules, seeding the shared store.
 *
 * USAGE (all connect pages)
 *   <script src="../js/auth.js"></script>
 *   <script src="../js/clemail-firestore-wrapper.js"></script>
 *   <script src="final-ai-review-rules-store.js"></script>
 *
 *   const { rules, source } = await window.FinalAiReviewRulesStore.sync();
 *   // ...or keep reading the localStorage cache synchronously after syncing.
 */
(function () {
    'use strict';

    const LS_KEY     = 'finalAiReviews_v2';
    const COLLECTION = 'connect_settings';
    const DOC_ID     = 'final_ai_review_rules';

    function readCache() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function writeCache(rules) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(rules || []));
        } catch (e) {
            console.warn('[FinalAiReviewRulesStore] Could not write localStorage cache:', e.message);
        }
    }

    function requireDb() {
        if (!window.clemailDb) {
            throw new Error('clemail-firestore-wrapper.js is not loaded — cannot reach the shared rules store');
        }
        return window.clemailDb;
    }

    /**
     * Fetch rules from the shared Firestore doc.
     * @returns {Promise<Array|null>} the rules array, or null if the doc doesn't exist yet.
     */
    async function fetchCloud() {
        const snap = await requireDb().collection(COLLECTION).doc(DOC_ID).get();
        const exists = snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists);
        if (!exists) return null;
        const data = snap.data() || {};
        return Array.isArray(data.rules) ? data.rules : null;
    }

    /**
     * Save rules to the shared Firestore doc (and refresh the local cache).
     */
    async function saveCloud(rules, meta = {}) {
        const safeRules = Array.isArray(rules) ? rules : [];
        await requireDb().collection(COLLECTION).doc(DOC_ID).set({
            rules:     safeRules,
            ruleCount: safeRules.length,
            updatedAt: new Date().toISOString(),
            updatedBy: meta.updatedBy || window.auth?.currentUser?.email || 'unknown',
            updatedFrom: meta.updatedFrom || (location.pathname || 'unknown')
        });
        writeCache(safeRules);
    }

    /**
     * Pull the shared rules into the localStorage cache so synchronous readers
     * see the up-to-date shared set.
     *
     * Never throws. Resolution order:
     *  1. Cloud doc exists            → cache it,      { source: 'cloud' }
     *  2. Cloud empty + local rules   → migrate up,    { source: 'migrated' }
     *  3. Cloud empty + no local      → nothing to do, { source: 'empty' }
     *  4. Cloud unreachable (offline / signed out) → keep local cache,
     *                                   { source: 'cache-fallback', error }
     *
     * @returns {Promise<{source: string, rules: Array, error?: string}>}
     */
    async function sync({ migrateIfMissing = true } = {}) {
        try {
            const cloudRules = await fetchCloud();
            if (cloudRules !== null) {
                writeCache(cloudRules);
                console.log(`[FinalAiReviewRulesStore] Synced ${cloudRules.length} rule(s) from shared cloud store`);
                return { source: 'cloud', rules: cloudRules };
            }

            const cached = readCache();
            if (migrateIfMissing && cached.length > 0) {
                try {
                    await saveCloud(cached, { updatedFrom: (location.pathname || '') + ' (auto-migration)' });
                    console.log(`[FinalAiReviewRulesStore] Migrated ${cached.length} local rule(s) up to the shared cloud store`);
                    return { source: 'migrated', rules: cached };
                } catch (e) {
                    console.warn('[FinalAiReviewRulesStore] Auto-migration to cloud failed:', e.message);
                    return { source: 'cache-fallback', rules: cached, error: e.message };
                }
            }
            return { source: 'empty', rules: cached };
        } catch (e) {
            const cached = readCache();
            console.warn(`[FinalAiReviewRulesStore] Cloud store unreachable (${e.message}) — using ${cached.length} locally cached rule(s)`);
            return { source: 'cache-fallback', rules: cached, error: e.message };
        }
    }

    window.FinalAiReviewRulesStore = {
        LS_KEY,
        COLLECTION,
        DOC_ID,
        readCache,
        writeCache,
        fetchCloud,
        saveCloud,
        sync
    };
})();
