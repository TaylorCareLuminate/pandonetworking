################################################################################
##
## Bebity Company Search V2 - Quick Start
## 
## NEW: Multi-round intelligent search with GPT verification and Gemini alternatives
##
## WHAT'S NEW IN V2:
## - Round 1: Cache check + initial Apify search
## - Round 2: GPT verification + Gemini alternative names + search  
## - Round 3: Final Gemini attempt + search
## - All findings automatically saved to cache
##
################################################################################

# Source the V2 function
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_contact_profile_search/bebity_profile_search_v2.R")

# Ensure RProfile functions are loaded (needed for gpt.batch and gemini.batch)
if (!exists("gpt.batch") || !exists("gemini.batch")) {
  source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/RProfile Temp.R")
}

################################################################################
## EXAMPLE 1: Basic Multi-Round Search
################################################################################

# Single organization - all rounds automatic
result <- bebity_company_search("Sarasota Memorial Hospital")

# View results
View(result)

# Check which round found it
table(result$search_round)
# 1 = Found in cache or initial search
# 2 = Found via Gemini alternative names
# 3 = Found via final Gemini attempt

################################################################################
## EXAMPLE 2: Multiple Organizations with Full Intelligence
################################################################################

hospitals <- c(
  "Sarasota Memorial Hospital",
  "Mayo Clinic",
  "Cleveland Clinic",
  "Memorial Hospital"  # Common name - may need alternatives
)

# Run with all features enabled (default)
results <- bebity_company_search(hospitals)

# Analyze results by round
table(results$search_round)

# Check match confidence
table(results$match_confidence)
# "round1_direct" = Found in round 1
# "gemini_alternative" = Found via Gemini alternative name
# "gemini_final" = Found in final Gemini attempt
# "gpt_verified" = GPT confirmed the match
# "cached" = From cache

################################################################################
## EXAMPLE 3: What Happens In Each Round (Detailed View)
################################################################################

# Let's search for a challenging organization
challenging_orgs <- c(
  "JHH",  # Abbreviation - may need Round 2
  "Mass General",  # Short name - may need Round 2
  "Memorial Hospital of South Texas"  # Specific - may need Round 3
)

# Run with verbose output to see the process
results <- bebity_company_search(
  challenging_orgs,
  verbose = TRUE  # Shows detailed progress
)

# ROUND 1 Process:
#   [1/3] JHH
#     → Searching Apify...
#     ⚠️  No results
#   [2/3] Mass General
#     → Searching Apify...
#     ⚠️  No results
#   [3/3] Memorial Hospital of South Texas
#     → Searching Apify...
#     ✓ Found 2 result(s)
#
# ROUND 2 Process:
#   → Generating alternative names for 2 unfound organizations...
#   [JHH] Trying alternatives: Johns Hopkins Hospital, Johns Hopkins Health System
#     🔍 Searching: 'Johns Hopkins Hospital'
#     ✓ Found 3 result(s)
#   [Mass General] Trying alternatives: Massachusetts General Hospital, MGH
#     🔍 Searching: 'Massachusetts General Hospital'
#     ✓ Found 5 result(s)

################################################################################
## EXAMPLE 4: Customizing Search Behavior
################################################################################

# Fast search (skip Gemini rounds)
fast_results <- bebity_company_search(
  hospitals,
  use_gemini_alternatives = FALSE,  # Skip Round 2 Gemini
  max_rounds = 1  # Only Round 1
)

# GPT verification only (no Gemini)
gpt_only_results <- bebity_company_search(
  hospitals,
  use_gpt_verification = TRUE,
  use_gemini_alternatives = FALSE,
  max_rounds = 2
)

# Maximum intelligence (all 3 rounds)
max_intelligence <- bebity_company_search(
  hospitals,
  use_gpt_verification = TRUE,
  use_gemini_alternatives = TRUE,
  max_rounds = 3
)

################################################################################
## EXAMPLE 5: Understanding Cache Behavior
################################################################################

# First run - searches everything
result1 <- bebity_company_search("Mayo Clinic")
print(result1$is_cached)  # FALSE (new search)

# Second run - uses cache
result2 <- bebity_company_search("Mayo Clinic")
print(result2$is_cached)  # TRUE (from cache)

# The cache stores ALL findings, including:
# - Original searches
# - Gemini alternative name searches
# - Final Gemini attempt searches

# So if you search "Mayo" later, it might find "Mayo Clinic" in cache
result3 <- bebity_company_search("Mayo")
# Round 2 will use Gemini to generate "Mayo Clinic" as alternative
# Then find it in cache from previous search!

################################################################################
## EXAMPLE 6: Analyzing Unmatched Organizations
################################################################################

# Some organizations may not be found even after 3 rounds
difficult_orgs <- c(
  "Some Tiny Rural Hospital",
  "Private Medical Group LLC",
  "Dr Smith's Clinic"
)

results <- bebity_company_search(difficult_orgs, verbose = TRUE)

# Check which ones were NOT found
# (They won't appear in results at all)
found_orgs <- unique(results$search_query)
unfound_orgs <- setdiff(difficult_orgs, found_orgs)

if (length(unfound_orgs) > 0) {
  message(sprintf("Not found: %s", paste(unfound_orgs, collapse = ", ")))
  # These organizations likely don't have LinkedIn pages
  # or have very different names on LinkedIn
}

################################################################################
## EXAMPLE 7: Integration with Existing Data
################################################################################

# Load your hospital data
hospitals_df <- data.frame(
  hospital_name = c(
    "Sarasota Memorial Hospital",
    "Mayo Clinic",
    "Cleveland Clinic Foundation",
    "Memorial Hospital"
  ),
  city = c("Sarasota", "Rochester", "Cleveland", "Various"),
  state = c("FL", "MN", "OH", "Various"),
  stringsAsFactors = FALSE
)

# Search with multi-round intelligence
linkedin_profiles <- bebity_company_search(
  hospitals_df$hospital_name,
  verbose = TRUE
)

# Merge back with original data
# Note: One hospital may have multiple LinkedIn results
hospitals_enriched <- hospitals_df %>%
  left_join(
    linkedin_profiles,
    by = c("hospital_name" = "search_query")
  )

View(hospitals_enriched)

################################################################################
## EXAMPLE 8: Cost Implications
################################################################################

# V2 costs MORE initially but SAVES MORE long-term

# Scenario: Search 10 organizations

# V1 (simple search):
#   Round 1: 10 searches = $0.08
#   If repeated: 10 * $0.08 = $0.08 per run
#   5 runs = $0.40

# V2 (multi-round):
#   Round 1: 10 searches = $0.08
#   Round 2: 5 unfound * 2 alternatives = 10 searches = $0.08
#   Round 3: 2 still unfound * 1 search = 2 searches = $0.016
#   Total first run: ~$0.18
#   
#   But if repeated: $0.00 (all from cache!)
#   5 runs = $0.18 (vs $0.40 with V1)
#
# V2 pays for itself after 2-3 runs!

################################################################################
## EXAMPLE 9: Viewing Cache Statistics
################################################################################

# Load and analyze cache
if (exists("loadr")) {
  cache <- loadr("Bebity LinkedIn Company Profiles/company_search_cache")
  
  message(sprintf("Total cached records: %d", nrow(cache)))
  message(sprintf("Unique organizations: %d", length(unique(cache$organization_name))))
  message(sprintf("Unique searches: %d", length(unique(cache$search_query))))
  
  # See which rounds found the most
  message("\nResults by round:")
  print(table(cache$search_round))
  
  # See match confidence distribution
  message("\nMatch confidence:")
  print(table(cache$match_confidence))
  
  View(cache)
}

################################################################################
## EXAMPLE 10: Troubleshooting Failed Searches
################################################################################

# If searches fail, check:

# 1. Are RProfile functions loaded?
exists("gpt.batch")  # Should be TRUE
exists("gemini.batch")  # Should be TRUE

# If FALSE, load them:
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/RProfile Temp.R")

# 2. Is Apify token set?
Sys.getenv("APIFY_API_KEY")  # Should not be empty

# If empty:
Sys.setenv(APIFY_API_KEY = "your_token_here")

# 3. Run with verbose to see what's happening
results <- bebity_company_search(
  "Problem Organization",
  verbose = TRUE
)

################################################################################
## KEY DIFFERENCES: V1 vs V2
################################################################################

# V1 (Simple):
# - Single round search
# - Cache check → Apify search → Done
# - Fast but may miss organizations
# - Good for: Well-known organizations with standard names

# V2 (Multi-Round):
# - Three round search with intelligence
# - Round 1: Cache + direct search
# - Round 2: GPT verification + Gemini alternatives
# - Round 3: Final Gemini attempt
# - Slower but finds more organizations
# - Good for: Abbreviations, variations, challenging names

################################################################################
## RECOMMENDED USAGE
################################################################################

# For most use cases, use V2 with default settings:
results <- bebity_company_search(organization_names)

# This will:
# ✓ Check cache first (instant, free)
# ✓ Search Apify for unfound (costs API credits)
# ✓ Use Gemini to find alternative names (costs API credits)
# ✓ Verify matches with GPT (costs API credits)
# ✓ Save everything to cache for future
# ✓ Work progressively smarter over time

# The more you use it, the more it learns, the more it saves!

################################################################################
## FUNCTION SIGNATURE
################################################################################

# bebity_company_search(
#   organization_names,           # Required: character vector
#   limit = 5,                    # Results per search
#   apify_token = NULL,           # API token (default: env var)
#   cache_dir = "...",            # Cache directory
#   force_refresh = FALSE,        # Ignore cache
#   use_gpt_verification = TRUE,  # Use GPT to verify matches
#   use_gemini_alternatives = TRUE, # Use Gemini for alternatives
#   max_rounds = 3,               # Maximum search rounds (1-3)
#   verbose = TRUE                # Show detailed progress
# )




