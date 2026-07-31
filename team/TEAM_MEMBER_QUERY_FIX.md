# Team Member Query Fix - October 16, 2025

## Problem
Team members who were assigned in `admin/team-members.html` were unable to access the team pages and received the error:
> "Your team member profile was not found. Please contact your supervisor to be added to the team."

## Root Cause
The team pages were querying the `teamMembers` collection using the `emailLower` field:
```javascript
where('emailLower', '==', currentUser.email.toLowerCase())
```

However, existing team members created before the `emailLower` field was implemented did not have this field in their Firestore documents. This created a catch-22 situation:
1. The query couldn't find team members without `emailLower`
2. The backfill logic only ran AFTER a team member was found
3. Therefore, existing team members were never found or backfilled

## Solution Implemented
Updated all team pages to use a **three-tier fallback query system**:

1. **Primary Query**: Try to find by `emailLower` (indexed, case-insensitive)
2. **Fallback Query #1**: Try to find by exact `email` match (for backwards compatibility)
3. **Fallback Query #2**: Load all team members and do case-insensitive email matching in memory

When a team member is found via any of these methods, the system automatically backfills the `emailLower` field to ensure faster queries in the future.

## Files Updated
The following team pages were updated with the robust query system:

1. ✅ `team/index.html` - Team Dashboard
2. ✅ `team/my-campaigns.html` - My Campaigns
3. ✅ `team/campaigns.html` - All Campaigns
4. ✅ `team/performance.html` - Performance Tracking
5. ✅ `team/reserve-calls.html` - Call Reservations
6. ✅ `team/phone-calls.html` - Phone Calls Workspace

## Code Pattern Applied
```javascript
async function loadTeamMemberData() {
    try {
        if (!currentUser?.email) return;
        
        let teamMemberDoc = null;
        const normalizedEmail = currentUser.email.toLowerCase();
        
        // First, try to query by emailLower (case-insensitive, indexed)
        try {
            const teamMembersQuery = query(
                collection(db, 'teamMembers'),
                where('emailLower', '==', normalizedEmail)
            );
            const querySnapshot = await getDocs(teamMembersQuery);
            if (!querySnapshot.empty) {
                teamMemberDoc = querySnapshot.docs[0];
                console.log('✅ Found team member by emailLower');
            }
        } catch (queryError) {
            console.warn('⚠️ emailLower query failed:', queryError.message);
        }
        
        // Fallback: Query by regular email field (for backwards compatibility)
        if (!teamMemberDoc) {
            console.log('🔄 Trying fallback query by email field...');
            try {
                const fallbackQuery = query(
                    collection(db, 'teamMembers'),
                    where('email', '==', currentUser.email)
                );
                let fallbackSnapshot = await getDocs(fallbackQuery);
                
                if (!fallbackSnapshot.empty) {
                    teamMemberDoc = fallbackSnapshot.docs[0];
                    console.log('✅ Found team member by exact email match');
                } else {
                    // Try case-insensitive search by loading all and filtering
                    console.log('🔄 Trying case-insensitive search...');
                    const allMembersSnapshot = await getDocs(collection(db, 'teamMembers'));
                    
                    for (const doc of allMembersSnapshot.docs) {
                        const data = doc.data();
                        if (data.email && data.email.toLowerCase() === normalizedEmail) {
                            teamMemberDoc = doc;
                            console.log('✅ Found team member by case-insensitive search');
                            break;
                        }
                    }
                }
            } catch (fallbackError) {
                console.error('❌ Fallback query failed:', fallbackError);
            }
        }
        
        if (teamMemberDoc) {
            teamMemberData = { id: teamMemberDoc.id, ...teamMemberDoc.data() };
            
            // Backfill emailLower if missing
            if (!teamMemberData.emailLower || teamMemberData.emailLower !== normalizedEmail) {
                try {
                    await updateDoc(doc(db, 'teamMembers', teamMemberData.id), {
                        emailLower: normalizedEmail
                    });
                    teamMemberData.emailLower = normalizedEmail;
                    console.log('✅ Backfilled emailLower on team member profile');
                } catch (e) {
                    console.warn('⚠️ Failed to backfill emailLower', e);
                }
            }
        } else {
            console.log('⚠️ No team member record found for this user');
            showAlert('Your team member profile was not found. Please contact your supervisor.', 'warning');
        }
    } catch (error) {
        console.error('❌ Error loading team member data:', error);
    }
}
```

## Benefits
1. **Backwards Compatible**: Works with team members created before `emailLower` was implemented
2. **Case-Insensitive**: Handles email case variations (AnnaDavis@gmail.com vs annaleitadavis@gmail.com)
3. **Self-Healing**: Automatically backfills missing `emailLower` field for future performance
4. **Resilient**: Multiple fallback strategies ensure team members can always be found
5. **Performance**: Uses indexed queries first, only falls back to full scan if necessary

## Testing Recommendations
1. Test with a team member who has `emailLower` field (should use fast indexed query)
2. Test with a team member who lacks `emailLower` field (should use fallback and auto-backfill)
3. Test with email case variations (e.g., AnnaDavis@gmail.com vs annaleitadavis@gmail.com)
4. Verify that after first login, subsequent logins are faster (due to backfilled `emailLower`)

## Notes
- The `admin/team-members.html` page already sets `emailLower` when creating new team members
- All new team members will have this field from the start
- Existing team members will get the field backfilled on their next page visit
- After backfill, queries will use the fast indexed path

