# Spec 06 — Admin & Reports

## Purpose
Answer "who came, who invited them, who came unplanned". Manage users and settings.

## Functional Requirements
| ID | Requirement |
|---|---|
| AD-1 | **Dashboard** (`/admin`): tiles for today — expected, inside now, meeting over (awaiting exit), checked out, pending approvals (escalated count). Charts for the last 30 days: visits per day (planned vs unplanned stacked), visits by purpose, top 10 hosts. |
| AD-2 | **Visitor Log** (`/admin/visits`): paginated table. Filters: date range (max 1 year), type, status, purpose, host, visitor name/phone/company, forced check-out only. Columns: code, visitor, company, host, type, purpose, check-in, check-out, time on premises, status. |
| AD-3 | **CSV export** of the filtered log (max 50,000 rows, streamed). Photo columns are excluded. The export is audited. |
| AD-4 | Visit detail for Admins: everything, including ID photo. Every ID photo view writes a `PHOTO_VIEWED` event. |
| AD-5 | **Escalated approvals** queue (`/admin/approvals`) — see spec 03. |
| AD-6 | **Users** (`/admin/users`) — see spec 01. |
| AD-7 | **Settings** (`/admin/settings`): `approval.escalationMinutes`, `media.retentionDays` (30–365), purpose list labels (enum fixed; labels editable). Changes are audited. |
| AD-8 | **Email failures** list with a retry action (spec 05). |
| AD-9 | Admins can cancel any SCHEDULED visit and mark Meeting Over on any CHECKED_IN visit (e.g., host unavailable). |

## API
| Method | Path | Notes |
|---|---|---|
| GET | /admin/stats/today | |
| GET | /admin/stats/trends?days=30 | |
| GET | /admin/visits?filters&page&sort | |
| GET | /admin/visits/export.csv?filters | Streamed |
| GET/PUT | /admin/settings | |
| GET | /admin/emails?status=FAILED · POST /admin/emails/:id/retry | |

All routes require ADMIN.

## Key Acceptance Scenarios
The full TDD suite (unit, integration, UI, traceability) is in [test-cases.md](test-cases.md).

| TC | Scenario | Expected |
|---|---|---|
| AD-T1 | Today tiles with seeded data (3 expected, 2 inside, 1 MO) | Counts match |
| AD-T2 | Filter type=UNPLANNED, last 7 days | Only unplanned visits in range |
| AD-T3 | Date range > 1 year | 400 |
| AD-T4 | CSV export | Header row + rows match filtered results; no photo keys; IST timestamps |
| AD-T5 | Admin opens ID photo | Image loads via signed URL; PHOTO_VIEWED event recorded |
| AD-T6 | Change escalation to 5 min | The next escalation run uses 5 |
| AD-T7 | Retention set to 10 days | 400 (min 30) |
| AD-T8 | Employee hits `/admin/visits` | 403 |
| AD-T9 | Time on premises | = checkedOutAt − checkedInAt, blank if still inside |
