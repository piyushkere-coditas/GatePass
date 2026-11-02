# Test Cases — 01 Auth & User Management

Fixtures and conventions: [../TESTING.md](../TESTING.md). All users sign in with Google. In tests, Google is mocked (OAuth stub for callback tests; `POST /__test/login` for everything else).

## TDD Order
1. Pure rules: domain check, email normalisation, token rotation, role-change policy (AU-U-*)
2. Google callback, JIT provisioning, pre-registration match (AU-I-01..08)
3. Sessions, per-request role/active checks, logout (AU-I-09..14)
4. Directory search & admin user management (AU-I-15..23)
5. Role matrix (AU-I-21) — kept up to date as every module adds endpoints
6. UI (AU-C-*)

## Unit
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-U-01 | P0 | Google profile `{hd:"coditas.com", email_verified:true}` | `validateGoogleProfile` | Accepted |
| AU-U-02 | P0 | `hd` missing, `hd:"gmail.com"`, or email `x@coditas.com.evil.io` | validate | Rejected `DOMAIN_NOT_ALLOWED` |
| AU-U-03 | P0 | `email_verified:false` | validate | Rejected `EMAIL_NOT_VERIFIED` |
| AU-U-04 | P1 | " Guard1@Coditas.COM " | `normalizeEmail` | `guard1@coditas.com` |
| AU-U-05 | P0 | `RolesGuard` with `@Roles(ADMIN)` | EMPLOYEE / SECURITY / ADMIN | deny / deny / allow |
| AU-U-06 | P0 | Refresh token family F, token T1 rotated to T2 | T1 used again | Rejected and the whole family F revoked (reuse detection) |
| AU-U-07 | P0 | Only one active admin | Demote or deactivate that admin | `LAST_ADMIN` |
| AU-U-08 | P0 | Admin carol | carol deactivates carol | `SELF_DEACTIVATION` |
| AU-U-09 | P1 | Role change policy | Any role → any other role by an admin (EMPLOYEE↔SECURITY↔ADMIN) | Allowed unless AU-U-07/08 apply |

## Integration — Login & Provisioning
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-I-01 | P1 | — | `GET /auth/google?returnTo=/approvals/123` | 302 to accounts.google.com with `hd=coditas.com`, `prompt=select_account`, signed `state` carrying returnTo |
| AU-I-02 | P0 | New Google user dave@coditas.com | Callback | User created role EMPLOYEE, googleSub + name stored; cookies `access`/`refresh` are httpOnly, Secure, SameSite=Lax; 302 → `/` |
| AU-I-03 | P1 | Existing user carol (ADMIN) | Callback | No duplicate; role still ADMIN; lastLoginAt updated |
| AU-I-04 | P0 | eve (inactive) | Callback | 302 `/login?error=inactive`; no cookies |
| AU-I-05 | P0 | gmail.com profile | Callback | 302 `/login?error=domain`; no user created |
| AU-I-06 | P1 | `BOOTSTRAP_ADMIN_EMAIL=carol@coditas.com`, empty DB | Run seed | carol exists as ADMIN (pre-registered); first login keeps ADMIN |
| AU-I-07 | P0 | carol pre-registered guard3@coditas.com as SECURITY | guard3 Google callback | Same row updated (no duplicate): role SECURITY, name from Google, googleSub set, lastLoginAt set; 302 → `/` (SPA routes to `/gate`) |
| AU-I-08 | P1 | Pre-registered `guard3@coditas.com` | Google returns `Guard3@Coditas.com` | Matched case-insensitively to the same user |
| AU-I-24 | P0 | `NODE_ENV=production` | `POST /__test/login` | 404 (route not registered); see also SM-I-13 |

## Integration — Sessions
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-I-09 | P0 | Access token expired (clock + 16 min) | `GET /me` → 401; `POST /auth/refresh` | Refresh 200 with new cookies; `/me` now 200 |
| AU-I-10 | P1 | Refresh token older than 8 h | refresh | 401 |
| AU-I-11 | P0 | Old refresh token reused after rotation | refresh | 401; all tokens of that family revoked (the current session is also logged out) |
| AU-I-12 | P0 | guard1 logged in; carol deactivates guard1 | guard1 `GET /gate/today` after cache TTL (≤ 30 s, fake clock) | 401; refresh also 401 |
| AU-I-13 | P0 | bob (EMPLOYEE) logged in; carol changes bob → SECURITY | bob `GET /gate/today` / `POST /visits` after cache TTL | 200 / 403 (new role applied without re-login) |
| AU-I-14 | P0 | guard1 logged in, a visit CHECKED_IN | `POST /auth/logout` | Cookies cleared; refresh family revoked; `/me` 401; visit still CHECKED_IN (Q5) |

## Integration — Directory & Admin User Management
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-I-15 | P0 | 15 employees named "Pi…", eve inactive, guards | guard1 `GET /users/search?q=pi` | ≤ 10 results, case-insensitive name/email prefix, no SECURITY, no inactive |
| AU-I-16 | P1 | — | `q=p` | 400 `QUERY_TOO_SHORT` |
| AU-I-17 | P0 | alice | `GET /users/search?q=bo` | 403 |
| AU-I-18 | P0 | carol | `POST /admin/users {email:"guard3@coditas.com", role:"SECURITY"}` | 201, lastLoginAt null, createdById carol, audit row; again → 409 `USER_EXISTS`; `x@gmail.com` → 400 `DOMAIN_NOT_ALLOWED` |
| AU-I-19 | P0 | carol | `PATCH /admin/users/alice {role:"ADMIN"}`, then back to EMPLOYEE | 200 each; audit rows with old/new role |
| AU-I-20 | P0 | carol is the only admin | `PATCH carol {role:"EMPLOYEE"}` / `{isActive:false}` | 422 `LAST_ADMIN` / 422 `SELF_DEACTIVATION` |
| AU-I-22 | P1 | 30 users | `GET /admin/users?role=SECURITY&active=true&page=1` | Only active guards; pagination metadata; pre-registered users flagged `notSignedInYet:true` |
| AU-I-23 | P1 | guard1 (SECURITY) | `POST /visits` (create planned visit) | 403 (security cannot host) |

## Integration — Role Matrix (shared, parametrized)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-I-21 | P0 | Table of every endpoint × {anonymous, EMPLOYEE, SECURITY, ADMIN} → expected status | Call each | Status matches the table. Anonymous → 401 everywhere except `/auth/*` and `/health`. **Every new endpoint must be added here.** |

## Component (UI)
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| AU-C-01 | P1 | `/login` | Render | Only a "Sign in with Google" button (no username/password fields) |
| AU-C-02 | P1 | `/login?error=domain` / `?error=inactive` | Render | "Please use your Coditas Google account." / "Your access has been disabled. Contact the admin." |
| AU-C-03 | P0 | Not logged in | Open `/visits/new` | Redirect to `/login?returnTo=/visits/new`; after login returns there |
| AU-C-04 | P0 | `/me` role EMPLOYEE / SECURITY / ADMIN | Open `/` | Lands on `/my-visits` / `/gate` / `/admin` |
| AU-C-05 | P0 | SECURITY user | Open `/my-visits` or `/visits/new` | "Not authorized" page with a link to `/gate` |
| AU-C-06 | P1 | Admin users page | "Add user" with email + role SECURITY | POST sent; row appears with "Not signed in yet" badge; invalid domain shows inline error |
| AU-C-07 | P1 | Admin users page | Change role via dropdown / toggle active | Confirm dialog → PATCH → row updates; `LAST_ADMIN` error shown as a toast |
| AU-C-08 | P1 | Gate screen | Render header; tap "Log out / Switch guard" | Guard name visible; logout → `/login` with Google account chooser |
| AU-C-09 | P2 | Login + admin users pages | axe scan | 0 violations |

## Traceability
| Req | Tests |
|---|---|
| AU-1 Google-only, domain-restricted | AU-U-01..03, AU-I-01, AU-I-05, AU-C-01, AU-C-02 |
| AU-2 JIT provisioning | AU-I-02, AU-I-03 |
| AU-3 pre-registration | AU-U-04, AU-I-07, AU-I-08, AU-I-18, AU-I-22, AU-C-06 |
| AU-4 role management | AU-U-07..09, AU-I-19, AU-I-20, AU-C-07 |
| AU-5 per-request role check | AU-I-12, AU-I-13 |
| AU-6 tokens | AU-U-06, AU-I-09..11 |
| AU-7 deactivation | AU-I-04, AU-I-12 |
| AU-8 bootstrap admin | AU-I-06 |
| AU-9 logout doesn't affect visits | AU-I-14 |
| AU-10 security can't host | AU-I-15, AU-I-23, UV-I-03 |
| AU-11 directory search | AU-I-15..17 |
| AU-12 gate switch guard | AU-C-08 |
| AU-13 test login only in test env | AU-I-24, SM-I-13 |
| Role-based access (all modules) | AU-U-05, AU-I-21, AU-C-03..05 |
