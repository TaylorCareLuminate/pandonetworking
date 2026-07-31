################################################################################
##
## Bebity Profile Search - Quick Start
## 
## Quick setup and usage examples for the bebity profile search function
##
################################################################################

# Source the function
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_profile_search.R")

################################################################################
## EXAMPLE 1: Search a few profiles
################################################################################

# Define LinkedIn URLs
urls <- c(
  "https://www.linkedin.com/in/example1",
  "https://www.linkedin.com/in/example2"
)

# Search profiles
profiles <- bebity_profile_search(urls)

# View results
View(profiles)

################################################################################
## EXAMPLE 2: Search from a data frame
################################################################################

# Load data with LinkedIn URLs
data <- loadr("My Dataset Name")

# Extract URLs
urls <- data$linkedin_url

# Search profiles (handles batching automatically)
profiles <- bebity_profile_search(urls)

# Merge back with original data
data_enriched <- data %>%
  left_join(profiles, by = c("linkedin_url" = "linkedin_url"))

################################################################################
## EXAMPLE 3: Search with custom batch size
################################################################################

# For faster processing with many URLs, you can adjust batch size
# (default is 400, max recommended is 500)
profiles <- bebity_profile_search(urls, batch_size = 500)

################################################################################
## AVAILABLE FIELDS
################################################################################

# The function returns these fields:
#   - linkedin_url: Input LinkedIn URL
#   - first_name: First name
#   - last_name: Last name
#   - name: Full name
#   - current_title: Current job title
#   - current_company: Current company/organization
#   - headline: LinkedIn headline
#   - about: About section text
#   - experience_paragraph: Experience section as paragraph
#   - education_paragraph: Education section as paragraph
#   - location: Location
#   - open_profile: Whether profile is open (TRUE/FALSE)
#   - premium: Whether they have LinkedIn premium (TRUE/FALSE)

################################################################################
## COST ESTIMATION
################################################################################

# Bebity pricing (as of 2024):
# - Profile search: ~$8 per 1,000 profiles (Full mode)
# 
# Examples:
# - 100 profiles: ~$0.80
# - 500 profiles: ~$4.00
# - 1,000 profiles: ~$8.00
# - 5,000 profiles: ~$40.00

################################################################################
## NOTES
################################################################################

# - The function automatically batches large requests (max 400-500 per batch)
# - Progress is shown in the console
# - If a batch fails, the function continues with the next batch
# - Results are automatically merged and returned as a single data frame

