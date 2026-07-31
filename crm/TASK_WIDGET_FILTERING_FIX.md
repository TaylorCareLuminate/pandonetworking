# Task Widget Filtering Fix

## Problem
The "My Tasks" widget on `crm/mainpage.html` was not showing tasks that appeared on `crm/tasks-list.html`. Tasks were being filtered too aggressively.

## Root Cause
The mainpage widget had **two filtering issues**:

### Issue 1: Early Filtering of Activity Tasks
**Location:** `crm/mainpage.html` line ~2554

**Problem:** Tasks were being filtered OUT during the loading phase:
```javascript
// OLD CODE - Filtered too early
if (tasksViewMode === 'my' && note.assignee !== currentUser.email) {
  return; // Skip this task entirely
}
```

**Impact:** If a task didn't have an explicit `assignee` field, it would be excluded even if the user was the account owner.

### Issue 2: Missing Assignee Fallback
**Problem:** Activity tasks only used `note.assignee` without falling back to `accountOwner`:
```javascript
assignee: note.assignee || 'Unassigned'  // OLD
```

**Impact:** Tasks without an explicit assignee would show as "Unassigned" instead of defaulting to the account owner.

## Solution

### 1. Removed Early Filtering
Removed the `tasksViewMode === 'my'` filter from the task loading loop. Instead, we now:
1. Load ALL tasks first
2. Set assignee with fallback: `note.assignee || accountOwner || 'Unassigned'`
3. Filter by assignee AFTER all tasks are loaded

### 2. Added Centralized Filtering
Added filtering logic after all tasks are collected, before sorting:
```javascript
// Filter by assignee if in "my" mode
let filteredTasks = tasks;
if (tasksViewMode === 'my') {
  filteredTasks = tasks.filter(task => task.assignee === currentUser.email);
  console.log(`🔍 Filtered to ${filteredTasks.length} tasks assigned to ${currentUser.email}`);
}
```

### 3. Updated Document Task Creation
Removed early filtering from `createDocTaskForWidget()`:
```javascript
// REMOVED THIS:
if (tasksViewMode === 'my' && doc.createdBy !== currentUserEmail && accountOwner !== currentUserEmail) {
  return null;
}
```

Document tasks now always set assignee as: `doc.createdBy || accountOwner || 'Unassigned'`

## Changes Made

### File: `crm/mainpage.html`

1. **Lines ~2550-2568**: Updated activity task loading
   - Removed early `tasksViewMode === 'my'` filter
   - Added assignee fallback: `note.assignee || accountOwner || 'Unassigned'`

2. **Lines ~2478-2513**: Updated `createDocTaskForWidget()`
   - Removed early filtering by creator/owner
   - Simplified to always create task with proper assignee

3. **Lines ~2615-2627**: Added centralized filtering
   - Filter tasks by assignee AFTER loading
   - Added debug logging for filtered task count

## How It Works Now

### Loading Phase (No Filtering)
1. Load all tasks from all accounts
2. For each task, set assignee with fallback:
   - Activity task: `note.assignee || accountOwner || 'Unassigned'`
   - Document task: `doc.createdBy || accountOwner || 'Unassigned'`
3. Add ALL tasks to the array

### Filtering Phase
1. If `tasksViewMode === 'my'`:
   - Filter to only tasks where `task.assignee === currentUser.email`
2. If `tasksViewMode === 'all'`:
   - Show all tasks (no filtering)

### Rendering Phase
1. Sort filtered tasks by due date
2. Limit to 7 tasks (unless expanded)
3. Render to widget

## Consistency with tasks-list.html

The mainpage widget now uses the **same logic** as `tasks-list.html`:
- ✅ Same assignee fallback logic
- ✅ Same filtering approach (filter after loading, not during)
- ✅ Same assignee comparison: `task.assignee === currentUser.email`

## Testing

To verify the fix:

1. **Create a task on an account you own** (without setting an explicit assignee)
   - Should now appear in "My Tasks" widget on mainpage
   - Should also appear in tasks-list.html

2. **Toggle between "My Tasks" and "All Tasks"** in the widget
   - "My Tasks": Only shows tasks assigned to you
   - "All Tasks": Shows all tasks from all accounts

3. **Check document tasks**
   - Draft documents should appear as tasks
   - Should be assigned to document creator OR account owner

## Debug Output

Added console logging to help debug task filtering:
```javascript
console.log(`✅ Loaded ${tasks.length} tasks total`);
console.log(`🔍 Filtered to ${filteredTasks.length} tasks assigned to ${currentUser.email}`);
```

## Result

✅ **Tasks now appear consistently** between mainpage widget and tasks-list.html
✅ **Account owners see tasks** on accounts they own, even without explicit assignee
✅ **Filtering happens centrally** instead of scattered throughout the code
✅ **Debug logging** helps troubleshoot task visibility issues




