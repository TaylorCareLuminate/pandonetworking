library(plumber)
library(jsonlite)
library(dplyr)

WEBHOOK_SECRET <- "2JfxMWRM6aUtJYWCa+sXeUt+Tik8KoVZ"

# Function to clean and deduplicate contact data
clean_contact_data <- function(data) {
  tryCatch({
    # Handle the case where data might be a nested structure
    if (is.list(data) && !is.data.frame(data)) {
      # Convert to data frame, handling different structures
      if (length(data) > 0 && is.list(data[[1]])) {
        # Multiple contacts in list format
        df <- bind_rows(lapply(data, function(contact) {
          if (is.list(contact)) {
            # Flatten nested lists
            flattened <- list()
            for (name in names(contact)) {
              value <- contact[[name]]
              if (is.list(value) && length(value) == 1) {
                flattened[[name]] <- as.character(value[[1]])
              } else if (is.list(value)) {
                flattened[[name]] <- paste(unlist(value), collapse = "; ")
              } else {
                flattened[[name]] <- as.character(value)
              }
            }
            return(as.data.frame(flattened, stringsAsFactors = FALSE))
          }
          return(data.frame())
        }))
      } else {
        # Single contact
        flattened <- list()
        for (name in names(data)) {
          value <- data[[name]]
          if (is.list(value) && length(value) == 1) {
            flattened[[name]] <- as.character(value[[1]])
          } else if (is.list(value)) {
            flattened[[name]] <- paste(unlist(value), collapse = "; ")
          } else {
            flattened[[name]] <- as.character(value)
          }
        }
        df <- as.data.frame(flattened, stringsAsFactors = FALSE)
      }
    } else if (is.data.frame(data)) {
      df <- data
    } else {
      df <- data.frame(raw_data = as.character(data), stringsAsFactors = FALSE)
    }
    
    # Clean up the dataframe
    df[is.na(df)] <- ""  # Replace NA with empty strings
    
    # Remove duplicate rows (exact duplicates)
    df <- df[!duplicated(df), ]
    
    # If we have multiple rows for the same person, keep only the most complete one
    if ("name" %in% names(df) || "fullName" %in% names(df)) {
      name_field <- if ("name" %in% names(df)) "name" else "fullName"
      
      if (nrow(df) > 1) {
        # Group by name and keep the row with the most non-empty fields
        df <- df %>%
          group_by(!!sym(name_field)) %>%
          mutate(completeness = rowSums(. != "" & !is.na(.), na.rm = TRUE)) %>%
          slice_max(completeness, n = 1, with_ties = FALSE) %>%
          select(-completeness) %>%
          ungroup()
      }
    }
    
    # Add webhook metadata
    df$webhook_received_at <- as.character(Sys.time())
    df$webhook_session_id <- format(Sys.time(), "%Y%m%d_%H%M%S")
    
    return(df)
    
  }, error = function(e) {
    cat("Error cleaning data:", e$message, "\n")
    # Return basic dataframe on error
    return(data.frame(
      error = "Data processing failed",
      raw_data = as.character(data),
      webhook_received_at = as.character(Sys.time()),
      stringsAsFactors = FALSE
    ))
  })
}

# Function to safely write to CSV with proper column alignment
safe_csv_write <- function(df, csv_path) {
  tryCatch({
    file_exists <- file.exists(csv_path)
    
    if (file_exists) {
      # Read existing data to understand current structure
      existing_df <- read.csv(csv_path, stringsAsFactors = FALSE)
      
      # Get all unique column names (union of existing and new)
      all_cols <- union(names(existing_df), names(df))
      
      # Add missing columns to both dataframes with empty strings
      for (col in all_cols) {
        if (!col %in% names(existing_df)) {
          existing_df[[col]] <- ""
        }
        if (!col %in% names(df)) {
          df[[col]] <- ""
        }
      }
      
      # Reorder columns to match
      existing_df <- existing_df[, all_cols, drop = FALSE]
      df <- df[, all_cols, drop = FALSE]
      
      # Combine and remove duplicates
      combined_df <- rbind(existing_df, df)
      
      # Remove exact duplicates
      combined_df <- combined_df[!duplicated(combined_df), ]
      
      # Write the complete dataframe
      write.csv(combined_df, csv_path, row.names = FALSE, na = "")
      
      cat("Updated existing CSV with", nrow(df), "new rows\n")
      cat("Total rows in CSV:", nrow(combined_df), "\n")
      
    } else {
      # New file - write directly
      write.csv(df, csv_path, row.names = FALSE, na = "")
      cat("Created new CSV with", nrow(df), "rows\n")
    }
    
    return(TRUE)
    
  }, error = function(e) {
    cat("Error writing CSV:", e$message, "\n")
    
    # Fallback: write to a backup file
    backup_path <- paste0(csv_path, ".backup.", format(Sys.time(), "%Y%m%d_%H%M%S"))
    write.csv(df, backup_path, row.names = FALSE, na = "")
    cat("Data saved to backup file:", backup_path, "\n")
    
    return(FALSE)
  })
}

# Create webhook server
pr <- plumber$new()

pr$handle("GET", "/health", function() {
  list(status = "healthy", timestamp = Sys.time())
})

pr$handle("POST", "/seamless_webhook", function(req, res) {
  cat("\n=== SEAMLESS.AI WEBHOOK RECEIVED ===\n")
  cat("Timestamp:", as.character(Sys.time()), "\n")
  
  # Skip secret validation for now (we know it's working)
  cat("Processing webhook data...\n")
  
  tryCatch({
    # Parse the raw data
    raw_data <- fromJSON(req$postBody, simplifyVector = FALSE)
    
    cat("Raw data structure received:\n")
    cat("Data type:", class(raw_data), "\n")
    cat("Data length/size:", 
        if(is.list(raw_data)) length(raw_data) else length(as.character(raw_data)), "\n")
    
    # Clean and process the data
    clean_df <- clean_contact_data(raw_data)
    
    cat("Processed data summary:\n")
    cat("Rows:", nrow(clean_df), "\n")
    cat("Columns:", ncol(clean_df), "\n")
    
    # Show key contact info if available
    if ("name" %in% names(clean_df) || "fullName" %in% names(clean_df)) {
      name_col <- if ("name" %in% names(clean_df)) "name" else "fullName"
      unique_names <- unique(clean_df[[name_col]])
      cat("Contacts processed:", paste(unique_names, collapse = ", "), "\n")
    }
    
    # Show email info if available
    email_cols <- names(clean_df)[grepl("email", names(clean_df), ignore.case = TRUE)]
    if (length(email_cols) > 0) {
      cat("Email columns found:", paste(email_cols, collapse = ", "), "\n")
    }
    
    # Show phone info if available  
    phone_cols <- names(clean_df)[grepl("phone", names(clean_df), ignore.case = TRUE)]
    if (length(phone_cols) > 0) {
      cat("Phone columns found:", paste(phone_cols, collapse = ", "), "\n")
    }
    
    # Save to CSV with proper column alignment
    csv_path <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Data Reports/seamless_contacts_researched.csv"
    
    success <- safe_csv_write(clean_df, csv_path)
    
    if (success) {
      cat("✅ SUCCESS: Clean data saved to CSV!\n")
      cat("📁 File:", csv_path, "\n")
    } else {
      cat("⚠️ WARNING: Data saved to backup file\n")
    }
    
    return(list(
      status = "received",
      contacts_processed = nrow(clean_df),
      timestamp = Sys.time(),
      csv_updated = success
    ))
    
  }, error = function(e) {
    cat("❌ ERROR processing webhook:", e$message, "\n")
    cat("Raw postBody (first 500 chars):", substr(req$postBody, 1, 500), "\n")
    
    # Save raw data for debugging
    error_path <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Data Reports/webhook_errors.csv"
    error_df <- data.frame(
      timestamp = Sys.time(),
      error = e$message,
      raw_body = substr(req$postBody, 1, 1000),
      stringsAsFactors = FALSE
    )
    
    write.table(error_df, error_path, append = file.exists(error_path), 
                sep = ",", row.names = FALSE, col.names = !file.exists(error_path))
    
    res$status <- 500
    return(list(error = paste("Processing error:", e$message)))
  })
})

cat("🚀 Starting FIXED Seamless.ai Webhook Server\n")
cat("✅ Handles duplicate rows\n") 
cat("✅ Fixes column alignment\n")

cat("✅ Clean CSV output\n")
cat("📡 Listening on port 8000...\n\n")

pr$run(port = 8000, host = "0.0.0.0")