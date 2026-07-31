################################################################################
##
## Bebity Profile Search - Debug Script for Problem Profiles
## 
## Examines raw bebity data structure for two specific profiles to understand
## why extraction is failing
##
################################################################################

library(dplyr)
library(stringr)
library(httr2)
library(jsonlite)
library(purrr)

# Test URLs - Location missing
problem_urls <- c(
  "https://www.linkedin.com/in/kelli-smith-a8915b11b",   # Has location in original data
  "https://www.linkedin.com/in/ethanhebert",              # Has location in original data
  "https://www.linkedin.com/in/karen-hanson-226186b"      # Has location in original data
)

message("\n", strrep("=", 80))
message("BEBITY DEBUG - LOCATION FIELD SEARCH")
message(strrep("=", 80), "\n")
message("Searching for location data in bebity response")
message("Testing 3 profiles that should have location data")
message("")

################################################################################
## STEP 1: Get Raw Bebity Data
################################################################################

message("\n--- STEP 1: Calling Bebity Actor ---\n")

apify_token <- Sys.getenv("APIFY_API_KEY", unset = NA)
if (is.na(apify_token) || apify_token == "") {
  stop("❌ APIFY_API_KEY not set")
}

# Prepare actor input
actor_input <- list(
  action = "get-profiles",
  keywords = as.list(problem_urls),
  isUrl = TRUE,
  limit = 1
)

message("Actor input configuration:")
message(sprintf("  action: %s", actor_input$action))
message(sprintf("  isUrl: %s", actor_input$isUrl))
message(sprintf("  limit: %s", actor_input$limit))
message(sprintf("  Number of URLs: %d", length(actor_input$keywords)))

message("\n⏳ Starting Apify actor run...")

# Start actor run
run_response <- request("https://api.apify.com/v2/acts/bebity~linkedin-premium-actor/runs") %>%
  req_method("POST") %>%
  req_url_query(token = apify_token) %>%
  req_body_json(actor_input) %>%
  req_timeout(600) %>%
  req_perform()

run_data <- resp_body_json(run_response)
run_id <- run_data$data$id

message(sprintf("✓ Started run: %s", run_id))

# Poll for completion
wait_interval <- 10
max_wait_mins <- 30
max_checks <- (max_wait_mins * 60) / wait_interval

for (check in 1:max_checks) {
  Sys.sleep(wait_interval)
  
  status_response <- request(sprintf("https://api.apify.com/v2/acts/bebity~linkedin-premium-actor/runs/%s", run_id)) %>%
    req_url_query(token = apify_token) %>%
    req_perform()
  
  status_data <- resp_body_json(status_response)
  run_status <- status_data$data$status
  
  if (run_status %in% c("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT")) {
    break
  }
  
  if (check %% 3 == 0) {
    message(sprintf("⏳ Still running... (%d seconds elapsed)", check * wait_interval))
  }
}

if (run_status != "SUCCEEDED") {
  stop(sprintf("❌ Run failed with status: %s", run_status))
}

message("✓ Run completed!")

# Get results
dataset_id <- status_data$data$defaultDatasetId
results_response <- request(sprintf("https://api.apify.com/v2/datasets/%s/items", dataset_id)) %>%
  req_url_query(token = apify_token, format = "json") %>%
  req_perform()

raw_data <- resp_body_json(results_response, simplifyVector = FALSE)

message(sprintf("✓ Retrieved %d profiles\n", length(raw_data)))

# Save raw data
saver(raw_data, "Bebity Debug - Raw JSON")
message("💾 Saved raw data to: Bebity Debug - Raw JSON")

################################################################################
## STEP 2: Examine Each Profile Structure
################################################################################

message("\n--- STEP 2: Examining Profile Structures ---\n")

for (i in 1:length(raw_data)) {
  profile <- raw_data[[i]]
  
  message(strrep("=", 80))
  message(sprintf("PROFILE %d: %s", i, profile$url))
  message(strrep("=", 80))
  
  # Show ALL top-level fields WITH VALUES
  message("\n--- ALL TOP-LEVEL FIELDS AND VALUES ---")
  all_fields <- names(profile)
  message(sprintf("  Total fields: %d", length(all_fields)))
  
  for (field_name in all_fields) {
    field_val <- profile[[field_name]]
    if (is.null(field_val)) {
      message(sprintf("    %s: NULL", field_name))
    } else if (is.list(field_val)) {
      message(sprintf("    %s: [LIST/COMPLEX with %d items]", field_name, length(field_val)))
    } else if (is.character(field_val)) {
      # Show character fields in full
      message(sprintf("    %s: '%s'", field_name, field_val))
    } else {
      message(sprintf("    %s: %s", field_name, as.character(field_val)))
    }
  }
  
  # Basic fields
  message("\n--- Key Fields Summary ---")
  message(sprintf("  name: %s", ifelse(is.null(profile$name), "NULL", profile$name)))
  message(sprintf("  firstName: %s", ifelse(is.null(profile$firstName), "NULL", profile$firstName)))
  message(sprintf("  lastName: %s", ifelse(is.null(profile$lastName), "NULL", profile$lastName)))
  message(sprintf("  headline: %s", ifelse(is.null(profile$headline), "NULL", profile$headline)))
  message(sprintf("  location: %s", ifelse(is.null(profile$location), "NULL", profile$location)))
  
  # Search for location-related fields
  message("\n--- SEARCHING FOR LOCATION DATA ---")
  location_fields <- grep("location|city|country|region|geo", names(profile), ignore.case = TRUE, value = TRUE)
  if (length(location_fields) > 0) {
    message(sprintf("  Found location-related fields: %s", paste(location_fields, collapse = ", ")))
    for (field in location_fields) {
      val <- profile[[field]]
      if (is.null(val)) {
        message(sprintf("    %s: NULL", field))
      } else if (is.list(val)) {
        message(sprintf("    %s: [LIST/COMPLEX]", field))
        message(sprintf("      Structure: %s", paste(names(val), collapse = ", ")))
      } else {
        message(sprintf("    %s: %s", field, val))
      }
    }
  } else {
    message("  No location-related fields found at top level")
  }
  
  # Check if location is in EXPERIENCE items (meta field often has location)
  if (!is.null(profile$EXPERIENCE)) {
    message("\n--- LOCATION IN EXPERIENCE ITEMS ---")
    exp_list <- profile$EXPERIENCE
    for (j in 1:min(3, length(exp_list))) {
      item <- exp_list[[j]]
      if (is.list(item)) {
        if (!is.null(item$meta) && nzchar(item$meta)) {
          # Check if meta looks like a location (contains state/country)
          if (grepl(",|United States|UK|Canada", item$meta)) {
            message(sprintf("  Item %d meta (LOCATION): %s", j, item$meta))
          } else {
            message(sprintf("  Item %d meta: %s", j, item$meta))
          }
        }
        if (!is.null(item$caption) && nzchar(item$caption)) {
          # Check if caption contains location info
          if (grepl("location:", item$caption, ignore.case = TRUE)) {
            message(sprintf("  Item %d caption (has location): %s", j, item$caption))
          }
        }
        # Check child items for location
        if (!is.null(item$child) && is.list(item$child) && length(item$child) > 0) {
          for (k in 1:length(item$child)) {
            child <- item$child[[k]]
            if (is.list(child) && !is.null(child$meta) && nzchar(child$meta)) {
              # Check if meta looks like a location
              if (grepl(",|United States|UK|Canada", child$meta)) {
                message(sprintf("  Item %d child[%d] meta (LOCATION): %s", j, k, child$meta))
              } else {
                message(sprintf("  Item %d child[%d] meta: %s", j, k, child$meta))
              }
            }
          }
        }
      }
    }
  }
  
  # Check other sections for location
  message("\n--- CHECKING OTHER SECTIONS FOR LOCATION ---")
  
  # Check ABOUT section
  if (!is.null(profile$ABOUT)) {
    message("  ABOUT section exists")
  }
  
  # Check EDUCATION section
  if (!is.null(profile$EDUCATION)) {
    message("  EDUCATION section exists")
    if (is.list(profile$EDUCATION) && length(profile$EDUCATION) > 0) {
      first_edu <- profile$EDUCATION[[1]]
      if (is.list(first_edu)) {
        message(sprintf("    First education keys: %s", paste(names(first_edu), collapse = ", ")))
        if (!is.null(first_edu$meta)) {
          message(sprintf("    First education meta: %s", first_edu$meta))
        }
      }
    }
  }
  
  # Check for any other sections
  other_sections <- setdiff(names(profile), c("url", "name", "firstName", "lastName", "headline", "location", 
                                               "openProfile", "premium", "EXPERIENCE", "EDUCATION", "ABOUT"))
  if (length(other_sections) > 0) {
    message(sprintf("\n  OTHER SECTIONS: %s", paste(other_sections, collapse = ", ")))
  }
  
  message("\n")
}

################################################################################
## STEP 3: Summary of Location Findings
################################################################################

message("\n--- STEP 3: Location Data Summary ---\n")

# Helper to safely convert EXPERIENCE list to data frame
convert_experience_to_df <- function(exp_list) {
  if (is.null(exp_list) || length(exp_list) == 0) {
    return(data.frame())
  }
  
  # Convert each item to a row
  rows <- lapply(exp_list, function(item) {
    if (!is.list(item)) return(NULL)
    
    data.frame(
      title = if (!is.null(item$title)) as.character(item$title) else NA_character_,
      subtitle = if (!is.null(item$subtitle)) as.character(item$subtitle) else NA_character_,
      caption = if (!is.null(item$caption)) as.character(item$caption) else NA_character_,
      stringsAsFactors = FALSE
    )
  })
  
  # Remove NULLs and bind
  rows <- rows[!sapply(rows, is.null)]
  if (length(rows) == 0) return(data.frame())
  
  do.call(rbind, rows)
}

# Helper function to clean organization name
clean_org_name <- function(org_text) {
  if (is.na(org_text) || !nzchar(as.character(org_text))) return(NA_character_)
  org_text <- as.character(org_text)
  org_text <- gsub("\\s*·\\s*(Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Seasonal|Temporary).*$", "", org_text, ignore.case = TRUE)
  return(trimws(org_text))
}

# Function to parse headline for job title and company
parse_headline <- function(headline_text) {
  current_org <- NA_character_
  current_title <- NA_character_
  
  if (is.null(headline_text) || !nzchar(headline_text)) {
    return(list(organization = current_org, title = current_title))
  }
  
  message(sprintf("  Parsing headline: '%s'", headline_text))
  
  # Common patterns in headlines:
  # "Job Title at Company Name"
  # "Job Title | Company Name"
  # "Job Title for Company Name"
  # "Job Title - Company Name"
  
  # Try "at" pattern first (case-insensitive)
  if (grepl(" at ", headline_text, ignore.case = TRUE)) {
    # Split using regex to handle case variations
    parts <- strsplit(headline_text, " [Aa][Tt] ")[[1]]
    if (length(parts) == 2) {
      current_title <- trimws(parts[1])
      current_org <- trimws(parts[2])
      message(sprintf("    -> Parsed 'at' pattern: title='%s', org='%s'", current_title, current_org))
      return(list(organization = current_org, title = current_title))
    }
  }
  
  # Try "for" pattern (case-insensitive)
  if (grepl(" for ", headline_text, ignore.case = TRUE)) {
    parts <- strsplit(headline_text, " [Ff][Oo][Rr] ")[[1]]
    if (length(parts) == 2) {
      current_title <- trimws(parts[1])
      current_org <- trimws(parts[2])
      message(sprintf("    -> Parsed 'for' pattern: title='%s', org='%s'", current_title, current_org))
      return(list(organization = current_org, title = current_title))
    }
  }
  
  # Try "|" pattern
  if (grepl(" \\| ", headline_text)) {
    parts <- strsplit(headline_text, " \\| ")[[1]]
    if (length(parts) == 2) {
      current_title <- trimws(parts[1])
      current_org <- trimws(parts[2])
      message(sprintf("    -> Parsed '|' pattern: title='%s', org='%s'", current_title, current_org))
      return(list(organization = current_org, title = current_title))
    }
  }
  
  # Try "-" pattern
  if (grepl(" - ", headline_text)) {
    parts <- strsplit(headline_text, " - ")[[1]]
    if (length(parts) == 2) {
      current_title <- trimws(parts[1])
      current_org <- trimws(parts[2])
      message(sprintf("    -> Parsed '-' pattern: title='%s', org='%s'", current_title, current_org))
      return(list(organization = current_org, title = current_title))
    }
  }
  
  # If no pattern matches, use entire headline as title
  current_title <- headline_text
  message(sprintf("    -> No pattern matched, using entire headline as title"))
  return(list(organization = current_org, title = current_title))
}

# Extract with IMPROVED logic + headline fallback
extract_current_employment_v1 <- function(exp_list, headline = NULL) {
  current_org <- NA_character_
  current_title <- NA_character_
  time_in_role <- NA_character_
  
  if (is.null(exp_list) || length(exp_list) == 0) {
    # No experience data, try parsing headline
    message("  No EXPERIENCE data found")
    if (!is.null(headline) && nzchar(headline)) {
      message("  Falling back to headline parsing...")
      parsed <- parse_headline(headline)
      return(list(organization = parsed$organization, title = parsed$title, time = time_in_role))
    }
    return(list(organization = current_org, title = current_title, time = time_in_role))
  }
  
  # Find first WORK experience (skip volunteering, education, etc.)
  message("  Scanning experience items for first WORK experience...")
  first_work_item <- NULL
  for (idx in 1:length(exp_list)) {
    item <- exp_list[[idx]]
    if (!is.list(item)) next
    
    # Skip if this is volunteering or other non-work experience
    meta_val <- if (!is.null(item$meta)) tolower(item$meta) else ""
    
    message(sprintf("    Item %d: title='%s', meta='%s'", idx, 
                    if(!is.null(item$title)) item$title else "<NULL>",
                    if(nzchar(meta_val)) meta_val else "<NONE>"))
    
    # Skip if meta suggests non-work activity (added education and health)
    if (grepl("arts|culture|community|volunteer|non-profit|education|health", meta_val, ignore.case = TRUE)) {
      message(sprintf("      -> SKIPPING (meta indicates non-work: %s)", meta_val))
      next
    }
    
    # This is likely a work experience
    message(sprintf("      -> SELECTED as first work experience"))
    first_work_item <- item
    break
  }
  
  # If no work experience found, try parsing headline
  if (is.null(first_work_item)) {
    message("  No work experience found in EXPERIENCE section")
    if (!is.null(headline) && nzchar(headline)) {
      message("  Falling back to headline parsing...")
      parsed <- parse_headline(headline)
      return(list(organization = parsed$organization, title = parsed$title, time = time_in_role))
    }
    message("  No headline available, using first item anyway")
    first_work_item <- exp_list[[1]]
  }
  
  if (!is.list(first_work_item)) {
    return(list(organization = current_org, title = current_title, time = time_in_role))
  }
  
  caption_val <- if (!is.null(first_work_item$caption) && nzchar(first_work_item$caption)) first_work_item$caption else NA_character_
  title_val <- if (!is.null(first_work_item$title) && nzchar(first_work_item$title)) first_work_item$title else NA_character_
  subtitle_val <- if (!is.null(first_work_item$subtitle) && nzchar(first_work_item$subtitle)) first_work_item$subtitle else NA_character_
  
  message(sprintf("\n  Selected item fields:"))
  message(sprintf("    caption: %s", ifelse(is.na(caption_val), "<NA>", caption_val)))
  message(sprintf("    title: %s", ifelse(is.na(title_val), "<NA>", title_val)))
  message(sprintf("    subtitle: %s", ifelse(is.na(subtitle_val), "<NA>", subtitle_val)))
  
  # Check if this person has multiple roles at the same company
  # Key: child exists AND child[1] has a 'title' field (not just 'text')
  has_multiple_roles <- FALSE
  if (!is.null(first_work_item$child) && is.list(first_work_item$child) && length(first_work_item$child) > 0) {
    child_first <- first_work_item$child[[1]]
    if (is.list(child_first)) {
      child_has_title <- !is.null(child_first$title) && nzchar(child_first$title)
      child_has_text_only <- !is.null(child_first$text) && !child_has_title
      message(sprintf("    child[1] has title: %s", child_has_title))
      message(sprintf("    child[1] has text only: %s", child_has_text_only))
      
      if (child_has_title) {
        has_multiple_roles <- TRUE
      }
    }
  }
  
  if (has_multiple_roles) {
    # CASE 1: Multiple roles at same company
    # Structure: title=company, child[1].title=current job title
    message(sprintf("  => Using CASE 1 (multiple roles at company)"))
    current_org <- title_val
    
    child_first <- first_work_item$child[[1]]
    current_title <- as.character(child_first$title)
    if (!is.null(child_first$caption) && nzchar(child_first$caption)) {
      time_in_role <- as.character(child_first$caption)
    }
    message(sprintf("     RESULT: title='%s', org='%s'", current_title, current_org))
  } else {
    # CASE 2: Single role at company
    # Structure: title=job title, subtitle=company · employment_type, caption=duration
    message(sprintf("  => Using CASE 2 (single role at company)"))
    current_title <- title_val
    
    # Extract company from subtitle (remove "· Full-time" etc.)
    if (!is.na(subtitle_val)) {
      current_org <- clean_org_name(subtitle_val)
    }
    
    # Time in role from caption
    if (!is.na(caption_val)) {
      time_in_role <- caption_val
    }
    message(sprintf("     RESULT: title='%s', org='%s'", current_title, current_org))
  }
  
  return(list(organization = current_org, title = current_title, time = time_in_role))
}

message("Summary of location data for each profile:\n")

for (i in 1:length(raw_data)) {
  profile <- raw_data[[i]]
  message(sprintf("\nProfile %d: %s %s", i, 
                  ifelse(is.null(profile$firstName), "<NULL>", profile$firstName),
                  ifelse(is.null(profile$lastName), "<NULL>", profile$lastName)))
  
  # Check top-level location
  if (!is.null(profile$location) && nzchar(profile$location)) {
    message(sprintf("  ✅ TOP-LEVEL location field: %s", profile$location))
  } else {
    message("  ❌ NO top-level location field (this should be their CURRENT location)")
  }
  
  # Check for location in experience meta (WORK location, not current)
  if (!is.null(profile$EXPERIENCE) && length(profile$EXPERIENCE) > 0) {
    first_exp <- profile$EXPERIENCE[[1]]
    if (is.list(first_exp)) {
      if (!is.null(first_exp$meta) && nzchar(first_exp$meta)) {
        # Check if meta looks like a location
        if (grepl("^[A-Z]", first_exp$meta) && !grepl("^(Full-time|Part-time|Contract|Health|Arts)", first_exp$meta)) {
          message(sprintf("  ⚠️  EXPERIENCE[1].meta (WORK location): %s", first_exp$meta))
        }
      }
      # Check child meta
      if (!is.null(first_exp$child) && is.list(first_exp$child) && length(first_exp$child) > 0) {
        child <- first_exp$child[[1]]
        if (is.list(child) && !is.null(child$meta) && nzchar(child$meta)) {
          if (grepl("^[A-Z]", child$meta) && !grepl("^(Full-time|Part-time|Contract|Health|Arts)", child$meta)) {
            message(sprintf("  ⚠️  EXPERIENCE[1].child[1].meta (WORK location): %s", child$meta))
          }
        }
      }
    }
  }
  
  # Check all possible location fields
  message("\n  🔍 Checking ALL fields for location data:")
  all_location_data <- c()
  
  for (field_name in names(profile)) {
    field_val <- profile[[field_name]]
    
    # Skip complex list fields we already checked
    if (field_name %in% c("EXPERIENCE", "EDUCATION", "ABOUT", "LICENSES_AND_CERTIFICATIONS")) next
    
    if (!is.null(field_val) && !is.list(field_val)) {
      field_str <- as.character(field_val)
      # Check if it looks like a location (has comma or country)
      if (grepl(",|United States|USA|UK|Canada", field_str, ignore.case = TRUE)) {
        message(sprintf("    💡 FOUND in '%s': %s", field_name, field_str))
        all_location_data <- c(all_location_data, sprintf("%s=%s", field_name, field_str))
      }
    }
  }
  
  if (length(all_location_data) == 0) {
    message("    ❌ No location-like fields found outside EXPERIENCE")
  }
}

message("\n", strrep("=", 80))
message("DEBUG COMPLETE")
message(strrep("=", 80), "\n")

message("\nTo examine raw data:")
message("  raw <- loadr('Bebity Debug - Raw JSON')")
message("  str(raw[[1]], max.level = 3)")
message("  str(raw[[1]]$EXPERIENCE[[1]])")
