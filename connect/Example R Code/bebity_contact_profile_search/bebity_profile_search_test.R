################################################################################
##
## Bebity Profile Search - Test Script
## 
## Tests the bebity_profile_search function with 100 profiles and compares
## the results with existing data to verify accuracy
##
################################################################################

library(dplyr)
library(stringr)

# Source the bebity profile search function
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_contact_profile_search/bebity_profile_search.R")

message("\n", strrep("=", 80))
message("BEBITY PROFILE SEARCH - TEST SCRIPT")
message(strrep("=", 80), "\n")

################################################################################
## STEP 1: Load Test Data
################################################################################

message("\n--- STEP 1: Loading Test Data ---\n")

# Load the hospital IT contacts dataset
temp <- loadr("All US Hospitals - IT Contacts")

message(sprintf("✓ Loaded %d total contacts", nrow(temp)))
message(sprintf("  First few rows preview:"))
print(head(temp))

# Select first 100 profiles for testing
test_data <- temp %>%
  filter(!is.na(linkedin_url) & nzchar(linkedin_url)) %>%
  head(100)

message(sprintf("\n✓ Selected %d profiles for testing", nrow(test_data)))

# Keep the original data for comparison
original_data <- test_data %>%
  select(
    linkedin_url,
    orig_first_name = first_name,
    orig_last_name = last_name,
    orig_current_title = current_title,
    orig_current_company = current_company,
    orig_headline = headline,
    orig_about = about,
    orig_experience_paragraph = experience_paragraph,
    orig_education_paragraph = education_paragraph,
    orig_location = location
  )

message("\nOriginal data columns saved for comparison:")
print(names(original_data))

################################################################################
## STEP 2: Call Bebity Actor
################################################################################

message("\n--- STEP 2: Calling Bebity Actor ---\n")

# Extract URLs
urls_to_search <- test_data$linkedin_url

# Call the bebity function
bebity_results <- bebity_profile_search(urls_to_search)

message(sprintf("\n✓ Bebity returned %d profiles", nrow(bebity_results)))

# Save raw results for inspection
saver(bebity_results, "Bebity Test - Raw Results")
message("💾 Saved raw results to: Bebity Test - Raw Results")

################################################################################
## STEP 3: Build Comparison Data Frame
################################################################################

message("\n--- STEP 3: Building Comparison Data Frame ---\n")

# Normalize URLs for matching
normalize_url <- function(url) {
  if (is.na(url) || !nzchar(url)) return(NA_character_)
  url <- trimws(url)
  url <- gsub("/$", "", url)
  url <- gsub("^http://", "https://", url)
  url <- gsub("^https://[a-z]{2,3}\\.linkedin\\.com", "https://linkedin.com", url)
  url <- gsub("^https://www\\.linkedin\\.com", "https://linkedin.com", url)
  url <- tolower(url)
  return(url)
}

original_data$linkedin_url_norm <- sapply(original_data$linkedin_url, normalize_url)
bebity_results$linkedin_url_norm <- sapply(bebity_results$linkedin_url, normalize_url)

# Merge original and bebity results
comparison <- original_data %>%
  left_join(
    bebity_results %>% 
      select(
        linkedin_url_norm,
        bebity_first_name = first_name,
        bebity_last_name = last_name,
        bebity_name = name,
        bebity_current_title = current_title,
        bebity_current_company = current_company,
        bebity_headline = headline,
        bebity_about = about,
        bebity_experience_paragraph = experience_paragraph,
        bebity_education_paragraph = education_paragraph,
        bebity_location = location
      ),
    by = "linkedin_url_norm"
  )

# Reorder columns for easier comparison
comparison <- comparison %>%
  select(
    linkedin_url,
    # Name comparison
    orig_first_name, bebity_first_name,
    orig_last_name, bebity_last_name,
    bebity_name,
    # Title comparison
    orig_current_title, bebity_current_title,
    # Company comparison
    orig_current_company, bebity_current_company,
    # Headline comparison
    orig_headline, bebity_headline,
    # About comparison
    orig_about, bebity_about,
    # Experience comparison
    orig_experience_paragraph, bebity_experience_paragraph,
    # Education comparison
    orig_education_paragraph, bebity_education_paragraph,
    # Location comparison
    orig_location, bebity_location
  )

message(sprintf("✓ Built comparison data frame with %d rows", nrow(comparison)))

# Save comparison
saver(comparison, "Bebity Test - Comparison")
message("💾 Saved comparison to: Bebity Test - Comparison")




###########TEST TWO PROFILES#####################


