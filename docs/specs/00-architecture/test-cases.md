# Test Cases — 00 Architecture, State Machine & Cross-cutting

Fixtures and conventions: [../TESTING.md](../TESTING.md). Write these **first**. Every other module depends on them.

## TDD Order
1. Shared schemas & IST date helpers (SM-U-19..22)
2. Transition table + `VisitStateService` (SM-U-01..18)
3. Persistence, locking, events (SM-I-01..06)
4. Cross-cutting HTTP behaviour (SM-I-07..14)

## Unit — Visit State Machine (`VisitStateService`)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| SM-U-01 | P0 | PLANNED visit SCHEDULED, visitDate today, both photo keys | guard1 → `CHECK_IN` | Status CHECKED_IN, checkedInAt = now, checkedInById = guard1 |
| SM-U-02 | P0 | UNPLANNED visit APPROVED, today | guard1 → `CHECK_IN` | CHECKED_IN |
| SM-U-03 | P0 | Visit PENDING_APPROVAL | guard1 → `CHECK_IN` | Throws `VISIT_INVALID_TRANSITION` |
| SM-U-04 | P0 | CHECKED_IN, host alice | alice → `MEETING_OVER` | MEETING_OVER, meetingOverById = alice |
| SM-U-05 | P0 | CHECKED_IN, host alice | bob → `MEETING_OVER` | Throws `FORBIDDEN` |
| SM-U-06 | P1 | CHECKED_IN, host alice | carol (admin) → `MEETING_OVER` | MEETING_OVER |
| SM-U-07 | P0 | MEETING_OVER | guard1 → `CHECK_OUT` (no reason) | CHECKED_OUT, forcedCheckoutReason null |
| SM-U-08 | P0 | CHECKED_IN | guard1 → `CHECK_OUT` without reason | Throws `REASON_REQUIRED` |
| SM-U-09 | P1 | CHECKED_IN | `CHECK_OUT` reason "abcd" (4) / "abcde" (5) / "  abcd  " | 4 → `REASON_REQUIRED`; 5 → ok; whitespace trimmed, so 4 → error |
| SM-U-10 | P0 | SCHEDULED | `CANCEL` by alice / carol / guard1 / bob | alice ok, carol ok, guard1 `FORBIDDEN`, bob `FORBIDDEN` |
| SM-U-11 | P0 | PENDING_APPROVAL, host alice, not escalated | `APPROVE` by alice / carol | alice ok; carol `NOT_ESCALATED` |
| SM-U-12 | P0 | PENDING_APPROVAL, escalatedAt set | `APPROVE` by carol | APPROVED, decidedById = carol |
| SM-U-13 | P0 | PENDING_APPROVAL | alice → `REJECT` reason "Not expected" | REJECTED, rejectionReason stored |
| SM-U-14 | P0 | Each terminal status (CHECKED_OUT, CANCELLED, REJECTED) | Every action | `VISIT_INVALID_TRANSITION` (parametrized) |
| SM-U-15 | P0 | Full status × action matrix | Every pair **not** in spec 00 §3 table | `VISIT_INVALID_TRANSITION` (table-driven; the test reads the same transition table) |
| SM-U-16 | P0 | SCHEDULED, visitDate = tomorrow | `CHECK_IN` | `VISIT_NOT_TODAY` |
| SM-U-17 | P1 | SCHEDULED visitDate 2026-11-02; clock 2026-11-02 23:59 IST, then 2026-11-03 00:00 IST | `CHECK_IN` | 23:59 ok; 00:00 `VISIT_NOT_TODAY` |
| SM-U-18 | P0 | Any successful transition | — | Returns domain event with the correct name (`visit.checked_in`, `visit.meeting_over`, `visit.force_checked_out` for a CHECKED_IN check-out, etc.) |
| SM-U-23 | P0 | SCHEDULED today | `CHECK_IN` without one/both photo keys (or blank key); `CHECK_IN` by alice/carol | `PHOTOS_REQUIRED`; `FORBIDDEN` (security only) |
| SM-U-24 | P1 | PENDING_APPROVAL | `WITHDRAW` by guard1 / alice | REJECTED, reason "Withdrawn by security", decidedById guard1 / `FORBIDDEN` |
| SM-U-25 | P0 | PENDING_APPROVAL | `EXPIRE` with actor null / by carol; `APPROVE` with actor null | REJECTED "Expired", decidedById null / `FORBIDDEN`; `FORBIDDEN` |
| SM-U-26 | P0 | Any transition | — | Audit event `{action, fromStatus, toStatus, actorId, note}` (e.g., FORCE_CHECKED_OUT with the reason as note; system actions have actorId null) |
| SM-U-27 | P1 | SCHEDULED | `EDIT` by alice / bob / carol / guard1 | Allowed, status unchanged, empty patch / `FORBIDDEN` ×3 (only the host edits) |

## Unit — Shared Helpers & Schemas
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| SM-U-19 | P0 | `toIstDate()` | `2026-11-01T18:29:59Z` / `2026-11-01T18:30:00Z` | `2026-11-01` / `2026-11-02` |
| SM-U-20 | P0 | Phone normaliser | "98765 43210", "+91-98765-43210", "009198765 43210", "12345", "abc" | First three → `+919876543210`; last two invalid |
| SM-U-21 | P0 | Visitor name rule | length 1 / 2 / 100 / 101, "   " | 1 fail, 2 ok, 100 ok, 101 fail, blank fail |
| SM-U-22 | P1 | Visit code generator | date 2026-11-02, seq 7; seq 10000 | `GP-20261102-0007`; `GP-20261102-10000` (no truncation) |
| SM-U-28 | P0 | Shared `TRANSITIONS` table | Compare with a literal copy of spec 00 §3 | Exactly equal; terminal statuses have no outgoing transitions (guards SM-U-15, which derives from the table) |
| SM-U-29 | P0 | Shared enums | Compare with the enums parsed from `schema.prisma`; purpose labels | Identical values and order; labels match REQUIREMENTS Q3 |

## Integration — Persistence, Locking, Events
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| SM-I-01 | P0 | SCHEDULED visit v0 | Successful check-in | Visit row updated, `version`=1, exactly 1 `VisitEvent` (from SCHEDULED to CHECKED_IN, actor guard1) in the same transaction |
| SM-I-02 | P0 | Visit at version 1 | Transition sent with version 0 | 409 `VISIT_STALE`; no row change; no event |
| SM-I-03 | P0 | APPROVED visit | Two check-ins run concurrently (`Promise.all`) | Exactly one 200, one 409; one event |
| SM-I-04 | P0 | Outbox insert forced to throw | Transition | Whole transaction rolled back: status unchanged, no event |
| SM-I-05 | P0 | CHECKED_OUT visit | `POST /visits/:id/check-in` | 409 `application/problem+json` with `{type,title,status:409,code:"VISIT_INVALID_TRANSITION"}` |
| SM-I-06 | P1 | Empty day | 20 visits created in parallel | Codes `…-0001`..`…-0020`, all unique |

## Integration — Cross-cutting HTTP
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| SM-I-07 | P1 | Running API | `GET /health` | 200 `{db:"up",storage:"up"}`; when DB is stopped → 503 `db:"down"` |
| SM-I-08 | P0 | Invalid body (multiple bad fields) | Any POST | 400 `VALIDATION_FAILED` with `errors:[{field,message}]` listing every bad field |
| SM-I-09 | P0 | Request with `Origin: https://evil.com` | Any API call | No `Access-Control-Allow-Origin` header |
| SM-I-10 | P1 | Any response | — | Helmet headers present (`X-Content-Type-Options`, `Strict-Transport-Security`, CSP) |
| SM-I-11 | P0 | Log capture on | Create visit with phone +919876543210 | Phone number and photo keys do not appear in logs; request id present |
| SM-I-12 | P1 | Unknown route / malformed UUID | GET | 404 `NOT_FOUND` / 400 `VALIDATION_FAILED` |
| SM-I-13 | P0 | App booted with `NODE_ENV=production` | `POST /__test/login`, `/__test/clock`, `/__test/jobs/escalation` | 404 for all (test routes not registered) |
| SM-I-14 | P1 | CI | `docker compose up` smoke script | web 200, api `/health` 200 within 90 s |

## Traceability
| Requirement / AC | Tests |
|---|---|
| State machine table (spec 00 §3) | SM-U-01..18, SM-U-23..27 |
| AC-ARCH-1 illegal transition | SM-U-14, SM-U-15, SM-I-05 |
| AC-ARCH-2 concurrency | SM-I-02, SM-I-03 |
| AC-ARCH-3 one event per transition | SM-I-01, SM-I-04 |
| AC-ARCH-4 docker compose | SM-I-14 |
| Cross-cutting (errors, CORS, logging, timezone) | SM-U-19..22, SM-I-07..13 |
| Shared table/enums stay correct and in sync | SM-U-28, SM-U-29 |
