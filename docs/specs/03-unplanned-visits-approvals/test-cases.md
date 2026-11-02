# Test Cases — 03 Unplanned Visits & Approvals

Fixtures and conventions: [../TESTING.md](../TESTING.md). Clock: Mon 2026-11-02 10:00 IST. `approval.escalationMinutes` = 10 unless stated.

## TDD Order
1. Pure selectors & permission rules (UV-U-*)
2. Registration by security (UV-I-01..07)
3. Host decisions (UV-I-08..14)
4. Escalation job + admin decisions + concurrency (UV-I-15..22)
5. Withdraw & end-of-day expiry (UV-I-23..26)
6. UI (UV-C-*)

## Unit
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| UV-U-01 | P0 | Unplanned payload without `hostId` | validate | fail `HOST_REQUIRED` |
| UV-U-02 | P0 | PENDING requested at 09:50:00 / 09:50:01, not escalated; clock 10:00 | `selectForEscalation(10)` | First selected (exactly 10 min); second not |
| UV-U-03 | P0 | PENDING already escalated; APPROVED older visit | select | Neither selected |
| UV-U-04 | P0 | Decision policy | host / admin (not escalated) / admin (escalated) / admin who is the host / other employee | allow / deny `NOT_ESCALATED` / allow / allow / deny |
| UV-U-05 | P0 | Today: rahul PENDING; meera CHECKED_OUT | `findActiveDuplicate(phone)` | rahul → match; meera → none |
| UV-U-06 | P1 | Visit dated 2026-11-01 PENDING; one dated 11-02 PENDING | `selectExpired(now=11-02 00:05 IST)` | Only 11-01 |
| UV-U-07 | P1 | Reject reason 200 / 201 chars | validate | ok / fail |

## Integration — Registration
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| UV-I-01 | P0 | guard1 | `POST /visits/unplanned` rahul, host alice, purpose CLIENT_MEETING, 60 min | 201: type UNPLANNED, status PENDING_APPROVAL, visitDate 2026-11-02, expectedArrival = now, createdById guard1, hostId alice, approvalRequestedAt = now |
| UV-I-02 | P1 | guard1 | Body has `visitDate: 2026-11-05` | Ignored → today |
| UV-I-03 | P0 | guard1 | Missing hostId / unknown uuid / eve (inactive) / guard2 as host | 400 / 422 `HOST_INVALID` ×3 |
| UV-I-04 | P0 | alice / carol | `POST /visits/unplanned` | 403 (security only) |
| UV-I-05 | P0 | guard1 creates | — | `CREATED` event (actor guard1); outbox `approval-request` to alice; WebSocket to `user:alice` |
| UV-I-06 | P0 | rahul already PENDING today | guard1 registers rahul again | 409 `DUPLICATE_ACTIVE_VISIT` with `existingVisitId` |
| UV-I-07 | P1 | Same as UV-I-06 | Resubmit with `confirmDuplicate:true` | 201 new visit |

## Integration — Host Decisions
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| UV-I-08 | P0 | 2 pending for alice, 1 for bob, 1 escalated for bob | `GET /approvals/pending` as alice / bob / carol | 2 / 2 / 1 (escalated only; carol hosts none) |
| UV-I-09 | P0 | PENDING v0 | alice approve `{version:0}` | APPROVED, decidedById alice, decidedAt; `APPROVED` event; WebSocket to `security` |
| UV-I-10 | P0 | PENDING | alice reject `{reason:"Not expected"}` | REJECTED, rejectionReason; `REJECTED` event |
| UV-I-11 | P1 | PENDING | Reject without reason | REJECTED, reason null |
| UV-I-12 | P1 | PENDING | Reject reason 201 chars | 400 |
| UV-I-13 | P0 | alice's PENDING | bob approve | 403 |
| UV-I-14 | P0 | alice's PENDING, not escalated | carol approve | 403 `NOT_ESCALATED` |

## Integration — Escalation & Admin Decisions
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| UV-I-15 | P0 | PENDING requested 10:00 | Clock 10:09:59 → run job | Not escalated |
| UV-I-16 | P0 | Same | Clock 10:10:00 → run job | escalatedAt set; `ESCALATED` event (actor null); outbox `approval-escalated` to carol and frank only (not inactive admins) |
| UV-I-17 | P0 | Escalated | Run job again | No new event, no new emails |
| UV-I-18 | P0 | Escalated | carol approve | APPROVED, decidedById carol; outbox `approval-decided-by-admin` to alice |
| UV-I-19 | P0 | Escalated | alice approve (host still allowed) | APPROVED; no admin-decided email |
| UV-I-20 | P0 | Escalated v0 | alice reject and carol approve at the same time | One 200, one 409 `ALREADY_DECIDED` with `decidedBy` name; single decision event |
| UV-I-21 | P1 | APPROVED | approve again | 409 |
| UV-I-22 | P1 | Setting changed to 5 min | PENDING requested 5 min ago → run job | Escalated |

## Integration — Withdraw & Expiry
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| UV-I-23 | P1 | PENDING | guard1 `POST /withdraw` | REJECTED, rejectionReason "Withdrawn by security", decidedById guard1 |
| UV-I-24 | P1 | APPROVED | withdraw | 409 |
| UV-I-25 | P1 | PENDING dated 11-01 and PENDING dated 11-02; clock 11-02 00:05 IST | Expiry job | 11-01 → REJECTED "Expired" (actor null); 11-02 untouched |
| UV-I-26 | P1 | Expired visit | alice approve | 409 |

## Component (UI)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| UV-C-01 | P0 | Security unplanned form | Type "a" then "al" in host picker | No request for "a"; debounced (300 ms) request for "al"; options show name + email |
| UV-C-02 | P0 | Form without host | — | Submit disabled |
| UV-C-03 | P1 | API 409 DUPLICATE_ACTIVE_VISIT | Submit | Dialog "Rahul already has an active entry today" with "View entry" and "Register anyway" |
| UV-C-04 | P0 | Host on `/approvals/:id` | Render | Visitor name, company, purpose, waiting time, Approve / Reject |
| UV-C-05 | P0 | Host | Click Reject | Reason dialog (optional, 200-char counter) → confirm sends request |
| UV-C-06 | P1 | Already decided visit | Open approval page | Read-only "Approved by Carol at 10:12"; no buttons |
| UV-C-07 | P1 | Gate card PENDING requested 12 min ago, escalated | Render | "Waiting 12 min" + "Escalated" badge; timer ticks each minute |
| UV-C-08 | P0 | Logged out | Open `/approvals/:id` from email | Login → returns to the same approval page |
| UV-C-09 | P1 | My Visits for alice | New pending request arrives via socket | "Pending approvals" section shows it with a count badge |

## Traceability
| Req | Tests |
|---|---|
| UV-1 registration | UV-U-01, UV-I-01..04, UV-C-01, UV-C-02 |
| UV-2 host email | UV-I-05, NT-I-01, UV-C-08 |
| UV-3 approve / reject | UV-U-07, UV-I-09..13, UV-C-04..06 |
| UV-4 security sees decision live | UV-I-09, GO-C-01, E2E-02, E2E-03 |
| UV-5 escalation job | UV-U-02, UV-U-03, UV-I-15..17, UV-I-22 |
| UV-6 admin decision, first wins | UV-U-04, UV-I-14, UV-I-18..21 |
| UV-7 withdraw | UV-I-23, UV-I-24 |
| UV-8 duplicate guard | UV-U-05, UV-I-06, UV-I-07, UV-C-03 |
| UV-9 end-of-day expiry | UV-U-06, UV-I-25, UV-I-26 |
| UV-10 elapsed / escalated badge | UV-C-07 |
