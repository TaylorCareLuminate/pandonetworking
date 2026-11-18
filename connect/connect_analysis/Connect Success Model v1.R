# ==============================================================================
# CONNECT SUCCESS MODEL v1
# ------------------------------------------------------------------------------
# Purpose: Find the "keys to success" for LinkedIn outreach, broken down by
#          CLIENT x HYPOTHESIS GROUP, and publish a website-ready JSON payload
#          to Firebase each week for client review dashboards.
#
# Successor to "Probit Analysis v3.R". Key differences:
#   - Adds a machine-learning model (Random Forest via ranger + regularized
#     logistic regression via glmnet) on top of the interpretable statistics.
#   - Produces a per-segment (client x hypothesis group) "keys to success"
#     report: what is working, what is not, each effect CONTROLLED for the
#     prospect's LinkedIn connection count (so phrase/feature effects are not
#     spurious) and SHRUNK toward the pooled mean so small segments do not
#     produce noisy conclusions.
#   - Answers the research questions: company-vs-prospect focus, "AI-ish" feel,
#     which phrases work (connection-controlled), follow-up quality after a
#     reply, and the (implied) reason given to connect.
#   - Emits a nested JSON object designed to be rendered directly on the site.
#
# Run inside the normal R session (so .Rprofile helpers such as lama.batch,
# saver/loadr, writecsv and uploadData are available). Missing helpers are
# sourced / stubbed automatically below.
# ==============================================================================

# ------------------------------------------------------------------------------
# Force-reload .Renviron every run. R only reads .Renviron once, at process
# startup - a long-lived RStudio session started BEFORE a credential was added
# to .Renviron (e.g. FIREBASE_SERVICE_ACCOUNT_JSON) will never see it and the
# Firebase publish step will keep failing with "No Firebase credentials found"
# no matter how many times .Renviron itself is fixed, until that R session is
# restarted. readRenviron() here re-reads the file into THIS session on every
# source(), so a stale/long-lived session self-heals instead of silently
# failing. (Confirmed root cause 2026-11-11: a session running since 11/02
# predated the 11/03 .Renviron fix and kept failing publishes for over a week.)
.renviron_path <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/Documents/.Renviron"
if (file.exists(.renviron_path)) {
  readRenviron(.renviron_path)
} else {
  warning("Expected .Renviron not found at: ", .renviron_path,
          " — Firebase credentials may be missing.")
}

# ==============================================================================
# SECTION 0 - CONFIGURATION
# ==============================================================================

CFG <- list(
  # --- Input -----------------------------------------------------------------
  # Path to this week's export. Accepts the Excel export (.xlsx/.xls, title-case
  # headers), the CSV, or the JSON pipeline export. Leave NULL to auto-pick the
  # newest probit_dataset_*.xlsx / .csv / .json in the Connect folder.
  input_path   = NULL,
  connect_dir  = "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Connect",

  # --- AI scoring ------------------------------------------------------------
  run_ai       = TRUE,      # FALSE = skip all lama.batch calls (dry run / structure test)
  ai_model     = "qwen/qwen3.7-flash", # OpenRouter needs the vendor/ prefix
  ai_batch     = 1000,
  use_cache    = TRUE,      # reuse previously-scored rows so weekly runs are incremental
  rescan_all   = FALSE,     # TRUE = ignore + rebuild the AI cache and score every row
                            # from scratch (use after fixing message content upstream)
  # Token budget for the AI reply. The first-message prompt returns ~16 fields on
  # one line, so it needs far more than lamas()'s 20-token default or the reply is
  # truncated (only the first ~5 fields come back). Follow-up returns 3 fields.
  ai_max_tokens_first    = 160L,
  ai_max_tokens_followup = 60L,
  ai_max_tokens_position = 150L,  # position prompt returns 12 short fields on one line (8 + 4 DATETIME)
  ai_max_tokens_level    = 180L,  # Level-2/3 prompt returns ~15 fields on one line (14 + ASKSTYLE)

  # --- Message-improvement prompt generation (Opus via OpenRouter) -----------
  # After the analysis is built, hand each segment's keys-to-success, winning
  # research levels and real example messages to a strong model and have it WRITE
  # a ready-to-use, powerful prompt that instructs a downstream AI to compose new
  # messages tuned to what works for that client x hypothesis group.
  build_prompts          = TRUE,
  prompt_model           = "anthropic/claude-opus-4.8", # OpenRouter slug for Opus (latest: Opus 4.8)
  prompt_max_tokens      = 1600L,       # room for a thorough prompt + few-shot examples
  prompt_hypothesis_groups = TRUE,      # also generate one per hypothesis group (not just per client)
  prompt_examples_n      = 6,           # winning example messages to feed the writer

  # --- Output ----------------------------------------------------------------
  upload             = TRUE,                 # PUT the JSON payload to Firebase
  firebase_root      = "ConnectAnalysis",    # top node; per-run child is the run date
  save_local_json    = TRUE,
  local_out_dir      = "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Data Reports",
  # Also save a second, BLINDED copy of the same local JSON: every real client
  # account name and every real prospect company name (anywhere in the payload,
  # including inside example message text and the AI-written message_prompt
  # narratives) is swapped for a stable "Company_01", "Company_02", ... label.
  # The same real-world company always gets the same label within a run. A
  # real_name -> label lookup CSV is saved alongside it for internal reference
  # (keep that file out of anything sent externally).
  save_deidentified_json = TRUE,
  save_company_map_csv   = TRUE,
  # Website repo drop: mirror the payload into the site's expected folder so the
  # page picks it up automatically. Writes <website_dir>/latest.json (default the
  # site reads), <website_dir>/runs/<run_date>.json (history), and index.json
  # (run-picker pointer). Set to NULL to disable.
  website_dir        = "C:/repos/HealthLuminateSiteFromLocal/connect/connect_analysis",

  # --- Modelling / statistics ------------------------------------------------
  # Blended funnel score weights (applied to the three stage RATES, in %).
  # Meetings matter most, but early-funnel health is still surfaced.
  blend_weights      = c(connected = 0.15, replied = 0.35, scheduled = 0.50),

  # Minimum rows for a client x hypothesis-group segment to get its own report.
  min_segment_n      = 40,
  # Minimum rows in each arm (with / without a signal) before a key is trusted.
  min_arm_n           = 12,
  # Empirical-Bayes pseudo-count: how hard to shrink small-segment rates toward
  # the pooled mean. Larger = more shrinkage.
  eb_pseudo_count    = 25,
  # Minimum |shrunk effect| (percentage points) to list a key as working / not.
  min_key_effect_pp  = 1.5,
  # Phrase analysis (reply-lift ranking)
  phrase_min_n       = 30,     # min messages containing a phrase (within its scope)
  phrase_ngram_max   = 3,
  phrase_top_k       = 15,
  # Recurring "phrases we say a lot" discovery (multi-word, categorized)
  recurring_ngram_max = 5,     # longest phrase length to detect
  recurring_min_n     = 25,    # min messages containing the phrase
  recurring_top_k     = 25,    # how many recurring phrases to surface per scope
  # Example messages shown for each level of EVERY research breakdown (tone, hook,
  # reason, AI-feel, company-vs-prospect, audience, length, day, BDR, etc.) so a
  # client can read the real messages behind any rate table. Successful
  # (meeting/reply) examples are prioritised. 0 = disable. Higher = bigger payload.
  style_examples_per_level = 10,

  seed               = 42
)

# Allow a caller to override any CFG field by defining CFG_OVERRIDE before
# sourcing this script (used for dry runs / scheduling).
if (exists("CFG_OVERRIDE") && is.list(CFG_OVERRIDE)) CFG[names(CFG_OVERRIDE)] <- CFG_OVERRIDE

RUN_TAG <- format(Sys.Date(), "%Y-%m-%d")
set.seed(CFG$seed)

# ==============================================================================
# SECTION 0b - LIBRARIES + HELPER BOOTSTRAP
# ==============================================================================
suppressWarnings(suppressMessages({
  library(jsonlite)
  library(dplyr)
  library(stringr)
  library(tidyr)
  library(purrr)
  library(httr)
}))

ensure_pkg <- function(p) {
  if (!requireNamespace(p, quietly = TRUE)) {
    message("Installing missing package: ", p)
    install.packages(p, repos = "https://cloud.r-project.org")
  }
}
ensure_pkg("ranger")
ensure_pkg("glmnet")
ensure_pkg("readxl")   # weekly exports arrive as .xlsx
ensure_pkg("httr2")    # direct-to-Firebase publish (see upload_to_firebase.R)

dir.create(file.path(CFG$connect_dir, "_cache"), showWarnings = FALSE, recursive = TRUE)

FN_DIR <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Function Code"

# Firebase helpers (uploadData, firebase_url). Sourced only if not present.
if (!exists("uploadData") || !exists("firebase_url")) {
  fb_file <- file.path(FN_DIR, "Firebase functions.R")
  if (file.exists(fb_file)) {
    # The file has a trailing example call; source the definitions only.
    fb_src <- readLines(fb_file, warn = FALSE)
    ex_idx <- grep("^firebase_node <-", fb_src)
    if (length(ex_idx)) fb_src <- fb_src[seq_len(ex_idx[1] - 1)]
    eval(parse(text = paste(fb_src, collapse = "\n")), envir = globalenv())
  }
}
if (!exists("firebase_url")) {
  firebase_url <- "https://careluminate-b5f76-default-rtdb.firebaseio.com/"
}

# lama.batch family - sourced lazily and only when AI scoring is requested.
# Always re-source lama.R (when present) so a stale lama.batch() already living in the session
# (e.g. from .Rprofile) can't shadow the current file's fixes.
if (CFG$run_ai) {
  lama_file <- file.path(FN_DIR, "lama.R")
  if (file.exists(lama_file)) source(lama_file) else if (!exists("lama.batch")) {
    stop("run_ai = TRUE but lama.R not found and lama.batch not in session.")
  }
}

# saver / loadr fallbacks (define local versions if the .Rprofile ones are absent)
if (!exists("saver")) {
  .cache_dir <- file.path(CFG$connect_dir, "_cache")
  dir.create(.cache_dir, showWarnings = FALSE, recursive = TRUE)
  saver <- function(object, name) saveRDS(object, file.path(.cache_dir, paste0(name, ".rds")))
  loadr <- function(name) readRDS(file.path(.cache_dir, paste0(name, ".rds")))
  .loadr_exists <- function(name) file.exists(file.path(.cache_dir, paste0(name, ".rds")))
} else {
  # .Rprofile saver writes .rdata via save(); provide an existence + load-by-return wrapper.
  .rd_dir <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/In Process AI"
  .loadr_exists <- function(name) file.exists(file.path(.rd_dir, paste0(name, ".rdata")))
}

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0 || (length(a) == 1 && is.na(a))) b else a

cat(sprintf("Connect Success Model v1 | run tag: %s | AI: %s | upload: %s\n",
            RUN_TAG, CFG$run_ai, CFG$upload))

# ==============================================================================
# SECTION 1 - LOAD + NORMALIZE INPUT (CSV or JSON -> canonical schema)
# ==============================================================================

# Canonical name for a normalized (lowercase, alphanumeric-only) header token.
.CANON_MAP <- c(
  contactname               = "contact_name",
  linkedinurl               = "linkedin_url",
  contactlinkedinurl        = "linkedin_url",     # JSON pipeline export field name
  title                     = "contact_title",
  contacttitle              = "contact_title",
  company                   = "contact_company",
  contactcompany            = "contact_company",
  bdrname                   = "bdr_name",
  bdremail                  = "bdr_email",
  client                    = "client",
  clientname                = "client",
  clientcompany             = "client",           # JSON pipeline export field name
  hypothesisgroup           = "hypothesis_group",
  hypothesisgroupid         = "hypothesis_group_id",
  # Message variation (A/B test angle) - Firestore's hypothesisVariationId /
  # hypothesisVariationLabel, exported by analysis_data.html as either the
  # Excel headers "Hypothesis Sub-Group ID" / "Hypothesis Sub-Group
  # (Variation)" or the JSON fields hypothesis_variation_id /
  # hypothesis_variation_label - all four normalize to canonical names here.
  hypothesissubgroupid      = "hypothesis_variation_id",
  hypothesissubgroupvariation = "hypothesis_variation_label",
  hypothesissubgroup        = "hypothesis_variation_label",
  hypothesisvariationid     = "hypothesis_variation_id",
  hypothesisvariationlabel  = "hypothesis_variation_label",
  connected                 = "connected",
  connectedbyhealthluminate = "connected_by_hl",
  connectedbyhl             = "connected_by_hl",
  currentlyconnectedanysource = "currently_connected",
  currentlyconnectedonlinkedin = "currently_connected",  # JSON pipeline export field name
  currentlyconnected        = "currently_connected",
  connectiondate            = "connection_date",
  firstconnectionrequestsent = "conn_request_sent",
  firstconnectionrequestsentdate = "conn_request_sent",
  connectionrequestsent     = "conn_request_sent",
  connectionrequestsentdate = "conn_request_sent",
  requestsent               = "conn_request_sent",
  firstoutreachsentat       = "conn_request_sent",       # JSON pipeline export field name
  firstoutreachdate         = "first_outreach_date",
  lastmessagedate           = "last_message_date",
  messagetype               = "message_type",
  replied                   = "replied",
  scheduled                 = "scheduled",
  totalmessages             = "total_messages",
  bdrmessages               = "bdr_messages",
  contactmessages           = "contact_messages",
  conversationhistoryjson   = "conversation_history",
  conversationhistory       = "conversation_history",
  linkedinconnections       = "linkedin_connections",
  followercount             = "follower_count",
  about                     = "about",
  experiencejson            = "experience_json",
  experience                = "experience_json",
  educationjson             = "education_json",
  education                 = "education_json",
  enrichedat                = "enriched_at"
)

norm_key <- function(x) tolower(gsub("[^a-z0-9]", "", tolower(x)))

normalize_columns <- function(df) {
  keys <- norm_key(names(df))
  new  <- names(df)
  hit  <- keys %in% names(.CANON_MAP)
  new[hit] <- unname(.CANON_MAP[keys[hit]])
  names(df) <- new
  df
}

# Turn a conversation_history value (JSON string, list, or data frame) into a
# clean JSON string with a `timestamp` field, matching what the parsers expect.
serialize_convo <- function(x) {
  if (is.null(x)) return(NA_character_)
  if (is.character(x) && length(x) == 1) {
    if (is.na(x) || !nzchar(x)) return(NA_character_)
    return(x)                         # already a JSON string (CSV path)
  }
  df <- tryCatch(as.data.frame(x, stringsAsFactors = FALSE), error = function(e) NULL)
  if (is.null(df) || nrow(df) == 0) return(NA_character_)
  if ("datetime" %in% names(df) && !"timestamp" %in% names(df))
    names(df)[names(df) == "datetime"] <- "timestamp"
  jsonlite::toJSON(df, auto_unbox = TRUE)
}

pick_default_input <- function(dir) {
  cands <- list.files(dir, pattern = "probit_dataset.*\\.(xlsx|xls|csv|json)$",
                      full.names = TRUE, ignore.case = TRUE)
  cands <- cands[!grepl("^~\\$", basename(cands))]   # skip Excel lock/temp files
  if (!length(cands)) stop("No probit_dataset_*.xlsx/xls/csv/json found in ", dir)
  cands[order(file.info(cands)$mtime, decreasing = TRUE)][1]
}

# Drop bytes that are not valid UTF-8 so downstream gsub/regex never error.
fix_encoding <- function(df) {
  df[] <- lapply(df, function(c) {
    if (is.character(c)) enc2utf8(iconv(c, from = "", to = "UTF-8", sub = " ")) else c
  })
  df
}

load_outreach <- function(path) {
  ext <- tolower(tools::file_ext(path))
  cat("Loading:", path, "\n")
  if (ext == "json") {
    raw <- jsonlite::fromJSON(path, simplifyDataFrame = TRUE, flatten = FALSE)
    raw <- normalize_columns(raw)
    if ("conversation_history" %in% names(raw))
      raw$conversation_history <- vapply(raw$conversation_history, serialize_convo, character(1))
    # Flatten any residual list columns
    for (cc in names(raw)) if (is.list(raw[[cc]]))
      raw[[cc]] <- vapply(raw[[cc]], function(v)
        if (length(v) == 0) NA_character_ else paste(unlist(v), collapse = "; "), character(1))
  } else if (ext %in% c("xlsx", "xls")) {
    raw <- readxl::read_excel(path, sheet = 1, guess_max = 100000,
                              .name_repair = "minimal")
    raw <- as.data.frame(raw, stringsAsFactors = FALSE, check.names = FALSE)
    # readxl types columns; coerce everything to character so the JSON/text
    # parsing downstream behaves exactly as it does for the CSV path.
    for (cc in names(raw)) if (!is.character(raw[[cc]])) {
      v <- raw[[cc]]
      # Preserve the TIME component for datetimes (needed for send-time analysis);
      # readxl reads Excel datetimes as UTC. Date-only columns stay date-only.
      if (inherits(v, "POSIXct"))   raw[[cc]] <- format(v, "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
      else if (inherits(v, "Date")) raw[[cc]] <- format(v, "%Y-%m-%d")
      else                          raw[[cc]] <- as.character(v)
    }
    raw[raw == ""] <- NA
    raw <- normalize_columns(raw)
  } else {
    raw <- read.csv(path, stringsAsFactors = FALSE, check.names = FALSE,
                    na.strings = c("", "NA"))
    raw <- normalize_columns(raw)
  }
  fix_encoding(raw)
}

INPUT_PATH <- CFG$input_path %||% pick_default_input(CFG$connect_dir)
dat <- load_outreach(INPUT_PATH)

# --- Guarantee required columns exist -----------------------------------------
required_char <- c("contact_name","linkedin_url","contact_title","contact_company",
                   "bdr_name","bdr_email","hypothesis_group","hypothesis_group_id",
                   "hypothesis_variation_id","hypothesis_variation_label",
                   "message_type","conversation_history","about")
for (col in required_char) if (!col %in% names(dat)) dat[[col]] <- NA_character_

# Client column: user adds a `Client` column. Fall back gracefully if absent.
if (!"client" %in% names(dat) || all(is.na(dat$client))) {
  warning("No 'Client' column found - grouping all data under a single client.")
  dat$client <- "All Clients"
}
dat$client          <- ifelse(is.na(dat$client) | !nzchar(trimws(dat$client)),
                               "Unassigned", trimws(dat$client))
dat$hypothesis_group <- ifelse(is.na(dat$hypothesis_group) | !nzchar(trimws(dat$hypothesis_group)),
                               "Ungrouped", trimws(dat$hypothesis_group))

# --- Known internal/test contacts: exclude dataset-wide ----------------------
# Found 2026-11-03: these 2 LinkedIn profiles appear under ~30+ different
# clients each, ALWAYS as connected=1/scheduled=1 (one is literally a BDR
# tooling "test message"; the other is an internal HealthLuminate contact
# whose calls with BDRs got swept in as if they were real client prospects).
# This is almost certainly an automatic connection-test step performed when a
# new BDR seat/account is set up, not real outreach - it was inflating
# connected/replied/scheduled counts for every affected client (in several
# cases, "Previous Connections" hypothesis groups - or even whole clients,
# e.g. Revelar Analytics / ThisWeekHealth - consisted ENTIRELY of these rows
# with zero real contacts). Add any newly-discovered test contacts here by
# their linkedin_url (lowercase as loaded).
KNOWN_TEST_CONTACT_URLS <- c(
  "linkedin.com/in/joe-annoreno-3383b69",   # internal HealthLuminate contact
  "linkedin.com/in/taylorkentdavis"         # BDR tooling test message
)
.n_before_test_filter <- nrow(dat)
dat <- dat[!(dat$linkedin_url %in% KNOWN_TEST_CONTACT_URLS), , drop = FALSE]
if (nrow(dat) < .n_before_test_filter) {
  cat(sprintf("Excluded %d known internal/test-contact row(s) (KNOWN_TEST_CONTACT_URLS) before analysis.\n",
              .n_before_test_filter - nrow(dat)))
}

# Message variation (A/B test angle): most rows have none (blank -> NA), so
# breakdowns/examples only surface segments that actually ran a variation test,
# rather than diluting them with a giant "no variation" bucket.
dat$hypothesis_variation_id    <- ifelse(is.na(dat$hypothesis_variation_id) |
                                          !nzchar(trimws(dat$hypothesis_variation_id)),
                                          NA_character_, trimws(dat$hypothesis_variation_id))
dat$hypothesis_variation_label <- ifelse(is.na(dat$hypothesis_variation_label) |
                                          !nzchar(trimws(dat$hypothesis_variation_label)),
                                          NA_character_, trimws(dat$hypothesis_variation_label))

# --- Numeric coercion ---------------------------------------------------------
num_cols <- c("connected","replied","scheduled","total_messages","bdr_messages",
              "contact_messages","linkedin_connections","follower_count")
for (col in num_cols) {
  if (!col %in% names(dat)) dat[[col]] <- NA
  dat[[col]] <- suppressWarnings(as.numeric(gsub("[^0-9.\\-]", "", as.character(dat[[col]]))))
}
# Outcomes: treat NA as 0 (a send that never connected/replied/scheduled)
for (col in c("connected","replied","scheduled"))
  dat[[col]] <- ifelse(is.na(dat[[col]]), 0, dat[[col]])

# Enforce funnel monotonicity (reply implies connected; scheduled implies replied
# is common but not guaranteed by data; keep observed values, only floor negatives)
for (col in c("connected","replied","scheduled"))
  dat[[col]] <- pmin(pmax(dat[[col]], 0), 1)

cat(sprintf("Loaded %d rows across %d clients / %d hypothesis groups.\n",
            nrow(dat), dplyr::n_distinct(dat$client),
            dplyr::n_distinct(dat$hypothesis_group)))
cat(sprintf("Message variations: %d rows tagged across %d distinct variation(s).\n",
            sum(!is.na(dat$hypothesis_variation_label)),
            dplyr::n_distinct(dat$hypothesis_variation_label[!is.na(dat$hypothesis_variation_label)])))

# --- Message type + "core" flag ----------------------------------------------
# Message Type identifies which builder produced the outreach (news,
# about_me_connect, complement, profile, surround_connections,
# fast_prospect_messaging). 'surround_connections' rely on a teammate already
# being connected, so they are only repeatable to a limited degree: they count in
# the top-of-page funnel but are EXCLUDED from the success-driver analysis below.
dat$message_type <- tolower(trimws(as.character(dat$message_type)))
dat$message_type[is.na(dat$message_type) | dat$message_type == ""] <- NA
dat$is_core <- is.na(dat$message_type) | dat$message_type != "surround_connections"
cat(sprintf("Message types: %s | %d core rows, %d surround_connections (excluded from drivers).\n",
            paste(sort(unique(na.omit(dat$message_type))), collapse = ", "),
            sum(dat$is_core), sum(!dat$is_core)))

# ==============================================================================
# SECTION 2 - PARSE CONVERSATION HISTORY
# ==============================================================================
# Extracts, per row:
#   first_message            first BDR message (the outreach hook)
#   second_bdr_message       second BDR message (a follow-up)
#   prospect_first_reply     the prospect's first reply text
#   bdr_reply_after_reply    the BDR message that immediately follows that reply
#   *_ts timestamps and derived gaps (hours to BDR follow-up)

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

parse_ts <- function(s) {
  if (is.null(s) || is.na(s)) return(as.POSIXct(NA))
  suppressWarnings(as.POSIXct(sub("Z$", "", s), format = "%Y-%m-%dT%H:%M:%OS", tz = "UTC")) %||%
    as.POSIXct(NA)
}

extract_convo_features <- function(x) {
  out <- list(first_message = NA_character_, second_bdr_message = NA_character_,
              prospect_first_reply = NA_character_, bdr_reply_after_reply = NA_character_,
              hours_to_bdr_followup = NA_real_, first_msg_hour = NA_integer_)
  c <- parse_convo(x)
  if (is.null(c)) return(out)
  sender <- as.character(c$sender); text <- as.character(c$text)
  bdr_i  <- which(sender == "BDR")
  con_i  <- which(sender != "BDR")            # Contact / prospect
  if (length(bdr_i) >= 1) {
    out$first_message <- text[bdr_i[1]]
    ts1 <- parse_ts(c$timestamp[bdr_i[1]])    # send time; convert UTC -> US Central
    if (!is.na(ts1)) out$first_msg_hour <- as.integer(format(ts1, "%H", tz = "America/Chicago"))
  }
  if (length(bdr_i) >= 2) out$second_bdr_message <- text[bdr_i[2]]
  if (length(con_i) >= 1) {
    first_reply_idx <- con_i[1]
    out$prospect_first_reply <- text[first_reply_idx]
    nxt_bdr <- bdr_i[bdr_i > first_reply_idx]
    if (length(nxt_bdr) >= 1) {
      out$bdr_reply_after_reply <- text[nxt_bdr[1]]
      ts_reply <- parse_ts(c$timestamp[first_reply_idx])
      ts_bdr   <- parse_ts(c$timestamp[nxt_bdr[1]])
      if (!is.na(ts_reply) && !is.na(ts_bdr))
        out$hours_to_bdr_followup <- as.numeric(difftime(ts_bdr, ts_reply, units = "hours"))
    }
  }
  out
}

cat("Parsing conversation histories...\n")
convo_feats <- purrr::map_dfr(dat$conversation_history, extract_convo_features)
dat <- dplyr::bind_cols(dat, convo_feats)

# --- Whole-conversation message-position segments ----------------------------
# Several analyses below ("when do we talk about ourselves", "when do we ask
# for a meeting", "a No is a Yes") need to look at WHERE in the sequence
# something happens, not just whether it happens anywhere. Every row gets
# split into exactly 4 position buckets:
#   seg_half1    - first half of message 1 (by word count)
#   seg_half2    - second half of message 1
#   seg_msg2     - message 2 (whole), if one was ever sent
#   seg_msg3plus - every message from #3 onward, combined into one segment
# (not reply-aware - these are purely send-order positions, unlike
# second_bdr_message/bdr_reply_after_reply above which are anchored to the
# prospect's first reply). NA when that position was never actually sent, so
# downstream signals correctly exclude "didn't happen" from "happened and
# didn't use X" - same convention used throughout this file.
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
bdr_msgs_list <- lapply(dat$conversation_history, extract_all_bdr_messages)
msg1_text <- vapply(bdr_msgs_list, function(v) if (length(v) >= 1) v[1] else NA_character_, character(1))
halves    <- lapply(msg1_text, split_in_half_words)
dat$seg_half1    <- vapply(halves, `[`, character(1), 1)
dat$seg_half2    <- vapply(halves, `[`, character(1), 2)
dat$seg_msg2     <- vapply(bdr_msgs_list, function(v) if (length(v) >= 2) v[2] else NA_character_, character(1))
dat$seg_msg3plus <- vapply(bdr_msgs_list, function(v)
  if (length(v) >= 3) paste(v[3:length(v)], collapse = " ") else NA_character_, character(1))

# --- Reply-round message LEVELS ("3 different models") -----------------------
# A SEPARATE, coarser segmentation from the seg_half1/seg_half2/seg_msg2/
# seg_msg3plus position buckets above. Those answer "WHERE in the raw send
# order does X first happen" (used only by the neg-question/about-us/
# meeting-ask position analyses). This answers "WHAT does the BDR say in each
# ROUND of the conversation", and is the basis for treating Message 1 /
# Message 2 / Message 3+ as three fully separate analyses - every content
# breakdown (Tone, Hook, Reason, personalization, message craft, phrases,
# keys, and the Random Forest model) is computed three times, once per level
# below, instead of once from first_message only. Boundaries are anchored to
# the PROSPECT'S replies (not raw send order):
#   msg1_text - every BDR message sent BEFORE the prospect's 1st reply,
#               combined (usually just first_message; can include multiple
#               pre-reply nurture touches if the BDR sent more than one).
#   msg2_text - every BDR message sent FROM the prospect's 1st reply up to
#               (not including) their 2nd reply, combined. NA if the prospect
#               never replied, or replied once but the BDR never sent
#               anything back.
#   msg3_text - every BDR message sent FROM the prospect's 2nd reply onward,
#               combined. NA unless the prospect replied at least twice AND
#               the BDR sent something after that.
# Messages within a level are joined with " ||| " so AI/regex scoring sees
# them as one blob without silently merging sentence boundaries.
#
# --- Scheduling-marker detection (truncate POST-scheduling content) --------
# Found 2026-11-05: for conversations that end in a scheduled meeting, the
# BDR often keeps messaging well past the point scheduling was actually
# agreed - confirmations ("that works!"), calendar-invite logistics, and even
# post-meeting pleasantries ("great meeting you today!") land in msg2_text/
# msg3_text alongside (or instead of) the messages that actually built up to
# the ask. Analyzing those trailing messages as "what content drives
# scheduling" gets causality backwards - their brevity/tone is a RESULT of
# already being scheduled, not a cause of it. (User-reported: short
# post-meeting follow-ups were skewing the message_length signal toward
# "short = better" for exactly this reason.)
#
# For scheduled==1 rows only: find the EARLIEST BDR message (send order) that
# reads as "scheduling is being locked in right here" - a calendar/scheduling
# link (.CALENDAR_LINK_PATTERN, defined above) or explicit date/time
# confirmation language (.SCHED_CONFIRM_PATTERN below - clock times, specific
# dates, "sending the invite", "see you then", "that works", etc.) - and
# truncate the BDR message sequence to stop there (everything up to AND
# INCLUDING that message is kept; anything strictly after it is dropped
# before msg2_text/msg3_text are built). If NO such marker is found anywhere
# in the conversation, we genuinely can't tell from the text where scheduling
# happened (likely booked off-platform) - msg2_text/msg3_text are left
# empty/NA entirely for that row rather than guessing. msg1_text is never
# affected: it always precedes the prospect's first reply, so it necessarily
# precedes any possible scheduling too.
#
# (.CALENDAR_LINK_PATTERN lives here, ahead of its original use site further
# down with has_calendar_link()/calendar_link_half1 etc., because this new
# scheduling-marker check needs it much earlier in the script - moved, not
# duplicated.)
.CALENDAR_LINK_PATTERN <- paste0(
  # Known scheduling-tool domains/products
  "calendly\\.com|cal\\.com/|chilipiper|meetings?\\.hubspot|hubspot\\.com/meetings|",
  "acuityscheduling|useacuity\\.com|youcanbook|doodle\\.com|savvycal|zcal\\.co|tidycal|vyte\\.in|",
  "outlook\\.office365\\.com|calendar\\.app\\.google|calendar\\.google\\.com|setmore|appointlet|",
  "oncehub|meetwhen|book\\.appointmentcore",
  "|",
  # Generic phrasing even when the actual URL wasn't captured in the text export
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
reply_round_list <- mapply(extract_reply_round_messages, dat$conversation_history, dat$scheduled, SIMPLIFY = FALSE)
.combine_msgs <- function(v) if (length(v)) paste(v, collapse = " ||| ") else NA_character_
dat$msg1_text <- vapply(reply_round_list, function(l) .combine_msgs(l$msg1), character(1))
dat$msg2_text <- vapply(reply_round_list, function(l) .combine_msgs(l$msg2), character(1))
dat$msg3_text <- vapply(reply_round_list, function(l) .combine_msgs(l$msg3), character(1))
dat$has_msg1 <- as.integer(!is.na(dat$msg1_text) & nzchar(dat$msg1_text))
dat$has_msg2 <- as.integer(!is.na(dat$msg2_text) & nzchar(dat$msg2_text))
dat$has_msg3 <- as.integer(!is.na(dat$msg3_text) & nzchar(dat$msg3_text))
cat(sprintf(
  "Reply-round message levels: %d have Level 1 (pre-reply) content, %d reach Level 2 (between 1st & 2nd reply), %d reach Level 3 (after 2nd reply).\n",
  sum(dat$has_msg1), sum(dat$has_msg2), sum(dat$has_msg3)))

# Sanitize text columns that will be fed to lama.batch (its eval/parse template
# assembly breaks on backslashes, embedded double-quotes, and newlines).
sanitize_for_api <- function(v) {
  v <- as.character(v)
  v[is.na(v)] <- ""
  v %>% gsub("\\\\", "/", .) %>% gsub('"', "'", .) %>%
    gsub("\r?\n", " ", .) %>% gsub("\t", " ", .) %>% trimws()
}
for (col in c("first_message","second_bdr_message","prospect_first_reply",
              "bdr_reply_after_reply","conversation_history","contact_title","contact_company",
              "seg_half1","seg_half2","seg_msg2","seg_msg3plus",
              "msg1_text","msg2_text","msg3_text"))
  dat[[paste0(col, "_clean")]] <- sanitize_for_api(dat[[col]])

# Placeholder-filled versions of the 4 position segments + 3 message levels for
# the AI prompts below, so prompts always have a consistent shape even when a
# position/level wasn't actually sent (R - not the AI - is the source of truth
# for "did this happen"; the AI's answer for a "(not sent)" segment is
# discarded after scoring, see Section 4).
.not_sent_ph <- function(x) ifelse(!nzchar(x), "(not sent)", x)
for (col in c("seg_half1","seg_half2","seg_msg2","seg_msg3plus",
              "msg1_text","msg2_text","msg3_text"))
  dat[[paste0(col, "_prompt")]] <- .not_sent_ph(dat[[paste0(col, "_clean")]])

# Basic message-shape features
dat$first_msg_nchar <- nchar(dat$first_message %||% "")
dat$first_msg_nchar[is.na(dat$first_message)] <- NA
dat$first_msg_words <- str_count(dat$first_message, "\\S+")
dat$first_msg_n_cr  <- str_count(dat$first_message %||% "", "\n")
dat$has_second_msg  <- as.integer(!is.na(dat$second_bdr_message) &
                                    nchar(trimws(dat$second_bdr_message %||% "")) > 0)
dat$has_reply_text  <- as.integer(!is.na(dat$prospect_first_reply) &
                                    nchar(trimws(dat$prospect_first_reply %||% "")) > 0)

# ==============================================================================
# SECTION 3 - NON-AI FEATURE ENGINEERING
# ==============================================================================

fm <- dat$first_message
fml <- tolower(fm %||% "")

# Regex content flags on the literal opening line (legacy, unused elsewhere -
# kept for any ad-hoc diagnostics; NOT part of the "3 different models" set
# below since nothing downstream reads these). NOTE: has_thank is now owned by
# compute_text_features() below (tripled across all 3 levels, see dat$has_thank
# / has_thank_lvl2 / has_thank_lvl3) - removed here to avoid a confusing double
# computation; mentions_i/mentions_you/starts_just_saw remain genuinely unused.
dat$mentions_i     <- as.integer(str_detect(fml, "\\bi\\b|\\bmy\\b|\\bwe\\b|\\bour\\b"))
dat$mentions_you   <- as.integer(str_detect(fml, "\\byou\\b|\\byour\\b"))
dat$starts_just_saw <- as.integer(str_detect(fml, "^just saw|^saw your|^saw that|^loved your"))

# ------------------------------------------------------------------------------
# "3 DIFFERENT MODELS" - generic per-message-level content feature extractor --
# ------------------------------------------------------------------------------
# Every content feature below (length, readability, punctuation/emoji/
# abbreviation style, opener pattern, connect-ask phrasing, question/
# congrats/quote/stat/emoji flags) is computed identically for all THREE
# conversation levels (see msg1_text/msg2_text/msg3_text in Section 2):
#   Level 1 - everything the BDR sends before the prospect's 1st reply
#   Level 2 - everything the BDR sends between the prospect's 1st and 2nd reply
#   Level 3 - everything the BDR sends after the prospect's 2nd reply
# Level 1's results are written to the LEGACY unsuffixed column names used
# throughout the rest of this file (first_msg_nchar, has_question,
# length_bucket, connect_phrasing, opener_type, exclam_use, emoji_use,
# uses_abbreviations, fk_grade, fk_bucket, ...) - i.e. what this file has
# always called "the first message" IS Level 1, now sourced from msg1_text
# (the combined pre-reply blob) instead of first_message alone - identical for
# the large majority of contacts who only ever get ONE pre-reply touch. Levels
# 2 and 3 write the SAME feature set to "_lvl2"/"_lvl3"-suffixed names,
# feeding the new parallel Message-2 / Message-3+ signals, RF models, research
# breakdowns and phrase analysis built in Sections 5, 6, 8 and 9.
.readability_grade <- function(msg) {
  if (is.na(msg) || !nzchar(msg)) return(NA_real_)
  words <- str_count(msg, "\\S+")
  sents <- max(str_count(msg, "[.!?]+"), 1)
  chars <- nchar(gsub("\\s", "", msg))
  if (words == 0) return(NA_real_)
  syll <- chars / 3   # approx syllables ~ chars/3; FK grade formula
  0.39 * (words / sents) + 11.8 * (syll / words) - 15.59
}
.first_sentence_fn <- function(msg) {
  if (is.na(msg) || !nzchar(msg)) return(NA_character_)
  trimws(sub("([.!?]).*$", "\\1", msg))
}
compute_text_features <- function(text) {
  t  <- text
  tl <- tolower(t %||% "")
  nch <- nchar(t %||% ""); nch[is.na(t)] <- NA
  exclam_count <- str_count(t %||% "", "!"); exclam_count[is.na(t)] <- NA
  emoji_count  <- str_count(t %||% "", "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]")
  emoji_count[is.na(t)] <- NA
  abbr_words <- paste0("\\b(lol|lmk|btw|fyi|asap|imo|imho|tbh|idk|np|nbd|ngl|",
                       "thx|thnx|pls|plz|ur|u|gonna|wanna|gotta|cuz|abt|convo|",
                       "appt|rn|aka|diy|wfh|omg|dm|pm)\\b")
  abbr_slash <- "\\b(w/o|b/c|w/)"
  abbr_count <- str_count(tl, abbr_words) + str_count(tl, abbr_slash); abbr_count[is.na(t)] <- NA
  fk    <- vapply(t %||% NA_character_, .readability_grade, numeric(1))
  fsent <- vapply(t %||% NA_character_, .first_sentence_fn, character(1))
  fs    <- tolower(fsent %||% "")
  data.frame(
    nchar = nch,
    words = str_count(t, "\\S+"),
    has_question = as.integer(str_detect(t %||% "", "\\?")),
    has_congrats = as.integer(str_detect(tl, "congrat")),
    has_thank    = as.integer(str_detect(tl, "thank")),
    all_caps     = as.integer(str_detect(t %||% "", "\\b[A-Z]{3,}\\b")),
    quotes_them  = as.integer(str_detect(t %||% "", '"[^"]{8,}"')),
    has_emoji    = as.integer(str_detect(t %||% "", "[\U0001F300-\U0001FAFF\U00002600-\U000027BF]")),
    has_stat     = as.integer(str_detect(t %||% "", "\\d+\\s?%|\\$\\d|\\d{2,}")),
    # Does the message use a paragraph/line break (vs. one unbroken block of
    # text)? Checked on the RAW message text (t), before any later
    # sanitize_for_api() call collapses "\r?\n" to a space for API prompts -
    # this must run first or the signal would always read "no line break".
    has_linebreak = dplyr::case_when(is.na(t) ~ NA_character_,
      str_detect(t, "\r\n|\n|\r") ~ "Has line break", TRUE ~ "No line break"),
    length_bucket = cut(nch, breaks = c(0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, Inf),
      labels = c("1-25","26-50","51-75","76-100","101-125","126-150",
                 "151-175","176-200","201-225","226-250","251+"),
      right = TRUE, include.lowest = TRUE),
    exclam_count = exclam_count,
    exclam_use = dplyr::case_when(is.na(exclam_count) ~ NA_character_,
      exclam_count == 0 ~ "None", exclam_count == 1 ~ "One", TRUE ~ "Multiple (2+)"),
    emoji_count = emoji_count,
    emoji_use = dplyr::case_when(is.na(emoji_count) ~ NA_character_,
      emoji_count == 0 ~ "None", emoji_count == 1 ~ "One", TRUE ~ "Multiple (2+)"),
    abbr_count = abbr_count,
    uses_abbreviations = dplyr::case_when(is.na(abbr_count) ~ NA_character_,
      abbr_count == 0 ~ "No abbreviations", TRUE ~ "Uses abbreviations"),
    fk_grade = fk,
    fk_bucket = cut(fk, breaks = c(-Inf, 6, 9, 12, Inf),
      labels = c("Easy (<=6)","Standard (7-9)","Advanced (10-12)","Complex (13+)")),
    first_sentence = fsent,
    opener_type = dplyr::case_when(
      str_detect(fs, "\\?$")                              ~ "Question",
      str_detect(fs, "^(saw|just saw|loved|noticed|read|caught my eye|impressive)") ~ "Observation about them",
      str_detect(fs, "^(congrat|congratulations)")        ~ "Congratulations",
      str_detect(fs, "^(i |my |we |our |as a|fellow)")    ~ "About us",
      str_detect(fs, "^(your|you )")                       ~ "About you",
      is.na(fsent)                                         ~ NA_character_,
      TRUE                                                 ~ "Other"),
    opener_is_question = as.integer(str_detect(fs, "\\?$")),
    connect_phrasing = dplyr::case_when(
      is.na(t)                                                                    ~ NA_character_,
      str_detect(tl, "worth (it )?(to )?connect")                                 ~ "Worth connecting",
      str_detect(tl, "let'?s connect|let us connect|lets connect|let'?s link up") ~ "Let's connect",
      str_detect(tl, "(would |i'?d )?love to connect")                            ~ "Would love to connect",
      str_detect(tl, "open to connect")                                           ~ "Open to connecting",
      str_detect(tl, "happy to connect|glad to connect")                          ~ "Happy to connect",
      str_detect(tl, "keen to connect|hoping to connect|would like to connect|wanted to connect|like to connect") ~ "Would like to connect",
      str_detect(tl, "to connect|connect with|connecting with|let'?s chat")       ~ "Other connect ask",
      TRUE                                                                        ~ "No connect ask"),
    stringsAsFactors = FALSE)
}

# Level 1 -> legacy unsuffixed names (used by every pre-existing add_sig/
# MF_NUMERIC/MF_FACTOR/research_block entry without any further changes there).
lvl1_feat <- compute_text_features(dat$msg1_text)
dat$first_msg_nchar    <- lvl1_feat$nchar
dat$first_msg_words    <- lvl1_feat$words
dat$has_question       <- lvl1_feat$has_question
dat$has_congrats       <- lvl1_feat$has_congrats
dat$has_thank          <- lvl1_feat$has_thank
dat$all_caps           <- lvl1_feat$all_caps
dat$quotes_them        <- lvl1_feat$quotes_them
dat$has_emoji          <- lvl1_feat$has_emoji
dat$has_stat           <- lvl1_feat$has_stat
dat$has_linebreak      <- lvl1_feat$has_linebreak
dat$length_bucket      <- lvl1_feat$length_bucket
dat$exclam_count       <- lvl1_feat$exclam_count
dat$exclam_use         <- lvl1_feat$exclam_use
dat$emoji_count        <- lvl1_feat$emoji_count
dat$emoji_use          <- lvl1_feat$emoji_use
dat$abbr_count         <- lvl1_feat$abbr_count
dat$uses_abbreviations <- lvl1_feat$uses_abbreviations
dat$fk_grade           <- lvl1_feat$fk_grade
dat$fk_bucket          <- lvl1_feat$fk_bucket
dat$first_sentence     <- lvl1_feat$first_sentence
dat$opener_type        <- lvl1_feat$opener_type
dat$opener_is_question <- lvl1_feat$opener_is_question
dat$connect_phrasing   <- lvl1_feat$connect_phrasing

# Levels 2 & 3 -> "_lvl2"/"_lvl3"-suffixed names (brand new).
for (.L in c(2, 3)) {
  .src  <- dat[[paste0("msg", .L, "_text")]]
  .feat <- compute_text_features(.src)
  for (.nm in names(.feat)) dat[[paste0(.nm, "_lvl", .L)]] <- .feat[[.nm]]
}
rm(lvl1_feat)
cat(sprintf("Per-level content features built for Level 1 (n=%d), Level 2 (n=%d), Level 3 (n=%d).\n",
            sum(dat$has_msg1), sum(dat$has_msg2), sum(dat$has_msg3)))

# --- Negative / rhetorical question framing ("a 'No' is a 'Yes'") ------------
# Catches negatively-phrased questions used to make agreement the path of least
# resistance, e.g. "Wouldn't it help to grab 15 minutes?" or the explicit-"not"
# form "Would it not help to find a time and meet?" - answering "no" to either
# actually means "yes, it would help". Matches:
#   (a) a negated auxiliary contraction (wouldn't/isn't/doesn't/...) anywhere
#       before the next sentence-ending punctuation and a "?", or
#   (b) the uncontracted "AUX + subject + not + ...?" form.
# This is a precise GRAMMATICAL pattern (a specific negated-question
# construction), so it's checked with regex rather than AI - regex is both
# cheaper and more reliable than AI for this kind of exact syntactic match.
# Checked across all 4 message-position buckets (see segmentation above) so
# this is a genuine CORE analysis across the whole conversation, not just a
# couple of ad-hoc touch points - same treatment as the "about us" / "meeting
# ask" positional analyses below, and reported the same way (as a
# first-occurrence-position breakdown alongside Tone/Hook/Reason) in Section 9.
.NEG_Q_PATTERN <- paste0(
  "\\b(wouldn.?t|shouldn.?t|couldn.?t|doesn.?t|didn.?t|isn.?t|aren.?t|",
  "wasn.?t|weren.?t|hasn.?t|haven.?t|hadn.?t|won.?t|can.?t)\\b[^.!?]{0,80}\\?",
  "|",
  "\\b(would|does|did|is|are|was|were|should|could|can|will|has|have|had)\\b",
  "\\s+\\w+\\s+not\\b[^.!?]{0,80}\\?")
has_negative_question <- function(txt) {
  as.integer(str_detect(txt, stringr::regex(.NEG_Q_PATTERN, ignore_case = TRUE)))
}
# Left as NA (not 0) when that position wasn't sent, so the with/without
# comparison for each position stays scoped to messages that actually exist
# rather than being diluted by rows where that position never happened.
dat$neg_q_half1    <- has_negative_question(dat$seg_half1)
dat$neg_q_half2    <- has_negative_question(dat$seg_half2)
dat$neg_q_msg2     <- has_negative_question(dat$seg_msg2)
dat$neg_q_msg3plus <- has_negative_question(dat$seg_msg3plus)

# --- Sharing a calendar/scheduling link ("being forward" part 1) -------------
# Does this segment share a scheduling-tool link (Calendly, Cal.com, HubSpot
# Meetings, Acuity, etc.) or otherwise hand the prospect a direct way to book
# time? This is a precise, deterministic text pattern (a known domain, or an
# explicit "calendar/booking link" phrase), so regex is used - same
# cheaper/more-reliable-than-AI rationale as has_negative_question() above.
# Checked at the same 4 message-position buckets as neg_question_*/about_us_*/
# meeting_ask_*, feeding the same "first occurrence position" treatment plus
# the dedicated forward-scheduling analysis in Section 9 (research.forward_scheduling).
has_calendar_link <- function(txt) {
  as.integer(str_detect(txt, stringr::regex(.CALENDAR_LINK_PATTERN, ignore_case = TRUE)))
}
dat$calendar_link_half1    <- has_calendar_link(dat$seg_half1)
dat$calendar_link_half2    <- has_calendar_link(dat$seg_half2)
dat$calendar_link_msg2     <- has_calendar_link(dat$seg_msg2)
dat$calendar_link_msg3plus <- has_calendar_link(dat$seg_msg3plus)

# Calendar/scheduling link shared in this REPLY-ROUND message (msg2_text /
# msg3_text - "everything the BDR sent between reply 1 and reply 2", etc.),
# same has_calendar_link() regex, applied to the "3 different models" text
# instead. Deliberately a SEPARATE column from calendar_link_msg2 above (that
# one is scored on seg_msg2, the 2nd BDR message by raw send order, which
# usually but not always coincides with msg2_text - see "message position" vs
# "message level" in the glossary) - this one feeds the Message-2/Message-3+
# research blocks specifically, computed on the exact text those blocks
# already analyze. Character label (not 0/1) to match the uses_abbreviations-
# style convention used by the rest of the "_lvl2"/"_lvl3" content signals.
dat$calendar_link_lvl2 <- ifelse(has_calendar_link(dat$msg2_text) == 1,
                                 "Shares calendar link", "No calendar link")
dat$calendar_link_lvl3 <- ifelse(has_calendar_link(dat$msg3_text) == 1,
                                 "Shares calendar link", "No calendar link")
# "First occurrence position" rollup - one categorical value per row, the same
# shape as the AI-classified categoricals (Tone/Hook/Reason) so this can get a
# proper rate_by() breakdown in the research/keys output instead of being
# buried as scattered binary flags.
.first_at <- function(h1, h2, m2, m3) {
  z <- function(x) ifelse(is.na(x), 0L, x)
  dplyr::case_when(
    z(h1) == 1 ~ "First half of message 1", z(h2) == 1 ~ "Second half of message 1",
    z(m2) == 1 ~ "Message 2", z(m3) == 1 ~ "Message 3+", TRUE ~ "Never")
}
.POSITION_LEVELS <- c("Never","First half of message 1","Second half of message 1","Message 2","Message 3+")
dat$neg_q_first_at <- factor(.first_at(dat$neg_q_half1, dat$neg_q_half2, dat$neg_q_msg2, dat$neg_q_msg3plus),
                             levels = .POSITION_LEVELS)
# "Anywhere in the sequence" - a missing position trivially doesn't contain
# the pattern, so treat NA as 0 only for this combined summary flag.
dat$neg_q_any <- as.integer(dat$neg_q_first_at != "Never")
cat(sprintf(
  "Negative/rhetorical questions (\"a No is a Yes\"): %d in 1st half of msg 1, %d in 2nd half, %d in msg 2, %d in msg 3+ (%d rows use it somewhere).\n",
  sum(dat$neg_q_half1, na.rm=TRUE), sum(dat$neg_q_half2, na.rm=TRUE),
  sum(dat$neg_q_msg2, na.rm=TRUE), sum(dat$neg_q_msg3plus, na.rm=TRUE), sum(dat$neg_q_any)))

dat$calendar_link_first_at <- factor(
  .first_at(dat$calendar_link_half1, dat$calendar_link_half2, dat$calendar_link_msg2, dat$calendar_link_msg3plus),
  levels = .POSITION_LEVELS)
dat$calendar_link_any <- as.integer(dat$calendar_link_first_at != "Never")
cat(sprintf(
  "Shares a calendar/scheduling link: %d in 1st half of msg 1, %d in 2nd half, %d in msg 2, %d in msg 3+ (%d rows use it somewhere).\n",
  sum(dat$calendar_link_half1, na.rm=TRUE), sum(dat$calendar_link_half2, na.rm=TRUE),
  sum(dat$calendar_link_msg2, na.rm=TRUE), sum(dat$calendar_link_msg3plus, na.rm=TRUE), sum(dat$calendar_link_any)))

# --- Uses the prospect's (first) name in the message text --------------------
# Detects whether a message personalizes by name (e.g. "Hi John," / "...John,
# would love to...") vs. never naming the prospect at all. Checked separately
# at each touch (same convention as the neg-question block above) so we can
# see WHEN it's used and whether it's WORKING via the keys engine below.
#
# Extract the likely first name from contact_name: strip a leading title
# (Dr./Mr./Mrs./Ms./Miss/Prof./Rev.), take the first whitespace-separated
# token, drop anything but letters/apostrophes/hyphens, and title-case it
# (so matching looks for the name the way a human would actually write it,
# e.g. "John", regardless of how contact_name happened to be cased in the
# source export). Names under 2 letters (bare initials) are treated as
# "unknown" rather than risking false matches.
.strip_name_title <- function(x) sub("^(Dr|Mr|Mrs|Ms|Miss|Prof|Rev)\\.?\\s+", "", trimws(x), ignore.case = TRUE)
.first_token <- function(x) vapply(strsplit(x, "\\s+"), function(w) if (length(w)) w[1] else "", character(1))
dat$contact_first_name <- stringr::str_to_title(
  gsub("[^A-Za-z'-]", "", .first_token(.strip_name_title(dat$contact_name %||% ""))))
dat$contact_first_name[nchar(dat$contact_first_name) < 2] <- NA_character_

# Case-sensitive, whole-word match against the properly-capitalized first name
# - deliberately NOT case-insensitive, since common-word names (Will, Grace,
# Mark, Hope, Drew, ...) would otherwise false-positive on ordinary lowercase
# usage ("i will call you"), which a capitalized "Hi Will," would not.
# Left as NA when the message doesn't exist OR the first name couldn't be
# determined - same convention as the neg_q_* signals above.
uses_contact_name <- function(txt, name) {
  ok  <- !is.na(txt) & !is.na(name) & nzchar(name)
  out <- rep(NA_integer_, length(txt))
  if (any(ok)) out[ok] <- as.integer(stringr::str_detect(txt[ok], paste0("\\b", name[ok], "\\b")))
  out
}
dat$uses_name_first    <- uses_contact_name(dat$first_message, dat$contact_first_name)
dat$uses_name_second   <- uses_contact_name(dat$second_bdr_message, dat$contact_first_name)
dat$uses_name_followup <- uses_contact_name(dat$bdr_reply_after_reply, dat$contact_first_name)
.name_z <- function(x) ifelse(is.na(x), 0L, x)
dat$uses_name_any <- as.integer(.name_z(dat$uses_name_first) == 1 | .name_z(dat$uses_name_second) == 1 |
                                 .name_z(dat$uses_name_followup) == 1)
cat(sprintf(
  "Uses prospect's name: %d in first message, %d in pre-reply follow-up, %d in post-reply follow-up (%d rows use it somewhere; %d rows had no usable first name).\n",
  sum(dat$uses_name_first, na.rm = TRUE), sum(dat$uses_name_second, na.rm = TRUE),
  sum(dat$uses_name_followup, na.rm = TRUE), sum(dat$uses_name_any),
  sum(is.na(dat$contact_first_name))))

# (length_bucket / fk_grade / opener_type / connect_phrasing / exclam_use /
# emoji_use / uses_abbreviations for all 3 levels are already built above by
# compute_text_features().)

# --- LinkedIn connection controls (used to de-confound phrase / feature effects)
dat$log_connections <- log1p(dat$linkedin_connections)
dat$log_followers   <- log1p(dat$follower_count)
dat$has_conn_data   <- as.integer(!is.na(dat$linkedin_connections))
# Deciles for stratified checks (only where data exists)
if (any(dat$has_conn_data == 1)) {
  qs <- quantile(dat$linkedin_connections, probs = seq(0, 1, 0.2), na.rm = TRUE)
  qs <- unique(qs)
  dat$conn_quintile <- if (length(qs) > 2)
    cut(dat$linkedin_connections, breaks = qs, include.lowest = TRUE, labels = FALSE)
  else NA_integer_
} else dat$conn_quintile <- NA_integer_

# --- Timing ------------------------------------------------------------------
parse_date <- function(s) suppressWarnings(as.Date(substr(as.character(s), 1, 10)))
dat$first_outreach_dt <- parse_date(dat$first_outreach_date)
dat$send_dow   <- weekdays(dat$first_outreach_dt)
dat$send_month <- format(dat$first_outreach_dt, "%Y-%m")

# Time-of-day of the outreach (first BDR message timestamp, converted to US
# Central) plus a combined day+part so we can compare e.g. Monday morning vs
# Monday afternoon. Everything is US-based, so hours are Central (CST/CDT).
tod_from_hour <- function(h) dplyr::case_when(
  is.na(h)              ~ NA_character_,
  h >= 5  & h <= 8      ~ "Early morning (5-8a)",
  h >= 9  & h <= 11     ~ "Morning (9-11a)",
  h >= 12 & h <= 14     ~ "Afternoon (12-2p)",
  h >= 15 & h <= 17     ~ "Late afternoon (3-5p)",
  h >= 18 & h <= 21     ~ "Evening (6-9p)",
  TRUE                  ~ "Overnight (10p-4a)")
dat$time_of_day <- tod_from_hour(dat$first_msg_hour)
# Compact part label (drop the time-range parenthetical) for the day+part combo.
tod_short       <- sub("\\s*\\(.*$", "", dat$time_of_day)
dat$day_time    <- ifelse(is.na(dat$send_dow) | is.na(dat$time_of_day), NA_character_,
                          paste(dat$send_dow, tod_short))

# --- Connection-request SEND time (when the invite actually went out) ---------
# `conn_request_sent` is the UTC timestamp the FIRST connection request was sent
# (distinct from the acceptance / first-message dates used above). This is the
# real "when should the invite land in their inbox" lever - judge it primarily by
# connect_rate (acceptance). Convert UTC -> US Central and bucket day / part.
parse_ts_vec <- function(s) suppressWarnings(
  as.POSIXct(sub("Z$", "", as.character(s)), format = "%Y-%m-%dT%H:%M:%OS", tz = "UTC"))
req_ts <- if ("conn_request_sent" %in% names(dat)) {
  parse_ts_vec(dat$conn_request_sent)
} else {
  as.POSIXct(rep(NA_real_, nrow(dat)), origin = "1970-01-01", tz = "UTC")
}
dat$request_send_hour   <- as.integer(format(req_ts, "%H", tz = "America/Chicago"))
dat$request_send_dow    <- format(req_ts, "%A",  tz = "America/Chicago")
dat$request_time_of_day <- tod_from_hour(dat$request_send_hour)
req_tod_short           <- sub("\\s*\\(.*$", "", dat$request_time_of_day)
dat$request_day_time    <- ifelse(is.na(dat$request_send_dow) | is.na(dat$request_time_of_day),
                                  NA_character_, paste(dat$request_send_dow, req_tod_short))
cat(sprintf("Connection-request send-time parsed for %d of %d rows (US Central).\n",
            sum(!is.na(req_ts)), nrow(dat)))

dat$bdr_followup_bucket <- cut(dat$hours_to_bdr_followup,
  breaks = c(-Inf, 1, 3, 24, 72, Inf),
  labels = c("<1h","1-3h","Same day (3-24h)","1-3 days","3+ days"))

# (readability, opener pattern, connect-ask phrasing, and punctuation/emoji/
# abbreviation style for all 3 levels are already built above by
# compute_text_features(); see dat$fk_grade, dat$opener_type,
# dat$connect_phrasing, dat$exclam_use, dat$emoji_use, dat$uses_abbreviations
# for Level 1, and the "_lvl2"/"_lvl3" siblings for Levels 2 and 3.)

# --- Profile completeness (from enrichment JSON) + prospect reply length ------
dat$about_len      <- nchar(dat$about %||% "");                dat$about_len[is.na(dat$about)] <- 0
dat$experience_len <- if ("experience_json" %in% names(dat)) nchar(dat$experience_json %||% "") else 0
dat$experience_len[is.na(dat$experience_len)] <- 0
dat$education_len  <- if ("education_json" %in% names(dat)) nchar(dat$education_json %||% "") else 0
dat$education_len[is.na(dat$education_len)] <- 0
dat$prospect_reply_len <- nchar(dat$prospect_first_reply %||% "")
dat$prospect_reply_len[is.na(dat$prospect_first_reply)] <- NA

# --- Bucketing for rate tables -----------------------------------------------
dat$total_messages_bucket <- cut(dat$total_messages, breaks = c(0,1,2,3,5,10,Inf),
  labels = c("1","2","3","4-5","6-10","11+"), right = FALSE, include.lowest = TRUE)
# Connection buckets on real network size (not quintiles) so labels are meaningful.
dat$conn_label <- cut(dat$linkedin_connections,
  breaks = c(-Inf, 500, 1000, 2500, 5000, Inf),
  labels = c("<500","500-999","1,000-2,499","2,500-4,999","5,000+"),
  right = FALSE)
dat$reply_len_bucket <- cut(dat$prospect_reply_len, breaks = c(0,40,120,300,Inf),
  labels = c("Very short (<40)","Short (40-120)","Medium (120-300)","Long (300+)"),
  right = FALSE, include.lowest = TRUE)

cat("Non-AI features built.\n")

# ==============================================================================
# SECTION 4 - AI FEATURE EXTRACTION (lama.batch) WITH INCREMENTAL CACHE
# ==============================================================================
# Two consolidated prompts (1 API call per row each) keep cost low while still
# answering every research question. Results are cached by (linkedin_url +
# first_outreach_date) so each weekly run only scores brand-new rows.

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
  # Only scored by LEVEL2_PROMPT/LEVEL3_PROMPT (see meeting_ask_style_lvl2/3
  # below) - left unscored/NA for Level 1, which already has its own
  # position-based meeting_ask_half1/half2 signals instead.
  meeting_ask_style = c("Question","Statement","None")
)
AI_NUMERIC <- c("pct_about_prospect","pct_about_bdr","ai_sounding","specific_detail",
                "emotion_level","flattery_level","cta_ai","connection_quality","salesy_score",
                "reply_enthusiasm","fu_energy",
                # Position-level "about us" / "meeting ask" / "proposes a specific
                # day/time" classification (see POSITION_PROMPT below) - one
                # triple per message-position bucket.
                "about_us_half1","meeting_ask_half1","datetime_propose_half1",
                "about_us_half2","meeting_ask_half2","datetime_propose_half2",
                "about_us_msg2","meeting_ask_msg2","datetime_propose_msg2",
                "about_us_msg3plus","meeting_ask_msg3plus","datetime_propose_msg3plus")

# "3 different models" - Level 2 / Level 3 AI classification reuses the exact
# same numeric/categorical field set as Level 1 (pct_about_prospect, ai_sounding,
# msg_tone, msg_hook_type, ...), just "_lvl2"/"_lvl3"-suffixed (Level 1 keeps the
# legacy unsuffixed names - see compute_text_features()'s doc comment and
# LEVEL2_PROMPT/LEVEL3_PROMPT below). SENIORITY/ORG are prospect attributes, not
# message-level-dependent, so they are NOT repeated per level.
LEVELED_AI_NUMERIC <- c("pct_about_prospect","pct_about_bdr","ai_sounding","specific_detail",
                        "emotion_level","flattery_level","cta_ai","connection_quality","salesy_score")
LEVELED_AI_FACTOR  <- c("msg_tone","msg_hook_type","reason_to_connect","question_type","personal_share",
                        "meeting_ask_style")
AI_NUMERIC <- c(AI_NUMERIC, paste0(LEVELED_AI_NUMERIC, "_lvl2"), paste0(LEVELED_AI_NUMERIC, "_lvl3"))
AI_COLS <- c(AI_NUMERIC, names(AI_VALID), paste0(LEVELED_AI_FACTOR, "_lvl2"), paste0(LEVELED_AI_FACTOR, "_lvl3"))

# Length-preserving: returns one value per element of x, NA where the key/value
# is absent (blank or malformed AI replies). str_match keeps NAs in place so all
# parsed fields stay aligned to the input rows.
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

parse_first <- function(raw) {
  data.frame(
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
    contact_seniority  = coerce_valid(parse_field(raw, "SENIORITY"),AI_VALID$contact_seniority),
    contact_org_type   = coerce_valid(parse_field(raw, "ORG"),      AI_VALID$contact_org_type),
    personal_share     = coerce_valid(parse_field(raw, "PERSONAL"), AI_VALID$personal_share),
    stringsAsFactors = FALSE)
}
parse_followup <- function(raw) {
  data.frame(
    reply_enthusiasm = clampi(parse_field(raw, "ENTHUSIASM"), 1, 5),
    fu_energy        = clampi(parse_field(raw, "FUENERGY"),   1, 5),
    fu_approach      = coerce_valid(parse_field(raw, "FUAPPROACH"), AI_VALID$fu_approach),
    stringsAsFactors = FALSE)
}

# "When do we talk about ourselves?" / "When do we ask for a meeting?" - scores
# all 4 message-position segments (see segmentation in Section 2) in ONE call
# per row, same "keep cost low" design as FIRST_PROMPT/FOLLOWUP_PROMPT. A
# segment may be "(not sent)" if that position never happened; the AI is told
# to just score those 0, but R is the actual source of truth for that (see the
# NA-forcing right after the lama.batch call below) - the AI's job is purely
# the judgment call on segments that genuinely exist.
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
parse_position <- function(raw) {
  data.frame(
    about_us_half1        = clampi(parse_field(raw, "A_ABOUTUS"),  0, 1),
    meeting_ask_half1     = clampi(parse_field(raw, "A_MEETING"),  0, 1),
    datetime_propose_half1= clampi(parse_field(raw, "A_DATETIME"), 0, 1),
    about_us_half2        = clampi(parse_field(raw, "B_ABOUTUS"),  0, 1),
    meeting_ask_half2     = clampi(parse_field(raw, "B_MEETING"),  0, 1),
    datetime_propose_half2= clampi(parse_field(raw, "B_DATETIME"), 0, 1),
    about_us_msg2         = clampi(parse_field(raw, "C_ABOUTUS"),  0, 1),
    meeting_ask_msg2      = clampi(parse_field(raw, "C_MEETING"),  0, 1),
    datetime_propose_msg2 = clampi(parse_field(raw, "C_DATETIME"), 0, 1),
    about_us_msg3plus        = clampi(parse_field(raw, "D_ABOUTUS"),  0, 1),
    meeting_ask_msg3plus     = clampi(parse_field(raw, "D_MEETING"),  0, 1),
    datetime_propose_msg3plus= clampi(parse_field(raw, "D_DATETIME"), 0, 1),
    stringsAsFactors = FALSE)
}

# ------------------------------------------------------------------------------
# "3 DIFFERENT MODELS" - Level 2 / Level 3 AI classification ------------------
# ------------------------------------------------------------------------------
# Same field schema as FIRST_PROMPT (Level 1), scored against msg2_text /
# msg3_text instead (see Section 2) - Tone, Hook, Reason, personalization etc.
# are tripled into fully independent per-level analyses rather than only ever
# being measured on the opening message. HOOK/REASON are reinterpreted here
# since there's no "ask to connect" anymore by this point in the conversation -
# they describe the BDR's angle/justification for THIS follow-up instead.
# SENIORITY/ORG are prospect attributes (not message-dependent) so they are
# only ever scored once, by FIRST_PROMPT.
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
LEVEL3_PROMPT <- paste0(
  "You are analyzing LinkedIn message(s) a sales rep (BDR) sent a prospect AFTER the prospect's ",
  "SECOND reply - deeper into an established back-and-forth conversation (likely discussing specifics, ",
  "logistics, or working toward a meeting), not the opening ask to connect.\n",
  "MESSAGE(S): [msg3_text_prompt]\n",
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
  "HOOK=the BDR's main ANGLE in this part of the conversation (reuse the same category list, best-fit mapping). ",
  "REASON=the main justification/reason the BDR gives for this message at this point in the conversation. ",
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

# Initialise all AI columns as NA
for (col in AI_NUMERIC)       dat[[col]] <- NA_real_
for (col in names(AI_VALID))  dat[[col]] <- NA_character_
for (col in c(paste0(LEVELED_AI_FACTOR, "_lvl2"), paste0(LEVELED_AI_FACTOR, "_lvl3")))
  dat[[col]] <- NA_character_

dat$ai_key <- paste0(dat$linkedin_url, "|", dat$first_outreach_date)

CACHE_NAME <- "connect_ai_cache"
# Full re-scan: drop any stored AI scores and per-run progress checkpoints so
# every row is scored fresh from the current message text.
if (isTRUE(CFG$rescan_all)) {
  for (pf in c("lama_first_progress.rds", "lama_followup_progress.rds",
               "lama_position_progress.rds", "lama_level2_progress.rds", "lama_level3_progress.rds"))
    unlink(file.path(CFG$connect_dir, "_cache", pf))
  cat("rescan_all = TRUE: ignoring AI cache; every row will be re-scored.\n")
}
if (CFG$use_cache && !isTRUE(CFG$rescan_all) && .loadr_exists(CACHE_NAME)) {
  cache <- tryCatch(loadr(CACHE_NAME), error = function(e) NULL)
  if (!is.null(cache) && "ai_key" %in% names(cache)) {
    keep <- intersect(AI_COLS, names(cache))
    m <- match(dat$ai_key, cache$ai_key)
    for (col in keep) dat[[col]] <- ifelse(!is.na(m), cache[[col]][m], dat[[col]])
    cat(sprintf("AI cache hit for %d / %d rows.\n", sum(!is.na(m)), nrow(dat)))
  }
}

if (CFG$run_ai) {
  # ---- First-message features -------------------------------------------------
  need1 <- which(dat$has_msg1 == 1 & is.na(dat$pct_about_prospect))
  if (length(need1)) {
    cat(sprintf("Scoring Level-1 (pre-reply) AI features for %d rows...\n", length(need1)))
    raw1 <- lama.batch(dat[need1, ], FIRST_PROMPT, batch.size = CFG$ai_batch,
                       model.in = CFG$ai_model, fail_value = "", resume = TRUE,
                       max_tokens = CFG$ai_max_tokens_first, disable_reasoning = TRUE,
                       partial_save_file = file.path(CFG$connect_dir, "_cache",
                                                     "lama_first_progress.rds"))
    p1 <- parse_first(raw1)
    for (col in names(p1)) dat[[col]][need1] <- p1[[col]]
  }
  # ---- Follow-up features (only conversations with a prospect reply) -----------
  need2 <- which(dat$replied == 1 & dat$has_reply_text == 1 & is.na(dat$reply_enthusiasm))
  if (length(need2)) {
    cat(sprintf("Scoring follow-up AI features for %d replied rows...\n", length(need2)))
    raw2 <- lama.batch(dat[need2, ], FOLLOWUP_PROMPT, batch.size = CFG$ai_batch,
                       model.in = CFG$ai_model, fail_value = "", resume = TRUE,
                       max_tokens = CFG$ai_max_tokens_followup, disable_reasoning = TRUE,
                       partial_save_file = file.path(CFG$connect_dir, "_cache",
                                                     "lama_followup_progress.rds"))
    p2 <- parse_followup(raw2)
    for (col in names(p2)) dat[[col]][need2] <- p2[[col]]
  }
  # ---- Position features ("when do we talk about us" / "when do we ask for a
  # meeting" / "when do we propose a specific day-time") - every core row
  # with a first message gets scored, since seg_half1 always exists for one.
  # Checks BOTH about_us_half1 and datetime_propose_half1 (not just the
  # former) so that rows pulled from an OLDER cache - one written before
  # DATETIME was added to POSITION_PROMPT - get re-scored once to backfill
  # the new field, instead of silently staying NA forever just because
  # about_us_half1/meeting_ask_half1 were already cached. -------------------
  need3 <- which(!is.na(dat$first_message) & nchar(dat$first_message) > 0 &
                   (is.na(dat$about_us_half1) | is.na(dat$datetime_propose_half1)))
  if (length(need3)) {
    cat(sprintf("Scoring message-position AI features for %d rows...\n", length(need3)))
    raw3 <- lama.batch(dat[need3, ], POSITION_PROMPT, batch.size = CFG$ai_batch,
                       model.in = CFG$ai_model, fail_value = "", resume = TRUE,
                       max_tokens = CFG$ai_max_tokens_position, disable_reasoning = TRUE,
                       partial_save_file = file.path(CFG$connect_dir, "_cache",
                                                     "lama_position_progress.rds"))
    p3 <- parse_position(raw3)
    for (col in names(p3)) dat[[col]][need3] <- p3[[col]]
  }
  # ---- "3 different models" - Level 2 features (between 1st & 2nd reply) -------
  # Checks BOTH pct_about_prospect_lvl2 and meeting_ask_style_lvl2 (not just
  # the former) so rows pulled from an OLDER cache - written before ASKSTYLE
  # was added to LEVEL2_PROMPT - get re-scored once to backfill the new field,
  # same rationale as the POSITION_PROMPT/DATETIME backfill fix above.
  need_lvl2 <- which(dat$has_msg2 == 1 &
                       (is.na(dat$pct_about_prospect_lvl2) | is.na(dat$meeting_ask_style_lvl2)))
  if (length(need_lvl2)) {
    cat(sprintf("Scoring Level-2 (between 1st & 2nd reply) AI features for %d rows...\n", length(need_lvl2)))
    raw_lvl2 <- lama.batch(dat[need_lvl2, ], LEVEL2_PROMPT, batch.size = CFG$ai_batch,
                       model.in = CFG$ai_model, fail_value = "", resume = TRUE,
                       max_tokens = CFG$ai_max_tokens_level, disable_reasoning = TRUE,
                       partial_save_file = file.path(CFG$connect_dir, "_cache",
                                                     "lama_level2_progress.rds"))
    p_lvl2 <- parse_level_msg(raw_lvl2, "_lvl2")
    for (col in names(p_lvl2)) dat[[col]][need_lvl2] <- p_lvl2[[col]]
  }
  # ---- "3 different models" - Level 3 features (after 2nd reply) ---------------
  # Same one-time backfill logic as need_lvl2 above.
  need_lvl3 <- which(dat$has_msg3 == 1 &
                       (is.na(dat$pct_about_prospect_lvl3) | is.na(dat$meeting_ask_style_lvl3)))
  if (length(need_lvl3)) {
    cat(sprintf("Scoring Level-3 (after 2nd reply) AI features for %d rows...\n", length(need_lvl3)))
    raw_lvl3 <- lama.batch(dat[need_lvl3, ], LEVEL3_PROMPT, batch.size = CFG$ai_batch,
                       model.in = CFG$ai_model, fail_value = "", resume = TRUE,
                       max_tokens = CFG$ai_max_tokens_level, disable_reasoning = TRUE,
                       partial_save_file = file.path(CFG$connect_dir, "_cache",
                                                     "lama_level3_progress.rds"))
    p_lvl3 <- parse_level_msg(raw_lvl3, "_lvl3")
    for (col in names(p_lvl3)) dat[[col]][need_lvl3] <- p_lvl3[[col]]
  }
  # ---- Update cache -----------------------------------------------------------
  if (CFG$use_cache) {
    new_cache <- dat[, c("ai_key", AI_COLS)]
    new_cache <- new_cache[!is.na(new_cache$pct_about_prospect) |
                             !is.na(new_cache$reply_enthusiasm), , drop = FALSE]
    if (.loadr_exists(CACHE_NAME)) {
      old <- tryCatch(loadr(CACHE_NAME), error = function(e) NULL)
      if (!is.null(old)) {
        old <- old[!old$ai_key %in% new_cache$ai_key, , drop = FALSE]
        new_cache <- dplyr::bind_rows(old, new_cache)
      }
    }
    saver(new_cache, CACHE_NAME)
    cat(sprintf("AI cache updated: %d rows stored.\n", nrow(new_cache)))
  }
} else {
  cat("run_ai = FALSE: AI feature columns left as NA (structure / dry run).\n")
}

# R (not the AI) is the source of truth for "did this position actually
# happen" - force NA for any position that wasn't sent, regardless of what the
# AI answered for its "(not sent)" placeholder text, so the with/without
# comparison for each position stays scoped to real messages. Runs
# unconditionally (even when run_ai = FALSE) so these columns always exist for
# the add_sig()/MF_FACTOR/research_block() code further down.
dat$about_us_half1[is.na(dat$seg_half1)] <- NA_real_
dat$meeting_ask_half1[is.na(dat$seg_half1)] <- NA_real_
dat$datetime_propose_half1[is.na(dat$seg_half1)] <- NA_real_
dat$about_us_half2[is.na(dat$seg_half2)] <- NA_real_
dat$meeting_ask_half2[is.na(dat$seg_half2)] <- NA_real_
dat$datetime_propose_half2[is.na(dat$seg_half2)] <- NA_real_
dat$about_us_msg2[is.na(dat$seg_msg2)] <- NA_real_
dat$meeting_ask_msg2[is.na(dat$seg_msg2)] <- NA_real_
dat$datetime_propose_msg2[is.na(dat$seg_msg2)] <- NA_real_
dat$about_us_msg3plus[is.na(dat$seg_msg3plus)] <- NA_real_
dat$meeting_ask_msg3plus[is.na(dat$seg_msg3plus)] <- NA_real_
dat$datetime_propose_msg3plus[is.na(dat$seg_msg3plus)] <- NA_real_

# "First occurrence position" rollups, same categorical shape as Tone/Hook/
# Reason, so these get a proper rate_by() breakdown in Section 9 instead of
# being buried as scattered binary flags.
dat$about_us_first_at <- factor(
  .first_at(dat$about_us_half1, dat$about_us_half2, dat$about_us_msg2, dat$about_us_msg3plus),
  levels = .POSITION_LEVELS)
dat$meeting_ask_first_at <- factor(
  .first_at(dat$meeting_ask_half1, dat$meeting_ask_half2, dat$meeting_ask_msg2, dat$meeting_ask_msg3plus),
  levels = .POSITION_LEVELS)
dat$datetime_propose_first_at <- factor(
  .first_at(dat$datetime_propose_half1, dat$datetime_propose_half2, dat$datetime_propose_msg2, dat$datetime_propose_msg3plus),
  levels = .POSITION_LEVELS)
dat$about_us_any         <- as.integer(dat$about_us_first_at != "Never")
dat$meeting_ask_any      <- as.integer(dat$meeting_ask_first_at != "Never")
dat$datetime_propose_any <- as.integer(dat$datetime_propose_first_at != "Never")
cat(sprintf(
  "Talks about us/what we do: %d in 1st half of msg 1, %d in 2nd half, %d in msg 2, %d in msg 3+.\n",
  sum(dat$about_us_half1, na.rm=TRUE), sum(dat$about_us_half2, na.rm=TRUE),
  sum(dat$about_us_msg2, na.rm=TRUE), sum(dat$about_us_msg3plus, na.rm=TRUE)))
cat(sprintf(
  "Asks for a meeting: %d in 1st half of msg 1, %d in 2nd half, %d in msg 2, %d in msg 3+.\n",
  sum(dat$meeting_ask_half1, na.rm=TRUE), sum(dat$meeting_ask_half2, na.rm=TRUE),
  sum(dat$meeting_ask_msg2, na.rm=TRUE), sum(dat$meeting_ask_msg3plus, na.rm=TRUE)))
cat(sprintf(
  "Proposes a specific day/time to meet: %d in 1st half of msg 1, %d in 2nd half, %d in msg 2, %d in msg 3+.\n",
  sum(dat$datetime_propose_half1, na.rm=TRUE), sum(dat$datetime_propose_half2, na.rm=TRUE),
  sum(dat$datetime_propose_msg2, na.rm=TRUE), sum(dat$datetime_propose_msg3plus, na.rm=TRUE)))

# --- "Being forward with scheduling" = calendar link shared OR a specific ----
# day/time proposed, whichever happens first (the two concrete, "hard"
# scheduling moves, as opposed to a vague meeting_ask_* like "would love to
# chat sometime"). This is the combined signal behind the user's question:
# "is it better to be forward with calendar links and times to meet, or not?"
# pmax() with na.rm handling: a position counts as "forward" if EITHER
# component is 1; stays NA only when BOTH components are NA (position never
# sent); otherwise any real 0/1 beats a co-occurring NA.
.or_na <- function(a, b) {
  out <- pmax(a, b, na.rm = TRUE)
  out[is.na(a) & is.na(b)] <- NA_real_
  out
}
dat$forward_sched_half1    <- .or_na(dat$calendar_link_half1,    dat$datetime_propose_half1)
dat$forward_sched_half2    <- .or_na(dat$calendar_link_half2,    dat$datetime_propose_half2)
dat$forward_sched_msg2     <- .or_na(dat$calendar_link_msg2,     dat$datetime_propose_msg2)
dat$forward_sched_msg3plus <- .or_na(dat$calendar_link_msg3plus, dat$datetime_propose_msg3plus)
dat$forward_sched_first_at <- factor(
  .first_at(dat$forward_sched_half1, dat$forward_sched_half2, dat$forward_sched_msg2, dat$forward_sched_msg3plus),
  levels = .POSITION_LEVELS)
dat$forward_sched_any <- as.integer(dat$forward_sched_first_at != "Never")
cat(sprintf(
  "Forward scheduling (calendar link OR specific day/time): %d in 1st half of msg 1, %d in 2nd half, %d in msg 2, %d in msg 3+ (%d rows use it somewhere).\n",
  sum(dat$forward_sched_half1, na.rm=TRUE), sum(dat$forward_sched_half2, na.rm=TRUE),
  sum(dat$forward_sched_msg2, na.rm=TRUE), sum(dat$forward_sched_msg3plus, na.rm=TRUE), sum(dat$forward_sched_any)))

# Derived AI signals used downstream
dat$pct_about_bdr <- ifelse(is.na(dat$pct_about_bdr) & !is.na(dat$pct_about_prospect),
                            pmax(0, 100 - dat$pct_about_prospect), dat$pct_about_bdr)

# ==============================================================================
# SECTION 5 - BLENDED SCORE + BINARY SIGNAL MATRIX + FEATURE REGISTRY
# ==============================================================================

blended_score <- function(connect, reply, sched) {
  w <- CFG$blend_weights
  100 * (w[["connected"]] * connect + w[["replied"]] * reply +
           w[["scheduled"]] * sched) / sum(w)
}

# Each signal is a 0/1 flag (NA where its inputs are missing). `flag()` keeps NA.
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

# --- Personalization ----------------------------------------------------------
add_sig("high_prospect_focus", dat$pct_about_prospect >= 60,
        "Message is mostly about the prospect (>=60%)", "Personalization")
add_sig("mostly_about_us", dat$pct_about_bdr >= 60,
        "Message is mostly about us / our company (>=60%)", "Personalization")
add_sig("specific_detail", dat$specific_detail == 1,
        "Cites a specific researched detail about them", "Personalization")
add_sig("personal_unique", dat$personal_share == "Unique",
        "Shares a unique / specific personal connection", "Personalization")
add_sig("personal_generic", dat$personal_share == "Generic",
        "Shares only a generic personal claim", "Personalization")

# --- AI feel ------------------------------------------------------------------
add_sig("sounds_ai", dat$ai_sounding >= 4, "Reads as AI-generated / templated", "AI Feel")
add_sig("sounds_human", dat$ai_sounding <= 2, "Reads as clearly human-written", "AI Feel")

# --- Tone ---------------------------------------------------------------------
add_sig("tone_conversational", dat$msg_tone == "conversational", "Conversational tone", "Tone")
add_sig("tone_genuine",        dat$msg_tone == "genuine",        "Genuine tone",        "Tone")
add_sig("tone_flattering",     dat$msg_tone == "flattering",     "Flattering tone",     "Tone")
add_sig("tone_salesy",         dat$msg_tone == "salesy",         "Salesy tone",         "Tone")
add_sig("tone_generic",        dat$msg_tone == "generic",        "Generic tone",        "Tone")

# --- Hook ---------------------------------------------------------------------
add_sig("hook_post_reaction",     dat$msg_hook_type == "PostReaction",      "Hook: reacted to their post", "Hook", outcome = "connected")
add_sig("hook_news_award",        dat$msg_hook_type == "NewsAward",         "Hook: their news / award",    "Hook", outcome = "connected")
add_sig("hook_shared_interest",   dat$msg_hook_type == "SharedInterest",    "Hook: shared interest",       "Hook", outcome = "connected")
add_sig("hook_personal_compliment", dat$msg_hook_type == "PersonalCompliment", "Hook: personal compliment","Hook", outcome = "connected")

# --- Reason to connect --------------------------------------------------------
add_sig("reason_shared_background", dat$reason_to_connect == "SharedBackground", "Reason: shared background/experience", "Reason to Connect")
add_sig("reason_reacting_content",  dat$reason_to_connect == "ReactingToContent","Reason: reacting to their content",   "Reason to Connect")
add_sig("reason_mutual_interest",   dat$reason_to_connect == "MutualInterest",   "Reason: mutual interest/topic",       "Reason to Connect")
add_sig("reason_value_prop",        dat$reason_to_connect == "DirectValueProp",  "Reason: direct value proposition",    "Reason to Connect")
add_sig("reason_referral",          dat$reason_to_connect == "Referral",         "Reason: referral / mutual connection","Reason to Connect")
add_sig("reason_congrats",          dat$reason_to_connect == "Congratulations",  "Reason: congratulations",             "Reason to Connect")
add_sig("reason_curiosity",         dat$reason_to_connect == "CuriosityQuestion","Reason: curiosity question",          "Reason to Connect")

# --- Message craft ------------------------------------------------------------
add_sig("asks_question", dat$has_question == 1, "Asks a question", "Message Craft")
add_sig("has_cta",       dat$cta_ai == 1,       "Has a clear call-to-action", "Message Craft")
add_sig("short_msg",     dat$first_msg_nchar < 125, "Short message (<125 chars)", "Message Craft")
add_sig("long_msg",      dat$first_msg_nchar > 250, "Long message (>250 chars)",  "Message Craft")
add_sig("congratulatory",dat$has_congrats == 1, "Congratulatory language", "Message Craft")
add_sig("quotes_them",   dat$quotes_them == 1,  "Quotes their own words", "Message Craft")
add_sig("has_emoji",     dat$has_emoji == 1,    "Uses an emoji", "Message Craft")
add_sig("multi_emoji",   dat$emoji_use == "Multiple (2+)", "Uses multiple emojis", "Message Craft")
add_sig("uses_exclaim",  dat$exclam_use != "None", "Uses exclamation marks", "Message Craft")
add_sig("multi_exclaim", dat$exclam_use == "Multiple (2+)", "Uses multiple exclamation marks", "Message Craft")
add_sig("uses_abbrev",   dat$uses_abbreviations == "Uses abbreviations", "Uses informal abbreviations", "Message Craft")
add_sig("high_emotion",  dat$emotion_level >= 4,"High emotional intensity", "Message Craft")
add_sig("all_caps",      dat$all_caps == 1,     "Uses ALL CAPS for emphasis", "Message Craft")
add_sig("has_thanks",    dat$has_thank == 1,    "Says thank you", "Message Craft")
add_sig("has_stat",      dat$has_stat == 1,     "Cites a statistic / number", "Message Craft")
add_sig("high_quality_hook", dat$connection_quality >= 70, "Highly specific, compelling hook", "Message Craft")
add_sig("low_quality_hook",  dat$connection_quality <= 30, "Generic / low-quality hook", "Message Craft")
add_sig("very_salesy",   dat$salesy_score >= 4, "Feels salesy / pitchy", "Tone")
add_sig("easy_read",     dat$fk_grade <= 8,     "Easy reading level (grade <=8)", "Message Craft")
add_sig("complex_read",  dat$fk_grade >= 13,    "Complex reading level (grade 13+)", "Message Craft")

# ------------------------------------------------------------------------------
# "3 DIFFERENT MODELS" - Level 2 / Level 3 content signals --------------------
# ------------------------------------------------------------------------------
# Every content signal registered above (Personalization, AI Feel, Tone, Hook,
# Reason to Connect, Message Craft, Opening Line, question type) is tripled
# here against the Level-2 ("_lvl2", between the 1st & 2nd reply) and Level-3
# ("_lvl3", after the 2nd reply) features built in Section 3/4. Each is scoped
# to the population that actually reached that reply round (has_msg2/has_msg3)
# and scored against "scheduled" (not "replied" - trivially 1 for that
# population by construction) - see the Level 2/3 outcome convention agreed
# with the user. Two categories are deliberately NOT repeated here:
#   - "Connect Ask" (connect_lets/worth/none): phrasing to get a connection
#     ACCEPTED. By msg2/msg3 the connection is already accepted, so this
#     question no longer applies.
#   - Audience / Follow-up / the position-based neg_question_*, uses_name_*,
#     about_us_*, meeting_ask_* signals: these stay exactly as they are today
#     (see scope decisions discussed with the user).
add_level_content_sigs <- function(sfx, scope) {
  lvl <- if (scope == "has_msg2") "Msg 2" else "Msg 3+"
  g <- function(col) dat[[paste0(col, sfx)]]
  a <- function(id, expr, label, category) add_sig(paste0(id, sfx), expr, paste0(label, " (", lvl, ")"),
                                                     category, scope = scope, outcome = "scheduled")
  # Personalization
  a("high_prospect_focus", g("pct_about_prospect") >= 60, "Message is mostly about the prospect (>=60%)", "Personalization")
  a("mostly_about_us",     g("pct_about_bdr") >= 60,      "Message is mostly about us / our company (>=60%)", "Personalization")
  a("specific_detail",     g("specific_detail") == 1,     "Cites a specific researched detail about them", "Personalization")
  a("personal_unique",     g("personal_share") == "Unique",  "Shares a unique / specific personal connection", "Personalization")
  a("personal_generic",    g("personal_share") == "Generic", "Shares only a generic personal claim", "Personalization")
  # AI feel
  a("sounds_ai",    g("ai_sounding") >= 4, "Reads as AI-generated / templated", "AI Feel")
  a("sounds_human", g("ai_sounding") <= 2, "Reads as clearly human-written", "AI Feel")
  # Tone
  a("tone_conversational", g("msg_tone") == "conversational", "Conversational tone", "Tone")
  a("tone_genuine",        g("msg_tone") == "genuine",        "Genuine tone",        "Tone")
  a("tone_flattering",     g("msg_tone") == "flattering",     "Flattering tone",     "Tone")
  a("tone_salesy",         g("msg_tone") == "salesy",         "Salesy tone",         "Tone")
  a("tone_generic",        g("msg_tone") == "generic",        "Generic tone",        "Tone")
  a("very_salesy",         g("salesy_score") >= 4, "Feels salesy / pitchy", "Tone")
  # Hook (reinterpreted for follow-up context - see LEVEL2_PROMPT/LEVEL3_PROMPT)
  a("hook_post_reaction",       g("msg_hook_type") == "PostReaction",        "Hook: reacted to their post", "Hook")
  a("hook_news_award",          g("msg_hook_type") == "NewsAward",           "Hook: their news / award",    "Hook")
  a("hook_shared_interest",     g("msg_hook_type") == "SharedInterest",      "Hook: shared interest",       "Hook")
  a("hook_personal_compliment", g("msg_hook_type") == "PersonalCompliment", "Hook: personal compliment",    "Hook")
  # Reason (reinterpreted for follow-up context)
  a("reason_shared_background", g("reason_to_connect") == "SharedBackground", "Reason: shared background/experience", "Reason to Connect")
  a("reason_reacting_content",  g("reason_to_connect") == "ReactingToContent","Reason: reacting to their content",   "Reason to Connect")
  a("reason_mutual_interest",   g("reason_to_connect") == "MutualInterest",   "Reason: mutual interest/topic",       "Reason to Connect")
  a("reason_value_prop",        g("reason_to_connect") == "DirectValueProp",  "Reason: direct value proposition",    "Reason to Connect")
  a("reason_referral",          g("reason_to_connect") == "Referral",         "Reason: referral / mutual connection","Reason to Connect")
  a("reason_congrats",          g("reason_to_connect") == "Congratulations",  "Reason: congratulations",             "Reason to Connect")
  a("reason_curiosity",         g("reason_to_connect") == "CuriosityQuestion","Reason: curiosity question",          "Reason to Connect")
  # Message craft
  a("asks_question",   g("has_question") == 1, "Asks a question", "Message Craft")
  a("has_cta",          g("cta_ai") == 1,       "Has a clear call-to-action", "Message Craft")
  a("short_msg",        g("nchar") < 125,       "Short message (<125 chars)", "Message Craft")
  a("long_msg",         g("nchar") > 250,       "Long message (>250 chars)",  "Message Craft")
  a("congratulatory",   g("has_congrats") == 1, "Congratulatory language", "Message Craft")
  a("quotes_them",      g("quotes_them") == 1,  "Quotes their own words", "Message Craft")
  a("has_emoji",        g("has_emoji") == 1,    "Uses an emoji", "Message Craft")
  a("multi_emoji",      g("emoji_use") == "Multiple (2+)", "Uses multiple emojis", "Message Craft")
  a("uses_exclaim",     g("exclam_use") != "None", "Uses exclamation marks", "Message Craft")
  a("multi_exclaim",    g("exclam_use") == "Multiple (2+)", "Uses multiple exclamation marks", "Message Craft")
  a("uses_abbrev",      g("uses_abbreviations") == "Uses abbreviations", "Uses informal abbreviations", "Message Craft")
  a("high_emotion",     g("emotion_level") >= 4, "High emotional intensity", "Message Craft")
  a("all_caps",         g("all_caps") == 1,      "Uses ALL CAPS for emphasis", "Message Craft")
  a("has_thanks",       g("has_thank") == 1,     "Says thank you", "Message Craft")
  a("has_stat",         g("has_stat") == 1,      "Cites a statistic / number", "Message Craft")
  a("high_quality_hook",g("connection_quality") >= 70, "Highly specific, compelling hook", "Message Craft")
  a("low_quality_hook", g("connection_quality") <= 30, "Generic / low-quality hook", "Message Craft")
  a("easy_read",        g("fk_grade") <= 8,  "Easy reading level (grade <=8)", "Message Craft")
  a("complex_read",     g("fk_grade") >= 13, "Complex reading level (grade 13+)", "Message Craft")
  a("q_about_them",     g("question_type") == "AboutThem",    "Asks a question about them", "Message Craft")
  a("q_about_meeting",  g("question_type") == "AboutMeeting", "Asks directly for a meeting", "Message Craft")
  # Meeting-ask phrasing + message structure + calendar link - "is it better
  # to be forward with calendar links/times to meet, and does exactly HOW we
  # ask matter" (user-requested analysis; see research_block_level() for the
  # fuller breakdowns + prior-interest cross-tabs built from these same cols).
  a("meeting_ask_question",  g("meeting_ask_style") == "Question",
    "Meeting ask phrased as a direct question (e.g. \"Would it make sense to meet?\")", "Message Craft")
  a("meeting_ask_statement", g("meeting_ask_style") == "Statement",
    "Meeting ask phrased as a statement/suggestion (e.g. \"Let's grab 15 minutes\")", "Message Craft")
  a("has_linebreak",        g("has_linebreak") == "Has line break",
    "Message has a paragraph break / line break", "Message Craft")
  a("shares_calendar_link", g("calendar_link") == "Shares calendar link",
    "Shares a calendar/scheduling link", "Message Craft")
  # Opening line (of this level's message block)
  a("opener_question",    g("opener_is_question") == 1, "Opens with a question", "Opening Line")
  a("opener_observation", g("opener_type") == "Observation about them", "Opens with an observation about them", "Opening Line")
  a("opener_about_us",    g("opener_type") == "About us", "Opens by talking about us", "Opening Line")
}
add_level_content_sigs("_lvl2", "has_msg2")
add_level_content_sigs("_lvl3", "has_msg3")

# --- Negative / rhetorical question framing ("a 'No' is a 'Yes'") ------------
# e.g. "Wouldn't it help to grab 15 minutes?" / "Would it not help to find a
# time and meet?" - checked separately at each of the 4 message positions so
# we can see whether the tactic works differently early vs. late in message 1,
# in message 2, or once the conversation is further along.
add_sig("neg_question_half1",    dat$neg_q_half1 == 1,
        "1st half of message 1 uses a negative/rhetorical question (e.g. \"Wouldn't it help to...?\")",
        "Message Craft", outcome = "replied")
add_sig("neg_question_half2",    dat$neg_q_half2 == 1,
        "2nd half of message 1 uses a negative/rhetorical question",
        "Message Craft", outcome = "replied")
add_sig("neg_question_msg2",     dat$neg_q_msg2 == 1,
        "Message 2 uses a negative/rhetorical question",
        "Follow-up", outcome = "replied")
add_sig("neg_question_msg3plus", dat$neg_q_msg3plus == 1,
        "Message 3 or later uses a negative/rhetorical question",
        "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("neg_question_any",      dat$neg_q_any == 1,
        "Uses a negative/rhetorical question anywhere in the sequence",
        "Message Craft", outcome = "replied")

# --- Uses the prospect's name -------------------------------------------------
# e.g. "Hi John," / "...would love to connect, John" - checked separately at
# each touch so we can see whether naming them helps/hurts in the opener vs. a
# pre-reply nudge vs. a post-reply follow-up.
add_sig("uses_name_first",    dat$uses_name_first == 1,
        "Opening message uses the prospect's first name",
        "Personalization", outcome = "replied")
add_sig("uses_name_second",   dat$uses_name_second == 1,
        "Pre-reply follow-up (2nd message) uses the prospect's first name",
        "Personalization", outcome = "replied")
add_sig("uses_name_followup", dat$uses_name_followup == 1,
        "Post-reply follow-up uses the prospect's first name",
        "Personalization", scope = "replied", outcome = "scheduled")
add_sig("uses_name_any",      dat$uses_name_any == 1,
        "Uses the prospect's first name anywhere in the sequence",
        "Personalization", outcome = "replied")

# --- When do we talk about ourselves / what we do ----------------------------
# AI-classified (see POSITION_PROMPT) at each of the 4 message positions, so we
# can see whether pivoting to "us" early vs. late costs or helps replies/
# meetings. Also exposed as a "first occurrence position" breakdown in the
# research section (about_us_first_at) - same treatment as Tone/Hook/Reason.
add_sig("about_us_half1",    dat$about_us_half1 == 1,
        "1st half of message 1 is mainly about us/what we do", "Personalization", outcome = "replied")
add_sig("about_us_half2",    dat$about_us_half2 == 1,
        "2nd half of message 1 is mainly about us/what we do", "Personalization", outcome = "replied")
add_sig("about_us_msg2",     dat$about_us_msg2 == 1,
        "Message 2 is mainly about us/what we do", "Follow-up", outcome = "replied")
add_sig("about_us_msg3plus", dat$about_us_msg3plus == 1,
        "Message 3 or later is mainly about us/what we do", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("about_us_any",      dat$about_us_any == 1,
        "Talks about us/what we do somewhere in the sequence", "Personalization", outcome = "replied")

# --- When do we ask for a meeting ---------------------------------------------
# AI-classified (see POSITION_PROMPT) at each of the 4 message positions.
# Exposed as a "first occurrence position" breakdown (meeting_ask_first_at)
# the same way as Tone/Hook/Reason.
add_sig("meeting_ask_half1",    dat$meeting_ask_half1 == 1,
        "1st half of message 1 asks for a meeting/call", "Message Craft", outcome = "replied")
add_sig("meeting_ask_half2",    dat$meeting_ask_half2 == 1,
        "2nd half of message 1 asks for a meeting/call", "Message Craft", outcome = "replied")
add_sig("meeting_ask_msg2",     dat$meeting_ask_msg2 == 1,
        "Message 2 asks for a meeting/call", "Follow-up", outcome = "replied")
add_sig("meeting_ask_msg3plus", dat$meeting_ask_msg3plus == 1,
        "Message 3 or later asks for a meeting/call", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("meeting_ask_any",      dat$meeting_ask_any == 1,
        "Asks for a meeting/call somewhere in the sequence", "Message Craft", outcome = "replied")

# --- "Being forward": calendar link shared / specific day-time proposed ------
# Regex-detected calendar_link_* (a scheduling-tool link or explicit "here's
# my calendar" phrasing) and AI-classified datetime_propose_* (see
# POSITION_PROMPT - names a specific day and/or time, stricter than the plain
# meeting_ask_* "would love to chat" ask) at each of the 4 message positions,
# plus forward_sched_* = either one, whichever happens first - the combined
# "being forward with scheduling" signal. Exposed as first-occurrence-position
# breakdowns (forward_sched_first_at etc.) the same way as Tone/Hook/Reason,
# plus a dedicated prior-interest analysis in Section 9 (research.forward_scheduling).
add_sig("calendar_link_half1",    dat$calendar_link_half1 == 1,
        "1st half of message 1 shares a calendar/scheduling link", "Message Craft", outcome = "replied")
add_sig("calendar_link_half2",    dat$calendar_link_half2 == 1,
        "2nd half of message 1 shares a calendar/scheduling link", "Message Craft", outcome = "replied")
add_sig("calendar_link_msg2",     dat$calendar_link_msg2 == 1,
        "Message 2 shares a calendar/scheduling link", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("calendar_link_msg3plus", dat$calendar_link_msg3plus == 1,
        "Message 3 or later shares a calendar/scheduling link", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("calendar_link_any",      dat$calendar_link_any == 1,
        "Shares a calendar/scheduling link somewhere in the sequence", "Message Craft", outcome = "replied")

add_sig("datetime_propose_half1",    dat$datetime_propose_half1 == 1,
        "1st half of message 1 proposes a specific day/time to meet", "Message Craft", outcome = "replied")
add_sig("datetime_propose_half2",    dat$datetime_propose_half2 == 1,
        "2nd half of message 1 proposes a specific day/time to meet", "Message Craft", outcome = "replied")
add_sig("datetime_propose_msg2",     dat$datetime_propose_msg2 == 1,
        "Message 2 proposes a specific day/time to meet", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("datetime_propose_msg3plus", dat$datetime_propose_msg3plus == 1,
        "Message 3 or later proposes a specific day/time to meet", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("datetime_propose_any",      dat$datetime_propose_any == 1,
        "Proposes a specific day/time to meet somewhere in the sequence", "Message Craft", outcome = "replied")

add_sig("forward_sched_half1",    dat$forward_sched_half1 == 1,
        "1st half of message 1 is forward about scheduling (calendar link or specific day/time)",
        "Message Craft", outcome = "replied")
add_sig("forward_sched_half2",    dat$forward_sched_half2 == 1,
        "2nd half of message 1 is forward about scheduling (calendar link or specific day/time)",
        "Message Craft", outcome = "replied")
add_sig("forward_sched_msg2",     dat$forward_sched_msg2 == 1,
        "Message 2 is forward about scheduling (calendar link or specific day/time)",
        "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("forward_sched_msg3plus", dat$forward_sched_msg3plus == 1,
        "Message 3 or later is forward about scheduling (calendar link or specific day/time)",
        "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("forward_sched_any",      dat$forward_sched_any == 1,
        "Forward about scheduling (calendar link or specific day/time) somewhere in the sequence",
        "Message Craft", outcome = "replied")

# --- Opening line -------------------------------------------------------------
add_sig("opener_question",    dat$opener_is_question == 1,        "Opens with a question", "Opening Line")
add_sig("opener_observation", dat$opener_type == "Observation about them", "Opens with an observation about them", "Opening Line")
add_sig("opener_about_us",    dat$opener_type == "About us",      "Opens by talking about us", "Opening Line")

# --- Question type ------------------------------------------------------------
add_sig("q_about_them",    dat$question_type == "AboutThem",    "Asks a question about them", "Message Craft")
add_sig("q_about_meeting", dat$question_type == "AboutMeeting", "Asks directly for a meeting", "Message Craft")

# --- Connection-request phrasing (affects whether they accept) ----------------
add_sig("connect_lets",  dat$connect_phrasing == "Let's connect",   "Says \"Let's connect\"",   "Connect Ask", outcome = "connected")
add_sig("connect_worth", dat$connect_phrasing == "Worth connecting","Says \"Worth connecting\"","Connect Ask", outcome = "connected")
add_sig("connect_none",  dat$connect_phrasing == "No connect ask",  "No explicit connect ask",   "Connect Ask", outcome = "connected")

# --- Audience (prospect attributes; "which targets convert") ------------------
# is_executive / executive_label combine C-Suite+VP into one "executive" flag -
# used both as a Keys-to-Success signal below AND as one of the 4 audience-
# composition dimensions in audience_profile_block() (Section 9, hypothesis-
# group vs. global-baseline profiling; user-requested).
dat$is_executive    <- as.integer(dat$contact_seniority %in% c("C-Suite", "VP"))
dat$executive_label <- ifelse(is.na(dat$contact_seniority), NA_character_,
                              ifelse(dat$is_executive == 1, "Executive (C-Suite/VP)", "Non-Executive"))

add_sig("aud_csuite",  dat$contact_seniority == "C-Suite", "Target is C-Suite", "Audience", outcome = "connected")
add_sig("aud_vp",      dat$contact_seniority == "VP",      "Target is VP",      "Audience", outcome = "connected")
add_sig("aud_director",dat$contact_seniority == "Director","Target is Director","Audience", outcome = "connected")
add_sig("aud_executive",dat$is_executive == 1, "Target is an Executive (C-Suite/VP)", "Audience", outcome = "connected")
add_sig("aud_complete_profile", dat$experience_len >= 800, "Target has a detailed LinkedIn profile", "Audience", outcome = "connected")
add_sig("aud_well_connected",   dat$linkedin_connections >= 2000, "Target is highly connected (2000+)", "Audience", outcome = "connected")

# --- Follow-up (only meaningful once the prospect has replied) ----------------
add_sig("fu_fast",           dat$hours_to_bdr_followup <= 3,  "Replied to them within 3 hours", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("fu_sameday",        dat$hours_to_bdr_followup <= 24, "Replied to them same day",       "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("fu_answered_q",     dat$fu_approach == "AnsweredQuestion", "Follow-up answered their question", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("fu_pushed_meeting", dat$fu_approach == "PushedForMeeting", "Follow-up pushed for a meeting",    "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("fu_gave_value",     dat$fu_approach == "GaveValue",        "Follow-up gave value first",        "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("fu_soft_checkin",   dat$fu_approach == "SoftCheckin",      "Follow-up was a soft check-in",     "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("fu_matched_energy", dat$fu_energy >= 4,  "Follow-up matched their energy", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("fu_shared_resource",dat$fu_approach == "SharedResource", "Follow-up shared a resource", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("warm_reply",        dat$reply_enthusiasm >= 4, "Prospect replied warmly/enthusiastically", "Follow-up", scope = "replied", outcome = "scheduled")
add_sig("long_reply",        dat$prospect_reply_len >= 120, "Prospect wrote a substantive first reply", "Follow-up", scope = "replied", outcome = "scheduled")

SIG_COLS <- paste0("sig_", SIG$id)
cat(sprintf("Built %d candidate success signals.\n", nrow(SIG)))

# ==============================================================================
# SECTION 6 - POOLED PREDICTIVE MODEL (Random Forest + elastic net)
# ==============================================================================
# A probability random forest predicts each funnel outcome from message + target
# + profile features. LinkedIn connections and followers are INCLUDED as
# predictors so their effect is absorbed and the message-feature importances are
# "beyond what connection count already explains" (guards against spurious
# phrase/feature effects). Out-of-bag predictions become each prospect's
# opportunity score. All fitting is guarded so tiny datasets never crash the run.

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

# "3 different models" - Level 2 / Level 3 predictor lists mirror MF_NUMERIC/
# MF_FACTOR but sourced from the "_lvl2"/"_lvl3"-suffixed content features (see
# Sections 3-5) instead of the Level-1 legacy names. Profile-length fields
# (about_len/experience_len/education_len) and the shared context factors
# (seniority, org type, client, hypothesis, send timing, BDR, and the
# first-occurrence position breakdowns) are prospect/conversation attributes,
# not message-level-dependent, so they are reused unchanged at every level.
# connect_phrasing is intentionally dropped (see signals section - trivial by
# msg2/msg3). neg_q_*/uses_name_* substitute in the position variant that
# actually corresponds to that reply round.
.build_mf_lists <- function(sfx) {
  list(
    numeric = c("log_connections", "log_followers",
                paste0(c("nchar", "fk_grade", "pct_about_prospect", "pct_about_bdr", "ai_sounding",
                         "emotion_level", "flattery_level", "specific_detail", "cta_ai",
                         "connection_quality", "salesy_score", "has_question", "has_congrats",
                         "quotes_them", "has_emoji", "has_stat", "all_caps"), sfx),
                "about_len", "experience_len", "education_len",
                if (sfx == "_lvl2") c("neg_q_msg2", "uses_name_second")
                else                c("neg_q_msg3plus", "uses_name_followup")),
    factor = c(paste0(c("msg_tone", "msg_hook_type", "reason_to_connect", "question_type",
                        "opener_type", "personal_share", "exclam_use", "emoji_use",
                        "uses_abbreviations"), sfx),
               "contact_seniority", "contact_org_type", "client", "hypothesis_group",
               "hypothesis_variation_label", "send_dow", "time_of_day", "request_send_dow",
               "request_time_of_day", "bdr_name",
               "neg_q_first_at", "about_us_first_at", "meeting_ask_first_at"))
}
MF_NUMERIC_LVL2 <- .build_mf_lists("_lvl2")$numeric
MF_FACTOR_LVL2  <- .build_mf_lists("_lvl2")$factor
MF_NUMERIC_LVL3 <- .build_mf_lists("_lvl3")$numeric
MF_FACTOR_LVL3  <- .build_mf_lists("_lvl3")$factor

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

fit_rf <- function(df, outcome, mf_num = MF_NUMERIC, mf_fac = MF_FACTOR) {
  if (!requireNamespace("ranger", quietly = TRUE)) return(NULL)
  y <- df[[outcome]]
  if (length(unique(y[!is.na(y)])) < 2 || sum(y == 1, na.rm = TRUE) < 8) return(NULL)
  preds <- c(mf_num, paste0(mf_num, "_miss"), mf_fac)
  preds <- intersect(preds, names(df))
  preds <- preds[vapply(preds, function(p) length(unique(df[[p]])) > 1, logical(1))]
  # cap factor cardinality to keep ranger stable
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

# Train on CORE rows only (surround_connections excluded) so the "what drives
# success" model and importances aren't skewed by the limited-repeatability type.
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

# Out-of-bag opportunity scores for core rows (surround rows stay NA - they are
# excluded from the driver analysis / example ranking). When a given RF is not
# fitted (too few positives) fall back to the base rate for that component.
oob_prob <- function(m, base, n) if (is.null(m)) rep(base, n) else m$predictions[, "1"]
n_core <- sum(core_mask)
dat$p_connected <- NA_real_; dat$p_replied <- NA_real_; dat$p_scheduled <- NA_real_
dat$p_connected[core_mask] <- oob_prob(rf_models$connected, mean(dat$connected[core_mask]), n_core)
dat$p_replied[core_mask]   <- oob_prob(rf_models$replied,   mean(dat$replied[core_mask]),   n_core)
dat$p_scheduled[core_mask] <- oob_prob(rf_models$scheduled, mean(dat$scheduled[core_mask]), n_core)
dat$opportunity_score <- blended_score(dat$p_connected, dat$p_replied, dat$p_scheduled)

# ------------------------------------------------------------------------------
# "3 DIFFERENT MODELS" - Level 2 / Level 3 Random Forests ---------------------
# ------------------------------------------------------------------------------
# Separate RF fit per level, each restricted to the population that actually
# reached that reply round, predicting "scheduled" only (replied/connected are
# trivially 1 for has_msg2/has_msg3 populations by construction - see the
# Level 2/3 outcome convention agreed with the user).
lvl2_mask <- dat$is_core & dat$has_msg2 == 1
lvl3_mask <- dat$is_core & dat$has_msg3 == 1
rf_frame_lvl2 <- impute_frame(dat[lvl2_mask, , drop = FALSE], MF_NUMERIC_LVL2, MF_FACTOR_LVL2)
rf_frame_lvl3 <- impute_frame(dat[lvl3_mask, , drop = FALSE], MF_NUMERIC_LVL3, MF_FACTOR_LVL3)
rf_models_lvl2 <- list(scheduled = fit_rf(rf_frame_lvl2, "scheduled", MF_NUMERIC_LVL2, MF_FACTOR_LVL2))
rf_models_lvl3 <- list(scheduled = fit_rf(rf_frame_lvl3, "scheduled", MF_NUMERIC_LVL3, MF_FACTOR_LVL3))
for (lvl in c("lvl2", "lvl3")) {
  m <- get(paste0("rf_models_", lvl))$scheduled
  if (!is.null(m) && length(m$variable.importance)) {
    vi <- m$variable.importance
    rf_importance <- dplyr::bind_rows(rf_importance, tibble::tibble(
      feature = names(vi), importance = as.numeric(vi), outcome = paste0("scheduled_", lvl)))
  }
}
n_lvl2 <- sum(lvl2_mask); n_lvl3 <- sum(lvl3_mask)
dat$p_scheduled_lvl2 <- NA_real_; dat$p_scheduled_lvl3 <- NA_real_
dat$p_scheduled_lvl2[lvl2_mask] <- oob_prob(rf_models_lvl2$scheduled, mean(dat$scheduled[lvl2_mask]), n_lvl2)
dat$p_scheduled_lvl3[lvl3_mask] <- oob_prob(rf_models_lvl3$scheduled, mean(dat$scheduled[lvl3_mask]), n_lvl3)
cat(sprintf("Level-2 RF: %s (n=%d). Level-3 RF: %s (n=%d).\n",
            if (is.null(rf_models_lvl2$scheduled)) "not fitted (too few positives)" else "fitted", n_lvl2,
            if (is.null(rf_models_lvl3$scheduled)) "not fitted (too few positives)" else "fitted", n_lvl3))

# Optional joint elastic-net logistic for a connection-controlled coefficient view
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
enet_coefs <- tryCatch(
  dplyr::bind_rows(lapply(c("replied","scheduled"), function(oc) fit_enet(rf_frame, oc))),
  error = function(e) NULL)
enet_coefs_lvl2 <- tryCatch(fit_enet(rf_frame_lvl2, "scheduled", MF_NUMERIC_LVL2, MF_FACTOR_LVL2),
                             error = function(e) NULL)
enet_coefs_lvl3 <- tryCatch(fit_enet(rf_frame_lvl3, "scheduled", MF_NUMERIC_LVL3, MF_FACTOR_LVL3),
                             error = function(e) NULL)
if (!is.null(enet_coefs_lvl2) && nrow(enet_coefs_lvl2)) enet_coefs_lvl2$outcome <- "scheduled_lvl2"
if (!is.null(enet_coefs_lvl3) && nrow(enet_coefs_lvl3)) enet_coefs_lvl3$outcome <- "scheduled_lvl3"
enet_coefs <- dplyr::bind_rows(enet_coefs, enet_coefs_lvl2, enet_coefs_lvl3)

cat("Predictive models fitted (RF + elastic net where feasible).\n")

# ==============================================================================
# SECTION 7 - CONTROLLED KEYS-TO-SUCCESS ENGINE
# ==============================================================================
# For a signal within a population, estimate its effect on the outcome, adjusted
# for LinkedIn connections (+ followers) via logistic regression average
# marginal effect. Falls back to an unadjusted two-proportion comparison when
# there is too little connection data. Per-segment estimates are shrunk toward
# the pooled (all-data) estimate so small segments do not shout noise.

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

# Generalized population filter for a signal's `scope`: "all" (no filter),
# "replied" (only rows the prospect replied to - used by Level-1 follow-up
# signals), or "has_msg2"/"has_msg3" (only rows that reached that reply round -
# used by the "3 different models" Level-2/Level-3 content signals, since
# scoring a Level-2/3 signal against rows that never reached that point would
# bias the comparison toward "no message at all").
filter_scope <- function(df, scope) {
  switch(scope,
    "replied"  = df[df$replied == 1,  , drop = FALSE],
    "has_msg2" = df[df$has_msg2 == 1, , drop = FALSE],
    "has_msg3" = df[df$has_msg3 == 1, , drop = FALSE],
    df)
}

# Pooled (all-data) effect per signal, used as the shrinkage target.
pooled_pop <- function(sig_row) {
  base <- dat[dat$is_core, , drop = FALSE]   # surround_connections excluded from drivers
  filter_scope(base, sig_row$scope)
}
POOLED_EFF <- setNames(vector("list", nrow(SIG)), SIG$id)
for (i in seq_len(nrow(SIG))) {
  sr <- SIG[i, ]
  POOLED_EFF[[sr$id]] <- adjusted_effect(pooled_pop(sr), sr$primary_outcome, paste0("sig_", sr$id))
}

confidence_tier <- function(p, min_arm) {
  if (is.na(p)) return("Low")
  if (p < 0.05 && min_arm >= 30) return("High")
  if (p < 0.10 && min_arm >= CFG$min_arm_n) return("Medium")
  "Low"
}

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
    # --- Trust guards -----------------------------------------------------------
    # Empirical-Bayes borrows strength from the pooled all-client effect to
    # stabilise the MAGNITUDE of small-segment estimates. It must never FLIP the
    # sign of this segment's OWN estimate (e$effect - already connection-adjusted
    # where possible), or a zero-event / tiny arm would inherit a spurious "works
    # here" headline from the benchmark (the Vflok low_quality_hook case:
    # segment effect -1pp, but a +9.3pp pooled effect dragged the shrunk estimate
    # to +3.1pp "working"). NOTE: we compare against e$effect, not the raw rate
    # difference, so genuine connection-controlled effects (whose adjusted sign
    # legitimately differs from the raw rates) are preserved.
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

cat("Keys engine ready.\n")

# ==============================================================================
# SECTION 8 - PHRASE ANALYSIS (connection-controlled)
# ==============================================================================
# Which words/phrases in the first message move the reply rate, AFTER adjusting
# for the prospect's connection count? A phrase that merely co-occurs with
# highly-connected prospects will have its effect neutralised by the control.

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
  # drop pure-stopword unigrams
  grams <- grams[!(grams %in% PHRASE_STOP)]
  unique(grams)
}

cat("Tokenizing messages for phrase analysis...\n")
.ngram_max <- max(CFG$phrase_ngram_max, CFG$recurring_ngram_max)
# "3 different models" - one phrase table per message level (msg1/msg2/msg3),
# replacing the old 2-bucket first/followup system. bdr_reply_after_reply (the
# single BDR message right after the 1st reply) is superseded by msg2_text
# (the full combined blob of everything sent between the 1st & 2nd reply).
.tokenize_col <- function(col) {
  ngr <- lapply(dat[[col]], make_ngrams, nmax = .ngram_max)
  tibble::tibble(row = rep(seq_along(ngr), lengths(ngr)), phrase = unlist(ngr))
}
PH_LONG_LVL1 <- .tokenize_col("msg1_text")
PH_LONG_LVL2 <- .tokenize_col("msg2_text")
PH_LONG_LVL3 <- .tokenize_col("msg3_text")

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

# ------------------------------------------------------------------------------
# RECURRING PHRASE FINDER - "multi-word phrases we say a lot", categorized
# ------------------------------------------------------------------------------
# Tags each recurring phrase by intent so the site can group them:
#   "Meeting ask", "About the prospect", "About us", "Compliment / reaction",
#   "Gratitude", or "Other".
phrase_category <- function(p) {
  if (grepl("\\b(chat|call|meeting|connect|connecting|time|schedule|calendar|grab|catch up|quick|talk|meet|hop on|jump on|coffee)\\b", p)) return("Meeting ask")
  if (grepl("\\b(thank|thanks|appreciate|grateful)\\b", p)) return("Gratitude")
  if (grepl("\\b(saw|loved|noticed|read|impressive|great|congrat|awesome|nice|caught my eye|fascinating)\\b", p)) return("Compliment / reaction")
  if (grepl("\\b(your|you|their)\\b", p) && !grepl("\\b(i|we|our|my|us)\\b", p)) return("About the prospect")
  if (grepl("\\b(i|we|our|my|us|klas|i've|we've)\\b", p)) return("About us")
  "Other"
}

# Reduce the many overlapping sliding-window n-grams down to the distinct phrases
# people actually say, by keeping only "closed" phrases. A phrase is dropped when:
#   (a) it is a fragment - a longer phrase contains it whole-word and is nearly as
#       frequent (n_long >= n * keep_ratio), so the fragment adds nothing; or
#   (b) it is a rare extension - a shorter phrase inside it is far more frequent
#       (n_short >= n * core_ratio), so the common core is the real phrase.
# This surfaces both maximal templated phrases ("open to a quick chat") and common
# cores that branch into many continuations ("saw your"), without the transitive
# chaining that a bridge fragment like "to connect" would otherwise cause.
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
  # Second pass: a sentence longer than the n-gram window fragments into several
  # equal-frequency rolling windows that no single one dominates. Merge exact
  # rolling neighbours (one shares all-but-first tokens with the next's all-but-last)
  # into one cluster. This only ever joins consecutive windows of the same repeated
  # sentence, so it cannot bridge two genuinely different phrases.
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
}

# Recurring phrases within a segment for a given message level (1, 2, or 3).
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

cat("Phrase engine ready.\n")

# ==============================================================================
# SECTION 9 - ASSEMBLE WEBSITE-READY JSON
# ==============================================================================
# Output schema (published to Firebase at <firebase_root>/latest and
# <firebase_root>/runs/<run_date>):
#
# {
#   meta:   { generated_at, run_date, source_file, n_contacts, n_clients,
#             blend_weights, ai_scored },
#   overall:        <segment>,           # all clients combined
#   model_quality:  { n_total, n_driver_rows, n_surround_excluded,
#                     n_eligible_lvl2, n_eligible_lvl3, rf_fitted[],
#                     top_drivers[{feature,importance,outcome}] },
#                     # rf_fitted / top_drivers' `outcome` now includes
#                     # "scheduled_lvl2"/"scheduled_lvl3" alongside the
#                     # Level-1 "connected"/"replied"/"scheduled" fits - see
#                     # the "3 different models" Level 2/3 RF models (Section 6).
#   clients: {
#     <client_slug>: <segment> + { hypothesis_groups: { <hg_slug>: <segment> } }
#   }
# }
#
# NOTE: funnel + trend + message_type_overview use ALL rows (surround_connections
# INCLUDED). keys / research / examples exclude surround_connections because they
# are only repeatable to a limited degree (need a teammate already connected).
#
# <segment> = {
#   name, id, sufficient_data, n_driver_rows,
#   funnel:  { n, connected, replied, scheduled, connect_rate, reply_rate,
#              meeting_rate, cond_reply_rate, cond_meeting_rate, blended_score },
#   message_type_overview: [{level, n, connect_rate, reply_rate, meeting_rate}], # ALL types
#   trend:   [{ month, n, connect_rate, reply_rate, meeting_rate }],
#   keys:    { working[], not_working[] }   # each: {label, category, outcome,
#              effect_pp, rate_with, rate_without, n_with, n_without, p_value,
#              connection_controlled, confidence}  (effect_pp = connection-adjusted,
#              empirical-Bayes-shrunk percentage-point change)
#   research:{ company_vs_prospect, ai_feel, reason_to_connect, personal_sharing,
#              connect_phrasing, exclamation_use, emoji_use, abbreviation_use,
#              hook_type, tone,
#              # personal_sharing = Unique / Generic / None (did the sender share
#              #   something personal, and was it specific or generic?)
#              # connect_phrasing = "Let's connect" / "Worth connecting" / ... /
#              #   "No connect ask" (what we say about connecting in the first msg)
#              # exclamation_use / emoji_use = None / One / Multiple (2+)
#              # abbreviation_use = Uses abbreviations / No abbreviations
#              #   (informal shorthand: lol, btw, fyi, pls, u, gonna, w/, ...)
#              question_type, opener_type, message_type, message_variation,
#              # message_variation = rate table by hypothesis_variation_label
#              #   (the Firestore-assigned A/B test angle for this contact's
#              #   message, e.g. "Fight the Defense"). Empty/absent for
#              #   hypothesis groups that aren't running a variation test.
#              message_length, readability,
#              day_of_week, time_of_day, day_time,
#              request_day_of_week, request_time_of_day, request_day_time,
#              # request_* = when the FIRST CONNECTION REQUEST was actually SENT
#              #   (US Central), from the conn_request_sent timestamp. Same day /
#              #   time-of-day / day+part levels as the send_* tables above. This
#              #   is the "best time for the invite to land" signal - rank it by
#              #   connect_rate (acceptance), not reply/meeting.
#              by_connections, total_messages,
#              audience_seniority, audience_org_type, bdr_performance, followup,
#              # message_length buckets = 25-char bands: 1-25 / 26-50 / ... /
#              #   226-250 / 251+ chars
#              # by_connections buckets = <500 / 500-999 / 1,000-2,499 /
#              #   2,500-4,999 / 5,000+ (real LinkedIn network size)
#              # time_of_day (US Central send hour) = Early morning (5-8a) /
#              #   Morning (9-11a) / Afternoon (12-2p) / Late afternoon (3-5p) /
#              #   Evening (6-9p) / Overnight (10p-4a); day_time combines day+part,
#              #   e.g. "Monday Afternoon"
#              top_phrases:{working[],not_working[]},          # reply-lift ranked,
#              #   scoped to Level 1 (pre-reply) messages only - see message_2/
#              #   message_3plus below for the Level-2/3 equivalents.
#              key_phrases:[ {phrase, count, pct_of_messages, category,
#              #   lift_pp, lift_outcome, connection_controlled} ],  # recurring
#              #   multi-word phrases, Level 1 (pre-reply) only. NOTE: this
#              #   replaces the old {opening[],followup[]} shape - the old
#              #   "followup" bucket is superseded by message_2.key_phrases.
#              style_examples:{ <same keys as the research breakdowns:
#              #   tone, hook_type, reason_to_connect, opener_type, question_type,
#              #   message_type, message_variation, message_length, readability, day_of_week,
#              #   time_of_day, day_time, by_connections, total_messages,
#              #   audience_seniority, audience_org_type, bdr_performance, ai_feel,
#              #   company_vs_prospect> }
#              #   each dim -> [{level, n, reply_rate, meeting_rate, examples[
#              #     {contact,title,company,outcome,opportunity,message}]}]
#              #   level matches that table's key: rate tables=level, ai_feel=
#              #   string(ai_score), company_vs_prospect=bucket
#   message_2:      <content_block>,  # "3 different models" - EVERYTHING sent
#              #   between the prospect's 1st and 2nd reply, as its own fully
#              #   independent analysis (see Sections 2-9). Population =
#              #   has_msg2==1 rows only (n_eligible_rows). Outcome = scheduled
#              #   only (replied is trivially 1 for this population).
#   message_3plus:  <content_block>,  # everything sent after the prospect's
#              #   2nd reply. Population = has_msg3==1 rows only
#              #   (n_eligible_rows). Outcome = scheduled only.
#              # <content_block> = { n, n_eligible_rows, keys:{working[],not_working[]},
#              #   company_vs_prospect, ai_feel, reason_to_connect, personal_sharing,
#              #   exclamation_use, emoji_use, abbreviation_use, hook_type, tone,
#              #   question_type, opener_type, message_length, readability,
#              #   top_phrases:{working[],not_working[]}, key_phrases:[...],
#              #   style_examples:{...} } - same shapes as the Level-1 fields
#              #   above, just scoped to that level's population/outcome.
#              #   connect_phrasing + the non-content breakdowns (timing,
#              #   audience, bdr_performance, by_connections/total_messages,
#              #   followup) are NOT repeated here - see research above.
#   examples:{ meetings_won[], high_potential_open[] },
#   message_prompt: string   # AI-written prompt (Opus) that tells a downstream
#              #   message-writing AI how to compose new outreach tuned to this
#              #   segment's keys to success. Only on sufficient_data segments
#              #   when CFG$build_prompts is TRUE.
# }
# ==============================================================================

slugify <- function(x) {
  s <- tolower(trimws(as.character(x)))
  s <- gsub("[^a-z0-9]+", "_", s); s <- gsub("^_+|_+$", "", s)
  if (!nzchar(s)) s <- "na"
  substr(s, 1, 80)
}
rnd <- function(x, d = 1) {         # vectorized; NaN/Inf -> NA
  v <- suppressWarnings(as.numeric(x)); v[is.nan(v) | is.infinite(v)] <- NA_real_; round(v, d)
}

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
DOW_ORDER <- c("Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")
TOD_ORDER <- c("Early morning (5-8a)","Morning (9-11a)","Afternoon (12-2p)",
               "Late afternoon (3-5p)","Evening (6-9p)","Overnight (10p-4a)")
DAY_TIME_ORDER <- as.vector(t(outer(DOW_ORDER,
  c("Early morning","Morning","Afternoon","Late afternoon","Evening","Overnight"), paste)))

trend_stats <- function(df) {
  if (!"send_month" %in% names(df) || all(is.na(df$send_month))) return(list())
  df %>% dplyr::filter(!is.na(send_month)) %>% dplyr::group_by(month = send_month) %>%
    dplyr::summarise(n = dplyr::n(),
                     connect_rate = rnd(100 * mean(connected), 1),
                     reply_rate   = rnd(100 * mean(replied), 1),
                     meeting_rate = rnd(100 * mean(scheduled), 2), .groups = "drop") %>%
    dplyr::arrange(month) %>% purrr::transpose()
}

followup_block <- function(df) {
  rep_df <- df[df$replied == 1, , drop = FALSE]
  if (nrow(rep_df) == 0) return(list(n_replied = 0))
  approach <- if ("fu_approach" %in% names(rep_df) && any(!is.na(rep_df$fu_approach)))
    rep_df %>% dplyr::filter(!is.na(fu_approach)) %>% dplyr::group_by(approach = fu_approach) %>%
      dplyr::summarise(n = dplyr::n(), meeting_rate = rnd(100 * mean(scheduled), 1), .groups = "drop") %>%
      dplyr::arrange(dplyr::desc(meeting_rate)) %>% purrr::transpose() else list()
  speed <- if ("bdr_followup_bucket" %in% names(rep_df) && any(!is.na(rep_df$bdr_followup_bucket)))
    rep_df %>% dplyr::filter(!is.na(bdr_followup_bucket)) %>%
      dplyr::group_by(speed = as.character(bdr_followup_bucket)) %>%
      dplyr::summarise(n = dplyr::n(), meeting_rate = rnd(100 * mean(scheduled), 1), .groups = "drop") %>%
      purrr::transpose() else list()
  reply_len <- rate_by(rep_df, "reply_len_bucket",
    level_order = c("Very short (<40)","Short (40-120)","Medium (120-300)","Long (300+)"))
  list(n_replied = nrow(rep_df), avg_reply_enthusiasm = rnd(mean(rep_df$reply_enthusiasm, na.rm = TRUE), 2),
       by_approach = approach, by_speed = speed, by_reply_length = reply_len)
}

# "Is it better to be forward with calendar links and specific times to meet,
# or hold back?" (user-requested analysis.) Two parts:
#   1. `timing` / `calendar_link_timing` / `datetime_propose_timing` - plain
#      first-occurrence-position rate tables, same shape/treatment as
#      meeting_ask_timing etc. above - answers "does WHEN you get forward
#      about scheduling matter, on its own?"
#   2. `prior_interest_at_msg2` - the controlled comparison the user actually
#      asked for: among contacts who reached message 2 (replied once, got a
#      follow-up), split by how enthusiastic that FIRST reply already was
#      (reply_enthusiasm - scored specifically on the reply immediately
#      preceding message 2, see FOLLOWUP_PROMPT, so this is an EXACT prior-
#      interest measure here, not an approximation), cross-tabbed with
#      whether the BDR shared a calendar link / specific time IN that
#      message 2 - so you can see whether being forward helps more when the
#      prospect already seemed warm, or whether it helps (or hurts) even
#      when they seemed lukewarm/cold. Scoped to message 2 specifically
#      (not message 3+) because reply_enthusiasm is only exact for the reply
#      immediately before message 2 - by message 3+ the prospect may have
#      replied again and their enthusiasm may have changed, which isn't
#      separately measured.
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

research_block <- function(df, idx) {
  focus <- if (any(!is.na(df$pct_about_prospect)))
    df %>% dplyr::filter(!is.na(pct_about_prospect)) %>%
      dplyr::mutate(bucket = as.character(cut(pct_about_prospect, c(-Inf, 25, 50, 75, Inf),
                    labels = c("0-25%","26-50%","51-75%","76-100%")))) %>%
      dplyr::group_by(bucket) %>%
      dplyr::summarise(n = dplyr::n(), reply_rate = rnd(100 * mean(replied), 1),
                       meeting_rate = rnd(100 * mean(scheduled), 2), .groups = "drop") %>%
      purrr::transpose() else list()
  ai <- if (any(!is.na(df$ai_sounding)))
    df %>% dplyr::filter(!is.na(ai_sounding)) %>% dplyr::group_by(ai_score = ai_sounding) %>%
      dplyr::summarise(n = dplyr::n(), reply_rate = rnd(100 * mean(replied), 1),
                       meeting_rate = rnd(100 * mean(scheduled), 2), .groups = "drop") %>%
      dplyr::arrange(ai_score) %>% purrr::transpose() else list()
  list(
    company_vs_prospect = list(
      avg_pct_about_prospect = rnd(mean(df$pct_about_prospect, na.rm = TRUE), 1),
      avg_pct_about_us       = rnd(mean(df$pct_about_bdr, na.rm = TRUE), 1),
      by_focus_bucket = focus),
    ai_feel = list(avg_ai_score = rnd(mean(df$ai_sounding, na.rm = TRUE), 2), by_ai_score = ai),
    reason_to_connect  = rate_by(df, "reason_to_connect"),
    personal_sharing   = rate_by(df, "personal_share",
                                 level_order = c("Unique","Generic","None")),
    connect_phrasing   = rate_by(df, "connect_phrasing"),
    exclamation_use    = rate_by(df, "exclam_use",
                                 level_order = c("None","One","Multiple (2+)")),
    emoji_use          = rate_by(df, "emoji_use",
                                 level_order = c("None","One","Multiple (2+)")),
    abbreviation_use   = rate_by(df, "uses_abbreviations",
                                 level_order = c("Uses abbreviations","No abbreviations")),
    hook_type          = rate_by(df, "msg_hook_type"),
    tone               = rate_by(df, "msg_tone"),
    question_type      = rate_by(df, "question_type"),
    opener_type        = rate_by(df, "opener_type"),
    message_type       = rate_by(df, "message_type"),
    # "No is a Yes" negative/rhetorical questions, "when do we talk about
    # ourselves", and "when do we ask for a meeting" - each rolled up to WHERE
    # in the sequence it first happens (see .first_at()/.POSITION_LEVELS),
    # given the same first-class rate_by() treatment as Tone/Hook/Reason above.
    rhetorical_question_timing = rate_by(df, "neg_q_first_at", level_order = .POSITION_LEVELS),
    about_us_timing             = rate_by(df, "about_us_first_at", level_order = .POSITION_LEVELS),
    meeting_ask_timing          = rate_by(df, "meeting_ask_first_at", level_order = .POSITION_LEVELS),
    # "Is it better to be forward with calendar links/specific times, or not?"
    # (user-requested). Three plain first-occurrence-position rate tables,
    # same shape/treatment as meeting_ask_timing etc. above, plus the
    # controlled comparison the user actually asked for - see
    # scheduling_prior_interest_block() above for its full design/rationale.
    forward_scheduling_timing  = rate_by(df, "forward_sched_first_at",    level_order = .POSITION_LEVELS),
    calendar_link_timing       = rate_by(df, "calendar_link_first_at",    level_order = .POSITION_LEVELS),
    datetime_propose_timing    = rate_by(df, "datetime_propose_first_at", level_order = .POSITION_LEVELS),
    scheduling_prior_interest  = scheduling_prior_interest_block(df),
    # Message variation (A/B test angle): only present for hypothesis groups
    # that are actually running a variation test (hypothesis_variation_label
    # is NA for everything else, so rate_by() naturally returns an empty list
    # for segments/groups with no variation testing).
    message_variation  = rate_by(df, "hypothesis_variation_label"),
    message_length     = rate_by(df, "length_bucket",
                                 level_order = c("1-25","26-50","51-75","76-100","101-125",
                                                 "126-150","151-175","176-200","201-225",
                                                 "226-250","251+")),
    readability        = rate_by(df, "fk_bucket",
                                 level_order = c("Easy (<=6)","Standard (7-9)","Advanced (10-12)","Complex (13+)")),
    day_of_week        = rate_by(df, "send_dow", level_order = DOW_ORDER),
    time_of_day        = rate_by(df, "time_of_day", level_order = TOD_ORDER),
    day_time           = rate_by(df, "day_time", level_order = DAY_TIME_ORDER),
    request_day_of_week = rate_by(df, "request_send_dow", level_order = DOW_ORDER),
    request_time_of_day = rate_by(df, "request_time_of_day", level_order = TOD_ORDER),
    request_day_time    = rate_by(df, "request_day_time", level_order = DAY_TIME_ORDER),
    by_connections     = rate_by(df, "conn_label",
                                 level_order = c("<500","500-999","1,000-2,499","2,500-4,999","5,000+")),
    total_messages     = rate_by(df, "total_messages_bucket",
                                 level_order = c("1","2","3","4-5","6-10","11+")),
    audience_seniority = rate_by(df, "contact_seniority"),
    audience_org_type  = rate_by(df, "contact_org_type"),
    bdr_performance    = rate_by(df, "bdr_name", min_n = CFG$min_arm_n),
    # NOTE: key_phrases/top_phrases are now a single Level-1 (pre-reply) phrase
    # analysis, same shape as message_2/message_3plus below (see Section 8) -
    # the old {opening[],followup[]} split is superseded by the message_2 block.
    top_phrases        = tryCatch(phrase_keys(idx, level = 1), error = function(e) list()),
    key_phrases        = tryCatch(recurring_phrases(idx, level = 1), error = function(e) list()),
    style_examples     = tryCatch(style_examples_block(df, CFG$style_examples_per_level),
                                  error = function(e) list()),
    followup           = followup_block(df))
}

# ------------------------------------------------------------------------------
# "3 DIFFERENT MODELS" - Level 2 / Level 3 research block ---------------------
# ------------------------------------------------------------------------------
# Mirrors research_block() above but restricted to the population that
# actually reached that reply round (has_msg2/has_msg3) and sourced from the
# "_lvl2"/"_lvl3"-suffixed content features (Sections 3-5) instead of the
# Level-1 legacy names. Only CONTENT breakdowns are repeated here - timing,
# audience, BDR performance, by_connections/total_messages, and the followup
# engagement block stay on the top-level `research` object (see the scope
# decisions agreed with the user) since they don't vary by message level.
# Cross-tab: does a Message-2 content choice (meeting-ask phrasing, a line
# break, a calendar link) matter MORE or LESS depending on how interested the
# prospect already seemed in their FIRST reply? (User-requested: "is it better
# to be forward regardless of how interested they seemed, or does it only
# work once interest is already high.") `dim_col` is a COLUMN NAME string
# (e.g. "meeting_ask_style_lvl2"); `dim_levels` fixes its display order;
# `field_name` becomes that dimension's own key in each output row (so the
# JSON is self-documenting, e.g. "ask_style" instead of a generic "level").
# ONLY valid for level == 2 - reply_enthusiasm is scored specifically on the
# reply immediately BEFORE message 2, an exact "prior interest right before
# this point" measure there. It is NOT a valid stand-in for "prior interest
# before message 3" (that would need the prospect's SECOND reply's
# enthusiasm, which isn't separately scored) - research_block_level() below
# only calls this for level == 2.
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

research_block_level <- function(df, idx, level) {
  sfx <- paste0("_lvl", level)
  has_col <- paste0("has_msg", level)
  keep <- !is.na(df[[has_col]]) & df[[has_col]] == 1
  sub <- df[keep, , drop = FALSE]
  sub_idx <- idx[keep]
  g <- function(col) paste0(col, sfx)
  focus_col <- g("pct_about_prospect"); ai_col <- g("ai_sounding")
  focus <- if (focus_col %in% names(sub) && any(!is.na(sub[[focus_col]])))
    sub %>% dplyr::filter(!is.na(.data[[focus_col]])) %>%
      dplyr::mutate(bucket = as.character(cut(.data[[focus_col]], c(-Inf, 25, 50, 75, Inf),
                    labels = c("0-25%","26-50%","51-75%","76-100%")))) %>%
      dplyr::group_by(bucket) %>%
      dplyr::summarise(n = dplyr::n(), meeting_rate = rnd(100 * mean(scheduled), 2), .groups = "drop") %>%
      purrr::transpose() else list()
  ai <- if (ai_col %in% names(sub) && any(!is.na(sub[[ai_col]])))
    sub %>% dplyr::filter(!is.na(.data[[ai_col]])) %>% dplyr::group_by(ai_score = .data[[ai_col]]) %>%
      dplyr::summarise(n = dplyr::n(), meeting_rate = rnd(100 * mean(scheduled), 2), .groups = "drop") %>%
      dplyr::arrange(ai_score) %>% purrr::transpose() else list()
  out <- list(
    n = nrow(sub),
    company_vs_prospect = list(
      avg_pct_about_prospect = rnd(mean(sub[[focus_col]], na.rm = TRUE), 1),
      avg_pct_about_us       = rnd(mean(sub[[g("pct_about_bdr")]], na.rm = TRUE), 1),
      by_focus_bucket = focus),
    ai_feel = list(avg_ai_score = rnd(mean(sub[[ai_col]], na.rm = TRUE), 2), by_ai_score = ai),
    reason_to_connect  = rate_by(sub, g("reason_to_connect")),
    personal_sharing   = rate_by(sub, g("personal_share"), level_order = c("Unique","Generic","None")),
    exclamation_use    = rate_by(sub, g("exclam_use"), level_order = c("None","One","Multiple (2+)")),
    emoji_use          = rate_by(sub, g("emoji_use"), level_order = c("None","One","Multiple (2+)")),
    abbreviation_use   = rate_by(sub, g("uses_abbreviations"),
                                 level_order = c("Uses abbreviations","No abbreviations")),
    hook_type          = rate_by(sub, g("msg_hook_type")),
    tone               = rate_by(sub, g("msg_tone")),
    question_type      = rate_by(sub, g("question_type")),
    opener_type        = rate_by(sub, g("opener_type")),
    # "Is it better to be forward about scheduling in the follow-up, and does
    # exactly HOW we ask matter?" (user-requested). meeting_ask_phrasing =
    # whether the meeting ask (if any) is a direct Question vs. a Statement/
    # suggestion vs. no ask at all (AI-classified, see LEVEL2_PROMPT/
    # LEVEL3_PROMPT's ASKSTYLE field). has_linebreak/shares_calendar_link =
    # simple regex structure/content flags on this same message text.
    meeting_ask_phrasing = rate_by(sub, g("meeting_ask_style"),
                                   level_order = c("Question","Statement","None")),
    has_linebreak         = rate_by(sub, g("has_linebreak"),
                                    level_order = c("Has line break","No line break")),
    shares_calendar_link  = rate_by(sub, g("calendar_link"),
                                    level_order = c("Shares calendar link","No calendar link")),
    message_length     = rate_by(sub, g("length_bucket"),
                                 level_order = c("1-25","26-50","51-75","76-100","101-125",
                                                 "126-150","151-175","176-200","201-225",
                                                 "226-250","251+")),
    readability        = rate_by(sub, g("fk_bucket"),
                                 level_order = c("Easy (<=6)","Standard (7-9)","Advanced (10-12)","Complex (13+)")),
    top_phrases        = tryCatch(phrase_keys(sub_idx, level = level), error = function(e) list()),
    key_phrases        = tryCatch(recurring_phrases(sub_idx, level = level), error = function(e) list()),
    style_examples     = tryCatch(style_examples_block_level(sub, level, CFG$style_examples_per_level),
                                  error = function(e) list()))
  # "Is it better to be forward regardless of how interested they already
  # seemed, or does forwardness only work once interest is already high?" -
  # see enthusiasm_crosstab() above for why this is Message-2-only.
  if (level == 2) {
    out$meeting_ask_phrasing_by_prior_interest <- enthusiasm_crosstab(
      sub, g("meeting_ask_style"), c("Question","Statement","None"), "ask_style")
    out$has_linebreak_by_prior_interest <- enthusiasm_crosstab(
      sub, g("has_linebreak"), c("Has line break","No line break"), "has_linebreak")
    out$shares_calendar_link_by_prior_interest <- enthusiasm_crosstab(
      sub, g("calendar_link"), c("Shares calendar link","No calendar link"), "shares_calendar_link")
  }
  out
}

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

# ------------------------------------------------------------------------------
# STYLE EXAMPLES - real messages illustrating each LEVEL of EVERY research
# breakdown, so clients can read the actual messages behind any rate table:
# heavy-AI vs low-AI, Generic vs Genuine tone, each hook/reason/audience, etc.
# ------------------------------------------------------------------------------
# Pick up to `per` example messages for one subset, best outcomes first (a meeting
# beats a reply beats a connection), then by model opportunity score.
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

# Level-assignment vector for each research dimension (aligned to df rows). The
# names MUST match the research_block keys so the site can look up examples for
# ANY breakdown as research.style_examples[<same key>]. The `level` string also
# matches that table's key: rate tables use `level`, ai_feel uses string(ai_score),
# company_vs_prospect uses `bucket`.
example_level_vectors <- function(df) {
  chr <- function(col) if (col %in% names(df)) as.character(df[[col]]) else NULL
  vs <- list(
    reason_to_connect  = chr("reason_to_connect"),
    personal_sharing   = chr("personal_share"),
    connect_phrasing   = chr("connect_phrasing"),
    exclamation_use    = chr("exclam_use"),
    emoji_use          = chr("emoji_use"),
    abbreviation_use   = chr("uses_abbreviations"),
    hook_type          = chr("msg_hook_type"),
    tone               = chr("msg_tone"),
    question_type      = chr("question_type"),
    opener_type        = chr("opener_type"),
    message_type       = chr("message_type"),
    rhetorical_question_timing = chr("neg_q_first_at"),
    about_us_timing             = chr("about_us_first_at"),
    meeting_ask_timing          = chr("meeting_ask_first_at"),
    forward_scheduling_timing   = chr("forward_sched_first_at"),
    calendar_link_timing        = chr("calendar_link_first_at"),
    datetime_propose_timing     = chr("datetime_propose_first_at"),
    message_variation  = chr("hypothesis_variation_label"),
    message_length     = chr("length_bucket"),
    readability        = chr("fk_bucket"),
    day_of_week        = chr("send_dow"),
    time_of_day        = chr("time_of_day"),
    day_time           = chr("day_time"),
    request_day_of_week = chr("request_send_dow"),
    request_time_of_day = chr("request_time_of_day"),
    request_day_time    = chr("request_day_time"),
    by_connections     = chr("conn_label"),
    total_messages     = chr("total_messages_bucket"),
    audience_seniority = chr("contact_seniority"),
    audience_org_type  = chr("contact_org_type"),
    bdr_performance    = chr("bdr_name"))
  if ("ai_sounding" %in% names(df))
    vs$ai_feel <- ifelse(is.na(df$ai_sounding), NA_character_, as.character(df$ai_sounding))
  if ("pct_about_prospect" %in% names(df))
    vs$company_vs_prospect <- as.character(cut(df$pct_about_prospect, c(-Inf, 25, 50, 75, Inf),
      labels = c("0-25%", "26-50%", "51-75%", "76-100%")))
  Filter(Negate(is.null), vs)
}

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

# "3 different models" - Level 2 / Level 3 analogues of pick_level_examples() /
# example_level_vectors() / style_examples_block(), sourced from msg2_text/
# msg3_text and the "_lvl2"/"_lvl3"-suffixed research dimensions instead of
# first_message. reply_rate is dropped from the per-level summary (trivially
# 100% for the has_msg2/has_msg3 population) - only meeting_rate is shown.
pick_level_examples_at <- function(d, per, level) {
  msg_col <- paste0("msg", level, "_text")
  d$.msg_text <- d[[msg_col]]
  d <- d[!is.na(d$.msg_text) & nzchar(d$.msg_text), , drop = FALSE]
  if (!nrow(d) || per <= 0) return(list())
  rank <- d$scheduled * 3 + d$replied * 2 + d$connected
  d <- d[order(-rank, -d$opportunity_score), , drop = FALSE]
  d <- utils::head(d, per)
  purrr::transpose(d %>% dplyr::transmute(
    contact = contact_name, title = contact_title, company = contact_company,
    outcome = dplyr::case_when(scheduled == 1 ~ "Meeting", replied == 1 ~ "Replied",
                               connected == 1 ~ "Connected", TRUE ~ "No response"),
    opportunity = rnd(opportunity_score, 1),
    message = substr(.msg_text, 1, 500)))
}

example_level_vectors_at <- function(df, level) {
  sfx <- paste0("_lvl", level)
  chr <- function(col) { c2 <- paste0(col, sfx); if (c2 %in% names(df)) as.character(df[[c2]]) else NULL }
  vs <- list(
    reason_to_connect  = chr("reason_to_connect"),
    personal_sharing   = chr("personal_share"),
    exclamation_use    = chr("exclam_use"),
    emoji_use          = chr("emoji_use"),
    abbreviation_use   = chr("uses_abbreviations"),
    hook_type          = chr("msg_hook_type"),
    tone               = chr("msg_tone"),
    question_type      = chr("question_type"),
    opener_type        = chr("opener_type"),
    meeting_ask_phrasing  = chr("meeting_ask_style"),
    has_linebreak         = chr("has_linebreak"),
    shares_calendar_link  = chr("calendar_link"),
    message_length     = chr("length_bucket"),
    readability        = chr("fk_bucket"))
  ai_col <- paste0("ai_sounding", sfx)
  if (ai_col %in% names(df))
    vs$ai_feel <- ifelse(is.na(df[[ai_col]]), NA_character_, as.character(df[[ai_col]]))
  focus_col <- paste0("pct_about_prospect", sfx)
  if (focus_col %in% names(df))
    vs$company_vs_prospect <- as.character(cut(df[[focus_col]], c(-Inf, 25, 50, 75, Inf),
      labels = c("0-25%", "26-50%", "51-75%", "76-100%")))
  Filter(Negate(is.null), vs)
}

style_examples_block_level <- function(df, level, per = 3) {
  if (per <= 0) return(list())
  vs <- example_level_vectors_at(df, level)
  out <- list()
  for (nm in names(vs)) {
    lvec <- vs[[nm]]
    keep <- !is.na(lvec)
    if (!any(keep)) next
    rows <- lapply(sort(unique(lvec[keep])), function(l) {
      sub <- df[keep & lvec == l, , drop = FALSE]
      ex  <- pick_level_examples_at(sub, per, level)
      if (!length(ex)) return(NULL)
      list(level = l, n = nrow(sub),
           meeting_rate = rnd(100 * mean(sub$scheduled), 2), examples = ex)
    })
    rows <- Filter(Negate(is.null), rows)
    if (length(rows)) out[[nm]] <- rows
  }
  out
}

# SIG now holds Level-1 signals (plain ids, e.g. "tone_genuine") AND Level-2/3
# content signals (suffixed ids, e.g. "tone_genuine_lvl2") side by side (see
# Section 5). keys_from_table() formats one subset of an already-computed
# compute_keys() table; ids_filter selects which level's signals to include so
# each level's "keys to success" ranks independently instead of all 3 levels'
# signals competing in one combined top-10.
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
keys_block <- function(df) {
  kt <- tryCatch(compute_keys(df), error = function(e) NULL)
  keys_from_table(kt, function(id) !grepl("_lvl[23]$", id))
}

# ------------------------------------------------------------------------------
# AUDIENCE PROFILE / COMPOSITION vs. GLOBAL BASELINE (user-requested: "compare
# different hypothesis groups to all others - % with X connections, % that are
# executives, etc. - I think hypothesis group plays a pretty big role in
# outcomes.") Computed generically inside build_segment() for every segment
# (client / hypothesis group / overall), but most meaningful at the hypothesis-
# group level since that's a within-client population, not an arbitrary split.
#
# Baseline = GLOBAL (every other core row in the ENTIRE dataset, across every
# client/hypothesis group - not just within the same client), per user's
# explicit choice. For "All Clients Combined" the baseline is empty by
# definition and the block is skipped.
#
# For each of the 4 dimensions (connections bucket, seniority, org type,
# executive flag) we report, per level: the group's %, the baseline's %, and
# an index (100 = same as baseline, >100 = over-represented in this group).
# We ALSO report an "expected vs. actual" decomposition per dimension: if this
# group's contacts converted at the SAME per-bucket rate as the baseline (i.e.
# "everyone else"), weighted by THIS group's own composition, what connect/
# reply/meeting rate would we expect? Comparing that to the group's ACTUAL
# rate shows how much of a group's over/under-performance is explained by WHO
# they're targeting (composition) vs. something else (messaging, handling).
# ------------------------------------------------------------------------------
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

  # Baseline per-bucket rates (the "if this group performed like everyone
  # else" lookup table), only using buckets with enough baseline n to be a
  # reasonably stable rate estimate.
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

build_segment <- function(idx, name, id = NULL) {
  df <- dat[idx, , drop = FALSE]
  # Top-of-page stats use ALL rows (surround_connections included).
  seg <- list(name = name, id = id %||% NA, funnel = funnel_stats(df), trend = trend_stats(df),
              message_type_overview = rate_by(df, "message_type"))
  # Driver analysis (keys / research / examples) EXCLUDES surround_connections.
  core_local <- which(df$is_core)
  idx_core   <- idx[core_local]
  df_core    <- df[core_local, , drop = FALSE]
  if (length(idx_core) >= CFG$min_segment_n) {
    seg$sufficient_data <- TRUE
    seg$n_driver_rows <- length(idx_core)
    # "3 different models" - one shared compute_keys() pass, split by level
    # (see keys_from_table()), plus one research_block_level() call per level
    # (Level 2/3 restricted internally to has_msg2/has_msg3 populations).
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
    # Audience composition vs. the global baseline (every other core row,
    # across every client/hypothesis group) - see audience_profile_block().
    seg$audience_profile <- tryCatch(audience_profile_block(idx_core), error = function(e) list())
  } else {
    seg$sufficient_data <- FALSE
    seg$n_driver_rows <- length(idx_core)
    seg$note <- sprintf("Only %d contacts eligible for driver analysis (min %d; surround_connections excluded).",
                        length(idx_core), CFG$min_segment_n)
  }
  seg
}

cat("Assembling payload...\n")
all_idx <- seq_len(nrow(dat))
model_quality <- list(
  n_total = nrow(dat),
  n_driver_rows = sum(dat$is_core),
  n_surround_excluded = sum(!dat$is_core),
  # "3 different models" - rf_fitted/top_drivers now also report the Level-2/3
  # "scheduled_lvl2"/"scheduled_lvl3" RF fits (see Section 6) alongside the
  # Level-1 connected/replied/scheduled fits; top_drivers already buckets by
  # `outcome`, which includes these new values automatically.
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
  # hypothesis groups within this client
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

# ==============================================================================
# SECTION 9.5 - MESSAGE-IMPROVEMENT PROMPTS (Opus via OpenRouter)
# ==============================================================================
# For every segment with enough data, compile a data brief (keys to success,
# winning research levels, and real winning example messages) and ask a strong
# model to WRITE a powerful, clear prompt that a downstream message-writing AI
# can use to compose new outreach tuned to what works for that segment. The
# generated prompt is attached to each segment as `message_prompt` (so it rides
# along in the JSON/upload) and also written to a human-readable markdown bundle.

`%0%` <- function(a, b) if (is.null(a) || length(a) == 0 || is.na(a[1])) b else a
.brief_keys <- function(items) {
  if (!length(items)) return("    (none identified at the confidence bar)")
  paste(vapply(items, function(k) sprintf(
    "    - %s | %+.1f pp on %s (with %.1f%% vs without %.1f%%, n=%s, confidence %s)",
    k$label %0% "?", as.numeric(k$effect_pp %0% NA), k$outcome %0% "?",
    as.numeric(k$rate_with %0% NA), as.numeric(k$rate_without %0% NA),
    format(k$n_with %0% NA), k$confidence %0% "?"), character(1)), collapse = "\n")
}
.brief_top <- function(tbl, metric = "reply_rate", n = 3) {
  if (!length(tbl)) return("n/a")
  vals <- vapply(tbl, function(r) as.numeric(r[[metric]] %0% NA), numeric(1))
  ns   <- vapply(tbl, function(r) as.numeric(r$n %0% 0), numeric(1))
  labs <- vapply(tbl, function(r) as.character(r$level %0% ""), character(1))
  keep <- which(!is.na(vals)); if (!length(keep)) return("n/a")
  ord  <- keep[order(-vals[keep])][seq_len(min(n, length(keep)))]
  paste(sprintf("%s (%.1f%%, n=%d)", labs[ord], vals[ord], as.integer(ns[ord])), collapse = ", ")
}
.brief_examples <- function(items, k) {
  if (!length(items)) return("    (none)")
  items <- items[seq_len(min(k, length(items)))]
  paste(vapply(items, function(e) sprintf("    - to %s (%s): \"%s\"",
    e$company %0% "?", e$title %0% "?", gsub("\\s+", " ", e$message %0% "")),
    character(1)), collapse = "\n")
}
# "3 different models" - optional one-paragraph summary of what works in the
# Level-2 (between 1st & 2nd reply) / Level-3 (after 2nd reply) follow-ups, so
# the downstream message-writing AI gets guidance on the whole conversation,
# not just the opening message. Silently omitted when that level has no
# working/not_working keys above the confidence bar (nothing reliable to say).
.brief_level <- function(blk, label) {
  if (is.null(blk) || !length(blk$keys$working) && !length(blk$keys$not_working)) return("")
  paste0(
    "\n", label, " (n=", blk$n_eligible_rows %0% blk$n %0% "?", " reached this point):\n",
    "WHAT'S WORKING:\n", .brief_keys(blk$keys$working), "\n",
    "WHAT'S NOT WORKING:\n", .brief_keys(blk$keys$not_working), "\n",
    "    - Tone: ", .brief_top(blk$tone, "meeting_rate"), "\n",
    "    - Hook/angle: ", .brief_top(blk$hook_type, "meeting_rate"), "\n")
}
segment_brief <- function(seg, client_name, group_name) {
  f <- seg$funnel; r <- seg$research
  paste0(
    "CLIENT: ", client_name, "\n",
    "TARGET (HYPOTHESIS) GROUP: ", group_name %0% "All groups", "\n",
    sprintf("VOLUME & RESULTS: n=%s contacts | connect %.1f%% | reply %.1f%% | meeting %.2f%% | blended score %.2f\n",
            format(f$n), as.numeric(f$connect_rate %0% NA), as.numeric(f$reply_rate %0% NA),
            as.numeric(f$meeting_rate %0% NA), as.numeric(f$blended_score %0% NA)),
    "\nWHAT'S WORKING (connection-controlled, shrunk effect in percentage points):\n",
    .brief_keys(seg$keys$working), "\n",
    "\nWHAT'S NOT WORKING:\n", .brief_keys(seg$keys$not_working), "\n",
    "\nHIGHEST-REPLY LEVELS BY DIMENSION:\n",
    "    - Tone: ",              .brief_top(r$tone), "\n",
    "    - Opening hook: ",      .brief_top(r$hook_type), "\n",
    "    - Reason to connect: ", .brief_top(r$reason_to_connect), "\n",
    "    - Best-performing message variation (A/B angle), if tested: ", .brief_top(r$message_variation), "\n",
    "    - Personal sharing: ",  .brief_top(r$personal_sharing), "\n",
    "    - Connect-ask phrasing: ", .brief_top(r$connect_phrasing), "\n",
    "    - Exclamation marks: ",   .brief_top(r$exclamation_use), "\n",
    "    - Emoji use: ",           .brief_top(r$emoji_use), "\n",
    "    - Abbreviations: ",       .brief_top(r$abbreviation_use), "\n",
    "    - Message length (chars): ", .brief_top(r$message_length), "\n",
    "    - Time of day (Central): ", .brief_top(r$time_of_day), "\n",
    "    - Best DAY to send the connection request (by acceptance): ", .brief_top(r$request_day_of_week, "connect_rate"), "\n",
    "    - Best TIME to send the connection request (by acceptance): ", .brief_top(r$request_time_of_day, "connect_rate"), "\n",
    "    - Company-vs-prospect focus: ", .brief_top(r$company_vs_prospect$by_focus_bucket %0% list()), "\n",
    "\nEXAMPLE MESSAGES THAT WON MEETINGS:\n", .brief_examples(seg$examples$meetings_won, CFG$prompt_examples_n), "\n",
    "\nHIGH-POTENTIAL OPEN CONVERSATIONS (connected, promising):\n",
    .brief_examples(seg$examples$high_potential_open, max(2, CFG$prompt_examples_n %/% 2)), "\n",
    "\nFOLLOW-UP MESSAGES (after the opening message, scored against getting a meeting):",
    .brief_level(seg$message_2, "MESSAGE 2 - between the prospect's 1st and 2nd reply"),
    .brief_level(seg$message_3plus, "MESSAGE 3+ - after the prospect's 2nd reply"), "\n")
}

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

if (isTRUE(CFG$build_prompts)) {
  prompt_res <- tryCatch({
    if (!exists("lamas")) stop("lamas() not loaded - source Function Code/lama.R")
    # Gather segments (overall + each client + optionally each hypothesis group).
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
      cat(sprintf("Generating %d message-improvement prompts via %s...\n",
                  length(briefs), CFG$prompt_model))
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

  # Human-readable bundle of every generated prompt.
  if (!is.null(prompt_res) && CFG$save_local_json) {
    md <- c(sprintf("# Connect message-writing prompts - run %s\n", RUN_TAG))
    for (i in seq_along(prompt_res$paths)) {
      p <- prompt_res$paths[[i]]
      hdr <- if (identical(p, "overall")) "Overall (all clients)"
             else if (length(p) == 1) payload$clients[[p[1]]]$name
             else paste0(payload$clients[[p[1]]]$name, " / ", payload$clients[[p[1]]]$hypothesis_groups[[p[2]]]$name)
      md <- c(md, sprintf("\n\n## %s\n\n", hdr), prompt_res$out[[i]] %0% "(empty)")
    }
    dir.create(CFG$local_out_dir, showWarnings = FALSE, recursive = TRUE)
    writeLines(md, file.path(CFG$local_out_dir, paste0("Connect_Message_Prompts_", RUN_TAG, ".md")),
               useBytes = TRUE)
    cat("Message-improvement prompts saved to markdown bundle.\n")
  }
}

# Recursively replace NaN/Inf/NA numerics so the JSON is clean (null leaves).
clean_json <- function(x) {
  if (is.list(x)) return(lapply(x, clean_json))
  if (is.numeric(x)) { x[is.nan(x) | is.infinite(x)] <- NA; return(x) }
  x
}
payload <- clean_json(payload)
cat(sprintf("Payload built: %d clients, %d total hypothesis-group segments.\n",
            length(clients),
            sum(vapply(client_list, function(c) length(c$hypothesis_groups), integer(1)))))

# ==============================================================================
# SECTION 9.6 - DE-IDENTIFIED ("BLINDED") COMPANY NAMES
# ==============================================================================
# Builds a second copy of the payload with every real client account name and
# every real prospect company name swapped for a stable Company_NN label (same
# company -> same label everywhere it appears: client name, example messages'
# `company` field, and prose text like the raw `message` and the AI-written
# `message_prompt`). Labels are assigned alphabetically so numbering is
# reproducible run-to-run for as long as the same set of companies appears.

# Walk the whole payload collecting every value stored under a `company` key
# (that's always a verbatim copy of contact_company - see pick()/
# pick_level_examples() above - so an exact match is safe and unambiguous).
#
# PERFORMANCE NOTE: this used to thread a single `acc` character vector through
# every recursive call across the WHOLE payload (`acc <- c(acc, ...)` at each
# hit, re-passed through every sibling/child call via the accumulator
# parameter). R vectors copy-on-grow, so appending to one accumulator that's
# shared across the entire traversal is O(N^2) in the number of `company`
# leaves found (N). With payloads this large (hundreds of segments, each with
# many example messages carrying a `company` field - easily tens of thousands
# of hits), that quadratic blowup is what actually dominates runtime (minutes
# to multiple hours), not the (already-optimized) regex de-identification
# scan below. Fixed by having each call return ONLY its own subtree's matches;
# parents combine already-small child results via unlist() instead of
# threading/re-copying one global accumulator - normal O(N) tree recursion.
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

all_real_companies <- sort(unique(c(client_display_names,
                                    collect_company_field_values(payload))))
all_real_companies <- all_real_companies[nzchar(all_real_companies)]

if (length(all_real_companies)) {
  company_deid_map <- setNames(sprintf("Company_%02d", seq_along(all_real_companies)),
                               all_real_companies)
  # Longest name first so e.g. "Acme Health System" is swapped before a
  # shorter name like "Acme" could partially match inside it.
  #
  # PERFORMANCE NOTE: the "might be embedded in a sentence" prose scan below
  # used to run against ALL of `all_real_companies` (every real client PLUS
  # every distinct `contact_company` value across all ~15k+ prospects, since
  # that LinkedIn field is often dirty/one-off text unique per contact). That
  # inflated this to 15,000+ names -> 150+ chunks -> tens of millions of
  # gregexpr() calls across every message/message_prompt/phrase leaf in the
  # payload, which is what actually hung for hours (not the exact-match hash
  # lookup below, which stays cheap and correct for ANY list size). A BDR's
  # prose essentially never types out a prospect's own (often messy) company
  # name verbatim the way it does a real client's name, so the prose scan is
  # restricted to just the handful of real client names - the exact-match
  # hash lookup (`company_deid_map`, built from the FULL `all_real_companies`
  # just below) still redacts every prospect company value exactly wherever
  # it appears verbatim in a `company`/`name` field, unaffected by this.
  prose_scan_candidates <- sort(unique(client_display_names))
  prose_scan_candidates <- prose_scan_candidates[nzchar(prose_scan_candidates)]
  company_sub_order <- prose_scan_candidates[order(nchar(prose_scan_candidates), decreasing = TRUE)]

  # `contact_company` is sometimes dirty (LinkedIn's "current position" field
  # can carry a whole title+employer blurb instead of a clean name, e.g.
  # "Vice President, Chief Medical Officer at Warren Clinic, Inc., a part of
  # Saint Francis Health System"). Those long values are still fully redacted
  # wherever they appear as the EXACT company/client field value (the hash
  # lookup below always covers every entry regardless of length) - they're
  # just excluded from the "might be embedded in a sentence" regex scan below,
  # both because a value that long/specific is exceedingly unlikely to recur
  # verbatim inside another string, and because folding hundreds of such long
  # strings into one alternation can exceed PCRE's compiled-pattern size
  # limit ("regular expression is too large"). (In practice this rarely
  # trims anything now that the candidate list above is already just the
  # real client names, but it's kept as a safety net.)
  MAX_PROSE_SCAN_LEN <- 80
  prose_scan_names <- company_sub_order[nchar(company_sub_order) <= MAX_PROSE_SCAN_LEN]

  # Even after that filter, hundreds/thousands of names in ONE alternation can
  # still blow PCRE's pattern-size limit (and gets slower to match per call).
  # Build the alternation in fixed-size CHUNKS instead - a handful of regex
  # passes per string, each bounded in size, rather than one unbounded one.
  # Chunking preserves the longest-first order (chunk 1 has the longest
  # eligible names) so cross-chunk substring collisions still favor the
  # longer/more specific name.
  PROSE_CHUNK_SIZE <- 100
  prose_chunks <- list()
  if (length(prose_scan_names)) {
    chunk_id <- ceiling(seq_along(prose_scan_names) / PROSE_CHUNK_SIZE)
    prose_chunks <- lapply(split(prose_scan_names, chunk_id), function(nms) {
      esc <- vapply(nms, function(nm) gsub("([\\^$.|?*+()\\[\\]{}])", "\\\\\\1", nm, perl = TRUE),
                   character(1))
      # Lookaround (not \b) so a name ending/starting in punctuation (e.g. a
      # trailing ")") still matches when followed/preceded by whitespace -
      # \b would silently fail there since neither side is a "word" char.
      list(pattern = paste0("(?i)(?<![A-Za-z0-9])(", paste(esc, collapse = "|"), ")(?![A-Za-z0-9])"),
          lookup_lower = tolower(nms),
          labels       = unname(company_deid_map[nms]))
    })
  }

  # The payload is mostly rate tables, counts, and category labels (tone,
  # hook type, day-of-week, etc.) that can NEVER contain a company name as a
  # substring - only ever as a verbatim, exact field value (handled by the
  # cheap hash lookup below). Scanning EVERY leaf string in the whole payload
  # against every company name (the previous approach) turned a payload with
  # a few hundred companies and tens of thousands of leaves into tens of
  # millions of regex calls, which is what hung for hours. Only the handful
  # of genuine free-text fields need the expensive embedded-mention scan.
  PROSE_FIELDS <- c("message", "message_prompt", "phrase")

  # Recursively swap every leaf, tracking the parent key so we know whether a
  # leaf is a candidate for the free-text scan. An EXACT match (the
  # `company`/client `name` fields, which are verbatim copies) is always a
  # fast direct lookup regardless of key.
  deidentify_company_names <- function(x, key = NA_character_) {
    if (is.list(x)) {
      nms <- names(x); if (is.null(nms)) nms <- rep(NA_character_, length(x))
      out <- vector("list", length(x))
      for (i in seq_along(x)) out[[i]] <- deidentify_company_names(x[[i]], nms[i])
      names(out) <- names(x)
      return(out)
    }
    if (!is.character(x) || length(x) != 1 || is.na(x) || !nzchar(x)) return(x)

    # EXACT-match branch is scoped to the two keys all_real_companies was
    # actually built from (`company` - a verbatim contact_company copy - and
    # a client's own `name`). Without this key restriction, ANY leaf string
    # ANYWHERE in the payload that happens to equal a real company/client
    # name gets swapped - e.g. a plain category label like "None" (used by
    # meeting_ask_phrasing/personal_sharing/exclamation_use/emoji_use/
    # question_type/etc.) was being mangled into "Company_NN" whenever some
    # prospect's contact_company field literally held the string "None".
    trimmed <- trimws(x)
    if (!is.na(key) && key %in% c("company", "name") && trimmed %in% names(company_deid_map))
      return(unname(company_deid_map[[trimmed]]))

    if (is.na(key) || !(key %in% PROSE_FIELDS)) return(x)

    # A handful of bounded regex passes (one per chunk) instead of either (a)
    # one unbounded alternation (can exceed PCRE's pattern-size limit) or (b)
    # a per-company loop (was O(companies) per string and dominated runtime).
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
  cat(sprintf("De-identified payload built: %d real company/client names -> Company_NN labels.\n",
              length(all_real_companies)))
} else {
  payload_deid <- payload
  company_deid_map <- character(0)
  cat("De-identification: no client/company names found to blind.\n")
}

# ==============================================================================
# SECTION 10 - PUBLISH (Firebase) + LOCAL SAVE + SUMMARY
# ==============================================================================

payload_json <- jsonlite::toJSON(payload, auto_unbox = TRUE, na = "null",
                                 null = "null", pretty = FALSE)

if (CFG$save_local_json) {
  dir.create(CFG$local_out_dir, showWarnings = FALSE, recursive = TRUE)
  local_path <- file.path(CFG$local_out_dir, paste0("Connect_Analysis_", RUN_TAG, ".json"))
  writeLines(payload_json, local_path, useBytes = TRUE)
  cat("Local JSON saved:", local_path, "\n")
}

if (CFG$save_deidentified_json) {
  dir.create(CFG$local_out_dir, showWarnings = FALSE, recursive = TRUE)
  payload_deid_json <- jsonlite::toJSON(payload_deid, auto_unbox = TRUE, na = "null",
                                        null = "null", pretty = FALSE)
  deid_path <- file.path(CFG$local_out_dir, paste0("Connect_Analysis_", RUN_TAG, "_deidentified.json"))
  writeLines(payload_deid_json, deid_path, useBytes = TRUE)
  cat("De-identified local JSON saved:", deid_path, "\n")

  if (CFG$save_company_map_csv && length(company_deid_map)) {
    map_path <- file.path(CFG$local_out_dir, paste0("Connect_Analysis_", RUN_TAG, "_company_map.csv"))
    utils::write.csv(
      data.frame(real_name = names(company_deid_map), deid_label = unname(company_deid_map),
                 stringsAsFactors = FALSE),
      map_path, row.names = FALSE)
    cat("Company name lookup (real name <-> label) saved:", map_path,
        "- keep this internal, do not send it out with the de-identified file.\n")
  }
}

# Drop the payload straight into the website repo so the page picks it up. Mirrors
# the Firebase layout: latest.json (default read), runs/<date>.json, index.json.
if (!is.null(CFG$website_dir)) {
  ok <- tryCatch({
    dir.create(CFG$website_dir, showWarnings = FALSE, recursive = TRUE)
    dir.create(file.path(CFG$website_dir, "runs"), showWarnings = FALSE, recursive = TRUE)
    writeLines(payload_json, file.path(CFG$website_dir, "latest.json"), useBytes = TRUE)
    writeLines(payload_json, file.path(CFG$website_dir, "runs", paste0(RUN_TAG, ".json")),
               useBytes = TRUE)
    # Enumerate every run present in the folder so the site's (admin) run picker
    # can populate its dropdown; newest first.
    run_files <- list.files(file.path(CFG$website_dir, "runs"), pattern = "\\.json$")
    run_dates <- sort(unique(sub("\\.json$", "", run_files)), decreasing = TRUE)
    idx_body <- jsonlite::toJSON(list(last_run = RUN_TAG,
                                      updated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
                                      runs = as.list(run_dates)),
                                 auto_unbox = TRUE)
    writeLines(idx_body, file.path(CFG$website_dir, "index.json"), useBytes = TRUE)
    TRUE
  }, error = function(e) { message("Website drop failed: ", e$message); FALSE })
  if (isTRUE(ok)) cat("Website payload written to:", CFG$website_dir,
                      "(latest.json, runs/", paste0(RUN_TAG, ".json"), ", index.json)\n")
}

# NOTE: this used to PUT straight to firebase_url (Function Code/Firebase
# functions.R's "careluminate-b5f76" project) with NO auth. That project is NOT
# the database connect/analysis_results.html or demos/analysis_results.html
# actually read from - the real one is healthcareitdatabase-default-rtdb (see
# upload_to_firebase.R's header). Publishing now goes through that script
# instead, authenticated via FIREBASE_DB_SECRET or FIREBASE_SERVICE_ACCOUNT_JSON
# (one-time setup instructions at the top of upload_to_firebase.R).
if (isTRUE(CFG$upload)) {
  tryCatch({
    if (!exists("upload_connect_analysis")) {
      uf_file <- file.path(CFG$connect_dir, "upload_to_firebase.R")
      if (!file.exists(uf_file)) stop("upload_to_firebase.R not found at ", uf_file)
      source(uf_file)
    }
    upload_connect_analysis(payload = payload, deidentified_payload = payload_deid, run_date = RUN_TAG)
  }, error = function(e) message("Firebase publish failed (non-fatal; local/website-repo JSON above still written): ", e$message))
} else {
  cat("upload = FALSE: skipped Firebase publish.\n")
}

# --- Console summary ----------------------------------------------------------
cat("\n===================== RUN SUMMARY =====================\n")
ov <- payload$overall$funnel
cat(sprintf("Overall: n=%s | connect %s%% | reply %s%% | meeting %s%% | blended %s\n",
            format(ov$n, big.mark = ","), ov$connect_rate, ov$reply_rate,
            ov$meeting_rate, ov$blended_score))
for (cl in names(client_list)) {
  f <- client_list[[cl]]$funnel
  cat(sprintf("  Client '%s': n=%s reply %s%% meeting %s%% blended %s | %d hyp groups\n",
              client_list[[cl]]$name, format(f$n, big.mark = ","),
              f$reply_rate, f$meeting_rate, f$blended_score,
              length(client_list[[cl]]$hypothesis_groups)))
}
cat("=======================================================\n")

# ==============================================================================
# SECTION 11 - CHECKPOINT (handoff to "Connect Hypothesis Optimizer.R")
# ==============================================================================
# "Connect Hypothesis Optimizer.R" runs AFTER this script and needs dat/SIG/
# payload/rf_models/rf_importance/CFG. If it's sourced in THIS SAME session
# (the normal case) it just reads these objects straight out of globalenv() -
# this checkpoint only exists so the optimizer can ALSO be re-run later,
# standalone, in a fresh session, without re-running the AI scoring / RF fit.
tryCatch({
  saver(list(dat = dat, SIG = SIG, payload = payload, rf_models = rf_models,
             rf_importance = rf_importance, CFG = CFG, RUN_TAG = RUN_TAG),
        "connect_model_checkpoint")
  cat("Checkpoint saved (dat/SIG/payload/rf_models/rf_importance/CFG) for the Hypothesis Optimizer.\n")
}, error = function(e) message("Checkpoint save failed (non-fatal): ", e$message))

cat("Connect Success Model v1 complete.\n")
