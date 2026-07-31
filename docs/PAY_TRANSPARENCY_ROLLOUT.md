# Pay Transparency & Consistency — What We're Changing and Why

**Audience:** Internal (leadership + whoever deploys the change). Use this as the master checklist and the basis for what we tell the team.

**Goal:** Every source of truth — the agent's **My Performance** page, the agent's **Your Overview** on the dashboard, the **Call Manager** (admin), and **payroll** — should show the **same number**, and that number should reflect **real, completed work only**. No agent should ever be surprised or able to argue about pay again.

---

## 1. The problem we found (plain English)

We investigated a pay dispute and discovered three separate issues that, together, made every screen show a different number for the same agent:

1. **The system let agents log paid outcomes on contacts that had no phone number.**
   One campaign was loaded with contacts that had no phone on file. Those contacts still appeared in the call queue, and a paid outcome ("Spoke – Declined", $1.50) could be logged against them — even though no call could physically have been made. This created hundreds of $1.50 charges for calls that never happened.

2. **Each screen counted pay differently.**
   - **Your Overview** (dashboard) summed *every* record with no filtering → the most inflated number.
   - **My Performance** (agent page) did the same.
   - **Call Manager** (admin) silently dropped no-phone records → a lower number.
   - **Payroll** is what was actually paid.
   Because the rules differed, the numbers never matched, which looked like missing pay.

3. **Meeting (Achievement Pool) bonuses were counted as "earned" the moment a meeting was scheduled** — before the meeting actually happened. No-shows and not-yet-occurred meetings inflated lifetime totals.

**Net effect:** an agent's "lifetime earnings" looked far higher than what was actually owed, while the admin tool looked lower — and neither matched payroll.

---

## 2. The rules going forward (the single standard)

These rules now apply **everywhere** pay is shown or calculated:

| Rule | What it means |
|------|----------------|
| **R1 — A call must be callable to be paid.** | A contact with **no usable phone number** is never queued, never shown, and never payable. (Enforced in the dialer now.) |
| **R2 — Call pay is earned when the call is made.** | Base pay (per the rate card below) is counted as soon as a real, completed call is logged. |
| **R3 — Meeting bonuses are *pending* until the meeting happens.** | The Achievement Pool bonus for a scheduled meeting is shown as **Pending** until the meeting is confirmed as held. No-shows are **$0** (shown for transparency). |
| **R4 — One rule, every screen.** | My Performance, Your Overview, Call Manager, and payroll all use R1–R3 so the numbers match. |

### Rate card (unchanged — this is what we already pay)

| Outcome | Pay |
|---------|-----|
| Left personalized recorded message | $0.50 |
| Left message with receptionist/team member | $0.50 |
| Unable to leave message, but good number | $0.50 |
| Spoke to prospect — **Declined** meeting | $1.50 |
| Spoke to prospect — **Scheduled** meeting | $0.50 **+ Achievement Pool bonus** (paid once the meeting is held) |
| Spoke to prospect — Asked for email follow-up | $0.50 |
| Spoke to prospect — Scheduled callback | $0.50 |
| Bad number / wrong person / disconnected | $0.00 |
| Skip | $0.00 |

**Achievement Pool:** starts at $40, grows with each qualifying call ($0.10–$0.50 per call by tier), soft-caps at $200 (then $0.10/call). The full pool is awarded on a **scheduled meeting**, then resets to $40. The bonus is **pending until the meeting actually occurs**.

> Nothing about the pay *rates* is changing. We are only changing **when** something counts (real calls only; meeting bonuses confirmed when held) and making all screens agree.

---

## 3. What is changing on each screen

### A. The dialer (`team/phone-calls.html`) — ALREADY DEPLOYED
- No-phone contacts can no longer be reserved, queued, prioritized, or shown. If one slips through, it is auto-skipped. (R1)
- **Agent impact:** they simply won't see uncallable contacts anymore. Nothing they need to do.

### B. Agent "My Performance" page (`team/performance.html`)
- Splits earnings into **two clear buckets**:
  - **Confirmed Pay** = call base pay (real calls) + meeting bonuses for meetings that were held.
  - **Pending Pay** = meeting bonuses for meetings scheduled but not yet held.
- Shows **No-show / not-paid** items for transparency at $0 with a reason.
- The **call history table** clearly shows the pay for **each individual call**, plus a meeting's status (Pending / Confirmed / No-show).
- Adds an always-visible **"How your pay works"** rate card so there's no ambiguity.

### C. Agent dashboard "Your Overview" (`team/index.html`)
- The lifetime "Total Earnings" now uses the same rules (callable calls only; meeting bonuses confirmed when held), so it matches My Performance and payroll.
- **This will lower some historical lifetime numbers** (mostly removing no-phone "declines" and not-yet-held meeting bonuses). For honest agents the change is tiny; for anyone who logged no-phone declines it will drop.

### D. Call Manager (admin, `crm/call_manager.html`)
- Already filters no-phone records. We will align its meeting-bonus handling to the same Pending/Confirmed rule so admin and agent views match. *(Scheduled next.)*

---

## 4. Rollout sequence (recommended, lowest-shock)

1. **Done:** dialer prevention (no more uncallable contacts in the queue).
2. **Communicate first, then deploy the page changes.** Send the team a short note (template below) *before* the My Performance / Your Overview numbers change, so a lower lifetime number isn't a surprise.
3. **Deploy My Performance + Your Overview** together so they always agree.
4. **Align Call Manager** meeting-bonus handling.
5. **Campaign setup fix:** going forward, contacts with no phone are rejected/flagged at import (see Taylor's guide) so this can't reoccur.

### Team announcement template (short)

> **Subject: Clearer pay reporting on your dashboard**
>
> Hi team — we've made your pay reporting clearer and more accurate. Two things:
> 1. Your **My Performance** page now separates **Confirmed Pay** (calls you've made + meetings that were held) from **Pending Pay** (meeting bonuses that pay out once the meeting actually happens). You can also see exactly what each call paid.
> 2. We fixed a data issue where some contacts with no phone number were showing up in the queue. Those were never callable, so they're now removed. If your lifetime total shifts slightly, that's why — your real, completed work is fully counted and unchanged.
>
> Pay rates are not changing. Questions? Ask [manager].

---

## 5. Verification checklist (before calling it done)

- [ ] My Performance "Confirmed Pay" for a test agent == Call Manager payroll for the same date range.
- [ ] No-phone records show as $0 "not callable" (not as paid declines) on all screens.
- [ ] A scheduled-but-future meeting shows as **Pending**, not in Confirmed Pay.
- [ ] A no-show meeting shows $0 with reason.
- [ ] Your Overview lifetime total == sum of My Performance confirmed pay.
- [ ] New campaign import rejects/flags contacts with no phone (Taylor's guide).
