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
 * @version 1.0.0
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
    async function getAvailabilityDoc(conferenceId, bdrEmail) {
        const { doc, getDoc } = fx();
        const id = availabilityDocId(conferenceId, bdrEmail);
        const snap = await getDoc(doc(dbi(), 'conference_availability', id));
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }

    async function getAllAvailabilityForConference(conferenceId) {
        const { collection, getDocs, query, where } = fx();
        const snap = await getDocs(query(collection(dbi(), 'conference_availability'), where('conferenceId', '==', conferenceId)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
        return { id, ...data };
    }

    async function getOpenSlots(conferenceId, bdrEmail) {
        const avail = await getAvailabilityDoc(conferenceId, bdrEmail);
        if (!avail) return [];
        return (avail.slots || [])
            .filter(s => s.status === 'open')
            .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
    }

    async function bookSlot(conferenceId, bdrEmail, slotId, info) {
        const avail = await getAvailabilityDoc(conferenceId, bdrEmail);
        if (!avail) throw new Error('No availability windows are set up for this BDR at this conference yet.');
        let target = null;
        const slots = (avail.slots || []).map(s => {
            if (s.id !== slotId) return s;
            if (s.status === 'booked' && s.meetingRequestId && s.meetingRequestId !== info.meetingRequestId) {
                throw new Error('That time slot was just booked by someone else — please pick another.');
            }
            target = { ...s, status: 'booked', ...info };
            return target;
        });
        if (!target) throw new Error('Selected time slot no longer exists — please refresh and try again.');
        const { doc, updateDoc } = fx();
        await updateDoc(doc(dbi(), 'conference_availability', avail.id), { slots, updatedAt: new Date() });
        return target;
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
     * Create/update a meeting request. Pass slotId to book a specific open slot,
     * or omit/null it (with wantsToMeet true) to mark "wants to meet, no time yet".
     */
    async function saveMeetingRequest(ctx) {
        const { doc, getDoc, setDoc } = fx();
        const key = contactKeyFor(ctx);
        const reqId = `${ctx.conferenceId}__${key}`;
        const reqRef = doc(dbi(), 'conference_meeting_requests', reqId);
        const existingSnap = await getDoc(reqRef);
        const existing = existingSnap.exists ? existingSnap.data() : null;

        const bdrEmailLower = (ctx.bdrEmail || existing?.bdrEmail || '').toLowerCase().trim();

        // Release the previously-booked slot if it's being changed or cleared.
        if (existing && existing.slotId && existing.slotId !== ctx.slotId) {
            await releaseSlot(ctx.conferenceId, bdrEmailLower, existing.slotId);
        }

        let slotInfo = null;
        if (ctx.slotId) {
            slotInfo = await bookSlot(ctx.conferenceId, bdrEmailLower, ctx.slotId, {
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
            hasTimeSlot: !!ctx.slotId,
            slotId: ctx.slotId || null,
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
        await updateDoc(reqRef, { status: 'cancelled', wantsToMeet: false, slotId: null, hasTimeSlot: false, updatedAt: new Date() });
    }

    async function updateMeetingRequestFields(requestId, patch) {
        const { doc, updateDoc } = fx();
        await updateDoc(doc(dbi(), 'conference_meeting_requests', requestId), { ...patch, updatedAt: new Date() });
    }

    // ── Best-effort conversation lookup (for AI/regex scanning) ─────────
    // Finds the LinkedIn conversation thread (heyreach_inbox) for a given
    // BDR + contact LinkedIn URL and flattens it to plain text. Best-effort:
    // returns '' if nothing matches (e.g. no reply has come in yet).
    async function findConversationTextForContact(bdrEmail, contactLiUrl) {
        if (!contactLiUrl || !bdrEmail) return '';
        const targetUrl = normalizeLiUrl(contactLiUrl);
        if (!targetUrl) return '';
        try {
            const { collection, getDocs, query, where } = fx();
            const inboxRef = collection(dbi(), 'heyreach_inbox');
            const email = bdrEmail.toLowerCase().trim();
            const snaps = await Promise.all([
                getDocs(query(inboxRef, where('bdrEmail', '==', email))).catch(() => ({ docs: [] })),
                getDocs(query(inboxRef, where('accountEmail', '==', email))).catch(() => ({ docs: [] }))
            ]);
            const seen = new Set();
            for (const snap of snaps) {
                for (const d of (snap.docs || [])) {
                    if (seen.has(d.id)) continue;
                    seen.add(d.id);
                    const data = d.data();
                    const url = normalizeLiUrl(data.leadProfileUrl || '');
                    if (url && url === targetUrl) {
                        return (data.messages || []).map(m => m.body || m.text || m.message || '').filter(Boolean).join('\n');
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ [ConferenceScheduling] Conversation lookup failed:', e.message);
        }
        return '';
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
        containerEl.innerHTML = `<div class="cs-widget-loading"><i class="fas fa-spinner fa-spin"></i> Loading conference options…</div>`;

        let conferences = [];
        try {
            conferences = await loadConferences();
        } catch (e) {
            containerEl.innerHTML = `<div class="cs-widget-error">Could not load conferences: ${escapeHtml(e.message)}</div>`;
            return;
        }

        if (conferences.length === 0) {
            containerEl.innerHTML = `
                <div class="cs-widget">
                    <div class="cs-widget-empty">
                        <i class="fas fa-calendar-star"></i> No conferences set up yet —
                        <a href="conference_scheduling.html" target="_blank">create one</a>.
                    </div>
                </div>`;
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
                    <label class="cs-no-time-label"><input type="checkbox" class="cs-no-time-cb"> Wants to meet — no time yet</label>
                    <button type="button" class="cs-save-btn"><i class="fas fa-check"></i> Save</button>
                    <button type="button" class="cs-clear-btn" title="Remove this meeting request"><i class="fas fa-times"></i></button>
                </div>
            </div>`;

        const confSelect = containerEl.querySelector('.cs-conf-select');
        const slotSelect = containerEl.querySelector('.cs-slot-select');
        const noTimeCb = containerEl.querySelector('.cs-no-time-cb');
        const statusEl = containerEl.querySelector('.cs-status');
        const saveBtn = containerEl.querySelector('.cs-save-btn');
        const clearBtn = containerEl.querySelector('.cs-clear-btn');

        function setStatus() {
            const req = state.request;
            if (!req || req.status === 'cancelled' || !req.wantsToMeet) {
                statusEl.innerHTML = '';
                statusEl.className = 'cs-status';
                return;
            }
            if (req.hasTimeSlot && req.date) {
                statusEl.innerHTML = `<i class="fas fa-calendar-check"></i> ${escapeHtml(fmtDateShort(req.date))} · ${escapeHtml(fmtTime12(req.startTime))}–${escapeHtml(fmtTime12(req.endTime))}`;
                statusEl.className = 'cs-status cs-status-booked';
            } else {
                statusEl.innerHTML = `<i class="fas fa-handshake"></i> Wants to meet — time TBD`;
                statusEl.className = 'cs-status cs-status-pending';
            }
        }

        async function refreshForConference() {
            state.conferenceId = confSelect.value;
            slotSelect.innerHTML = `<option value="">Loading time slots…</option>`;
            saveBtn.disabled = true;

            const [req, openSlots] = await Promise.all([
                getMeetingRequest(state.conferenceId, ctx).catch(() => null),
                ctx.bdrEmail ? getOpenSlots(state.conferenceId, ctx.bdrEmail).catch(() => []) : Promise.resolve([])
            ]);
            state.request = req;
            state.openSlots = openSlots;

            // If this contact already has a booked slot, make sure it appears in the
            // dropdown (it's "booked", so getOpenSlots() alone won't include it).
            let slotsForDropdown = openSlots.slice();
            if (req && req.hasTimeSlot && req.slotId && !slotsForDropdown.some(s => s.id === req.slotId)) {
                slotsForDropdown.unshift({ id: req.slotId, date: req.date, startTime: req.startTime, endTime: req.endTime, status: 'booked' });
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
            slotSelect.disabled = noTimeCb.checked;
            saveBtn.disabled = false;

            setStatus();
        }

        confSelect.addEventListener('change', () => refreshForConference().catch(e => {
            statusEl.innerHTML = `<span class="cs-status-error">${escapeHtml(e.message)}</span>`;
        }));

        noTimeCb.addEventListener('change', () => {
            slotSelect.disabled = noTimeCb.checked;
            if (noTimeCb.checked) slotSelect.value = '';
        });

        saveBtn.addEventListener('click', async () => {
            if (!ctx.bdrEmail) {
                alert('No BDR email is available for this contact — cannot save a meeting request.');
                return;
            }
            const wantsNoTime = noTimeCb.checked;
            const slotId = wantsNoTime ? null : (slotSelect.value || null);
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
                    source: ctx.source || 'manual'
                });
                state.request = saved;
                setStatus();
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
            .cs-no-time-label { display: inline-flex; align-items: center; gap: 5px; font-size: 0.76rem; color: #4b5563; cursor: pointer; white-space: nowrap; }
            .cs-save-btn, .cs-clear-btn { border: none; border-radius: 6px; font-size: 0.76rem; font-weight: 600; cursor: pointer; padding: 0.32rem 0.65rem; display: inline-flex; align-items: center; gap: 4px; }
            .cs-save-btn { background: #12314C; color: white; }
            .cs-save-btn:hover { background: #0e2438; }
            .cs-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
            .cs-clear-btn { background: #fee2e2; color: #dc2626; }
            .cs-clear-btn:hover { background: #fecaca; }
            .cs-status { font-size: 0.76rem; font-weight: 600; }
            .cs-status-booked { color: #0f766e; }
            .cs-status-pending { color: #b45309; }
            .cs-status-error { color: #dc2626; }
        `;
        document.head.appendChild(style);
    }
    ensureStyles();

    window.ConferenceScheduling = {
        // Conferences
        loadConferences, loadAllConferences, createConference, updateConference, deleteConference,
        // Availability / slots
        getAvailabilityDoc, getAllAvailabilityForConference, saveAvailability, getOpenSlots, generateSlots,
        // Meeting requests
        getMeetingRequest, getMeetingRequestsForConference, getAllMeetingRequests,
        saveMeetingRequest, cancelMeetingRequest, updateMeetingRequestFields,
        // Scanning
        regexScan, aiScan, scanContactInfo, findConversationTextForContact,
        // Widget
        mountWidget,
        // Utils (exposed for the report/PDF page)
        contactKeyFor, normalizeLiUrl, fmtTime12, fmtDateLong, fmtDateShort, minutesToHHMM, hhmmToMinutes, escapeHtml
    };
})();
