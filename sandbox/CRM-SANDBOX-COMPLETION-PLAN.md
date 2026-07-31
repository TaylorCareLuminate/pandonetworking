# CRM Sandbox Completion Plan

**Goal:** Complete a HubSpot/Salesforce-style CRM to replace the current production CRM
**Timeline:** Next few days
**Status as of:** December 20, 2025

---

## Current State Assessment

### ✅ What's Built (Functional)

1. **CRM Sandbox Home Page** (`crm-sandbox.html`)
   - Global navigation with tabs
   - Main landing page with feature cards
   - Account list view with filtering, sorting, stats
   - Modal for creating new accounts and contacts
   - Quick create menu
   - Firebase authentication integration

2. **Account Detail Page** (`account-detail.html`)
   - Tab-based layout (Overview, Contacts, Deals, Activities, Notes)
   - Contact management within accounts
   - Activity timeline
   - Account stage management
   - Full CRUD for contacts
   - Internal notes

3. **Contacts List** (`contacts-list.html`)
   - All contacts view across all accounts
   - Filtering by company, last contacted, type
   - Statistics cards
   - Integrated with phone_activities for contact tracking

4. **Contact Detail Page** (`contact-detail.html`)
   - Full contact profile
   - Activity timeline filtered to contact
   - Quick actions (log call, email, meeting, note, task)
   - Internal notes specific to contact
   - Stage management for parent account
   - Delete contact functionality

5. **Opportunities Pipeline** (`deals-pipeline.html`)
   - List and Kanban view toggle
   - Full opportunity CRUD
   - Stats cards (pipeline value, weighted, closing this month, won this quarter)
   - Filtering (stage, owner, close date, value, archived)
   - Archive/unarchive functionality
   - Integration with accounts
   - Pre-population from account when creating opportunities

6. **Agreement Builder** (`agreement-builder.html`)
   - 7 templates: Invoice, SOW, BAA, Data Resale, Use of Name, NDA, MSA
   - 4-step wizard process
   - Invoice template with full line items, tax calc, payment terms
   - PDF generation with html2pdf
   - Save to opportunity documents
   - Integration with BoldSign (placeholder)

7. **Shared Components**
   - `sandbox-header.js` - Shared header component with navigation

---

## ❌ Missing/Broken Connections

### Critical Missing Pieces

1. **Activities View (Global)** 
   - **Current:** "Coming soon" placeholder
   - **Needed:** Unified activity timeline across ALL accounts
   - **Features Required:**
     - All calls, emails, meetings, tasks across entire CRM
     - Filter by type, date range, assigned to, account
     - Quick add activity
     - Edit/archive activities
     - Link activities to accounts, contacts, opportunities

2. **Reports & Analytics View**
   - **Current:** "Coming soon" placeholder
   - **Needed:** Dashboard with key metrics
   - **Features Required:**
     - Pipeline funnel visualization
     - Conversion rates by stage
     - Sales velocity metrics
     - Rep leaderboard
     - Revenue forecasting
     - Win/loss analysis
     - Activity metrics (calls per day, emails sent, etc.)

3. **Global Search**
   - **Current:** Search box exists but not functional
   - **Needed:** Search across accounts, contacts, opportunities, activities
   - **Features Required:**
     - Type-ahead search
     - Filter results by object type
     - Click to navigate to record

4. **Contacts View from Sandbox Home**
   - **Current:** "Coming soon" placeholder, but `contacts-list.html` exists separately
   - **Needed:** Integrate `contacts-list.html` into main sandbox navigation

5. **Account Detail → Create Opportunity**
   - **Current:** Redirects to deals-pipeline with accountId param
   - **Status:** ✅ **WORKING** - The deals-pipeline auto-opens modal with pre-selected account
   - **Enhancement:** Add "New Contact" button on account detail page

6. **Opportunity Detail View**
   - **Current:** Clicking opportunity redirects to account detail with anchor
   - **Needed:** Dedicated opportunity detail page
   - **Features Required:**
     - Opportunity overview (value, stage, probability, close date)
     - Associated contacts with roles (decision maker, influencer, etc.)
     - Activity timeline specific to opportunity
     - Documents attached (agreements, invoices, SOWs)
     - Stage progression history
     - Edit opportunity details
     - Change stage
     - Archive/delete

7. **Document Management**
   - **Current:** Agreement builder saves to Firebase but no viewing interface
   - **Needed:** 
     - View documents on opportunity detail page
     - View documents on account detail page
     - Document status tracking (draft, sent, signed)
     - Signature status integration with BoldSign
     - Download/resend documents

8. **Task Management**
   - **Current:** Tasks can be logged as activities
   - **Needed:**
     - Dedicated tasks view with due dates
     - Task assignment to team members
     - Task completion tracking
     - Overdue task alerts
     - Tasks by due date view

9. **Email Integration**
   - **Current:** Manual activity logging
   - **Needed:**
     - Email sync from Gmail/Outlook
     - Track email opens/clicks
     - Email templates
     - Bulk email capability

10. **User/Team Management**
    - **Current:** Single user context
    - **Needed:**
      - Team member list
      - Assign ownership (accounts, opportunities, tasks)
      - Permission levels
      - Activity by rep reports

---

## Detailed Work Plan

### **Phase 1: Core Connections (Days 1-2)**

#### Priority 1: Fix Navigation & Integrate Existing Pages

**Task 1.1: Integrate Contacts List into Main Sandbox** (2 hours)
- Update `crm-sandbox.html` Contacts tab to load `contacts-list.html` content inline
- OR: Make Contacts nav tab link to `contacts-list.html`
- Current nav has `data-view="contacts"` but view shows "Coming soon"
- **Solution:** Change nav tab to href link: `<a href="contacts-list.html" class="nav-tab">`

**Task 1.2: Create Opportunity Detail Page** (4 hours)
- Create `sandbox/opportunity-detail.html`
- Similar layout to `contact-detail.html` (3-column)
- Left sidebar: Opportunity card with value, stage, probability, owner
- Center: Activity timeline filtered to opportunity
- Right sidebar: Associated contacts, account info, documents list
- Quick actions: Edit, Change Stage, Archive, Delete
- Stage progression buttons
- Integration with agreement-builder for creating docs

**Task 1.3: Update deals-pipeline to link to opportunity detail** (1 hour)
- Change `viewDeal()` function to navigate to `opportunity-detail.html?id=${dealId}&account=${accountId}`
- Update Kanban cards to link to opportunity detail

**Task 1.4: Add Document Viewing to Opportunity Detail** (3 hours)
- Load documents from `hccrm/leads/${accountId}/opportunities/${opportunityId}/documents`
- Display list with document type, date, status
- Download button (convert base64 to blob download)
- Resend button (to send for signature again)
- Status badges: Draft, Sent, Signed

#### Priority 2: Activities View (Unified Timeline)

**Task 2.1: Create Global Activities Page** (6 hours)
- Create `sandbox/activities-list.html`
- Load ALL activities from ALL accounts
- Display in timeline format (similar to contact-detail timeline)
- Filters: Type (all, calls, emails, meetings, notes, tasks), Date Range, Assigned To, Account
- Stats cards: Total activities, This week, Calls, Emails, Meetings
- Quick add activity modal
- Click activity to see detail/edit
- Archive functionality

**Task 2.2: Update Navigation** (30 minutes)
- Change Activities tab in `crm-sandbox.html` to link to `activities-list.html`

#### Priority 3: Global Search

**Task 3.1: Implement Global Search** (4 hours)
- Update global search input handler in `crm-sandbox.html`
- Search across:
  - Account names, domains
  - Contact names, emails
  - Opportunity names
  - Activity subjects
- Display results in dropdown below search box
- Group by type (Accounts, Contacts, Opportunities, Activities)
- Click result to navigate to detail page

---

### **Phase 2: Enhanced Functionality (Days 3-4)**

#### Priority 4: Reports & Analytics Dashboard

**Task 4.1: Create Reports Page** (8 hours)
- Create `sandbox/reports-dashboard.html`
- **Pipeline Funnel Chart:**
  - Count and $ value by stage
  - Use Chart.js or similar
- **Conversion Rates:**
  - Stage-to-stage conversion %
  - Average time in each stage
- **Sales Velocity:**
  - Average days to close
  - Deals created vs closed per month
- **Rep Performance:**
  - Opportunities by owner
  - Close rate by owner
  - Total pipeline value by owner
- **Revenue Metrics:**
  - Won this quarter
  - Projected close this quarter
  - Year-over-year growth
- **Activity Metrics:**
  - Calls/emails/meetings per week by rep
  - Activity correlation to closed deals

**Task 4.2: Update Navigation** (30 minutes)
- Change Reports tab to link to `reports-dashboard.html`

#### Priority 5: Task Management

**Task 5.1: Create Tasks View** (6 hours)
- Create `sandbox/tasks-list.html`
- Load all activities where `type === 'Task'`
- Group by: Overdue, Due Today, Due This Week, Due Later, Completed
- Filter by: Assigned To, Associated Account, Due Date
- Task card shows: Subject, Description, Due Date, Assigned To, Associated Account/Contact/Opportunity
- Mark complete functionality
- Edit task modal
- Delete task
- Stats: Total open, Overdue, Completed this week

**Task 5.2: Add Tasks to Main Nav** (30 minutes)
- Add Tasks tab to main navigation
- OR: Add Tasks as a sub-view under Activities

#### Priority 6: Document Management UI

**Task 6.1: Add Documents Section to Opportunity Detail** (Covered in Task 1.4)

**Task 6.2: Add Documents Section to Account Detail** (3 hours)
- Add "Documents" tab to account-detail.html
- Show ALL documents for ALL opportunities for this account
- Group by opportunity
- Display document type, date, status, link to opportunity
- Download button

**Task 6.3: BoldSign Integration** (4-6 hours)
- Sign up for BoldSign API key
- Add BoldSign SDK to agreement-builder
- Implement actual signature request API call
- Store document ID from BoldSign
- Set up webhook to receive signature completion events
- Update document status when signed

---

### **Phase 3: Polish & Production Readiness (Day 5)**

#### Priority 7: Data Migration & Cleanup

**Task 7.1: Data Structure Alignment** (4 hours)
- Review current data in `hccrm/leads`
- Ensure all records have proper structure
- Add missing fields (lastActivityDate, opportunities array if empty, etc.)
- Test with production data

**Task 7.2: Create Migration Script** (Optional, 3 hours)
- Script to migrate from current structure to new CRM-style structure
- OR: Keep current nested structure and normalize on read

#### Priority 8: User Experience Enhancements

**Task 8.1: Loading States & Error Handling** (3 hours)
- Add loading spinners to all data fetches
- Add error messages for failed operations
- Add success toasts for create/update/delete operations
- Handle offline/network errors gracefully

**Task 8.2: Mobile Responsiveness** (3 hours)
- Test all pages on mobile
- Adjust layouts for smaller screens
- Ensure tables scroll horizontally
- Make modals mobile-friendly

**Task 8.3: Keyboard Shortcuts** (2 hours)
- `Cmd/Ctrl + K` for global search
- `C` for new contact
- `A` for new account
- `O` for new opportunity
- `ESC` to close modals

**Task 8.4: Bulk Operations** (3 hours)
- Bulk email contacts
- Bulk update stage
- Bulk delete/archive

---

### **Phase 4: Advanced Features (Future/Optional)**

#### Email Integration
- Connect Gmail/Outlook API
- Auto-log emails as activities
- Email tracking (opens, clicks)

#### Calendar Sync
- Sync meetings with Google Calendar / Outlook Calendar
- Show calendar view of activities

#### File Attachments
- Upload files to Firebase Storage
- Attach to accounts/opportunities/contacts

#### Workflow Automation
- Automated task creation on stage change
- Email notifications on task due dates
- Auto-archive opportunities after X days inactive

---

## Estimated Timeline

### Day 1 (8 hours)
- ✅ Task 1.1: Integrate Contacts (2h)
- ✅ Task 1.2: Create Opportunity Detail Page (4h)
- ✅ Task 1.3: Update deals-pipeline links (1h)
- ✅ Task 1.4: Document viewing (1h partial start)

### Day 2 (8 hours)
- Task 1.4: Complete document viewing (2h)
- Task 2.1: Global Activities Page (6h)
- Task 2.2: Update nav (30m)

### Day 3 (8 hours)
- Task 3.1: Global Search (4h)
- Task 4.1: Reports Dashboard (4h partial)

### Day 4 (8 hours)
- Task 4.1: Complete Reports Dashboard (4h)
- Task 5.1: Tasks View (4h)

### Day 5 (8 hours)
- Task 4.2, 5.2: Update navigation (1h)
- Task 6.2: Documents on Account Detail (3h)
- Task 8.1: Loading/Error Handling (2h)
- Task 8.2: Mobile Responsiveness (2h)

**Total Estimated Time:** ~40 hours (5 days × 8 hours)

---

## Priority Order (If Time is Limited)

### Must Have (P0)
1. ✅ Opportunity Detail Page
2. Global Activities View
3. Integrate Contacts List into nav
4. Document viewing on opportunities
5. Global Search

### Should Have (P1)
6. Reports Dashboard
7. Tasks View
8. Documents on Account Detail
9. Error handling
10. Mobile responsiveness

### Nice to Have (P2)
11. BoldSign integration
12. Keyboard shortcuts
13. Bulk operations
14. Email integration

---

## Current "Coming Soon" Items to Fix

1. **crm-sandbox.html Line 1100:** Contacts View → Link to `contacts-list.html`
2. **crm-sandbox.html Line 1120:** Activities View → Create `activities-list.html`
3. **crm-sandbox.html Line 1128:** Reports View → Create `reports-dashboard.html`
4. **crm-sandbox.html Line 975:** "Activities view - Coming soon!" → Link to activities
5. **crm-sandbox.html Line 984:** "Account detail page - Coming soon!" → Remove (already exists)
6. **crm-sandbox.html Line 993:** "Reports dashboard - Coming soon!" → Link to reports
7. **crm-sandbox.html Line 1080:** Card view for accounts → Low priority
8. **contact-detail.html Line 835:** Edit contact modal → Build edit form
9. **deals-pipeline.html:** Drag-and-drop for Kanban → Future enhancement

---

## Testing Checklist

### Functionality Testing
- [ ] Create account from sandbox home
- [ ] Create contact from sandbox home
- [ ] Create contact from account detail
- [ ] Create opportunity from account detail
- [ ] Create opportunity from deals pipeline
- [ ] View account detail
- [ ] View contact detail
- [ ] View opportunity detail (NEW)
- [ ] Edit account
- [ ] Edit contact
- [ ] Edit opportunity
- [ ] Delete account (with confirmation)
- [ ] Delete contact
- [ ] Delete opportunity
- [ ] Log activity (call, email, meeting, note)
- [ ] Archive activity
- [ ] View all activities (NEW)
- [ ] Filter activities
- [ ] Create task
- [ ] Complete task
- [ ] Create agreement/invoice
- [ ] View documents on opportunity
- [ ] Download document
- [ ] Send document for signature
- [ ] Global search finds records
- [ ] Navigate between related records
- [ ] Change opportunity stage
- [ ] Change account stage
- [ ] View reports dashboard

### Data Integrity Testing
- [ ] Contacts belong to correct accounts
- [ ] Opportunities link to correct accounts
- [ ] Activities tagged to correct contacts
- [ ] Documents saved to correct opportunities
- [ ] Stats cards show accurate counts
- [ ] Pipeline values calculate correctly
- [ ] Date filters work correctly

### UI/UX Testing
- [ ] All modals open and close correctly
- [ ] Forms validate required fields
- [ ] Loading states show during data fetch
- [ ] Success messages appear after create/update
- [ ] Error messages show when operations fail
- [ ] Tables sort correctly
- [ ] Filters work as expected
- [ ] Responsive on mobile
- [ ] No console errors

---

## Questions/Decisions Needed

1. **Data Structure:** Keep nested structure or migrate to flat relational structure?
   - **Recommendation:** Keep nested for now, normalize on read (current approach works)

2. **BoldSign Integration:** Priority level?
   - **Recommendation:** P2 - Focus on core CRM first, add e-signature later

3. **Email Integration:** In scope for initial launch?
   - **Recommendation:** No - Manual logging is sufficient for MVP

4. **Multi-user/Teams:** In scope?
   - **Recommendation:** Yes, basic ownership assignment. Full team features later.

5. **Replace Production CRM:** Hard cutover or gradual migration?
   - **Recommendation:** Gradual - Run both, train users on sandbox, then cutover

---

## Success Criteria

The CRM Sandbox will be considered "complete" when:

✅ All core object types are viewable and editable (Accounts, Contacts, Opportunities, Activities)
✅ Navigation between related records works seamlessly
✅ Documents can be created, stored, and retrieved
✅ Basic reporting/analytics are available
✅ All "Coming soon" placeholders are replaced with functional pages
✅ Mobile responsive
✅ No critical bugs
✅ Ready to replace `crm/mainpage.html` as primary CRM interface

---

## Notes

- Firebase structure is mostly working well
- Agreement builder is impressive and functional
- Shared header component is good pattern
- Need to maintain consistency in styling across all pages
- Consider creating more reusable components (modals, tables, cards)

