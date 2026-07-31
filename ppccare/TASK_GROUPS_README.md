# PPC Care Task Groups Management System

## Overview

The Task Groups page (`task_groups.html`) provides a comprehensive system for creating and managing reusable task templates that can be assigned together as complete workflows. This is ideal for common processes like customer onboarding, system integrations, or recurring maintenance tasks.

## Key Concepts

### What are Task Groups?
Task Groups are **templates** that define sets of related tasks that typically need to be completed together as part of a workflow. They do NOT create actual tasks in the task management system, but instead serve as blueprints that can be used to quickly assign multiple related tasks simultaneously.

### Use Cases
- **Customer Onboarding**: Create a complete workflow with all tasks needed to onboard a new healthcare customer
- **System Integration**: Define all technical steps required to integrate with a new EHR system
- **Training Programs**: Set up structured training sequences for new team members
- **Maintenance Workflows**: Create recurring maintenance task sequences

## Features

### ✨ **Task Group Management**
- **Create New Groups**: Build custom task group templates from scratch
- **Edit Groups**: Modify existing task group templates
- **Duplicate Groups**: Copy existing groups to create variations
- **Delete Groups**: Remove unused task group templates

### 📋 **Task Definition Within Groups**
- **Task Name**: Define clear, descriptive names for each task
- **Group Task Type**: All tasks in a group share the same type (Customer Support or Consultant Support)
- **Days After Root**: Set timing relative to the root task (can be negative for prep tasks)
- **Role Assignment**: Assign tasks to specific roles defined in the roles management system
  - **Customer Support groups** → Use Client Support Roles (from roles.html)
  - **Consultant Support groups** → Use Consultant Support Roles (from roles.html)
- **Checklist Items**: Add detailed checklist items for each task

### 🎯 **Root Task Concept**
- **Root Task**: The main task that other tasks are scheduled relative to
- **Flexible Timing**: Tasks can be scheduled before (negative days) or after (positive days) the root task
- **Visual Indicators**: Root tasks are clearly marked with star icons

### 📊 **Visual Management**
- **Card-Based Layout**: Each task group displayed as an organized card
- **Task Statistics**: See task count, checklist items, and root task at a glance
- **Type Indicators**: Visual badges showing Customer Support vs Consultant Support tasks
- **Timing Display**: Clear indication of task sequencing and timing

## Database Structure

Task groups are stored in Firebase Realtime Database at the path: `ppccare/task_groups`

### Task Group Fields

#### Group Information
- `groupId`: Unique identifier for the task group
- `name`: Descriptive name for the task group
- `type`: Task type for all tasks in the group ("Customer Support" or "Consultant Support")
- `description`: Detailed explanation of what the group is for
- `rootTaskIndex`: Index of the task that serves as the root (timing reference)

#### Tasks Array
Each task group contains an array of tasks with the following structure:
- `name`: Task name/title
- `daysAfterRoot`: Number of days relative to root task (can be negative)
- `assignedTo`: Role name from the roles management system
- `checklistItems`: Array of specific checklist items for the task

#### Metadata
- `createdDate`: When the group was created
- `createdBy`: Who created the group
- `lastUpdated`: When the group was last modified
- `updatedBy`: Who last modified the group

### Sample Data Structure

See `sample_task_groups_data.json` for complete examples showing:
- **Customer Onboarding Process**: 6-task workflow for new customer setup
- **EHR System Integration**: 4-task technical integration process
- **Monthly System Maintenance**: 4-task recurring maintenance workflow
- **New Consultant Onboarding**: 5-task employee onboarding process

## Setup Instructions

### 1. Database Setup
1. Ensure Firebase Realtime Database is configured
2. Create the path `ppccare/task_groups` in your database
3. Optionally import sample data from `sample_task_groups_data.json` for testing

### 2. Authentication
The page uses the existing authentication system. Users must be logged in and verified to access task groups.

### 3. Navigation
The "Task Groups" option has been added to navigation dropdowns in both Customer Overview and All Tasks pages.

## Usage Guide

### Creating a New Task Group

1. **Navigate to Task Groups page** via the navigation dropdown
2. **Click "Create New Group"** button in the top section
3. **Fill in Group Details**:
   - Enter a descriptive group name
   - Select the task type for the entire group (Customer Support or Consultant Support)
   - Add an optional description explaining the group's purpose
4. **Add Tasks to the Group**:
   - Click "Add Task" to create new tasks within the group
   - Fill in task details for each task:
     - Task name (required)
     - Days after root task (0 for same day, positive for later, negative for earlier)
     - Assigned role (selected from the roles defined in the roles management system)
5. **Set Root Task**:
   - Check the "This is the root task" checkbox for the main reference task
   - Other tasks will be scheduled relative to this task
6. **Add Checklist Items**:
   - For each task, add specific checklist items
   - Use "Add Item" button to add more checklist items
   - Remove items with the × button
7. **Save the Group** by clicking "Save Task Group"

### Managing Existing Task Groups

#### Viewing Groups
- All task groups are displayed as cards on the main page
- Each card shows:
  - Group name and description
  - Task count and checklist item count
  - Root task name
  - List of all tasks with their details

#### Editing Groups
1. Click the **edit icon** (pencil) on any task group card
2. Modify any aspect of the group:
   - Change group name or description
   - Add, remove, or modify tasks
   - Update task details, timing, or assignments
   - Change which task is the root task
3. Save changes when complete

#### Duplicating Groups
1. Click the **duplicate icon** (copy) on any task group card
2. The group will open in edit mode with "(Copy)" added to the name
3. Modify as needed and save as a new group

#### Deleting Groups
1. Click the **delete icon** (trash) on any task group card
2. Confirm deletion when prompted
3. **Note**: This action cannot be undone

### Best Practices

#### Group Organization
- **Use descriptive names** that clearly indicate the workflow purpose
- **Add detailed descriptions** to help team members understand when to use each group
- **Keep groups focused** on specific workflows rather than mixing unrelated tasks

#### Task Sequencing
- **Choose logical root tasks** that represent the main milestone or starting point
- **Use negative days** for preparation tasks that must happen before the root task
- **Use positive days** for follow-up tasks that happen after the root task
- **Consider dependencies** when setting timing between tasks

#### Task Assignments
- **Use specific names** when you know exactly who should handle each task
- **Use role names** (e.g., "Technical Lead", "Account Manager") for flexibility
- **Be consistent** with naming conventions across your organization

#### Checklist Items
- **Be specific and actionable** in checklist items
- **Break down complex steps** into smaller, manageable items
- **Use consistent language** and formatting across similar tasks

## Technical Details

### Dependencies
- Firebase Realtime Database
- Font Awesome icons
- Existing authentication system (`../js/auth.js`)

### Browser Compatibility
- Modern browsers with ES6+ support
- Responsive design optimized for desktop and tablet use
- Mobile-friendly interface

### Performance Considerations
- Data is cached locally to minimize database calls
- Cards are rendered dynamically for optimal performance
- Modal-based editing reduces page complexity

## Integration with Roles Management

Task Groups are fully integrated with the Roles Management system (`roles.html`):

### Role Assignment Logic
- **Customer Support Groups**: Tasks are assigned to roles from the "Client Support Roles" category
- **Consultant Support Groups**: Tasks are assigned to roles from the "Consultant Support Roles" category

### Dynamic Role Loading
- Roles are loaded directly from the same database as `roles.html`
- Role dropdowns populate automatically based on the group's task type
- Real-time validation ensures only valid roles can be assigned
- **Refresh Roles** button allows updating roles without page reload

### Role Management Workflow
1. **Setup Roles First**: Define roles in the Roles Management page
2. **Create Task Groups**: Select task type to determine available roles
3. **Assign Tasks**: Choose from appropriate roles based on group type
4. **Update as Needed**: Use refresh function to get latest roles

## Integration with Task Management

### Current State
Task Groups currently serve as **templates only** and do not automatically create tasks in the main task management system.

### Future Integration
Planned enhancements include:
- **"Deploy Group" functionality** to create actual tasks from group templates
- **Customer assignment** when deploying groups
- **Automatic task creation** with proper dates and assignments
- **Progress tracking** for deployed task groups
- **Template versioning** for group updates

## Troubleshooting

### Roles Issues
- **No roles in dropdown**: Ensure roles are defined in the Roles Management page first
- **Wrong roles showing**: Verify the group task type matches the desired role category
- **Roles not updating**: Use the "Refresh Roles" button to reload the latest roles
- **Empty role categories**: Add roles to both Client Support and Consultant Support categories as needed

### General Issues

### Common Issues

1. **Groups not loading**: Check Firebase database permissions and network connectivity
2. **Save failures**: Verify database write permissions and required field validation
3. **Tasks not displaying properly**: Ensure all required task fields are completed
4. **Root task issues**: Verify that exactly one task is marked as root

### Debug Information
The browser console provides detailed logging:
- Database connection status
- Task group loading progress
- Save/update operations
- Error messages with specific details

## Support

For technical support or feature requests regarding task groups, contact the development team or refer to the main application documentation.

---

*This system is designed to streamline workflow management by providing reusable task templates that ensure consistency and completeness in common business processes.* 