# Phone Inbox Fixes - Apply All Changes
# Run this script to apply all fixes to the phone inbox pages

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Applying Phone Inbox Fixes" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Fix 1: Add callerName to phone-calls.html
Write-Host "Fix 1: Adding callerName field to phone-calls.html..." -ForegroundColor Yellow
$phoneCallsContent = Get-Content "team\phone-calls.html" -Raw

if ($phoneCallsContent -notmatch "callerName: currentUser") {
    $old = "                    userEmail: userEmail,`r`n                    outcome: outcome,"
    $new = "                    userEmail: userEmail,`r`n                    callerName: currentUser.displayName || teamMemberData?.name || currentUser.email,`r`n                    outcome: outcome,"
    
    $phoneCallsContent = $phoneCallsContent -replace [regex]::Escape($old), $new
    Set-Content -Path "team\phone-calls.html" -Value $phoneCallsContent -NoNewline
    Write-Host "  ✅ Added callerName field" -ForegroundColor Green
} else {
    Write-Host "  ✅ callerName field already present" -ForegroundColor Green
}

# Fix 2: Add Search and Clear buttons to phone_inbox.html
Write-Host "`nFix 2: Adding Search and Clear buttons..." -ForegroundColor Yellow
$inboxContent = Get-Content "crm\phone_inbox.html" -Raw

if ($inboxContent -notmatch "clearNotesSearch") {
    # Add buttons
    $old = '<input type="text" id="notesSearchInput" class="filter-select" placeholder="Search by contact name, company, or notes..." oninput="applyNotesFilters()">'
    $new = @'
<div style="display: flex; gap: 0.5rem; align-items: center;">
                            <input type="text" id="notesSearchInput" class="filter-select" placeholder="Search by contact name, company, or notes..." oninput="applyNotesFilters()" onkeypress="if(event.key==='Enter')applyNotesFilters()" style="flex: 1;">
                            <button onclick="applyNotesFilters()" class="btn-primary" style="padding: 0.5rem 1rem; min-width: auto; white-space: nowrap;">
                                <i class="fas fa-search"></i> Search
                            </button>
                            <button onclick="clearNotesSearch()" class="btn-secondary" style="padding: 0.5rem 1rem; min-width: auto; white-space: nowrap;">
                                <i class="fas fa-times"></i> Clear
                            </button>
                        </div>
'@
    
    $inboxContent = $inboxContent -replace [regex]::Escape($old), $new
    Write-Host "  ✅ Added Search and Clear buttons" -ForegroundColor Green
    
    # Add clearNotesSearch function
    $old = "            displayCallNotes(filtered);`r`n        }"
    $new = @'
            displayCallNotes(filtered);
        }
        
        // Clear notes search
        function clearNotesSearch() {
            document.getElementById('notesSearchInput').value = '';
            applyNotesFilters();
        }
'@
    
    $inboxContent = $inboxContent -replace [regex]::Escape($old), $new
    Write-Host "  ✅ Added clearNotesSearch function" -ForegroundColor Green
    
    Set-Content -Path "crm\phone_inbox.html" -Value $inboxContent -NoNewline
} else {
    Write-Host "  ✅ Search buttons already present" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "All fixes applied successfully!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Clear your browser cache (Ctrl+Shift+R)" -ForegroundColor White
Write-Host "2. Deploy to Firebase: firebase deploy --only hosting" -ForegroundColor White
Write-Host "3. Test the changes at https://healthluminate.com/crm/phone_inbox`n" -ForegroundColor White

