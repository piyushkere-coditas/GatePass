# Spec 00 — Architecture, Data Model & Visit State Machine

## 1. System Overview

```
 Employee/Admin (desktop)        Security (tablet/phone)
          │                               │
          └──────── React SPA (Vite, TS) ─┘
                         │  HTTPS (REST + WebSocket for live refresh)
                  NestJS API (modular monolith)
        ┌────────┬───────┼──────────┬──────────────┐
     auth-users visits unplanned  gate-ops  media  notifications  admin-reports
        │                                     │           │
   PostgreSQL (Prisma)              S3 / MinIO (photos)  SMTP / SES (email)
        │
   Job scheduler (@nestjs/schedule): approval escalation, email outbox, photo purge
```

### Repo layout (monorepo, pnpm workspaces)
```
apps/web        React + Vite + TS, React Router, TanStack Query, React Hook Form + Zod, Tailwind (Coditas brand)
apps/api        NestJS, Prisma, email one-time-code auth + JWT cookies, Zod validation
packages/shared Zod schemas, enums (VisitStatus, Role, Purpose), API types shared by web and api
infra/          docker-compose (postgres, minio, mailhog), Dockerfiles, CI workflows
docs/           requirements, plan, specs
```

## 2. Data Model (Prisma, abbreviated)

```prisma
enum Role        { EMPLOYEE SECURITY ADMIN }
enum VisitType   { PLANNED UNPLANNED }
enum Purpose     { INTERVIEW CLIENT_MEETING VENDOR_DELIVERY PERSONAL OTHER }
enum VisitStatus { SCHEDULED PENDING_APPROVAL APPROVED REJECTED CHECKED_IN MEETING_OVER CHECKED_OUT CANCELLED }

model User {                       // everyone signs in with an email one-time code (no passwords)
  id String @id @default(uuid())
  email String @unique             // lower-cased @coditas.com address
  name String                      // set by admin on pre-registration, else derived from the email
  role Role @default(EMPLOYEE)
  isActive Boolean @default(true)
  lastLoginAt DateTime?            // null = pre-registered, not yet signed in
  createdById String?              // admin who pre-registered the user
  createdAt DateTime @default(now())
}

model LoginCode    { id, email, codeHash, expiresAt, attempts, consumedAt, invalidatedAt, requestIp, createdAt }
model RefreshToken { id, userId, familyId, tokenHash, expiresAt, revokedAt, createdAt }

model Visitor {                   // reused across visits for autofill
  id String @id @default(uuid())
  fullName String
  phone String @unique            // normalized E.164
  email String?
  company String?
}

model Visit {
  id String @id @default(uuid())
  code String @unique             // GP-YYYYMMDD-NNNN, shown to security
  type VisitType
  status VisitStatus
  visitorId String
  hostId String
  createdById String
  purpose Purpose
  purposeNote String?
  notes String?
  visitDate DateTime @db.Date      // IST date
  expectedArrival DateTime         // UTC
  expectedDurationMin Int
  // approval (unplanned)
  approvalRequestedAt DateTime?
  escalatedAt DateTime?
  decidedById String?
  decidedAt DateTime?
  rejectionReason String?
  // gate
  checkedInAt DateTime?  checkedInById String?
  visitorPhotoKey String? idPhotoKey String?
  photosPurgedAt DateTime?
  meetingOverAt DateTime? meetingOverById String?
  checkedOutAt DateTime? checkedOutById String?
  forcedCheckoutReason String?
  cancelledAt DateTime? cancelReason String?
  version Int @default(0)          // optimistic locking
  createdAt DateTime @default(now()) updatedAt DateTime @updatedAt
  @@index([visitDate, status]) @@index([hostId, visitDate])
}

model VisitEvent {                 // immutable audit trail
  id String @id @default(uuid())
  visitId String
  fromStatus VisitStatus?
  toStatus VisitStatus?
  action String                    // CREATED, EDITED, APPROVED, ESCALATED, PHOTO_VIEWED ...
  actorId String?                  // null = system job
  note String?
  createdAt DateTime @default(now())
}

model EmailOutbox { id, to, template, payload Json, status (PENDING|SENT|FAILED), attempts Int, lastError, sendAfter, createdAt }
model AppSetting  { key String @id, value Json, updatedById, updatedAt }
```

## 3. Visit State Machine

```
PLANNED:    SCHEDULED ──check-in──▶ CHECKED_IN ──meeting over──▶ MEETING_OVER ──check-out──▶ CHECKED_OUT
               │                         └──────────forced check-out (reason)─────────────────▲
               └─cancel─▶ CANCELLED

UNPLANNED:  PENDING_APPROVAL ──approve──▶ APPROVED ──check-in──▶ CHECKED_IN ... (same as planned)
               └──reject──▶ REJECTED
```

| Transition | Allowed actor | Guard |
|---|---|---|
| create → SCHEDULED | Employee/Admin | visitDate is today..+30d; arrival time in the future if visitDate is today |
| create → PENDING_APPROVAL | Security | host is an active Employee/Admin; visitDate = today |
| SCHEDULED → SCHEDULED (edit) | Host | not yet checked in |
| SCHEDULED → CANCELLED | Host, Admin | reason optional |
| PENDING_APPROVAL → APPROVED/REJECTED | Host; Admin only after escalation | first decision wins (optimistic lock) |
| SCHEDULED/APPROVED → CHECKED_IN | Security | visitDate = today (IST); both photos uploaded |
| CHECKED_IN → MEETING_OVER | Host, Admin | — |
| MEETING_OVER → CHECKED_OUT | Security | — |
| CHECKED_IN → CHECKED_OUT | Security | `forcedCheckoutReason` required (≥ 5 chars) |

All transitions go through a single `VisitStateService.transition(visit, action, actor, payload)`, which validates the guard, updates the visit in a transaction with a `version` check, writes a `VisitEvent`, emits a domain event (`visit.checked_in`, ...) for notifications and WebSocket, and returns **409 Conflict** on stale version or an illegal transition.

## 4. Cross-cutting Concerns
- **AuthZ:** `@Roles()` guard plus resource checks (the host may act only on their own visits).
- **Validation:** Zod schemas in `packages/shared`, used by the web forms and API pipes.
- **Errors:** RFC 7807 problem+json; error codes such as `VISIT_INVALID_TRANSITION`, `VISIT_STALE`.
- **Live refresh:** Socket.IO namespace `/live`; rooms `security`, `user:{id}`, `admin`. Payload is `{visitId, status}`; clients refetch through TanStack Query.
- **Config:** `.env` for secrets; `AppSetting` for runtime business settings.
- **Logging:** pino JSON logs with request id. No PII (phone/photo) in logs.
- **Security:** Helmet, CORS to the web origin only, API rate limiting (per user/IP), CSRF-safe (JWT in httpOnly SameSite=Lax cookie), file-type sniffing on uploads.

## 5. Acceptance Criteria
The full TDD suite is in [test-cases.md](test-cases.md).

- AC-ARCH-1: An illegal transition (e.g., CHECKED_OUT → CHECKED_IN) returns 409 and writes no event.
- AC-ARCH-2: Two concurrent approve/reject calls produce exactly one decision; the other gets 409.
- AC-ARCH-3: Every successful transition has exactly one matching `VisitEvent`.
- AC-ARCH-4: `docker compose up` starts the full local stack (db, minio, mailhog, api, web).
