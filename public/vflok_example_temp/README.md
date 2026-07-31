# VFlok Hospital Data - Upload Instructions

## Overview
This folder is for the hospital dataset that powers the **In Process US Hospital Data Dashboard**.

## Data File
Place your CSV file here: `to_upload.csv`

The CSV should contain the following columns based on the data dictionary:

### Required Columns
- `medicare_provider_id` - CMS certification number
- `hospital_name` - Hospital name
- `health_system_name` - Parent health system (blank for standalone hospitals)
- `beds_for_hospital` - Licensed bed count
- `hospitals_for_system` - Number of hospitals in system

### Technology Columns
- `links` - Hospital website URL
- `ehr` - EHR system (Epic, Cerner, MEDITECH, etc.)
- `erp` - ERP system (Workday, Oracle, SAP, etc.)
- `nurse_scheduling` - Nurse scheduling software
- `workforce` - Workforce management system

### Classification & Rating
- `1_2_3_4` - MSA Tier (1=major metro, 4=rural)
- `grade` - Bond credit rating
- `vh_h_m_l` - Analytics maturity (VH/H/M/L)
- `vizient_premier_healthtrust` - GPO membership

### Financial Metrics
- `net_revenue` - Annual net patient revenue
- `net_income_margin` - Net income as % of revenue
- `expense_adj_patient_day` - Expenses per adjusted patient day
- `expense_adj_patient_day_quartile` - Cost efficiency quartile (1-4)

### Operational Metrics
- `occupancy` - Occupancy rate (%)
- `vacancy_rates_nursing_against_ft` - RN vacancy rate (%)
- `vacancy_rates_all` - Overall vacancy rate (%)
- `contracted_labor_rates` - Contract/agency labor (%)
- `ftes_aob` - FTEs per adjusted occupied bed
- `ftes_aob_quartile` - Staffing quartile (1-4)
- `ft_nursing_aob` - Full-time nursing per AOB
- `ft_nursing_aob_quartile` - Nursing staffing quartile (1-4)

### Quality & Recognition
- `star_ratings` - CMS Star Rating (1-5 or "Not Available")
- `magnet` - Magnet designation (Yes/No/In Progress)
- `pathway_to_excellence` - Pathway designation (Yes/No)
- `best_places_to_work` - Best workplace recognition (Yes/No)
- `leapfrog` - Leapfrog grade (A/B/C/D/F)

### Innovation
- `innovation_centers` - Has innovation center (Yes/No)
- `ai_initiatives` - Has AI initiatives (Yes/No)

## Uploading to Firebase

Once you have your CSV file ready:

1. Convert the CSV to JSON format (if needed)
2. Upload to Firebase Realtime Database at: `public/vflok_hospital_data`

## Dashboard Features

The dashboard includes:

✅ **Two View Modes:**
- All Hospitals (individual cards)
- Grouped by Health System (with aggregated metrics)

✅ **Basic Filters:**
- Search by hospital name, health system, location
- Filter by EHR system
- Filter by Star Rating
- Sort by multiple criteria

✅ **Advanced Filtering:**
- Complex filter builder with AND/OR logic
- Support for groups and nested conditions
- Filter by any column with various operators
- Include/exclude NA values
- Save and load filters

✅ **Health System Grouping:**
- Automatic aggregation for hospitals in same system
- Standalone hospitals shown individually
- Collapsible health system groups
- System-level summary statistics

✅ **Professional UI:**
- Color-coded badges for quality metrics
- Star rating visualizations
- Occupancy indicators
- Quality designation badges (Magnet, Leapfrog, etc.)
- Responsive design

## Notes
- Many columns contain example data (as noted in the dashboard)
- Blank `health_system_name` indicates standalone hospital
- Financial metrics are aggregated (summed) for health systems
- Operational metrics are averaged for health systems

## Support
If you need help formatting your data or uploading to Firebase, please reach out!
