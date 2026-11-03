# Spec 01 — Authentication & User Management

## Purpose
Let employees, security guards and admins sign in with a one-time code sent to their Coditas email, and enforce role-based access.

## Sign-in Flow (email one-time code)
1. User enters their `@coditas.com` email on `/login` → **Send code**.
2. API emails a **6-digit code** (valid 10 min, single use) and always answers with the same generic message.
3. User enters the code → API verifies it, creates the session (cookies) and returns the user.
4. The SPA routes by role: Employee → `/my-visits`, Security → `/gate`, Admin → `/admin`.

No Google/OAuth dependency and no passwords. Owning the `@coditas.com` mailbox is the proof of identity. Google SSO can be added later as an extra provider without changing anything after sign-in.

## Functional Requirements
| ID | Requirement |
|---|---|
| AU-1 | **Everyone** (Employee, Security, Admin) signs in with an **email one-time code**. Only `@coditas.com` addresses (exact domain match, case-insensitive) are accepted. There are no app-managed passwords. |
| AU-2 | On first successful verification, an unknown `@coditas.com` user is auto-provisioned with role EMPLOYEE (JIT provisioning). Their name defaults to the email local part (`piyush.kere` → "Piyush Kere") and can be edited by the user or an admin. |
| AU-3 | Admins can **pre-register** a user by email with a role (typically SECURITY for guards) and a display name before that person's first login. On first sign-in the pre-registered record is matched by email (case-insensitive). |
| AU-4 | Admins can change any user's role (EMPLOYEE / SECURITY / ADMIN) and deactivate or reactivate users. The last active admin cannot be demoted or deactivated (`LAST_ADMIN`). An admin cannot deactivate themselves (`SELF_DEACTIVATION`). All changes are audited. |
| AU-5 | Role and active status are checked on **every request**: the access token only identifies the session, and the user and session are re-read from the database each time (no cache), so role changes, deactivation and logout take effect immediately rather than at token expiry. |
| AU-6 | Session: JWT access token (15 min, HS256, cookie `access`, path `/`) + refresh token (cookie `refresh`, path `/auth`, stored as SHA-256 hash) in httpOnly Secure SameSite=Lax cookies. The session lasts at most **8 h from sign-in** (one shift); each refresh rotates the token but keeps that expiry. Reusing a rotated token revokes the whole session. |
| AU-7 | Deactivated users cannot sign in (no code is sent; verification fails), and their existing sessions are rejected. |
| AU-8 | The first admin is seeded from env `BOOTSTRAP_ADMIN_EMAIL` = **piyush.kere@coditas.com**. |
| AU-9 | Logout clears the session only. It never changes any visit status (Q5). |
| AU-10 | SECURITY users cannot host visits. They are excluded from the host directory and cannot create planned visits. |
| AU-11 | Employee directory search (used for the unplanned-visit host picker): case-insensitive match on the start of any word of the name or the start of the email, over active EMPLOYEE/ADMIN users, max 10, sorted by name. |
| AU-12 | The gate UI shows the signed-in guard's name and a prominent **Log out / Switch guard** button for shift changes on the shared tablet. |
| AU-13 | A test-only login endpoint `POST /__test/login {email}` (sets session cookies) exists for automated tests. It is **not registered** unless `NODE_ENV=test`. |
| AU-14 | **Code rules:** 6 digits from a cryptographically secure RNG; stored only as an HMAC-SHA256 hash (secret `OTP_SECRET`); expires 10 min after issue; single use; max **5** wrong attempts per code, after which the code is invalidated; requesting a new code invalidates any earlier unused code for that email. |
| AU-15 | **Abuse limits:** max **3** code requests per email per 15 min and **20** per IP per 15 min (429 with `retryAfterSeconds`). |
| AU-16 | **No enumeration:** `POST /auth/otp/request` returns the same 202 response for unknown, inactive and active `@coditas.com` emails (no email is sent to inactive users). Verification failures all return 401 `INVALID_CODE`. |
| AU-17 | The login-code email is sent **immediately** (priority outbox item, worker triggered on enqueue) and the plain code is **scrubbed** from the outbox payload once sent. Codes never appear in logs. |

## API
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /auth/otp/request | public | `{email}` → 202 `{message:"If this is a Coditas account, a code has been sent."}`; 400 for non-coditas domain; 429 when rate-limited |
| POST | /auth/otp/verify | public | `{email, code}` → 200 `{id, name, email, role}` + cookies; 401 `INVALID_CODE` |
| POST | /auth/refresh | cookie | Rotates tokens |
| POST | /auth/logout | any | Revokes the refresh token family, clears cookies |
| GET | /me | any | `{id, name, email, role}` |
| PATCH | /me | any | `{name}` (2–100 chars) |
| GET | /users/search?q= | SECURITY, ADMIN | Max 10 results, q ≥ 2 chars |
| GET | /admin/users?role=&active=&q=&page= | ADMIN | 20 per page: `{items, page, pageSize, total}`; each item has `notSignedInYet` |
| POST | /admin/users | ADMIN | Pre-register `{email, name, role}` |
| PATCH | /admin/users/:id | ADMIN | `{name?, role?, isActive?}` |

## Data
`LoginCode { id, email, codeHash, expiresAt, attempts, consumedAt, invalidatedAt, requestIp, createdAt }`. `User.googleSub` is removed.

## UI
- `/login`: step 1 email field + "Send code"; step 2 six-digit code input (numeric keypad, paste-friendly, auto-submit on 6 digits), "Resend code" after 30 s, "Use a different email". Messages for wrong domain, invalid/expired code, rate limit.
- Role-based landing as above. An Admin can switch to the employee view.
- Signed-out users opening a page go to `/login?returnTo=<path>` and return there after sign-in; only same-app paths are accepted (`//evil.com` is ignored). Pressing **Log out / Switch guard** goes to a plain `/login` with an empty email field, so the next guard never lands on the previous guard's page.
- The SPA calls the API under `/api` (Vite proxy locally, nginx in AWS); the refresh cookie is scoped to `/api/auth` (`PUBLIC_API_PREFIX`).
- `/admin/users`: list with role/status filters, an "Add user" dialog (email + name + role), a role dropdown and an activate/deactivate toggle, each with confirmation. A "Not signed in yet" badge shows for pre-registered users.

## Assumption
Guards can read their Coditas email on duty (phone or gate tablet) to receive the code. If not, a fallback (e.g. admin-issued code) is needed — see REQUIREMENTS §8.

## Key Acceptance Scenarios
The full TDD suite (unit, integration, UI, traceability) is in [test-cases.md](test-cases.md).

| TC | Scenario | Expected |
|---|---|---|
| AU-T1 | New `@coditas.com` user requests and enters a valid code | User created as EMPLOYEE, lands on `/my-visits` |
| AU-T2 | `someone@gmail.com` requests a code | 400 "Use your Coditas email"; no email sent |
| AU-T3 | Admin pre-registers guard3@coditas.com as SECURITY; guard3 signs in with a code | Lands on `/gate`; cannot open `/my-visits` or `/visits/new` |
| AU-T4 | Wrong code 5 times, then the correct code | All 401; the correct code no longer works; a new code must be requested |
| AU-T5 | Code entered after 10 minutes | 401 `INVALID_CODE` |
| AU-T6 | Admin deactivates a logged-in guard | The guard's next request returns 401 |
| AU-T7 | Last admin tries to demote self | 422 `LAST_ADMIN` |
| AU-T8 | Guard logs out while a visitor is CHECKED_IN | Visitor status unchanged |
| AU-T9 | Directory search "pi" | Active employees/admins matching by name/email, max 10, no security users |
