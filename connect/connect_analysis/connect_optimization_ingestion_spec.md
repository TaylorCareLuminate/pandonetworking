# Connect Hypothesis Optimizer — Website Ingestion Spec

## 1. What this data is

A companion run to the main Connect Success Model. Instead of analyzing *everything*, it scans every client × hypothesis-group combination, flags the ones that are **currently active but underperforming** (real send volume this week, but too few meetings scheduled recently), and for each flagged group runs a 3-step "Hypothesis Search":

1. **Opus reads** that group's 250 most-successful and 250 least-successful conversations and proposes ~8 new, concrete, controllable-factor hypotheses (things the sender/BDR controls — phrasing, structure, personalization, call-to-action style — not things like the prospect's industry or network size).
2. **A low-cost model classifies** every message in scope against all 8 hypotheses at once.
3. **Statistics confirm** which hypotheses actually move the needle (connection-controlled effect size + significance), the same methodology as the main model's `keys`.

Each flagged group's existing statistical baseline (from the main model), a time-series check for a recent downturn, and the confirmed Hypothesis Search findings are then all fed back to Opus, which writes ready-to-use **"message review instructions"** — a concrete checklist a human or an AI can run against any draft message for that exact client × group before it's sent.

**This is a diagnostic/action tool, not a dashboard of everything** — it only ever contains the groups that need attention *right now*. Most client × group combinations won't appear in a given run at all (that's normal and good).

## 2. Where to fetch it (Firebase Realtime Database)

Same database as the main Connect Analysis (`healthcareitdatabase-default-rtdb`), different top-level node:

- `ConnectOptimization/latest` → the most recent run (**render this by default**)
- `ConnectOptimization/runs/<YYYY-MM-DD>` → historical snapshots
- `ConnectOptimization/index/<YYYY-MM-DD>` → `{ last_run, updated_at }` lightweight pointer

### Local repo drop (alternative to Firebase)

Each run also writes the same payload as static files at `connect/connect_optimization/`:

- `connect/connect_optimization/latest.json` → most recent run (**render this by default**)
- `connect/connect_optimization/runs/<YYYY-MM-DD>.json` → historical snapshots
- `connect/connect_optimization/index.json` → `{ "last_run": "...", "updated_at": "...", "runs": [...] }`

Same shape either way; production should read live from Firebase so it auto-updates.

## 3. Top-level structure

```json
{
  "meta": {
    "generated_at": "2026-10-14T13:47:32",
    "run_date": "2026-10-14",
    "source_run_date": "2026-10-13",
    "ai_scored": true
  },
  "config": {
    "active_window_days": 7, "active_min_messages": 50,
    "underperf_window_days": 14, "underperf_max_scheduled": 2,
    "hs_n_success": 250, "hs_n_failure": 250,
    "opus_model": "anthropic/claude-opus-5.5", "cheap_model": "qwen/qwen3.7-flash"
  },
  "n_groups_scanned": 562,
  "n_groups_flagged": 17,
  "clients": {
    "<client_slug>": {
      "name": "AFIN",
      "hypothesis_groups": {
        "<hypothesis_group_slug>": { "...": "see §4" }
      }
    }
  }
}
```

- `source_run_date` is the `run_date` of the main Connect Analysis run this optimizer run's statistical baseline (`baseline` below) was pulled from — useful as a "baseline as of" caption.
- `n_groups_scanned` / `n_groups_flagged` give you a one-line "scanned 562 groups, 17 need attention" summary stat for a header or methodology tooltip.
- **If `n_groups_flagged` is 0, `clients` is an empty object** — render a clean "nothing flagged this run — all active groups are performing within range" empty state rather than a blank page.
- `clients` is keyed by slug exactly like the main Connect Analysis payload — **only clients with at least one flagged group appear here** (this is a strict subset of the main payload's `clients`).

## 4. The hypothesis-group object (the core unit)

```json
{
  "name": "401k_plans",
  "id": null,
  "status": "ok",
  "flag": { "...": "see §4a" },
  "baseline": { "...": "see §4b" },
  "time_series": { "...": "see §4c" },
  "hypothesis_search": { "...": "see §4d" },
  "message_review_instructions": "# Message Review Instructions: ...\n\n## 1. What Is Going Wrong\n..."
}
```

- `status` is `"ok"` for a fully-completed group. **Check it first** — a group can also be `"error"` (something threw; only `name`/`status`/`error_message` are present — show a "this group's analysis failed this run" note and skip the rest). Always code defensively around missing/empty sub-blocks even when `status` is `"ok"` (e.g. `hypothesis_search.status` can itself be a non-`"ok"` value — see §4d).
- `message_review_instructions` is **Markdown text**, AI-written, meant to be rendered directly (headers, bold, numbered lists) — this is the single most important field on the page: it's the ready-to-use checklist. Render it as a Markdown block, probably the most prominent panel on the page.
- `id` is currently always `null` (reserved for a future stable hypothesis-group ID); use the slug key for navigation/routing.

### 4a. `flag` — why this group was surfaced

```json
{
  "reason": "159 messages sent in the last 7 days (>= 50 threshold) but only 0 meeting(s) scheduled in the last 14 days (< 2 threshold).",
  "n_messages_active_window": 159, "active_window_days": 7, "active_min_messages": 50,
  "n_scheduled_underperf_window": 0, "underperf_window_days": 14, "underperf_max_scheduled": 2
}
```
`reason` is a ready-made, human-readable sentence — use it directly as the card's subtitle/explanation ("why is this here?"). The numeric fields are the same data pre-parsed, for building your own phrasing or a small "159 sent / 0 scheduled" stat pair.

### 4b. `baseline` — reuses the main Connect Analysis shapes exactly

```json
{
  "funnel": { "n": 2175, "connected": 485, "replied": 57, "scheduled": 11, "connect_rate": 22.3, "reply_rate": 2.6, "meeting_rate": 0.51, "...": "..." },
  "keys": { "working": [ "...KeyItem, see main spec §4..." ], "not_working": [ "..." ] },
  "top_phrases": { "working": [ "...phrase row, see main spec §4..." ], "not_working": [ "..." ] },
  "global_rf_top_drivers": [ { "feature": "log_connections", "importance": 0.0123, "outcome": "replied" }, "..." ]
}
```
**These are copy-pasted straight out of that same client/group's node in the main `ConnectAnalysis` payload** (`funnel`, `keys`, `research.top_phrases`), as of `meta.source_run_date`. **If you've already built the Keys-to-Success cards and phrase panels for the main Connect Analysis page, reuse those exact same components here unchanged** — the shapes are identical (`KeyItem` with `label`/`category`/`effect_pp`/`confidence`/etc.; phrase rows with `phrase`/`effect_pp`/`n`/etc.). See the main `connect_analysis_ingestion_spec.md` §4 for the full field reference. `global_rf_top_drivers` is the subset of the main payload's `model_quality.top_drivers` for the connect/reply/scheduled outcomes (not the message-2/3+ variants) — optional context, not essential to render.

Any of `keys.working`/`keys.not_working`/`top_phrases.working`/`top_phrases.not_working` can be an empty array — treat that the same as the main spec's `sufficient_data: false` guidance (just don't render an empty panel).

### 4c. `time_series` — recent performance vs. this group's own trailing baseline

```json
{
  "sufficient_data": true,
  "n_weeks_available": 14,
  "weekly": [ { "week": "2026-07-06", "n": 120, "connect_rate": 21.0, "reply_rate": 3.1, "meeting_rate": 0.6 }, "..." ],
  "recent_weeks": ["2026-10-05", "2026-10-12"],
  "baseline_weeks": ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"],
  "connect_rate_check": { "recent_rate": 18.2, "baseline_rate": 22.1, "effect_pp": -3.9, "p_value": 0.21, "is_downturn": false },
  "reply_rate_check":   { "recent_rate": 1.1,  "baseline_rate": 2.6,  "effect_pp": -1.5, "p_value": 0.04, "is_downturn": true },
  "is_downturn": true
}
```
- `weekly` → a line chart (same shape as the main spec's `trend`, but weekly instead of monthly, and keyed by ISO week-start date instead of `"YYYY-MM"`).
- `connect_rate_check` / `reply_rate_check` compare the trailing `recent_weeks` (2 weeks) against the `baseline_weeks` immediately before them (6 weeks) using the same connection-controlled statistics as `keys`. `is_downturn` on either check means that metric fell by a statistically meaningful amount (p<0.10); the group-level `is_downturn` is `true` if **either** metric shows a downturn.
- **If `sufficient_data` is `false`**, only `sufficient_data`, `n_weeks_available`, `weekly` (likely very short or empty), and a `note` string explaining why (too little dated history, or not enough weeks before the recent window) are present — hide the downturn-specific panel and show the `note` instead.
- Recommended treatment: a small red "📉 Recent downturn detected" badge on the group card when `is_downturn` is `true`, with the line chart underneath and the two `*_check` numbers as a tooltip/detail.

### 4d. `hypothesis_search` — the new AI-found patterns, statistically tested

```json
{
  "status": "ok",
  "scope": "group",
  "scope_label": "afin / 401k_plans",
  "n_pool_rows": 764,
  "n_pool_rows_tested": 764,
  "n_success_sampled": 194,
  "n_failure_sampled": 250,
  "hypotheses_generated": [
    "The opener references a post the prospect personally authored (\"your post\"/\"your article\") rather than a company-shared or third-party item.",
    "..."
  ],
  "hypotheses_tested": [
    {
      "id": "H1", "text": "The opener references a post the prospect personally authored...",
      "n_with": 108, "n_without": 656,
      "rate_with": 5.6, "rate_without": 2.1,
      "effect_pp": 1.7, "p_value": 0.3433,
      "connection_controlled": true,
      "confidence": "Low",
      "confirmed": false
    },
    "...7 more, one per hypothesis"
  ],
  "n_confirmed": 4
}
```
- **`status` must be checked before rendering anything else in this block.** Values:
  - `"ok"` — the full search ran; `hypotheses_tested` is populated. Normal case.
  - `"insufficient_data"` — too few success or failure example conversations existed even after falling back to the client/global pool; no hypotheses were generated. Only `status`/`scope`/`scope_label` (and maybe `n_success_sampled`/`n_failure_sampled`) are present.
  - `"generation_failed"` — Opus's hypothesis-generation call failed or returned nothing usable. Same minimal fields as above.
  - `"skipped_dry_run"` — this was a dry run (no AI spend); nothing else is present.
  - For any non-`"ok"` status, show a brief "Hypothesis Search didn't produce results for this group this run (reason)" note instead of the table, and the `message_review_instructions` panel will likely be weaker/absent (it leans on this data).
- **`scope`/`scope_label`** tell you where the tested population came from, since a small group falls back to a wider pool: `"group"` (this exact client × group — the common case), `"client"` (not enough rows in the group alone, so all of this client's groups combined), or `"global"` (not enough at the client level either, so **all clients combined**). **Always surface `scope_label` near the hypothesis table** (e.g. "tested against: afin / 401k_plans" vs. "tested against: all clients combined") — a global-scope result is a much weaker, less specific claim about this one group than a group-scope result, and users should know which they're looking at.
- **`n_pool_rows` vs. `n_pool_rows_tested`**: `n_pool_rows` is the full size of the scope's usable population; `n_pool_rows_tested` is how many of those rows were actually classified and tested — capped at 3,000 for cost/time even when the pool (especially at global scope) is far larger. Show both only if they differ meaningfully (e.g. "tested 3,000 of 95,474 rows (random sample)").
- **`hypotheses_tested` items use the exact same shape as the main spec's `KeyItem`** (`n_with`/`n_without`/`rate_with`/`rate_without`/`effect_pp`/`p_value`/`connection_controlled`/`confidence`), plus `id` (`"H1"`..`"H8"`, stable only within this one run/group — don't use it as a cross-run key), `text` (the full hypothesis statement, AI-written — this is the label), and `confirmed` (boolean — `true` only when `min_arm_n` sample size AND `confidence` is `"High"` or `"Medium"`). **The array can have fewer than 8 items** if Opus's output didn't cleanly parse into exactly 8 numbered lines that run (rare, not an error).
- Outcome tested is always **`replied`** (not `scheduled` — too rare per-hypothesis to test reliably at this stage), unlike the main model's `keys` which spans connected/replied/scheduled.
- `effect_pp` can be **positive or negative** — the hypothesis wording itself may already be phrased as a "don't do X" rule (e.g. "the message does NOT mention..."), so read `text` together with the sign rather than assuming all hypotheses are phrased as "good" behaviors.
- **A hypothesis with `rate_with: 0, rate_without: 0, effect_pp: 0, p_value: null, confidence: "Low"` for literally every item in the group** (this does happen for a few groups) means that specific tested population had **zero replies at all** — there's nothing to measure, not a data error. Treat this the same as `"insufficient_data"` for display purposes: show "no replies in the tested sample — too few data points to test hypotheses" rather than 8 flat "0.0 pp, not confirmed" rows.
- Recommended treatment: a sortable table (sort by `|effect_pp|` descending, which is also the order `.fmt_hyps()` uses internally for the synthesis brief), one row per hypothesis, with a green "✓ CONFIRMED" badge when `confirmed` is `true` and a muted "not confirmed" tag otherwise. `hypotheses_generated` is redundant with `hypotheses_tested[].text` when status is `"ok"` — you don't need to render it separately.

## 5. Recommended page design

1. **Header:** run date (`meta.run_date`), one-line summary stat ("Scanned `n_groups_scanned` groups, `n_groups_flagged` need attention right now").
2. **Flagged-group list:** one card per client × hypothesis-group, title = client name / group name, subtitle = `flag.reason`. Sort by severity if you like (e.g. `time_series.is_downturn` first, or by `flag.n_messages_active_window` descending). Clicking a card opens the group detail view (steps 3–6).
3. **Group detail — "What's going wrong" panel:** `baseline.funnel` + `baseline.keys` (reuse main Connect Analysis components) to show the group's existing, already-known drivers.
4. **Group detail — Time series:** the `time_series.weekly` line chart with a downturn badge if `is_downturn`.
5. **Group detail — Hypothesis Search:** the `hypothesis_search.hypotheses_tested` table (§4d), clearly labeled with `scope_label`.
6. **Group detail — Message Review Instructions:** render `message_review_instructions` as the headline panel — this is the actionable deliverable. Consider a "Copy" button so a BDR/editor can paste it straight into whatever tool reviews drafts.

## 6. Data caveats (build these in)

- **This is a small, dynamic list, not a full catalog** — expect `clients` to be empty or near-empty on a quiet week. Don't build a page that assumes every client/group always appears.
- **Always check `status` before rendering a group or its `hypothesis_search` block** — `"error"`, `"insufficient_data"`, `"generation_failed"`, and `"skipped_dry_run"` are all real, expected outcomes with much less data than `"ok"`, not bugs.
- **Watch for the zero-replies pattern** described in §4d — it's a legitimate "nothing to test" result, not a parsing failure, but it should be displayed as such (not as 8 confirmed-false rows with a misleading 0.0pp effect).
- **`scope` matters for how strong a claim is** — a `"global"`-scope hypothesis result is evidence from all clients' data, not this specific group's, and should be labeled/caveated accordingly in the UI even though it's still the best available evidence when a group is too small to test alone.
- **Privacy:** unlike the main Connect Analysis payload, this one does **not** include per-contact example messages (`examples`/`style_examples`) — everything here is aggregated. No additional privacy handling is needed beyond what the main spec already requires for the `baseline` sub-objects it borrows.
