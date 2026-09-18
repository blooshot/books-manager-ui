# Implementation Plan: Drive Photo Pipeline

## Phase 1: Drive Client & Core Utilities
- [x] Task: Implement Drive API client wrapper (`src/services/drive/client.ts`) [8ccbffb]
  - [x] Write unit tests for API error mapping (401, 403, Network)
  - [x] Implement fetch wrapper and shared error base
- [x] Task: Implement image resizing math and link parsing (`src/lib/image.ts`, `src/services/drive/links.ts`) [4c3d361]
  - [x] Write unit tests for sizing math and Drive URL/ID parsing
  - [x] Implement logic
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: 4c3d361]

## Phase 2: Folder & Photo Operations
- [x] Task: Implement folder management (`src/services/drive/folder.ts`) [624a8e1]
  - [x] Extend `src/test/no-delete.test.ts` to block Drive delete API calls
  - [x] Write fake-fetch tests for find-or-create logic (missing, existing, duplicate)
  - [x] Implement `Book Covers` folder resolution and `localStorage` caching
- [x] Task: Implement photo operations (`src/services/drive/photos.ts`) [b5e0e49]
  - [x] Write fake-fetch tests for upload, fetchBlob, and markReplaced (rename)
  - [x] Implement operations
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: b5e0e49]

## Phase 3: Cover Caching
- [x] Task: Implement IndexedDB cache (`src/services/drive/coverCache.ts`) [5feed1d]
  - [x] Write tests for storing/retrieving full image and thumbnail Blobs by file ID
  - [x] Implement IndexedDB storage logic
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: 5feed1d]

## Post-review corrections (Claude Code, 2026-09-19)

Cross-review found problems in this track that its tests did not catch. They were fixed outside a track; the tasks above
are marked complete but were **not** complete when first marked. Root causes and the rules that now prevent them are in
`conductor/lessons-learned.md`.

- `npm run verify` was red (unused import). Fixed.
- Cache stored one blob and its tests never called it; spec required full image + ~240px thumbnail. Rewrote the cache
  (`ArrayBuffer` + type, full and thumb variants, never throws) with real tests. Added `resizeToJpeg` / `createCoverVariants`.
- Drive client sent JSON without `Content-Type: application/json`. Fixed in the client.
- `uploadCover` used `FormData` (`multipart/form-data`); Drive needs `multipart/related`. Added `multipart.ts`.
- Drive defined its own `SessionExpiredError`. Now one shared `GoogleApiError` / `SessionExpiredError`.
- Folder ID: raw `localStorage`, global, never revalidated. Now `createFolderResolver` (per account, checked once per session,
  recovers from deleted/trashed folders, concurrent callers share one lookup).
- Guard did not cover `trashed: true`, `/trash`, or Drive methods. Added patterns, a Drive method allow-list, PATCH-only-rename check.
- Link parser fallback matched any long string. Now strict about host and shape.
- Still open from this track's spec: wiring into `libraryThunks` (out of scope of this track), and everything here has only run
  against `FakeDrive`, never real Google Drive.

