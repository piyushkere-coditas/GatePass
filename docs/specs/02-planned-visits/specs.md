# Spec 02 — Planned Visits (Employee / Host)

## Purpose
Let employees pre-register visitors, track their status, and mark meetings over.

## Functional Requirements
| ID | Requirement |
|---|---|
| PV-1 | An employee creates a visit with the fields in REQUIREMENTS §4. Host = the current user. Status = SCHEDULED. type = PLANNED. |
| PV-2 | Typing a mobile number that matches an existing `Visitor` offers to autofill name/email/company. |
| PV-3 | A unique `code` (GP-YYYYMMDD-NNNN, per-day sequence) is generated and shown on the entry. |
| PV-4 | Validation: visitDate is today..today+30 (IST). If today, expectedArrival ≥ now − 15 min. Duration is 15–480 min. Purpose OTHER requires purposeNote. |
| PV-5 | **My Visits** page: tabs Today / Upcoming / Past. Each row shows visitor, time, purpose, and a status badge. Updates live. |
| PV-6 | The host can edit or cancel a SCHEDULED visit. Edits are logged as `EDITED` events with a changed-fields diff. |
| PV-7 | The host sees the check-in time and the visitor photo (not the ID photo) once CHECKED_IN. |
| PV-8 | The host clicks **Meeting Over** on a CHECKED_IN visit, with a confirmation dialog. Status → MEETING_OVER, and Security's dashboard updates live. |
| PV-9 | **Pending approvals** section: unplanned visits awaiting this host's decision (spec 03). |
| PV-10 | Visit detail page shows the full timeline from `VisitEvent`. |
| PV-11 | An employee can see only visits where they are the host. Admins can see all. |

## API
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /visits | EMPLOYEE, ADMIN | Creates a planned visit |
| GET | /visits/mine?scope=today\|upcoming\|past&page= | EMPLOYEE, ADMIN | |
| GET | /visits/:id | host, SECURITY, ADMIN | Includes timeline |
| PATCH | /visits/:id | host | SCHEDULED only. Requires `version` |
| POST | /visits/:id/cancel | host, ADMIN | `{reason?}` |
| POST | /visits/:id/meeting-over | host, ADMIN | CHECKED_IN only |
| GET | /visitors/lookup?phone= | EMPLOYEE, SECURITY, ADMIN | Exact match → `{fullName, email, company}` |

## UI
- `/my-visits` (list), `/visits/new` (form), `/visits/:id` (detail + timeline + actions).
- Status badge colours: Scheduled (grey), Pending approval (amber), Approved (blue), Checked in (green), Meeting over (violet), Checked out (dark), Rejected/Cancelled (red).

## Key Acceptance Scenarios
The full TDD suite (unit, integration, UI, traceability) is in [test-cases.md](test-cases.md).

| TC | Scenario | Expected |
|---|---|---|
| PV-T1 | Create a valid visit for tomorrow at 11:00 for 60 min, purpose Interview | 201, status SCHEDULED, code generated, appears in Upcoming |
| PV-T2 | visitDate yesterday | 400, field error on visitDate |
| PV-T3 | visitDate today+31 | 400 |
| PV-T4 | Purpose OTHER without a note | 400 |
| PV-T5 | Mobile number of a returning visitor | Autofill suggestion shown; accepted values populate the form |
| PV-T6 | Edit time of a SCHEDULED visit | Saved; EDITED event with diff |
| PV-T7 | Edit a CHECKED_IN visit | 409 `VISIT_INVALID_TRANSITION` |
| PV-T8 | Cancel a scheduled visit | CANCELLED; disappears from the security list |
| PV-T9 | Meeting Over on a CHECKED_IN visit | MEETING_OVER; security dashboard updates within 3 s |
| PV-T10 | Meeting Over on a SCHEDULED visit | 409 |
| PV-T11 | Employee B opens Employee A's visit | 403 |
| PV-T12 | Edit with a stale `version` | 409 `VISIT_STALE`; UI prompts reload |
