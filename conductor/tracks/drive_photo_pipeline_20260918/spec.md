# Specification: Drive Photo Pipeline (Service Layer)

## Overview
Implement the service layer for the Google Drive photo pipeline (Step 5 of the build order). This layer manages uploading, reading, and caching book cover photos using the `drive.file` scope, adhering strictly to the append-only (no-delete) constraints of the project.

## Functional Requirements
1. **Drive Client Wrapper (`src/services/drive/client.ts`)**
   - Provide a fetch wrapper for the Drive API.
   - Implement error mapping (401 -> SessionExpired, 403 -> Permission, network errors -> Network) consistent with the Sheets layer.

2. **Folder Management (`src/services/drive/folder.ts`)**
   - Implement find-or-create logic for the `Book Covers` folder using the `drive.file` scope.
   - Cache the discovered/created folder ID in `localStorage`.

3. **Photo Operations (`src/services/drive/photos.ts`)**
   - `uploadCover(file: Blob, bookId: string)`: Perform a multipart upload, naming the file `<BookID>.jpg`.
   - `fetchCoverBlob(fileId: string)`: Fetch file using `files/{id}?alt=media` with Bearer token.
   - `markReplaced(fileId: string, bookId: string)`: Rename an existing cover to `deleted-file-<BookID>.jpg` (no deletion).
   - Implement helper functions to build a Drive link from a file ID and parse a file ID from a Drive link.

4. **Image Processing (`src/lib/image.ts`)**
   - Provide pure math sizing logic to scale images to a 1000px long edge.
   - (The actual browser `createImageBitmap` + canvas logic can be stubbed or implemented here for the UI layer to use later).

5. **Cover Caching (`src/services/drive/coverCache.ts`)**
   - Implement an IndexedDB cache keyed by file ID.
   - Store both the full-size Blob and a generated ~240px thumbnail Blob indefinitely.

## Non-Functional & Testing Requirements
- **No-Delete Guard:** Extend the `src/test/no-delete.test.ts` to ensure no `files.delete` or `emptyTrash` calls are ever made to the Drive API.
- **Fake Drive:** Implement fake `fetch` tests to thoroughly unit-test all Drive API interactions without real network calls, mirroring the Sheets fake approach.
- **Coverage:** Ensure robust unit tests for URL parsing, resize math, folder find-or-create, and rename logic.

## Out of Scope
- Integration with the Redux `libraryThunks.ts` (this will be wired in a subsequent task).
- Building the UI screens for photo capture or display.
