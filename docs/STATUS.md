# STATUS — live progress ledger

Read this after `AGENTS.md` at the start of every session; update it at the end
of every session or milestone (protocol in `AGENTS.md`). Newest entries at the top
of "Log". Keep it short and factual.

**Last updated:** 2026-09-18 · **By:** Claude Code

## Where we are

Build order (from `AGENTS.md`):

| # | Step | State |
|---|---|---|
| 1 | Create the Google Sheet with exact columns | **Owner action** — Sheet ID is configured; column headers/formats not yet confirmed against the app |
| 2 | Google Cloud project, OAuth client, consent screen "In production" | **Owner action** — client ID configured in `.env.local` |
| 3 | Vite + React + Tailwind + shadcn/ui scaffold, Fusion tokens, Redux store, GIS sign-in | **Done** |
| 4 | Sheets read/write service layer + no-delete guard | **Done** (tested against a fake Sheet only — see "Not verified") |
| 5 | Drive photo upload/read/cache | **Done** |
| 6 | Screens (in the order in `AGENTS.md`) | **Next** |
| 7 | Outbox + Sync button | Not started |
| 8 | Protected range on `Books` (verify owner behaviour, ADR-0004) | Not started, needs the real Sheet |
| 9 | Deploy + CI/CD | Not started |

## What exists

**Step 3** — sign-in gate, reconnect banner, token-expiry timer, theme toggle, app shell.
Redux `session` (token in memory only, email hint in localStorage), `books`, `borrowers`, selectors
(`selectOpenLoanByBookId`, `selectLentOutByBorrower`). Fusion tokens imported from
`.agents/ui/skills/custom-ui-design-system/tokens.css`; Tailwind mapping in `src/index.css`.

**Step 4** — Sheets layer in `src/services/sheets/`:
- `mapping.ts` — pure row<->type conversion by **header name** (strict: every column in `AGENTS.md`
  must exist, else `SheetSchemaError` listing them). Text that starts with `= + - @` is escaped so
  USER_ENTERED can't turn it into a formula.
- `ids.ts` — `nextBookId` (highest `B-NNNN` + 1).
- `client.ts` — the only HTTP code. Exactly three operations: `values:batchGet`, `values/{range}:append`,
  `values:batchUpdate` (single cells). 401 → `SessionExpiredError`, 403 → `SheetsPermissionError`,
  network → `SheetsError` with `code: 'NETWORK'`.
- `api.ts` — `readAll`, `appendBook`, `updateBook` (writes only changed cells, never Book ID / Added at,
  never unknown columns), `appendLoan` (rejects unknown book / already borrowed), `returnLoan`.
  Every write re-reads first and finds rows by Book ID.
- `src/store/libraryThunks.ts` — `loadAll`, `addBook`, `editBook`, `borrowBook`, `returnBook`, plus
  `librarySlice` (load status). `makeStore(extra)` injects `{sheetId, fetchImpl, now}` so tests use a fake Sheet.
- `src/test/fakeSheets.ts` — in-memory Sheets API used by the tests.
- App shell loads the library after sign-in (and after a reconnect) and shows "N books · M currently lent out"
  — a first end-to-end smoke display; the real list screen replaces it in step 6.

`npm run verify` passes: 83 tests, build OK, 1 known lint warning (generated `button.tsx`).

## Not verified (be honest about these)

- **Nothing has run against the real Google APIs.** Sign-in (popup, scopes, `userinfo`), and every Sheets call are
  only tested with mocks/a fake. First real run: `npm run dev`, sign in, expect "N books · M currently lent out".
  Likely first failures: authorised JavaScript origin missing for `http://localhost:5173`; tab names not exactly
  `Books` / `Borrowers`; a header missing or spelled differently (the error names the tab and columns);
  APIs not enabled. Date columns must be formatted `yyyy-mm-dd` (Format → Number → Custom) or dates read back in
  the Sheet's locale format.
- **Nothing has been viewed in a browser.** Layout, dark mode, Button styling checked by build output only.
- Whether the owner's own token can delete protected rows (ADR-0004) — test in a scratch sheet (step 8).
- Whether Antigravity/Conductor auto-load `AGENTS.md` (docs are silent; `.agents/rules/agents.md` symlink is the
  fallback). Smoke test: fresh session, ask "what are this project's hard constraints?".
- Numbers are parsed assuming `.` as the decimal mark (`₹1,299.50`). A comma-decimal Sheet locale would misread.

## Gotchas (learned the hard way)

- **Redux serializes thunk errors** to `{name, message, stack, code}` — `instanceof` and `status` are lost.
  UI/outbox code must branch on `error.name` (`SessionExpiredError`, `SheetsPermissionError`, `ValidationError`,
  `AlreadyBorrowedError`, `NotBorrowedError`, `BookNotFoundError`, `SheetSchemaError`) and `error.code`
  (`'401'`, `'403'`, `'500'`, `'NETWORK'`). Retryable for the outbox: `SessionExpiredError` and `NETWORK`.
- **Sheet writes are serialized** (`inWriteQueue` in `libraryThunks.ts`): each write derives something from a fresh read
  (next ID, row), so overlapping writes could duplicate an ID. A hung request would block later writes.
- `addBook` is *not* optimistic (ID is assigned at write time); edit/borrow/return are optimistic with rollback.
  Blank title/author/borrower are rejected *before* any optimistic change. See ADR-0006 "Clarifications".
- The `shadcn` CLI mis-resolved the alias and installed an unrelated npm package `cn`; it was removed and imports use
  `@/lib/utils`. **After `npx shadcn add ...`, check `package.json` and the new file's imports.**
- Tailwind mapping uses `@theme inline`; do **not** redefine Fusion's `--accent`/`--secondary`.
- TS 6: no `baseUrl` (use `paths`); `erasableSyntaxOnly` forbids constructor parameter properties and enums.
  `tsconfig.app.json` includes `node` types (the guard test uses `node:fs`).
- Symlinks: `.agents/rules/agents.md` → `AGENTS.md`; `.agents/skills/custom-ui-design-system` →
  `.agents/ui/skills/custom-ui-design-system`.
- Owner's local files (not committed on purpose): `THE-LAST-SYNC.txt`, and a `.gitignore` line for it whose path
  (`books-management/THE-LAST-SYNC.txt`) is wrong relative to the repo root — it should read `THE-LAST-SYNC.txt`.

## Next: step 5 brief (Drive photo pipeline) — see ADR-0007

Goal: cover photos end to end, with the same layering as step 4 (pure logic separate from fetch, fake-`fetch` tests).
Only these Drive operations: `files.list` (find folder by name), `files.create` (folder; multipart upload), `files.get`
(`alt=media`), `files.update` (rename only). **Never `files.delete` / `emptyTrash`** — extend the allow-list test in
`src/test/no-delete.test.ts` for Drive the way it exists for Sheets.

Proposed modules:
- `src/services/drive/client.ts` — fetch wrapper (same 401/403/network error mapping as Sheets, reuse `SheetsError` family or
  introduce a shared base).
- `src/services/drive/folder.ts` — find-or-create `Book Covers` by name (`drive.file` only sees app-created files); cache the ID
  in localStorage (an ID is not a secret).
- `src/services/drive/photos.ts` — `uploadCover(file, bookId)` (multipart, `<BookID>.jpg`), `fetchCoverBlob(fileId)`,
  `markReplaced(fileId, bookId)` = rename to `deleted-file-<BookID>.jpg`.
- `src/lib/image.ts` — resize to a 1000px long edge, JPEG ~0.8 (`createImageBitmap` + canvas); pure sizing math unit-tested.
- `src/services/drive/coverCache.ts` — IndexedDB cache by file ID (full image + ~240px thumbnail).
- Photo cell holds the Drive **link**; add a helper to build/parse it (file ID from URL) with tests.
- Wire into `addBook`/`editBook`: upload first, then write the Sheet (per ADR-0007); replacing a cover renames the old file.

Acceptance criteria: unit tests for URL<->ID, resize math, folder find-or-create (existing / missing / duplicate names),
upload ordering (photo before row; failed row write leaves only an orphan), rename-not-delete on replace; guard test covers
Drive; `npm run verify` passes; update this file.

Later steps have their design in `AGENTS.md` (Data flow, Screens) and ADR-0006.

## Log

- 2026-09-18 — Antigravity (Conductor): **step 5 done.** Drive photo upload/read/cache service layer (folder management, multipart upload, file rename, IndexedDB coverCache) + fake tests; extended `no-delete` guard. 112 tests total.
- 2026-09-18 — Claude Code: **step 4 done.** Sheets layer + thunks + fake Sheet; 83 tests. Review found and fixed a
  duplicate-ID race (writes now serialized) and optimistic blank input; thunk errors carry `code` because Redux drops `status`.
- 2026-09-18 — Claude Code: scaffold (step 3) done; docs aligned (ADR-0002/0004 amended, 0005–0007 added);
  handoff protocol, `npm run verify`, `.agents/rules` + `.agents/skills` links, `CLAUDE.md` imports `AGENTS.md`.
