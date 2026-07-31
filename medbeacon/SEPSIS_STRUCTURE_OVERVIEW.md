# Sepsis Data Structure - Complete Overview

## ✅ Final Structure

### ONE Master Hospital Dataset
**Location:** `medbeacon/sepsis/hospitals`  
**Records:** ~7,000 hospitals  
**Contains:** Every hospital with 7 different percentile calculations

**Percentile Columns (21 total):**
```
national_sepsis_appropriate_care_percentile
national_sepsis_lactate_result_percentile
national_sepsis_antibiotic_percentile

regional_sepsis_appropriate_care_percentile
regional_sepsis_lactate_result_percentile
regional_sepsis_antibiotic_percentile

size_sepsis_appropriate_care_percentile
size_sepsis_lactate_result_percentile
size_sepsis_antibiotic_percentile

teaching_sepsis_appropriate_care_percentile
teaching_sepsis_lactate_result_percentile
teaching_sepsis_antibiotic_percentile

type_sepsis_appropriate_care_percentile
type_sepsis_lactate_result_percentile
type_sepsis_antibiotic_percentile

ehr_sepsis_appropriate_care_percentile
ehr_sepsis_lactate_result_percentile
ehr_sepsis_antibiotic_percentile

hs_sepsis_appropriate_care_percentile
hs_sepsis_lactate_result_percentile
hs_sepsis_antibiotic_percentile
```

### SIX Summary Datasets (Group Averages)
**Location:** `medbeacon/sepsis/summaries/[group]`

1. **health_systems** - ~3,000 health systems
2. **regions** - 5 regions  
3. **hospital_sizes** - 4 size categories
4. **teaching_status** - 2 categories
5. **hospital_types** - ~5-10 types
6. **ehr_vendors** - ~15-20 vendors

Each summary contains `avg_sepsis_*_score` fields showing group averages.

---

## Use Cases

### 1. Single Hospital Profile
**Query:** Get one hospital from master dataset  
**Result:** All 6 percentile perspectives in one record  
**Display:** "You rank X nationally, Y regionally, Z among similar-sized hospitals"

### 2. Health System Dashboard  
**Query:** Filter master dataset by `hs_domain`  
**Result:** All hospitals in the system with all percentiles  
**Add:** System average from health_systems summary  
**Display:** List of hospitals with their various rankings

### 3. Regional Competitive Analysis
**Query:** Filter master dataset by `region`  
**Result:** All hospitals in region with regional percentiles  
**Add:** Regional average from regions summary  
**Display:** "You rank 72nd among 1,850 Southern hospitals (regional avg: 75.2)"

### 4. Peer Group Benchmarking
**Query:** Filter master dataset by size/type/teaching/EHR  
**Result:** All hospitals in peer group with peer-specific percentiles  
**Add:** Group average from relevant summary  
**Display:** "Among 1,200 medium-sized hospitals, you rank 68th (avg: 76.8)"

### 5. Multi-Dimensional Report
**Query:** Get one hospital from master dataset  
**Query:** Get all relevant summaries  
**Result:** Hospital scores + percentiles + group averages  
**Display:** Complete dashboard showing performance from all angles

---

## Example Complete Hospital Profile

```json
{
  "facility_id": "123456",
  "hospital_name": "Memorial Medical Center",
  "health_system": "Memorial Health",
  "hs_domain": "memorialhealth.org",
  "region": "South",
  "size_category": "Medium (50-199 beds)",
  "teaching_hospital": "Non-Teaching",
  "hospital_type": "Acute Care Hospitals",
  "licensed_beds": 150,
  "ehr": "Epic",
  
  "sepsis_appropriate_care_score": 76.2,
  "sepsis_lactate_result_score": 82.1,
  "sepsis_antibiotic_score": 79.5,
  
  "national_sepsis_appropriate_care_percentile": 55,
  "national_sepsis_lactate_result_percentile": 62,
  "national_sepsis_antibiotic_percentile": 58,
  
  "regional_sepsis_appropriate_care_percentile": 68,
  "regional_sepsis_lactate_result_percentile": 74,
  "regional_sepsis_antibiotic_percentile": 71,
  
  "size_sepsis_appropriate_care_percentile": 72,
  "size_sepsis_lactate_result_percentile": 78,
  "size_sepsis_antibiotic_percentile": 75,
  
  "teaching_sepsis_appropriate_care_percentile": 71,
  "teaching_sepsis_lactate_result_percentile": 76,
  "teaching_sepsis_antibiotic_percentile": 73,
  
  "type_sepsis_appropriate_care_percentile": 58,
  "type_sepsis_lactate_result_percentile": 64,
  "type_sepsis_antibiotic_percentile": 61,
  
  "  ehr_sepsis_appropriate_care_percentile": 52,
  "ehr_sepsis_lactate_result_percentile": 58,
  "ehr_sepsis_antibiotic_percentile": 55,
  
  "hs_sepsis_appropriate_care_percentile": 45,
  "hs_sepsis_lactate_result_percentile": 51,
  "hs_sepsis_antibiotic_percentile": 48
}
```

---

## Benefits of This Structure

### Simplicity
✅ ONE dataset for all hospital data  
✅ No complex joins required  
✅ All percentiles pre-calculated  
✅ Simple filtering by any field  

### Flexibility
✅ Choose any percentile type for reporting  
✅ Mix and match comparisons  
✅ Easy to add new percentile types  
✅ Summary data available for context  

### Performance
✅ Single Firebase query for complete profile  
✅ Efficient data loading  
✅ Fast filtering and sorting  
✅ Minimal database reads  

### Reporting Power
✅ Multi-dimensional analysis  
✅ Comprehensive benchmarking  
✅ Context-rich insights  
✅ Flexible visualization options  

---

## Quick Start Guide

### Step 1: Get Hospital Data
```javascript
const hospital = await getHospital("123456");
```

### Step 2: Choose Percentile(s) to Display
```javascript
// Show national ranking
console.log(`National: ${hospital.national_sepsis_appropriate_care_percentile}th percentile`);

// Show regional ranking
console.log(`Regional: ${hospital.regional_sepsis_appropriate_care_percentile}th percentile`);

// Show all six
showAllPercentiles(hospital);
```

### Step 3: Add Context with Summary Data
```javascript
const regionalAvg = await getRegionalSummary(hospital.region);
const sizeAvg = await getSizeSummary(hospital.size_category);

console.log(`Your score: ${hospital.sepsis_appropriate_care_score}`);
console.log(`Regional average: ${regionalAvg.avg_sepsis_appropriate_care_score}`);
console.log(`Size-category average: ${sizeAvg.avg_sepsis_appropriate_care_score}`);
```

---

## Files Created

1. **Hospital Level Sepsis Analysis.R** - Main script generating all data
2. **SEPSIS_DATA_README.md** - Complete technical documentation
3. **SEPSIS_QUICK_REFERENCE.md** - Quick usage guide
4. **SEPSIS_STRUCTURE_OVERVIEW.md** - This file - complete structure summary

---

## Questions?

Contact: taylordavis@careluminate.com
