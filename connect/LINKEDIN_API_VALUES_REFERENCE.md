# LinkedIn Contact Search - Exact API Values Reference

## 🎯 Job Functions (LinkedIn/Harvest API)

These are the **exact** function IDs that LinkedIn and Harvest API use. These values are sent directly to the Harvest API as `functionIds` parameter.

| Function ID | Job Function Name |
|------------|-------------------|
| `1` | Accounting |
| `2` | Administrative |
| `3` | Arts & Design |
| `4` | Business Development |
| `5` | Community & Social Services |
| `6` | Consulting |
| `7` | Education |
| `8` | Engineering |
| `9` | Entrepreneurship |
| `10` | Finance |
| `11` | Healthcare Services |
| `12` | Human Resources |
| `13` | **Information Technology** ⭐ |
| `14` | Legal |
| `15` | Marketing |
| `16` | Media & Communication |
| `17` | Military & Protective Services |
| `18` | Operations |
| `19` | Product Management |
| `20` | Program & Project Management |
| `21` | Purchasing |
| `22` | Quality Assurance |
| `23` | Real Estate |
| `24` | Research |
| `25` | Sales |
| `26` | Support |

**Default**: Information Technology (`13`) is pre-selected

**Usage in API**:
```javascript
functionIds: ["13", "8", "19"]  // IT, Engineering, Product Management
```

---

## 📊 Seniority Levels (LinkedIn/Harvest API)

These are the **exact** seniority level IDs that LinkedIn uses internally. These values are sent directly to the Harvest API as `seniorityLevelIds` parameter.

| Seniority ID | Level Name | Description |
|-------------|------------|-------------|
| `100` | Unpaid | Unpaid positions, volunteers |
| `110` | Training/Internship | Interns, trainees |
| `120` | Entry Level / Manager | Entry-level and manager positions (LinkedIn combines these) |
| `220` | Senior / Director | Senior positions and directors ⭐ |
| `300` | VP (Vice President) | Vice President level ⭐ |
| `310` | C-Level | CIO, CTO, CISO, CEO, etc. ⭐ |
| `320` | Partner | Partner-level positions |

**Defaults**: Director (`220`), VP (`300`), and C-Level (`310`) are pre-selected

**Important Notes**:
- ⚠️ LinkedIn combines "Entry Level" and "Manager" into ID `120`
- ⚠️ LinkedIn combines "Senior" and "Director" into ID `220`
- ✅ These are the **only valid IDs** per Harvest API documentation
- ❌ IDs like `230` (Manager) and `240` (Director) are **NOT valid**

**Usage in API**:
```javascript
seniorityLevelIds: ["220", "300", "310"]  // Director, VP, C-Level
```

---

## 🔄 How It Works in the System

### 1. Frontend (HTML)
```html
<select id="jobFunctions" multiple>
  <option value="13" selected>Information Technology</option>
  <option value="8">Engineering</option>
  ...
</select>

<select id="seniorityLevels" multiple>
  <option value="220" selected>Senior / Director</option>
  <option value="300" selected>VP</option>
  <option value="310" selected>C-Level</option>
  ...
</select>
```

### 2. JavaScript Collection
```javascript
const jobFunctionsSelect = document.getElementById('jobFunctions');
const jobFunctions = Array.from(jobFunctionsSelect.selectedOptions)
  .map(opt => opt.value);
// Result: ["13", "8"] if IT and Engineering selected

const senioritySelect = document.getElementById('seniorityLevels');
const seniority = Array.from(senioritySelect.selectedOptions)
  .map(opt => opt.value);
// Result: ["220", "300", "310"] with defaults
```

### 3. API Request
```javascript
await callRailwayAPI('/api/linkedin-contact-search/search-employees', {
  companies: [...],
  function_ids: ["13"],           // IT
  seniority_level_ids: ["220", "300", "310"],  // Director, VP, C-Level
  max_employees: 25
});
```

### 4. Backend Processing
```javascript
// In linkedin_contact_search_service.js
const actorInput = {
  companyBatchMode: 'all_at_once',
  companySearchUrl: companyUrls,
  profileScraperMode: 'Short ($4 per 1k)',
  maxItemsPerCompany: 25,
  functionIds: ["13"],              // Sent directly to Harvest API
  seniorityLevelIds: ["220", "300", "310"]  // Sent directly to Harvest API
};
```

### 5. Harvest API Processing
Harvest API receives these exact IDs and filters LinkedIn profiles accordingly.

---

## 🎯 Common Search Combinations

### Healthcare IT Leadership
```javascript
function_ids: ["13"]  // Information Technology only
seniority_level_ids: ["300", "310"]  // VP and C-Level
```
**Finds**: CIOs, CTOs, VPs of IT

### IT Security Team
```javascript
function_ids: ["13"]  // Information Technology
seniority_level_ids: ["220", "300", "310"]  // Director, VP, C-Level
```
**Finds**: All IT security leadership (filter with GPT for "security" roles)

### Full IT Department
```javascript
function_ids: ["13"]  // Information Technology
seniority_level_ids: ["120", "220", "300", "310"]  // All levels
```
**Finds**: Entire IT team from managers up

### Clinical + IT Leadership
```javascript
function_ids: ["11", "13"]  // Healthcare Services + IT
seniority_level_ids: ["220", "300", "310"]  // Director, VP, C-Level
```
**Finds**: Clinical informatics leaders and IT leaders

### Tech Leadership (Broad)
```javascript
function_ids: ["8", "13", "19"]  // Engineering + IT + Product Management
seniority_level_ids: ["300", "310"]  // VP and C-Level
```
**Finds**: All senior tech leaders (CTO, CIO, VP Engineering, VP Product)

---

## ⚙️ Select All / Clear All Functionality

### Select All Button
```javascript
function selectAllOptions(selectId) {
  const select = document.getElementById(selectId);
  for (let i = 0; i < select.options.length; i++) {
    select.options[i].selected = true;
  }
}
```

**Usage**: `onclick="selectAllOptions('jobFunctions')"`

**Result**: All 26 job functions selected

### Clear All Button
```javascript
function deselectAllOptions(selectId) {
  const select = document.getElementById(selectId);
  for (let i = 0; i < select.options.length; i++) {
    select.options[i].selected = false;
  }
}
```

**Usage**: `onclick="deselectAllOptions('seniorityLevels')"`

**Result**: No selections (user must select at least one before searching)

---

## 🔍 Search Key Generation (Firebase Caching)

Search keys are used to determine if we've already scraped employees with these exact criteria:

```javascript
buildSearchKey(companyUrl, criteria) {
  const parts = [
    companyUrl,
    (criteria.function_ids || []).sort().join(','),
    (criteria.seniority_level_ids || []).sort().join(',')
  ];
  return parts.join('|');
}
```

**Example**:
```
Input:
  companyUrl: "https://linkedin.com/company/mayo-clinic"
  function_ids: ["13"]
  seniority_level_ids: ["220", "300", "310"]

Output:
  "https://linkedin.com/company/mayo-clinic|13|220,300,310"
```

**Cache Hit**: If this exact search key exists in `apify_employee_scrape_log` within past 12 months, we use cached data from `apify_linkedin_employee_scrapes`.

**Cache Miss**: If not found, we call Harvest API and save results with this search key.

---

## 📝 Firebase Data Structure

### Employee Scrape Log Entry
```javascript
{
  company_url: "https://linkedin.com/company/mayo-clinic",
  company_name: "Mayo Clinic",
  search_key: "https://linkedin.com/company/mayo-clinic|13|220,300,310",
  function_ids: ["13"],  // Information Technology
  seniority_level_ids: ["220", "300", "310"],  // Director, VP, C-Level
  max_employees: 25,
  scrape_date: "2026-01-10T12:00:00Z",
  results_count: 23
}
```

### Employee Scrape Entry
```javascript
{
  first_name: "John",
  last_name: "Doe",
  linkedin_url: "https://linkedin.com/in/johndoe",
  current_title: "CIO",
  current_company: "Mayo Clinic",
  search_key: "https://linkedin.com/company/mayo-clinic|13|220,300,310",  // Same key!
  scrape_date: "2026-01-10T12:00:00Z"
}
```

---

## ✅ Validation

### Required Fields
Both dropdowns **must** have at least one option selected, or you'll get an error:
```javascript
if (jobFunctions.length === 0) {
  throw new Error('Please select at least one job function');
}

if (seniority.length === 0) {
  throw new Error('Please select at least one seniority level');
}
```

### Why This Matters
- ❌ Empty selections = no filters = Harvest API returns everyone
- ❌ Wrong IDs = Harvest API error or no results
- ✅ Correct IDs = Precise results matching LinkedIn's actual data

---

## 🎓 Best Practices

### 1. Start Specific, Then Broaden
```
First try:   function_ids: ["13"], seniority_level_ids: ["310"]  (IT C-Level only)
If too few:  function_ids: ["13"], seniority_level_ids: ["300", "310"]  (Add VPs)
Still few:   function_ids: ["13"], seniority_level_ids: ["220", "300", "310"]  (Add Directors)
```

### 2. Use GPT Filtering for Precision
Even with broad selections, you can narrow with GPT filter:
```
function_ids: ["13"]  (All IT)
seniority_level_ids: ["220", "300", "310"]  (All leadership)
GPT Filter: "Only cybersecurity, information security, or CISO roles"
```

### 3. Combine Related Functions
```
function_ids: ["8", "13"]  (Engineering + IT)
```
This finds people who might be in Engineering dept but doing IT-like work, or vice versa.

---

## 🐛 Troubleshooting

### No Results Returned
**Check**:
1. Are function_ids and seniority_level_ids arrays? ✅
2. Are IDs strings, not numbers? ✅ `["13"]` not `[13]`
3. Are you using valid IDs? ✅ Check tables above
4. Is the company large enough to have these roles? 🤔

### Wrong Results
**Check**:
1. Review selected options in UI (multi-select can be confusing)
2. Check Railway logs for actual IDs sent
3. Verify Harvest API input in logs
4. Consider using GPT filter for additional refinement

### Cache Not Working
**Check**:
1. Search key generation includes sorted IDs
2. Same IDs selected in same order
3. Within 12-month window
4. Same company URL

---

## 📊 API Cost Breakdown

Based on these selections:

**5 Companies × 25 employees each × Short mode**
```
Job Functions: ["13"]  (1 function)
Seniority: ["220", "300", "310"]  (3 levels)
Max: 25 per company

Expected Results: ~15-25 per company = 75-125 total
Cost: 125 profiles × $0.004 = ~$0.50

With caching: Second search = FREE! 🎉
```

**5 Companies × 50 employees each × Short mode**
```
Job Functions: ["13"]  (1 function)
Seniority: ["120", "220", "300", "310"]  (4 levels - added managers)
Max: 50 per company

Expected Results: ~30-50 per company = 150-250 total
Cost: 250 profiles × $0.004 = ~$1.00

With caching: Second search = FREE! 🎉
```

---

**Remember**: These are LinkedIn's official IDs. Using exact values ensures compatibility with Harvest API and accurate results! ✅
