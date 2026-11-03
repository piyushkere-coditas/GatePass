# Coditas Gate Pass

Visitor management for the Nyati office: employees pre-register visitors, security checks them in and out at the gate with photos, and unplanned visitors need host approval.

- Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Plan and phases: [docs/PLAN.md](docs/PLAN.md)
- Module specs and TDD test cases: [docs/specs/](docs/specs/) (start with [TESTING.md](docs/specs/TESTING.md))

## Layout

| Path              | What                                                                              |
| ----------------- | --------------------------------------------------------------------------------- |
| `apps/api`        | NestJS API, Prisma (PostgreSQL)                                                   |
| `apps/web`        | React + Vite SPA                                                                  |
| `packages/shared` | Enums, validation, visit transition table, IST date helpers (used by api and web) |
| `infra/docker`    | Deployment images for AWS (Phase 6); not used for local dev                       |
| `e2e/`            | Playwright Java + TestNG + Allure (added in Phase 1)                              |

## Prerequisites

Node 22+ and pnpm 10. **No Docker needed**: Postgres runs as an embedded process for development and tests.

## Getting started

```bash
pnpm install
cp .env.example apps/api/.env

# database
pnpm db:dev                                     # embedded Postgres 16 on :5432 (keep it running)

pnpm --filter @gatepass/api exec prisma migrate deploy
pnpm --filter @gatepass/api db:seed

# email: local mailbox (no Docker, no download) — sign-in codes arrive here
pnpm mail:dev                                   # SMTP on :1025, inbox at http://localhost:8025

# run the apps
pnpm --filter @gatepass/api dev     # http://localhost:3000/health
pnpm --filter @gatepass/web dev     # http://localhost:5173
```

Sign in at http://localhost:5173 with any `@coditas.com` address and copy the 6-digit code from the inbox.
The seed creates `piyush.kere@coditas.com` (admin), `alice@` / `bob@` (employees) and `guard1@` (security).
Use Chrome, Edge or Firefox: session cookies are `Secure`, which these browsers allow on `http://localhost`.

## Tests (TDD)

Every test name starts with its ID from the module's `test-cases.md` (e.g. `[SM-U-03]`).

```bash
pnpm test:unit                          # all unit/component tests
pnpm --filter @gatepass/api test:cov    # API unit tests with coverage gates
pnpm --filter @gatepass/api test:int    # integration tests (starts its own embedded Postgres)
pnpm lint && pnpm typecheck
```
