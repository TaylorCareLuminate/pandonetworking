# Tasks System - User Guide
**HealthLuminate CRM**

---

## 🎯 Overview

The new Tasks system replaces the old "nextstep" page with a comprehensive task management solution that gives you a central follow-up list for all your accounts.

---

## 📍 How to Access

### From Dashboard (crm/mainpage.html)
1. View your most urgent tasks in the "My Tasks" widget
2. Click **"View All Tasks"** at the bottom of the widget
3. Takes you to the full tasks page

### Direct Link
- URL: `https://healthluminate.com/crm/tasks-list.html`
- Old nextstep URL automatically redirects to new tasks page

---

## 🎨 Features

### 1. **Smart Grouping by Urgency**
Tasks are automatically organized into:
- 🔴 **Overdue** - Past due date (shown first, red indicators)
- 🟡 **Due Today** - Due today (yellow indicators)
- 🟢 **This Week** - Due within 7 days (green indicators)
- ⚪ **Later** - Due after this week (gray, collapsed by default)
- ✅ **Completed** - Completed this week (collapsed by default)

### 2. **Quick Stats Dashboard**
At the top of the page, see at-a-glance:
- Number of overdue tasks
- Number due today
- Number due this week
- Total open tasks

### 3. **Powerful Filters**
- **My Tasks vs All Tasks** - Toggle between your tasks and team tasks
- **Priority Filter** - High, Medium, Low
- **Account Filter** - Filter by specific account

### 4. **Rich Task Context**
Each task shows:
- ✅ Task title
- 🏢 Account name
- 📅 Due date with urgency indicator
- 🚩 Account stage
- 👤 Assignee
- ⏰ Days since last activity on account

### 5. **Quick Actions**
For each task, you can:
- ✅ **Complete** - Mark done with one click
- ⏰ **+1 Day** - Snooze by 1 day
- 📅 **+1 Week** - Snooze by 1 week
- 🔗 **View Account** - Jump to account detail page

### 6. **One-Click Complete**
- Click the checkbox next to any task to mark it complete
- No need to navigate away from the tasks page
- Completed tasks automatically move to the "Completed" section

---

## 💡 How It Works

### Task Data Structure
Tasks are stored as activities with `type: "Task"` in the account's notes:

```javascript
{
  type: "Task",
  subject: "Follow up with Memorial Hermann CFO",
  dueDate: "2026-01-15",
  assignee: "joe@healthluminate.com",
  status: "Open", // or "completed"
  priority: "high", // high, medium, low
  content: "Discussion about Q2 budget approval",
  contacts: ["contact-id-123"], // Tagged contacts
  createdAt: "2026-01-06T10:00:00Z",
  completedAt: null,
  completedBy: null
}
```

### Creating Tasks
Currently, tasks are created from:
1. **Account Detail Page** - Log a new activity and select "Task" as the type
2. **Contact Detail Page** - Same process
3. Future: Direct "New Task" button on tasks page (coming soon)

### What Happens When You Complete a Task
1. Status changes to "completed"
2. `completedAt` timestamp is recorded
3. `completedBy` records who completed it
4. Task moves to "Completed" section
5. Shows in completed list for 7 days, then archives

---

## 🔄 Workflow Example

### Morning Routine:
1. Open tasks page: `crm/tasks-list.html`
2. Check **Overdue** section (🔴) - handle these FIRST
3. Check **Due Today** section (🟡) - plan your day
4. Review **This Week** section (🟢) - schedule for later

### Working a Task:
1. See: "Follow up with Memorial Hermann - Due today"
2. Click **"View Account"** to review context
3. Make the call from account page
4. Return to tasks page
5. Click ✅ **Complete** button
6. Task automatically moves to Completed section

### Rescheduling:
1. Can't complete today? Click **"+1 Day"** or **"+1 Week"**
2. Task instantly moves to appropriate section
3. Due date updates automatically

---

## 📊 Integration with Existing System

### Dashboard Widget (mainpage.html)
- Shows top 7 most urgent tasks
- Toggle between "My Tasks" and "All Tasks"
- Click "View All Tasks" to see full list
- Click any task to go to its account

### Account Detail Page (account-detail.html)
- Create tasks by logging activities with type="Task"
- Set due date, priority, assignee
- Tag contacts involved in the task
- All tasks appear in the tasks list

### Contact Detail Page (contact-detail.html)
- Same task creation workflow
- Tasks automatically link to account

### Internal Notes
- Tasks show "Days since last activity" to provide context
- Helps you prioritize which accounts need attention

---

## 🎯 Best Practices

### 1. **Set Due Dates**
Always set realistic due dates for tasks. Tasks without due dates go to "Later" section.

### 2. **Use Priorities**
- **High** - Urgent, must do today
- **Medium** - Important, this week
- **Low** - Can wait, but don't forget

### 3. **Tag Contacts**
When creating tasks, tag the specific contact(s) involved. This helps track who you need to follow up with.

### 4. **Check Daily**
Make the tasks page your morning starting point:
- Start with Overdue (clear these first!)
- Plan your day around Due Today
- Schedule time for This Week items

### 5. **Complete Immediately**
When you finish a task, mark it complete right away. Don't let completed tasks linger as open.

### 6. **Use Context**
The "Days since last activity" helps you prioritize:
- 10+ days since contact? Follow up soon!
- Recent activity? Maybe can wait

---

## 🚀 Future Enhancements (Planned)

### Phase 2:
- [ ] Create task directly from tasks page (no need to go to account)
- [ ] Edit task inline
- [ ] Custom snooze date picker
- [ ] Bulk actions (complete multiple at once)
- [ ] Task templates

### Phase 3:
- [ ] Email reminders for overdue tasks
- [ ] Recurring tasks (e.g., "Monthly check-in")
- [ ] Task dependencies ("Send proposal" requires "Review pricing")
- [ ] Calendar view of tasks
- [ ] Mobile swipe gestures

---

## 🐛 Known Limitations

1. **New Task Creation**: Currently requires going to account page to create. Direct creation from tasks page coming soon.

2. **Task Notes**: Full description only shows in account detail view. Tasks list shows title only.

3. **Team View**: "All Tasks" shows all tasks in system. Future: filter by team/region.

4. **Notifications**: No email/push notifications yet. You must check the page.

---

## 📝 Tips & Tricks

### Keyboard Shortcuts (Future)
- `Cmd/Ctrl + K` - Quick search
- `C` - Create task
- `1` - Filter to overdue
- `2` - Filter to today

### URL Parameters (Future)
- `?filter=overdue` - Direct link to overdue
- `?account=abc123` - Filter to specific account
- `?assignee=joe` - Filter to specific person

### Mobile
Responsive design works on mobile. All features available on phone/tablet.

---

## ❓ FAQ

**Q: Why don't I see some of my tasks?**
A: Check that "My Tasks" filter isn't hiding them. Switch to "All Tasks" to see everything.

**Q: Can I delete a task?**
A: Not yet. For now, complete the task or change the due date far into the future.

**Q: What happens to old completed tasks?**
A: They show in Completed section for 7 days, then are hidden but remain in database.

**Q: Can I see tasks by account?**
A: Yes! Use the Account filter dropdown to see tasks for a specific account.

**Q: How do I create a task?**
A: Go to any account detail page → Log Activity → Select "Task" type → Set due date and priority.

---

## 🎉 What's Different from Old "nextstep"?

### Old nextstep page:
- ❌ Simple list, no grouping
- ❌ No filters
- ❌ No quick actions
- ❌ Limited context
- ❌ Manual navigation to each account

### New tasks-list page:
- ✅ Smart grouping by urgency
- ✅ Powerful filters (my/all, priority, account)
- ✅ One-click complete, snooze
- ✅ Rich context (account stage, last activity)
- ✅ Quick actions right in the list
- ✅ Live stats dashboard
- ✅ Modern, responsive UI

---

**For questions or feature requests, contact the dev team!**

Last Updated: January 6, 2026

