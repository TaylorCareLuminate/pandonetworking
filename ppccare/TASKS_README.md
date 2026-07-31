# PPC Care Task Management System

## Overview

The All Tasks page (`alltasks.html`) provides a comprehensive task management system for tracking and managing all tasks within the PPC Care system. Users can view, filter, sort, create, edit, and delete tasks with full support for bulk operations.

## Features

### Core Features
- **Task Table View**: Display all tasks in a sortable, filterable table
- **Advanced Filtering**: Filter tasks by status, owner, customer, group, and customer dependency
- **Search Functionality**: Global search across all task fields
- **Sorting**: Click column headers to sort by any field
- **Multi-select**: Select multiple tasks for bulk operations
- **Bulk Operations**: Edit or delete multiple tasks at once
- **Export**: Export filtered tasks to CSV

### Task Management
- **Create New Tasks**: Add new tasks with all required fields
- **Edit Tasks**: Modify existing task details
- **Delete Tasks**: Remove individual or multiple tasks
- **Status Tracking**: Monitor task progress with visual indicators
- **Progress Bars**: Visual representation of task completion percentage

### Statistics Dashboard
- Total tasks count
- Tasks by status (Waiting, In Progress, Complete)
- Customer dependency tracking

## Database Structure

Tasks are stored in Firebase Realtime Database at the path: `ppccare/tasks`

### Task Fields

Each task contains the following fields:

#### Required Fields
- `task_id`: Unique identifier for the task
- `task_name`: Short title of the task
- `task_owner`: **Role name** responsible for the task (e.g., "IT Director", "Senior Implementation Consultant")
- `task_status`: Current status (Waiting, In Progress, Complete)

#### Optional Fields
- `task_group`: Group or category the task belongs to (defaults to "NA")
- `task_desc`: Detailed description of the task
- `task_owner_id`: Unique identifier for the task owner
- `customer_name`: Associated customer name
- `customer_id`: Associated customer identifier
- `consultant_name`: Associated consultant name
- `consultant_id`: Associated consultant identifier
- `task_date_target`: Target completion date
- `task_completion_percent`: Percentage complete (0-100)
- `customer_depend`: Binary indicator (0/1) for customer dependency
- `task_dependency_id`: ID of prerequisite task
- `task_notes`: Progress notes and comments

#### System Fields (Auto-generated)
- `task_creation_date`: When the task was created
- `task_creation_leader`: Who created the task
- `task_creation_leader_id`: Creator's unique identifier
- `task_checklist_items`: Array of checklist items with status
- `task_logging`: Array of activity logs

#### Derived Fields (Computed at Runtime)
- `assigned_person_name`: Current team member assigned to the `task_owner` role
- `assigned_person_email`: Email of the currently assigned team member
- `assignment_status`: Status of role assignment (Assigned, Unassigned, Multiple)

### Sample Data Structure

See `sample_tasks_data.json` for complete examples of task data structure.

## Person Assignment System

### Overview

The task management system uses a **derived assignment model** where tasks are assigned to roles rather than specific individuals. The actual person responsible for each task is dynamically determined by looking up which team member currently holds that role.

### How It Works

#### 1. Role-Based Task Assignment
- Tasks are assigned to **role names** (stored in `task_owner` field)
- Examples: "IT Director", "Senior Implementation Consultant", "Project Manager"
- These roles correspond to entries in the `ppccare/roles` database

#### 2. Dynamic Person Resolution
When displaying tasks, the system:
1. **Looks up the role** specified in `task_owner`
2. **Queries team data** (`ppccare/team`) to find who currently holds that role
3. **Displays both the role and person** in the task table
4. **Updates automatically** when role assignments change

#### 3. Team Member Role Assignment
Team members in `ppccare/team` have roles assigned through:
- **Role field**: Specifies their current role title
- **Customer associations**: Determines which customers they support
- **Multiple roles**: Team members can hold multiple roles if needed

### Assignment Status Types

The system recognizes three assignment statuses:

#### ✅ **Assigned**
- **One person** currently holds the role
- **Display**: Shows role name + person name
- **Example**: "IT Director - John Smith (john@company.com)"

#### ⚠️ **Unassigned** 
- **No one** currently holds the role
- **Display**: Shows role name with "Unassigned" indicator
- **Example**: "IT Director - **Unassigned**"

#### 🔄 **Multiple**
- **Multiple people** hold the same role
- **Display**: Shows role name with count
- **Example**: "Project Manager - **Multiple Assigned (3)**"

### Benefits of Derived Assignments

#### 🔄 **Automatic Updates**
- When a team member's role changes, their task assignments update automatically
- No manual task reassignment required
- Maintains task continuity during role transitions

#### 📋 **Organizational Flexibility**
- Support role-based organizational structures
- Handle temporary role assignments and coverage
- Manage multiple people in the same role

#### 🎯 **Consistency**
- Tasks remain assigned to organizational positions, not individuals
- Easier to plan and manage workload by role
- Clear accountability structure

### Data Integration

The person assignment system integrates data from three sources:

#### 1. Tasks Data (`ppccare/tasks`)
```json
{
  "task_owner": "IT Director",
  "task_name": "System Configuration Review",
  "customer_name": "General Hospital"
}
```

#### 2. Team Data (`ppccare/team`)  
```json
{
  "john_smith_email_com": {
    "name": "John Smith",
    "email": "john@company.com", 
    "role": "IT Director",
    "customers": ["customer_123"]
  }
}
```

#### 3. Roles Data (`ppccare/roles`)
```json
{
  "client": {
    "role_001": {
      "name": "IT Director",
      "definition": "Responsible for IT strategy and system oversight"
    }
  }
}
```

### Customer-Specific Role Assignments

For tasks with specific customers, the system can:
1. **Filter by customer**: Only show team members assigned to that customer
2. **Role + Customer matching**: Find the "IT Director" who supports "General Hospital"
3. **Fallback assignment**: If no customer-specific assignment exists, show all role holders

### Implementation Considerations

#### Performance
- **Client-side joins**: Role resolution happens in the browser for responsiveness
- **Caching**: Team and role data cached to minimize database calls
- **Lazy loading**: Person data loaded only when needed

#### Error Handling
- **Graceful degradation**: Show role name even if person lookup fails
- **Missing data**: Handle cases where roles or team members don't exist
- **Network issues**: Cache last known assignments for offline display

## Setup Instructions

### 1. Database Setup
1. Ensure Firebase Realtime Database is configured
2. Create the path `ppccare/tasks` in your database
3. Optionally import sample data from `sample_tasks_data.json` for testing

### 2. Team Data Setup
Ensure team members are properly configured in `ppccare/team` with:
- Name and email information
- Role assignments matching role names in `ppccare/roles`
- Customer associations for customer-specific tasks

### 3. Authentication
The page uses the existing authentication system. Users must be logged in and verified to access the task management system.

### 4. Navigation
The "All Tasks" option has been added to the navigation dropdown in the Customer Overview page for easy access.

## Usage

### Viewing Tasks
1. Navigate to the All Tasks page via the navigation dropdown
2. View all tasks in the table with their current status and details
3. **Task Owner column** now shows both role and assigned person:
   - **"IT Director - John Smith"** (when one person holds the role)
   - **"IT Director - Unassigned"** (when no one holds the role)  
   - **"IT Director - Multiple Assigned (2)"** (when multiple people hold the role)
4. Use the statistics cards at the top to get an overview

### Filtering Tasks
- **Search**: Use the search box to find tasks by any text content
- **Status Filter**: Filter by Waiting, In Progress, or Complete
- **Customer Dependency**: Show only tasks with or without customer dependencies
- **Owner Filter**: Filter by specific task owners
- **Customer Filter**: Filter by specific customers
- **Group Filter**: Filter by task groups

### Sorting
- Click any column header to sort by that field
- Click again to reverse the sort order
- Sort indicators show current sort field and direction

### Creating Tasks
1. Click the "New Task" button
2. Fill in the required fields:
   - **Task Name**: Descriptive title for the task
   - **Task Owner**: **Role name** (e.g., "IT Director", not person's name)
3. Optionally fill in additional details (customer, consultant, dates, etc.)
4. Click "Save Task"

**Note**: Tasks are assigned to roles, and the system automatically determines which person currently holds that role.

### Editing Tasks
- **Single Task**: Click the edit icon next to any task
- **Multiple Tasks**: Select multiple tasks and click "Edit Selected"

### Deleting Tasks
- **Single Task**: Click the delete icon next to any task
- **Multiple Tasks**: Select multiple tasks and click "Delete Selected"

### Bulk Operations
1. Use checkboxes to select multiple tasks
2. The selected count will update automatically
3. Use "Edit Selected" or "Delete Selected" buttons for bulk operations

### Exporting Data
1. Apply filters to show desired tasks (or leave unfiltered for all tasks)
2. Click "Export" to download a CSV file
3. The export includes all visible tasks with their complete details

## Technical Details

### Dependencies
- Firebase Realtime Database (for tasks, team, and roles data)
- Font Awesome icons
- Existing authentication system (`../js/auth.js`)
- Team management system (`ppccare/team`)
- Roles management system (`ppccare/roles`)

### Browser Compatibility
- Modern browsers with ES6+ support
- Responsive design works on desktop and mobile devices

### Performance Considerations
- Table is virtualized for large datasets
- Filtering and sorting are performed client-side for responsiveness
- Data is cached locally to minimize database calls
- **Person resolution**: Team and role data loaded once and cached
- **Dynamic assignments**: Person lookups performed in memory for speed
- **Lazy loading**: Person data resolved only for visible tasks

## Troubleshooting

### Common Issues

1. **Tasks not loading**: Check Firebase database permissions and network connectivity
2. **Authentication errors**: Ensure user is logged in and verified  
3. **Save failures**: Check database write permissions and field validation
4. **Filter not working**: Clear browser cache and reload the page
5. **Person assignments not showing**: 
   - Verify team data exists in `ppccare/team`
   - Check that team member roles match task owner names exactly
   - Ensure team members have proper role assignments
6. **"Unassigned" showing incorrectly**:
   - Check role name spelling in both tasks and team data
   - Verify team member role field is populated
   - Check for extra spaces or capitalization differences
7. **Multiple assignments showing**:
   - Review team data for duplicate role assignments
   - Consider if multiple people should actually hold the same role

### Debug Information
The browser console provides detailed logging for troubleshooting:
- Database connection status
- Task loading progress
- Authentication state
- **Team data loading**: Status of team member data fetch
- **Role resolution**: Person assignment lookup results
- **Assignment conflicts**: Warnings for multiple or missing assignments
- Error messages with specific details

## Future Enhancements

Planned features for future releases:
- Task dependencies visualization
- Gantt chart view
- Task templates
- Time tracking
- Email notifications
- Calendar integration
- Advanced reporting
- **Role-based assignment improvements**:
  - Workload balancing across team members
  - Role capacity management
  - Assignment conflict resolution tools
  - Role delegation and backup assignments
  - Customer-specific role filtering
  - Assignment history tracking

## Support

For technical support or feature requests, contact the development team or refer to the main application documentation. 