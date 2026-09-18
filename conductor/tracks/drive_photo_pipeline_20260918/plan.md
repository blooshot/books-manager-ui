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
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Cover Caching
- [ ] Task: Implement IndexedDB cache (`src/services/drive/coverCache.ts`)
  - [ ] Write tests for storing/retrieving full image and thumbnail Blobs by file ID
  - [ ] Implement IndexedDB storage logic
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
