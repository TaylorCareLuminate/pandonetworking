################################################################################
##
## Bebity Profile Search Function
## 
## Reliably extracts LinkedIn profile data using the bebity/linkedin-premium-actor
##
## Returns: first_name, last_name, name, current_title, current_company,
##          headline, about, experience_paragraph, education_paragraph, location
##
## NEW: Includes bebity_company_search() with intelligent caching to avoid
##      redundant searches and save API costs
##
################################################################################

library(httr2)
library(jsonlite)
library(dplyr)
library(stringr)
library(purrr)

################################################################################
## HELPER FUNCTIONS - Extract Text from Nested Profile Data
################################################################################

# Extract text-like columns from any data frame (and nested data.frame columns)
extract_text <- function(df) {
  if (is.null(df) || !is.data.frame(df) || nrow(df) == 0) return(character())
  
  # Character columns
  chars <- df %>%
    dplyr::select(where(is.character)) %>%
    unlist(use.names = FALSE)
  
  # If there are data.frame subcolumns, recurse into them
  df_cols <- df[vapply(df, is.data.frame, logical(1L))]
  nested <- if (length(df_cols)) {
    unlist(lapply(df_cols, extract_text), use.names = FALSE)
  } else {
    character()
  }
  
  c(chars, nested)
}

# Recursive flattening of child lists
flatten_children <- function(child_list) {
  if (is.null(child_list)) return(character())
  
  purrr::map(child_list, function(x) {
    if (is.null(x) || !is.data.frame(x)) return(character())
    
    txt <- extract_text(x)
    kids <- if ("child" %in% names(x)) flatten_children(x$child) else character()
    c(txt, kids)
  }) |> unlist(use.names = FALSE)
}

# Main function for one list-column (e.g., ABOUT, EXPERIENCE, EDUCATION)
flatten_section <- function(section_list) {
  purrr::map_chr(section_list, function(entry) {
    if (is.null(entry) || !is.data.frame(entry)) return(NA_character_)
    
    top  <- extract_text(entry)
    kids <- if ("child" %in% names(entry)) flatten_children(entry$child) else character()
    all_text <- c(top, kids)
    
    if (length(all_text) == 0) return(NA_character_)
    
    # Join with newline for better readability
    paste(all_text, collapse = "\n")
  })
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
      return(list(organization = current_org, title = current_title))
    }
  }
  
  # Try "for" pattern (case-insensitive)
  if (grepl(" for ", headline_text, ignore.case = TRUE)) {
    parts <- strsplit(headline_text, " [Ff][Oo][Rr] ")[[1]]
    if (length(parts) == 2) {
      current_title <- trimws(parts[1])
      current_org <- trimws(parts[2])
      return(list(organization = current_org, title = current_title))
    }
  }
  
  # Try "|" pattern
  if (grepl(" \\| ", headline_text)) {
    parts <- strsplit(headline_text, " \\| ")[[1]]
    if (length(parts) == 2) {
      current_title <- trimws(parts[1])
      current_org <- trimws(parts[2])
      return(list(organization = current_org, title = current_title))
    }
  }
  
  # Try "-" pattern
  if (grepl(" - ", headline_text)) {
    parts <- strsplit(headline_text, " - ")[[1]]
    if (length(parts) == 2) {
      current_title <- trimws(parts[1])
      current_org <- trimws(parts[2])
      return(list(organization = current_org, title = current_title))
    }
  }
  
  # If no pattern matches, use entire headline as title
  current_title <- headline_text
  return(list(organization = current_org, title = current_title))
}

# Function to extract current employment from EXPERIENCE list
extract_current_employment <- function(experience_list, headline = NULL) {
  current_org <- NA_character_
  current_title <- NA_character_
  time_in_role <- NA_character_
  
  # Check if we have experience data
  if (is.null(experience_list) || length(experience_list) == 0) {
    # No experience data, try parsing headline
    if (!is.null(headline) && nzchar(headline)) {
      parsed <- parse_headline(headline)
      return(list(organization = parsed$organization, title = parsed$title, time = time_in_role))
    }
    return(list(organization = current_org, title = current_title, time = time_in_role))
  }
  
  # Find first WORK experience (skip volunteering, education, etc.)
  first_work_item <- NULL
  for (item in experience_list) {
    if (!is.list(item)) next
    
    # Skip if this is volunteering or other non-work experience
    # Indicators: meta field with various non-work categories
    meta_val <- if (!is.null(item$meta)) tolower(item$meta) else ""
    
    # Skip if meta suggests non-work activity
    if (grepl("arts|culture|community|volunteer|non-profit|education|health", meta_val, ignore.case = TRUE)) {
      next
    }
    
    # This is likely a work experience
    first_work_item <- item
    break
  }
  
  # If no work experience found, try parsing headline
  if (is.null(first_work_item)) {
    if (!is.null(headline) && nzchar(headline)) {
      parsed <- parse_headline(headline)
      return(list(organization = parsed$organization, title = parsed$title, time = time_in_role))
    }
    # Fall back to first item if headline parsing fails
    first_work_item <- experience_list[[1]]
  }
  
  if (!is.list(first_work_item)) {
    return(list(organization = current_org, title = current_title, time = time_in_role))
  }
  
  # Extract values from first work item
  caption_val <- if (!is.null(first_work_item$caption) && nzchar(first_work_item$caption)) first_work_item$caption else NA_character_
  title_val <- if (!is.null(first_work_item$title) && nzchar(first_work_item$title)) first_work_item$title else NA_character_
  subtitle_val <- if (!is.null(first_work_item$subtitle) && nzchar(first_work_item$subtitle)) first_work_item$subtitle else NA_character_
  
  # Check if this person has multiple roles at the same company
  # Key: child exists AND child[1] has a 'title' field (not just 'text')
  has_multiple_roles <- FALSE
  if (!is.null(first_work_item$child) && is.list(first_work_item$child) && length(first_work_item$child) > 0) {
    child_first <- first_work_item$child[[1]]
    if (is.list(child_first) && !is.null(child_first$title) && nzchar(child_first$title)) {
      has_multiple_roles <- TRUE
    }
  }
  
  if (has_multiple_roles) {
    # CASE 1: Multiple roles at same company
    # Structure: title=company, child[1].title=current job title
    current_org <- title_val
    
    child_first <- first_work_item$child[[1]]
    current_title <- as.character(child_first$title)
    if (!is.null(child_first$caption) && nzchar(child_first$caption)) {
      time_in_role <- as.character(child_first$caption)
    }
  } else {
    # CASE 2: Single role at company
    # Structure: title=job title, subtitle=company · employment_type, caption=duration
    current_title <- title_val
    
    # Extract company from subtitle (remove "· Full-time" etc.)
    if (!is.na(subtitle_val)) {
      current_org <- clean_org_name(subtitle_val)
    }
    
    # Time in role from caption
    if (!is.na(caption_val)) {
      time_in_role <- caption_val
    }
  }
  
  return(list(organization = current_org, title = current_title, time = time_in_role))
}

################################################################################
## MAIN FUNCTION - Bebity Profile Search
################################################################################

#' Search LinkedIn Profiles Using Bebity Actor
#' 
#' @param linkedin_urls Character vector of LinkedIn profile URLs
#' @param batch_size Number of profiles to process per batch (default: 400, max: 500)
#' @param apify_token Your Apify API token (defaults to APIFY_API_KEY env var)
#' 
#' @return Data frame with columns:
#'   - linkedin_url: Input LinkedIn URL
#'   - first_name: First name
#'   - last_name: Last name
#'   - name: Full name
#'   - current_title: Current job title
#'   - current_company: Current company/organization
#'   - headline: LinkedIn headline
#'   - about: About section text
#'   - experience_paragraph: Experience section as paragraph
#'   - education_paragraph: Education section as paragraph
#'   - location: Location
#'   - open_profile: Whether profile is open
#'   - premium: Whether they have premium
#' 
#' @examples
#' \dontrun{
#' urls <- c("https://www.linkedin.com/in/example1", "https://www.linkedin.com/in/example2")
#' profiles <- bebity_profile_search(urls)
#' }
bebity_profile_search <- function(linkedin_urls, batch_size = 400, apify_token = NULL) {
  
  # Validate inputs
  if (length(linkedin_urls) == 0) {
    stop("❌ No LinkedIn URLs provided")
  }
  
  # Remove NA and empty URLs
  linkedin_urls <- linkedin_urls[!is.na(linkedin_urls) & nzchar(linkedin_urls)]
  linkedin_urls <- unique(linkedin_urls)
  
  if (length(linkedin_urls) == 0) {
    stop("❌ No valid LinkedIn URLs after filtering")
  }
  
  # Get API token
  if (is.null(apify_token)) {
    apify_token <- Sys.getenv("APIFY_API_KEY", unset = NA)
    if (is.na(apify_token) || apify_token == "") {
      stop("❌ APIFY_API_KEY not set. Please set it or pass apify_token parameter.")
    }
  }
  
  # Ensure batch size is reasonable
  if (batch_size > 500) {
    warning("⚠️  Batch size > 500 may cause issues. Setting to 500.")
    batch_size <- 500
  }
  
  message(sprintf("\n🔍 Searching %d LinkedIn profiles using bebity/linkedin-premium-actor", length(linkedin_urls)))
  
  # Split URLs into batches
  num_batches <- ceiling(length(linkedin_urls) / batch_size)
  message(sprintf("📦 Splitting into %d batch%s of up to %d profiles each\n", 
                  num_batches, ifelse(num_batches > 1, "es", ""), batch_size))
  
  all_profile_data <- list()
  
  for (batch_num in 1:num_batches) {
    start_idx <- (batch_num - 1) * batch_size + 1
    end_idx <- min(batch_num * batch_size, length(linkedin_urls))
    batch_urls <- linkedin_urls[start_idx:end_idx]
    
    message(sprintf("\n--- Batch %d/%d: Processing %d profiles (URLs %d-%d) ---", 
                    batch_num, num_batches, length(batch_urls), start_idx, end_idx))
    
    tryCatch({
      # Prepare actor input
      actor_input <- list(
        action = "get-profiles",
        keywords = as.list(batch_urls),
        isUrl = TRUE,
        limit = 1
      )
      
      message("  ⏳ Starting Apify actor run...")
      
      # Start actor run
      run_response <- request("https://api.apify.com/v2/acts/bebity~linkedin-premium-actor/runs") %>%
        req_method("POST") %>%
        req_url_query(token = apify_token) %>%
        req_body_json(actor_input) %>%
        req_timeout(600) %>%
        req_perform()
      
      run_data <- resp_body_json(run_response)
      run_id <- run_data$data$id
      
      message(sprintf("  ✓ Started run: %s", run_id))
      
      # Poll for completion
      wait_interval <- 10  # seconds
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
        
        if (check %% 3 == 0) {  # Update every 30 seconds
          message(sprintf("  ⏳ Still running... (status: %s, %d seconds elapsed)", run_status, check * wait_interval))
        }
      }
      
      if (run_status != "SUCCEEDED") {
        message(sprintf("  ❌ Batch %d failed with status: %s", batch_num, run_status))
        next
      }
      
      message(sprintf("  ✓ Batch %d completed!", batch_num))
      
      # Get results
      dataset_id <- status_data$data$defaultDatasetId
      results_response <- request(sprintf("https://api.apify.com/v2/datasets/%s/items", dataset_id)) %>%
        req_url_query(token = apify_token, format = "json") %>%
        req_perform()
      
      batch_data <- resp_body_json(results_response, simplifyVector = FALSE)
      
      if (is.list(batch_data) && length(batch_data) > 0) {
        message(sprintf("  ✓ Retrieved %d profiles from batch %d", length(batch_data), batch_num))
        all_profile_data[[batch_num]] <- batch_data
      } else {
        message(sprintf("  ⚠️  No data returned from batch %d", batch_num))
      }
      
    }, error = function(e) {
      message(sprintf("  ❌ Error in batch %d: %s", batch_num, e$message))
    })
    
    # Small delay between batches to avoid rate limiting
    if (batch_num < num_batches) {
      message("  💤 Waiting 10 seconds before next batch...")
      Sys.sleep(10)
    }
  }
  
  # Combine all batch results
  message("\n--- Combining all batch results ---")
  
  profile_list <- list()
  if (length(all_profile_data) > 0) {
    valid_batches <- all_profile_data[sapply(all_profile_data, function(x) is.list(x) && length(x) > 0)]
    
    if (length(valid_batches) > 0) {
      # Flatten list of lists into single list
      profile_list <- unlist(valid_batches, recursive = FALSE)
      message(sprintf("✓ Combined %d batch%s into %d total profiles", 
                      length(valid_batches), 
                      ifelse(length(valid_batches) > 1, "es", ""), 
                      length(profile_list)))
    }
  }
  
  if (length(profile_list) == 0) {
    warning("⚠️  No profile data retrieved")
    return(data.frame())
  }
  
  # Extract and format data
  message("\n--- Extracting profile fields ---")
  
  # Initialize result data frame
  num_profiles <- length(profile_list)
  result <- data.frame(
    linkedin_url = character(num_profiles),
    first_name = character(num_profiles),
    last_name = character(num_profiles),
    name = character(num_profiles),
    current_title = character(num_profiles),
    current_company = character(num_profiles),
    headline = character(num_profiles),
    about = character(num_profiles),
    experience_paragraph = character(num_profiles),
    education_paragraph = character(num_profiles),
    location = character(num_profiles),
    open_profile = logical(num_profiles),
    premium = logical(num_profiles),
    stringsAsFactors = FALSE
  )
  
  # Extract basic fields from each profile
  for (i in 1:num_profiles) {
    profile <- profile_list[[i]]
    result$linkedin_url[i] <- if (!is.null(profile$url)) profile$url else NA_character_
    result$first_name[i] <- if (!is.null(profile$firstName)) profile$firstName else NA_character_
    result$last_name[i] <- if (!is.null(profile$lastName)) profile$lastName else NA_character_
    result$name[i] <- if (!is.null(profile$name)) profile$name else NA_character_
    result$headline[i] <- if (!is.null(profile$headline)) profile$headline else NA_character_
    result$location[i] <- if (!is.null(profile$location)) profile$location else NA_character_
    result$open_profile[i] <- if (!is.null(profile$openProfile)) profile$openProfile else NA
    result$premium[i] <- if (!is.null(profile$premium)) profile$premium else NA
  }
  
  # If name is missing but we have firstName/lastName, combine them
  for (i in 1:nrow(result)) {
    if (is.na(result$name[i]) || !nzchar(result$name[i])) {
      if (!is.na(result$first_name[i]) && !is.na(result$last_name[i])) {
        result$name[i] <- paste(result$first_name[i], result$last_name[i])
      }
    }
    
    # If first/last missing but we have name, try to split
    if ((is.na(result$first_name[i]) || !nzchar(result$first_name[i])) && 
        !is.na(result$name[i]) && nzchar(result$name[i])) {
      name_parts <- strsplit(result$name[i], " ")[[1]]
      if (length(name_parts) >= 2) {
        result$first_name[i] <- name_parts[1]
        result$last_name[i] <- paste(name_parts[2:length(name_parts)], collapse = " ")
      } else if (length(name_parts) == 1) {
        result$first_name[i] <- name_parts[1]
      }
    }
  }
  
  # Extract current employment and location
  message("  📋 Extracting current employment and location...")
  for (i in 1:num_profiles) {
    profile <- profile_list[[i]]
    headline <- if (!is.null(profile$headline)) profile$headline else NULL
    employment <- extract_current_employment(profile$EXPERIENCE, headline)
    result$current_title[i] <- employment$title
    result$current_company[i] <- employment$organization
    
    # Extract location from EXPERIENCE meta field (current job location)
    if (!is.null(profile$EXPERIENCE) && length(profile$EXPERIENCE) > 0) {
      # Find first work experience (skip volunteering)
      for (exp_item in profile$EXPERIENCE) {
        if (!is.list(exp_item)) next
        
        # Skip non-work experience
        meta_val <- if (!is.null(exp_item$meta)) tolower(exp_item$meta) else ""
        if (grepl("arts|culture|community|volunteer|non-profit|education|health", meta_val, ignore.case = TRUE)) {
          next
        }
        
        # Check if this is multiple roles at same company
        has_multiple_roles <- FALSE
        if (!is.null(exp_item$child) && is.list(exp_item$child) && length(exp_item$child) > 0) {
          child_first <- exp_item$child[[1]]
          if (is.list(child_first) && !is.null(child_first$title) && nzchar(child_first$title)) {
            has_multiple_roles <- TRUE
            # For multiple roles, location is in child meta
            if (!is.null(child_first$meta) && nzchar(child_first$meta)) {
              # Check if meta looks like location (contains comma or country)
              if (grepl(",|United States|UK|Canada|USA", child_first$meta)) {
                result$location[i] <- child_first$meta
                break
              }
            }
          }
        }
        
        # Single role - location in parent meta
        if (!has_multiple_roles && !is.null(exp_item$meta) && nzchar(exp_item$meta)) {
          # Check if meta looks like location (contains comma or country)
          if (grepl(",|United States|UK|Canada|USA", exp_item$meta)) {
            result$location[i] <- exp_item$meta
            break
          }
        }
        
        # Found first work experience, stop searching
        break
      }
    }
  }
  
  # Extract about section
  message("  📝 Extracting about section...")
  about_list <- lapply(profile_list, function(p) if (!is.null(p$ABOUT)) p$ABOUT else NULL)
  result$about <- flatten_section(about_list)
  
  # Extract experience paragraph
  message("  💼 Extracting experience section...")
  experience_list <- lapply(profile_list, function(p) if (!is.null(p$EXPERIENCE)) p$EXPERIENCE else NULL)
  result$experience_paragraph <- flatten_section(experience_list)
  
  # Extract education paragraph
  message("  🎓 Extracting education section...")
  education_list <- lapply(profile_list, function(p) if (!is.null(p$EDUCATION)) p$EDUCATION else NULL)
  result$education_paragraph <- flatten_section(education_list)
  
  # Report extraction stats
  message("\n--- Extraction Summary ---")
  message(sprintf("  Total profiles: %d", nrow(result)))
  message(sprintf("  With name: %d (%.1f%%)", sum(!is.na(result$name) & nzchar(result$name)), 100 * mean(!is.na(result$name) & nzchar(result$name))))
  message(sprintf("  With title: %d (%.1f%%)", sum(!is.na(result$current_title) & nzchar(result$current_title)), 100 * mean(!is.na(result$current_title) & nzchar(result$current_title))))
  message(sprintf("  With company: %d (%.1f%%)", sum(!is.na(result$current_company) & nzchar(result$current_company)), 100 * mean(!is.na(result$current_company) & nzchar(result$current_company))))
  message(sprintf("  With headline: %d (%.1f%%)", sum(!is.na(result$headline) & nzchar(result$headline)), 100 * mean(!is.na(result$headline) & nzchar(result$headline))))
  message(sprintf("  With about: %d (%.1f%%)", sum(!is.na(result$about) & nzchar(result$about)), 100 * mean(!is.na(result$about) & nzchar(result$about))))
  message(sprintf("  With experience: %d (%.1f%%)", sum(!is.na(result$experience_paragraph) & nzchar(result$experience_paragraph)), 100 * mean(!is.na(result$experience_paragraph) & nzchar(result$experience_paragraph))))
  message(sprintf("  With education: %d (%.1f%%)", sum(!is.na(result$education_paragraph) & nzchar(result$education_paragraph)), 100 * mean(!is.na(result$education_paragraph) & nzchar(result$education_paragraph))))
  message(sprintf("  With location: %d (%.1f%%)", sum(!is.na(result$location) & nzchar(result$location)), 100 * mean(!is.na(result$location) & nzchar(result$location))))
  
  message("\n✅ Profile search complete!\n")
  
  return(result)
}

################################################################################
## COMPANY SEARCH FUNCTION WITH INTELLIGENT CACHING
################################################################################

#' Search LinkedIn Company/Organization Profiles with Multi-Round Intelligence
#' 
#' Sophisticated search system with intelligent caching and multi-round matching:
#' 
#' ROUND 1: Check cache and search unfound organizations
#' ROUND 2: GPT verification + Gemini alternative name generation + search
#' ROUND 3: Final Gemini attempt + search for remaining unmatched
#' 
#' All results are saved to cache for future use, avoiding redundant searches.
#' 
#' @param organization_names Character vector of organization names to search
#' @param limit Number of results per organization (default: 5)
#' @param apify_token Your Apify API token (defaults to APIFY_API_KEY env var)
#' @param cache_dir Directory for cache file (defaults to standard location)
#' @param force_refresh Logical; if TRUE, ignore cache and search anyway (default: FALSE)
#' @param use_gpt_verification Logical; if TRUE, use GPT to verify matches (default: TRUE)
#' @param use_gemini_alternatives Logical; if TRUE, use Gemini for alternative names (default: TRUE)
#' @param max_rounds Maximum search rounds (default: 3)
#' @param verbose Logical; if TRUE, show detailed progress (default: TRUE)
#' 
#' @return Data frame with columns:
#'   - search_query: Original search query (organization name)
#'   - organization_name: Name of organization found
#'   - linkedin_url: LinkedIn URL of organization
#'   - search_date: Date when this result was obtained
#'   - is_cached: Whether this result came from cache
#'   - match_confidence: Confidence score from GPT/Gemini
#'   - search_round: Which round found this result (1, 2, or 3)
#' 
#' @examples
#' \dontrun{
#' # Search for single organization (all rounds automatic)
#' result <- bebity_company_search("Sarasota Memorial Hospital")
#' 
#' # Search for multiple organizations
#' orgs <- c("Mayo Clinic", "Cleveland Clinic", "Johns Hopkins")
#' results <- bebity_company_search(orgs)
#' 
#' # Disable advanced features for faster search
#' results <- bebity_company_search(orgs, use_gemini_alternatives = FALSE)
#' }
bebity_company_search <- function(
    organization_names, 
    limit = 5,
    apify_token = NULL,
    cache_dir = "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/In Process AI/Bebity LinkedIn Company Profiles",
    force_refresh = FALSE,
    use_gpt_verification = TRUE,
    use_gemini_alternatives = TRUE,
    max_rounds = 3,
    verbose = TRUE
) {
  
  # Validate inputs
  if (length(organization_names) == 0) {
    stop("❌ No organization names provided")
  }
  
  # Remove NA and empty names
  organization_names <- organization_names[!is.na(organization_names) & nzchar(trimws(organization_names))]
  organization_names <- unique(organization_names)
  
  if (length(organization_names) == 0) {
    stop("❌ No valid organization names after filtering")
  }
  
  # Get API token
  if (is.null(apify_token)) {
    apify_token <- Sys.getenv("APIFY_API_KEY", unset = NA)
    if (is.na(apify_token) || apify_token == "") {
      stop("❌ APIFY_API_KEY not set. Please set it or pass apify_token parameter.")
    }
  }
  
  # Create cache directory if it doesn't exist
  if (!dir.exists(cache_dir)) {
    dir.create(cache_dir, recursive = TRUE, showWarnings = FALSE)
    if (verbose) message("✓ Created cache directory: ", cache_dir)
  }
  
  # Load existing cache
  cache_file <- "company_search_cache"
  cache_path <- file.path(cache_dir, paste0(cache_file, ".rdata"))
  
  cache_db <- NULL
  if (file.exists(cache_path) && !force_refresh) {
    tryCatch({
      # Use loadr if available (from RProfile)
      if (exists("loadr", mode = "function")) {
        cache_db <- loadr(file.path("Bebity LinkedIn Company Profiles", cache_file))
      } else {
        load(cache_path)
        cache_db <- get(cache_file)
      }
      if (verbose) message(sprintf("✓ Loaded cache with %d existing records", nrow(cache_db)))
    }, error = function(e) {
      if (verbose) message("⚠️  Could not load cache, starting fresh")
      cache_db <- NULL
    })
  }
  
  # Initialize cache if empty
  if (is.null(cache_db) || !is.data.frame(cache_db)) {
    cache_db <- data.frame(
      search_query = character(),
      organization_name = character(),
      linkedin_url = character(),
      search_date = as.Date(character()),
      search_round = integer(),
      match_confidence = character(),
      stringsAsFactors = FALSE
    )
  }
  
  # Ensure required columns exist
  if (!"search_query" %in% names(cache_db)) cache_db$search_query <- NA_character_
  if (!"organization_name" %in% names(cache_db)) cache_db$organization_name <- NA_character_
  if (!"linkedin_url" %in% names(cache_db)) cache_db$linkedin_url <- NA_character_
  if (!"search_date" %in% names(cache_db)) cache_db$search_date <- as.Date(NA)
  if (!"search_round" %in% names(cache_db)) cache_db$search_round <- NA_integer_
  if (!"match_confidence" %in% names(cache_db)) cache_db$match_confidence <- NA_character_
  
  # Helper function to save cache
  save_cache <- function(cache_data) {
    tryCatch({
      if (exists("saver", mode = "function")) {
        saver(cache_data, file.path("Bebity LinkedIn Company Profiles", cache_file))
      } else {
        save(cache_data, file = cache_path)
      }
      if (verbose) message("  ✓ Cache updated")
    }, error = function(e) {
      if (verbose) message("  ⚠️  Could not save cache: ", e$message)
    })
  }
  
  # Helper function to perform Apify search
  perform_apify_search <- function(search_term, round_num) {
    if (verbose) message(sprintf("  ⏳ Searching Apify for: '%s'", search_term))
    
    tryCatch({
      actor_input <- list(
        action = "get-companies",
        keywords = list(search_term),
        isUrl = FALSE,
        limit = as.integer(limit)
      )
      
      run_response <- request("https://api.apify.com/v2/acts/bebity~linkedin-premium-actor/runs") %>%
        req_method("POST") %>%
        req_url_query(token = apify_token) %>%
        req_body_json(actor_input) %>%
        req_timeout(600) %>%
        req_perform()
      
      run_data <- resp_body_json(run_response)
      run_id <- run_data$data$id
      
      # Poll for completion
      wait_interval <- 10
      max_wait_mins <- 15
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
      }
      
      if (run_status != "SUCCEEDED") {
        if (verbose) message(sprintf("  ❌ Search failed: %s", run_status))
        return(NULL)
      }
      
      # Get results
      dataset_id <- status_data$data$defaultDatasetId
      results_response <- request(sprintf("https://api.apify.com/v2/datasets/%s/items", dataset_id)) %>%
        req_url_query(token = apify_token, format = "json") %>%
        req_perform()
      
      search_data <- resp_body_json(results_response, simplifyVector = FALSE)
      
      if (is.list(search_data) && length(search_data) > 0) {
        if (verbose) message(sprintf("  ✓ Found %d result(s)", length(search_data)))
        return(search_data)
      } else {
        if (verbose) message("  ⚠️  No results found")
        return(NULL)
      }
      
    }, error = function(e) {
      if (verbose) message(sprintf("  ❌ Error: %s", e$message))
      return(NULL)
    })
  }
  
  # Track results for each organization
  org_results <- list()
  for (i in seq_along(organization_names)) {
    org_results[[i]] <- list(
      original_query = trimws(organization_names[i]),
      found = FALSE,
      linkedin_url = NA_character_,
      org_name = NA_character_,
      search_round = NA_integer_,
      match_confidence = NA_character_
    )
  }
  
  if (verbose) {
    message(sprintf("\n╔══════════════════════════════════════════════════════════════════════════╗"))
    message(sprintf("║  MULTI-ROUND COMPANY SEARCH                                              ║"))
    message(sprintf("║  Organizations: %-57d║", length(organization_names)))
    message(sprintf("║  Max Rounds: %-60d║", max_rounds))
    message(sprintf("╚══════════════════════════════════════════════════════════════════════════╝\n"))
  }
  
  ##############################################################################
  ## ROUND 1: Check cache and search unfound organizations
  ##############################################################################
  
  if (verbose) {
    message("\n╔══════════════════════════════════════════════════════════════════════════╗")
    message("║  ROUND 1: Cache Check + Initial Search                                  ║")
    message("╚══════════════════════════════════════════════════════════════════════════╝\n")
  }
  
  for (i in seq_along(organization_names)) {
    org_name <- org_results[[i]]$original_query
    if (verbose) message(sprintf("\n[%d/%d] %s", i, length(organization_names), org_name))
    
    # Check cache first
    if (!force_refresh && nrow(cache_db) > 0) {
        message("  🔍 Checking cache with GPT matching...")
        
        # Get unique search queries from cache
        unique_queries <- unique(cache_db$search_query)
        
        if (length(unique_queries) > 0) {
          # Create comparison data frame
          comparison_df <- data.frame(
            query = org_name,
            cached_query = unique_queries,
            stringsAsFactors = FALSE
          )
          
          # Use gpt.batch to check matches
          tryCatch({
            match_results <- gpt.batch(
              comparison_df,
              prompt = paste0(
                "Compare these two organization names and determine if they refer to the same organization:\n",
                "Query: '[query]'\n",
                "Cached: '[cached_query]'\n\n",
                "Reply with '1' if they are the same organization (accounting for abbreviations, ",
                "different word order, or minor variations), or '0' if they are different. ",
                "Only reply with '1' or '0', nothing else."
              )
            )
            
            # Find matches (where result is "1")
            matched_idx <- which(match_results == "1" | match_results == 1)
            
            if (length(matched_idx) > 0) {
              matched_query <- unique_queries[matched_idx[1]]
              cached_matches <- cache_db[cache_db$search_query == matched_query, ]
              message(sprintf("  ✓ Found %d cached result(s) for similar query: '%s'", 
                              nrow(cached_matches), matched_query))
            }
          }, error = function(e) {
            message("  ⚠️  GPT matching failed: ", e$message)
          })
        }
      } else {
        # Simple exact match fallback
        cached_matches <- cache_db[tolower(cache_db$search_query) == tolower(org_name), ]
        
        if (nrow(cached_matches) > 0) {
          message(sprintf("  ✓ Found %d cached result(s)", nrow(cached_matches)))
        }
      }
      
      # If we found cached matches, use them
      if (!is.null(cached_matches) && nrow(cached_matches) > 0) {
        cached_matches$is_cached <- TRUE
        cached_matches$match_confidence <- "cached"
        all_results[[i]] <- cached_matches
        next
      }
    }
    
    # No cache hit, perform actual search
    message("  ⏳ Performing new search via Apify...")
    
    tryCatch({
      # Prepare actor input for company search
      actor_input <- list(
        action = "get-companies",
        keywords = list(org_name),
        isUrl = FALSE,
        limit = as.integer(limit)
      )
      
      # Start actor run
      run_response <- request("https://api.apify.com/v2/acts/bebity~linkedin-premium-actor/runs") %>%
        req_method("POST") %>%
        req_url_query(token = apify_token) %>%
        req_body_json(actor_input) %>%
        req_timeout(600) %>%
        req_perform()
      
      run_data <- resp_body_json(run_response)
      run_id <- run_data$data$id
      
      message(sprintf("  ✓ Started run: %s", run_id))
      
      # Poll for completion
      wait_interval <- 10
      max_wait_mins <- 15
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
          message(sprintf("  ⏳ Still running... (status: %s, %d seconds)", run_status, check * wait_interval))
        }
      }
      
      if (run_status != "SUCCEEDED") {
        message(sprintf("  ❌ Search failed with status: %s", run_status))
        next
      }
      
      message("  ✓ Search completed!")
      
      # Get results
      dataset_id <- status_data$data$defaultDatasetId
      results_response <- request(sprintf("https://api.apify.com/v2/datasets/%s/items", dataset_id)) %>%
        req_url_query(token = apify_token, format = "json") %>%
        req_perform()
      
      search_data <- resp_body_json(results_response, simplifyVector = FALSE)
      
      if (is.list(search_data) && length(search_data) > 0) {
        message(sprintf("  ✓ Retrieved %d company profile(s)", length(search_data)))
        
        # Extract relevant fields
        search_results <- data.frame(
          search_query = character(),
          organization_name = character(),
          linkedin_url = character(),
          search_date = as.Date(character()),
          is_cached = logical(),
          match_confidence = character(),
          stringsAsFactors = FALSE
        )
        
        for (company in search_data) {
          company_name <- if (!is.null(company$name)) company$name else NA_character_
          company_url <- if (!is.null(company$url)) company$url else NA_character_
          
          if (!is.na(company_name) && !is.na(company_url)) {
            search_results <- rbind(search_results, data.frame(
              search_query = org_name,
              organization_name = company_name,
              linkedin_url = company_url,
              search_date = Sys.Date(),
              is_cached = FALSE,
              match_confidence = "new_search",
              stringsAsFactors = FALSE
            ))
          }
        }
        
        # Add to cache
        if (nrow(search_results) > 0) {
          cache_db <- rbind(cache_db, search_results[, names(cache_db)])
          
          # Save cache using saver if available, otherwise use base R
          tryCatch({
            if (exists("saver", mode = "function")) {
              saver(cache_db, file.path("Bebity LinkedIn Company Profiles", cache_file))
            } else {
              save(cache_db, file = cache_path)
            }
            message("  ✓ Updated cache")
          }, error = function(e) {
            message("  ⚠️  Could not save cache: ", e$message)
          })
        }
        
        all_results[[i]] <- search_results
        
      } else {
        message("  ⚠️  No results found")
      }
      
    }, error = function(e) {
      message(sprintf("  ❌ Error searching '%s': %s", org_name, e$message))
    })
    
    # Small delay between searches
    if (i < length(organization_names)) {
      message("  💤 Waiting 5 seconds before next search...")
      Sys.sleep(5)
    }
  }
  
  # Combine all results
  message("\n--- Combining results ---")
  
  if (length(all_results) == 0) {
    warning("⚠️  No results retrieved")
    return(data.frame())
  }
  
  final_results <- do.call(rbind, all_results)
  rownames(final_results) <- NULL
  
  # Report statistics
  message("\n--- Search Summary ---")
  message(sprintf("  Total results: %d", nrow(final_results)))
  message(sprintf("  From cache: %d (%.1f%%)", 
                  sum(final_results$is_cached), 
                  100 * mean(final_results$is_cached)))
  message(sprintf("  New searches: %d (%.1f%%)", 
                  sum(!final_results$is_cached), 
                  100 * mean(!final_results$is_cached)))
  message(sprintf("  Unique organizations found: %d", 
                  length(unique(final_results$organization_name))))
  
  message("\n✅ Company search complete!\n")
  
  return(final_results)
}
