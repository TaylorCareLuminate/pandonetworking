# =============================================================================
# write_contacts_quick.R
# =============================================================================
# PURPOSE
#   Write all.cont to the SQLite contacts table WITHOUT AI-based HS matching.
#   Contacts will be visible in the app immediately.
#   Run create_contacts_crosswalk.R later to add vflok_health_system links.
#
# HOW TO RUN
#   all.cont <- loadr("vflok all conts")   # load contacts data
#   source("write_contacts_quick.R")
#
# After this runs: rebuild the Electron app:
#   cd C:/repos/HealthLuminateSiteFromLocal/public/vflok_app
#   npm run build
# =============================================================================

suppressPackageStartupMessages({
  library(DBI)
  library(RSQLite)
  library(dplyr)
})

msg <- function(...) { cat(paste0(..., "\n")); flush.console() }
sep <- function(n = 70) msg(strrep("=", n))

# ── Config ────────────────────────────────────────────────────────────────────
script_dir <- tryCatch(
  dirname(rstudioapi::getSourceEditorContext()$path),
  error = function(e) {
    tryCatch(
      dirname(normalizePath(sys.frame(1)$ofile)),
      error = function(e2) getwd()
    )
  }
)
DB_PATH <- file.path(script_dir, "database", "vflok_hospitals.db")

sep()
msg("write_contacts_quick.R")
sep()
msg("Database: ", DB_PATH)

# ── Validate ─────────────────────────────────────────────────────────────────
if (!exists("all.cont"))   stop("all.cont not found.  Run:  all.cont <- loadr('vflok all conts')")
if (!file.exists(DB_PATH)) stop("Database not found at: ", DB_PATH, "\nRun create_database.R first.")

msg("all.cont rows: ", nrow(all.cont))
msg("all.cont cols: ", paste(names(all.cont), collapse = ", "))

# ── Required columns (fill missing with NA) ──────────────────────────────────
required_cols <- c(
  "first_name", "last_name", "linkedin_url",
  "current_title", "headline", "current_company",
  "location", "job_level", "clinical_domain",
  "about", "experience_paragraph", "education_paragraph",
  "open_profile", "premium"
)

contacts_to_write <- all.cont
for (col in required_cols) {
  if (!col %in% names(contacts_to_write)) {
    contacts_to_write[[col]] <- NA_character_
    msg("  Added missing column: ", col)
  }
}

contacts_to_write <- contacts_to_write %>%
  mutate(
    vflok_health_system  = NA_character_,   # filled in later by crosswalk script
    company_match_method = NA_character_
  ) %>%
  select(all_of(c(required_cols, "vflok_health_system", "company_match_method"))) %>%
  mutate(across(where(is.logical), as.character))

msg("\nRows to write: ", nrow(contacts_to_write))

# ── Write to SQLite ───────────────────────────────────────────────────────────
msg("Connecting to database...")
con <- dbConnect(RSQLite::SQLite(), DB_PATH)
on.exit(try(dbDisconnect(con), silent = TRUE))

if (dbExistsTable(con, "contacts")) {
  dbExecute(con, "DROP TABLE contacts")
  msg("Dropped existing contacts table")
}

msg("Writing contacts table...")
dbWriteTable(con, "contacts", as.data.frame(contacts_to_write), row.names = FALSE)

msg("Creating indexes...")
dbExecute(con, "CREATE INDEX IF NOT EXISTS idx_contacts_hs      ON contacts(vflok_health_system)")
dbExecute(con, "CREATE INDEX IF NOT EXISTS idx_contacts_level   ON contacts(job_level)")
dbExecute(con, "CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(current_company)")

n_total <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM contacts")$n
sep()
msg("Done!  ", n_total, " contacts written to database")
msg("vflok_health_system is NULL for all rows (no matching done yet).")
msg("")
msg("Next steps:")
msg("  1. Rebuild the app:  npm run build")
msg("  2. For HS linking:   run create_contacts_crosswalk.R")
sep()

dbDisconnect(con)
