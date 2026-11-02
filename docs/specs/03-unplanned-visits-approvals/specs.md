# Spec 03 — Unplanned Visits & Approvals

## Purpose
Let security register walk-in visitors and get the host's approval (or an Admin's after escalation) before entry.

## Functional Requirements
| ID | Requirement |
|---|---|
| UV-1 | Security creates an unplanned entry with the visitor fields plus a **Host** chosen via directory search (AU-11). visitDate = today. expectedArrival = now. type = UNPLANNED. status = PENDING_APPROVAL. `approvalRequestedAt` = now. |
| UV-2 | On creation, the host gets an email (spec 05) with an "Open request" link to `/approvals/:visitId` (SSO login required, so the link alone does not authorize a decision). |
| UV-3 | The host approves, or rejects with an optional reason (≤ 200 chars). This sets `decidedById`/`decidedAt`. Status → APPROVED / REJECTED. |
| UV-4 | Security's dashboard shows the decision live. Approved → **Check In** enabled. Rejected → shown with the reason and the entry closes. |
| UV-5 | **Escalation job** runs every minute: PENDING_APPROVAL visits with `approvalRequestedAt` older than `approval.escalationMinutes` (default 10) and `escalatedAt` null → set `escalatedAt`, write an ESCALATED event, and email all active Admins. |
| UV-6 | After escalation, any Admin can decide from `/admin/approvals`. The host can still decide. The first committed decision wins and later attempts get 409 with "Already approved by X". |
| UV-7 | Security can **withdraw** a pending request (the visitor left). This counts as REJECTED with note "Withdrawn by security". |
| UV-8 | Duplicate guard: if a PENDING_APPROVAL/APPROVED/CHECKED_IN visit already exists today for the same phone, the API returns 409 `DUPLICATE_ACTIVE_VISIT` with `existingVisitId`. Security sees the existing entry and may resubmit with `confirmDuplicate: true`. |
| UV-9 | Pending requests older than end of day (23:59 IST) are auto-rejected by a nightly job with note "Expired". |
| UV-10 | Security's dashboard shows the time elapsed since the request and an "Escalated" badge. |

## API
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /visits/unplanned | SECURITY | Visitor fields + `hostId` |
| GET | /approvals/pending | EMPLOYEE (own), ADMIN (escalated + own) | |
| POST | /visits/:id/approve | host; ADMIN if escalated | `{version}` |
| POST | /visits/:id/reject | host; ADMIN if escalated | `{version, reason?}` |
| POST | /visits/:id/withdraw | SECURITY | PENDING_APPROVAL only |

## Settings
`approval.escalationMinutes` (int, 1–120, default 10). Editable by Admin (spec 06).

## Key Acceptance Scenarios
The full TDD suite (unit, integration, UI, traceability) is in [test-cases.md](test-cases.md).

| TC | Scenario | Expected |
|---|---|---|
| UV-T1 | Security creates an unplanned visit for host A | PENDING_APPROVAL; email queued to A; appears in A's pending approvals |
| UV-T2 | Unplanned visit without a host | 400 |
| UV-T3 | Host = deactivated user | 422 |
| UV-T4 | A approves | APPROVED; security sees Check In enabled within 3 s |
| UV-T5 | A rejects with reason "Not expected" | REJECTED; security sees the reason; Check In not possible |
| UV-T6 | Employee B (not host) approves | 403 |
| UV-T7 | Admin approves before escalation | 403 `NOT_ESCALATED` |
| UV-T8 | No response for 10 min (clock mocked) | escalatedAt set; ESCALATED event; email to every admin; job does not re-escalate on the next run |
| UV-T9 | After escalation, host and admin decide at the same time | Exactly one succeeds; the other gets 409 |
| UV-T10 | Security withdraws | REJECTED with note "Withdrawn by security" |
| UV-T11 | Same phone registered twice today | Warning with a link to the existing entry |
| UV-T12 | Pending at midnight | Auto-rejected "Expired" |
| UV-T13 | Approval email link opened while logged out | SSO login, then lands on the approval page |
