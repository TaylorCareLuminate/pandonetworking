################################################################################
##
## Bebity Company Search - Test Script
## 
## Simple test to verify the company search function works correctly
## Tests caching, GPT matching, and basic functionality
##
################################################################################

# Source the function
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_contact_profile_search/bebity_profile_search.R")

# Ensure RProfile functions are loaded
if (!exists("saver") || !exists("loadr") || !exists("gpt.batch")) {
  message("⚠️  Loading RProfile functions...")
  source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/RProfile Temp.R")
}

################################################################################
## TEST 1: Basic Search (First Time)
################################################################################

cat("\n╔════════════════════════════════════════════════════════════════╗\n")
cat("║  TEST 1: First-Time Search                                    ║\n")
cat("╚════════════════════════════════════════════════════════════════╝\n\n")

test_org <- "Sarasota Memorial Hospital"

result1 <- bebity_company_search(test_org, limit = 3)

cat("\n--- Test 1 Results ---\n")
print(result1)

cat("\n✓ Test 1 Complete\n")
cat(sprintf("  Is cached: %s (should be FALSE on first run)\n", result1$is_cached[1]))
cat(sprintf("  Results returned: %d\n", nrow(result1)))

################################################################################
## TEST 2: Repeated Search (Cache Test)
################################################################################

cat("\n╔════════════════════════════════════════════════════════════════╗\n")
cat("║  TEST 2: Repeated Search (Should Use Cache)                   ║\n")
cat("╚════════════════════════════════════════════════════════════════╝\n\n")

result2 <- bebity_company_search(test_org, limit = 3)

cat("\n--- Test 2 Results ---\n")
print(result2)

cat("\n✓ Test 2 Complete\n")
cat(sprintf("  Is cached: %s (should be TRUE)\n", result2$is_cached[1]))

if (all(result2$is_cached)) {
  cat("  ✅ PASS: Cache working correctly!\n")
} else {
  cat("  ❌ FAIL: Cache not working\n")
}

################################################################################
## TEST 3: Similar Name (GPT Matching Test)
################################################################################

cat("\n╔════════════════════════════════════════════════════════════════╗\n")
cat("║  TEST 3: Similar Name Search (GPT Matching)                   ║\n")
cat("╚════════════════════════════════════════════════════════════════╝\n\n")

similar_org <- "Sarasota Memorial"

result3 <- bebity_company_search(similar_org, limit = 3)

cat("\n--- Test 3 Results ---\n")
print(result3)

cat("\n✓ Test 3 Complete\n")
cat(sprintf("  Is cached: %s (should be TRUE if GPT matching works)\n", result3$is_cached[1]))

if (exists("gpt.batch", mode = "function")) {
  if (all(result3$is_cached)) {
    cat("  ✅ PASS: GPT matching working!\n")
  } else {
    cat("  ⚠️  INFO: GPT matching may not have found match (could be expected)\n")
  }
} else {
  cat("  ⚠️  INFO: gpt.batch not available, GPT matching skipped\n")
}

################################################################################
## TEST 4: Multiple Organizations
################################################################################

cat("\n╔════════════════════════════════════════════════════════════════╗\n")
cat("║  TEST 4: Multiple Organizations                               ║\n")
cat("╚════════════════════════════════════════════════════════════════╝\n\n")

multi_orgs <- c(
  "Mayo Clinic",
  "Cleveland Clinic"
)

result4 <- bebity_company_search(multi_orgs, limit = 2)

cat("\n--- Test 4 Results ---\n")
print(result4)

cat("\n✓ Test 4 Complete\n")
cat(sprintf("  Organizations searched: %d\n", length(multi_orgs)))
cat(sprintf("  Results returned: %d\n", nrow(result4)))
cat(sprintf("  Cached: %d | New: %d\n", 
            sum(result4$is_cached), 
            sum(!result4$is_cached)))

################################################################################
## TEST 5: Force Refresh
################################################################################

cat("\n╔════════════════════════════════════════════════════════════════╗\n")
cat("║  TEST 5: Force Refresh (Ignore Cache)                         ║\n")
cat("╚════════════════════════════════════════════════════════════════╝\n\n")

result5 <- bebity_company_search(test_org, limit = 3, force_refresh = TRUE)

cat("\n--- Test 5 Results ---\n")
print(result5)

cat("\n✓ Test 5 Complete\n")
cat(sprintf("  Is cached: %s (should be FALSE with force_refresh)\n", result5$is_cached[1]))

if (all(!result5$is_cached)) {
  cat("  ✅ PASS: Force refresh working!\n")
} else {
  cat("  ❌ FAIL: Force refresh not working\n")
}

################################################################################
## FINAL SUMMARY
################################################################################

cat("\n╔════════════════════════════════════════════════════════════════╗\n")
cat("║  TEST SUMMARY                                                  ║\n")
cat("╚════════════════════════════════════════════════════════════════╝\n\n")

# View cache
if (exists("loadr")) {
  tryCatch({
    cache <- loadr("Bebity LinkedIn Company Profiles/company_search_cache")
    cat(sprintf("✓ Cache loaded successfully\n"))
    cat(sprintf("  Total cached records: %d\n", nrow(cache)))
    cat(sprintf("  Unique organizations: %d\n", 
                length(unique(cache$organization_name))))
    cat(sprintf("  Unique searches: %d\n", 
                length(unique(cache$search_query))))
    
    cat("\n--- Recent Cache Entries ---\n")
    if (nrow(cache) > 0) {
      recent <- tail(cache, 5)
      print(recent[, c("search_query", "organization_name", "search_date", "linkedin_url")])
    }
  }, error = function(e) {
    cat("⚠️  Could not load cache\n")
  })
}

cat("\n✅ All tests complete!\n\n")

cat("NEXT STEPS:\n")
cat("1. Check the cache file location:\n")
cat("   C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/In Process AI/Bebity LinkedIn Company Profiles/\n")
cat("2. Run the Quick Start examples for more usage patterns\n")
cat("3. Integrate into your existing workflows\n\n")



