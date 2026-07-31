# Task Group Start Offset Feature

## Overview
The **Start Date Offset** feature allows you to separate when tasks are **created** from when they **start**.

## Use Case Example

### Scenario: Weekly Planning Schedule
- **Create tasks**: Every Monday at 9:00 AM (when cron runs)
- **Tasks start**: Thursday (3 days later)

This gives you time to:
- Review the tasks before they start
- Make adjustments if needed
- Plan ahead for the week

### Configuration
```
Frequency: Weekly (Monday)
Time: 09:00 UTC
Start Offset: 3 days
```

### Result
- Monday 9:00 AM: Tasks are created in the database
- The **first task** (root task) in the group is due on **Thursday**
- Subsequent tasks follow the normal `daysAfterRoot` pattern

## How It Works

### Without Offset (Default: 0 days)
```
Today: Monday, Nov 4
Cron runs: Monday 9:00 AM
Root task due: Monday, Nov 4
Task 2 (+3 days): Thursday, Nov 7
Task 3 (+7 days): Monday, Nov 11
```

### With Offset (3 days)
```
Today: Monday, Nov 4
Cron runs: Monday 9:00 AM
Root task due: Thursday, Nov 7  ← Offset applied!
Task 2 (+3 days): Sunday, Nov 10
Task 3 (+7 days): Thursday, Nov 14
```

## Configuration

### Frontend (repeat_scheduled_tasks.html)
New field in the schedule form:
```html
<input type="number" id="start-offset-days" 
       value="0" min="0" max="365" />
```

- **Label**: "Task Group Start Offset (Days)"
- **Default**: 0 (no offset)
- **Range**: 0-365 days
- **Description**: "How many days after creation should tasks start?"

### Backend (Railway server.js)
```javascript
const startOffsetDays = schedule.startOffsetDays || 0;
let startDate = currentDate; // Today

if (startOffsetDays > 0) {
  const offsetDate = new Date();
  offsetDate.setUTCDate(offsetDate.getUTCDate() + startOffsetDays);
  startDate = offsetDate.toISOString().split('T')[0];
}
```

### Database (Firebase)
Schedule data includes:
```javascript
{
  name: "Weekly Planning Tasks",
  frequency: "weekly",
  startOffsetDays: 3,  // ← New field
  // ... other fields
}
```

## Display

### Manage Schedules Tab
Shows offset if > 0:
```
Organizations: 71 (All)
Start Offset: +3 days  ← Displayed here
Next Run: Mon, Nov 11, 2025...
```

### Execution Logs Tab
Shows offset in schedule summary:
```
Weekly Planning Tasks
weekly • 09:00 UTC • +3d offset  ← Compact display
```

### Railway Logs
```
🔎 Checking schedule: "Weekly Planning Tasks"
   Start Offset: 3 days
📅 Start date offset applied: 3 days → Tasks will start on 2025-11-07
```

## Common Scenarios

### 1. Same-Day Start (Default)
```
Offset: 0 days
Create: Monday 9:00 AM
Start: Monday (same day)
```

### 2. Next-Day Start
```
Offset: 1 day
Create: Monday 9:00 AM
Start: Tuesday
```

### 3. Week-Start Preparation
```
Offset: 3 days
Create: Monday 9:00 AM (plan day)
Start: Thursday (execution begins)
```

### 4. Month-Ahead Planning
```
Offset: 7 days
Create: 1st of month
Start: 8th of month
```

## Benefits

✅ **Planning Time**: Create tasks in advance for review
✅ **Flexible Scheduling**: Separate creation from execution
✅ **Team Coordination**: Give teams time to prepare
✅ **Batch Processing**: Create all tasks at once, start later
✅ **Predictable Timing**: Always know when tasks will start

## Technical Notes

### Date Calculation
- Uses UTC to avoid timezone issues
- Applies offset to root task date
- All subsequent tasks follow `daysAfterRoot` from the offset date

### Validation
- Minimum: 0 days (same day)
- Maximum: 365 days (1 year)
- Default: 0 days (backward compatible)

### Backward Compatibility
- Existing schedules without `startOffsetDays` default to 0
- No breaking changes to existing functionality
- Old schedules continue to work as before

## Examples by Use Case

### Weekly Check-ins (Monday to Thursday)
```
Name: Weekly Client Check-in
Frequency: Weekly (Monday)
Time: 09:00 UTC
Start Offset: 3 days
Result: Created Monday, starts Thursday
```

### Monthly Reports (1st to 5th)
```
Name: Monthly Status Report
Frequency: Monthly (1st)
Time: 08:00 UTC
Start Offset: 4 days
Result: Created on 1st, starts on 5th
```

### Quarterly Reviews (Advance Planning)
```
Name: Quarterly Business Review
Frequency: Quarterly
Time: 09:00 UTC
Start Offset: 14 days
Result: Created 2 weeks before quarter, starts on 15th
```

## Testing

1. **Create a test schedule** with offset
2. **Click Manual Test Trigger**
3. **Check Railway logs** for offset confirmation
4. **Check My Tasks** - verify root task due date
5. **Verify** subsequent tasks follow correct pattern

Expected log output:
```
📅 Start date offset applied: 3 days → Tasks will start on 2025-11-07
✅ Created task: [Task Name] for [Customer] (2025-11-07)
```

## Files Modified

### Frontend
- `HealthLuminateSite/ppccare/repeat_scheduled_tasks.html`
  - Added input field for offset (line 551-565)
  - Collect offset value (line 1525)
  - Save to database (line 1560)
  - Display in Manage tab (line 1174-1179)
  - Display in Logs tab (line 1291)

### Backend
- `RailwayCLemail/server.js`
  - Read offset from schedule (line 661)
  - Apply offset to start date (lines 664-670)
  - Log offset value (line 613)

## Support

If offset isn't being applied:
1. Check Railway logs for offset value
2. Verify schedule has `startOffsetDays` field
3. Ensure offset is > 0 (0 means no offset)
4. Check task due dates in My Tasks page





