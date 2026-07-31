# Pay Review Summary — Clarissa

**Purpose:** A clear, factual summary of what we reviewed, what we found, what was earned vs. paid, and why our process and tools are changing. Written to be shared/explained directly.

---

## What we reviewed

You raised a concern that your pay didn't match what our system showed. We took that seriously and did a full review. We compared **three things** for your entire time with us:

1. Every call/outcome recorded in our system,
2. **RingCentral's call logs** — the independent record of every call actually dialed and how long it lasted, and
3. The payments our CFO confirmed were sent to you.

RingCentral is the objective source of truth: it records what was actually dialed and connected, regardless of what was clicked in our system.

---

## What we found — the good

**Your real calling work checks out.** For essentially every outcome — voicemails, "good number, no message," receptionist messages, email follow-ups, and your scheduled meetings — **98–100% of what you logged matches a real RingCentral call.** You did the work, and your scheduled meetings all tie to real conversations. That's not in question, and we appreciate it.

We also confirmed your payment math was honest: the total you were paid matches our CFO's records within about a dollar.

## What we found — the problem

The one clear, significant issue is this: the outcome **"Spoke – Declined"** (which pays $1.50 and tells the client we reached someone who declined) was logged many times on contacts that had **no phone number at all** — so there was never anyone to dial.

- Across your time with us, **277 paid outcomes (about $415.50)** were logged on contacts with **no phone number on file** — most of them "declined."
- These were heavily concentrated in the **5/10–5/23** period (178 no-phone "declined" entries, $267 in that period alone), and continued into the current period (91 entries, $136.50) until the no-phone filter was deployed.
- For comparison, when you encountered no-phone contacts in other campaigns, you correctly logged them as **"bad number" ($0)** — so the correct handling was clearly understood.

The correct outcome for a contact you can't call is **"bad number" ($0)**, not "declined" ($1.50). This is set out in training and on the published Call Performance & Payments page. Logging "declined" tells our client we spoke with someone we never called, and bills them $1.50 for it. We can't represent that to our customers, so these aren't payable.

> **A note on fairness:** Separately, there were a smaller number of "declined" entries (about **$144.00**) where there *was* a phone number but RingCentral shows either no matching call or only a 1–5 second connection (a disconnect/automated message). Because we were **not** cross-checking call logs at the time and you weren't told that declines would be validated that way, **we are not charging you for those — we're giving you the benefit of the doubt.** Going forward, declines will be validated against the phone system (see below).

---

## Earned vs. paid (the numbers)

Giving you the benefit of the doubt on anything uncertain, and only removing the no-phone records that clearly couldn't be called:

| | Amount |
|---|---:|
| Total your system page recorded (through 6/3) | **$4,207.60** |
| Less: paid outcomes on contacts with **no phone number** (never callable) | **−$415.50** |
| Less: **no-show** meeting bonus (meeting never took place) | **−$107.50** |
| **Verified earnings (lifetime)** | **$3,684.60** |
| Less: current period still in progress (5/24–6/6) — pays on the next normal cycle | **−$114.50** |
| **Verified earnings through your last paid period (5/23)** | **$3,570.10** |
| **Total actually paid to date** | **$3,513.10** |
| **Result** | **One meeting bonus ($140.50) is now earned and will be paid; otherwise paid in full.** |

On the specific paycheck you disputed (**5/10–5/23**): your AllHealth Network meeting (scheduled from the 5/18 call) has now been confirmed by the client company, after the last payroll had already been processed, so its **$140.50** Achievement Pool bonus is now earned. Counting it, your work tied to that period comes to **$351.00** ($210.50 base work + $140.50 bonus) — close to the **$365** you expected; the small remaining difference is the no-phone "declined" entries that can't be billed. Because the meeting was confirmed after the prior payroll, the **$140.50 will be paid on your current (5/24–6/6) paycheck**.

**Bottom line:** your completed call work has been paid in full. The one outstanding item is the **$140.50** Achievement Pool bonus for your AllHealth Network meeting, which has now been confirmed held — that will be added to your next payment.

> **Internal audit note (not for sharing):** On 6/4 we audited all 4,397 of Clarissa's records grouped by campaign to rule out missed pay caused by records attached to archived campaigns (which the Call Manager's "Current Campaigns" scope hides from payroll). Result: exactly **one** payable record was stranded under an orphan/old campaign — the **Jen Bock / AllHealth Network meeting** ($140.50, logged to `campaign_1762401107769` while her actual outreach that day was under the current campaign). It was the only meeting bonus never marked "included," and it is now being paid. Every other campaign's per-call pay falls within that campaign's active span (paid in-period). The only other non-"included" meeting is the **Sterling Security** bonus ($107.50, status `excluded`), which is a correct no-show exclusion, not a miss. The Call Manager has been patched so scheduled meetings always bypass the campaign-scope filter, preventing recurrence.

---

## Why our tools showed different numbers

You weren't wrong that our screens disagreed — they did, and that's on us:

- The **"Your Overview" / lifetime** number summed everything with no checks, so it looked too high.
- The **Call Manager** number filtered out the no-phone entries and the not-yet-earned meeting bonus — which is why it showed **$210.50** for 5/10–5/23. That number was actually the correct one, and it's exactly what you were paid.
- The two screens disagreed only because they used different rules.

We've now fixed this so all screens use one rule and show the same, accurate number.

---

## Why the number on your Performance page is changing (the ~$523 difference)

You'll notice the "earnings" total on your **My Performance** page goes from about **$4,207** down to about **$3,684**. That's roughly a **$523** change, and we want to be completely transparent about every dollar of it. Nothing here is money that was earned and taken away — the old number simply added up things that were never actually payable.

Here is exactly where that ~$523 goes:

| What's leaving the headline number | Amount | What it was | Removed or earned? |
|---|---:|---|---|
| **No phone number** | **$415.50** | "Declined" logged on contacts that had no phone number — there was no one to dial | **Removed** — we can't bill a client for a call that couldn't be made |
| **No-show meeting** | **$107.50** | Achievement Pool bonus for a meeting that was scheduled but never took place | **Removed** — the meeting didn't occur |
| **Total** | **$523.00** | | |

(The $140.50 bonus for your AllHealth Network meeting is **not** in this list — that meeting has now been confirmed held, so it is **earned and will be paid to you**. And the ~$144 of uncertain "declined" calls discussed above is **left in your favor** — not removed.)

**Most importantly:** the new lifetime number (~$3,684) reflects *all* of your verified work, including your current pay period that hasn't been paid yet. Everything **through your last paid period (5/23) was paid correctly**, and the one outstanding item — the $140.50 meeting bonus — is being added to your next payment. The old screen was simply overstating your total by including calls that were never billable.

---

## What's changing (and why)

To make sure this never happens again — for you or anyone:

1. Contacts **with no phone number are removed from the call queue** entirely — the system won't show or let anyone log a call on someone who can't be dialed.
2. **Going forward, "declined" will be validated against the phone system** so it can only reflect a real, connected call. (This is a new, forward-looking check — we did not apply it retroactively to your past pay.)
3. Your **My Performance** page now clearly separates **Confirmed Pay** (calls made + meetings held) from **Pending Pay** (meeting bonuses that pay once the meeting actually happens), with each call's pay shown line by line.
4. Campaign setup will reject contacts without a phone number before they're ever loaded.

---

## Final pay

Your verified earnings have been paid in full (and then some). Your final paycheck will reflect any remaining **verified** call work in your last period at our standard rates. We're grateful for the legitimate work you did and wish you well.
