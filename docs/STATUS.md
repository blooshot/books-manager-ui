# STATUS — live progress ledger

Read this after `AGENTS.md` at the start of every session; update it at the end
of every session or milestone (protocol in `AGENTS.md`; how to keep it consistent: `conductor/workflow.md`).
Newest entries at the top of "Log". Keep it short and factual.

**Last updated:** 2026-09-19 · **By:** Claude Code (after cross-review of Conductor's step 5)

## Where we are

Build order (from `AGENTS.md`):

| # | Step | State |
|---|---|---|
| 1 | Create the Google Sheet with exact columns | **Owner action** — Sheet ID is configured; column headers/formats not yet confirmed against the app |
| 2 | Google Cloud project, OAuth client, consent screen "In production" | **Owner action** — client ID configured in `.env.local` |
| 3 | Vite + React + Tailwind + shadcn/ui scaffold, Fusion tokens, Redux store, GIS sign-in | **Done** (Claude) |
| 4 | Sheets read/write service layer + no-delete guard | **Done** (Claude) — fake Sheet only |
| 5 | Drive photo service layer (folder, upload, fetch, rename, cache, links, resize) | **Done after review fixes** (built by Conductor, corrected by Claude) — fake Drive only |
| 5b | Wire photos into the store (upload-before-row, replace = rename, cover loading + cache) | **Next** (brief below) |
| 6 | Screens (in the order in `AGENTS.md`), incl. photo capture UI | Not started |
| 7 | Outbox + Sync button | Not started |
| 8 | Protected range on `Books` (verify owner behaviour, ADR-0004) | Not started, needs the real Sheet |
| 9 | Deploy + CI/CD | Not started |

`npm run verify` passes: **166 tests in 15 files**, build OK, 1 known lint warning (generated `button.tsx`).

## What exists

**Step 3** — sign-in gate, reconnect banner, token-expiry timer, theme toggle, app shell.
Redux `session` (token in memory only, email hint via `lib/storage`), `library` (load status), `books`, `borrowers`,
selectors (`selectOpenLoanByBookId`, `selectLentOutByBorrower`). Fusion tokens imported from
`.agents/ui/skills/custom-ui-design-system/tokens.css`; Tailwind mapping in `src/index.css`.

**Step 4** — `src/services/sheets/`:
- `mapping.ts` — row<->type by **header name** (strict: every column in `AGENTS.md` must exist, else `SheetSchemaError`);
  text starting with `= + - @` is escaped. `ids.ts` — `nextBookId`.
- `client.ts` — the only Sheets HTTP: `values:batchGet`, `:append`, `values:batchUpdate` (single cells).
- `api.ts` — `readAll`, `appendBook`, `updateBook` (changed cells only), `appendLoan`, `returnLoan`; every write re-reads first, finds rows by Book ID.
- `src/store/libraryThunks.ts` — `loadAll`, `addBook` (not optimistic), `editBook`/`borrowBook`/`returnBook` (optimistic + rollback), writes serialized by `inWriteQueue`.
- App shell loads the library after sign-in and shows "N books · M currently lent out" (smoke display until step 6).

**Step 5** — `src/services/drive/`, `src/services/google/`, `src/lib/image.ts` (after review fixes):
- `google/errors.ts` — shared `GoogleApiError` (`name`, `status`, `code`) and **one** `SessionExpiredError` used by Sheets and Drive.
- `drive/client.ts` — JSON bodies sent as `application/json`; `request` / `requestBlob`; 401/403/network mapping.
- `drive/multipart.ts` — `buildMultipartRelated` (Drive needs `multipart/related`, never `FormData`).
- `drive/photos.ts` — `uploadCover` (`<BookID>.jpg` into the folder), `fetchCoverBlob`, `markReplaced` (rename to `deleted-file-<BookID>.jpg`; body is exactly `{name}`).
- `drive/folder.ts` — `createFolderResolver(client, accountKey)`: finds/creates `Book Covers`; ID cached per account via `lib/storage`,
  checked once per session, recovers from deleted/trashed/foreign folders, concurrent callers share one lookup, `forget()`.
- `drive/coverCache.ts` — IndexedDB cache of `ArrayBuffer` + type, `full` and `thumb` variants, best-effort (never throws).
- `drive/links.ts` — strict Drive link <-> file ID (https + drive/docs host + ID shape).
- `lib/image.ts` — sizing math, `resizeToJpeg`, `createCoverVariants` (1000px full, 240px thumb) with injectable browser deps.
- Tests: `src/test/fakeDrive.ts` is strict about JSON content type, `multipart/related`, `drive.file` visibility, and refuses DELETE.

**Guards/conventions** — `src/test/no-delete.test.ts`: no delete/clear/`trashed:true`/trash/`FormData` upload; Sheets endpoint
allow-list; Drive method allow-list and PATCH-only-rename. `src/test/conventions.test.ts`: no raw storage outside `lib/storage.ts`,
no `any`, default exports only for App/main/slices.

**Conductor** — `conductor/` context files defer to `AGENTS.md`. Coding rules for every tool: `conductor/code_styleguides/`
(`typescript.md`, `testing.md`, `google-apis.md`); past mistakes and their rules: `conductor/lessons-learned.md`.

## Not verified (be honest about these)

- **Nothing has run against the real Google APIs** (sign-in, Sheets, Drive). Everything is tested only against `FakeSheets` / `FakeDrive`.
  Those fakes encode Google's documented behaviour, but the docs, not a real run, are the source.
  Drive-specific risks to check on the first real run: multipart upload accepted; folder create/rename accepted (JSON content type);
  `drive.file` can see the folder it created on the next session; `files.get?fields=id,trashed` on the cached folder.
- **Browser-only code has never run in a browser:** `resizeToJpeg` (canvas, `createImageBitmap`, EXIF orientation), IndexedDB cache in
  real Safari/Chrome/Firefox, the UI (layout, dark mode, Button styling). jsdom has no canvas; only the logic around the browser APIs is tested.
- **Photos are not wired in yet:** nothing in the store or UI calls the Drive layer (step 5b).
- Real-run checklist for the Sheets side: `npm run dev`, sign in, expect "N books · M currently lent out". Likely first failures:
  `http://localhost:5173` missing from authorised origins; tab names not exactly `Books` / `Borrowers`; a header missing (the error names
  it); APIs not enabled. Date columns must be formatted `yyyy-mm-dd` or dates read back in the Sheet's locale format.
- Whether the owner's own token can delete protected rows (ADR-0004) — test in a scratch sheet (step 8).
- Whether Antigravity/Conductor auto-load `AGENTS.md` (docs are silent; `.agents/rules/agents.md` symlink is the fallback). Conductor's
  context files do link to it and its track followed the handoff protocol, which is evidence it reads it in practice.
- Numbers are parsed assuming `.` as the decimal mark (`₹1,299.50`). A comma-decimal Sheet locale would misread.

## Gotchas (learned the hard way; more in `conductor/lessons-learned.md`)

- **Redux serializes thunk errors** to `{name, message, stack, code}` — `instanceof` and `status` are lost. Branch on `error.name`
  (`SessionExpiredError`, `SheetsPermissionError`, `DrivePermissionError`, `ValidationError`, `AlreadyBorrowedError`, `NotBorrowedError`,
  `BookNotFoundError`, `SheetSchemaError`) and `error.code` (`'401'`, `'403'`, `'404'`, `'500'`, `'NETWORK'`). Outbox-retryable: `SessionExpiredError` and `NETWORK`.
- **Sheet writes are serialized** (`inWriteQueue`): each derives something from a fresh read. A hung request would block later writes.
- `addBook` is not optimistic (ID assigned at write time); edit/borrow/return are. Blank input is rejected before any optimistic change (ADR-0006).
- **Drive:** JSON bodies need `application/json`; uploads need `multipart/related` (never `FormData`); `drive.file` sees only app-created files.
  Never `trashed: true`. Rename, don't delete.
- **IndexedDB under jsdom** (`fake-indexeddb`) cannot round-trip a `Blob` (returns `{}`); the cache stores `ArrayBuffer` + type (also safer on iOS Safari).
- The `shadcn` CLI once installed an unrelated npm package `cn`. After any generator, re-read `package.json` and new imports.
- Tailwind mapping uses `@theme inline`; do **not** redefine Fusion's `--accent`/`--secondary`.
- TS 6: no `baseUrl` (use `paths`); `erasableSyntaxOnly` forbids constructor parameter properties and enums. `tsconfig.app.json` includes `node` types (guard tests use `node:fs`).
- Symlinks: `.agents/rules/agents.md` → `AGENTS.md`; `.agents/skills/custom-ui-design-system` → `.agents/ui/skills/custom-ui-design-system`.
- Owner's local files (not committed on purpose): `THE-LAST-SYNC.txt`, and a `.gitignore` line for it whose path
  (`books-management/THE-LAST-SYNC.txt`) is wrong relative to the repo root — it should read `THE-LAST-SYNC.txt`.

## Next: step 5b brief — wire photos into the store (ADR-0007)

Goal: photos flow through the store using the finished Drive layer. No screens yet (capture UI is step 6). Same layering and fake-`fetch`
tests as before; **read `conductor/code_styleguides/` first.**

- **Drive access in thunks:** build a Drive client from the same token/`fetchImpl` as Sheets (`ThunkExtra`), and one `FolderResolver` per
  signed-in account (memoized; dropped on sign-out / account change). On an upload 404 for the parent, `forget()` and retry once.
- **`addBook` with a photo** (`{ full, thumb }` from `createCoverVariants`): upload `full` **first**, then append the Sheet row with
  `createDriveFileUrl(fileId)`, then `saveCoverToCache(fileId, full, thumb)` (best-effort). If the row write fails, the upload is an
  orphan file (harmless); the outbox (step 7) will reuse the uploaded file ID, so return/keep it in the error path.
- **`editBook` with a new photo:** upload new, `updateBook` the Photo cell, then `markReplaced(oldFileId, bookId)` (best-effort: a failed
  rename must not fail the edit; record it). The old cover is renamed, never deleted.
- **Cover loading:** `src/services/drive/covers.ts` — `getCoverUrl(fileId, 'thumb' | 'full')`: cache hit -> object URL; miss -> `fetchCoverBlob`
  -> cache -> object URL; a thumb miss on a cover cached without one derives it with `resizeToJpeg(…, THUMB_EDGE)`. Track and revoke object URLs.
- **Tests (use `FakeSheets` + `FakeDrive` together):** upload happens before the row append (assert call order); a failed row write leaves
  an orphan file and no Photo cell; replacing renames the old file and never trashes/deletes; cache is populated and a second read makes
  no Drive call; token expiry mid-flow flips the session to `expired` and rolls back; blank title still rejected before any upload.
- **Acceptance:** all of the above green; guard tests still pass; control check for the upload-ordering test; `npm run verify` passes on the final code;
  STATUS.md updated per `conductor/workflow.md`, including a Completion Report (Done / Verified / Not verified / Deviations / Follow-ups).

Later steps have their design in `AGENTS.md` (Data flow, Screens) and ADR-0006/0007.

## Log

- 2026-09-19 — Claude Code: **cross-review of step 5 and fixes.** Found verify red, tautological cache tests, missing thumbnail,
  JSON sent without Content-Type, `FormData` upload (Drive needs `multipart/related`), duplicate `SessionExpiredError`, fragile folder
  cache, a delete-guard gap (`trashed:true`), loose link parser. Fixed all; tests rewritten against a strict `FakeDrive` (control checks
  confirmed the new tests fail on the original bugs). Added `conductor/code_styleguides/{typescript,testing,google-apis}.md`,
  `conductor/lessons-learned.md`, workflow rules (spec conformance, Completion Report, STATUS hygiene), `conventions.test.ts`. 166 tests.
- 2026-09-18 — Antigravity (Conductor): step 5 Drive service layer built (folder, upload, rename, cache); 112 tests. Marked done; review found it was not (see above).
- 2026-09-18 — Claude Code: **step 4 done.** Sheets layer + thunks + fake Sheet; 83 tests. Fixed a duplicate-ID race (writes serialized) and
  optimistic blank input; thunk errors carry `code` because Redux drops `status`.
- 2026-09-18 — Claude Code: scaffold (step 3) done; docs aligned (ADR-0002/0004 amended, 0005–0007 added); handoff protocol,
  `npm run verify`, `.agents/rules` + `.agents/skills` links, `CLAUDE.md` imports `AGENTS.md`.
