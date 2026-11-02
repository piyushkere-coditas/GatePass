# Spec 04 — Gate Operations (Security)

## Purpose
Give security a tablet-friendly console to see incoming visitors, check them in with photos, and check them out.

## Functional Requirements
| ID | Requirement |
|---|---|
| GO-1 | The **Gate Dashboard** (`/gate`) shows today's (IST) visits in sections: **Awaiting approval**, **Expected** (SCHEDULED + APPROVED, sorted by arrival time), **Inside** (CHECKED_IN), **Meeting over – ready to exit** (MEETING_OVER, highlighted), **Exited / Rejected** (collapsed). |
| GO-2 | Search by visitor name, phone, visit code or host name. Section counts are shown. |
| GO-3 | Live updates via WebSocket. If the socket drops, fall back to polling every 15 s and show an "offline" indicator. |
| GO-4 | **Check-in wizard:** (1) verify details → (2) capture visitor photo → (3) capture ID photo → (4) confirm. Uses the device camera (`getUserMedia`, rear camera for the ID). Falls back to `<input type=file capture>`. Retake is allowed. |
| GO-5 | Photos are compressed client-side (JPEG, longest side 1280 px, ≤ 500 KB) and uploaded via media upload (spec 07) before the check-in call. |
| GO-6 | Check-in is allowed only for SCHEDULED/APPROVED visits whose visitDate = today. Both photo keys are required. The API checks that the keys exist in storage and belong to an upload made by this user. |
| GO-7 | On check-in, the host gets an email (spec 05) and their portal updates. |
| GO-8 | **Check out:** one tap with a confirmation for MEETING_OVER visits. For CHECKED_IN visits, the "Force check-out" dialog requires a reason (≥ 5 chars). |
| GO-9 | A visitor not in the list → "New unplanned visitor" button (spec 03). |
| GO-10 | Large touch targets (≥ 44 px), works in portrait and landscape on a 10" tablet and on a phone. |
| GO-11 | Security can view today's visit details, including both photos. Security has no history view beyond today (privacy). |

## API
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | /gate/today?q= | SECURITY | Grouped list with counts |
| POST | /visits/:id/check-in | SECURITY | `{version, visitorPhotoKey, idPhotoKey}` |
| POST | /visits/:id/check-out | SECURITY | `{version, reason?}`. reason required if status is CHECKED_IN |

## Key Acceptance Scenarios
The full TDD suite (unit, integration, UI, traceability) is in [test-cases.md](test-cases.md).

| TC | Scenario | Expected |
|---|---|---|
| GO-T1 | Planned visit for today | Appears under Expected with arrival time and host |
| GO-T2 | Planned visit for tomorrow | Not on the dashboard |
| GO-T3 | Check-in with both photos | CHECKED_IN; moves to Inside; host email queued |
| GO-T4 | Check-in without the ID photo | Confirm disabled in the UI; API returns 400 |
| GO-T5 | Check-in for a PENDING_APPROVAL visit | Button hidden; API returns 409 |
| GO-T6 | Check-in with a photo key uploaded by another user / nonexistent | 400 `INVALID_MEDIA` |
| GO-T7 | Camera permission denied | Falls back to file capture with a guidance message |
| GO-T8 | Host marks Meeting Over | Visit moves to "Ready to exit" with highlight within 3 s |
| GO-T9 | Check out a MEETING_OVER visit | CHECKED_OUT, checkout time recorded |
| GO-T10 | Force check-out without a reason | 400; with a reason → CHECKED_OUT and forcedCheckoutReason stored |
| GO-T11 | Search by code "GP-20261030-0007" | Single result |
| GO-T12 | Two guards check in the same visit at the same time | One succeeds, the other gets 409 and refreshes |
| GO-T13 | Network drop | Offline indicator; polling resumes; no duplicate check-in |
| GO-T14 | Layout on 768×1024 and 390×844 | No horizontal scroll; all actions reachable |
