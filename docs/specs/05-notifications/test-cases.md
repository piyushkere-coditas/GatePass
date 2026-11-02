# Test Cases — 05 Notifications (Email)

Fixtures and conventions: [../TESTING.md](../TESTING.md). Integration tests use MailHog (SMTP + HTTP API) in Testcontainers.

## TDD Order
1. Event→template mapping, formatting, backoff (NT-U-*)
2. Outbox enqueue inside transactions (NT-I-01..03)
3. Worker send / retry / fail / locking (NT-I-04..09)
4. Admin retry endpoint (NT-I-10)

## Unit
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| NT-U-01 | P0 | Mapping table | Each domain event | `visit.created(PLANNED)`→visit-scheduled→host; `unplanned_requested`→approval-request→host; `escalated`→approval-escalated→active admins; approved/rejected by admin→approval-decided-by-admin→host; `checked_in`→visitor-arrived→host; `force_checked_out`→visitor-force-checked-out→host; `cancelled`, `meeting_over`, approved/rejected by host → none |
| NT-U-02 | P0 | Each template + sample payload | Render | HTML snapshot matches; plain-text part non-empty; subject per table below |
| NT-U-03 | P0 | `2026-11-02T05:30:00Z` | `formatIst` | "02 Nov 2026, 11:00 AM IST" |
| NT-U-04 | P0 | `APP_BASE_URL=https://gatepass.coditas.com` | Build approval link | `https://gatepass.coditas.com/approvals/{id}`; no tokens in query |
| NT-U-05 | P0 | Visitor name `<script>alert(1)</script>` | Render | Escaped in HTML; no raw tag |
| NT-U-06 | P0 | Failure on attempt n = 1..4 | `nextSendAfter` | now + 1, 2, 4, 8 min; n = 5 → status FAILED |
| NT-U-07 | P0 | Any payload | Build | Contains no photo keys/URLs and no visitor phone number |

**Subjects (asserted in NT-U-02):**
| Template | Subject |
|---|---|
| visit-scheduled | `Visit scheduled: {visitor} on {date}` |
| approval-request | `Action needed: {visitor} is waiting at the gate` |
| approval-escalated | `Escalated: {visitor} waiting {minutes} min for {host}` |
| approval-decided-by-admin | `{admin} {approved\|rejected} your visitor {visitor}` |
| visitor-arrived | `{visitor} has checked in` |
| visitor-force-checked-out | `{visitor} was checked out by security` |

## Integration
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| NT-I-01 | P0 | Parametrized over NT-U-01 events | Trigger via real API calls | Exactly the expected `EmailOutbox` rows (template, to, PENDING) |
| NT-I-02 | P0 | Check-in with outbox insert forced to fail | Call | 500; visit unchanged; no outbox row (shared with SM-I-04) |
| NT-I-03 | P0 | Same (visitId, template, recipient) enqueued twice | Enqueue | One row (unique constraint, insert ignored) |
| NT-I-04 | P0 | PENDING row | Worker tick | Email in MailHog with correct to/subject/HTML/text; row SENT, sentAt set |
| NT-I-05 | P1 | Row `sendAfter` in the future | Worker tick | Not sent |
| NT-I-06 | P0 | SMTP returns 421 | Worker tick | attempts=1, lastError stored, sendAfter = now + 1 min, still PENDING |
| NT-I-07 | P0 | attempts = 4, SMTP down | Worker tick | attempts=5, FAILED |
| NT-I-08 | P0 | 50 PENDING rows, 2 worker instances | Run both ticks concurrently | Each email sent exactly once (`FOR UPDATE SKIP LOCKED`) |
| NT-I-09 | P1 | Escalation; admins carol, frank, inactive admin X | Escalate | 2 rows (no X) |
| NT-I-10 | P1 | FAILED row | carol `GET /admin/emails?status=FAILED` then `POST /admin/emails/:id/retry`; alice same | carol: listed, then PENDING with attempts=0; alice: 403 |

## Traceability
| Req | Tests |
|---|---|
| Events → emails table | NT-U-01, NT-I-01, NT-I-09 |
| NT-1 transactional outbox | NT-I-02 |
| NT-2 worker & backoff | NT-U-06, NT-I-04..08 |
| NT-3 templates, IST | NT-U-02, NT-U-03, NT-U-05 |
| NT-4 links, no tokens | NT-U-04 |
| NT-5 admin retry | NT-I-10, AD-C-06 |
| NT-6 idempotency | NT-I-03, UV-I-17 |
| Privacy (no photos/phone in emails) | NT-U-07 |
