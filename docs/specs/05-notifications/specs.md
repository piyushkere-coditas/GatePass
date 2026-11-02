# Spec 05 — Notifications (Email)

## Purpose
Send reliable, transactional emails on key visit events. Email is the **only** notification channel in v1. Live UI refresh (WebSocket) keeps screens current but is not a notification.

## Events → Emails
| Event | Recipient | Template | Content |
|---|---|---|---|
| `visit.created` (planned) | Host | `visit-scheduled` | Confirmation: visitor, date/time, code |
| `visit.unplanned_requested` | Host | `approval-request` | Visitor name, company, purpose, "Open request" button → `/approvals/:id` |
| `visit.escalated` | All active Admins | `approval-escalated` | Same as above + host name + minutes waiting |
| `visit.approved` / `visit.rejected` (decided by admin) | Host | `approval-decided-by-admin` | FYI: who decided |
| `visit.checked_in` | Host | `visitor-arrived` | "{visitor} has checked in at {time}", link to mark Meeting Over |
| `visit.force_checked_out` | Host | `visitor-force-checked-out` | Reason |
| `visit.cancelled` | — | none | |

No emails are sent to visitors in v1. Emails never contain photos.

## Functional Requirements
| ID | Requirement |
|---|---|
| NT-1 | Domain events are written to `EmailOutbox` **in the same DB transaction** as the state change (transactional outbox). |
| NT-2 | The outbox worker runs every 15 s, sends via SMTP (SES in prod, MailHog locally), and retries with exponential backoff (max 5 attempts) before FAILED. |
| NT-3 | Templates use MJML/Handlebars with Coditas branding and a plain-text alternative. Times are shown in IST. |
| NT-4 | Links point to `APP_BASE_URL`. No action tokens in emails (approval requires login). |
| NT-5 | Admins can see FAILED emails in the admin panel and retry them. |
| NT-6 | Each email is idempotent per (visitId, template, recipient). Duplicates are not enqueued twice. |

## Key Acceptance Scenarios
The full TDD suite (unit, integration, UI, traceability) is in [test-cases.md](test-cases.md).

| TC | Scenario | Expected |
|---|---|---|
| NT-T1 | Unplanned visit created | One outbox row `approval-request` to host; MailHog receives it |
| NT-T2 | State change transaction rolls back | No outbox row |
| NT-T3 | SMTP down | Retries with backoff; after 5 attempts FAILED; visible in admin |
| NT-T4 | Escalation with 3 admins | 3 emails |
| NT-T5 | Check-in | Host gets `visitor-arrived` with correct IST time |
| NT-T6 | Escalation job runs twice | No duplicate escalation emails |
| NT-T7 | Email HTML snapshot | Matches the approved template; plain-text part present |
