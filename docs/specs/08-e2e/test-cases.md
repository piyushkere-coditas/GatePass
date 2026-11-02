# Test Cases — 08 End-to-End Journeys (Playwright Java + TestNG + POM + Allure)

Fixtures, conventions and the `e2e/` project layout: [../TESTING.md](../TESTING.md).

**Setup:**
- **Stack:** the full stack runs via docker-compose (test profile). Each test class resets and seeds data through `TestApi` in `@BeforeClass`.
- **Login:** every role (employee, guard, admin) logs in through `TestApi.loginAs(email)`, which calls `POST /__test/login` and loads the cookies into the Playwright `BrowserContext`. Each actor gets its own context, so alice and guard1 run side by side in one test.
- **Camera:** Chromium is launched with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.
- **Emails:** asserted through `MailHogClient`.
- **Time-dependent jobs:** triggered through `POST /__test/clock` and `POST /__test/jobs/{name}`, which exist only when `NODE_ENV=test` (covered by SM-I-13 and AU-I-24).
- **Allure:** each journey is a `@Feature`, and steps are annotated with `@Step` in the Page Objects. On failure, a screenshot, the Playwright trace (.zip) and a video are attached.

| Test class | Journeys |
|---|---|
| `PlannedVisitTests` | E2E-01, E2E-05, E2E-06 |
| `UnplannedVisitTests` | E2E-02, E2E-03, E2E-04 |
| `AccessControlTests` | E2E-07, E2E-08 |
| `GateResilienceTests` | E2E-09, E2E-10, E2E-13 |
| `AdminTests` | E2E-11, E2E-12 |

Each journey is written at the **start** of the phase listed and must be green at the phase exit.

| ID | Pri | Phase | Journey | Key assertions |
|---|---|---|---|---|
| E2E-01 | P0 | 3 | **Planned happy path:** alice creates a visit for today → guard1 (tablet viewport) sees it under Expected → check-in wizard with fake camera → alice gets "has checked in" email and sees CHECKED_IN live → alice marks Meeting Over → guard1 sees "Ready to exit" → check out | Status at each step on both screens without reload; 1 email; timeline has 4 events |
| E2E-02 | P0 | 4 | **Unplanned → approved:** guard1 registers rahul for alice → alice opens the link from the MailHog email → approves → guard1 sees Check In enabled → check-in → MO → check-out | Approval email link works; live update to gate ≤ 3 s |
| E2E-03 | P0 | 4 | **Unplanned → rejected:** as above, alice rejects with reason | Gate shows Rejected + reason; check-in not possible |
| E2E-04 | P0 | 4 | **Escalation:** escalation = 1 min; guard1 registers; clock +1 min; run escalation job → carol & frank get emails → carol approves from `/admin/approvals` → alice gets "approved by Carol" email → guard checks in | Escalated badge on gate; alice can no longer decide (read-only) |
| E2E-05 | P0 | 3 | **Force check-out:** checked-in visitor, no MO; guard1 force checks out with reason | Reason mandatory; alice gets email; admin log shows "forced" flag |
| E2E-06 | P1 | 2 | **Cancel:** alice creates then cancels a visit | Disappears from gate dashboard |
| E2E-07 | P0 | 1 | **Guard onboarding with real email-code sign-in:** carol pre-registers guard3@coditas.com as SECURITY in Admin → Users → guard3 enters their email on `/login` → reads the 6-digit code from MailHog → enters it → lands on `/gate` → "Switch guard" logs out | Row shows "Not signed in yet" until first login; code email arrives within 2 s; guard3 blocked from `/my-visits` and `/visits/new`; guard name shown in the gate header; a wrong code shows an error |
| E2E-08 | P0 | 1 | **Role isolation:** alice opens `/gate` and `/admin` by URL; guard1 opens `/my-visits`, `/admin` | Redirected to own landing / "Not authorized" page; APIs return 403 |
| E2E-09 | P1 | 3 | **Two guards race:** guard1 and guard2 in two browser contexts check in the same visitor | One succeeds; other sees "already processed" and refreshed list |
| E2E-10 | P1 | 3 | **Gate offline:** block WebSocket route → offline banner → alice marks MO → gate updates within 15 s via polling → unblock → banner clears | No duplicate actions |
| E2E-11 | P1 | 5 | **Admin reporting:** after E2E-01..05 data, carol filters UNPLANNED today, exports CSV | CSV rows match on-screen list; time on premises computed |
| E2E-12 | P1 | 5 | **Retention:** retention 30 days, clock +31 days, run purge job → admin opens old visit | "Photo purged per retention policy"; metadata intact |
| E2E-13 | P2 | 6 | **Phone viewport:** E2E-01 gate steps at 390×844 | Passes unchanged |
