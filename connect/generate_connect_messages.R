# ============================================================================
# CONNECT MESSAGE GENERATION SCRIPT
# ============================================================================
# This script generates personalized LinkedIn messages for BDR leaders based on:
# - Campaign settings (meeting invite preferences, I statement usage)
# - About Me data (I statements for personalization)
# - Current contacts (existing connections)
# - Prospect contacts (target prospects)
# ============================================================================

library(dplyr)
library(purrr)
library(stringr)
library(jsonlite)
library(tcltk)
library(httr)

# Null-coalescing helper (returns rhs when lhs is NULL)
`%||%` <- function(lhs, rhs) if (is.null(lhs)) rhs else lhs

# ---------------------------------------------------------------------------
# brave_search
#   Calls the Brave Search API — the same search engine used by the internet
#   search message generator on the Railway backend.
#   Returns a data frame of results (title, url, description, age, source),
#   or NULL on failure.
#   Requires BRAVE_API_KEY to be set as an environment variable.
# ---------------------------------------------------------------------------
brave_search <- function(query, count = 10, max_retries = 2) {
  api_key <- Sys.getenv("BRAVE_API_KEY")
  if (nchar(api_key) == 0) {
    stop("BRAVE_API_KEY environment variable not set. Set it with: Sys.setenv(BRAVE_API_KEY='your-key')")
  }

  for (attempt in seq_len(max_retries)) {
    response <- tryCatch({
      httr::GET(
        "https://api.search.brave.com/res/v1/web/search",
        httr::add_headers(
          "Accept"               = "application/json",
          "Accept-Encoding"      = "gzip",
          "X-Subscription-Token" = api_key
        ),
        query = list(
          q                = query,
          count            = count,
          freshness        = "pm6",    # past 6 months
          text_decorations = "false",
          search_lang      = "en",
          country          = "us"
        )
      )
    }, error = function(e) NULL)

    if (!is.null(response) && httr::status_code(response) == 200) {
      parsed      <- httr::content(response, "parsed", simplifyVector = FALSE)
      web_results <- parsed$web$results %||% list()

      if (length(web_results) == 0) return(NULL)

      rows <- lapply(web_results, function(r) {
        data.frame(
          title       = r$title                      %||% NA_character_,
          url         = r$url                        %||% NA_character_,
          description = r$description                %||% NA_character_,
          age         = r$age                        %||% NA_character_,
          source      = r$meta_url$hostname          %||% NA_character_,
          stringsAsFactors = FALSE
        )
      })
      return(do.call(rbind, rows))
    }

    if (attempt < max_retries) Sys.sleep(2)
  }
  return(NULL)
}

# ---------------------------------------------------------------------------
# openrouter_generate
#   Calls the OpenRouter API with meta-llama/llama-4-maverick — the same
#   model and endpoint used throughout the Railway backend.
#   Returns the model's text response, or NULL on failure.
#   Requires OPEN_ROUTER_API_KEY to be set as an environment variable.
# ---------------------------------------------------------------------------
openrouter_generate <- function(prompt, model = "meta-llama/llama-4-maverick",
                                max_tokens = 500, temperature = 0.3, max_retries = 2) {
  api_key <- Sys.getenv("OPEN_ROUTER_API_KEY")
  if (nchar(api_key) == 0) {
    stop("OPEN_ROUTER_API_KEY environment variable not set. Set it with: Sys.setenv(OPEN_ROUTER_API_KEY='your-key')")
  }

  body <- list(
    model       = model,
    messages    = list(list(role = "user", content = prompt)),
    temperature = temperature,
    max_tokens  = max_tokens
  )

  for (attempt in seq_len(max_retries)) {
    response <- tryCatch({
      httr::POST(
        "https://openrouter.ai/api/v1/chat/completions",
        httr::add_headers(
          "Authorization" = paste("Bearer", api_key),
          "Content-Type"  = "application/json"
        ),
        body   = jsonlite::toJSON(body, auto_unbox = TRUE),
        encode = "raw"
      )
    }, error = function(e) NULL)

    if (!is.null(response) && httr::status_code(response) == 200) {
      parsed <- httr::content(response, "parsed", simplifyVector = FALSE)
      text   <- parsed$choices[[1]]$message$content %||% ""
      return(trimws(text))
    }

    if (attempt < max_retries) Sys.sleep(2)
  }
  return(NULL)
}

# ---------------------------------------------------------------------------
# openrouter_batch
#   Processes each row of a data frame using openrouter_generate.
#   prompt_template: string with [column_name] placeholders that are filled
#   from the corresponding column values in each row — mirrors gpt.batch.
#   Returns a character vector of responses, one per row.
# ---------------------------------------------------------------------------
openrouter_batch <- function(df, prompt_template, model = "meta-llama/llama-4-maverick",
                             max_tokens = 500, temperature = 0.3) {
  results <- character(nrow(df))

  for (i in seq_len(nrow(df))) {
    filled_prompt <- prompt_template
    for (col in names(df)) {
      val <- as.character(df[[col]][i])
      if (is.na(val)) val <- ""
      filled_prompt <- gsub(paste0("[", col, "]"), val, filled_prompt, fixed = TRUE)
    }

    result <- tryCatch(
      openrouter_generate(filled_prompt, model = model,
                          max_tokens = max_tokens, temperature = temperature),
      error = function(e) {
        cat(sprintf("    Warning: openrouter_batch row %d error: %s\n", i, e$message))
        NULL
      }
    )

    results[i] <- if (is.null(result)) "" else result

    if (i %% 50 == 0) cat(sprintf("    Processed %d / %d rows...\n", i, nrow(df)))
  }

  return(results)
}

# ---------------------------------------------------------------------------
# openrouter_batch_validated
#   Like openrouter_batch but validates each response against valid_values.
#   Retries up to max_retries if the response is not in valid_values.
#   Defaults to valid_values[1] if all retries are exhausted.
# ---------------------------------------------------------------------------
openrouter_batch_validated <- function(df, prompt_template, valid_values,
                                       model = "meta-llama/llama-4-maverick",
                                       max_tokens = 50, temperature = 0.1,
                                       max_retries = 2) {
  results <- character(nrow(df))

  for (i in seq_len(nrow(df))) {
    filled_prompt <- prompt_template
    for (col in names(df)) {
      val <- as.character(df[[col]][i])
      if (is.na(val)) val <- ""
      filled_prompt <- gsub(paste0("[", col, "]"), val, filled_prompt, fixed = TRUE)
    }

    result <- valid_values[1]  # safe default

    for (attempt in seq_len(max_retries + 1)) {
      raw <- tryCatch(
        openrouter_generate(filled_prompt, model = model,
                            max_tokens = max_tokens, temperature = temperature),
        error = function(e) NULL
      )

      if (!is.null(raw)) {
        clean <- tolower(trimws(raw))
        exact <- valid_values[tolower(valid_values) == clean]
        if (length(exact) > 0) { result <- exact[1]; break }
        # Partial match fallback
        partial <- valid_values[sapply(tolower(valid_values),
                                       function(v) grepl(v, clean, fixed = TRUE))]
        if (length(partial) > 0) { result <- partial[1]; break }
      }

      if (attempt <= max_retries) Sys.sleep(1)
    }

    results[i] <- result

    if (i %% 50 == 0) cat(sprintf("    Processed %d / %d rows...\n", i, nrow(df)))
  }

  return(results)
}

contacts.to.take = 6000

# ============================================================================
# GUI HELPER FUNCTIONS
# ============================================================================

# ---------------------------------------------------------------------------
# gui.select.grouped
#   Multi-select listbox with company-group headers (headers are not selectable).
#   groups : named list; names = company labels, values = character vectors of
#            BDR display strings.
#   Returns: character vector of selected display strings (headers excluded).
# ---------------------------------------------------------------------------
gui.select.grouped <- function(groups, title = "Select BDR(s)") {
  selected_values <- NULL

  # Flatten into a list of items: list(text, is_header, value)
  items <- list()
  for (company in names(groups)) {
    items[[length(items) + 1]] <- list(
      text   = paste0("\u2500\u2500 ", company, " \u2500\u2500"),
      header = TRUE,
      value  = NA_character_
    )
    for (val in groups[[company]]) {
      items[[length(items) + 1]] <- list(
        text   = paste0("    ", val),
        header = FALSE,
        value  = val
      )
    }
  }

  all_texts     <- sapply(items, `[[`, "text")
  header_idx    <- which(sapply(items, `[[`, "header"))  # 1-based

  confirm_fn <- function() {
    raw <- as.integer(tkcurselection(lb)) + 1  # 1-based
    data_idx <- setdiff(raw, header_idx)
    if (length(data_idx) == 0) {
      tkmessageBox(message = "Please select at least one BDR (company headers are not selectable).",
                   icon = "warning", title = "No BDR selected")
      return()
    }
    selected_values <<- sapply(data_idx, function(i) items[[i]]$value)
    tkdestroy(tt)
  }

  tt <- tktoplevel()
  tktitle(tt) <- title
  tkwm.geometry(tt, "640x480")
  tkwm.resizable(tt, TRUE, TRUE)

  # Instruction label
  lbl <- tklabel(tt,
    text = "Ctrl+click or Shift+click to select multiple BDRs.  Company headers are skipped automatically.",
    wraplength = 600, justify = "left", foreground = "#555555", font = "TkSmallCaptionFont"
  )
  tkpack(lbl, side = "top", anchor = "w", padx = 10, pady = c(8, 2))

  # Listbox + scrollbar frame
  fr <- tkframe(tt)
  tkpack(fr, side = "top", fill = "both", expand = TRUE, padx = 10, pady = 4)

  lb     <- tklistbox(fr, height = 20, width = 72, selectmode = "multiple",
                      font = "TkFixedFont", exportselection = FALSE)
  scroll <- tkscrollbar(fr, orient = "vertical",
                        command = function(...) tkyview(lb, ...))
  tkconfigure(lb, yscrollcommand = function(...) tkset(scroll, ...))
  tkpack(lb,     side = "left",  fill = "both", expand = TRUE)
  tkpack(scroll, side = "right", fill = "y")

  # Populate and style entries
  for (i in seq_along(all_texts)) {
    tkinsert(lb, "end", all_texts[i])
    if (i %in% header_idx) {
      # Bold-ish style for headers via background color
      tkitemconfigure(lb, i - 1, background = "#dbeafe", foreground = "#1e40af",
                      selectbackground = "#dbeafe", selectforeground = "#1e40af")
    }
  }

  # Deselect header rows whenever selection changes
  tkbind(lb, "<<ListboxSelect>>", function() {
    raw <- as.integer(tkcurselection(lb)) + 1
    for (hi in intersect(raw, header_idx)) {
      tkselection.clear(lb, hi - 1)
    }
  })

  # Button bar
  btn_fr <- tkframe(tt)
  tkpack(btn_fr, side = "bottom", fill = "x", padx = 10, pady = 8)

  ok_btn <- tkbutton(btn_fr, text = "  Confirm Selection  ", command = confirm_fn,
                     background = "#0077b5", foreground = "white", font = "TkDefaultFont")
  sel_all_btn <- tkbutton(btn_fr, text = "Select All BDRs", command = function() {
    tkselection.clear(lb, 0, length(all_texts) - 1)
    for (i in seq_along(items)) {
      if (!items[[i]]$header) tkselection.set(lb, i - 1)
    }
  })
  clear_btn <- tkbutton(btn_fr, text = "Clear", command = function() {
    tkselection.clear(lb, 0, length(all_texts) - 1)
  })
  cancel_btn <- tkbutton(btn_fr, text = "Cancel", command = function() tkdestroy(tt))

  tkpack(ok_btn,      side = "left",  padx = c(0, 6))
  tkpack(sel_all_btn, side = "left",  padx = c(0, 6))
  tkpack(clear_btn,   side = "left",  padx = c(0, 6))
  tkpack(cancel_btn,  side = "right")

  tkwait.window(tt)
  return(selected_values)
}

# ---------------------------------------------------------------------------
# gui.select.single
#   Single-selection listbox dialog.  First item is selected by default.
#   choices : character vector of options.
#   Returns : one selected string, or NULL if cancelled.
# ---------------------------------------------------------------------------
gui.select.single <- function(choices, title = "Select", prompt = "") {
  selected_value <- NULL

  confirm_fn <- function() {
    idx <- as.integer(tkcurselection(lb))
    if (length(idx) == 0) {
      tkmessageBox(message = "Please select an option.", icon = "warning")
      return()
    }
    selected_value <<- choices[idx + 1]
    tkdestroy(tt)
  }

  tt <- tktoplevel()
  tktitle(tt) <- title
  tkwm.geometry(tt, "580x340")
  tkwm.resizable(tt, TRUE, TRUE)

  if (nchar(prompt) > 0) {
    lbl <- tklabel(tt, text = prompt, wraplength = 550, justify = "left")
    tkpack(lbl, side = "top", anchor = "w", padx = 10, pady = c(8, 2))
  }

  fr <- tkframe(tt)
  tkpack(fr, side = "top", fill = "both", expand = TRUE, padx = 10, pady = 4)

  lb     <- tklistbox(fr, height = 12, width = 68, selectmode = "single",
                      exportselection = FALSE)
  scroll <- tkscrollbar(fr, orient = "vertical",
                        command = function(...) tkyview(lb, ...))
  tkconfigure(lb, yscrollcommand = function(...) tkset(scroll, ...))
  tkpack(lb,     side = "left",  fill = "both", expand = TRUE)
  tkpack(scroll, side = "right", fill = "y")

  for (ch in choices) tkinsert(lb, "end", ch)
  tkselection.set(lb, 0)   # default: first option

  btn_fr <- tkframe(tt)
  tkpack(btn_fr, side = "bottom", fill = "x", padx = 10, pady = 8)

  ok_btn     <- tkbutton(btn_fr, text = "  OK  ", command = confirm_fn,
                          background = "#0077b5", foreground = "white")
  cancel_btn <- tkbutton(btn_fr, text = "Cancel", command = function() tkdestroy(tt))
  tkpack(ok_btn,     side = "left", padx = c(0, 6))
  tkpack(cancel_btn, side = "left")

  tkwait.window(tt)
  return(selected_value)
}

# ============================================================================
# STEP 1: LOAD BDR LEADERS AND LINKEDIN ASSOCIATIONS
# ============================================================================

cat("\n========================================\n")
cat("STEP 1: Loading BDR Leaders\n")
cat("========================================\n\n")

# Download BDR leaders from Firebase
cat("Loading BDR leaders...\n")
bdr_leaders <- clemail_download("bdr_leaders")

if (nrow(bdr_leaders) == 0) {
  stop("No BDR leaders found in Firebase. Please add BDRs first.")
}

# Load LinkedIn email associations to show LinkedIn emails in selection
cat("Loading LinkedIn email associations...\n")
linkedin_associations <- clemail_download("linkedin_email_associations")

# Add LinkedIn email to BDR leaders for display
bdr_leaders$linkedInEmail <- NA
for (i in 1:nrow(bdr_leaders)) {
  mapping <- linkedin_associations[tolower(linkedin_associations$authEmail) == tolower(bdr_leaders$primaryEmail[i]), ]
  if (nrow(mapping) > 0) {
    bdr_leaders$linkedInEmail[i] <- mapping$linkedInEmail[1]
  } else {
    bdr_leaders$linkedInEmail[i] <- bdr_leaders$primaryEmail[i]  # Fallback
  }
}

# Create display strings for GUI
bdr_leaders$display_string <- sprintf("%s (%s \u2192 LinkedIn: %s)",
                                       bdr_leaders$name,
                                       bdr_leaders$primaryEmail,
                                       bdr_leaders$linkedInEmail)

# ── Group BDRs by company ────────────────────────────────────────────────────
# Try several possible company-related fields in order of preference; fall back
# to the email domain if none is found.
get_bdr_company <- function(row) {
  for (field in c("company", "companyName", "customerName", "customerId")) {
    if (field %in% names(row)) {
      val <- trimws(as.character(row[[field]]))
      if (length(val) == 1 && !is.na(val) && nchar(val) > 0) return(val)
    }
  }
  # Derive from email domain
  email <- row[["primaryEmail"]]
  if (!is.na(email) && nchar(email) > 0) {
    parts <- strsplit(email, "@")[[1]]
    if (length(parts) == 2) {
      domain <- sub("\\.(com|org|net|io|co|us|health)$", "", parts[2],
                    ignore.case = TRUE)
      return(tools::toTitleCase(domain))
    }
  }
  return("Other")
}

bdr_leaders$company_group <- sapply(
  seq_len(nrow(bdr_leaders)),
  function(i) get_bdr_company(bdr_leaders[i, ])
)

# Build sorted groups list
company_names <- sort(unique(bdr_leaders$company_group))
bdr_groups <- setNames(
  lapply(company_names, function(co) {
    co_rows <- bdr_leaders[bdr_leaders$company_group == co, ]
    co_rows  <- co_rows[order(co_rows$name), ]
    co_rows$display_string
  }),
  company_names
)

cat(sprintf("  Grouped %d BDRs across %d company/workspace(s)\n",
            nrow(bdr_leaders), length(bdr_groups)))

# Show grouped GUI selector
cat("\nOpening GUI to select BDR(s)...\n")
selected_display <- gui.select.grouped(
  bdr_groups,
  title = "Select BDR(s) \u2014 Grouped by Company"
)

if (is.null(selected_display) || length(selected_display) == 0) {
  stop("No BDRs selected.")
}

# Find indices of selected BDRs
selected_indices <- which(bdr_leaders$display_string %in% selected_display)
selected_bdrs    <- bdr_leaders[selected_indices, ]

cat(sprintf("\nSelected %d BDR(s) for processing:\n", nrow(selected_bdrs)))
for (i in 1:nrow(selected_bdrs)) {
  cat(sprintf("  - %s (Auth: %s, LinkedIn: %s)\n", 
              selected_bdrs$name[i], 
              selected_bdrs$primaryEmail[i],
              selected_bdrs$linkedInEmail[i]))
}

# ============================================================================
# STEP 2: LOAD COMMON DATA (SHARED ACROSS ALL BDRS)
# ============================================================================

cat("\n========================================\n")
cat("STEP 2: Loading Common Data\n")
cat("========================================\n\n")

# Load all contacts (for filtering)
cat("Loading all contacts...\n")
all_contacts <- clemail_download("heyreach_contacts")

# Load all messages/inbox data (to check recent messages)
cat("Loading inbox messages...\n")
all_messages <- clemail_download("heyreach_inbox")

# Process message dates (handle multiple formats from Firebase)
# Firebase often returns numeric timestamps as character strings
all_messages$lastMessagePOSIX <- tryCatch({
  if (inherits(all_messages$lastMessageAt, "POSIXct")) {
    # Already a POSIXct object
    all_messages$lastMessageAt
  } else if (is.numeric(all_messages$lastMessageAt)) {
    # Numeric timestamp (seconds since epoch)
    as.POSIXct(all_messages$lastMessageAt, origin = "1970-01-01", tz = "UTC")
  } else if (is.character(all_messages$lastMessageAt)) {
    # Character string - check if it's a numeric timestamp (common from Firebase)
    numeric_timestamp <- suppressWarnings(as.numeric(all_messages$lastMessageAt))
    if (!all(is.na(numeric_timestamp))) {
      # It's a numeric timestamp as string - convert it
      as.POSIXct(numeric_timestamp, origin = "1970-01-01", tz = "UTC")
    } else {
      # Try parsing as ISO 8601 date format
      parsed <- as.POSIXct(all_messages$lastMessageAt, format = "%Y-%m-%dT%H:%M:%S", tz = "UTC")
      # If that didn't work, try letting R auto-detect
      if (all(is.na(parsed))) {
        parsed <- as.POSIXct(all_messages$lastMessageAt, tz = "UTC")
      }
      parsed
    }
  } else {
    # Unknown format, return NA
    rep(as.POSIXct(NA), nrow(all_messages))
  }
}, error = function(e) {
  cat(sprintf("Warning: Could not parse lastMessageAt dates: %s\n", e$message))
  cat("Setting all lastMessagePOSIX to NA\n")
  rep(as.POSIXct(NA), nrow(all_messages))
})

all_messages$lastMessageDate <- as.Date(all_messages$lastMessagePOSIX)
all_messages$recentMessage <- ifelse(!is.na(all_messages$lastMessageDate) & Sys.Date() - all_messages$lastMessageDate <= 45, 1, 0)

# Map LinkedIn accounts to emails
account_email_map <- all_contacts[!duplicated(all_contacts$linkedInAccountId), 
                                   c("linkedInAccountId", "accountEmail")]
all_messages <- merge(all_messages, account_email_map, by = "linkedInAccountId", all.x = TRUE)

cat(sprintf("Loaded %d contacts and %d messages\n", nrow(all_contacts), nrow(all_messages)))

# ============================================================================
# STEP 3: PROCESS EACH SELECTED BDR
# ============================================================================

cat("\n========================================\n")
cat("STEP 3: Processing Each BDR\n")
cat("========================================\n\n")

# Initialize lists to store all uploaded data frames
all_current_contact_uploads <- list()
all_prospect_uploads <- list()

# Initialize tracking structure for comprehensive summary
run_stats <- list(
  start_time = Sys.time(),
  end_time = NULL,
  total_contacts_loaded = nrow(all_contacts),
  total_messages_loaded = nrow(all_messages),
  bdrs = list()
)

for (bdr_idx in 1:nrow(selected_bdrs)) {
  
  bdr <- selected_bdrs[bdr_idx, ]
  bdr_auth_email <- bdr$primaryEmail      # Auth email (primary)
  bdr_linkedin_email <- bdr$linkedInEmail # LinkedIn email (already looked up)
  bdr_name <- bdr$name
  
  cat(sprintf("\n\n*** Processing BDR: %s ***\n", bdr_name))
  cat(sprintf("    Auth Email: %s\n", bdr_auth_email))
  cat(sprintf("    LinkedIn Email: %s\n", bdr_linkedin_email))
  cat(rep("=", 60), "\n\n", sep = "")
  
  # Initialize BDR-specific tracking
  bdr_stats <- list(
    name = bdr_name,
    auth_email = bdr_auth_email,
    linkedin_email = bdr_linkedin_email,
    status = "started",
    errors = list(),
    warnings = list(),
    # Current contacts tracking
    contacts = list(
      initial_all = 0,
      after_category_filter = 0,
      after_sampling = 0,
      after_activity_filter_45d = 0,
      urls_scraped = 0,
      posts_scraped = 0,
      posts_recent_30d = 0,
      posts_after_deleted_filter = 0,
      posts_worthy = 0,
      messages_generated = 0,
      messages_uploaded = 0
    ),
    # Prospect contacts tracking
    prospects = list(
      initial_all = 0,
      after_connection_filter = 0,
      after_sampling = 0,
      after_activity_filter_45d = 0,
      urls_scraped = 0,
      posts_scraped = 0,
      posts_recent_30d = 0,
      posts_after_deleted_filter = 0,
      posts_worthy = 0,
      messages_generated = 0,
      messages_uploaded = 0
    ),
    # Settings
    settings_found = FALSE,
    i_statements_count = 0
  )
  
  # --------------------------------------------------------------------------
  # 3A: Load BDR-specific data
  # --------------------------------------------------------------------------
  
  cat("Loading BDR-specific data...\n")
  
  # Load campaign settings (uses AUTH email)
  cat("  - Campaign settings...\n")
  campaign_settings <- clemail_download("campaign_settings")
  cat(sprintf("    Total campaign settings records: %d\n", nrow(campaign_settings)))
  cat(sprintf("    Looking for userEmail matching: %s (auth) or %s (linkedin)\n", bdr_auth_email, bdr_linkedin_email))
  
  # Try to find settings by auth email first, then LinkedIn email
  bdr_settings <- campaign_settings[tolower(campaign_settings$userEmail) == tolower(bdr_auth_email), ]
  
  # If not found, try LinkedIn email as fallback
  if (nrow(bdr_settings) == 0) {
    bdr_settings <- campaign_settings[tolower(campaign_settings$userEmail) == tolower(bdr_linkedin_email), ]
  }
  
  if (nrow(bdr_settings) == 0) {
    cat("    WARNING: No campaign settings found for this BDR.\n")
    cat("    Available userEmails in campaign_settings:\n")
    for (email in unique(campaign_settings$userEmail)) {
      cat(sprintf("      - %s\n", email))
    }
    cat("    Skipping this BDR.\n")
    bdr_stats$status <- "skipped"
    bdr_stats$errors[[length(bdr_stats$errors) + 1]] <- "No campaign settings found"
    run_stats$bdrs[[bdr_name]] <- bdr_stats
    next
  }
  cat("    ✓ Found campaign settings\n")
  bdr_stats$settings_found <- TRUE
  
  # Parse lead categories settings
  lead_categories <- fromJSON(bdr_settings$leadCategories[1])
  prospect_categories <- fromJSON(bdr_settings$prospectCategories[1])
  
  # Load I statements (about_me data) (uses AUTH email)
  cat("  - I Statements (About Me)...\n")
  contact_profiles <- clemail_download("contact_profiles")
  bdr_profile <- contact_profiles[tolower(contact_profiles$email) == tolower(bdr_auth_email), ]
  
  i_statements <- ""
  all_statements <- c()
  if (nrow(bdr_profile) > 0 && !is.na(bdr_profile$statements[1])) {
    # Parse statements JSON
    statements_list <- fromJSON(bdr_profile$statements[1])
    all_statements <- unlist(statements_list)
    i_statements <- str_c(all_statements, collapse = "\n")
  }
  
  bdr_stats$i_statements_count <- length(all_statements)
  cat(sprintf("    Found %d I statements\n", length(all_statements)))
  
  # Load BDR's current contacts (my_leads) (uses LINKEDIN email)
  cat("  - Current contacts...\n")
  # Query using both auth and LinkedIn email to catch all contacts
  bdr_contacts_initial <- all_contacts[
    tolower(all_contacts$accountEmail) == tolower(bdr_auth_email) | 
    tolower(all_contacts$accountEmail) == tolower(bdr_linkedin_email), 
  ]
  bdr_stats$contacts$initial_all <- nrow(bdr_contacts_initial)
  
  # Filter to eligible lead categories (based on campaign settings)
  eligible_categories <- c("Relationship Building Focus", "Relationship Building Light", "Inviting")
  bdr_contacts <- bdr_contacts_initial[bdr_contacts_initial$leadCategory %in% eligible_categories, ]
  bdr_stats$contacts$after_category_filter <- nrow(bdr_contacts)
  
  cat(sprintf("    Found %d eligible contacts (before sampling)\n", nrow(bdr_contacts)))
  
  # Sample if over contacts.to.take, with weighting by category
  if (nrow(bdr_contacts) > contacts.to.take) {
    # Weight Focus contacts 3x more likely than Light, Inviting 2x
    bdr_contacts$sample_weight <- ifelse(
      bdr_contacts$leadCategory == "Relationship Building Focus", 3,
      ifelse(bdr_contacts$leadCategory == "Inviting", 2, 1)
    )
    
    # Normalize weights to probabilities
    bdr_contacts$sample_weight <- bdr_contacts$sample_weight / sum(bdr_contacts$sample_weight)
    
    sample_indices <- sample(
      1:nrow(bdr_contacts), 
      size = contacts.to.take, 
      replace = FALSE, 
      prob = bdr_contacts$sample_weight
    )
    bdr_contacts <- bdr_contacts[sample_indices, ]
    bdr_contacts$sample_weight <- NULL  # Remove weight column
    cat(sprintf("    Sampled down to contacts.to.take contacts (weighted: Focus 3x, Inviting 2x, Light 1x)\n"))
  }
  bdr_stats$contacts$after_sampling <- nrow(bdr_contacts)
  
  cat(sprintf("    Processing %d contacts\n", nrow(bdr_contacts)))
  
  # Load BDR's prospect contacts (uses AUTH email)
  cat("  - Prospect contacts...\n")
  all_prospects <- clemail_download("prospect_contacts")
  # Prospects are typically stored with auth email
  bdr_prospects <- all_prospects[
    tolower(all_prospects$userEmail) == tolower(bdr_auth_email) | 
    tolower(all_prospects$userEmail) == tolower(bdr_linkedin_email), 
  ]
  bdr_stats$prospects$initial_all <- nrow(bdr_prospects)
  
  cat(sprintf("    Found %d total prospects in database\n", nrow(bdr_prospects)))
  
  # Match prospects against current connections (in R) to filter out connected ones
  # Normalize URLs for matching (vectorized)
  normalize_url <- function(urls) {
    # Handle vectors properly
    urls <- tolower(trimws(urls))
    urls <- gsub("/$", "", urls)  # Remove trailing slash
    urls <- gsub("\\?.*$", "", urls)  # Remove query params
    urls <- gsub("#.*$", "", urls)  # Remove anchors
    urls[is.na(urls)] <- ""
    return(urls)
  }
  
  # Get all current connection URLs for this BDR (from contacts only)
  bdr_connection_urls <- unique(normalize_url(bdr_contacts$profileUrl))
  bdr_connection_urls <- bdr_connection_urls[bdr_connection_urls != ""]
  
  # Filter out prospects that are already connections
  bdr_prospects$normalized_url <- normalize_url(bdr_prospects$linkedInUrl)
  bdr_prospects <- bdr_prospects[!bdr_prospects$normalized_url %in% bdr_connection_urls, ]
  bdr_stats$prospects$after_connection_filter <- nrow(bdr_prospects)
  
  cat(sprintf("    %d prospects remaining after filtering out current connections\n", nrow(bdr_prospects)))
  
  # Sample if over contacts.to.take, with weighting by category
  if (nrow(bdr_prospects) > contacts.to.take) {
    # Weight Focus prospects 3x more likely than Light, Inviting 2x
    bdr_prospects$sample_weight <- ifelse(
      grepl("Focus", bdr_prospects$category, ignore.case = TRUE), 3,
      ifelse(grepl("Inviting", bdr_prospects$category, ignore.case = TRUE), 2, 1)
    )
    
    # Normalize weights to probabilities
    bdr_prospects$sample_weight <- bdr_prospects$sample_weight / sum(bdr_prospects$sample_weight)
    
    sample_indices <- sample(
      1:nrow(bdr_prospects), 
      size = contacts.to.take, 
      replace = FALSE, 
      prob = bdr_prospects$sample_weight
    )
    bdr_prospects <- bdr_prospects[sample_indices, ]
    bdr_prospects$sample_weight <- NULL  # Remove weight column
    cat(sprintf("    Sampled down to contacts.to.take prospects (weighted: Focus 3x, Inviting 2x, Light 1x)\n"))
  }
  bdr_stats$prospects$after_sampling <- nrow(bdr_prospects)

  # --------------------------------------------------------------------------
  # Batch filter — let the user restrict prospects to a single move-batch
  # (batches are created in manage_organization_contacts.html)
  # --------------------------------------------------------------------------
  if (nrow(bdr_prospects) > 0) {
    batch_col_present <- "moveBatchId" %in% names(bdr_prospects)

    if (batch_col_present) {
      batch_ids <- sort(unique(bdr_prospects$moveBatchId[
        !is.na(bdr_prospects$moveBatchId) & nchar(trimws(bdr_prospects$moveBatchId)) > 0
      ]))
    } else {
      batch_ids <- character(0)
    }

    if (length(batch_ids) > 0) {
      cat(sprintf("    Found %d move batch(es) available for filtering:\n", length(batch_ids)))

      # Build human-readable choice strings
      batch_choices <- sapply(batch_ids, function(bid) {
        blabel <- ""
        if ("moveBatchLabel" %in% names(bdr_prospects)) {
          lbls <- unique(bdr_prospects$moveBatchLabel[
            !is.na(bdr_prospects$moveBatchId) & bdr_prospects$moveBatchId == bid &
            !is.na(bdr_prospects$moveBatchLabel) & nchar(bdr_prospects$moveBatchLabel) > 0
          ])
          if (length(lbls) > 0) blabel <- lbls[1]
        }
        moved_at <- ""
        if ("movedAt" %in% names(bdr_prospects)) {
          dates <- na.omit(bdr_prospects$movedAt[
            !is.na(bdr_prospects$moveBatchId) & bdr_prospects$moveBatchId == bid
          ])
          if (length(dates) > 0) {
            moved_at <- tryCatch(
              format(as.POSIXct(dates[1], tz = "UTC"), "%Y-%m-%d"),
              error = function(e) ""
            )
          }
        }
        n <- sum(!is.na(bdr_prospects$moveBatchId) & bdr_prospects$moveBatchId == bid)
        label_part <- if (nchar(blabel) > 0) paste0(" \u2014 ", blabel) else ""
        date_part  <- if (nchar(moved_at) > 0) paste0("  [", moved_at, "]") else ""
        sprintf("%s%s  (%d prospects)%s", bid, label_part, n, date_part)
      })

      for (ch in batch_choices) cat(sprintf("      \u2022 %s\n", ch))

      all_choices <- c(
        sprintf("All batches \u2014 no filter  (%d total prospects)", nrow(bdr_prospects)),
        batch_choices
      )

      selected_batch_choice <- gui.select.single(
        all_choices,
        title  = sprintf("Filter Prospects by Move Batch \u2014 %s", bdr_name),
        prompt = sprintf(
          paste0("BDR: %s\n\n",
                 "Select a move batch to restrict which prospects are processed,\n",
                 "or choose 'All batches' to process all %d prospects."),
          bdr_name, nrow(bdr_prospects)
        )
      )

      if (!is.null(selected_batch_choice) && selected_batch_choice != all_choices[1]) {
        # Extract the batch ID — it is everything before the first ' — ' or '  ('
        chosen_bid <- trimws(strsplit(selected_batch_choice, "\u2014|  \\(")[[1]][1])
        bdr_prospects <- bdr_prospects[
          !is.na(bdr_prospects$moveBatchId) & bdr_prospects$moveBatchId == chosen_bid,
        ]
        cat(sprintf("    \u2713 Batch filter applied: '%s'\n", chosen_bid))
        cat(sprintf("    %d prospects in selected batch\n", nrow(bdr_prospects)))
      } else {
        cat("    No batch filter applied — processing all prospects\n")
      }
    } else {
      cat("    No move batches found for this BDR — processing all prospects (no filter shown)\n")
    }
  }

  cat(sprintf("    Processing %d prospects\n", nrow(bdr_prospects)))

  # Load deleted posts from connect_queue (to exclude from generation)
  cat("  - Loading deleted posts (connect_queue)...\n")
  connect_queue <- clemail_download("connect_queue")
  
  # Get post URLs that have been deleted BY THIS BDR (these should not be regenerated)
  # CRITICAL FIX: Filter by BDR email to only exclude posts deleted by this specific BDR
  deleted_posts <- connect_queue[
    connect_queue$deleted == TRUE &
    (tolower(connect_queue$bdr_auth_email) == tolower(bdr_auth_email) |
     tolower(connect_queue$bdr_auth_email) == tolower(bdr_linkedin_email) |
     tolower(connect_queue$accountEmail) == tolower(bdr_auth_email) |
     tolower(connect_queue$accountEmail) == tolower(bdr_linkedin_email)),
  ]
  deleted_post_urls <- unique(deleted_posts$post_url)
  deleted_post_urls <- deleted_post_urls[!is.na(deleted_post_urls) & deleted_post_urls != ""]
  
  cat(sprintf("    Found %d deleted post URLs to exclude for this BDR\n", length(deleted_post_urls)))
  
  # Load connect activity (pushed to HeyReach history)
  cat("  - Loading connect activity history...\n")
  connect_activity <- tryCatch({
    clemail_download("connect_activity")
  }, error = function(e) {
    cat("    Warning: Could not load connect_activity collection (may not exist yet)\n")
    return(data.frame())
  })
  
  # Normalize LinkedIn URLs for matching (vectorized)
  normalize_activity_url <- function(urls) {
    # Handle vectors properly
    urls <- tolower(trimws(urls))
    urls <- gsub("/$", "", urls)  # Remove trailing slash
    urls <- gsub("\\?.*$", "", urls)  # Remove query params
    urls <- gsub("#.*$", "", urls)  # Remove anchors
    urls[is.na(urls)] <- ""
    return(urls)
  }
  
  # Build activity history by contact
  # Key: normalized LinkedIn URL, Value: list of activities with dates
  # This includes BOTH pushed messages (connect_activity) AND approved messages (connect_queue)
  contact_activity_history <- list()
  
  # STEP 1: Add approved messages from connect_queue (even if not pushed yet)
  cat("  - Adding approved messages from connect_queue to activity history...\n")
  bdr_approved_messages <- connect_queue[
    !is.na(connect_queue$deleted) & connect_queue$deleted == FALSE &
    (connect_queue$reviewStatus == "approved" | 
     connect_queue$reviewStatus == "pending_customer_review") &
    (tolower(connect_queue$bdr_auth_email) == tolower(bdr_auth_email) |
     tolower(connect_queue$bdr_auth_email) == tolower(bdr_linkedin_email) |
     tolower(connect_queue$accountEmail) == tolower(bdr_auth_email) |
     tolower(connect_queue$accountEmail) == tolower(bdr_linkedin_email)),
  ]
  
  if (nrow(bdr_approved_messages) > 0) {
    for (i in 1:nrow(bdr_approved_messages)) {
      msg <- bdr_approved_messages[i, ]
      contact_url <- normalize_activity_url(msg$prospect_li_url)
      
      if (length(contact_url) == 0 || is.na(contact_url) || contact_url == "") next
      
      # Get approval date (admin or customer approval)
      approval_date <- NULL
      if (!is.na(msg$adminApprovedAt)) {
        approval_date <- tryCatch({
          if (inherits(msg$adminApprovedAt, "POSIXct")) {
            msg$adminApprovedAt
          } else {
            as.POSIXct(msg$adminApprovedAt, tz = "UTC")
          }
        }, error = function(e) NULL)
      }
      if (is.null(approval_date) && !is.na(msg$customerApprovedAt)) {
        approval_date <- tryCatch({
          if (inherits(msg$customerApprovedAt, "POSIXct")) {
            msg$customerApprovedAt
          } else {
            as.POSIXct(msg$customerApprovedAt, tz = "UTC")
          }
        }, error = function(e) NULL)
      }
      if (is.null(approval_date) && !is.na(msg$review_date)) {
        approval_date <- tryCatch({
          if (inherits(msg$review_date, "POSIXct")) {
            msg$review_date
          } else {
            as.POSIXct(msg$review_date, tz = "UTC")
          }
        }, error = function(e) NULL)
      }
      
      if (!is.null(approval_date) && !is.na(approval_date)) {
        # Store activity
        if (is.null(contact_activity_history[[contact_url]])) {
          contact_activity_history[[contact_url]] <- list()
        }
        
        contact_activity_history[[contact_url]][[length(contact_activity_history[[contact_url]]) + 1]] <- list(
          type = "approved_message",
          date = approval_date
        )
      }
    }
    cat(sprintf("    Added %d approved messages to activity history\n", 
                sum(sapply(contact_activity_history, length))))
  } else {
    cat("    No approved messages found in connect_queue\n")
  }
  
  # STEP 2: Add pushed messages from connect_activity
  cat("  - Adding pushed messages from connect_activity to activity history...\n")
  if (nrow(connect_activity) > 0) {
    # Filter to this BDR's activity
    bdr_activity <- connect_activity[
      tolower(connect_activity$bdrEmail) == tolower(bdr_auth_email) |
      tolower(connect_activity$bdrEmail) == tolower(bdr_linkedin_email), 
    ]
    
    cat(sprintf("    Found %d total activity records for this BDR\n", nrow(bdr_activity)))
    
    # Only process if there are activity records for this BDR
    if (nrow(bdr_activity) > 0) {
      for (i in 1:nrow(bdr_activity)) {
        activity <- bdr_activity[i, ]
        contact_url <- normalize_activity_url(activity$contactLinkedInUrl)
        
        if (length(contact_url) == 0 || is.na(contact_url) || contact_url == "") next
      
      # Get timestamp - handle multiple formats
      activity_date <- NULL
      if (!is.na(activity$timestamp)) {
        tryCatch({
          if (inherits(activity$timestamp, "POSIXct")) {
            # Already a POSIXct object
            activity_date <- activity$timestamp
          } else if (is.numeric(activity$timestamp)) {
            # Numeric timestamp (seconds since epoch)
            activity_date <- as.POSIXct(activity$timestamp, origin = "1970-01-01", tz = "UTC")
          } else if (is.character(activity$timestamp)) {
            # Character string - try to parse as ISO 8601 or other standard formats
            # First try as.POSIXct with default parsing
            activity_date <- tryCatch({
              as.POSIXct(activity$timestamp, tz = "UTC")
            }, error = function(e) {
              # If that fails, try parsing as ISO 8601 manually
              tryCatch({
                as.POSIXct(strptime(activity$timestamp, format = "%Y-%m-%dT%H:%M:%S", tz = "UTC"))
              }, error = function(e2) {
                # Try with Z suffix
                tryCatch({
                  as.POSIXct(strptime(gsub("Z$", "", activity$timestamp), format = "%Y-%m-%dT%H:%M:%S", tz = "UTC"))
                }, error = function(e3) {
                  NULL
                })
              })
            })
          }
        }, error = function(e) {
          cat(sprintf("    Warning: Could not parse timestamp '%s' for activity %d\n", 
                      activity$timestamp, i))
          NULL
        })
      }
      
      if (is.null(activity_date) || is.na(activity_date)) next
      
      # Store activity
      if (is.null(contact_activity_history[[contact_url]])) {
        contact_activity_history[[contact_url]] <- list()
      }
      
      contact_activity_history[[contact_url]][[length(contact_activity_history[[contact_url]]) + 1]] <- list(
        type = activity$activityType,  # 'connect', 'message', etc.
        date = activity_date,
        status = activity$status
      )
      }
    }
  }
  
  cat(sprintf("    Built activity history for %d unique contacts\n", length(contact_activity_history)))
  cat(sprintf("    Total activity records: %d\n", sum(sapply(contact_activity_history, length))))
  
  # Function to check if contact had ANY activity in the past 75 days (for early filtering before scraping)
  has_recent_activity_45_days <- function(contact_url) {
    norm_url <- normalize_activity_url(contact_url)
    if (norm_url == "") return(FALSE)
    
    activities <- contact_activity_history[[norm_url]]
    if (is.null(activities) || length(activities) == 0) {
      return(FALSE)  # No history, no recent activity
    }
    
    now <- Sys.time()
    
    # Check if any activity (message or connection) occurred in the past 75 days
    for (activity in activities) {
      days_since <- as.numeric(difftime(now, activity$date, units = "days"))
      if (days_since < 75) {
        return(TRUE)  # Has recent activity within 75 days
      }
    }
    
    return(FALSE)  # No recent activity within 75 days
  }
  
  # --------------------------------------------------------------------------
  # 3B: Process CURRENT CONTACTS (existing connections)
  # --------------------------------------------------------------------------
  
  current_contacts_result <- tryCatch({
    if (nrow(bdr_contacts) == 0) {
      cat("\n--- Skipping Current Contacts ---\n")
      cat("  No eligible current contacts to process\n")
      bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "No eligible current contacts to process"
      NULL
    } else {
      cat("\n--- Processing Current Contacts ---\n")
      cat(sprintf("  Starting with %d eligible contacts\n", nrow(bdr_contacts)))
      
      # Scrape LinkedIn posts
      contact_urls <- bdr_contacts$profileUrl
      contact_urls <- contact_urls[!is.na(contact_urls) & contact_urls != ""]
      
      # Filter out contacts with any activity in the past 75 days BEFORE scraping
      if (length(contact_urls) > 0) {
        pre_filter_count <- length(contact_urls)
        has_recent <- sapply(contact_urls, has_recent_activity_45_days)
        contact_urls <- contact_urls[!has_recent]
        bdr_stats$contacts$after_activity_filter_45d <- length(contact_urls)
        cat(sprintf("  Filtered out %d contacts with activity in past 75 days (before scraping)\n", 
                    pre_filter_count - length(contact_urls)))
      }
      
      if (length(contact_urls) == 0) {
        cat("  ⚠ No valid contact URLs to scrape. Skipping contacts.\n")
        bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "Contacts: No valid URLs to scrape after 75-day activity filter"
        NULL
      } else {
        bdr_stats$contacts$urls_scraped <- length(contact_urls)
        cat(sprintf("  Scraping LinkedIn posts for %d contacts...\n", length(contact_urls)))
        li_data_contacts <- apify_linkedin_scrape(contact_urls, limit = 2)
        bdr_stats$contacts$posts_scraped <- nrow(li_data_contacts)
        cat(sprintf("  Scraped %d total posts\n", nrow(li_data_contacts)))
        
        # Filter to recent posts (last 30 days)
        li_data_contacts <- li_data_contacts[which(as.Date(li_data_contacts$posted_at.date) > Sys.Date() - 30), ]
        bdr_stats$contacts$posts_recent_30d <- nrow(li_data_contacts)
        cat(sprintf("  %d recent posts (last 30 days)\n", nrow(li_data_contacts)))
        
        if (nrow(li_data_contacts) == 0) {
          cat("  ⚠ No recent posts found. Skipping current contacts.\n")
          bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "Contacts: No recent posts (last 30 days) found"
          NULL
        } else {
          # Exclude deleted posts (posts that were previously reviewed and deleted)
          if (length(deleted_post_urls) > 0) {
            pre_filter_count <- nrow(li_data_contacts)
            li_data_contacts <- li_data_contacts[!li_data_contacts$url %in% deleted_post_urls, ]
            bdr_stats$contacts$posts_after_deleted_filter <- nrow(li_data_contacts)
            cat(sprintf("  %d posts remaining after excluding %d deleted posts\n", 
                        nrow(li_data_contacts), pre_filter_count - nrow(li_data_contacts)))
          } else {
            bdr_stats$contacts$posts_after_deleted_filter <- nrow(li_data_contacts)
          }
          
          if (nrow(li_data_contacts) == 0) {
            cat("  ⚠ All posts have been previously deleted. Skipping current contacts.\n")
            bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "Contacts: All posts previously deleted"
            NULL
          } else {
            # Classify posts
            cat("  Classifying posts (worthy/none)...\n")
            li_data_contacts$mention <- openrouter_batch_validated(
              li_data_contacts, 
              "I am monitoring LinkedIn posts from healthcare leaders. I want to identify posts worth commenting on.

FILTER OUT (respond 'none'):
- Posts about hiring or job openings
- Posts announcing attendance at a conference ('We will be at...')
- Political posts or commentary
- Posts announcing the person is starting a new job
- Short, superficial posts with little substance
- Generic motivational quotes or slogans without personal reflection
- Posts talking about an upcoming conference
- Posts about an upcoming webinar
- Posts talking about a recent or upcoming conference
- Posts praising a co-worker and their great work
- Posts mentionging that someone died or a tragity, unless they are speaking out about change that needs to happen (in which case they should be included)
- Posts asking for participation in a charity

INCLUDE (respond 'worthy'):
- Posts with original thought, insights, or meaningful reflection
- Posts showing humanity, vulnerability, or personal experience
- Posts sharing exciting news, achievements, or milestones we can congratulate
- Posts with substantive commentary on healthcare trends or challenges
- Posts announcing company news, product launches, or significant updates

Respond with only one word: worthy or none. Here is the post: [text]", 
              valid_values = c("worthy", "none")
            )
            
            li_data_contacts <- as.data.frame(li_data_contacts)
            pre_classification_count <- nrow(li_data_contacts)
            li_data_contacts <- li_data_contacts[li_data_contacts$mention != "none", ]
            bdr_stats$contacts$posts_worthy <- nrow(li_data_contacts)
            cat(sprintf("  %d posts classified as worthy (filtered %d as none)\n", 
                        nrow(li_data_contacts), pre_classification_count - nrow(li_data_contacts)))
        
            if (nrow(li_data_contacts) == 0) {
              cat("  ⚠ No worthy posts to process. Skipping current contacts.\n")
              bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "Contacts: No posts classified as worthy"
              NULL
            } else {
              # Prepare effective post text (use reshared post if it's a quote)
                li_data_contacts$effective_post_text <- li_data_contacts$text
                for (i in 1:nrow(li_data_contacts)) {
                  if (!is.na(li_data_contacts$post_type[i]) && li_data_contacts$post_type[i] == "quote") {
                    if (!is.na(li_data_contacts$reshared_post.text[i]) && li_data_contacts$reshared_post.text[i] != "") {
                      li_data_contacts$effective_post_text[i] <- li_data_contacts$reshared_post.text[i]
                    }
                  }
                }
                
                # STEP 1: Generate base message
                cat("  Generating base messages...\n")
                li_data_contacts$base_message <- openrouter_batch(
                  li_data_contacts, 
                  paste0("
# ROLE
Write a short LinkedIn comment (1–3 sentences, max ~45 words) from one healthcare business leader to another.

# STYLE
- Optimistic, experienced leader
- Relaxed, appreciative, informal. Natural phrasing; abbreviations OK.
- Focus 90%+ on THEIR post. Avoid resume talk about me.
- Start with: 'Just saw your post about ___' (fill the blank concisely).
- Add one specific reaction/insight tied to the post, then (optionally) a light question or soft close.

# PROHIBITED
Salesy language, networking asks, name-dropping (e.g., KLAS, BYU, Texas A&M), or listing achievements.
Asking a question
Do not use exclamation marks or em-dashes

# INPUTS
# POST (MOST IMPORTANT - THIS THE FOCUS)
# Note: For quote posts, this is the reshared/quoted content they're commenting on
[effective_post_text]

# TASK
Write the comment reflecting empathy and insight about the POST.

# OUTPUT
Return ONLY the message text. No quotes, no markdown, no explanations.")
                )
                
                # Get lead category for each contact
                li_data_contacts <- merge(
                  li_data_contacts, 
                  bdr_contacts[, c("profileUrl", "leadCategory")],
                  by.x = "profile_input",
                  by.y = "profileUrl",
                  all.x = TRUE
                )
                
                # STEP 2: Add I Statement (if appropriate and enabled for this category)
                cat("  Adding I statements where appropriate...\n")
                
                # Determine which contacts should get I statements
                li_data_contacts$use_i_statements <- FALSE
                for (i in 1:nrow(li_data_contacts)) {
                  category <- li_data_contacts$leadCategory[i]
                  if (category == "Relationship Building Focus") {
                    li_data_contacts$use_i_statements[i] <- lead_categories$focus$personalStatements
                  } else if (category == "Relationship Building Light") {
                    li_data_contacts$use_i_statements[i] <- lead_categories$light$personalStatements
                  } else if (category == "Inviting") {
                    li_data_contacts$use_i_statements[i] <- lead_categories$inviting$personalStatements
                  }
                }
                
                # Process I statements in batch
                if (any(li_data_contacts$use_i_statements) && i_statements != "") {
                  # Create subset that needs I statements
                  needs_i_statements <- li_data_contacts[li_data_contacts$use_i_statements, ]
                  
                  # Build prompt for batch processing
                  i_statement_prompt <- paste0("
You have a LinkedIn message that you're about to send in response to their post. You also have a list of personal 'I statements' about yourself.

Your task: If ONE of the I statements is HIGHLY relevant to the post content and would naturally enhance the message, incorporate it smoothly. Otherwise, return the original message unchanged.

RULES:
- Use AT MOST one I statement
- Do not ask a question
- Only add it if it's genuinely relevant to the POST CONTENT (don't force it)
- Integrate it naturally into the message flow
- Keep the message concise (under 200 characters if possible)
- The focus should remain on THEIR post, not on you

THEIR POST (for context):
[effective_post_text]

ORIGINAL MESSAGE:
[base_message]

I STATEMENTS (optional to use):
", i_statements, "

OUTPUT:
Return ONLY the final message text (with or without an I statement). No quotes, no explanations.")
                  
                  needs_i_statements$message_with_i_statement <- openrouter_batch(
                    needs_i_statements,
                    i_statement_prompt
                  )
                  
                  # Merge back
                  li_data_contacts$message_with_i_statement <- li_data_contacts$base_message  # Default to base
                  li_data_contacts$message_with_i_statement[li_data_contacts$use_i_statements] <- needs_i_statements$message_with_i_statement
                } else {
                  li_data_contacts$message_with_i_statement <- li_data_contacts$base_message
                }
                
                # STEP 3: Add meeting invitation (based on category settings)
                cat("  Adding meeting invitations based on category settings...\n")
                
                # Initialize final_message column (default to message with I statement)
                li_data_contacts$final_message <- li_data_contacts$message_with_i_statement
                
                # Determine invite strategy for each contact
                li_data_contacts$invite_strategy <- "none"
                for (i in 1:nrow(li_data_contacts)) {
                  category <- li_data_contacts$leadCategory[i]
                  if (category == "Relationship Building Focus") {
                    li_data_contacts$invite_strategy[i] <- lead_categories$focus$inviteStrategy
                  } else if (category == "Relationship Building Light") {
                    li_data_contacts$invite_strategy[i] <- lead_categories$light$inviteStrategy
                  } else if (category == "Inviting") {
                    li_data_contacts$invite_strategy[i] <- lead_categories$inviting$inviteStrategy
                  }
                }
                
                # Process invitations in batch
                # Soft invites
                if (any(li_data_contacts$invite_strategy == "soft")) {
                  needs_soft <- li_data_contacts[li_data_contacts$invite_strategy == "soft", ]
                  needs_soft$final_message <- openrouter_batch(
                    needs_soft,
                    "Add a soft meeting invitation to the end of this LinkedIn message. Do not use an exclamation mark. Examples of soft invitations:
- 'Would love to connect sometime'
- 'We should catch up'

PROHIBITED
-Do not ask a question
-Do not use exclamation marks or em-dashes

Keep it natural and brief. Return ONLY the complete message.

MESSAGE:
[message_with_i_statement]"
                  )
                  li_data_contacts$final_message[li_data_contacts$invite_strategy == "soft"] <- needs_soft$final_message
                }
                
                # Strong invites
                if (any(li_data_contacts$invite_strategy == "strong")) {
                  needs_strong <- li_data_contacts[li_data_contacts$invite_strategy == "strong", ]
                  needs_strong$final_message <- openrouter_batch(
                    needs_strong,
                    "Add a strong meeting invitation to the end of this LinkedIn message. Do not use an exclamation mark. Examples of strong invitations:
- 'Let's schedule a call to discuss this further'
- 'Would you be open to a brief call next week?'
- 'I'd love to explore this with you - are you available for a quick chat?'

Keep it natural and professional. Return ONLY the complete message.

PROHIBITED:
Do not ask a question except for something like 'is there a time we can meet?'
Do not use exclamation marks or em-dashes

MESSAGE:
[message_with_i_statement]"
                  )
                  li_data_contacts$final_message[li_data_contacts$invite_strategy == "strong"] <- needs_strong$final_message
                }
                
                # Prepare for upload
                upload_data_current <- li_data_contacts[, c("profile_input", "text", "final_message", "url")]
                names(upload_data_current) <- c("prospect_li_url", "post_text", "message_to_contact", "post_url")
                upload_data_current$message_type <- "message"
                upload_data_current$account_email <- bdr_linkedin_email  # Use LinkedIn email for sending
                upload_data_current$bdr_auth_email <- bdr_auth_email     # Store auth email for reference
                upload_data_current$uploaded_date <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ")
                upload_data_current$bdr_name <- bdr_name
                
                # Remove exclamation marks (replace with periods)
                upload_data_current$message_to_contact <- gsub("!", ".", upload_data_current$message_to_contact)
                
                bdr_stats$contacts$messages_generated <- nrow(upload_data_current)
                
                # Upload to Firebase
                cat(sprintf("  Uploading %d messages to Firebase (connect_queue)...\n", nrow(upload_data_current)))
                clemail_upload("connect_queue", upload_data_current, overwrite = FALSE)
                bdr_stats$contacts$messages_uploaded <- nrow(upload_data_current)
                cat("  ✓ Current contacts messages uploaded\n")
                
                # Return the upload data
                upload_data_current
            }
          }
        }
      }
    }
  }, error = function(e) {
    cat(sprintf("\n  ⚠ ERROR processing current contacts: %s\n", e$message))
    cat("  Continuing with prospects...\n")
    bdr_stats$errors[[length(bdr_stats$errors) + 1]] <- paste("Contacts processing error:", e$message)
    NULL
  })
  
  # Store result if successful
  if (!is.null(current_contacts_result)) {
    all_current_contact_uploads[[length(all_current_contact_uploads) + 1]] <- current_contacts_result
  }
  
  # --------------------------------------------------------------------------
  # 3C: Process PROSPECT CONTACTS (not yet connected)
  # --------------------------------------------------------------------------
  
  prospect_contacts_result <- tryCatch({
    if (nrow(bdr_prospects) == 0) {
      cat("\n--- Skipping Prospect Contacts ---\n")
      cat("  No eligible prospects to process\n")
      bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "No eligible prospects to process"
      NULL
    } else {
      cat("\n--- Processing Prospect Contacts ---\n")
      cat(sprintf("  Starting with %d eligible prospects\n", nrow(bdr_prospects)))
      
      # Scrape LinkedIn posts
      prospect_urls <- bdr_prospects$linkedInUrl
      prospect_urls <- prospect_urls[!is.na(prospect_urls) & prospect_urls != ""]
      
      # Filter out prospects with any activity in the past 75 days BEFORE scraping
      if (length(prospect_urls) > 0) {
        pre_filter_count <- length(prospect_urls)
        has_recent <- sapply(prospect_urls, has_recent_activity_45_days)
        prospect_urls <- prospect_urls[!has_recent]
        bdr_stats$prospects$after_activity_filter_45d <- length(prospect_urls)
        cat(sprintf("  Filtered out %d prospects with activity in past 75 days (before scraping)\n", 
                    pre_filter_count - length(prospect_urls)))
      }
      
      if (length(prospect_urls) == 0) {
        cat("  ⚠ No valid prospect URLs to scrape. Skipping prospects.\n")
        bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "Prospects: No valid URLs to scrape after 75-day activity filter"
        NULL
      } else {
        bdr_stats$prospects$urls_scraped <- length(prospect_urls)
        cat(sprintf("  Scraping LinkedIn posts for %d prospects...\n", length(prospect_urls)))
        li_data_prospects <- apify_linkedin_scrape(prospect_urls, limit = 2)
        bdr_stats$prospects$posts_scraped <- nrow(li_data_prospects)
        cat(sprintf("  Scraped %d total posts\n", nrow(li_data_prospects)))
        
        # Filter to recent posts (last 30 days)
        li_data_prospects <- li_data_prospects[which(as.Date(li_data_prospects$posted_at.date) > Sys.Date() - 30), ]
        bdr_stats$prospects$posts_recent_30d <- nrow(li_data_prospects)
        cat(sprintf("  %d recent posts (last 30 days)\n", nrow(li_data_prospects)))
        
        if (nrow(li_data_prospects) == 0) {
          cat("  ⚠ No recent posts found. Skipping prospects.\n")
          bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "Prospects: No recent posts (last 30 days) found"
          NULL
        } else {
          # Exclude deleted posts (posts that were previously reviewed and deleted)
          if (length(deleted_post_urls) > 0) {
            pre_filter_count <- nrow(li_data_prospects)
            li_data_prospects <- li_data_prospects[!li_data_prospects$url %in% deleted_post_urls, ]
            bdr_stats$prospects$posts_after_deleted_filter <- nrow(li_data_prospects)
            cat(sprintf("  %d posts remaining after excluding %d deleted posts\n", 
                        nrow(li_data_prospects), pre_filter_count - nrow(li_data_prospects)))
          } else {
            bdr_stats$prospects$posts_after_deleted_filter <- nrow(li_data_prospects)
          }
          
          if (nrow(li_data_prospects) == 0) {
            cat("  ⚠ All posts have been previously deleted. Skipping prospects.\n")
            bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "Prospects: All posts previously deleted"
            NULL
          } else {
            # Classify posts
            cat("  Classifying posts (worthy/none)...\n")
            li_data_prospects$mention <- openrouter_batch_validated(
              li_data_prospects, 
              "I am monitoring LinkedIn posts from healthcare leaders. I want to identify posts worth commenting on.

FILTER OUT (respond 'none'):
- Posts about hiring or job openings
- Posts announcing attendance at a conference ('We will be at...') or excitement for a conference
- Political posts or commentary
- Posts announcing the person is starting a new job
- Short, superficial posts with little substance
- Generic motivational quotes or slogans without personal reflection
- Posts about an upcoming webinar

INCLUDE (respond 'worthy'):
- Posts with original thought, insights, or meaningful reflection
- Posts showing humanity, vulnerability, or personal experience
- Posts sharing exciting news, achievements, or milestones we can congratulate
- Posts with substantive commentary on healthcare trends or challenges
- Posts announcing company news, product launches, or significant updates

Respond with only one word: worthy or none. Here is the post: [text]", 
              valid_values = c("worthy", "none")
            )
            
            li_data_prospects <- as.data.frame(li_data_prospects)
            pre_classification_count <- nrow(li_data_prospects)
            li_data_prospects <- li_data_prospects[li_data_prospects$mention != "none", ]
            bdr_stats$prospects$posts_worthy <- nrow(li_data_prospects)
            cat(sprintf("  %d posts classified as worthy (filtered %d as none)\n", 
                        nrow(li_data_prospects), pre_classification_count - nrow(li_data_prospects)))
        
            if (nrow(li_data_prospects) == 0) {
              cat("  ⚠ No worthy posts to process. Skipping prospects.\n")
              bdr_stats$warnings[[length(bdr_stats$warnings) + 1]] <- "Prospects: No posts classified as worthy"
              NULL
            } else {
              # Prepare effective post text (use reshared post if it's a quote)
                li_data_prospects$effective_post_text <- li_data_prospects$text
                for (i in 1:nrow(li_data_prospects)) {
                  if (!is.na(li_data_prospects$post_type[i]) && li_data_prospects$post_type[i] == "quote") {
                    if (!is.na(li_data_prospects$reshared_post.text[i]) && li_data_prospects$reshared_post.text[i] != "") {
                      li_data_prospects$effective_post_text[i] <- li_data_prospects$reshared_post.text[i]
                    }
                  }
                }
                
                # STEP 1: Generate base connection message (shorter for prospects)
                cat("  Generating base connection messages...\n")
                li_data_prospects$base_message <- openrouter_batch(
                  li_data_prospects, 
                  "# ROLE
Write a short LinkedIn connection message (1 concise sentence) from one healthcare business leader to another.

# STYLE
- Relaxed, appreciative, informal. Natural phrasing; abbreviations OK.
- Focus 90%+ on THEIR post. Avoid resume talk.
- Start with: 'Just saw your post about ___' (fill the blank concisely).
- Add one specific reaction/insight tied to the post.
- Finish with 'Thank you for that post' if thoughtful or 'Congratulations' if it's good news.
- Do not ask questions.
- Aim to be brief — around 150 characters is ideal.

# PROHIBITED
Salesy language, networking asks, name-dropping, or listing achievements.
Asking a question
Do not use exclamation marks or em-dashes

# INPUTS
# POST (MOST IMPORTANT - THIS THE FOCUS)
# Note: For quote posts, this is the reshared/quoted content they're commenting on
[effective_post_text]

# CHECKLIST (must be true)
- The first sentence references the post topic.
- No employer/school names appear.
- Nothing political.

# OUTPUT
Return ONLY the message text. No quotes, no markdown, no explanations."
                )
                
                # Get prospect category for each prospect
                li_data_prospects <- merge(
                  li_data_prospects, 
                  bdr_prospects[, c("linkedInUrl", "category")],
                  by.x = "profile_input",
                  by.y = "linkedInUrl",
                  all.x = TRUE
                )
                
                # STEP 2: Add I Statement (if appropriate and enabled for this prospect category)
                cat("  Adding I statements where appropriate...\n")
                
                # Determine which prospects should get I statements
                li_data_prospects$use_i_statements <- FALSE
                for (i in 1:nrow(li_data_prospects)) {
                  category <- li_data_prospects$category[i]
                  if (category == "Prospect - Relationship Building Focus") {
                    li_data_prospects$use_i_statements[i] <- prospect_categories$prospect_focus$personalStatements
                  } else if (category == "Prospect - Relationship Building Light") {
                    li_data_prospects$use_i_statements[i] <- prospect_categories$prospect_light$personalStatements
                  } else if (category == "Prospect - Inviting") {
                    li_data_prospects$use_i_statements[i] <- prospect_categories$prospect_inviting$personalStatements
                  }
                }
                
                # Process I statements in batch
                if (any(li_data_prospects$use_i_statements) && i_statements != "") {
                  # Create subset that needs I statements
                  needs_i_statements <- li_data_prospects[li_data_prospects$use_i_statements, ]
                  
                  # Build prompt for batch processing
                  i_statement_prompt <- paste0("
You have a short LinkedIn connection message in response to their post. You also have a list of personal 'I statements' about yourself.

Your task: If ONE of the I statements is HIGHLY relevant to the post content and there's room, incorporate it VERY briefly. Otherwise, return the original message unchanged.

RULES:
- Use AT MOST one I statement, and keep it to 5-10 words
- Only add it if it's genuinely relevant to the POST CONTENT (don't force it)
- Keep the addition brief — the overall message should remain concise
- The focus should remain on THEIR post
- Do not ask a question

THEIR POST (for context):
[effective_post_text]

ORIGINAL MESSAGE:
[base_message]

I STATEMENTS (optional to use, keep very brief):
", i_statements, "

OUTPUT:
Return ONLY the final message text. No quotes, no explanations.")
                  
                  needs_i_statements$message_with_i_statement <- openrouter_batch(
                    needs_i_statements,
                    i_statement_prompt
                  )
                  
                  # Merge back
                  li_data_prospects$message_with_i_statement <- li_data_prospects$base_message  # Default to base
                  li_data_prospects$message_with_i_statement[li_data_prospects$use_i_statements] <- needs_i_statements$message_with_i_statement
                } else {
                  li_data_prospects$message_with_i_statement <- li_data_prospects$base_message
                }
                
                # STEP 3: Add meeting invitation (based on prospect category settings)
                # Note: For prospects, this is less common due to character limits
                cat("  Adding meeting invitations based on category settings (if space allows)...\n")
                
                # Initialize final_message column (default to message with I statement)
                li_data_prospects$final_message <- li_data_prospects$message_with_i_statement
                
                # Determine invite strategy for each prospect
                li_data_prospects$invite_strategy <- "none"
                for (i in 1:nrow(li_data_prospects)) {
                  category <- li_data_prospects$category[i]
                  if (category == "Prospect - Relationship Building Focus") {
                    li_data_prospects$invite_strategy[i] <- prospect_categories$prospect_focus$inviteStrategy
                  } else if (category == "Prospect - Relationship Building Light") {
                    li_data_prospects$invite_strategy[i] <- prospect_categories$prospect_light$inviteStrategy
                  } else if (category == "Prospect - Inviting") {
                    li_data_prospects$invite_strategy[i] <- prospect_categories$prospect_inviting$inviteStrategy
                  }
                }
                
                # Process invitations in batch (only for messages under 180 chars)
                needs_invite <- li_data_prospects$invite_strategy %in% c("soft", "strong") & nchar(li_data_prospects$message_with_i_statement) < 180
                
                if (any(needs_invite)) {
                  needs_invite_df <- li_data_prospects[needs_invite, ]
                  needs_invite_df$final_message <- openrouter_batch(
                    needs_invite_df,
                    "Add a very brief connection invitation (e.g., 'Would love to connect') to the end of this message. Keep the addition short (3-5 words). Return ONLY the complete final message.

MESSAGE:
[message_with_i_statement]"
                  )
                  li_data_prospects$final_message[needs_invite] <- needs_invite_df$final_message
                }
                
                # STEP 4: AI-based shortening for messages over 200 characters
                over_limit <- nchar(li_data_prospects$final_message) > 200
                if (any(over_limit, na.rm = TRUE)) {
                  cat(sprintf("  %d prospect message(s) over 200 characters — shortening with AI...\n",
                              sum(over_limit, na.rm = TRUE)))
                  needs_shortening <- li_data_prospects[over_limit, ]
                  needs_shortening$final_message <- openrouter_batch(
                    needs_shortening,
                    "This LinkedIn connection message is too long for LinkedIn's 200-character limit. Rewrite it to be under 200 characters while keeping it natural, complete, and effective. Do not cut it off mid-sentence — write a complete, coherent message. Do not add new content. Keep the same tone and core idea.

ORIGINAL MESSAGE:
[final_message]

Return ONLY the shortened message (under 200 characters). No quotes, no explanations."
                  )
                  li_data_prospects$final_message[over_limit] <- needs_shortening$final_message
                  
                  # Safety fallback: if AI still returned >200 chars, truncate at last space before 197
                  still_over <- nchar(li_data_prospects$final_message) > 200
                  if (any(still_over, na.rm = TRUE)) {
                    cat(sprintf("  Warning: %d message(s) still over 200 chars after AI shortening — applying word-boundary trim\n",
                                sum(still_over, na.rm = TRUE)))
                    for (i in which(still_over)) {
                      msg <- li_data_prospects$final_message[i]
                      trimmed <- substr(msg, 1, 197)
                      last_space <- max(gregexpr(" ", trimmed)[[1]])
                      if (last_space > 100) trimmed <- substr(trimmed, 1, last_space - 1)
                      li_data_prospects$final_message[i] <- trimmed
                    }
                  }
                  cat(sprintf("  Shortening complete. Messages over 200 chars: %d\n",
                              sum(nchar(li_data_prospects$final_message) > 200, na.rm = TRUE)))
                }
                
                # Prepare for upload
                upload_data_prospects <- li_data_prospects[, c("profile_input", "text", "final_message", "url")]
                names(upload_data_prospects) <- c("prospect_li_url", "post_text", "message_to_contact", "post_url")
                upload_data_prospects$message_type <- "connect"
                upload_data_prospects$account_email <- bdr_linkedin_email  # Use LinkedIn email for sending
                upload_data_prospects$bdr_auth_email <- bdr_auth_email     # Store auth email for reference
                upload_data_prospects$uploaded_date <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ")
                upload_data_prospects$bdr_name <- bdr_name
                
                # Remove exclamation marks (replace with periods)
                upload_data_prospects$message_to_contact <- gsub("!", ".", upload_data_prospects$message_to_contact)
                
                bdr_stats$prospects$messages_generated <- nrow(upload_data_prospects)
                
                # Upload to Firebase
                cat(sprintf("  Uploading %d connection messages to Firebase (connect_queue)...\n", nrow(upload_data_prospects)))
                clemail_upload("connect_queue", upload_data_prospects, overwrite = FALSE)
                bdr_stats$prospects$messages_uploaded <- nrow(upload_data_prospects)
                cat("  ✓ Prospect connection messages uploaded\n")
                
                # Return the upload data
                upload_data_prospects
            }
          }
        }
      }
    }
  }, error = function(e) {
    cat(sprintf("\n  ⚠ ERROR processing prospects: %s\n", e$message))
    cat("  Continuing...\n")
    bdr_stats$errors[[length(bdr_stats$errors) + 1]] <- paste("Prospects processing error:", e$message)
    NULL
  })
  
  # Store result if successful
  if (!is.null(prospect_contacts_result)) {
    all_prospect_uploads[[length(all_prospect_uploads) + 1]] <- prospect_contacts_result
  }

  # --------------------------------------------------------------------------
  # 3D: Process ORGANIZATION COMPLEMENT (internet news-based messages)
  # --------------------------------------------------------------------------
  # For each unique organization in this BDR's prospects:
  #   1. Search the web for recent exciting achievements (Gemini + Google Search)
  #   2. Pick the 2 most interesting items
  #   3. Generate a flowing sentence: "[Short Org] is premier. I saw your X and
  #      also saw that you Y. Impressive."
  #   4. Send to ALL prospect contacts at that org
  #   5. Store news_data (JSON array) for display in fast_connect_review.html
  # --------------------------------------------------------------------------

  cat("\n--- Processing Organization Complement ---\n")

  org_complement_result <- tryCatch({

    # Determine which column holds the company/org name
    org_col <- NULL
    for (col_try in c("company", "organization", "companyName", "prospect_company")) {
      if (col_try %in% names(bdr_prospects)) { org_col <- col_try; break }
    }

    if (is.null(org_col) || nrow(bdr_prospects) == 0) {
      cat("  No organization data available for complement generation — skipping\n")
      NULL
    } else {

      unique_orgs <- sort(unique(bdr_prospects[[org_col]][
        !is.na(bdr_prospects[[org_col]]) &
        nchar(trimws(bdr_prospects[[org_col]])) > 0
      ]))

      cat(sprintf("  Found %d unique organizations to search\n", length(unique_orgs)))

      all_complement_rows <- list()

      for (org_name in unique_orgs) {

        # Contacts at this org that have a valid LinkedIn URL
        org_contacts <- bdr_prospects[
          !is.na(bdr_prospects[[org_col]]) &
          bdr_prospects[[org_col]] == org_name &
          !is.na(bdr_prospects$linkedInUrl) &
          bdr_prospects$linkedInUrl != "",
        ]

        if (nrow(org_contacts) == 0) next

        cat(sprintf("  Searching news for: %s (%d contacts)...\n", org_name, nrow(org_contacts)))

        # Search Brave for recent exciting news about this organization
        brave_results <- tryCatch(
          brave_search(
            paste0(org_name, " healthcare achievement award accreditation expansion partnership 2024 2025"),
            count = 10
          ),
          error = function(e) {
            cat(sprintf("    Brave search error: %s\n", e$message))
            NULL
          }
        )

        if (is.null(brave_results) || nrow(brave_results) == 0) {
          cat(sprintf("    No search results for %s — skipping\n", org_name))
          next
        }

        cat(sprintf("    Found %d Brave results — asking GPT to pick best 2...\n", nrow(brave_results)))

        # Build a compact summary of the Brave results to feed to GPT
        articles_summary <- paste(
          sapply(seq_len(min(nrow(brave_results), 8)), function(i) {
            r <- brave_results[i, ]
            age_str  <- if (!is.na(r$age)    && nchar(r$age)    > 0) paste0(" [", r$age, "]")    else ""
            src_str  <- if (!is.na(r$source) && nchar(r$source) > 0) paste0(" (", r$source, ")") else ""
            paste0(i, ". ", r$title, age_str, src_str, "\n   ", r$description, "\n   URL: ", r$url)
          }),
          collapse = "\n\n"
        )

        # Store the top results as the news_data (all articles, for browsing in review)
        news_items <- brave_results[seq_len(min(nrow(brave_results), 5)), ]
        # Rename to match the fast_connect_review display schema
        names(news_items)[names(news_items) == "description"] <- "content"
        # Ensure required columns exist
        for (col_need in c("title", "url", "content", "age", "source")) {
          if (!col_need %in% names(news_items)) news_items[[col_need]] <- NA_character_
        }
        # Map 'title' → 'headline' for display compatibility
        news_items$headline <- news_items$title

        # Skip if no results contain actual news about the org (basic quality gate)
        if (all(is.na(news_items$url) | news_items$url == "")) {
          cat(sprintf("    No usable URLs in results for %s — skipping\n", org_name))
          next
        }

        # Store as compact JSON for the news_data field in Firebase
        news_data_json <- toJSON(news_items[, c("headline", "content", "url", "age", "source")],
                                 auto_unbox = TRUE)

        # ── Generate the complement message with Llama Maverick ────────────
        llama_prompt <- paste0(
          "You are writing a very short LinkedIn connection message about an organization called ", org_name, ".\n",
          "\n",
          "Recent Brave Search results about ", org_name, ":\n",
          articles_summary, "\n",
          "\n",
          "Write the message in EXACTLY this structure (two short sentences):\n",
          "  Sentence 1: \"[Short Org Name] is premier.\"\n",
          "  Sentence 2: \"I saw your [Achievement 1] and also saw that you [Achievement 2].\"\n",
          "  Closing word: \"Impressive.\"\n",
          "\n",
          "RULES:\n",
          "- Pick the 2 MOST exciting specific achievements from the news — be concrete\n",
          "  (e.g. 'ACRO accreditation', 'new proton therapy center groundbreaking', 'HIMSS Stage 7 designation')\n",
          "- Shorten the org name as much as possible while keeping it recognizable\n",
          "  ('Coastal Radiation Oncology' → 'Coastal Radiation', 'University Medical Center' → 'Univ Medical')\n",
          "- Achievement 1 uses a noun phrase after 'I saw your ...'\n",
          "- Achievement 2 uses a past-tense verb after 'you ...'\n",
          "- No bullet points, no exclamation marks, no em-dashes, no questions\n",
          "- Total message: 2-3 short sentences, ~30 words\n",
          "\n",
          "Example output:\n",
          "Coastal Radiation is premier. I saw your ACRO accreditation and also saw that you broke ground on your new center. Impressive.\n",
          "\n",
          "Return ONLY the message text — no quotes, no markdown."
        )

        complement_msg <- tryCatch(
          openrouter_generate(llama_prompt),
          error = function(e) {
            cat(sprintf("    OpenRouter generate error: %s\n", e$message))
            NULL
          }
        )

        if (is.null(complement_msg) || nchar(trimws(complement_msg)) == 0) {
          cat(sprintf("    Llama returned no output for %s — skipping\n", org_name))
          next
        }

        complement_msg <- gsub("!", ".", trimws(complement_msg))

        # ── Create one queue row per contact at this org ────────────────────
        for (i in seq_len(nrow(org_contacts))) {
          contact <- org_contacts[i, ]
          all_complement_rows[[length(all_complement_rows) + 1]] <- data.frame(
            prospect_li_url  = contact$linkedInUrl,
            post_text        = "",
            message_to_contact = complement_msg,
            post_url         = "#",
            message_type     = "connect",
            account_email    = bdr_linkedin_email,
            bdr_auth_email   = bdr_auth_email,
            uploaded_date    = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ"),
            bdr_name         = bdr_name,
            source           = "Organization Complement",
            news_data        = news_data_json,
            prospect_company = org_name,
            stringsAsFactors = FALSE
          )
        }

        cat(sprintf("    ✓ Message generated for %s\n", org_name))
      }

      if (length(all_complement_rows) > 0) {
        upload_complement <- do.call(rbind, all_complement_rows)
        cat(sprintf("  Uploading %d Organization Complement messages to Firebase...\n",
                    nrow(upload_complement)))
        clemail_upload("connect_queue", upload_complement, overwrite = FALSE)
        cat("  ✓ Organization Complement messages uploaded\n")
        upload_complement
      } else {
        cat("  No complement messages generated (no recent news found for any org)\n")
        NULL
      }
    }

  }, error = function(e) {
    cat(sprintf("\n  ⚠ ERROR in Organization Complement: %s\n", e$message))
    NULL
  })

  # ── Track complement stats ─────────────────────────────────────────────────
  bdr_stats$complement_messages_uploaded <- if (!is.null(org_complement_result))
    nrow(org_complement_result) else 0

  # Mark BDR as completed and store stats
  bdr_stats$status <- "completed"
  run_stats$bdrs[[bdr_name]] <- bdr_stats
  
  cat(sprintf("\n✓ Completed processing for %s\n", bdr_name))
}

# ============================================================================
# FINAL SUMMARY
# ============================================================================

run_stats$end_time <- Sys.time()

cat("\n")
cat("╔══════════════════════════════════════════════════════════════════════════════╗\n")
cat("║                         PROCESSING COMPLETE                                  ║\n")
cat("╚══════════════════════════════════════════════════════════════════════════════╝\n\n")

# Combine all uploaded data frames for easy access
if (length(all_current_contact_uploads) > 0) {
  all_current_contact_messages <- do.call(rbind, all_current_contact_uploads)
} else {
  all_current_contact_messages <- data.frame()
}

if (length(all_prospect_uploads) > 0) {
  all_prospect_messages <- do.call(rbind, all_prospect_uploads)
} else {
  all_prospect_messages <- data.frame()
}

# Combine all uploads into one master data frame
if (nrow(all_current_contact_messages) > 0 || nrow(all_prospect_messages) > 0) {
  all_uploads_combined <- rbind(all_current_contact_messages, all_prospect_messages)
} else {
  all_uploads_combined <- data.frame()
}

# ============================================================================
# RUN OVERVIEW
# ============================================================================

cat("┌──────────────────────────────────────────────────────────────────────────────┐\n")
cat("│                              RUN OVERVIEW                                    │\n")
cat("└──────────────────────────────────────────────────────────────────────────────┘\n\n")

run_duration <- difftime(run_stats$end_time, run_stats$start_time, units = "mins")
cat(sprintf("  Start Time:         %s\n", format(run_stats$start_time, "%Y-%m-%d %H:%M:%S")))
cat(sprintf("  End Time:           %s\n", format(run_stats$end_time, "%Y-%m-%d %H:%M:%S")))
cat(sprintf("  Duration:           %.1f minutes\n", as.numeric(run_duration)))
cat(sprintf("  BDRs Processed:     %d\n", length(run_stats$bdrs)))
cat(sprintf("  Total Contacts DB:  %d\n", run_stats$total_contacts_loaded))
cat(sprintf("  Total Messages DB:  %d\n\n", run_stats$total_messages_loaded))

# ============================================================================
# STEP-BY-STEP FUNNEL FOR EACH BDR
# ============================================================================

for (bdr_name in names(run_stats$bdrs)) {
  bdr_stats <- run_stats$bdrs[[bdr_name]]
  
  cat("┌──────────────────────────────────────────────────────────────────────────────┐\n")
  cat(sprintf("│  BDR: %-70s│\n", bdr_name))
  cat(sprintf("│  Status: %-67s│\n", toupper(bdr_stats$status)))
  cat("└──────────────────────────────────────────────────────────────────────────────┘\n\n")
  
  if (bdr_stats$status == "skipped") {
    cat("  ⚠ BDR was skipped\n")
    if (length(bdr_stats$errors) > 0) {
      cat("  Reason(s):\n")
      for (err in bdr_stats$errors) {
        cat(sprintf("    - %s\n", err))
      }
    }
    cat("\n")
    next
  }
  
  cat(sprintf("  Configuration:\n"))
  cat(sprintf("    Auth Email:      %s\n", bdr_stats$auth_email))
  cat(sprintf("    LinkedIn Email:  %s\n", bdr_stats$linkedin_email))
  cat(sprintf("    Settings Found:  %s\n", ifelse(bdr_stats$settings_found, "✓ Yes", "✗ No")))
  cat(sprintf("    I Statements:    %d loaded\n\n", bdr_stats$i_statements_count))
  
  # --------------------------------------------------------------------------
  # CURRENT CONTACTS FUNNEL
  # --------------------------------------------------------------------------
  cat("  ┌────────────────────────────────────────────────────────────────────────────┐\n")
  cat("  │  CURRENT CONTACTS FUNNEL (Messages to Existing Connections)               │\n")
  cat("  └────────────────────────────────────────────────────────────────────────────┘\n\n")
  
  cc <- bdr_stats$contacts
  
  cat("  STEP 1: Initial Load\n")
  cat(sprintf("    ├─ All contacts for BDR:                    %6d\n", cc$initial_all))
  
  cat("  STEP 2: Category Filter (Focus/Light/Inviting)\n")
  if (cc$initial_all > 0) {
    filtered_cat <- cc$initial_all - cc$after_category_filter
    cat(sprintf("    ├─ After category filter:                   %6d (-%d ineligible categories)\n", 
                cc$after_category_filter, filtered_cat))
  } else {
    cat(sprintf("    ├─ After category filter:                   %6d\n", cc$after_category_filter))
  }
  
  cat("  STEP 3: Sampling (max contacts.to.take)\n")
  if (cc$after_category_filter > contacts.to.take) {
    cat(sprintf("    ├─ After sampling:                          %6d (sampled from %d)\n", 
                cc$after_sampling, cc$after_category_filter))
  } else {
    cat(sprintf("    ├─ After sampling:                          %6d (no sampling needed)\n", cc$after_sampling))
  }
  
  cat("  STEP 4: Activity Filter (45 days - connect_activity)\n")
  if (cc$after_sampling > 0 && cc$after_activity_filter_45d > 0) {
    filtered_activity <- cc$after_sampling - cc$after_activity_filter_45d
    cat(sprintf("    ├─ After activity filter:                   %6d (-%d recent activity)\n", 
                cc$after_activity_filter_45d, filtered_activity))
  } else {
    cat(sprintf("    ├─ After activity filter:                   %6d\n", cc$after_activity_filter_45d))
  }
  
  cat("  STEP 5: LinkedIn Scraping\n")
  cat(sprintf("    ├─ Contacts scraped:                        %6d\n", cc$urls_scraped))
  cat(sprintf("    ├─ Posts retrieved:                         %6d\n", cc$posts_scraped))
  
  cat("  STEP 6: Recent Posts Filter (30 days)\n")
  if (cc$posts_scraped > 0) {
    filtered_old <- cc$posts_scraped - cc$posts_recent_30d
    cat(sprintf("    ├─ Recent posts (last 30 days):             %6d (-%d older posts)\n", 
                cc$posts_recent_30d, filtered_old))
  } else {
    cat(sprintf("    ├─ Recent posts (last 30 days):             %6d\n", cc$posts_recent_30d))
  }
  
  cat("  STEP 7: Deleted Posts Filter\n")
  if (cc$posts_recent_30d > 0 && cc$posts_after_deleted_filter > 0) {
    filtered_deleted <- cc$posts_recent_30d - cc$posts_after_deleted_filter
    cat(sprintf("    ├─ After deleted filter:                    %6d (-%d previously deleted)\n", 
                cc$posts_after_deleted_filter, filtered_deleted))
  } else {
    cat(sprintf("    ├─ After deleted filter:                    %6d\n", cc$posts_after_deleted_filter))
  }
  
  cat("  STEP 8: AI Classification (worthy/none)\n")
  if (cc$posts_after_deleted_filter > 0) {
    filtered_unworthy <- cc$posts_after_deleted_filter - cc$posts_worthy
    cat(sprintf("    ├─ Worthy posts:                            %6d (-%d classified as none)\n", 
                cc$posts_worthy, filtered_unworthy))
  } else {
    cat(sprintf("    ├─ Worthy posts:                            %6d\n", cc$posts_worthy))
  }
  
  cat("  STEP 9: Message Generation & Upload\n")
  cat(sprintf("    ├─ Messages generated:                      %6d\n", cc$messages_generated))
  cat(sprintf("    └─ Messages uploaded:                       %6d ✓\n\n", cc$messages_uploaded))
  
  # --------------------------------------------------------------------------
  # PROSPECTS FUNNEL
  # --------------------------------------------------------------------------
  cat("  ┌────────────────────────────────────────────────────────────────────────────┐\n")
  cat("  │  PROSPECTS FUNNEL (Connection Requests to New Contacts)                   │\n")
  cat("  └────────────────────────────────────────────────────────────────────────────┘\n\n")
  
  pr <- bdr_stats$prospects
  
  cat("  STEP 1: Initial Load\n")
  cat(sprintf("    ├─ All prospects for BDR:                   %6d\n", pr$initial_all))
  
  cat("  STEP 2: Already Connected Filter\n")
  if (pr$initial_all > 0) {
    filtered_connected <- pr$initial_all - pr$after_connection_filter
    cat(sprintf("    ├─ After connection filter:                 %6d (-%d already connected)\n", 
                pr$after_connection_filter, filtered_connected))
  } else {
    cat(sprintf("    ├─ After connection filter:                 %6d\n", pr$after_connection_filter))
  }
  
  cat("  STEP 3: Sampling (max contacts.to.take)\n")
  if (pr$after_connection_filter > contacts.to.take) {
    cat(sprintf("    ├─ After sampling:                          %6d (sampled from %d)\n", 
                pr$after_sampling, pr$after_connection_filter))
  } else {
    cat(sprintf("    ├─ After sampling:                          %6d (no sampling needed)\n", pr$after_sampling))
  }
  
  cat("  STEP 4: Activity Filter (45 days - connect_activity)\n")
  if (pr$after_sampling > 0 && pr$after_activity_filter_45d > 0) {
    filtered_activity <- pr$after_sampling - pr$after_activity_filter_45d
    cat(sprintf("    ├─ After activity filter:                   %6d (-%d recent activity)\n", 
                pr$after_activity_filter_45d, filtered_activity))
  } else {
    cat(sprintf("    ├─ After activity filter:                   %6d\n", pr$after_activity_filter_45d))
  }
  
  cat("  STEP 5: LinkedIn Scraping\n")
  cat(sprintf("    ├─ Prospects scraped:                       %6d\n", pr$urls_scraped))
  cat(sprintf("    ├─ Posts retrieved:                         %6d\n", pr$posts_scraped))
  
  cat("  STEP 6: Recent Posts Filter (30 days)\n")
  if (pr$posts_scraped > 0) {
    filtered_old <- pr$posts_scraped - pr$posts_recent_30d
    cat(sprintf("    ├─ Recent posts (last 30 days):             %6d (-%d older posts)\n", 
                pr$posts_recent_30d, filtered_old))
  } else {
    cat(sprintf("    ├─ Recent posts (last 30 days):             %6d\n", pr$posts_recent_30d))
  }
  
  cat("  STEP 7: Deleted Posts Filter\n")
  if (pr$posts_recent_30d > 0 && pr$posts_after_deleted_filter > 0) {
    filtered_deleted <- pr$posts_recent_30d - pr$posts_after_deleted_filter
    cat(sprintf("    ├─ After deleted filter:                    %6d (-%d previously deleted)\n", 
                pr$posts_after_deleted_filter, filtered_deleted))
  } else {
    cat(sprintf("    ├─ After deleted filter:                    %6d\n", pr$posts_after_deleted_filter))
  }
  
  cat("  STEP 8: AI Classification (worthy/none)\n")
  if (pr$posts_after_deleted_filter > 0) {
    filtered_unworthy <- pr$posts_after_deleted_filter - pr$posts_worthy
    cat(sprintf("    ├─ Worthy posts:                            %6d (-%d classified as none)\n", 
                pr$posts_worthy, filtered_unworthy))
  } else {
    cat(sprintf("    ├─ Worthy posts:                            %6d\n", pr$posts_worthy))
  }
  
  cat("  STEP 9: Message Generation & Upload\n")
  cat(sprintf("    ├─ Messages generated:                      %6d\n", pr$messages_generated))
  cat(sprintf("    └─ Messages uploaded:                       %6d ✓\n\n", pr$messages_uploaded))
  
  # --------------------------------------------------------------------------
  # WARNINGS AND ERRORS
  # --------------------------------------------------------------------------
  if (length(bdr_stats$warnings) > 0 || length(bdr_stats$errors) > 0) {
    cat("  ┌────────────────────────────────────────────────────────────────────────────┐\n")
    cat("  │  WARNINGS & ERRORS                                                        │\n")
    cat("  └────────────────────────────────────────────────────────────────────────────┘\n\n")
    
    if (length(bdr_stats$warnings) > 0) {
      cat("  ⚠ Warnings:\n")
      for (warn in bdr_stats$warnings) {
        cat(sprintf("    - %s\n", warn))
      }
    }
    
    if (length(bdr_stats$errors) > 0) {
      cat("  ✗ Errors:\n")
      for (err in bdr_stats$errors) {
        cat(sprintf("    - %s\n", err))
      }
    }
    cat("\n")
  }
  
  # BDR Summary
  complement_uploaded <- bdr_stats$complement_messages_uploaded %||% 0
  total_msgs <- cc$messages_uploaded + pr$messages_uploaded + complement_uploaded
  cat(sprintf("  ═══════════════════════════════════════════════════════════════════════════\n"))
  cat(sprintf("  TOTAL FOR %s: %d messages (%d to contacts, %d connection requests, %d org complements)\n", 
              bdr_name, total_msgs, cc$messages_uploaded, pr$messages_uploaded, complement_uploaded))
  cat(sprintf("  ═══════════════════════════════════════════════════════════════════════════\n\n"))
}

# ============================================================================
# GRAND TOTALS
# ============================================================================

cat("┌──────────────────────────────────────────────────────────────────────────────┐\n")
cat("│                              GRAND TOTALS                                    │\n")
cat("└──────────────────────────────────────────────────────────────────────────────┘\n\n")

total_contact_msgs <- nrow(all_current_contact_messages)
total_prospect_msgs <- nrow(all_prospect_messages)
total_all <- nrow(all_uploads_combined)

cat(sprintf("  Messages to Current Contacts:     %6d\n", total_contact_msgs))
cat(sprintf("  Connection Requests to Prospects: %6d\n", total_prospect_msgs))
cat(sprintf("  ─────────────────────────────────────────\n"))
cat(sprintf("  TOTAL MESSAGES GENERATED:         %6d\n\n", total_all))

if (total_all > 0) {
  # Message length statistics
  cat("  Message Length Statistics:\n")
  all_lengths <- nchar(all_uploads_combined$message_to_contact)
  cat(sprintf("    Average:  %.0f characters\n", mean(all_lengths, na.rm = TRUE)))
  cat(sprintf("    Median:   %.0f characters\n", median(all_lengths, na.rm = TRUE)))
  cat(sprintf("    Min/Max:  %d / %d characters\n\n", 
              min(all_lengths, na.rm = TRUE), max(all_lengths, na.rm = TRUE)))
  
  # Connection messages over 200 chars warning
  if (total_prospect_msgs > 0) {
    connect_messages <- all_uploads_combined[all_uploads_combined$message_type == "connect", ]
    connect_lengths <- nchar(connect_messages$message_to_contact)
    over_200 <- sum(connect_lengths > 200, na.rm = TRUE)
    if (over_200 > 0) {
      cat(sprintf("  ⚠ WARNING: %d connection message(s) exceed 200 characters (LinkedIn limit)\n\n", over_200))
    }
  }
}

# Verify upload to Firebase
cat("┌──────────────────────────────────────────────────────────────────────────────┐\n")
cat("│                           FIREBASE VERIFICATION                              │\n")
cat("└──────────────────────────────────────────────────────────────────────────────┘\n\n")
cat("  Checking Firebase connect_queue collection...\n")
final_queue <- clemail_download("connect_queue")
cat(sprintf("  Total messages in connect_queue: %d\n\n", nrow(final_queue)))

# Data frames available
cat("┌──────────────────────────────────────────────────────────────────────────────┐\n")
cat("│                         AVAILABLE DATA FRAMES                                │\n")
cat("└──────────────────────────────────────────────────────────────────────────────┘\n\n")
cat("  The following data frames are available in your R environment:\n\n")
cat(sprintf("  all_current_contact_messages  - Messages to current contacts   (%d rows)\n", 
            nrow(all_current_contact_messages)))
cat(sprintf("  all_prospect_messages         - Connection requests             (%d rows)\n", 
            nrow(all_prospect_messages)))
cat(sprintf("  all_uploads_combined          - All messages combined           (%d rows)\n", 
            nrow(all_uploads_combined)))
cat(sprintf("  run_stats                     - Detailed run statistics         (%d BDRs)\n\n", 
            length(run_stats$bdrs)))
cat("  Use View() or str() to inspect these data frames.\n\n")

cat("┌──────────────────────────────────────────────────────────────────────────────┐\n")
cat("│                               NEXT STEPS                                     │\n")
cat("└──────────────────────────────────────────────────────────────────────────────┘\n\n")
cat("  BDR leaders can now review and approve messages in the Connect interface.\n\n")

