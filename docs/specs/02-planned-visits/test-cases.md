# Test Cases — 02 Planned Visits (Employee / Host)

Fixtures and conventions: [../TESTING.md](../TESTING.md). Clock: Mon 2026-11-02 10:00 IST.

## TDD Order
1. `CreateVisitSchema` / `UpdateVisitSchema` rules (PV-U-01..08)
2. Create + visitor upsert (PV-I-01..06)
3. Lists & detail (PV-I-07..10)
4. Edit / cancel / meeting over (PV-I-11..20)
5. Visitor lookup (PV-I-21..22)
6. UI (PV-C-*)

## Unit — Validation & Helpers
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| PV-U-01 | P0 | Valid payload: rahul, +919876543210, INTERVIEW, 2026-11-03 11:00, 60 min | validate | Passes |
| PV-U-02 | P0 | visitDate 2026-11-01 / 11-02 / 12-02 (+30) / 12-03 (+31) | validate | fail / ok / ok / fail |
| PV-U-03 | P0 | visitDate today, arrival 09:45 (now−15m) / 09:44 / 18:00 | validate | ok / fail `ARRIVAL_IN_PAST` / ok |
| PV-U-04 | P0 | duration 14 / 15 / 480 / 481 / 30.5 / "abc" | validate | fail / ok / ok / fail / fail / fail |
| PV-U-05 | P0 | purpose OTHER without note; OTHER + "Courier pickup"; INTERVIEW + note | validate | fail `PURPOSE_NOTE_REQUIRED` / ok / ok |
| PV-U-06 | P1 | notes 500 / 501 chars | validate | ok / fail |
| PV-U-07 | P1 | email absent / "a@b.co" / "not-an-email" | validate | ok / ok / fail |
| PV-U-08 | P1 | Old `{expectedArrival:11:00, notes:null}`, new `{expectedArrival:12:00, notes:null}` | `diffVisit` | `{expectedArrival:{from:"11:00",to:"12:00"}}` only |
| PV-U-09 | P1 | Visits on 11-01, 11-02, 11-05 | `classifyScope` (IST) | past / today / upcoming |

## Integration — Create
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| PV-I-01 | P0 | alice | `POST /visits` valid | 201: status SCHEDULED, type PLANNED, hostId = createdById = alice, code `GP-20261103-0001`, version 0 |
| PV-I-02 | P0 | alice | Body includes `hostId: bob` | Ignored, host = alice (or 400 for unknown field, per strict-schema decision; assert one) |
| PV-I-03 | P0 | rahul exists with company "Acme Corp" | Create with same phone, company "Acme Ltd" | No new Visitor row; visit linked to rahul; company updated |
| PV-I-04 | P0 | New phone | Create | New Visitor row with normalized phone |
| PV-I-05 | P0 | guard1 | `POST /visits` | 403 |
| PV-I-06 | P0 | alice | Create | `CREATED` event (actor alice); outbox `visit-scheduled` to alice |
| PV-I-23 | P1 | alice | Each invalid case from PV-U-02..07 via HTTP | 400 `VALIDATION_FAILED` with correct field |

## Integration — Read
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| PV-I-07 | P0 | alice has 2 today (11:00, 09:30), 1 upcoming, 1 past; bob has 1 today | `GET /visits/mine?scope=today` | alice's 2 only, sorted 09:30, 11:00 |
| PV-I-08 | P1 | 25 past visits | `scope=past&page=2` (size 20) | 5 items, `total=25`, sorted newest first |
| PV-I-09 | P0 | Visit of alice | GET `/visits/:id` as alice / bob / guard1 (today) / carol | 200 with timeline / 403 / 200 / 200 |
| PV-I-10 | P1 | — | Nonexistent uuid / "abc" | 404 / 400 |
| PV-I-22 | P0 | alice's visit CHECKED_IN with photos | GET as alice | `visitorPhotoUrl` present; `idPhotoUrl` **absent** |

## Integration — Edit / Cancel / Meeting Over
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| PV-I-11 | P0 | SCHEDULED v0 | alice PATCH arrival 12:00, version 0 | 200, version 1, `EDITED` event with diff |
| PV-I-12 | P0 | SCHEDULED v1 | PATCH with version 0 | 409 `VISIT_STALE` |
| PV-I-13 | P0 | CHECKED_IN | alice PATCH | 409 `VISIT_INVALID_TRANSITION` |
| PV-I-14 | P0 | alice's SCHEDULED | bob PATCH | 403 |
| PV-I-15 | P1 | SCHEDULED | PATCH visitDate to yesterday | 400 |
| PV-I-16 | P0 | SCHEDULED | alice cancel `{reason:"Rescheduled"}` | CANCELLED, cancelledAt, cancelReason, `CANCELLED` event; not in `/gate/today` |
| PV-I-17 | P1 | PENDING_APPROVAL (unplanned, host alice) | alice cancel | 409 (host must approve/reject instead) |
| PV-I-18 | P0 | CHECKED_IN | alice cancel | 409 |
| PV-I-19 | P0 | CHECKED_IN | alice `POST /meeting-over` | MEETING_OVER, meetingOverById alice; WebSocket `visit.updated` to room `security` |
| PV-I-20 | P0 | SCHEDULED; MEETING_OVER | meeting-over | 409 both (second click is not idempotent-success) |
| PV-I-24 | P1 | CHECKED_IN | carol meeting-over | 200 |
| PV-I-25 | P0 | CHECKED_IN | bob meeting-over | 403 |

## Integration — Visitor Lookup
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| PV-I-21 | P1 | rahul exists | `GET /visitors/lookup?phone=9876543210` as alice and as guard1 | 200 `{fullName, email, company}` (no visit history) |
| PV-I-26 | P1 | — | Unknown phone / partial "98765" / "abc" | 404 / 404 / 400 |

## Component (UI)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| PV-C-01 | P0 | New visit form | Submit empty | Inline errors on required fields; focus moves to the first error |
| PV-C-02 | P0 | Valid form | Submit | Button disabled + spinner; on 201 navigates to detail with success toast |
| PV-C-03 | P1 | Purpose select | Choose OTHER | Note field appears and is required |
| PV-C-04 | P1 | Phone field, lookup returns rahul | Blur | "Returning visitor: Rahul Sharma (Acme Corp) — Use details?" → accept fills fields; dismiss leaves them |
| PV-C-05 | P1 | Date picker | Open | Dates before today and after +30 are disabled |
| PV-C-06 | P1 | My Visits | Each tab, empty data | Correct rows; empty state "No visits" |
| PV-C-07 | P1 | Each VisitStatus | Render badge | Label + colour per spec 02 UI table |
| PV-C-08 | P0 | CHECKED_IN visit detail | Meeting Over → confirm | Optimistic badge MEETING_OVER; on 409 rolls back + error toast |
| PV-C-09 | P1 | SCHEDULED | Render detail | Edit & Cancel visible; Meeting Over hidden |
| PV-C-10 | P1 | Timeline events | Render | Ordered oldest→newest, actor name, IST time "02 Nov, 10:05 AM" |
| PV-C-11 | P1 | Edit form, server 409 `VISIT_STALE` | Save | "This visit was updated elsewhere" + Reload |
| PV-C-12 | P1 | Socket emits `visit.updated` for a listed visit | — | List refetches; badge updates without reload |
| PV-C-13 | P2 | Form + list | axe scan, keyboard-only flow | 0 violations; whole form completable by keyboard |

## Traceability
| Req | Tests |
|---|---|
| PV-1 create | PV-U-01, PV-I-01, PV-I-02, PV-I-05, PV-I-06, PV-C-01, PV-C-02 |
| PV-2 autofill | PV-I-03, PV-I-04, PV-I-21, PV-I-26, PV-C-04 |
| PV-3 code | PV-I-01, SM-U-22, SM-I-06 |
| PV-4 validation | PV-U-02..07, PV-I-23, PV-C-03, PV-C-05 |
| PV-5 My Visits | PV-U-09, PV-I-07, PV-I-08, PV-C-06, PV-C-12 |
| PV-6 edit/cancel | PV-U-08, PV-I-11..18, PV-C-09, PV-C-11 |
| PV-7 photo visibility | PV-I-22, MD-I-07 |
| PV-8 meeting over | PV-I-19, PV-I-20, PV-I-24, PV-I-25, PV-C-08 |
| PV-10 timeline | PV-I-09, PV-C-10 |
| PV-11 access | PV-I-09, PV-I-14, AU-I-21 |
