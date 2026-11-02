# Spec 07 — Media (Visitor & ID Photos)

## Purpose
Store check-in photos securely, serve them only to authorized roles, and purge them after the retention period.

## Functional Requirements
| ID | Requirement |
|---|---|
| MD-1 | Private bucket (S3 in prod, MinIO locally). Keys: `visits/{yyyy}/{mm}/{uuid}.jpg`. No public ACLs. Server-side encryption on. |
| MD-2 | Upload: the client requests `POST /media/upload-url {kind: VISITOR_PHOTO\|ID_PHOTO, contentType}` → **presigned POST** (5 min, policy `content-length-range` ≤ 2 MB, image/jpeg\|png\|webp). A presigned PUT cannot enforce size. The server records a pending upload (key, kind, uploaderId). |
| MD-3 | On check-in, the API verifies each key: it exists, was uploaded by the same user, its kind matches, it was uploaded < 30 min ago, and the content is a real image (magic-byte check). Then it is linked to the visit. |
| MD-4 | View: `GET /visits/:id/photos/:kind` → 302 to a presigned GET URL (60 s). Authorization: VISITOR_PHOTO → host, Security (today's visits), Admin. ID_PHOTO → Security (today's visits), Admin only. ID views are audited. A purged photo returns 410 `PHOTO_PURGED`. |
| MD-5 | Retention job (daily 02:00 IST): for visits with checkedOutAt (or last update) older than `media.retentionDays`, delete the objects, null the keys, set `photosPurgedAt`. The visit metadata is kept. |
| MD-6 | Orphan cleanup: pending uploads never linked within 24 h are deleted. |
| MD-7 | EXIF metadata (GPS etc.) is stripped client-side during compression. |

## Key Acceptance Scenarios
The full TDD suite (unit, integration, UI, traceability) is in [test-cases.md](test-cases.md).

| TC | Scenario | Expected |
|---|---|---|
| MD-T1 | Request upload URL as Employee | 403 |
| MD-T2 | Upload a 3 MB file to the presigned URL | Rejected by the size condition |
| MD-T3 | Upload a PDF renamed .jpg, then check in | 400 `INVALID_MEDIA` |
| MD-T4 | Host fetches the ID photo | 403 |
| MD-T5 | Host fetches the visitor photo | 302 to a signed URL that expires after 60 s |
| MD-T6 | Retention 90 days, visit checked out 91 days ago | Objects deleted, keys null, photosPurgedAt set, UI shows "Photo purged per retention policy" |
| MD-T7 | Orphan upload older than 24 h | Deleted |
| MD-T8 | Direct bucket URL without a signature | 403 |
