# Testing Conventions & TDD Workflow

Every module folder has a `specs.md` (what to build) and a `test-cases.md` (how to prove it). The test cases are written **before** the code.

## 1. TDD Loop (per story)
1. Pick the story's requirement IDs (e.g., `PV-4`) and find the mapped test IDs in that module's **Traceability** table.
2. **Red:** write the tests in this order: Unit → Integration (API + DB) → Component (UI). Run them and confirm they fail for the right reason.
3. **Green:** write the minimum code to pass.
4. **Refactor:** clean up with all tests green.
5. E2E journeys (`08-e2e/test-cases.md`) are written at the start of the phase that completes them and stay red until that phase ends.
6. A PR is mergeable only if every test ID in the story is automated and green.

## 2. Test ID Format
`<MODULE>-<LAYER>-<NN>`, e.g. `GO-I-07`.

| Module | Prefix | | Layer | Code | Tool |
|---|---|---|---|---|---|
| 00 Architecture / state machine | SM | | Unit | U | Jest (api), Vitest (web/shared) |
| 01 Auth & users | AU | | Integration (API + real DB) | I | Jest + Supertest + Testcontainers (Postgres, MinIO), MailHog |
| 02 Planned visits | PV | | Component (UI) | C | Vitest + React Testing Library + MSW |
| 03 Unplanned & approvals | UV | | Performance | P | k6, Lighthouse |
| 04 Gate operations | GO | | End-to-end | E | Playwright for Java + TestNG + Page Object Model + Allure (separate Maven project `e2e/`) |
| 05 Notifications | NT | | | | |
| 06 Admin & reports | AD | | | | |
| 07 Media | MD | | | | |
| 08 E2E journeys | E2E | | | | |

The test name in code always starts with the ID so CI reports can be traced back:
```ts
it('[PV-I-03] reuses existing Visitor when phone matches', async () => { ... });
```
```java
// e2e (Java/TestNG/Allure)
@Test(testName = "E2E-01", description = "[E2E-01] Planned visitor happy path")
@Severity(SeverityLevel.BLOCKER) @Feature("Planned visits") @AllureId("E2E-01")
public void plannedVisitorHappyPath() { ... }
```
Allure severity mapping: P0 → BLOCKER/CRITICAL, P1 → NORMAL, P2 → MINOR.

**Priority:** P0 = blocks release (core flow, security, data integrity) · P1 = must have for v1 · P2 = nice to have / polish.

## 3. Standard Fixtures (seeded by `test/fixtures.ts`)

**Fixed clock:** "now" = **Mon 2026-11-02 10:00 IST** (`2026-11-02T04:30:00Z`) unless a test says otherwise. Use `jest.useFakeTimers()` / an injectable `Clock` service. Never call `new Date()` directly in production code.

All users are `@coditas.com` accounts that sign in with an email one-time code (no passwords).

| Key | Email | Role | Notes |
|---|---|---|---|
| `alice` | alice@coditas.com | EMPLOYEE | Default host |
| `bob` | bob@coditas.com | EMPLOYEE | "Other employee" for 403 checks |
| `carol` | carol@coditas.com | ADMIN | Used as `BOOTSTRAP_ADMIN_EMAIL` in tests (prod: piyush.kere@coditas.com) |
| `frank` | frank@coditas.com | ADMIN | Second admin (escalation fan-out) |
| `eve` | eve@coditas.com | EMPLOYEE | `isActive=false` |
| `guard1` | guard1@coditas.com | SECURITY | |
| `guard2` | guard2@coditas.com | SECURITY | Concurrency tests |
| `guard3` | guard3@coditas.com | — | Not seeded; created by pre-registration tests |

| Visitor | Phone | Company |
|---|---|---|
| `rahul` | +919876543210 | Acme Corp |
| `meera` | +919812345678 | — |

**Factories:** `makeVisit({ type, status, host, visitDate, expectedArrival, ... })`, `uploadTestPhoto(kind, uploader)`, `loginAs(fixtureKey)` → Supertest agent with cookies.

**Fake media:** `test/assets/face.jpg` (valid JPEG 1.2 MB, 4000×3000, has EXIF GPS), `id.png`, `fake.pdf.jpg` (PDF bytes, .jpg name), `big.jpg` (3 MB).

**Test-only auth:**
- Sign-in tests (AU-I-01..08, AU-I-25..31) exercise the real email-code flow; they read the code from the outbox payload (or inject a fixed code generator). E2E-07 reads it from MailHog.
- All other API and E2E tests log in with `POST /__test/login {email}`, which issues the same session cookies as a real login. The route is registered only when `NODE_ENV=test`. Tests `SM-I-13` and `AU-I-24` prove it is absent otherwise.
- A real sign-in with a code delivered via SES is checked manually once per release on staging (smoke checklist).

**E2E project (`e2e/`, Maven):**
```
e2e/
  pom.xml                     playwright (Java), testng, allure-testng, aspectj weaver, rest-assured, jackson
  testng.xml                  suites: smoke (P0), regression (all)
  src/test/java/com/coditas/gatepass/e2e/
    base/BaseTest.java        Playwright/Browser/Context lifecycle, fake-camera launch args, tracing; screenshot + trace + video attached to Allure on failure
    pages/                    Page Objects: LoginPage, MyVisitsPage, VisitFormPage, VisitDetailPage, ApprovalPage,
                              GateDashboardPage, CheckInWizardPage, UnplannedVisitPage, AdminDashboardPage,
                              AdminVisitLogPage, AdminUsersPage, AdminSettingsPage
    api/TestApi.java          /__test/login, /__test/clock, /__test/jobs/{name}, seed/reset (REST Assured)
    api/MailHogClient.java    read and assert emails
    tests/                    one class per journey group; test names start with the E2E ID
  src/test/resources/config.properties   baseUrl, apiUrl, mailhogUrl, headless, viewport presets
```
Run: `mvn test -Dsuite=smoke` / `-Dsuite=regression`, then `allure serve target/allure-results`. CI publishes the Allure report as a build artifact.

## 4. Rules
- Integration tests hit a real Postgres 16 and are isolated by truncation per test. `INT_DB=docker` uses Testcontainers (CI default); `INT_DB=embedded` runs Postgres as a plain process via `embedded-postgres` (no Docker or admin rights). Without `INT_DB`, Docker is used when reachable, otherwise embedded.
- No test depends on another test's data.
- Every API error test asserts **status code + error `code`**, not only the status.
- Every state-changing test also asserts the `VisitEvent` row and, where relevant, the `EmailOutbox` row.
- Role checks use the shared parametrized matrix (`AU-I-21`) so new endpoints must be added to it.
- Coverage gates in CI: `visit-state.machine.ts` 100% (unit), `packages/shared` ≥ 90% (unit). `VisitStateService` is covered by integration tests (SM-I-*). The `apps/api` ≥ 80% overall gate is added once feature modules exist (Phase 1+), measured over unit + integration runs.
