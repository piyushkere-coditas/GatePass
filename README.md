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
| `infra/docker`    | Dockerfiles and nginx config                                                      |
| `e2e/`            | Playwright Java + TestNG + Allure (added in Phase 1)                              |

## Prerequisites

Node 22+ and pnpm 10. Docker (Docker Desktop or Rancher Desktop) is **optional**: without it, Postgres runs as an embedded process and integration tests use it automatically.

## Getting started

```bash
pnpm install
cp .env.example .env && cp .env.example apps/api/.env

# database — pick one
pnpm db:dev                                                   # no Docker: embedded Postgres 16 on :5432 (keep running)
docker compose up -d postgres minio minio-init mailhog        # with Docker

pnpm --filter @gatepass/api exec prisma migrate deploy
pnpm --filter @gatepass/api db:seed

# run the apps
pnpm --filter @gatepass/api dev     # http://localhost:3000/health
pnpm --filter @gatepass/web dev     # http://localhost:5173
```

Full stack in containers: `docker compose up -d --build` → web on http://localhost:8080.

## Tests (TDD)

Every test name starts with its ID from the module's `test-cases.md` (e.g. `[SM-U-03]`).

```bash
pnpm test:unit                          # all unit/component tests
pnpm --filter @gatepass/api test:cov    # API unit tests with coverage gates
pnpm --filter @gatepass/api test:int    # integration tests: Testcontainers if Docker is up, else embedded Postgres
bash scripts/smoke.sh                   # docker compose smoke test (SM-I-14, needs Docker; runs in CI)
pnpm lint && pnpm typecheck
```
