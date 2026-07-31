# Outreach System Database Schema Documentation

## Table of Contents
1. [Overview](#overview)
2. [Database Architecture](#database-architecture)
3. [Primary Collections](#primary-collections)
4. [Supporting Collections](#supporting-collections)
5. [Relationships & References](#relationships--references)
6. [Indexes & Performance](#indexes--performance)
7. [Data Types & Validation](#data-types--validation)
8. [Sample Documents](#sample-documents)
9. [Migration Scripts](#migration-scripts)
10. [Backup & Recovery](#backup--recovery)

## Overview

The Outreach System uses Firebase Firestore as its primary database, with Firebase Realtime Database for legacy data imports. This document provides comprehensive schema documentation for all collections and their relationships.

**Database Type**: Firebase Firestore (NoSQL Document Database)  
**Backup Database**: Firebase Realtime Database (Legacy Data)  
**Total Collections**: 8 primary + 2 enhanced existing collections

## Database Architecture

### Collection Hierarchy
```
Firebase Firestore
├── outreach_sets (Primary tracking table)
├── campaigns (Campaign definitions)
├── bdr_leaders (BDR leader profiles)
├── linkedin_accounts (LinkedIn automation accounts)
├── phone_accounts (Phone outreach accounts)
├── slot_calendar (Scheduling management)
├── linkedin_research (Research queue)
├── customerList (Enhanced - customer management)
└── emailAccounts (Enhanced - email account management)

Firebase Realtime Database
└── HealthcareITDatabase (Legacy import source)
    ├── hl_index_25
    ├── hl_main_25
    └── hl_crm_input_25
```

### Data Flow
```
CSV/Firebase Import → outreach_sets → linkedin_research → review/approval → slot_calendar → execution
```

## Primary Collections

### 1. outreach_sets

**Description**: Primary collection tracking every prospect contact through the entire outreach lifecycle.

**Document ID**: Auto-generated Firestore ID  
**Collection Size**: High volume (10K+ documents expected)

#### Schema
```typescript
interface OutreachSet {
  // Organizational Fields
  customerId: string;              // Reference to customerList doc
  accountId?: string;              // Assigned at scheduling - email/linkedin/phone account
  bdrLeaderId?: string;            // Assigned at scheduling - BDR leader reference
  campaignId: string;              // Reference to campaigns doc
  iterationId: string;             // Specific campaign iteration
  
  // Prospect Information
  prospectOrgId: string;           // Organization identifier (generated or imported)
  prospectOrgName: string;         // Organization name for display
  prospectContactId: string;       // Unique contact ID (usually email-based)
  email: string;                   // Primary email address (required)
  phone?: string;                  // Phone number (E.164 format preferred)
  linkedInUrl?: string;            // LinkedIn profile URL
  firstName: string;               // Contact first name (required)
  lastName: string;                // Contact last name (required)
  title?: string;                  // Job title
  jobLevel?: JobLevel;             // Enum: see data types section
  jobArea?: JobArea;               // Enum: see data types section
  
  // Personalization Fields
  personalization?: string;        // Personalized message (1-200 chars)
  personalizationSubject?: string; // Personalized email subject (5-60 chars)
  personalizationBackground?: string; // Research notes/context (up to 1000 chars)
  
  // Dynamic Custom Fields
  customFields: Record<string, any>; // Campaign-specific fields
  
  // Status Fields
  isResearched: boolean;           // Has personalization data
  approvalStatus: ApprovalStatus;  // Enum: see data types section
  isScheduled: boolean;            // In scheduling queues
  
  // Scheduling References
  emailSlotIds: string[];          // Array of assigned email slot IDs
  linkedInSlotIds: string[];       // Array of assigned LinkedIn slot IDs
  phoneSlotIds: string[];          // Array of assigned phone slot IDs
  
  // Activity Dates
  emailDates: Date[];              // Scheduled email timestamps
  linkedInDates: Date[];           // Scheduled LinkedIn timestamps
  phoneDates: Date[];              // Scheduled phone timestamps
  
  // Outcome Tracking
  outcomeStatus?: OutcomeType;     // Final result enum
  outcomeDate?: Date;              // When outcome was recorded
  outcomeNotes?: string;           // Additional outcome context
  
  // Import Metadata
  importSource?: string;           // "csv" | "firebase" | "manual"
  importDate?: Date;               // When record was imported
  importBatch?: string;            // Batch identifier for bulk imports
  
  // Audit Fields
  createdAt: Date;                 // Document creation timestamp
  updatedAt: Date;                 // Last modification timestamp
  createdBy: string;               // User ID who created
  lastModifiedBy: string;          // User ID who last modified
}
```

#### Indexes Required
```javascript
// Composite indexes for common queries
customerId, campaignId, approvalStatus
customerId, isScheduled, outcomeStatus
customerId, isResearched, approvalStatus
prospectOrgId, email // For duplicate detection
createdAt // For chronological sorting
```

#### Sample Document
```json
{
  "customerId": "cust_internal_001",
  "campaignId": "camp_healthcare_q1_2024",
  "iterationId": "iter_a_test_70percent",
  "prospectOrgId": "org_example_corp",
  "prospectOrgName": "Example Healthcare Corp",
  "prospectContactId": "john.doe@example.com",
  "email": "john.doe@example.com",
  "phone": "+1-555-0123",
  "linkedInUrl": "https://linkedin.com/in/johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "title": "Chief Technology Officer",
  "jobLevel": "C-Suite",
  "jobArea": "IT",
  "personalization": "I saw your recent post about AI in healthcare - fascinating insights on implementation challenges.",
  "personalizationSubject": "AI Healthcare Implementation - Thoughts on Your Recent Post",
  "personalizationBackground": "Posted 3 days ago about implementing AI diagnostic tools at Example Healthcare Corp. Mentioned challenges with data integration and staff training. Company recently received $50M funding for digital transformation.",
  "customFields": {
    "companySize": "500-1000",
    "industry": "Healthcare",
    "budget": "High",
    "timeframe": "Q1 2024"
  },
  "isResearched": true,
  "approvalStatus": "approved",
  "isScheduled": true,
  "emailSlotIds": ["slot_email_20240115_1000", "slot_email_20240118_1400"],
  "linkedInSlotIds": ["slot_linkedin_20240116_0900"],
  "phoneSlotIds": [],
  "emailDates": [
    "2024-01-15T10:00:00.000Z",
    "2024-01-18T14:00:00.000Z"
  ],
  "linkedInDates": [
    "2024-01-16T09:00:00.000Z"
  ],
  "phoneDates": [],
  "importSource": "csv",
  "importDate": "2024-01-10T08:00:00.000Z",
  "importBatch": "batch_healthcare_q1_001",
  "createdAt": "2024-01-10T08:00:00.000Z",
  "updatedAt": "2024-01-14T15:30:00.000Z",
  "createdBy": "user_admin_001",
  "lastModifiedBy": "user_bdr_001"
}
```

### 2. campaigns

**Description**: Campaign templates and configuration for multi-channel outreach sequences.

**Document ID**: Auto-generated with prefix 'camp_'  
**Collection Size**: Medium volume (100-1000 documents expected)

#### Schema
```typescript
interface Campaign {
  campaignId: string;              // Document ID
  customerId: string;              // Customer this campaign belongs to
  name: string;                    // Display name (1-100 chars)
  description?: string;            // Campaign description (up to 500 chars)
  status: CampaignStatus;          // Enum: active, paused, completed, draft
  priority: Priority;              // Enum: high, medium, low
  
  // Custom Field Requirements
  requiredCustomFields: CustomField[]; // Array of required custom fields
  
  // Channel Configuration
  channels: {
    email: {
      enabled: boolean;
      templates: string[];          // Message template IDs
      sequence: ChannelSequence;    // Timing and flow configuration
    };
    linkedin: {
      enabled: boolean;
      activities: LinkedInActivity[]; // Activity types allowed
      sequence: ChannelSequence;
    };
    phone: {
      enabled: boolean;
      scripts: string[];            // Call script IDs
      sequence: ChannelSequence;
    };
  };
  
  // A/B Testing Configuration
  iterations: CampaignIteration[];  // Array of campaign variations
  
  // Performance Tracking
  stats?: {
    totalContacts: number;
    contactsScheduled: number;
    contactsCompleted: number;
    conversionRate: number;
  };
  
  // Template Configuration (if this is a template)
  isTemplate: boolean;             // Whether this is a reusable template
  templateCategory?: string;       // Template category for organization
  
  // Audit Fields
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
}
```

#### Supporting Interfaces
```typescript
interface CustomField {
  fieldName: string;               // Field identifier
  fieldType: 'text' | 'number' | 'date' | 'select'; // Data type
  fieldOptions?: string[];         // Options for select fields
  isRequired: boolean;             // Whether field is mandatory
  defaultValue?: any;              // Default value if not provided
  description?: string;            // Help text for users
}

interface ChannelSequence {
  steps: SequenceStep[];           // Ordered array of outreach steps
  timing: SequenceTiming;          // Overall timing configuration
}

interface SequenceStep {
  stepId: string;                  // Unique step identifier
  day: number;                     // Day in sequence (1-based)
  activityType: string;            // Type of activity
  templateId?: string;             // Message template
  conditions?: StepCondition[];    // Conditional execution rules
}

interface CampaignIteration {
  iterationId: string;             // Unique iteration identifier
  name: string;                    // Display name for iteration
  description?: string;            // What makes this iteration different
  trafficPercentage: number;       // Percentage of contacts for this iteration
  isControl: boolean;              // Whether this is the control group
  variations: Record<string, any>; // Iteration-specific configurations
}
```

#### Sample Document
```json
{
  "campaignId": "camp_healthcare_q1_2024",
  "customerId": "cust_internal_001",
  "name": "Healthcare IT Decision Makers Q1 2024",
  "description": "Multi-touch outreach campaign targeting healthcare IT executives for digital transformation solutions",
  "status": "active",
  "priority": "high",
  "requiredCustomFields": [
    {
      "fieldName": "companySize",
      "fieldType": "select",
      "fieldOptions": ["1-50", "51-200", "201-500", "500-1000", "1000+"],
      "isRequired": true,
      "description": "Number of employees at target organization"
    },
    {
      "fieldName": "budget",
      "fieldType": "select",
      "fieldOptions": ["Low", "Medium", "High", "Enterprise"],
      "isRequired": true,
      "description": "Estimated budget tier for digital transformation"
    },
    {
      "fieldName": "timeframe",
      "fieldType": "text",
      "isRequired": false,
      "defaultValue": "Q1 2024",
      "description": "Expected implementation timeframe"
    }
  ],
  "channels": {
    "email": {
      "enabled": true,
      "templates": ["healthcare_intro", "healthcare_followup_1", "healthcare_followup_2"],
      "sequence": {
        "steps": [
          {
            "stepId": "email_intro",
            "day": 1,
            "activityType": "email_first",
            "templateId": "healthcare_intro"
          },
          {
            "stepId": "email_follow1",
            "day": 4,
            "activityType": "email_followup",
            "templateId": "healthcare_followup_1"
          },
          {
            "stepId": "email_follow2",
            "day": 8,
            "activityType": "email_followup",
            "templateId": "healthcare_followup_2"
          }
        ]
      }
    },
    "linkedin": {
      "enabled": true,
      "activities": ["profile_view", "connect", "message"],
      "sequence": {
        "steps": [
          {
            "stepId": "li_view",
            "day": 1,
            "activityType": "profile_view"
          },
          {
            "stepId": "li_connect",
            "day": 3,
            "activityType": "connect"
          },
          {
            "stepId": "li_message",
            "day": 6,
            "activityType": "message"
          }
        ]
      }
    },
    "phone": {
      "enabled": false,
      "scripts": [],
      "sequence": {
        "steps": []
      }
    }
  },
  "iterations": [
    {
      "iterationId": "iter_a_control",
      "name": "Control Group - Standard Approach",
      "description": "Standard messaging and timing",
      "trafficPercentage": 50,
      "isControl": true,
      "variations": {}
    },
    {
      "iterationId": "iter_b_aggressive",
      "name": "Test - Aggressive Timeline",
      "description": "Compressed timeline with more touchpoints",
      "trafficPercentage": 50,
      "isControl": false,
      "variations": {
        "emailTiming": [1, 3, 5, 8],
        "additionalTouchpoints": true
      }
    }
  ],
  "isTemplate": false,
  "createdAt": "2024-01-05T10:00:00.000Z",
  "updatedAt": "2024-01-12T14:30:00.000Z",
  "createdBy": "user_manager_001",
  "lastModifiedBy": "user_manager_001"
}
```

### 3. bdr_leaders

**Description**: BDR (Business Development Representative) leader profiles and their account associations.

**Document ID**: Auto-generated with prefix 'bdr_'  
**Collection Size**: Small volume (10-100 documents expected)

#### Schema
```typescript
interface BDRLeader {
  bdrLeaderId: string;             // Document ID
  customerId: string;              // Customer this BDR belongs to
  name: string;                    // Full name (required)
  primaryEmail: string;            // Primary email address
  primaryPhone?: string;           // Primary phone number (E.164 format)
  
  // Account Associations
  emailAccountIds: string[];       // Array of associated email account IDs
  phoneNumbers: string[];          // Array of phone numbers assigned
  linkedInAccountId?: string;      // Single LinkedIn account (typically one per BDR)
  
  // Activity Limits
  limits: {
    emailsPerDay: number;          // Daily email sending limit (default: 60)
    linkedInConnectionsPerDay: number; // LinkedIn connections per day (default: 20)
    linkedInMessagesPerDay: number;    // LinkedIn messages per day (default: 30)
    callsPerDay: number;           // Phone calls per day (default: 25)
  };
  
  // Performance Tracking
  stats?: {
    emailsSentToday: number;
    connectionsToday: number;
    messagesToday: number;
    callsToday: number;
    lastActivityDate: Date;
  };
  
  // Configuration
  workingHours: {
    timezone: string;              // IANA timezone string
    startTime: string;             // HH:MM format
    endTime: string;               // HH:MM format
    workingDays: number[];         // 0=Sunday, 1=Monday, etc.
  };
  
  // Status
  status: 'active' | 'inactive' | 'vacation';
  notes?: string;                  // Internal notes about BDR
  
  // Audit Fields
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
}
```

#### Sample Document
```json
{
  "bdrLeaderId": "bdr_john_smith_001",
  "customerId": "cust_internal_001",
  "name": "John Smith",
  "primaryEmail": "john.smith@company.com",
  "primaryPhone": "+1-555-0100",
  "emailAccountIds": [
    "email_john_primary",
    "email_john_followup"
  ],
  "phoneNumbers": ["+1-555-0100", "+1-555-0101"],
  "linkedInAccountId": "li_acc_john_smith",
  "limits": {
    "emailsPerDay": 60,
    "linkedInConnectionsPerDay": 20,
    "linkedInMessagesPerDay": 30,
    "callsPerDay": 25
  },
  "stats": {
    "emailsSentToday": 15,
    "connectionsToday": 5,
    "messagesToday": 8,
    "callsToday": 3,
    "lastActivityDate": "2024-01-15T16:30:00.000Z"
  },
  "workingHours": {
    "timezone": "America/New_York",
    "startTime": "09:00",
    "endTime": "17:00",
    "workingDays": [1, 2, 3, 4, 5]
  },
  "status": "active",
  "notes": "Specializes in healthcare IT outreach. Strong LinkedIn presence.",
  "createdAt": "2024-01-01T10:00:00.000Z",
  "updatedAt": "2024-01-15T16:30:00.000Z",
  "createdBy": "user_admin_001",
  "lastModifiedBy": "user_admin_001"
}
```

### 4. slot_calendar

**Description**: Time slot management for coordinated multi-channel outreach scheduling.

**Document ID**: Auto-generated with semantic naming pattern  
**Collection Size**: High volume (50K+ documents expected)

#### Schema
```typescript
interface Slot {
  slotId: string;                  // Document ID - semantic naming
  accountId: string;               // Email/LinkedIn/Phone account ID
  accountType: 'email' | 'linkedin' | 'phone';
  customerId: string;              // Customer isolation
  bdrLeaderId: string;             // BDR leader this slot belongs to
  
  // Timing Configuration
  scheduledTime: Date;             // Exact timestamp for this slot
  dayOfWeek: string;               // Monday, Tuesday, etc.
  hour: number;                    // Hour in 24h format (0-23)
  minute: number;                  // Minute (0, 15, 30, 45 typically)
  
  // Calendar Management
  isWorkday: boolean;              // Whether this is a working day
  isHoliday: boolean;              // Whether this is a holiday
  holidayName?: string;            // Name of holiday if applicable
  
  // Slot Assignment
  status: 'available' | 'assigned' | 'completed' | 'failed' | 'cancelled';
  assignedToOutreachSetId?: string; // Outreach set using this slot
  activityType?: ActivityType;     // Type of activity scheduled
  
  // Execution Tracking
  executedAt?: Date;               // When activity was executed
  result?: SlotResult;             // Execution outcome
  notes?: string;                  // Execution notes or error details
  
  // Generation Metadata
  generatedAt: Date;               // When slot was created
  generationBatch?: string;        // Batch ID for bulk generation
  
  // Audit Fields
  createdAt: Date;
  updatedAt: Date;
  assignedBy?: string;             // User who assigned this slot
}
```

#### Supporting Types
```typescript
type ActivityType = 
  | 'email_first'
  | 'email_followup'
  | 'linkedin_connect'
  | 'linkedin_message'
  | 'linkedin_profile_view'
  | 'linkedin_post_like'
  | 'linkedin_post_comment'
  | 'phone_call'
  | 'phone_voicemail';

type SlotResult = 
  | 'success'
  | 'failed'
  | 'rate_limited'
  | 'account_error'
  | 'network_error'
  | 'cancelled';
```

#### Slot ID Naming Convention
```
Format: slot_{accountType}_{YYYYMMDD}_{HHMM}_{accountId}

Examples:
- slot_email_20240115_1000_email_john_primary
- slot_linkedin_20240115_0930_li_acc_john_smith
- slot_phone_20240115_1400_phone_555_0100
```

#### Sample Document
```json
{
  "slotId": "slot_email_20240115_1000_email_john_primary",
  "accountId": "email_john_primary",
  "accountType": "email",
  "customerId": "cust_internal_001",
  "bdrLeaderId": "bdr_john_smith_001",
  "scheduledTime": "2024-01-15T10:00:00.000Z",
  "dayOfWeek": "Monday",
  "hour": 10,
  "minute": 0,
  "isWorkday": true,
  "isHoliday": false,
  "status": "assigned",
  "assignedToOutreachSetId": "outreach_set_12345",
  "activityType": "email_first",
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "generationBatch": "batch_january_2024_email_slots",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-14T15:00:00.000Z",
  "assignedBy": "user_admin_001"
}
```

### 5. linkedin_research

**Description**: Queue management for LinkedIn profile research and personalization data collection.

**Document ID**: Auto-generated with prefix 'research_'  
**Collection Size**: Medium volume (5K-50K documents expected)

#### Schema
```typescript
interface LinkedInResearch {
  researchId: string;              // Document ID
  outreachSetId: string;           // Reference to outreach_sets document
  customerId: string;              // Customer isolation
  linkedInUrl: string;             // LinkedIn profile URL to research
  
  // Assignment Information
  assignedAccountId?: string;      // LinkedIn account assigned to do research
  assignedAt?: Date;               // When research was assigned
  priority: 'high' | 'medium' | 'low'; // Research priority
  
  // Status Tracking
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  statusUpdatedAt: Date;           // Last status change
  
  // Research Results
  recentPosts?: LinkedInPost[];    // Array of recent posts found
  profileData?: LinkedInProfile;   // Profile information extracted
  companyInfo?: CompanyInfo;       // Company information if available
  
  // Processing Information
  phantomBusterTaskId?: string;    // PhantomBuster task ID
  processingStarted?: Date;        // When processing began
  processingCompleted?: Date;      // When processing finished
  processingDuration?: number;     // Processing time in seconds
  
  // Error Handling
  errorMessage?: string;           // Error details if failed
  retryCount: number;              // Number of retry attempts
  maxRetries: number;              // Maximum retries allowed (default: 3)
  
  // Research Quality
  personalizationGenerated: boolean; // Whether personalization was extracted
  qualityScore?: number;           // Research quality (1-5)
  
  // Audit Fields
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
}
```

#### Supporting Interfaces
```typescript
interface LinkedInPost {
  postId?: string;                 // LinkedIn post ID if available
  postUrl?: string;                // Direct link to post
  content: string;                 // Post text content
  publishedDate: Date;             // When post was published
  engagement?: {
    likes: number;
    comments: number;
    shares: number;
  };
  mediaType?: 'text' | 'image' | 'video' | 'article';
  tags?: string[];                 // Extracted hashtags or topics
}

interface LinkedInProfile {
  name: string;                    // Full name
  title: string;                   // Current job title
  company: string;                 // Current company
  location?: string;               // Geographic location
  connectionCount?: number;        // Number of connections
  followerCount?: number;          // Number of followers
  aboutSection?: string;           // About/summary section
  skills?: string[];               // Skills listed
  recentActivity?: string;         // Summary of recent activity
}

interface CompanyInfo {
  name: string;                    // Company name
  industry?: string;               // Industry classification
  size?: string;                   // Company size range
  website?: string;                // Company website
  recentNews?: string[];           // Recent company news/updates
}
```

#### Sample Document
```json
{
  "researchId": "research_john_doe_20240115",
  "outreachSetId": "outreach_set_12345",
  "customerId": "cust_internal_001",
  "linkedInUrl": "https://linkedin.com/in/johndoe",
  "assignedAccountId": "li_acc_john_smith",
  "assignedAt": "2024-01-15T08:00:00.000Z",
  "priority": "high",
  "status": "completed",
  "statusUpdatedAt": "2024-01-15T08:15:00.000Z",
  "recentPosts": [
    {
      "postUrl": "https://linkedin.com/posts/johndoe_healthcare-ai-implementation",
      "content": "Excited to share insights from our recent AI implementation in healthcare diagnostics. The challenges were significant, but the results speak for themselves - 40% improvement in diagnostic accuracy and 25% reduction in processing time.",
      "publishedDate": "2024-01-12T14:30:00.000Z",
      "engagement": {
        "likes": 45,
        "comments": 8,
        "shares": 12
      },
      "mediaType": "text",
      "tags": ["#healthcare", "#ai", "#diagnostics", "#implementation"]
    }
  ],
  "profileData": {
    "name": "John Doe",
    "title": "Chief Technology Officer",
    "company": "Example Healthcare Corp",
    "location": "New York, NY",
    "connectionCount": 1250,
    "aboutSection": "Healthcare technology executive with 15 years of experience leading digital transformation initiatives.",
    "skills": ["Healthcare Technology", "Digital Transformation", "AI Implementation", "Strategic Planning"]
  },
  "companyInfo": {
    "name": "Example Healthcare Corp",
    "industry": "Healthcare Technology",
    "size": "500-1000 employees",
    "website": "https://example-healthcare.com",
    "recentNews": ["Raised $50M Series C funding", "Expanded to 3 new markets"]
  },
  "phantomBusterTaskId": "pb_task_67890",
  "processingStarted": "2024-01-15T08:05:00.000Z",
  "processingCompleted": "2024-01-15T08:12:00.000Z",
  "processingDuration": 420,
  "retryCount": 0,
  "maxRetries": 3,
  "personalizationGenerated": true,
  "qualityScore": 4,
  "createdAt": "2024-01-15T08:00:00.000Z",
  "updatedAt": "2024-01-15T08:15:00.000Z",
  "createdBy": "user_admin_001",
  "lastModifiedBy": "system_research_processor"
}
```

## Supporting Collections

### 6. linkedin_accounts (New)

**Description**: LinkedIn automation accounts with cookie management and activity tracking.

#### Schema
```typescript
interface LinkedInAccount {
  accountId: string;               // Document ID
  customerId: string;              // Customer this account belongs to
  bdrLeaderId: string;             // Associated BDR leader
  accountName: string;             // Display name/identifier
  
  // PhantomBuster Integration
  phantomBusterCookie: string;     // Encrypted session cookie
  phantomBusterUserId?: string;    // PhantomBuster user ID if available
  cookieLastValidated: Date;       // Last validation attempt
  cookieStatus: 'valid' | 'expired' | 'unknown'; // Current status
  cookieExpiresAt?: Date;          // Estimated expiration time
  
  // Activity Limits
  connectionsPerDay: number;       // Daily connection limit (default: 20)
  messagesPerDay: number;          // Daily message limit (default: 30)
  
  // Daily Usage Tracking
  dailyStats: {
    date: Date;                    // Stats for this date
    connectionsSent: number;       // Connections sent today
    messagesSent: number;          // Messages sent today
    profileViews: number;          // Profile views today
    postsLiked: number;            // Posts liked today
    comments: number;              // Comments made today
  }[];
  
  // Account Status
  status: 'active' | 'inactive' | 'suspended' | 'rate_limited';
  suspensionReason?: string;       // Why account is suspended
  rateLimitUntil?: Date;          // When rate limit expires
  
  // Profile Information
  profileUrl?: string;             // LinkedIn profile URL
  profileName?: string;            // Name on LinkedIn profile
  profileTitle?: string;           // Title on LinkedIn profile
  
  // Error Tracking
  lastError?: string;              // Last error encountered
  consecutiveErrors: number;       // Error count for monitoring
  
  // Audit Fields
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
}
```

### 7. phone_accounts (New)

**Description**: Phone numbers and calling account configuration.

#### Schema
```typescript
interface PhoneAccount {
  accountId: string;               // Document ID
  customerId: string;              // Customer this account belongs to
  bdrLeaderId: string;             // Associated BDR leader
  phoneNumber: string;             // Phone number (E.164 format)
  provider: 'twilio' | 'vonage' | 'ringcentral' | 'custom';
  
  // Provider Configuration
  providerConfig: {
    accountSid?: string;           // Provider account ID
    authToken?: string;            // Encrypted auth token
    apiEndpoint?: string;          // Custom API endpoint
    additionalConfig?: Record<string, any>; // Provider-specific config
  };
  
  // Call Configuration
  callsPerDay: number;             // Daily call limit
  workingHours: {
    startTime: string;             // HH:MM format
    endTime: string;               // HH:MM format
    timezone: string;              // IANA timezone
  };
  
  // Call Statistics
  dailyStats: {
    date: Date;
    callsAttempted: number;
    callsCompleted: number;
    callsAnswered: number;
    totalTalkTime: number;         // Seconds of talk time
    voicemails: number;
  }[];
  
  // Status and Health
  status: 'active' | 'inactive' | 'suspended';
  lastCallAt?: Date;               // Last outbound call timestamp
  
  // Audit Fields
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
}
```

## Enhanced Existing Collections

### customerList (Enhanced)

**Description**: Enhanced customer management with outreach system integration.

#### New Fields Added
```typescript
// Added to existing customerList documents
interface CustomerListEnhancement {
  // Outreach Configuration
  outreachSettings: {
    enableEmail: boolean;          // Email outreach enabled
    enableLinkedIn: boolean;       // LinkedIn outreach enabled
    enablePhone: boolean;          // Phone outreach enabled
    globalBccEmails: string[];     // BCC emails for all outreach
  };
  
  // Default Limits
  defaultLimits: {
    emailsPerDay: number;          // Default email limit for new BDRs
    connectionsPerDay: number;     // Default LinkedIn connections
    messagesPerDay: number;        // Default LinkedIn messages
    callsPerDay: number;           // Default phone calls
  };
  
  // Statistics
  outreachStats?: {
    totalContacts: number;
    activeContacts: number;
    completedContacts: number;
    conversionRate: number;
    lastUpdated: Date;
  };
}
```

### emailAccounts (Enhanced)

**Description**: Enhanced email account management with BDR assignment and rate limiting.

#### New Fields Added
```typescript
// Added to existing emailAccounts documents
interface EmailAccountEnhancement {
  // BDR Assignment
  bdrLeaderId?: string;            // Associated BDR leader
  customerId?: string;             // Customer isolation (if not already present)
  
  // Rate Limiting
  dailyLimit: number;              // Daily email sending limit (default: 60)
  bccEmails: string[];             // BCC recipients for monitoring
  
  // Usage Tracking
  dailyStats?: {
    date: Date;
    emailsSent: number;
    emailsDelivered: number;
    emailsOpened: number;
    emailsClicked: number;
    emailsBounced: number;
    emailsComplained: number;
  }[];
  
  // Status Enhancement
  outreachEnabled: boolean;        // Whether account is enabled for outreach system
  
  // Backward compatibility note: All existing fields preserved
}
```

## Relationships & References

### Primary Relationships
```
customerList (1) ←→ (N) outreach_sets
customerList (1) ←→ (N) campaigns  
customerList (1) ←→ (N) bdr_leaders
customerList (1) ←→ (N) linkedin_accounts
customerList (1) ←→ (N) phone_accounts

campaigns (1) ←→ (N) outreach_sets
bdr_leaders (1) ←→ (N) outreach_sets (at scheduling time)
bdr_leaders (1) ←→ (N) linkedin_accounts
bdr_leaders (1) ←→ (N) phone_accounts
bdr_leaders (1) ←→ (N) emailAccounts

outreach_sets (1) ←→ (N) linkedin_research
outreach_sets (1) ←→ (N) slot_calendar (via slot assignment)

slot_calendar (1) ←→ (1) emailAccounts|linkedin_accounts|phone_accounts
```

### Reference Validation Rules
```typescript
// Firestore Security Rules for reference validation
match /outreach_sets/{outreachSetId} {
  allow write: if 
    // Customer must exist
    exists(/databases/$(database)/documents/customerList/$(resource.data.customerId)) &&
    // Campaign must exist and belong to same customer
    exists(/databases/$(database)/documents/campaigns/$(resource.data.campaignId)) &&
    get(/databases/$(database)/documents/campaigns/$(resource.data.campaignId)).data.customerId == resource.data.customerId;
}
```

## Indexes & Performance

### Required Composite Indexes

#### outreach_sets Collection
```javascript
// High-priority indexes for common queries
[
  { fields: ['customerId', 'campaignId', 'approvalStatus'], orders: ['createdAt desc'] },
  { fields: ['customerId', 'isScheduled', 'outcomeStatus'], orders: ['updatedAt desc'] },
  { fields: ['customerId', 'isResearched', 'approvalStatus'], orders: ['createdAt desc'] },
  { fields: ['prospectOrgId', 'email'] }, // For duplicate detection
  { fields: ['customerId', 'bdrLeaderId'], orders: ['createdAt desc'] },
  { fields: ['campaignId', 'iterationId'], orders: ['createdAt desc'] }
]
```

#### slot_calendar Collection
```javascript
[
  { fields: ['customerId', 'accountType', 'status'], orders: ['scheduledTime asc'] },
  { fields: ['customerId', 'bdrLeaderId', 'status'], orders: ['scheduledTime asc'] },
  { fields: ['accountId', 'status'], orders: ['scheduledTime asc'] },
  { fields: ['status', 'scheduledTime'] }, // For available slot queries
  { fields: ['assignedToOutreachSetId'] } // For slot lookups
]
```

#### linkedin_research Collection
```javascript
[
  { fields: ['customerId', 'status'], orders: ['createdAt desc'] },
  { fields: ['assignedAccountId', 'status'], orders: ['assignedAt desc'] },
  { fields: ['status', 'priority'], orders: ['createdAt asc'] },
  { fields: ['outreachSetId'] } // For direct outreach set lookups
]
```

### Query Performance Guidelines

#### Efficient Query Patterns
```javascript
// ✅ Good - Uses indexes effectively
db.collection('outreach_sets')
  .where('customerId', '==', 'cust_123')
  .where('isResearched', '==', true)
  .where('approvalStatus', '==', 'approved')
  .orderBy('createdAt', 'desc')
  .limit(50);

// ❌ Avoid - Requires full collection scan
db.collection('outreach_sets')
  .where('firstName', '==', 'John')
  .where('lastName', '==', 'Doe');

// ✅ Better - Use single field with combined search
db.collection('outreach_sets')
  .where('prospectContactId', '==', 'john.doe@example.com');
```

#### Batch Operation Patterns
```javascript
// Efficient batch writes for imports
const batch = db.batch();
const chunks = chunkArray(contacts, 500); // Firestore limit

for (const chunk of chunks) {
  for (const contact of chunk) {
    const ref = db.collection('outreach_sets').doc();
    batch.set(ref, contact);
  }
  await batch.commit();
}
```

## Data Types & Validation

### Enum Definitions
```typescript
// Job Level Classification
enum JobLevel {
  'C-Suite' = 'C-Suite',           // CEO, CTO, CFO, etc.
  'VP' = 'VP',                     // Vice President level
  'Director' = 'Director',         // Director level
  'Manager' = 'Manager',           // Manager level
  'Individual Contributor' = 'Individual Contributor',
  'Other' = 'Other'
}

// Job Area Classification  
enum JobArea {
  'IT' = 'IT',                     // Information Technology
  'Operations' = 'Operations',     // Operations and Process
  'Marketing' = 'Marketing',       // Marketing and Communications
  'Sales' = 'Sales',               // Sales and Business Development
  'Finance' = 'Finance',           // Finance and Accounting
  'HR' = 'HR',                     // Human Resources
  'Clinical' = 'Clinical',         // Healthcare Clinical (domain-specific)
  'Other' = 'Other'
}

// Outcome Types
enum OutcomeType {
  'scheduled' = 'scheduled',       // Meeting booked
  'nibble' = 'nibble',             // Interested but no meeting
  'contact_reject' = 'contact_reject', // Individual rejection
  'org_reject' = 'org_reject',     // Organization-wide rejection
  'contact_left' = 'contact_left', // No longer at organization
  'bad_contact' = 'bad_contact',   // Wrong person for campaign
  'bad_phone' = 'bad_phone',       // Invalid phone number
  'bad_email' = 'bad_email',       // Invalid email address
  'bad_linkedin' = 'bad_linkedin'  // Invalid LinkedIn profile
}

// Approval Status
enum ApprovalStatus {
  'not_reviewed' = 'not_reviewed', // Default state
  'approved' = 'approved',         // Ready for scheduling
  'reviewed_not_approved' = 'reviewed_not_approved' // Needs improvement
}
```

### Field Validation Rules
```typescript
// Validation patterns for common fields
const ValidationRules = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+[1-9]\d{1,14}$/,      // E.164 format
  linkedInUrl: /^https:\/\/(www\.)?linkedin\.com\/in\/[\w\-]+\/?$/,
  
  // Character limits
  personalization: { min: 1, max: 200 },
  personalizationSubject: { min: 5, max: 60 },
  personalizationBackground: { min: 0, max: 1000 },
  
  // Required fields for outreach_sets
  required: ['customerId', 'campaignId', 'iterationId', 'email', 'firstName', 'lastName']
};
```

### Data Sanitization
```typescript
// Data cleaning functions
function sanitizeOutreachSet(data: any): OutreachSet {
  return {
    ...data,
    email: data.email?.toLowerCase().trim(),
    firstName: data.firstName?.trim(),
    lastName: data.lastName?.trim(),
    phone: data.phone ? formatPhoneNumber(data.phone) : undefined,
    linkedInUrl: data.linkedInUrl ? normalizeLinkedInUrl(data.linkedInUrl) : undefined,
    prospectOrgName: data.prospectOrgName?.trim(),
    customFields: sanitizeCustomFields(data.customFields || {}),
    isResearched: Boolean(data.isResearched),
    approvalStatus: data.approvalStatus || 'not_reviewed',
    isScheduled: Boolean(data.isScheduled)
  };
}
```

## Sample Documents

### Complete Outreach Workflow Example

#### 1. Initial Import Document
```json
{
  "customerId": "cust_internal_001",
  "campaignId": "camp_healthcare_q1_2024",
  "iterationId": "iter_a_control",
  "prospectOrgId": "org_example_healthcare",
  "prospectOrgName": "Example Healthcare Corp",
  "prospectContactId": "sarah.johnson@example-healthcare.com",
  "email": "sarah.johnson@example-healthcare.com",
  "linkedInUrl": "https://linkedin.com/in/sarahjohnson",
  "firstName": "Sarah",
  "lastName": "Johnson",
  "title": "VP of Information Technology",
  "jobLevel": "VP",
  "jobArea": "IT",
  "customFields": {
    "companySize": "500-1000",
    "industry": "Healthcare",
    "budget": "High",
    "timeframe": "Q2 2024"
  },
  "isResearched": false,
  "approvalStatus": "not_reviewed",
  "isScheduled": false,
  "emailSlotIds": [],
  "linkedInSlotIds": [],
  "phoneSlotIds": [],
  "emailDates": [],
  "linkedInDates": [],
  "phoneDates": [],
  "importSource": "csv",
  "importDate": "2024-01-15T10:00:00.000Z",
  "importBatch": "batch_healthcare_q1_002",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z",
  "createdBy": "user_admin_001",
  "lastModifiedBy": "user_admin_001"
}
```

#### 2. After Research & Approval
```json
{
  // ... all fields from above, plus:
  "personalization": "I noticed your recent LinkedIn post about implementing AI-driven patient monitoring systems - the scalability challenges you mentioned resonate with what we're seeing across healthcare IT.",
  "personalizationSubject": "AI Patient Monitoring Implementation - Your Recent Insights",
  "personalizationBackground": "Posted 5 days ago about implementing AI patient monitoring at Example Healthcare Corp. Discussed scalability challenges with 1000+ bed capacity and integration with existing EHR systems. Company recently completed $75M expansion.",
  "isResearched": true,
  "approvalStatus": "approved",
  "updatedAt": "2024-01-16T14:30:00.000Z",
  "lastModifiedBy": "user_reviewer_001"
}
```

#### 3. After Scheduling
```json
{
  // ... all fields from above, plus:
  "accountId": "email_john_primary",
  "bdrLeaderId": "bdr_john_smith_001",
  "isScheduled": true,
  "emailSlotIds": [
    "slot_email_20240118_1000_email_john_primary",
    "slot_email_20240122_1400_email_john_primary"
  ],
  "linkedInSlotIds": [
    "slot_linkedin_20240119_0930_li_acc_john_smith"
  ],
  "emailDates": [
    "2024-01-18T10:00:00.000Z",
    "2024-01-22T14:00:00.000Z"
  ],
  "linkedInDates": [
    "2024-01-19T09:30:00.000Z"
  ],
  "updatedAt": "2024-01-17T16:00:00.000Z",
  "lastModifiedBy": "user_scheduler_001"
}
```

#### 4. After Successful Outcome
```json
{
  // ... all fields from above, plus:
  "outcomeStatus": "scheduled",
  "outcomeDate": "2024-01-25T11:30:00.000Z",
  "outcomeNotes": "Responded to second email. Scheduled 30-min discovery call for Jan 30th at 2 PM EST. High interest in AI monitoring solutions.",
  "updatedAt": "2024-01-25T11:30:00.000Z",
  "lastModifiedBy": "user_bdr_john_001"
}
```

## Migration Scripts

### Email Accounts Migration
```javascript
// Migrate existing emailAccounts to support outreach system
async function migrateEmailAccounts() {
  const accounts = await db.collection('emailAccounts').get();
  const batch = db.batch();
  
  accounts.forEach((doc) => {
    const data = doc.data();
    const updates = {
      bdrLeaderId: '', // Will be assigned manually
      dailyLimit: 60, // Default limit
      bccEmails: [], // Empty array
      outreachEnabled: true,
      updatedAt: new Date()
    };
    
    // Only add fields that don't exist
    Object.keys(updates).forEach(key => {
      if (data[key] === undefined) {
        batch.update(doc.ref, { [key]: updates[key] });
      }
    });
  });
  
  await batch.commit();
  console.log('Email accounts migration completed');
}
```

### Customer List Enhancement
```javascript
// Add outreach settings to existing customers
async function enhanceCustomerList() {
  const customers = await db.collection('customerList').get();
  const batch = db.batch();
  
  customers.forEach((doc) => {
    const data = doc.data();
    if (!data.outreachSettings) {
      batch.update(doc.ref, {
        outreachSettings: {
          enableEmail: true,
          enableLinkedIn: true,
          enablePhone: false,
          globalBccEmails: []
        },
        defaultLimits: {
          emailsPerDay: 60,
          connectionsPerDay: 20,
          messagesPerDay: 30,
          callsPerDay: 25
        },
        updatedAt: new Date()
      });
    }
  });
  
  await batch.commit();
  console.log('Customer list enhancement completed');
}
```

## Backup & Recovery

### Backup Strategy
```javascript
// Daily backup strategy for critical collections
const criticalCollections = [
  'outreach_sets',
  'campaigns',
  'bdr_leaders',
  'slot_calendar',
  'linkedin_research'
];

async function createDailyBackup() {
  const timestamp = new Date().toISOString().split('T')[0];
  
  for (const collection of criticalCollections) {
    const snapshot = await db.collection(collection).get();
    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Export to Cloud Storage or external backup service
    await exportToBackupStorage(`${collection}_${timestamp}.json`, docs);
  }
}
```

### Recovery Procedures
```javascript
// Recovery from backup
async function restoreFromBackup(collectionName, backupDate) {
  const backupData = await loadFromBackupStorage(`${collectionName}_${backupDate}.json`);
  let batch = db.batch();
  let ops = 0;
  for (const doc of backupData) {
    const ref = db.collection(collectionName).doc(doc.id);
    batch.set(ref, doc, { merge: false });
    ops++;
    if (ops % 500 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (ops % 500 !== 0) {
    await batch.commit();
  }
  console.log(`Restored ${backupData.length} documents to ${collectionName}`);
}
```

### Data Integrity Checks
```javascript
// Integrity validation script
async function validateDataIntegrity() {
  const results = {
    orphanedSlots: 0,
    missingCampaignReferences: 0,
    duplicateEmails: 0,
    invalidStatuses: 0
  };
  
  // Check for orphaned slots
  const slots = await db.collection('slot_calendar')
    .where('status', '==', 'assigned')
    .get();
    
  for (const slot of slots.docs) {
    const data = slot.data();
    if (data.assignedToOutreachSetId) {
      const outreachSet = await db.collection('outreach_sets')
        .doc(data.assignedToOutreachSetId)
        .get();
      if (!outreachSet.exists) {
        results.orphanedSlots++;
        console.warn(`Orphaned slot: ${slot.id}`);
      }
    }
  }
  
  // Check campaign references
  const outreachSets = await db.collection('outreach_sets').get();
  for (const doc of outreachSets.docs) {
    const data = doc.data();
    const campaign = await db.collection('campaigns').doc(data.campaignId).get();
    if (!campaign.exists) {
      results.missingCampaignReferences++;
      console.warn(`Missing campaign reference: ${doc.id} -> ${data.campaignId}`);
    }
  }
  
  return results;
}
```

---

**Last Updated**: August 2025  
**Schema Version**: 1.9.0  
**Status**: Draft

This documentation should be updated whenever database schema changes are made. All migrations should be tested in a staging environment before production deployment.
