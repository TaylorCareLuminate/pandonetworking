# Hospital Sepsis Performance Analysis - Data Documentation

## Overview
This dataset provides comprehensive sepsis performance metrics for hospitals and health systems across the United States. The data structure includes ONE master hospital dataset with multiple percentile comparisons, plus separate summary datasets showing group averages.

**Data Source:** CMS Timely and Effective Care - Hospital dataset (2026-01)  
**Generated:** Hospital Level Sepsis Analysis.R  
**Firebase Location:** `medbeacon/sepsis/`

---

## Data Structure - Two-Tier System

### Tier 1: Master Hospital Dataset
**ONE dataset** containing all ~7,000 hospitals with **six different percentile calculations**

### Tier 2: Summary Datasets  
**Six separate datasets** showing **average performance** for each grouping (regions, sizes, etc.)

---

## Sepsis Measures

All datasets include three key sepsis performance measures:

### 1. **SEP_1 - Sepsis Appropriate Care**
- **Description:** Overall bundle compliance for sepsis care
- **Interpretation:** Percentage of patients who received appropriate care for severe sepsis and septic shock

### 2. **SEP_SH_3HR - Sepsis Lactate Result** 
- **Description:** Lactate result within 3 hours
- **Interpretation:** Percentage of patients who had lactate levels measured within 3 hours of severe sepsis/septic shock presentation

### 3. **SEP_SH_6HR - Sepsis Antibiotic**
- **Description:** Broad-spectrum antibiotics within 6 hours
- **Interpretation:** Percentage of patients who received broad-spectrum antibiotics within 6 hours of severe sepsis/septic shock presentation

---

## Master Hospital Dataset (`medbeacon/sepsis/hospitals`)

**Purpose:** Complete hospital-level data with ALL peer-group percentile comparisons  
**Record Count:** ~7,000 hospitals

### Hospital Identification Fields
- `facility_id` - CMS Facility ID
- `hospital_name` - Official hospital name
- `health_system` - Parent health system name
- `hs_domain` - Health system domain (e.g., "mayoclinic.org")
- `city`, `state` - Hospital location

### Hospital Classification Fields
- `region` - Geographic region (Northeast, Midwest, South, Mountain, West)
- `size_category` - Size classification (Small, Medium, Large, Very Large)
- `hospital_type` - Type of facility (Acute Care, Critical Access, Psychiatric, etc.)
- `teaching_hospital` - Teaching vs Non-Teaching status
- `licensed_beds` - Number of licensed beds
- `ehr` - EHR vendor (Epic, Cerner, etc.)

### Sepsis Performance Fields
**Scores (3 fields)** - Same for all comparisons:
- `sepsis_appropriate_care_score` - Actual performance (0-100)
- `sepsis_lactate_result_score` - Actual performance (0-100)
- `sepsis_antibiotic_score` - Actual performance (0-100)

**Percentiles (21 fields total)** - Seven different peer-group comparisons:

1. **National Percentiles** - Compare to ALL U.S. hospitals
   - `national_sepsis_appropriate_care_percentile`
   - `national_sepsis_lactate_result_percentile`
   - `national_sepsis_antibiotic_percentile`

2. **Regional Percentiles** - Compare to hospitals in SAME REGION
   - `regional_sepsis_appropriate_care_percentile`
   - `regional_sepsis_lactate_result_percentile`
   - `regional_sepsis_antibiotic_percentile`

3. **Size Percentiles** - Compare to hospitals of SAME SIZE
   - `size_sepsis_appropriate_care_percentile`
   - `size_sepsis_lactate_result_percentile`
   - `size_sepsis_antibiotic_percentile`

4. **Teaching Percentiles** - Compare to same teaching status
   - `teaching_sepsis_appropriate_care_percentile`
   - `teaching_sepsis_lactate_result_percentile`
   - `teaching_sepsis_antibiotic_percentile`

5. **Type Percentiles** - Compare to same hospital type
   - `type_sepsis_appropriate_care_percentile`
   - `type_sepsis_lactate_result_percentile`
   - `type_sepsis_antibiotic_percentile`

6. **EHR Percentiles** - Compare to same EHR vendor
   - `ehr_sepsis_appropriate_care_percentile`
   - `ehr_sepsis_lactate_result_percentile`
   - `ehr_sepsis_antibiotic_percentile`

7. **Health System Percentiles** - Compare to hospitals in SAME HEALTH SYSTEM
   - `hs_sepsis_appropriate_care_percentile`
   - `hs_sepsis_lactate_result_percentile`
   - `hs_sepsis_antibiotic_percentile`

### Example Record

```javascript
{
  facility_id: "123456",
  hospital_name: "Memorial Medical Center",
  hs_domain: "memorialhealth.org",
  region: "South",
  size_category: "Medium (50-199 beds)",
  teaching_hospital: "Non-Teaching",
  hospital_type: "Acute Care Hospitals",
  licensed_beds: 150,
  ehr: "Epic",
  
  // Scores
  sepsis_appropriate_care_score: 76.2,
  sepsis_lactate_result_score: 82.1,
  sepsis_antibiotic_score: 79.5,
  
  // Six different percentile comparisons
  national_sepsis_appropriate_care_percentile: 55,    // 55th nationally
  regional_sepsis_appropriate_care_percentile: 68,    // 68th in South
  size_sepsis_appropriate_care_percentile: 72,        // 72nd among medium hospitals
  teaching_sepsis_appropriate_care_percentile: 71,    // 71st among non-teaching
  type_sepsis_appropriate_care_percentile: 58,        // 58th among acute care
  ehr_sepsis_appropriate_care_percentile: 52          // 52nd among Epic users
  hs_sepsis_appropriate_care_percentile: 45           // 45th within Memorial Health system
}
```

---

## Summary Datasets (`medbeacon/sepsis/summaries/`)

These datasets show **average performance** for each peer group.

### 1. Health System Summary (`summaries/health_systems`)

**Purpose:** Average sepsis performance by health system  
**Record Count:** ~3,000 health systems

**Fields:**
- `hs_domain` - Health system domain
- `health_system` - Health system name
- `num_hospitals` - Number of hospitals in system
- `total_beds` - Total licensed beds
- `sepsis_appropriate_care_n` - Number of hospitals reporting SEP_1
- `sepsis_lactate_result_n` - Number of hospitals reporting SEP_SH_3HR
- `sepsis_antibiotic_n` - Number of hospitals reporting SEP_SH_6HR
- `avg_sepsis_appropriate_care_score` - Average score across system
- `avg_sepsis_lactate_result_score` - Average score across system
- `avg_sepsis_antibiotic_score` - Average score across system
- `national_sepsis_appropriate_care_percentile` - Where system average ranks nationally (1-99)
- `national_sepsis_lactate_result_percentile` - Where system average ranks nationally (1-99)
- `national_sepsis_antibiotic_percentile` - Where system average ranks nationally (1-99)

**Use Case:** Compare health system averages, understand system-wide performance, identify top-performing health systems nationally

**Note:** Percentiles are capped between 1 and 99 (no 0th or 100th percentiles)

---

### 2. Regional Summary (`summaries/regions`)

**Purpose:** Average sepsis performance by U.S. region  
**Record Count:** 5 regions

**Regions:**
- Northeast: CT, ME, MA, NH, RI, VT, NJ, NY, PA
- Midwest: IL, IN, MI, OH, WI, IA, KS, MN, MO, NE, ND, SD
- South: DE, FL, GA, MD, NC, SC, VA, DC, WV, AL, KY, MS, TN, AR, LA, OK, TX
- Mountain: AZ, CO, ID, MT, NV, NM, UT, WY
- West: AK, CA, HI, OR, WA

**Fields:**
- `region` - Geographic region
- `num_hospitals` - Number of hospitals in region
- `num_health_systems` - Number of unique health systems
- `total_beds` - Total licensed beds in region
- `sepsis_appropriate_care_n` - Number of hospitals reporting
- `avg_sepsis_appropriate_care_score` - Regional average
- (Similar fields for other measures)

**Use Case:** Compare regional averages, show hospital performance vs regional average

---

### 3. Hospital Size Summary (`summaries/hospital_sizes`)

**Purpose:** Average sepsis performance by hospital size category  
**Record Count:** 4 size categories

**Size Categories:**
- Small: < 50 beds
- Medium: 50-199 beds
- Large: 200-399 beds
- Very Large: 400+ beds

**Fields:**
- `size_category` - Size classification
- `num_hospitals` - Number of hospitals in category
- `avg_beds` - Average bed count
- `total_beds` - Total beds in category
- `sepsis_appropriate_care_n` - Number of hospitals reporting
- `avg_sepsis_appropriate_care_score` - Category average
- (Similar fields for other measures)

**Use Case:** Show size-category averages, compare hospital to size-appropriate benchmark

---

### 4. Teaching Status Summary (`summaries/teaching_status`)

**Purpose:** Average sepsis performance by teaching status  
**Record Count:** 2 categories (Teaching, Non-Teaching)

**Fields:**
- `teaching_status` - Teaching or Non-Teaching
- `num_hospitals`, `avg_beds`, `total_beds`
- `sepsis_appropriate_care_n`
- `avg_sepsis_appropriate_care_score`
- (Similar fields for other measures)

**Use Case:** Compare teaching vs non-teaching hospitals, show academic medical center benchmarks

---

### 5. Hospital Type Summary (`summaries/hospital_types`)

**Purpose:** Average sepsis performance by facility type  
**Record Count:** ~5-10 hospital types

**Common Types:**
- Acute Care Hospitals
- Critical Access Hospitals
- Psychiatric
- Children's Hospitals
- Rehabilitation

**Fields:**
- `hospital_type` - Facility type
- `num_hospitals`, `avg_beds`, `total_beds`
- `sepsis_appropriate_care_n`
- `avg_sepsis_appropriate_care_score`
- (Similar fields for other measures)

**Use Case:** Type-specific benchmarking, show hospital performance vs type average

---

### 6. EHR Vendor Summary (`summaries/ehr_vendors`)

**Purpose:** Average sepsis performance by EHR system  
**Record Count:** ~15-20 vendors

**Common Vendors:**
- Epic, Cerner/Oracle, Meditech, CPSI, Allscripts

**Fields:**
- `ehr_vendor` - EHR system name
- `num_hospitals`, `avg_beds`, `total_beds`
- `sepsis_appropriate_care_n`
- `avg_sepsis_appropriate_care_score`
- (Similar fields for other measures)

**Use Case:** EHR vendor performance comparisons, technology impact analysis

---

## How to Use the Data

### Example 1: Comprehensive Hospital Report

Show how Hospital X performs across all dimensions:

```javascript
// Get the hospital record
const hospitalRef = firebase.database().ref('medbeacon/sepsis/hospitals');
hospitalRef.orderByChild('facility_id').equalTo('123456').once('value', (snapshot) => {
  const hospital = snapshot.val()[0];
  
  // Display 6 different percentile comparisons
  console.log(`National: ${hospital.national_sepsis_appropriate_care_percentile}th percentile`);
  console.log(`Regional (${hospital.region}): ${hospital.regional_sepsis_appropriate_care_percentile}th percentile`);
  console.log(`Size (${hospital.size_category}): ${hospital.size_sepsis_appropriate_care_percentile}th percentile`);
  console.log(`Teaching: ${hospital.teaching_sepsis_appropriate_care_percentile}th percentile`);
  console.log(`Type: ${hospital.type_sepsis_appropriate_care_percentile}th percentile`);
  console.log(`EHR (${hospital.ehr}): ${hospital.ehr_sepsis_appropriate_care_percentile}th percentile`);
});

// Get regional average for comparison
const regionRef = firebase.database().ref('medbeacon/sepsis/summaries/regions');
regionRef.orderByChild('region').equalTo('South').once('value', (snapshot) => {
  const regionalAvg = snapshot.val()[0];
  console.log(`Regional average: ${regionalAvg.avg_sepsis_appropriate_care_score}`);
});
```

### Example 2: Health System Dashboard

Show how all hospitals in a health system perform:

```javascript
// Get all hospitals in the system
const hospitalsRef = firebase.database().ref('medbeacon/sepsis/hospitals');
hospitalsRef.orderByChild('hs_domain').equalTo('mayoclinic.org').once('value', (snapshot) => {
  const hospitals = snapshot.val();
  
  hospitals.forEach(hospital => {
    console.log(`${hospital.hospital_name}:`);
    console.log(`  National: ${hospital.national_sepsis_appropriate_care_percentile}th`);
    console.log(`  Regional: ${hospital.regional_sepsis_appropriate_care_percentile}th`);
    console.log(`  Size: ${hospital.size_sepsis_appropriate_care_percentile}th`);
  });
});

// Get system-wide average
const systemRef = firebase.database().ref('medbeacon/sepsis/summaries/health_systems');
systemRef.orderByChild('hs_domain').equalTo('mayoclinic.org').once('value', (snapshot) => {
  const systemAvg = snapshot.val()[0];
  console.log(`System average: ${systemAvg.avg_sepsis_appropriate_care_score}`);
});
```

### Example 3: Regional Competitive Analysis

Compare hospitals in a region:

```javascript
// Get all hospitals in South
const hospitalsRef = firebase.database().ref('medbeacon/sepsis/hospitals');
hospitalsRef.orderByChild('region').equalTo('South').once('value', (snapshot) => {
  const hospitals = snapshot.val();
  
  // Filter to top performers in region
  const topPerformers = hospitals.filter(h => 
    h.regional_sepsis_appropriate_care_percentile >= 90
  );
  
  console.log(`Top 10% in South: ${topPerformers.length} hospitals`);
});

// Get regional average
const regionRef = firebase.database().ref('medbeacon/sepsis/summaries/regions');
regionRef.orderByChild('region').equalTo('South').once('value', (snapshot) => {
  const regionalStats = snapshot.val()[0];
  console.log(`South average: ${regionalStats.avg_sepsis_appropriate_care_score}`);
});
```

---

## Key Insights from the Structure

### One Hospital, Seven Perspectives

Every hospital has ONE score but SEVEN different percentile rankings:

| Perspective | Question Answered |
|-------------|------------------|
| National | How do we rank nationally? |
| Regional | How do we rank in our region? |
| Size | How do we rank among similar-sized hospitals? |
| Teaching | How do we rank among teaching/non-teaching hospitals? |
| Type | How do we rank among our facility type? |
| EHR | How do we rank among hospitals using our EHR? |
| Health System | How do we rank within our own health system? |

### Summary Data for Context

Use summary datasets to provide benchmarks:
- "Your hospital scored 78.5, which is above the regional average of 75.2"
- "Among medium-sized hospitals, the average is 76.8"
- "Epic users average 77.1 on this measure"

---

## Firebase Structure

```
medbeacon/
└── sepsis/
    ├── hospitals/                          # Master dataset (~7,000 records)
    │   └── [facility_id]/                  # Each hospital with all percentiles
    └── summaries/                          # Group averages
        ├── health_systems/                 # ~3,000 records
        ├── regions/                        # 5 records
        ├── hospital_sizes/                 # 4 records
        ├── teaching_status/                # 2 records
        ├── hospital_types/                 # ~5-10 records
        └── ehr_vendors/                    # ~15-20 records
```

---

## Update Frequency

**Recommended:** Quarterly (aligned with CMS data releases)

CMS typically updates sepsis measures quarterly. Re-running the `Hospital Level Sepsis Analysis.R` script with updated CMS data will refresh all datasets.

---

## Data Governance

### Data Source Attribution
- Primary data source: CMS Timely and Effective Care - Hospital
- Hospital and health system metadata: CareLuminate hospital database

### Privacy & Compliance
- All data is publicly available from CMS
- Hospital-level data is de-identified per HIPAA standards
- No patient-level information is included

### Data Accuracy
- Scores reflect hospital performance as reported to CMS
- Health system affiliations based on CareLuminate database (may lag real-time changes)
- Percentiles calculated relative to reporting hospitals within each peer group

---

## Support & Questions

For questions about this data or to request additional breakouts, contact:
- **Email:** taylordavis@careluminate.com
- **Script Location:** `R Code/Client Specific/Steve McDonald/Hospital Level Sepsis Analysis.R`

---

## Version History

**Version 2.0** - January 2026
- Restructured to ONE master hospital dataset with multiple percentile columns
- Added six summary datasets for group averages
- Simplified data structure for easier reporting
- Data from CMS 2026-01 reporting period
- Covers ~7,000 hospitals and ~3,000 health systems
