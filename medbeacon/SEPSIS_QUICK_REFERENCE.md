# Sepsis Data Quick Reference

## New Simplified Structure

### ONE Master Dataset
**All hospitals** (~7,000) with **six types of percentiles** in one place
- Location: `medbeacon/sepsis/hospitals`

### SIX Summary Datasets
**Group averages** for benchmarking
- Location: `medbeacon/sepsis/summaries/[group]`

---

## The Seven Percentile Types (All in Master Dataset)

Every hospital has ONE score but SEVEN different percentile rankings:

| Percentile Column Prefix | Compares Hospital To... | Use When... |
|-------------------------|------------------------|-------------|
| `national_*` | All U.S. hospitals | Identifying nationally elite performers |
| `regional_*` | Hospitals in same region | Market competitiveness analysis |
| `size_*` | Hospitals of same size | Fair peer comparisons |
| `teaching_*` | Same teaching status | Academic vs community benchmarking |
| `type_*` | Same hospital type | Type-specific analysis |
| `ehr_*` | Same EHR vendor | Technology impact assessment |
| `hs_*` | Same health system | Intra-system benchmarking |

**Example columns:**
- `national_sepsis_appropriate_care_percentile`
- `regional_sepsis_appropriate_care_percentile`
- `size_sepsis_appropriate_care_percentile`
- `hs_sepsis_appropriate_care_percentile`
- etc.

---

## Example: One Hospital, Seven Perspectives

**Memorial Medical Center** (150 beds, South region, Epic EHR, Non-Teaching, Acute Care, Memorial Health system)  
**Sepsis Appropriate Care Score:** 76.2

| Percentile Type | Value | Interpretation |
|----------------|-------|----------------|
| National | 55 | Middle of the pack nationally |
| Regional (South) | 68 | Above average in the South |
| Size (Medium) | 72 | Strong performer for size |
| Teaching (Non-Teaching) | 71 | Above average among non-teaching |
| Type (Acute Care) | 58 | Slightly above average for type |
| EHR (Epic) | 52 | Average among Epic users |
| Health System (Memorial) | 45 | Below average within Memorial Health |

**What this tells us:**
- Memorial does better when compared to similar peers (regional, size, teaching status)
- They're leveraging their resources well
- Room to improve to reach national top performers
- Epic implementation is average - potential for EHR optimization
- **Within Memorial Health system, this is a lower-performing hospital - opportunity for best practice sharing**

---

## How to Use Summary Datasets

Summary datasets provide the **average score** for each group:

```javascript
// Get hospital's performance
const hospital = await getHospital("123456");
hospital.sepsis_appropriate_care_score = 78.5
hospital.regional_sepsis_appropriate_care_percentile = 68

// Get regional average for context
const regionalSummary = await getRegionalSummary("South");
regionalSummary.avg_sepsis_appropriate_care_score = 75.2

// Report to user:
"Your score of 78.5 is above the South regional average of 75.2"
"You rank in the 68th percentile among Southern hospitals"
```

---

## Common Reporting Scenarios

### Scenario 1: Hospital Performance Dashboard

**Show:** 
- Hospital's actual scores (from master dataset)
- All six percentile rankings (from master dataset)
- Relevant group averages (from summary datasets)

**Example Report:**
```
Sepsis Appropriate Care
Score: 78.5

National Comparison:
- Your percentile: 60th
- You perform better than 60% of all U.S. hospitals

Regional Comparison (South):
- Your percentile: 72nd  
- Regional average: 75.2
- You're above the regional average

Size Comparison (Medium Hospitals):
- Your percentile: 70th
- Category average: 76.8
- You're slightly below the category average
```

### Scenario 2: Health System Overview

**Show:**
- List all hospitals in system (from master dataset, filter by `hs_domain`)
- System average (from health system summary)
- Each hospital's national and regional percentiles

**Example:**
```
Mayo Clinic Health System

System Average: 82.3
- Hospitals: 45
- Total Beds: 8,500

Top Performers:
1. Mayo Clinic Rochester - 95th percentile nationally
2. Mayo Clinic Jacksonville - 88th percentile nationally
3. Mayo Clinic Arizona - 85th percentile nationally

Below System Average:
- Hospital X: 78.2 (60th percentile nationally, 72nd regionally)
```

### Scenario 3: Regional Market Analysis

**Show:**
- All hospitals in region (from master dataset, filter by `region`)
- Regional average (from regional summary)
- Top performers in region (filter by `regional_*_percentile >= 90`)

**Example:**
```
South Region Market Analysis

Regional Average: 75.2
- Hospitals: 1,850
- Top 10% threshold: 85.5 score

Your Position:
- Score: 78.5 (above average)
- Regional Percentile: 68th

Top Competitors in Your Market:
1. Hospital A: 88.2 (95th percentile)
2. Hospital B: 86.5 (92nd percentile)
3. Hospital C: 85.8 (91st percentile)
```

---

## Firebase Querying Patterns

### Get Hospital with All Percentiles
```javascript
const ref = firebase.database().ref('medbeacon/sepsis/hospitals');
ref.orderByChild('facility_id').equalTo('123456').once('value', (snapshot) => {
  const hospital = snapshot.val()[0];
  
  // Access any percentile type
  console.log(hospital.national_sepsis_appropriate_care_percentile);
  console.log(hospital.regional_sepsis_appropriate_care_percentile);
  console.log(hospital.size_sepsis_appropriate_care_percentile);
});
```

### Get Group Average for Comparison
```javascript
const ref = firebase.database().ref('medbeacon/sepsis/summaries/regions');
ref.orderByChild('region').equalTo('South').once('value', (snapshot) => {
  const summary = snapshot.val()[0];
  console.log(`Regional avg: ${summary.avg_sepsis_appropriate_care_score}`);
});
```

### Get All Hospitals in a Group
```javascript
// All hospitals in South region
const ref = firebase.database().ref('medbeacon/sepsis/hospitals');
ref.orderByChild('region').equalTo('South').once('value', (snapshot) => {
  const hospitals = snapshot.val();
  // Process all Southern hospitals
});
```

### Find Top Performers in a Peer Group
```javascript
// Get all hospitals, then filter in code
const ref = firebase.database().ref('medbeacon/sepsis/hospitals');
ref.once('value', (snapshot) => {
  const hospitals = Object.values(snapshot.val());
  
  // Top 10% nationally
  const topNational = hospitals.filter(h => 
    h.national_sepsis_appropriate_care_percentile >= 90
  );
  
  // Top 10% in region
  const topRegional = hospitals.filter(h => 
    h.region === 'South' && 
    h.regional_sepsis_appropriate_care_percentile >= 90
  );
});
```

---

## Decision Guide: Which Percentile to Use?

### Use NATIONAL percentiles when:
- ✅ Comparing across different regions
- ✅ Identifying truly elite performers
- ✅ System-wide performance assessment
- ✅ National rankings and awards

### Use REGIONAL percentiles when:
- ✅ Market competitiveness analysis
- ✅ Local quality improvement benchmarking
- ✅ Regional marketing ("Top 10% in the South")
- ✅ Understanding regional practice patterns

### Use SIZE percentiles when:
- ✅ Fair peer comparisons
- ✅ "Apples-to-apples" benchmarking
- ✅ Resource-adjusted performance
- ✅ Small hospital excellence programs

### Use TEACHING percentiles when:
- ✅ Academic medical center comparisons
- ✅ Teaching vs community hospital analysis
- ✅ Medical education impact studies

### Use TYPE percentiles when:
- ✅ Facility-specific benchmarking
- ✅ Acute care vs critical access comparisons
- ✅ Type-appropriate quality metrics

### Use EHR percentiles when:
- ✅ Technology vendor comparisons
- ✅ EHR optimization opportunities
- ✅ Vendor selection decisions
- ✅ Clinical workflow analysis

### Use HEALTH SYSTEM percentiles when:
- ✅ Intra-system benchmarking
- ✅ Identifying best-performing hospitals within a system
- ✅ Best practice sharing opportunities
- ✅ System-wide quality improvement targeting
- ✅ Understanding hospital performance relative to sister facilities

### Use ALL SEVEN when:
- ✅ Comprehensive hospital profiles
- ✅ Multi-dimensional performance assessment
- ✅ Strategic planning
- ✅ Understanding competitive position from all angles

---

## Key Benefits of This Structure

### For Development:
- ✅ ONE place to get all hospital data
- ✅ No need to join multiple datasets
- ✅ All percentiles pre-calculated
- ✅ Simple filtering by any field

### For Reporting:
- ✅ Show multiple perspectives easily
- ✅ Compare hospital to relevant benchmarks
- ✅ Provide context with summary data
- ✅ Flexible analysis options

### For Performance:
- ✅ Single query for complete hospital profile
- ✅ Efficient data loading
- ✅ Minimal Firebase reads
- ✅ Fast filtering and sorting
