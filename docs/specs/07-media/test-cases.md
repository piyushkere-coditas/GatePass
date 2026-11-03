# Test Cases — 07 Media (Visitor & ID Photos)

Fixtures and conventions: [../TESTING.md](../TESTING.md). Integration tests run an S3-compatible emulator, chosen in Phase 3 (MinIO no longer publishes images or binaries).

## TDD Order
1. Key generation, magic bytes, access policy, retention selection (MD-U-*)
2. Upload URL issuing (MD-I-01..05)
3. Signed viewing & authorization (MD-I-06..09)
4. Retention & orphan jobs (MD-I-10..13)

## Unit
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| MD-U-01 | P1 | Date 2026-11-02 | `newPhotoKey()` | Matches `^visits/2026/11/[0-9a-f-]{36}\.jpg$`; unique across 10k calls |
| MD-U-02 | P0 | Buffers: JPEG, PNG, WebP, PDF, GIF, SVG, empty | `sniffImage` | First 3 ok; rest rejected |
| MD-U-03 | P0 | Policy matrix: role × kind × (host?) × (visit today?) | `canViewPhoto` | VISITOR: host ✔, other employee ✘, security today ✔ / past ✘, admin ✔. ID: host ✘, security today ✔ / past ✘, admin ✔ |
| MD-U-04 | P0 | retentionDays 90; visits checked out 89/90/91 days ago; one never checked out with updatedAt 91 days ago; one already purged | `selectForPurge` | 90 (exactly) and 91 and the never-checked-out one selected; 89 and purged not |

## Integration
| ID | Pri | Given | When | Then |
|---|---|---|---|---|
| MD-I-01 | P0 | guard1 | `POST /media/upload-url {kind:"VISITOR_PHOTO", contentType:"image/jpeg"}` | 200 `{key, url, fields}` (presigned POST); `MediaUpload` row (uploader guard1, kind, PENDING) |
| MD-I-02 | P0 | alice / carol | upload-url | 403 / 403 |
| MD-I-03 | P1 | guard1 | contentType `application/pdf` / kind `SELFIE` | 400 / 400 |
| MD-I-04 | P0 | Presigned POST | Upload `big.jpg` (3 MB) | Storage rejects (content-length-range ≤ 2 MB) |
| MD-I-05 | P1 | Presign expiry configured to 2 s in test | Upload after 3 s | Rejected (expired) |
| MD-I-06 | P0 | Upload `fake.pdf.jpg`, then check in with its key | check-in | 400 `INVALID_MEDIA` (magic-byte check server-side) |
| MD-I-07 | P0 | Visit CHECKED_IN today with photos | `GET /visits/:id/photos/{kind}` as alice (VISITOR / ID), bob, guard1, carol | alice VISITOR 302 / ID 403; bob 403; guard1 302 both; carol 302 both; every ID 302 writes `PHOTO_VIEWED` event |
| MD-I-08 | P0 | Signed URL from MD-I-07 | Fetch at 0 s / after 61 s | 200 image / 403 |
| MD-I-09 | P1 | Same visit, date moved to yesterday | guard1 view | 403 |
| MD-I-10 | P0 | Visit checked out 91 days ago with photos | Retention job | Objects deleted from bucket; keys null; photosPurgedAt set; visit metadata and events intact; `PHOTOS_PURGED` event |
| MD-I-11 | P0 | Purged visit | GET photo | 410 `PHOTO_PURGED` |
| MD-I-12 | P1 | Storage delete throws for one object | Retention job | That visit keeps its keys (retried next run); others purged; job does not crash |
| MD-I-13 | P1 | Unlinked uploads 25 h and 23 h old | Orphan job | 25 h one deleted (object + row); 23 h kept |
| MD-I-14 | P0 | Any object key | Unsigned `GET` of the object URL on the storage endpoint | 403 |
| MD-I-15 | P2 | Prod bucket config (Terraform plan test) | Inspect | Block public access on; SSE enabled |

## Traceability
| Req | Tests |
|---|---|
| MD-1 private bucket, key format | MD-U-01, MD-I-14, MD-I-15 |
| MD-2 presigned upload | MD-I-01..05 |
| MD-3 verification at check-in | MD-U-02, MD-I-06, GO-I-07..11 |
| MD-4 signed viewing & authz, audit | MD-U-03, MD-I-07..09, AD-I-13 |
| MD-5 retention purge | MD-U-04, MD-I-10..12 |
| MD-6 orphan cleanup | MD-I-13, GO-I-14 |
| MD-7 EXIF strip | GO-U-03 |
