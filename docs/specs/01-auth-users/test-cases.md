# Test Cases — 01 Auth & User Management

Fixtures and conventions: [../TESTING.md](../TESTING.md). Sign-in is by **email one-time code**. Integration tests read the issued code from the `EmailOutbox` payload (before it is scrubbed) or inject a fixed code generator; E2E reads it from MailHog. All other tests log in via `POST /__test/login`.

## TDD Order
1. Pure rules: domain check, email normalisation, code generation/hashing/expiry/attempts, rate-limit window, token rotation, role-change policy (AU-U-*)
2. Code request & verify, JIT provisioning, pre-registration match (AU-I-01..08, AU-I-25..31)
3. Sessions, per-request role/active checks, logout (AU-I-09..14)
4. Directory search & admin user management (AU-I-15..23)
5. Role matrix (AU-I-21) — kept up to date as every module adds endpoints
6. UI (AU-C-*)

## Unit
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-U-01 | P0 | `alice@coditas.com`, `Alice@Coditas.COM` | `isCoditasEmail` | true |
| AU-U-02 | P0 | `x@gmail.com`, `x@coditas.com.evil.io`, `x@evil-coditas.com`, `x@sub.coditas.com`, `coditas.com`, `x@coditas.com@evil.io` | `isCoditasEmail` | false for all |
| AU-U-03 | P1 | `piyush.kere@coditas.com`, `guard_1@coditas.com` | `defaultNameFromEmail` | "Piyush Kere", "Guard 1" |
| AU-U-04 | P1 | " Guard1@Coditas.COM " | `normalizeEmail` | `guard1@coditas.com` |
| AU-U-05 | P0 | `RolesGuard` with `@Roles(ADMIN)` | EMPLOYEE / SECURITY / ADMIN | deny / deny / allow |
| AU-U-06 | P0 | Refresh token family F, token T1 rotated to T2 | T1 used again | Rejected and the whole family F revoked (reuse detection) |
| AU-U-07 | P0 | Only one active admin | Demote or deactivate that admin | `LAST_ADMIN` |
| AU-U-08 | P0 | Admin carol | carol deactivates carol | `SELF_DEACTIVATION` |
| AU-U-09 | P1 | Role change policy | Any role → any other role by an admin | Allowed unless AU-U-07/08 apply |
| AU-U-10 | P0 | `generateCode()` × 10,000 | — | Always exactly 6 digits incl. leading zeros (`/^\d{6}$/`); uses `crypto.randomInt`; no value > 25% more frequent than expected (rough uniformity) |
| AU-U-11 | P0 | code "123456", secret S | `hashCode` / `verifyCode` | Hash ≠ plain, deterministic for same input; verify true for "123456", false for "123457"; comparison is constant-time (`timingSafeEqual`) |
| AU-U-12 | P0 | Code issued 10:00:00, TTL 10 min | Check at 10:09:59 / 10:10:00 | valid / expired |
| AU-U-13 | P0 | Code with attempts 4 | 5th wrong attempt | Code invalidated; further checks fail even with the right code |
| AU-U-14 | P0 | 3 requests for one email at 10:00, 10:05, 10:10 | 4th at 10:14:59 / at 10:15:01 | 429 with retryAfter ≈ 1 s / allowed (sliding 15-min window) |

## Integration — Request & Verify Code
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-I-01 | P0 | — | `POST /auth/otp/request {email:"alice@coditas.com"}` | 202 generic message; one `LoginCode` row with `codeHash` (no plain code column); outbox `login-code` to alice, sent immediately (mailer receives it within 2 s; MailHog in E2E-07) |
| AU-I-02 | P0 | New email dave@coditas.com | request → verify with emailed code | 200 `{role:"EMPLOYEE", name:"Dave"}`; user created; cookies `access`/`refresh` httpOnly, Secure, SameSite=Lax; code `consumedAt` set |
| AU-I-03 | P1 | Existing carol (ADMIN) | request → verify | No duplicate user; role still ADMIN; lastLoginAt updated |
| AU-I-04 | P0 | eve (inactive) | request | 202 (same body as active user); **no** email and no LoginCode row; verify with any code → 401 `INVALID_CODE` |
| AU-I-05 | P0 | — | request with `x@gmail.com` / `x@coditas.com.evil.io` | 400 `DOMAIN_NOT_ALLOWED`; nothing stored or sent |
| AU-I-06 | P1 | `BOOTSTRAP_ADMIN_EMAIL=carol@coditas.com`, empty DB | Run seed | carol exists as ADMIN; first sign-in keeps ADMIN |
| AU-I-07 | P0 | guard3@coditas.com pre-registered as SECURITY, name "Guard Three" (DB row; admin API covered by AU-I-18) | guard3 request → verify | Same row (no duplicate): role SECURITY, name kept, lastLoginAt set |
| AU-I-08 | P1 | Pre-registered `guard3@coditas.com` | Request/verify using `Guard3@Coditas.com` | Matched case-insensitively to the same user |
| AU-I-25 | P0 | Valid code | verify with wrong code ×5, then the right code | First 5 → 401 `INVALID_CODE`; 6th (right code) → 401; `invalidatedAt` set |
| AU-I-26 | P0 | Code issued at 10:00 | Clock 10:10:00 → verify | 401 `INVALID_CODE` |
| AU-I-27 | P0 | Code already used to sign in | verify again with the same code | 401 `INVALID_CODE` |
| AU-I-28 | P0 | Code C1 issued, then a second request issues C2 | verify C1 / C2 | 401 / 200 |
| AU-I-29 | P0 | alice requested 3 codes in 15 min | 4th request | 429 `TOO_MANY_REQUESTS` with `retryAfterSeconds`; no email sent |
| AU-I-30 | P1 | 20 requests from one IP for different emails in 15 min | 21st | 429 |
| AU-I-31 | P0 | Code sent | Inspect outbox row and captured logs | Outbox `payload.code` removed after SENT; the 6-digit code appears in no log line |
| AU-I-24 | P0 | `NODE_ENV=production` | `POST /__test/login` | 404 (route not registered); see also SM-I-13 |
| AU-I-21a | P0 | Anonymous | `GET /me`, `POST /auth/refresh`, `POST /auth/otp/request` | 401 / 401 / 202 (first rows of the AU-I-21 matrix; the full matrix comes with slice 4) |

## Integration — Sessions
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-I-09 | P0 | Access token expired (clock + 16 min) | `GET /me` → 401; `POST /auth/refresh` | Refresh 200 with new cookies; `/me` now 200 |
| AU-I-10 | P1 | Refresh token older than 8 h | refresh | 401 |
| AU-I-11 | P0 | Old refresh token reused after rotation | refresh | 401; all tokens of that family revoked |
| AU-I-12 | P0 | guard1 logged in; guard1 deactivated (directly in the DB; the admin-API path is covered by AU-I-19) | guard1 `GET /me` (`/gate/today` added in Phase 3) | 401 on the very next request; refresh also 401 |
| AU-I-13 | P0 | bob (EMPLOYEE) logged in; bob changed → SECURITY | bob `GET /me` (later also `GET /gate/today` / `POST /visits` → 200 / 403) | New role on the very next request, without re-login |
| AU-I-14 | P0 | guard1 logged in, a visit CHECKED_IN | `POST /auth/logout` | Cookies cleared; refresh family revoked; `/me` 401; visit still CHECKED_IN (Q5) |
| AU-I-32 | P1 | alice logged in | `PATCH /me {name:"Alice H."}` / `{name:"A"}` | 200 updated / 400 |

## Integration — Directory & Admin User Management
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-I-15 | P0 | 15 employees named "Pi…", eve inactive, guards | guard1 `GET /users/search?q=pi` | ≤ 10 results, case-insensitive match on the start of any word of the name or the start of the email (`ker` finds "Piyush Kere", `yus` doesn't), no SECURITY, no inactive |
| AU-I-16 | P1 | — | `q=p` | 400 `QUERY_TOO_SHORT` |
| AU-I-17 | P0 | alice | `GET /users/search?q=bo` | 403 |
| AU-I-18 | P0 | carol | `POST /admin/users {email:"guard3@coditas.com", name:"Guard Three", role:"SECURITY"}` | 201, lastLoginAt null, createdById carol, audit row; again → 409 `USER_EXISTS`; `x@gmail.com` → 400 `DOMAIN_NOT_ALLOWED` |
| AU-I-19 | P0 | carol | `PATCH /admin/users/alice {role:"ADMIN"}`, then back to EMPLOYEE; `PATCH bob {isActive:false}` | 200 each; audit rows `{before:{role}, after:{role}}`; bob's next request → 401 |
| AU-I-20 | P0 | carol is the only admin | `PATCH carol {role:"EMPLOYEE"}` / `{isActive:false}` | 422 `LAST_ADMIN` / 422 `SELF_DEACTIVATION` |
| AU-I-22 | P1 | 30 users | `GET /admin/users?role=SECURITY&active=true&page=1` | Only active guards; pagination metadata; pre-registered users flagged `notSignedInYet:true` |
| AU-I-23 | P1 | guard1 (SECURITY) | `POST /visits` (create planned visit) | 403 (security cannot host). **Written in Phase 2** with `POST /visits`; also a row in the AU-I-21 matrix |

## Integration — Role Matrix (shared, parametrized)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-I-21 | P0 | Table of every endpoint × {anonymous, EMPLOYEE, SECURITY, ADMIN} → expected status | Call each | Status matches the table. Anonymous → 401 everywhere except `/auth/*` and `/health`. **Every new endpoint must be added to `apps/api/src/auth/role-matrix.int-spec.ts`.** |

## Component (UI)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-C-01 | P0 | `/login` | Enter `alice@coditas.com` → Send code | Moves to code step showing the email; "Resend code" disabled for 30 s with countdown |
| AU-C-02 | P1 | `/login` | Enter `x@gmail.com` | Inline "Use your Coditas email (@coditas.com)"; no request sent |
| AU-C-03 | P0 | Code step | Type or paste "123456" | Auto-submits once 6 digits are present; non-digits ignored; numeric keypad (`inputmode="numeric"`, `autocomplete="one-time-code"`) |
| AU-C-04 | P1 | API returns 401 / 429 | Submit code / request code | "That code is invalid or expired." / "Too many attempts. Try again in N minutes." |
| AU-C-05 | P0 | Not logged in | Open `/visits/new` | Redirect to `/login?returnTo=/visits/new`; after sign-in returns there |
| AU-C-06 | P0 | `/me` role EMPLOYEE / SECURITY / ADMIN | Open `/` | Lands on `/my-visits` / `/gate` / `/admin` |
| AU-C-07 | P0 | SECURITY user | Open `/my-visits` or `/visits/new` | "Not authorized" page with a link to `/gate` |
| AU-C-08 | P1 | Admin users page | "Add user" with email + name + role SECURITY | POST sent; row appears with "Not signed in yet" badge; invalid domain shows inline error |
| AU-C-09 | P1 | Admin users page | Change role via dropdown / toggle active | Confirm dialog → PATCH → row updates; `LAST_ADMIN` error shown as a toast |
| AU-C-10 | P1 | Gate screen | Render header; tap "Log out / Switch guard" | Guard name visible; logout → `/login` with an empty email field |
| AU-C-11 | P2 | Login + admin users pages | axe scan | 0 violations |

## Traceability
| Req | Tests |
|---|---|
| AU-1 email-code sign-in, coditas only | AU-U-01, AU-U-02, AU-I-01, AU-I-05, AU-C-01, AU-C-02 |
| AU-2 JIT provisioning | AU-U-03, AU-I-02, AU-I-03 |
| AU-3 pre-registration | AU-U-04, AU-I-07, AU-I-08, AU-I-18, AU-I-22, AU-C-08 |
| AU-4 role management | AU-U-07..09, AU-I-19, AU-I-20, AU-C-09 |
| AU-5 per-request role check | AU-I-12, AU-I-13 |
| AU-6 tokens | AU-U-06, AU-I-09..11 |
| AU-7 deactivation | AU-I-04, AU-I-12 |
| AU-8 bootstrap admin | AU-I-06 |
| AU-9 logout doesn't affect visits | AU-I-14 |
| AU-10 security can't host | AU-I-15, AU-I-23, UV-I-03 |
| AU-11 directory search | AU-I-15..17 |
| AU-12 gate switch guard | AU-C-10 |
| AU-13 test login only in test env | AU-I-24, SM-I-13 |
| AU-14 code rules | AU-U-10..13, AU-I-25..28, AU-C-03, AU-C-04 |
| AU-15 rate limits | AU-U-14, AU-I-29, AU-I-30 |
| AU-16 no enumeration | AU-I-04 |
| AU-17 immediate send, scrubbed, not logged | AU-I-01, AU-I-31, NT-I-11 |
| Profile name | AU-I-32 |
| Role-based access (all modules) | AU-U-05, AU-I-21, AU-C-05..07 |
