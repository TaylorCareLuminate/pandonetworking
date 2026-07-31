# Mass Update Diagnostics & Recovery Tool

## Purpose
Detect, diagnose, and recover from bulk update issues that accidentally remove calls from the queue.

## What It Detects

### 1. Bulk Completion Issues ✅
- **Bulk Decline** (`spoke-declined`) - Like the 11/6 incident
- **Bulk Bad Number** (all variants) - Like the 11/24 incident (2,612 calls)
- **Bulk Contact Left** (`contact-left-no-replacement`)
- **Bulk Wrong Person** (`bad-number-wrong-person`)
- **Any Bulk Completed** - Catches any pattern

### 2. Status/Field Issues ⚠️ (Need to implement)
- **Stuck in Claimed** - Calls that never released from claim
- **Missing Assignment** - `assignedTo` accidentally cleared
- **Corrupt Phone Numbers** - Empty, null, or "-" values
- **Far Future Dates** - `scheduledFor` set to 2099 (hides calls)
- **Missing Timezone** - Filtered out by timezone validation

### 3. Data Integrity Issues ⚠️ (Need to implement)
- **Missing outreachSetId** - Can't link back to contact
- **Missing customerId** - Breaks campaign tracking
- **Orphaned Calls** - Link to outreach_sets broken

## How It Works

### Detection Process
1. Scans `phone_activities` for specified date range
2. Groups calls by minute (finds clusters of 50+ updates)
3. Analyzes each cluster:
   - Phone number patterns (empty, duplicate, unique)
   - OutreachSet patterns (same contact across campaigns?)
   - Completion patterns (who, what, when)
4. Classifies severity: CRITICAL, HIGH, MEDIUM, LOW

### Pattern Classification

#### **Empty Phone Cascade** (CRITICAL)
- **Trigger**: Marking one call with empty phone as bad
- **Pattern**: 50%+ of calls have empty/null/"-" phones
- **Example**: Your 11/24 incident (2,612 calls)
- **Recovery**: Restore all to pending

#### **Single Phone Cascade** (HIGH)
- **Trigger**: Marking one phone number as bad
- **Pattern**: All calls share the same phone number
- **Example**: Main office line (555-1234) × 200 contacts
- **Recovery**: Verify if phone is actually bad, then restore

#### **Duplicate Contact Cascade** (HIGH)
- **Trigger**: Bulk action on duplicated contacts
- **Pattern**: Same outreachSetId appears 6+ times
- **Example**: Same person in 14 campaigns × bulk decline
- **Recovery**: Review if outcome applies to all campaigns

#### **Legitimate Bulk** (LOW)
- **Pattern**: Admin cleanup or valid mass action
- **Recovery**: Manual review only

## Prevention Features (Added to Phone Inbox)

### Before Confirmation, Shows:
```
⚠️ CONFIRM ACTION
Mark Tabitha Ochoa as "Bad Number"?

This will affect:
• 2,612 pending calls  ← NOW SHOWS COUNT!
• 14 campaigns
• This flagged contact will be resolved

🚨 WARNING: This affects a large number of calls!
Double-check this is correct before proceeding.
```

### Validations Added:
✅ Empty phone check (phone-calls.html line 7216)
✅ Count preview (phone_inbox.html - both flag and note outcomes)
✅ Warning for >100 calls
✅ Shows campaign count

## Recovery Features

### What Recovery Does:
1. Sets `status` back to `'pending'`
2. Clears `outcome`, `completedAt`, `completedBy`
3. Clears `assignedTo` (makes available to all agents)
4. Adds audit trail:
   ```javascript
   {
     recoveredFromMassError: true,
     recoveredAt: "2025-11-25T...",
     recoveredReason: "Mass update diagnostic recovery - Pattern: empty-phone-cascade",
     recoveredTimestamp: "2025-11-24T15:33:00Z"
   }
   ```

### Recovery Options:
- **View Details**: See all affected calls in table
- **Recover All**: One-click restoration
- **Progress Tracking**: Shows N of M recovered
- **Audit Trail**: Marks calls as recovered for tracking

## What's Still Needed

### 1. Alert System 🚨
- Email/SMS when bulk update detected
- Real-time monitoring (webhook?)
- Slack integration

### 2. Additional Detections
- [ ] Stuck in claimed status
- [ ] Missing assignments
- [ ] Corrupt phone numbers scan
- [ ] Far future dates scan
- [ ] Timezone data missing
- [ ] Orphaned calls

### 3. Advanced Recovery
- [ ] Selective recovery by campaign
- [ ] Partial recovery (test N, then apply all)
- [ ] Backup before recovery
- [ ] Rollback capability

### 4. Reporting
- [ ] Incident reports (PDF export)
- [ ] Metrics dashboard
- [ ] Pattern library (document each incident type)
- [ ] Training materials

### 5. Integration
- [ ] Add to phone_schedule_manager (new "Incidents" tab)
- [ ] Link from phone-calls.html (if error detected)
- [ ] Add to admin dashboard

## Files Created/Modified

### New Files:
- `crm/mass_update_diagnostics.html` - Main diagnostic tool
- `crm/recover-bad-numbers.html` - Specific recovery tool for 11/24 incident
- `crm/MASS_DIAGNOSTICS_README.md` - This file

### Modified Files:
- `crm/phone_inbox.html` - Added count preview before bulk actions
- `team/phone-calls.html` - Fixed empty phone cascade bug (line 7216)

## How to Use

### Quick Scan (Recommended)
1. Go to `https://healthluminate.com/crm/mass_update_diagnostics.html`
2. Click **"Quick Scan (Last 7 Days)"**
3. Review detected issues
4. Click **"Recover These Calls"** for critical issues

### Custom Scan
1. Select date/time range
2. Choose issue type (or "All Types")
3. Set minimum bulk size (default: 50)
4. Click **"Scan for Issues"**

### Recovery
1. Review detected cluster details
2. Click **"View Detailed Analysis"** to see all calls
3. Click **"Recover These Calls"** to restore
4. Confirm the action
5. Wait for progress (batched in groups of 10)

## Lessons Learned

### 11/24 Incident (Empty Phone Cascade)
- **Root Cause**: Phone number = "-" normalized to "" and matched all empty phones
- **Affected**: 2,612 calls across 14 campaigns
- **Detection Time**: ~18 hours (discovered next day)
- **Recovery Time**: ~2 hours (after building tool)
- **Prevention**: Added validation + count preview

### 11/6 Incident (Bulk Decline)
- **Root Cause**: Declining one call cascaded to all with same company + customerId
- **Tool Built**: temp_fix.html by Taylor
- **Pattern**: Same as empty phone cascade but with company field

### Key Takeaways:
1. **Field validation is critical** - Never operate on empty/null/"
-" values
2. **Preview counts before action** - User must see impact
3. **Pattern recognition** - Similar bugs will happen again
4. **Reusable tools** - Build frameworks, not one-offs
5. **Audit trails** - Mark recovered calls for tracking

## Next Steps

1. **Test the tool** on real data (safe - detection only)
2. **Run Deep Analysis** on recover-bad-numbers.html to confirm 11/24 root cause
3. **Deploy phone_inbox.html** changes (count preview)
4. **Document** any new incidents in this file
5. **Expand** detection for other issue types
6. **Add alerts** for real-time detection

## Support

If you discover a new pattern that isn't detected by this tool:
1. Document it in this file
2. Add detection logic to `analyzeBulkUpdate()` function
3. Add recovery logic to `recoverCluster()` function
4. Update the issue type dropdown
5. Test on historical data

---

**Last Updated**: Nov 25, 2025
**Status**: Production Ready (v1.0)
**Owner**: Sam Ellsworth, Taylor

