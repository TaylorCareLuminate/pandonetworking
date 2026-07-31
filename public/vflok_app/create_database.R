# ============================================================================
# vFlok Dashboard - SQLite Database Creation Script
# ============================================================================
# This script converts the R data frame 'to.upload2' to SQLite database
# for use with the Electron desktop application
#
# Prerequisites:
#   install.packages("RSQLite")
#   install.packages("DBI")
#
# Usage:
#   1. Load your data into R object: to.upload2
#   2. Run this script: source("create_database.R")
#   3. Database will be created: vflok_hospitals.db
# ============================================================================

all.cont = loadr("vflok all conts")

library(DBI)
library(RSQLite)

# Check if required data exists
if (!exists("to.upload2")) {
  stop("Error: 'to.upload2' object not found in R environment. 
  Please load your hospital data first before running this script.")
}

if (!exists("hs_upload")) {
  warning("Warning: 'hs_upload' object not found. Health system data will not be included.
  If you have health system data, load it into 'hs_upload' and run this script again.")
  has_health_systems <- FALSE
} else {
  has_health_systems <- TRUE
}

cat("Creating vFlok SQLite Database...\n")
cat("==================================\n\n")

# Database file path — always write to the database/ subfolder where the app expects it
script_dir <- tryCatch(
  dirname(rstudioapi::getSourceEditorContext()$path),
  error = function(e) getwd()
)
db_path <- file.path(script_dir, "database", "vflok_hospitals.db")

# Ensure the database directory exists
if (!dir.exists(dirname(db_path))) {
  dir.create(dirname(db_path), recursive = TRUE)
}

cat(sprintf("Database will be written to: %s\n", db_path))

# Remove existing database if it exists
if (file.exists(db_path)) {
  cat("Removing existing database...\n")
  file.remove(db_path)
}

# Create connection to SQLite database
cat("Connecting to SQLite database...\n")
con <- dbConnect(RSQLite::SQLite(), db_path)

# ============================================================================
# HOSPITALS TABLE
# ============================================================================
cat("\nCreating hospitals table...\n")

# Write the data to SQLite
dbWriteTable(con, "hospitals", to.upload2, overwrite = TRUE)

cat(sprintf("✓ Inserted %d hospital records\n", nrow(to.upload2)))

# -----------------------------------------------------------------------
# Add computed Magnet columns
#
#  magnet_designated      TEXT  'TRUE' if magnet_status starts with
#                               'Magnet ', 'FALSE' otherwise
#
#  magnet_most_recent_year INTEGER  last 4 chars of magnet_status cast to
#                               an integer (e.g. 'Magnet 20192024' → 2024,
#                               'Magnet 2025' → 2025, Non-Magnet → NULL)
# -----------------------------------------------------------------------
if ("magnet_status" %in% names(to.upload2)) {
  cat("Adding computed Magnet columns...\n")
  
  dbExecute(con, "ALTER TABLE hospitals ADD COLUMN magnet_designated TEXT")
  dbExecute(con, "UPDATE hospitals
                  SET magnet_designated = CASE
                    WHEN TRIM(magnet_status) LIKE 'Magnet %' THEN 'TRUE'
                    ELSE 'FALSE'
                  END")
  
  dbExecute(con, "ALTER TABLE hospitals ADD COLUMN magnet_most_recent_year INTEGER")
  dbExecute(con, "UPDATE hospitals
                  SET magnet_most_recent_year =
                    CAST(SUBSTR(TRIM(magnet_status), -4) AS INTEGER)
                  WHERE TRIM(magnet_status) LIKE 'Magnet %'")
  
  n_magnet <- dbGetQuery(con, "SELECT COUNT(*) AS n FROM hospitals WHERE magnet_designated = 'TRUE'")$n
  cat(sprintf("  ✓ magnet_designated: %d TRUE, %d FALSE\n",
              n_magnet, nrow(to.upload2) - n_magnet))
  
  yr_range <- dbGetQuery(con, "SELECT MIN(magnet_most_recent_year) AS mn,
                                      MAX(magnet_most_recent_year) AS mx
                               FROM hospitals WHERE magnet_most_recent_year IS NOT NULL")
  cat(sprintf("  ✓ magnet_most_recent_year: range %d – %d\n",
              yr_range$mn, yr_range$mx))
} else {
  cat("  ⚠ magnet_status column not found – Magnet computed columns skipped\n")
}

# ============================================================================
# HEALTH SYSTEMS TABLE
# ============================================================================
if (has_health_systems) {
  cat("\nCreating health_systems table...\n")
  
  # -----------------------------------------------------------------------
  # Ensure rate/percentage columns are stored as numeric (not character).
  # Values are expected in whole-number percentage points (e.g. 8 = 8%).
  # Storing them as numeric ensures JavaScript can parseFloat() them
  # correctly and the app's formatPercentage() shows "8.0%" as intended.
  # DO NOT divide by 100 — the display layer expects whole-number %.
  # -----------------------------------------------------------------------
  rate_cols_hs <- c(
    "rn_vacancy_rate_avg",
    "rn_contracted_labor_rate_avg",
    "total_facility_vacancy_rate_avg",
    "lpn_vacancy_rate_avg",
    "occupancy_rate_avg"
  )
  
  cat("\nVerifying numeric rate columns in hs_upload:\n")
  for (col in rate_cols_hs) {
    if (col %in% names(hs_upload)) {
      hs_upload[[col]] <- suppressWarnings(as.numeric(hs_upload[[col]]))
      non_na <- sum(!is.na(hs_upload[[col]]))
      if (non_na > 0) {
        rng <- range(hs_upload[[col]], na.rm = TRUE)
        cat(sprintf("  ✓ %-40s %d non-NA values  range [%.2f, %.2f]\n",
                    col, non_na, rng[1], rng[2]))
      } else {
        cat(sprintf("  ⚠ %-40s ALL values are NA — check hs_upload\n", col))
      }
    } else {
      cat(sprintf("  ✗ %-40s COLUMN NOT FOUND in hs_upload\n", col))
    }
  }
  cat("\n")
  
  # Write the health systems data to SQLite
  dbWriteTable(con, "health_systems", hs_upload, overwrite = TRUE)
  
  cat(sprintf("✓ Inserted %d health system records\n", nrow(hs_upload)))
} else {
  cat("\nSkipping health_systems table (no data provided)\n")
}

# ============================================================================
# CREATE INDEXES FOR PERFORMANCE
# ============================================================================
cat("\nCreating indexes for fast queries...\n")

# List of commonly filtered columns for hospitals table
index_columns <- c(
  "hospital_state",
  "hospital_type",
  "hospital_ownership",
  "hospital_emergency",
  "ehr",
  "erp_system",
  "nurse_scheduling_system",
  "nurse_scheduling_product",
  "time_attendance_system",
  "msa_tier",
  "urban_micro_rural",
  "vflok_health_system",
  "is_magnet",
  "pathway_to_excellence",
  "great_places_to_work",
  "leapfrog_top_rated",
  "analytics_maturity",
  "hs_bond_rating",
  "gpo"
)

# Health systems table indexes
health_system_index_columns <- c(
  "vflok_health_system",
  "hs_bond_rating",
  "hs_financial_data_source",
  "analytics_maturity"
)

# Create single-column indexes
for (col in index_columns) {
  # Check if column exists in the data
  if (col %in% names(to.upload2)) {
    index_name <- paste0("idx_", col)
    sql <- sprintf("CREATE INDEX IF NOT EXISTS %s ON hospitals(%s)", index_name, col)
    dbExecute(con, sql)
    cat(sprintf("  ✓ Created index: %s\n", index_name))
  }
}

# Create composite indexes for common filter combinations
cat("\nCreating composite indexes...\n")

composite_indexes <- list(
  c("hospital_state", "hospital_type"),
  c("vflok_health_system", "hospital_state"),
  c("ehr", "hospital_state"),
  c("is_magnet", "hospital_state"),
  c("hospital_type", "hospital_ownership")
)

for (i in seq_along(composite_indexes)) {
  cols <- composite_indexes[[i]]
  # Check if all columns exist
  if (all(cols %in% names(to.upload2))) {
    index_name <- paste0("idx_composite_", i)
    cols_str <- paste(cols, collapse = ", ")
    sql <- sprintf("CREATE INDEX IF NOT EXISTS %s ON hospitals(%s)", index_name, cols_str)
    dbExecute(con, sql)
    cat(sprintf("  ✓ Created composite index: %s (%s)\n", index_name, cols_str))
  }
}

# Create indexes for health_systems table
if (has_health_systems) {
  cat("\nCreating health systems indexes...\n")
  
  for (col in health_system_index_columns) {
    # Check if column exists in the data
    if (col %in% names(hs_upload)) {
      index_name <- paste0("idx_hs_", col)
      sql <- sprintf("CREATE INDEX IF NOT EXISTS %s ON health_systems(%s)", index_name, col)
      dbExecute(con, sql)
      cat(sprintf("  ✓ Created index: %s\n", index_name))
    }
  }
}

# ============================================================================
# DATABASE METADATA
# ============================================================================
cat("\nCreating metadata table...\n")

metadata <- data.frame(
  key = c("version", "created_date", "hospital_count", "health_system_count", "last_updated"),
  value = c(
    "1.0.0",
    as.character(Sys.Date()),
    as.character(nrow(to.upload2)),
    as.character(if(has_health_systems) nrow(hs_upload) else 0),
    as.character(Sys.time())
  ),
  stringsAsFactors = FALSE
)

dbWriteTable(con, "metadata", metadata, overwrite = TRUE)
cat("✓ Metadata table created\n")

# ============================================================================
# STATISTICS & VERIFICATION
# ============================================================================
cat("\n\nDatabase Statistics\n")
cat("====================\n")

# Get record count
record_count <- dbGetQuery(con, "SELECT COUNT(*) as count FROM hospitals")
cat(sprintf("Total hospital records: %d\n", record_count$count))

# Get column names
columns <- dbListFields(con, "hospitals")
cat(sprintf("Total columns: %d\n", length(columns)))

# Sample some common statistics
if ("hospital_state" %in% columns) {
  state_count <- dbGetQuery(con, "SELECT COUNT(DISTINCT hospital_state) as count FROM hospitals WHERE hospital_state IS NOT NULL")
  cat(sprintf("Unique states: %d\n", state_count$count))
}

if ("vflok_health_system" %in% columns) {
  hs_count <- dbGetQuery(con, "SELECT COUNT(DISTINCT vflok_health_system) as count FROM hospitals WHERE vflok_health_system IS NOT NULL")
  cat(sprintf("Unique health systems in hospitals: %d\n", hs_count$count))
}

if (has_health_systems) {
  hs_table_count <- dbGetQuery(con, "SELECT COUNT(*) as count FROM health_systems")
  cat(sprintf("Health systems in health_systems table: %d\n", hs_table_count$count))
}

if ("ehr" %in% columns) {
  ehr_count <- dbGetQuery(con, "SELECT COUNT(DISTINCT ehr) as count FROM hospitals WHERE ehr IS NOT NULL")
  cat(sprintf("Unique EHR systems: %d\n", ehr_count$count))
}

# List all indexes
cat("\nIndexes created:\n")
indexes <- dbGetQuery(con, "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
for (idx_name in indexes$name) {
  cat(sprintf("  - %s\n", idx_name))
}

# Get database file size
db_size_mb <- file.info(db_path)$size / (1024 * 1024)
cat(sprintf("\nDatabase file size: %.2f MB\n", db_size_mb))
cat(sprintf("Database location: %s\n", normalizePath(db_path)))

# ============================================================================
# PERFORMANCE TEST
# ============================================================================
cat("\n\nPerformance Test\n")
cat("=================\n")

# Test query speed
test_query <- "SELECT * FROM hospitals WHERE hospital_state = 'CA' LIMIT 100"
start_time <- Sys.time()
result <- dbGetQuery(con, test_query)
end_time <- Sys.time()
query_time_ms <- as.numeric(difftime(end_time, start_time, units = "secs")) * 1000

cat(sprintf("Test query: SELECT * FROM hospitals WHERE hospital_state = 'CA' LIMIT 100\n"))
cat(sprintf("Results returned: %d rows\n", nrow(result)))
cat(sprintf("Query time: %.2f ms\n", query_time_ms))

if (query_time_ms < 10) {
  cat("✓ Excellent performance! Queries are very fast.\n")
} else if (query_time_ms < 50) {
  cat("✓ Good performance. Queries should be responsive.\n")
} else {
  cat("⚠ Queries may be slower than expected. Consider optimizing indexes.\n")
}

# Close connection
dbDisconnect(con)

cat("\n\n")
cat("════════════════════════════════════════════════════════════════\n")
cat("✓ SUCCESS! Database created successfully!\n")
cat("════════════════════════════════════════════════════════════════\n")
cat("\nNext steps:\n")
cat("1. Copy 'vflok_hospitals.db' to the Electron app's resources folder\n")
cat("2. Build the Electron app\n")
cat("3. Distribute to users\n")
cat("\nDatabase file: ", normalizePath(db_path), "\n")
cat("\n")
