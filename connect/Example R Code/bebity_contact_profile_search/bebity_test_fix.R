################################################################################
##
## Quick Test - Verify Fixed Function
##
## Tests the fixed bebity_profile_search function with the two problem profiles
##
################################################################################

library(dplyr)

# Source the fixed function
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_contact_profile_search/bebity_profile_search.R")

# Test URLs
problem_urls <- c(
  "https://www.linkedin.com/in/johnathan-cote-54a6b9132",
  "https://www.linkedin.com/in/chad-fisher-82a98957"
)

message("\n", strrep("=", 80))
message("TESTING FIXED BEBITY FUNCTION")
message(strrep("=", 80), "\n")

# Call the fixed function
profiles <- bebity_profile_search(problem_urls)

# Display results
message("\n--- RESULTS ---\n")
for (i in 1:nrow(profiles)) {
  message(sprintf("Profile %d: %s", i, profiles$linkedin_url[i]))
  message(sprintf("  Name: %s", profiles$name[i]))
  message(sprintf("  Title: %s", profiles$current_title[i]))
  message(sprintf("  Company: %s", profiles$current_company[i]))
  message(sprintf("  Headline: %s", profiles$headline[i]))
  message("")
}

# Save for inspection
saver(profiles, "Bebity Test - Fixed Profiles")
message("💾 Saved to: Bebity Test - Fixed Profiles\n")

message(strrep("=", 80))
message("TEST COMPLETE")
message(strrep("=", 80))



