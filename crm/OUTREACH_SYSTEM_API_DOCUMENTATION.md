# Outreach System API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Error Handling](#error-handling)
4. [Slot Management Endpoints](#slot-management-endpoints)
5. [LinkedIn Management Endpoints](#linkedin-management-endpoints)
6. [Outreach Management Endpoints](#outreach-management-endpoints)
7. [Research Processing Endpoints](#research-processing-endpoints)
8. [Analytics Endpoints](#analytics-endpoints)
9. [System Status Endpoints](#system-status-endpoints)
10. [Data Models](#data-models)
11. [Rate Limiting](#rate-limiting)
12. [Examples](#examples)

## Overview

The Outreach System API provides comprehensive endpoints for managing multi-channel outreach campaigns. All endpoints are hosted on the Railway backend server and integrate with Firebase Firestore for data persistence.

**Base URL**: `https://your-railway-app.railway.app`

## Authentication

All API endpoints require authentication using Firebase ID tokens.

**Headers Required:**
```
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

**Getting a Firebase ID Token:**
```javascript
// Frontend JavaScript
const user = firebase.auth().currentUser;
const idToken = await user.getIdToken();
```

## Error Handling

All endpoints return standardized error responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {},
    "timestamp": "2024-01-01T12:00:00.000Z",
    "requestId": "unique-request-id"
  }
}
```

**Common Error Codes:**
- `AUTHENTICATION_FAILED` - Invalid or expired token
- `PERMISSION_DENIED` - User lacks required permissions
- `INVALID_REQUEST` - Missing or invalid parameters
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_SERVER_ERROR` - Server-side error

## Slot Management Endpoints

### GET /slots/available

Retrieve available time slots for scheduling outreach activities.

**Parameters:**
```json
{
  "customerId": "string (required)",
  "accountType": "email|linkedin|phone (optional)",
  "accountId": "string (optional)",
  "startDate": "YYYY-MM-DD (optional)",
  "endDate": "YYYY-MM-DD (optional)",
  "limit": "number (default: 100)"
}
```

**Response:**
```json
{
  "slots": [
    {
      "slotId": "slot_123",
      "accountId": "acc_456",
      "accountType": "email",
      "customerId": "cust_789",
      "bdrLeaderId": "bdr_101",
      "scheduledTime": "2024-01-01T10:00:00.000Z",
      "dayOfWeek": "Monday",
      "isWorkday": true,
      "isHoliday": false,
      "status": "available"
    }
  ],
  "total": 50,
  "hasMore": true
}
```

### POST /slots/assign

Assign a time slot to an outreach set for scheduling.

**Request Body:**
```json
{
  "slotId": "string (required)",
  "outreachSetId": "string (required)",
  "activityType": "email_first|email_followup|linkedin_connect|linkedin_message|phone_call (required)"
}
```

**Response:**
```json
{
  "success": true,
  "slotId": "slot_123",
  "assignedAt": "2024-01-01T12:00:00.000Z",
  "activityType": "email_first"
}
```

### PUT /slots/release

Release a previously assigned slot back to available status.

**Request Body:**
```json
{
  "slotId": "string (required)",
  "reason": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "slotId": "slot_123",
  "releasedAt": "2024-01-01T12:00:00.000Z"
}
```

### GET /slots/calendar

Get calendar view of slots for visualization.

**Parameters:**
```json
{
  "customerId": "string (required)",
  "month": "YYYY-MM (required)",
  "accountType": "email|linkedin|phone (optional)"
}
```

**Response:**
```json
{
  "calendar": {
    "2024-01": [
      {
        "date": "2024-01-01",
        "slots": [
          {
            "slotId": "slot_123",
            "time": "10:00",
            "status": "available",
            "accountType": "email"
          }
        ]
      }
    ]
  },
  "summary": {
    "totalSlots": 150,
    "availableSlots": 120,
    "assignedSlots": 30
  }
}
```

### POST /slots/generate

Generate new slots for accounts that need them.

**Request Body:**
```json
{
  "customerId": "string (required)",
  "accountIds": ["string"] (optional - if empty, generates for all accounts),
  "startDate": "YYYY-MM-DD (required)",
  "endDate": "YYYY-MM-DD (required)"
}
```

**Response:**
```json
{
  "success": true,
  "generatedSlots": 200,
  "accounts": [
    {
      "accountId": "acc_456",
      "accountType": "email",
      "slotsGenerated": 50
    }
  ]
}
```

## LinkedIn Management Endpoints

### POST /linkedin/research

Queue LinkedIn profiles for research and personalization.

**Request Body:**
```json
{
  "outreachSetIds": ["string"] (required),
  "linkedinAccountId": "string (required)",
  "priority": "high|medium|low (default: medium)"
}
```

**Response:**
```json
{
  "success": true,
  "queuedItems": 10,
  "researchIds": [
    "research_123",
    "research_124"
  ]
}
```

### POST /linkedin/activity

Schedule LinkedIn activities (connections, messages, likes, comments).

**Request Body:**
```json
{
  "activityType": "connect|message|like|comment|profile_view (required)",
  "outreachSetId": "string (required)",
  "linkedinAccountId": "string (required)",
  "scheduledTime": "ISO8601 timestamp (required)",
  "message": "string (required for connect/message)",
  "postUrl": "string (required for like/comment)"
}
```

**Response:**
```json
{
  "success": true,
  "activityId": "activity_123",
  "scheduledFor": "2024-01-01T10:00:00.000Z",
  "phantomBusterTaskId": "pb_task_456"
}
```

### GET /linkedin/validate-cookie

Validate LinkedIn cookie for an account.

**Parameters:**
```json
{
  "linkedinAccountId": "string (required)"
}
```

**Response:**
```json
{
  "isValid": true,
  "lastValidated": "2024-01-01T10:00:00.000Z",
  "status": "valid|expired|unknown",
  "expiresAt": "2024-01-15T10:00:00.000Z"
}
```

### PUT /linkedin/update-cookie

Update LinkedIn cookie for an account.

**Request Body:**
```json
{
  "linkedinAccountId": "string (required)",
  "cookie": "string (required)",
  "phantomBusterUserId": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "validationResult": {
    "isValid": true,
    "validatedAt": "2024-01-01T10:00:00.000Z"
  }
}
```

## Outreach Management Endpoints

### POST /outreach/bulk-schedule

Schedule multiple outreach activities in bulk.

**Request Body:**
```json
{
  "outreachSets": [
    {
      "outreachSetId": "string",
      "campaignId": "string",
      "iterationId": "string",
      "bdrLeaderId": "string",
      "channels": {
        "email": {
          "enabled": true,
          "templates": ["template1", "template2"],
          "timing": [1, 3, 7] // days
        },
        "linkedin": {
          "enabled": true,
          "activities": ["connect", "message"],
          "timing": [2, 5]
        },
        "phone": {
          "enabled": false
        }
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "scheduled": [
    {
      "outreachSetId": "set_123",
      "activities": [
        {
          "activityType": "email_first",
          "slotId": "slot_456",
          "scheduledTime": "2024-01-01T10:00:00.000Z"
        }
      ]
    }
  ],
  "errors": []
}
```

### PUT /outreach/update-status

Update the outcome status of an outreach set.

**Request Body:**
```json
{
  "outreachSetId": "string (required)",
  "outcomeStatus": "scheduled|nibble|contact_reject|org_reject|contact_left|bad_contact|bad_phone|bad_email|bad_linkedin (required)",
  "outcomeNotes": "string (optional)",
  "pauseOrgOutreach": "boolean (default: false)"
}
```

**Response:**
```json
{
  "success": true,
  "outreachSetId": "set_123",
  "updatedStatus": "scheduled",
  "orgOutreachPaused": false,
  "affectedContacts": 0
}
```

### GET /outreach/queue-status

Get current status of outreach queues.

**Parameters:**
```json
{
  "customerId": "string (required)",
  "queueType": "email|linkedin|phone|all (default: all)"
}
```

**Response:**
```json
{
  "email": {
    "pending": 150,
    "scheduled": 45,
    "sending": 5,
    "completed": 200,
    "failed": 10
  },
  "linkedin": {
    "pending": 80,
    "scheduled": 25,
    "processing": 3,
    "completed": 120,
    "failed": 5
  },
  "phone": {
    "pending": 60,
    "scheduled": 15,
    "calling": 2,
    "completed": 75,
    "failed": 8
  }
}
```

## Research Processing Endpoints

### POST /research/process

Process LinkedIn research queue items.

**Request Body:**
```json
{
  "researchIds": ["string"] (optional - if empty, processes all pending),
  "linkedinAccountId": "string (optional - specific account)",
  "maxItems": "number (default: 10)"
}
```

**Response:**
```json
{
  "success": true,
  "processed": 8,
  "results": [
    {
      "researchId": "research_123",
      "outreachSetId": "set_456",
      "status": "completed",
      "personalizationFound": true,
      "recentPosts": 3
    }
  ],
  "errors": [
    {
      "researchId": "research_124",
      "error": "Profile private or not found"
    }
  ]
}
```

### GET /research/status

Get status of research queue and processing.

**Parameters:**
```json
{
  "customerId": "string (required)",
  "linkedinAccountId": "string (optional)"
}
```

**Response:**
```json
{
  "queue": {
    "pending": 25,
    "in_progress": 5,
    "completed": 150,
    "failed": 10
  },
  "accounts": [
    {
      "linkedinAccountId": "acc_123",
      "name": "John Doe",
      "queueItems": 8,
      "dailyLimit": 20,
      "usedToday": 5
    }
  ],
  "averageProcessingTime": "2.5 minutes"
}
```

## Analytics Endpoints

### GET /analytics/campaign

Get campaign performance analytics.

**Parameters:**
```json
{
  "customerId": "string (required)",
  "campaignId": "string (optional)",
  "startDate": "YYYY-MM-DD (optional)",
  "endDate": "YYYY-MM-DD (optional)",
  "groupBy": "day|week|month (default: day)"
}
```

**Response:**
```json
{
  "campaigns": [
    {
      "campaignId": "camp_123",
      "campaignName": "Healthcare IT Q1",
      "totalContacts": 500,
      "emailsSent": 450,
      "linkedinConnections": 300,
      "phoneCalls": 150,
      "outcomes": {
        "scheduled": 25,
        "nibbles": 45,
        "rejections": 80
      },
      "conversionRate": "5.0%"
    }
  ],
  "summary": {
    "totalCampaigns": 5,
    "totalContacts": 2500,
    "overallConversionRate": "4.2%"
  }
}
```

### GET /analytics/bdr

Get BDR leader performance analytics.

**Parameters:**
```json
{
  "customerId": "string (required)",
  "bdrLeaderId": "string (optional)",
  "startDate": "YYYY-MM-DD (optional)",
  "endDate": "YYYY-MM-DD (optional)"
}
```

**Response:**
```json
{
  "bdrLeaders": [
    {
      "bdrLeaderId": "bdr_123",
      "name": "John Smith",
      "emailsPerDay": 45,
      "connectionsPerDay": 18,
      "callsPerDay": 8,
      "outcomes": {
        "scheduled": 12,
        "nibbles": 20,
        "rejections": 35
      },
      "efficiency": "high"
    }
  ]
}
```

### GET /analytics/outcomes

Get detailed outcome statistics.

**Parameters:**
```json
{
  "customerId": "string (required)",
  "timeframe": "7d|30d|90d|1y (default: 30d)",
  "channel": "email|linkedin|phone|all (default: all)"
}
```

**Response:**
```json
{
  "outcomes": {
    "scheduled": {
      "count": 45,
      "percentage": "4.5%",
      "trend": "+15%"
    },
    "nibbles": {
      "count": 120,
      "percentage": "12.0%",
      "trend": "+8%"
    },
    "rejections": {
      "count": 200,
      "percentage": "20.0%",
      "trend": "-5%"
    }
  },
  "channels": {
    "email": {
      "conversionRate": "3.2%",
      "responseRate": "18.5%"
    },
    "linkedin": {
      "acceptanceRate": "65%",
      "responseRate": "25%"
    },
    "phone": {
      "contactRate": "45%",
      "conversionRate": "8.5%"
    }
  }
}
```

## System Status Endpoints

### GET /outreach-system/status

Get overall system health and status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.9.0",
  "services": {
    "slotManager": {
      "status": "healthy",
      "lastActivity": "2024-01-01T11:55:00.000Z"
    },
    "linkedinProcessor": {
      "status": "healthy",
      "queueDepth": 25,
      "processingRate": "2.5/min"
    },
    "outreachOrchestrator": {
      "status": "healthy",
      "activeJobs": 12
    }
  },
  "database": {
    "status": "connected",
    "responseTime": "15ms"
  },
  "externalServices": {
    "phantomBuster": {
      "status": "available",
      "rateLimitRemaining": 450
    },
    "firestore": {
      "status": "connected",
      "lastWrite": "2024-01-01T11:58:00.000Z"
    }
  }
}
```

## Data Models

### OutreachSet Model
```typescript
interface OutreachSet {
  id: string;
  customerId: string;
  accountId?: string;
  bdrLeaderId?: string;
  campaignId: string;
  iterationId: string;
  prospectOrgId: string;
  prospectOrgName: string;
  prospectContactId: string;
  email: string;
  phone?: string;
  linkedInUrl?: string;
  firstName: string;
  lastName: string;
  title?: string;
  jobLevel?: JobLevel;
  jobArea?: JobArea;
  personalization?: string;
  personalizationSubject?: string;
  personalizationBackground?: string;
  customFields: Record<string, any>;
  isResearched: boolean;
  approvalStatus: ApprovalStatus;
  isScheduled: boolean;
  emailSlotIds: string[];
  linkedInSlotIds: string[];
  phoneSlotIds: string[];
  emailDates: Date[];
  linkedInDates: Date[];
  phoneDates: Date[];
  outcomeStatus?: OutcomeType;
  outcomeDate?: Date;
  outcomeNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastModifiedBy: string;
}
```

### Slot Model
```typescript
interface Slot {
  slotId: string;
  accountId: string;
  accountType: 'email' | 'linkedin' | 'phone';
  customerId: string;
  bdrLeaderId: string;
  scheduledTime: Date;
  dayOfWeek: string;
  isWorkday: boolean;
  isHoliday: boolean;
  status: 'available' | 'assigned' | 'completed' | 'failed';
  assignedToOutreachSetId?: string;
  activityType?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Campaign Model
```typescript
interface Campaign {
  campaignId: string;
  customerId: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  requiredCustomFields: CustomField[];
  channels: {
    email: ChannelConfig;
    linkedin: ChannelConfig;
    phone: ChannelConfig;
  };
  iterations: Iteration[];
  createdAt: Date;
  updatedAt: Date;
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse and ensure fair usage:

- **Default limits**: 1000 requests per hour per authenticated user
- **LinkedIn operations**: 20 connections, 30 messages per day per account
- **Email operations**: 60 emails per day per account (configurable)
- **Research operations**: 100 profile lookups per day per LinkedIn account

**Rate limit headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Examples

### Complete Outreach Workflow Example

```javascript
// 1. Queue for LinkedIn research (data upload handled via frontend tools)
const researchResponse = await fetch('/linkedin/research', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    outreachSetIds: ['set_123'],
    linkedinAccountId: 'li_acc_456',
    priority: 'high'
  })
});

// 2. Process research queue
const processResponse = await fetch('/research/process', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    researchIds: ['research_123'],
    maxItems: 10
  })
});

// 3. Approve contacts and schedule outreach
const scheduleResponse = await fetch('/outreach/bulk-schedule', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    outreachSets: [
      {
        outreachSetId: 'set_123',
        campaignId: 'camp_456',
        iterationId: 'iter_789',
        bdrLeaderId: 'bdr_101',
        channels: {
          email: {
            enabled: true,
            templates: ['intro_email'],
            timing: [1, 3, 7]
          },
          linkedin: {
            enabled: true,
            activities: ['connect', 'message'],
            timing: [2, 5]
          }
        }
      }
    ]
  })
});

// 4. Monitor campaign performance
const analyticsResponse = await fetch('/analytics/campaign?customerId=cust_123&campaignId=camp_456', {
  headers: {
    'Authorization': `Bearer ${idToken}`
  }
});
```

### Error Handling Example

```javascript
try {
  const response = await fetch('/slots/assign', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      slotId: 'slot_123',
      outreachSetId: 'set_456',
      activityType: 'email_first'
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('API Error:', errorData.error);
    
    switch (errorData.error.code) {
      case 'SLOT_ALREADY_ASSIGNED':
        // Handle slot conflict
        break;
      case 'RATE_LIMIT_EXCEEDED':
        // Wait and retry
        break;
      case 'AUTHENTICATION_FAILED':
        // Refresh token
        break;
      default:
        // Generic error handling
        break;
    }
  }

  const data = await response.json();
  console.log('Success:', data);
} catch (error) {
  console.error('Network error:', error);
}
```

---

**Last Updated**: August 2025  
**API Version**: 1.9.0  
**Status**: Draft

For additional support or questions, please refer to the main Outreach System documentation or contact the development team.
