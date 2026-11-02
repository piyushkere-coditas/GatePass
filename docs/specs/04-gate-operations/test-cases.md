# Test Cases — 04 Gate Operations (Security)

Fixtures and conventions: [../TESTING.md](../TESTING.md). Clock: Mon 2026-11-02 10:00 IST. Depends on media helpers (`uploadTestPhoto`) from module 07.

## TDD Order
1. Dashboard grouping/search, image compression, camera selection, connection fallback (GO-U-*)
2. `GET /gate/today` (GO-I-01..04)
3. Check-in incl. media verification and concurrency (GO-I-05..14)
4. Check-out / force check-out (GO-I-15..18)
5. UI (GO-C-*), then performance (GO-P-*)

## Unit
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| GO-U-01 | P0 | Visits in each status (today) | `groupForGate` | PENDING → Awaiting approval; SCHEDULED + APPROVED → Expected (sorted by arrival asc); CHECKED_IN → Inside; MEETING_OVER → Ready to exit; CHECKED_OUT + REJECTED → Exited/Rejected; CANCELLED excluded; counts correct |
| GO-U-02 | P1 | List with rahul (Acme, host alice, code …0007) | `filterGate("RAH")`, "43210", "0007", "alice" | Each returns rahul (case-insensitive name, phone suffix, code, host name) |
| GO-U-03 | P0 | `face.jpg` 4000×3000, 1.2 MB, EXIF GPS | `compressImage` | JPEG, longest side 1280, ≤ 500 KB, no EXIF |
| GO-U-04 | P1 | Step "visitor" / "id" | `getCameraConstraints` | `facingMode:"user"` / `"environment"` |
| GO-U-05 | P1 | `getUserMedia` rejects `NotAllowedError` / `NotFoundError` | `openCamera` | Returns `{fallback:"file"}` with reason |
| GO-U-06 | P1 | Live hook connected | Socket disconnects / reconnects | Polling every 15 s starts / stops; `online` flag toggles |
| GO-U-07 | P1 | Visit status CHECKED_IN / MEETING_OVER | `checkoutRequiresReason` | true / false |

## Integration — Dashboard
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| GO-I-01 | P0 | Today: 2 SCHEDULED, 1 APPROVED, 1 PENDING, 1 CHECKED_IN, 1 MEETING_OVER, 1 CHECKED_OUT, 1 CANCELLED | guard1 `GET /gate/today` | Grouped sections with counts 1/3/1/1/1; CANCELLED absent; each item has code, visitor, company, host name, arrival, status, version |
| GO-I-02 | P0 | Visits dated yesterday and tomorrow | `GET /gate/today` | Not included |
| GO-I-03 | P1 | — | `?q=acme` | Only visits whose visitor/company/host/code matches |
| GO-I-04 | P0 | alice / carol | `GET /gate/today` | 403 / 403 (admins use admin views) |

## Integration — Check-in
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| GO-I-05 | P0 | SCHEDULED today, guard1 uploaded VISITOR + ID photos | `POST /check-in {version, visitorPhotoKey, idPhotoKey}` | 200 CHECKED_IN; keys stored; uploads marked linked; `CHECKED_IN` event; outbox `visitor-arrived` to alice; WebSocket to `user:alice` and `security` |
| GO-I-06 | P0 | — | Missing `idPhotoKey` / missing `visitorPhotoKey` | 400 `VALIDATION_FAILED` |
| GO-I-07 | P0 | Photo uploaded by guard2 | guard1 uses it | 400 `INVALID_MEDIA` |
| GO-I-08 | P0 | ID upload key passed as visitorPhotoKey | check-in | 400 `INVALID_MEDIA` (kind mismatch) |
| GO-I-09 | P0 | Key never uploaded to storage | check-in | 400 `INVALID_MEDIA` |
| GO-I-10 | P1 | Upload created 31 min ago | check-in | 400 `INVALID_MEDIA` (expired upload) |
| GO-I-11 | P0 | Key already linked to another visit | check-in | 400 `INVALID_MEDIA` |
| GO-I-12 | P0 | PENDING / REJECTED / CHECKED_IN / CANCELLED | check-in | 409 `VISIT_INVALID_TRANSITION` |
| GO-I-13 | P0 | SCHEDULED for tomorrow | check-in | 409 `VISIT_NOT_TODAY` |
| GO-I-14 | P0 | APPROVED v0 | guard1 & guard2 check in concurrently (each with own photos) | One 200, one 409; one event; the loser's uploads stay unlinked (cleaned by orphan job) |

## Integration — Check-out
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| GO-I-15 | P0 | MEETING_OVER | guard1 check-out `{version}` | CHECKED_OUT, checkedOutById guard1, no reason; no force email |
| GO-I-16 | P0 | CHECKED_IN | check-out without reason | 400 `REASON_REQUIRED` |
| GO-I-17 | P0 | CHECKED_IN | check-out `{reason:"Visitor left via side exit"}` | CHECKED_OUT, forcedCheckoutReason stored; `FORCE_CHECKED_OUT` event; outbox `visitor-force-checked-out` to alice |
| GO-I-18 | P0 | SCHEDULED / CHECKED_OUT | check-out | 409 |
| GO-I-19 | P1 | Successful check-out v1→v2 | Same request replayed with version 1 | 409 `VISIT_STALE`; no duplicate event |
| GO-I-20 | P0 | Visit dated yesterday | guard1 `GET /visits/:id` | 403 (no history for security) |

## Component (UI)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| GO-C-01 | P0 | Dashboard data | Render | Sections in order with counts; "Ready to exit" highlighted; Exited collapsed by default |
| GO-C-02 | P1 | Search box | Type "acme" | Filters list client-side instantly; clear button resets |
| GO-C-03 | P0 | Check-in wizard | Steps | Step 1 shows details; "Next" disabled until a photo is captured on steps 2 and 3; Retake replaces photo; Confirm shows both thumbnails |
| GO-C-04 | P0 | Camera denied | Open step 2 | Message "Camera blocked — tap to use the device camera app" + file input with `capture` |
| GO-C-05 | P1 | Upload fails (500) | Confirm | Error with Retry; no check-in call until both uploads succeed |
| GO-C-06 | P0 | 409 on check-in | Confirm | "This visitor was already processed by another guard" + list refresh |
| GO-C-07 | P0 | MEETING_OVER card | Tap Check out | Simple confirm, no reason field |
| GO-C-08 | P0 | CHECKED_IN card | Tap "Force check-out" | Reason textarea required (min 5) before confirm enabled |
| GO-C-09 | P1 | Socket disconnected | — | "Offline — refreshing every 15 s" banner |
| GO-C-10 | P1 | Viewports 768×1024, 1024×768, 390×844 | Visual test (Playwright Java, `e2e/` project) | No horizontal scroll; all actions visible; snapshots match |
| GO-C-11 | P2 | Every button on gate screens | Measure | Hit area ≥ 44×44 px |
| GO-C-12 | P1 | Dashboard | Tap "New unplanned visitor" | Navigates to the unplanned form |

## Performance
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| GO-P-01 | P1 | 300 visits today | k6: 10 guards polling `/gate/today` | p95 < 300 ms server time |
| GO-P-02 | P1 | Lighthouse, "Fast 4G" throttle, mid-range tablet profile | Load `/gate` | Usable (LCP) < 2 s |
| GO-P-03 | P1 | Fast 4G throttle | Full check-in (2 uploads + API) | < 5 s |

## Traceability
| Req | Tests |
|---|---|
| GO-1 sections | GO-U-01, GO-I-01, GO-I-02, GO-C-01 |
| GO-2 search | GO-U-02, GO-I-03, GO-C-02 |
| GO-3 live/polling | GO-U-06, GO-C-09, E2E-11 |
| GO-4 wizard & camera | GO-U-04, GO-U-05, GO-C-03, GO-C-04 |
| GO-5 compression/upload | GO-U-03, GO-C-05, MD-I-01..05 |
| GO-6 check-in rules | GO-I-05..14, GO-C-06 |
| GO-7 host notified | GO-I-05, NT-I-01 |
| GO-8 check-out / force | GO-U-07, GO-I-15..19, GO-C-07, GO-C-08 |
| GO-9 unplanned entry | GO-C-12 |
| GO-10 tablet UX | GO-C-10, GO-C-11, GO-P-02 |
| GO-11 no history | GO-I-20, MD-I-07 |
| NFR performance | GO-P-01..03 |
