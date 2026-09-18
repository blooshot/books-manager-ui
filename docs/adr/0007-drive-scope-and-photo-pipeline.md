# 0007. `drive.file` scope and the cover-photo pipeline

## Status
Accepted (extends ADR-0003)

## Context
ADR-0003 chose a Drive folder for covers. It left open which Drive scope to
use, how covers are read back (an `<img>` tag can't send a Bearer token), and
how big/heavy the images should be. The full `drive` scope is restricted and
broader than needed. The narrow `drive.file` scope only lets the app touch
files it created itself.

## Decision
- **Scopes:** `spreadsheets` + `drive.file`. The existing Sheet is reached by
  ID (`VITE_SHEET_ID`) under the `spreadsheets` scope. The non-sensitive
  `userinfo.email` scope is also requested, solely so the sign-in gate can
  offer "Continue as <email>" (ADR-0002); it adds no data access.
- **Folder:** because `drive.file` cannot write into a folder the user made by
  hand, the app creates a `Book Covers` folder on first run, finds it by name
  on later sessions, and caches its ID locally. The folder ID is not env config.
- **Capture and resize:** `<input type="file" accept="image/*"
  capture="environment">`; scale in the browser (`createImageBitmap` + canvas)
  to a 1000px long edge, JPEG ~0.8 (roughly 100–200 KB).
- **Upload:** one multipart request, file named `<BookID>.jpg`. Upload first,
  then append the Sheet row with the link, so a row never exists without its
  photo. If the append fails, only a harmless orphan file remains and the
  outbox retry reuses the uploaded file ID.
- **Read:** fetch `files/{id}?alt=media` with the Bearer token, show via an
  object URL, lazily as covers scroll into view. Photo files never change (a
  new photo is a new file ID), so cache them indefinitely in IndexedDB by file
  ID, with ~240px thumbnails for list rows and the full image for the detail
  screen.
- **Photo cell:** stores the Drive link (clickable in the Sheet); the app
  parses the file ID out of it.
- **Placeholder:** books with no photo show a generated tile (title initial on
  a token-coloured background).
- **Replace:** upload the new file, update the cell, rename the old file to
  `deleted-file-<BookID>.jpg` (ADR-0004). No Drive delete calls.
- Photos stay private to the owner's account.
- Outbox entries that include a photo persist the Blob in IndexedDB.

## Consequences
- Narrow, non-sensitive Drive scope; consent screen stays lighter.
- Repeat visits cost no Drive API calls for covers already cached.
- The Drive folder accumulates renamed `deleted-file-*` files until the owner
  cleans them up by hand.
- If the user renames or moves the `Book Covers` folder, the name lookup could
  create a second folder. Acceptable for a personal tool; documented so it is
  not a surprise.

## Clarifications (from implementing and reviewing step 5)
- **Upload format:** Drive's `uploadType=multipart` requires `multipart/related` (a JSON metadata part, then the media part), built by
  `buildMultipartRelated`. `FormData` (`multipart/form-data`) must not be used; a guard test forbids it. JSON request bodies must be sent as
  `application/json`.
- **Folder cache:** the folder ID is cached per Google account and checked once per session, so a deleted, trashed, or foreign-client folder is
  replaced instead of failing every upload. This also softens the "renamed/moved folder creates a second folder" consequence above.
- **Cache storage:** covers are stored in IndexedDB as `ArrayBuffer` + MIME type (full image and ~240px thumbnail), not as `Blob`, for iOS Safari
  reliability and testability. The cache is best-effort and never throws.
- **Errors:** Drive and Sheets share one `SessionExpiredError` / `GoogleApiError` base (`src/services/google/errors.ts`).

