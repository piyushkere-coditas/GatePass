# CLAUDE.md — Coditas Gate Pass

Visitor gate-pass system for Coditas' Nyati office. Read [README.md](README.md) for setup.

## Source of truth

- Requirements & decisions: `docs/REQUIREMENTS.md` (all open questions resolved; §8).
- Plan & phase exit criteria: `docs/PLAN.md`. Check which phase we're in before starting work.
- Per module: `docs/specs/<NN-module>/specs.md` (what to build) and `test-cases.md` (how to prove it).
- Test conventions, fixtures, fixed clock: `docs/specs/TESTING.md`.

If code and specs disagree, raise it — don't silently diverge. When a spec gap is found, update the spec/test-cases in the same change.

## How we work: TDD

1. Take the story's test IDs from the module's **Traceability** table.
2. Write the tests first, run them, confirm they fail for the right reason (red).
3. Write the minimum code to pass (green), then refactor.
4. Every test name starts with its ID: `it('[PV-I-03] …')`. New cases get a new ID added to `test-cases.md`.
5. Order: unit → integration → component; E2E journeys are written at the start of their phase.

## Commands

```bash
pnpm test:unit                          # all unit/component tests
pnpm --filter @gatepass/api test:cov    # API unit + coverage gates (state machine must stay 100%)
pnpm --filter @gatepass/api test:int    # integration (real Postgres: Docker if available, else embedded)
pnpm lint && pnpm format:check && pnpm typecheck
pnpm db:dev                             # local Postgres without Docker (port 5432)
```

Run lint, typecheck and the affected tests before saying work is done.

## Architecture rules

- Monorepo (pnpm): `apps/api` (NestJS + Prisma/Postgres), `apps/web` (React + Vite), `packages/shared` (enums, Zod schemas, transition table, IST helpers). Shared logic goes in `packages/shared`, not duplicated.
- **Visit status changes only through `VisitStateService.transition()`**: it validates via the pure state machine (`visit-state.machine.ts`), applies an optimistic-lock version check, and writes exactly one `VisitEvent` in the same transaction. Side effects that must be atomic (email outbox) use `TransitionHook`.
- **Never `new Date()` in production code** — inject `Clock` (ESLint enforces). Business dates are IST (`toIstDate`); store UTC.
- Errors: throw `DomainError(code)`; the filter returns RFC 7807 `application/problem+json` with a stable `code`. Validate input with `ZodValidationPipe`.
- Enums in `apps/api/prisma/schema.prisma` and `packages/shared/src/enums.ts` must stay in sync.
- Test-only endpoints live under `/__test/*` and are registered only when `NODE_ENV=test`.
- No PII (phone numbers, photo keys) in logs or emails.

## Auth & roles

Everyone (employees, security guards, admins) signs in with Google Workspace (`@coditas.com`); no local passwords. Roles: EMPLOYEE, SECURITY, ADMIN. Bootstrap admin: `BOOTSTRAP_ADMIN_EMAIL`. Security users cannot host visits.

## Environment notes

- Windows dev machine without Docker: use `pnpm db:dev` and embedded Postgres for integration tests. `scripts/smoke.sh` (SM-I-14) needs Docker and runs in CI.
- E2E tests (Phase 1+): separate Maven project `e2e/` — Playwright Java + TestNG + Page Object Model + Allure.
- Commits follow Conventional Commits (commitlint); pre-commit runs lint-staged.
