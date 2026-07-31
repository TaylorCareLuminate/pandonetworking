# Response to Clarissa's Pay-Explanation Request

> **INTERNAL — READ FIRST. NOT LEGAL ADVICE.**
> This is a drafting aid, not legal advice. Because this is a written wage dispute and a separation is contemplated, have **employment counsel and/or HR review and approve** both the wording and the timing before sending. Keep the tone factual and non-accusatory; do not use words like "fraud," "lying," "stealing," or "fabricated" in anything sent to her or any third party.

---

## Part 1 — Quick summary (for you)

**Her claim:** earned $4,266, received $3,548 → a "$718 + bonus" gap she's calling a retroactive deduction for bad leads.

**The reality, and the core message of the response:**
0. **We owe her one item — $140.50.** Her 5/18 AllHealth Network meeting (pool bonus $140.50) has now been confirmed by the client company after the last payroll had already been processed, so it's earned and pays on the current 5/24–6/6 check. Heads-up: it does NOT appear in Call Manager because of a dedup/campaign-scope visibility issue — the tracking data has two 5/18 records for this contact (a `spoke-scheduled-meeting` $141 and a `left-recorded-message` $0.50 two minutes later), and Call Manager showed the $0.50 record while hiding the meeting under an older campaign. So pay the $140.50 **manually** this cycle. We are NOT clawing back the ~$83.50 of small prior-period overpayments. (See dedup/scope fix recommendation.)
1. **Her pay was otherwise never reduced.** Apart from that bonus, she was paid for all verified, completed call work. Nothing legitimate was clawed back.
2. **The gap is mostly a display problem.** The "My Performance" dashboard was overstating a running total by counting (a) entries that were never billable and (b) meeting bonuses before the meetings happened. We corrected the display. The dashboard number was never her paycheck.
3. **What makes up the gap (verified audit through 6/3):**
   - **No-phone "declined" entries — $415.50 (277 records).** "Declined" asserts a live conversation; these were logged on contacts with **no phone number**, and our phone system shows **no outbound call** for them. Not billable to the client, so never paid (the correct disposition is "Bad Number," $0). 91 of these ($136.50) were logged in the current period right up until the no-phone filter was deployed.
   - **Pending meeting bonus — $140.50.** Achievement-Pool bonus pays when the meeting is actually held.
   - **No-show meeting bonus — $107.50.** Bonus for a meeting that did not occur.
   - We **did not** deduct the borderline "declined with no/short call" entries (~$144.00) — resolved in her favor.
4. **We do not penalize for lead quality.** A bad lead correctly marked "Bad Number" pays $0 for everyone — that's not a penalty, it's the disposition. The issue was the *disposition used*, not the lead.

> Note on exact dollars: her figures ($4,266 / $3,548) are close to our verified audit (dashboard $4,207.60 recorded / $3,513.10 paid). Verified earnings **through her last paid period (5/23) are $3,429.60 vs. $3,513.10 paid — paid in full, +$83.50.** The disputed 5/10–5/23 period reconciles to exactly $210.50. Have the CFO confirm the $3,513.10 total before sending, and attach the itemized report (`clarissa_call_evidence.csv`).

---

## Part 2 — Draft response letter (for review before sending)

Subject: Re: Written Explanation of Pay

Dear Clarissa,

Thank you for your note. We take pay accuracy seriously and are glad to provide a complete, itemized explanation. I'll address your questions directly.

**First and most important: your pay has not been reduced, and no earned pay has been withheld.** You have been paid for all verified, completed call work at our standard rates. The total paid to you is, in fact, slightly higher than the total our records confirm you earned.

The difference you've identified is between the number shown on the *My Performance* dashboard and the amount actually paid. That dashboard had a known error that **overstated** running totals: it counted entries that were never billable, and it counted meeting bonuses before the meetings occurred. We have corrected the dashboard so it now reflects accurate, earned pay. The dashboard figure was never your pay — payroll is — and your paychecks have been correct.

**Itemized breakdown (attached).** Attached is a line-by-line report of every call and appointment in the period: phone number, contact, date and time, the call duration from our phone system (RingCentral), the disposition recorded, the amount, and — where applicable — the reason an entry is not billable. The gap between the dashboard total and your pay is made up of these categories:

1. **"Declined" entries on contacts with no phone number.** A "Spoke – Declined" disposition records that we reached a person who declined, and it bills the client on that basis. A number of entries used this disposition on contacts that had **no phone number on file**, and our phone-system records show **no outbound call** for them — consistent with there being no number to dial. Because no call could be placed and no conversation occurred, these cannot be billed to the client and are not payable. The correct disposition for a contact with no working number is **"Bad Number," which pays $0** — this is set out in our training and on the published Call Performance & Payments page (*team/call-performance-payments*), which states plainly that bad numbers are worth no payment and should be marked as "Bad Number." These no-phone contacts should have been marked "Bad Number," not "Declined." To be clear: this is **not a lead-quality penalty and not a deduction from your pay** — these amounts were never paid; they only inflated the on-screen total.

2. **Meeting bonuses that are pending or for meetings that did not occur.** Under the Achievement Pool, the bonus for a scheduled meeting is earned **when the meeting takes place**. Bonuses for meetings not yet held show as *pending* and pay out once held; bonuses for meetings that were no-shows are not earned. These are contingent bonuses, not deductions.

**On your policy question.** As a 1099 independent contractor, you are paid per call outcome under the agreed, published rate structure — not on an hourly basis — and pay is tied to a valid, billable disposition of an actual call. You're right that you don't choose which leads enter the dialer, and we are **not** penalizing you for lead quality. Base pay is earned for a valid disposition of an actual call. The pay rules — including that a "Bad Number" pays $0 and that bad/invalid numbers should be marked as such — are published on the Call Performance & Payments page (*team/call-performance-payments*) and are part of the training every caller receives. A contact with no working number that is correctly marked "Bad Number" pays $0 — the same for everyone. Nothing has been retroactively removed from pay for completed, valid call work. Where individual entries were ambiguous, we resolved them in your favor.

**One item should be corrected in your favor.** In reviewing your records, we confirmed that the meeting you scheduled with **AllHealth Network** (from your 5/18 call) has now taken place. Under the Achievement Pool rules, that makes the **$140.50** bonus for it earned, and we will include it in your next payment. With that bonus counted, your **5/10–5/23 period totals $351.00** — close to the figure you had in mind for that period; the small remaining difference is the no-phone "declined" entries described above.

Aside from that one bonus, your completed call work has been **paid in full for every pay period**. Your current pay period (5/24 onward) is still in progress and will be paid on the normal schedule. The attached report itemizes every entry, including each per-call amount and the subtotal for each category above, so you can see each one and its status.

> _Internal note (delete before sending): The $140.50 AllHealth/Jen Bock meeting bonus is now owed (meeting confirmed held) — pay it next cycle and mark the meeting "included" in the system. We are NOT clawing back the ~$83.50 of small prior-period overpayments. Verified earnings through 5/23 with the bonus = $3,570.10; paid to date $3,513.10; so net ~$57 owed, but we are paying the full $140.50 bonus as good faith. Have the CFO confirm before sending. Note the source data inconsistency on this contact (tracking shows scheduled-meeting $141; Call Manager shows left-recorded-message $0.50) — reconcile in the system._

If, after reviewing the attached report, you believe a specific **verified** call was paid incorrectly, please identify it by date and number and we will review it promptly.

Best regards,
Sam Ellsworth
HealthLuminate

---

## Part 3 — Protecting the company (internal checklist)

- [ ] **Have counsel/HR review before sending.** Wage disputes can become formal claims; one review now prevents problems later.
- [ ] **Confirm the pay agreement language.** Ideally your written pay policy defines pay as tied to a *valid disposition / billable call*. If it does, the no-phone "declined" non-payment is clearly supported. If it's silent, counsel should weigh in before you assert non-billability.
- [ ] **Reconcile exact dollars to payroll** (CFO) for the specific period in her letter, and attach `clarissa_call_evidence.csv` as the itemization she requested. Providing the breakdown demonstrates good faith and transparency.
- [ ] **Keep the language factual.** Use "our phone system shows no outbound call for these entries," not characterizations of intent. Avoid "fraud/fabricated/lying" in anything external.
- [ ] **Do not withhold legally-earned wages.** Pay all verified work; make final-pay timing comply with your state's law. Our position is she was paid in full — keep it that way.
- [ ] **Separation timing/retaliation risk.** Terminating immediately after an employee raises a pay complaint can look retaliatory. Coordinate any separation decision and its documented, legitimate basis with counsel; do **not** reference her pay complaint as a reason.
- [ ] **Preserve all evidence:** the itemized report, RingCentral call logs, CFO payment records, and the internal audit docs. Don't delete or alter anything.
- [ ] **Save a copy of the published pay policy.** The Call Performance & Payments page (`team/call-performance-payments`) states bad numbers pay $0 and should be marked "Bad Number." Screenshot/PDF it as-of-today so there's a dated record that the policy was published and available to her, in case the page changes later.
- [ ] **Single point of contact / one channel.** Route further correspondence through one person (and counsel) to keep the record clean and consistent.
