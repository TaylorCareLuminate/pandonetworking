#!/usr/bin/env Rscript
# upload_to_firebase.R
#
# Pushes a Connect Success Model run straight to Firebase Realtime Database —
# no file written to the repo, nothing to `git commit`/push, no 100MB limit.
#
# WHY THIS EXISTS
# ----------------
# connect/analysis_results.html and demos/analysis_results.html both already
# know how to read live data from Firebase (see connect_analysis_ingestion_spec.md
# §2 — "production should read live from Firebase"). Up to now the pipeline instead
# wrote Connect_Analysis_<date>.json / _deidentified.json to this folder and those
# got committed to git as a local fallback. That export has grown from ~33MB in
# August to ~92MB in October and WILL cross GitHub's hard 100MB-per-file limit on
# a future run (it already has at least once) — this is the fix.
#
# After this change, this folder only needs the 2 newest dated exports for local
# dev (regenerate_manifest.js now auto-prunes to that), and the real, full-size
# weekly runs live exclusively in Firebase.
#
# WHAT IT WRITES
# --------------
# Real (client-identified) data   -> ConnectAnalysis/latest
#                                     ConnectAnalysis/runs/<run_date>
#                                     ConnectAnalysis/index/<run_date>
# De-identified data (optional)   -> ConnectAnalysisDeidentified/latest
#                                     ConnectAnalysisDeidentified/runs/<run_date>
#                                     ConnectAnalysisDeidentified/index/<run_date>
#
# Both live in the same Realtime Database the site already reads from:
#   https://healthcareitdatabase-default-rtdb.firebaseio.com
# (this is the project connect/analysis_results.html and demos/analysis_results.html
# connect to via window.database, initialized in js/auth.js).
#
# HOW TO WIRE THIS INTO THE EXISTING PIPELINE
# --------------------------------------------
# In "Connect Success Model v1.R", right after you build the `payload` list (the
# same R list you currently pass to jsonlite::write_json() to produce
# Connect_Analysis_<date>.json) and, if you build one, `deidentified_payload`:
#
#   source("upload_to_firebase.R")
#   upload_connect_analysis(
#     payload             = payload,
#     deidentified_payload = deidentified_payload,   # optional — omit/NULL to skip
#     run_date            = meta$run_date             # "YYYY-MM-DD", same as payload$meta$run_date
#   )
#
# You can keep writing the local dated JSON files too (regenerate_manifest.js will
# prune old ones automatically) — this script is purely additive. Or stop writing
# the real (non-deidentified) ones entirely once you're comfortable relying on
# Firebase; demos/analysis_results.html still needs its local de-identified
# fallback file, see its own Firebase-fallback note for why that one still gets
# written locally too.
#
# ONE-TIME SETUP — pick ONE auth method
# ---------------------------------------
# Option A — Database secret (simplest; a handful of lines, no extra packages):
#   1. Firebase console → project "healthcareitdatabase" → gear icon → Project
#      settings → Service accounts tab → Database secrets → "Show"/"Add secret".
#      (If that tab isn't visible, the project doesn't have legacy secrets enabled
#      — use Option B instead.)
#   2. Set it as an environment variable, do NOT hardcode it in this script or
#      commit it anywhere:
#        Sys.setenv(FIREBASE_DB_SECRET = "paste-the-secret-here")
#      or put FIREBASE_DB_SECRET=... in a local .Renviron (already covered by
#      this repo's .gitignore pattern for *.env / secrets, but .Renviron itself
#      is NOT currently ignored — keep it outside the repo, e.g. in your home
#      directory, to be safe).
#
# Option B — Service account (more robust / standard for server-side jobs):
#   1. Firebase console → project "healthcareitdatabase" → gear icon → Project
#      settings → Service accounts tab → "Generate new private key" → save the
#      JSON file somewhere OUTSIDE this repo (this repo's .gitignore already
#      blocks `service-account*.json` as a safety net, but don't rely on that).
#   2. Make sure that service account has a role that can write to Realtime
#      Database for this project (e.g. "Firebase Realtime Database Admin", or
#      broader "Editor"/"Owner" if that's already how your other service
#      accounts are set up) — IAM admin console for the "healthcareitdatabase"
#      project.
#   3. Set the path to it as an environment variable:
#        Sys.setenv(FIREBASE_SERVICE_ACCOUNT_JSON = "C:/secure/path/healthcareitdatabase-sa.json")
#
# Requires: httr2, jsonlite. For Option B also: openssl (for RS256 JWT signing).
#   install.packages(c("httr2", "jsonlite", "openssl"))

suppressPackageStartupMessages({
  library(httr2)
  library(jsonlite)
})

FIREBASE_DB_URL <- "https://healthcareitdatabase-default-rtdb.firebaseio.com"

# ── Auth: get a usable query string / header for REST calls ────────────────

.firebase_auth <- function() {
  secret <- Sys.getenv("FIREBASE_DB_SECRET", unset = NA)
  if (!is.na(secret) && nzchar(secret)) {
    return(list(mode = "secret", secret = secret))
  }

  sa_path <- Sys.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", unset = NA)
  if (!is.na(sa_path) && nzchar(sa_path) && file.exists(sa_path)) {
    return(list(mode = "service_account", token = .firebase_service_account_token(sa_path)))
  }

  stop(
    "No Firebase credentials found. Set FIREBASE_DB_SECRET or ",
    "FIREBASE_SERVICE_ACCOUNT_JSON — see the setup instructions at the top of ",
    "upload_to_firebase.R."
  )
}

# Exchanges a service-account JSON key for a short-lived OAuth2 access token via
# a signed JWT assertion (the standard Google server-to-server auth flow).
.firebase_service_account_token <- function(sa_path) {
  if (!requireNamespace("openssl", quietly = TRUE)) {
    stop("Package 'openssl' is required for the service-account auth method. ",
         "Run install.packages('openssl'), or use FIREBASE_DB_SECRET instead.")
  }

  sa <- jsonlite::fromJSON(sa_path)
  now <- as.integer(Sys.time())

  b64url <- function(raw) {
    s <- jsonlite::base64enc(raw)
    s <- gsub("\\+", "-", s)
    s <- gsub("/", "_", s)
    sub("=+$", "", s)
  }

  header <- list(alg = "RS256", typ = "JWT")
  claim <- list(
    iss   = sa$client_email,
    scope = "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud   = "https://oauth2.googleapis.com/token",
    iat   = now,
    exp   = now + 3600L
  )

  header_b64 <- b64url(charToRaw(jsonlite::toJSON(header, auto_unbox = TRUE)))
  claim_b64  <- b64url(charToRaw(jsonlite::toJSON(claim, auto_unbox = TRUE)))
  unsigned   <- paste(header_b64, claim_b64, sep = ".")

  key <- openssl::read_key(charToRaw(sa$private_key))
  sig <- openssl::signature_create(charToRaw(unsigned), hash = openssl::sha256, key = key)
  jwt <- paste(unsigned, b64url(sig), sep = ".")

  resp <- httr2::request("https://oauth2.googleapis.com/token") |>
    httr2::req_body_form(
      grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion  = jwt
    ) |>
    httr2::req_perform() |>
    httr2::resp_body_json()

  resp$access_token
}

# ── Low-level PUT to a Realtime Database path ───────────────────────────────

.firebase_put <- function(rtdb_path, body, auth) {
  url <- paste0(FIREBASE_DB_URL, "/", rtdb_path, ".json")
  req <- httr2::request(url) |> httr2::req_method("PUT")

  if (auth$mode == "secret") {
    req <- httr2::req_url_query(req, auth = auth$secret)
  } else {
    req <- httr2::req_headers(req, Authorization = paste("Bearer", auth$token))
  }

  req <- httr2::req_body_json(req, body, auto_unbox = TRUE, null = "null")
  resp <- httr2::req_perform(req)

  if (httr2::resp_status(resp) >= 300) {
    stop(sprintf("Firebase PUT to %s failed (%d): %s",
                 rtdb_path, httr2::resp_status(resp), httr2::resp_body_string(resp)))
  }
  invisible(resp)
}

# ── One dataset's three writes (latest / runs/<date> / index/<date>) ───────

.upload_dataset <- function(root, payload, run_date, auth) {
  now_iso <- format(Sys.time(), "%Y-%m-%dT%H:%M:%OS0", tz = "UTC")

  message(sprintf("  → %s/latest", root))
  .firebase_put(paste0(root, "/latest"), payload, auth)

  message(sprintf("  → %s/runs/%s", root, run_date))
  .firebase_put(paste0(root, "/runs/", run_date), payload, auth)

  message(sprintf("  → %s/index/%s", root, run_date))
  .firebase_put(
    paste0(root, "/index/", run_date),
    list(last_run = run_date, updated_at = now_iso),
    auth
  )
}

# ── Public entry point ──────────────────────────────────────────────────────

#' Upload a Connect Success Model run directly to Firebase Realtime Database.
#'
#' @param payload The real (client-identified) analysis payload — the same R
#'   list you'd otherwise pass to jsonlite::write_json() for
#'   Connect_Analysis_<run_date>.json. Required.
#' @param deidentified_payload The de-identified counterpart (same shape, used
#'   by demos/analysis_results.html). Optional — pass NULL or omit to skip.
#' @param run_date "YYYY-MM-DD" string, same as payload$meta$run_date.
upload_connect_analysis <- function(payload, deidentified_payload = NULL, run_date) {
  stopifnot(is.list(payload), is.character(run_date), nchar(run_date) > 0)

  auth <- .firebase_auth()

  message(sprintf("Uploading Connect Analysis run %s to Firebase...", run_date))
  .upload_dataset("ConnectAnalysis", payload, run_date, auth)

  if (!is.null(deidentified_payload)) {
    .upload_dataset("ConnectAnalysisDeidentified", deidentified_payload, run_date, auth)
  }

  message("Done. Live at:")
  message("  connect/analysis_results.html  (reads ConnectAnalysis)")
  if (!is.null(deidentified_payload)) {
    message("  demos/analysis_results.html    (reads ConnectAnalysisDeidentified)")
  }
  invisible(TRUE)
}
