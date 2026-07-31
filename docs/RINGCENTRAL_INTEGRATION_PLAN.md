# RingCentral Call-Log Integration — Plan & Architecture

**Goal:** Continuously pull RingCentral call records into our system so that paid call outcomes (especially **"Spoke – Declined"** and scheduled meetings) can be **automatically verified against a real, connected call** — long-term, hands-off.

**Guiding policy (important):** Validation is **prospective**. It takes effect from a published **effective date**, after agents are told that declines are validated against the phone system. We do **not** retroactively claw back pay from before that date. Early on, mismatches **flag for review** rather than auto-zeroing pay (matching is ~95%+, not perfect).

---

## How hard is this? Short answer: moderate, and the data model helps

The matching logic is **already built and proven** — it's the same algorithm used in the Clarissa evidence export (normalize phone to 10 digits + time window + DST-aware timezone). The real work is the **auth/app setup**, the **agent ↔ extension mapping**, and a **scheduled incremental sync**.

The big win: RingCentral has a **Call Log Sync API** designed exactly for "keep a local copy up to date." It returns a **`syncToken`**; each run does an incremental sync (only new/changed records) instead of re-downloading everything.

**Estimated effort:** ~**2–4 focused days** to build + test the sync, storage, and verification pass. Ongoing run cost is minimal.

---

## Architecture

```
RingCentral Call Log Sync API
        │  (JWT server-to-server auth, incremental syncToken)
        ▼
[ Scheduled sync job ]  ── stores ──▶  Firestore: ringcentral_calls
   (Cloud Function on a timer,                     { id, extensionId, fromNumber,
    or a small Node cron script)                     toNumber10, startTimeUtc,
        │                                            durationSec, result, direction }
        ▼
[ Verification pass ]  ── reads ──▶  campaign_call_tracking / phone_activities
   for each PAID outcome after effectiveDate:
     find a matching RC call (toNumber10 + |Δtime| ≤ 15 min)
     write back: callVerified (bool), rcDurationSec, rcResult, verifiedAt
        │
        ▼
[ Pages & payroll ]  read callVerified to include / flag (prospective only)
```

### Components

1. **RingCentral app** — type **Server-only (no UI)**, **JWT / server-to-server** auth (self-refreshing, no human login). Scopes: `ReadCallLog`, `ReadAccounts`. Store the JWT credential + client id/secret as server secrets (never in client code).

2. **Sync job** — calls the **Call Log Sync API** (`/restapi/v1.0/account/~/extension/~/call-log-sync` per extension, or account-level), persists the returned `syncToken` (e.g., in a `ringcentral_sync_state` doc), and upserts each record into `ringcentral_calls` keyed by RC record `id`. Run on a timer (hourly is plenty; can be tighter).

3. **Agent ↔ extension map** — add `ringcentralExtensionId` (and/or DID) to each `teamMembers` record. Our call log already labels the extension (e.g., `"109 - Clarissa Baker"`), so this is a straightforward one-time mapping.

4. **Verification pass** — for each paid outcome with `timestamp >= effectiveDate`, look up `ringcentral_calls` by `toNumber10` within ±15 min of the logged time; set:
   - `callVerified: true/false`
   - `rcDurationSec`, `rcResult` (e.g., "Call connected", "Hang Up")
   - `verifiedAt`
   Optionally classify: declined with `durationSec <= 8` → `needsReview: true`.

5. **Consumers** — Call Manager, My Performance, Your Overview, and payroll read `callVerified` / `needsReview`. **Prospective only:** records before `effectiveDate` are treated as verified-by-default (benefit of the doubt).

---

## Data we store per RC call (`ringcentral_calls`)

| Field | Example | Use |
|------|---------|-----|
| `id` | RC record id | de-dupe / upsert key |
| `extensionId` | `109` | map to agent |
| `fromNumber` | `+13854985442` | sanity / agent line |
| `toNumber10` | `8598660781` | match key |
| `startTimeUtc` | ISO | time-window match |
| `durationSec` | `56` | detect too-short connects |
| `result` | `Call connected` / `Hang Up` / `Voicemail` | context |
| `direction` | `Outbound` | filter to outbound only |

---

## Matching rules (reuse the proven logic)

- Normalize both sides to the **last 10 digits**.
- A logged outcome is **verified** if there's an outbound RC call to the same `toNumber10` within **±15 minutes** of the logged time.
- **Timezone:** RingCentral timestamps are local; convert with a **DST-aware Mountain offset** (UTC-7 MST / UTC-6 MDT). (Already handled in the evidence script.)
- **Too-short connects:** a verified call with `durationSec <= 8` on a "spoke-*" outcome → `needsReview` (likely a disconnect/automated message that should've been "Bad Number").

---

## Caveats — why it should *flag*, not auto-deny (at first)

Matching is strong but not perfect. Legitimate reasons a real call might not match:
- **Click-to-dial vs. manual dial** on another device or cell phone.
- **Transfers / forwarded calls** logged under a different leg.
- **IVR / very short connects** that are real attempts.
- **Clock skew / edge-of-window** timing.

So: start with **human-in-the-loop** (flag `needsReview`, show it in Call Manager), watch the false-positive rate, and only move to automatic exclusion once the match rate is trusted.

---

## Rollout sequence

1. Create the RingCentral server app (JWT auth); store secrets.
2. Build + test the sync job against a small date range; confirm `ringcentral_calls` populates and `syncToken` resumes correctly.
3. Map `ringcentralExtensionId` onto `teamMembers`.
4. Build the verification pass; backfill-verify a recent window to measure match rate.
5. **Announce the effective date** to agents ("declines are now validated against the phone system").
6. Turn on `needsReview` flagging in Call Manager; review for a couple of weeks.
7. Once trusted, let payroll treat unverified post-effective-date declines as non-payable.

---

## Interim measure (until this is live)

See the calling page change shipped alongside this plan: an agent must **actually place the call** (use the in-app dialer) before a paid "spoke-*" outcome can be logged. It's a deterrent, not proof — RingCentral verification above is the durable solution.
