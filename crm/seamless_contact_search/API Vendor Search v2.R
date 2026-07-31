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
auth_code <- "rOPfB+hORy+w000gwvdR/VFJSCEm+zei"

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


company_resp <- POST(
  url = "https://api.seamless.ai/api/client/v1/search/companies",
  add_headers(`Authorization` = paste("Bearer", access_token), `Content-Type` = "application/json"),
  body = toJSON(list(
    query = list(companyName = "Seamless.AI"),
    page = 1,
    limit = 5
  ), auto_unbox = TRUE)
)


contact_resp <- POST(
  url = "https://api.seamless.ai/api/client/v1/search/contacts",
  add_headers(`Authorization` = paste("Bearer", access_token), `Content-Type` = "application/json"),
  body = toJSON(list(
    query = list(name = "John Doe"),
    page = 1,
    limit = 10
  ), auto_unbox = TRUE)
)



###################Do Search##############

all.domains = c(
  "100plus.com", "10to8.com", "2bprecisehealth.com", "314e.com", "3m.com", "4dglobalinc.com",
  "5thport.com", "abridge.com", "abstractivehealth.com", "accesshealthcare.com", "accuity.com",
  "accuray.com", "accuregsoftware.com", "aceso.com", "achievion.com", "aciworldwide.com",
  "acnhealthcare.com", "actx.com", "adec-innovations.com", "adp.com", "ahsrcm.com",
  "advisory.com", "agfahealthcare.com", "agshealth.com", "aidoc.com", "aiemedicalmanagement.com",
  "aiforia.com", "aisera.com", "aivahealth.com", "akasa.com", "allscripts.com", "alphaii.com",
  "amazon.com", "aws.amazon.com", "ambiencehealthcare.com", "americandatanetwork.com",
  "americanmessaging.net", "amion.com", "amplify.ovationhc.com", "amwell.com", "annalise.ai",
  "annexushealth.com", "mdstaff.com", "apprisemd.com", "approvedadmissions.com", "aptarro.com",
  "arcadia.io", "arintra.com", "armis.com", "arrivehealth.com", "artera.io", "arterys.com",
  "artificialmed.com", "asimily.com", "aspirion.com", "assurecare.com", "astartemedical.com",
  "asteriskservice.com", "athelas.com", "athenahealth.com", "atlashealth.com", "atlassystems.com",
  "atom-global.com", "atos.net", "augmedix.com", "authx.com", "autonomize.ai", "avaamo.ai",
  "availity.com", "avatier.com", "avaya.com", "avelecare.com", "avicenna.ai", "aycan.com",
  "azaleahealth.com", "banjohealth.com", "bastiongpt.com", "bd.com", "benchmarksystems.com",
  "biofourmis.com", "prognocis.com", "bluesight.com", "brainlab.com", "brundagegroup.com",
  "skyscape.com", "cadence.care", "callhippo.com", "carelogistics.com", "carecloud.com",
  "carecortex.ai", "caregility.com", "caremesh.com", "carepatron.com", "carestream.com",
  "carevive.com", "carrotfertility.com", "cbot.ai", "cedar.com", "ceipal.com", "celohealth.com",
  "censinet.com", "centaurihs.com", "cdnpacs.com", "cerner.com", "certifyhealth.com",
  "changehealthcare.com", "chartrequest.com", "cipherhealth.com", "cisco.com", "citiustech.com",
  "cityblock.com", "clarifyhealth.com", "claritygroup.com.au", "claroty.com", "cleararchhealth.com",
  "clearcompany.com", "cleargage.com", "clinked.com", "cloudmed.com", "codametrix.com",
  "coherehealth.com", "commure.com", "compliancy-group.com", "complyassistant.com",
  "conduent.com", "conduithp.com", "ConiferHealth.com", "connecteam.com", "constellation4.com",
  "corestudycast.com", "cornerstoneondemand.com", "coronishealth.com", "corrohealth.com",
  "covermymeds.com", "cpsi.com", "crothall.com", "curecloudmd.com", "curemd.com", "cynerio.com",
  "resolutionmd.com", "datavant.com", "deephealth.com", "deepscribe.ai", "deputy.com",
  "diagnotes.com", "digisonics.com", "dolbey.com", "doxy.me", "druidai.com", "eclinicalworks.com",
  "elekta.com", "elevatepfs.com", "elion.health", "eliseai.com", "elsevier.com", "enablecomp.com",
  "endosoft.com", "engagedly.com", "epic.com", "evidence.care", "evideon.com", "eviden.com",
  "evisit.com", "evolenthealth.com", "exchangeedi.com", "exlservice.com", "experianhealth.com",
  "extendedcare.com", "fabricgenomics.com", "fathomhealth.com", "findhelp.org", "finthrive.com",
  "firstsource.com", "flatiron.com", "fujifilm.com", "gehealthcare.com", "gebbs.com", "genesys.com",
  "geneyx.com", "genomoncology.com", "geonetric.com", "getwell.com", "getwellnetwork.com",
  "glidian.com", "cloud.google.com", "greenwayhealth.com", "halohealth.com", "harmonyhit.com",
  "healee.com", "healthcatalyst.com", "healthrecoverysolutions.com", "emedicalsystem.com",
  "healthedge.com", "healthifyme.com", "healthmark-group.com", "healthstream.com",
  "healthwise.life", "heidihealth.com", "heliometrics.net", "hicuityhealth.com", "hidglobal.com",
  "hipaasecurenow.com", "hospitalrevenuesolutions.com", "hucu.ai", "huma.com",
  "huronconsultinggroup.com", "hwlworks.com", "hylandhealthcare.com", "hypercare.com", "hyro.ai",
  "iatric.com", "ibm.com", "iq-image.com", "imaginesoftware.com", "imprivata.com", "infinitt.com",
  "infinx.com", "infosys.com", "innovaccer.com", "inovalon.com", "intelerad.com", "intelichart.com",
  "intellicentrics.com", "intermedia.com", "intersystems.com", "intraprisehealth.com",
  "iodinesoftware.com", "iba-worldwide.com", "iotsecure.io", "iqvia.com", "jane.app", "jorie.ai",
  "kimedics.com", "klara.com", "knackrcm.com", "kodiaksolutions.io", "kohezion.com",
  "koiosmedical.com", "konicaminolta.com", "korbyt.com", "kyruushealth.com", "leadrcm.com",
  "leadsquared.com", "risk.lexisnexis.com", "lifeomic.com", "lincor.com", "lgisolutions.com",
  "logicmanager.com", "logic-stream.net", "lumahealth.io", "mach7t.com", "macrohelix.com",
  "makeshift.ca", "Maxor340B.com", "maxrte.com", "mckesson.com", "mdfit.com", "mdlive.com",
  "mdmcommercial.com", "med-metrix.com", "medchat.ai", "medhost.com", "medicai.io",
  "mediquant.com", "meditech.com", "plus91.in", "medsphere.com", "medstreaming.com",
  "medsym.co.uk", "medtrainer.com", "medtronic.com", "meg.com", "mendfamily.com", "merative.com",
  "mesh.ai", "messagenius.com", "metalocator.com", "metricaid.com", "mevion.com", "microsoft.com",
  "nuance.com", "microtek.com", "mimsoftware.com", "miniorange.com", "mobileheartbeat.com",
  "morcare.com", "mrocorp.com", "multiviewcorp.com", "myndshft.com", "mytonomy.com", "nabla.com",
  "nanthealth.com", "navex.com", "navigatingcare.com", "navina.ai", "nextgen.com", "nice.com",
  "notablehealth.com", "notifyre.com", "novarad.net", "uniteus.com", "nrchealth.com", "nuvem.com",
  "nym.health", "OhMD.com", "Okta.com", "omnicell.com", "omnigo.com", "oneidentity.com",
  "oneviewhealthcare.com", "onpage.com", "bamboohealth.com", "optimize.health", "optum.com",
  "optum360coding.com", "oracle.com", "oracle.com/health", "orbithc.com", "orbita.ai",
  "orderlyhealth.com", "ordr.net", "origamirisk.com", "osp.com", "osplabs.com", "outbound.ai",
  "palantir.com", "paloaltonetworks.com", "parallon.com", "patienteducationgenius.com",
  "patientnotes.ai", "paubox.com", "paxerahealth.com", "paycor.com", "paylocity.com", "pcare.com",
  "pchhealth.global", "pchhealth.com", "PDi.com", "perfectserve.com", "performancehealthpartners.com",
  "performancehealthus.com", "thepharmaforce.com", "philips.com", "phreesia.com", "piecestech.com",
  "pillrhealth.com", "pmmconline.com", "practolytics.com", "praxisemr.com", "pressganey.com",
  "primecaretech.com", "primeramed.com", "promedcopy.com", "proscia.com", "pverify.com",
  "qgenda.com", "qliqsoft.com", "quantib.com", "quasrsystems.com", "quasrapp.com", "qure.ai",
  "qure4u.com", "qventus.com", "r1rcm.com", "radai.com", "radarhealthcare.com", "radsource.com",
  "rayscape.ai", "raysearchlabs.com", "medtechsolutions.com", "readinessrounds.com", "regard.com",
  "relatient.com", "ribbonhealth.com", "rightpatient.com", "ringrx.com", "Riskonnect.com",
  "rivethealth.com", "rldatix.com", "rocketrounding.com", "rxlightning.com", "rxnt.com",
  "safequal.com", "safequal.net", "sailpoint.com", "salesforce.com", "samacare.com", "sap.com",
  "saviynt.com", "scanstat.com", "scheduleanywhere.com", "scimage.com", "sdohsolutions.com",
  "seamless.md", "sectra.com", "secureauth.com", "semantichealth.ai", "sentact.com", "sentrics.net",
  "sentryds.com", "hds.sharecare.com", "shiftboard.com", "shifton.com", "siemens-healthineers.com",
  "sinovision-tech.com", "smarterdx.com", "smartlinx.com", "sociallydetermined.com",
  "socialroots.ai", "softneta.com", "solutionreach.com", "solventum.com", "sonifihealth.com",
  "sparktsl.com", "spok.com", "sprucehealth.com", "thessigroup.com", "stratadecision.com",
  "streamlinehealth.net", "strivemindz.com", "suki.ai", "sunoh.ai", "sunquestinfo.com", "sunrx.com",
  "surescripts.com", "syapse.com", "syllable.ai", "symplr.com", "tableau.com", "tailormed.com",
  "talkdesk.com", "teladochealth.com", "teletracking.com", "tempus.com", "thecranewaregroup.com",
  "theemployeeapp.com", "tigerconnect.com", "transcure.net", "trillianthealth.com",
  "trizettoprovider.com", "trubridge.com", "twilio.com", "twopoint.com", "ukg.com", "ultralinq.com",
  "uniguest.com", "uniphore.com", "updox.com", "uptodate.com", "ust.com", "varian.com", "vcomply.com",
  "veradigm.com", "verato.com", "verdurercm.com", "vergehealth.com", "verisma.com", "verisys.com",
  "verity340b.com", "va.gov", "viclarity.com", "vitalrecordscontrol.com", "galenhealth.com",
  "vivifyhealth.com", "viz.ai", "vocera.com", "valer.health", "vytlone.com", "waystar.com",
  "getweave.com", "webify.ai", "webmdignite.com", "well.company", "wellpartner.com", "wi4.org",
  "wolterskluwer.com", "workday.com", "xsolis.com", "yosi.health", "zeomega.com", "zoom.com"
)


domains.in = all.domains[11:length(all.domains)]


library(httr)
library(jsonlite)
library(dplyr)

# Safe null check operator
`%||%` <- function(a, b) if (!is.null(a)) a else b


# Function to search for sales & marketing leaders at a domain
search_leaders <- function(domain, access_token, max_contacts = 30) {
  cat("🔍 Searching", domain, "for sales & marketing leaders...\n")
  
  # Define target roles for sales and marketing C-level and VP positions
  sales_titles <- c(
    "Chief Sales Officer", "CSO", "Chief Revenue Officer", "CRO",
    "VP of Sales", "VP Sales", "Vice President of Sales", "Vice President Sales",
    "VP of Revenue", "VP Revenue", "Vice President of Revenue", "Vice President Revenue",
    "Sales Director", "Director of Sales", "Head of Sales"
  )
  
  marketing_titles <- c(
    "Chief Marketing Officer", "CMO", 
    "VP of Marketing", "VP Marketing", "Vice President of Marketing", "Vice President Marketing",
    "VP of Digital Marketing", "VP Digital Marketing",
    "Marketing Director", "Director of Marketing", "Head of Marketing"
  )
  
  # Combine all target titles
  all_titles <- c(sales_titles, marketing_titles)
  
  # Also search by seniority levels
  target_seniority <- c("C-Level", "VP", "Director")
  target_departments <- c("Sales", "Marketing", "Operations")
  
  cat("   📊 Searching for", length(all_titles), "different title variations\n")
  
  all_contacts <- list()
  
  # Search by job titles (primary search)
  tryCatch({
    response <- POST(
      url = "https://api.seamless.ai/api/client/v1/search/contacts",
      add_headers(`Authorization` = paste("Bearer", access_token), 
                  `Content-Type` = "application/json"),
      body = toJSON(list(
        companyDomain = list(domain),
        jobTitle = all_titles,
        page = 1,
        limit = min(max_contacts, 50)  # API limit per request
      ), auto_unbox = TRUE)
    )
    
    if (response$status_code == 200) {
      data <- content(response, "parsed", simplifyVector = FALSE)
      if (!is.null(data$data) && length(data$data) > 0) {
        all_contacts <- c(all_contacts, data$data)
        cat("   ✅ Found", length(data$data), "contacts via job title search\n")
      }
    } else {
      cat("   ⚠️ Job title search failed:", response$status_code, "\n")
    }
    
  }, error = function(e) {
    cat("   ❌ Error in job title search:", e$message, "\n")
  })
  
  # Search by seniority + department (backup search)
  if (length(all_contacts) < max_contacts) {
    cat("   🔍 Running backup search by seniority + department...\n")
    
    tryCatch({
      response <- POST(
        url = "https://api.seamless.ai/api/client/v1/search/contacts",
        add_headers(`Authorization` = paste("Bearer", access_token), 
                    `Content-Type` = "application/json"),
        body = toJSON(list(
          companyDomain = list(domain),
          seniority = target_seniority,
          department = target_departments,
          page = 1,
          limit = min(max_contacts - length(all_contacts), 50)
        ), auto_unbox = TRUE)
      )
      
      if (response$status_code == 200) {
        data <- content(response, "parsed", simplifyVector = FALSE)
        if (!is.null(data$data) && length(data$data) > 0) {
          # Avoid duplicates by checking if contact already exists
          new_contacts <- data$data
          existing_names <- sapply(all_contacts, function(c) c$name %||% "")
          
          for (contact in new_contacts) {
            contact_name <- contact$name %||% ""
            if (!contact_name %in% existing_names) {
              all_contacts <- c(all_contacts, list(contact))
            }
          }
          
          cat("   ✅ Added", length(data$data), "contacts via seniority search\n")
        }
      } else {
        cat("   ⚠️ Seniority search failed:", response$status_code, "\n")
      }
      
    }, error = function(e) {
      cat("   ❌ Error in seniority search:", e$message, "\n")
    })
  }
  
  # Limit to max_contacts
  if (length(all_contacts) > max_contacts) {
    all_contacts <- all_contacts[1:max_contacts]
    cat("   📊 Limited to", max_contacts, "contacts\n")
  }
  
  cat("   🎯 Total found for", domain, ":", length(all_contacts), "contacts\n")
  return(all_contacts)
}

# Function to submit multiple contacts for research
submit_multiple_for_research <- function(all_contacts_by_domain, access_token) {
  cat("\n📤 SUBMITTING CONTACTS FOR RESEARCH\n")
  cat("=====================================\n")
  
  total_submitted <- 0
  submission_results <- list()
  
  for (domain in names(all_contacts_by_domain)) {
    contacts <- all_contacts_by_domain[[domain]]
    
    if (length(contacts) == 0) {
      cat("⏭️ Skipping", domain, "- no contacts found\n")
      next
    }
    
    # Get contacts with searchResultIds
    enriched_contacts <- Filter(function(c) !is.null(c$searchResultId), contacts)
    
    if (length(enriched_contacts) == 0) {
      cat("⏭️ Skipping", domain, "- no enriched contacts\n")
      next
    }
    
    searchResultIds <- sapply(enriched_contacts, function(c) c$searchResultId)
    
    cat("📋", domain, "- submitting", length(searchResultIds), "contacts:\n")
    for (i in 1:min(5, length(enriched_contacts))) {  # Show first 5
      contact <- enriched_contacts[[i]]
      cat("   •", contact$name, "-", contact$title, "\n")
    }
    if (length(enriched_contacts) > 5) {
      cat("   • ... and", length(enriched_contacts) - 5, "more\n")
    }
    
    # Submit research request
    tryCatch({
      response <- POST(
        url = "https://api.seamless.ai/api/client/v1/contacts/research",
        add_headers(
          Authorization = paste("Bearer", access_token),
          `Content-Type` = "application/json"
        ),
        body = toJSON(list(searchResultIds = searchResultIds), auto_unbox = TRUE)
      )
      
      if (response$status_code == 200 || response$status_code == 202) {
        result <- content(response, "parsed", simplifyVector = FALSE)
        
        submission_results[[domain]] <- list(
          success = TRUE,
          count = length(searchResultIds),
          requestIds = result$requestIds
        )
        
        total_submitted <- total_submitted + length(searchResultIds)
        cat("   ✅ Success! Request IDs:", paste(head(result$requestIds, 3), collapse = ", "), 
            if(length(result$requestIds) > 3) "..." else "", "\n")
        
      } else {
        cat("   ❌ Failed:", response$status_code, "-", content(response, "text"), "\n")
        submission_results[[domain]] <- list(success = FALSE, count = 0)
      }
      
    }, error = function(e) {
      cat("   ❌ Error:", e$message, "\n")
      submission_results[[domain]] <- list(success = FALSE, count = 0)
    })
    
    # Rate limiting - wait 2 seconds between domains
    if (domain != names(all_contacts_by_domain)[length(all_contacts_by_domain)]) {
      cat("   ⏱️ Waiting 2 seconds before next domain...\n")
      Sys.sleep(2)
    }
  }
  
  cat("\n📊 SUBMISSION SUMMARY:\n")
  cat("Total contacts submitted:", total_submitted, "\n")
  cat("Domains processed:", length(submission_results), "\n")
  
  successful_domains <- sum(sapply(submission_results, function(x) x$success))
  cat("Successful submissions:", successful_domains, "\n")
  
  return(list(total = total_submitted, results = submission_results))
}

# Function to monitor webhook results with domain tracking
monitor_multi_domain_results <- function(expected_total, wait_minutes = 15) {
  csv_path <- "C:/Users/TaylorDavis/OneDrive - CareLuminate/R Data Reports/researched_contacts.csv"
  
  cat("\n⏳ MONITORING WEBHOOK RESULTS\n")
  cat("==============================\n")
  cat("📁 File:", csv_path, "\n")
  cat("🎯 Expected contacts:", expected_total, "\n")
  cat("⏰ Max wait time:", wait_minutes, "minutes\n\n")
  
  initial_count <- 0
  if (file.exists(csv_path)) {
    tryCatch({
      initial_data <- read.csv(csv_path, stringsAsFactors = FALSE)
      initial_count <- nrow(initial_data)
    }, error = function(e) {
      cat("Could not read initial CSV state\n")
    })
  }
  
  cat("📊 Starting count:", initial_count, "contacts\n\n")
  
  start_time <- Sys.time()
  last_count <- initial_count
  
  for (i in 1:(wait_minutes * 12)) {  # Check every 5 seconds
    Sys.sleep(5)
    
    if (file.exists(csv_path)) {
      tryCatch({
        current_data <- read.csv(csv_path, stringsAsFactors = FALSE)
        current_count <- nrow(current_data)
        
        if (current_count > last_count) {
          new_contacts <- current_count - last_count
          cat("📈 +", new_contacts, "new contacts! Total:", current_count, "\n")
          
          # Show recent contacts
          if (current_count > initial_count) {
            recent_data <- tail(current_data, current_count - initial_count)
            
            # Group by company if possible
            if ("company" %in% names(recent_data)) {
              companies <- table(recent_data$company)
              cat("   Companies represented:", length(companies), "\n")
              for (company in names(head(companies, 5))) {
                count <- companies[[company]]
                cat("   •", company, ":", count, "contacts\n")
              }
              if (length(companies) > 5) {
                cat("   • ... and", length(companies) - 5, "more companies\n")
              }
            }
            
            # Count emails and phones
            if ("email" %in% names(recent_data)) {
              email_count <- sum(!is.na(recent_data$email) & recent_data$email != "", na.rm = TRUE)
              cat("   📧 Contacts with emails:", email_count, "/", nrow(recent_data), "\n")
            }
            
            if ("contactPhone1" %in% names(recent_data)) {
              phone_count <- sum(!is.na(recent_data$contactPhone1) & recent_data$contactPhone1 != "", na.rm = TRUE)
              cat("   📞 Contacts with phones:", phone_count, "/", nrow(recent_data), "\n")
            }
          }
          
          last_count <- current_count
          
          # Check if we have enough
          if (current_count - initial_count >= expected_total) {
            cat("\n🎉 All expected contacts received!\n")
            return(current_data)
          }
        }
        
      }, error = function(e) {
        cat("⚠️ Error reading CSV:", e$message, "\n")
      })
    }
    
    # Progress update every 2 minutes
    if (i %% 24 == 0) {
      elapsed <- round(as.numeric(difftime(Sys.time(), start_time, units = "mins")), 1)
      cat("⏱️", elapsed, "/", wait_minutes, "minutes elapsed...\n")
    }
  }
  
  cat("\n⏰ Monitoring timeout after", wait_minutes, "minutes\n")
  
  # Final check
  if (file.exists(csv_path)) {
    tryCatch({
      final_data <- read.csv(csv_path, stringsAsFactors = FALSE)
      final_count <- nrow(final_data)
      new_total <- final_count - initial_count
      
      cat("📊 Final count:", final_count, "contacts (", new_total, "new)\n")
      return(final_data)
      
    }, error = function(e) {
      cat("Could not read final CSV state\n")
    })
  }
  
  return(NULL)
}

# MAIN EXECUTION FUNCTION
run_multi_domain_search <- function(domain_file = domains.in, max_per_domain = 30, access_token) {
  cat("🚀 MULTI-DOMAIN SALES & MARKETING LEADER SEARCH\n")
  cat("=================================================\n")
  cat("📋 Target: C-Level and VP positions in Sales & Marketing\n")
  cat("📊 Max per domain:", max_per_domain, "contacts\n\n")
  
  # Step 1: Read domain list
  domains <- domain_file
  if (is.null(domains) || length(domains) == 0) {
    stop("No domains to process")
  }
  
  cat("🎯 Processing domains:", paste(head(domains, 5), collapse = ", "), 
      if(length(domains) > 5) paste("... +", length(domains) - 5, "more") else "", "\n\n")
  
  # Step 2: Search each domain
  all_contacts_by_domain <- list()
  total_found <- 0
  
  cat("🔍 SEARCHING DOMAINS\n")
  cat("====================\n")
  
  for (i in seq_along(domains)) {
    domain <- domains[i]
    cat("[", i, "/", length(domains), "]", "Processing", domain, "...\n")
    
    contacts <- search_leaders(domain, access_token, max_per_domain)
    
    if (length(contacts) > 0) {
      all_contacts_by_domain[[domain]] <- contacts
      total_found <- total_found + length(contacts)
    }
    
    # Rate limiting between domains
    if (i < length(domains)) {
      cat("   ⏱️ Waiting 1 second before next domain...\n")
      Sys.sleep(1)
    }
    
    cat("\n")
  }
  
  cat("📊 SEARCH COMPLETE\n")
  cat("Total contacts found:", total_found, "\n")
  cat("Domains with contacts:", length(all_contacts_by_domain), "/", length(domains), "\n\n")
  
  if (total_found == 0) {
    cat("❌ No contacts found. Exiting.\n")
    return(NULL)
  }
  
  # Step 3: Submit for research
  submission_result <- submit_multiple_for_research(all_contacts_by_domain, access_token)
  
  if (submission_result$total == 0) {
    cat("❌ No contacts submitted for research. Exiting.\n")
    return(NULL)
  }
  
  # Step 4: Monitor webhook results
  cat("\n🔔 Webhook monitoring starting...\n")
  cat("Make sure your webhook server is running!\n")
  
  results <- monitor_multi_domain_results(submission_result$total, wait_minutes = 20)
  
  # Step 5: Final summary
  cat("\n🎯 CAMPAIGN COMPLETE!\n")
  cat("======================\n")
  
  if (!is.null(results)) {
    cat("✅ Successfully processed", nrow(results), "contacts\n")
    
    if ("company" %in% names(results)) {
      companies <- length(unique(results$company))
      cat("🏢 From", companies, "different companies\n")
    }
    
    if ("email" %in% names(results)) {
      email_count <- sum(!is.na(results$email) & results$email != "", na.rm = TRUE)
      cat("📧 Contacts with emails:", email_count, "\n")
    }
    
    cat("📁 Data ready for outreach campaigns!\n")
    
  } else {
    cat("⏳ Results may still be processing\n")
    cat("📁 Check the CSV file manually later\n")
  }
  
  return(results)
}

# EXAMPLE USAGE:
cat("💡 SETUP INSTRUCTIONS:\n")
cat("1. Create 'domains.in' file with one domain per line\n")
cat("2. Make sure your webhook server is running\n")
cat("3. Run: results <- run_multi_domain_search()\n\n")

# Uncomment to run:
 results <- run_multi_domain_search(
   domain_file = domains.in, 
   max_per_domain = 30, 
   access_token = access_token
 )

