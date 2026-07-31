################################################################################
##
## Quick Start - Debug Problem Profiles
##
## This will pull the two problem profiles and show you the raw data structure
## so we can fix the extraction logic
##
################################################################################

# Run the debug script
source("C:/Users/TaylorDavis/OneDrive - CareLuminate/R Code/Apify/Apify Actors/bebity_profile_search_debug.R")

# After it completes, you can examine the raw data:
# raw <- loadr("Bebity Debug - Raw JSON")
# str(raw)
# str(raw[[1]]$EXPERIENCE)  # Johnathan Cote
# str(raw[[2]]$EXPERIENCE)  # Chad Fisher

