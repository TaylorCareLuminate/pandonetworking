# Connect Success Model v1 — Full Porting Guide

**Source script:** `Connect/Connect Success Model v1.R` (3,614 lines, R)
**Purpose of this document:** a complete, line-by-line-faithful specification of
what the script does and *why*, written using the actual R code as the
reference implementation, so that a developer who does not know R can port
the entire pipeline into any other language (Python, TypeScript, Go, etc.)
without having to reverse-engineer intent from the original source. Nothing
in the original script is skipped — every section, every function, every
computed column, every output field is covered below. Where the original
code is itself the clearest specification (regexes, AI prompt templates,
JSON shapes), it is quoted verbatim; everywhere else the logic is explained
in prose next to the R that implements it.

This guide assumes the reader knows general programming but not R. Every
R-specific idiom that matters for a faithful port (vectorized NA propagation,
1-based indexing, `dplyr`/tidyverse non-standard evaluation, factors,
PCRE-flavored regex, R's JSON-shape conventions, `<<-`, closures, etc.) is
called out explicitly the first time it appears, and summarized again in
Appendix B.

---

## Table of Contents

1. [What this pipeline does, end to end](#1-what-this-pipeline-does-end-to-end)
2. [Glossary of domain concepts](#2-glossary-of-domain-concepts)
3. [External dependencies a port must supply](#3-external-dependencies-a-port-must-supply)
4. [Top-of-file: `.Renviron` self-heal](#4-top-of-file-renviron-self-heal)
5. [Section 0 — Configuration (`CFG`)](#5-section-0--configuration-cfg)
6. [Section 0b — Libraries + helper bootstrap](#6-section-0b--libraries--helper-bootstrap)
7. [Section 1 — Load + normalize input](#7-section-1--load--normalize-input)
8. [Section 2 — Parse conversation history](#8-section-2--parse-conversation-history)
9. [Section 3 — Non-AI feature engineering](#9-section-3--non-ai-feature-engineering)
10. [Section 4 — AI feature extraction (`lama.batch`) with incremental cache](#10-section-4--ai-feature-extraction-lamabatch-with-incremental-cache)
11. [Section 5 — Blended score + binary signal matrix + feature registry](#11-section-5--blended-score--binary-signal-matrix--feature-registry)
12. [Section 6 — Pooled predictive model (Random Forest + elastic net)](#12-section-6--pooled-predictive-model-random-forest--elastic-net)
13. [Section 7 — Controlled keys-to-success engine](#13-section-7--controlled-keys-to-success-engine)
14. [Section 8 — Phrase analysis (connection-controlled)](#14-section-8--phrase-analysis-connection-controlled)
15. [Section 9 — Assemble website-ready JSON](#15-section-9--assemble-website-ready-json)
16. [Section 9.5 — Message-improvement prompts (Opus via OpenRouter)](#16-section-95--message-improvement-prompts-opus-via-openrouter)
17. [Section 9.6 — De-identified ("blinded") company names](#17-section-96--de-identified-blinded-company-names)
18. [Section 10 — Publish (Firebase) + local save + summary](#18-section-10--publish-firebase--local-save--summary)
19. [Section 11 — Checkpoint (handoff to the Hypothesis Optimizer)](#19-section-11--checkpoint-handoff-to-the-hypothesis-optimizer)
20. [Appendix A — Complete output JSON schema](#appendix-a--complete-output-json-schema)
21. [Appendix B — R idioms a porter must replicate correctly](#appendix-b--r-idioms-a-porter-must-replicate-correctly)
22. [Appendix C — Porting checklist / suggested module layout](#appendix-c--porting-checklist--suggested-module-layout)

---

## 1. What this pipeline does, end to end

**Business purpose:** BDRs (business development reps) send LinkedIn outreach
messages on behalf of client companies, to prospects, grouped by
"hypothesis group" (a targeting/messaging strategy being tested, e.g. a
specific audience + angle combination). Every week, this script ingests the
latest export of that outreach + its outcomes (connected / replied /
scheduled a meeting) and produces a large, nested JSON "keys to success"
report: for every client, and every hypothesis group within every client,
what measurably works and doesn't, broken down dozens of ways (tone, hook,
timing, audience, phrasing, etc.), with real example messages, a predictive
model's variable-importance ranking, and an AI-written prompt instructing a
downstream copywriting AI how to write new messages tuned to what works.
That JSON is published to Firebase (and saved locally / dropped into a
website repo) for a client-facing dashboard.

**End-to-end pipeline (one pass through the script, top to bottom):**

```
1. Load this week's export (Excel/CSV/JSON) -> raw rows, one per prospect (Section 1)
2. Normalize column names to a canonical schema; coerce types; filter out
   known test/internal contacts; flag "surround_connections" rows as
   non-core (limited repeatability, excluded from driver analysis)
3. Parse each row's conversation_history JSON into:
     - first_message / second_bdr_message / prospect_first_reply /
       bdr_reply_after_reply (point-in-time extracts)              (Section 2)
     - 4 SEND-ORDER POSITION buckets: seg_half1, seg_half2, seg_msg2,
       seg_msg3plus (used for "WHERE does X first happen" analyses)
     - 3 REPLY-ROUND LEVELS: msg1_text, msg2_text, msg3_text (used for the
       "3 different models" parallel analysis of the whole conversation,
       anchored to the prospect's 1st/2nd reply, with a scheduling-marker
       truncation step so post-meeting chatter isn't miscounted)
4. Compute ~60 non-AI (regex/arithmetic) features per row, every one of them
   computed identically for Level 1/2/3 text                        (Section 3)
5. Score ~25 AI-classified fields per row via a vendor LLM (5 separate
   prompt templates: first message, follow-up, message-position triple,
   Level-2 content, Level-3 content), with a disk cache keyed by
   (linkedin_url, first_outreach_date) so only new/changed rows cost money (Section 4)
6. Register ~140 candidate binary "signals" (did the message do X?) each
   tagged with a category, a population scope, and a primary outcome
   to be tested against                                             (Section 5)
7. Fit 5 Random Forests (connected/replied/scheduled on all core rows;
   scheduled on Level-2-eligible rows; scheduled on Level-3-eligible rows)
   plus elastic-net logistic regressions for an interpretable coefficient
   view. Produces each row's out-of-bag "opportunity score".        (Section 6)
8. For every signal x every segment (client, hypothesis group, overall),
   estimate a connection-controlled, empirical-Bayes-shrunk effect size on
   the signal's outcome, with trust guards against shrinkage flipping sign
   or crediting zero-event arms                                     (Section 7)
9. Tokenize message text into n-grams; rank phrases by connection-controlled
   reply/meeting lift; separately mine "recurring phrases we say a lot",
   collapse near-duplicate rolling windows, categorize by intent    (Section 8)
10. Assemble one deeply nested JSON object: funnel stats, trend, keys,
    ~25 research breakdowns, audience composition vs. a global baseline,
    style examples (real messages) for every breakdown, and the same thing
    again for Message-2 and Message-3+ as parallel sub-analyses      (Section 9)
11. For every segment with enough data, ask a strong LLM to write a
    ready-to-use "compose new outreach" prompt, informed by that segment's
    own keys-to-success + winning examples                         (Section 9.5)
12. Build a second, de-identified copy of the whole payload with every real
    client/company name swapped for a stable Company_NN label      (Section 9.6)
13. Publish both JSONs to Firebase, save them locally, drop a copy into a
    website repo, print a console summary                          (Section 10)
14. Save a checkpoint (.rdata) of the key in-memory objects so a downstream
    script can resume without re-running the AI scoring / model fit (Section 11)
```

Everything from Section 5 onward is computed **three times in parallel** —
once for "Level 1" (everything before the prospect's first reply, the
classic "opening message"), once for "Level 2" (everything sent between the
prospect's 1st and 2nd reply), and once for "Level 3" (everything sent after
the prospect's 2nd reply). This "3 different models" design is the single
biggest piece of cross-cutting structure in the file — see the Glossary
below before reading further.

---

## 2. Glossary of domain concepts

These terms recur throughout the script and this guide. Get them straight
before porting any one section, because several of them look similar but
are **not interchangeable**.

- **Row / prospect**: one line of the input export = one BDR-to-prospect
  outreach relationship. The unit of analysis throughout.
- **Funnel**: `connected` (accepted the LinkedIn connection) ->
  `replied` (sent at least one reply) -> `scheduled` (a meeting was booked).
  Each is a 0/1 flag per row; `scheduled=1` implies real business value.
- **`is_core`**: `message_type != "surround_connections"`. Core rows are the
  only ones used for the driver analysis (keys / research / examples /
  models) because `surround_connections` outreach relies on a teammate
  already being connected and is only repeatable to a limited degree — it
  still counts in the top-of-page funnel numbers, just not in "what works".
- **Message-position buckets (SEND ORDER, 4 of them)**: `seg_half1` (first
  half of message 1 by word count), `seg_half2` (second half of message 1),
  `seg_msg2` (the literal 2nd BDR message sent, by raw order), `seg_msg3plus`
  (every BDR message from #3 onward, concatenated). These answer **"WHERE in
  the raw send sequence does X first happen"** — used only by a handful of
  specific analyses (negative/rhetorical questions, calendar-link sharing,
  "talks about us", "asks for a meeting", "proposes a specific day/time",
  and the combined "forward about scheduling" signal). NA (not 0) when that
  position was never sent, so "did X happen at a position that didn't exist"
  never gets silently counted as "no".
- **Reply-round LEVELS (REPLY-ANCHORED, 3 of them)** — "the 3 different
  models": `msg1_text` (every BDR message sent before the prospect's FIRST
  reply), `msg2_text` (every BDR message from the prospect's 1st reply up to
  their 2nd reply), `msg3_text` (every BDR message from the prospect's 2nd
  reply onward). These answer **"WHAT does the BDR say in each round of the
  conversation"**, and are the basis for tripling almost the entire pipeline
  (text features, AI scoring, signals, RF models, phrase analysis, research
  breakdowns, JSON output) into 3 parallel, independent sub-analyses. Note
  `seg_msg2` (position) and `msg2_text` (level) usually, but not always,
  contain the same text — see Section 2 for exactly how they differ.
- **Scheduling-marker truncation**: for `scheduled==1` rows only, `msg2_text`
  /`msg3_text` are truncated at the first message that reads as "scheduling
  is being locked in right here" (a calendar link or explicit date/time
  confirmation language), so that post-meeting pleasantries/logistics aren't
  miscounted as "what drove scheduling". If no such marker exists anywhere,
  those fields are left NA for that row rather than guessed at.
- **Signal (`sig_*` column)**: a single 0/1 (or NA) flag representing one
  candidate "this message does X" hypothesis, e.g. `sig_tone_genuine`,
  `sig_has_cta`. ~140 of them are registered via `add_sig()`/
  `add_level_content_sigs()` in Section 5. Each has an `id`, `label`,
  `category`, population `scope` ("all" / "replied" / "has_msg2" /
  "has_msg3"), and `primary_outcome` (which funnel stage it's tested
  against: connected / replied / scheduled).
- **Segment**: one audience slice the report is built for — "All Clients
  Combined" (`overall`), one per `client`, and one per
  (`client`,`hypothesis_group`) pair. Each segment gets its own funnel
  stats, keys, research breakdowns, examples, audience profile, and
  (if `CFG$build_prompts`) its own AI-written improvement prompt.
- **Keys to success**: for a segment, the signals whose connection-controlled,
  empirical-Bayes-shrunk effect size on their primary outcome exceeds
  `CFG$min_key_effect_pp` (1.5 percentage points), split into `working`
  (positive effect) and `not_working` (negative effect), top 10 each by
  magnitude.
- **Connection-controlled effect**: a signal's effect on its outcome,
  estimated via a logistic regression that also includes
  `log_connections`/`log_followers` as covariates (an average marginal
  effect), so a signal that merely correlates with "has a big LinkedIn
  network" doesn't get credited as if it caused the outcome itself. Falls
  back to a plain two-proportion difference when there isn't enough
  connection data.
- **Empirical-Bayes (EB) shrinkage**: a segment's own effect estimate is
  blended toward the pooled (all-core-rows) estimate for that same signal,
  weighted by the segment's effective sample size vs. a pseudo-count
  (`CFG$eb_pseudo_count = 25`), so a segment with only 40 rows doesn't
  produce a wild, noisy "key". Guarded so shrinkage can never flip the
  segment's own estimated sign, and a signal can never be reported as
  "working" if its "with" arm had zero actual successes.
- **Research breakdown**: a rate table (`n`, `connect_rate`, `reply_rate`,
  `meeting_rate` per category level) for one dimension, e.g. tone, hook
  type, day of week, audience seniority. ~25 of these per segment,
  implemented by the generic `rate_by()` helper.
- **Style examples**: for every level of every research breakdown, up to
  `CFG$style_examples_per_level` (default 10) real example messages,
  best-outcome-first, so a human reader can see the actual messages behind
  any rate-table row.
- **Opportunity score**: a 0-100 blended score (`blended_score()`) combining
  each row's out-of-bag predicted probabilities of connecting/replying/
  scheduling, weighted `connected=0.15, replied=0.35, scheduled=0.50`. Used
  to rank "high potential open conversations" example picks.
- **Audience profile / composition**: for a segment (almost always a
  hypothesis group), a comparison of that segment's composition (connection
  bucket, seniority, org type, executive flag) against a **global baseline**
  (every other core row in the ENTIRE dataset, not just the same client) —
  reports each level's %, the baseline's %, an index (100=same as baseline),
  and an "expected vs. actual" rate decomposition (what rate would this
  group get if it converted exactly like the baseline, given its own mix of
  prospects, vs. what rate did it actually get).
- **De-identified ("blinded") payload**: a second copy of the final JSON
  with every real client/company name swapped for a stable `Company_NN`
  label wherever it appears exactly (a `company`/`name` field) or embedded
  in free text (`message`/`message_prompt`/`phrase` fields) — see Section
  9.6 for the full exact-match vs. prose-scan algorithm.
- **Checkpoint**: an `.rdata` snapshot of `dat`/`SIG`/`payload`/`rf_models`/
  `rf_importance`/`CFG`/`RUN_TAG`, saved at the very end so a downstream
  script ("Connect Hypothesis Optimizer.R") can resume without re-running
  AI scoring or model fitting.

---

## 3. External dependencies a port must supply

The script leans on R/CRAN packages and three pieces of **bespoke, external,
not-included** infrastructure. A port needs equivalents for all of these;
none of their internal logic is part of this file, so this guide only
specifies the *contract* (inputs/outputs) each one must satisfy.

### 3.1 CRAN packages used (need a library/pattern per target language)
- `jsonlite` — JSON parse/serialize. Note `auto_unbox = TRUE` (length-1
  vectors become scalars, not 1-element arrays) and `na = "null"` (R `NA`
  serializes as JSON `null`) are load-bearing for the output shape.
- `dplyr` / `tidyr` / `purrr` / `stringr` — data-frame manipulation,
  functional helpers, regex. `purrr::transpose()` specifically converts a
  data-frame (columnar) into a list-of-row-objects (the shape needed for a
  JSON array of objects) — this single call is used dozens of times to turn
  every rate table into its JSON array shape. Port equivalent: "rows of a
  table -> array of row-objects".
- `ranger` — fast Random Forest implementation supporting
  `probability = TRUE` (returns class probabilities, not just a label),
  `importance = "permutation"`, and `case.weights` (for class-imbalance
  weighting). A port needs any RF library that supports these three.
- `glmnet` — elastic-net regularized logistic regression
  (`cv.glmnet(..., family="binomial", alpha=0.5)`), used only for an
  optional interpretable-coefficient side view (`enet_coefs`); not required
  to reproduce the primary output, but is part of the full pipeline.
- `readxl` — reads the weekly `.xlsx` export when that's the input format.
- `httr` / `httr2` — HTTP calls (to the AI vendor and to Firebase).

### 3.2 `lama.batch()` / `lamas()` — the AI-scoring client (NOT included)
Defined in `Function Code/lama.R`, sourced lazily. Contract the port must
replicate:
- **`lama.batch(df, prompt_template, batch.size, model.in, fail_value,
  resume, max_tokens, disable_reasoning, partial_save_file)`** — takes a
  data frame and a prompt TEMPLATE STRING containing `[column_name]`
  placeholders (e.g. `[msg1_text_clean]`, `[contact_title_clean]`); for
  every row, substitutes each placeholder with that row's value, sends the
  filled-in prompt to an LLM (`model.in`, an OpenRouter model slug like
  `"qwen/qwen3.7-flash"`), and returns a character vector of raw model
  replies, one per input row, in the same row order. Must support:
  resuming from a `partial_save_file` (an on-disk progress checkpoint, so a
  multi-thousand-row batch interrupted partway through doesn't restart from
  zero), a per-call `max_tokens` cap, a `fail_value` to substitute for a row
  whose call errored, and `disable_reasoning` (skip any chain-of-thought /
  "thinking" mode the model might otherwise use, since only the final
  one-line answer is wanted).
- **`lamas(prompts, system_text, model, max_tokens, max_concurrent)`** — a
  simpler sibling: takes a plain character vector of already-fully-formed
  prompt strings (not a template + data frame) plus one shared system
  prompt, calls the model concurrently (`max_concurrent` in flight at once),
  and returns a character vector of replies in the same order. Used only in
  Section 9.5 to generate the final "message-improvement" prompts, one call
  per qualifying segment.
- Every raw reply from both is parsed with simple **regex field
  extraction**, not JSON — see `parse_field()`/`coerce_valid()`/`clampi()`
  in Section 4. The LLM is instructed (in the prompt) to reply with one
  line of `KEY=value` pairs in an exact format; the R side never trusts
  the model to emit valid JSON. A port should keep this same
  "constrained-format line + regex-parse" contract rather than switching to
  function-calling/JSON-mode unless it re-validates the prompts for the new
  mode too.

### 3.3 Firebase / `upload_to_firebase.R` (NOT included; summarized from a
separate file read during a prior session)
- `.firebase_auth()` resolves credentials from `Sys.getenv("FIREBASE_DB_SECRET")`
  then `Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")`; errors
  `"No Firebase credentials found..."` if neither is set.
- `upload_connect_analysis(payload, deidentified_payload, run_date)` writes,
  for EACH of two Firebase Realtime Database root paths
  (`ConnectAnalysis` for the real payload, `ConnectAnalysisDeidentified` for
  the blinded one): `<root>/latest` (overwritten every run),
  `<root>/runs/<run_date>` (history, one per run date), and
  `<root>/index/<run_date>` (a lighter index/pointer entry) — written
  sequentially via `httr2` PUT calls, no explicit timeout set.
- A port can swap Firebase for any JSON document store; the contract is
  just "3 writes per payload, under a `latest` / `runs/<date>` /
  `index/<date>` key layout, for 2 payload variants."

### 3.4 `saver()` / `loadr()` — generic object checkpoint persistence
If not already defined in the R session (e.g. via a user `.Rprofile`), the
script defines local fallbacks: `saver(object, name)` = `saveRDS()` to
`_cache/<name>.rds`; `loadr(name)` = `readRDS()` from the same path. A port
just needs "serialize an in-memory object graph to disk under a name, and
load it back" — e.g. pickle/JSON/msgpack to a keyed file store.

---

## 4. Top-of-file: `.Renviron` self-heal

```r
.renviron_path <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/Documents/.Renviron"
if (file.exists(.renviron_path)) {
  readRenviron(.renviron_path)
} else {
  warning("Expected .Renviron not found at: ", .renviron_path,
          " — Firebase credentials may be missing.")
}
```

**Why:** R only reads a `.Renviron` env file once, at process startup. A
long-lived interactive session started before a credential was added to
`.Renviron` would otherwise never see the new value until the whole process
restarts, causing recurring "No Firebase credentials found" failures no
matter how many times `.Renviron` itself was fixed. `readRenviron()` forces
a re-read into the *current* process's environment on every run of this
script, so a stale/long-lived session self-heals automatically.
**Porting note:** this is purely an R-process-lifetime quirk; in most other
languages/runtimes (a fresh CLI invocation, a container, a serverless
function) env vars are read once per process start-up anyway, so a literal
port of this specific workaround is usually unnecessary — just make sure the
target runtime re-reads its env/secrets file on every invocation (which is
normal for e.g. a CLI script or short-lived job, and only matters at all for
a long-lived server process).

---

## 5. Section 0 — Configuration (`CFG`)

A single list, `CFG`, holds every tunable parameter. Porting note: this
should become a typed config object/struct in the target language, ideally
with the exact same field names and defaults, loaded from the equivalent of
environment/config-file overrides. Fields, grouped as in the source:

**Input**
- `input_path` (default `NULL` = auto-pick newest matching file in `connect_dir`)
- `connect_dir` — folder to scan for exports and to read/write caches from

**AI scoring**
- `run_ai` (bool, default `TRUE`) — `FALSE` skips all LLM calls (dry run)
- `ai_model` = `"qwen/qwen3.7-flash"` (OpenRouter slug, needs `vendor/` prefix)
- `ai_batch` = `1000` (rows per batch call)
- `use_cache` (bool, default `TRUE`) — reuse previously-scored rows
- `rescan_all` (bool, default `FALSE`) — ignore + rebuild cache, rescore everything
- `ai_max_tokens_first` = `160L`, `ai_max_tokens_followup` = `60L`,
  `ai_max_tokens_position` = `150L`, `ai_max_tokens_level` = `180L` — per-prompt
  token budgets, sized to the number of fields each prompt's format returns
  on one line (if too low, the reply truncates and only the first few fields
  parse — this bit the authors once with the default 20-token client limit)

**Message-improvement prompt generation**
- `build_prompts` (bool, default `TRUE`)
- `prompt_model` = `"anthropic/claude-opus-4.8"` (a stronger/pricier model
  than the per-row scoring model, since this is one call per *segment*, not
  per row)
- `prompt_max_tokens` = `1600L`
- `prompt_hypothesis_groups` (bool, default `TRUE`) — also generate one
  prompt per hypothesis group, not just per client
- `prompt_examples_n` = `6` — winning example messages fed to the prompt writer

**Output**
- `upload` (bool, default `TRUE`) — PUT to Firebase
- `firebase_root` = `"ConnectAnalysis"`
- `save_local_json` (bool, default `TRUE`), `local_out_dir` (path)
- `save_deidentified_json` (bool, default `TRUE`), `save_company_map_csv`
  (bool, default `TRUE`) — the blinded JSON and its real-name<->label lookup CSV
- `website_dir` — if non-NULL, mirror the payload into a website repo's
  expected folder (`latest.json`, `runs/<date>.json`, `index.json`)

**Modelling / statistics**
- `blend_weights` = `c(connected=0.15, replied=0.35, scheduled=0.50)` — used by
  `blended_score()`
- `min_segment_n` = `40` — minimum core rows for a segment to get its own
  driver-analysis report (below this, `sufficient_data = FALSE`)
- `min_arm_n` = `12` — minimum rows in EACH arm (with/without a signal)
  before an effect is trusted at all
- `eb_pseudo_count` = `25` — EB shrinkage strength (larger = more shrinkage
  toward the pooled estimate)
- `min_key_effect_pp` = `1.5` — minimum |shrunk effect|, in percentage
  points, to list a key at all
- `phrase_min_n` = `30`, `phrase_ngram_max` = `3`, `phrase_top_k` = `15` —
  reply-lift phrase ranking parameters
- `recurring_ngram_max` = `5`, `recurring_min_n` = `25`, `recurring_top_k` = `25`
  — "phrases we say a lot" discovery parameters
- `style_examples_per_level` = `10` — example messages per research-breakdown
  level (0 disables entirely)
- `seed` = `42` — used for `set.seed()` and passed into `ranger::ranger(seed=)`
  for reproducibility

**Override mechanism:**
```r
if (exists("CFG_OVERRIDE") && is.list(CFG_OVERRIDE)) CFG[names(CFG_OVERRIDE)] <- CFG_OVERRIDE
```
A caller can define a `CFG_OVERRIDE` list of any subset of these fields
*before* sourcing this script, and those fields are patched in. A port
should expose an equivalent "partial config override merged over defaults"
entry point (e.g. a function parameter, or a config file deep-merge), used
for dry runs / scheduled variants.

```r
RUN_TAG <- format(Sys.Date(), "%Y-%m-%d")
set.seed(CFG$seed)
```
`RUN_TAG` is today's date, `"YYYY-MM-DD"`, used as the run identifier
throughout (cache keys, Firebase path segments, output filenames).

---

## 6. Section 0b — Libraries + helper bootstrap

Loads `jsonlite`, `dplyr`, `stringr`, `tidyr`, `purrr`, `httr`; ensures
`ranger`, `glmnet`, `readxl`, `httr2` are installed (installing from CRAN if
missing — a port's equivalent is a declared dependency list, not a runtime
auto-install, which is an R-script-specific convenience not worth
replicating as runtime behavior).

Creates a `_cache` subdirectory under `connect_dir`.

Conditionally sources two pieces of bespoke infrastructure if not already
defined in the session (see Section 3 above for their contracts):
`Firebase functions.R` (for `uploadData`/`firebase_url`, actually superseded
later by `upload_to_firebase.R`, kept here mostly as a legacy fallback) and,
only if `CFG$run_ai` is true, `lama.R` (for `lama.batch`/`lamas`) — **always
re-sourced** even if a `lama.batch` already exists in the session, so a
stale in-session copy from e.g. a `.Rprofile` can never silently shadow this
file's current fixes.

Defines `saver`/`loadr`/`.loadr_exists` fallbacks if absent (see Section 3.4).

Defines the null-coalescing helper used throughout the entire script:
```r
`%||%` <- function(a, b) if (is.null(a) || length(a) == 0 || (length(a) == 1 && is.na(a))) b else a
```
**Porting note:** this is R's `??`/`?:`-with-NA-awareness. Semantics: `a %||% b`
returns `b` if `a` is NULL, zero-length, OR a single NA value — NOT the
usual "falsy" coalescing (e.g. `0 %||% 5` is `0`, not `5`). A port needs a
helper with exactly this three-way check (null / empty collection / scalar
missing-value), not a generic truthy-coalesce.

---

## 7. Section 1 — Load + normalize input

### 7.1 Canonical column mapping

`.CANON_MAP` is a lookup table (R named character vector) from a
**normalized** input header token to the canonical internal column name.
`norm_key(x) = tolower(gsub("[^a-z0-9]", "", tolower(x)))` strips everything
but lowercase letters/digits, so `"LinkedIn URL"`, `"linkedinurl"`, and
`"Contact LinkedIn URL"` all normalize differently but each maps to the
same canonical `linkedin_url` (the JSON pipeline export literally calls it
`contactLinkedInUrl`, the Excel export calls it `LinkedIn URL` — both must
land on `linkedin_url`). The full map (reproduce exactly — every one of
these is a real header variant seen across the Excel/CSV/JSON export paths):

| normalized input key | canonical column |
|---|---|
| contactname | contact_name |
| linkedinurl, contactlinkedinurl | linkedin_url |
| title, contacttitle | contact_title |
| company, contactcompany | contact_company |
| bdrname | bdr_name |
| bdremail | bdr_email |
| client, clientname, clientcompany | client |
| hypothesisgroup | hypothesis_group |
| hypothesisgroupid | hypothesis_group_id |
| hypothesissubgroupid, hypothesisvariationid | hypothesis_variation_id |
| hypothesissubgroupvariation, hypothesissubgroup, hypothesisvariationlabel | hypothesis_variation_label |
| connected | connected |
| connectedbyhealthluminate, connectedbyhl | connected_by_hl |
| currentlyconnectedanysource, currentlyconnectedonlinkedin, currentlyconnected | currently_connected |
| connectiondate | connection_date |
| firstconnectionrequestsent, firstconnectionrequestsentdate, connectionrequestsent, connectionrequestsentdate, requestsent, firstoutreachsentat | conn_request_sent |
| firstoutreachdate | first_outreach_date |
| lastmessagedate | last_message_date |
| messagetype | message_type |
| replied | replied |
| scheduled | scheduled |
| totalmessages | total_messages |
| bdrmessages | bdr_messages |
| contactmessages | contact_messages |
| conversationhistoryjson, conversationhistory | conversation_history |
| linkedinconnections | linkedin_connections |
| followercount | follower_count |
| about | about |
| experiencejson, experience | experience_json |
| educationjson, education | education_json |
| enrichedat | enriched_at |

`normalize_columns(df)` applies this map to every column name in the loaded
data frame; unmapped columns pass through unchanged.

### 7.2 `serialize_convo(x)`

Normalizes a `conversation_history` cell — which may already be a JSON
string (CSV export path) or a parsed list/data-frame (JSON export path,
where `jsonlite::fromJSON` auto-parses nested structures) — into a single
clean JSON string with a `timestamp` field (renaming `datetime` to
`timestamp` if that's what's present), so every downstream parser can assume
one consistent shape regardless of which export format produced the row.

### 7.3 `load_outreach(path)` — 3 input formats

- **`.json`**: `jsonlite::fromJSON(path, simplifyDataFrame = TRUE, flatten = FALSE)`,
  then `normalize_columns()`, then `serialize_convo()` on every
  `conversation_history` cell, then flattens any remaining list-type columns
  by collapsing their elements into a single `"; "`-joined string (anything
  not already a clean scalar).
- **`.xlsx`/`.xls`**: `readxl::read_excel(sheet=1, guess_max=100000)`, then
  **every column coerced to character** (so the JSON/CSV and Excel paths
  behave identically downstream): `POSIXct` (datetime) columns format as
  `"%Y-%m-%dT%H:%M:%SZ"` UTC (readxl always reads Excel datetimes as UTC;
  the TIME component is preserved because send-time analysis needs it),
  plain `Date` columns format as `"%Y-%m-%d"`. Empty strings become `NA`.
  Then `normalize_columns()`.
- **`.csv`**: `read.csv(na.strings = c("", "NA"))`, then `normalize_columns()`.

`fix_encoding(df)` runs on the result of all three paths: every character
column is re-encoded `iconv(from="", to="UTF-8", sub=" ")` and
`enc2utf8()`'d, replacing any byte sequence that isn't valid UTF-8 with a
space, so no downstream `gsub`/regex call can ever throw an encoding error.
**Porting note:** in a language with stricter string encoding (most modern
languages treat strings as UTF-8/UTF-16 natively), this step may be a no-op
— its only purpose is defending against malformed bytes surviving from a
sloppy upstream export.

`pick_default_input(dir)`: when `CFG$input_path` is NULL, globs
`dir` for `probit_dataset*.{xlsx,xls,csv,json}` (case-insensitive), excludes
Excel lock files (`~$...`), and returns the most-recently-modified match
(errors if none found). ("`probit_dataset`" is a legacy filename prefix
inherited from this script's predecessor, "Probit Analysis v3.R".)

### 7.4 Post-load guarantees + cleanup

```r
INPUT_PATH <- CFG$input_path %||% pick_default_input(CFG$connect_dir)
dat <- load_outreach(INPUT_PATH)
```

- Every column in `required_char` (`contact_name`, `linkedin_url`,
  `contact_title`, `contact_company`, `bdr_name`, `bdr_email`,
  `hypothesis_group`, `hypothesis_group_id`, `hypothesis_variation_id`,
  `hypothesis_variation_label`, `message_type`, `conversation_history`,
  `about`) is created as all-NA if missing from the source entirely (so
  every downstream reference to these columns is always safe).
- `client`: if entirely missing/NA, a warning is issued and **every** row is
  grouped under `"All Clients"`; otherwise blank/NA individual values become
  `"Unassigned"` (trimmed).
- `hypothesis_group`: blank/NA individual values become `"Ungrouped"`
  (trimmed).
- **`KNOWN_TEST_CONTACT_URLS`** — a **hard-coded, dataset-wide exclude
  filter** removing exactly 2 known LinkedIn profiles
  (`linkedin.com/in/joe-annoreno-3383b69`, an internal HealthLuminate
  contact; `linkedin.com/in/taylorkentdavis`, a BDR-tooling test message),
  matched case-sensitively against the already-lowercased `linkedin_url`
  column. These two profiles were discovered appearing under ~30+ different
  clients each, always with `connected=1, scheduled=1` — an automatic
  connection-test step mistakenly counted as real outreach, inflating
  funnel numbers (in some cases making an entire client/hypothesis-group's
  data consist ENTIRELY of these two fake rows). **A port must hard-code
  this same exclude list** (or move it to config, but it must exist) and
  should leave room to append newly-discovered test contacts by
  `linkedin_url` the same way.
- `hypothesis_variation_id`/`hypothesis_variation_label`: blank strings
  become `NA` (most rows have no A/B variation tag at all, so leaving them
  NA rather than a blank-string bucket avoids diluting breakdowns for the
  groups that DO run a variation test).
- **Numeric coercion**: `connected`, `replied`, `scheduled`, `total_messages`,
  `bdr_messages`, `contact_messages`, `linkedin_connections`,
  `follower_count` are stripped of everything but digits/`.`/`-` via regex,
  then `as.numeric()`'d (any column missing entirely is created as all-NA
  first). `connected`/`replied`/`scheduled`: NA -> 0 (a send that never
  connected/replied/scheduled is a real "no", not "unknown"), then clamped
  to `[0,1]` via `pmin(pmax(x,0),1)` (defends against any dirty >1/<0 input
  value; does NOT enforce cross-column monotonicity like "replied implies
  connected" — observed values are kept as-is).
- `message_type`: lowercased/trimmed; blank -> NA. `is_core` = TRUE unless
  `message_type == "surround_connections"` (NA message_type also counts as
  core).

**Porting note on NA semantics throughout this whole file:** R's `NA`
(missing value) propagates through almost every operation (`NA == x` is
`NA`, not `FALSE`; `mean(c(1,NA))` is `NA` unless `na.rm=TRUE` is passed
explicitly) and most comparisons in this script rely on that propagation to
mean "unknown/not applicable", which is later very deliberately NOT treated
the same as a hard `0`/`FALSE` in most of the signal/effect-size logic (see
Section 5/7). A port in a language without a native missing-value type
(e.g. plain JS `undefined`/`null`, or Python without pandas) must
explicitly replicate this **three-valued logic** (true / false / unknown)
at every boolean comparison derived from a possibly-missing field, not
silently collapse "unknown" into `false`.

---

## 8. Section 2 — Parse conversation history

`conversation_history` is a JSON array of `{sender, text, timestamp}`
objects (sender is `"BDR"` or the contact's name/role — anything not
literally `"BDR"` is treated as the prospect). This section extracts every
derived text field the rest of the pipeline needs.

### 8.1 Low-level parsing helpers

```r
parse_convo <- function(x) {
  if (is.na(x) || !nzchar(x)) return(NULL)
  c <- tryCatch(fromJSON(x), error = function(e) NULL)
  if (is.null(c)) return(NULL)
  if (!is.data.frame(c)) c <- tryCatch(as.data.frame(c), error = function(e) NULL)
  if (is.null(c) || nrow(c) == 0 || !all(c("sender","text") %in% names(c))) return(NULL)
  if (!"timestamp" %in% names(c)) {
    if ("datetime" %in% names(c)) c$timestamp <- c$datetime
    else if ("date" %in% names(c)) c$timestamp <- c$date
    else c$timestamp <- NA_character_
  }
  c
}
```
Returns `NULL` on anything unparseable/empty/missing required fields —
every caller must treat a parse failure as "no conversation data", not an
error. `parse_ts(s)` parses an ISO-ish timestamp string
(`"%Y-%m-%dT%H:%M:%OS"`, with a trailing `Z` stripped first, UTC) to a
datetime, returning a missing-datetime sentinel on failure.

### 8.2 Point-in-time extracts: `extract_convo_features(x)`

For one row's parsed conversation (`sender`, `text` arrays in send order):
- `bdr_i` = indices where `sender == "BDR"`; `con_i` = indices where it
  isn't (the prospect).
- `first_message` = text at `bdr_i[1]` (the very first BDR message); its
  send timestamp, converted from UTC to **US Central** time
  (`America/Chicago`), gives `first_msg_hour` (integer 0-23) for
  time-of-day analysis later.
- `second_bdr_message` = text at `bdr_i[2]` if a 2nd BDR message exists by
  raw send order (regardless of whether the prospect has replied yet).
- `prospect_first_reply` = text at the prospect's first message index
  (`con_i[1]`), if any.
- `bdr_reply_after_reply` = the first BDR message sent strictly after that
  first reply (`bdr_i[bdr_i > con_i[1]][1]`); `hours_to_bdr_followup` is the
  elapsed hours between the reply's timestamp and that follow-up's
  timestamp.

This is run over every row via `purrr::map_dfr` (map a function over a list,
row-bind the results into one data frame) and column-bound onto `dat`.
**Porting note:** `map_dfr` here is literally "map this per-row extraction
function over every row, then concatenate the resulting records into a
table" — any language's `map` + `concat`/`extend` does this.

### 8.3 Send-order POSITION buckets (4 of them)

```r
extract_all_bdr_messages <- function(x) {
  c <- parse_convo(x)
  if (is.null(c)) return(character(0))
  as.character(c$text[as.character(c$sender) == "BDR"])
}
split_in_half_words <- function(text) {
  if (is.na(text) || !nzchar(text)) return(c(NA_character_, NA_character_))
  w <- strsplit(text, "\\s+")[[1]]; n <- length(w)
  if (n < 2) return(c(text, NA_character_))   # too short to split meaningfully
  mid <- ceiling(n / 2)
  c(paste(w[1:mid], collapse = " "), paste(w[(mid + 1):n], collapse = " "))
}
```
For every row: get the full list of BDR message texts, in send order
(ignoring the prospect's messages entirely for this step). `msg1_text`
(local var, not the Level-1 field — unfortunately named the same as the
Section-2.4 field below, but this is purely message #1's text) is BDR
message #1. Split it in half BY WORD COUNT (not character count) —
`seg_half1`/`seg_half2`. `seg_msg2` = BDR message #2 verbatim (if it
exists). `seg_msg3plus` = every BDR message from #3 onward, joined with a
plain space.

**These 4 are NOT reply-aware** — they are pure send-order positions,
independent of whether/when the prospect ever replied. Used only by: the
"negative/rhetorical question" detector, the calendar-link detector, the
"about us" / "meeting ask" / "proposes a specific day/time" AI-classified
triple (`POSITION_PROMPT`), and the combined "forward scheduling" signal —
all of which report a "first occurrence position" rollup across exactly
these 4 buckets (see `.first_at()` below).

### 8.4 Reply-round LEVELS (3 of them) — the "3 different models" boundary

This is the single most important piece of segmentation logic in the file.
Re-read the Glossary entry above if this doesn't already make sense.

**Scheduling-marker patterns** (module-level regexes, PCRE-flavored,
case-insensitive at use sites via `stringr::regex(..., ignore_case = TRUE)`):

```r
.CALENDAR_LINK_PATTERN <- paste0(
  "calendly\\.com|cal\\.com/|chilipiper|meetings?\\.hubspot|hubspot\\.com/meetings|",
  "acuityscheduling|useacuity\\.com|youcanbook|doodle\\.com|savvycal|zcal\\.co|tidycal|vyte\\.in|",
  "outlook\\.office365\\.com|calendar\\.app\\.google|calendar\\.google\\.com|setmore|appointlet|",
  "oncehub|meetwhen|book\\.appointmentcore",
  "|",
  "\\b(calendar|scheduling|booking) link\\b|",
  "\\b(grab|pick|find|book)\\s+(a\\s+|some\\s+)?time\\s+(on|in|with|using|via)\\s+my\\s+(calendar|calendly)\\b|",
  "\\bhere.?s my calendar\\b|\\bbook (a|some) time (here|below|with me)\\b")
.SCHED_CONFIRM_PATTERN <- paste0(
  "\\b\\d{1,2}(:\\d{2})?\\s*(am|pm)\\b|",                                       # clock time: "9:30 AM", "2pm"
  "\\b\\d{1,2}:\\d{2}\\b|",                                                     # bare HH:MM
  "\\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*(\\s+\\d{1,2}(st|nd|rd|th)?)?\\b.{0,20}\\b(works|work|confirmed|booked|scheduled)\\b|",
  "\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s+\\d{1,2}\\b|",  # "November 2"
  "\\b\\d{1,2}/\\d{1,2}\\b|",                                                   # "11/5"
  "\\b(send|sent|sending)\\s+(you\\s+|an?\\s+)?(the\\s+)?invite\\b|",
  "\\bcalendar invite\\b|\\bbooked\\b|\\bconfirmed for\\b|\\bscheduled (us|a|the|our)\\b|",
  "\\bsee you (then|there|on)\\b|",
  "\\blooking forward to (it|our call|the call|our chat|speaking|meeting|connecting)\\b|",
  "\\bworks for me\\b|\\bthat works\\b"
)
has_sched_marker <- function(txt) {
  isTRUE(stringr::str_detect(txt, stringr::regex(paste0(.CALENDAR_LINK_PATTERN, "|", .SCHED_CONFIRM_PATTERN),
                                                 ignore_case = TRUE)))
}
```
**Porting note on regex:** both patterns are PCRE syntax (R's `stringr`
compiles with PCRE/PCRE2 by default). `\\b` word boundaries, named
alternation groups, and the lazy `.{0,20}` bounded gap all need a regex
engine with equivalent semantics (PCRE, .NET regex, or Python's `re`/`regex`
module all work; JS's native `RegExp` lacks possessive/atomic groups but has
no issue with anything used here specifically — this pattern set is
otherwise portable as-is, just re-escape the string literal for the target
language's string-literal rules, e.g. `\\.` stays `\\.` in most languages).

**Main extraction function:**
```r
extract_reply_round_messages <- function(x, scheduled = 0) {
  c <- parse_convo(x)
  empty <- list(msg1 = character(0), msg2 = character(0), msg3 = character(0))
  if (is.null(c)) return(empty)
  sender <- as.character(c$sender); text <- as.character(c$text)
  bdr_i <- which(sender == "BDR")
  con_i <- which(sender != "BDR")
  if (!length(bdr_i)) return(empty)

  if (isTRUE(scheduled == 1)) {
    hits <- which(vapply(text[bdr_i], has_sched_marker, logical(1)))
    if (length(hits)) {
      bdr_i <- bdr_i[bdr_i <= bdr_i[min(hits)]]     # keep up to/incl. the marker message
    } else {
      r1_tmp <- if (length(con_i) >= 1) con_i[1] else Inf
      bdr_i <- bdr_i[bdr_i < r1_tmp]                # can't tell - keep only msg1-eligible messages
    }
  }

  r1 <- if (length(con_i) >= 1) con_i[1] else Inf   # prospect's 1st reply position
  r2 <- if (length(con_i) >= 2) con_i[2] else Inf   # prospect's 2nd reply position
  list(
    msg1 = text[bdr_i[bdr_i < r1]],
    msg2 = text[bdr_i[bdr_i >= r1 & bdr_i < r2]],
    msg3 = text[bdr_i[bdr_i >= r2]])
}
```
Step by step:
1. Get every BDR message's index (`bdr_i`) and every prospect reply's index
   (`con_i`), in the original send order.
2. **Only if `scheduled == 1`** for this row: find the index (within the BDR
   messages) of the FIRST message matching `has_sched_marker()`. If found,
   discard every BDR message index AFTER that one (scheduling is locked in;
   anything after is noise for driver analysis). If NOT found anywhere,
   fall back to keeping only BDR messages that occur before the prospect's
   first reply (i.e., treat this row as if `msg2_text`/`msg3_text` don't
   exist for it at all, rather than guessing where scheduling happened).
   **This step is skipped entirely for `scheduled == 0` rows** — no
   truncation is applied when there's no meeting to protect the "cause" of.
3. Regardless of the truncation above, bucket what's LEFT of `bdr_i` into
   three levels by comparing each BDR message's index to `r1` (index of the
   prospect's 1st reply) and `r2` (index of their 2nd reply): before `r1` =
   Level 1; from `r1` up to (not including) `r2` = Level 2; from `r2` onward
   = Level 3. If the prospect never replied a 2nd time, `r2 = Inf`, so
   Level 3 is naturally empty for that row.

```r
reply_round_list <- mapply(extract_reply_round_messages, dat$conversation_history, dat$scheduled, SIMPLIFY = FALSE)
.combine_msgs <- function(v) if (length(v)) paste(v, collapse = " ||| ") else NA_character_
dat$msg1_text <- vapply(reply_round_list, function(l) .combine_msgs(l$msg1), character(1))
dat$msg2_text <- vapply(reply_round_list, function(l) .combine_msgs(l$msg2), character(1))
dat$msg3_text <- vapply(reply_round_list, function(l) .combine_msgs(l$msg3), character(1))
dat$has_msg1 <- as.integer(!is.na(dat$msg1_text) & nzchar(dat$msg1_text))
dat$has_msg2 <- as.integer(!is.na(dat$msg2_text) & nzchar(dat$msg2_text))
dat$has_msg3 <- as.integer(!is.na(dat$msg3_text) & nzchar(dat$msg3_text))
```
`extract_reply_round_messages` is called once per row (`mapply`, passing
each row's `conversation_history` AND `scheduled` value in parallel — a
port should just loop rows and call the per-row function with both
arguments). Multiple messages within the same level are joined with the
literal separator `" ||| "` (not a plain space) specifically so downstream
AI/regex scoring can see level boundaries between distinct messages rather
than silently merging two different messages' sentences together.
`has_msgN` is the binary "did this row ever reach level N" population flag
used everywhere downstream to scope Level-2/3 analyses.

### 8.5 Sanitization + "(not sent)" placeholders for AI prompts

```r
sanitize_for_api <- function(v) {
  v <- as.character(v)
  v[is.na(v)] <- ""
  v %>% gsub("\\\\", "/", .) %>% gsub('"', "'", .) %>%
    gsub("\r?\n", " ", .) %>% gsub("\t", " ", .) %>% trimws()
}
```
Every text field that will be substituted into an AI prompt template gets a
`_clean` sibling column via this function: backslashes -> `/`, double
quotes -> single quotes, newlines/tabs -> single space, then trimmed. This
exists because the prompt-template substitution mechanism
(`lama.batch`'s `[column]` placeholder filling, implemented by an
`eval`/`parse`-based template assembly in the external `lama.R`) breaks on
raw backslashes, embedded double quotes, and newlines. **Porting note:** if
a port's prompt-templating mechanism uses a safer substitution method (e.g.
parameterized string formatting, not eval/parse of generated code), this
sanitization may be less critical for *correctness*, but should probably be
kept anyway since the business logic (what text reaches the AI) should stay
identical between the real and sanitized forms, and some of it (collapsing
newlines) is also a deliberate content-normalization choice, not just an
injection-safety hack.

Columns sanitized this way: `first_message`, `second_bdr_message`,
`prospect_first_reply`, `bdr_reply_after_reply`, `conversation_history`,
`contact_title`, `contact_company`, `seg_half1`, `seg_half2`, `seg_msg2`,
`seg_msg3plus`, `msg1_text`, `msg2_text`, `msg3_text` — each becomes
`<name>_clean`.

```r
.not_sent_ph <- function(x) ifelse(!nzchar(x), "(not sent)", x)
```
For the 4 position segments + 3 message levels, a second `<name>_prompt`
sibling replaces any empty cleaned value with the literal string
`"(not sent)"`. This exists so every AI prompt always has a consistent
shape (4 or however-many segments filled in) even when a given
position/level never actually happened for that row — **R, not the AI, is
the source of truth** for "did this position/level happen at all" (see
Section 4's explicit NA-forcing step); the AI's answer for a `(not sent)`
placeholder is always discarded after scoring, never trusted.

### 8.6 Basic message-shape features
`first_msg_nchar` (character count, NA preserved if message itself is NA),
`first_msg_words` (`stringr::str_count(x, "\\S+")` — whitespace-delimited
token count), `first_msg_n_cr` (count of `\n` characters), `has_second_msg`
/`has_reply_text` (0/1, "does a non-empty value exist").

---

## 9. Section 3 — Non-AI feature engineering

All features in this section are computed with regex/arithmetic only — no
LLM call. Two "legacy, effectively unused" flags open the section
(`mentions_i`, `mentions_you`, `starts_just_saw` — computed but not read by
anything downstream; a port may skip them or keep them for parity, they're
harmless either way) before the real work begins.

### 9.1 `compute_text_features(text)` — the generic per-level feature function

This ONE function is called 3 times (once each for `msg1_text`, `msg2_text`,
`msg3_text`) and its output columns are written to legacy unsuffixed names
for Level 1 (`first_msg_nchar`, `has_question`, `length_bucket`,
`connect_phrasing`, `opener_type`, `exclam_use`, `emoji_use`,
`uses_abbreviations`, `fk_grade`, `fk_bucket`, ...) and to `_lvl2`/`_lvl3`
suffixed siblings for Levels 2/3. **This is the central mechanism behind
the "3 different models" tripling** — get this one function exactly right
and Levels 2/3 are "free" (just a loop over 2 and 3 writing suffixed
columns, see below).

```r
.readability_grade <- function(msg) {
  if (is.na(msg) || !nzchar(msg)) return(NA_real_)
  words <- str_count(msg, "\\S+")
  sents <- max(str_count(msg, "[.!?]+"), 1)
  chars <- nchar(gsub("\\s", "", msg))
  if (words == 0) return(NA_real_)
  syll <- chars / 3   # approx syllables ~ chars/3; FK grade formula
  0.39 * (words / sents) + 11.8 * (syll / words) - 15.59
}
```
An **approximation** of the Flesch-Kincaid grade-level formula: instead of
a real syllable counter, syllables are crudely approximated as
non-whitespace character count / 3. Sentence count is `max(1, count of
[.!?]+ runs)` (never divides by zero). Formula:
`0.39*(words/sentences) + 11.8*(syllables/words) - 15.59` — this is the
*standard* Flesch-Kincaid Grade Level formula, just fed an approximate
syllable count. A faithful port must use this exact approximation (chars/3
syllables), not a real syllable-counting library, to reproduce identical
scores.

```r
.first_sentence_fn <- function(msg) {
  if (is.na(msg) || !nzchar(msg)) return(NA_character_)
  trimws(sub("([.!?]).*$", "\\1", msg))
}
```
Returns everything up to AND INCLUDING the first `.`/`!`/`?`, i.e. the
message's first sentence (or the whole message if it has no terminal
punctuation at all — `sub()` with no match returns the original string
unchanged, so `trimws(msg)` is the fallback).

**The full feature set** (one row of this data frame per input text):

| column | formula / rule |
|---|---|
| `nchar` | `nchar(text)` (NA preserved) |
| `words` | whitespace-token count |
| `has_question` | contains `?` |
| `has_congrats` | lowercased text contains `"congrat"` |
| `has_thank` | lowercased text contains `"thank"` |
| `all_caps` | contains a 3+-letter ALL-CAPS word (`\\b[A-Z]{3,}\\b`) |
| `quotes_them` | contains a double-quoted span of 8+ chars (`"[^"]{8,}"`) — i.e. quoting something the prospect said |
| `has_emoji` | contains a char in the Unicode emoji/symbol ranges `U+1F300-1FAFF` or `U+2600-27BF` |
| `has_stat` | contains `\d+%`, `$\d`, or any 2+-digit number |
| `has_linebreak` | `"Has line break"` / `"No line break"` — checked on the RAW (pre-sanitize) text, since `sanitize_for_api()` later collapses newlines to spaces and would otherwise always read "no break" |
| `length_bucket` | `nchar` cut into 11 bins: 1-25, 26-50, 51-75, 76-100, 101-125, 126-150, 151-175, 176-200, 201-225, 226-250, 251+ |
| `exclam_count` / `exclam_use` | count of `!`; bucketed None / One / "Multiple (2+)" |
| `emoji_count` / `emoji_use` | count of emoji chars (slightly wider Unicode range than `has_emoji`, also includes `U+1F1E6-1F1FF` regional-indicator flag letters); same 3-way bucket |
| `abbr_count` / `uses_abbreviations` | count of matches against a fixed informal-abbreviation word list (see below) + `w/o`/`b/c`/`w/` slash forms; "Uses abbreviations" if count>0 else "No abbreviations" |
| `fk_grade` / `fk_bucket` | `.readability_grade()`; bucketed Easy(<=6) / Standard(7-9) / Advanced(10-12) / Complex(13+) |
| `first_sentence` | `.first_sentence_fn()` |
| `opener_type` | case_when on the lowercased first sentence — see below |
| `opener_is_question` | first sentence ends in `?` |
| `connect_phrasing` | case_when on lowercased full text — see below |

Abbreviation word list (word-boundary matched, case-insensitive on the
lowercased text):
```
lol, lmk, btw, fyi, asap, imo, imho, tbh, idk, np, nbd, ngl,
thx, thnx, pls, plz, ur, u, gonna, wanna, gotta, cuz, abt, convo,
appt, rn, aka, diy, wfh, omg, dm, pm
```
plus the slash forms `w/o`, `b/c`, `w/` (matched via a separate pattern
`\b(w/o|b/c|w/)` since `/` isn't a normal word character).

`opener_type` (evaluated in this exact priority order — first match wins,
exactly like R's `dplyr::case_when`, which is NOT the same as a plain
if/elseif chain only in that every branch condition is pre-computed as a
full vector before picking — functionally for a single value it IS just
first-match-wins):
1. first sentence ends in `?` -> `"Question"`
2. starts with saw/just saw/loved/noticed/read/caught my eye/impressive -> `"Observation about them"`
3. starts with congrat/congratulations -> `"Congratulations"`
4. starts with i /my /we /our /as a/fellow -> `"About us"`
5. starts with your/you -> `"About you"`
6. first sentence is NA -> `NA`
7. else -> `"Other"`

`connect_phrasing` (same first-match-wins priority order, on lowercased
full text, NA text -> NA):
1. `"worth (it )?(to )?connect"` -> `"Worth connecting"`
2. `"let'?s connect|let us connect|lets connect|let'?s link up"` -> `"Let's connect"`
3. `"(would |i'?d )?love to connect"` -> `"Would love to connect"`
4. `"open to connect"` -> `"Open to connecting"`
5. `"happy to connect|glad to connect"` -> `"Happy to connect"`
6. `"keen to connect|hoping to connect|would like to connect|wanted to connect|like to connect"` -> `"Would like to connect"`
7. `"to connect|connect with|connecting with|let'?s chat"` -> `"Other connect ask"`
8. else -> `"No connect ask"`

**Applying it 3x:**
```r
lvl1_feat <- compute_text_features(dat$msg1_text)
dat$first_msg_nchar    <- lvl1_feat$nchar
# ... (19 more legacy-name assignments, one per lvl1_feat column) ...

for (.L in c(2, 3)) {
  .src  <- dat[[paste0("msg", .L, "_text")]]
  .feat <- compute_text_features(.src)
  for (.nm in names(.feat)) dat[[paste0(.nm, "_lvl", .L)]] <- .feat[[.nm]]
}
```
Level 1's output columns are copied one-by-one to the ORIGINAL, unsuffixed
names used by every pre-existing piece of downstream code (so the rest of
the pipeline, written before the 3-level system existed, needed zero
changes — "the first message" throughout the rest of this file IS Level 1,
now sourced from the combined `msg1_text` blob instead of the single
`first_message` string, identical for the vast majority of contacts who
only ever get one pre-reply touch). Levels 2 and 3 are looped and written
to `<name>_lvl2`/`<name>_lvl3`.

### 9.2 Negative/rhetorical question detection — "a No is a Yes"

```r
.NEG_Q_PATTERN <- paste0(
  "\\b(wouldn.?t|shouldn.?t|couldn.?t|doesn.?t|didn.?t|isn.?t|aren.?t|",
  "wasn.?t|weren.?t|hasn.?t|haven.?t|hadn.?t|won.?t|can.?t)\\b[^.!?]{0,80}\\?",
  "|",
  "\\b(would|does|did|is|are|was|were|should|could|can|will|has|have|had)\\b",
  "\\s+\\w+\\s+not\\b[^.!?]{0,80}\\?")
has_negative_question <- function(txt) {
  as.integer(str_detect(txt, stringr::regex(.NEG_Q_PATTERN, ignore_case = TRUE)))
}
```
Matches two constructions, each requiring a `?` within 80 characters after
the trigger and before any sentence-ending punctuation: (a) a negated
auxiliary contraction (`wouldn't`, `isn't`, `doesn't`, ... — the `.?`
after each letter like `n.?t` tolerates both the curly/smart apostrophe and
a literal `.` typo) anywhere before the `?`; or (b) the fully spelled-out
`AUX + subject + not` form (e.g. "Would it not help..."). This is
*deliberately* a precise grammatical regex, not an AI classification — the
authors judged regex both cheaper and more reliable than AI for an exact
syntactic pattern like this.

Computed on all 4 SEND-ORDER POSITION buckets (not the 3 reply-round
levels): `neg_q_half1`, `neg_q_half2`, `neg_q_msg2`, `neg_q_msg3plus` — left
NA when that position wasn't sent (not coerced to 0), consistent with the
file's general "NA means not applicable, not false" convention.

### 9.3 `.first_at()` / `.POSITION_LEVELS` — the shared "first occurrence position" rollup

```r
.first_at <- function(h1, h2, m2, m3) {
  z <- function(x) ifelse(is.na(x), 0L, x)
  dplyr::case_when(
    z(h1) == 1 ~ "First half of message 1", z(h2) == 1 ~ "Second half of message 1",
    z(m2) == 1 ~ "Message 2", z(m3) == 1 ~ "Message 3+", TRUE ~ "Never")
}
.POSITION_LEVELS <- c("Never","First half of message 1","Second half of message 1","Message 2","Message 3+")
```
Given the 4 position-bucket binary flags for one signal, returns a single
categorical value: the EARLIEST position at which that signal first fired,
or `"Never"` if it never did at any position that was actually sent. Note
`z()` treats NA as 0 HERE specifically — a position that was never sent
trivially "didn't fire there", so this combined summary rolls NA into
"didn't happen at this position" for the purpose of finding the first
position that DID fire; it's a different (and compatible) convention from
the per-position flags staying NA. This exact helper (and `.POSITION_LEVELS`
as the category order) is reused for EVERY "when does X first happen"
signal in the file: negative questions, calendar links, "about us", "asks
for a meeting", "proposes a specific day/time", and "forward scheduling".

`neg_q_any` = 1 if `neg_q_first_at != "Never"` (i.e. fired anywhere) else 0.

### 9.4 Calendar/scheduling link sharing ("being forward" — regex part)

```r
has_calendar_link <- function(txt) {
  as.integer(str_detect(txt, stringr::regex(.CALENDAR_LINK_PATTERN, ignore_case = TRUE)))
}
```
Same `.CALENDAR_LINK_PATTERN` from Section 2 (known scheduling-tool
domains + generic "calendar/booking link" phrasing), applied to the 4
position buckets -> `calendar_link_half1/half2/msg2/msg3plus`, rolled up
via `.first_at()`/`.POSITION_LEVELS` into `calendar_link_first_at` and
`calendar_link_any`.

A SEPARATE pair of columns, `calendar_link_lvl2`/`calendar_link_lvl3`, apply
the identical regex to `msg2_text`/`msg3_text` (the REPLY-ROUND level text,
not the send-order position text) — these feed the Level-2/3 research
blocks specifically and are stored as a 2-level character label
(`"Shares calendar link"` / `"No calendar link"`), matching the
`uses_abbreviations`-style string-label convention rather than a bare 0/1,
because they're meant to go straight into a `rate_by()` breakdown.

### 9.5 Prospect name usage

```r
.strip_name_title <- function(x) sub("^(Dr|Mr|Mrs|Ms|Miss|Prof|Rev)\\.?\\s+", "", trimws(x), ignore.case = TRUE)
.first_token <- function(x) vapply(strsplit(x, "\\s+"), function(w) if (length(w)) w[1] else "", character(1))
dat$contact_first_name <- stringr::str_to_title(
  gsub("[^A-Za-z'-]", "", .first_token(.strip_name_title(dat$contact_name %||% ""))))
dat$contact_first_name[nchar(dat$contact_first_name) < 2] <- NA_character_
```
Derives a likely first name from the free-text `contact_name` field: strip
a leading title (Dr./Mr./Mrs./Ms./Miss/Prof./Rev., optional trailing period),
take the first whitespace-delimited token, strip everything but
letters/apostrophes/hyphens, title-case it. Names under 2 characters (bare
initials) become `NA` rather than risking false-positive matches.

```r
uses_contact_name <- function(txt, name) {
  ok  <- !is.na(txt) & !is.na(name) & nzchar(name)
  out <- rep(NA_integer_, length(txt))
  if (any(ok)) out[ok] <- as.integer(stringr::str_detect(txt[ok], paste0("\\b", name[ok], "\\b")))
  out
}
```
**Deliberately case-SENSITIVE**, whole-word match of the title-cased name
against the raw message text — e.g. looks for `\bWill\b`, not
`\b[Ww]ill\b` — specifically because several common first names are also
ordinary lowercase English words (Will, Grace, Mark, Hope, Drew), and a
case-insensitive match would false-positive on "i will call you" the same
way a genuine "Hi Will," would match. Applied to `first_message` (-> `uses_name_first`), `second_bdr_message`
(-> `uses_name_second`), and `bdr_reply_after_reply` (-> `uses_name_followup`);
`uses_name_any` = 1 if any of the three (NA treated as 0 for this combined flag) fired.

### 9.6 Connection-count controls, timing, profile completeness

- `log_connections`/`log_followers` = `log1p()` of `linkedin_connections`/
  `follower_count` (log(1+x), so zero is defined) — used throughout the file
  as regression covariates to "control for" network size.
- `conn_quintile`: `linkedin_connections` cut into quintiles via
  `quantile(probs = seq(0,1,0.2))`, deduplicated breakpoints, only computed
  if any connection data exists at all. (Not obviously read downstream by
  name elsewhere in this file as of this version — still computed for
  parity/potential future use; `conn_label`, a separate fixed-breakpoint
  bucketing, is what the output JSON's `by_connections` breakdown actually
  uses — see below.)
- `first_outreach_dt` = `as.Date(substr(first_outreach_date, 1, 10))`
  (first 10 chars only, i.e. just the date part of an ISO datetime);
  `send_dow` = weekday name; `send_month` = `"YYYY-MM"`.
- `time_of_day` (from `first_msg_hour`, already US-Central from Section 2):
  Early morning (5-8a) / Morning (9-11a) / Afternoon (12-2p) /
  Late afternoon (3-5p) / Evening (6-9p) / Overnight (10p-4a, i.e. the
  `case_when` catch-all for any hour not in the 5 explicit ranges above —
  note hours 0-4 and 22-23 both fall here). `day_time` = `"<send_dow>
  <time_of_day with its parenthetical range stripped>"`, e.g.
  `"Monday Afternoon"`.
- **Connection-request send time** (distinct from first-outreach/acceptance
  date): parses `conn_request_sent` (UTC) the same way, converts to US
  Central, derives `request_send_hour`/`request_send_dow`/
  `request_time_of_day`/`request_day_time` using the identical `tod_from_hour()`
  bucketing function. This is specifically "when did the connection INVITE
  go out" (judge by `connect_rate`/acceptance), as opposed to `time_of_day`
  above which is "when did the first MESSAGE send" (judge by reply/meeting
  rate) — two genuinely different timing questions, reported separately in
  the final JSON (`day_of_week`/`time_of_day`/`day_time` vs.
  `request_day_of_week`/`request_time_of_day`/`request_day_time`).
- `bdr_followup_bucket` = `hours_to_bdr_followup` cut into
  `<1h / 1-3h / Same day (3-24h) / 1-3 days / 3+ days`.
- `about_len`/`experience_len`/`education_len` = `nchar()` of the
  corresponding enrichment JSON string fields, 0 if missing (used as
  "profile completeness" numeric features/signals, NOT NA — unlike almost
  everything else in this file, a missing profile genuinely means "0
  characters of profile", not "unknown").
- `prospect_reply_len` = `nchar(prospect_first_reply)`, NA if no reply.
- `total_messages_bucket` = `total_messages` cut into `1 / 2 / 3 / 4-5 /
  6-10 / 11+` (note: `right = FALSE` — these are HALF-OPEN intervals
  `[lo, hi)`, e.g. the "4-5" bucket is actually `[4,6)` i.e. values 4 or 5).
- `conn_label` = `linkedin_connections` cut into the FIXED (not quantile)
  breakpoints `<500 / 500-999 / 1,000-2,499 / 2,500-4,999 / 5,000+`
  (`right = FALSE`, half-open) — this, not `conn_quintile`, is what the
  `by_connections` output breakdown actually groups by.
- `reply_len_bucket` = `prospect_reply_len` cut into `Very short (<40) /
  Short (40-120) / Medium (120-300) / Long (300+)`.

---

## 10. Section 4 — AI feature extraction (`lama.batch`) with incremental cache

### 10.1 Valid-value enumerations and numeric field lists

```r
AI_VALID <- list(
  msg_tone         = c("genuine","flattering","salesy","generic","conversational"),
  msg_hook_type    = c("PostReaction","NewsAward","PersonalCompliment","GenericIntro",
                        "EventConference","SharedInterest","Other"),
  reason_to_connect= c("SharedBackground","ReactingToContent","MutualInterest",
                        "DirectValueProp","Referral","Congratulations",
                        "CuriosityQuestion","Unclear"),
  contact_seniority= c("C-Suite","VP","Director","Manager","IC","Unknown"),
  contact_org_type = c("HealthSystem","Hospital","PhysicianGroup","Payer",
                        "VendorTech","Other","Unknown"),
  question_type    = c("AboutThem","AboutMeeting","Rhetorical","None"),
  personal_share   = c("None","Generic","Unique"),
  fu_approach      = c("AnsweredQuestion","PushedForMeeting","GaveValue",
                        "SoftCheckin","SharedResource","None"),
  meeting_ask_style = c("Question","Statement","None")  # only scored by LEVEL2/LEVEL3 prompts
)
AI_NUMERIC <- c("pct_about_prospect","pct_about_bdr","ai_sounding","specific_detail",
                "emotion_level","flattery_level","cta_ai","connection_quality","salesy_score",
                "reply_enthusiasm","fu_energy",
                "about_us_half1","meeting_ask_half1","datetime_propose_half1",
                "about_us_half2","meeting_ask_half2","datetime_propose_half2",
                "about_us_msg2","meeting_ask_msg2","datetime_propose_msg2",
                "about_us_msg3plus","meeting_ask_msg3plus","datetime_propose_msg3plus")
LEVELED_AI_NUMERIC <- c("pct_about_prospect","pct_about_bdr","ai_sounding","specific_detail",
                        "emotion_level","flattery_level","cta_ai","connection_quality","salesy_score")
LEVELED_AI_FACTOR  <- c("msg_tone","msg_hook_type","reason_to_connect","question_type","personal_share",
                        "meeting_ask_style")
AI_NUMERIC <- c(AI_NUMERIC, paste0(LEVELED_AI_NUMERIC, "_lvl2"), paste0(LEVELED_AI_NUMERIC, "_lvl3"))
AI_COLS <- c(AI_NUMERIC, names(AI_VALID), paste0(LEVELED_AI_FACTOR, "_lvl2"), paste0(LEVELED_AI_FACTOR, "_lvl3"))
```
`contact_seniority`/`contact_org_type` are prospect ATTRIBUTES, not
message-dependent, so they're only ever scored once (by `FIRST_PROMPT`) and
NOT repeated per level. Every other `LEVELED_AI_NUMERIC`/`LEVELED_AI_FACTOR`
field is scored 3 times total: unsuffixed (Level 1, via `FIRST_PROMPT`),
`_lvl2` (via `LEVEL2_PROMPT`), `_lvl3` (via `LEVEL3_PROMPT`).

### 10.2 Parsing helpers (shared by every prompt's response parser)

```r
parse_field <- function(x, key) {
  m <- stringr::str_match(as.character(x),
                          stringr::regex(paste0(key, "=(\\S+)"), ignore_case = TRUE))
  m[, 2]
}
coerce_valid <- function(x, valid) {
  norm <- function(s) tolower(gsub("[^a-z0-9]", "", tolower(s)))
  vn <- norm(valid); xn <- norm(x)
  out <- rep(NA_character_, length(x))
  hit <- match(xn, vn)
  out[!is.na(hit)] <- valid[hit[!is.na(hit)]]
  out
}
clampi <- function(x, lo, hi) { v <- suppressWarnings(as.numeric(x)); pmin(pmax(v, lo), hi) }
```
`parse_field(raw, key)`: for every raw reply string, regex-extracts the
non-whitespace token immediately following `KEY=` (case-insensitive key
match); returns NA where the key wasn't found at all (length-preserving —
one output per input, critical so parsed columns stay row-aligned even
when some replies are malformed/truncated).
`coerce_valid(x, valid)`: normalizes both the extracted value and every
allowed enum value (lowercase, alphanumeric-only) before matching, so e.g.
`"C-Suite"`, `"c_suite"`, `"CSuite"` all resolve to the canonical
`"C-Suite"`; anything that doesn't match any allowed value becomes NA
(a mismatched/hallucinated category is silently dropped, not errored).
`clampi(x, lo, hi)`: coerces to numeric (non-numeric -> NA, warning
suppressed) and clamps into `[lo, hi]` — defends against a model replying
e.g. `"AI=7"` when the prompt said the range is 1-5.

### 10.3 The five prompt templates — reproduce verbatim

These templates are substituted via `[column_name]` placeholders (see
Section 3 of this guide for the templating contract) and must be copied
**character-for-character** into a port, since the business logic (what the
model is instructed to do) lives entirely in this prose. A port's own
prompt-formatting mechanism may differ, but the instructional TEXT itself
is not something to paraphrase or "improve" — it is calibrated output.

**`FIRST_PROMPT`** (Level 1 — everything before the prospect's 1st reply):
```r
FIRST_PROMPT <- paste0(
  "You are analyzing the LinkedIn outreach message(s) a sales rep (BDR) sent to a prospect BEFORE ",
  "the prospect ever replied (usually just one message; occasionally more than one pre-reply touch).\n",
  "MESSAGE(S): [msg1_text_clean]\n",
  "PROSPECT TITLE: [contact_title_clean]\n",
  "PROSPECT COMPANY: [contact_company_clean]\n\n",
  "Return ONE line, space-separated, EXACTLY this format and nothing else:\n",
  "PROSPECT=<0-100> BDR=<0-100> AI=<1-5> SPECIFIC=<0 or 1> TONE=<genuine|flattering|salesy|generic|conversational> ",
  "HOOK=<PostReaction|NewsAward|PersonalCompliment|GenericIntro|EventConference|SharedInterest|Other> ",
  "REASON=<SharedBackground|ReactingToContent|MutualInterest|DirectValueProp|Referral|Congratulations|CuriosityQuestion|Unclear> ",
  "EMOTION=<1-5> FLATTERY=<1-5> CTA=<0 or 1> QUALITY=<0-100> SALESY=<1-5> ",
  "QTYPE=<AboutThem|AboutMeeting|Rhetorical|None> SENIORITY=<C-Suite|VP|Director|Manager|IC|Unknown> ",
  "ORG=<HealthSystem|Hospital|PhysicianGroup|Payer|VendorTech|Other|Unknown> ",
  "PERSONAL=<none|generic|unique>\n\n",
  "HOW TO SET PROSPECT AND BDR (read carefully, these are the most important fields):\n",
  "Step 1 - Mentally split the message into clauses/sentences and drop pure filler ",
  "(greetings like 'Hi Sarah,', sign-offs, 'thanks', 'looking forward to connecting') - filler counts toward NEITHER side.\n",
  "Step 2 - Classify each remaining clause as ABOUT THE PROSPECT (their name/role/company/team/post/",
  "award/quote/achievement/question directed at them) or ABOUT THE BDR/SENDER (the sender's own name/role/",
  "company/product/pitch/credentials, a shared connection framed around the sender, or the ask to connect/meet).\n",
  "Step 3 - PROSPECT = the share (0-100) of the substantive (non-filler) content that is about the prospect. ",
  "BDR = the share (0-100) of the substantive content that is about the sender. PROSPECT+BDR<=100 ",
  "(the remainder is filler/neutral). Base this on substance and specificity, not raw word count - one short but ",
  "highly specific clause about the prospect (e.g. naming their exact post/award) outweighs several generic filler words.\n",
  "Calibration anchors - use these as reference points, do not default to 50/50 unless the message is genuinely balanced:\n",
  "  * Message ONLY reacts to something specific the prospect did/posted, with no mention of the sender's company or an ask -> PROSPECT=85-100, BDR=0-15.\n",
  "  * Generic template that jumps straight to a role/company/industry self-intro and pitch (e.g. ",
  "\"I'm a rep at a healthcare vendor, we help hospitals cut costs, want to connect?\") with no prospect-specific detail -> PROSPECT=0-15, BDR=70-90.\n",
  "  * One clause complimenting something specific about the prospect PLUS one clause pitching the sender's company/product -> PROSPECT=35-50, BDR=35-50.\n",
  "  * Message names a mutual/shared detail (same school, same city, same event) framed as 'we both...' -> split that clause's weight evenly between PROSPECT and BDR.\n",
  "Most real messages lean clearly toward one side - only use values near 50/50 when the split is truly even.\n\n",
  "AI=how AI-generated/templated it sounds (5=obviously AI, 1=clearly human). ",
  "SPECIFIC=1 if it cites a specific researched detail about THIS prospect (a named post/award/quote/project), else 0. ",
  "TONE=dominant tone. HOOK=opening strategy. REASON=the main implied reason given to connect. ",
  "EMOTION=emotional intensity 1-5. FLATTERY=how flattering 1-5. CTA=1 if a clear call-to-action. ",
  "QUALITY=how specific and compelling the hook is 0-100 (0=generic spam, 100=irresistibly relevant). ",
  "SALESY=how salesy/pitchy it feels 1-5 (5=hard pitch). ",
  "QTYPE=if it asks a question, is it AboutThem, AboutMeeting, Rhetorical, or None. ",
  "SENIORITY/ORG classify the prospect from title/company. ",
  "PERSONAL=does the SENDER share something personal about THEMSELVES (not just their company/product)? ",
  "none=shares nothing personal; generic=a vague or common personal claim anyone could make ",
  "(e.g. 'I have deep experience in healthcare', 'I'm passionate about patient care'); ",
  "unique=a specific, distinctive personal detail or shared life experience ",
  "(e.g. lived in the same town, went to the same school, hiked the same trail, a named hobby/experience they share with the prospect). ",
  "Reply with only the one formatted line."
)
```
Parsed by `parse_first(raw)` into: `pct_about_prospect`/`pct_about_bdr`
(clamped 0-100), `ai_sounding`/`emotion_level`/`flattery_level`/`salesy_score`
(clamped 1-5), `specific_detail`/`cta_ai` (clamped 0-1),
`connection_quality` (clamped 0-100), plus the 6 enum fields
`msg_tone`/`msg_hook_type`/`reason_to_connect`/`question_type`/
`contact_seniority`/`contact_org_type`/`personal_share` (coerced against
`AI_VALID`).

**`FOLLOWUP_PROMPT`** (scored only for rows where `replied==1` and reply
text exists — one call per row over the WHOLE `conversation_history`, not
scoped to a level):
```r
FOLLOWUP_PROMPT <- paste0(
  "Here is a LinkedIn conversation between a BDR (sales rep) and a Contact (prospect). ",
  "Focus on what the BDR did AFTER the contact's FIRST reply.\n",
  "CONVERSATION: [conversation_history_clean]\n\n",
  "Return ONE line, space-separated, EXACTLY:\n",
  "ENTHUSIASM=<1-5> FUAPPROACH=<AnsweredQuestion|PushedForMeeting|GaveValue|SoftCheckin|SharedResource|None> FUENERGY=<1-5>\n",
  "ENTHUSIASM=how warm/enthusiastic the contact's first reply was (1 cold-5 excited). ",
  "FUAPPROACH=the BDR's main approach in the message right after that reply (None if BDR never responded). ",
  "FUENERGY=how well the BDR matched the contact's energy/tone (1 poorly-5 perfectly). ",
  "Reply with only the one line."
)
```
Parsed by `parse_followup(raw)` -> `reply_enthusiasm`/`fu_energy` (clamped
1-5), `fu_approach` (enum).

**`POSITION_PROMPT`** (scored for every row with a non-empty
`first_message` — ONE call covering all 4 send-order position buckets at
once):
```r
POSITION_PROMPT <- paste0(
  "You are analyzing FOUR segments of ONE BDR's LinkedIn outreach sequence to a single prospect, ",
  "in the order they were sent. Some segments are '(not sent)' - that position never happened, ",
  "so just answer 0/0 for it.\n\n",
  "SEGMENT A (first half of message 1): [seg_half1_prompt]\n",
  "SEGMENT B (second half of message 1): [seg_half2_prompt]\n",
  "SEGMENT C (message 2): [seg_msg2_prompt]\n",
  "SEGMENT D (message 3 or later, combined): [seg_msg3plus_prompt]\n\n",
  "For EACH segment (A, B, C, D) that isn't '(not sent)', answer three yes/no questions about THAT ",
  "segment ONLY (don't let other segments influence it):\n",
  "ABOUTUS = 1 if that segment's dominant subject is the SENDER/BDR or their own company/product/pitch ",
  "(their role, company, offering, credentials, or the ask to connect/meet framed around themselves/their ",
  "company - e.g. 'I'm a ... at ...', 'we help ... do ...', 'would love to connect'), 0 if it's about the ",
  "prospect, pure filler/greeting/sign-off, or not sent.\n",
  "MEETING = 1 if that segment explicitly asks for a call/meeting/time (e.g. 'grab 15 minutes', 'would love ",
  "to chat/hop on a call', 'open to a quick call', proposes or asks for a day/time), 0 otherwise or if not sent.\n",
  "DATETIME = 1 ONLY if that segment proposes, suggests, or asks about one or more SPECIFIC days and/or ",
  "times to meet (e.g. 'Does Tuesday at 2pm work?', 'I'm free Thursday or Friday next week', 'How about the ",
  "14th?', naming a day-of-week, a date, or a time-of-day), 0 if it only vaguely asks to meet/chat without ",
  "naming any specific day or time (a plain MEETING=1 with no named day/time is DATETIME=0), or not sent.\n\n",
  "Return ONE line, space-separated, EXACTLY this format and nothing else:\n",
  "A_ABOUTUS=<0 or 1> A_MEETING=<0 or 1> A_DATETIME=<0 or 1> B_ABOUTUS=<0 or 1> B_MEETING=<0 or 1> B_DATETIME=<0 or 1> ",
  "C_ABOUTUS=<0 or 1> C_MEETING=<0 or 1> C_DATETIME=<0 or 1> D_ABOUTUS=<0 or 1> D_MEETING=<0 or 1> D_DATETIME=<0 or 1>"
)
```
Parsed by `parse_position(raw)` into 12 fields:
`about_us_half1`/`meeting_ask_half1`/`datetime_propose_half1` (from
A_ABOUTUS/A_MEETING/A_DATETIME), and the same triple for `half2`/`msg2`/
`msg3plus` from segments B/C/D respectively — all clamped 0-1.

**`LEVEL2_PROMPT`** (scored only for `has_msg2==1` rows, against
`msg2_text_prompt`):
```r
LEVEL2_PROMPT <- paste0(
  "You are analyzing LinkedIn message(s) a sales rep (BDR) sent a prospect AFTER the prospect's ",
  "FIRST reply but BEFORE their SECOND reply - an early back-and-forth, not the opening ask to connect.\n",
  "MESSAGE(S): [msg2_text_prompt]\n",
  "PROSPECT TITLE: [contact_title_clean]\n",
  "PROSPECT COMPANY: [contact_company_clean]\n\n",
  "Return ONE line, space-separated, EXACTLY this format and nothing else:\n",
  "PROSPECT=<0-100> BDR=<0-100> AI=<1-5> SPECIFIC=<0 or 1> TONE=<genuine|flattering|salesy|generic|conversational> ",
  "HOOK=<PostReaction|NewsAward|PersonalCompliment|GenericIntro|EventConference|SharedInterest|Other> ",
  "REASON=<SharedBackground|ReactingToContent|MutualInterest|DirectValueProp|Referral|Congratulations|CuriosityQuestion|Unclear> ",
  "EMOTION=<1-5> FLATTERY=<1-5> CTA=<0 or 1> QUALITY=<0-100> SALESY=<1-5> ",
  "QTYPE=<AboutThem|AboutMeeting|Rhetorical|None> PERSONAL=<none|generic|unique> ",
  "ASKSTYLE=<Question|Statement|None>\n\n",
  "PROSPECT/BDR = the share (0-100) of substantive content about the prospect vs. about the sender/BDR ",
  "(PROSPECT+BDR<=100, remainder is filler/neutral) - same rule as always: substance and specificity, not raw word count.\n",
  "AI=how AI-generated/templated it sounds (5=obviously AI, 1=clearly human). ",
  "SPECIFIC=1 if it cites a specific researched detail about THIS prospect, else 0. ",
  "TONE=dominant tone. ",
  "HOOK=the BDR's main ANGLE for keeping the conversation going at this point (reuse the same category list; ",
  "e.g. PostReaction if still reacting to something the prospect said/shared, DirectValueProp-style angles map to ",
  "GenericIntro/Other if there's no closer fit). ",
  "REASON=the main justification/reason the BDR gives for continuing to engage or follow up right now. ",
  "EMOTION=emotional intensity 1-5. FLATTERY=how flattering 1-5. CTA=1 if a clear call-to-action. ",
  "QUALITY=how specific and compelling this message is 0-100 (0=generic filler, 100=highly relevant/valuable). ",
  "SALESY=how salesy/pitchy it feels 1-5 (5=hard pitch). ",
  "QTYPE=if it asks a question, is it AboutThem, AboutMeeting, Rhetorical, or None. ",
  "PERSONAL=does the SENDER share something personal about THEMSELVES here (not just company/product)? ",
  "none=nothing personal; generic=a vague/common personal claim; unique=a specific, distinctive personal detail. ",
  "ASKSTYLE=if this message asks for or proposes a meeting/call, is that ask phrased as a direct interrogative ",
  "QUESTION (e.g. \"Would it make sense to meet?\", \"Should we find a time to connect?\", \"Are you free Tuesday?\") ",
  "or as a STATEMENT/suggestion (e.g. \"Let's grab 15 minutes\", \"I'd love to hop on a call\", \"Happy to set up ",
  "time whenever works\")? NONE if this message doesn't ask for or propose a meeting/call at all. ",
  "Reply with only the one formatted line."
)
```

**`LEVEL3_PROMPT`** is byte-for-byte identical to `LEVEL2_PROMPT` except:
the intro sentence reads *"...AFTER the prospect's SECOND reply - deeper
into an established back-and-forth conversation (likely discussing
specifics, logistics, or working toward a meeting), not the opening ask to
connect."* and the `MESSAGE(S):` line substitutes `[msg3_text_prompt]`
instead of `[msg2_text_prompt]`. Everything else — the output format line,
every field's explanation, the ASKSTYLE examples — is identical text.

Both are parsed by the same shared function:
```r
parse_level_msg <- function(raw, suffix) {
  d <- data.frame(
    pct_about_prospect = clampi(parse_field(raw, "PROSPECT"), 0, 100),
    pct_about_bdr      = clampi(parse_field(raw, "BDR"),      0, 100),
    ai_sounding        = clampi(parse_field(raw, "AI"),       1, 5),
    specific_detail    = clampi(parse_field(raw, "SPECIFIC"), 0, 1),
    emotion_level      = clampi(parse_field(raw, "EMOTION"),  1, 5),
    flattery_level     = clampi(parse_field(raw, "FLATTERY"), 1, 5),
    cta_ai             = clampi(parse_field(raw, "CTA"),      0, 1),
    connection_quality = clampi(parse_field(raw, "QUALITY"),  0, 100),
    salesy_score       = clampi(parse_field(raw, "SALESY"),   1, 5),
    msg_tone           = coerce_valid(parse_field(raw, "TONE"),     AI_VALID$msg_tone),
    msg_hook_type      = coerce_valid(parse_field(raw, "HOOK"),     AI_VALID$msg_hook_type),
    reason_to_connect  = coerce_valid(parse_field(raw, "REASON"),   AI_VALID$reason_to_connect),
    question_type      = coerce_valid(parse_field(raw, "QTYPE"),    AI_VALID$question_type),
    personal_share     = coerce_valid(parse_field(raw, "PERSONAL"), AI_VALID$personal_share),
    meeting_ask_style  = coerce_valid(parse_field(raw, "ASKSTYLE"), AI_VALID$meeting_ask_style),
    stringsAsFactors = FALSE)
  names(d) <- paste0(names(d), suffix)
  d
}
```
called as `parse_level_msg(raw_lvl2, "_lvl2")` / `parse_level_msg(raw_lvl3, "_lvl3")`.

### 10.4 Incremental disk cache

```r
dat$ai_key <- paste0(dat$linkedin_url, "|", dat$first_outreach_date)
CACHE_NAME <- "connect_ai_cache"
```
Cache key = `linkedin_url + "|" + first_outreach_date` (a prospect could in
theory be re-contacted later under a different `first_outreach_date`,
which would get a fresh cache key and be rescored — intentional, since the
conversation content for a new outreach attempt would differ).

`CFG$rescan_all == TRUE`: deletes every per-prompt progress-checkpoint file
(`lama_first_progress.rds`, `lama_followup_progress.rds`,
`lama_position_progress.rds`, `lama_level2_progress.rds`,
`lama_level3_progress.rds`) so a full rescore can't accidentally resume
from stale partial progress.

`CFG$use_cache == TRUE` (and not rescanning): loads the cache (if present),
matches `dat$ai_key` against `cache$ai_key`, and for every `AI_COLS` column
present in the cache, backfills `dat[[col]]` from the matching cache row
wherever a match exists (`ifelse(!is.na(m), cache[[col]][m], dat[[col]])`
— ties are impossible since `dat[[col]]` starts all-NA at this point, see
next step).

### 10.5 Scoring loop (`CFG$run_ai == TRUE`)

Every `AI_COLS` column is first initialized to all-NA (numeric or
character as appropriate) BEFORE the cache backfill above runs, so the
"need to score" checks below (`is.na(...)`) correctly distinguish
cache-hit rows from rows that still need a live API call.

Five independent "need" checks, each gated on both a population condition
AND "not already scored" (so re-running the script never re-pays for
already-cached rows) — **note the explicit multi-field backfill checks**,
added when a prompt's output format gained a new field after the cache was
already populated by an older prompt version, so OLD cached rows get
reprocessed exactly once to backfill the new field rather than silently
staying NA forever:

1. **Level 1** — `need1 = which(has_msg1==1 & is.na(pct_about_prospect))`.
   Calls `lama.batch(dat[need1,], FIRST_PROMPT, ...)`, parses with
   `parse_first()`, writes every parsed column back into `dat[need1, col]`.
2. **Follow-up** — `need2 = which(replied==1 & has_reply_text==1 &
   is.na(reply_enthusiasm))`. `lama.batch(..., FOLLOWUP_PROMPT, ...)`,
   `parse_followup()`.
3. **Position** — `need3 = which(!is.na(first_message) & nchar(first_message)>0 &
   (is.na(about_us_half1) | is.na(datetime_propose_half1)))` — the OR
   against `datetime_propose_half1` specifically exists to backfill rows
   cached from before the DATETIME field was added to `POSITION_PROMPT`.
   `lama.batch(..., POSITION_PROMPT, ...)`, `parse_position()`.
4. **Level 2** — `need_lvl2 = which(has_msg2==1 & (is.na(pct_about_prospect_lvl2) |
   is.na(meeting_ask_style_lvl2)))` — same backfill-on-schema-change pattern
   for the ASKSTYLE field. `lama.batch(..., LEVEL2_PROMPT, ...)`,
   `parse_level_msg(raw, "_lvl2")`.
5. **Level 3** — identical to Level 2, gated on `has_msg3==1` and
   `pct_about_prospect_lvl3`/`meeting_ask_style_lvl3`, using `LEVEL3_PROMPT`.

Each `lama.batch()` call passes: `batch.size = CFG$ai_batch`, `model.in =
CFG$ai_model`, `fail_value = ""` (a failed row's raw reply becomes empty
string, which every parser naturally turns into all-NA fields),
`resume = TRUE`, the prompt-specific `max_tokens`, `disable_reasoning =
TRUE`, and a dedicated `partial_save_file` per prompt (so an interrupted
multi-thousand-row run resumes from its own progress file, not a shared
one).

**Cache update** (only if `CFG$use_cache`): builds `new_cache` from
`dat[, c("ai_key", AI_COLS)]`, keeps only rows with at least one non-NA
score (`!is.na(pct_about_prospect) | !is.na(reply_enthusiasm)` — i.e. drop
rows that were never scored by ANY prompt this run or a prior one), then
merges with the old on-disk cache (old rows whose `ai_key` isn't in the new
set are kept, i.e. this is an upsert keyed by `ai_key`, not a full
replace), and writes the merged result back via `saver()`.

### 10.6 Post-scoring enforcement: R is the source of truth for "did this happen"

```r
dat$about_us_half1[is.na(dat$seg_half1)] <- NA_real_
dat$meeting_ask_half1[is.na(dat$seg_half1)] <- NA_real_
dat$datetime_propose_half1[is.na(dat$seg_half1)] <- NA_real_
# ... (same pattern for half2/msg2/msg3plus, 12 lines total) ...
```
Regardless of what the AI replied for a `"(not sent)"` placeholder segment
(it's told to answer 0/0/0, but this is never trusted blindly), every
position-triple field is forced back to NA wherever the underlying R-side
segment (`seg_half1`/`seg_half2`/`seg_msg2`/`seg_msg3plus`) is itself NA
(i.e. that position was never actually sent). **This runs unconditionally,
even when `CFG$run_ai == FALSE`**, so these columns always exist in a
structurally valid (if entirely NA) shape for every downstream signal/
research-block reference regardless of whether AI scoring ran at all.

Then the three "first occurrence position" rollups are built exactly like
`neg_q_first_at`/`calendar_link_first_at` in Section 3:
`about_us_first_at`, `meeting_ask_first_at`, `datetime_propose_first_at`
(via `.first_at()` + `.POSITION_LEVELS`), plus their `_any` summary flags.

### 10.7 "Forward scheduling" — combined signal

```r
.or_na <- function(a, b) {
  out <- pmax(a, b, na.rm = TRUE)
  out[is.na(a) & is.na(b)] <- NA_real_
  out
}
dat$forward_sched_half1    <- .or_na(dat$calendar_link_half1,    dat$datetime_propose_half1)
# ... (same for half2/msg2/msg3plus) ...
```
A position counts as "forward about scheduling" if EITHER the regex
calendar-link flag OR the AI-classified "proposes a specific day/time" flag
fired at that position; the result is NA only if BOTH inputs are NA (the
position never existed) — any real 0/1 on either side beats a co-occurring
NA on the other (R's `pmax(..., na.rm=TRUE)` ignores NAs when picking the
max per-element, which gives exactly this "either real value wins" effect;
a port must replicate this per-element "ignore NA unless both are NA"
semantic explicitly, since most languages' plain `max()` either errors or
silently propagates a null/NaN). Rolled up the same way into
`forward_sched_first_at`/`forward_sched_any`.

Finally: `pct_about_bdr <- ifelse(is.na(pct_about_bdr) & !is.na(pct_about_prospect),
pmax(0, 100 - pct_about_prospect), pct_about_bdr)` — a fallback derivation
only used if the AI returned a PROSPECT value but somehow not a BDR value.

---

## 11. Section 5 — Blended score + binary signal matrix + feature registry

### 11.1 `blended_score()`

```r
blended_score <- function(connect, reply, sched) {
  w <- CFG$blend_weights
  100 * (w[["connected"]] * connect + w[["replied"]] * reply +
           w[["scheduled"]] * sched) / sum(w)
}
```
A weighted average of 3 RATES (each 0-1, e.g. a mean of a 0/1 column, or a
model's predicted probability), scaled to 0-100. Weights default to
`connected=0.15, replied=0.35, scheduled=0.50` and are explicitly
normalized by `sum(w)` (so they needn't literally sum to 1 in config,
though the default does). Used both for the funnel-level `blended_score`
reported per segment (fed real rates) AND for each row's `opportunity_score`
(fed a model's 3 predicted probabilities — see Section 6).

### 11.2 The signal registry: `SIG` + `add_sig()`

```r
flag <- function(cond) as.integer(cond)
SIG <- tibble::tibble(
  id = character(), label = character(), category = character(),
  scope = character(), primary_outcome = character()
)
add_sig <- function(id, expr, label, category, scope = "all", outcome = "replied") {
  dat[[paste0("sig_", id)]] <<- flag(expr)
  SIG <<- dplyr::bind_rows(SIG, tibble::tibble(
    id = id, label = label, category = category, scope = scope, primary_outcome = outcome))
}
```
**Porting note on `<<-`:** this is R's "superassignment" operator — it
assigns into the nearest ENCLOSING scope's existing binding (here, the
global `dat`/`SIG` created just above), not a local variable inside
`add_sig`'s own call frame. Every call to `add_sig()` has the side effect
of (a) adding a new `sig_<id>` column to the global `dat` data frame, and
(b) appending one row describing that signal to the global `SIG` registry
table. A port should model this as: a `registerSignal(id, predicateFn,
label, category, scope, outcome)` function that computes the predicate
over the full row-set once, stores the resulting column in the central
data table, and appends a metadata row to a central signal-registry table
— i.e. exactly the same two side effects, just via explicit mutation of
passed-in (or module-level) state rather than R's lexical superassignment.

`flag(cond)` = `as.integer(cond)`: converts a logical vector (TRUE/FALSE/NA)
to 1/0/NA. Every signal is therefore a tri-state (1 / 0 / NA) column, not
a strict boolean — NA signals "the inputs needed to evaluate this
predicate were themselves missing" (e.g. `dat$msg_tone == "genuine"` is NA
wherever `msg_tone` is NA), and this NA MUST propagate into the signal
column rather than being coerced to 0, because the downstream effect-size
engine (Section 7) explicitly filters out NA rows from each arm rather than
counting them as "without the signal".

### 11.3 Full Level-1 signal list (registered via `add_sig()`, in this exact order)

Each row below is one `add_sig(id, <condition expression>, "<label>",
"<category>", scope="<default: all>", outcome="<default: replied>")` call.
Reproduce every one — the `id` strings are referenced later by the keys
engine's level-filtering logic (`!grepl("_lvl[23]$", id)`).

**Personalization**
| id | condition | outcome |
|---|---|---|
| high_prospect_focus | `pct_about_prospect >= 60` | replied |
| mostly_about_us | `pct_about_bdr >= 60` | replied |
| specific_detail | `specific_detail == 1` | replied |
| personal_unique | `personal_share == "Unique"` | replied |
| personal_generic | `personal_share == "Generic"` | replied |

**AI feel**
| id | condition | outcome |
|---|---|---|
| sounds_ai | `ai_sounding >= 4` | replied |
| sounds_human | `ai_sounding <= 2` | replied |

**Tone** — 5 signals, `msg_tone == "conversational"/"genuine"/"flattering"/"salesy"/"generic"` -> `tone_conversational`/`tone_genuine`/`tone_flattering`/`tone_salesy`/`tone_generic` (all outcome=replied)

**Hook** — 4 signals, outcome=**connected** (not replied — these are about WHY they accepted the connection in the first place): `hook_post_reaction` (`msg_hook_type=="PostReaction"`), `hook_news_award` (`"NewsAward"`), `hook_shared_interest` (`"SharedInterest"`), `hook_personal_compliment` (`"PersonalCompliment"`)

**Reason to Connect** — 7 signals, outcome=replied: `reason_shared_background`, `reason_reacting_content`, `reason_mutual_interest`, `reason_value_prop`, `reason_referral`, `reason_congrats`, `reason_curiosity` (mapping to `reason_to_connect`'s 7 enum values 1:1, excluding `"Unclear"` which has no dedicated signal)

**Message Craft** (outcome=replied unless noted):
| id | condition |
|---|---|
| asks_question | `has_question == 1` |
| has_cta | `cta_ai == 1` |
| short_msg | `first_msg_nchar < 125` |
| long_msg | `first_msg_nchar > 250` |
| congratulatory | `has_congrats == 1` |
| quotes_them | `quotes_them == 1` |
| has_emoji | `has_emoji == 1` |
| multi_emoji | `emoji_use == "Multiple (2+)"` |
| uses_exclaim | `exclam_use != "None"` |
| multi_exclaim | `exclam_use == "Multiple (2+)"` |
| uses_abbrev | `uses_abbreviations == "Uses abbreviations"` |
| high_emotion | `emotion_level >= 4` |
| all_caps | `all_caps == 1` |
| has_thanks | `has_thank == 1` |
| has_stat | `has_stat == 1` |
| high_quality_hook | `connection_quality >= 70` |
| low_quality_hook | `connection_quality <= 30` |
| very_salesy (category=Tone) | `salesy_score >= 4` |
| easy_read | `fk_grade <= 8` |
| complex_read | `fk_grade >= 13` |

### 11.4 `add_level_content_sigs(sfx, scope)` — tripling the content signals for Levels 2/3

```r
add_level_content_sigs <- function(sfx, scope) {
  lvl <- if (scope == "has_msg2") "Msg 2" else "Msg 3+"
  g <- function(col) dat[[paste0(col, sfx)]]
  a <- function(id, expr, label, category) add_sig(paste0(id, sfx), expr, paste0(label, " (", lvl, ")"),
                                                     category, scope = scope, outcome = "scheduled")
  # Personalization, AI feel, Tone, Hook, Reason to Connect, Message Craft,
  # Opening Line - each re-registered with `g(col)` reading the
  # "_lvl2"/"_lvl3"-suffixed column instead of the unsuffixed one, and
  # EVERY one of them scoped to has_msg2/has_msg3 with outcome="scheduled"
  # (not "replied" - trivially 1 for this population by construction).
}
add_level_content_sigs("_lvl2", "has_msg2")
add_level_content_sigs("_lvl3", "has_msg3")
```
`g(col)` is a closure capturing `sfx` from the enclosing call, used to read
`dat[[paste0(col, sfx)]]` (e.g. `g("pct_about_prospect")` reads
`pct_about_prospect_lvl2` when `sfx="_lvl2"`). `a(id, expr, label,
category)` is a second closure wrapping `add_sig()`, pre-filling the
suffixed id, a level-annotated label (e.g. `"... (Msg 2)"`), the given
`scope` (`"has_msg2"`/`"has_msg3"`), and a fixed `outcome="scheduled"`.
**Porting note:** a port should implement this as a parameterized function
taking the suffix and scope as explicit arguments (no closures needed, just
pass them through) that calls the EXACT SAME 40ish `registerSignal(...)`
calls as the Level-1 block above, substituting the suffixed column reads
and the fixed scope/outcome — i.e., don't hand-duplicate the Level-1 block
into 3 copies; implement it once, parameterized, exactly as the source does.

Every Level-1 signal EXCEPT the following 2 categories is re-registered this
way (deliberately NOT repeated for Level 2/3, per explicit scope decisions
made with the user during development):
- **"Connect Ask"** (`connect_lets`/`connect_worth`/`connect_none`) — about
  getting a connection ACCEPTED; trivially moot by msg2/msg3 since the
  connection is already accepted by then.
- Audience/Follow-up/the various position-based (`neg_q_*`, `uses_name_*`,
  `about_us_*`, `meeting_ask_*`) signals stay exactly as registered at
  Level 1 scope — not tripled.

Two small mapping differences inside `add_level_content_sigs` vs. the
Level-1 block worth calling out explicitly so a port doesn't silently
diverge:
- `short_msg`/`long_msg` read `g("nchar")` (i.e. `nchar_lvl2`/`nchar_lvl3`
  from `compute_text_features()`'s own `nchar` output column), NOT
  `g("first_msg_nchar")` — there is no `first_msg_nchar_lvl2/3` column at
  all; the Level-1 signal happens to use the legacy-named
  `first_msg_nchar` alias instead of the generic `nchar`, but they hold
  identical values for Level 1.
- Two Level-2/3-only extra signals exist with no Level-1 counterpart,
  registered inside the same function body:
  `meeting_ask_question`/`meeting_ask_statement` (from
  `meeting_ask_style == "Question"/"Statement"`), `has_linebreak` (from
  `has_linebreak == "Has line break"`), and `shares_calendar_link` (from
  `calendar_link == "Shares calendar link"` — reads the `_lvl2`/`_lvl3`
  `calendar_link` column from Section 3.4, NOT the position-based
  `calendar_link_half1` etc.).

### 11.5 Remaining Level-1-only signals (registered after the two level-triple calls)

- **Negative/rhetorical question** ("a 'No' is a 'Yes'") — 5 signals on the
  4 send-order positions + the `_any` summary:
  `neg_question_half1`/`half2` (category="Message Craft", outcome=replied),
  `neg_question_msg2` (category="Follow-up", outcome=replied),
  `neg_question_msg3plus` (category="Follow-up", **scope="replied"**,
  outcome="scheduled" — note this ONE position signal, unlike the others in
  this group, is scoped to replied rows and scored against scheduled, not
  replied, since by message-3+ a reply has already happened by definition),
  `neg_question_any` (category="Message Craft", outcome=replied).
- **Uses prospect's name** — `uses_name_first`/`uses_name_second`
  (category="Personalization", outcome=replied), `uses_name_followup`
  (category="Personalization", scope="replied", outcome="scheduled"),
  `uses_name_any` (outcome=replied).
- **"When do we talk about ourselves"** — `about_us_half1`/`half2`
  (category="Personalization", outcome=replied), `about_us_msg2`
  (category="Follow-up", outcome=replied), `about_us_msg3plus`
  (category="Follow-up", scope="replied", outcome="scheduled"),
  `about_us_any` (outcome=replied).
- **"When do we ask for a meeting"** — identical scope/outcome pattern to
  "talk about ourselves" above, but category="Message Craft" for the
  half1/half2/any variants: `meeting_ask_half1`/`half2`/`msg2`/`msg3plus`/`any`.
- **"Being forward": calendar link / specific day-time / combined** — THREE
  parallel 5-signal families (`calendar_link_*`, `datetime_propose_*`,
  `forward_sched_*`), each following the same half1/half2(outcome=replied)
  -> msg2(**note**: `calendar_link_msg2`'s scope is "replied"/outcome
  "scheduled" — unlike `about_us_msg2`/`meeting_ask_msg2` which stay
  outcome=replied at the msg2 position; `datetime_propose_msg2` and
  `forward_sched_msg2` follow the same "replied"/"scheduled" pattern as
  `calendar_link_msg2`, i.e. this family of 3 is scoped more strictly than
  the "about us"/"meeting ask" family) -> msg3plus(scope=replied,
  outcome=scheduled) -> any(outcome=replied) pattern. **Reproduce the exact
  scope/outcome per id from the source — don't assume all 4 "timing"
  families use identical scope/outcome, they don't.**
- **Opening line** — `opener_question`/`opener_observation`/`opener_about_us`
  (category="Opening Line", outcome=replied) — registered a SECOND time
  here at Level 1 using the plain `opener_is_question`/`opener_type`
  columns (this is redundant with (but intentionally separate from) the
  Level-2/3 "Opening Line" signals registered inside
  `add_level_content_sigs`, which read the suffixed columns instead).
- **Question type** — `q_about_them`/`q_about_meeting` (category="Message
  Craft", outcome=replied) — also a second Level-1-only registration,
  mirroring the Level-2/3 ones inside `add_level_content_sigs`.
- **Connect-ask phrasing** — `connect_lets`/`connect_worth`/`connect_none`
  (category="Connect Ask", **outcome="connected"**) — the only 3 signals in
  the entire file scored against `connected` as their primary outcome
  besides the Hook family.
- **Audience** (prospect attributes; outcome="connected" for all 6):
  ```r
  dat$is_executive    <- as.integer(dat$contact_seniority %in% c("C-Suite", "VP"))
  dat$executive_label <- ifelse(is.na(dat$contact_seniority), NA_character_,
                                ifelse(dat$is_executive == 1, "Executive (C-Suite/VP)", "Non-Executive"))
  ```
  `aud_csuite`/`aud_vp`/`aud_director` (from `contact_seniority`),
  `aud_executive` (from the derived `is_executive`), `aud_complete_profile`
  (`experience_len >= 800`), `aud_well_connected`
  (`linkedin_connections >= 2000`). `is_executive`/`executive_label` are
  ALSO reused as one of the 4 audience-composition dimensions in Section 9's
  `audience_profile_block()`.
- **Follow-up** (`scope="replied"`, `outcome="scheduled"` for every one of
  these 10): `fu_fast` (`hours_to_bdr_followup <= 3`), `fu_sameday`
  (`<= 24`), `fu_answered_q`/`fu_pushed_meeting`/`fu_gave_value`/
  `fu_soft_checkin`/`fu_shared_resource` (from `fu_approach`'s 5 non-"None"
  enum values), `fu_matched_energy` (`fu_energy >= 4`), `warm_reply`
  (`reply_enthusiasm >= 4`), `long_reply` (`prospect_reply_len >= 120`).

```r
SIG_COLS <- paste0("sig_", SIG$id)
```
The final list of every `sig_*` column name, in registration order — this
should end up with roughly 140 entries once both `add_level_content_sigs()`
calls and every standalone `add_sig()` call above have run; a port's test
suite should assert the exact count and id set match, since the downstream
keys engine iterates `SIG` row-by-row and silent omissions would quietly
drop entire categories of "keys to success" from the final report.

---

## 12. Section 6 — Pooled predictive model (Random Forest + elastic net)

### 12.1 Predictor lists

```r
MF_NUMERIC <- c("log_connections","log_followers","first_msg_nchar","first_msg_words",
                "fk_grade","pct_about_prospect","pct_about_bdr","ai_sounding",
                "emotion_level","flattery_level","specific_detail","cta_ai",
                "connection_quality","salesy_score","about_len","experience_len","education_len",
                "has_question","has_congrats","quotes_them","has_emoji","has_stat","all_caps",
                "neg_q_half1","uses_name_first")
MF_FACTOR  <- c("message_type","msg_tone","msg_hook_type","reason_to_connect","question_type",
                "opener_type","personal_share","connect_phrasing","exclam_use","emoji_use",
                "uses_abbreviations","contact_seniority",
                "contact_org_type","client","hypothesis_group","hypothesis_variation_label",
                "send_dow","time_of_day","request_send_dow","request_time_of_day","bdr_name",
                "neg_q_first_at","about_us_first_at","meeting_ask_first_at")
```
These are the Level-1 Random Forest's predictors: 25 numeric, 23
categorical. `.build_mf_lists(sfx)` generates the Level-2/3 analogues
(`MF_NUMERIC_LVL2/3`, `MF_FACTOR_LVL2/3`) programmatically: reuse
`log_connections`/`log_followers`/profile-length/context factors unchanged;
read every message-dependent field from its `_lvl2`/`_lvl3` suffixed
column instead; substitute `neg_q_msg2`/`uses_name_second` (Level 2) or
`neg_q_msg3plus`/`uses_name_followup` (Level 3) for the Level-1-only
`neg_q_half1`/`uses_name_first`; and DROP `connect_phrasing` entirely
(trivial by msg2/msg3, same reasoning as the signals section).

### 12.2 `impute_frame(df, mf_num, mf_fac)` — missing-value handling for modeling

```r
impute_frame <- function(df, mf_num = MF_NUMERIC, mf_fac = MF_FACTOR) {
  for (n in mf_num) {
    if (!n %in% names(df)) { df[[n]] <- 0; next }
    x <- suppressWarnings(as.numeric(df[[n]])); miss <- is.na(x)
    if (any(miss)) { df[[paste0(n, "_miss")]] <- as.integer(miss) }
    med <- suppressWarnings(median(x, na.rm = TRUE)); if (is.na(med)) med <- 0
    x[miss] <- med; df[[n]] <- x
  }
  for (f in mf_fac) {
    if (!f %in% names(df)) { df[[f]] <- factor("Missing"); next }
    v <- as.character(df[[f]]); v[is.na(v) | v == ""] <- "Missing"
    df[[f]] <- factor(v)
  }
  df
}
```
For every numeric predictor: missing values are imputed with the column's
own median (0 if the whole column is missing or absent), AND — critically
— a companion `<name>_miss` binary indicator column is added whenever ANY
value was missing, so the model can still learn "missingness itself is
informative" rather than the imputation silently hiding that signal. For
every categorical predictor: missing/blank values become the literal
category `"Missing"` (not dropped, not imputed to the mode) — "missing" is
itself a valid, informative category level here.

### 12.3 `fit_rf(df, outcome, mf_num, mf_fac)`

```r
fit_rf <- function(df, outcome, mf_num = MF_NUMERIC, mf_fac = MF_FACTOR) {
  if (!requireNamespace("ranger", quietly = TRUE)) return(NULL)
  y <- df[[outcome]]
  if (length(unique(y[!is.na(y)])) < 2 || sum(y == 1, na.rm = TRUE) < 8) return(NULL)
  preds <- c(mf_num, paste0(mf_num, "_miss"), mf_fac)
  preds <- intersect(preds, names(df))
  preds <- preds[vapply(preds, function(p) length(unique(df[[p]])) > 1, logical(1))]
  preds <- preds[vapply(preds, function(p)
    !is.factor(df[[p]]) || nlevels(df[[p]]) <= 60, logical(1))]
  if (!length(preds)) return(NULL)
  w <- ifelse(y == 1, sum(y == 0) / max(sum(y == 1), 1), 1)
  m <- tryCatch(ranger::ranger(
    x = df[, preds, drop = FALSE], y = factor(y, levels = c(0, 1)),
    probability = TRUE, num.trees = 600, importance = "permutation",
    case.weights = w, respect.unordered.factors = "order", seed = CFG$seed),
    error = function(e) { message("RF (", outcome, ") failed: ", e$message); NULL })
  m
}
```
Guards (return `NULL`, i.e. "this outcome couldn't be modeled", rather than
crashing, whenever any of these hold): fewer than 2 distinct non-NA outcome
values, or fewer than 8 positive (`y==1`) cases. Predictor set = every
numeric column + its `_miss` companion (where one exists) + every
categorical column, intersected with what's actually present, then filtered
to drop (a) zero-variance columns (`length(unique(x)) <= 1`) and (b)
categorical columns with more than 60 levels (keeps `ranger` stable/fast —
this is why `bdr_name`/`client`/`hypothesis_group` are capped implicitly by
this rule rather than an explicit cardinality cap elsewhere).

**Class-imbalance weighting:** `w = n_negative / n_positive` for positive
rows, `1` for negative rows — i.e. each positive case is weighted up to
roughly balance the total weighted mass of positives vs. negatives (since
`scheduled==1` in particular is typically a small minority class).

**`ranger` call parameters a port's RF library must support:** 600 trees;
`probability=TRUE` output (class probabilities, not hard labels);
permutation-based variable importance; per-observation case weights;
`respect.unordered.factors="order"` (an optimization/consistency setting
for how unordered categorical splits are evaluated — look for an
equivalent "ordered-split optimization for categorical factors" option, or
accept the default one-hot/groupwise behavior if unavailable, since this
mainly affects speed/determinism of split search, not the conceptual
output); fixed `seed` for reproducibility.

### 12.4 Level-1 fit + out-of-bag opportunity score

```r
core_mask <- dat$is_core
rf_frame  <- impute_frame(dat[core_mask, , drop = FALSE])
rf_models <- list()
rf_importance <- tibble::tibble(feature = character(), importance = numeric(), outcome = character())
for (oc in c("connected","replied","scheduled")) {
  m <- fit_rf(rf_frame, oc)
  rf_models[[oc]] <- m
  if (!is.null(m) && length(m$variable.importance)) {
    vi <- m$variable.importance
    rf_importance <- dplyr::bind_rows(rf_importance, tibble::tibble(
      feature = names(vi), importance = as.numeric(vi), outcome = oc))
  }
}
oob_prob <- function(m, base, n) if (is.null(m)) rep(base, n) else m$predictions[, "1"]
n_core <- sum(core_mask)
dat$p_connected <- NA_real_; dat$p_replied <- NA_real_; dat$p_scheduled <- NA_real_
dat$p_connected[core_mask] <- oob_prob(rf_models$connected, mean(dat$connected[core_mask]), n_core)
dat$p_replied[core_mask]   <- oob_prob(rf_models$replied,   mean(dat$replied[core_mask]),   n_core)
dat$p_scheduled[core_mask] <- oob_prob(rf_models$scheduled, mean(dat$scheduled[core_mask]), n_core)
dat$opportunity_score <- blended_score(dat$p_connected, dat$p_replied, dat$p_scheduled)
```
3 separate RF fits (one per funnel outcome), all trained on CORE rows only
(`surround_connections` excluded, so driver importances and opportunity
scores aren't skewed by that limited-repeatability message type).
**Out-of-bag (OOB) prediction**: `ranger`'s `m$predictions` with
`probability=TRUE` is actually the OOB probability prediction for each
training row (the row's own tree votes are excluded, since those trees saw
it during training) — this is what makes it valid to use as each row's own
"what would the model have predicted for THIS row" score without
overfitting leakage. If a given outcome's RF wasn't fitted at all (too few
positives), every row falls back to the population base rate for that
outcome instead. `opportunity_score` = `blended_score()` fed these 3
per-row probabilities (not the observed binary outcomes) — a continuous
0-100 "how promising is this specific prospect" score, used later to rank
example-message picks.

**Porting note on "OOB prediction":** a port's RF library must expose true
out-of-bag predictions (each sample scored only by trees that did NOT
include it in their bootstrap sample), not a prediction from the fully
fitted ensemble re-applied to its own training data — the latter would be
answer-leaked and systematically over-confident. Most serious RF
implementations (scikit-learn's `oob_decision_function_`, etc.) support
this; confirm before substituting.

### 12.5 Level-2/3 Random Forests ("3 different models")

```r
lvl2_mask <- dat$is_core & dat$has_msg2 == 1
lvl3_mask <- dat$is_core & dat$has_msg3 == 1
rf_frame_lvl2 <- impute_frame(dat[lvl2_mask, , drop = FALSE], MF_NUMERIC_LVL2, MF_FACTOR_LVL2)
rf_frame_lvl3 <- impute_frame(dat[lvl3_mask, , drop = FALSE], MF_NUMERIC_LVL3, MF_FACTOR_LVL3)
rf_models_lvl2 <- list(scheduled = fit_rf(rf_frame_lvl2, "scheduled", MF_NUMERIC_LVL2, MF_FACTOR_LVL2))
rf_models_lvl3 <- list(scheduled = fit_rf(rf_frame_lvl3, "scheduled", MF_NUMERIC_LVL3, MF_FACTOR_LVL3))
```
ONE RF each (not 3) — only `scheduled` is modeled, since `connected`/
`replied` are trivially 1 for both populations by construction
(`has_msg2==1` implies the prospect already replied at least once, etc.).
Importances feed `rf_importance` tagged `outcome = "scheduled_lvl2"` /
`"scheduled_lvl3"`. OOB predictions -> `p_scheduled_lvl2`/`p_scheduled_lvl3`
(NA outside each respective eligible population — these are NOT blended
into an `opportunity_score_lvl2/3`; no such field exists in this version).

### 12.6 Elastic-net logistic (`fit_enet`) — optional interpretable side view

```r
fit_enet <- function(df, outcome, mf_num = MF_NUMERIC, mf_fac = MF_FACTOR) {
  if (!requireNamespace("glmnet", quietly = TRUE)) return(NULL)
  y <- df[[outcome]]
  if (length(unique(y)) < 2 || sum(y == 1) < 10) return(NULL)
  preds <- intersect(c(mf_num, mf_fac), names(df))
  preds <- preds[vapply(preds, function(p) length(unique(df[[p]])) > 1, logical(1))]
  fac_hi <- preds[vapply(preds, function(p) is.factor(df[[p]]) && nlevels(df[[p]]) > 40, logical(1))]
  preds  <- setdiff(preds, fac_hi)
  X <- tryCatch(model.matrix(~ . - 1, data = df[, preds, drop = FALSE]), error = function(e) NULL)
  if (is.null(X)) return(NULL)
  cvfit <- tryCatch(glmnet::cv.glmnet(X, y, family = "binomial", alpha = 0.5, nfolds = 5),
                    error = function(e) NULL)
  if (is.null(cvfit)) return(NULL)
  co <- as.matrix(coef(cvfit, s = "lambda.1se"))
  tibble::tibble(term = rownames(co), coef = co[, 1]) %>%
    dplyr::filter(term != "(Intercept)", coef != 0) %>%
    dplyr::mutate(outcome = outcome)
}
```
Fit on `replied` and `scheduled` (Level 1, pooled across both in
`enet_coefs`) plus `scheduled_lvl2`/`scheduled_lvl3` (each separately).
`model.matrix(~ . - 1, ...)` one-hot-encodes every categorical predictor
WITHOUT an intercept column dropped per factor (`- 1` removes the overall
intercept, not a reference level per factor — R's default factor coding
already drops one reference level per factor automatically; a port's
one-hot encoder should do the conventional "k-1 dummy columns per
categorical, no separate global intercept term" encoding to match).
`alpha=0.5` = elastic net exactly halfway between ridge (`alpha=0`) and
lasso (`alpha=1`); `cv.glmnet(nfolds=5)` cross-validates the regularization
strength; `lambda.1se` (not `lambda.min`) picks the most-regularized
lambda within 1 standard error of the best CV loss — a deliberately sparser,
more conservative coefficient selection. Non-zero coefficients only are
kept. **This whole side-output (`enet_coefs`) is NOT read anywhere in
Section 9's JSON assembly** as of this version of the file — it exists in
memory for potential ad-hoc inspection / the downstream Hypothesis
Optimizer script, but a port could treat it as optional/deferred without
affecting the published payload's content, provided the downstream
checkpoint consumer doesn't need it (verify against that script
separately if porting it too).

---

## 13. Section 7 — Controlled keys-to-success engine

This is the statistical heart of the "keys to success" feature. Read this
section slowly — the sign-flip and zero-event guards in
`compute_keys()` encode real bugs found and fixed against production data
and must be reproduced exactly, not "simplified."

### 13.1 `adjusted_effect(df, ycol, scol)` — one signal's effect, connection-controlled

```r
adjusted_effect <- function(df, ycol, scol) {
  d <- df[!is.na(df[[scol]]) & !is.na(df[[ycol]]), , drop = FALSE]
  nw <- sum(d[[scol]] == 1); no <- sum(d[[scol]] == 0)
  if (nw == 0 || no == 0)
    return(list(effect = NA_real_, p = NA_real_, controlled = FALSE,
                n_with = nw, n_without = no,
                rate_with = if (nw) mean(d[[ycol]][d[[scol]] == 1]) else NA_real_,
                rate_without = if (no) mean(d[[ycol]][d[[scol]] == 0]) else NA_real_))
  rate_with <- mean(d[[ycol]][d[[scol]] == 1]); rate_without <- mean(d[[ycol]][d[[scol]] == 0])
  events_with <- sum(d[[ycol]][d[[scol]] == 1]); events_without <- sum(d[[ycol]][d[[scol]] == 0])

  controls <- character(0)
  if (sum(!is.na(d$log_connections)) >= 2 * CFG$min_arm_n) controls <- c(controls, "log_connections")
  if (sum(!is.na(d$log_followers))   >= 2 * CFG$min_arm_n) controls <- c(controls, "log_followers")
  eff <- NA_real_; pv <- NA_real_; controlled <- FALSE
  if (length(controls)) {
    dc <- d[stats::complete.cases(d[, c(scol, ycol, controls)]), , drop = FALSE]
    if (nrow(dc) >= 2 * CFG$min_arm_n && length(unique(dc[[scol]])) == 2 &&
        length(unique(dc[[ycol]])) == 2 && sum(dc[[scol]] == 1) >= 5 && sum(dc[[scol]] == 0) >= 5) {
      f <- stats::as.formula(paste(ycol, "~", paste(c(scol, controls), collapse = " + ")))
      m <- tryCatch(suppressWarnings(glm(f, data = dc, family = binomial())),
                    error = function(e) NULL)
      if (!is.null(m)) {
        d1 <- dc; d1[[scol]] <- 1; d0 <- dc; d0[[scol]] <- 0
        eff <- mean(predict(m, d1, type = "response") -
                      predict(m, d0, type = "response"), na.rm = TRUE) * 100
        pv  <- tryCatch(summary(m)$coefficients[scol, 4], error = function(e) NA_real_)
        controlled <- TRUE
      }
    }
  }
  if (is.na(eff)) {                       # unadjusted fallback
    eff <- (rate_with - rate_without) * 100
    pv  <- tryCatch(suppressWarnings(prop.test(
      c(sum(d[[ycol]][d[[scol]] == 1]), sum(d[[ycol]][d[[scol]] == 0])),
      c(nw, no))$p.value), error = function(e) NA_real_)
  }
  list(effect = eff, p = pv, controlled = controlled, n_with = nw, n_without = no,
       rate_with = rate_with, rate_without = rate_without,
       events_with = events_with, events_without = events_without)
}
```

Step by step:
1. **Drop rows missing either the signal (`scol`) or the outcome (`ycol`)**
   — NA rows are excluded from BOTH arms entirely, never silently counted
   as "without". `nw`/`no` = count of rows with the signal 1 / 0 after this
   filter. If either arm is completely empty, return immediately with
   `effect=NA` (nothing to compare).
2. Compute the RAW (unadjusted) rates and event counts in each arm:
   `rate_with = mean(y | signal==1)`, `rate_without = mean(y | signal==0)`,
   plus the raw success counts `events_with`/`events_without`.
3. **Decide which connection controls are usable**: `log_connections` is
   included as a covariate only if at least `2 * min_arm_n` (24) rows have
   non-missing connection data; same threshold independently for
   `log_followers`. It's possible to end up with 0, 1, or 2 controls.
4. **If at least one control is usable**, restrict to complete cases across
   `scol`+`ycol`+controls, and ONLY IF that complete-case subset still has
   >= `2*min_arm_n` rows AND both the signal and the outcome are still
   genuinely binary (2 unique values) in that subset AND each arm has >= 5
   rows: fit `glm(ycol ~ scol + controls, family=binomial)` (a standard
   logistic regression). Compute the **average marginal effect**: predict
   every row's probability with the signal artificially forced to 1, then
   again forced to 0 (holding every other covariate at its OBSERVED value
   per row), and average the per-row difference across ALL rows in the
   complete-case subset — `eff = mean(predict(m, data_with_scol_forced_to_1) -
   predict(m, data_with_scol_forced_to_0))`, scaled to percentage points.
   The p-value is the logistic regression's own Wald test p-value for the
   `scol` coefficient (`summary(m)$coefficients[scol, 4]`). `controlled <-
   TRUE` is set only on this success path.
5. **Fallback (unadjusted)** — triggered whenever the controlled path above
   didn't produce a result (no usable controls, insufficient complete
   cases, or the `glm()` call itself failed): `eff = (rate_with -
   rate_without) * 100` (a plain percentage-point difference), with a
   standard two-proportion z-test (`prop.test`) p-value.

**Porting note — average marginal effect, not a coefficient:** this is
deliberately NOT "read off the logistic regression's beta coefficient for
`scol`" (which would be in log-odds units and not directly a percentage-
point effect) — it's the model-predicted, counterfactual-averaged
difference in predicted probability, which correctly accounts for the
nonlinearity of the logistic link. A port's equivalent: fit the same
logistic model (any standard GLM/logistic-regression library with a
binomial family and logit link will do), then for every row in the
training subset, predict twice (signal forced to 1, then forced to 0,
every other covariate left at that row's own real value) and average the
difference. Do NOT substitute a linear-probability-model coefficient or a
naive log-odds-ratio as a shortcut — the percentage-point scale and the
"holding everything else at its real per-row value" averaging both matter
for matching the original numbers.

### 13.2 `filter_scope(df, scope)` / `pooled_pop(sig_row)`

```r
filter_scope <- function(df, scope) {
  switch(scope,
    "replied"  = df[df$replied == 1,  , drop = FALSE],
    "has_msg2" = df[df$has_msg2 == 1, , drop = FALSE],
    "has_msg3" = df[df$has_msg3 == 1, , drop = FALSE],
    df)
}
pooled_pop <- function(sig_row) {
  base <- dat[dat$is_core, , drop = FALSE]   # surround_connections excluded from drivers
  filter_scope(base, sig_row$scope)
}
```
`filter_scope` is the generic population-scoping switch used EVERYWHERE a
signal's `scope` field needs to be applied: `"all"` (or any unrecognized
value) = no filter (the `switch()` default/fallthrough case); `"replied"` =
only rows that got a reply; `"has_msg2"`/`"has_msg3"` = only rows that
reached that reply round. `pooled_pop(sig_row)` = that signal's scope
applied to the GLOBAL core-row population (every client/hypothesis group
combined) — this is the shrinkage TARGET for every segment-level estimate
of that same signal.

```r
POOLED_EFF <- setNames(vector("list", nrow(SIG)), SIG$id)
for (i in seq_len(nrow(SIG))) {
  sr <- SIG[i, ]
  POOLED_EFF[[sr$id]] <- adjusted_effect(pooled_pop(sr), sr$primary_outcome, paste0("sig_", sr$id))
}
```
Computed ONCE, up front, for every registered signal — not recomputed per
segment. A port should compute and cache this exactly once per signal
before iterating segments, both for correctness (every segment must shrink
toward the SAME pooled value) and for performance (segments will call this
repeatedly otherwise).

### 13.3 `confidence_tier(p, min_arm)`

```r
confidence_tier <- function(p, min_arm) {
  if (is.na(p)) return("Low")
  if (p < 0.05 && min_arm >= 30) return("High")
  if (p < 0.10 && min_arm >= CFG$min_arm_n) return("Medium")
  "Low"
}
```
`"High"` requires both statistical significance at p<0.05 AND a minimum arm
size of 30 (note: 30 is a literal hard-coded constant here, independent of
`CFG$min_arm_n`); `"Medium"` requires p<0.10 and the smaller
`CFG$min_arm_n` (12) threshold; anything else (including a missing
p-value) is `"Low"`.

### 13.4 `compute_keys(seg_df)` — the full per-segment pipeline, with trust guards

```r
compute_keys <- function(seg_df) {
  rows <- lapply(seq_len(nrow(SIG)), function(i) {
    sr <- SIG[i, ]; scol <- paste0("sig_", sr$id)
    pop <- filter_scope(seg_df, sr$scope)
    if (!scol %in% names(pop)) return(NULL)
    ycol <- sr$primary_outcome
    e <- adjusted_effect(pop, ycol, scol)
    min_arm <- min(e$n_with, e$n_without)
    if (min_arm < CFG$min_arm_n || is.na(e$effect)) return(NULL)
    n_eff  <- 2 / (1 / e$n_with + 1 / e$n_without)          # harmonic mean of arm sizes
    pooled <- POOLED_EFF[[sr$id]]$effect %||% 0
    if (is.na(pooled)) pooled <- 0
    k <- CFG$eb_pseudo_count
    shrunk <- (n_eff * e$effect + k * pooled) / (n_eff + k)
    seg_dir <- sign(e$effect)
    if (seg_dir == 0) return(NULL)                     # segment estimate is exactly flat
    if (sign(shrunk) != seg_dir) return(NULL)          # shrinkage flipped the sign -> distrust
    if (shrunk > 0 && e$events_with == 0) return(NULL) # can't "work" with zero successes
    tibble::tibble(
      id = sr$id, label = sr$label, category = sr$category, outcome = ycol,
      n_with = e$n_with, n_without = e$n_without,
      rate_with = round(100 * e$rate_with, 1), rate_without = round(100 * e$rate_without, 1),
      raw_lift_pp = round((e$rate_with - e$rate_without) * 100, 1),
      effect_pp = round(shrunk, 1), overall_effect_pp = round(pooled, 1),
      p_value = round(e$p %||% NA_real_, 4),
      connection_controlled = e$controlled,
      confidence = confidence_tier(e$p, min_arm),
      direction = ifelse(shrunk >= 0, "working", "not_working"))
  })
  out <- dplyr::bind_rows(rows)
  if (nrow(out)) out <- out[abs(out$effect_pp) >= CFG$min_key_effect_pp, , drop = FALSE]
  out
}
```
For EVERY registered signal, in order:
1. Scope the segment's own rows by that signal's `scope`.
2. Compute `adjusted_effect()` for this segment's own population (NOT
   pooled — this is the segment-specific estimate).
3. **Reject** (return NULL, i.e. this signal produces no key for this
   segment) if the smaller of the two arm sizes is below `CFG$min_arm_n`,
   or if no effect could be computed at all (`NA`).
4. **Effective sample size** = harmonic mean of the two arm sizes
   (`2/(1/n_with + 1/n_without)`) — NOT the simple total `n_with+n_without`.
   The harmonic mean penalizes lopsided arm splits (e.g. 1000-vs-12 rows
   gets a MUCH smaller effective n than 500-vs-500, even though the raw
   total is similar), which makes sense statistically since the precision
   of a two-proportion comparison is bottlenecked by the smaller arm.
5. **Empirical-Bayes shrinkage**: `shrunk = (n_eff * segment_effect +
   k * pooled_effect) / (n_eff + k)`, with `k = CFG$eb_pseudo_count = 25`
   acting as a "phantom sample size" worth of pooled-estimate weight. As
   `n_eff -> infinity`, `shrunk -> segment_effect` (a huge segment trusts
   itself entirely); as `n_eff -> 0`, `shrunk -> pooled_effect` (a tiny
   segment reverts almost entirely to the global average for that signal).
6. **Sign-flip trust guard** (critical, added after a real production bug
   — see the inline comment in the source for the specific real-world case
   that motivated this, a hypothesis group where a segment's own raw effect
   was slightly negative but a strongly positive pooled effect dragged the
   shrunk estimate to a false "+3.1pp working" headline): if the segment's
   OWN estimate (`e$effect`, already connection-adjusted where possible —
   note this compares against the ADJUSTED effect, not the raw rate
   difference, so a genuine sign flip from connection-adjustment itself is
   preserved and NOT treated as a guard violation) is exactly 0, reject
   outright (nothing to shrink toward a direction). If shrinkage flipped
   the final sign relative to the segment's own direction, reject outright
   — EB shrinkage is only trusted to adjust MAGNITUDE, never to flip
   direction.
7. **Zero-event guard**: if the shrunk effect is positive (claims "working")
   but the "with" arm had literally zero actual successes
   (`events_with == 0`), reject — a signal cannot be credited as "working"
   based purely on borrowed pooled strength when its own segment-specific
   evidence shows NO successes at all in the arm that supposedly has the
   signal.
8. Build one output row: rounded rates (1 decimal), `raw_lift_pp` (the
   UNADJUSTED rate difference, reported alongside the connection-adjusted
   `effect_pp` for transparency/comparison), the shrunk `effect_pp` and the
   `overall_effect_pp` (the pooled value it was shrunk toward, also
   reported so a reader can see how much borrowing happened), rounded
   p-value (4 decimals), the `connection_controlled` boolean, confidence
   tier, and `direction` (`"working"` if `shrunk >= 0` else `"not_working"`
   — note this is `>=`, so an exact-zero shrunk effect is classified
   "working", though it would then usually be filtered out by the final
   `min_key_effect_pp` threshold below anyway unless exactly 1.5 is
   possible at some rounding edge).
9. **Final filter**: after collecting every signal's row (dropping NULLs),
   keep only rows with `|effect_pp| >= CFG$min_key_effect_pp` (1.5).

A port must implement this exact 9-step pipeline, in this exact order,
with the guards exactly as specified — this is not a place to
"simplify the stats" or substitute a different shrinkage formula; the
specific choices here (harmonic-mean effective n, sign-flip rejection,
zero-event rejection) were each added to fix a specific real observed
failure mode and are load-bearing for the output's trustworthiness.

---

## 14. Section 8 — Phrase analysis (connection-controlled)

### 14.1 Tokenization

```r
PHRASE_STOP <- c("the","a","an","and","or","but","is","it","in","of","to","you","your",
                 "i","my","we","our","that","this","are","was","have","has","for","with",
                 "on","at","from","be","by","as","so","just","also","very","their","they",
                 "them","can","will","not","if","me","do","did","who","what","when","how",
                 "all","been","more","its","there","here","would","could","about")

make_ngrams <- function(text, nmax) {
  if (is.na(text) || !nzchar(text)) return(character(0))
  t <- tolower(text); t <- gsub("[^a-z0-9' ]", " ", t); t <- gsub("\\s+", " ", trimws(t))
  w <- strsplit(t, " ")[[1]]; w <- w[nzchar(w)]
  if (!length(w)) return(character(0))
  grams <- character(0)
  for (n in 1:nmax) if (length(w) >= n)
    for (i in 1:(length(w) - n + 1)) grams <- c(grams, paste(w[i:(i + n - 1)], collapse = " "))
  grams <- grams[!(grams %in% PHRASE_STOP)]
  unique(grams)
}
```
Lowercase, strip everything but letters/digits/apostrophe/space, collapse
whitespace, split on spaces -> word tokens. Generate every contiguous
n-gram from 1 to `nmax` (sliding window), drop any n-gram that is EXACTLY
one of the ~55 stopwords listed (NOTE: this only drops pure single-word
stopword matches by exact string equality against the list above, since
multi-word n-grams like `"to connect"` never equal a single stopword
string — stopwords are NOT removed from inside multi-word phrases, only as
standalone unigrams), then de-duplicate within that one text (a phrase that
appears twice in the same message counts once for "did this message
contain this phrase", not twice).

```r
.ngram_max <- max(CFG$phrase_ngram_max, CFG$recurring_ngram_max)   # max(3, 5) = 5
.tokenize_col <- function(col) {
  ngr <- lapply(dat[[col]], make_ngrams, nmax = .ngram_max)
  tibble::tibble(row = rep(seq_along(ngr), lengths(ngr)), phrase = unlist(ngr))
}
PH_LONG_LVL1 <- .tokenize_col("msg1_text")
PH_LONG_LVL2 <- .tokenize_col("msg2_text")
PH_LONG_LVL3 <- .tokenize_col("msg3_text")
```
One "long" table per level: a (row_index, phrase) pair for every
(message, n-gram) combination, tokenized ONCE up front at `n=5` (the max of
both downstream consumers' needs) and reused by both the top-phrases
ranking (which only cares about n<=3) and the recurring-phrase finder
(n<=5) — avoiding re-tokenizing the same text twice for two different
`nmax` values. **Porting note:** "long" here means the long/tidy table
shape (one row per fact, vs. "wide" with one column per n-gram) — a port
can use any equivalent structure, e.g. a list of `(rowIndex, phrase)`
tuples, or a `Map<phrase, Set<rowIndex>>` inverted index (which is actually
what `rows_by_phrase <- split(sub$row, sub$phrase)` builds on-demand later
in both `phrase_keys()` and `recurring_phrases()` — a port could build that
inverted-index structure once instead of re-deriving it via `split()` every
call, as a performance improvement that preserves identical output).

### 14.2 `phrase_keys(seg_idx, level, max_candidates=150)` — reply/meeting-lift ranked phrases

```r
.ph_long_for   <- function(level) switch(as.character(level), "1" = PH_LONG_LVL1, "2" = PH_LONG_LVL2, PH_LONG_LVL3)
.lvl_outcome   <- function(level) if (as.character(level) == "1") "replied" else "scheduled"

phrase_keys <- function(seg_idx, level = 1, max_candidates = 150) {
  if (!length(seg_idx)) return(list(working = list(), not_working = list()))
  has_col <- paste0("has_msg", level)
  pop_idx <- seg_idx[dat[[has_col]][seg_idx] == 1]
  if (!length(pop_idx)) return(list(working = list(), not_working = list()))
  ph_long <- .ph_long_for(level); outcome <- .lvl_outcome(level)
  sub <- ph_long[ph_long$row %in% pop_idx, , drop = FALSE]
  if (!nrow(sub)) return(list(working = list(), not_working = list()))
  freq <- sub %>% dplyr::count(phrase, name = "n") %>%
    dplyr::filter(n >= CFG$phrase_min_n, nchar(phrase) >= 4) %>%
    dplyr::arrange(dplyr::desc(n)) %>% utils::head(max_candidates)
  if (!nrow(freq)) return(list(working = list(), not_working = list()))
  seg <- dat[pop_idx, , drop = FALSE]
  rows_by_phrase <- split(sub$row, sub$phrase)
  res <- lapply(freq$phrase, function(ph) {
    seg$.tmp <- as.integer(pop_idx %in% rows_by_phrase[[ph]])
    e <- adjusted_effect(seg, outcome, ".tmp")
    if (is.na(e$effect) || min(e$n_with, e$n_without) < CFG$min_arm_n) return(NULL)
    tibble::tibble(phrase = ph, n = e$n_with,
                   reply_rate_with = round(100 * e$rate_with, 1),
                   reply_rate_without = round(100 * e$rate_without, 1),
                   effect_pp = round(e$effect, 1),
                   connection_controlled = e$controlled,
                   p_value = round(e$p %||% NA_real_, 4))
  })
  tab <- dplyr::bind_rows(res)
  if (!nrow(tab)) return(list(working = list(), not_working = list()))
  pos <- tab %>% dplyr::filter(effect_pp > 0) %>% dplyr::arrange(dplyr::desc(effect_pp)) %>%
    utils::head(CFG$phrase_top_k)
  neg <- tab %>% dplyr::filter(effect_pp < 0) %>% dplyr::arrange(effect_pp) %>%
    utils::head(CFG$phrase_top_k)
  list(working = purrr::transpose(pos), not_working = purrr::transpose(neg))
}
```
1. Restrict `seg_idx` (the segment's row indices) to just the rows that
   reached the given `level` (`has_msgN == 1`).
2. Pull every (row, phrase) pair for that level, restricted to this
   population.
3. **Candidate selection**: count occurrences per phrase (how many DISTINCT
   messages contain it, since phrases were de-duplicated per-message in
   `make_ngrams`), keep only phrases with `n >= CFG$phrase_min_n` (30) AND
   at least 4 characters (drops short/low-signal n-grams), sort by
   frequency descending, cap at `max_candidates` (150) for performance —
   this cap means phrase #151 by frequency is never even TESTED for lift,
   regardless of how strong its effect might be; a port should keep this
   exact cap to match output, not treat it as an arbitrary performance knob
   to relax.
4. For EACH candidate phrase: build a temporary 0/1 "does this row's
   message contain this phrase" column (`.tmp`), call the SAME
   `adjusted_effect()` engine from Section 7 (outcome = `"replied"` for
   Level 1, `"scheduled"` for Levels 2/3 — note this hard-codes the outcome
   by level, it is NOT read from any `SIG` row since phrases aren't
   registered signals), reject if the effect is NA or either arm is below
   `min_arm_n`.
5. Split survivors into `pos` (effect>0, sorted descending, top
   `phrase_top_k`=15) and `neg` (effect<0, sorted ascending i.e. most
   negative first, top 15) — returned as `working`/`not_working`.
   **No empirical-Bayes shrinkage is applied to phrases** — unlike the
   signal-based keys engine, phrase lift is reported as the RAW
   connection-adjusted effect for that segment's own population, with no
   pooling/shrinkage step at all.

### 14.3 `phrase_category(p)` — intent tagging for recurring phrases

```r
phrase_category <- function(p) {
  if (grepl("\\b(chat|call|meeting|connect|connecting|time|schedule|calendar|grab|catch up|quick|talk|meet|hop on|jump on|coffee)\\b", p)) return("Meeting ask")
  if (grepl("\\b(thank|thanks|appreciate|grateful)\\b", p)) return("Gratitude")
  if (grepl("\\b(saw|loved|noticed|read|impressive|great|congrat|awesome|nice|caught my eye|fascinating)\\b", p)) return("Compliment / reaction")
  if (grepl("\\b(your|you|their)\\b", p) && !grepl("\\b(i|we|our|my|us)\\b", p)) return("About the prospect")
  if (grepl("\\b(i|we|our|my|us|klas|i've|we've)\\b", p)) return("About us")
  "Other"
}
```
First-match-wins against 5 fixed word-lists, in this exact priority order
(Meeting ask > Gratitude > Compliment/reaction > About the prospect > About
us > Other fallback). Note "About the prospect" additionally REQUIRES the
phrase NOT also match the "About us" word list (so a phrase using both
"you" and "we" falls through to the "About us" category instead, since
that check comes later and has no such exclusion). `"klas"` in the "About
us" list is a literal client-name artifact token from the training data
discovery process (left in deliberately), not a general English word — keep
it in a faithful port since it's part of the literal category rule, even
though it looks odd out of context.

### 14.4 `collapse_phrases(freq, keep_ratio=0.7, core_ratio=1.5)` — de-duplicating overlapping n-grams

This is the most algorithmically intricate function in the file. Two
passes:

**Pass 1 — fragment / rare-extension pruning:**
```r
collapse_phrases <- function(freq, keep_ratio = 0.7, core_ratio = 1.5) {
  m <- nrow(freq)
  if (m <= 1) return(freq)
  padded <- paste0(" ", freq$phrase, " ")   # whole-word containment test
  drop <- logical(m)
  for (i in seq_len(m)) {
    for (j in seq_len(m)) {
      if (i == j) next
      if (grepl(padded[i], padded[j], fixed = TRUE)) {          # phrase i inside phrase j
        if (freq$n[j] >= freq$n[i] * keep_ratio) { drop[i] <- TRUE; break }  # (a) fragment
        if (freq$n[i] >= freq$n[j] * core_ratio)   drop[j] <- TRUE           # (b) rare extension
      }
    }
  }
  freq <- freq[!drop, , drop = FALSE]
  ...
}
```
For every ORDERED pair `(i,j)` where phrase `i` is a whole-word substring
of phrase `j` (tested by padding both with a leading/trailing space and
doing a literal, non-regex substring check — this is what guarantees
WHOLE-WORD containment rather than accidentally matching inside a longer
word): (a) if the longer phrase `j` is almost as frequent as the shorter
phrase `i` (`n_j >= n_i * 0.7`), the shorter phrase `i` adds nothing beyond
being a fragment of the longer one — drop `i` and stop checking `i` against
other `j`s (`break`). (b) Otherwise, if the SHORTER phrase `i` is much MORE
frequent than the longer one (`n_i >= n_j * 1.5`), the longer phrase `j` is
just a rare, specific extension of a common core — drop `j` instead (no
`break` here — `j` keeps getting compared against every remaining pair).
**Porting note:** this double loop is O(m²) string-containment checks
(`m` is at most `recurring_top_k`-ish before this runs — actually it runs
on the FULL frequency-filtered candidate set, pre-`head()`, so `m` can be
larger; verify against `CFG$recurring_min_n`'s filtering before assuming
this is small) — a port can keep the O(m²) approach for correctness/
simplicity since `m` is bounded by vocabulary size after the `n >=
recurring_min_n` frequency filter, which is typically small for this kind
of analysis, but should profile before assuming it is always fast enough.

**Pass 2 — merging rolling-window fragments of the same underlying phrase:**
```r
  k <- nrow(freq)
  if (k > 1) {
    toks   <- strsplit(freq$phrase, " ")
    parent <- seq_len(k)
    find <- function(x) { while (parent[x] != x) { parent[x] <<- parent[parent[x]]; x <- parent[x] }; x }
    adj <- function(a, b) {
      la <- length(a); lb <- length(b)
      if (la != lb || la < 3) return(FALSE)
      identical(a[-1], b[-lb]) || identical(b[-1], a[-la])
    }
    for (i in seq_len(k - 1)) for (j in (i + 1):k)
      if (adj(toks[[i]], toks[[j]])) { ra <- find(i); rb <- find(j); if (ra != rb) parent[rb] <- ra }
    roots <- vapply(seq_len(k), find, integer(1))
    ord   <- order(-freq$n, -nchar(freq$phrase))
    keep  <- ord[!duplicated(roots[ord])]
    freq  <- freq[keep, , drop = FALSE]
  }
  freq[order(-freq$n), , drop = FALSE]
```
A standard **union-find (disjoint-set) with path compression**
(`find(x)` walks `parent` pointers up to the root, flattening the chain as
it goes via the `parent[x] <<- parent[parent[x]]` path-halving trick).
`adj(a,b)` (token vectors `a`,`b`): true only if both phrases have the SAME
token length (`>= 3` tokens) AND one's tokens, minus its first token,
equal the other's tokens minus its LAST token — i.e. they are two
consecutive, same-length sliding windows over one longer underlying
sentence (e.g. `"open to a quick"` and `"to a quick chat"` are `adj` to
each other: dropping the first word of the first phrase gives `"to a
quick"`, dropping the last word of the second gives `"to a quick"` — a
match). Every pair of candidate phrases is checked for this adjacency
(`O(k²)` again); adjacent pairs get UNIONED into the same cluster. Each
resulting cluster then keeps only ONE representative phrase: sorted by
`(-n, -nchar)` (highest frequency first, longest phrase as tiebreak) and
the first (within the already-sorted `ord`) representative per cluster
root is kept via `!duplicated(roots[ord])`. Final result re-sorted by `n`
descending.

**Porting note on union-find:** implement a standard disjoint-set structure
with `find`/`union` (path compression is a nice-to-have for performance,
not required for correctness at this small scale, but keep it for
parity/speed if easy). The key semantic to get exactly right is the
"dropping first token of A equals dropping last token of B, OR vice versa"
adjacency test — both directions must be checked (`identical(a[-1], b[-lb])
|| identical(b[-1], a[-la])`), since which of two equal-length rolling
windows comes "first" in the original sentence isn't tracked by this
phrase-frequency table at all (it only has an aggregate count, not
positions) — the function cannot and does not know direction, it just
merges either-direction-adjacent pairs.

### 14.5 `recurring_phrases(seg_idx, level)` — "phrases we say a lot"

```r
recurring_phrases <- function(seg_idx, level = 1) {
  has_col <- paste0("has_msg", level)
  outcome <- .lvl_outcome(level)
  lift_outcome <- if (as.character(level) == "1") "reply" else "meeting"
  pop_idx <- seg_idx[dat[[has_col]][seg_idx] == 1]
  if (length(pop_idx) < CFG$min_arm_n * 2) return(list())
  ph_long <- .ph_long_for(level)
  sub <- ph_long[ph_long$row %in% pop_idx, , drop = FALSE]
  sub <- sub[grepl(" ", sub$phrase), , drop = FALSE]        # multi-word only
  if (!nrow(sub)) return(list())
  n_msgs <- length(unique(sub$row))
  freq <- sub %>% dplyr::count(phrase, name = "n") %>%
    dplyr::filter(n >= CFG$recurring_min_n) %>% dplyr::arrange(dplyr::desc(n))
  if (!nrow(freq)) return(list())
  freq <- collapse_phrases(freq) %>% dplyr::arrange(dplyr::desc(n)) %>%
    utils::head(CFG$recurring_top_k)
  seg <- dat[pop_idx, , drop = FALSE]
  rows_by_phrase <- split(sub$row, sub$phrase)
  res <- lapply(seq_len(nrow(freq)), function(i) {
    ph <- freq$phrase[i]
    seg$.tmp <- as.integer(pop_idx %in% rows_by_phrase[[ph]])
    e <- adjusted_effect(seg, outcome, ".tmp")
    tibble::tibble(
      phrase = ph, count = freq$n[i],
      pct_of_messages = round(100 * freq$n[i] / n_msgs, 1),
      category = phrase_category(ph),
      lift_pp = if (is.na(e$effect)) NA_real_ else round(e$effect, 1),
      lift_outcome = lift_outcome,
      connection_controlled = e$controlled)
  })
  purrr::transpose(dplyr::bind_rows(res))
}
```
Differs from `phrase_keys()` in several ways a port must not blur together:
requires at least `2 * min_arm_n` (24) total rows in the level population
just to attempt this at all (a coarser guard than phrase_keys'
per-phrase arm check); only considers MULTI-WORD phrases (single-word
unigrams excluded by `grepl(" ", phrase)` — unlike `phrase_keys()` which
allows unigrams down to 4 characters); uses `CFG$recurring_min_n` (25, not
`phrase_min_n`=30) as the frequency floor; runs `collapse_phrases()` to
de-duplicate overlapping windows BEFORE capping to `recurring_top_k` (25);
and reports `pct_of_messages` (frequency / number of distinct messages in
the population, NOT number of distinct ROWS necessarily — `n_msgs =
length(unique(sub$row))`, which IS the same as distinct rows here since
each row contributes at most one `conversation`'s worth of text per level,
but conceptually this is "percent of actual messages that used this
phrase") alongside the lift. `lift_outcome` is a plain descriptive label
string (`"reply"` for Level 1, `"meeting"` for Levels 2/3) distinct from
the actual `outcome` column name used internally for the `adjusted_effect`
call (`"replied"`/`"scheduled"`) — don't conflate the two when porting the
output field.

---

## 15. Section 9 — Assemble website-ready JSON

This section builds the final nested payload. The full output schema is
reproduced in **Appendix A**; this section explains every function that
populates it. Read Appendix A alongside this section — the schema shows
WHAT shape to produce, this section explains HOW each piece is computed.

### 15.1 Small shared helpers

```r
slugify <- function(x) {
  s <- tolower(trimws(as.character(x)))
  s <- gsub("[^a-z0-9]+", "_", s); s <- gsub("^_+|_+$", "", s)
  if (!nzchar(s)) s <- "na"
  substr(s, 1, 80)
}
rnd <- function(x, d = 1) {         # vectorized; NaN/Inf -> NA
  v <- suppressWarnings(as.numeric(x)); v[is.nan(v) | is.infinite(v)] <- NA_real_; round(v, d)
}
```
`slugify`: lowercase, collapse any run of non-alphanumerics to a single
underscore, trim leading/trailing underscores, fall back to `"na"` if
empty, truncate to 80 chars. Used for every client/hypothesis-group JSON
object key. `rnd`: a `round()` wrapper that also converts `NaN`/`Inf` to
`NA` first (so e.g. a `0/0` division anywhere upstream degrades to a clean
JSON `null` instead of an invalid `NaN`/`Infinity` literal).

### 15.2 `funnel_stats(df)`

```r
funnel_stats <- function(df) {
  n <- nrow(df); if (n == 0) return(list(n = 0))
  cc <- sum(df$connected); rr <- sum(df$replied); ss <- sum(df$scheduled)
  list(n = n, connected = cc, replied = rr, scheduled = ss,
       connect_rate = rnd(100 * cc / n, 1), reply_rate = rnd(100 * rr / n, 1),
       meeting_rate = rnd(100 * ss / n, 2),
       cond_reply_rate = rnd(100 * rr / max(cc, 1), 1),
       cond_meeting_rate = rnd(100 * ss / max(rr, 1), 1),
       blended_score = rnd(blended_score(cc / n, rr / n, ss / n), 2))
}
```
Uses **ALL rows** of whatever `df` it's given (surround_connections
INCLUDED at this call site — see `build_segment()` below for exactly which
rows reach here). `connect_rate`/`reply_rate` = % of ALL rows;
`meeting_rate` has 2 decimal places (not 1, since meeting rates are
typically much smaller numbers where 1 decimal would be too coarse).
`cond_reply_rate` = reply rate CONDITIONAL ON having connected
(`reply/connected`, floor denominator at 1 to avoid divide-by-zero);
`cond_meeting_rate` = meeting rate conditional on having replied.

### 15.3 `rate_by(df, col, min_n=1, level_order=NULL)` — the generic rate-table builder

```r
rate_by <- function(df, col, min_n = 1, level_order = NULL) {
  if (!col %in% names(df) || all(is.na(df[[col]]))) return(list())
  out <- df %>% dplyr::filter(!is.na(.data[[col]])) %>%
    dplyr::group_by(level = as.character(.data[[col]])) %>%
    dplyr::summarise(n = dplyr::n(),
                     connect_rate = rnd(100 * mean(connected), 1),
                     reply_rate   = rnd(100 * mean(replied), 1),
                     meeting_rate = rnd(100 * mean(scheduled), 2), .groups = "drop") %>%
    dplyr::filter(n >= min_n)
  if (!nrow(out)) return(list())
  if (!is.null(level_order)) {
    out$.ord <- match(out$level, level_order)
    out <- out %>% dplyr::arrange(.ord) %>% dplyr::select(-.ord)
  } else out <- out %>% dplyr::arrange(dplyr::desc(reply_rate))
  purrr::transpose(out)
}
```
THE single most-reused function in the whole file (~25 call sites). Groups
`df` by the string value of `col` (NA rows excluded entirely from the
table), computes `n`/`connect_rate`/`reply_rate`/`meeting_rate` per group,
drops groups below `min_n`. **Ordering**: if a `level_order` vector is
given, rows are sorted to match that fixed order (via `match()` —
categories not present in `level_order` get `NA` and sort last, in
whatever order `dplyr::arrange` places NAs, which is last by default);
otherwise sorted by `reply_rate` descending (best-performing level first).
Fixed level-order vectors used throughout: `DOW_ORDER` (Mon-Sun),
`TOD_ORDER` (the 6 time-of-day buckets in day order), `DAY_TIME_ORDER`
(the outer-product of DOW x the 6 time-of-day labels with their
parenthetical stripped, e.g. `"Monday Early morning"` — built via
`as.vector(t(outer(DOW_ORDER, c(...), paste)))`, i.e. "for every day, for
every time-of-day label, in nested loop order, day varies slowest").
Output shape: `purrr::transpose(out)` converts the grouped-and-summarized
table (one row per level) into a **list of row-objects** (what will
JSON-serialize to `[{level, n, connect_rate, reply_rate, meeting_rate},
...]`).

### 15.4 `trend_stats(df)` and `followup_block(df)`

`trend_stats`: identical `rate_by()`-style aggregation but grouped by
`send_month` (`"YYYY-MM"`), sorted chronologically (ascending), field named
`month` instead of `level`. Returns `[]` if `send_month` is entirely
missing.

```r
followup_block <- function(df) {
  rep_df <- df[df$replied == 1, , drop = FALSE]
  if (nrow(rep_df) == 0) return(list(n_replied = 0))
  approach <- ... group by fu_approach, n + meeting_rate, sorted by meeting_rate desc ...
  speed    <- ... group by bdr_followup_bucket, n + meeting_rate (no fixed sort order) ...
  reply_len <- rate_by(rep_df, "reply_len_bucket",
    level_order = c("Very short (<40)","Short (40-120)","Medium (120-300)","Long (300+)"))
  list(n_replied = nrow(rep_df), avg_reply_enthusiasm = rnd(mean(rep_df$reply_enthusiasm, na.rm = TRUE), 2),
       by_approach = approach, by_speed = speed, by_reply_length = reply_len)
}
```
Restricted to replied rows only. `by_approach`/`by_speed` are hand-rolled
(not via the generic `rate_by()`, since they only report `meeting_rate`,
not all 3 funnel rates) group-and-summarize tables; `by_reply_length` DOES
use the generic `rate_by()` with a fixed bucket order.

### 15.5 "Forward scheduling" prior-interest cross-tab

```r
.ENTHUSIASM_TIERS <- c("Cold/lukewarm reply (1-2)", "Neutral reply (3)", "Warm/excited reply (4-5)")
scheduling_prior_interest_block <- function(df) {
  m2 <- df[!is.na(df$seg_msg2) & !is.na(df$reply_enthusiasm) & !is.na(df$forward_sched_msg2), , drop = FALSE]
  if (!nrow(m2)) return(list())
  m2$interest_tier <- cut(m2$reply_enthusiasm, c(0, 2, 3, 5),
                          labels = .ENTHUSIASM_TIERS, include.lowest = TRUE)
  m2$forward_label <- ifelse(m2$forward_sched_msg2 == 1,
                             "Shared calendar link / specific time in msg 2", "Did not")
  m2 %>%
    dplyr::filter(!is.na(interest_tier)) %>%
    dplyr::group_by(interest_tier = as.character(interest_tier), forward = forward_label) %>%
    dplyr::summarise(n = dplyr::n(),
                     reply_rate = rnd(100 * mean(replied), 1),
                     meeting_rate = rnd(100 * mean(scheduled), 2), .groups = "drop") %>%
    dplyr::mutate(.ord = match(interest_tier, .ENTHUSIASM_TIERS)) %>%
    dplyr::arrange(.ord, dplyr::desc(forward)) %>% dplyr::select(-.ord) %>%
    purrr::transpose()
}
```
Scoped specifically to rows where `seg_msg2` (the 2nd BDR message by SEND
ORDER, not level) exists AND `reply_enthusiasm` (scored on the reply
immediately BEFORE that message) AND `forward_sched_msg2` are all non-NA.
`reply_enthusiasm` is bucketed into 3 tiers (1-2 / 3 / 4-5) using
`cut(breaks=c(0,2,3,5), include.lowest=TRUE)` — note the breaks are
`(0,2]`,`(2,3]`,`(3,5]` by default (R's `cut()` is right-closed by
default, and `include.lowest=TRUE` extends the FIRST interval to also
include its left edge, here effectively making it `[0,2]`): a reply score
of exactly 2 falls in tier 1, exactly 3 in tier 2, 4 or 5 in tier 3 — get
this boundary behavior exactly right in a port's equivalent bucketing
function (an off-by-one here silently reclassifies some rows). Produces a
2-way cross-tab (interest tier x forward/not), sorted by tier order then
forward-label descending (so "Shared..." sorts before "Did not" within each
tier, since `"S" > "D"` alphabetically descending — simply
alphabetical-descending on this specific 2-value string set happens to put
"Shared..." first, which is also the intended display order).

### 15.6 `research_block(df, idx)` — the big Level-1 breakdown bundle

This function builds the entire `research` object for one segment — ~30
sub-fields, almost all via `rate_by()` with a specific column + optional
fixed order. Two are hand-rolled instead of using `rate_by()`:

```r
focus <- df %>% dplyr::filter(!is.na(pct_about_prospect)) %>%
  dplyr::mutate(bucket = as.character(cut(pct_about_prospect, c(-Inf, 25, 50, 75, Inf),
                labels = c("0-25%","26-50%","51-75%","76-100%")))) %>%
  dplyr::group_by(bucket) %>%
  dplyr::summarise(n = n(), reply_rate = rnd(100*mean(replied),1), meeting_rate = rnd(100*mean(scheduled),2)) %>%
  purrr::transpose()
ai <- df %>% dplyr::filter(!is.na(ai_sounding)) %>% dplyr::group_by(ai_score = ai_sounding) %>%
  dplyr::summarise(n = n(), reply_rate = ..., meeting_rate = ...) %>% dplyr::arrange(ai_score) %>% purrr::transpose()
```
`company_vs_prospect`: `pct_about_prospect` bucketed into 4 quartile-ish
bands (0-25/26-50/51-75/76-100%, right-closed, i.e. 25.0 itself falls in
the FIRST bucket) — reports `avg_pct_about_prospect`, `avg_pct_about_us`
(both simple means over the WHOLE segment, ignoring NA), and
`by_focus_bucket` (the rate table above). `ai_feel`: `ai_sounding` grouped
by its own raw integer value 1-5 (not bucketed further), sorted ascending,
field name `ai_score` instead of `level` — reports `avg_ai_score` and
`by_ai_score`.

Every remaining field is a direct `rate_by(df, "<column>", level_order=
<optional>)` call. **Full field -> column mapping (reproduce exactly,
including which fields get a fixed order vs. frequency-sorted):**

| JSON field | source column | fixed order? |
|---|---|---|
| `reason_to_connect` | `reason_to_connect` | no (freq-sorted) |
| `personal_sharing` | `personal_share` | Unique, Generic, None |
| `connect_phrasing` | `connect_phrasing` | no |
| `exclamation_use` | `exclam_use` | None, One, Multiple (2+) |
| `emoji_use` | `emoji_use` | None, One, Multiple (2+) |
| `abbreviation_use` | `uses_abbreviations` | Uses abbreviations, No abbreviations |
| `hook_type` | `msg_hook_type` | no |
| `tone` | `msg_tone` | no |
| `question_type` | `question_type` | no |
| `opener_type` | `opener_type` | no |
| `message_type` | `message_type` | no |
| `rhetorical_question_timing` | `neg_q_first_at` | `.POSITION_LEVELS` |
| `about_us_timing` | `about_us_first_at` | `.POSITION_LEVELS` |
| `meeting_ask_timing` | `meeting_ask_first_at` | `.POSITION_LEVELS` |
| `forward_scheduling_timing` | `forward_sched_first_at` | `.POSITION_LEVELS` |
| `calendar_link_timing` | `calendar_link_first_at` | `.POSITION_LEVELS` |
| `datetime_propose_timing` | `datetime_propose_first_at` | `.POSITION_LEVELS` |
| `message_variation` | `hypothesis_variation_label` | no |
| `message_length` | `length_bucket` | the 11 char-bands in order |
| `readability` | `fk_bucket` | Easy, Standard, Advanced, Complex |
| `day_of_week` | `send_dow` | `DOW_ORDER` |
| `time_of_day` | `time_of_day` | `TOD_ORDER` |
| `day_time` | `day_time` | `DAY_TIME_ORDER` |
| `request_day_of_week` | `request_send_dow` | `DOW_ORDER` |
| `request_time_of_day` | `request_time_of_day` | `TOD_ORDER` |
| `request_day_time` | `request_day_time` | `DAY_TIME_ORDER` |
| `by_connections` | `conn_label` | `<500 .. 5,000+` (5 bands) |
| `total_messages` | `total_messages_bucket` | `1,2,3,4-5,6-10,11+` |
| `audience_seniority` | `contact_seniority` | no |
| `audience_org_type` | `contact_org_type` | no |
| `bdr_performance` | `bdr_name` | no, but `min_n = CFG$min_arm_n` (only BDRs with >= 12 rows shown) |

Plus: `scheduling_prior_interest` (= `scheduling_prior_interest_block(df)`,
Section 15.5 above), `top_phrases` (= `phrase_keys(idx, level=1)`, Section
14.2), `key_phrases` (= `recurring_phrases(idx, level=1)`, Section 14.5),
`style_examples` (= `style_examples_block(df, CFG$style_examples_per_level)`,
Section 15.9 below), `followup` (= `followup_block(df)`, Section 15.4).
Every one of `top_phrases`/`key_phrases`/`style_examples` is wrapped in its
own `tryCatch(..., error=function(e) list())` — a failure in ANY ONE of
these three must not abort building the rest of the segment's research
block; a port should wrap each independently the same way (log the error,
substitute an empty result, keep going).

### 15.7 "3 different models" — `research_block_level(df, idx, level)` for Levels 2/3

Structurally mirrors `research_block()` but:
- First restricts to `has_msgN == 1` rows only (`sub`/`sub_idx`).
- Reads every content column from its `_lvl2`/`_lvl3`-suffixed name via a
  local closure `g <- function(col) paste0(col, sfx)`.
- Reports `meeting_rate` only in every breakdown (NOT `reply_rate` — it
  would trivially be 100% for a has_msg2/has_msg3-restricted population,
  since reaching that level implies at least one reply already happened).
- Does **NOT** repeat the non-content breakdowns that live only at the
  top-level `research` object: no timing/audience/BDR-performance/
  by_connections/total_messages/followup fields here — see the explicit
  field list below, which is a STRICT SUBSET of `research_block()`'s
  fields, re-sourced from the suffixed columns:
  `company_vs_prospect`, `ai_feel`, `reason_to_connect`, `personal_sharing`,
  `exclamation_use`, `emoji_use`, `abbreviation_use`, `hook_type`, `tone`,
  `question_type`, `opener_type`, plus 2 fields with NO Level-1 analogue:
  `meeting_ask_phrasing` (from the suffixed `meeting_ask_style`, ordered
  Question/Statement/None) and `has_linebreak`/`shares_calendar_link`
  (from the suffixed `has_linebreak`/`calendar_link` columns, 2-level
  ordered), plus `message_length`/`readability` (same fixed orders as
  Level 1), plus `top_phrases`/`key_phrases`/`style_examples` sourced from
  the level-specific phrase tables / `style_examples_block_level()`.
- **Level-2-ONLY extra fields** (gated `if (level == 2)`):
  `meeting_ask_phrasing_by_prior_interest`, `has_linebreak_by_prior_interest`,
  `shares_calendar_link_by_prior_interest` — each an
  `enthusiasm_crosstab(sub, <suffixed column>, <level order>, <field_name>)`
  call (see below). **These 3 fields are deliberately absent from Level 3**
  — `reply_enthusiasm` is only an exact "prior interest right before THIS
  point" measure for the reply immediately preceding message 2; it is not
  re-scored for the prospect's 2nd reply, so it cannot validly serve as a
  "prior interest before message 3" measure. Do not add these fields to
  Level 3 in a port under any simplification.

```r
enthusiasm_crosstab <- function(df, dim_col, dim_levels, field_name) {
  if (!dim_col %in% names(df) || !"reply_enthusiasm" %in% names(df)) return(list())
  d <- df[!is.na(df$reply_enthusiasm) & !is.na(df[[dim_col]]), , drop = FALSE]
  if (!nrow(d)) return(list())
  d$interest_tier <- cut(d$reply_enthusiasm, c(0, 2, 3, 5),
                         labels = .ENTHUSIASM_TIERS, include.lowest = TRUE)
  d$.dim <- as.character(d[[dim_col]])
  out <- d %>% dplyr::filter(!is.na(interest_tier)) %>%
    dplyr::group_by(interest_tier = as.character(interest_tier), .dim) %>%
    dplyr::summarise(n = dplyr::n(), meeting_rate = rnd(100 * mean(scheduled), 2), .groups = "drop") %>%
    dplyr::mutate(.ord = match(interest_tier, .ENTHUSIASM_TIERS), .dord = match(.dim, dim_levels)) %>%
    dplyr::arrange(.ord, .dord) %>% dplyr::select(-.ord, -.dord)
  names(out)[names(out) == ".dim"] <- field_name
  purrr::transpose(out)
}
```
Generic 2-dimensional cross-tab: enthusiasm tier (3 levels, fixed order) x
an arbitrary other dimension column (`dim_col`, with its own fixed
`dim_levels` order, renamed in the output to `field_name` instead of a
generic `level`/`.dim` key — e.g. `"ask_style"`, `"has_linebreak"`,
`"shares_calendar_link"`), reporting only `n` and `meeting_rate` per cell.
Sorted by (tier order, then the other dimension's order).

### 15.8 `example_block(df)` — top-level "examples" field

```r
example_block <- function(df) {
  pick <- function(d) purrr::transpose(d %>% dplyr::transmute(
    contact = contact_name, title = contact_title, company = contact_company,
    message_type = message_type, opportunity = rnd(opportunity_score, 1),
    message = substr(first_message, 1, 500)))
  won <- df %>% dplyr::filter(scheduled == 1, !is.na(first_message)) %>%
    dplyr::arrange(dplyr::desc(opportunity_score)) %>% utils::head(5)
  hot <- df %>% dplyr::filter(scheduled == 0, connected == 1, !is.na(first_message)) %>%
    dplyr::arrange(dplyr::desc(opportunity_score)) %>% utils::head(5)
  list(meetings_won = pick(won), high_potential_open = pick(hot))
}
```
`meetings_won`: top 5 (by `opportunity_score` descending) rows with
`scheduled==1`. `high_potential_open`: top 5 rows with `scheduled==0 AND
connected==1` (an open, connected-but-not-yet-scheduled conversation with a
high model-predicted opportunity score — i.e. "promising leads still in
play"). Each example truncates the message to 500 characters
(`substr(..., 1, 500)` — not a "..." ellipsis appended, just a hard
character truncation; a port should match this exact truncation-without-
ellipsis behavior).

### 15.9 Style examples — `pick_level_examples()` / `example_level_vectors()` / `style_examples_block()`

```r
pick_level_examples <- function(d, per) {
  d <- d[!is.na(d$first_message) & nzchar(d$first_message), , drop = FALSE]
  if (!nrow(d) || per <= 0) return(list())
  rank <- d$scheduled * 3 + d$replied * 2 + d$connected
  d <- d[order(-rank, -d$opportunity_score), , drop = FALSE]
  d <- utils::head(d, per)
  purrr::transpose(d %>% dplyr::transmute(
    contact = contact_name, title = contact_title, company = contact_company,
    outcome = dplyr::case_when(scheduled == 1 ~ "Meeting", replied == 1 ~ "Replied",
                               connected == 1 ~ "Connected", TRUE ~ "No response"),
    opportunity = rnd(opportunity_score, 1),
    message = substr(first_message, 1, 500)))
}
```
**Ranking formula**: `rank = scheduled*3 + replied*2 + connected*1` — this
single integer naturally orders every possible outcome combination by
"best result first" (a meeting beats a mere reply beats a mere connection
beats nothing). Within equal rank, sorted by `opportunity_score` descending
(the model's continuous score breaks ties). Same 500-char truncation as
`example_block`.

`example_level_vectors(df)` returns a named list where each name matches a
`research_block()` output key, and each value is the row-aligned character
vector of that dimension's category label for every row of `df` (so
"give me examples for `tone` level `'genuine'`" = "filter rows where
`example_level_vectors(df)$tone == 'genuine'`"). Two are computed specially
rather than read directly from an existing column: `ai_feel` =
`as.character(ai_sounding)` (the raw AI_score becomes a level label), and
`company_vs_prospect` = the SAME 4-band bucket cut used in `research_block`'s
`focus` table. Every other entry is a straight `as.character()` of an
existing column (listed exhaustively in the source — 25 entries).

```r
style_examples_block <- function(df, per = 3) {
  if (per <= 0) return(list())
  vs <- example_level_vectors(df)
  out <- list()
  for (nm in names(vs)) {
    lvec <- vs[[nm]]
    keep <- !is.na(lvec)
    if (!any(keep)) next
    rows <- lapply(sort(unique(lvec[keep])), function(l) {
      sub <- df[keep & lvec == l, , drop = FALSE]
      ex  <- pick_level_examples(sub, per)
      if (!length(ex)) return(NULL)
      list(level = l, n = nrow(sub),
           reply_rate = rnd(100 * mean(sub$replied), 1),
           meeting_rate = rnd(100 * mean(sub$scheduled), 2), examples = ex)
    })
    rows <- Filter(Negate(is.null), rows)
    if (length(rows)) out[[nm]] <- rows
  }
  out
}
```
For EVERY dimension (`vs`'s names), for EVERY distinct non-NA level value
of that dimension present in `df` (sorted alphabetically — note this is a
DIFFERENT, simpler sort than `rate_by()`'s fixed-order-or-frequency sort;
`style_examples` levels are always just alphabetical regardless of what
order that same dimension's `rate_by()` table uses), build one entry:
`{level, n, reply_rate, meeting_rate, examples: [...]}` where `examples` =
`pick_level_examples()` restricted to just that level's rows. A level with
zero examples (e.g. no row at that level has a non-empty `first_message`)
is dropped entirely from the output, and a dimension with NO levels
producing any examples is omitted from `style_examples` altogether (not
present as an empty object).

`pick_level_examples_at(d, per, level)` / `example_level_vectors_at(df,
level)` / `style_examples_block_level(df, level, per)` mirror the 3
functions above exactly, for Levels 2/3: source text from `msg2_text`/
`msg3_text` instead of `first_message`; read the `_lvl2`/`_lvl3`-suffixed
research columns; and — important difference — each level's summary entry
reports ONLY `meeting_rate`, not `reply_rate` (same "trivially ~100% for
this population" reasoning as `research_block_level()`).

### 15.10 `keys_from_table()` / `keys_block()` — splitting the shared `compute_keys()` call by level

```r
keys_from_table <- function(kt, ids_filter = NULL) {
  if (is.null(kt) || !nrow(kt)) return(list(working = list(), not_working = list()))
  if (!is.null(ids_filter)) kt <- kt[ids_filter(kt$id), , drop = FALSE]
  if (!nrow(kt)) return(list(working = list(), not_working = list()))
  to_list <- function(d) purrr::transpose(d %>% dplyr::select(
    id, label, category, outcome, effect_pp, overall_effect_pp, rate_with, rate_without,
    n_with, n_without, p_value, connection_controlled, confidence))
  working     <- kt %>% dplyr::filter(direction == "working") %>%
    dplyr::arrange(dplyr::desc(effect_pp)) %>% utils::head(10)
  not_working <- kt %>% dplyr::filter(direction == "not_working") %>%
    dplyr::arrange(effect_pp) %>% utils::head(10)
  list(working = to_list(working), not_working = to_list(not_working))
}
```
`compute_keys(df)` (Section 7) is called ONCE per segment (not 3 times —
it already iterates every signal in `SIG`, which includes both the plain
Level-1 ids AND the `_lvl2`/`_lvl3`-suffixed ids side by side). This
function then SLICES that one result table by id suffix:
`keys_block(df)` (used for `seg$keys` at the top level) filters to
`!grepl("_lvl[23]$", id)` (Level-1 signals only); the per-level blocks
filter to `grepl("_lvl2$", id)` / `grepl("_lvl3$", id)` respectively. Each
slice independently: split into `working`/`not_working` by the `direction`
column, sort (`working` by `effect_pp` descending, `not_working` by
`effect_pp` ascending — i.e. most negative first), take top 10 of each,
project down to a fixed 13-field column set for the JSON output (dropping
`raw_lift_pp` from the public projection, even though it's present in the
full `compute_keys()` table — `raw_lift_pp` is computed and kept in memory
but never actually published in `seg$keys`/`seg$message_2$keys`/
`seg$message_3plus$keys`; reproducing the ORIGINAL behavior means leaving
it out of the port's output too, even though it would be easy to add).

### 15.11 Audience profile / composition vs. global baseline

```r
CONN_LABEL_ORDER <- c("<500","500-999","1,000-2,499","2,500-4,999","5,000+")
SENIORITY_ORDER  <- c("C-Suite","VP","Director","Manager","IC","Unknown")
EXECUTIVE_ORDER  <- c("Executive (C-Suite/VP)","Non-Executive")

composition_dimension <- function(group_df, baseline_df, col, level_order = NULL,
                                  min_baseline_bucket_n = CFG$min_arm_n) {
  if (!col %in% names(group_df) || !col %in% names(baseline_df)) return(list())
  g <- group_df[!is.na(group_df[[col]]), , drop = FALSE]
  b <- baseline_df[!is.na(baseline_df[[col]]), , drop = FALSE]
  if (!nrow(g) || !nrow(b)) return(list())

  g_tab <- table(as.character(g[[col]]))
  b_tab <- table(as.character(b[[col]]))
  levels_all <- union(names(g_tab), names(b_tab))
  if (!is.null(level_order)) {
    ordered <- level_order[level_order %in% levels_all]
    levels_all <- c(ordered, setdiff(levels_all, ordered))
  }
  by_level <- lapply(levels_all, function(lv) {
    g_n <- unname(g_tab[lv]); if (is.na(g_n)) g_n <- 0L
    b_n <- unname(b_tab[lv]); if (is.na(b_n)) b_n <- 0L
    g_pct <- rnd(100 * g_n / nrow(g), 1)
    b_pct <- rnd(100 * b_n / nrow(b), 1)
    list(level = lv, group_pct = g_pct, baseline_pct = b_pct,
        index = if (b_pct > 0) rnd(100 * g_pct / b_pct, 0) else NA_real_,
        group_n = as.integer(g_n), baseline_n = as.integer(b_n))
  })

  rate_lookup <- b %>% dplyr::group_by(level = as.character(.data[[col]])) %>%
    dplyr::summarise(n = dplyr::n(), connect_rate = mean(connected),
                     reply_rate = mean(replied), meeting_rate = mean(scheduled),
                     .groups = "drop") %>%
    dplyr::filter(n >= min_baseline_bucket_n)
  g_weights <- g %>% dplyr::group_by(level = as.character(.data[[col]])) %>%
    dplyr::summarise(n = dplyr::n(), .groups = "drop") %>%
    dplyr::mutate(w = n / sum(n))
  merged <- dplyr::left_join(g_weights, rate_lookup, by = "level")
  expected <- list(
    expected_connect_rate = rnd(100 * sum(merged$w * merged$connect_rate, na.rm = TRUE), 1),
    expected_reply_rate   = rnd(100 * sum(merged$w * merged$reply_rate,   na.rm = TRUE), 1),
    expected_meeting_rate = rnd(100 * sum(merged$w * merged$meeting_rate, na.rm = TRUE), 2))
  actual <- list(
    actual_connect_rate = rnd(100 * mean(g$connected), 1),
    actual_reply_rate   = rnd(100 * mean(g$replied), 1),
    actual_meeting_rate = rnd(100 * mean(g$scheduled), 2))

  list(by_level = by_level, n_group = nrow(g), n_baseline = nrow(b),
      expected_vs_actual = c(actual, expected))
}
```
For ONE dimension column (e.g. `conn_label`), given the segment's own rows
(`group_df`) and a baseline row-set (`baseline_df`, see below for what
this is): 1) build frequency tables of the column's distinct values in
each; union the level sets, reorder per `level_order` with any
out-of-order leftovers appended; 2) for every level, report the group's %,
the baseline's %, `group_n`/`baseline_n` raw counts, and an `index = 100 *
group_pct / baseline_pct` (100 = "represented exactly like the baseline",
>100 = over-represented in this group, `NA` if the baseline has literally
0% at that level — avoids a divide-by-zero); 3) **"expected vs actual"
decomposition**: build a `level -> (connect_rate, reply_rate,
meeting_rate)` lookup table from the BASELINE only, restricted to levels
with at least `min_baseline_bucket_n` (12) baseline rows (an underpowered
baseline bucket is excluded from the lookup, not given a noisy rate);
compute the GROUP's own composition weights per level
(`w = group_n_at_level / group_total_n`); left-join those weights onto the
baseline rate lookup (a level the group has but the baseline-rate-lookup
doesn't retain, e.g. because it was below the baseline's own min-bucket-n,
gets `NA` rates, naturally excluded from the weighted sum via `na.rm=TRUE`
below); `expected_X_rate = sum(weight * baseline_rate_at_that_level,
na.rm=TRUE)` for each of the 3 funnel rates — "if this group's prospects
had converted at exactly the rate everyone ELSE's prospects at the SAME
bucket converted, weighted by how THIS group's own prospects are actually
distributed across buckets, what rate would we expect?" — compared against
`actual_X_rate` (the group's own real, observed rate, unconditional on any
bucket).

```r
audience_profile_block <- function(idx_core) {
  baseline_idx <- setdiff(which(dat$is_core), idx_core)
  if (!length(baseline_idx) || !length(idx_core)) return(list())
  group_df    <- dat[idx_core, , drop = FALSE]
  baseline_df <- dat[baseline_idx, , drop = FALSE]
  list(
    connections = composition_dimension(group_df, baseline_df, "conn_label",     CONN_LABEL_ORDER),
    seniority   = composition_dimension(group_df, baseline_df, "contact_seniority", SENIORITY_ORDER),
    org_type    = composition_dimension(group_df, baseline_df, "contact_org_type"),
    executive   = composition_dimension(group_df, baseline_df, "executive_label", EXECUTIVE_ORDER)
  )
}
```
**The baseline is GLOBAL**: every OTHER core row across the ENTIRE dataset
(`setdiff(all core row indices, this segment's own core row indices)`) —
NOT "every other row in the same client", and NOT "every other hypothesis
group within the same client". This was an explicit, deliberate choice
made with the user so that e.g. a hypothesis group's composition can be
compared against the whole business's typical prospect mix, not just
siblings within the same client. For `"All Clients Combined"` (`idx_core`
= literally every core row), `baseline_idx` is empty by construction and
`audience_profile_block` returns `list()` immediately — this block only
ever produces non-empty output for an actual client or hypothesis-group
segment, never for the `overall` segment.

### 15.12 `build_segment(idx, name, id=NULL)` — the per-segment driver

```r
build_segment <- function(idx, name, id = NULL) {
  df <- dat[idx, , drop = FALSE]
  seg <- list(name = name, id = id %||% NA, funnel = funnel_stats(df), trend = trend_stats(df),
              message_type_overview = rate_by(df, "message_type"))
  core_local <- which(df$is_core)
  idx_core   <- idx[core_local]
  df_core    <- df[core_local, , drop = FALSE]
  if (length(idx_core) >= CFG$min_segment_n) {
    seg$sufficient_data <- TRUE
    seg$n_driver_rows <- length(idx_core)
    kt_core <- tryCatch(compute_keys(df_core), error = function(e) NULL)
    seg$keys     <- keys_from_table(kt_core, function(id) !grepl("_lvl[23]$", id))
    seg$research <- research_block(df_core, idx_core)
    seg$message_2 <- tryCatch(research_block_level(df_core, idx_core, 2), error = function(e) list())
    seg$message_3plus <- tryCatch(research_block_level(df_core, idx_core, 3), error = function(e) list())
    seg$message_2$keys     <- keys_from_table(kt_core, function(id) grepl("_lvl2$", id))
    seg$message_3plus$keys <- keys_from_table(kt_core, function(id) grepl("_lvl3$", id))
    seg$message_2$n_eligible_rows     <- sum(df_core$has_msg2 == 1, na.rm = TRUE)
    seg$message_3plus$n_eligible_rows <- sum(df_core$has_msg3 == 1, na.rm = TRUE)
    seg$examples <- example_block(df_core)
    seg$audience_profile <- tryCatch(audience_profile_block(idx_core), error = function(e) list())
  } else {
    seg$sufficient_data <- FALSE
    seg$n_driver_rows <- length(idx_core)
    seg$note <- sprintf("Only %d contacts eligible for driver analysis (min %d; surround_connections excluded).",
                        length(idx_core), CFG$min_segment_n)
  }
  seg
}
```
Critical distinction to preserve exactly: `funnel`/`trend`/
`message_type_overview` are built from `df` (**ALL rows for this segment,
`surround_connections` included**); EVERYTHING ELSE (`keys`, `research`,
`message_2`, `message_3plus`, `examples`, `audience_profile`) is built from
`df_core` (`is_core` rows only). The `sufficient_data` gate
(`length(idx_core) >= CFG$min_segment_n`, i.e. 40 core rows minimum) is
checked against the CORE row count specifically, not the segment's total
row count — a segment could have 500 total rows but only 30 `is_core` rows
and would still be marked `sufficient_data = FALSE`. `compute_keys()` is
called exactly ONCE per segment (`kt_core`) and its result is SLICED 3 ways
via `keys_from_table()` for the top-level keys, Message-2 keys, and
Message-3+ keys — do not call `compute_keys()` three times per segment in
a port, both for performance and because it must operate over the exact
same `df_core` each time by construction (calling it on an already-level-
filtered sub-frame would silently change its `filter_scope()` behavior for
`"has_msg2"`/`"has_msg3"`-scoped signals, since the pooled-vs-segment
distinction only makes sense when `compute_keys` sees ALL of this
segment's core rows and does its OWN internal scoping per signal).

### 15.13 Top-level assembly

```r
all_idx <- seq_len(nrow(dat))
model_quality <- list(
  n_total = nrow(dat), n_driver_rows = sum(dat$is_core), n_surround_excluded = sum(!dat$is_core),
  n_eligible_lvl2 = n_lvl2, n_eligible_lvl3 = n_lvl3,
  rf_fitted = c(names(rf_models)[!vapply(rf_models, is.null, logical(1))],
                if (!is.null(rf_models_lvl2$scheduled)) "scheduled_lvl2",
                if (!is.null(rf_models_lvl3$scheduled)) "scheduled_lvl3"),
  top_drivers = tryCatch(
    rf_importance %>% dplyr::group_by(outcome) %>%
      dplyr::slice_max(importance, n = 8) %>% dplyr::ungroup() %>%
      dplyr::mutate(importance = rnd(importance, 5)) %>% purrr::transpose(),
    error = function(e) list()))

clients <- sort(unique(dat$client))
client_list <- list()
for (cl in clients) {
  cl_idx <- which(dat$client == cl)
  cl_seg <- build_segment(cl_idx, cl, slugify(cl))
  hgs <- sort(unique(dat$hypothesis_group[cl_idx]))
  hg_list <- list()
  for (hg in hgs) {
    hg_idx <- which(dat$client == cl & dat$hypothesis_group == hg)
    hid <- dat$hypothesis_group_id[hg_idx][1]
    hg_list[[slugify(hg)]] <- build_segment(hg_idx, hg, hid)
  }
  cl_seg$hypothesis_groups <- hg_list
  client_list[[slugify(cl)]] <- cl_seg
}

payload <- list(
  meta = list(
    generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
    run_date = RUN_TAG, source_file = basename(INPUT_PATH),
    n_contacts = nrow(dat), n_clients = length(clients),
    blend_weights = as.list(CFG$blend_weights),
    ai_scored = CFG$run_ai),
  overall = build_segment(all_idx, "All Clients Combined", "overall"),
  model_quality = model_quality,
  clients = client_list)
```
`model_quality.top_drivers`: per OUTCOME (across the now 5 possible
outcome tags: `connected`/`replied`/`scheduled`/`scheduled_lvl2`/
`scheduled_lvl3`), the top 8 features by permutation importance, rounded to
5 decimals (importance values from `ranger` can be very small, hence the
extra precision vs. the 1-2 decimals used elsewhere in the payload).
Clients are iterated in SORTED ORDER (`sort(unique(dat$client))`, R's
default locale-aware string sort — a port should use the same sort
collation the target deployment expects, typically a plain
codepoint/ASCII sort is close enough for this dataset's client names, but
verify if any client name contains non-ASCII characters). Hypothesis
groups within each client are likewise sorted. `hypothesis_group_id`
(`hid`) is taken from the FIRST matching row (`dat$hypothesis_group_id[hg_idx][1]`)
— assumes (without re-verifying) that every row sharing the same
`(client, hypothesis_group)` string pair also shares the same group ID;
if that invariant were ever violated upstream, this would silently use
whichever row happens to sort first.

`payload$meta.blend_weights` = `CFG$blend_weights` coerced to a plain list
(so it serializes as a JSON object `{connected:.., replied:.., scheduled:..}`,
not an R-named-vector artifact). `n_contacts` = total ROW count (not
distinct contacts — a prospect contacted more than once under a different
`first_outreach_date` would count twice here, matching `nrow(dat)`
everywhere else in this file's "n" semantics).

---

## 16. Section 9.5 — Message-improvement prompts (Opus via OpenRouter)

For every segment with `sufficient_data == TRUE`, compile a structured
plain-text "data brief" (keys to success, top-performing research levels,
real winning example messages) and ask a strong model to WRITE a new
prompt — not to write outreach messages directly, but to write a REUSABLE
PROMPT that a separate, downstream message-writing AI will later use.

### 16.1 Brief-building helpers

```r
`%0%` <- function(a, b) if (is.null(a) || length(a) == 0 || is.na(a[1])) b else a
```
A second, SEPARATE null-coalescing operator from `%||%` in Section 0b —
slightly different semantics: checks `is.na(a[1])` (just the FIRST element)
rather than `%||%`'s "a is a single NA value" check, which matters because
some of this section's inputs are themselves already-transposed list
elements (e.g. `k$label`) that could in principle be multi-element — using
`a[1]` guards against an error if that ever happened, where `%||%`'s stricter
single-NA check would not even evaluate safely on a multi-element input.
Keep both helpers distinct in a port; don't merge them into one.

```r
.brief_keys <- function(items) { ... one "    - <label> | <+/-X.X> pp on <outcome> (with <rate>% vs without <rate>%, n=<n>, confidence <tier>)" line per item, or "(none identified at the confidence bar)" if empty ... }
.brief_top <- function(tbl, metric = "reply_rate", n = 3) { ... top-n levels of a rate table by the given metric, formatted "<level> (<value>%, n=<n>)", comma-joined, or "n/a" if empty ... }
.brief_examples <- function(items, k) { ... up to k items formatted "    - to <company> (<title>): \"<message, whitespace-collapsed>\"", or "(none)" if empty ... }
.brief_level <- function(blk, label) { ... one paragraph summarizing a Message-2/3+ block's keys + top tone/hook, OR "" entirely if that block has no keys above the confidence bar at all ... }
```

### 16.2 `segment_brief(seg, client_name, group_name)`

Assembles ALL of the above into one long plain-text brief per segment:
client/group header, volume & funnel line, working/not-working keys,
"highest-reply levels" across ~11 named dimensions (tone, hook, reason,
message variation if tested, personal sharing, connect-ask phrasing,
exclamation marks, emoji use, abbreviations, message length, time of day,
best day/time to send the CONNECTION REQUEST specifically — ranked by
`connect_rate` not `reply_rate`, company-vs-prospect focus), example
messages that won meetings (`CFG$prompt_examples_n`, default 6) and
high-potential open conversations (half that, minimum 2), then — appended
at the very end — the Message-2 and Message-3+ briefs (each entirely
omitted if that level has no keys above the confidence bar).

### 16.3 `PROMPT_WRITER_SYS` — the system prompt for the prompt-writing LLM

Reproduce this system prompt verbatim (same "verbatim, not paraphrased"
rule as the scoring prompts in Section 10):
```r
PROMPT_WRITER_SYS <- paste0(
  "You are a world-class B2B LinkedIn outreach strategist and expert prompt engineer. ",
  "You are given a data-driven brief describing what measurably works and what does not for ONE client and ONE target (hypothesis) group, ",
  "derived from thousands of real outreach messages, plus real example messages that won meetings. ",
  "Write ONE powerful, crystal-clear PROMPT that instructs a downstream message-writing AI to compose new LinkedIn first-touch connection messages for THIS client and target group. ",
  "The prompt you write MUST: (1) state the goal and describe the audience; ",
  "(2) encode the proven do's from 'what's working' - tone, opening hook, reason to connect, personal-sharing style, connection-request phrasing, ideal message length in characters, and best send time - with concrete, specific guidance; if a best-performing message variation (A/B angle) is reported, lean into that specific angle; ",
  "(3) explicitly list what to AVOID from 'what's not working'; ",
  "(4) require genuine, specific personalization about the individual prospect (a named post, role, project, or shared experience) and forbid generic filler; ",
  "(5) specify the message structure, a character-length target, and the exact connection-ask wording that performs best; ",
  "(6) include 2-3 short exemplar messages, drawn from or inspired by the winning examples, each clearly labelled as an example. ",
  "Write it as direct second-person instructions to the message-writing AI. ",
  "Output ONLY the finished prompt text, ready to paste into a system - no preamble, no analysis of your reasoning, and no surrounding code fences.")
```

### 16.4 Generation loop

```r
if (isTRUE(CFG$build_prompts)) {
  prompt_res <- tryCatch({
    if (!exists("lamas")) stop("lamas() not loaded - source Function Code/lama.R")
    paths <- list(); briefs <- character(0)
    reg <- function(path, brief) { paths[[length(paths) + 1]] <<- path; briefs[[length(briefs) + 1]] <<- brief }
    if (isTRUE(payload$overall$sufficient_data))
      reg("overall", segment_brief(payload$overall, "All Clients Combined", NA))
    for (cs in names(payload$clients)) {
      cl <- payload$clients[[cs]]
      if (isTRUE(cl$sufficient_data)) reg(c(cs), segment_brief(cl, cl$name, NA))
      if (isTRUE(CFG$prompt_hypothesis_groups)) for (hs in names(cl$hypothesis_groups)) {
        hg <- cl$hypothesis_groups[[hs]]
        if (isTRUE(hg$sufficient_data)) reg(c(cs, hs), segment_brief(hg, cl$name, hg$name))
      }
    }
    if (!length(briefs)) { cat("build_prompts: no segments with sufficient data.\n"); NULL }
    else {
      out <- lamas(briefs, system_text = PROMPT_WRITER_SYS, model = CFG$prompt_model,
                   max_tokens = CFG$prompt_max_tokens, max_concurrent = 8L)
      for (i in seq_along(paths)) {
        p <- paths[[i]]; val <- out[[i]]
        if (is.null(val) || is.na(val) || !nzchar(trimws(val))) next
        if (identical(p, "overall")) payload$overall$message_prompt <<- val
        else if (length(p) == 1)     payload$clients[[p[1]]]$message_prompt <<- val
        else payload$clients[[p[1]]]$hypothesis_groups[[p[2]]]$message_prompt <<- val
      }
      list(paths = paths, out = out)
    }
  }, error = function(e) { message("Prompt generation failed: ", e$message); NULL })
  ...
}
```
Builds a flat list of `(path, brief)` pairs covering `overall` + every
sufficient-data client + (if `CFG$prompt_hypothesis_groups`) every
sufficient-data hypothesis group within each — `path` is either the
literal string `"overall"`, a length-1 vector `c(client_slug)`, or a
length-2 vector `c(client_slug, hg_slug)`, used purely to know WHERE to
write the result back into `payload` afterward. ONE `lamas()` call handles
ALL segments' briefs concurrently (`max_concurrent = 8L` — up to 8 in
flight at once), far cheaper/faster than a call-per-segment loop. Every
non-empty, non-NA result is written back as that segment's
`message_prompt` field — note this uses `<<-` (superassignment into the
already-built `payload` object sitting in the enclosing/global scope); a
failed/empty result for a given segment simply leaves `message_prompt`
absent for that segment (not an empty string, not an error placeholder).

A human-readable Markdown bundle of every generated prompt is also written
to `<local_out_dir>/Connect_Message_Prompts_<RUN_TAG>.md` (one `##`
heading per segment, "Overall (all clients)" / client name / "`<client> /
<group>`"), only if `CFG$save_local_json` is also true.

### 16.5 Final JSON cleanup

```r
clean_json <- function(x) {
  if (is.list(x)) return(lapply(x, clean_json))
  if (is.numeric(x)) { x[is.nan(x) | is.infinite(x)] <- NA; return(x) }
  x
}
payload <- clean_json(payload)
```
A final recursive pass over the ENTIRE payload tree converting any
remaining `NaN`/`Inf` numeric leaf to `NA` (belt-and-suspenders on top of
`rnd()` already doing this at most individual call sites — this catches
anything that slipped through unrounded, e.g. a raw mean/division result
stored without going through `rnd()`). **Porting note:** a port's final
JSON-serialization step should perform this exact same recursive sanitize
— walk every leaf of the output object graph, and any invalid-JSON numeric
(NaN, +Inf, -Inf) becomes `null`, not a serialization error and not the
string `"NaN"`.

---

## 17. Section 9.6 — De-identified ("blinded") company names

### 17.1 Collecting every real company name

```r
collect_company_field_values <- function(x) {
  if (!is.list(x)) return(character(0))
  nm <- names(x)
  own <- character(0)
  if (!is.null(nm) && "company" %in% nm) {
    v <- x[["company"]]
    if (is.character(v) && length(v) == 1 && !is.na(v) && nzchar(trimws(v))) {
      own <- trimws(v)
    }
  }
  c(own, unlist(lapply(x, collect_company_field_values), use.names = FALSE))
}
client_display_names <- vapply(payload$clients, function(cl) {
  nm <- cl$name
  if (is.character(nm) && length(nm) == 1 && !is.na(nm) && nzchar(trimws(nm))) trimws(nm) else NA_character_
}, character(1))
client_display_names <- unname(client_display_names[!is.na(client_display_names)])
all_real_companies <- sort(unique(c(client_display_names, collect_company_field_values(payload))))
all_real_companies <- all_real_companies[nzchar(all_real_companies)]
```
`collect_company_field_values` recursively walks the ENTIRE already-built
`payload` tree and collects every scalar string value found under a key
literally named `"company"` (this key only ever appears inside an
`examples`/`style_examples` entry's `company` field — a verbatim copy of
`contact_company` — so an exact string match is safe/unambiguous).
**Performance-critical note:** returns ONLY each call's own subtree's
matches, combined by the PARENT via `unlist()` — this is standard `O(N)`
tree recursion. An EARLIER, now-fixed version of this function instead
threaded one shared accumulator vector through every call
(`acc <- c(acc, ...)`), which is `O(N²)` under R's copy-on-grow vector
semantics and was the actual multi-hour bottleneck discovered in a past
production incident — **a port's equivalent MUST return/merge local
results bottom-up** (e.g. each recursive call returns its own list/array,
parent concatenates children's already-small results), never append onto
one single accumulator passed by reference through the whole traversal,
in any language where array/list append is not guaranteed O(1) amortized
across such wide, deep fan-out.

`client_display_names` = every client segment's own `name` field (the
small, ~35-entry "real client accounts" list). `all_real_companies` =
union of client names + every `company`-keyed value anywhere in the
payload (this second source is large and dirty — tens of thousands of
one-off LinkedIn "current position" blurbs copied from `contact_company`,
not just clean company names — confirmed in production: ~17,867 distinct
values).

### 17.2 Building the exact-match hash + the (deliberately restricted) prose-scan chunk set

```r
company_deid_map <- setNames(sprintf("Company_%02d", seq_along(all_real_companies)), all_real_companies)
```
A `real_name -> "Company_NN"` lookup covering EVERY entry in
`all_real_companies` (15,000+ entries in production). Labels assigned in
alphabetical order (since `all_real_companies` was `sort()`-ed), so label
numbering is stable/reproducible run-over-run as long as the same set of
companies appears. **This exact-match map is used for BOTH (a) the direct
hash-lookup redaction of any leaf stored under a `company`/`name` key
(cheap and correct regardless of list size — see 17.3 below), and (b) as
the SOURCE of labels looked up by the prose scan, which is restricted to a
much smaller candidate list — see below.**

```r
prose_scan_candidates <- sort(unique(client_display_names))
prose_scan_candidates <- prose_scan_candidates[nzchar(prose_scan_candidates)]
company_sub_order <- prose_scan_candidates[order(nchar(prose_scan_candidates), decreasing = TRUE)]
MAX_PROSE_SCAN_LEN <- 80
prose_scan_names <- company_sub_order[nchar(company_sub_order) <= MAX_PROSE_SCAN_LEN]
PROSE_CHUNK_SIZE <- 100
prose_chunks <- list()
if (length(prose_scan_names)) {
  chunk_id <- ceiling(seq_along(prose_scan_names) / PROSE_CHUNK_SIZE)
  prose_chunks <- lapply(split(prose_scan_names, chunk_id), function(nms) {
    esc <- vapply(nms, function(nm) gsub("([\\^$.|?*+()\\[\\]{}])", "\\\\\\1", nm, perl = TRUE), character(1))
    list(pattern = paste0("(?i)(?<![A-Za-z0-9])(", paste(esc, collapse = "|"), ")(?![A-Za-z0-9])"),
         lookup_lower = tolower(nms),
         labels       = unname(company_deid_map[nms]))
  })
}
```
**This is the single most performance-critical design decision in this
section — reproduce it exactly, including the reasoning:**

1. **`prose_scan_candidates` = client display names ONLY** (NOT the full
   `all_real_companies`). Rationale (load-bearing, keep it in a port's
   comments/docs): a BDR's free-text prose essentially never types out a
   PROSPECT's own (often messy, LinkedIn-"current position"-style) company
   name verbatim inside a message — but a real CLIENT's name absolutely
   can appear embedded in a sentence (e.g. in an AI-written
   `message_prompt` describing "write outreach for Acme Health System's
   target audience..."). The embedded-mention/prose scan is therefore ONLY
   useful, and ONLY safe to restrict to, the client list — it is NOT
   relied on to catch a prospect's company name typed out in prose (that
   case is rare to nonexistent in practice, and is still caught by the
   exact-match hash lookup wherever it appears as a literal `company`/
   `name` field value, just not inside free text). Restricting the
   candidate set from ~17,867 (all companies) to ~35 (real clients only)
   turned a multi-hour run into roughly 3 minutes against real production
   data, with the exact-match redaction behavior for every one of the
   17,867+ prospect company values completely unaffected.
2. Sort client names longest-first (`order(nchar(...), decreasing=TRUE)`)
   so e.g. "Acme Health System" is substituted before the shorter "Acme"
   could partially match inside it.
3. `MAX_PROSE_SCAN_LEN` (80 chars) is a safety net, not the primary
   performance fix — kept in case a future client's display name is
   unusually long, but trims nothing in practice once the candidate list
   is already just the ~35 client names.
4. Chunk into groups of 100 (`PROSE_CHUNK_SIZE`) to bound each compiled
   regex's alternation size (guards against PCRE's compiled-pattern-size
   limit AND keeps each match call fast) — with ~35 real candidates this
   produces just 1 chunk in practice, but the chunking logic must still be
   implemented for correctness/safety at any future scale (more clients).
5. Each chunk's regex: escape every PCRE metacharacter
   (`^$.|?*+()[]{}`) in every candidate name, join with `|` alternation,
   wrap in `(?i)` (case-insensitive) + lookaround boundaries
   `(?<![A-Za-z0-9])...(?![A-Za-z0-9])` — **lookaround, not `\b`**,
   specifically so a name ending/starting in punctuation (e.g. a trailing
   `)`) still matches correctly when followed/preceded by whitespace (`\b`
   would silently fail there since neither side would be a "word"
   character boundary in that case). A port's regex engine must support
   zero-width negative lookahead/lookbehind for this exact approach (PCRE,
   .NET, Python `re`, JS `RegExp` all support this specific lookaround
   form).

### 17.3 Recursive redaction: exact-match (all companies) + prose-scan (clients only)

```r
PROSE_FIELDS <- c("message", "message_prompt", "phrase")
deidentify_company_names <- function(x, key = NA_character_) {
  if (is.list(x)) {
    nms <- names(x); if (is.null(nms)) nms <- rep(NA_character_, length(x))
    out <- vector("list", length(x))
    for (i in seq_along(x)) out[[i]] <- deidentify_company_names(x[[i]], nms[i])
    names(out) <- names(x)
    return(out)
  }
  if (!is.character(x) || length(x) != 1 || is.na(x) || !nzchar(x)) return(x)

  trimmed <- trimws(x)
  if (!is.na(key) && key %in% c("company", "name") && trimmed %in% names(company_deid_map))
    return(unname(company_deid_map[[trimmed]]))

  if (is.na(key) || !(key %in% PROSE_FIELDS)) return(x)

  for (ch in prose_chunks) {
    m <- gregexpr(ch$pattern, x, perl = TRUE)
    if (m[[1]][1] == -1) next
    matched <- regmatches(x, m)[[1]]
    labels  <- ch$labels[match(tolower(matched), ch$lookup_lower)]
    regmatches(x, m) <- list(labels)
  }
  x
}
payload_deid <- deidentify_company_names(payload)
```
Recursively walks the ENTIRE payload, tracking the PARENT key of every
scalar leaf encountered (so it knows whether that leaf is a candidate for
exact-match redaction, prose-scan redaction, or neither):
1. **Exact-match branch** — ONLY evaluated when the leaf's parent key is
   literally `"company"` or `"name"` (the two keys `all_real_companies`
   was actually built from, see 17.1): if the trimmed leaf value is a key
   in `company_deid_map`, replace the ENTIRE leaf with its label. **This
   key restriction is itself a fix for a real production bug**: without
   it, ANY leaf string anywhere in the payload that happens to equal a
   real company/client name verbatim gets swapped — e.g. a plain category
   label like `"None"` (used by `meeting_ask_phrasing`/`personal_sharing`/
   `exclamation_use`/`emoji_use`/`question_type`/etc.) was being mangled
   into `"Company_NN"` whenever some unrelated prospect's `contact_company`
   field happened to literally contain the string `"None"`. **A port must
   gate the exact-match replacement on the SAME parent-key restriction**,
   not a bare "does this string equal any known company name" check
   anywhere in the tree.
2. **Prose-scan branch** — ONLY evaluated when the leaf's parent key is one
   of `PROSE_FIELDS` (`"message"`, `"message_prompt"`, `"phrase"` — i.e.
   genuine free-text fields, never a rate-table label, a count, or a
   category name): for each regex chunk (built from client names only, see
   17.2), find every match in the string (`gregexpr`), look up each
   match's label by case-insensitive comparison against that chunk's own
   `lookup_lower`, and substitute the matched substring(s) in place via
   `regmatches(x, m) <- list(labels)` (R's `regmatches<-` assignment form:
   replaces each matched span, in order, with the corresponding
   replacement string — functionally equivalent to a global
   find-and-replace-by-match-position operation; a port's regex library
   should support "replace every match with a value looked up per-match",
   e.g. a callback-based global replace).
3. Every other leaf (any other key, or no key at all — e.g. an array
   element with no associated name) passes through completely unchanged.

A port's recursive tree-walker must: (a) preserve this exact-match-first,
then-prose-scan ordering (the function `return()`s immediately after a
successful exact-match hit, and `PROSE_FIELDS` and `c("company","name")`
are non-overlapping key sets anyway, so running both on the same leaf is
naturally impossible, but a port's logic should make the mutual-exclusivity
explicit rather than accidental); (b) handle every JSON value type
correctly — objects (R lists with names) recurse with the name passed down
as `key`; arrays (R lists without names — `names(x)` is `NULL`, so every
element's `key` becomes `NA`, meaning NEITHER the exact-match NOR the
prose-scan branch can ever fire for a bare array element directly, only for
a NAMED child of an object) correctly recurse with `key=NA` for every
element; scalars terminate the recursion.

### 17.4 Fallback when there are no companies at all

```r
} else {
  payload_deid <- payload
  company_deid_map <- character(0)
  cat("De-identification: no client/company names found to blind.\n")
}
```
If `all_real_companies` is empty, the de-identified payload is just an
UNMODIFIED copy of the real payload (not an error, not a payload with
everything stripped) — a port should treat "nothing to redact" as a no-op
pass-through, same shape as the real payload.

---

## 18. Section 10 — Publish (Firebase) + local save + summary

```r
payload_json <- jsonlite::toJSON(payload, auto_unbox = TRUE, na = "null", null = "null", pretty = FALSE)
```
The canonical serialization settings for THIS payload: `auto_unbox=TRUE`
(any length-1 R vector/list leaf becomes a JSON scalar, not a 1-element
array — e.g. `n=40` serializes as `"n":40`, not `"n":[40]`; this matters a
lot given how many single-value fields exist throughout the schema),
`na="null"` (R `NA` of any type -> JSON `null`), `null="null"` (R `NULL`
-> JSON `null`), `pretty=FALSE` (compact, no indentation — this is the
production payload; a port's equivalent JSON encoder needs the same
"scalar-not-array for length-1 values" unboxing behavior to match the
schema in Appendix A exactly — most JSON libraries in other languages
don't have this exact ambiguity in the first place since they're typically
typed, in which case this note is moot: just produce scalars where the
schema says scalar, arrays where it says array).

- **Local save** (`CFG$save_local_json`): writes
  `<local_out_dir>/Connect_Analysis_<RUN_TAG>.json`.
- **De-identified local save** (`CFG$save_deidentified_json`): re-serializes
  `payload_deid` with the same settings, writes
  `<local_out_dir>/Connect_Analysis_<RUN_TAG>_deidentified.json`. If
  `CFG$save_company_map_csv` and the map is non-empty, ALSO writes a CSV
  `<local_out_dir>/Connect_Analysis_<RUN_TAG>_company_map.csv` with columns
  `real_name`,`deid_label` — explicitly flagged in the console log as
  internal-only, not for external distribution.
- **Website repo drop** (`CFG$website_dir`, if non-NULL): writes
  `<website_dir>/latest.json` (overwritten every run — what the live page
  reads by default), `<website_dir>/runs/<RUN_TAG>.json` (append-only
  history), and `<website_dir>/index.json` = `{last_run, updated_at,
  runs: [<every *.json filename in runs/, date-part only, DESCENDING>]}`
  (so a run-picker UI can enumerate every historical run, newest first).
  Failure here is caught and logged, non-fatal.
- **Firebase publish** (`CFG$upload`): lazily sources `upload_to_firebase.R`
  if `upload_connect_analysis` isn't already defined, then calls
  `upload_connect_analysis(payload=payload, deidentified_payload=payload_deid,
  run_date=RUN_TAG)` (see Section 3.3 of this guide for that function's
  contract). **Wrapped in `tryCatch`, explicitly non-fatal** — a Firebase
  failure must never prevent the local/website JSON (already written
  above) from existing; the error is logged via `message()` prefixed
  `"Firebase publish failed (non-fatal; local/website-repo JSON above
  still written): "`.
- **Console summary**: prints the overall funnel line, then one line per
  client (`name`, `n`, `reply_rate`, `meeting_rate`, `blended_score`,
  hypothesis-group count).

---

## 19. Section 11 — Checkpoint (handoff to the Hypothesis Optimizer)

```r
tryCatch({
  saver(list(dat = dat, SIG = SIG, payload = payload, rf_models = rf_models,
             rf_importance = rf_importance, CFG = CFG, RUN_TAG = RUN_TAG),
        "connect_model_checkpoint")
  cat("Checkpoint saved (dat/SIG/payload/rf_models/rf_importance/CFG) for the Hypothesis Optimizer.\n")
}, error = function(e) message("Checkpoint save failed (non-fatal): ", e$message))
```
Saves exactly these 7 named objects (NOT `rf_models_lvl2`/`rf_models_lvl3`,
NOT `payload_deid`, NOT `enet_coefs` — only this specific set) to a single
checkpoint blob named `connect_model_checkpoint`, via the `saver()`
contract from Section 3.4 (in practice: `save()`'d as an `.rdata` file
containing one list bound to that name — confirmed from direct inspection
of the checkpoint file during a prior debugging session: `load()`-ing it
binds a single variable `connect_model_checkpoint` into the session, whose
`names()` are exactly `dat, SIG, payload, rf_models, rf_importance, CFG,
RUN_TAG`). Non-fatal on failure (logged, script still completes/exits
normally). A separate downstream script, "Connect Hypothesis Optimizer.R"
(not included in this repository/this guide's scope), reads these 7
objects either directly from the same R session's globalenv() (the normal
same-session case) or from this checkpoint file (for a standalone,
later/different-session re-run) — a port's equivalent is any
serialize-7-named-objects-to-one-keyed-blob mechanism; the exact
object/field set to include is the important contract to preserve if that
downstream consumer is ever ported too.

---

## Appendix A — Complete output JSON schema

```
{
  "meta": {
    "generated_at": "2026-11-17T14:32:01",      // local timestamp, no TZ suffix
    "run_date": "2026-11-17",                    // RUN_TAG
    "source_file": "probit_dataset_2026-11-17.xlsx",
    "n_contacts": 113857,                        // total ROWS (not distinct people)
    "n_clients": 23,
    "blend_weights": { "connected": 0.15, "replied": 0.35, "scheduled": 0.50 },
    "ai_scored": true
  },
  "overall": <segment>,                          // name="All Clients Combined", id="overall"
  "model_quality": {
    "n_total": 113857, "n_driver_rows": 108230, "n_surround_excluded": 5627,
    "n_eligible_lvl2": 41200, "n_eligible_lvl3": 9800,
    "rf_fitted": ["connected","replied","scheduled","scheduled_lvl2","scheduled_lvl3"],
    "top_drivers": [
      { "feature": "log_connections", "importance": 0.01234, "outcome": "connected" },
      ... up to 8 per distinct "outcome" value ...
    ]
  },
  "clients": {
    "<client_slug>": <segment> + { "hypothesis_groups": { "<hg_slug>": <segment> } }
  }
}
```

### `<segment>` shape (used for `overall`, every client, every hypothesis group)

```
{
  "name": "Acme Health System",
  "id": "acme_health_system",                    // slug, or hypothesis_group_id for a hg segment
  "funnel": {                                     // funnel_stats(df) - ALL rows (incl. surround_connections)
    "n": 4231, "connected": 1200, "replied": 310, "scheduled": 42,
    "connect_rate": 28.4, "reply_rate": 7.3, "meeting_rate": 0.99,
    "cond_reply_rate": 25.8, "cond_meeting_rate": 13.5, "blended_score": 14.62
  },
  "trend": [ { "month": "2026-09", "n": 1200, "connect_rate": 27.1, "reply_rate": 6.9, "meeting_rate": 0.83 }, ... ],
  "message_type_overview": [ { "level": "about_me_connect", "n": 2000, "connect_rate": 30.1, "reply_rate": 8.0, "meeting_rate": 1.1 }, ... ],
  "sufficient_data": true,                        // false if < CFG$min_segment_n core rows
  "n_driver_rows": 4100,                          // = core row count for this segment
  // --- only present when sufficient_data == true: ---
  "keys": {
    "working":     [ <key>, ... up to 10, sorted effect_pp desc ... ],
    "not_working": [ <key>, ... up to 10, sorted effect_pp asc (most negative first) ... ]
  },
  "research": {
    "company_vs_prospect": {
      "avg_pct_about_prospect": 52.3, "avg_pct_about_us": 31.1,
      "by_focus_bucket": [ { "bucket": "76-100%", "n": 900, "reply_rate": 9.5, "meeting_rate": 1.4 }, ... ]
    },
    "ai_feel": {
      "avg_ai_score": 2.4,
      "by_ai_score": [ { "ai_score": 1, "n": 500, "reply_rate": 8.9, "meeting_rate": 1.3 }, ... sorted ascending ... ]
    },
    "reason_to_connect": [ <rate_row>, ... ],         // frequency-sorted
    "personal_sharing": [ <rate_row>, ... ],          // order: Unique, Generic, None
    "connect_phrasing": [ <rate_row>, ... ],
    "exclamation_use": [ <rate_row>, ... ],           // order: None, One, Multiple (2+)
    "emoji_use": [ <rate_row>, ... ],                 // same order
    "abbreviation_use": [ <rate_row>, ... ],          // order: Uses abbreviations, No abbreviations
    "hook_type": [ <rate_row>, ... ],
    "tone": [ <rate_row>, ... ],
    "question_type": [ <rate_row>, ... ],
    "opener_type": [ <rate_row>, ... ],
    "message_type": [ <rate_row>, ... ],
    "rhetorical_question_timing": [ <rate_row>, ... ],  // .POSITION_LEVELS order
    "about_us_timing": [ <rate_row>, ... ],             // .POSITION_LEVELS order
    "meeting_ask_timing": [ <rate_row>, ... ],          // .POSITION_LEVELS order
    "forward_scheduling_timing": [ <rate_row>, ... ],   // .POSITION_LEVELS order
    "calendar_link_timing": [ <rate_row>, ... ],        // .POSITION_LEVELS order
    "datetime_propose_timing": [ <rate_row>, ... ],     // .POSITION_LEVELS order
    "scheduling_prior_interest": [
      { "interest_tier": "Cold/lukewarm reply (1-2)", "forward": "Shared calendar link / specific time in msg 2",
        "n": 40, "reply_rate": 92.5, "meeting_rate": 12.5 }, ... up to 6 rows (3 tiers x 2 forward labels) ...
    ],
    "message_variation": [ <rate_row>, ... ],           // empty [] if no A/B variation tested for this segment
    "message_length": [ <rate_row>, ... ],              // 11 char-band order
    "readability": [ <rate_row>, ... ],                 // Easy/Standard/Advanced/Complex order
    "day_of_week": [ <rate_row>, ... ],                 // Mon..Sun order
    "time_of_day": [ <rate_row>, ... ],                 // 6-bucket day order
    "day_time": [ <rate_row>, ... ],                    // day x time-of-day order
    "request_day_of_week": [ <rate_row>, ... ],         // same shape, but about conn_request_sent time
    "request_time_of_day": [ <rate_row>, ... ],
    "request_day_time": [ <rate_row>, ... ],
    "by_connections": [ <rate_row>, ... ],              // <500 .. 5,000+ order
    "total_messages": [ <rate_row>, ... ],              // 1,2,3,4-5,6-10,11+ order
    "audience_seniority": [ <rate_row>, ... ],
    "audience_org_type": [ <rate_row>, ... ],
    "bdr_performance": [ <rate_row>, ... ],             // only BDRs with >= min_arm_n rows
    "top_phrases": {
      "working":     [ <phrase_lift>, ... up to phrase_top_k=15 ... ],
      "not_working": [ <phrase_lift>, ... up to 15 ... ]
    },
    "key_phrases": [ <recurring_phrase>, ... up to recurring_top_k=25 ... ],
    "style_examples": {
      "<dimension_name>": [
        { "level": "genuine", "n": 300, "reply_rate": 9.1, "meeting_rate": 1.4,
          "examples": [ <example>, ... up to style_examples_per_level=10 ... ] }, ...
      ], ... one entry per dimension that has at least one non-empty level ...
    },
    "followup": {
      "n_replied": 310, "avg_reply_enthusiasm": 3.2,
      "by_approach":     [ { "approach": "PushedForMeeting", "n": 90, "meeting_rate": 15.6 }, ... sorted desc ... ],
      "by_speed":        [ { "speed": "<1h", "n": 60, "meeting_rate": 20.0 }, ... ],
      "by_reply_length": [ <rate_row with "meeting_rate" + "reply_rate"? NO - only the standard rate_by() fields>, ... ]
    }
  },
  "message_2": {
    "n": 1050,                                    // rows in df_core (not necessarily == n_eligible_rows)
    "n_eligible_rows": 1050,                      // sum(has_msg2==1) within df_core
    "keys": { "working": [...], "not_working": [...] },    // _lvl2-suffixed signals only
    "company_vs_prospect": {...}, "ai_feel": {...},
    "reason_to_connect": [...], "personal_sharing": [...],
    "exclamation_use": [...], "emoji_use": [...], "abbreviation_use": [...],
    "hook_type": [...], "tone": [...], "question_type": [...], "opener_type": [...],
    "meeting_ask_phrasing": [ <rate_row>, ... ],      // Question/Statement/None order
    "has_linebreak": [ <rate_row>, ... ],             // Has line break / No line break order
    "shares_calendar_link": [ <rate_row>, ... ],      // Shares.../No... order
    "message_length": [...], "readability": [...],
    "top_phrases": {"working":[...], "not_working":[...]},
    "key_phrases": [...],
    "style_examples": { "<dim>": [ { "level":..., "n":..., "meeting_rate":..., "examples":[...] } ] },  // NO reply_rate per level here
    // Level-2 ONLY:
    "meeting_ask_phrasing_by_prior_interest":  [ { "interest_tier":..., "ask_style":..., "n":..., "meeting_rate":... }, ... ],
    "has_linebreak_by_prior_interest":         [ { "interest_tier":..., "has_linebreak":..., "n":..., "meeting_rate":... }, ... ],
    "shares_calendar_link_by_prior_interest":  [ { "interest_tier":..., "shares_calendar_link":..., "n":..., "meeting_rate":... }, ... ]
  },
  "message_3plus": {
    // identical shape to message_2 EXCEPT: no *_by_prior_interest fields at all
    "n": 310, "n_eligible_rows": 310,
    "keys": { "working": [...], "not_working": [...] },     // _lvl3-suffixed signals only
    "company_vs_prospect": {...}, "ai_feel": {...}, ... (same field list as message_2 minus the 3 crosstabs)
  },
  "examples": {
    "meetings_won":          [ <example_basic>, ... up to 5 ... ],
    "high_potential_open":   [ <example_basic>, ... up to 5 ... ]
  },
  "audience_profile": {                            // {} for the "overall" segment; present for client/hg segments
    "connections": <composition_dim>, "seniority": <composition_dim>,
    "org_type": <composition_dim>, "executive": <composition_dim>
  },
  "message_prompt": "You are writing LinkedIn...(full AI-written prompt text)...",  // only if generated successfully
  // --- only present when sufficient_data == false: ---
  "note": "Only 28 contacts eligible for driver analysis (min 40; surround_connections excluded)."
}
```

### Shared sub-object shapes

```
<rate_row>       = { "level": "genuine", "n": 1200, "connect_rate": 29.1, "reply_rate": 8.4, "meeting_rate": 1.2 }
<key>            = { "id": "tone_genuine", "label": "Genuine tone", "category": "Tone", "outcome": "replied",
                     "effect_pp": 3.2, "overall_effect_pp": 2.1, "rate_with": 9.5, "rate_without": 6.3,
                     "n_with": 820, "n_without": 3200, "p_value": 0.0012,
                     "connection_controlled": true, "confidence": "High" }
<phrase_lift>    = { "phrase": "love to connect", "n": 310, "reply_rate_with": 9.8, "reply_rate_without": 6.1,
                     "effect_pp": 3.7, "connection_controlled": true, "p_value": 0.003 }
<recurring_phrase> = { "phrase": "open to a quick chat", "count": 145, "pct_of_messages": 3.4,
                       "category": "Meeting ask", "lift_pp": 2.1, "lift_outcome": "reply",
                       "connection_controlled": false }
<example>        = { "contact": "Jane Smith", "title": "VP Clinical Ops", "company": "Acme Health",
                     "outcome": "Meeting", "opportunity": 78.4, "message": "<first 500 chars>" }
<example_basic>  = { "contact": "...", "title": "...", "company": "...",
                     "message_type": "about_me_connect", "opportunity": 78.4, "message": "<first 500 chars>" }
                     // note: example_basic uses "message_type" instead of "outcome" (different field!)
<composition_dim> = {
  "by_level": [
    { "level": "5,000+", "group_pct": 22.1, "baseline_pct": 14.0, "index": 158,
      "group_n": 320, "baseline_n": 9800 }, ...
  ],
  "n_group": 1450, "n_baseline": 70000,
  "expected_vs_actual": {
    "actual_connect_rate": 31.2, "actual_reply_rate": 9.5, "actual_meeting_rate": 1.6,
    "expected_connect_rate": 27.0, "expected_reply_rate": 8.1, "expected_meeting_rate": 1.2
  }
}
```

**Important note repeated for emphasis:** `<example>` (used inside
`style_examples` and `examples.meetings_won`/`examples.high_potential_open`)
has an `outcome` field (`"Meeting"`/`"Replied"`/`"Connected"`/
`"No response"`). `<example_basic>` is NOT used anywhere in the current
schema as written above except as a note — re-check: `example_block()`'s
`pick()` helper actually ALSO uses `message_type` (not `outcome`) as shown
in Section 15.8's code — confirm this exact field name per call site
against the source function (`example_block`'s `pick()` vs.
`pick_level_examples()`) rather than assuming they're identical, since
they are NOT: `example_block`'s examples carry `message_type`;
`pick_level_examples()`'s (used by `style_examples`) carry `outcome`. This
asymmetry is a direct, faithful reflection of the source — do not
"fix"/unify it in a port without confirming with a stakeholder, since
downstream (website) code may already depend on this exact distinction.

The de-identified payload (`payload_deid`) has the IDENTICAL schema —
every `company` field, every client `name`, and every embedded mention in
`message`/`message_prompt`/`phrase` text is replaced with a `Company_NN`
label per Section 17; nothing else differs.

---

## Appendix B — R idioms a porter must replicate correctly

This is a consolidated checklist of every R-specific semantic called out
inline above, gathered in one place for a final correctness pass.

1. **Three-valued logic (TRUE / FALSE / NA)** propagates through nearly
   every comparison and signal in this file. `NA` means "unknown / not
   applicable", and is NOT the same as `FALSE` — e.g. `dat$msg_tone ==
   "genuine"` is `NA` wherever `msg_tone` itself is `NA`, and that `NA`
   must flow into the resulting signal column, not collapse to `0`/
   `false`. Downstream, `adjusted_effect()` explicitly DROPS NA rows from
   both arms rather than ever counting them as "doesn't have the signal".
   A port in a language without native nullable/missing values must model
   this with an explicit tri-state (e.g. `true | false | null`) at every
   comparison derived from a possibly-missing field.
2. **`%||%`** (Section 0b): `a %||% b` returns `b` only if `a` is `NULL`,
   zero-length, OR a single `NA` — NOT a generic falsy-coalesce (`0 %||%
   5` is `0`). **`%0%`** (Section 9.5) is a SEPARATE, similar-but-different
   helper checking `is.na(a[1])` only. Keep both distinct.
3. **`<<-` (superassignment)**: used by `add_sig()` (Section 5) and the
   prompt-generation `reg()` closure (Section 9.5) to mutate an
   ENCLOSING-scope variable (`dat`, `SIG`, `paths`, `briefs`, or `payload`)
   from inside a function call. Model this as explicit mutation of
   passed-in/module-level state in a port, not local-variable return
   values that the caller must remember to reassign.
4. **1-based indexing** everywhere (`bdr_i[1]` is the FIRST element, not
   the second). Every loop bound (`for (i in seq_len(k-1))`,
   `for (n in 1:nmax)`) and index arithmetic must be adjusted by one if
   porting to a 0-indexed language.
5. **`cut()` bucketing boundary semantics**: R's `cut(x, breaks)` is
   RIGHT-CLOSED `(lo, hi]` by default (`right = TRUE`); `include.lowest =
   TRUE` extends only the FIRST bucket to also include its lower bound.
   Several buckets in this file instead explicitly pass `right = FALSE`
   (LEFT-closed, `[lo, hi)`) — e.g. `total_messages_bucket`, `conn_label`.
   **Check each `cut()` call's own `right=`/`include.lowest=` arguments
   individually** — they are not uniform across the file, and an
   off-by-one at a bucket boundary will silently misclassify some rows.
6. **PCRE-flavored regex** (`stringr`, which wraps PCRE/PCRE2): lookaround
   assertions (`(?<!...)`, `(?!...)`), non-capturing/capturing groups,
   case-insensitive inline flag `(?i)`, and `\b` word boundaries are used
   throughout. A port's regex engine needs equivalent lookaround support
   (PCRE, .NET, Python `re`/`regex`, JS `RegExp` all qualify) — re-test
   every pattern against the target engine's exact escaping rules, since
   string-literal escaping conventions differ (e.g. R's `"\\."` inside a
   `paste0()`-built pattern string becomes the 2-character regex `\.`,
   which most other languages also write as `\\.` in their own string
   literals, but confirm per language).
7. **`dplyr`/tidyverse non-standard evaluation**: `group_by()`,
   `summarise()`, `.data[[col]]` (dynamic column reference inside NSE
   verbs), `case_when()` (vectorized first-match-wins, functionally
   equivalent to a per-row if/elseif chain for the purposes of this file's
   usage), and `purrr::transpose()` (columnar data frame -> array of
   row-objects, the single most common "shape conversion" used to produce
   every JSON array-of-objects output in this file). A port's data
   manipulation library (pandas, LINQ, Arrow, plain loops) needs
   equivalents for "group by a column's string value and aggregate",
   "turn a table into an array of per-row objects", and "vectorized
   first-match-wins categorization".
8. **Factors**: `factor(x, levels=...)` — an ordered categorical with a
   FIXED level set; comparisons against a factor's levels can behave
   differently from plain string comparison if the level set doesn't
   include the compared value (becomes `NA`, not `FALSE`). Watch for this
   specifically in `.POSITION_LEVELS`/`DOW_ORDER`/etc.-constrained columns.
9. **Vectorized NA-aware functions**: `pmax(a, b, na.rm=TRUE)` (used in
   `.or_na()`) returns the per-element max while IGNORING NA unless BOTH
   inputs are NA at that position (in which case the result is still NA,
   handled by an explicit follow-up assignment in this file's
   `.or_na()`, since base `pmax(..., na.rm=TRUE)` alone would otherwise
   return `-Inf` for an all-NA element, not NA — note the file's code
   explicitly patches this edge case, don't assume `pmax(na.rm=TRUE)`
   alone is sufficient). A port must replicate the EXACT 3-way outcome
   (real-vs-real -> max; real-vs-NA -> the real one; NA-vs-NA -> NA), not
   whatever a naive two-argument max/coalesce happens to produce for the
   all-missing case.
10. **`jsonlite::toJSON` auto-unboxing / NA handling**: `auto_unbox=TRUE`
    turns any length-1 vector into a JSON scalar (not a 1-element array);
    `na="null"` turns R's `NA` (of any type) into JSON `null`. A port's
    JSON encoder in a typed language typically has no equivalent ambiguity
    to manage (scalars are already scalars), but double-check any
    dynamically-typed target language's default array vs. scalar handling
    for single-element collections before assuming parity.
11. **R's default string sort (`sort()`/`order()`)** is locale-aware by
    default (depends on the R session's locale setting) — used for client/
    hypothesis-group iteration order and for `sort(unique(...))` calls
    throughout the phrase/company logic. For this dataset's actual content
    (English business names), a plain ASCII/codepoint sort should produce
    identical ordering in virtually all cases; flag for a stakeholder if
    any client/company name contains non-ASCII characters where locale
    collation could matter.
12. **`substr(x, 1, 500)`-style hard truncation** (used for every example
    message) is a plain character-count truncation with NO ellipsis
    appended and no attempt to avoid cutting mid-word/mid-multibyte-
    character. Match this exactly — do not "improve" it with a
    word-boundary-aware truncator or an appended "..." unless explicitly
    asked to change the behavior.
13. **`median(x, na.rm=TRUE)`** (used in `impute_frame()`) following R's
    standard definition (average of the two middle values for an
    even-length vector) — most statistics libraries in other languages
    agree on this definition, but confirm before assuming parity for edge
    cases (all-NA columns default the median to 0 in this file's own
    fallback logic, not to the library's own NaN/error behavior).

---

## Appendix C — Porting checklist / suggested module layout

A suggested decomposition for a port, mirroring this guide's section
structure (one module/file per numbered section is a reasonable default;
merge small ones as convenient for the target language's conventions):

- [ ] `config` — `CFG` defaults + override-merge mechanism (Section 5)
- [ ] `io/load` — multi-format (xlsx/csv/json) loader, column-name
      canonicalization map, encoding fixup, known-test-contact filter
      (Section 7)
- [ ] `conversation/parse` — `conversation_history` JSON parsing, the 4
      send-order position buckets, the 3 reply-round levels + scheduling-
      marker truncation, sanitization + "(not sent)" placeholders
      (Section 8)
- [ ] `features/text` — `compute_text_features()` (the generic, 3x-reused
      function), negative-question/calendar-link/name-usage detectors,
      `.first_at()` position rollups, timing/profile/bucket features
      (Section 9)
- [ ] `ai/prompts` — the 5 prompt templates (verbatim), field-extraction
      parsers, the incremental on-disk cache, the post-scoring NA-forcing
      and forward-scheduling derivation (Section 10)
- [ ] `ai/client` — the `lama.batch`/`lamas` equivalent: templated batch
      scoring with resume/cache support, and a plain concurrent-prompt
      caller (Section 3.2's contract)
- [ ] `signals/registry` — the ~140-signal `registerSignal()` equivalent,
      reproduced id-for-id with exact scope/outcome/category (Section 11)
- [ ] `model/rf` — the Random Forest + elastic-net fit, imputation, OOB
      scoring, opportunity score (Section 12)
- [ ] `stats/keys` — `adjusted_effect()`, EB shrinkage + trust guards,
      `compute_keys()` (Section 13) — the highest-stakes section to get
      bit-for-bit correct
- [ ] `phrases` — n-gram tokenization, `phrase_keys()`,
      `phrase_category()`, `collapse_phrases()` (union-find), 
      `recurring_phrases()` (Section 14)
- [ ] `report/assemble` — `rate_by()`, `funnel_stats()`, `research_block()`
      + `research_block_level()`, style examples, audience-profile
      composition, `build_segment()`, top-level payload assembly
      (Section 15)
- [ ] `prompts/improve` — segment-brief building, the prompt-writer system
      prompt (verbatim), the per-segment generation loop (Section 16)
- [ ] `deidentify` — the exact-match + prose-scan company redaction,
      INCLUDING the client-names-only prose-scan restriction (Section 17)
- [ ] `publish` — JSON serialization settings, local/website/Firebase
      writes, console summary (Section 18)
- [ ] `checkpoint` — the 7-object save for the downstream optimizer
      (Section 19)

**Recommended porting/validation order:** build and unit-test Sections
7-9 (load -> parse -> features) first, since every later stage depends on
their output being row-identical to the R version. Then Section 11
(signals) and Section 13 (keys engine) together, since they're the
highest-value, highest-risk-of-subtle-bugs piece — validate by running
BOTH the original R script and the port against the SAME input export and
diffing the resulting `keys.working`/`keys.not_working` arrays per
segment (not just spot-checking a few numbers). Section 14 (phrases,
especially `collapse_phrases()`'s union-find) is the next highest-risk
piece for subtle divergence. Sections 15-19 (assembly/publish) are
comparatively mechanical once the upstream data is correct, but still
diff the FULL final JSON (not just a sample) against a real R-produced
payload for at least one full real dataset before considering the port
complete.

