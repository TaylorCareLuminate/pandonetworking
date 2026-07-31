# Pre-Launch Cleanup Checklist
## CRM Sandbox → Production Migration

**Last Updated:** December 22, 2025

---

## 🎯 Overview
This document outlines all cleanup steps required before replacing the old CRM with the sandbox version.

---

## ✅ Completed Items

### 1. User Display ✓
- **Issue:** Header showed hardcoded "Joe" instead of actual logged-in user
- **Fix:** Added `updateUserMenu()` function to dynamically populate user name and initials
- **Files:** `sandbox/crm-sandbox.html`

---

## 🚧 In Progress

### 2. Deprecate Old Deals Pipeline Page
- **File:** `sandbox/deals-pipeline.html`
- **Current Status:** Redirects to `documents-dashboard.html`
- **Action:** Either delete the file or keep the redirect for backward compatibility
- **Recommendation:** Keep redirect for 30 days, then delete

---

## 📋 Pending Cleanup Items

### 3. Navigation Cleanup
**Files:** All sandbox pages

#### Remove/Update:
- **Activities Tab:** Currently a placeholder - add "Coming Soon" modal
- **Reports Tab:** Currently a placeholder - add "Coming Soon" modal
- **"Deals & Contracts" references:** Ensure all updated to "Documents"

#### Keep (Functional):
- Home
- Accounts
- Contacts
- Documents
- Create Document

### 4. Add "Coming Soon" Placeholders
**Purpose:** Clear UX for features not yet built

#### Needed for:
- Activities view (calendar/timeline view)
- Reports/Analytics dashboard
- Advanced search filters
- Email integration

**Implementation:**
```javascript
function showComingSoon(featureName) {
  alert(`${featureName} is coming soon! This feature is planned for a future release.`);
}
```

### 5. Remove Demo/Test Data References
**Files to audit:**
- All HTML pages in `/sandbox/`
- Check for hardcoded test account IDs
- Check for "Test" account references
- Remove console.log statements (or set to production mode)

**Specific Items:**
- Remove "-OexCRESdN4T4nz-bXkv" (Test account) hardcoded references
- Remove "-OexEsmAFflYyg5thKSM" (Test account 2) hardcoded references

### 6. Update Page Titles & Meta
**Files:** All sandbox HTML pages

**Current Issues:**
- Many pages still say "CRM Sandbox" in title
- Missing meta descriptions
- Missing Open Graph tags

**Update to:**
```html
<title>HealthLuminate CRM - [Page Name]</title>
<meta name="description" content="HealthLuminate CRM - Document-centric CLM and customer relationship management">
```

### 7. Files to Delete/Archive
**Before Production:**
- `/sandbox/DOCUMENT-CENTRIC-CRM-UPDATES.md` (implementation notes)
- `/sandbox/CRM-SANDBOX-COMPLETION-PLAN.md` (planning doc)
- `/sandbox/deals-pipeline.html` (after redirect period)
- Any backup or `.old` files

---

## 🧪 Testing Checklist

### End-to-End Feature Testing

#### Account Management
- [ ] Create new account
- [ ] Edit existing account
- [ ] Change account stage
- [ ] Add contacts to account
- [ ] Add next steps/tasks
- [ ] Add notes/activities
- [ ] Add revenue tracking items
- [ ] Navigate between accounts

#### Contact Management
- [ ] Create new contact
- [ ] Edit existing contact
- [ ] Link contact to account
- [ ] View contact detail page
- [ ] Delete contact

#### Document Management
- [ ] Create SOW from agreement builder
- [ ] Create Invoice from agreement builder
- [ ] Create NDA from agreement builder
- [ ] View documents dashboard
- [ ] Filter documents by status
- [ ] Search documents by account
- [ ] Edit document status
- [ ] Delete document
- [ ] View document from account page

#### Dashboard/Homepage
- [ ] View My Tasks widget
- [ ] Toggle tasks "My Tasks" vs "All Tasks"
- [ ] View Recent Activities widget
- [ ] Toggle activities "My Accounts" vs "All Accounts"
- [ ] Click tasks/activities to navigate to account
- [ ] View key metrics

#### Revenue Tracking
- [ ] Add revenue item
- [ ] Edit revenue item
- [ ] Delete revenue item
- [ ] View total Expected ARR
- [ ] See ARR reflected in account metrics

#### Navigation
- [ ] All nav links work
- [ ] Back buttons work on detail pages
- [ ] Quick navigation (header icons) works
- [ ] Search functionality (if implemented)
- [ ] Logout works

#### Data Persistence
- [ ] Changes save to Firebase
- [ ] Page refresh retains data
- [ ] Auth persists across tabs
- [ ] No data loss on navigation

---

## 🚀 Production Cutover Plan

### Phase 1: Preparation (Week 1)
1. Complete all cleanup items above
2. Run full testing checklist
3. Create production Firebase backup
4. Document any known limitations

### Phase 2: Soft Launch (Week 2)
1. Rename `/crm/` to `/crm-legacy/`
2. Copy `/sandbox/` to `/crm/`
3. Update all links in main site to point to new `/crm/`
4. Keep legacy CRM accessible at `/crm-legacy/` for rollback

### Phase 3: Monitor (Week 3-4)
1. Monitor for bugs/issues
2. Collect user feedback
3. Address any critical issues
4. Optimize performance

### Phase 4: Cleanup (Week 5)
1. Delete or archive `/crm-legacy/` if no issues
2. Remove sandbox references from new production
3. Update documentation

---

## 🔧 Technical Debt / Future Enhancements

**Not blocking launch, but should be tracked:**

### P1 (High Priority - Next Sprint)
- Add email notifications for tasks
- Implement document preview (PDF viewer)
- Add bulk actions (delete multiple documents, etc.)
- Enhanced search with filters
- Activity calendar view

### P2 (Medium Priority)
- BoldSign e-signature integration
- Automated revenue forecasting
- Custom reports builder
- Email integration (Gmail/Outlook)
- Mobile responsive optimization

### P3 (Nice to Have)
- Dark mode toggle
- Keyboard shortcuts
- Advanced analytics dashboard
- Export to CSV/Excel
- API for integrations

---

## 📝 Notes

### Database Structure
- Primary path: `hccrm/leads/{accountId}`
- Opportunities: `hccrm/leads/{accountId}/opportunities/{oppId}`
- Documents: Nested in opportunities
- Revenue: `hccrm/leads/{accountId}/revenue`

### Key Design Decisions
- **Document-centric approach:** Documents drive the workflow, not opportunities
- **CRM/CLM hybrid:** Combines relationship management with contract lifecycle
- **Account stages:** Pursuing → Active Customer → Churned
- **No separate "Deals" page:** Documents dashboard is the central hub

### Browser Compatibility
- Tested on: Chrome, Firefox, Edge
- Not optimized for: IE11, Safari (may have minor issues)

---

## ❓ Questions for Team

1. **Analytics:** What specific reports/metrics do we need for launch?
2. **Email:** Do we need email integration for V1 or can it wait?
3. **Mobile:** What % of users access on mobile? Priority level?
4. **Training:** Do we need to create training videos/docs before launch?
5. **Permissions:** Do we need role-based access (admin vs sales rep)?

---

## 📞 Support Plan

### During Transition (First 2 Weeks)
- Daily check-ins with users
- Dedicated Slack channel for issues
- Quick response time (<1 hour for critical issues)

### After Stabilization
- Weekly check-ins
- Standard support channels
- Monthly feature planning

---

**Status:** 🟡 In Progress (10% complete)
**Target Launch:** TBD
**Owner:** Development Team

