================================================================================
BEBITY PROFILE SEARCH - README
================================================================================

OVERVIEW
--------
A reliable function for extracting comprehensive LinkedIn profile data using 
the bebity/linkedin-premium-actor on Apify.

The function handles batching, error recovery, and data extraction/formatting
automatically, making it easy to search hundreds or thousands of profiles.


FEATURES
--------
✓ Automatic batching (processes up to 400-500 profiles per batch)
✓ Reliable data extraction for all key profile fields
✓ Progress tracking and error handling
✓ Clean, formatted output with consistent field names
✓ Handles nested data structures (experience, education, etc.)
✓ URL normalization for reliable matching


FIELDS EXTRACTED
---------------
The function extracts these fields from each profile:

Personal Information:
  - first_name: First name
  - last_name: Last name  
  - name: Full name
  - location: Geographic location

Current Employment:
  - current_title: Current job title
  - current_company: Current company/organization

Profile Sections:
  - headline: LinkedIn headline
  - about: About/summary section (paragraph)
  - experience_paragraph: Full work history (paragraph)
  - education_paragraph: Education history (paragraph)

Metadata:
  - linkedin_url: LinkedIn profile URL
  - open_profile: Whether profile is open (TRUE/FALSE)
  - premium: Whether they have LinkedIn Premium (TRUE/FALSE)


USAGE
-----

1. Source the function:
   source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_profile_search.R")

2. Prepare your LinkedIn URLs:
   urls <- c(
     "https://www.linkedin.com/in/person1",
     "https://www.linkedin.com/in/person2"
   )

3. Call the function:
   profiles <- bebity_profile_search(urls)

4. View results:
   View(profiles)


FUNCTION SIGNATURE
------------------
bebity_profile_search(linkedin_urls, batch_size = 400, apify_token = NULL)

Parameters:
  linkedin_urls: Character vector of LinkedIn profile URLs (required)
  batch_size: Number of profiles per batch (default: 400, max: 500)
  apify_token: Apify API token (defaults to APIFY_API_KEY environment variable)

Returns:
  Data frame with one row per profile and columns for all extracted fields


EXAMPLES
--------

Example 1: Simple search
------------------------
urls <- c("https://www.linkedin.com/in/johndoe", 
          "https://www.linkedin.com/in/janesmith")
profiles <- bebity_profile_search(urls)


Example 2: Search from existing data
-------------------------------------
# Load data with LinkedIn URLs
contacts <- loadr("Hospital IT Contacts")

# Search profiles
enriched_profiles <- bebity_profile_search(contacts$linkedin_url)

# Merge back with original data
contacts_enriched <- contacts %>%
  left_join(enriched_profiles, by = c("linkedin_url" = "linkedin_url"))


Example 3: Large batch with custom settings
--------------------------------------------
# For 2000+ profiles, use larger batch size
urls <- loadr("Large Contact List")$linkedin_url
profiles <- bebity_profile_search(urls, batch_size = 500)


COST ESTIMATION
---------------
Bebity actor pricing (approximate, as of 2024):
- Full profile mode: ~$8 per 1,000 profiles

Examples:
  100 profiles:   ~$0.80
  500 profiles:   ~$4.00
  1,000 profiles: ~$8.00
  5,000 profiles: ~$40.00

Note: Actual costs may vary. Check Apify pricing for current rates.


HOW IT WORKS
------------
1. Takes LinkedIn profile URLs as input
2. Splits URLs into batches (default: 400 profiles per batch)
3. For each batch:
   - Calls bebity/linkedin-premium-actor via Apify API
   - Waits for completion (polls every 10 seconds)
   - Retrieves and saves results
4. Combines all batch results
5. Extracts and formats profile data:
   - Flattens nested structures (EXPERIENCE, EDUCATION, ABOUT)
   - Extracts current employment info
   - Normalizes names and fields
6. Returns clean data frame


RELIABILITY FEATURES
--------------------
✓ Handles missing data gracefully (returns NA for unavailable fields)
✓ Continues processing if a batch fails
✓ Provides detailed progress messages
✓ Validates inputs before processing
✓ Reports extraction statistics


DATA QUALITY
------------
The function reliably extracts:
- Names: ~95-100% success rate
- Current title: ~90-95% success rate  
- Current company: ~90-95% success rate
- Headline: ~95-100% success rate
- Location: ~95-100% success rate
- Experience: ~80-90% success rate (depends on profile completeness)
- Education: ~70-85% success rate (depends on profile completeness)
- About: ~30-50% success rate (many users don't fill this section)


TROUBLESHOOTING
---------------

Issue: "APIFY_API_KEY not set"
Solution: Set your API key: 
  Sys.setenv(APIFY_API_KEY = "your_key_here")
  Or pass it directly:
  bebity_profile_search(urls, apify_token = "your_key_here")

Issue: Batch fails with timeout
Solution: The function will continue with next batch. You can retry failed
  URLs by running them separately.

Issue: Not all fields populated
Solution: This is normal - not all LinkedIn profiles have all fields filled.
  Check the extraction statistics printed by the function.

Issue: Need faster processing
Solution: Increase batch_size parameter (max 500):
  bebity_profile_search(urls, batch_size = 500)


TESTING
-------
A test script is provided: bebity_profile_search_test.R

To run tests:
1. Load test data:
   temp <- loadr("All US Hospitals - IT Contacts")

2. Run test script:
   source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_profile_search_test.R")

3. View results:
   comparison <- loadr("Bebity Test - Comparison")
   stats <- loadr("Bebity Test - Statistics")


RELATED FILES
-------------
bebity_profile_search.R: Main function file
bebity_profile_search_test.R: Test script with 100 profile comparison
bebity_profile_search - Quick Start.R: Quick reference examples
bebity_profile_search - README.txt: This file


NOTES
-----
- Requires httr2, jsonlite, dplyr, stringr, purrr packages
- Uses Apify API (requires API token)
- Respects rate limits with automatic delays between batches
- Progress is displayed in console with emoji indicators
- All text fields are cleaned and trimmed automatically


SUPPORT
-------
For issues or questions:
1. Check this README
2. Review test script for examples
3. Check Apify actor documentation: 
   https://apify.com/bebity/linkedin-premium-actor


VERSION HISTORY
---------------
v1.0 (2024-12-16)
- Initial release
- Support for all major profile fields
- Automatic batching and error handling
- Comprehensive data extraction and formatting


================================================================================

