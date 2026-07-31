# Phone Activities Single Source of Truth - Consolidation Plan

## Executive Summary

Currently, `phone-calls.html` must query and merge data from **7+ Firebase collections** to build the call queue and display contact information. This causes:
1. **Slow response times** (multiple parallel queries, in-memory merging)
2. **Race conditions** (checking duplicates across collections)
3. **High Firebase costs** (excessive reads)

This document outlines everything that must be stored in `phone_activities` to make it the **Single Source of Truth** for the calling system.

---

## Current Collections Being Queried

| Collection | Purpose | Problem |
|------------|---------|---------|
| `phone_activities` | Call scheduling, claims, outcomes | **Primary**, but missing enrichment data |
| `outreach_sets` | Source contact data (state, alternates) | Must join to get timezone, phone2, phone3 |
| `campaign_call_tracking` | Payment/outcome records | Separate write for historical tracking |
| `callReservations` | User call commitments | Affects queue counts |
| `flaggedContacts` | Contacts under review | Must query to filter queue |
| `callForecasts` | Scheduled call dates | Legacy reference for reservations |
| `teamMemberCampaignNotes` | User notes on campaigns | User-specific, not call-specific |

---

## PART 1: Fields Required on EACH `phone_activities` Document

### 1.1 Core Identity Fields (Already Present)
```javascript
{
    id: string,                    // Firestore document ID
    campaignId: string,            // Which campaign this call belongs to
    outreachSetId: string,         // Links to source contact in outreach_sets
    customerId: string,            // Alternative contact identifier
    contactId: string,             // Redundant ID field (for compatibility)
}
```

### 1.2 Contact Information (MUST BE COPIED from outreach_sets)
These fields are currently looked up from `outreach_sets` during queue building. They must be **written directly to phone_activities when the call is scheduled**.

```javascript
{
    // Basic Contact Info
    contactName: string,           // Full name
    firstName: string,             // First name (for personalization)
    lastName: string,              // Last name
    contactEmail: string,          // Work email
    phoneNumber: string,           // PRIMARY phone number to call
    phone: string,                 // Alias for phoneNumber (backward compatibility)
    
    // Company Information
    companyName: string,           // Company/organization name
    company: string,               // Alias (backward compatibility)
    title: string,                 // Contact's job title
    
    // Location Data (CRITICAL for timezone)
    contactState: string,          // US state (e.g., "CO", "NY")
    contact_state: string,         // Alias (from outreach_sets format)
    city: string,                  // City
    
    // Alternate Phone Numbers (CRITICAL - currently requires outreach_sets lookup)
    phone2: string,                // Alternate phone number 1
    phone3: string,                // Alternate phone number 2
    
    // Additional Contact Metadata
    linkedinUrl: string,           // LinkedIn profile URL
    website: string,               // Company website
}
```

### 1.3 Timezone Data (MUST BE PRE-CALCULATED when scheduling)
Currently calculated on-the-fly from state or area code. **Must be stored at scheduling time**.

```javascript
{
    // Timezone Identifiers
    timezoneFromState: string,     // e.g., "America/Denver", "America/New_York"
    timezoneFromAreaCode: string,  // Backup timezone from phone area code
    phoneAreaCode: string,         // Area code extracted from phone number
}
```

### 1.4 Scheduling Fields (Already Present, but add standardization)
```javascript
{
    status: string,                // "pending" | "scheduled" | "callback-scheduled" | "completed"
    
    // Scheduling dates (multiple fields for backward compatibility)
    scheduledDate: Date/Timestamp, // When this call should be made
    scheduledAt: string,           // ISO string version
    scheduledFor: Date,            // Alternative field name
    rescheduledAt: Date,           // If postponed, when to call next
    
    // Creation tracking
    createdAt: Date/Timestamp,     // When this activity was created
    createdBy: string,             // Email of who created it
}
```

### 1.5 Claim/Lock Fields (Already Present)
```javascript
{
    claimedBy: string,             // Email of user who has this call locked
    claimedAt: Date/Timestamp,     // When the claim was made
    claimedByName: string,         // Display name of claimer
}
```

### 1.6 Outcome Fields (Already Present)
```javascript
{
    outcome: string,               // The call outcome code
    completedAt: string,           // ISO timestamp when completed
    completedBy: string,           // Email of who completed it
    notes: string,                 // Notes from the call
    
    // Additional outcome data
    additionalData: object,        // Meeting date, callback time, etc.
    contactCorrection: object,     // If wrong contact reached
    referralInfo: object,          // If referral was given
    emailRequest: object,          // If email was requested
}
```

### 1.7 Payment Fields (Already Present - SSOT for payments)
```javascript
{
    basePayment: number,           // Base payment for outcome
    achievementPoolAwarded: number, // Bonus from pool
    totalPayment: number,          // Total earned for this call
}
```

### 1.8 Callback/Follow-up Fields (NEW - Required for eliminating queries)
```javascript
{
    isCallback: boolean,           // True if this is a callback
    isFollowUp: boolean,           // True if this is a follow-up call
    originalCallId: string,        // If callback, link to original call
    parentCallId: string,          // Alternative field for original call
    callbackDetails: object,       // {date, time, notes} for scheduled callbacks
    followUpFor: string,           // Reason for follow-up (e.g., "email-response")
}
```

### 1.9 **NEW - Call History Fields** (CRITICAL for eliminating cross-record queries)
When a call is completed, these fields must be **written to all OTHER pending phone_activities for the same contact**.

```javascript
{
    // Previous Call History (denormalized for instant access)
    previousCallCount: number,     // How many times this contact has been called
    lastCallDate: Date/Timestamp,  // When they were last called
    lastCallOutcome: string,       // What happened on last call
    lastCallNotes: string,         // Notes from last call
    lastCallBy: string,            // Who made the last call
    
    // Computed Fields
    attemptNumber: number,         // Which attempt this is (1, 2, 3, etc.)
    nextCallDueDate: Date,         // Calculated: lastCallDate + 2 business days
}
```

### 1.10 **NEW - Flag Status Fields** (Eliminate flaggedContacts queries)
```javascript
{
    isFlagged: boolean,            // True if contact is flagged for review
    flaggedAt: Date,               // When it was flagged
    flaggedBy: string,             // Who flagged it
    flagReason: string,            // Why it was flagged
    flagPriority: string,          // "urgent" | "high" | "normal"
    flagStatus: string,            // "pending" | "in-review" | "resolved"
}
```

### 1.11 **NEW - Contact Status Fields** (Eliminate outreach_sets queries for status)
```javascript
{
    contactStatus: string,         // "active" | "declined" | "bad_number" | "left_company" | "wrong_person"
    permanentFailureReason: string, // If permanently removed from queue, why
    permanentFailureDate: Date,    // When they were marked as permanent failure
    
    // Bad number tracking
    phoneNumberUpdated: boolean,   // True if primary phone was changed
    previousPhoneNumber: string,   // The bad phone number that was replaced
    phoneNumberUpdatedAt: Date,    // When it was updated
    phoneNumberUpdatedReason: string, // Why it was updated
}
```

### 1.12 **NEW - Admin Notes** (Currently in outreach_sets.adminNotes)
```javascript
{
    adminNotes: string,            // Notes from admins/supervisors
    postponeReason: string,        // If postponed, why
    skipReason: string,            // If skipped, why
}
```

---

## PART 2: Writes Required WHEN A CALL IS SCHEDULED

When creating a new `phone_activities` document (from campaign automation, callback scheduling, etc.):

### 2.1 Copy from `outreach_sets`:
```javascript
// Source: outreach_sets document for this contact
const outreachDoc = await getDoc(doc(db, 'outreach_sets', outreachSetId));
const outreachData = outreachDoc.data();

const newPhoneActivity = {
    // Copy all contact data
    contactName: outreachData.contact_name || outreachData.contactName,
    firstName: outreachData.first_name || outreachData.firstName,
    lastName: outreachData.last_name || outreachData.lastName,
    contactEmail: outreachData.workemail || outreachData.email,
    phoneNumber: outreachData.phone || outreachData.phoneNumber,
    companyName: outreachData.company || outreachData.prospectOrgName,
    title: outreachData.title || outreachData.contact_title,
    
    // Location for timezone
    contactState: outreachData.contact_state || outreachData.state,
    city: outreachData.city,
    
    // Alternate phones
    phone2: outreachData.phone2,
    phone3: outreachData.phone3,
    
    // Metadata
    linkedinUrl: outreachData.linkedin_url,
    website: outreachData.website,
    
    // Admin notes
    adminNotes: outreachData.adminNotes || '',
    
    // Pre-calculate timezone
    timezoneFromState: getTimezoneFromState(outreachData.contact_state),
    timezoneFromAreaCode: getTimezoneFromAreaCode(outreachData.phone),
    phoneAreaCode: extractAreaCode(outreachData.phone),
    
    // Check for existing call history (query once at scheduling time)
    ...await getExistingCallHistory(outreachSetId, campaignId),
    
    // Check flag status
    ...await getFlagStatus(outreachSetId),
};
```

### 2.2 Query Existing Call History:
```javascript
async function getExistingCallHistory(outreachSetId, campaignId) {
    const existingCallsQuery = query(
        collection(db, 'phone_activities'),
        where('outreachSetId', '==', outreachSetId),
        where('campaignId', '==', campaignId),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        limit(1)
    );
    
    const snapshot = await getDocs(existingCallsQuery);
    const totalCalls = snapshot.size;
    
    if (snapshot.docs.length > 0) {
        const lastCall = snapshot.docs[0].data();
        return {
            previousCallCount: totalCalls,
            lastCallDate: lastCall.completedAt,
            lastCallOutcome: lastCall.outcome,
            lastCallNotes: lastCall.notes,
            lastCallBy: lastCall.completedBy,
            attemptNumber: totalCalls + 1,
            nextCallDueDate: addBusinessDays(new Date(lastCall.completedAt), 2),
        };
    }
    
    return {
        previousCallCount: 0,
        attemptNumber: 1,
    };
}
```

---

## PART 3: Writes Required WHEN A CALL IS COMPLETED

### 3.1 Update the Completed Call Record (Already Done)
```javascript
await updateDoc(doc(db, 'phone_activities', currentCall.id), {
    status: 'completed',
    outcome: outcome,
    completedAt: now.toISOString(),
    completedBy: userEmail,
    notes: notes,
    basePayment: basePayment,
    achievementPoolAwarded: achievementPoolAwarded,
    totalPayment: totalPayment,
    // ... additional data
});
```

### 3.2 **NEW - Update ALL OTHER Pending Activities for Same Contact**
This is **CRITICAL** for eliminating the cross-record queries during queue building.

```javascript
async function updateRelatedActivitiesWithCallHistory(completedCall) {
    // Find all OTHER pending activities for this same contact
    const relatedQuery = query(
        collection(db, 'phone_activities'),
        where('outreachSetId', '==', completedCall.outreachSetId),
        where('status', 'in', ['pending', 'scheduled']),
    );
    
    const snapshot = await getDocs(relatedQuery);
    
    const batch = writeBatch(db);
    
    snapshot.docs.forEach((doc) => {
        if (doc.id !== completedCall.id) {  // Don't update the call we just completed
            batch.update(doc.ref, {
                // Update call history on sibling records
                previousCallCount: (completedCall.previousCallCount || 0) + 1,
                lastCallDate: completedCall.completedAt,
                lastCallOutcome: completedCall.outcome,
                lastCallNotes: completedCall.notes,
                lastCallBy: completedCall.completedBy,
                attemptNumber: (completedCall.attemptNumber || 1) + 1,
                nextCallDueDate: addBusinessDays(new Date(), 2),
            });
        }
    });
    
    await batch.commit();
}
```

### 3.3 **Handle Permanent Failure Outcomes**
When a contact declines, leaves company, or is wrong person, mark ALL their pending activities:

```javascript
const permanentFailureOutcomes = [
    'spoke-declined',
    'contact-left-no-replacement',
    'bad-number-wrong-person'
];

if (permanentFailureOutcomes.includes(outcome)) {
    const allActivitiesQuery = query(
        collection(db, 'phone_activities'),
        where('outreachSetId', '==', completedCall.outreachSetId),
        where('status', 'in', ['pending', 'scheduled']),
    );
    
    const snapshot = await getDocs(allActivitiesQuery);
    const batch = writeBatch(db);
    
    snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
            status: 'completed',
            outcome: 'auto-completed-contact-unavailable',
            autoCompletedReason: outcome,
            completedAt: new Date().toISOString(),
            completedBy: 'system',
            contactStatus: outcome === 'spoke-declined' ? 'declined' : 
                          outcome === 'contact-left-no-replacement' ? 'left_company' : 'wrong_person',
            permanentFailureReason: outcome,
            permanentFailureDate: new Date(),
        });
    });
    
    await batch.commit();
}
```

### 3.4 Continue Writing to `campaign_call_tracking`
As requested, continue writing to `campaign_call_tracking` for payment records:

```javascript
await addDoc(collection(db, 'campaign_call_tracking'), {
    callId: callId,
    campaignId: selectedCampaign,
    userEmail: userEmail,
    callerName: displayName,
    outcome: outcome,
    basePayment: basePayment,
    achievementPoolAwarded: achievementPoolAwarded,
    totalPayment: totalPayment,
    timestamp: now.toISOString(),
    contactName: currentCall.contactName,
    contactPhone: phoneNumber,
    contactEmail: currentCall.contactEmail,
    contactCompany: currentCall.companyName,
    notes: notes,
});
```

---

## PART 4: Writes Required for SPECIAL SCENARIOS

### 4.1 When Contact is FLAGGED:
```javascript
// When flagging a contact, update ALL their phone_activities
const activitiesQuery = query(
    collection(db, 'phone_activities'),
    where('outreachSetId', '==', outreachSetId),
    where('status', 'in', ['pending', 'scheduled']),
);

const snapshot = await getDocs(activitiesQuery);
const batch = writeBatch(db);

snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
        isFlagged: true,
        flaggedAt: new Date(),
        flaggedBy: userEmail,
        flagReason: reason,
        flagPriority: priority,
        flagStatus: 'pending',
    });
});

await batch.commit();
```

### 4.2 When BAD NUMBER is reported (with alternates):
```javascript
// Mark current activity as completed
await updateDoc(doc(db, 'phone_activities', currentCall.id), {
    status: 'completed',
    outcome: outcome,
    phoneNumberUpdated: true,
    previousPhoneNumber: currentPhone,
    phoneNumberUpdatedReason: outcome,
});

// Create new activity with alternate number
await addDoc(collection(db, 'phone_activities'), {
    ...currentCallData,  // Copy all contact data
    phoneNumber: nextAlternatePhone,
    phone: nextAlternatePhone,
    status: 'scheduled',
    scheduledDate: new Date(),
    phoneNumberUpdated: true,
    previousPhoneNumber: currentPhone,
    phoneNumberUpdatedReason: 'previous-number-bad',
    notes: `Alternate number after ${currentPhone} was bad`,
    
    // Copy call history
    previousCallCount: currentCall.previousCallCount || 0,
    lastCallDate: currentCall.lastCallDate,
    lastCallOutcome: currentCall.lastCallOutcome,
    attemptNumber: (currentCall.attemptNumber || 1),
});
```

### 4.3 When CALLBACK is Scheduled:
```javascript
await addDoc(collection(db, 'phone_activities'), {
    // Copy all contact data from original call
    ...currentCallData,
    
    // Callback specific
    status: 'callback-scheduled',
    scheduledDate: callbackDateTime,
    isCallback: true,
    originalCallId: currentCall.id,
    callbackDetails: {
        date: selectedDate,
        time: selectedTime,
        notes: callbackNotes,
    },
    createdAt: new Date(),
    createdBy: userEmail,
    
    // Copy call history
    previousCallCount: (currentCall.previousCallCount || 0) + 1,
    lastCallDate: new Date(),
    lastCallOutcome: 'spoke-scheduled-callback',
    lastCallBy: userEmail,
    attemptNumber: (currentCall.attemptNumber || 1) + 1,
});
```

### 4.4 When CALL is POSTPONED:
```javascript
await updateDoc(doc(db, 'phone_activities', currentCall.id), {
    status: 'scheduled',
    rescheduledAt: postponeDate,
    postponeReason: reason,
    adminNotes: (currentCall.adminNotes || '') + `\n[${new Date().toISOString()}] Postponed by ${userEmail}: ${reason}`,
});
```

---

## PART 5: Summary - What's Eliminated

### Queries NO LONGER NEEDED during queue building:
| Query | Replaced By |
|-------|-------------|
| `outreach_sets` for state/timezone | Stored directly in `phone_activities` |
| `outreach_sets` for phone2/phone3 | Stored directly in `phone_activities` |
| `phone_activities` for call history | `lastCallDate`, `lastCallOutcome`, `attemptNumber` fields |
| `flaggedContacts` for filter | `isFlagged` field on `phone_activities` |
| Cross-contact duplicate check | `previousCallCount` and `attemptNumber` fields |

### Writes that MUST HAPPEN:
1. **When scheduling**: Copy ALL data from `outreach_sets` + calculate timezone + get existing history
2. **When completing**: Update all sibling records with call history
3. **When flagging**: Update all contact's pending activities
4. **When bad number**: Create new activity with alternate, copy all data
5. **When callback**: Create new activity with all data copied, history updated

---

## PART 6: Migration Strategy

### Phase 1: Update Write Logic
1. Modify scheduling code to copy all `outreach_sets` fields
2. Modify completion code to update sibling records
3. Modify flag/bad-number handlers to update activities

### Phase 2: Backfill Existing Records
```javascript
// For each phone_activity missing contact data
const activitiesSnapshot = await getDocs(collection(db, 'phone_activities'));

for (const activity of activitiesSnapshot.docs) {
    const data = activity.data();
    
    if (!data.contactState && data.outreachSetId) {
        const outreachDoc = await getDoc(doc(db, 'outreach_sets', data.outreachSetId));
        if (outreachDoc.exists()) {
            const outreach = outreachDoc.data();
            await updateDoc(activity.ref, {
                contactState: outreach.contact_state,
                phone2: outreach.phone2,
                phone3: outreach.phone3,
                timezoneFromState: getTimezoneFromState(outreach.contact_state),
                // ... other fields
            });
        }
    }
}
```

### Phase 3: Update Read Logic
1. Remove `outreach_sets` queries from queue building
2. Remove `flaggedContacts` queries
3. Remove cross-record history queries
4. Simplify `canMakeCallNow()` to use stored timezone

---

## Document Version
- **Created**: December 9, 2025
- **Purpose**: Consolidation plan for phone_activities as Single Source of Truth
- **Status**: PLANNING (No changes made yet)






