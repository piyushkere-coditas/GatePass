# Spec 01 — Authentication & User Management

## Purpose
Let employees, security guards and admins sign in with their Coditas Google accounts, and enforce role-based access.

## Functional Requirements
| ID | Requirement |
|---|---|
| AU-1 | **Everyone** (Employee, Security, Admin) signs in with Google Workspace OAuth. Only `hd=coditas.com` with a verified email is accepted. There are no app-managed passwords. |
| AU-2 | On first Google login, an unknown user is auto-provisioned with role EMPLOYEE (JIT provisioning). |
| AU-3 | Admins can **pre-register** a user by email with a role (typically SECURITY for guards) before that person's first login. On first login, the pre-registered record is matched by email (case-insensitive), and the name and `googleSub` are filled from Google. |
| AU-4 | Admins can change any user's role (EMPLOYEE / SECURITY / ADMIN) and deactivate or reactivate users. The last active admin cannot be demoted or deactivated (`LAST_ADMIN`). An admin cannot deactivate themselves (`SELF_DEACTIVATION`). All changes are audited. |
| AU-5 | Role and active status are checked on **every request** (user cache ≤ 30 s), so role changes and deactivation take effect without waiting for token expiry. |
| AU-6 | Session: JWT access token (15 min) + refresh token (8 h = one shift, rotating with reuse detection) in httpOnly Secure SameSite=Lax cookies. |
| AU-7 | Deactivated users cannot log in, and their existing sessions are rejected. Suspending the Google account blocks new logins; Admins should also deactivate the user in the app to end a live session immediately. |
| AU-8 | The first admin is seeded from env `BOOTSTRAP_ADMIN_EMAIL` = **piyush.kere@coditas.com**. |
| AU-9 | Logout clears the session only. It never changes any visit status (Q5). |
| AU-10 | SECURITY users cannot host visits. They are excluded from the host directory and cannot create planned visits. |
| AU-11 | Employee directory search (used for the unplanned-visit host picker): name/email prefix search over active EMPLOYEE/ADMIN users. |
| AU-12 | The gate UI shows the signed-in guard's name and a prominent **Log out / Switch guard** button for shift changes on the shared tablet. |
| AU-13 | A test-only login endpoint `POST /__test/login {email}` (sets session cookies) exists for automated tests. It is **not registered** unless `NODE_ENV=test`. |

## API
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | /auth/google | public | Starts OAuth (`hd=coditas.com`, `prompt=select_account` so guards can switch on a shared tablet) |
| GET | /auth/google/callback | public | Sets cookies, redirects to `returnTo` or `/` |
| POST | /auth/refresh | cookie | Rotates tokens |
| POST | /auth/logout | any | Revokes the refresh token family, clears cookies |
| GET | /me | any | `{id, name, email, role}` |
| GET | /users/search?q= | SECURITY, ADMIN | Max 10 results, q ≥ 2 chars |
| GET | /admin/users?role=&active=&q=&page= | ADMIN | Paginated |
| POST | /admin/users | ADMIN | Pre-register `{email, role}` |
| PATCH | /admin/users/:id | ADMIN | `{role?, isActive?}` |

## UI
- `/login`: a single "Sign in with Google" button. Error messages for wrong domain or a deactivated account.
- Role-based landing: Employee → `/my-visits`, Security → `/gate`, Admin → `/admin`. An Admin can switch to the employee view.
- `/admin/users`: list with role/status filters, an "Add user" dialog (email + role), a role dropdown and an activate/deactivate toggle, each with confirmation. A "Not signed in yet" badge shows for pre-registered users.

## Key Acceptance Scenarios
The full TDD suite (unit, integration, UI, traceability) is in [test-cases.md](test-cases.md).

| TC | Scenario | Expected |
|---|---|---|
| AU-T1 | Google login with a new `@coditas.com` account | User created as EMPLOYEE, lands on `/my-visits` |
| AU-T2 | Google login with a gmail.com account | Rejected: "Use your Coditas account" |
| AU-T3 | Admin pre-registers guard3@coditas.com as SECURITY; guard3 signs in | Lands on `/gate`; cannot open `/my-visits` or `/visits/new` |
| AU-T4 | Admin changes an employee's role to SECURITY while they are logged in | The next request is treated as SECURITY |
| AU-T5 | Employee calls `/admin/users` | 403 |
| AU-T6 | Admin deactivates a logged-in guard | The guard's next request returns 401 |
| AU-T7 | Last admin tries to demote self | 422 `LAST_ADMIN` |
| AU-T8 | Guard logs out while a visitor is CHECKED_IN | Visitor status unchanged |
| AU-T9 | Directory search "pi" | Active employees/admins matching by name/email, max 10, no security users |
