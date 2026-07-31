# Incentive Rules Update (Anti-Sniping + Fairness)

## Goals

- **Protect client reputation**: keep incentives aligned with *quality scheduled meetings* (as currently enforced by “no pool if meeting doesn’t happen”).
- **Reduce sniping + morale issues**: discourage “show up only when the pool is high” behavior.
- **Maintain fairness**: reward closers for closing, but require active participation in the campaign to be eligible for pool.
- **Do NOT change existing pay table**: keep `team/call-performance-payments.html` payment amounts and “pool goes to closer” structure as-is.

## Constraints (explicit)

- **No profit sharing / assists**: Achievement Pool remains a **closer-only reward**.
- **No pool snapshot**: pool payout remains the **current pool value at the time of scheduling**, to match what agents agreed to at hire.
- **No new meeting tracker required right now**: rules below operate within the current structure.

---

## Proposed Rule Changes (keep payout table the same)

### 1) “Pool Ticket” Eligibility (the core anti-sniping rule)

To receive the **Achievement Pool payout** on a “Scheduled Meeting” outcome, the agent must earn a **Pool Ticket** for that **campaign** first.

- **Pool Ticket definition**: complete **N qualifying calls** in the **same campaign** within the last **X hours** (or “since starting today’s block”).
- If the agent schedules a meeting **without** an active ticket:
  - They still receive the normal base payment for “Scheduled Meeting” (per pay table)
  - They **do not** receive the pool payout
  - The pool remains unchanged

**Why this works**
- Preserves “pool goes to the closer.”
- Removes “drive-by” wins: you must actively work the campaign to be eligible.

**Suggested defaults**
- **N (ticket size)**: 10 qualifying calls
- **X (ticket window)**: 8 hours (same day / same shift)

---

### 2) Visibility Gating (reduce sniping without removing the pool)

We do **not** remove the pool from the system, but we reduce how gameable it is.

Recommended:
- **Hide pool value until eligible**:
  - Show: “Pool: Locked — complete N qualifying calls to unlock”
  - Once ticket is earned: reveal pool (or reveal a range; see below)

Optional:
- **Show pool as ranges instead of exact dollars**:
  - “$40–$50”, “$50–$65”, “$65+”

**Why this works**
- Keeps motivation (pool still exists and matters).
- Reduces timing behavior and “pool watching.”

---

### 3) Cooldown After a Pool Win (prevents camping)

After an agent wins the pool on a campaign, their eligibility resets and they must earn a **new ticket** to win again.

Two safe options:
- **Reset-only**: ticket resets immediately after a win (must re-earn N qualifying calls).
- **Reset + time cooldown**: ticket resets and there’s a short cooldown (e.g., 60 minutes) before a new ticket can be earned for that same campaign.

**Why this works**
- Prevents a closer from hovering and repeatedly taking the pot with minimal ongoing participation.
- Still rewards strong closers who keep working.

---

### 4) Simple, Fair Messaging (how to frame it)

Suggested internal phrasing:
- “The pool is designed to reward closers **who are actively working the campaign**, not drive-by wins.”
- “We are keeping the same pay table. We’re only adding **eligibility rules** so the system is fair.”
- “If you’re working the campaign, nothing changes. If you only drop in to snipe, you won’t qualify.”

---

## Policy Knobs (pick these once, document them)

- **Ticket size (N)**: 10 (recommended), or 5/15 depending on call volume.
- **Ticket window (X)**:
  - 8 hours (recommended) for “same shift” behavior
  - 24 hours if you want more flexibility
- **Cooldown**:
  - Reset-only (simpler)
  - Reset + 60 minutes (stronger anti-camping)
- **Qualifying outcomes**: use the same list that currently “contributes to Achievement Pool” in the pay table.

---

## What This Does *Not* Change

- No change to base pay rates ($0.50, $1.50, etc.)
- No change to “Scheduled Meeting earns base + pool” **when eligible**
- No change to “pool is contingent on meeting occurring” (existing rule)
- No profit sharing / assist payouts

---

## Expected Outcomes

- **Sniping declines**: closers must demonstrate real activity in the campaign to win pool.
- **Morale improves**: “fair shot” and clear rules reduce resentment.
- **Performance remains aligned to appointments**: closers still win the pool; the only change is eligibility through participation.


