// Shared call filtering/eligibility rules for all call-related pages.
// Loads as a global: window.CallFiltering
(function () {
  // Generic bad-number outcomes are NOT permanent because alternates may exist.
  // We treat wrong-person/company and explicit declines as permanent.
  const BAD_NUMBER_OUTCOME_TOKENS = [
    'bad-number',
    'bad_number',
    'wrong-number',
    'wrong_number',
    'disconnected',
  ];

  // Keep <= 10 if used in Firestore "in" queries.
  const PERMANENT_BLOCK_OUTCOMES = [
    'spoke-declined',
    'declined',
    'bad-number-wrong-person',
    'contact-left-no-replacement',
  ];

  const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed', 'do-not-call']);

  function getNotesText(record) {
    const candidates = [
      record?.notes,
      record?.note,
      record?.callNote,
      record?.callNotes,
      record?.latestNote,
      record?.latestCallNote,
    ];
    const text = candidates.find((v) => typeof v === 'string' && v.trim().length > 0);
    return (text || '').trim();
  }

  function getOutcome(record) {
    return String(record?.outcome || '').trim();
  }

  function getPhoneRaw(record) {
    return (
      record?.phoneNumber ||
      record?.phone ||
      record?.contactPhone ||
      // Phone-calls uses contactData.workphone heavily; include it so we don't falsely treat calls as "no phone".
      record?.workphone ||
      record?.workPhone ||
      record?.contactData?.workphone ||
      record?.contactData?.workPhone ||
      record?.contactData?.phoneNumber ||
      record?.contactData?.phone ||
      record?.phone1 ||
      ''
    );
  }

  function normalizePhone10(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length < 10) return '';
    return digits.slice(-10);
  }

  function hasUsablePhone(record) {
    return normalizePhone10(getPhoneRaw(record)).length === 10;
  }

  function isBadNumberByOutcome(outcomeRaw) {
    const outcome = String(outcomeRaw || '').toLowerCase();
    if (!outcome) return false;
    return BAD_NUMBER_OUTCOME_TOKENS.some((t) => outcome.includes(t));
  }

  function isBadNumberByNotes(notesRaw) {
    const notes = String(notesRaw || '').toLowerCase();
    if (!notes) return false;
    // Catch both spaced and hyphenated tokens
    return (
      notes.includes('contact bad number') ||
      notes.includes('bad number') ||
      notes.includes('bad-number') ||
      notes.includes('bad_number') ||
      notes.includes('invalid number') ||
      notes.includes('wrong number') ||
      notes.includes('disconnected')
    );
  }

  function isWrongPersonSignal(outcomeRaw, notesRaw) {
    const outcome = String(outcomeRaw || '').toLowerCase();
    const notes = String(notesRaw || '').toLowerCase();
    if (outcome === 'bad-number-wrong-person') return true;
    if (notes.includes('bad-number-wrong-person')) return true;
    if (notes.includes('wrong person')) return true;
    return false;
  }

  function isDeclinedByOutcome(outcomeRaw) {
    const outcome = String(outcomeRaw || '').toLowerCase();
    if (!outcome) return false;
    // phone-calls uses spoke-declined as the canonical permanent decline signal
    if (outcome === 'spoke-declined') return true;
    if (outcome.startsWith('declined')) return true;
    return false;
  }

  function isDeclinedByNotes(notesRaw) {
    const notes = String(notesRaw || '').toLowerCase();
    if (!notes) return false;
    return notes.includes('declined') || notes.includes('do not call') || notes.includes('dnc');
  }

  function isTerminalStatus(record) {
    const status = String(record?.status || '').toLowerCase();
    if (TERMINAL_STATUSES.has(status)) return true;
    if (record?.completedAt) return true;
    return false;
  }

  // For *listing/queueing* scheduled/callable items.
  function shouldExcludeFromCallableLists(record) {
    if (!hasUsablePhone(record)) return { exclude: true, reason: 'no_phone' };
    if (isTerminalStatus(record)) return { exclude: true, reason: 'terminal_status' };

    const notes = getNotesText(record);
    const outcome = getOutcome(record);

    // Wrong-person is a "bad number" signal. We exclude this record itself from call lists,
    // but we do NOT block the entire contact (because alternates may exist).
    if (isWrongPersonSignal(outcome, notes)) {
      return { exclude: true, reason: 'wrong_person' };
    }
    if (isDeclinedByOutcome(outcome) || isDeclinedByNotes(notes)) {
      return { exclude: true, reason: 'declined' };
    }

    // Non-permanent bad number signals can still be useful to hide from "callable now" lists
    // (the record itself is usually completed anyway). We keep this as a soft exclusion.
    if (isBadNumberByOutcome(outcome) || isBadNumberByNotes(notes)) {
      return { exclude: true, reason: 'bad_number' };
    }
    return { exclude: false, reason: '' };
  }

  function extractContactIdentifiers(record) {
    const outreachSetId = String(record?.outreachSetId || record?.outreach_set_id || '').trim();
    const email = String(record?.contactEmail || record?.email || record?.contactData?.email || '').trim().toLowerCase();
    const phone10 = normalizePhone10(getPhoneRaw(record));
    return { outreachSetId, email, phone10 };
  }

  function buildBlockedContactSets(records) {
    const ids = new Set();
    const emails = new Set();
    const phones = new Set();

    (Array.isArray(records) ? records : []).forEach((r) => {
      const outcome = getOutcome(r);
      const notes = getNotesText(r);
      const isDeclinedPermanent =
        PERMANENT_BLOCK_OUTCOMES.includes(String(outcome || '').toLowerCase()) ||
        isDeclinedByOutcome(outcome) ||
        isDeclinedByNotes(notes);

      const isWrongPerson = isWrongPersonSignal(outcome, notes);

      // Declines block the contact (id/email/phone). Wrong-person only blocks the phone number.
      if (!(isDeclinedPermanent || isWrongPerson)) return;

      const { outreachSetId, email, phone10 } = extractContactIdentifiers(r);
      if (isDeclinedPermanent) {
        if (outreachSetId) ids.add(outreachSetId);
        if (email) emails.add(email);
      }
      if (phone10) phones.add(phone10);
    });

    return { ids, emails, phones };
  }

  function isBlockedBySets(record, sets) {
    if (!sets) return false;
    const { outreachSetId, email, phone10 } = extractContactIdentifiers(record);
    if (outreachSetId && sets.ids && sets.ids.has(outreachSetId)) return true;
    if (email && sets.emails && sets.emails.has(email)) return true;
    if (phone10 && sets.phones && sets.phones.has(phone10)) return true;
    return false;
  }

  window.CallFiltering = {
    PERMANENT_BLOCK_OUTCOMES,
    getNotesText,
    getOutcome,
    getPhoneRaw,
    normalizePhone10,
    hasUsablePhone,
    shouldExcludeFromCallableLists,
    isWrongPersonSignal,
    extractContactIdentifiers,
    buildBlockedContactSets,
    isBlockedBySets,
  };
})();


