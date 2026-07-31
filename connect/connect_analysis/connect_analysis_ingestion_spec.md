# Connect Success Model — Website Ingestion Spec

## 1. What this data is

Weekly analysis of LinkedIn outreach performance for CareLuminate's clients. For every **client** and every **hypothesis group** (target segment) within a client, it reports the outreach funnel, the statistically-tested "keys to success" (what's working / not working), deep research breakdowns, and the recurring phrases used. The goal is a client-facing page that shows, per client and per hypothesis group, *what is driving connections and meetings and what to do more of.*

Companion files (hand these to the web builder alongside this spec):

- `connect_analysis.schema.json` — JSON Schema (Draft-07) for validating any run.
- `connect_analysis.types.ts` — TypeScript types for typechecked rendering.

## 2. Where to fetch it (Firebase Realtime Database)

- `ConnectAnalysis/latest` → the most recent full run (**render this by default**)
- `ConnectAnalysis/runs/<YYYY-MM-DD>` → historical snapshots (for a "view past week" picker)
- `ConnectAnalysis/index/<YYYY-MM-DD>` → `{ last_run, updated_at }` lightweight pointers for building a run picker

Fetch `latest`, render, and optionally offer the run picker from the `index` node. A static file (e.g. `Connect_Analysis_<date>.json`) can be used for local development, but production should read live from Firebase so it auto-updates weekly.

## 3. Top-level structure

```json
{
  "meta":   { ... },
  "overall": { <segment> },
  "model_quality": { ... },
  "clients": {
    "<client_slug>": {
      <segment fields>,
      "hypothesis_groups": {
        "<hypothesis_group_slug>": { <segment> }
      }
    }
  }
}
```

- `overall` is the same shape as any segment — all clients combined. Good for a landing/summary view.
- `clients` is keyed by a URL-safe slug (e.g. `blue_goat_cyber`). Each client segment additionally contains `hypothesis_groups`, keyed by slug.
- **Navigation model:** Client picker → Hypothesis-group picker → segment dashboard. The client node itself is also a valid segment (aggregate across all its hypothesis groups).

### `meta`
```json
{
  "generated_at": "2026-07-11T21:15:03",
  "run_date": "2026-07-11",
  "source_file": "probit_dataset_2026-07-11.xlsx",
  "n_contacts": 36592,
  "n_clients": 13,
  "blend_weights": { "connected": 0.15, "replied": 0.35, "scheduled": 0.50 },
  "ai_scored": true
}
```

### `model_quality`
```json
{
  "n_total": 36592,
  "rf_fitted": ["connected","replied","scheduled"],
  "top_drivers": [ { "feature": "log_connections", "importance": 0.0123, "outcome": "replied" }, ... ]
}
```
`top_drivers` = the strongest predictive features from the random-forest model, per outcome. Useful for a global "what predicts success" panel. Feature names are internal (snake_case); humanize them for display.

## 4. The `<segment>` object (the core unit)

```json
{
  "name": "Blue Goat Cyber",
  "id": "overall | hypothesis_group_id | slug",
  "sufficient_data": true,
  "funnel": { ... },
  "trend": [ ... ],
  "keys": { "working": [ ... ], "not_working": [ ... ] },
  "research": { ... },
  "examples": { "meetings_won": [ ... ], "high_potential_open": [ ... ] }
}
```

**IMPORTANT:** If `sufficient_data` is `false`, the segment has too few contacts (< 40) for reliable analysis. In that case only `funnel` and `trend` are present, plus a `note` string. **The UI must check `sufficient_data` and hide the keys/research/examples panels when it's false**, showing the `note` instead.

### `funnel`
```json
{
  "n": 2175, "connected": 485, "replied": 57, "scheduled": 11,
  "connect_rate": 22.3,      // % of contacts who accepted the connection
  "reply_rate": 2.6,         // % who replied
  "meeting_rate": 0.51,      // % who scheduled a meeting (2 decimals)
  "cond_reply_rate": 11.8,   // % of CONNECTED who replied
  "cond_meeting_rate": 19.3, // % of REPLIED who scheduled
  "blended_score": 3.4       // headline KPI (see glossary)
}
```
All `*_rate` values are already percentages (`22.3` = 22.3%). Render with a `%`. Use `blended_score` as the single headline number, and the funnel counts (`n → connected → replied → scheduled`) as a funnel/bar visual.

### `trend`
Array, one entry per month, oldest→newest — drive a line chart:
```json
[ { "month": "2026-01", "n": 320, "connect_rate": 21.0, "reply_rate": 3.1, "meeting_rate": 0.6 }, ... ]
```

### `keys` — the "keys to success" (headline insight)
Two arrays, `working` and `not_working`, each sorted strongest-first (max 10 each). Each item:
```json
{
  "label": "Message is mostly about the prospect",
  "category": "Personalization",
  "outcome": "replied",              // which funnel stage this affects
  "effect_pp": 3.2,                  // ← THE number to show (see below)
  "overall_effect_pp": 2.1,          // same effect measured across ALL data (benchmark)
  "rate_with": 7.8,                  // outcome rate when the signal is present (%)
  "rate_without": 4.6,               // outcome rate when absent (%)
  "n_with": 210, "n_without": 640,
  "p_value": 0.012,
  "connection_controlled": true,
  "confidence": "High"               // "High" | "Medium" | "Low"
}
```
- `effect_pp` is the **connection-adjusted, empirical-Bayes-shrunk** change in the outcome rate, in **percentage points**. Read as: "having this trait changes the `outcome` rate by `effect_pp` points." Show as `+3.2 pp` (green) for working, `-2.4 pp` (red) for not_working.
- Show `confidence` as a badge. Prefer surfacing `High`/`Medium` prominently; de-emphasize `Low`.
- `connection_controlled: true` means the effect is adjusted for the prospect's LinkedIn connection count (avoids the spurious "well-connected people reply more" effect) — worth a small "controlled for network size" tooltip.
- Use `label` + `category` for display; group by `category` if you like (categories include Personalization, AI feel, Tone, Hook, Reason, Message craft, Audience, Follow-up — the "Personalization" category now covers both about-them-vs-us focus (`company_vs_prospect`) and the newer personal-sharing specificity signal (`personal_sharing`); disambiguate by label wording if you need to link a card to a specific research dimension).

### `research` — deep-dive breakdowns

Most sub-fields are arrays of `{ level, n, connect_rate, reply_rate, meeting_rate }` (a rate table you can render as a sorted bar chart). These are: `reason_to_connect`, `hook_type`, `tone`, `question_type`, `opener_type`, `message_type`, `message_length`, `readability`, `personal_sharing`, `connect_phrasing`, `exclamation_use`, `emoji_use`, `abbreviation_use`, `day_of_week`, `time_of_day`, `day_time`, `by_connections`, `total_messages`, `audience_seniority`, `audience_org_type`, `bdr_performance`.

- `time_of_day` has exactly 6 levels, always emitted in this chronological order (do not re-sort): `Early morning (5-8a)`, `Morning (9-11a)`, `Afternoon (12-2p)`, `Late afternoon (3-5p)`, `Evening (6-9p)`, `Overnight (10p-4a)`. Times are US Central. Render as a bar chart of `reply_rate`/`meeting_rate` by bucket, same as any other rate table — do not sort. **Note:** this (and `day_of_week`/`day_time`) is built from first-message/outreach dates, which mostly track acceptance/reply timing rather than when the request was actually sent — see `request_time_of_day` below for the true send-time signal.
- `day_time` is the day × time-of-day cross (up to 42 rows: 7 days × 6 parts), with `level` = `"{Day} {Part}"` (e.g. `"Monday Afternoon"`), where `Part` matches `time_of_day`'s levels minus the parenthetical time range (e.g. `Early morning (5-8a)` → `Early morning`). Best rendered as a day × part-of-day heatmap; many cells are sparse, so either dim/hatch low-n cells or filter rows below some `n` threshold (e.g. `n < 20`) before treating them as meaningful.
- `request_day_of_week`, `request_time_of_day`, `request_day_time` — **"Best time to send the connection request."** Same shapes/levels as `day_of_week`/`time_of_day`/`day_time` respectively, but built from `conn_request_sent` — when the connection request was actually **sent** (converted to US Central) — rather than first-message/outreach dates. This is the true "when should the invite land?" signal. **Rank/sort these three by `connect_rate` (acceptance), not `reply_rate`** — accepting the invite is the outcome send-time actually influences. Suggested UI: a "Best time to send" card near the existing timing charts — render `request_day_of_week` and `request_time_of_day` as bar charts sorted by `connect_rate` with `n` labeled on each bar and the top bar highlighted as the recommended slot; optionally render `request_day_time` as a weekday × time-of-day heatmap (cell color = `connect_rate`, tooltip = `n` + all three rates) to surface the single best day+time window. De-emphasize low-n rows same as everywhere else. Empty/absent if `conn_request_sent` wasn't available for a segment — fall back to the existing `day_of_week`/`time_of_day`/`day_time` charts in that case (labeled as a fallback, since it reflects a different, less precise signal).
- `message_length` now uses 25-character bands, always emitted in ascending chronological order (do not re-sort): `1-25`, `26-50`, `51-75`, `76-100`, `101-125`, `126-150`, `151-175`, `176-200`, `201-225`, `226-250`, `251+`. With 11 bins, the high-character buckets can be low-n in narrow client/hypothesis-group segments — render as an ordered bar chart and consider de-emphasizing (fading/hatching) bars below some `n` threshold.
- `personal_sharing` — **AI-scored** (new field). How specific the personal detail the sender shares about themselves is. 3 levels, in this order: `Unique` (a distinctive personal detail/shared experience — same hometown, same school, a named shared hobby), `Generic` (a vague claim anyone could make — "I have deep experience in…"), `None` (nothing personal). Because it's AI-scored, it stays blank/absent until a full AI re-scan has been run (cached rows don't get retroactively scored).
- `connect_phrasing` — regex-based (non-AI), so it populates on any normal re-run with no re-scoring needed. Classifies what the first message says about connecting into one of 8 levels: `Let's connect`, `Worth connecting`, `Would love to connect`, `Open to connecting`, `Happy to connect`, `Would like to connect`, `Other connect ask`, `No connect ask`.
- `exclamation_use` / `emoji_use` — regex-based counts on the first message, each with 3 levels in this order: `None`, `One`, `Multiple (2+)`. `emoji_use` includes flag emoji.
- `abbreviation_use` — regex-based (word-boundary matched) detection of informal/texting shorthand (`lol`, `btw`, `fyi`, `asap`, `u`, `ur`, `gonna`, `dm`, etc — deliberately excludes standard business abbreviations and ambiguous single letters). 2 levels: `Uses abbreviations`, `No abbreviations`.

Special-shaped sub-fields:
```json
"company_vs_prospect": {
  "avg_pct_about_prospect": 58.2,
  "avg_pct_about_us": 31.4,
  "by_focus_bucket": [ { "bucket": "51-75%", "n": 120, "reply_rate": 6.1, "meeting_rate": 1.2 }, ... ]
},
"ai_feel": {
  "avg_ai_score": 3.1,          // 1 = clearly human … 5 = obviously AI
  "by_ai_score": [ { "ai_score": 2, "n": 90, "reply_rate": 7.0, "meeting_rate": 1.5 }, ... ]
},
"followup": {
  "n_replied": 57,
  "avg_reply_enthusiasm": 3.4,   // warmth of prospect's reply, 1–5
  "by_approach":    [ { "approach": "PushedForMeeting", "n": 20, "meeting_rate": 30.0 }, ... ],
  "by_speed":       [ { "speed": "Same day", "n": 12, "meeting_rate": 25.0 }, ... ],
  "by_reply_length":[ { "level": "Short (40-120)", "n": 18, "reply_rate": ..., "meeting_rate": ... }, ... ]
},
"top_phrases": {                 // phrases ranked by their measured effect on reply rate
  "working":     [ { "phrase": "saw your recent post", "n": 140, "reply_rate_with": 6.2,
                     "reply_rate_without": 4.1, "effect_pp": 2.1, "connection_controlled": true, "p_value": 0.03 }, ... ],
  "not_working": [ ... ]
},
"key_phrases": {                 // the multi-word phrases you SAY A LOT, categorized
  "opening":  [ { "phrase": "would love to connect", "count": 395, "pct_of_messages": 49.0,
                  "category": "Meeting ask", "lift_pp": 2.0, "lift_outcome": "reply",
                  "connection_controlled": true }, ... ],
  "followup": [ { "phrase": "times that work to connect", "count": 53, "pct_of_messages": 35.0,
                  "category": "Meeting ask", "lift_pp": 4.7, "lift_outcome": "meeting",
                  "connection_controlled": true }, ... ]
}
```
- `top_phrases` = phrases surfaced *because they move the reply rate* (best/worst).
- `key_phrases` = the phrases you *use most*, deduped to distinct phrases, tagged by intent (`Meeting ask`, `About the prospect`, `About us`, `Compliment / reaction`, `Gratitude`, `Other`), with `lift_pp` = connection-controlled effect on the relevant outcome (`reply` for openers, `meeting` for follow-ups). `pct_of_messages` = how often the phrase appears. Great for a "phrases we lean on — and whether they help" panel, split by `category`.

### `research.style_examples` (real messages behind every research breakdown)

`style_examples` gives the real messages behind each level of a research dimension, so the UI can show a "See examples" expander per level and a side-by-side "Compare two styles" view. It covers every dimension that has a rate-table breakdown above, keyed identically: `tone`, `hook_type`, `reason_to_connect`, `opener_type`, `question_type`, `message_type`, `message_length`, `readability`, `personal_sharing`, `connect_phrasing`, `exclamation_use`, `emoji_use`, `abbreviation_use`, `day_of_week`, `time_of_day`, `day_time`, `request_day_of_week`, `request_time_of_day`, `request_day_time`, `by_connections`, `total_messages`, `audience_seniority`, `audience_org_type`, `bdr_performance`, `ai_feel`, `company_vs_prospect`.

```json
"style_examples": {
  "tone": [
    {
      "level": "genuine",
      "n": 17080, "reply_rate": 4.5, "meeting_rate": 0.79,
      "examples": [
        { "message": "Saw your recent post about...", "outcome": "Meeting", "opportunity": 88 },
        { "message": "...", "outcome": "Replied", "opportunity": 61 },
        { "message": "...", "outcome": "Connected", "opportunity": 34 },
        { "message": "...", "outcome": "No response", "opportunity": 12 }
      ]
    },
    { "level": "salesy", "n": 2552, "reply_rate": 4.8, "meeting_rate": 1.21, "examples": [ ... ] }
  ],
  "hook_type": [ ... ],
  "reason_to_connect": [ ... ],
  "opener_type": [ ... ],
  "question_type": [ ... ]
}
```

- Each dimension is an **array of per-level rows** — same array-of-rows shape as every other `research.<dimension>` rate-table, not a map. Each row's `level` string must equal the RAW key used by that dimension's breakdown so the UI can join them — for most dimensions that's `research.<dimension>[i].level` directly, but two dimensions use a different raw key than their display label:
  - `ai_feel`: rows in `research.ai_feel.by_ai_score` use a numeric `ai_score` (1–5) — the matching `style_examples.ai_feel[i].level` must be that same value as a string, e.g. `"5"` for score 5 (5 = heavy/obvious AI, 1 = clearly human).
  - `company_vs_prospect`: rows in `research.company_vs_prospect.by_focus_bucket` use `bucket` (e.g. `"76-100%"`) — the matching `style_examples.company_vs_prospect[i].level` must equal that exact bucket string, not a display label like "76-100% about them."
- `n` / `reply_rate` / `meeting_rate` on each level are optional convenience copies of the same numbers already in `research.<dimension>`; if omitted, the UI falls back to the rate-table row for that level.
- `examples` is capped at a handful per level (5 is a good default) and **must be ordered best-outcome-first** — the first example of each level is shown as that level's "strongest example."
- `outcome` is one of `"Meeting"`, `"Replied"`, `"Connected"`, `"No response"` — the best outcome that particular contact reached.
- `opportunity` is the same model-scored 0–100ish opportunity used in top-level `examples`; may be `null`.
- `message` is real prospect-facing text (same privacy caveat as top-level `examples` — truncate similarly and scope per-client).
- Optional field: segments with `sufficient_data: false` omit it along with the rest of `research`. It's fine for a dimension or level to be absent if there weren't enough examples captured.

### `examples`
```json
{
  "meetings_won":        [ { "contact","title","company","message_type","opportunity","message" }, ... up to 5 ],
  "high_potential_open": [ ... up to 5 ]  // connected, not yet scheduled, high model score
}
```
`opportunity` = model-scored 0–100ish opportunity. `message` is truncated to 500 chars. **Contains real prospect names and message text** — see caveats about privacy.

### `message_prompt` (optional — AI-generated message-writing prompt)
```json
"message_prompt": "You are writing LinkedIn connection requests for... \n\nDO:\n- ...\n\nDON'T:\n- ...\n\n..."
```
A single ready-to-use prompt, generated once per run by handing the segment's funnel/keys/top-performing-levels/winning-examples to a strong model (Opus via OpenRouter). Written to be pasted directly into an AI tool to draft new outreach messages tuned to what works for that exact client × hypothesis group — includes do's/don'ts, required personalization, structure, length target, best connect-ask wording, and a few worked examples.
- Plain string (not JSON-structured) — render as a **copyable block** (monospace, preserve line breaks) with a "Copy prompt" button, e.g. under a "Generate messages for this segment" heading.
- Optional: present only when the run had `build_prompts` enabled *and* the segment had `sufficient_data`. Absent otherwise — don't render an empty prompt panel.
- Independent of `run_ai` — it can be (re)generated from already-cached analysis without re-scoring messages, so it may be present/updated even between AI re-scans.

## 5. Glossary (for tooltips / methodology page)

- **blended_score** — headline KPI = `0.15 × connect_rate + 0.35 × reply_rate + 0.50 × meeting_rate` (rates in %). Weights meetings most, but rewards early-funnel health. Higher is better.
- **pp (percentage points)** — the unit for `effect_pp` / `lift_pp`. A move from 4% to 6% is `+2 pp`.
- **connection_controlled** — the effect is statistically adjusted for the prospect's LinkedIn connection count, so it isn't just "popular people reply more."
- **empirical-Bayes shrinkage** — small segments are pulled toward the global average so tiny samples don't produce wild claims. `effect_pp` is the shrunk (trustworthy) value; `overall_effect_pp` is the all-data benchmark.
- **confidence** — `High` (p<0.05, solid sample), `Medium` (p<0.10), `Low` (weak/suggestive).
- **cond_reply_rate / cond_meeting_rate** — conditional rates (replied among connected; scheduled among replied).

## 6. Recommended page design

1. **Header:** client + hypothesis-group selector; show `meta.run_date`.
2. **Funnel hero:** big `blended_score`, then the `n → connected → replied → scheduled` funnel with rates.
3. **Trend line chart** from `trend`.
4. **Keys to Success:** two columns — "What's working" (green, `keys.working`) and "What to fix" (red, `keys.not_working`), each card showing `label`, `+/‑ effect_pp pp`, and a `confidence` badge. This is the star of the page.
5. **Research accordions:** render each `research` rate-table as a small sorted bar chart (personalization, AI feel, hook, tone, reason, personal sharing, connect phrasing, exclamation/emoji/abbreviation use, timing, audience, BDR performance, message length/readability). Each row's rate-bar **thickness** (not just its width) is scaled by that row's `n` (sqrt-scaled against the largest `n` in the table) so a reader can tell "big effect, tiny sample" apart from "big effect, real volume" at a glance — width still encodes the rate, thickness encodes confidence-via-volume.
6. **Phrases panel:** tabs for "Phrases that work" (`top_phrases`) and "Phrases we use most" (`key_phrases`, grouped by `category`, opening vs follow-up).
7. **Follow-up panel:** from `research.followup`.
8. **Examples:** cards for `meetings_won` and `high_potential_open`.
9. **AI message-writing prompt:** if `message_prompt` is present, show a copyable "Generate messages for this segment" block near the Keys to Success section — it's the direct, actionable output of everything else on the page.
10. **Export to PowerPoint:** an "Export PowerPoint" button (implemented client-side with PptxGenJS, no backend involved) builds a comprehensive, well-formatted `.pptx` of the currently-selected segment (whichever sections apply given `sufficient_data`/`TREND_MIN_N`/etc.):
    - Cover slide, executive summary (funnel/blended score), trend (if shown), keys to success (up to 8 per side), best time to send, and a quick-reference "winning style cheat-sheet."
    - **A full breakdown slide for every entry in the research dimension list** (the same set/order/groups that drive the site's Deep-Dive Research accordions — Message Craft, Timing & Volume, Audience & Team), each preceded by a section-divider slide. Every level of the dimension is shown (ranked by rate, or in the data's natural order for ordinal dimensions like `message_length`/`time_of_day`), with bar thickness encoding volume (`n`) the same way the on-page tables do, plus the single strongest real example message for whichever level performs best. `day_time` (and `request_day_time`) render as an actual day × time-of-day heatmap table rather than a 42-row list. Sprawling non-ordinal breakdowns (e.g. `bdr_performance` with 20+ BDRs at the Overall level) are capped at 12 rows per slide with a "+N more" note rather than becoming unreadable.
    - Top phrases (up to 8 per side), real examples (up to 3 each for Meetings Won and High-Potential Open, as separate slides), and the AI prompt.
    - It reuses the exact same data-gating rules as the on-page rendering, so the deck never shows anything the page itself wouldn't show for that segment. No schema/type changes were needed for this — it's a pure presentation layer on top of the existing payload.

## 7. Data caveats (build these in)

- **Always gate on `sufficient_data`.** Many hypothesis groups fall below the 40-contact threshold and will only have `funnel` + `trend` + `note`. Don't render empty keys/research panels.
- **Small-segment anomalies:** e.g. an `Unassigned` client (n=15) may show a 100% meeting rate — pure noise from tiny n. Because n<40 its `sufficient_data` is `false`, so it's already flagged; consider hiding `Unassigned` entirely or labeling it "unclassified / insufficient data."
- **Cold-outreach rates are low by nature** (reply ~2–6%, meeting <1% is normal). Frame metrics relatively (vs. the client's own trend and vs. `overall`), not against generic web-conversion expectations.
- **Rounding/nulls:** rates are pre-rounded; any missing/undefined numeric is `null` — handle `null` gracefully.
- **Privacy:** `examples` include real contact names and message text. Recommend each client only sees their **own** `clients.<their_slug>` subtree, and decide whether to expose named examples in client-facing reviews.
- **`personal_sharing` may be temporarily empty:** it's a new AI-scored field — cached rows don't have it, and the incremental scoring gate won't retroactively re-score them, so `research.personal_sharing` (and its `style_examples`) can be absent/all-null until a full AI re-scan has been run. Render it the same as any other optional dimension (skip gracefully if absent) rather than treating it as an error.
