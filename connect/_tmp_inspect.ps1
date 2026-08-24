$data = Get-Content -Raw 'connect_analysis/latest.json' | ConvertFrom-Json
$data.overall.funnel | Format-List
Write-Output '----MESSAGE TYPE----'
$data.overall.research.message_type | Format-Table level,n,connect_rate,reply_rate,meeting_rate -AutoSize
Write-Output '----AUDIENCE ORG TYPE----'
$data.overall.research.audience_org_type | Format-Table level,n,connect_rate,reply_rate,meeting_rate -AutoSize
