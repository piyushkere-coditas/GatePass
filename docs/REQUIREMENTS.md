# Coditas Gate Pass — Clarified Requirements

Source: meeting transcript (`requirment.txt`) + clarification Q&A (2026-10-30).
Transcription fixes: "Yankee" → **Nyati** (new office), "Quotas" → **Coditas**.

## 1. Problem

Coditas is moving to the Nyati office. Many visitors will come in (interviews, client meetings, vendors and more).
The business wants to know **who came, who invited them, and who came unplanned**, and to control entry and exit at the gate.

## 2. Actors / Roles

| Role | Who | Login |
|---|---|---|
| **Employee (Host)** | Any Coditas employee | Email one-time code to their `@coditas.com` address |
| **Security** | Gate security guards | Email one-time code to their own `@coditas.com` address. An Admin pre-registers them with role SECURITY |
| **Admin** | Admin/Facilities/HR | Email one-time code. Role granted by another Admin. First admin seeded: piyush.kere@coditas.com |

An Admin is also an Employee and can host visitors. Security users cannot host visitors.

## 3. Core Flows

### 3.1 Planned visitor
1. Employee logs in → **New Visitor Entry** → fills in the details (host = the logged-in employee, set automatically).
2. Security sees the entry in **Today's Incoming Visitors**.
3. Visitor arrives → Security finds the entry → captures **visitor photo** + **valid ID photo** → **Check In**.
4. Host gets an email and sees status **Checked In** in the portal.
5. Host marks **Meeting Over (MO)**.
6. Security sees **Meeting Over** and waits for the visitor to come out → **Check Out**.

### 3.2 Unplanned visitor
1. Visitor arrives without an entry. Security creates an **Unplanned Entry** with the same details **plus the host employee** (searched from the directory).
2. Host gets an email with an approval link and an in-portal pending request.
3. Host **Approves** → Security can check the visitor in (photos as above). Host **Rejects** (optional reason) → the visitor is turned away; the entry is closed.
4. If the host does not respond within **N minutes (configurable, default 10)**, the request **escalates to Admins**, and any Admin may approve or reject. The host can still act. The first decision wins.
5. After check-in, the flow is the same as a planned visit (Meeting Over → Check Out).

### 3.3 Forced check-out
Security may check out a visitor whose meeting is **not** marked over, but must enter a **reason**. This is recorded in the audit trail.

## 4. Visitor Entry Fields

| Field | Required | Notes |
|---|---|---|
| Full name | Yes | 2–100 chars |
| Mobile number | Yes | Indian/international format; used for returning-visitor autofill |
| Email | No | |
| Company / Organization | No | |
| Purpose | Yes | Interview, Client Meeting, Vendor / Delivery, Personal, Other (Other → note required) |
| Visit date | Yes | Today or future, max 30 days ahead (planned). Unplanned = today |
| Expected arrival time | Yes (planned) | Unplanned = actual time of registration |
| Expected duration | Yes | 15 min – 8 h |
| Host | Yes | Planned: the creator. Unplanned: selected by security |
| Notes | No | ≤ 500 chars |

Captured at check-in: **visitor photo**, **ID photo** (both required). **No ID number or ID type is stored** (decision: ID photo only).

## 5. Decisions Made (Q&A)

| Topic | Decision |
|---|---|
| Stack | React (Vite + TS) · NestJS · PostgreSQL (Prisma) |
| Auth | **Email one-time code** (6 digits, 10 min) to an `@coditas.com` address for **everyone**, including guards. No passwords, no Google/OAuth dependency (changed 2026-11-02; Google SSO may be added later as an extra option) |
| Notifications | **Email only** (no Slack, no SMS). The portal UI refreshes live, but this is not a notification channel |
| Approval timeout | Escalate to all Admins after 10 min (configurable) |
| Hosting | AWS: ECS Fargate, RDS PostgreSQL, S3, SES, Terraform |
| E2E testing | Playwright for Java + TestNG + Page Object Model + Allure reports |
| Gate device | Tablet/phone browser using the device camera (responsive web, no native app) |
| ID data | ID photo only. Photos are auto-deleted after a retention period (default 90 days, configurable) |
| v1 extras | Admin role + reports/visitor log/CSV export |
| Checkout without MO | Allowed, with a mandatory reason |

## 6. Out of Scope for v1 (candidates for v2)
- Group visitors (multiple visitors on one entry)
- Overstay alerts
- Automatic no-show marking, rescheduling workflow (v1 has basic edit/cancel only before check-in)
- Visitor-facing pass (QR, email or SMS to the visitor)
- Slack or Google Chat notifications
- Multiple office sites or gates
- Badge printing

## 7. Non-Functional Requirements
- **Privacy (DPDP Act 2023):** photos are stored privately and served only via short-lived signed URLs. ID photos are visible only to Security and Admin. Retention purge job. Every view of an ID photo is logged.
- **Audit:** every state change is stored with actor, timestamp and note.
- **Performance:** gate dashboard loads in < 2 s on 4G. Check-in including two photo uploads takes < 5 s. Photos are compressed client-side to ≤ 500 KB.
- **Availability:** office hours are critical. If the system is down, there is a paper fallback (out of system scope).
- **Timezone:** all business logic in IST (Asia/Kolkata); timestamps stored in UTC.
- **Browsers:** latest Chrome and Edge on desktop; Chrome on Android and Safari on iPad for the gate.
- **Accessibility:** WCAG 2.1 AA for the employee portal.

## 8. Resolved Questions (2026-10-30)

Q1–Q10 are closed. Q11 was raised by the sign-in change and is open (working assumption noted).

| # | Question | Decision |
|---|---|---|
| Q1 | Escalation timeout and who the Admins are | **10 min** (Admin-configurable 1–120). Escalation goes to all active ADMIN users. First admin: **piyush.kere@coditas.com** |
| Q2 | Photo retention period | **90 days** (Admin-configurable 30–365) |
| Q3 | Visit purposes | **Interview, Client Meeting, Vendor / Delivery, Personal, Other** (Other requires a note) |
| Q4 | Gates | **Single site (Nyati), single gate.** No gate selection in the app |
| Q5 | "the logout ... doesn't check out" | **Logging out never changes a visitor's status.** Check-out is always an explicit security action |
| Q6 | Guard accounts | **Guards have `@coditas.com` accounts.** An Admin pre-registers them with role SECURITY. No local passwords anywhere. *(2026-11-02: sign-in changed from Google SSO to an email one-time code.)* |
| Q11 | Can guards read their Coditas email on duty to receive sign-in codes? | **Open — assumed yes** (phone or the gate tablet). If not, add an admin-issued fallback code |
| Q7 | Hosting | **AWS** (ECS Fargate, RDS PostgreSQL, S3, SES, Terraform) |
| Q8 | E2E framework | **Playwright for Java + TestNG + Page Object Model + Allure reporting**, as a separate Maven project `e2e/` |
| Q9 | Planned visitor arrives on a different date | **Security registers them as unplanned** and the host approves. Check-in stays limited to the scheduled date |
| Q10 | Delegation (booking for another host) | **Not in v1.** The creator is always the host |
