################################################################################
##
## Health System IT Contacts Search
## 
## This script finds all IT employees at health systems and classifies them by
## job level and IT area using GPT.
##
## Input: CSV with 'Org' column (health system names)
## Output: Dataset of IT contacts with job level and area classifications
##
################################################################################

library(dplyr)
library(stringr)
library(purrr)
library(httr2)
library(jsonlite)

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

# Main function for one list-column (e.g., ABOUT, EXPERIENCE)
flatten_section <- function(section_list) {
  purrr::map_chr(section_list, function(entry) {
    if (is.null(entry) || !is.data.frame(entry)) return(NA_character_)
    
    top  <- extract_text(entry)
    kids <- if ("child" %in% names(entry)) flatten_children(entry$child) else character()
    all_text <- c(top, kids)
    
    if (length(all_text) == 0) return(NA_character_)
    
    stringr::str_squish(paste(all_text, collapse = " | "))
  })
}

################################################################################
## CONFIGURATION - EDIT THESE VARIABLES BEFORE RUNNING
################################################################################

# Input file path (CSV with 'Org' column for organization names)
input_csv_path <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/Health Systems.csv"

# Search parameters
target_department <- "Information Technology"  # Department to search
max_employees_per_company <- 100  # Maximum employees per health system

# Run profile enrichment? (Recommended - provides data for classification)
run_profile_enrichment <- TRUE

# Save names (these will be R objects saved with saver())
save_name_companies <- "Health System IT - Companies"
save_name_employees <- "Health System IT - Employees"
save_name_employees_enriched <- "Health System IT - Employees Enriched"
save_name_final <- "Health System IT - Final Dataset"

# Resume from which step? (1 = start from beginning)
resume_from_step <- 1

################################################################################
## STEP 1: FIND COMPANY LINKEDIN URLS
################################################################################

if (resume_from_step <= 1) {
  message("\n")
  message("================================================================================")
  message("STEP 1: Finding Company LinkedIn URLs")
  message("================================================================================")
  
  # Load CSV
  if (!file.exists(input_csv_path)) {
    stop("❌ Input CSV not found at: ", input_csv_path)
  }
  
  health_systems <- read.csv(input_csv_path, stringsAsFactors = FALSE)
  
  # Check for Org column
  if (!"Org" %in% names(health_systems)) {
    stop("❌ Required column 'Org' not found in CSV")
  }
  
  # Clean up
  health_systems <- health_systems %>%
    filter(!is.na(Org) & nzchar(Org))
  
  company_names <- health_systems$Org
  
  message(sprintf("✓ Loaded %d health systems", length(company_names)))
  message(sprintf("\nFinding LinkedIn URLs using bebity/linkedin-premium-actor..."))
  message("This may take several minutes...")
  
  # Call bebity actor to find company URLs
  tryCatch({
    actor_input <- list(
      action = "get-companies",
      keywords = as.list(company_names),
      isUrl = FALSE,
      isName = TRUE,
      limit = 1
    )
    
    apify_token <- Sys.getenv("APIFY_API_KEY", unset = NA)
    if (is.na(apify_token) || apify_token == "") {
      stop("APIFY_API_KEY not set")
    }
    
    message("Starting Apify actor run...")
    
    run_response <- request("https://api.apify.com/v2/acts/bebity~linkedin-premium-actor/runs") %>%
      req_method("POST") %>%
      req_url_query(token = apify_token) %>%
      req_body_json(actor_input) %>%
      req_timeout(600) %>%
      req_perform()
    
    run_data <- resp_body_json(run_response)
    run_id <- run_data$data$id
    
    message(sprintf("Run ID: %s", run_id))
    
    # Wait for completion
    max_wait_mins <- 20
    wait_interval <- 10
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
        message(sprintf("  Status: %s", run_status))
      }
    }
    
    if (run_status != "SUCCEEDED") {
      stop(sprintf("Actor run failed with status: %s", run_status))
    }
    
    message("✓ Actor run completed!")
    
    # Get results
    dataset_id <- status_data$data$defaultDatasetId
    results_response <- request(sprintf("https://api.apify.com/v2/datasets/%s/items", dataset_id)) %>%
      req_url_query(token = apify_token, format = "json") %>%
      req_perform()
    
    company_results <- resp_body_json(results_response, simplifyVector = TRUE)
    
    if (!is.data.frame(company_results) || nrow(company_results) == 0) {
      stop("No company results returned")
    }
    
    message(sprintf("✓ Found LinkedIn URLs for %d companies", nrow(company_results)))
    
    # Match back to original input
    company_data <- data.frame(
      company_name = company_names,
      stringsAsFactors = FALSE
    )
    
    # Map results (bebity returns 'url', 'name', 'websiteUrl')
    if ("url" %in% names(company_results)) {
      # Try to match by name
      for (i in 1:nrow(company_data)) {
        # Find best match in results
        matches <- company_results[grep(company_data$company_name[i], company_results$name, ignore.case = TRUE), ]
        if (nrow(matches) > 0) {
          company_data$company_linkedin_url[i] <- matches$url[1]
        }
      }
    }
    
    # Remove companies without URLs
    company_data <- company_data %>%
      filter(!is.na(company_linkedin_url) & nzchar(company_linkedin_url))
    
    message(sprintf("✓ Successfully matched %d/%d companies with LinkedIn URLs", 
                   nrow(company_data), length(company_names)))
    
  }, error = function(e) {
    message("❌ Error finding company URLs: ", e$message)
    stop("Cannot proceed without company LinkedIn URLs")
  })
  
  # Save
  saver(company_data, save_name_companies)
  message(sprintf("💾 Saved to: %s", save_name_companies))
}

################################################################################
## STEP 2: FIND IT EMPLOYEES (LOOP THROUGH ALL SENIORITY LEVELS)
################################################################################

if (resume_from_step <= 2) {
  message("\n")
  message("================================================================================")
  message("STEP 2: Finding IT Employees (All Seniority Levels)")
  message("================================================================================")
  
  # Load company data if not in memory
  if (!exists("company_data") || nrow(company_data) == 0) {
    message("Loading previous company data...")
    company_data <- loadr(save_name_companies)
  }
  
  company_urls <- company_data$company_linkedin_url
  
  # All seniority levels to search
  seniority_levels <- c("Executive", "VP", "Director", "Manager", "Senior", "Entry")
  
  message(sprintf("Searching %d companies for IT employees...", length(company_urls)))
  message(sprintf("Department: %s", target_department))
  message(sprintf("Seniority levels: %s", paste(seniority_levels, collapse = ", ")))
  message(sprintf("Max employees per company per seniority: %d", max_employees_per_company))
  message("\nUsing Apify actor: unlimitedleadtestinbox~linkedin-company-employees-scraper-no-cookie\n")
  
  # Source scraper functions if not already loaded
  if (!exists("apify_linkedin_employees_scraper")) {
    source_file <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/LinkedIn Scraper Functions.R"
    if (file.exists(source_file)) {
      source(source_file, local = TRUE)
    }
  }
  
  all_employees <- list()
  
  # Loop through each seniority level
  for (seniority in seniority_levels) {
    message(sprintf("\n--- Searching for %s level IT employees ---", seniority))
    
    tryCatch({
      employees <- apify_linkedin_employees_scraper(
        company_urls = company_urls,
        max_employees = max_employees_per_company,
        department = target_department,
        location = NULL,
        seniority = seniority,
        actor_id = "unlimitedleadtestinbox~linkedin-company-employees-scraper-no-cookie",
        max_wait_mins = 30,
        verbose = TRUE
      )
      
      if (is.data.frame(employees) && nrow(employees) > 0) {
        employees$search_seniority <- seniority
        all_employees[[seniority]] <- employees
        message(sprintf("✓ Found %d %s level IT employees", nrow(employees), seniority))
        
        # Save progress after each seniority level
        saver(all_employees, "Health System IT Employees Progress")
        message(sprintf("💾 Progress saved (total so far: %d)", 
                       sum(sapply(all_employees, nrow))))
      } else {
        message(sprintf("⚠ No %s level employees found", seniority))
      }
      
    }, error = function(e) {
      message(sprintf("❌ Error searching %s level: %s", seniority, e$message))
    })
    
    # Small delay between searches
    if (seniority != seniority_levels[length(seniority_levels)]) {
      message("Waiting 5 seconds before next seniority level...")
      Sys.sleep(5)
    }
  }
  
  # Combine all results
  if (length(all_employees) == 0) {
    stop("❌ No IT employees found at any seniority level")
  }
  
  employee_data <- bind_rows(all_employees)
  
  message(sprintf("\n--- Combined results from all seniority levels ---"))
  message("\nBreakdown by seniority level:")
  print(table(employee_data$search_seniority))
  
  # Remove duplicates (same person might appear in multiple searches)
  if ("linkedinUrl" %in% names(employee_data)) {
    original_count <- nrow(employee_data)
    employee_data <- employee_data %>%
      filter(!duplicated(linkedinUrl))
    
    duplicates_removed <- original_count - nrow(employee_data)
    if (duplicates_removed > 0) {
      message(sprintf("\n✓ Removed %d duplicates", duplicates_removed))
    }
  }
  
  message(sprintf("\n✓ Total employees found (before IT filter): %d", nrow(employee_data)))
  
  # ============================================================================
  # FILTER FOR IT-RELATED CONTACTS ONLY
  # ============================================================================
  
  message("\n--- Filtering for IT-related contacts only ---")
  
  # First, do a quick keyword filter to remove obvious non-IT roles
  it_keywords <- c(
    "IT", "I\\.T\\.", "Information Technology", "Information Systems",
    "Technology", "Tech", "Digital", "Data", "Analytics", "BI",
    "Software", "Developer", "Engineer", "Programmer", "Architect",
    "CIO", "CTO", "CISO", "Chief Information", "Chief Technology", "Chief Digital",
    "Systems", "Network", "Infrastructure", "Cloud", "DevOps", "SRE",
    "Security", "Cyber", "InfoSec", "Privacy",
    "Database", "DBA", "SQL", "EHR", "EMR", "Epic", "Cerner", "Meditech",
    "Informatics", "Clinical Informatics", "Health Informatics",
    "Application", "Apps", "Integration", "API", "Web",
    "Help Desk", "Desktop", "Support", "Service Desk",
    "Telecom", "Telecommunications", "VoIP",
    "Project Manager.*IT", "IT.*Project", "Technical Project",
    "Scrum", "Agile"
  )
  
  # Create pattern for matching
  it_pattern <- paste(it_keywords, collapse = "|")
  
  # Check job title and headline for IT keywords
  employee_data$potential_it <- FALSE
  
  if ("jobTitle" %in% names(employee_data)) {
    employee_data$potential_it <- employee_data$potential_it | 
      grepl(it_pattern, employee_data$jobTitle, ignore.case = TRUE)
  }
  
  if ("headline" %in% names(employee_data)) {
    employee_data$potential_it <- employee_data$potential_it | 
      grepl(it_pattern, employee_data$headline, ignore.case = TRUE)
  }
  
  # Show quick filter results
  quick_it_count <- sum(employee_data$potential_it, na.rm = TRUE)
  message(sprintf("Quick keyword filter: %d/%d appear to be IT-related", 
                 quick_it_count, nrow(employee_data)))
  
  # Use GPT to validate remaining contacts
  message("\nUsing AI to validate IT department membership...")
  
  # Create text for validation
  employee_data$title_headline <- paste(
    ifelse(is.na(employee_data$jobTitle), "", employee_data$jobTitle),
    "|",
    ifelse(is.na(employee_data$headline), "", employee_data$headline)
  )
  
  employee_data$is_it_contact <- gpt.batch.validated(
    employee_data,
    "Based on this person's job title and headline, determine if they work in IT/Information Technology/Information Systems.

Title/Headline: [title_headline]

IT includes: CIO, CTO, CISO, IT directors/managers, software developers, network engineers, 
database administrators, cybersecurity, clinical informatics, EHR specialists, 
help desk, systems administrators, data analysts, IT project managers, etc.

NOT IT includes: Nurses, doctors, HR, finance, marketing, operations, facilities, 
administrative assistants, executives without IT focus, etc.

Reply only 'Yes' if this person works in IT, or 'No' if they do not.",
    valid_values = c("Yes", "No"),
    model.in = "gpt-4o-mini"
  )
  
  # Filter to keep only IT contacts
  original_count <- nrow(employee_data)
  employee_data <- employee_data %>%
    filter(is_it_contact == "Yes")
  
  removed_count <- original_count - nrow(employee_data)
  message(sprintf("\n✓ Removed %d non-IT contacts", removed_count))
  message(sprintf("✓ Remaining IT contacts: %d", nrow(employee_data)))
  
  # Clean up temporary columns
  employee_data$potential_it <- NULL
  employee_data$title_headline <- NULL
  employee_data$is_it_contact <- NULL
  
  # Save
  saver(employee_data, save_name_employees)
  message(sprintf("\n💾 Saved to: %s", save_name_employees))
}

################################################################################
## STEP 3: ENRICH WITH FULL PROFILES (OPTIONAL BUT RECOMMENDED)
################################################################################

if (resume_from_step <= 3 && run_profile_enrichment) {
  message("\n")
  message("================================================================================")
  message("STEP 3: Enriching with Full LinkedIn Profiles")
  message("================================================================================")
  message("⚠️  This step adds cost (~$0.05/profile) but provides better data for classification\n")
  
  # Load employee data if not in memory
  if (!exists("employee_data") || nrow(employee_data) == 0) {
    message("Loading previous employee data...")
    employee_data <- loadr(save_name_employees)
  }
  
  # Find LinkedIn URL column
  profile_url_col <- NULL
  for (col in c("linkedinUrl", "linkedinProfileUrl", "profileUrl", "linkedin_url")) {
    if (col %in% names(employee_data)) {
      profile_url_col <- col
      break
    }
  }
  
  if (is.null(profile_url_col)) {
    stop("❌ Could not find LinkedIn profile URL column")
  }
  
  profile_urls <- employee_data[[profile_url_col]]
  profile_urls <- profile_urls[!is.na(profile_urls) & nzchar(profile_urls)]
  profile_urls <- unique(profile_urls)
  
  message(sprintf("Fetching full profiles for %d employees...", length(profile_urls)))
  message("Using Apify actor: bebity/linkedin-premium-actor\n")
  
  # Batch size for bebity - it can only handle ~500 profiles per run
  bebity_batch_size <- 400
  
  apify_token <- Sys.getenv("APIFY_API_KEY", unset = NA)
  if (is.na(apify_token) || apify_token == "") {
    stop("APIFY_API_KEY not set")
  }
  
  # Split URLs into batches
  num_batches <- ceiling(length(profile_urls) / bebity_batch_size)
  message(sprintf("Splitting into %d batches of up to %d profiles each\n", num_batches, bebity_batch_size))
  
  all_profile_data <- list()
  
  for (batch_num in 1:num_batches) {
    start_idx <- (batch_num - 1) * bebity_batch_size + 1
    end_idx <- min(batch_num * bebity_batch_size, length(profile_urls))
    batch_urls <- profile_urls[start_idx:end_idx]
    
    message(sprintf("\n--- Batch %d/%d: Processing %d profiles (URLs %d-%d) ---", 
                   batch_num, num_batches, length(batch_urls), start_idx, end_idx))
    
    tryCatch({
      actor_input <- list(
        action = "get-profiles",
        keywords = as.list(batch_urls),
        isUrl = TRUE,
        isName = FALSE,
        limit = 1
      )
      
      message("  Starting Apify actor run...")
      
      run_response <- request("https://api.apify.com/v2/acts/bebity~linkedin-premium-actor/runs") %>%
        req_method("POST") %>%
        req_url_query(token = apify_token) %>%
        req_body_json(actor_input) %>%
        req_timeout(600) %>%
        req_perform()
      
      run_data <- resp_body_json(run_response)
      run_id <- run_data$data$id
      
      message(sprintf("  Run ID: %s", run_id))
      
      # Wait for completion
      max_wait_mins <- 30
      wait_interval <- 15
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
        
        if (check %% 4 == 0) {
          message(sprintf("    Status: %s", run_status))
        }
      }
      
      if (run_status != "SUCCEEDED") {
        message(sprintf("  ⚠ Batch %d failed with status: %s", batch_num, run_status))
        next
      }
      
      message(sprintf("  ✓ Batch %d completed!", batch_num))
      
      # Get results
      dataset_id <- status_data$data$defaultDatasetId
      results_response <- request(sprintf("https://api.apify.com/v2/datasets/%s/items", dataset_id)) %>%
        req_url_query(token = apify_token, format = "json") %>%
        req_perform()
      
      batch_data <- resp_body_json(results_response, simplifyVector = TRUE)
      
      if (is.data.frame(batch_data) && nrow(batch_data) > 0) {
        message(sprintf("  ✓ Retrieved %d profiles from batch %d", nrow(batch_data), batch_num))
        all_profile_data[[batch_num]] <- batch_data
        
        # Save progress after each batch
        saver(all_profile_data, "Health System IT Bebity Progress")
        message(sprintf("  💾 Progress saved (total profiles so far: %d)", 
                       sum(sapply(all_profile_data, function(x) if(is.data.frame(x)) nrow(x) else 0))))
      } else {
        message(sprintf("  ⚠ No data returned from batch %d", batch_num))
      }
      
    }, error = function(e) {
      message(sprintf("  ❌ Error in batch %d: %s", batch_num, e$message))
    })
    
    # Small delay between batches to avoid rate limiting
    if (batch_num < num_batches) {
      message("  Waiting 10 seconds before next batch...")
      Sys.sleep(10)
    }
  }
  
  # Combine all batch results
  message("\n--- Combining all batch results ---")
  
  profile_data <- data.frame()
  if (length(all_profile_data) > 0) {
    valid_batches <- all_profile_data[sapply(all_profile_data, function(x) is.data.frame(x) && nrow(x) > 0)]
    
    if (length(valid_batches) > 0) {
      profile_data <- bind_rows(valid_batches)
      message(sprintf("✓ Combined %d batches into %d total profiles", length(valid_batches), nrow(profile_data)))
    }
  }
  
  # Save the raw profile data
  if (nrow(profile_data) > 0) {
    saver(profile_data, "Health System IT Bebity Raw Profiles")
    message("💾 Saved raw profile data to: Health System IT Bebity Raw Profiles")
  }
  
  # Merge profile data if we got it
  if (nrow(profile_data) > 0 && "EXPERIENCE" %in% names(profile_data)) {
    
    message("\n--- Extracting current employment from profiles ---")
    
    # Helper function to clean organization name
    clean_org_name <- function(org_text) {
      if (is.na(org_text) || !nzchar(as.character(org_text))) return(NA_character_)
      org_text <- as.character(org_text)
      org_text <- gsub("\\s*·\\s*(Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Seasonal|Temporary).*$", "", org_text, ignore.case = TRUE)
      return(trimws(org_text))
    }
    
    # Function to extract current employment from EXPERIENCE data frame
    extract_current_employment <- function(experience_df) {
      current_org <- NA_character_
      current_title <- NA_character_
      time_in_role <- NA_character_
      
      if (is.null(experience_df) || !is.data.frame(experience_df) || nrow(experience_df) == 0) {
        return(list(organization = current_org, title = current_title, time = time_in_role))
      }
      
      # Get first row (current job)
      caption_val <- if ("caption" %in% names(experience_df)) experience_df$caption[1] else NA
      title_val <- if ("title" %in% names(experience_df)) experience_df$title[1] else NA
      subtitle_val <- if ("subtitle" %in% names(experience_df)) experience_df$subtitle[1] else NA
      
      # Convert to character and check for NA/empty
      caption_val <- if (!is.na(caption_val) && nzchar(as.character(caption_val))) as.character(caption_val) else NA_character_
      title_val <- if (!is.na(title_val) && nzchar(as.character(title_val))) as.character(title_val) else NA_character_
      subtitle_val <- if (!is.na(subtitle_val) && nzchar(as.character(subtitle_val))) as.character(subtitle_val) else NA_character_
      
      if (!is.na(caption_val)) {
        # CASE 1: caption is NOT blank (single role at company)
        current_org <- clean_org_name(subtitle_val)
        current_title <- title_val
        time_in_role <- caption_val
      } else {
        # CASE 2: caption IS blank (multiple roles at company)
        current_org <- title_val
        
        if ("child" %in% names(experience_df)) {
          child_col <- experience_df$child
          if (is.list(child_col) && length(child_col) >= 1) {
            child_data <- child_col[[1]]
            if (is.data.frame(child_data) && nrow(child_data) > 0) {
              if ("title" %in% names(child_data)) {
                current_title <- as.character(child_data$title[1])
              }
              if ("caption" %in% names(child_data)) {
                time_in_role <- as.character(child_data$caption[1])
              }
            } else if (is.character(child_data) && nzchar(child_data)) {
              parts <- strsplit(child_data, ",\\s*")[[1]]
              if (length(parts) >= 1) {
                current_title <- trimws(parts[1])
              }
              for (part in parts) {
                if (grepl("Present|\\d{4}\\s*-", part)) {
                  time_match <- regmatches(part, regexpr("[A-Za-z]{3}\\s+\\d{4}\\s*-\\s*[A-Za-z0-9]+.*", part))
                  if (length(time_match) > 0) {
                    time_in_role <- trimws(time_match[1])
                    break
                  }
                }
              }
            }
          }
        }
      }
      
      return(list(organization = current_org, title = current_title, time = time_in_role))
    }
    
    # Extract employment info for each profile
    profile_employment <- data.frame(
      profile_url = character(),
      bebity_current_org = character(),
      bebity_current_title = character(),
      bebity_time_in_role = character(),
      stringsAsFactors = FALSE
    )
    
    for (i in 1:nrow(profile_data)) {
      profile_url <- if ("url" %in% names(profile_data)) profile_data$url[i] else NA_character_
      experience_df <- profile_data$EXPERIENCE[[i]]
      employment <- extract_current_employment(experience_df)
      
      profile_employment <- rbind(profile_employment, data.frame(
        profile_url = profile_url,
        bebity_current_org = employment$organization,
        bebity_current_title = employment$title,
        bebity_time_in_role = employment$time,
        stringsAsFactors = FALSE
      ))
    }
    
    message(sprintf("✓ Extracted employment info for %d profiles", nrow(profile_employment)))
    
    complete_org <- sum(!is.na(profile_employment$bebity_current_org) & nzchar(profile_employment$bebity_current_org))
    complete_title <- sum(!is.na(profile_employment$bebity_current_title) & nzchar(profile_employment$bebity_current_title))
    message(sprintf("  Organizations found: %d/%d", complete_org, nrow(profile_employment)))
    message(sprintf("  Job titles found: %d/%d", complete_title, nrow(profile_employment)))
    
    # Extract text from list columns for classification
    message("\nExtracting text from profile data...")
    
    profile_data_subset <- data.frame(
      profile_url = if ("url" %in% names(profile_data)) profile_data$url else NA_character_,
      stringsAsFactors = FALSE
    )
    
    if ("ABOUT" %in% names(profile_data) && is.list(profile_data$ABOUT)) {
      profile_data_subset$about_text <- flatten_section(profile_data$ABOUT)
    }
    
    if ("EXPERIENCE" %in% names(profile_data) && is.list(profile_data$EXPERIENCE)) {
      profile_data_subset$experience_text <- flatten_section(profile_data$EXPERIENCE)
    }
    
    if ("EDUCATION" %in% names(profile_data) && is.list(profile_data$EDUCATION)) {
      profile_data_subset$education_text <- flatten_section(profile_data$EDUCATION)
    }
    
    # Add employment info to profile_data_subset
    profile_data_subset <- profile_data_subset %>%
      left_join(profile_employment, by = "profile_url")
    
    # Normalize URLs for matching (handles country-specific LinkedIn domains)
    normalize_url <- function(url) {
      if (is.na(url) || !nzchar(url)) return(NA_character_)
      url <- trimws(url)
      url <- gsub("/$", "", url)
      url <- gsub("^http://", "https://", url)
      # Remove www and country codes (ca., uk., de., fr., etc.)
      url <- gsub("^https://[a-z]{2,3}\\.linkedin\\.com", "https://linkedin.com", url)
      url <- gsub("^https://www\\.linkedin\\.com", "https://linkedin.com", url)
      url <- tolower(url)
      return(url)
    }
    
    employee_data[[profile_url_col]] <- sapply(employee_data[[profile_url_col]], normalize_url)
    profile_data_subset$profile_url <- sapply(profile_data_subset$profile_url, normalize_url)
    
    # Merge
    message("\nMerging profile data with employee data...")
    employee_data_enriched <- employee_data %>%
      left_join(
        profile_data_subset,
        by = setNames("profile_url", profile_url_col)
      )
    
    # Show merge stats
    with_profile_data <- sum(!is.na(employee_data_enriched$bebity_current_org))
    message(sprintf("✓ Merged! Employees with profile data: %d/%d", with_profile_data, nrow(employee_data_enriched)))
    
    # Create combined profile text for classification
    employee_data_enriched$profile_text_for_classification <- sapply(1:nrow(employee_data_enriched), function(i) {
      parts <- c()
      
      # Prefer bebity title over original jobTitle
      if ("bebity_current_title" %in% names(employee_data_enriched) && !is.na(employee_data_enriched$bebity_current_title[i])) {
        parts <- c(parts, paste("Title:", employee_data_enriched$bebity_current_title[i]))
      } else if ("jobTitle" %in% names(employee_data_enriched) && !is.na(employee_data_enriched$jobTitle[i])) {
        parts <- c(parts, paste("Title:", employee_data_enriched$jobTitle[i]))
      }
      
      if ("headline" %in% names(employee_data_enriched) && !is.na(employee_data_enriched$headline[i])) {
        parts <- c(parts, paste("Headline:", employee_data_enriched$headline[i]))
      }
      
      if ("bebity_current_org" %in% names(employee_data_enriched) && !is.na(employee_data_enriched$bebity_current_org[i])) {
        parts <- c(parts, paste("Current Org:", employee_data_enriched$bebity_current_org[i]))
      }
      
      if ("about_text" %in% names(employee_data_enriched) && !is.na(employee_data_enriched$about_text[i])) {
        parts <- c(parts, paste("About:", substr(employee_data_enriched$about_text[i], 1, 500)))
      }
      
      if ("experience_text" %in% names(employee_data_enriched) && !is.na(employee_data_enriched$experience_text[i])) {
        parts <- c(parts, paste("Experience:", substr(employee_data_enriched$experience_text[i], 1, 1000)))
      }
      
      if (length(parts) > 0) {
        return(paste(parts, collapse = "\n"))
      }
      
      return("Limited profile information available")
    })
    
    message(sprintf("✓ Enriched %d employees with profile data", nrow(employee_data_enriched)))
    
  } else if (nrow(profile_data) > 0) {
    # Profile data exists but no EXPERIENCE column - basic merge
    message("⚠ No EXPERIENCE column in profile data, using basic enrichment")
    
    profile_data_subset <- data.frame(
      profile_url = if ("url" %in% names(profile_data)) profile_data$url else NA_character_,
      stringsAsFactors = FALSE
    )
    
    if ("ABOUT" %in% names(profile_data) && is.list(profile_data$ABOUT)) {
      profile_data_subset$about_text <- flatten_section(profile_data$ABOUT)
    }
    
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
    
    employee_data[[profile_url_col]] <- sapply(employee_data[[profile_url_col]], normalize_url)
    profile_data_subset$profile_url <- sapply(profile_data_subset$profile_url, normalize_url)
    
    employee_data_enriched <- employee_data %>%
      left_join(profile_data_subset, by = setNames("profile_url", profile_url_col))
    
    employee_data_enriched$profile_text_for_classification <- paste(
      "Title:", employee_data_enriched$jobTitle,
      "\nHeadline:", employee_data_enriched$headline
    )
    
  } else {
    # No profile data - use basic employee data
    message("⚠ No profile data retrieved, using basic employee data")
    employee_data_enriched <- employee_data
    employee_data_enriched$profile_text_for_classification <- paste(
      "Title:", employee_data$jobTitle,
      "\nHeadline:", employee_data$headline
    )
  }
  
  # Save
  saver(employee_data_enriched, save_name_employees_enriched)
  message(sprintf("\n💾 Saved to: %s", save_name_employees_enriched))
  
} else if (resume_from_step <= 3) {
  # Skipping profile enrichment
  message("\n")
  message("================================================================================")
  message("STEP 3: Skipping Profile Enrichment (run_profile_enrichment = FALSE)")
  message("================================================================================\n")
  
  if (!exists("employee_data") || nrow(employee_data) == 0) {
    message("Loading previous employee data...")
    employee_data <- loadr(save_name_employees)
  }
  
  employee_data_enriched <- employee_data
  employee_data_enriched$profile_text_for_classification <- paste(
    "Title:", employee_data$jobTitle,
    "\nHeadline:", employee_data$headline
  )
  
  saver(employee_data_enriched, save_name_employees_enriched)
  message(sprintf("💾 Saved to: %s", save_name_employees_enriched))
}

################################################################################
## STEP 4: CLASSIFY JOB LEVEL AND IT AREA WITH GPT
################################################################################

if (resume_from_step <= 4) {
  message("\n")
  message("================================================================================")
  message("STEP 4: Classifying Job Level and IT Area")
  message("================================================================================")
  
  # Load enriched data if not in memory
  if (!exists("employee_data_enriched") || nrow(employee_data_enriched) == 0) {
    message("Loading previous enriched employee data...")
    employee_data_enriched <- loadr(save_name_employees_enriched)
  }
  
  message(sprintf("Classifying %d IT employees...\n", nrow(employee_data_enriched)))
  
  # Classify Job Level
  message("Classifying Job Level (C-Level, VP, Director, Manager, Senior, Analyst)...")
  
  job_level_prompt <- "Based on this person's profile information, classify their job level.

Profile:
[profile_text_for_classification]

Job Level Options:
- C-Level: CIO, CTO, Chief Digital Officer, Chief Information Security Officer, etc.
- VP: Vice President of IT, VP of Information Systems, etc.
- Director: Director of IT, IT Director, Director of Clinical Informatics, etc.
- Manager: IT Manager, Manager of Applications, etc.
- Senior: Senior positions (Senior Analyst, Senior Engineer, Senior Architect, etc.)
- Analyst: Analyst, Specialist, Coordinator, Administrator roles

Reply with ONLY ONE of these exact words: C-Level, VP, Director, Manager, Senior, Analyst
Reply with only one word, nothing else."
  
  employee_data_enriched$job_level <- gpt.batch.validated(
    employee_data_enriched,
    job_level_prompt,
    valid_values = c("C-Level", "VP", "Director", "Manager", "Senior", "Analyst"),
    model.in = "gpt-4o-mini"
  )
  
  message("✓ Job level classification complete")
  message("\nJob level breakdown:")
  print(table(employee_data_enriched$job_level))
  
  # Classify IT Area
  message("\nClassifying IT Area (Admin/Leadership, Clinical IT, Infrastructure, Security, Applications, Other)...")
  
  it_area_prompt <- "Based on this person's profile information, classify their primary IT area.

Profile:
[profile_text_for_classification]

IT Area Options:
- Admin/Leadership: IT administration, strategy, governance, management
- Clinical IT: Clinical informatics, EHR, clinical applications, clinical systems
- Infrastructure: Networks, servers, data centers, cloud infrastructure, desktop support
- Security: Cybersecurity, information security, privacy, compliance
- Applications: Application development, software engineering, business applications
- Other: Analytics, data, project management, vendor management, or other areas

Reply with ONLY ONE of these exact phrases: Admin/Leadership, Clinical IT, Infrastructure, Security, Applications, Other
Reply with only one phrase, nothing else."
  
  employee_data_enriched$it_area <- gpt.batch.validated(
    employee_data_enriched,
    it_area_prompt,
    valid_values = c("Admin/Leadership", "Clinical IT", "Infrastructure", "Security", "Applications", "Other"),
    model.in = "gpt-4o-mini"
  )
  
  message("✓ IT area classification complete")
  message("\nIT area breakdown:")
  print(table(employee_data_enriched$it_area))
  
  # Save
  saver(employee_data_enriched, save_name_employees_enriched)
  message(sprintf("\n💾 Saved to: %s", save_name_employees_enriched))
}

################################################################################
## STEP 5: CREATE FINAL DATASET
################################################################################

if (resume_from_step <= 5) {
  message("\n")
  message("================================================================================")
  message("STEP 5: Creating Final Dataset")
  message("================================================================================")
  
  # Load enriched data if not in memory
  if (!exists("employee_data_enriched") || nrow(employee_data_enriched) == 0) {
    message("Loading previous enriched employee data...")
    employee_data_enriched <- loadr(save_name_employees_enriched)
  }
  
  # Select columns for final export
  final_cols_preferred <- c(
    "name", "firstName", "lastName", "jobTitle", "headline",
    "company", "linkedinUrl", "location", "industry",
    "job_level", "it_area",
    "bebity_current_org", "bebity_current_title", "bebity_time_in_role",
    "about_text", "experience_text", "education_text"
  )
  
  available_cols <- intersect(final_cols_preferred, names(employee_data_enriched))
  
  final_dataset <- employee_data_enriched %>%
    select(all_of(available_cols))
  
  # Sort by job level (seniority) then IT area
  job_level_order <- c("C-Level", "VP", "Director", "Manager", "Senior", "Analyst")
  
  final_dataset <- final_dataset %>%
    arrange(
      factor(job_level, levels = job_level_order),
      it_area,
      company
    )
  
  message(sprintf("\n✓ Final dataset prepared with %d IT contacts", nrow(final_dataset)))
  
  message("\nBreakdown by Job Level:")
  print(table(final_dataset$job_level))
  
  message("\nBreakdown by IT Area:")
  print(table(final_dataset$it_area))
  
  message("\nTop companies by number of IT contacts:")
  top_companies <- final_dataset %>%
    count(company, sort = TRUE) %>%
    head(10)
  print(top_companies)
  
  # Save
  saver(final_dataset, save_name_final)
  message(sprintf("\n💾 Saved to: %s", save_name_final))
  
  # Export to CSV
  output_csv <- "Health_System_IT_Contacts_Final.csv"
  write.csv(final_dataset, output_csv, row.names = FALSE)
  message(sprintf("📊 Exported to CSV: %s", output_csv))
}

################################################################################
## PIPELINE COMPLETE - SUMMARY
################################################################################

message("\n")
message("================================================================================")
message("PIPELINE COMPLETE!")
message("================================================================================")

if (exists("final_dataset") && nrow(final_dataset) > 0) {
  message(sprintf("\n✅ Successfully identified %d IT contacts across health systems", nrow(final_dataset)))
  
  message("\n📊 Summary by Job Level:")
  level_summary <- final_dataset %>%
    count(job_level, sort = TRUE)
  print(level_summary)
  
  message("\n📊 Summary by IT Area:")
  area_summary <- final_dataset %>%
    count(it_area, sort = TRUE)
  print(area_summary)
  
  message("\n📁 Files created:")
  message(sprintf("   1. %s - R object (use loadr() to reload)", save_name_final))
  message("   2. Health_System_IT_Contacts_Final.csv - CSV export")
  
  message("\n💡 Next steps:")
  message("   - Filter by job level for targeted outreach")
  message("   - Filter by IT area for specialized campaigns")
  message("   - Use LinkedIn URLs for direct contact")
  
  message("\n🎯 Sample C-Level contacts:")
  sample_c_level <- final_dataset %>%
    filter(job_level == "C-Level") %>%
    select(name, jobTitle, company, it_area) %>%
    head(5)
  
  if (nrow(sample_c_level) > 0) {
    print(sample_c_level)
  } else {
    message("   (No C-Level contacts found)")
  }
}

message("\n================================================================================")
message("All done! 🎉")
message("================================================================================\n")

