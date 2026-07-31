/**
 * Type definitions for the Connect Success Model weekly analysis payload.
 *
 * Source: "Connect Success Model v1.R"
 * Published to Firebase Realtime Database at:
 *   ConnectAnalysis/latest              -> most recent full run (render by default)
 *   ConnectAnalysis/runs/<YYYY-MM-DD>   -> historical snapshots
 *   ConnectAnalysis/index/<YYYY-MM-DD>  -> { last_run, updated_at } run-picker pointers
 *
 * Conventions:
 *  - All *_rate values are already percentages (22.3 === 22.3%).
 *  - *_pp values are percentage points (e.g. a move from 4% to 6% is +2 pp).
 *  - Any missing/undefined numeric is null. Always handle null gracefully.
 */

/** Top-level payload stored at ConnectAnalysis/latest and /runs/<date>. */
export interface ConnectAnalysisPayload {
  meta: Meta;
  /** All clients combined; same shape as any Segment. */
  overall: Segment;
  model_quality: ModelQuality;
  /** Keyed by URL-safe client slug (e.g. "blue_goat_cyber"). */
  clients: Record<string, ClientSegment>;
}

export interface Meta {
  /** ISO-8601 local timestamp the run was generated. */
  generated_at: string;
  /** Run tag / date, format YYYY-MM-DD. */
  run_date: string;
  /** Basename of the input export (xlsx/csv/json). */
  source_file: string;
  n_contacts: number;
  n_clients: number;
  /** Weights used to compute blended_score from the three funnel rates. */
  blend_weights: {
    connected: number;
    replied: number;
    scheduled: number;
  };
  /** Whether AI feature scoring ran for this payload. */
  ai_scored: boolean;
}

export type Outcome = "connected" | "replied" | "scheduled";

export interface ModelQuality {
  n_total: number;
  /** Which outcomes had a random-forest model successfully fitted. */
  rf_fitted: Outcome[];
  /** Strongest predictive features per outcome (internal snake_case names). */
  top_drivers: TopDriver[];
}

export interface TopDriver {
  feature: string;
  importance: number | null;
  outcome: string;
}

/** A client-level Segment that also carries its hypothesis groups. */
export interface ClientSegment extends Segment {
  /** Keyed by URL-safe hypothesis-group slug. */
  hypothesis_groups: Record<string, Segment>;
}

/**
 * Core analysis unit (client, hypothesis group, or "overall").
 *
 * IMPORTANT: when `sufficient_data` is false the segment has < 40 contacts and
 * only `funnel`, `trend`, and `note` are present. The UI MUST check this flag
 * and hide the keys/research/examples panels, showing `note` instead.
 */
export interface Segment {
  name: string;
  /** "overall", a hypothesis_group_id, or a slug. */
  id: string | null;
  sufficient_data: boolean;
  /** Present only when sufficient_data is false. */
  note?: string;
  funnel: Funnel;
  trend: TrendPoint[];
  keys?: Keys;
  research?: Research;
  examples?: Examples;
  /**
   * AI-generated, ready-to-use prompt for writing new outreach messages tuned to what works
   * for this exact segment (built from its funnel, keys, top-performing dimension levels, and
   * winning example messages). Present only when build_prompts was enabled for the run and
   * this segment had sufficient_data. Render as a copyable block (e.g. a "Generate messages
   * for this segment" box with a copy-to-clipboard button).
   */
  message_prompt?: string;
  /** Present on client-level segments. */
  hypothesis_groups?: Record<string, Segment>;
}

export interface Funnel {
  n: number;
  connected?: number;
  replied?: number;
  scheduled?: number;
  /** % of contacts who accepted the connection. */
  connect_rate?: number | null;
  /** % who replied. */
  reply_rate?: number | null;
  /** % who scheduled a meeting (2 decimals). */
  meeting_rate?: number | null;
  /** % of connected who replied. */
  cond_reply_rate?: number | null;
  /** % of replied who scheduled. */
  cond_meeting_rate?: number | null;
  /** Headline KPI: 0.15*connect_rate + 0.35*reply_rate + 0.50*meeting_rate. */
  blended_score?: number | null;
}

export interface TrendPoint {
  /** YYYY-MM. */
  month: string;
  n?: number;
  connect_rate?: number | null;
  reply_rate?: number | null;
  meeting_rate?: number | null;
}

export type Confidence = "High" | "Medium" | "Low";

export interface Keys {
  working: KeyItem[];
  not_working: KeyItem[];
}

/** A tested success signal. */
export interface KeyItem {
  id?: string;
  label: string;
  category: string;
  outcome: Outcome;
  /** Connection-adjusted, empirical-Bayes-shrunk change in outcome rate (pp). */
  effect_pp: number | null;
  /** Same effect measured across all data (benchmark). */
  overall_effect_pp?: number | null;
  /** Outcome rate (%) when the signal is present. */
  rate_with?: number | null;
  /** Outcome rate (%) when the signal is absent. */
  rate_without?: number | null;
  n_with?: number | null;
  n_without?: number | null;
  p_value?: number | null;
  /** Adjusted for the prospect's LinkedIn connection count. */
  connection_controlled?: boolean | null;
  confidence: Confidence;
}

/** A breakdown row: outcome rates for one level of a dimension. */
export interface RateRow {
  level: string;
  n: number;
  connect_rate?: number | null;
  reply_rate?: number | null;
  meeting_rate?: number | null;
}

export interface Research {
  company_vs_prospect: CompanyVsProspect;
  ai_feel: AiFeel;
  reason_to_connect: RateRow[];
  hook_type: RateRow[];
  tone: RateRow[];
  question_type: RateRow[];
  opener_type: RateRow[];
  message_type: RateRow[];
  /**
   * 25-character bands, always in ascending chronological order (do not re-sort):
   * "1-25", "26-50", "51-75", "76-100", "101-125", "126-150", "151-175", "176-200",
   * "201-225", "226-250", "251+". With 11 bins, high-character buckets can be low-n in
   * narrow client/hypothesis-group segments — render as an ordered bar chart and consider
   * de-emphasizing low-n bars.
   */
  message_length: RateRow[];
  readability: RateRow[];
  /**
   * AI-scored: how specific the personal detail the sender shares about themselves is.
   * 3 levels, in this order: "Unique" (a distinctive personal detail/shared experience),
   * "Generic" (a vague claim anyone could make), "None" (nothing personal). New field —
   * blank/absent until a full AI re-scan has been run.
   */
  personal_sharing: RateRow[];
  /**
   * Regex-based (non-AI) classification of how the first message phrases its connect
   * request. Levels: "Let's connect", "Worth connecting", "Would love to connect",
   * "Open to connecting", "Happy to connect", "Would like to connect", "Other connect ask",
   * "No connect ask".
   */
  connect_phrasing: RateRow[];
  /** Count of "!" in the first message. 3 levels: "None", "One", "Multiple (2+)". */
  exclamation_use: RateRow[];
  /** Count of emoji (incl. flags) in the first message. 3 levels: "None", "One", "Multiple (2+)". */
  emoji_use: RateRow[];
  /** Informal/texting shorthand (lol, btw, fyi, ...). 2 levels: "Uses abbreviations", "No abbreviations". */
  abbreviation_use: RateRow[];
  day_of_week: RateRow[];
  /**
   * Exactly 6 levels, always emitted in this chronological order (do not re-sort):
   * "Early morning (5-8a)", "Morning (9-11a)", "Afternoon (12-2p)", "Late afternoon (3-5p)",
   * "Evening (6-9p)", "Overnight (10p-4a)". Times are US Central.
   */
  time_of_day: RateRow[];
  /**
   * Day x time-of-day cross, up to 42 rows (7 days x 6 parts). `level` is `"{Day} {Part}"`
   * (e.g. "Monday Afternoon"), where Part matches time_of_day's levels minus the
   * parenthetical time range. Many rows are low-n — render as a heatmap (dimming/hatching
   * sparse cells) or filter by a minimum n (e.g. n >= 20) before treating as meaningful.
   */
  day_time: RateRow[];
  /**
   * Same shape/levels as `day_of_week`, but built from `conn_request_sent` — when the
   * connection request was actually SENT (US Central) — rather than first-message/outreach
   * dates, which mostly track acceptance/reply timing. This is the true "when should the
   * invite land?" signal. Rank/sort by `connect_rate` (acceptance), not `reply_rate` — that's
   * the outcome send-time actually influences. Empty/absent if `conn_request_sent` wasn't
   * available for this segment; fall back to `day_of_week`.
   */
  request_day_of_week?: RateRow[];
  /** Same as `time_of_day` but built from `conn_request_sent`. Rank by `connect_rate`. Falls back to `time_of_day` if absent. */
  request_time_of_day?: RateRow[];
  /** Same as `day_time` but built from `conn_request_sent`. Rank by `connect_rate`. Falls back to `day_time` if absent. */
  request_day_time?: RateRow[];
  by_connections: RateRow[];
  total_messages: RateRow[];
  audience_seniority: RateRow[];
  audience_org_type: RateRow[];
  bdr_performance: RateRow[];
  /** Phrases that move the reply rate (connection-controlled). */
  top_phrases: TopPhrases;
  /** The multi-word phrases used most often, tagged by intent. */
  key_phrases: KeyPhrases;
  followup: FollowupBlock;
  /** Real messages behind every research breakdown dimension above (same keys). */
  style_examples?: StyleExamples;
}

/**
 * Keys match every dimension key that has a matching rate-table breakdown above.
 * For most dimensions, StyleExampleLevel.level equals that RateRow's raw level string.
 * Two dimensions use a different raw key than their display label:
 *   - ai_feel: level is the stringified numeric ai_score (e.g. "5"), not a display label.
 *   - company_vs_prospect: level is the raw bucket string (e.g. "76-100%"), not "76-100% about them".
 */
export interface StyleExamples {
  tone?: StyleExampleLevel[];
  hook_type?: StyleExampleLevel[];
  reason_to_connect?: StyleExampleLevel[];
  opener_type?: StyleExampleLevel[];
  question_type?: StyleExampleLevel[];
  message_type?: StyleExampleLevel[];
  message_length?: StyleExampleLevel[];
  readability?: StyleExampleLevel[];
  personal_sharing?: StyleExampleLevel[];
  connect_phrasing?: StyleExampleLevel[];
  exclamation_use?: StyleExampleLevel[];
  emoji_use?: StyleExampleLevel[];
  abbreviation_use?: StyleExampleLevel[];
  day_of_week?: StyleExampleLevel[];
  time_of_day?: StyleExampleLevel[];
  day_time?: StyleExampleLevel[];
  request_day_of_week?: StyleExampleLevel[];
  request_time_of_day?: StyleExampleLevel[];
  request_day_time?: StyleExampleLevel[];
  by_connections?: StyleExampleLevel[];
  total_messages?: StyleExampleLevel[];
  audience_seniority?: StyleExampleLevel[];
  audience_org_type?: StyleExampleLevel[];
  bdr_performance?: StyleExampleLevel[];
  ai_feel?: StyleExampleLevel[];
  company_vs_prospect?: StyleExampleLevel[];
}

export interface StyleExampleLevel {
  /** Raw key matching the dimension's rate-table row (see StyleExamples doc comment for ai_feel/company_vs_prospect nuance). */
  level: string;
  /** Optional convenience copy of the matching RateRow.n. */
  n?: number | null;
  /** Optional convenience copy of the matching RateRow.reply_rate. */
  reply_rate?: number | null;
  /** Optional convenience copy of the matching RateRow.meeting_rate. */
  meeting_rate?: number | null;
  /** Ordered best-outcome-first; the first item is this level's strongest real example. */
  examples: StyleExampleItem[];
}

export type StyleOutcome = "Meeting" | "Replied" | "Connected" | "No response";

export interface StyleExampleItem {
  /** Real prospect-facing message text (same privacy caveat as top-level Examples). */
  message: string | null;
  /** The best outcome this particular contact reached. */
  outcome: StyleOutcome;
  /** Model-scored opportunity, same scale as top-level ExampleItem.opportunity. */
  opportunity?: number | null;
}

export interface CompanyVsProspect {
  avg_pct_about_prospect: number | null;
  avg_pct_about_us: number | null;
  by_focus_bucket: Array<{
    /** "0-25%" | "26-50%" | "51-75%" | "76-100%" */
    bucket: string;
    n: number;
    reply_rate: number | null;
    meeting_rate: number | null;
  }>;
}

export interface AiFeel {
  /** 1 = clearly human ... 5 = obviously AI. */
  avg_ai_score: number | null;
  by_ai_score: Array<{
    ai_score: number;
    n: number;
    reply_rate: number | null;
    meeting_rate: number | null;
  }>;
}

export interface TopPhrases {
  working: TopPhraseItem[];
  not_working: TopPhraseItem[];
}

export interface TopPhraseItem {
  phrase: string;
  /** Messages containing the phrase. */
  n: number;
  reply_rate_with: number | null;
  reply_rate_without: number | null;
  /** Connection-controlled reply-rate lift (percentage points). */
  effect_pp: number | null;
  connection_controlled: boolean | null;
  p_value: number | null;
}

export type PhraseCategory =
  | "Meeting ask"
  | "About the prospect"
  | "About us"
  | "Compliment / reaction"
  | "Gratitude"
  | "Other";

export interface KeyPhrases {
  /** Recurring phrases in the first outreach message. */
  opening: KeyPhraseItem[];
  /** Recurring phrases in the reply sent right after the prospect responds. */
  followup: KeyPhraseItem[];
}

export interface KeyPhraseItem {
  phrase: string;
  /** Messages containing the phrase. */
  count: number;
  /** Share of messages in scope that use it. */
  pct_of_messages: number | null;
  category: PhraseCategory;
  /** Connection-controlled effect on lift_outcome (percentage points). */
  lift_pp: number | null;
  lift_outcome: "reply" | "meeting";
  connection_controlled: boolean | null;
}

export interface FollowupBlock {
  n_replied: number;
  /** Warmth of prospect's reply, 1-5. */
  avg_reply_enthusiasm?: number | null;
  by_approach?: Array<{ approach: string; n: number; meeting_rate: number | null }>;
  by_speed?: Array<{ speed: string; n: number; meeting_rate: number | null }>;
  by_reply_length?: RateRow[];
}

export interface Examples {
  meetings_won: ExampleItem[];
  high_potential_open: ExampleItem[];
}

/** Contains real contact names and message text; handle per-client privacy. */
export interface ExampleItem {
  contact: string | null;
  title: string | null;
  company: string | null;
  message_type: string | null;
  /** Model-scored opportunity. */
  opportunity: number | null;
  /** First message, truncated to 500 chars. */
  message: string | null;
}

/** Lightweight pointer stored at ConnectAnalysis/index/<YYYY-MM-DD>. */
export interface RunIndexEntry {
  last_run: string;
  updated_at: string;
}
