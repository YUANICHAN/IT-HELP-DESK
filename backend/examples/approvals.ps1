param(
    [Parameter(Mandatory = $true)][string]$ServiceItemId,
    [Parameter(Mandatory = $true)][string]$BackupApproverId,
    [Parameter(Mandatory = $true)][string]$Password,
    [string]$Base = 'http://127.0.0.1:5000/api/v1',
    [string]$Origin = 'http://127.0.0.1:5000'
)

# Run against the synthetic database created by npm run seed:approvals.
# Each actor has a separate opaque session cookie and CSRF token.
$ErrorActionPreference = 'Stop'
function Connect-DemoActor([string]$Name) {
    $cookieJar = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $login = Invoke-RestMethod "$Base/auth/login" -Method Post -WebSession $cookieJar `
        -Headers @{ Origin = $Origin } -ContentType 'application/json' `
        -Body (@{ email = "$Name@approvals.example"; password = $Password } | ConvertTo-Json)
    return @{ Cookies = $cookieJar; Csrf = $login.data.csrfToken }
}
function Read-Api($Actor, [string]$Path) {
    return (Invoke-RestMethod "$Base$Path" -WebSession $Actor.Cookies -Headers @{ Origin = $Origin }).data
}
function Send-Api($Actor, [string]$Path, [hashtable]$Body, [string]$Key = [guid]::NewGuid().ToString()) {
    return (Invoke-RestMethod "$Base$Path" -Method Post -WebSession $Actor.Cookies `
        -Headers @{ Origin = $Origin; 'X-CSRF-Token' = $Actor.Csrf; 'Idempotency-Key' = $Key } `
        -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 10)).data
}
function Submit-Request($Actor, [string]$Key = [guid]::NewGuid().ToString()) {
    return (Send-Api $Actor '/tickets' @{
        serviceItemId = $ServiceItemId
        title = 'Synthetic service access request'
        description = 'Please enable the synthetic service for the documented work task.'
        urgency = 'MEDIUM'
    } $Key).ticket
}

$employee = Connect-DemoActor 'employee'
$primary = Connect-DemoActor 'primary'
$backup = Connect-DemoActor 'backup'
$triage = Connect-DemoActor 'triage'
$other = Connect-DemoActor 'other'

# Submit, list the current named approver's inbox, approve using the ticket version.
$submissionKey = [guid]::NewGuid().ToString()
$ticket = Submit-Request $employee $submissionKey
$replayed = Submit-Request $employee $submissionKey
if ($ticket.id -ne $replayed.id) { throw 'Creation retry produced another ticket.' }
$inbox = Read-Api $primary '/approvals?status=PENDING&sort=-requestedAt&limit=100'
$approval = $inbox.approvals | Where-Object { $_.ticket.id -eq $ticket.id } | Select-Object -First 1
$decisionKey = [guid]::NewGuid().ToString()
$approved = Send-Api $primary "/approvals/$($approval.id)/decision" @{
    decision = 'APPROVED'; expectedVersion = $approval.ticket.version; decisionNote = 'Approved for the stated task.'
} $decisionKey
if ($approved.approval.ticket.status -ne 'OPEN') { throw 'Approval did not open the ticket.' }

# Reject a separate request. An explanation is required.
$rejectedTicket = Submit-Request $employee
$pending = (Read-Api $primary '/approvals?limit=100').approvals |
    Where-Object { $_.ticket.id -eq $rejectedTicket.id } | Select-Object -First 1
$rejected = Send-Api $primary "/approvals/$($pending.id)/decision" @{
    decision = 'REJECTED'; expectedVersion = $pending.ticket.version; decisionNote = 'This access is outside the requested duties.'
}
if ($rejected.approval.ticket.status -ne 'REJECTED') { throw 'Rejection did not finish the request.' }

# Triage explicitly selects the replacement; the old round is retained as SUPERSEDED.
$reroutedTicket = Submit-Request $employee
$rerouted = Send-Api $triage "/tickets/$($reroutedTicket.id)/approval-reroutes" @{
    approverId = $BackupApproverId; expectedVersion = $reroutedTicket.version; reason = 'Primary approver is unavailable.'
}
$replacementDecision = Send-Api $backup "/approvals/$($rerouted.approval.id)/decision" @{
    decision = 'APPROVED'; expectedVersion = $rerouted.approval.ticket.version
}
if ($replacementDecision.approval.ticket.status -ne 'OPEN') { throw 'Replacement approval failed.' }
$history = Read-Api $employee "/tickets/$($reroutedTicket.id)/approvals"
if ($history.approvals.Count -ne 2) { throw 'Rerouting did not preserve both rounds.' }

# The designated primary submits their own request: the configured backup is selected.
$fallbackTicket = Submit-Request $primary
$fallback = (Read-Api $backup '/approvals?limit=100').approvals |
    Where-Object { $_.ticket.id -eq $fallbackTicket.id } | Select-Object -First 1
if ($fallback.approverId -ne $BackupApproverId) { throw 'Eligible backup was not selected.' }

# This employee's department has no primary and is outside the backup's scope.
$failedKey = [guid]::NewGuid().ToString()
$configurationFailed = $false
try { Submit-Request $other $failedKey | Out-Null }
catch {
    if ([int]$_.Exception.Response.StatusCode -ne 409 -or $_.ErrorDetails.Message -notmatch 'APPROVER_CONFIGURATION_REQUIRED') { throw }
    $configurationFailed = $true
}
if (-not $configurationFailed) { throw 'Expected recoverable configuration failure.' }

# Retry a lost response with the SAME body/version/key. Use a NEW key for a new command.
# After a 409 stale-version conflict, GET current state and make a newly reviewed command.
[pscustomobject]@{
    ApprovedTicket = $ticket.id
    RejectedTicket = $rejectedTicket.id
    ReroutedTicket = $reroutedTicket.id
    FallbackTicket = $fallbackTicket.id
    ConfigurationFailure = '409 APPROVER_CONFIGURATION_REQUIRED'
    Health = (Read-Api $employee '/health').status
}
