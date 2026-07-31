#########################################################################################################################################
#
#Open up ngrok and run 'ngrok http --url=stable-happily-werewolf.ngrok-free.app 8000'
#
#Run in another session:
#pr("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Seamless/webhook.R") %>% pr_run(port = 8000)
#
#Run this code
#
############################################################################################################################################


seamless.api.key = "1v5TLdOhbZuQFXhDbrVLSs2Kn04bkovvSt9V7Ge437qgoP/Bi8l/kNUpGOPxs5NAD8G+SujydoxxrI4a0SlRK6+qDPWjE0rJTE3AY9lUyDGVWboag3FeYFXg1VMPDTsuPM4Vm4kU/HUgGn41PJeRVO5s1fn6rABvaejRgcBv4nI0TERC"

clientid = "d14eca7f-b832-4170-9e14-f8baf3e0c8f4"
client.secret = "tzxpHmsOSHm28cA/ln9M5FFnmTq5Gfy9"

client_id    <- clientid
redirect_uri <- "https://oauth.pstmn.io/v1/callback"
state        <- "random_csrf_token"

auth_url <- sprintf(
  "https://login.seamless.ai/oauth/authorize?client_id=%s&redirect_uri=%s&response_type=code&state=%s",
  client_id,
  URLencode(redirect_uri, reserved = TRUE),
  state
)

cat("Open this URL in your browser:\n", auth_url, "\n")




stop()
#Put auth code here
auth_code <- "5Gbn/t0n2uYP0tgxtXiqIKSvD2sKZAEY"

library(httr)
library(jsonlite)

token_resp <- POST(
  url = "https://api.seamless.ai/api/client/v1/oauth/accessToken",
  body = toJSON(list(
    grant_type    = "authorization_code",
    client_id     = client_id,
    client_secret = client.secret,
    redirect_uri  = redirect_uri,
    code          = auth_code
  ), auto_unbox = TRUE),
  add_headers(`Content-Type` = "application/json")
)

stop_for_status(token_resp)

token_data <- content(token_resp, "parsed", simplifyVector = TRUE)

access_token  <- token_data$access_token
refresh_token <- token_data$refresh_token
expires_at    <- token_data$expires_at

cat("Access token obtained:", access_token, "\n")

#######################




firebase_api_key <- "AIzaSyBpsxZCSULnandhpdVLI9nvsxd3_BH4dfs" # from Firebase Project Settings

email <- "taylordavis@healthluminate.com"
password <- "Iam2tall!"

# Request
resp <- POST(
  url = sprintf("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=%s", firebase_api_key),
  body = toJSON(list(email=email, password=password, returnSecureToken=TRUE), auto_unbox=TRUE),
  add_headers(`Content-Type`="application/json")
)
tokdata <- content(resp, as="parsed")
intok <- tokdata$idToken







#########################



company_resp <- POST(
  url = "https://api.seamless.ai/api/client/v1/search/companies",
  add_headers(`Authorization` = paste("Bearer", access_token), `Content-Type` = "application/json"),
  body = toJSON(list(
    query = list(companyName = "Seamless.AI"),
    page = 1,
    limit = 5
  ), auto_unbox = TRUE)
)

#################################



library(httr)
library(jsonlite)
library(tcltk)

submit_for_research <- function(contacts, access_token) {
  if (length(contacts) == 0) {
    cat("⏭️ No contacts to submit\n")
    return(NULL)
  }
  
  # Always coerce to character vector
  searchResultIds <- as.character(unlist(lapply(contacts, function(c) c$searchResultId)))
  
  if (length(searchResultIds) == 0) {
    cat("⚠️ No contacts with searchResultId — cannot submit for research\n")
    return(NULL)
  }
  
  cat("📤 Submitting", length(searchResultIds), "contacts for research...\n")
  cat("   IDs:", paste(searchResultIds, collapse = ", "), "\n")
  
  # Force JSON array even if only one element
  body <- list(searchResultIds = searchResultIds)
  
  resp <- POST(
    url = "https://api.seamless.ai/api/client/v1/contacts/research",
    add_headers(
      Authorization = paste("Bearer", access_token),
      `Content-Type` = "application/json"
    ),
    body = toJSON(body, auto_unbox = FALSE, pretty = TRUE)  # <-- auto_unbox = FALSE is key
  )
  
  if (resp$status_code %in% c(200,202)) {
    result <- content(resp, "parsed", simplifyVector = FALSE)
    cat("✅ Successfully submitted", length(searchResultIds), "contacts\n")
    return(result)
  } else {
    cat("❌ Failed to submit for research:", resp$status_code, "\n")
    cat("   Response text:", content(resp, "text"), "\n")
    return(NULL)
  }
}


# Safe null handling
`%||%` <- function(a, b) if (!is.null(a)) a else b

# --- GPT helper: resolve org name from a domain ---
resolve_org_from_domain <- function(domain) {
  prompt <- sprintf(
    "What physician group or practice has the web domain '%s'? Reply with only the name, nothing else.",
    domain
  )
  # This assumes you have a helper wrapper `gpt()` already configured
  org_name <- gpt(prompt, model = "gpt-5-mini")
  return(org_name)
}

# --- Function to search for C-Level by domain with GPT fallback ---
search_c_level <- function(domain, org_name, access_token, max_contacts = 20) {
  # 1. Try domain-based search
  cat("\n🔍 Searching domain:", domain, "for C-Level executives...\n")
  
  resp <- POST(
    url = "https://api.seamless.ai/api/client/v1/search/contacts",
    add_headers(
      Authorization = paste("Bearer", access_token),
      `Content-Type` = "application/json"
    ),
    body = toJSON(list(
      companyDomain = list(domain),
      seniority = list("C-Level"),
      page = 1,
      limit = min(max_contacts, 50)
    ), auto_unbox = TRUE)
  )
  
  data <- NULL
  if (resp$status_code == 200) {
    data <- content(resp, "parsed", simplifyVector = FALSE)$data
  }
  
  # 2. If no domain results, try GPT-sourced org name
  if (is.null(data) || length(data) == 0) {
    cat("⚠️ No contacts for domain", domain, "- asking GPT for org name...\n")
    gpt_name <- org_name
    cat("   GPT suggests org name:", gpt_name, "\n")
    
    resp <- POST(
      url = "https://api.seamless.ai/api/client/v1/search/contacts",
      add_headers(
        Authorization = paste("Bearer", access_token),
        `Content-Type` = "application/json"
      ),
      body = toJSON(list(
        companyName = gpt_name,
        seniority = list("C-Level","VP", "Director","Senior"),
        page = 1,
        limit = min(max_contacts, 50)
      ), auto_unbox = TRUE)
    )
    
    if (resp$status_code == 200) {
      data <- content(resp, "parsed", simplifyVector = FALSE)$data
    }
  }
  
  # 3. If still no results, try dataset org name
  if (is.null(data) || length(data) == 0) {
    cat("⚠️ Still no contacts — retrying with dataset org name:", org_name, "\n")
    
    resp <- POST(
      url = "https://api.seamless.ai/api/client/v1/search/contacts",
      add_headers(
        Authorization = paste("Bearer", access_token),
        `Content-Type` = "application/json"
      ),
      body = toJSON(list(
        companyName = org_name,
        seniority = list("C-Level"),
        page = 1,
        limit = min(max_contacts, 50)
      ), auto_unbox = TRUE)
    )
    
    if (resp$status_code == 200) {
      data <- content(resp, "parsed", simplifyVector = FALSE)$data
    }
  }
  
  # Final check
  if (!is.null(data) && length(data) > 0) {
    cat("   ✅ Found", length(data), "C-Level contacts\n")
    return(data)
  } else {
    cat("   ❌ No contacts found at all for", domain, "/", org_name, "\n")
    return(list())
  }
}


# --- GUI selection function for contacts ---
# --- GUI selection function for contacts ---
gui.select.contacts <- function(contacts, org_name) {
  selected <- vector("list", length(contacts))
  choice <- NULL
  
  submit_choice <- function() {
    choice <<- which(sapply(selected, function(v) as.integer(tclvalue(v))) == 1)
    tkdestroy(tt)
  }
  
  tt <- tktoplevel()
  tktitle(tt) <- paste("Select Contacts for", org_name)
  
  label <- tklabel(tt, text=paste("Choose contacts for:", org_name))
  tkpack(label, pady=10)
  
  for (i in seq_along(contacts)) {
    c <- contacts[[i]]
    
    # Prefer Seamless's company field if available
    company_display <- c$company %||% org_name
    
    display <- paste0(
      c$name %||% "Unknown", " — ", 
      c$title %||% "Unknown Title", 
      " (", company_display, ")"
    )
    
    var <- tclVar(0)
    cb <- tkcheckbutton(tt, text=display, variable=var)
    tkpack(cb, anchor="w")
    selected[[i]] <- var
  }
  
  submit_button <- tkbutton(tt, text="Submit", command=submit_choice)
  tkpack(submit_button, pady=10)
  
  tkwait.window(tt)
  
  if (is.null(choice) || length(choice) == 0) return(list())
  return(contacts[choice])
}


library(dplyr)

# --- Flatten a single contact into a dataframe row ---
contact_to_df <- function(contact, dataset_org, dataset_domain, selected = FALSE) {
  # Return a single scalar character (or NA) from any input
  nz1 <- function(x, default = NA_character_) {
    if (is.null(x) || length(x) == 0) return(default)
    # Flatten lists/nested structures
    if (is.list(x)) x <- unlist(x, recursive = TRUE, use.names = FALSE)
    # Coerce to character and take the first element
    x <- as.character(x)
    if (length(x) == 0) return(default)
    x[[1]]
  }
  
  # Ensure the list is named so we can preserve columns
  if (is.null(names(contact)) || any(names(contact) == "")) {
    names(contact) <- make.names(seq_along(contact))
  }
  
  # Coerce every element to a length-1 character (or NA)
  scalar_fields <- lapply(contact, nz1)
  
  # Make sure common/expected keys exist (helps downstream code)
  must_have <- c("searchResultId", "name", "title", "company", "companyName",
                 "email", "domain", "linkedin", "location")
  for (k in must_have) if (!k %in% names(scalar_fields)) scalar_fields[[k]] <- NA_character_
  
  # Build a one-row data frame
  df <- as.data.frame(scalar_fields, stringsAsFactors = FALSE, optional = TRUE)
  
  # Add crosswalk / flags
  df$dataset_org    <- as.character(nz1(dataset_org))
  df$dataset_domain <- as.character(nz1(dataset_domain))
  df$selected       <- isTRUE(selected)
  df$timestamp      <- format(Sys.time(), "%Y-%m-%d %H:%M:%S")
  
  # Derive `company` if empty but `companyName` exists
  if (!("company" %in% names(df)) || is.na(df$company) || df$company == "") {
    if ("companyName" %in% names(df) && !is.na(df$companyName) && df$companyName != "") {
      df$company <- df$companyName
    } else {
      df$company <- NA_character_
    }
  }
  
  # Drop duplicate-named columns if any (can happen after make.names)
  df <- df[, !duplicated(names(df)), drop = FALSE]
  
  # Ensure exactly one row is returned
  df[1, , drop = FALSE]
}


###################AI SELECT PROMPT##################################

ai_select_ids <- function(df_for_org, dataset_org, dataset_domain) {
  # Compose options string: "ID: (id) Name Title at Company with domain dom ..."
  # Keep it tight but complete; single line to help parsing.
  options_str <- paste0(
    "ID: (", df_for_org$searchResultId, ") ",
    df_for_org$name %||% "", " ",
    df_for_org$title %||% "", " at ",
    ifelse(!is.na(df_for_org$company) & nzchar(df_for_org$company), df_for_org$company,
           df_for_org$companyName %||% ""), 
    " with domain ", df_for_org$domain %||% df_for_org$dataset_domain,
    collapse = " ;; "
  )
  
  prompt <- paste0(
    "You are a sales operations leader purchasing contacts from Seamless.ai. ",
    "You are helping to find people at physician practice groups. ",
    "You are looking for 1 to 3 executives with a priority of any leaders that are also a physician and anyone that is the practice CEO/practice leader/",
    "You can select up to 3 executives, but your target is 2 for an organization. ",
    "Take more than 3 if there are many good high-priority titles or leaders who are also physicians.",
    "We don't want board members or IT/Technology leaders, but if there are few options, take the 1-2 that are the best options. ",
    "Sometimes we are given multiple people with the same name--we only want one with the same name with the most senior title. ",
    "Each contact also must be the same organization as what I searched. ",
    "Only exclude contacts that are CLEARLY not from the searched organization. ",
    "This search is for ", dataset_org, " (", dataset_domain, "). ",
    "Please tell me IDs of the executives, separated by '||' that you believe should be selected. ",
    "Reply with only the IDs without parentheses, each separated by '||', nothing else. ",
    "If no executives are a good fit, reply 'None'. ",
    "Here are the options: ", options_str
  )
  
  raw <- gpt(prompt, model = "gpt-5-mini")
  # Parse: split by '||', strip spaces and non-ID chars except - and _
  if (is.null(raw) || !nzchar(raw)) return(character(0))
  raw <- trimws(raw)
  if (tolower(raw) == "none") return(character(0))
  parts <- unlist(strsplit(raw, "\\|\\|"))
  parts <- trimws(parts)
  # keep only allowed chars in IDs
  ids <- gsub("[^A-Za-z0-9_-]", "", parts)
  unique(ids[nzchar(ids)])
}


# Pretty console printing for selections
print_selection_summary <- function(df_all) {
  sel <- df_all %>% filter(selected == TRUE) %>%
    transmute(searchResultId, name, title,
              company = ifelse(!is.na(company) & nzchar(company), company, companyName),
              domain = ifelse(!is.na(domain) & nzchar(domain), domain, dataset_domain),
              dataset_org, dataset_domain)
  not_sel <- df_all %>% filter(selected == FALSE) %>%
    transmute(searchResultId, name, title,
              company = ifelse(!is.na(company) & nzchar(company), company, companyName),
              domain = ifelse(!is.na(domain) & nzchar(domain), domain, dataset_domain),
              dataset_org, dataset_domain)
  
  cat("\n📊 Selection Summary\n---------------------\n")
  cat("Found:", nrow(df_all), " | Selected:", nrow(sel), " | Not Selected:", nrow(not_sel), "\n\n")
  
  if (nrow(sel)) {
    cat("✅ SELECTED:\n")
    print(sel, row.names = FALSE)
    cat("\n")
  } else {
    cat("✅ SELECTED: (none)\n\n")
  }
  
  if (nrow(not_sel)) {
    cat("🗂️  NOT SELECTED (showing up to 20):\n")
    print(head(not_sel, 20), row.names = FALSE)
    if (nrow(not_sel) > 20) cat("... (", nrow(not_sel) - 20, "more)\n", sep = "")
  } else {
    cat("🗂️  NOT SELECTED: (none)\n")
  }
}



###########PERFRORM THE SEARCH#######################################

out.dat = fbdownload("outcomemd/practice_dat")
od2 = out.dat[which(out.dat$rating >= 4.7),]

# master results holder
all_results <- data.frame()

for (i in 694:nrow(od2)) {
  dataset_org <- od2$`name`[i]
  dataset_domain <- od2$domain[i]
  
  cat("\n====================================================\n")
  cat("🏥 Organization:", dataset_org, "\n")
  cat("🌐 Domain:", dataset_domain, "\n")
  
  # Step 1: Search with domain → GPT → dataset fallback
  contacts <- search_c_level(dataset_domain, dataset_org, access_token, max_contacts = 15)
  
  if (length(contacts) == 0) next
  
  # Flatten ALL contacts for logging
  df_org <- bind_rows(lapply(contacts, function(c) contact_to_df(
    contact = c, dataset_org = dataset_org, dataset_domain = dataset_domain, selected = FALSE
  )))
  
  # Make sure key columns exist
  if (!"searchResultId" %in% names(df_org)) df_org$searchResultId <- ""
  if (!"name" %in% names(df_org)) df_org$name <- ""
  if (!"title" %in% names(df_org)) df_org$title <- ""
  if (!"company" %in% names(df_org)) df_org$company <- df_org$companyName %||% ""
  
  # AI chooses IDs
  chosen_ids <- ai_select_ids(df_org, dataset_org, dataset_domain)
  
  # Enforce max 5 (AI can suggest 1–5; we cap to 5)
  if (length(chosen_ids) > 5) chosen_ids <- chosen_ids[1:5]
  
  # Mark selected
  df_org$selected   <- df_org$searchResultId %in% chosen_ids
  df_org$AI.Select  <- df_org$selected
  
  # Print readable tables to console
  print_selection_summary(df_org)
  
  # Append to master
  all_results <- bind_rows(all_results, df_org)
  
  # Submit only selected contacts
  if (any(df_org$selected)) {
    chosen_contacts <- contacts[df_org$selected[match(sapply(contacts, `[[`, "searchResultId"),
                                                      df_org$searchResultId)]]
    # Some may be NA from match; filter safely
    chosen_contacts <- Filter(Negate(is.null), chosen_contacts)
    submit_for_research(chosen_contacts, access_token)
  } else {
    cat("⏭️ No AI-selected contacts to submit for:", dataset_org, "\n")
  }
  
  Sys.sleep(1) # gentle pacing
  cat("Done with:", dataset_org, "(", i, "/", nrow(od2), ")\n")
  message("Organization")
  message(i)
  message("All Results Found")
  message(nrow(all_results))
  message("All Results Searched")
  message(nrow(all_results[which(all_results$selected == TRUE),]))
}

# Persist master log (append-safe write)
out_path <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Data Reports/outcomemdlog.csv"
if (file.exists(out_path)) {
  # align columns (union) with existing, then overwrite
  existing <- read.csv(out_path, stringsAsFactors = FALSE)
  all_cols <- union(names(existing), names(all_results))
  for (col in all_cols) {
    if (!col %in% names(existing)) existing[[col]] <- NA_character_
    if (!col %in% names(all_results)) all_results[[col]] <- NA_character_
  }
  existing <- existing[, all_cols, drop = FALSE]
  all_results <- all_results[, all_cols, drop = FALSE]
  write.csv(bind_rows(existing, all_results), out_path, row.names = FALSE, na = "")
} else {
  write.csv(all_results, out_path, row.names = FALSE, na = "")
}
cat("\n🧾 Wrote master log to:\n", out_path, "\n")







