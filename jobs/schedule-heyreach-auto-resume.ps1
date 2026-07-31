# PowerShell script to schedule HeyReach Auto-Resume job
# Run this as Administrator

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   HeyReach Auto-Resume Scheduler                       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "`nRight-click PowerShell and select 'Run as Administrator', then run this script again.`n" -ForegroundColor Yellow
    pause
    exit 1
}

# Get the current directory and script path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $scriptDir "heyreach-auto-resume.js"

# Find Node.js path
Write-Host "🔍 Looking for Node.js installation..." -ForegroundColor Yellow
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $nodePath) {
    Write-Host "❌ ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "`nPlease install Node.js from https://nodejs.org/`n" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "✅ Found Node.js at: $nodePath" -ForegroundColor Green

# Verify the script exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ ERROR: Script not found at: $scriptPath" -ForegroundColor Red
    Write-Host "`nPlease make sure heyreach-auto-resume.js exists in the jobs directory.`n" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "✅ Found script at: $scriptPath" -ForegroundColor Green

# Task details
$taskName = "HeyReach Auto-Resume"
$taskDescription = "Automatically resumes priority HeyReach campaigns (Connect & Message) every night"
$taskTime = "2:00 AM"

Write-Host "`n📋 Task Configuration:" -ForegroundColor Cyan
Write-Host "   Name: $taskName"
Write-Host "   Description: $taskDescription"
Write-Host "   Schedule: Daily at $taskTime"
Write-Host "   Script: $scriptPath"
Write-Host "   Node: $nodePath`n"

# Prompt for confirmation
$confirm = Read-Host "Do you want to create/update this scheduled task? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "`n❌ Cancelled by user`n" -ForegroundColor Yellow
    exit 0
}

Write-Host "`n🔧 Creating scheduled task..." -ForegroundColor Yellow

try {
    # Remove existing task if it exists
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "   ⚠️  Removing existing task..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    # Create the action
    $action = New-ScheduledTaskAction `
        -Execute $nodePath `
        -Argument "`"$scriptPath`"" `
        -WorkingDirectory $scriptDir

    # Create the trigger (daily at 2 AM)
    $trigger = New-ScheduledTaskTrigger `
        -Daily `
        -At "2:00 AM"

    # Create the principal (run whether user is logged on or not, with highest privileges)
    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest

    # Create settings
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RunOnlyIfNetworkAvailable `
        -MultipleInstances IgnoreNew

    # Register the task
    Register-ScheduledTask `
        -TaskName $taskName `
        -Description $taskDescription `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Force | Out-Null

    Write-Host "`n✅ Scheduled task created successfully!`n" -ForegroundColor Green

    # Display task info
    $task = Get-ScheduledTask -TaskName $taskName
    Write-Host "📊 Task Information:" -ForegroundColor Cyan
    Write-Host "   Status: $($task.State)"
    Write-Host "   Next Run: $(($task | Get-ScheduledTaskInfo).NextRunTime)"
    Write-Host "   Last Run: $(($task | Get-ScheduledTaskInfo).LastRunTime)"
    Write-Host "   Last Result: $(($task | Get-ScheduledTaskInfo).LastTaskResult)`n"

    # Ask if user wants to run the task now for testing
    $runNow = Read-Host "Would you like to run the task now for testing? (Y/N)"
    if ($runNow -eq "Y" -or $runNow -eq "y") {
        Write-Host "`n▶️  Running task..." -ForegroundColor Yellow
        Start-ScheduledTask -TaskName $taskName
        Write-Host "`n✅ Task started! Check Task Scheduler for status.`n" -ForegroundColor Green
        Write-Host "   You can view the task history in Task Scheduler:" -ForegroundColor Cyan
        Write-Host "   1. Open Task Scheduler (taskschd.msc)" -ForegroundColor Cyan
        Write-Host "   2. Find '$taskName' in the task list" -ForegroundColor Cyan
        Write-Host "   3. Click on the History tab`n" -ForegroundColor Cyan
    }

    Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║   Setup Complete!                                      ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

    Write-Host "📝 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. The task will run automatically every night at 2:00 AM"
    Write-Host "   2. Check Firebase 'system_logs' collection for execution logs"
    Write-Host "   3. Use crm/heyreach_campaigns.html to manually manage campaigns"
    Write-Host "   4. To view/edit the task, open Task Scheduler (taskschd.msc)`n"

} catch {
    Write-Host "`n❌ ERROR: Failed to create scheduled task" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`nPlease check that you're running as Administrator and try again.`n" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")











