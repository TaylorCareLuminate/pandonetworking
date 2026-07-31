# 🚀 Ops Engine Quick Start Guide

## What Was Built

Your Ops Engine has been transformed from a simple ticket tracker into a **full Monday.com-style project management system** with:

### ✅ Core Features Implemented

1. **Hierarchical Projects** 
   - Create projects and sub-projects (unlimited nesting)
   - Each project tracks its own completion metrics
   - Color-coded for easy visual identification

2. **Table View (like Monday.com)**
   - Collapsible project rows
   - Click project to expand/collapse tasks
   - All task details visible in columns
   - Professional, clean design

3. **Enhanced Tasks**
   - Owner assignment
   - Status tracking (Not Started, Working, Stuck, Done)
   - Due dates with overdue highlighting
   - Priority levels (Low, Medium, High, Urgent)
   - Budget tracking
   - Effort estimation
   - Notes field
   - Progress visualization
   - Last updated timestamp

4. **View Options**
   - Toggle between Table View and Kanban View
   - Table view is the default (recommended)

## How to Get Started

### Step 1: Access the New System

Go to: `https://healthluminate.com/crm/ops-engine`

### Step 2: Create Your First Project

1. Click **"New Project"** button (top right)
2. Enter project name: e.g., "Fundraising" or "Holiday Oil"
3. Choose a color
4. Click **"Save Project"**

### Step 3: Add Tasks to Your Project

1. Click the **"+ Add task"** link under your project, OR
2. Click **"New Task"** button and select the project
3. Fill in task details:
   - Task name (required)
   - Owner (Sam, Taylor, or Joe)
   - Status
   - Due date
   - Priority
   - Budget
   - Other optional fields
4. Click **"Save Task"**

### Step 4: Create Sub-Projects (Optional)

1. Click **"New Project"**
2. Enter project name
3. In **"Parent Project"** dropdown, select the parent
4. Save

This creates a hierarchy like:
```
Fundraising
  ├─ Research Phase
  └─ Campaign Execution
```

## Table Layout

Your table has these columns (matching Monday.com):

| Column | What It Shows |
|--------|---------------|
| **Task** | Task name with checkbox (click name to edit) |
| **Owner** | Assigned person with avatar |
| **Status** | Not Started, Working, Stuck, Done |
| **Due Date** | Deadline (shows in red if overdue) |
| **Priority** | Visual priority badge |
| **Budget** | Dollar amount |
| **Timeline** | Progress bar (auto-calculated) |
| **Last Updated** | Time since last change |

## Quick Actions

- ✅ **Mark task complete**: Click checkbox
- 📝 **Edit task**: Click task name
- ⚙️ **Edit project**: Click edit button on project row
- 🔽 **Collapse/Expand**: Click project row or arrow
- 🔍 **Search**: Use search box at top
- 🎯 **Filter**: Use priority/assignee filters

## Getting Started From Scratch

Since you're starting fresh:

1. **Create swim lanes** (verticals) first
2. **Create projects** and assign to verticals
3. **Add tasks** to projects
4. **Assign owners** and set due dates
5. **Track progress** as work gets done

## Data Structure

### Firebase Collections

**projects** collection:
- `name` - Project name
- `description` - Optional description
- `parentProjectId` - ID of parent project (null for top-level)
- `color` - Hex color code
- `status` - active, on-hold, completed, archived
- `order` - Display order
- Timestamps: `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

**tasks** collection:
- `title` - Task name
- `projectId` - Required: which project
- `owner` - sam, taylor, joe
- `status` - not-started, working, stuck, done
- `priority` - low, medium, high, urgent
- `dueDate` - Date object or null
- `budget` - Number (dollars)
- `effort` - Number (hours)
- `notes` - Additional text
- `description` - Task details
- `order` - Display order within project
- `comments` - Array of comment objects
- Timestamps: `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

## Swim Lanes / Verticals ✅

Organize your projects by company verticals/departments (Sales, Marketing, Tech, etc.)

### How to Set Up Swim Lanes:

1. Click **"Manage Verticals"** button (top toolbar)
2. Add your verticals:
   - Enter name (e.g., "Sales", "Marketing", "Tech")
   - Choose a color
   - Click **"Add"**
3. Close the modal

### Using Swim Lanes:

**Group Mode (default):**
- Shows all verticals with dividers
- Click vertical header to collapse/expand
- See all verticals at once

**Filter Mode:**
- Use dropdown to select one vertical
- Shows only projects in that vertical
- Toggle between modes with icons next to dropdown

**Assigning Projects:**
- When creating/editing a project
- Select "Vertical / Department" dropdown
- Choose the appropriate vertical

### View Toggle:
- 🏊 **Group icon** = Show all verticals with sections
- 🔍 **Filter icon** = Dropdown to filter by one vertical

## Tips for Success

1. **Start Simple**: Create 2-3 main projects first
2. **Use Colors**: Assign different colors to different project types
3. **Set Due Dates**: Helps with prioritization
4. **Use Status**: Update status as you work
5. **Add Notes**: Keep context in the task for future reference
6. **Regular Updates**: Team should update their tasks daily

## Example Structure

Here's how you might organize based on your Monday.com screenshot:

```
📁 Fundraising
  ├─ Task: Research potential donors
  ├─ Task: Draft proposal
  └─ Task: Schedule meetings

📁 Holiday Oil
  ├─ Task: Overview of all locations
  ├─ Task: Identify novelty items
  ├─ Task: Ideal price range for packages
  └─ 📁 Sub-project: Show Planning
      ├─ Task: Build show options
      └─ Task: Determine budget

📁 Stands
  ├─ Task: Location scouting
  └─ Task: Vendor coordination
```

## Support & Next Steps

**Files Created:**
- `/crm/ops-engine.html` - Main application (fully rebuilt)
- `/crm/OPS_ENGINE_README.md` - Detailed documentation
- `/crm/OPS_ENGINE_QUICK_START.md` - This guide

**What to do now:**
1. **Create swim lanes** (company verticals)
2. **Create your first project** and assign to a vertical
3. **Add tasks** to the project
4. Test collapsing/expanding
5. Try different view modes (group/filter)
6. Check the progress visualization

**System is complete and ready to use!**

---

🎉 **You're all set!** Start creating projects and tasks, and let me know if you need any adjustments or have questions about the swim lanes implementation.

