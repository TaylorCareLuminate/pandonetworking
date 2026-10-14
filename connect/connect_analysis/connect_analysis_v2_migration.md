# Connect Analysis payload — "3 different models" migration notes

**For the front-end team.** This is a short, practical summary of what changed in the JSON payload produced by `Connect Success Model v1.R`. For full field-by-field reference, see the three companion docs (all updated to match this release):

- `connect_analysis_ingestion_spec.md` — full prose spec, §4a is the new section
- `connect_analysis.schema.json` — JSON Schema (Draft-07), see `ContentBlock` definition
- `connect_analysis.types.ts` — TypeScript types, see `ContentBlock` interface

## Why

Every *content* breakdown (tone, hook, reason to connect, personalization, AI feel, question type, opener, phrases, "keys to success") used to be measured almost entirely from the opening message. Now it's measured **three separate times, as three independent models** — because what makes a good opener, a good early reply, and a good later-conversation message are different questions with different answers.

## What's new

Every `<segment>` object (`overall`, each client, each hypothesis group) gains two new sibling fields next to `keys`/`research`:

```json
{
  "keys": { ... },          // unchanged — Message 1 (pre-reply) only now
  "research": { ... },      // unchanged — Message 1 content + ALL non-content breakdowns
  "message_2": { ... },     // NEW
  "message_3plus": { ... }  // NEW
}
```

| Block | Population | Outcome measured |
|---|---|---|
| `keys` / `research` (Message 1) | every driver-eligible contact | connected, replied, scheduled |
| `message_2` | contacts messaged again **before** their 2nd reply (i.e. everything sent between the 1st and 2nd reply) | **scheduled only** |
| `message_3plus` | contacts messaged again **after** their 2nd reply | **scheduled only** |

`message_2`/`message_3plus` only report `scheduled` because connected/replied are trivially true for those populations by construction — there's nothing left to measure there.

### Shape of `message_2` / `message_3plus` (the `ContentBlock` type)

```json
"message_2": {
  "n_eligible_rows": 4100,                                 // population size — show this near the tab label
  "keys": { "working": [ KeyItem... ], "not_working": [ KeyItem... ] },  // same KeyItem shape as today, outcome always "scheduled"
  "company_vs_prospect": { "avg_pct_about_prospect": ..., "avg_pct_about_us": ..., "by_focus_bucket": [ ... ] },
  "ai_feel": { "avg_ai_score": ..., "by_ai_score": [ ... ] },
  "reason_to_connect": [ RateRow... ],
  "personal_sharing": [ RateRow... ],
  "exclamation_use": [ RateRow... ],
  "emoji_use": [ RateRow... ],
  "abbreviation_use": [ RateRow... ],
  "hook_type": [ RateRow... ],
  "tone": [ RateRow... ],
  "question_type": [ RateRow... ],
  "opener_type": [ RateRow... ],
  "message_length": [ RateRow... ],
  "readability": [ RateRow... ],
  "top_phrases": { "working": [ ... ], "not_working": [ ... ] },
  "key_phrases": [ KeyPhraseItem... ],
  "style_examples": { "tone": [ StyleLevel... ], "hook_type": [ ... ], ... }
}
```

This is **the same component set you already render for `research`** — same `RateRow`/`KeyItem`/`StyleLevel`/phrase shapes — just a second (and third) independent copy. **The practical implication: you can reuse your existing Keys panel, research-accordion, and phrases-panel components for all three blocks with no new UI code**, just point them at `message_2`/`message_3plus` instead of `research`/`keys`.

One quirk: every rate row in these two blocks still carries `connect_rate`/`reply_rate`/`meeting_rate` for shape-compatibility, but **only `meeting_rate` is meaningful** (the other two read ~100%, trivially). Render these panels by `meeting_rate` only.

**Either block may be absent or near-empty** for small hypothesis groups that didn't have enough contacts reach that reply round. Treat it the same way you already treat `sufficient_data: false` — hide the tab/panel, don't render an empty chart.

### Recommended UI: a 3-way tab

Add a tab/toggle to each segment dashboard: **"Opening Message"** (today's `keys` + `research`) / **"Message 2"** (`message_2`) / **"Message 3+"** (`message_3plus`). Show `n_eligible_rows` next to each tab label so it's clear each later tab is a smaller, later-funnel population (e.g. "Message 2 (4,100 contacts reached this point)").

## Breaking change — `research.key_phrases`

**Shape changed from an object to a flat array:**

```diff
- "key_phrases": {
-   "opening":  [ KeyPhraseItem... ],
-   "followup": [ KeyPhraseItem... ]
- }
+ "key_phrases": [ KeyPhraseItem... ]
```

`research.key_phrases` is now Message-1 (pre-reply) phrases only. The old `"followup"` bucket is retired — it's superseded by the much fuller `message_2.key_phrases` (which analyzes *everything* sent before the 2nd reply, not just the single message right after the 1st reply). `research.top_phrases` is unchanged in shape, just also now scoped to Message 1 only.

**Action required:** update whatever reads `research.key_phrases.opening` / `research.key_phrases.followup` to read `research.key_phrases` directly (Message 1) and `message_2.key_phrases` (the new follow-up phrases).

## Smaller additions

- **`model_quality`** gained `n_eligible_lvl2` / `n_eligible_lvl3`, and `rf_fitted` / `top_drivers[].outcome` can now include `"scheduled_lvl2"` / `"scheduled_lvl3"` alongside the existing `"connected"`/`"replied"`/`"scheduled"` — three independent Random Forest models are now fit instead of one.
- Nothing else changed shape. `funnel`, `trend`, `message_type_overview`, `examples`, `message_prompt`, and every existing field on `research`/`keys` keep their exact current shape and meaning — this is a purely **additive** change at the top level aside from the one breaking change above.

## Migration checklist

1. Update the `research.key_phrases` reader (object → array; see above). This is the only breaking change.
2. Add rendering support for `message_2` / `message_3plus` — reuse existing Keys/Research/Phrases components, pointed at the new blocks.
3. Guard on block presence/emptiness the same way you already guard on `sufficient_data`.
4. Optionally surface the new `model_quality.n_eligible_lvl2/lvl3` and the `scheduled_lvl2`/`scheduled_lvl3` driver lists in a "what predicts success" panel.
5. Validate against the updated `connect_analysis.schema.json` / `connect_analysis.types.ts` before shipping.
