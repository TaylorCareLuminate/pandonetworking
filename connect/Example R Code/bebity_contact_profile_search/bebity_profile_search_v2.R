################################################################################
##
## Bebity Profile Search Function V2 - With Multi-Round Company Search
## 
## Reliably extracts LinkedIn profile data using the bebity/linkedin-premium-actor
##
## Returns: first_name, last_name, name, current_title, current_company,
##          headline, about, experience_paragraph, education_paragraph, location
##
## NEW V2: Includes bebity_company_search() with multi-round intelligent matching:
##   - Round 1: Cache check + initial Apify search
##   - Round 2: GPT verification + Gemini alternative names + search
##   - Round 3: Final Gemini attempt + search
##
################################################################################

library(httr2)
library(jsonlite)
library(dplyr)
library(stringr)
library(purrr)

# NOTE: This file contains ONLY the bebity_company_search function
# The bebity_profile_search function remains in bebity_profile_search.R unchanged

################################################################################
## COMPANY SEARCH FUNCTION WITH MULTI-ROUND INTELLIGENT MATCHING
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
    verbose = TRUE,
    return_best_match_only = FALSE
) {
  
  # Validate inputs
  if (length(organization_names) == 0) {
    stop("❌ No organization names provided")
  }
  
  organization_names <- organization_names[!is.na(organization_names) & nzchar(trimws(organization_names))]
  organization_names <- unique(organization_names)
  
  if (length(organization_names) == 0) {
    stop("❌ No valid organization names after filtering")
  }
  
  # Get API token
  if (is.null(apify_token)) {
    apify_token <- Sys.getenv("APIFY_API_KEY", unset = NA)
    if (is.na(apify_token) || apify_token == "") {
      stop("❌ APIFY_API_KEY not set")
    }
  }
  
  # Create cache directory
  if (!dir.exists(cache_dir)) {
    dir.create(cache_dir, recursive = TRUE, showWarnings = FALSE)
    if (verbose) message("✓ Created cache directory")
  }
  
  # Load cache
  cache_file <- "company_search_cache"
  cache_path <- file.path(cache_dir, paste0(cache_file, ".rdata"))
  
  cache_db <- NULL
  if (file.exists(cache_path) && !force_refresh) {
    tryCatch({
      if (exists("loadr", mode = "function")) {
        cache_db <- loadr(file.path("Bebity LinkedIn Company Profiles", cache_file))
      } else {
        load(cache_path)
        cache_db <- get(cache_file)
      }
      if (verbose) message(sprintf("✓ Loaded cache with %d records", nrow(cache_db)))
    }, error = function(e) {
      if (verbose) message("⚠️  Starting fresh cache")
      cache_db <- NULL
    })
  }
  
  # Initialize cache
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
  
  # Ensure columns exist
  required_cols <- c("search_query", "organization_name", "linkedin_url", "search_date", "search_round", "match_confidence")
  for (col in required_cols) {
    if (!col %in% names(cache_db)) {
      if (col == "search_date") {
        cache_db[[col]] <- as.Date(NA)
      } else if (col == "search_round") {
        cache_db[[col]] <- NA_integer_
      } else {
        cache_db[[col]] <- NA_character_
      }
    }
  }
  
  ##############################################################################
  ## HELPER FUNCTIONS
  ##############################################################################
  
  # Save cache
  save_cache <- function(cache_data) {
    tryCatch({
      if (exists("saver", mode = "function")) {
        saver(cache_data, file.path("Bebity LinkedIn Company Profiles", cache_file))
      } else {
        assign(cache_file, cache_data, envir = .GlobalEnv)
        save(list = cache_file, file = cache_path, envir = .GlobalEnv)
      }
      if (verbose) message("  ✓ Cache saved")
    }, error = function(e) {
      if (verbose) message("  ⚠️  Cache save failed: ", e$message)
    })
  }
  
  # Perform Apify search
  perform_apify_search <- function(search_term, round_num) {
    if (verbose) message(sprintf("    🔍 Searching: '%s'", search_term))
    
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
      
      # Poll
      wait_interval <- 10
      max_checks <- (15 * 60) / wait_interval
      
      for (check in 1:max_checks) {
        Sys.sleep(wait_interval)
        
        status_response <- request(sprintf("https://api.apify.com/v2/acts/bebity~linkedin-premium-actor/runs/%s", run_id)) %>%
          req_url_query(token = apify_token) %>%
          req_perform()
        
        status_data <- resp_body_json(status_response)
        run_status <- status_data$data$status
        
        if (run_status %in% c("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT")) break
      }
      
      if (run_status != "SUCCEEDED") {
        if (verbose) message(sprintf("    ❌ Failed: %s", run_status))
        return(NULL)
      }
      
      # Get results
      dataset_id <- status_data$data$defaultDatasetId
      results_response <- request(sprintf("https://api.apify.com/v2/datasets/%s/items", dataset_id)) %>%
        req_url_query(token = apify_token, format = "json") %>%
        req_perform()
      
      search_data <- resp_body_json(results_response, simplifyVector = FALSE)
      
      if (is.list(search_data) && length(search_data) > 0) {
        if (verbose) message(sprintf("    ✓ Found %d result(s)", length(search_data)))
        return(search_data)
      } else {
        if (verbose) message("    ⚠️  No results")
        return(NULL)
      }
      
    }, error = function(e) {
      if (verbose) message(sprintf("    ❌ Error: %s", e$message))
      return(NULL)
    })
  }
  
  # Add results to cache and return
  add_to_cache_and_save <- function(original_query, search_results, round_num, confidence) {
    if (is.null(search_results) || length(search_results) == 0) return(NULL)
    
    new_rows <- data.frame(
      search_query = character(),
      organization_name = character(),
      linkedin_url = character(),
      search_date = as.Date(character()),
      search_round = integer(),
      match_confidence = character(),
      stringsAsFactors = FALSE
    )
    
    for (company in search_results) {
      company_name <- if (!is.null(company$name)) company$name else NA_character_
      company_url <- if (!is.null(company$url)) company$url else NA_character_
      
      if (!is.na(company_name) && !is.na(company_url)) {
        new_rows <- rbind(new_rows, data.frame(
          search_query = original_query,
          organization_name = company_name,
          linkedin_url = company_url,
          search_date = Sys.Date(),
          search_round = as.integer(round_num),
          match_confidence = as.character(confidence),
          stringsAsFactors = FALSE
        ))
      }
    }
    
    if (nrow(new_rows) > 0) {
      cache_db <<- rbind(cache_db, new_rows)
      save_cache(cache_db)
      return(new_rows)
    }
    
    return(NULL)
  }
  
  ##############################################################################
  ## MAIN SEARCH LOGIC
  ##############################################################################
  
  # Track status for each organization
  org_status <- data.frame(
    original_query = organization_names,
    found = FALSE,
    search_round = NA_integer_,
    stringsAsFactors = FALSE
  )
  
  # All results accumulator
  all_results <- list()
  
  if (verbose) {
    message("\n╔══════════════════════════════════════════════════════════════════════════╗")
    message(sprintf("║  MULTI-ROUND COMPANY SEARCH: %d organization(s)%s║", 
                    length(organization_names),
                    strrep(" ", 48 - nchar(as.character(length(organization_names))))))
    message("╚══════════════════════════════════════════════════════════════════════════╝")
  }
  
  ##############################################################################
  ## ROUND 1: Cache Check + Initial Search
  ##############################################################################
  
  if (verbose) {
    message("\n═══ ROUND 1: Cache Check + Initial Search ═══\n")
  }
  
  for (i in 1:nrow(org_status)) {
    org_name <- org_status$original_query[i]
    if (verbose) message(sprintf("[%d/%d] %s", i, nrow(org_status), org_name))
    
    # Check cache
    if (!force_refresh && nrow(cache_db) > 0) {
      cached <- cache_db[tolower(cache_db$search_query) == tolower(org_name), ]
      
      if (nrow(cached) > 0) {
        if (verbose) message(sprintf("  ✓ Found in cache (%d result(s))", nrow(cached)))
        cached$is_cached <- TRUE
        all_results[[length(all_results) + 1]] <- cached
        org_status$found[i] <- TRUE
        org_status$search_round[i] <- 1
        next
      }
    }
    
    # Not in cache - search Apify
    if (verbose) message("  → Searching Apify...")
    search_results <- perform_apify_search(org_name, 1)
    
    if (!is.null(search_results)) {
      new_data <- add_to_cache_and_save(org_name, search_results, 1, "round1_direct")
      if (!is.null(new_data)) {
        new_data$is_cached <- FALSE
        all_results[[length(all_results) + 1]] <- new_data
        org_status$found[i] <- TRUE
        org_status$search_round[i] <- 1
      }
    }
    
    Sys.sleep(2)
  }
  
  # Round 1 summary
  found_r1 <- sum(org_status$found)
  if (verbose) {
    message(sprintf("\n✓ Round 1 complete: %d/%d found (%.1f%%)\n", 
                    found_r1, nrow(org_status), 100 * found_r1 / nrow(org_status)))
  }
  
  ##############################################################################
  ## ROUND 2: GPT Verification + Gemini Alternative Names
  ##############################################################################
  
  if (max_rounds >= 2 && found_r1 < nrow(org_status)) {
    if (verbose) {
      message("\n═══ ROUND 2: GPT Verification + Gemini Alternative Names ═══\n")
    }
    
    unfound <- org_status[!org_status$found, ]
    
    # Step 1: GPT verification of search results against original queries
    if (use_gpt_verification && exists("gpt.batch", mode = "function") && length(all_results) > 0) {
      if (verbose) message("→ Running GPT verification of matches...\n")
      
      # Build verification data frame
      verify_df <- data.frame()
      for (res_list in all_results) {
        if (is.data.frame(res_list) && nrow(res_list) > 0) {
          for (j in 1:nrow(res_list)) {
            verify_df <- rbind(verify_df, data.frame(
              search_query = res_list$search_query[j],
              organization_name = res_list$organization_name[j],
              linkedin_url = res_list$linkedin_url[j],
              stringsAsFactors = FALSE
            ))
          }
        }
      }
      
      if (nrow(verify_df) > 0) {
        tryCatch({
          verify_df$gpt_match <- gpt.batch(verify_df, 
            "Compare '[search_query]' with '[organization_name]'. Are they the same organization? Reply '1' for yes, '0' for no. Only reply with '1' or '0'."
          )
          
          # Update match confidence in results
          for (k in seq_along(all_results)) {
            if (is.data.frame(all_results[[k]])) {
              for (m in 1:nrow(all_results[[k]])) {
                matching_idx <- which(
                  verify_df$search_query == all_results[[k]]$search_query[m] &
                  verify_df$organization_name == all_results[[k]]$organization_name[m]
                )
                if (length(matching_idx) > 0) {
                  gpt_result <- verify_df$gpt_match[matching_idx[1]]
                  all_results[[k]]$match_confidence[m] <- ifelse(
                    gpt_result == "1" || gpt_result == 1,
                    "gpt_verified",
                    "gpt_mismatch"
                  )
                }
              }
            }
          }
          
          if (verbose) message(sprintf("✓ GPT verification complete\n"))
          
        }, error = function(e) {
          if (verbose) message(sprintf("⚠️  GPT verification failed: %s\n", e$message))
        })
      }
    }
    
    # Step 2: Gemini generates alternative search names for unfound orgs
    if (use_gemini_alternatives && exists("gemini.batch", mode = "function") && nrow(unfound) > 0) {
      if (verbose) message(sprintf("→ Generating alternative names for %d unfound organizations...\n", nrow(unfound)))
      
      tryCatch({
        unfound$alternative_names <- gemini.batch(unfound,
          paste0("For the organization '[original_query]', suggest 2-3 alternative names or variations ",
                 "that could be used to find their LinkedIn company page. Consider: abbreviations, ",
                 "full legal names, commonly used short names, parent company names. ",
                 "Reply with ONLY the alternative names separated by ' | '. Example: 'Mayo | Mayo Health System'")
        )
        
        # Search each alternative
        for (i in 1:nrow(unfound)) {
          alt_names <- unfound$alternative_names[i]
          if (is.na(alt_names) || !nzchar(alt_names)) next
          
          alternatives <- trimws(unlist(strsplit(as.character(alt_names), "\\|")))
          
          if (verbose) message(sprintf("[%s] Trying alternatives: %s", 
                                       unfound$original_query[i],
                                       paste(alternatives, collapse = ", ")))
          
          for (alt_name in alternatives) {
            search_results <- perform_apify_search(alt_name, 2)
            
            if (!is.null(search_results)) {
              new_data <- add_to_cache_and_save(unfound$original_query[i], search_results, 2, "gemini_alternative")
              if (!is.null(new_data)) {
                new_data$is_cached <- FALSE
                all_results[[length(all_results) + 1]] <- new_data
                
                # Mark as found
                idx <- which(org_status$original_query == unfound$original_query[i])
                org_status$found[idx] <- TRUE
                org_status$search_round[idx] <- 2
                break
              }
            }
            
            Sys.sleep(2)
          }
        }
        
        if (verbose) message("\n")
        
      }, error = function(e) {
        if (verbose) message(sprintf("⚠️  Gemini alternative names failed: %s\n", e$message))
      })
    }
    
    # Round 2 summary
    found_r2 <- sum(org_status$found)
    if (verbose) {
      message(sprintf("✓ Round 2 complete: %d/%d found (%.1f%%)\n", 
                      found_r2, nrow(org_status), 100 * found_r2 / nrow(org_status)))
    }
  }
  
  ##############################################################################
  ## ROUND 3: Final Gemini Attempt
  ##############################################################################
  
  if (max_rounds >= 3 && sum(org_status$found) < nrow(org_status)) {
    if (verbose) {
      message("\n═══ ROUND 3: Final Gemini Attempt ═══\n")
    }
    
    unfound <- org_status[!org_status$found, ]
    
    if (use_gemini_alternatives && exists("gemini.batch", mode = "function") && nrow(unfound) > 0) {
      if (verbose) message(sprintf("→ Final search attempt for %d organizations...\n", nrow(unfound)))
      
      tryCatch({
        unfound$final_search_term <- gemini.batch(unfound,
          paste0("For '[original_query]', what is the EXACT name I should search to find their ",
                 "official LinkedIn company page? Consider they may be part of a larger health system. ",
                 "Reply with ONLY one search term, nothing else. Example: 'Mayo Clinic'")
        )
        
        for (i in 1:nrow(unfound)) {
          search_term <- unfound$final_search_term[i]
          if (is.na(search_term) || !nzchar(search_term)) next
          
          if (verbose) message(sprintf("[%s] Final attempt: '%s'", 
                                       unfound$original_query[i],
                                       search_term))
          
          search_results <- perform_apify_search(search_term, 3)
          
          if (!is.null(search_results)) {
            new_data <- add_to_cache_and_save(unfound$original_query[i], search_results, 3, "gemini_final")
            if (!is.null(new_data)) {
              new_data$is_cached <- FALSE
              all_results[[length(all_results) + 1]] <- new_data
              
              idx <- which(org_status$original_query == unfound$original_query[i])
              org_status$found[idx] <- TRUE
              org_status$search_round[idx] <- 3
            }
          }
          
          Sys.sleep(2)
        }
        
        if (verbose) message("\n")
        
      }, error = function(e) {
        if (verbose) message(sprintf("⚠️  Gemini final attempt failed: %s\n", e$message))
      })
    }
    
    # Round 3 summary
    found_r3 <- sum(org_status$found)
    if (verbose) {
      message(sprintf("✓ Round 3 complete: %d/%d found (%.1f%%)\n", 
                      found_r3, nrow(org_status), 100 * found_r3 / nrow(org_status)))
    }
  }
  
  ##############################################################################
  ## FINAL RESULTS
  ##############################################################################
  
  if (length(all_results) == 0) {
    warning("⚠️  No results found")
    return(data.frame())
  }
  
  # Combine all results
  final_results <- do.call(rbind, all_results)
  rownames(final_results) <- NULL
  
  ##############################################################################
  ## BEST MATCH FILTERING (if requested)
  ##############################################################################
  
  if (return_best_match_only && nrow(final_results) > 0) {
    if (verbose) {
      message("\n═══ Filtering to Best Match Per Organization ═══\n")
    }
    
    # Check if gpt.batch is available
    if (!exists("gpt.batch", mode = "function")) {
      warning("⚠️  gpt.batch not found. Returning first match per organization instead.")
      final_results <- final_results %>%
        group_by(search_query) %>%
        slice(1) %>%
        ungroup() %>%
        as.data.frame()
    } else {
      # Group results by search query
      orgs_with_multiple <- final_results %>%
        group_by(search_query) %>%
        filter(n() > 1) %>%
        ungroup() %>%
        as.data.frame()
      
      orgs_with_single <- final_results %>%
        group_by(search_query) %>%
        filter(n() == 1) %>%
        ungroup() %>%
        as.data.frame()
      
      if (nrow(orgs_with_multiple) > 0) {
        if (verbose) {
          message(sprintf("Found %d organizations with multiple matches", 
                          length(unique(orgs_with_multiple$search_query))))
          message("Using GPT to select best matches...\n")
        }
        
        # Use GPT to find best match for each organization
        best_matches <- data.frame()
        
        for (org_query in unique(orgs_with_multiple$search_query)) {
          org_matches <- orgs_with_multiple[orgs_with_multiple$search_query == org_query, ]
          
          if (nrow(org_matches) == 1) {
            best_matches <- rbind(best_matches, org_matches)
            next
          }
          
          # Create options for GPT
          org_matches$option_num <- 1:nrow(org_matches)
          
          options_text <- paste(
            sprintf("(%d) %s - %s", 
                    org_matches$option_num,
                    org_matches$organization_name,
                    org_matches$linkedin_url),
            collapse = "\n"
          )
          
          prompt_df <- data.frame(
            query = org_query,
            options = options_text,
            stringsAsFactors = FALSE
          )
          
          tryCatch({
            gpt_response <- gpt.batch(prompt_df,
              paste0("I'm searching for the LinkedIn company page for '[query]'. ",
                     "Here are the options I found:\n\n[options]\n\n",
                     "Which option is the BEST match for the main organization (not foundations, departments, or affiliates)? ",
                     "Reply with ONLY the number (1, 2, 3, etc.), nothing else."))
            
            best_num <- as.integer(gsub("[^0-9]", "", gpt_response))
            
            if (!is.na(best_num) && best_num > 0 && best_num <= nrow(org_matches)) {
              best_match <- org_matches[org_matches$option_num == best_num, ]
              best_match$match_confidence <- paste0(best_match$match_confidence, "_gpt_best")
              best_matches <- rbind(best_matches, best_match[, !names(best_match) %in% "option_num"])
              
              if (verbose) {
                message(sprintf("  [%s] → Selected: %s", 
                                org_query, 
                                best_match$organization_name))
              }
            } else {
              # Fallback to first match
              if (verbose) {
                message(sprintf("  [%s] → Using first match (GPT returned invalid number)", org_query))
              }
              best_matches <- rbind(best_matches, org_matches[1, !names(org_matches) %in% "option_num"])
            }
            
          }, error = function(e) {
            if (verbose) {
              message(sprintf("  [%s] → GPT error, using first match", org_query))
            }
            best_matches <<- rbind(best_matches, org_matches[1, !names(org_matches) %in% "option_num"])
          })
        }
        
        # Combine single matches with GPT-selected best matches
        final_results <- rbind(orgs_with_single, best_matches)
        rownames(final_results) <- NULL
        
        if (verbose) {
          message(sprintf("\n✓ Filtered to %d results (one per organization)\n", nrow(final_results)))
        }
      }
    }
  }
  
  # Report
  if (verbose) {
    message("\n╔══════════════════════════════════════════════════════════════════════════╗")
    message("║  FINAL SUMMARY                                                           ║")
    message("╚══════════════════════════════════════════════════════════════════════════╝\n")
    message(sprintf("Total organizations searched: %d", nrow(org_status)))
    message(sprintf("  ✓ Found: %d (%.1f%%)", sum(org_status$found), 100 * mean(org_status$found)))
    message(sprintf("  ✗ Not found: %d (%.1f%%)", sum(!org_status$found), 100 * mean(!org_status$found)))
    message(sprintf("\nTotal LinkedIn URLs found: %d", nrow(final_results)))
    
    if (return_best_match_only) {
      message("  (filtered to best match per organization)")
    }
    
    message(sprintf("  From cache: %d", sum(final_results$is_cached)))
    message(sprintf("  New searches: %d", sum(!final_results$is_cached)))
    message(sprintf("\nResults by round:"))
    for (r in 1:max_rounds) {
      count <- sum(org_status$search_round == r, na.rm = TRUE)
      if (count > 0) {
        message(sprintf("  Round %d: %d organizations", r, count))
      }
    }
    message("\n✅ Search complete!\n")
  }
  
  return(final_results)
}

