#########################################################################################################################################
# LINKEDIN COMPANY EMPLOYEES SCRAPER - HARVESTAPI
# Apify Actor: harvestapi/linkedin-company-employees
#
# Description:
# Advanced LinkedIn employee scraper with extensive filtering options.
# Supports seniority levels, job functions, locations, and more.
#
# Pricing:
# - Short mode: $4 per 1000 profiles (name, URL, summary, location, current positions)
# - Full mode: $8 per 1000 profiles (complete work history, education, skills)
# - Full + email: $12 per 1000 profiles (includes email search)
#
# Key Features:
# - Batch modes: "all_at_once" (up to 10 companies) or "one_by_one" (up to 1000 companies)
# - Filters: seniority level, job function, location, industry, years at company
# - Pagination: control pages and items per company
# - High success rate compared to other actors
#########################################################################################################################################

# Load required libraries
library(httr)
library(jsonlite)
library(dplyr)

#########################################################################################################################################
# CONFIGURATION
#########################################################################################################################################

# Get API token from environment variable
apify_token <- Sys.getenv("APIFY_API_KEY", unset = NA)

# Actor ID (use ~ instead of /)
ACTOR_ID <- "harvestapi~linkedin-company-employees"

# Standard output folder for LinkedIn contact searches
LINKEDIN_CONTACTS_FOLDER <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Input Files/In Process AI/LinkedIn Search Contacts"

# Helper operator for NULL coalescing
`%||%` <- function(a, b) if (is.null(a)) b else a

#########################################################################################################################################
# HELPER FUNCTION - SAVE TO STANDARD FOLDER
#########################################################################################################################################

# Save CSV results to standard LinkedIn contacts folder
save_harvest_results_csv <- function(data_frame, filename) {
  if (!dir.exists(LINKEDIN_CONTACTS_FOLDER)) {
    dir.create(LINKEDIN_CONTACTS_FOLDER, recursive = TRUE)
    cat("📁 Created standard output folder:", LINKEDIN_CONTACTS_FOLDER, "\n")
  }
  
  output_path <- file.path(LINKEDIN_CONTACTS_FOLDER, filename)
  write.csv(data_frame, output_path, row.names = FALSE, na = "")
  cat("💾 Saved", nrow(data_frame), "profiles to:", output_path, "\n")
  
  return(invisible(output_path))
}

#########################################################################################################################################
# REFERENCE DATA - LINKEDIN IDS
#########################################################################################################################################

# Seniority Level IDs
# Use these in seniorityLevelIds parameter
# IMPORTANT: Only these IDs are valid per API error messages
# Based on Apify UI testing: "120" may represent Manager, "220" may represent Director
SENIORITY_LEVELS <- list(
  unpaid = "100",
  training = "110",
  entry_or_manager = "120",  # UI shows this for "Manager" selections
  # 130, 200, 210 are valid IDs but unknown mappings
  senior_or_director = "220",  # UI shows this for "Director" selections
  vp = "300",
  cxo = "310",
  partner = "320"
  # Note: "owner" (330), "manager" (230), "director" (240) are NOT valid per API
  # You can also pass numeric IDs directly as strings: c("120", "220", "300")
)

# Job Function IDs  
# Use these in functionIds parameter
JOB_FUNCTIONS <- list(
  accounting = "1",
  administrative = "2",
  arts_design = "3",
  business_development = "4",
  community_social_services = "5",
  consulting = "6",
  education = "7",
  engineering = "8",
  entrepreneurship = "9",
  finance = "10",
  healthcare_services = "11",
  human_resources = "12",
  information_technology = "13",
  legal = "14",
  marketing = "15",
  media_communication = "16",
  military_protective_services = "17",
  operations = "18",
  product_management = "19",
  program_project_management = "20",
  purchasing = "21",
  quality_assurance = "22",
  real_estate = "23",
  research = "24",
  sales = "25",
  support = "26"
)

#########################################################################################################################################
# CORE FUNCTION - CALL APIFY ACTOR
#########################################################################################################################################

call_harvestapi_actor <- function(companies,
                                   company_batch_mode = "all_at_once",
                                   profile_scraper_mode = "Short ($4 per 1k)",
                                   seniority_level_ids = NULL,
                                   function_ids = NULL,
                                   locations = NULL,
                                   search_query = NULL,
                                   job_titles = NULL,
                                   industry_ids = NULL,
                                   years_at_company = NULL,
                                   max_items = 25,
                                   max_items_per_company = NULL,
                                   start_page = 1,
                                   take_pages = NULL,
                                   recently_changed_jobs = FALSE,
                                   api_token = NULL,
                                   wait_for_finish = TRUE,
                                   timeout = 600) {
  
  # Use provided token or get from environment
  if (is.null(api_token)) {
    api_token <- Sys.getenv("APIFY_API_KEY", unset = NA)
    if (is.na(api_token)) {
      stop("APIFY_API_KEY environment variable not set. Please set it with: Sys.setenv(APIFY_API_KEY = 'your_token')")
    }
  }
  
  # ============================================================================
  # COST & TIMEOUT SAFEGUARDS - Prevent expensive runaway jobs
  # ============================================================================
  
  # Validate batch mode
  if (company_batch_mode == "all_at_once" && length(companies) > 10) {
    warning("'all_at_once' mode limited to 10 companies. Consider using 'one_by_one' mode for more companies.")
    companies <- head(companies, 10)
  }
  
  if (company_batch_mode == "one_by_one" && length(companies) > 1000) {
    warning("'one_by_one' mode limited to 1000 companies.")
    companies <- head(companies, 1000)
  }
  
  # CRITICAL: Prevent excessively large requests that can timeout and keep running
  # Maximum safe limits based on testing:
  # - one_by_one mode: Max 5 companies per run OR max 10,000 total profiles
  # - all_at_once mode: Max 10 companies per run OR max 5,000 total profiles
  
  if (company_batch_mode == "one_by_one") {
    # Calculate estimated max profiles
    estimated_profiles <- length(companies) * (max_items_per_company %||% 1000)
    
    # Hard limit: 5 companies OR 10,000 profiles in one_by_one mode
    if (length(companies) > 5) {
      stop(sprintf(
        "❌ SAFETY LIMIT: Cannot process %d companies in one actor run (one_by_one mode).\n",
        length(companies),
        "   Maximum: 5 companies per run to prevent timeouts and runaway costs.\n",
        "   \n",
        "   💡 Solution: Process companies in smaller batches.\n",
        "   Example:\n",
        "     for (i in seq(1, length(all_urls), by = 5)) {\n",
        "       batch <- all_urls[i:min(i+4, length(all_urls))]\n",
        "       result <- scrape_linkedin_employees(batch, ...)\n",
        "     }\n"
      ))
    }
    
    if (estimated_profiles > 10000) {
      stop(sprintf(
        "❌ SAFETY LIMIT: Estimated %d profiles exceeds 10,000 limit for one_by_one mode.\n",
        estimated_profiles,
        "   This could cause timeouts and runaway costs.\n",
        "   \n",
        "   Current settings:\n",
        "   - Companies: %d\n",
        "   - Max per company: %d\n",
        "   - Estimated total: %d\n",
        "   \n",
        "   💡 Solutions:\n",
        "   1. Reduce companies (max 5)\n",
        "   2. Reduce max_items_per_company (e.g., 500)\n",
        "   3. Reduce take_pages (e.g., 20)\n",
        length(companies), 
        max_items_per_company %||% 1000,
        estimated_profiles
      ))
    }
  }
  
  if (company_batch_mode == "all_at_once") {
    estimated_profiles <- length(companies) * (max_items_per_company %||% 500)
    
    if (estimated_profiles > 5000) {
      stop(sprintf(
        "❌ SAFETY LIMIT: Estimated %d profiles exceeds 5,000 limit for all_at_once mode.\n",
        estimated_profiles,
        "   This could cause timeouts and runaway costs.\n",
        "   \n",
        "   💡 Solutions:\n",
        "   1. Reduce companies (current: %d)\n",
        "   2. Reduce max_items_per_company (current: %d)\n",
        length(companies),
        max_items_per_company %||% 500
      ))
    }
  }
  
  # Warn about expensive configurations
  if (!is.null(max_items_per_company) && max_items_per_company > 1000) {
    warning(sprintf(
      "⚠️  COST WARNING: max_items_per_company = %d is very high.\n",
      max_items_per_company,
      "   This will be expensive and may timeout.\n",
      "   Recommended: 500 or less for most use cases.\n"
    ))
  }
  
  if (!is.null(take_pages) && take_pages > 20) {
    warning(sprintf(
      "⚠️  COST WARNING: take_pages = %d is very high.\n",
      take_pages,
      "   This will be expensive and may timeout.\n",
      "   Recommended: 10-20 pages for most use cases.\n"
    ))
  }
  
  # Build input data
  input_data <- list(
    companies = as.list(companies),  # Wrap in list to prevent auto_unbox from converting single company to string
    companyBatchMode = company_batch_mode,
    profileScraperMode = profile_scraper_mode,
    maxItems = max_items,
    startPage = start_page,
    recentlyChangedJobs = recently_changed_jobs
  )
  
  # Add optional parameters - wrap in list() to ensure arrays stay as arrays in JSON
  if (!is.null(seniority_level_ids)) input_data$seniorityLevelIds <- as.list(as.character(seniority_level_ids))
  if (!is.null(function_ids)) input_data$functionIds <- as.list(as.character(function_ids))
  if (!is.null(locations)) input_data$locations <- as.list(locations)
  if (!is.null(search_query)) input_data$searchQuery <- search_query
  if (!is.null(job_titles)) input_data$jobTitles <- as.list(job_titles)
  if (!is.null(industry_ids)) input_data$industryIds <- as.list(as.character(industry_ids))
  if (!is.null(years_at_company)) input_data$yearsAtCompany <- years_at_company
  if (!is.null(max_items_per_company)) input_data$maxItemsPerCompany <- max_items_per_company
  if (!is.null(take_pages)) input_data$takePages <- take_pages
  
  cat("🚀 Starting Apify actor run...\n")
  cat("🏢 Companies:", length(companies), "\n")
  cat("💰 Mode:", profile_scraper_mode, "\n")
  cat("📊 Batch mode:", company_batch_mode, "\n")
  
  # Start the actor
  start_url <- paste0("https://api.apify.com/v2/acts/", ACTOR_ID, "/runs")
  
  # Convert to JSON - auto_unbox = TRUE, but arrays are already wrapped in list()
  json_body <- toJSON(input_data, auto_unbox = TRUE)
  
  response <- POST(
    url = start_url,
    query = list(token = api_token),
    body = json_body,
    content_type_json(),
    encode = "raw"
  )
  
  if (status_code(response) != 201) {
    stop("Failed to start actor: ", status_code(response), " Response: ", content(response, "text"))
  }
  
  run_info <- content(response)
  run_id <- run_info$data$id
  
  cat("✅ Actor run started. Run ID:", run_id, "\n")
  
  if (!wait_for_finish) {
    return(list(
      run_id = run_id,
      status = "RUNNING",
      message = "Actor started but not waiting for completion"
    ))
  }
  
  # Wait for completion
  cat("⏳ Waiting for actor to finish (timeout:", timeout, "seconds)...\n")
  cat("   This may take several minutes for large queries.\n")
  
  status_url <- paste0("https://api.apify.com/v2/acts/", ACTOR_ID, "/runs/", run_id)
  
  start_time <- Sys.time()
  while (TRUE) {
    Sys.sleep(10)
    
    status_response <- GET(
      url = status_url,
      query = list(token = api_token)
    )
    
    if (status_code(status_response) != 200) {
      stop("Failed to get run status: ", status_code(status_response))
    }
    
    run_data <- content(status_response)
    current_status <- run_data$data$status
    
    cat("   Status:", current_status, "\n")
    
    if (current_status %in% c("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT")) {
      break
    }
    
    if (as.numeric(difftime(Sys.time(), start_time, units = "secs")) > timeout) {
      stop("Actor run timed out after ", timeout, " seconds")
    }
  }
  
  if (current_status != "SUCCEEDED") {
    stop("Actor run failed with status: ", current_status)
  }
  
  # Fetch results
  cat("📥 Fetching results...\n")
  
  dataset_id <- run_data$data$defaultDatasetId
  results_url <- paste0("https://api.apify.com/v2/datasets/", dataset_id, "/items")
  
  results_response <- GET(
    url = results_url,
    query = list(token = api_token)
  )
  
  if (status_code(results_response) != 200) {
    stop("Failed to fetch results: ", status_code(results_response))
  }
  
  results <- content(results_response)
  
  cat("✅ Got", length(results), "employee profiles\n")
  
  return(list(
    run_id = run_id,
    status = current_status,
    results = results,
    input = input_data
  ))
}

#########################################################################################################################################
# MAIN FUNCTION - SCRAPE COMPANY EMPLOYEES
#########################################################################################################################################

scrape_linkedin_employees <- function(companies,
                                      company_batch_mode = "all_at_once",
                                      profile_scraper_mode = "Short ($4 per 1k)",
                                      seniority_levels = NULL,
                                      job_functions = NULL,
                                      locations = NULL,
                                      search_query = NULL,
                                      job_titles = NULL,
                                      industry_ids = NULL,
                                      years_at_company = NULL,
                                      max_items = 25,
                                      max_items_per_company = NULL,
                                      start_page = 1,
                                      take_pages = NULL,
                                      recently_changed_jobs = FALSE,
                                      api_token = NULL,
                                      wait_for_finish = TRUE,
                                      timeout = 600,
                                      return_df = TRUE) {
  
  cat("\n", "=", rep("=", 80), "\n", sep = "")
  cat("👥 HARVESTAPI LINKEDIN COMPANY EMPLOYEES SCRAPER\n")
  cat("=", rep("=", 80), "\n", sep = "")
  
  # Convert seniority level names to IDs if provided as names
  seniority_ids <- NULL
  if (!is.null(seniority_levels)) {
    if (is.character(seniority_levels) && all(seniority_levels %in% names(SENIORITY_LEVELS))) {
      seniority_ids <- unlist(SENIORITY_LEVELS[seniority_levels])
      cat("🎯 Seniority:", paste(seniority_levels, collapse = ", "), "\n")
    } else {
      seniority_ids <- as.character(seniority_levels)
    }
  }
  
  # Convert function names to IDs if provided as names
  function_ids <- NULL
  if (!is.null(job_functions)) {
    if (is.character(job_functions) && all(job_functions %in% names(JOB_FUNCTIONS))) {
      function_ids <- unlist(JOB_FUNCTIONS[job_functions])
      cat("💼 Functions:", paste(job_functions, collapse = ", "), "\n")
    } else {
      function_ids <- as.character(job_functions)
    }
  }
  
  # Call the actor
  result <- call_harvestapi_actor(
    companies = companies,
    company_batch_mode = company_batch_mode,
    profile_scraper_mode = profile_scraper_mode,
    seniority_level_ids = seniority_ids,
    function_ids = function_ids,
    locations = locations,
    search_query = search_query,
    job_titles = job_titles,
    industry_ids = industry_ids,
    years_at_company = years_at_company,
    max_items = max_items,
    max_items_per_company = max_items_per_company,
    start_page = start_page,
    take_pages = take_pages,
    recently_changed_jobs = recently_changed_jobs,
    api_token = api_token,
    wait_for_finish = wait_for_finish,
    timeout = timeout
  )
  
  # Convert to data frame if requested
  if (return_df && !is.null(result$results) && length(result$results) > 0) {
    cat("📋 Parsing results to data frame...\n")
    
    # Use Full mode parser if Full mode was selected
    if (grepl("Full", profile_scraper_mode, ignore.case = TRUE)) {
      result$results_df <- parse_harvestapi_full_results(result$results)
    } else {
      result$results_df <- parse_harvestapi_results(result$results)
    }
    
    # Auto-save each scrape to standard LinkedIn folder
    if (!is.null(result$results_df) && nrow(result$results_df) > 0) {
      tryCatch({
        # Create folder if needed
        if (!dir.exists(LINKEDIN_CONTACTS_FOLDER)) {
          dir.create(LINKEDIN_CONTACTS_FOLDER, recursive = TRUE)
        }
        
        # Generate unique filename with timestamp
        timestamp <- format(Sys.time(), "%Y%m%d_%H%M%S")
        
        # Try to extract company name for filename
        company_name <- "unknown"
        if (!is.null(result$results_df$currentCompany) && any(!is.na(result$results_df$currentCompany))) {
          # Get most common company name
          company_counts <- table(result$results_df$currentCompany[!is.na(result$results_df$currentCompany)])
          company_name <- names(company_counts)[which.max(company_counts)]
          # Clean filename
          company_name <- gsub("[^A-Za-z0-9_-]", "_", company_name)
          company_name <- substr(company_name, 1, 50)  # Limit length
        }
        
        filename <- sprintf("harvest_%s_%s_%dprofiles.csv", 
                           timestamp, company_name, nrow(result$results_df))
        filepath <- file.path(LINKEDIN_CONTACTS_FOLDER, filename)
        
        write.csv(result$results_df, filepath, row.names = FALSE, na = "")
        cat("💾 Auto-saved to:", filepath, "\n")
      }, error = function(e) {
        cat("⚠️  Could not auto-save:", e$message, "\n")
      })
    }
  }
  
  return(result)
}

#########################################################################################################################################
# PARSING FUNCTIONS
#########################################################################################################################################

# ============================================
# HELPER FUNCTIONS FOR FULL MODE PARSING
# ============================================

# Safely get a value or NA
get_or_na <- function(x) {
  if (is.null(x)) NA_character_ else as.character(x)
}

# Build one big paragraph from the experience list
make_experience_paragraph <- function(exp_list) {
  if (is.null(exp_list) || length(exp_list) == 0) return(NA_character_)
  
  roles <- lapply(exp_list, function(role) {
    pos  <- get_or_na(role$position)
    comp <- get_or_na(role$companyName)
    loc  <- get_or_na(role$location)
    dur  <- get_or_na(role$duration)
    desc <- get_or_na(role$description)
    
    line1 <- if (!is.na(pos) || !is.na(comp)) {
      paste0(if (!is.na(pos)) pos else "",
             if (!is.na(comp)) paste0(" at ", comp) else "")
    } else {
      NA_character_
    }
    
    bits <- c(line1,
              if (!is.na(loc)) paste0("Location: ", loc) else NA,
              if (!is.na(dur)) paste0("Duration: ", dur) else NA,
              if (!is.na(desc)) desc else NA)
    
    paste(na.omit(bits), collapse = "\n")
  })
  
  paste(unlist(roles), collapse = "\n\n")
}

# Build one big paragraph from the education list
make_education_paragraph <- function(ed_list) {
  if (is.null(ed_list) || length(ed_list) == 0) return(NA_character_)
  
  entries <- lapply(ed_list, function(ed) {
    school <- get_or_na(ed$schoolName)
    degree <- get_or_na(ed$degree)
    field  <- get_or_na(ed$fieldOfStudy)
    
    start <- if (!is.null(ed$startDate)) get_or_na(ed$startDate$text) else NA_character_
    end   <- if (!is.null(ed$endDate))   get_or_na(ed$endDate$text)   else NA_character_
    
    dates <- if (!all(is.na(c(start, end)))) {
      paste(na.omit(c(start, end)), collapse = " - ")
    } else {
      NA_character_
    }
    
    bits <- c(
      if (!is.na(school)) school else NA,
      if (!all(is.na(c(degree, field)))) paste(na.omit(c(degree, field)), collapse = ", ") else NA,
      if (!is.na(dates)) paste0("Dates: ", dates) else NA
    )
    
    paste(na.omit(bits), collapse = "\n")
  })
  
  paste(unlist(entries), collapse = "\n\n")
}

# ============================================
# FULL MODE PARSER (for "Full" profile mode)
# ============================================

# Parse Full mode results with experience and education paragraphs
parse_harvestapi_full_results <- function(results) {
  if (is.null(results) || length(results) == 0) {
    cat("⚠️ No results to parse\n")
    return(data.frame(
      first_name = character(0),
      last_name = character(0),
      linkedin_url = character(0),
      current_title = character(0),
      current_company = character(0),
      headline = character(0),
      about = character(0),
      experience_paragraph = character(0),
      education_paragraph = character(0),
      location = character(0),
      open_profile = logical(0),
      premium = logical(0),
      stringsAsFactors = FALSE
    ))
  }
  
  # Keep only the "full profiles" (those with headline or experience)
  profiles <- Filter(function(x) !is.null(x$headline) || !is.null(x$experience), results)
  
  if (length(profiles) == 0) {
    cat("⚠️  No full profiles found in results.\n")
    cat("   💡 Tip: Use 'Full ($8 per 1k)' mode to get experience and education data.\n")
    return(data.frame(
      first_name = character(0),
      last_name = character(0),
      linkedin_url = character(0),
      current_title = character(0),
      current_company = character(0),
      headline = character(0),
      about = character(0),
      experience_paragraph = character(0),
      education_paragraph = character(0),
      location = character(0),
      open_profile = logical(0),
      premium = logical(0),
      stringsAsFactors = FALSE
    ))
  }
  
  # Build a data.frame with the desired columns
  profiles_df <- do.call(
    rbind,
    lapply(profiles, function(p) {
      
      # Current role: assume experience is in reverse-chronological order
      exp_list <- p$experience
      if (!is.null(exp_list) && length(exp_list) > 0) {
        curr <- exp_list[[1]]
        current_title   <- get_or_na(curr$position)
        current_company <- get_or_na(curr$companyName)
      } else {
        current_title   <- NA_character_
        current_company <- NA_character_
      }
      
      # Extract location
      location <- if (!is.null(p$location)) {
        if (is.character(p$location)) {
          p$location
        } else if (!is.null(p$location$linkedinText)) {
          p$location$linkedinText
        } else {
          NA_character_
        }
      } else {
        NA_character_
      }
      
      data.frame(
        first_name           = get_or_na(p$firstName),
        last_name            = get_or_na(p$lastName),
        linkedin_url         = get_or_na(p$linkedinUrl),
        current_title        = current_title,
        current_company      = current_company,
        headline             = get_or_na(p$headline),
        about                = get_or_na(p$about),
        experience_paragraph = make_experience_paragraph(exp_list),
        education_paragraph  = make_education_paragraph(p$education),
        location             = location,
        open_profile         = if (is.null(p$openProfile)) NA else p$openProfile,
        premium              = if (is.null(p$premium)) NA else p$premium,
        stringsAsFactors     = FALSE
      )
    })
  )
  
  if (nrow(profiles_df) > 0) {
    cat("✅ Parsed", nrow(profiles_df), "full profiles with experience & education\n")
    
    # Summary stats
    n_open <- sum(profiles_df$open_profile, na.rm = TRUE)
    n_premium <- sum(profiles_df$premium, na.rm = TRUE)
    n_with_exp <- sum(!is.na(profiles_df$experience_paragraph), na.rm = TRUE)
    n_with_edu <- sum(!is.na(profiles_df$education_paragraph), na.rm = TRUE)
    
    cat("   📊 Open profiles:", n_open, "(", round(n_open/nrow(profiles_df)*100, 1), "%)\n")
    cat("   💎 Premium users:", n_premium, "(", round(n_premium/nrow(profiles_df)*100, 1), "%)\n")
    cat("   💼 With experience:", n_with_exp, "(", round(n_with_exp/nrow(profiles_df)*100, 1), "%)\n")
    cat("   🎓 With education:", n_with_edu, "(", round(n_with_edu/nrow(profiles_df)*100, 1), "%)\n")
  }
  
  return(profiles_df)
}

# ============================================
# SHORT MODE PARSER (for "Short" profile mode)
# ============================================

# Parse Short mode results into clean data frame
parse_harvestapi_results <- function(results) {
  if (is.null(results) || length(results) == 0) {
    cat("⚠️ No results to parse\n")
    return(data.frame())
  }
  
  tryCatch({
    # Extract key fields from each profile
    profiles_list <- lapply(results, function(profile) {
      # Extract current position (first one)
      current_pos <- NULL
      if (!is.null(profile$currentPositions) && length(profile$currentPositions) > 0) {
        current_pos <- profile$currentPositions[[1]]
      }
      
      # Extract location
      location <- profile$location$linkedinText %||% NA_character_
      
      # Extract LinkedIn URL - handle both entity URN and vanity URL
      linkedin_url_raw <- profile$linkedinUrl %||% NA_character_
      linkedin_url_clean <- NA_character_
      linkedin_id <- profile$id %||% NA_character_
      
      # Try to get public identifier (vanity URL part like "rodney-cotton")
      # The actor provides this as public_identifier (with underscore) or publicIdentifier
      public_id <- NA_character_
      
      if (!is.null(profile$public_identifier)) {
        # Remove /in/ prefix if present
        public_id <- gsub("^/in/", "", profile$public_identifier)
        linkedin_url_clean <- paste0("https://www.linkedin.com/in/", public_id, "/")
      } else if (!is.null(profile$publicIdentifier)) {
        public_id <- gsub("^/in/", "", profile$publicIdentifier)
        linkedin_url_clean <- paste0("https://www.linkedin.com/in/", public_id, "/")
      } else if (!is.na(linkedin_url_raw) && !grepl("ACw", linkedin_url_raw)) {
        # If linkedinUrl doesn't contain entity URN format, it might already be clean
        linkedin_url_clean <- linkedin_url_raw
        # Extract public ID from clean URL
        public_id <- gsub(".*linkedin\\.com/in/([^/]+)/?.*", "\\1", linkedin_url_raw)
      }
      
      # Build data frame row
      data.frame(
        firstName = profile$firstName %||% NA_character_,
        lastName = profile$lastName %||% NA_character_,
        linkedinUrl = linkedin_url_clean,  # Use clean URL if available
        linkedinEntityUrl = linkedin_url_raw,  # Keep entity URN URL as backup
        linkedinId = linkedin_id,  # Entity ID
        publicIdentifier = public_id,  # Vanity username
        location = location,
        summary = profile$summary %||% NA_character_,
        openProfile = profile$openProfile %||% FALSE,
        premium = profile$premium %||% FALSE,
        pictureUrl = profile$pictureUrl %||% NA_character_,
        
        # Current position fields
        currentTitle = current_pos$title %||% NA_character_,
        currentCompany = current_pos$companyName %||% NA_character_,
        currentCompanyUrl = current_pos$companyLinkedinUrl %||% NA_character_,
        startedMonth = current_pos$startedOn$month %||% NA_integer_,
        startedYear = current_pos$startedOn$year %||% NA_integer_,
        tenureMonths = current_pos$tenureAtPosition$numMonths %||% NA_integer_,
        tenureYears = current_pos$tenureAtPosition$numYears %||% NA_integer_,
        positionDescription = current_pos$description %||% NA_character_,
        
        stringsAsFactors = FALSE
      )
    })
    
    # Combine into single data frame
    df <- bind_rows(profiles_list)
    
    if (nrow(df) > 0) {
      cat("✅ Parsed", nrow(df), "profiles with", ncol(df), "fields\n")
      
      # Summary stats
      n_open <- sum(df$openProfile, na.rm = TRUE)
      n_premium <- sum(df$premium, na.rm = TRUE)
      n_clean_urls <- sum(!is.na(df$linkedinUrl), na.rm = TRUE)
      n_entity_only <- sum(is.na(df$linkedinUrl) & !is.na(df$linkedinEntityUrl), na.rm = TRUE)
      
      cat("   📊 Open profiles:", n_open, "(", round(n_open/nrow(df)*100, 1), "%)\n")
      cat("   💎 Premium users:", n_premium, "(", round(n_premium/nrow(df)*100, 1), "%)\n")
      cat("   🔗 Clean URLs:", n_clean_urls, "| Entity URLs only:", n_entity_only, "\n")
      
      if (n_entity_only > 0) {
        cat("   ℹ️  Use add_clean_urls(df) to resolve entity URLs to vanity URLs\n")
      }
      
      # Unique companies
      companies <- unique(df$currentCompany[!is.na(df$currentCompany)])
      cat("   🏢 Unique companies:", length(companies), "\n")
      
      return(df)
    }
    
    cat("⚠️ Could not parse results\n")
    return(data.frame())
    
  }, error = function(e) {
    cat("❌ Error parsing results:", e$message, "\n")
    return(data.frame())
  })
}

# Display preview of results
display_employees_preview <- function(df, max_rows = 10) {
  if (is.null(df) || !is.data.frame(df) || nrow(df) == 0) {
    cat("⚠️ No data to display\n")
    return(invisible(NULL))
  }
  
  cat("\n📊 Employees Preview:\n")
  cat("─────────────────────────────────────────────────────────────\n")
  cat("Total Profiles:", nrow(df), "\n")
  cat("Fields:", ncol(df), "\n\n")
  
  # Show key fields - prefer clean URL but show entity if that's all we have
  url_field <- if ("linkedinUrl" %in% names(df) && any(!is.na(df$linkedinUrl))) {
    "linkedinUrl"
  } else if ("linkedinEntityUrl" %in% names(df)) {
    "linkedinEntityUrl"
  } else {
    NULL
  }
  
  key_fields <- c("firstName", "lastName", "currentTitle", "currentCompany", "location")
  if (!is.null(url_field)) {
    key_fields <- c(key_fields, url_field)
  }
  
  available_keys <- key_fields[key_fields %in% names(df)]
  
  if (length(available_keys) > 0) {
    cat("🔍 First", min(max_rows, nrow(df)), "profiles:\n")
    preview_df <- head(df[, available_keys, drop = FALSE], max_rows)
    
    # Truncate long URLs for display
    if (!is.null(url_field) && url_field %in% names(preview_df)) {
      preview_df[[url_field]] <- substr(preview_df[[url_field]], 1, 60)
    }
    
    print(preview_df)
    cat("\n")
  }
  
  # Show URL status
  if ("linkedinUrl" %in% names(df) && "linkedinEntityUrl" %in% names(df)) {
    n_clean <- sum(!is.na(df$linkedinUrl))
    n_entity_only <- sum(is.na(df$linkedinUrl) & !is.na(df$linkedinEntityUrl))
    
    if (n_entity_only > 0) {
      cat("🔗 URL Status:\n")
      cat("   Clean vanity URLs:", n_clean, "\n")
      cat("   Entity URLs (need resolution):", n_entity_only, "\n")
      cat("   💡 Tip: Use add_clean_urls(df) to resolve entity URLs\n\n")
    }
  }
  
  # Count by current company
  if ("currentCompany" %in% names(df)) {
    cat("🏢 Top 5 Companies:\n")
    companies <- head(sort(table(df$currentCompany), decreasing = TRUE), 5)
    print(companies)
    cat("\n")
  }
  
  # Count by title
  if ("currentTitle" %in% names(df)) {
    cat("💼 Top 5 Titles:\n")
    titles <- head(sort(table(df$currentTitle), decreasing = TRUE), 5)
    print(titles)
    cat("\n")
  }
  
  return(invisible(df))
}

# Debug helper to see raw result structure
debug_harvest_results <- function(result, profile_num = 1) {
  if (is.null(result) || is.null(result$results)) {
    cat("❌ No results to debug\n")
    return(invisible(NULL))
  }
  
  cat("\n🐛 DEBUG: HarvestAPI Results Structure\n")
  cat("═════════════════════════════════════════════\n\n")
  
  cat("Total profiles:", length(result$results), "\n\n")
  
  if (length(result$results) >= profile_num) {
    profile <- result$results[[profile_num]]
    
    cat("Profile", profile_num, "fields:\n")
    print(names(profile))
    
    cat("\n\nSample values:\n")
    cat("  firstName:", profile$firstName %||% "NULL", "\n")
    cat("  lastName:", profile$lastName %||% "NULL", "\n")
    cat("  linkedinUrl:", profile$linkedinUrl %||% "NULL", "\n")
    cat("  public_identifier:", profile$public_identifier %||% "NULL", "\n")
    cat("  publicIdentifier:", profile$publicIdentifier %||% "NULL", "\n")
    cat("  id:", profile$id %||% "NULL", "\n")
    
    if (!is.null(profile$currentPositions) && length(profile$currentPositions) > 0) {
      cat("\n  currentPositions[1] fields:\n")
      print(names(profile$currentPositions[[1]]))
    }
  }
  
  cat("\n═════════════════════════════════════════════\n\n")
  return(invisible(NULL))
}

# Abort a running actor (emergency stop to prevent runaway costs)
abort_actor_run <- function(run_id, api_token = NULL) {
  if (is.null(api_token)) {
    api_token <- Sys.getenv("APIFY_API_KEY", unset = NA)
    if (is.na(api_token)) {
      stop("APIFY_API_KEY environment variable not set")
    }
  }
  
  cat("🛑 Aborting actor run:", run_id, "\n")
  
  abort_url <- paste0("https://api.apify.com/v2/acts/", ACTOR_ID, "/runs/", run_id, "/abort")
  
  response <- POST(
    url = abort_url,
    query = list(token = api_token)
  )
  
  if (status_code(response) == 200) {
    cat("✅ Actor run aborted successfully\n")
    return(TRUE)
  } else {
    cat("❌ Failed to abort actor run:", status_code(response), "\n")
    return(FALSE)
  }
}

# Save results to CSV (now uses standard folder by default)
save_employees_csv <- function(df, filename = "linkedin_employees_harvest.csv", use_standard_folder = TRUE) {
  if (is.null(df) || !is.data.frame(df) || nrow(df) == 0) {
    cat("⚠️ No data to save\n")
    return(invisible(NULL))
  }
  
  if (use_standard_folder) {
    # Use standard LinkedIn contacts folder
    return(save_harvest_results_csv(df, filename))
  } else {
    # Save to current working directory
    write.csv(df, filename, row.names = FALSE, na = "")
    cat("💾 Saved", nrow(df), "profiles to:", filename, "\n")
    return(invisible(df))
  }
}

# Helper: Get clean LinkedIn URLs by following redirects from entity URNs
# Note: This makes HTTP requests to LinkedIn which may be rate-limited
get_clean_linkedin_urls <- function(entity_urls, max_profiles = 10) {
  if (length(entity_urls) == 0) {
    cat("⚠️ No URLs to process\n")
    return(character(0))
  }
  
  if (length(entity_urls) > max_profiles) {
    warning("Processing first ", max_profiles, " URLs to avoid rate limiting. Set max_profiles higher if needed.")
    entity_urls <- head(entity_urls, max_profiles)
  }
  
  cat("🔗 Resolving", length(entity_urls), "entity URLs to clean vanity URLs...\n")
  cat("   This may take a moment and could trigger rate limiting.\n")
  
  clean_urls <- sapply(entity_urls, function(url) {
    if (is.na(url) || !grepl("linkedin.com", url)) {
      return(NA_character_)
    }
    
    tryCatch({
      # Make HEAD request to get redirect location
      response <- HEAD(url, config = config(followlocation = FALSE))
      
      # Get redirect location
      redirect_url <- response$headers$location
      
      if (!is.null(redirect_url)) {
        # Clean up the URL
        clean_url <- gsub("\\?.*$", "", redirect_url)  # Remove query params
        return(clean_url)
      }
      
      return(NA_character_)
      
    }, error = function(e) {
      return(NA_character_)
    })
  })
  
  n_success <- sum(!is.na(clean_urls))
  cat("✅ Resolved", n_success, "out of", length(entity_urls), "URLs\n")
  
  return(clean_urls)
}

# Add clean URLs to existing data frame
add_clean_urls <- function(df, max_profiles = 10) {
  if (is.null(df) || !is.data.frame(df) || nrow(df) == 0) {
    cat("⚠️ No data to process\n")
    return(df)
  }
  
  if (!"linkedinEntityUrl" %in% names(df)) {
    cat("⚠️ No linkedinEntityUrl column found\n")
    return(df)
  }
  
  # Only process rows where clean URL is missing
  needs_resolution <- is.na(df$linkedinUrl) & !is.na(df$linkedinEntityUrl)
  
  if (sum(needs_resolution) == 0) {
    cat("✅ All URLs already clean\n")
    return(df)
  }
  
  cat("🔍 Found", sum(needs_resolution), "URLs that need resolution\n")
  
  entity_urls_to_resolve <- df$linkedinEntityUrl[needs_resolution]
  clean_urls <- get_clean_linkedin_urls(entity_urls_to_resolve, max_profiles = max_profiles)
  
  # Update the data frame
  df$linkedinUrl[needs_resolution] <- clean_urls
  
  return(df)
}

#########################################################################################################################################
# TEST FUNCTIONS
#########################################################################################################################################

# Test 1: VP/CXO in IT at 2Flo Ventures (from your example)
test_vp_cxo_it <- function() {
  cat("\n")
  cat("╔════════════════════════════════════════════════════════════════════════════════╗\n")
  cat("║                 TEST 1: VP/CXO in IT at 2Flo Ventures                          ║\n")
  cat("╚════════════════════════════════════════════════════════════════════════════════╝\n")
  cat("\n")
  
  result <- scrape_linkedin_employees(
    companies = "https://linkedin.com/company/2flo-ventures",
    company_batch_mode = "all_at_once",
    profile_scraper_mode = "Short ($4 per 1k)",
    seniority_levels = c("vp", "cxo"),  # VP and CXO
    job_functions = c("information_technology"),  # IT
    max_items = 25,
    take_pages = 20
  )
  
  if (!is.null(result$results_df) && nrow(result$results_df) > 0) {
    display_employees_preview(result$results_df)
  }
  
  return(result)
}

# Test 2: Director/Senior in Administrative (from your example)
test_director_senior_admin <- function() {
  cat("\n")
  cat("╔════════════════════════════════════════════════════════════════════════════════╗\n")
  cat("║           TEST 2: Director/Senior in Administrative at 2Flo                    ║\n")
  cat("╚════════════════════════════════════════════════════════════════════════════════╝\n")
  cat("\n")
  
  result <- scrape_linkedin_employees(
    companies = "https://linkedin.com/company/2flo-ventures",
    company_batch_mode = "one_by_one",
    profile_scraper_mode = "Short ($4 per 1k)",
    seniority_levels = c("director", "senior"),
    job_functions = c("administrative"),
    max_items = 25,
    max_items_per_company = 1000
  )
  
  if (!is.null(result$results_df) && nrow(result$results_df) > 0) {
    display_employees_preview(result$results_df)
  }
  
  return(result)
}

# Test 3: All three VC companies
test_three_vc_companies <- function() {
  cat("\n")
  cat("╔════════════════════════════════════════════════════════════════════════════════╗\n")
  cat("║                    TEST 3: Three VC Companies - All Employees                  ║\n")
  cat("╚════════════════════════════════════════════════════════════════════════════════╝\n")
  cat("\n")
  
  result <- scrape_linkedin_employees(
    companies = c(
      "https://linkedin.com/company/eleven-two-capital",
      "https://linkedin.com/company/1414ventures",
      "https://linkedin.com/company/2flo-ventures"
    ),
    company_batch_mode = "all_at_once",
    profile_scraper_mode = "Short ($4 per 1k)",
    max_items = 100  # Get up to 100 per company
  )
  
  if (!is.null(result$results_df) && nrow(result$results_df) > 0) {
    display_employees_preview(result$results_df, max_rows = 15)
  }
  
  return(result)
}

# Test 4: C-Suite executives across multiple companies (one by one)
test_csuite_one_by_one <- function() {
  cat("\n")
  cat("╔════════════════════════════════════════════════════════════════════════════════╗\n")
  cat("║                 TEST 4: C-Suite Executives - One by One Mode                   ║\n")
  cat("╚════════════════════════════════════════════════════════════════════════════════╝\n")
  cat("\n")
  
  result <- scrape_linkedin_employees(
    companies = c(
      "https://linkedin.com/company/eleven-two-capital",
      "https://linkedin.com/company/1414ventures",
      "https://linkedin.com/company/2flo-ventures"
    ),
    company_batch_mode = "one_by_one",
    profile_scraper_mode = "Short ($4 per 1k)",
    seniority_levels = c("cxo", "vp", "partner", "owner"),
    max_items = 50,
    max_items_per_company = 50
  )
  
  if (!is.null(result$results_df) && nrow(result$results_df) > 0) {
    display_employees_preview(result$results_df)
  }
  
  return(result)
}

# Test 5: Full Profile Mode - Check if it provides vanity URLs
test_full_mode_vanity_urls <- function() {
  cat("\n")
  cat("╔════════════════════════════════════════════════════════════════════════════════╗\n")
  cat("║       TEST 5: Full Profile Mode - Check for Vanity URLs ($8 per 1k)           ║\n")
  cat("╚════════════════════════════════════════════════════════════════════════════════╝\n")
  cat("\n")
  
  result <- scrape_linkedin_employees(
    companies = "https://www.linkedin.com/company/75767964/",  # 2Flo Ventures
    profile_scraper_mode = "Full ($8 per 1k)",
    max_items = 10,  # Just test 10 profiles to save cost
    company_batch_mode = "all_at_once"
  )
  
  # Show results
  if (!is.null(result$results_df) && nrow(result$results_df) > 0) {
    cat("\n")
    cat("═══════════════════════════════════════════════════════════════════════════════\n")
    cat("📊 FULL MODE RESULTS PREVIEW\n")
    cat("═══════════════════════════════════════════════════════════════════════════════\n\n")
    
    df <- result$results_df
    cat("Total profiles:", nrow(df), "\n\n")
    
    cat("📋 Columns:\n")
    print(names(df))
    cat("\n")
    
    cat("👤 Sample Profile (first row):\n")
    cat("─────────────────────────────────────────────────────────────────────────────\n")
    cat("Name:", df$first_name[1], df$last_name[1], "\n")
    cat("LinkedIn:", df$linkedin_url[1], "\n")
    cat("Current:", df$current_title[1], "at", df$current_company[1], "\n")
    cat("Headline:", df$headline[1], "\n")
    cat("Location:", df$location[1], "\n\n")
    
    # Show first 100 chars of experience
    if (!is.na(df$experience_paragraph[1])) {
      exp_preview <- substr(df$experience_paragraph[1], 1, 200)
      cat("Experience (first 200 chars):\n")
      cat(exp_preview, "...\n\n")
    }
    
    # Show first 100 chars of education
    if (!is.na(df$education_paragraph[1])) {
      edu_preview <- substr(df$education_paragraph[1], 1, 200)
      cat("Education (first 200 chars):\n")
      cat(edu_preview, "...\n\n")
    }
    
    # Check if linkedinUrl contains vanity URL
    linkedin_url <- df$linkedin_url[1]
    if (!is.na(linkedin_url)) {
      if (grepl("ACw", linkedin_url)) {
        cat("❌ LinkedIn URL is STILL an entity URN (ACw...)\n")
        cat("   💡 The actor does not provide vanity URLs even in Full mode.\n")
      } else {
        cat("✅ LinkedIn URL appears to be a VANITY URL!\n")
      }
    }
    
    cat("\n═══════════════════════════════════════════════════════════════════════════════\n\n")
  }
  
  return(result)
}

#########################################################################################################################################
# QUICK START GUIDE
#########################################################################################################################################

cat("\n")
cat("╔════════════════════════════════════════════════════════════════════════════════╗\n")
cat("║     LinkedIn Company Employees Scraper (HarvestAPI) - LOADED                   ║\n")
cat("╚════════════════════════════════════════════════════════════════════════════════╝\n")
cat("\n")
cat("📁 Auto-Save Enabled:\n")
cat("   ", LINKEDIN_CONTACTS_FOLDER, "\n")
cat("   Every scrape automatically saves a timestamped CSV here!\n")
cat("\n")
cat("📚 Quick Start:\n")
cat("   1. Set API key: Sys.setenv(APIFY_API_KEY = 'your_token_here')\n")
cat("   2. Run tests:\n")
cat("      - test_vp_cxo_it()              # VP/CXO in IT\n")
cat("      - test_director_senior_admin()  # Director/Senior in Admin\n")
cat("      - test_three_vc_companies()     # All employees at 3 VCs\n")
cat("      - test_csuite_one_by_one()      # C-Suite, one company at a time\n")
cat("      - test_full_mode_vanity_urls()  # Test Full mode for vanity URLs\n")
cat("\n")
cat("🛑 SAFETY LIMITS (Prevents Runaway Costs):\n")
cat("   - one_by_one mode: MAX 5 companies OR 10,000 profiles per run\n")
cat("   - all_at_once mode: MAX 10 companies OR 5,000 profiles per run\n")
cat("   - Emergency abort: abort_actor_run(run_id = 'YOUR_RUN_ID')\n")
cat("\n")
cat("💰 Pricing:\n")
cat("   - Short: $4 per 1000 (name, URL, summary, location, current position)\n")
cat("   - Full: $8 per 1000 (complete work history, education, skills)\n")
cat("   - Full + email: $12 per 1000 (includes email search)\n")
cat("\n")
cat("🎯 Seniority Levels:\n")
cat("   ", paste(names(SENIORITY_LEVELS), collapse = ", "), "\n")
cat("\n")
cat("💼 Job Functions (first 10):\n")
cat("   ", paste(head(names(JOB_FUNCTIONS), 10), collapse = ", "), "...\n")
cat("\n")
cat("💡 Example Usage:\n")
cat("   result <- scrape_linkedin_employees(\n")
cat("     companies = 'https://linkedin.com/company/company-name',\n")
cat("     seniority_levels = c('vp', 'cxo'),\n")
cat("     job_functions = c('sales', 'marketing'),\n")
cat("     locations = c('San Francisco', 'New York'),\n")
cat("     max_items = 100\n")
cat("   )\n")
cat("   df <- result$results_df\n")
cat("   View(df)\n")
cat("\n")
cat("🔗 LinkedIn URL Formats:\n")
cat("   - Some profiles return entity URNs (ACw...)\n")
cat("   - Use add_clean_urls(df) to resolve to vanity URLs (firstname-lastname)\n")
cat("   - Or: df has both linkedinUrl (clean) and linkedinEntityUrl (URN)\n")
cat("\n")
cat("⚠️  NOTE: This actor is expensive but has higher success rates.\n")
cat("   Use 'Short' mode for basic data. Upgrade to 'Full' for complete profiles.\n")
cat("\n")

