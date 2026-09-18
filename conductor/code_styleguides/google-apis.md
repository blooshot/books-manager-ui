# Google APIs Guide (Sheets, Drive, Identity)

Everything talks to Google from the browser with the user's own token (ADR-0002). Read the relevant ADRs
(0001, 0002, 0004, 0007) before touching this code.

## Before writing a call
1. Read the official reference for that exact endpoint and note its required Content-Type, required
   parameters, scope, and response shape. Put the reference URL in a JSDoc/comment on the wrapper.
2. Add the strictness you learned to the fake (`src/test/fakeSheets.ts` / `fakeDrive.ts`) and write the
   failing test first ([testing.md](./testing.md) rule 3).
3. Anything only tested against a fake is **not verified against real Google**. Say so in STATUS.md.

## Hard rules (mechanically checked by `src/test/no-delete.test.ts`)
- Books are append-only. **No** `deleteDimension` / `deleteRange` / `deleteSheet`, no `values:clear` /
  `batchClear`, no HTTP `DELETE`, no `files.delete`, no `emptyTrash`.
- **No `trashed: true`** and no `/trash` call: moving a file to the trash is a soft delete.
- Sheets endpoints allowed: `values:batchGet`, `values/{range}:append`, `values:batchUpdate` (single cells). Nothing else.
- Drive: `GET` (list/get/`alt=media`), `POST` (create folder, multipart upload), `PATCH` (rename only; the body is
  exactly `{ name }`).
- Adding an endpoint or method means updating the allow-list test, the relevant ADR, and STATUS.md in the same change.

## Requests
- **Every JSON body is sent with `Content-Type: application/json`.** `fetch` defaults a string body to
  `text/plain`; the shared clients set the header, so send bodies through them.
- **Drive multipart upload is `multipart/related`** (JSON metadata part first, then the media part), built with
  `buildMultipartRelated`. **Never `FormData`** (it is `multipart/form-data`, which Drive does not accept).
- Always pass `fields=` on Drive calls to request only what you use.
- Build URLs with `encodeURIComponent` for every interpolated segment/value.
- Tokens come from the injected `getAccessToken()`, which throws `SessionExpiredError` when there is none or it is past expiry.
  Never read the token from storage; never log it.

## Errors
- Use `src/services/google/errors.ts` (`GoogleApiError`, shared `SessionExpiredError`). Map 401 -> `SessionExpiredError`,
  403 -> the API's permission error, network failure -> `code: 'NETWORK'`, everything else -> the API error with status and message.
- Only `SessionExpiredError` and `NETWORK` are retryable by the outbox. Never blind-retry a non-idempotent write.

## Sheets specifics
- Find columns by **header name**, rows by **Book ID**, never by position. Writes re-read first.
- Write with `USER_ENTERED`, read with `FORMATTED_VALUE`; escape text starting with `= + - @` so it is stored as text.
- Update only the cells that changed (never a whole row: unknown columns belong to the owner).
- Sheet writes run one at a time (`inWriteQueue`) because each derives something from a fresh read.

## Drive specifics
- `drive.file` only sees files this app created, so the app creates its own `Book Covers` folder.
- Cache the folder ID **per Google account** via `lib/storage`, check it **once per session**, and recover from
  deleted/trashed/foreign folders (see `createFolderResolver`). Concurrent callers share one lookup.
- Cover files never change (a new photo is a new file ID): cache by file ID. In IndexedDB store `ArrayBuffer` + MIME
  type, not `Blob`. The cache is best-effort and must never throw.
- Replacing a cover: upload the new file, write the Sheet cell, then rename the old file `deleted-file-<BookID>.jpg`.
- Links: the Photo cell holds a Drive link; parse the ID with `getDriveFileIdFromUrl` (strict about host and shape).
