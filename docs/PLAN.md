# Coditas Gate Pass — Development Plan

Requirements: [REQUIREMENTS.md](REQUIREMENTS.md). Module specs and test cases are in [specs/](specs/). Development is **test-driven**: see [specs/TESTING.md](specs/TESTING.md).

## Module Map
| # | Module | Spec | Test cases | Depends on |
|---|---|---|---|---|
| 00 | Architecture, data model, state machine | [specs](specs/00-architecture/specs.md) | [tests](specs/00-architecture/test-cases.md) | — |
| 01 | Auth & users | [specs](specs/01-auth-users/specs.md) | [tests](specs/01-auth-users/test-cases.md) | 00 |
| 02 | Planned visits | [specs](specs/02-planned-visits/specs.md) | [tests](specs/02-planned-visits/test-cases.md) | 01 |
| 03 | Unplanned visits & approvals | [specs](specs/03-unplanned-visits-approvals/specs.md) | [tests](specs/03-unplanned-visits-approvals/test-cases.md) | 02, 05 |
| 04 | Gate operations | [specs](specs/04-gate-operations/specs.md) | [tests](specs/04-gate-operations/test-cases.md) | 02, 07 |
| 05 | Notifications (email) | [specs](specs/05-notifications/specs.md) | [tests](specs/05-notifications/test-cases.md) | 00 |
| 06 | Admin & reports | [specs](specs/06-admin-reports/specs.md) | [tests](specs/06-admin-reports/test-cases.md) | 01–05, 07 |
| 07 | Media (photos) | [specs](specs/07-media/specs.md) | [tests](specs/07-media/test-cases.md) | 01 |
| 08 | End-to-end journeys | — | [tests](specs/08-e2e/test-cases.md) | all |

## TDD Workflow
For every story: take the test IDs from the module's **Traceability** table → write them failing (Unit → Integration → Component) → implement until green → refactor. E2E journeys are written at the **start** of the phase that completes them and must be green at phase exit. A phase's exit criteria = all its test IDs automated and green in CI.

## Phases

### Phase 0 — Foundation
- Monorepo (pnpm), `apps/web`, `apps/api`, `packages/shared`; ESLint/Prettier, Husky, commitlint.
- docker-compose: Postgres 16, MailHog (photo-storage emulator added in Phase 3).
- Prisma schema + first migration (spec 00), seed script (bootstrap admin, sample employees, a security user, sample visits).
- `VisitStateService` + transition table + unit tests (the core of the system).
- CI: lint → typecheck → unit → integration (Testcontainers Postgres) → build images.
- **Exit:** all `SM-*` tests green (00-architecture/test-cases.md). `docker compose up` gives a running web + API + DB.

### Phase 1 — Auth & Users (spec 01) + Email outbox core (spec 05 NT-1/2/7)
- Email outbox + worker (SMTP; MailHog locally — Docker image or the standalone Windows `MailHog.exe`, no admin needed), priority sending and payload scrubbing, `login-code` template.
- Email one-time-code sign-in for all roles (coditas.com only, hashed codes, expiry, attempt and rate limits), JIT provisioning, admin pre-registration of guards, JWT cookies, refresh rotation, per-request role/active check.
- Role guards, `/me`, route protection in the SPA, two-step login screen, role-based landing, gate "Switch guard".
- Admin user management screens. Bootstrap admin piyush.kere@coditas.com.
- `e2e/` Maven project: Playwright Java + TestNG + POM + Allure, BaseTest, TestApi, MailHogClient, first Page Objects (LoginPage, AdminUsersPage, GateDashboardPage shell).
- **Exit:** all `AU-*` tests plus NT-U-02..06, NT-I-03..08 and NT-I-11..12 green. E2E-07 and E2E-08 green.

### Phase 2 — Planned Visits (spec 02)
- Visit create/edit/cancel/meeting-over APIs, visitor lookup.
- My Visits list, form, detail with timeline.
- Visit transitions write to the outbox via `TransitionHook`; `visit-scheduled` template.
- **Exit:** all `PV-*` tests plus NT-U-01, NT-U-07 and NT-I-01..02 green. E2E-06 green.

### Phase 3 — Media + Gate Operations (specs 07, 04)
- Pick and wire a local S3-compatible emulator (MinIO no longer publishes images/binaries; candidates: SeaweedFS, Garage, LocalStack, or an in-process S3 mock for tests) for docker-compose, integration tests and no-Docker dev.
- Presigned uploads, verification, signed viewing, authorization.
- Gate dashboard (tablet-first), check-in wizard with camera + compression, check-out/force check-out.
- Socket.IO live refresh with polling fallback.
- `visitor-arrived` and `visitor-force-checked-out` emails.
- **Exit:** all `GO-*` tests plus MD-U-01..03, MD-I-01..09 and MD-I-14 green. E2E-01, 05, 09 and 10 green. Manual run on a real tablet.

### Phase 4 — Unplanned Visits & Approvals (spec 03)
- Security registration with host picker, duplicate guard.
- Host approval page/queue, withdraw.
- Escalation job, admin approval queue, end-of-day expiry job.
- Approval-related emails.
- **Exit:** all `UV-*` tests plus NT-I-09 green. E2E-02, 03 and 04 green.

### Phase 5 — Admin & Reports (spec 06) + retention (spec 07 MD-5..7)
- Dashboard stats and charts, visitor log with filters, CSV export, settings, email failure retry.
- Retention + orphan purge jobs.
- **Exit:** all `AD-*` tests plus MD-U-04, MD-I-10..13 and NT-I-10 green. E2E-11 and 12 green.

### Phase 6 — Hardening & Release
- Full E2E regression (08-e2e, including E2E-13 phone viewport), GO-P-01..03 and MD-I-15.
- Security review (OWASP ASVS L2 checklist), dependency scan, pen-test of the upload and auth flows.
- Load test: 200 concurrent users, 1,000 visits/day (k6).
- Accessibility audit (axe) on the employee portal.
- Infra: AWS ECS Fargate + RDS Postgres + S3 + SES, IaC (Terraform), staging + prod, backups, alerts.
- UAT with Facilities and the security team at Nyati, guard training, paper fallback SOP.
- **Exit:** UAT sign-off, go-live.

## Testing Strategy
| Level | Tool | Scope |
|---|---|---|
| Unit | Jest (api), Vitest + RTL (web) | State machine, validators, services, components |
| Integration | Jest + Supertest + Postgres (Testcontainers or embedded), S3 emulator from Phase 3 | Every API endpoint plus role matrix |
| Component | Vitest + React Testing Library + MSW | Forms, gate wizard, role routing |
| E2E | Playwright for Java + TestNG + Page Object Model, Allure reports (`e2e/` Maven project) | 13 journeys in 08-e2e, tablet + phone viewports |
| Non-functional | k6, axe, OWASP ZAP | Performance, a11y, security |

Coverage target: ≥ 80% lines on `apps/api`, 100% of state-machine transitions.
Every test ID in the `test-cases.md` files (e.g., `GO-I-07`) maps to at least one automated test whose name starts with that ID. ID format, fixtures and the fixed test clock are in [specs/TESTING.md](specs/TESTING.md).

## Definition of Done (per story)
Story's test IDs written first (red), then green · API documented in OpenAPI (Swagger at `/api/docs`) · audit events written · role checks covered by tests · reviewed PR · deployed to staging.

## Risks
| Risk | Mitigation |
|---|---|
| Gate Wi-Fi unreliable | Polling fallback, small compressed photos, idempotent check-in by version |
| Hosts ignore approval emails | Escalation to admins; future v2: Slack/Chat |
| Guards unfamiliar with the app | Large-button tablet UI, short training, UAT with real guards |
| Privacy complaints over ID photos | ID photo only (no numbers), restricted access, audited views, retention purge, consent notice at the gate |
| Guards' `@coditas.com` mailboxes not ready, or guards can't read email on duty (Q11) | IT creates guard mailboxes in Phase 1; confirm access on the gate tablet/phone during UAT. Fallback if needed: admin-issued one-time code |
| Login emails delayed or landing in spam | Priority sending (NT-7), SPF/DKIM for the SES sender domain, plain-text code in the subject so it shows in notifications |
| MinIO images and binaries discontinued (found in CI, 2026-11-03) | Removed from docker-compose in Phase 0; choose an S3-compatible emulator at the start of Phase 3. Production is unaffected (AWS S3) |
| Shared gate tablet left logged in across shifts | 8 h session cap, visible guard name, "Switch guard" button that returns to an empty login form |
