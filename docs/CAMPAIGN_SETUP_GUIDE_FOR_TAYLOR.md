# Campaign Setup Guide — Making Sure Every Contact Is Callable

**Audience:** Taylor (campaign setup). **Why this matters:** We found a campaign that had been loaded with contacts that had **no phone number**. Those contacts still showed up in agents' call queues, which let calls get logged (and paid) on people who couldn't actually be called. The #1 job in setup is making sure **every contact in a calling campaign has a valid phone number before it goes live.**

> Rule of thumb: **If there's no phone number, it's not a calling contact.** A call system can't function if the agent has no one to dial.

---

## The golden rule

**No contact should ever enter a calling campaign without a usable phone number** (a real 10-digit number). If a contact has no phone, it should be removed before import, imported into a non-calling (email/LinkedIn-only) track, or fixed by adding the number.

The dialer now auto-skips no-phone contacts as a safety net — but that's a backstop. We do **not** want to rely on it. Setup is where we prevent the problem.

---

## Step-by-step: setting up a calling campaign

Use **Enhanced Campaign Management** (`crm/campaigns_enhanced.html`) and the campaign build/import flow.

### 1. Prep the contact list BEFORE importing
- Open the contact list (CSV/source) and confirm there is a **phone column** populated for every row meant for calling.
- Remove or separate any rows with a blank/"N/A"/"No phone number" phone value.
- Quick check: sort by the phone column and scan for blanks. Even one screenful of blanks means the list isn't ready for a calling campaign.

### 2. Mark phone as a REQUIRED import variable
- In Enhanced Campaign Management, open the **required import variables** section (the "Bracket Variables required when importing data for this campaign" area).
- Make sure the **phone** variable is selected as **required**.
- This makes the importer reject/flag rows that don't have a phone, instead of silently loading them.

### 3. Validate after import, before launch
- After importing, open the campaign and spot-check the contact count vs. the number of rows that actually had phones. If they don't match, no-phone rows leaked in.
- If you see contacts displaying **"No phone number"**, the list wasn't clean — pull them out before agents start calling.

### 4. Calling vs. non-calling tracks
- If a list is partly phone, partly email-only: split it. Put phone-having contacts in the **calling** campaign; route email-only contacts to an **email/LinkedIn** track (HeyReach / email follow-up), not the dialer.

### 5. Notes for callers
- Use the **"notes to callers"** field to flag anything unusual (e.g., "extensions required," "ask for the office manager"). This reduces mis-logged outcomes.

---

## What to double-check on every campaign (quick checklist)

- [ ] Every calling contact has a real 10-digit phone number.
- [ ] Phone is marked **required** in the import variables.
- [ ] Post-import count matches the number of phone-having rows (no blanks leaked in).
- [ ] No contact shows "No phone number" in the campaign.
- [ ] Email-only contacts are in an email track, not the dialer.
- [ ] Calling hours / timezone data present (so contacts aren't dialed out-of-hours).

---

## Why outcomes matter (so agents log correctly)

A few outcomes are commonly confused. When the list is clean, these stay clean:

- **Bad number** ($0) = the number doesn't work / is disconnected / wrong person. Use this for a number that fails.
- **Spoke – Declined** ($1.50) = the agent **actually reached a human** who said no. This should only ever happen on a contact that was really dialed and answered.
- A contact with **no phone** should never reach an outcome at all — there's nothing to dial.

If a campaign is set up with clean phone data, agents can't accidentally (or intentionally) log "declined" on someone who was never called.

---

## TL;DR for Taylor
1. Clean the list — every calling contact needs a phone.
2. Mark phone **required** at import.
3. Verify counts after import; pull any "No phone number" rows.
4. Email-only contacts go to email tracks, not the dialer.
