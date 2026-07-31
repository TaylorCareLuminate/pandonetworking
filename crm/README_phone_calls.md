# Phone Calls Workspace - README

## Overview (Legacy)

The Phone Calls Workspace (`phone_calls.html`) is a dedicated work page that allows users to efficiently process phone calls from their campaign queue. It integrates with the CLEmail Firebase database to pull phone call records and displays them one at a time with associated scripts and contact information.

**Important:** This CRM page is now archived because it’s easy to confuse with the real agent calling workflow.

- **Agents should use**: `team/phone-calls.html`
- **Legacy CRM page**: `crm/legacy/phone_calls.html`
- **Stub notice page** (prevents confusion): `crm/phone_calls.html`

## Features

### 🎯 **One-at-a-Time Processing**
- Shows a single phone call at a time for focused attention
- Queue-based system that moves through pending calls sequentially
- Clear progress indicator showing current position in the queue

### 📞 **Contact Information Display**
- Full contact details including name, company, phone, email
- Job title and location information
- Clean, easy-to-read contact card layout

### 📋 **Script Integration**
- Displays call scripts from the campaigns system
- Automatic personalization using contact data variables
- Scripts are rendered with proper formatting and structure

### 📊 **Call Outcome Tracking**
- Multiple outcome options: Completed, No Answer, Callback, Do Not Call
- Call timer to track duration
- Note-taking functionality for call outcomes
- Results are saved back to the Firebase database

### 🔄 **Queue Management**
- Skip calls to process later (moves them to end of queue)
- Refresh queue to check for new calls
- Automatic progression through the queue

## Database Integration

### Data Sources
The system checks multiple possible locations for phone call data:
- `hl_emails/phone_calls` - Direct phone call records
- `hl_emails/phoneCalls` - Alternative naming convention
- `hl_emails/campaigns` - Extracts phone call activities from campaign data

### Expected Data Structure

**Phone Call Record:**
```json
{
  "id": "unique_call_id",
  "campaignId": "campaign_123",
  "campaignName": "Healthcare Innovation Outreach",
  "contactData": {
    "first_name": "John",
    "last_name": "Smith",
    "title": "CTO",
    "company_name": "Regional Medical Center",
    "workphone": "(555) 123-4567",
    "workemail": "john.smith@example.com",
    "city": "Chicago",
    "state": "IL"
  },
  "script": "Hi [first_name], this is [caller_name] from HealthLuminate...",
  "status": "pending", // pending, completed, no-answer, callback, do-not-call
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T11:45:00Z", // when marked complete
  "notes": "Interested in demo, scheduled for next week",
  "callDuration": 180, // seconds
  "completedBy": "user@example.com"
}
```

**Campaign Integration:**
If phone calls come from campaigns, the system looks for campaign activities with `type: "call"`:
```json
{
  "activities": [
    {
      "type": "call",
      "day": 3,
      "description": "Follow-up phone call",
      "content": {
        "script": "Hi [first_name], following up on our email..."
      }
    }
  ]
}
```

## Script Personalization

The system automatically replaces variables in scripts with contact data:
- `[first_name]` → Contact's first name
- `[last_name]` → Contact's last name  
- `[company_name]` → Company name
- `[title]` → Job title
- `[caller_name]` → Current user's name
- `[city]`, `[state]` → Location information
- `[workemail]`, `[workphone]` → Contact details

## User Interface

### Layout
- **Left Panel**: Contact information and call notes
- **Right Panel**: Call script display
- **Bottom**: Call outcome buttons and controls

### Call Outcomes
- **Call Completed** ✅ - Successful call, notes recorded
- **No Answer** 📞 - No one answered, can retry later
- **Schedule Callback** ⏰ - Contact requested callback
- **Do Not Call** 🚫 - Remove from future calling
- **Skip for Now** ⏭️ - Move to end of queue, process later

### Responsive Design
- Desktop: Two-column layout with side-by-side panels
- Mobile: Stacked layout with full-width sections

## Browser-Based Calling Integration

The page is designed to integrate with browser-based calling tools:
- Contact phone numbers are prominently displayed
- Click-to-call functionality can be added easily
- Call timer tracks actual call duration
- Notes field captures call outcomes

## Usage Workflow

1. **Load Page** → System connects to Firebase and loads pending calls
2. **Review Contact** → See contact details and company information
3. **Read Script** → Review personalized call script and talking points
4. **Make Call** → Use displayed phone number (future: click-to-call)
5. **Track Time** → Built-in timer shows call duration
6. **Record Outcome** → Select result and add notes
7. **Next Call** → Automatically moves to next pending call

## Sample Data

The system includes sample phone calls for testing when no real data exists:
- Healthcare innovation outreach scenarios
- ERP integration campaign calls
- Realistic contact data and scripts

## File Location
- **Legacy File**: `HealthLuminateSite/crm/legacy/phone_calls.html`
- **Integration**: Uses same auth system as other CRM pages
- **Dependencies**: Firebase, Font Awesome icons, shared CSS

## Future Enhancements
- Browser-based dialing integration
- Voicemail drop functionality  
- Call recording integration
- Advanced call analytics
- Team call distribution
- CRM sync for call logging
