# MedBeacon Sepsis Dashboard

## Overview
MedBeacon is a comprehensive sepsis management dashboard designed to help healthcare organizations track and improve their sepsis care performance metrics. The system provides tools for prospect outreach, analytics, and messaging specifically focused on sepsis care quality improvement.

## Features

### 🩺 Sepsis Hotsheet (`hotsheetpage.html`)
- Interactive dashboard showing health systems with sepsis performance metrics
- Organization cards display sepsis care percentiles, lactate result percentiles, and antibiotic timing percentiles
- Hospital information including bed count and EHR systems
- Contact management with conversation starters based on recent news and background
- CRM functionality for tracking outreach activities

### ✉️ Message Builder (`message-builder.html`)
- Create and manage email and LinkedIn message templates
- Sepsis-specific personalization tags including:
  - `[sepsis_appropriate_care_percentile]` - Sepsis care performance ranking
  - `[sepsis_lactate_result_percentile]` - Lactate testing performance
  - `[sepsis_antibiotic_percentile]` - Antibiotic timing performance
  - `[ehr]` - Electronic Health Record system
  - `[hs_total_hospitals]` - Number of hospitals in health system
  - `[organization_news_hook]` - News-based conversation starters
- Support for up to 15 email templates and 6 LinkedIn messages

### 📊 Analytics (`analytics.html`)
- Performance tracking and reporting dashboard
- Sepsis metrics analysis and trends
- Outreach effectiveness measurement

### 🔐 Authentication
- Folder-level access control via Firebase Authentication
- Domain-based permissions management
- Secure user session handling

## Data Sources

### Primary Data Tables
- `steveindex` - Organization index with basic info and sepsis percentiles
- `stevehotsheet519` - Detailed contact and organization data including:
  - Organization details (name, domain, EHR)
  - Hospital metrics (bed count, hospital count)
  - Sepsis performance data (percentiles and raw metrics)
  - Contact information (name, title, email, phone, LinkedIn)
  - News and conversation starters

### CRM Data
- `medbeaconcrm25` - Contact interaction tracking
- `medbeaconorgstatus` - Organization status and outreach history
- `medbeaconmessages25` - User-created message templates

## Key Data Fields

### Organization Data
- `org` - Organization name
- `domain` - Organization domain
- `ehr` - Electronic Health Record system
- `hs_total_hospitals` - Number of hospitals
- `hs_total_beds_commercial_acute` - Total bed count

### Sepsis Metrics
- `sepsis_appropriate_care_n/percent/percentile` - Appropriate care metrics
- `sepsis_lactate_result_n/percent/percentile` - Lactate testing metrics
- `sepsis_antibiotic_n/percent/percentile` - Antibiotic timing metrics

### Contact Data
- `full_name` - Contact name
- `title` - Job title
- `email` - Email address
- `phone` - Phone number
- `linkedin` - LinkedIn profile URL

### News & Hooks
- `news` - Organization news
- `organization_news_hook` - Conversation starter based on org news
- `in_the_news_recent` - Recent contact news
- `in_the_news_long_term` - Background contact information
- `person_news_hook` - Contact news conversation starter
- `person_background_hook` - Contact background conversation starter

## Setup Requirements

1. **Firebase Configuration**: Ensure proper Firebase project setup with authentication and database access
2. **Folder Permissions**: Configure `medbeacon` folder permissions in Firestore
3. **Image Assets**: Add MedBeacon logo and related images to `/images/medbeacon/` directory
4. **Domain Access**: Configure allowed domains for folder access in Firebase

## File Structure
```
medbeacon/
├── hotsheetpage.html     # Main sepsis dashboard
├── message-builder.html  # Message template builder
├── analytics.html        # Analytics dashboard
├── header.html          # Navigation header component
├── README.md           # This documentation
```

## Navigation
The system includes a unified navigation header that allows users to switch between:
- Sepsis Hotsheet (main dashboard)
- Analytics (performance tracking)
- Message Builder (template creation)

## Security
- Authentication required for all pages
- Domain-based access control
- Secure Firebase integration
- User session management

## Development Notes
- Built on Firebase Realtime Database
- Responsive design for desktop and mobile
- Modern CSS with CSS variables for theming
- Modular JavaScript architecture
- Font Awesome icons for UI elements
