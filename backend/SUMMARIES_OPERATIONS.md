# Step 11: summaries and operations

Step 11 adds read-only, current-authorization summaries. Every request reloads
the active account, session, role, and grants. Ticket and asset filters are the
same filters used by operational list/detail routes; aggregations match those
filters before grouping or counting. There is no permission-result cache.

The endpoints require the opaque session cookie and a completed mandatory
password change:

- `GET /api/v1/dashboard`
- `GET /api/v1/reports/overview`
- `GET /api/v1/admin/audit` (`ADMINISTRATOR` only)
- `GET /api/v1/admin/health` (`ADMINISTRATOR` only)

The existing public `GET /api/v1/health` remains a minimal database readiness
check. These endpoints are read-only, so they do not require a CSRF header.
Browser requests still pass the configured origin policy.

## Dashboard contract

`GET /dashboard` accepts optional `from`, `to`, and `departmentId`. Timestamps
must be RFC 3339 instants with an explicit offset. Ranges use inclusive start
and exclusive end, default to the prior 30 elapsed days, and cannot exceed 366
days. An explicitly unauthorized department returns
`403 DEPARTMENT_FILTER_FORBIDDEN`.

The response contains `generatedAt`, the organization's reporting `timezone`,
the exact period and filter, units, and only applicable sections:

- Employees receive `personal`: own active/waiting/resolved tickets, assigned
  equipment, and safe public updates.
- Technicians also receive `technician`: current-scope assigned work, eligible
  unassigned work, own completed work, and SLA indicators.
- Supervisors receive `departmentSupervision` and/or `triage` only when the
  corresponding live grant exists. Overlapping grants do not duplicate counts.
- Administrators receive `administration`: account/configuration warnings and
  operational health. They do not receive implicit ticket or asset totals.

Assignment alone does not add technician visibility. Original requester
department ownership is used for ticket scope even after a requester transfer.
Department supervision remains public-only and does not expose notes/worklogs.

Example shape (fields vary by authorized role):

```json
{
  "data": {
    "dashboard": {
      "generatedAt": "2026-10-28T12:00:00.000Z",
      "timezone": "Asia/Manila",
      "period": {
        "startInclusive": "2026-09-28T12:00:00.000Z",
        "endExclusive": "2026-10-28T12:00:00.000Z"
      },
      "appliedFilters": { "departmentId": null },
      "units": { "durations": "seconds", "serviceDurations": "business_seconds" },
      "sections": {
        "personal": {
          "activeTickets": 2,
          "waitingForMyReply": 1,
          "awaitingConfirmation": 1,
          "recentResolutions": [],
          "assignedEquipment": [],
          "recentUpdates": []
        }
      }
    }
  }
}
```

## Overview report definitions

`GET /reports/overview` accepts the same filters and authorization rules as the
dashboard. Employees remain limited to their own records.

- Open backlog is the current `NEW`, `OPEN`, `IN_PROGRESS`,
  `WAITING_APPROVAL`, `WAITING_REQUESTER`, or `WAITING_VENDOR` snapshot.
  `RESOLVED` awaiting confirmation is reported separately.
- First-response samples are initial SLA cycles for tickets submitted in the
  selected period. `unanswered` and `unreconciled` are explicit.
- Resolution samples are eligible `RESOLVED` cycles ending in the period.
  Durations are business seconds from the stored historical snapshots with
  valid business-time pauses removed.
- Median and p90 sort the exact permitted numeric sample and use linear
  interpolation at `(sampleSize - 1) * percentile`. Empty samples return null.
- Attainment is met eligible resolved cycles divided by all eligible resolved
  cycles ending in the period. Cancelled/rejected cycles are separate excluded
  counts. Zero denominator returns `percentage: null`.
- Current overdue workload is an as-of snapshot and is separate from completed
  period cohorts. Historical breach evidence remains visible.
- Reopenings report both event count and distinct ticket count.
- Work effort is available only with current internal support/triage access.
- Recurring equipment issues require both permitted repair assets and their
  linked permitted tickets. Asset accountability uses the existing asset policy.

SLA documents are streamed in bounded database batches and measured with the
existing business-calendar engine; the endpoint never substitutes wall-clock
duration or current policy settings for a historical snapshot. Missing or
invalid history increments `reconciliationRequired` rather than inventing data.

## Audit explorer

`GET /admin/audit` supports `from`, `to`, `action`, `actorId`, `entityType`,
`source`, `page`, `limit`, and `sort=asc|desc`. Limit defaults to 25 and is at
most 100. Ordering is stable by `occurredAt` and `_id`.

The explorer intentionally includes only authentication/security actions and
access-grant administration. It does not expose ticket/asset operational audit
rows simply because the caller is an administrator. Actor/entity references
are resolved only inside the current organization. Metadata is allowlisted;
IP addresses, descriptions, request bodies, passwords/hashes, tokens, secret
settings, file contents, raw exceptions, and stack traces are excluded. These
application records are append-only through the API, but are not described as
tamper-proof.

## Operational health and backup evidence

`GET /admin/health` reports an observation time and component states using
`healthy`, `degraded`, `unavailable`, `unknown`, and `not-configured`. It checks
the database, worker heartbeat, delivery scheduler, outbox queue, SLA scheduler,
cleanup task, private storage, and backup evidence. It returns safe diagnostic
codes and never returns connection strings, credentials, message payloads,
absolute storage paths, or raw errors.

The storage probe creates one UUID-named file under the configured private
storage root, verifies write access/capacity where supported, and removes only
that file. Set these operator-controlled values in `.env`:

```dotenv
STORAGE_HEALTH_PROBE_ENABLED=true
BACKUP_MANIFEST_PATH=C:\private-operations\help-desk-backup-manifest.json
BACKUP_MAXIMUM_AGE_HOURS=24
```

An empty `BACKUP_MANIFEST_PATH` is honestly reported as `not-configured` and
degrades detailed health. The API never creates or updates backup evidence.
The trusted manifest is limited to 64 KiB and has this versioned contract:

```json
{
  "schemaVersion": 1,
  "latestAttempt": {
    "startedAt": "2026-10-28T01:00:00.000Z",
    "completedAt": "2026-10-28T01:12:00.000Z",
    "outcome": "SUCCESS",
    "code": "BACKUP_COMPLETED"
  },
  "lastSuccessfulBackup": {
    "completedAt": "2026-10-28T01:12:00.000Z",
    "coverage": { "database": true, "privateAttachments": true }
  },
  "lastVerifiedRestore": {
    "verifiedAt": "2026-10-20T03:00:00.000Z",
    "outcome": "SUCCESS"
  }
}
```

A recent backup is not proof of recoverability. The last successful backup and
last verified restore are separate facts. Missing, malformed, stale, failed,
or incomplete evidence is explicit. Backup automation and restore drills remain
pilot/recovery work.

## Setup and PowerShell examples

MongoDB must be a replica set for the existing transactional workflows. From
`backend`, create the additive reporting indexes and run the API/worker in two
PowerShell windows:

```powershell
npm ci
npm run db:indexes
npm start
```

```powershell
Set-Location C:\path\to\IT_HELP_DESK\backend
npm run worker
```

Login once and reuse the host-only cookie:

```powershell
$Base = 'http://127.0.0.1:5000/api/v1'
$Web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Login = Invoke-RestMethod -Method Post -Uri "$Base/auth/login" `
  -WebSession $Web -ContentType 'application/json' `
  -Headers @{ Origin = 'http://127.0.0.1:5000' } `
  -Body (@{ email = 'supervisor@example.com'; password = $env:HELP_DESK_PASSWORD } | ConvertTo-Json)

Invoke-RestMethod -Method Get -Uri "$Base/dashboard" -WebSession $Web
Invoke-RestMethod -Method Get `
  -Uri "$Base/reports/overview?from=2026-10-01T00%3A00%3A00%2B08%3A00&to=2026-11-01T00%3A00%3A00%2B08%3A00" `
  -WebSession $Web
```

For an administrator session:

```powershell
Invoke-RestMethod -Method Get `
  -Uri "$Base/admin/audit?source=ACCESS_ADMINISTRATION&page=1&limit=25&sort=desc" `
  -WebSession $Web
Invoke-RestMethod -Method Get -Uri "$Base/admin/health" -WebSession $Web
```

## Indexes and limitations

`npm run db:indexes` adds ticket operational-reporting, SLA period, ticket-event
type/period, worklog period, asset repair-event, and administrative audit indexes.
Existing queue, assignment, custody, outbox-health, heartbeat, and cycle indexes
are reused.

There are no frontend dashboards, CSV exports, satisfaction reports, backup
automation, or restore orchestration in this step. Percentiles are calculated
on exact permitted samples after snapshot-aware measurement. Very high-volume
reporting may later need pre-authorized rollups designed to invalidate on grant
changes; no such cache is used now, preserving immediate revocation.
