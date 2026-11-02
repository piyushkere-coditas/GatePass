# Test Cases — 06 Admin & Reports

Fixtures and conventions: [../TESTING.md](../TESTING.md). Seed `reportSeed`: 30 days of visits (mixed type, purpose, host, status, some forced check-outs).

## TDD Order
1. Aggregations, filter parsing, CSV serializer, settings validation (AD-U-*)
2. Stats endpoints (AD-I-01..02)
3. Visitor log + export (AD-I-03..08)
4. Settings & admin overrides (AD-I-09..12)
5. UI (AD-C-*)

## Unit
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AD-U-01 | P0 | Today: 3 expected (SCHEDULED/APPROVED), 2 CHECKED_IN, 1 MEETING_OVER, 4 CHECKED_OUT, 2 PENDING (1 escalated) | `todayStats` | `{expected:3, inside:2, meetingOver:1, checkedOut:4, pending:2, escalated:1}` |
| AD-U-02 | P1 | Visits on only 5 of last 30 days | `trends(30)` | 30 entries, missing days = 0, planned/unplanned split |
| AD-U-03 | P1 | in 10:00, out 11:25 / out null | `timeOnPremises` | "1h 25m" / "" |
| AD-U-04 | P0 | Filters: none / from>to / range 367 days / unknown status | `parseLogFilters` | default last 7 days / error / error `RANGE_TOO_LARGE` / error |
| AD-U-05 | P0 | Values `Acme, Inc`, `He said "hi"`, multi-line note, `=HYPERLINK(...)`, `+91…`, `@x` | `toCsvRow` | RFC 4180 quoting; formula-leading values prefixed with `'` (CSV injection guard) |
| AD-U-06 | P0 | escalationMinutes 0/1/120/121; retentionDays 29/30/365/366 | validate settings | fail/ok/ok/fail; fail/ok/ok/fail |

## Integration
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AD-I-01 | P0 | Data as AD-U-01 | carol `GET /admin/stats/today` | Matches |
| AD-I-02 | P1 | reportSeed | `GET /admin/stats/trends?days=30` | 30 points; purpose breakdown sums to total; top hosts ≤ 10, sorted desc |
| AD-I-03 | P0 | reportSeed | `GET /admin/visits` with each filter alone: type, status, purpose, hostId, q (name/phone/company), forcedOnly | Every returned row matches; count equals DB query |
| AD-I-04 | P1 | reportSeed | Combined filters + `sort=checkedInAt:desc&page=2` | Correct subset, order, paging metadata |
| AD-I-05 | P0 | — | Range > 1 year | 400 `RANGE_TOO_LARGE` |
| AD-I-06 | P0 | Filter type=UNPLANNED last 7 days | `GET /admin/visits/export.csv` | `text/csv`, `Content-Disposition` filename `gatepass-visits-2026-10-27_2026-11-02.csv`; header row; rows = list result; IST timestamps; no photo columns |
| AD-I-07 | P1 | Export | — | Audit row `EXPORTED` with actor carol + filters |
| AD-I-08 | P1 | Filter matching 50,001 rows (bulk seed) | Export | 422 `EXPORT_TOO_LARGE` |
| AD-I-09 | P0 | carol | `PUT /admin/settings {escalationMinutes:5}` | 200; audit row; GET returns 5; invalid values → 400 |
| AD-I-10 | P0 | Setting = 5 | Escalation job (UV-I-22) | Uses 5 without restart |
| AD-I-11 | P1 | alice's SCHEDULED; bob's CHECKED_IN | carol cancel / carol meeting-over | 200 each; events actor carol |
| AD-I-12 | P0 | alice and guard1 | Every `/admin/*` endpoint | 403 (also in AU-I-21) |
| AD-I-13 | P0 | carol opens visit detail | `GET /visits/:id/photos/ID_PHOTO` | 302 + `PHOTO_VIEWED` event (see MD-I-07) |

## Component (UI)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AD-C-01 | P1 | Stats data / empty data | Render dashboard | Tiles + 3 charts / "No visits yet" empty states |
| AD-C-02 | P0 | Visitor log | Change filters | URL query params update; reload restores the same filters & results |
| AD-C-03 | P1 | Filters applied | Click Export | Download requested with the same filters |
| AD-C-04 | P1 | Settings form | Enter 0 / 200 minutes | Inline error; Save disabled |
| AD-C-05 | P1 | Admin visit detail with ID photo | Open photo | Notice "ID photo access is logged" shown |
| AD-C-06 | P1 | Failed emails page | Click Retry | Row moves to Pending |
| AD-C-07 | P2 | Admin screens | axe scan | 0 violations |

## Traceability
| Req | Tests |
|---|---|
| AD-1 dashboard | AD-U-01, AD-U-02, AD-I-01, AD-I-02, AD-C-01 |
| AD-2 visitor log | AD-U-03, AD-U-04, AD-I-03..05, AD-C-02 |
| AD-3 CSV export | AD-U-05, AD-I-06..08, AD-C-03 |
| AD-4 ID photo audit | AD-I-13, MD-I-07, AD-C-05 |
| AD-5 escalated approvals | UV-I-08, UV-I-18 |
| AD-6 users | AU-I-18..20, AU-I-22, AU-C-06, AU-C-07 |
| AD-7 settings | AD-U-06, AD-I-09, AD-I-10, AD-C-04 |
| AD-8 email failures | NT-I-10, AD-C-06 |
| AD-9 admin overrides | AD-I-11, SM-U-06, SM-U-10 |
| Admin-only access | AD-I-12, AU-I-21 |
