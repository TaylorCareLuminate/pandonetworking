# Ops Engine - Project Management System

## Overview

The Ops Engine has been rebuilt from a simple ticket tracker into a full-featured project management system with hierarchical projects, inspired by Monday.com.

## What's New

### ✅ Completed Features

1. **Hierarchical Project Structure**
   - Projects can contain sub-projects (unlimited nesting)
   - Tasks belong to one project only
   - Project-level metrics (X of Y tasks complete)

2. **Table/List View**
   - Monday.com-style table layout
   - Collapsible project rows (click to expand/collapse)
   - All task details visible in columns
   - Clean, modern design

3. **Enhanced Task Fields**
   - **Due Date** - Track deadlines with date picker
   - **Budget** - Dollar amount tracking
   - **Effort** - Hours estimation
   - **Notes** - Additional task notes
   - **Timeline** - Visual progress bar
   - **Last Updated** - Automatic timestamp

4. **View Toggle**
   - Switch between Table View (default) and Kanban View
   - Kanban view placeholder ready for future implementation

5. **Project Progress Visualization**
   - Progress bars showing completion percentage
   - Task count display (completed/total)
   - Visual color coding per project

## Data Structure

### Projects Collection (`projects`)
```javascript
{
  id: "auto-generated",
  name: "Holiday Oil Campaign",
  description: "Plan holiday oil delivery",
  parentProjectId: null,  // null = top-level, or parent project ID
  color: "#10b981",       // Visual identification
  status: "active",       // active, on-hold, completed, archived
  order: 0,               // Display order
  createdBy: "user@email.com",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Tasks Collection (`tasks`)
```javascript
{
  id: "auto-generated",
  projectId: "project-id",     // Required - parent project
  title: "Overview of all locations",
  description: "Detailed description",
  owner: "sam",                // sam, taylor, joe
  status: "not-started",       // not-started, working, stuck, done
  priority: "medium",          // low, medium, high, urgent
  dueDate: timestamp,
  budget: 500,                 // Dollar amount
  effort: 4,                   // Hours
  notes: "Additional notes",
  order: 0,                    // Order within project
  createdBy: "user@email.com",
  createdAt: timestamp,
  updatedAt: timestamp,
  updatedBy: "user@email.com",
  comments: []
}
```

## Usage Guide

### Creating Projects

1. Click **"New Project"** button
2. Enter project name (required)
3. Optionally select a parent project for sub-projects
4. Choose a color for visual identification
5. Click **"Save Project"**

### Creating Tasks

1. Click **"New Task"** button OR
2. Click **"+ Add task"** under a specific project
3. Enter task name (required)
4. Select project (required)
5. Fill in optional fields:
   - Owner (assignee)
   - Status
   - Priority
   - Due Date
   - Budget
   - Effort estimation
   - Notes
6. Click **"Save Task"**

### Managing Projects & Tasks

- **Expand/Collapse Projects**: Click on project row or arrow icon
- **Edit Project**: Click edit button on project row
- **Edit Task**: Click on task name
- **Quick Status Toggle**: Click checkbox to mark task done/not done
- **Delete**: Open edit modal and click Delete button
  - Projects can only be deleted if they have no tasks or sub-projects

### Table Columns

| Column | Description |
|--------|-------------|
| **Task** | Task name with checkbox (indent shows hierarchy) |
| **Owner** | Assigned team member with avatar |
| **Status** | Current status (Not Started, Working, Stuck, Done) |
| **Due Date** | Deadline (red if overdue) |
| **Priority** | Task priority level |
| **Budget** | Dollar amount allocated |
| **Timeline** | Visual progress bar |
| **Last Updated** | Time since last modification |

## Swim Lanes / Verticals ✅

The system now supports **dynamic swim lanes** (company verticals/departments):

### Features:
- **Create custom verticals** - Add as many as you need (Sales, Marketing, Tech, etc.)
- **Choose colors** - Each vertical gets its own color
- **Two view modes:**
  - **Group Mode** (default): Shows all verticals with collapsible sections
  - **Filter Mode**: Dropdown to filter by single vertical
- **Assign projects to verticals** - Organize your work by department

### How to Use:
1. Click **"Manage Verticals"** button
2. Add new verticals with custom names and colors
3. Toggle between Group/Filter mode using the icons next to the dropdown
4. When creating projects, assign them to a vertical

### Data Structure:
New collection: `swimLanes`
```javascript
{
  name: "Sales",
  color: "#10b981",
  status: "active",
  order: 0
}
```

Projects now have `swimLaneId` field linking to their vertical.

## Starting Fresh

Since you're starting with a clean slate:

1. **Create swim lanes** first (your company verticals)
2. **Create projects** and organize them by vertical
3. **Add tasks** to each project
4. **Assign team members** and set due dates
5. Start tracking your work!

## All Done! 🎉

The Ops Engine is now **fully functional** with all core features:

- ✅ Hierarchical projects with sub-projects
- ✅ Table view with 8 data columns
- ✅ Dynamic swim lanes (verticals)
- ✅ Dual view modes (group/filter)
- ✅ Due dates, budgets, effort tracking
- ✅ Real-time Firebase sync
- ✅ Progress visualization
- ✅ Comments and collaboration

**Ready to use!** Start creating your swim lanes, projects, and tasks.

## Technical Notes

- Built with Firebase Firestore for real-time sync
- Vanilla JavaScript (no framework dependencies)
- Responsive design with CSS Grid
- Real-time updates across all users
- Authentication required (uses existing auth system)

## Support

For questions or issues, refer to this document or check the Firebase Console for data structure.

