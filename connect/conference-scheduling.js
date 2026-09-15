/**
 * Conference Scheduling — shared data layer + embeddable widget
 * ================================================================
 * Used by:
 *   - conference_scheduling.html   (BDR availability builder + client report)
 *   - index_admin.html             (LinkedIn Reply Alerts cards)
 *   - fast_connect_review.html     (message review cards)
 *
 * Data model (Firestore, via window.clemailFirestore):
 *
 *   conferences/{conferenceId}
 *     { name, location, startDate, endDate, notes, status, createdAt, createdBy }
 *
 *   conference_availability/{conferenceId}__{bdrEmailLower}
 *     { conferenceId, bdrEmail, bdrName, slotDurationMinutes,
 *       windows: [{ id, date, startTime, endTime }],
 *       slots:   [{ id, date, startTime, endTime, status:'open'|'booked',
 *                    meetingRequestId, contactName, contactCompany }],
 *       updatedAt }
 *
 *   conference_meeting_requests/{conferenceId}__{contactKey}
 *     { conferenceId, conferenceName, bdrEmail, bdrName,
 *       contactLiUrl, contactName, contactFirstName, contactLastName,
 *       contactCompany, contactTitle,
 *       wantsToMeet, hasTimeSlot, slotId, date, startTime, endTime,
 *       email, phone, emailSource, phoneSource, notes,
 *       status:'active'|'cancelled', source, createdAt, updatedAt }
 *
 * @version 1.4.0 — cross-widget slot-status sync: holding/booking/releasing a
 *   slot from any mounted widget now notifies every other widget showing the
 *   same BDR+conference (via setSlotStatus/releaseSlot centrally, not each
 *   caller) so a held/booked time disappears from their pickers immediately;
 *   each widget also self-polls every 20s as a fallback for cross-tab/page
 *   changes the in-page pub/sub can't reach.
 * @version 1.5.0 — fixed findConversationTextForContact() so the "AI-scan
 *   missing info" email/phone lookup actually finds conversations: it now
 *   queries all 4 fields a heyreach_inbox doc may be tagged with the owning
 *   BDR under (bdrEmail/accountEmail/linkedInAccountEmail/uploadedByEmail —
 *   was only checking 2), and falls back to rawData.messages when a doc's
 *   messages live there instead of top-level `messages` (was only checking
 *   top-level, which silently produced an empty conversation to scan for
 *   most docs, so no email/phone was ever found even though the data was
 *   right there).
 * @version 1.6.0 — added findConversationsForContacts() + conversationKeyFor()
 *   for the PDF report's conversation-transcript appendix: batch-fetches each
 *   BDR's heyreach_inbox once and returns structured transcripts
 *   ([{ sender, text, at }]) for every requested contact, instead of one
 *   4-query lookup per contact.
 * @version 1.7.0 — conversation lookup actually finds docs now. heyreach_inbox
 *   tags bdrEmail/accountEmail/linkedInAccountEmail with the LINKEDIN
 *   account's email (see heyreach_inbox_service.js), which for many BDRs is
 *   not the work email stored on meeting requests — so every email-equality
 *   query returned 0 docs and the scan flew through contacts finding nothing.
 *   Lookup is now (1) a targeted where('leadProfileUrl','in',variants) query,
 *   falling back to (2) the BDR's inbox fetched with ALL alias emails
 *   (bdr_leaders.primaryEmail/.linkedInEmail + linkedin_email_associations),
 *   matched locally by URL or /in/<slug>. Diagnostic console logs added.
 * @version 1.8.0 — backend-friendly fallback fetches: heyreach_inbox docs are
 *   heavy (full rawData message history each), and the wrapper's default
 *   5000-doc pages plus alias×field query fan-out were 502'ing Railway
 *   mid-scan. Inbox fetches now use 1000-doc pages, tier-2 runs one alias at
 *   a time, and a failed full-inbox load backs off for 30s instead of
 *   re-attempting for every remaining contact in the scan.
 * @version 1.9.0 — conversation lookup ported directly from
 *   company_review_replies.html's proven findConversationForLead(): exact-
 *   match queries (Firestore `==`, not a lenient normalized/slug scan) across
 *   the 4 URL field names heyreach_inbox may use, then the linkedinMessages
 *   collection (a second conversation source that file also reads, which
 *   this file never checked at all), then exact leadFirstName+leadLastName
 *   (and legacy combined-name field) match. The from-scratch URL-variant
 *   matching + "load the entire 36,000-doc collection and scan it" fallback
 *   from v1.7/1.8 is gone — it was slow, risked 502-ing Railway, and (per
 *   production logs) still matched nothing, because these fields are written
 *   with exact-match lookups in mind, not fuzzy ones. The BDR-alias-expanded
 *   local match from v1.7 is kept as a last resort for genuine casing
 *   mismatches, now cheaper to reach since it's tier 4, not tier 2.
 *   findConversationTextForContact/findConversationsForContacts now also
 *   accept contactFirstName/contactLastName for the name-match tier.
 * @version 1.10.0 — added the missing THIRD conversation source:
 *   heyreach_activity (HeyReach's webhook event stream). Confirmed directly
 *   against production Firestore data: every meeting-request contact that
 *   v1.9 still reported "no conversation found" for (Misty Theriot, Kate
 *   Stirek, Kelly Murphy, Akshay Raut, and others under BDR
 *   betsy@carta.healthcare) has ZERO docs in heyreach_inbox under any field —
 *   confirmed by a full 36,031-doc admin-SDK scan — but has a real,
 *   multi-event back-and-forth in heyreach_activity, which this file never
 *   queried at all. That collection stores each reply as a separate webhook
 *   doc carrying a growing rawData.recent_messages array rather than one doc
 *   per lead, so _findByActivityWebhook() fetches every doc matching the
 *   contact's leadProfileUrl and merges/de-dupes their message arrays into
 *   one transcript (mirrors company_review_replies.html's
 *   loadHeyreachActivity()). Lookup also no longer stops at the first doc
 *   MATCH — it keeps trying tiers until one actually yields a non-empty
 *   transcript, since a matched heyreach_inbox/linkedinMessages doc can be a
 *   metadata-only stub with no messages.
 */
(function () {
    'use strict';

    const RAILWAY_BASE = 'https://railwayclemail-production.up.railway.app';

    function fx() { return window.clemailFirestore; }
    function dbi() { return window.clemailDb; }

    // ── Helpers ──────────────────────────────────────────────────────────
    function normalizeLiUrl(url) {
        if (!url) return '';
        return String(url).toLowerCase().trim()
            .replace(/\/$/, '')
            .replace(/^https?:\/\/(www\.)?/, 'https://');
    }

    function slugify(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    }

    // Stable-ish short hash so contact keys don't blow up doc-id length limits.
    function shortHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        }
        return Math.abs(h).toString(36);
    }

    function contactKeyFor(ctx) {
        const url = normalizeLiUrl(ctx.contactLiUrl);
        if (url) return 'li_' + shortHash(url);
        return 'nc_' + slugify(`${ctx.contactName || ''}_${ctx.contactCompany || ''}`).slice(0, 60) || ('anon_' + shortHash(JSON.stringify(ctx)));
    }

    function availabilityDocId(conferenceId, bdrEmail) {
        return `${conferenceId}__${(bdrEmail || '').toLowerCase().trim()}`;
    }

    function minutesToHHMM(mins) {
        const h = Math.floor(mins / 60).toString().padStart(2, '0');
        const m = (mins % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    function hhmmToMinutes(hhmm) {
        const [h, m] = String(hhmm || '0:0').split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    function fmtTime12(hhmm) {
        if (!hhmm) return '';
        const [h, m] = hhmm.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }

    function fmtDateLong(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    function fmtDateShort(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    // ── Conferences ──────────────────────────────────────────────────────
    let _conferencesCache = null;
    let _conferencesCacheAt = 0;

    async function loadConferences(forceRefresh) {
        if (_conferencesCache && !forceRefresh && (Date.now() - _conferencesCacheAt) < 60000) {
            return _conferencesCache;
        }
        const { collection, getDocs } = fx();
        const snap = await getDocs(collection(dbi(), 'conferences'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(c => c.status !== 'archived');
        list.sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
        _conferencesCache = list;
        _conferencesCacheAt = Date.now();
        return list;
    }

    async function loadAllConferences() {
        const { collection, getDocs } = fx();
        const snap = await getDocs(collection(dbi(), 'conferences'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
        return list;
    }

    async function createConference(data) {
        const { collection, addDoc } = fx();
        const ref = await addDoc(collection(dbi(), 'conferences'), {
            name: data.name || 'Untitled Conference',
            location: data.location || '',
            startDate: data.startDate || '',
            endDate: data.endDate || data.startDate || '',
            notes: data.notes || '',
            status: data.status || 'upcoming',
            createdAt: new Date(),
            createdBy: data.createdBy || ''
        });
        _conferencesCache = null;
        return ref.id;
    }

    async function updateConference(id, patch) {
        const { doc, updateDoc } = fx();
        await updateDoc(doc(dbi(), 'conferences', id), { ...patch, updatedAt: new Date() });
        _conferencesCache = null;
    }

    async function deleteConference(id) {
        const { doc, deleteDoc } = fx();
        await deleteDoc(doc(dbi(), 'conferences', id));
        _conferencesCache = null;
    }

    // ── BDR Availability / Slots ────────────────────────────────────────
    // In-flight request de-duplication: pages like company_review_replies.html
    // mount one widget per contact card, and many contacts share the same BDR —
    // so a single render pass can fire dozens of *simultaneous, identical*
    // GETs for that BDR's availability doc. Share one in-flight promise per
    // doc id instead of firing them all. This never serves stale data to a
    // write path (setSlotStatus/saveAvailability always await a fresh call
    // that starts *after* any prior in-flight request has already resolved
    // and been cleared below), it only collapses truly-concurrent duplicates.
    const _inFlightAvailability = new Map();
    async function getAvailabilityDoc(conferenceId, bdrEmail) {
        const id = availabilityDocId(conferenceId, bdrEmail);
        if (_inFlightAvailability.has(id)) return _inFlightAvailability.get(id);
        const promise = (async () => {
            const { doc, getDoc } = fx();
            const snap = await getDoc(doc(dbi(), 'conference_availability', id));
            return snap.exists ? { id: snap.id, ...snap.data() } : null;
        })();
        _inFlightAvailability.set(id, promise);
        try {
            return await promise;
        } finally {
            _inFlightAvailability.delete(id);
        }
    }

    async function getAllAvailabilityForConference(conferenceId) {
        const { collection, getDocs, query, where } = fx();
        const snap = await getDocs(query(collection(dbi(), 'conference_availability'), where('conferenceId', '==', conferenceId)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /**
     * Which conferences a given BDR actually has time set up for (i.e. has at
     * least one generated slot under conference_availability), regardless of
     * whether any of those slots are still open. Used by mountWidget() to hide
     * conferences from a contact's "Conference Meeting" picker that this BDR
     * isn't attending — showing every conference in the system there just adds
     * noise and makes it easy to pick one that will only ever say "no open
     * slots for this BDR".
     *
     * Cached + in-flight-deduped per bdrEmail (same reasoning as
     * getAvailabilityDoc above): review pages mount one widget per contact
     * card, and most contacts share just a handful of BDRs, so without this a
     * single render pass would fire one of these queries per card.
     */
    const _bdrConferenceIdsCache = new Map(); // bdrEmail -> { ids, at }
    const _inFlightBdrConferenceIds = new Map();
    const BDR_CONFERENCE_IDS_TTL_MS = 60000;
    async function getBdrConferenceIdsWithAvailability(bdrEmail) {
        if (!bdrEmail) return new Set();
        const lower = bdrEmail.toLowerCase().trim();
        const cached = _bdrConferenceIdsCache.get(lower);
        if (cached && (Date.now() - cached.at) < BDR_CONFERENCE_IDS_TTL_MS) return cached.ids;
        if (_inFlightBdrConferenceIds.has(lower)) return _inFlightBdrConferenceIds.get(lower);
        const promise = (async () => {
            const ids = new Set();
            const { collection, getDocs, query, where } = fx();
            const snap = await getDocs(query(collection(dbi(), 'conference_availability'), where('bdrEmail', '==', lower)));
            snap.docs.forEach(d => {
                const data = d.data();
                if (Array.isArray(data.slots) && data.slots.length > 0 && data.conferenceId) {
                    ids.add(data.conferenceId);
                }
            });
            _bdrConferenceIdsCache.set(lower, { ids, at: Date.now() });
            return ids;
        })();
        _inFlightBdrConferenceIds.set(lower, promise);
        try {
            return await promise;
        } finally {
            _inFlightBdrConferenceIds.delete(lower);
        }
    }

    function generateSlots(windows, slotDurationMinutes, existingSlots) {
        const dur = Math.max(5, parseInt(slotDurationMinutes, 10) || 30);
        const byKey = new Map((existingSlots || []).map(s => [`${s.date}_${s.startTime}`, s]));
        const out = [];
        (windows || []).forEach(w => {
            if (!w.date || !w.startTime || !w.endTime) return;
            let cur = hhmmToMinutes(w.startTime);
            const end = hhmmToMinutes(w.endTime);
            while (cur + dur <= end) {
                const startTime = minutesToHHMM(cur);
                const endTime = minutesToHHMM(cur + dur);
                const key = `${w.date}_${startTime}`;
                const existing = byKey.get(key);
                out.push(existing
                    ? { ...existing, endTime }
                    : {
                        id: 'slot_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
                        date: w.date, startTime, endTime, status: 'open'
                    });
                cur += dur;
            }
        });
        out.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
        return out;
    }

    async function saveAvailability(conferenceId, bdrEmail, bdrName, windows, slotDurationMinutes) {
        const existing = await getAvailabilityDoc(conferenceId, bdrEmail);
        const slots = generateSlots(windows, slotDurationMinutes, existing ? existing.slots : null);
        const { doc, setDoc } = fx();
        const id = availabilityDocId(conferenceId, bdrEmail);
        const data = {
            conferenceId,
            bdrEmail: (bdrEmail || '').toLowerCase().trim(),
            bdrName: bdrName || '',
            slotDurationMinutes: Math.max(5, parseInt(slotDurationMinutes, 10) || 30),
            windows: windows || [],
            slots,
            updatedAt: new Date()
        };
        await setDoc(doc(dbi(), 'conference_availability', id), data);
        _bdrConferenceIdsCache.delete(data.bdrEmail);
        return { id, ...data };
    }

    async function getOpenSlots(conferenceId, bdrEmail) {
        const avail = await getAvailabilityDoc(conferenceId, bdrEmail);
        if (!avail) return [];
        return (avail.slots || [])
            .filter(s => s.status === 'open')
            .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
    }

    /**
     * Sets a slot to 'open' | 'held' | 'booked' and stamps who it's for.
     * 'held'   = mentioned/proposed to a contact but not yet confirmed —
     *            still shows as unavailable to others, but doesn't count as a
     *            real meeting in the report/PDF.
     * 'booked' = fully confirmed meeting.
     * Throws if the slot is already held/booked by a DIFFERENT meeting
     * request (so two people can't be pitched — or booked into — the same
     * slot at once).
     */
    async function setSlotStatus(conferenceId, bdrEmail, slotId, status, info) {
        const avail = await getAvailabilityDoc(conferenceId, bdrEmail);
        if (!avail) throw new Error('No availability windows are set up for this BDR at this conference yet.');
        let target = null;
        const slots = (avail.slots || []).map(s => {
            if (s.id !== slotId) return s;
            if ((s.status === 'booked' || s.status === 'held') && s.meetingRequestId && s.meetingRequestId !== info.meetingRequestId) {
                throw new Error(`That time slot is already ${s.status === 'booked' ? 'booked' : 'on hold'} for someone else — please pick another.`);
            }
            target = { ...s, status, ...info };
            return target;
        });
        if (!target) throw new Error('Selected time slot no longer exists — please refresh and try again.');
        const { doc, updateDoc } = fx();
        await updateDoc(doc(dbi(), 'conference_availability', avail.id), { slots, updatedAt: new Date() });
        // Centralized here (rather than at each UI call site) so EVERY caller —
        // the widget's Save/Confirm buttons, the admin scheduling page, future
        // call sites — reliably pushes a live refresh to any other already-
        // mounted widget card showing this same BDR+conference, instead of
        // relying on each caller to remember to notify.
        _notifyAvailabilityChanged(conferenceId, bdrEmail);
        return target;
    }

    async function bookSlot(conferenceId, bdrEmail, slotId, info) {
        return setSlotStatus(conferenceId, bdrEmail, slotId, 'booked', info);
    }

    async function holdSlot(conferenceId, bdrEmail, slotId, info) {
        return setSlotStatus(conferenceId, bdrEmail, slotId, 'held', info);
    }

    async function releaseSlot(conferenceId, bdrEmail, slotId) {
        if (!slotId) return;
        const avail = await getAvailabilityDoc(conferenceId, bdrEmail);
        if (!avail) return;
        const slots = (avail.slots || []).map(s => s.id === slotId
            ? { ...s, status: 'open', meetingRequestId: null, contactName: null, contactCompany: null }
            : s);
        const { doc, updateDoc } = fx();
        await updateDoc(doc(dbi(), 'conference_availability', avail.id), { slots, updatedAt: new Date() });
        _notifyAvailabilityChanged(conferenceId, bdrEmail);
    }

    // ── Cross-widget live refresh ────────────────────────────────────────
    // company_review_replies.html / index_admin.html mount one widget per
    // contact card, and many cards share the same BDR. Each widget instance
    // only re-fetches its own availability on its own actions, so holding a
    // time on one contact's card used to leave every OTHER already-mounted
    // card for that same BDR silently showing stale "open"/"already taken"
    // data until the whole list happened to re-render. This is a tiny pub/sub
    // keyed by the same conferenceId+bdrEmail doc id: mountWidget() subscribes
    // whenever it settles on a conference, and any widget that changes a
    // slot's status notifies the others so they refresh in place.
    const _widgetSubscriptions = new Map(); // availabilityDocId -> Set<{ containerEl, refresh }>

    function _subscribeWidgetRefresh(conferenceId, bdrEmail, containerEl, refresh) {
        if (!bdrEmail) return null;
        const key = availabilityDocId(conferenceId, bdrEmail);
        if (!_widgetSubscriptions.has(key)) _widgetSubscriptions.set(key, new Set());
        const set = _widgetSubscriptions.get(key);
        // Pages like company_review_replies.html fully re-render (and thus
        // re-mount) every visible card's widget on every refresh/poll, with no
        // explicit "unmount" — prune this key's dead entries on each new
        // subscribe so the Set can't grow unbounded across a long session.
        set.forEach(entry => { if (!entry.containerEl.isConnected) set.delete(entry); });
        const entry = { containerEl, refresh };
        set.add(entry);
        return { key, entry };
    }

    function _unsubscribeWidgetRefresh(sub) {
        if (!sub) return;
        const set = _widgetSubscriptions.get(sub.key);
        if (set) {
            set.delete(sub.entry);
            if (set.size === 0) _widgetSubscriptions.delete(sub.key);
        }
    }

    function _notifyAvailabilityChanged(conferenceId, bdrEmail, skipContainerEl) {
        if (!bdrEmail) return;
        const key = availabilityDocId(conferenceId, bdrEmail);
        const set = _widgetSubscriptions.get(key);
        if (!set) return;
        // Snapshot before iterating — a refresh can synchronously trigger a
        // re-subscribe (delete + add) on the same Set.
        Array.from(set).forEach(entry => {
            if (entry.containerEl === skipContainerEl) return;
            if (!entry.containerEl.isConnected) { set.delete(entry); return; } // stale card from a prior render — prune it
            try { entry.refresh(); } catch (e) { /* best-effort */ }
        });
    }

    // ── Meeting Requests ────────────────────────────────────────────────
    async function getMeetingRequest(conferenceId, ctx) {
        const { doc, getDoc } = fx();
        const key = contactKeyFor(ctx);
        const id = `${conferenceId}__${key}`;
        const snap = await getDoc(doc(dbi(), 'conference_meeting_requests', id));
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async function getMeetingRequestsForConference(conferenceId) {
        const { collection, getDocs, query, where } = fx();
        const snap = await getDocs(query(collection(dbi(), 'conference_meeting_requests'), where('conferenceId', '==', conferenceId)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status !== 'cancelled');
    }

    async function getAllMeetingRequests() {
        const { collection, getDocs } = fx();
        const snap = await getDocs(collection(dbi(), 'conference_meeting_requests'));
        return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status !== 'cancelled');
    }

    /**
     * Create/update a meeting request. Pass slotId to book/hold a specific
     * open slot (add holdOnly: true to soft-hold it — "mentioned to the
     * contact but not confirmed" — instead of fully booking it), or omit
     * slotId (with wantsToMeet true) to mark "wants to meet, no time yet".
     */
    async function saveMeetingRequest(ctx) {
        const { doc, getDoc, setDoc } = fx();
        const key = contactKeyFor(ctx);
        const reqId = `${ctx.conferenceId}__${key}`;
        const reqRef = doc(dbi(), 'conference_meeting_requests', reqId);
        const existingSnap = await getDoc(reqRef);
        const existing = existingSnap.exists ? existingSnap.data() : null;

        const bdrEmailLower = (ctx.bdrEmail || existing?.bdrEmail || '').toLowerCase().trim();
        const wantsSlotId = ctx.slotId || null;
        const wantsHold = !!ctx.holdOnly;

        // Release the previously-held/booked slot if it's being changed or cleared.
        if (existing && existing.slotId && existing.slotId !== wantsSlotId) {
            await releaseSlot(ctx.conferenceId, bdrEmailLower, existing.slotId);
        }

        let slotInfo = null;
        if (wantsSlotId) {
            slotInfo = await setSlotStatus(ctx.conferenceId, bdrEmailLower, wantsSlotId, wantsHold ? 'held' : 'booked', {
                meetingRequestId: reqId,
                contactName: ctx.contactName || '',
                contactCompany: ctx.contactCompany || ''
            });
        }

        const data = {
            conferenceId: ctx.conferenceId,
            conferenceName: ctx.conferenceName || existing?.conferenceName || '',
            bdrEmail: bdrEmailLower,
            bdrName: ctx.bdrName || existing?.bdrName || '',
            contactLiUrl: ctx.contactLiUrl || existing?.contactLiUrl || '',
            contactName: ctx.contactName || existing?.contactName || '',
            contactFirstName: ctx.contactFirstName || existing?.contactFirstName || '',
            contactLastName: ctx.contactLastName || existing?.contactLastName || '',
            contactCompany: ctx.contactCompany || existing?.contactCompany || '',
            contactTitle: ctx.contactTitle || existing?.contactTitle || '',
            wantsToMeet: ctx.wantsToMeet !== false,
            hasTimeSlot: !!wantsSlotId,
            slotStatus: wantsSlotId ? (wantsHold ? 'held' : 'confirmed') : null,
            slotId: wantsSlotId,
            date: slotInfo ? slotInfo.date : null,
            startTime: slotInfo ? slotInfo.startTime : null,
            endTime: slotInfo ? slotInfo.endTime : null,
            email: ctx.email !== undefined ? ctx.email : (existing?.email || ''),
            phone: ctx.phone !== undefined ? ctx.phone : (existing?.phone || ''),
            emailSource: ctx.emailSource !== undefined ? ctx.emailSource : (existing?.emailSource || ''),
            phoneSource: ctx.phoneSource !== undefined ? ctx.phoneSource : (existing?.phoneSource || ''),
            notes: ctx.notes !== undefined ? ctx.notes : (existing?.notes || ''),
            status: 'active',
            source: ctx.source || existing?.source || 'manual',
            createdAt: existing?.createdAt || new Date(),
            updatedAt: new Date()
        };
        await setDoc(reqRef, data);
        return { id: reqId, ...data };
    }

    /**
     * Flips an existing meeting request's slot between 'held' (soft hold —
     * mentioned but not confirmed) and 'confirmed' (fully booked), without
     * needing to re-pick the slot. Used by the "Confirm" action in the
     * report table and the widget's quick-confirm button.
     */
    async function setMeetingRequestHoldState(requestId, holdOnly) {
        const { doc, getDoc, updateDoc } = fx();
        const reqRef = doc(dbi(), 'conference_meeting_requests', requestId);
        const snap = await getDoc(reqRef);
        if (!snap.exists) throw new Error('Meeting request not found.');
        const existing = snap.data();
        if (!existing.slotId) throw new Error('This request has no time slot to confirm/hold.');
        await setSlotStatus(existing.conferenceId, existing.bdrEmail, existing.slotId, holdOnly ? 'held' : 'booked', {
            meetingRequestId: requestId,
            contactName: existing.contactName || '',
            contactCompany: existing.contactCompany || ''
        });
        const patch = { slotStatus: holdOnly ? 'held' : 'confirmed', updatedAt: new Date() };
        await updateDoc(reqRef, patch);
        return { ...existing, ...patch, id: requestId };
    }

    async function cancelMeetingRequest(conferenceId, ctx) {
        const { doc, getDoc, updateDoc } = fx();
        const key = contactKeyFor(ctx);
        const reqId = `${conferenceId}__${key}`;
        const reqRef = doc(dbi(), 'conference_meeting_requests', reqId);
        const snap = await getDoc(reqRef);
        if (!snap.exists) return;
        const existing = snap.data();
        if (existing.slotId) {
            await releaseSlot(conferenceId, existing.bdrEmail, existing.slotId);
        }
        await updateDoc(reqRef, { status: 'cancelled', wantsToMeet: false, slotId: null, hasTimeSlot: false, slotStatus: null, updatedAt: new Date() });
    }

    async function updateMeetingRequestFields(requestId, patch) {
        const { doc, updateDoc } = fx();
        await updateDoc(doc(dbi(), 'conference_meeting_requests', requestId), { ...patch, updatedAt: new Date() });
    }

    // ── Best-effort conversation lookup (for AI/regex scanning) ─────────
    // Finds the LinkedIn conversation thread (heyreach_inbox) for a given
    // BDR + contact LinkedIn URL and flattens it to plain text. Best-effort:
    // returns '' if nothing matches (e.g. no reply has come in yet).
    //
    // A HeyReach doc can be tagged with the owning BDR under any of FOUR
    // different fields depending on how it was ingested — 'accountEmail',
    // 'bdrEmail', 'linkedInAccountEmail', or 'uploadedByEmail' (their LinkedIn
    // login email frequently differs from their work email). Every other page
    // that reads this collection (company_review_replies.html,
    // conversation_lookup.html) queries all four; this used to only check two
    // ('bdrEmail'/'accountEmail'), so conversations keyed by the other two
    // fields were invisible here even though they showed up elsewhere.
    const HEYREACH_BDR_EMAIL_FIELDS = ['bdrEmail', 'accountEmail', 'linkedInAccountEmail', 'uploadedByEmail'];

    // Firestore timestamps arrive in several shapes depending on the transport
    // (native SDK object, REST-wrapper {seconds}/{_seconds}, ISO string, ms).
    function _tsToDate(ts) {
        if (!ts) return null;
        if (ts instanceof Date) return ts;
        if (typeof ts.toDate === 'function') { try { return ts.toDate(); } catch (e) { return null; } }
        if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
        if (ts._seconds !== undefined) return new Date(ts._seconds * 1000);
        if (typeof ts === 'number' || typeof ts === 'string') {
            const d = new Date(ts);
            return isNaN(d) ? null : d;
        }
        return null;
    }

    // The actual message array is frequently nested under rawData.messages
    // rather than top-level `messages` — reading only `data.messages` silently
    // returns an empty conversation for those docs.
    function _extractTranscript(data) {
        const raw = (data.rawData && Array.isArray(data.rawData.messages) && data.rawData.messages.length > 0)
            ? data.rawData.messages
            : (Array.isArray(data.messages) ? data.messages : []);
        const msgs = raw.map(m => ({
            sender: (m.sender === 'ME' || m.sender === 'account') ? 'bdr' : 'contact',
            text: String(m.body || m.text || m.message || '').trim(),
            at: _tsToDate(m.createdAt || m.timestamp)
        })).filter(m => m.text);
        // Only reorder when every message is dated — a partial sort would
        // scramble an already-correct stored order.
        if (msgs.length > 1 && msgs.every(m => m.at)) msgs.sort((a, b) => a.at - b.at);
        return msgs;
    }

    // ── Locating the conversation doc ────────────────────────────────────
    // Ported directly from company_review_replies.html's proven
    // findConversationForLead() helper (same file also combines heyreach_inbox
    // with the linkedinMessages CSV-import collection as an equal second
    // source — see loadConversations()/loadLinkedInMessages() there), rather
    // than the previous from-scratch approach here, which normalized/generated
    // URL variants and — when that missed — fell back to loading the ENTIRE
    // heyreach_inbox collection (36,000+ heavy docs) client-side. That full-
    // collection fallback was both slow enough to look like the scan was
    // "doing nothing" and risked 502-ing the Railway backend, and in practice
    // still found nothing: these fields are written by
    // RailwayCLemail/services/heyreach_inbox_service.js with EXACT-match
    // semantics in mind (Firestore `==` is case-sensitive), so a lenient
    // slug/normalized match across the whole collection wasn't the missing
    // piece — querying the right FIELD NAMES and the right COLLECTIONS was.
    //
    // Tiers, in order (first match wins), mirroring findConversationForLead
    // plus the linkedinMessages source:
    //   1) heyreach_inbox, exact match on leadProfileUrl / linkedin_url /
    //      leadLinkedInUrl / lead_linkedin_url.
    //   2) linkedinMessages (CSV-imported conversations), exact match on
    //      linkedInUrl / profileUrl / linkedin_url.
    //   3) heyreach_inbox, exact match on leadFirstName+leadLastName, then
    //      legacy combined lead_name / leadName fields.
    //   4) Last resort: this BDR's inbox fetched via every known email alias
    //      (bdr_leaders.primaryEmail/.linkedInEmail +
    //      linkedin_email_associations), matched locally by URL slug — covers
    //      stored casing no exact-match query can reach. Cached per BDR so a
    //      whole scan only pays for this once per BDR, not once per contact.

    const INBOX_URL_FIELDS = ['leadProfileUrl', 'linkedin_url', 'leadLinkedInUrl', 'lead_linkedin_url'];
    const LINKEDIN_MESSAGES_URL_FIELDS = ['linkedInUrl', 'profileUrl', 'linkedin_url'];

    // ── heyreach_activity (HeyReach webhook event stream) ────────────────
    // Confirmed against production data: some BDRs/campaigns have their
    // ENTIRE two-way conversation recorded only as a stream of webhook events
    // in heyreach_activity — heyreach_inbox has zero docs for them at all
    // (their inbox sync hadn't caught up / doesn't cover that LinkedIn seat
    // yet). Each MESSAGE_REPLY_RECEIVED / EVERY_MESSAGE_REPLY_RECEIVED event
    // embeds a growing rawData.recent_messages array, so merging every
    // matching doc's messages and de-duplicating recovers the full thread —
    // same source company_review_replies.html's loadHeyreachActivity() reads.
    function _extractWebhookTranscript(docs) {
        const seen = new Set();
        const msgs = [];
        for (const d of docs) {
            const recent = (d.rawData && Array.isArray(d.rawData.recent_messages)) ? d.rawData.recent_messages : [];
            for (const m of recent) {
                const text = String(m.message || '').trim();
                if (!text) continue;
                const at = _tsToDate(m.creation_time);
                const key = `${text}|${at ? at.getTime() : ''}`;
                if (seen.has(key)) continue;
                seen.add(key);
                msgs.push({ sender: m.is_reply ? 'contact' : 'bdr', text, at });
            }
        }
        if (msgs.length > 1 && msgs.every(m => m.at)) msgs.sort((a, b) => a.at - b.at);
        return msgs;
    }

    async function _findByActivityWebhook(contactLiUrl) {
        if (!contactLiUrl) return null;
        const { collection, getDocs, query, where } = fx();
        try {
            const snap = await getDocs(query(collection(dbi(), 'heyreach_activity'), where('leadProfileUrl', '==', contactLiUrl)));
            const docs = (snap.docs || []).map(d => d.data());
            if (docs.length === 0) return null;
            const transcript = _extractWebhookTranscript(docs);
            return transcript.length > 0 ? transcript : null;
        } catch (e) {
            return null;
        }
    }

    async function _queryOneByField(collectionName, field, value) {
        if (!value) return null;
        const { collection, getDocs, query, where, limit } = fx();
        try {
            const snap = await getDocs(query(collection(dbi(), collectionName), where(field, '==', value), limit(1)));
            return snap.docs && snap.docs.length > 0 ? snap.docs[0].data() : null;
        } catch (e) {
            return null; // field may not exist / not indexed on this collection — try the next one
        }
    }

    async function _findByUrlExact(collectionName, fields, url) {
        if (!url) return null;
        for (const field of fields) {
            const data = await _queryOneByField(collectionName, field, url);
            if (data) return data;
        }
        return null;
    }

    async function _findByNameExact(firstName, lastName) {
        if (firstName && lastName) {
            const { collection, getDocs, query, where, limit } = fx();
            try {
                const snap = await getDocs(query(
                    collection(dbi(), 'heyreach_inbox'),
                    where('leadFirstName', '==', firstName),
                    where('leadLastName', '==', lastName),
                    limit(1)
                ));
                if (snap.docs && snap.docs.length > 0) return snap.docs[0].data();
            } catch (e) { /* fall through to legacy combined-name fields */ }
        }
        const fullName = `${firstName || ''} ${lastName || ''}`.trim();
        if (fullName && fullName !== 'Unknown') {
            for (const field of ['lead_name', 'leadName']) {
                const data = await _queryOneByField('heyreach_inbox', field, fullName);
                if (data) return data;
            }
        }
        return null;
    }

    function _liSlug(url) {
        const m = String(url || '').toLowerCase().match(/\/in\/([^\/?#]+)/);
        try { return m ? decodeURIComponent(m[1]).replace(/\/+$/, '') : ''; } catch (e) { return m ? m[1] : ''; }
    }

    // Same lead? Exact normalized URL match, else /in/<slug> match (covers
    // country subdomains, tracking params, trailing-slash/case differences).
    function _sameLead(urlA, urlB) {
        const na = normalizeLiUrl(urlA), nb = normalizeLiUrl(urlB);
        if (na && na === nb) return true;
        const sa = _liSlug(urlA), sb = _liSlug(urlB);
        return !!(sa && sa === sb);
    }

    // bdr_leaders + linkedin_email_associations, loaded once per page.
    let _bdrAliasDataPromise = null;
    function _loadBdrAliasData() {
        if (!_bdrAliasDataPromise) {
            _bdrAliasDataPromise = (async () => {
                const { collection, getDocs } = fx();
                const [bdrSnap, assocSnap] = await Promise.all([
                    getDocs(collection(dbi(), 'bdr_leaders')).catch(() => ({ docs: [] })),
                    getDocs(collection(dbi(), 'linkedin_email_associations')).catch(() => ({ docs: [] }))
                ]);
                const bdrs = (bdrSnap.docs || []).map(d => d.data());
                const assoc = new Map(); // authEmail (lower) -> linkedInEmail (as stored)
                (assocSnap.docs || []).forEach(d => {
                    const a = d.data();
                    if (a.authEmail && a.linkedInEmail) {
                        assoc.set(String(a.authEmail).toLowerCase().trim(), String(a.linkedInEmail).trim());
                    }
                });
                return { bdrs, assoc };
            })();
        }
        return _bdrAliasDataPromise;
    }

    // Every email address that might tag this BDR's heyreach_inbox docs.
    // Includes original casing AND lowercase of each alias — the sync stores
    // the LinkedIn email exactly as HeyReach reports it.
    async function _bdrAliasEmails(bdrEmail) {
        const lower = String(bdrEmail || '').toLowerCase().trim();
        const aliases = new Set();
        if (!lower) return aliases;
        aliases.add(lower);
        try {
            const { bdrs, assoc } = await _loadBdrAliasData();
            const bdr = bdrs.find(b =>
                String(b.primaryEmail || '').toLowerCase().trim() === lower ||
                String(b.linkedInEmail || '').toLowerCase().trim() === lower);
            [bdr && bdr.primaryEmail, bdr && bdr.linkedInEmail].forEach(e => {
                if (e) {
                    aliases.add(String(e).trim());
                    aliases.add(String(e).toLowerCase().trim());
                }
            });
            [...aliases].forEach(a => {
                const li = assoc.get(a.toLowerCase());
                if (li) {
                    aliases.add(li);
                    aliases.add(li.toLowerCase());
                }
            });
        } catch (e) { /* best-effort — still query with the input email */ }
        return aliases;
    }

    // All heyreach_inbox docs belonging to one BDR: every alias email × every
    // field a doc may be tagged under, deduped. Cached per page load since a
    // scan/report loops many contacts sharing the same few BDRs, so this tier
    // is paid for once per BDR at most, not once per contact.
    const _inboxDocsByBdrCache = new Map();
    function _fetchInboxDocsForBdr(bdrEmail) {
        const key = String(bdrEmail || '').toLowerCase().trim();
        if (!key) return Promise.resolve([]);
        if (!_inboxDocsByBdrCache.has(key)) {
            const promise = (async () => {
                const emails = [...await _bdrAliasEmails(key)];
                const { collection, getDocs, query, where } = fx();
                const inboxRef = collection(dbi(), 'heyreach_inbox');
                // One alias at a time (its 4 field queries in parallel), with
                // pageSize 1000. The sync tags bdrEmail/accountEmail/
                // linkedInAccountEmail with the SAME value, so a matching alias
                // returns ~3 copies of a busy BDR's heavy inbox — firing every
                // alias × field combination at once has 502'd Railway.
                const seen = new Set();
                const out = [];
                for (const email of emails) {
                    const snaps = await Promise.all(HEYREACH_BDR_EMAIL_FIELDS.map(field =>
                        getDocs(query(inboxRef, where(field, '==', email)), { pageSize: 1000 }).catch(() => ({ docs: [] }))
                    ));
                    for (const snap of snaps) {
                        for (const d of (snap.docs || [])) {
                            if (seen.has(d.id)) continue;
                            seen.add(d.id);
                            out.push(d.data());
                        }
                    }
                }
                console.log(`🔎 [ConferenceScheduling] Inbox fetch for BDR ${key}: ${out.length} doc(s) across ${emails.length} alias email(s) [${emails.join(', ')}]`);
                return out;
            })();
            promise.catch(() => _inboxDocsByBdrCache.delete(key));
            _inboxDocsByBdrCache.set(key, promise);
        }
        return _inboxDocsByBdrCache.get(key);
    }

    // Core lookup: structured transcript ([{ sender, text, at }]) or null.
    // Tries every tier in order and keeps going if an earlier tier matches a
    // doc but that doc turns out to carry no actual message text (e.g. a
    // heyreach_inbox stub with only metadata) — a "match" isn't good enough,
    // only a non-empty transcript stops the search.
    async function _findTranscriptForContact(bdrEmail, contactLiUrl, contactFirstName, contactLastName) {
        try {
            let transcript = null, via = null;

            if (!transcript) {
                const data =
                    (await _findByUrlExact('heyreach_inbox', INBOX_URL_FIELDS, contactLiUrl)) ||
                    (await _findByUrlExact('linkedinMessages', LINKEDIN_MESSAGES_URL_FIELDS, contactLiUrl)) ||
                    (await _findByNameExact(contactFirstName, contactLastName));
                if (data) {
                    const t = _extractTranscript(data);
                    if (t.length > 0) { transcript = t; via = 'exact match'; }
                }
            }

            // Some BDRs/campaigns never get synced into heyreach_inbox at
            // all — their whole thread lives in the heyreach_activity
            // webhook stream instead. See _findByActivityWebhook above.
            if (!transcript) {
                const t = await _findByActivityWebhook(contactLiUrl);
                if (t) { transcript = t; via = 'webhook activity stream'; }
            }

            // Last resort: this BDR's alias-expanded inbox, matched locally
            // by URL slug — covers stored casing no exact-match query reaches.
            if (!transcript && bdrEmail && contactLiUrl) {
                const all = await _fetchInboxDocsForBdr(bdrEmail);
                const data = all.find(d => _sameLead(d.leadProfileUrl, contactLiUrl)) || null;
                if (data) {
                    const t = _extractTranscript(data);
                    if (t.length > 0) { transcript = t; via = 'BDR-alias local match'; }
                }
            }

            if (!transcript) {
                console.log(`🔎 [ConferenceScheduling] No conversation found for ${contactLiUrl || '(no URL)'} / ${contactFirstName || ''} ${contactLastName || ''} (bdr: ${bdrEmail || '—'})`);
                return null;
            }
            console.log(`🔎 [ConferenceScheduling] Conversation found for ${contactLiUrl || `${contactFirstName || ''} ${contactLastName || ''}`} via ${via}: ${transcript.length} message(s)`);
            return transcript;
        } catch (e) {
            console.warn('⚠️ [ConferenceScheduling] Conversation lookup failed:', e.message);
            return null;
        }
    }

    async function findConversationTextForContact(bdrEmail, contactLiUrl, contactFirstName, contactLastName) {
        const transcript = await _findTranscriptForContact(bdrEmail, contactLiUrl, contactFirstName, contactLastName);
        return transcript ? transcript.map(m => m.text).join('\n') : '';
    }

    /** Stable lookup key used by findConversationsForContacts' result Map. */
    function conversationKeyFor(bdrEmail, contactLiUrl) {
        return `${String(bdrEmail || '').toLowerCase().trim()}||${normalizeLiUrl(contactLiUrl || '')}`;
    }

    /**
     * Batch transcript lookup for the PDF report appendix. Takes
     * [{ bdrEmail, contactLiUrl, contactFirstName, contactLastName }] and
     * returns a Map keyed by conversationKeyFor(bdrEmail, contactLiUrl) whose
     * values are structured transcripts:
     * [{ sender: 'bdr'|'contact', text, at: Date|null }].
     *
     * Each contact resolves via the same tiered lookup as the scan (see
     * _findTranscriptForContact); the per-BDR alias fallback fetch is cached
     * so it runs at most once per BDR. Runs a few contacts at a time to keep
     * the Railway backend happy.
     */
    async function findConversationsForContacts(pairs) {
        const result = new Map();
        const valid = (pairs || []).filter(p => p && (p.contactLiUrl || (p.contactFirstName && p.contactLastName)));
        const CHUNK = 5;
        for (let i = 0; i < valid.length; i += CHUNK) {
            await Promise.all(valid.slice(i, i + CHUNK).map(async p => {
                const key = conversationKeyFor(p.bdrEmail, p.contactLiUrl);
                if (result.has(key)) return;
                const transcript = await _findTranscriptForContact(p.bdrEmail, p.contactLiUrl, p.contactFirstName, p.contactLastName);
                if (transcript) result.set(key, transcript);
            }));
        }
        return result;
    }

    // ── AI / regex scanning for missing email + phone ──────────────────
    const EMAIL_RE = /[a-zA-Z0-9.\-_+]+@[a-zA-Z0-9.\-_]+\.[a-zA-Z]{2,}/;
    const PHONE_RE = /(\+?\d{1,3}[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/;

    function regexScan(text) {
        const t = String(text || '');
        const email = (t.match(EMAIL_RE) || [])[0] || '';
        const phone = (t.match(PHONE_RE) || [])[0] || '';
        return { email, phone };
    }

    async function aiScan(text) {
        try {
            if (!window.auth || !window.auth.currentUser) return { email: '', phone: '' };
            const token = await window.auth.currentUser.getIdToken();
            const resp = await fetch(`${RAILWAY_BASE}/api/conference/scan-contact-info`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ text: String(text || '').slice(0, 8000) })
            });
            const data = await resp.json();
            if (data && data.success) return { email: data.email || '', phone: data.phone || '' };
        } catch (e) {
            console.warn('⚠️ [ConferenceScheduling] AI scan failed:', e.message);
        }
        return { email: '', phone: '' };
    }

    /**
     * Scan a block of text (e.g. LinkedIn conversation transcript) for an email
     * and/or phone number. Tries fast deterministic regex first; only falls
     * back to the AI endpoint for whichever field regex couldn't find.
     */
    async function scanContactInfo(text) {
        const r = regexScan(text);
        if (r.email && r.phone) {
            return { email: r.email, phone: r.phone, emailSource: 'regex', phoneSource: 'regex' };
        }
        const ai = await aiScan(text);
        return {
            email: r.email || ai.email || '',
            phone: r.phone || ai.phone || '',
            emailSource: r.email ? 'regex' : (ai.email ? 'ai' : ''),
            phoneSource: r.phone ? 'regex' : (ai.phone ? 'ai' : '')
        };
    }

    // ── Embeddable widget for review pages ──────────────────────────────
    // Renders a compact "Conference Meeting" control block inside `containerEl`
    // for a single contact/BDR pair, and wires up all its own event handlers.
    async function mountWidget(containerEl, ctx) {
        if (!containerEl) return;
        // A page-level wrapper (e.g. company_review_replies.html's
        // .conference-scheduling-section, which also carries its own header)
        // gets hidden/shown alongside the widget itself — see below.
        const sectionEl = containerEl.closest('.conference-scheduling-section');
        if (sectionEl) sectionEl.style.display = '';
        containerEl.style.display = '';
        containerEl.innerHTML = `<div class="cs-widget-loading"><i class="fas fa-spinner fa-spin"></i> Loading conference options…</div>`;

        let conferences = [];
        let bdrConferenceIds = null;
        try {
            [conferences, bdrConferenceIds] = await Promise.all([
                loadConferences(),
                ctx.bdrEmail ? getBdrConferenceIdsWithAvailability(ctx.bdrEmail) : Promise.resolve(null)
            ]);
        } catch (e) {
            containerEl.innerHTML = `<div class="cs-widget-error">Could not load conferences: ${escapeHtml(e.message)}</div>`;
            return;
        }

        // Only offer conferences this BDR actually has availability set up for —
        // one they aren't attending would just show "no open slots" and add
        // noise to the picker. If a contact already has a request tied to a
        // conference (even one that's since sold out / had its slot removed),
        // that conference's availability doc still exists with that slot in it,
        // so it isn't filtered out here.
        if (bdrConferenceIds) {
            conferences = conferences.filter(c => bdrConferenceIds.has(c.id));
        }

        if (conferences.length === 0) {
            // Nothing this BDR can do here yet — hide the whole thing (including
            // the host page's "Conference Meeting Scheduling" header, if any)
            // rather than showing an always-empty widget.
            if (sectionEl) sectionEl.style.display = 'none';
            else containerEl.style.display = 'none';
            containerEl.innerHTML = '';
            return;
        }

        const state = {
            conferenceId: conferences[0].id,
            request: null,
            openSlots: []
        };

        containerEl.innerHTML = `
            <div class="cs-widget">
                <div class="cs-widget-row">
                    <span class="cs-widget-label"><i class="fas fa-calendar-star"></i> Conference Meeting</span>
                    <select class="cs-conf-select">
                        ${conferences.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}${c.startDate ? ` — ${escapeHtml(fmtDateShort(c.startDate))}` : ''}</option>`).join('')}
                    </select>
                    <span class="cs-status"></span>
                </div>
                <div class="cs-widget-row cs-widget-actions">
                    <select class="cs-slot-select"><option value="">Loading time slots…</option></select>
                    <label class="cs-hold-label" title="Mention this time to the contact without fully reserving it"><input type="checkbox" class="cs-hold-cb"> Hold only — not confirmed</label>
                    <label class="cs-no-time-label"><input type="checkbox" class="cs-no-time-cb"> Wants to meet — no time yet</label>
                    <button type="button" class="cs-save-btn"><i class="fas fa-check"></i> Save</button>
                    <button type="button" class="cs-clear-btn" title="Remove this meeting request"><i class="fas fa-times"></i></button>
                </div>
                <div class="cs-widget-row cs-reserved-row" style="display:none;">
                    <span class="cs-reserved-label"><i class="fas fa-lock"></i> Already taken (this BDR):</span>
                    <span class="cs-reserved-chips"></span>
                </div>
            </div>`;

        const confSelect = containerEl.querySelector('.cs-conf-select');
        const slotSelect = containerEl.querySelector('.cs-slot-select');
        const holdCb = containerEl.querySelector('.cs-hold-cb');
        const noTimeCb = containerEl.querySelector('.cs-no-time-cb');
        const statusEl = containerEl.querySelector('.cs-status');
        const saveBtn = containerEl.querySelector('.cs-save-btn');
        const clearBtn = containerEl.querySelector('.cs-clear-btn');
        const reservedRow = containerEl.querySelector('.cs-reserved-row');
        const reservedChipsEl = containerEl.querySelector('.cs-reserved-chips');

        // Read-only list of this BDR's held/booked times for OTHER contacts at
        // the selected conference — so a reviewer can see at a glance what's
        // already spoken for instead of only inferring it from a shortened
        // dropdown (and can't accidentally re-propose a time that's taken).
        function renderReservedSlots(reservedSlots) {
            if (!reservedSlots.length) {
                reservedRow.style.display = 'none';
                reservedChipsEl.innerHTML = '';
                return;
            }
            reservedRow.style.display = 'flex';
            reservedChipsEl.innerHTML = reservedSlots.map(s => {
                const isHeld = s.status === 'held';
                const who = escapeHtml(s.contactName || (isHeld ? 'Held' : 'Booked'));
                const when = `${escapeHtml(fmtDateShort(s.date))} ${escapeHtml(fmtTime12(s.startTime))}`;
                return `<span class="cs-reserved-chip ${isHeld ? 'cs-reserved-chip-held' : 'cs-reserved-chip-booked'}" title="${isHeld ? 'Tentatively held' : 'Confirmed'}">${when} — ${who}</span>`;
            }).join('');
        }

        function setStatus() {
            const req = state.request;
            if (!req || req.status === 'cancelled' || !req.wantsToMeet) {
                statusEl.innerHTML = '';
                statusEl.className = 'cs-status';
                return;
            }
            if (req.hasTimeSlot && req.date) {
                const isHeld = req.slotStatus === 'held';
                const whenStr = `${escapeHtml(fmtDateShort(req.date))} · ${escapeHtml(fmtTime12(req.startTime))}–${escapeHtml(fmtTime12(req.endTime))}`;
                if (isHeld) {
                    statusEl.innerHTML = `<i class="fas fa-clock"></i> Held: ${whenStr} <button type="button" class="cs-confirm-inline-btn" title="Confirm this time"><i class="fas fa-check"></i> Confirm</button>`;
                    statusEl.className = 'cs-status cs-status-held';
                    const confirmBtn = statusEl.querySelector('.cs-confirm-inline-btn');
                    if (confirmBtn) confirmBtn.addEventListener('click', async () => {
                        confirmBtn.disabled = true;
                        try {
                            state.request = await setMeetingRequestHoldState(req.id, false);
                            setStatus();
                            await refreshForConference();
                        } catch (e) {
                            alert('Could not confirm: ' + e.message);
                        }
                    });
                } else {
                    statusEl.innerHTML = `<i class="fas fa-calendar-check"></i> Confirmed: ${whenStr}`;
                    statusEl.className = 'cs-status cs-status-booked';
                }
            } else {
                statusEl.innerHTML = `<i class="fas fa-handshake"></i> Wants to meet — time TBD`;
                statusEl.className = 'cs-status cs-status-pending';
            }
        }

        let currentSub = null; // this widget's active cross-widget refresh subscription (see below)

        async function refreshForConference() {
            state.conferenceId = confSelect.value;
            slotSelect.innerHTML = `<option value="">Loading time slots…</option>`;
            saveBtn.disabled = true;

            const [req, avail] = await Promise.all([
                getMeetingRequest(state.conferenceId, ctx).catch(() => null),
                ctx.bdrEmail ? getAvailabilityDoc(state.conferenceId, ctx.bdrEmail).catch(() => null) : Promise.resolve(null)
            ]);
            state.request = req;
            const allSlots = (avail && avail.slots) || [];
            const openSlots = allSlots
                .filter(s => s.status === 'open')
                .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
            state.openSlots = openSlots;

            // Held/booked slots belonging to a DIFFERENT meeting request — shown
            // read-only below the picker (see renderReservedSlots above).
            const reservedSlots = allSlots
                .filter(s => (s.status === 'held' || s.status === 'booked') && s.meetingRequestId !== (req && req.id))
                .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
            renderReservedSlots(reservedSlots);

            // If this contact already has a held/booked slot, make sure it appears
            // in the dropdown (openSlots only contains 'open' ones).
            let slotsForDropdown = openSlots.slice();
            if (req && req.hasTimeSlot && req.slotId && !slotsForDropdown.some(s => s.id === req.slotId)) {
                slotsForDropdown.unshift({ id: req.slotId, date: req.date, startTime: req.startTime, endTime: req.endTime, status: req.slotStatus === 'held' ? 'held' : 'booked' });
            }
            slotsForDropdown.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

            slotSelect.innerHTML = `<option value="">— Select a time slot —</option>` +
                slotsForDropdown.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(fmtDateShort(s.date))} · ${escapeHtml(fmtTime12(s.startTime))}–${escapeHtml(fmtTime12(s.endTime))}</option>`).join('');

            if (slotsForDropdown.length === 0) {
                slotSelect.innerHTML = `<option value="">No open slots for this BDR yet</option>`;
            }

            const hasSlot = !!(req && req.hasTimeSlot && req.slotId);
            slotSelect.value = hasSlot ? req.slotId : '';
            noTimeCb.checked = !!(req && req.wantsToMeet && !req.hasTimeSlot);
            holdCb.checked = !!(req && req.hasTimeSlot && req.slotStatus === 'held');
            slotSelect.disabled = noTimeCb.checked;
            holdCb.disabled = noTimeCb.checked;
            saveBtn.disabled = false;

            setStatus();

            // Keep this widget subscribed to live updates for whichever
            // conference it's currently showing, so if a DIFFERENT contact's
            // card holds/books/releases a slot for this same BDR+conference,
            // this card refreshes in place instead of showing stale data
            // until the whole list happens to re-render.
            if (currentSub === null || currentSub.key !== availabilityDocId(state.conferenceId, ctx.bdrEmail)) {
                _unsubscribeWidgetRefresh(currentSub);
                currentSub = _subscribeWidgetRefresh(state.conferenceId, ctx.bdrEmail, containerEl, () => refreshForConference().catch(() => {}));
            }
        }

        confSelect.addEventListener('change', () => refreshForConference().catch(e => {
            statusEl.innerHTML = `<span class="cs-status-error">${escapeHtml(e.message)}</span>`;
        }));

        noTimeCb.addEventListener('change', () => {
            slotSelect.disabled = noTimeCb.checked;
            holdCb.disabled = noTimeCb.checked;
            if (noTimeCb.checked) { slotSelect.value = ''; holdCb.checked = false; }
        });

        saveBtn.addEventListener('click', async () => {
            if (!ctx.bdrEmail) {
                alert('No BDR email is available for this contact — cannot save a meeting request.');
                return;
            }
            const wantsNoTime = noTimeCb.checked;
            const slotId = wantsNoTime ? null : (slotSelect.value || null);
            const holdOnly = !wantsNoTime && holdCb.checked;
            if (!wantsNoTime && !slotId) {
                alert('Pick a time slot, or check "Wants to meet — no time yet".');
                return;
            }
            const conf = conferences.find(c => c.id === state.conferenceId);
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            try {
                const saved = await saveMeetingRequest({
                    conferenceId: state.conferenceId,
                    conferenceName: conf ? conf.name : '',
                    bdrEmail: ctx.bdrEmail,
                    bdrName: ctx.bdrName || '',
                    contactLiUrl: ctx.contactLiUrl || '',
                    contactName: ctx.contactName || '',
                    contactFirstName: ctx.contactFirstName || '',
                    contactLastName: ctx.contactLastName || '',
                    contactCompany: ctx.contactCompany || '',
                    contactTitle: ctx.contactTitle || '',
                    wantsToMeet: true,
                    slotId,
                    holdOnly,
                    source: ctx.source || 'manual'
                });
                state.request = saved;
                setStatus();
                // saveMeetingRequest() already notifies any other mounted card
                // for this same BDR+conference (see setSlotStatus/releaseSlot),
                // so it won't keep showing this slot as open once we refresh.
                await refreshForConference();
            } catch (e) {
                alert('Could not save meeting request: ' + e.message);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-check"></i> Save';
            }
        });

        clearBtn.addEventListener('click', async () => {
            if (!state.request || !state.request.wantsToMeet) return;
            if (!confirm('Remove this conference meeting request?')) return;
            clearBtn.disabled = true;
            try {
                await cancelMeetingRequest(state.conferenceId, ctx);
                noTimeCb.checked = false;
                slotSelect.value = '';
                slotSelect.disabled = false;
                await refreshForConference();
            } catch (e) {
                alert('Could not remove meeting request: ' + e.message);
            } finally {
                clearBtn.disabled = false;
            }
        });

        await refreshForConference();

        // Belt-and-suspenders: the pub/sub notify above covers same-page,
        // same-BDR cards changing each other's slots instantly, but it can't
        // reach a widget on a *different* tab/page (e.g. the admin scheduling
        // page holding a slot while this review page is open elsewhere), and
        // it depends on the notifying widget's bdrEmail resolving to the exact
        // same value as this one's. Poll this widget's own availability
        // periodically as a fallback so a slot someone else holds/books never
        // stays stuck showing as open here for more than ~20s. Stops itself
        // once this card's DOM is gone (re-rendered away or removed).
        const pollTimer = setInterval(() => {
            if (!containerEl.isConnected) { clearInterval(pollTimer); return; }
            refreshForConference().catch(() => {});
        }, 20000);
    }

    // Inject shared minimal CSS once per page (kept intentionally small/scoped —
    // host pages can override any of these classes).
    function ensureStyles() {
        if (document.getElementById('cs-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'cs-widget-styles';
        style.textContent = `
            .cs-widget { border: 1.5px solid #e9d9b8; background: #fdfaf3; border-radius: 10px; padding: 0.6rem 0.75rem; margin: 0.6rem 0; }
            .cs-widget-loading, .cs-widget-error, .cs-widget-empty { font-size: 0.82rem; color: #6b7280; }
            .cs-widget-error { color: #dc2626; }
            .cs-widget-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
            .cs-widget-row:last-child { margin-bottom: 0; }
            .cs-widget-label { font-weight: 700; font-size: 0.8rem; color: #92400e; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
            .cs-conf-select, .cs-slot-select { padding: 0.3rem 0.5rem; border: 1.5px solid #e5e7eb; border-radius: 6px; font-size: 0.78rem; font-family: inherit; max-width: 220px; }
            .cs-no-time-label, .cs-hold-label { display: inline-flex; align-items: center; gap: 5px; font-size: 0.76rem; color: #4b5563; cursor: pointer; white-space: nowrap; }
            .cs-hold-label { color: #92400e; }
            .cs-hold-label input:disabled, .cs-no-time-label input:disabled { cursor: not-allowed; }
            .cs-save-btn, .cs-clear-btn { border: none; border-radius: 6px; font-size: 0.76rem; font-weight: 600; cursor: pointer; padding: 0.32rem 0.65rem; display: inline-flex; align-items: center; gap: 4px; }
            .cs-save-btn { background: #12314C; color: white; }
            .cs-save-btn:hover { background: #0e2438; }
            .cs-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
            .cs-clear-btn { background: #fee2e2; color: #dc2626; }
            .cs-clear-btn:hover { background: #fecaca; }
            .cs-status { font-size: 0.76rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
            .cs-status-booked { color: #0f766e; }
            .cs-status-held { color: #b45309; }
            .cs-status-pending { color: #b45309; }
            .cs-status-error { color: #dc2626; }
            .cs-confirm-inline-btn { border: none; background: #fde68a; color: #92400e; border-radius: 5px; font-size: 0.68rem; font-weight: 700; padding: 2px 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; }
            .cs-confirm-inline-btn:hover { background: #fcd34d; }
            .cs-reserved-row { align-items: flex-start !important; padding-top: 0.35rem; border-top: 1px dashed #e9d9b8; }
            .cs-reserved-label { font-size: 0.72rem; font-weight: 700; color: #6b7280; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
            .cs-reserved-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
            .cs-reserved-chip { font-size: 0.7rem; font-weight: 600; padding: 1px 7px; border-radius: 8px; white-space: nowrap; }
            .cs-reserved-chip-held { background: #fef3c7; color: #92400e; }
            .cs-reserved-chip-booked { background: #fee2e2; color: #b91c1c; }
        `;
        document.head.appendChild(style);
    }
    ensureStyles();

    window.ConferenceScheduling = {
        // Conferences
        loadConferences, loadAllConferences, createConference, updateConference, deleteConference,
        // Availability / slots
        getAvailabilityDoc, getAllAvailabilityForConference, getBdrConferenceIdsWithAvailability,
        saveAvailability, getOpenSlots, generateSlots,
        setSlotStatus, bookSlot, holdSlot, releaseSlot,
        // Meeting requests
        getMeetingRequest, getMeetingRequestsForConference, getAllMeetingRequests,
        saveMeetingRequest, cancelMeetingRequest, updateMeetingRequestFields, setMeetingRequestHoldState,
        // Scanning / transcripts
        regexScan, aiScan, scanContactInfo, findConversationTextForContact,
        findConversationsForContacts, conversationKeyFor,
        // Widget
        mountWidget,
        // Utils (exposed for the report/PDF page)
        contactKeyFor, normalizeLiUrl, fmtTime12, fmtDateLong, fmtDateShort, minutesToHHMM, hhmmToMinutes, escapeHtml
    };
})();
