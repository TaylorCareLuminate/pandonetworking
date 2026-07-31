# =============================================================================
# create_contacts_crosswalk.R
# =============================================================================
# PURPOSE
#   1. Build a crosswalk: all.cont$current_company  →  vflok_health_system
#      using the same exact → gemini+lama → CMS-fallback pipeline.
#   2. Join the crosswalk to all.cont and write a `contacts` table into the
#      existing vflok_hospitals.db SQLite database.
#
# !! HOW TO RUN !!
#   Do NOT copy-paste — use source() so output appears in real time:
#
#   resume_from_step <- 1
#   source("C:/repos/HealthLuminateSiteFromLocal/public/vflok_app/create_contacts_crosswalk.R")
#
#   Or open the file in RStudio and click the SOURCE button (top-right of editor).
#
# PREREQUISITES
#   • all.cont loaded:   all.cont <- loadr("vflok all conts")
#   • hs_upload loaded   (run create_database.R first, or load manually)
#   • SQLite database exists at:  database/vflok_hospitals.db
#   • Custom helpers available:   geminis(), lama.batch(), fuzzy.match()
#
# MANUAL OVERRIDES (between Step 1 and Step 2)
#   crosswalk$hs_name_proposed[crosswalk$csv_name == "Acme Health"] <- "Correct HS Name"
#   crosswalk$match_method[crosswalk$csv_name     == "Acme Health"] <- "manual"
#   resume_from_step <- 2
#   source("create_contacts_crosswalk.R")
# =============================================================================

suppressPackageStartupMessages({
  library(DBI)
  library(RSQLite)
  library(dplyr)
})

# ── Helper: always-visible output ─────────────────────────────────────────────
# cat() goes to stdout which flushes immediately; message() can be buffered.
msg <- function(...) {
  cat(paste0(..., "\n"))
  flush.console()
}
sep <- function(char = "=", n = 80) msg(strrep(char, n))

# ── Config ────────────────────────────────────────────────────────────────────
script_dir <- tryCatch(
  dirname(rstudioapi::getSourceEditorContext()$path),
  error = function(e) dirname(normalizePath(sys.frame(1)$ofile))
)
DB_PATH        <- file.path(script_dir, "database", "vflok_hospitals.db")
SAVE_CROSSWALK <- "vflok_contacts_crosswalk"
SAVE_MATCHED   <- "vflok_contacts_matched"

msg("Database path: ", DB_PATH)

if (!exists("resume_from_step")) resume_from_step <- 1
msg("resume_from_step = ", resume_from_step)

if (resume_from_step > 2) {
  stop(paste0(
    "resume_from_step is ", resume_from_step, " — nothing to do (valid values: 1 or 2).\n",
    "To start fresh:         resume_from_step <- 1\n",
    "To skip to DB write:    resume_from_step <- 2\n",
    "Then re-run source()."
  ))
}

# ── Validate inputs ───────────────────────────────────────────────────────────
if (!exists("all.cont"))   stop("all.cont not found.  Run:  all.cont <- loadr('vflok all conts')")
if (!exists("hs_upload"))  stop("hs_upload not found. Load it before running this script.")
if (!file.exists(DB_PATH)) stop(paste("Database not found at:", DB_PATH, "\nRun create_database.R first."))

# ── Health system name list (target) ─────────────────────────────────────────
hs_names <- unique(na.omit(trimws(hs_upload$vflok_health_system)))
hs_names <- hs_names[nzchar(hs_names)]
msg("Target vFlok health system database: ", length(hs_names), " unique names")

# =============================================================================
# STEP 1 — Build crosswalk: company name → vflok_health_system
# =============================================================================
if (resume_from_step <= 1) {

  sep(); msg("STEP 1: Matching contact company names to vFlok health system database"); sep()

  # ── Unique company names from contacts ────────────────────────────────────
  company_names <- unique(na.omit(trimws(all.cont$current_company)))
  company_names <- company_names[nzchar(company_names)]
  msg("Unique company names in all.cont: ", length(company_names))

  crosswalk <- data.frame(
    csv_name         = company_names,
    hs_name_proposed = NA_character_,
    match_method     = NA_character_,
    stringsAsFactors = FALSE
  )

  # ════════════════════════════════════════════════════════════════════════════
  # Pre-check: exact matches (case-insensitive)
  # ════════════════════════════════════════════════════════════════════════════
  msg("\n--- Pre-check: exact name matches ---")
  hs_names_lower <- tolower(trimws(hs_names))

  for (i in seq_len(nrow(crosswalk))) {
    idx <- which(hs_names_lower == tolower(crosswalk$csv_name[i]))
    if (length(idx) >= 1) {
      crosswalk$hs_name_proposed[i] <- hs_names[idx[1]]
      crosswalk$match_method[i]     <- "exact"
    }
  }

  n_exact   <- sum(crosswalk$match_method == "exact", na.rm = TRUE)
  n_need_ai <- sum(is.na(crosswalk$match_method))
  msg("  Exact matches (no AI needed): ", n_exact)
  msg("  Need gemini + lama pipeline:  ", n_need_ai)

  needs_ai <- crosswalk %>% filter(is.na(match_method))

  if (nrow(needs_ai) > 0) {

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 1 — geminis: collect alternative names for unmatched companies
    # ══════════════════════════════════════════════════════════════════════════
    msg("\n--- Stage 1: geminis — alternative names for ", nrow(needs_ai), " unmatched companies ---")

    alt_queries <- paste0(
      "List every name that the US health system or hospital organization '",
      needs_ai$csv_name, "' is known by. ",
      "Include: the full official legal name, common abbreviations, former names, ",
      "parent health system, subsidiary or member hospital names that share the brand, ",
      "and any other names a database might use. ",
      "Return ONLY a pipe-separated list of names, no explanations. ",
      "Example format:  Name One | Name Two | Former Name | Abbrev"
    )

    alt_raw <- geminis(alt_queries)

    needs_ai$alt_names <- lapply(seq_along(alt_raw), function(i) {
      pieces <- trimws(unlist(strsplit(alt_raw[i], "[|\\n]")))
      pieces <- pieces[nzchar(pieces) & nchar(pieces) <= 80]
      unique(c(needs_ai$csv_name[i], pieces))
    })

    msg("Stage 1 complete. Average alternatives per company: ",
        round(mean(sapply(needs_ai$alt_names, length)), 1))

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 2 — fuzzy.match across all alternative names
    # ══════════════════════════════════════════════════════════════════════════
    msg("\n--- Stage 2: fuzzy matching against vFlok health system database ---")

    FUZZY_THRESHOLD <- 72
    MAX_CANDIDATES  <- 8

    match_data <- bind_rows(lapply(seq_len(nrow(needs_ai)), function(i) {
      if (i %% 50 == 0) { msg("  fuzzy progress: ", i, " / ", nrow(needs_ai)) }
      alts <- needs_ai$alt_names[[i]]

      score_matrix <- sapply(alts, function(a) fuzzy.match(a, hs_names))
      if (is.vector(score_matrix)) score_matrix <- matrix(score_matrix, ncol = 1)
      best_scores <- apply(score_matrix, 1, max)

      above <- which(best_scores >= FUZZY_THRESHOLD)
      if (length(above) == 0) {
        above <- order(best_scores, decreasing = TRUE)[seq_len(min(5, length(best_scores)))]
      }
      top_idx <- above[order(best_scores[above], decreasing = TRUE)][
        seq_len(min(MAX_CANDIDATES, length(above)))
      ]

      top_names  <- hs_names[top_idx]
      top_scores <- round(best_scores[top_idx])

      numbered_text <- paste(seq_along(top_names),
                             paste0(top_names, "  (score: ", top_scores, ")"),
                             sep = ". ", collapse = "\n")

      data.frame(
        csv_name        = needs_ai$csv_name[i],
        alt_names_used  = paste(alts, collapse = " | "),
        n_candidates    = length(top_names),
        best_score      = max(best_scores),
        candidates_text = numbered_text,
        candidates_pipe = paste(top_names, collapse = "|||"),
        stringsAsFactors = FALSE
      )
    }))

    msg("Stage 2 complete.  Mean best score: ", round(mean(match_data$best_score), 1),
        "  |  >= 90: ",  sum(match_data$best_score >= 90),
        "  |  72-89: ",  sum(match_data$best_score >= 72 & match_data$best_score < 90),
        "  |  < 72: ",   sum(match_data$best_score < 72))

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 3 — lama.batch: pick the correct candidate by number
    # ══════════════════════════════════════════════════════════════════════════
    msg("\n--- Stage 3: lama.batch — selecting best match by number ---")

    match_data$lama_number <- lama.batch(
      inputs.df = match_data,
      text = paste0(
        "A contact database refers to a US health system or hospital as: '[csv_name]'\n",
        "(it may also be known as: [alt_names_used])\n\n",
        "Which of the following entries from our internal health system database is the ",
        "SAME organization?\n\n",
        "[candidates_text]\n\n",
        "Reply with ONLY the number of the correct match (e.g. 1, 2, 3...). ",
        "If none of them is the same organization, reply with 0. ",
        "Reply with a single digit only — no words, no explanation."
      ),
      partial_save_file = "vflok_contacts_lama_progress.rds"
    )

    msg("lama.batch complete")

    # ── Resolve number → hs name ──────────────────────────────────────────────
    match_data$hs_name_proposed <- sapply(seq_len(nrow(match_data)), function(i) {
      n_str <- regmatches(trimws(match_data$lama_number[i]),
                          regexpr("[0-9]+", trimws(match_data$lama_number[i])))
      if (length(n_str) == 0) return(NA_character_)
      n <- as.integer(n_str)
      if (is.na(n) || n == 0) return(NA_character_)
      cands <- trimws(unlist(strsplit(match_data$candidates_pipe[i], "\\|\\|\\|")))
      if (n >= 1 && n <= length(cands)) return(cands[n])
      NA_character_
    })
    match_data$match_method <- "gemini+lama"

    # Merge AI results back into crosswalk
    for (i in seq_len(nrow(match_data))) {
      row_idx <- which(crosswalk$csv_name == match_data$csv_name[i])
      if (length(row_idx) == 1) {
        crosswalk$hs_name_proposed[row_idx] <- match_data$hs_name_proposed[i]
        crosswalk$match_method[row_idx]     <- match_data$match_method[i]
      }
    }

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 4 — CMS ID fallback for still-unmatched rows
    # ══════════════════════════════════════════════════════════════════════════
    still_unmatched_idx <- which(is.na(crosswalk$hs_name_proposed))

    if (length(still_unmatched_idx) > 0) {
      msg("\n--- Stage 4: CMS ID fallback for ", length(still_unmatched_idx), " still-unmatched companies ---")

      unmatched_names <- crosswalk$csv_name[still_unmatched_idx]

      cms_queries <- paste0(
        "What are the CMS provider IDs (6-digit Medicare certification numbers) ",
        "for hospitals in the health system '", unmatched_names, "'? ",
        "List only the 6-digit numeric IDs separated by commas, nothing else."
      )

      cms_raw <- geminis(cms_queries)

      con_cms <- dbConnect(RSQLite::SQLite(), DB_PATH)
      on.exit(try(dbDisconnect(con_cms), silent = TRUE), add = TRUE)

      for (j in seq_along(still_unmatched_idx)) {
        row_idx  <- still_unmatched_idx[j]
        csv_nm   <- crosswalk$csv_name[row_idx]
        raw_text <- cms_raw[j]

        id_matches <- regmatches(raw_text, gregexpr("\\b[0-9]{6}\\b", raw_text))[[1]]
        ids_found  <- suppressWarnings(as.integer(id_matches))
        ids_found  <- ids_found[!is.na(ids_found)]

        if (length(ids_found) == 0) {
          msg("  [", csv_nm, "] -> no CMS IDs found")
          next
        }

        hosp_lookup <- tryCatch(
          dbGetQuery(con_cms, sprintf(
            "SELECT vflok_health_system FROM hospitals
             WHERE CAST(cms_provider_id AS INTEGER) IN (%s)
             AND vflok_health_system IS NOT NULL AND TRIM(vflok_health_system) != ''",
            paste(ids_found, collapse = ",")
          )),
          error = function(e) data.frame(vflok_health_system = character())
        )

        hs_found <- unique(na.omit(trimws(hosp_lookup$vflok_health_system)))
        hs_found <- hs_found[nzchar(hs_found)]

        if (length(hs_found) == 0) {
          msg("  [", csv_nm, "] -> CMS IDs not found in database")
          next
        }

        exact_hit <- hs_found[hs_found %in% hs_names]
        if (length(exact_hit) >= 1) {
          crosswalk$hs_name_proposed[row_idx] <- exact_hit[1]
          crosswalk$match_method[row_idx]     <- "cms_lookup"
          msg("  [", csv_nm, "] -> '", exact_hit[1], "'  (CMS exact)")
          next
        }

        all_scores <- sapply(hs_found, function(n) max(fuzzy.match(n, hs_names)))
        if (max(all_scores) >= 85) {
          best_found <- hs_found[which.max(all_scores)]
          best_in_db <- hs_names[which.max(fuzzy.match(best_found, hs_names))]
          crosswalk$hs_name_proposed[row_idx] <- best_in_db
          crosswalk$match_method[row_idx]     <- "cms_lookup+fuzzy"
          msg("  [", csv_nm, "] -> '", best_in_db, "'  (CMS+fuzzy)")
          next
        }

        msg("  [", csv_nm, "] -> still unmatched  (DB hs names: ", paste(hs_found, collapse = " | "), ")")
      }

      dbDisconnect(con_cms)
    }

  } else {
    msg("\nAll companies matched exactly — skipping AI stages.")
    match_data <- data.frame()
  }

  # ── Final summary ─────────────────────────────────────────────────────────
  n_matched   <- sum(!is.na(crosswalk$hs_name_proposed))
  n_unmatched <- sum(is.na(crosswalk$hs_name_proposed))

  sep()
  msg("CROSSWALK RESULTS: ", n_matched, " / ", nrow(crosswalk), " company names matched")
  msg("  Exact:       ", n_exact)
  msg("  gemini+lama: ", sum(crosswalk$match_method == "gemini+lama", na.rm = TRUE))
  msg("  CMS:         ", sum(grepl("cms", crosswalk$match_method, ignore.case = TRUE), na.rm = TRUE))
  msg("  Unmatched:   ", n_unmatched)
  sep()

  unmatched_rows <- crosswalk %>% filter(is.na(hs_name_proposed))
  if (nrow(unmatched_rows) > 0) {
    msg("\nUNMATCHED (", nrow(unmatched_rows), " rows) — review before proceeding:")
    print(as.data.frame(unmatched_rows[, "csv_name", drop = FALSE]), row.names = FALSE)
    msg("\nTo fix manually:")
    msg("  crosswalk$hs_name_proposed[crosswalk$csv_name == 'Name'] <- 'Correct HS Name'")
    msg("  crosswalk$match_method[crosswalk$csv_name     == 'Name'] <- 'manual'")
    msg("  resume_from_step <- 2")
    msg("  source('create_contacts_crosswalk.R')")
  }

  saver(crosswalk, SAVE_CROSSWALK)
  msg("\nCrosswalk saved to: ", SAVE_CROSSWALK)

  if (n_unmatched > 0) {
    msg("\n*** REVIEW UNMATCHED ROWS ABOVE, then re-run with resume_from_step <- 2 ***")
  } else {
    msg("\nAll matched — proceeding automatically to Step 2...")
  }
}

# =============================================================================
# STEP 2 — Join crosswalk to contacts and write `contacts` table to SQLite
# =============================================================================
if (resume_from_step <= 2) {

  sep(); msg("STEP 2: Joining crosswalk to contacts and writing to database"); sep()

  if (!exists("crosswalk")) {
    msg("Loading saved crosswalk from file...")
    crosswalk <- loadr(SAVE_CROSSWALK)
  }

  contacts_matched <- all.cont %>%
    left_join(
      crosswalk %>% rename(current_company = csv_name),
      by = "current_company"
    ) %>%
    rename(
      vflok_health_system  = hs_name_proposed,
      company_match_method = match_method
    )

  n_with_hs <- sum(!is.na(contacts_matched$vflok_health_system))
  msg("Contacts total:            ", nrow(contacts_matched))
  msg("With matched health system: ", n_with_hs,
      "  (", round(100 * n_with_hs / nrow(contacts_matched)), "%)")

  # ── Write to SQLite ────────────────────────────────────────────────────────
  msg("\nConnecting to database...")
  con <- dbConnect(RSQLite::SQLite(), DB_PATH)
  on.exit(try(dbDisconnect(con), silent = TRUE), add = TRUE)

  if (dbExistsTable(con, "contacts")) {
    dbExecute(con, "DROP TABLE contacts")
    msg("Dropped existing contacts table")
  }

  contacts_to_write <- contacts_matched %>%
    select(
      first_name, last_name, linkedin_url,
      current_title, headline, current_company,
      vflok_health_system, company_match_method,
      location, job_level, clinical_domain,
      about, experience_paragraph, education_paragraph,
      open_profile, premium
    ) %>%
    mutate(across(where(is.logical), as.character))

  msg("Writing ", nrow(contacts_to_write), " rows to contacts table...")
  dbWriteTable(con, "contacts", as.data.frame(contacts_to_write), row.names = FALSE)

  msg("Creating indexes...")
  dbExecute(con, "CREATE INDEX IF NOT EXISTS idx_contacts_hs      ON contacts(vflok_health_system)")
  dbExecute(con, "CREATE INDEX IF NOT EXISTS idx_contacts_level   ON contacts(job_level)")
  dbExecute(con, "CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(current_company)")

  n_total <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM contacts")$n
  n_linked <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM contacts WHERE vflok_health_system IS NOT NULL AND vflok_health_system != ''")$n
  n_exec   <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM contacts WHERE job_level = 'EXECUTIVE'")$n
  n_dir    <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM contacts WHERE job_level = 'DIRECTOR'")$n

  sep()
  msg("contacts table written to: ", DB_PATH)
  msg("  Total rows:          ", n_total)
  msg("  Linked to vFlok HS:  ", n_linked, "  (", round(100 * n_linked / n_total), "%)")
  msg("  Executives:          ", n_exec)
  msg("  Directors:           ", n_dir)
  sep()

  # Job level breakdown
  jl <- dbGetQuery(con, "SELECT job_level, COUNT(*) AS n FROM contacts GROUP BY job_level ORDER BY n DESC")
  msg("Job level breakdown:")
  for (r in seq_len(nrow(jl))) msg("  ", jl$job_level[r], ": ", jl$n[r])

  dbDisconnect(con)

  saver(contacts_matched, SAVE_MATCHED)
  msg("\nMatched contacts saved to: ", SAVE_MATCHED)
  msg("\nDONE! Now rebuild the Electron app:")
  msg("  cd 'C:/repos/HealthLuminateSiteFromLocal/public/vflok_app'")
  msg("  npm run build")
}
