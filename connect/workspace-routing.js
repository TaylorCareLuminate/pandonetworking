/**
 * Workspace routing — metadata-only merges (routingWorkspaceIds + mergedInto).
 * Loaded as a classic script; exposes window.WorkspaceRouting.
 * Version: 1.0.1 — document snapshot `exists` property (CLEmail) vs `exists()` (native Firestore)
 * Version: 1.0.2 — queryUnionByField uses paginated getAllDocs (with per-page retry) when
 *                   available, so large BDR/workspace lists (10k+ rows) don't time out.
 * Version: 1.1.0 — groupWorkspacesByClient / loadCustomerMap / appendWorkspaceOptgroups:
 *                   organize workspace dropdowns into per-client-company optgroups based
 *                   on the clientIds set in Workspace HQ.
 */
(function (global) {
    /** CLEmail wrapper uses `exists` boolean; native Firestore may use `exists()` method. */
    function documentExists(snap) {
        if (snap == null) return false;
        if (typeof snap.exists === 'function') return snap.exists();
        return Boolean(snap.exists);
    }

    const WR = {
        WS_PREFIX: '__ws__:',
        /** Firestore disjunction limit */
        MAX_IN: 30,

        isWorkspaceSentinel(v) {
            return typeof v === 'string' && v.startsWith(WR.WS_PREFIX);
        },

        parseIdFromSentinel(v) {
            if (!WR.isWorkspaceSentinel(v)) return null;
            return v.slice(WR.WS_PREFIX.length);
        },

        /** Only workspaces that are not absorbed into another (shown in dropdowns). */
        filterActiveWorkspaces(workspaces) {
            return (workspaces || []).filter(w => w && !w.mergedInto);
        },

        /**
         * 📚 = reusable “Source” search pool; 🗂️ = folder.
         * (HTML option text — keep ASCII-safe for older browsers.)
         */
        optionLabel(ws) {
            if (!ws) return '';
            const src = ws.isSource === true ? '\u{1F4DA} ' : '';
            const folder = '\u{1F5C2}\uFE0F ';
            return `${src}${folder}${ws.name || ws.id}`;
        },

        async resolveCanonicalWorkspaceId(db, getDoc, docFn, workspaceDocId) {
            let id = workspaceDocId;
            const seen = new Set();
            for (let i = 0; i < 24; i++) {
                if (!id || seen.has(id)) break;
                seen.add(id);
                const snap = await getDoc(docFn(db, 'workspaces', id));
                if (!documentExists(snap)) return id;
                const m = snap.data().mergedInto;
                if (!m) return id;
                id = m;
            }
            return id;
        },

        async getRoutingWorkspaceIds(db, getDoc, docFn, workspaceDocId) {
            const can = await WR.resolveCanonicalWorkspaceId(db, getDoc, docFn, workspaceDocId);
            const snap = await getDoc(docFn(db, 'workspaces', can));
            if (!documentExists(snap)) return [can];
            const r = snap.data().routingWorkspaceIds;
            if (Array.isArray(r) && r.length) {
                const set = new Set(r);
                set.add(can);
                return [...set];
            }
            return [can];
        },

        async getRoutingSentinelsForCanonical(db, deps, canonicalWorkspaceDocId) {
            const { getDoc, doc: docFn } = deps;
            const ids = await WR.getRoutingWorkspaceIds(db, getDoc, docFn, canonicalWorkspaceDocId);
            return ids.map(id => WR.WS_PREFIX + id);
        },

        chunk(arr, n) {
            const out = [];
            for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
            return out;
        },

        /**
         * All docs in collection where field matches any sentinel (chunks of MAX_IN).
         * Dedupes by document id.
         *
         * Uses getAllDocs (paginated, with per-page retry) when the caller's
         * firestore module exposes it, since a single sentinel/chunk can match
         * a very large number of rows (BDR/workspace lists with 10k+ contacts
         * have been seen) — fetching that in one unpaginated request risks
         * timing out. Falls back to plain getDocs for older callers.
         */
        async queryUnionByField(db, collectionName, field, sentinels, firestore, options = {}) {
            const { getDocs, getAllDocs, query, where, collection: colFn } = firestore;
            if (!sentinels || sentinels.length === 0) return [];
            const unique = [...new Set(sentinels)];
            const byId = new Map();
            const chunks = WR.chunk(unique, WR.MAX_IN);
            for (const ch of chunks) {
                let q;
                if (ch.length === 1) {
                    q = query(colFn(db, collectionName), where(field, '==', ch[0]));
                } else {
                    q = query(colFn(db, collectionName), where(field, 'in', ch));
                }
                const snap = getAllDocs
                    ? await getAllDocs(q, {
                        pageSize: options.pageSize || 2000,
                        timeoutMs: options.timeoutMs || 60000,
                        maxRetries: options.maxRetries ?? 3,
                        onPage: options.onPage
                    })
                    : await getDocs(q);
                snap.forEach(d => {
                    if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() });
                });
            }
            return [...byId.values()];
        },

        /**
         * Groups workspaces by their associated client company (ws.clientIds, set via
         * Workspace HQ's "Clients" field). A workspace with multiple clientIds appears
         * in each of those groups. Workspaces with no clientIds land in `unassigned`.
         *
         * @param {Array} workspaces - workspace rows ({ id, name, clientIds, ... })
         * @param {Map|Object} [customerMap] - clientId -> client display name
         * @returns {{groups: Array<{id:string,name:string,workspaces:Array}>, unassigned: Array}}
         */
        groupWorkspacesByClient(workspaces, customerMap) {
            const getName = (id) => {
                if (!id) return null;
                if (customerMap instanceof Map) return customerMap.get(id);
                return customerMap ? customerMap[id] : null;
            };
            const groups = new Map(); // clientId -> { id, name, workspaces: [] }
            const unassigned = [];
            (workspaces || []).forEach(ws => {
                const ids = Array.isArray(ws && ws.clientIds) ? ws.clientIds.filter(Boolean) : [];
                if (!ids.length) { unassigned.push(ws); return; }
                ids.forEach(cid => {
                    if (!groups.has(cid)) groups.set(cid, { id: cid, name: getName(cid) || cid, workspaces: [] });
                    groups.get(cid).workspaces.push(ws);
                });
            });
            const sortedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
            sortedGroups.forEach(g => g.workspaces.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            unassigned.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return { groups: sortedGroups, unassigned };
        },

        /**
         * Loads `customerList` into a Map<clientId, clientName>. Pass the Firestore
         * function bag the caller already has in scope, e.g.
         *   WR.loadCustomerMap(db, { getDocs, collection })
         */
        async loadCustomerMap(db, firestore) {
            const { getDocs, collection: colFn } = firestore;
            const map = new Map();
            try {
                const snap = await getDocs(colFn(db, 'customerList'));
                snap.forEach(d => {
                    const x = d.data();
                    map.set(d.id, x.name || x.shortName || d.id);
                });
            } catch (e) {
                console.warn('WorkspaceRouting.loadCustomerMap: could not load customerList', e);
            }
            return map;
        },

        /**
         * Appends workspace <option>s to `selectEl`, organized into one <optgroup> per
         * associated client company (falls back to a single flat "── Workspaces ──"
         * group when no workspace in the list has a client association yet, so existing
         * pages look unchanged until someone tags workspaces with clients in Workspace HQ).
         *
         * opts:
         *   customerMap     - Map<clientId, clientName>, e.g. from WR.loadCustomerMap()
         *   value(ws)       - option value builder. Default: `__ws__:${ws.id}`
         *   label(ws)       - option label builder. Default: WR.optionLabel(ws) + " [creator]"
         *   flatLabel       - label used when nothing is grouped. Default '── Workspaces ──'
         *   unassignedLabel - label for leftovers once some ARE grouped. Default '── Unassigned Workspaces ──'
         *   groupAttr       - if set, each <optgroup> gets this attribute (e.g. for later removal)
         *   insertBefore    - if set, groups are inserted before this node instead of appended at the end
         */
        appendWorkspaceOptgroups(selectEl, workspaces, opts) {
            if (!selectEl) return;
            opts = opts || {};
            const list = workspaces || [];
            const valueFn = opts.value || (ws => WR.WS_PREFIX + ws.id);
            const labelFn = opts.label || (ws => {
                const creatorTag = ws.createdBy ? ` [${ws.createdBy.split('@')[0]}]` : '';
                return WR.optionLabel(ws) + creatorTag;
            });
            const appendGroup = (label, wsList) => {
                if (!wsList || !wsList.length) return;
                const grp = document.createElement('optgroup');
                grp.label = label;
                if (opts.groupAttr) grp.setAttribute(opts.groupAttr, '1');
                wsList.forEach(ws => {
                    const opt = document.createElement('option');
                    opt.value = valueFn(ws);
                    opt.textContent = labelFn(ws);
                    opt.dataset.workspaceName = ws.name || '';
                    grp.appendChild(opt);
                });
                if (opts.insertBefore) selectEl.insertBefore(grp, opts.insertBefore);
                else selectEl.appendChild(grp);
            };
            const { groups, unassigned } = WR.groupWorkspacesByClient(list, opts.customerMap);
            if (groups.length === 0) {
                appendGroup(opts.flatLabel || '── Workspaces ──', list);
                return;
            }
            groups.forEach(g => appendGroup(`\u{1F3E2} ${g.name}`, g.workspaces));
            appendGroup(opts.unassignedLabel || '── Unassigned Workspaces ──', unassigned);
        },

        /**
         * String-template counterpart to appendWorkspaceOptgroups(), for call sites that
         * build a <select>'s innerHTML from joined HTML strings rather than the DOM API.
         * Same opts as appendWorkspaceOptgroups(); returns an HTML string of <optgroup>s
         * (or a single flat group) ready to concatenate into the select's innerHTML.
         */
        workspaceOptgroupsHtml(workspaces, opts) {
            opts = opts || {};
            const list = workspaces || [];
            const esc = s => String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const valueFn = opts.value || (ws => WR.WS_PREFIX + ws.id);
            const labelFn = opts.label || (ws => {
                const creatorTag = ws.createdBy ? ` [${ws.createdBy.split('@')[0]}]` : '';
                return WR.optionLabel(ws) + creatorTag;
            });
            const groupHtml = (label, wsList) => {
                if (!wsList || !wsList.length) return '';
                const optionsHtml = wsList
                    .map(ws => `<option value="${esc(valueFn(ws))}">${esc(labelFn(ws))}</option>`)
                    .join('');
                return `<optgroup label="${esc(label)}">${optionsHtml}</optgroup>`;
            };
            const { groups, unassigned } = WR.groupWorkspacesByClient(list, opts.customerMap);
            if (groups.length === 0) {
                return groupHtml(opts.flatLabel || '── Workspaces ──', list);
            }
            return groups.map(g => groupHtml(`\u{1F3E2} ${g.name}`, g.workspaces)).join('')
                + groupHtml(opts.unassignedLabel || '── Unassigned Workspaces ──', unassigned);
        },

        async getWorkspaceDisplayName(db, getDoc, docFn, workspaceDocId) {
            const can = await WR.resolveCanonicalWorkspaceId(db, getDoc, docFn, workspaceDocId);
            const snap = await getDoc(docFn(db, 'workspaces', can));
            if (!documentExists(snap)) return can;
            return snap.data().name || can;
        },

        /**
         * Metadata-only merge: source workspace doc points to target; target.routingWorkspaceIds unions both sets.
         * Contact/org rows keep their existing __ws__:docId values.
         */
        async mergeWorkspaceMetadataOnly(db, deps, sourceId, targetId) {
            const { getDoc, doc: docFn, updateDoc } = deps;
            if (sourceId === targetId) throw new Error('Cannot merge a workspace into itself');
            const srcRef = docFn(db, 'workspaces', sourceId);
            const tgtRef = docFn(db, 'workspaces', targetId);
            const [srcSnap, tgtSnap] = await Promise.all([getDoc(srcRef), getDoc(tgtRef)]);
            if (!documentExists(srcSnap) || !documentExists(tgtSnap)) throw new Error('Workspace not found');
            if (srcSnap.data().mergedInto) throw new Error('Source workspace is already merged into another');
            if (tgtSnap.data().mergedInto) throw new Error('Pick the canonical (non-merged) workspace as merge target');

            const srcIds = srcSnap.data().routingWorkspaceIds?.length
                ? srcSnap.data().routingWorkspaceIds
                : [sourceId];
            const tgtIds = tgtSnap.data().routingWorkspaceIds?.length
                ? tgtSnap.data().routingWorkspaceIds
                : [targetId];
            const union = [...new Set([...tgtIds, ...srcIds])];
            const now = new Date().toISOString();
            await updateDoc(tgtRef, { routingWorkspaceIds: union, lastActivity: now });
            await updateDoc(srcRef, { mergedInto: targetId, lastActivity: now });
        }
    };

    global.WorkspaceRouting = WR;
})(typeof window !== 'undefined' ? window : globalThis);
