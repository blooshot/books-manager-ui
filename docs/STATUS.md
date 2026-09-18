# STATUS — live progress ledger

Read this after `AGENTS.md` at the start of every session; update it at the end
of every session or milestone (protocol in `AGENTS.md`; how to keep it consistent: `conductor/workflow.md`).
Newest entries at the top of "Log". Keep it short and factual.

**Last updated:** 2026-09-19 · **By:** Claude Code (step 6a)

## Where we are

Build order (from `AGENTS.md`):

| # | Step | State |
|---|---|---|
| 1 | Create the Google Sheet with exact columns | **Owner action** — Sheet ID is configured; column headers/formats not yet confirmed against the app |
| 2 | Google Cloud project, OAuth client, consent screen "In production" | **Owner action** — client ID configured in `.env.local` |
| 3 | Vite + React + Tailwind + shadcn/ui scaffold, Fusion tokens, Redux store, GIS sign-in | **Done** (Claude) |
| 4 | Sheets read/write service layer + no-delete guard | **Done** (Claude) — fake Sheet only |
| 5 | Drive photo service layer (folder, upload, fetch, rename, cache, links, resize) | **Done after review fixes** (built by Conductor, corrected by Claude) — fake Drive only |
| 5b | Wire photos into the store (upload-before-row, replace = rename, cover loading + cache) | **Done** (Claude) — fake Sheets + fake Drive only |
| 6a | Screens: shell + routing, book list (search/filter), book detail + borrow history, covers, notices | **Done** (Claude) — fake Sheets/Drive, jsdom only; awaiting review |
| 6b | Screens: add/edit book form with photo capture, form drafts | **Next** (brief below) |
| 6c | Screens: borrow / return, Lent out | Not started |
| 7 | Outbox + Sync button | Not started |
| 8 | Protected range on `Books` (verify owner behaviour, ADR-0004) | Not started, needs the real Sheet |
| 9 | Deploy + CI/CD | Not started |

`npm run verify` passes: **245 tests in 23 files**, build OK, 1 known lint warning (generated `button.tsx`).

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

**Step 5b** — photos wired into the store:
- `addBook({ …, photo?: { full, thumb } })`: inside the serialized write, after the Book ID is chosen and **before** the row is appended,
  the cover is uploaded as `<BookID>.jpg` (via `appendBook`'s new `beforeAppend` hook); the row stores the Drive link; the full image and
  thumbnail go into the local cache. Upload failure writes nothing. A row-write failure after the upload leaves only an orphan file.
- `editBook({ id, patch, photo? })`: text fields optimistic; a new photo is uploaded, the Photo cell updated, then the old cover is **renamed**
  `deleted-file-<BookID>.jpg` (never deleted). A failed rename does not fail the edit; it becomes a notice (`notices` slice: `noticeAdded` /
  `noticeDismissed`) for the UI to show.
- One `FolderResolver` per Google account (memoized per store); an upload that hits a missing folder (404) forgets it, re-resolves, and retries once (`uploadCoverInFolder`).
- `src/services/drive/covers.ts` — `createCoverLoader` / `createBrowserCoverLoader(driveClient)`: `getCoverUrl(fileId, 'thumb' | 'full')` serves
  IndexedDB first, Drive on a miss; derives a missing thumbnail from a cached full image (no re-download); simultaneous requests share one load;
  thumbnail failure falls back to the full image without caching it; `releaseAll()` revokes object URLs. **Nothing in the UI uses it yet.**
- Tests: `src/store/libraryThunks.photos.test.ts` runs `FakeSheets` and `FakeDrive` together (request order asserted). Control checks done: wrong upload
  order, never retiring the old cover, rename failure failing the edit, and skipped cache all turn tests red.

**Step 6a** — browse screens (`src/features/`, `src/App.tsx`, `src/main.tsx`):
- Routing: `react-router` v7, `HashRouter` in `main.tsx` (tests use `MemoryRouter`); routes `/`, `/books/:id`, `*` (not found) in `AppRoutes`.
- `layout/AppLayout` — sidebar (collapsible, choice kept in `bm.sidebarCollapsed`) on desktop, bottom nav on phone (`useIsDesktop`, md breakpoint), header with
  email / theme toggle / Sign out, reconnect banner, `NoticesHost` (dismissible toasts for the `notices` slice). Loads the library on sign-in and again after a reconnect.
  `NAV_ITEMS` is where step 6c adds Lent out.
- `books/BookListPage` — table (desktop) or cards (phone); search box + All/Available/Borrowed buttons (`aria-pressed`); **search and filter live in the URL**
  (`?q=&status=`); loading / empty / no-match / error (with Try again) states; Refresh button. Logic in `books/bookList.ts` (`selectBookListItems`, `filterBookItems`,
  `parseStatus`, `sortLoansNewestFirst`).
- `books/BookDetailPage` — metadata (money via `lib/format.formatMoney`, `VITE_CURRENCY`), full-size cover, status, borrow history feed (`BorrowHistory`), loading / not-found.
  **No delete/remove control anywhere** (asserted in tests).
- `covers/` — `CoverProvider` (one loader per session, `releaseAll` on unmount; `loader` prop for tests), `useCoverUrl` (lazy; an expired token raises the reconnect banner),
  `CoverImage` (thumb/full, busy + placeholder tile with the title's initial).
- `components/ui/{input,badge}.tsx`, `books/StatusBadge` (Available = success, Borrowed = neutral pill), `lib/useMediaQuery.ts`, `lib/format.ts`, `store/accessToken.ts`
  (shared token getter used by thunks and the cover loader).
- Tests: `src/test/render.tsx` (`renderApp`: real store + router against `FakeSheets`/`FakeDrive`, stub cover loader), `fixtures.ts`, `viewport.ts`. Control checks done (status filter,
  history order, reconnect banner, cover expiry, URL state); one gap found and closed (Available filter had no page-level test).

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
- **The UI has never been seen in a browser:** layout at phone/desktop widths, dark mode, the Fusion look, focus rings, hover lift, `prefers-reduced-motion`, keyboard use,
  and the sidebar/bottom-nav switch at the 768px breakpoint. jsdom has no CSS or layout, so tests cover behaviour and accessibility roles only; `useMediaQuery` is driven by a stand-in.
- **Covers on screen:** the list/detail *display* covers through a stub loader in tests. `createBrowserCoverLoader` (real object URLs, real IndexedDB, canvas thumbnails) has never run in a browser.
- **No photo capture UI yet** (6b), so covers can only appear for books whose Photo cell already holds a Drive link.
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
- **Tests with `globals: false`:** Testing Library does not auto-clean the DOM; `src/test/setup.ts` registers `cleanup` (and clears `localStorage`). Without it renders pile up and queries find "multiple elements".
- **Testing Library queries in this UI** are ambiguous by design (a "Books" heading, nav link and back link; "Borrowed" as badge, filter button, and history text). Scope with `within(...)`, list names
  (`getByRole('list', { name: 'Books' })`), or `{ selector: '[data-slot="badge"]' }`.
- **Lint:** `react/only-export-components` is off for `src/test/**` and `*.test.tsx` (`.oxlintrc.json` overrides); production files must still keep components and non-components apart.
- **Photo flow:** the cover file is named after the Book ID, which is only known at write time, so the upload happens *inside* the serialized write
  (after the ID is chosen, before the row). This refines the earlier "upload first, then append" wording. If the row write fails after the upload,
  the uploaded file's ID is not surfaced (Redux keeps only `name`/`message`/`code`): the outbox (step 7) must upload and remember the file ID
  *before* attempting the row so a retry can reuse it, or accept re-uploading. A retry after an orphan creates a second `B-000N.jpg` (harmless).
- **Drive:** JSON bodies need `application/json`; uploads need `multipart/related` (never `FormData`); `drive.file` sees only app-created files.
  Never `trashed: true`. Rename, don't delete.
- **IndexedDB under jsdom** (`fake-indexeddb`) cannot round-trip a `Blob` (returns `{}`); the cache stores `ArrayBuffer` + type (also safer on iOS Safari).
- The `shadcn` CLI once installed an unrelated npm package `cn`. After any generator, re-read `package.json` and new imports.
- Tailwind mapping uses `@theme inline`; do **not** redefine Fusion's `--accent`/`--secondary`.
- TS 6: no `baseUrl` (use `paths`); `erasableSyntaxOnly` forbids constructor parameter properties and enums. `tsconfig.app.json` includes `node` types (guard tests use `node:fs`).
- Symlinks: `.agents/rules/agents.md` → `AGENTS.md`; `.agents/skills/custom-ui-design-system` → `.agents/ui/skills/custom-ui-design-system`.
- Owner's local files (not committed on purpose): `THE-LAST-SYNC.txt`, and a `.gitignore` line for it whose path
  (`books-management/THE-LAST-SYNC.txt`) is wrong relative to the repo root — it should read `THE-LAST-SYNC.txt`.

## Next: step 6b brief — add / edit book (with photo capture)

Read `conductor/code_styleguides/` and `conductor/product-guidelines.md` first. Same flow and gates as 6a. Reuse `renderApp`, the fakes, and `addBook` / `editBook` (they already handle photos).

- **Routes/entry points:** an "Add book" button on the list (top of the page; primary action `bg-primary`), an "Edit" button on the detail page. Form as a page (`/books/new`, `/books/:id/edit`) or a
  Dialog on desktop / bottom Sheet on phone; decide in the plan (a page is simpler and deep-linkable). Add shadcn `dialog`/`sheet` only if used; **re-check `package.json` and imports after each `npx shadcn add`**.
- **Form:** Title and Author required; optional purchase date (`yyyy-mm-dd`), price paid, market price (numbers in `VITE_CURRENCY`); Book ID shown read-only on edit ("assigned when saved" on add).
  Inline validation messages tied to fields (`aria-describedby`/`aria-invalid`); controls 16px on phones; submit disabled while saving; server errors by `error.name` (`ValidationError`, `SessionExpiredError`, ...).
- **Photo:** `<input type="file" accept="image/*" capture="environment">` -> `createCoverVariants` (already written; browser-only) -> thunk `photo`; preview via object URL (revoke it); Replace/Remove-selection
  (removing a selection only clears the *pending* choice; there is no way to delete a saved cover).
- **Soft duplicate warning:** on add, warn (not block) when a book with the same title and author exists.
- **Drafts:** mirror form fields to `sessionStorage` through `lib/storage` (add a session-storage variant there; **no photo, no token**), restore on reload, clear on successful save.
- **After save:** navigate to the book's detail page; the store already holds it (`addBook` puts it in; `editBook` is optimistic).
- **Tests (Testing Library + `FakeSheets`/`FakeDrive`, no mocks of our own modules):** required-field validation; add without and with a photo (assert Sheet row, Drive file, request order); edit text only makes no Drive calls;
  edit with a new photo renames the old file; failure paths (500, 401 -> reconnect banner) roll back and keep the form filled; draft restore/clear; duplicate warning; keyboard/label basics; no delete control.
  Browser-only parts (camera capture, canvas resize) go under **Not verified**.
- **Acceptance:** all the above green; `npm run verify` on the final code; STATUS.md updated per `conductor/workflow.md` with a Completion Report.

6c (borrow / return / Lent out) and step 7 (outbox + Sync) follow; see `AGENTS.md` (Screens, Data flow) and ADR-0006.

## Log

- 2026-09-19 — Claude Code: **step 6a done (awaiting owner review).** Routing (`react-router`, hash), shell, book list with URL-backed search/filter, book detail with borrow history, cover display with
  placeholder, notices, shared token getter. **Verified:** `npm run verify` on the final code: 245 tests / 23 files, build OK, 1 known lint warning; control checks on five behaviours (one test gap found and closed).
  **Not verified:** any real browser (layout, dark mode, breakpoints, keyboard), real Google, real cover loading. **Deviations:** none from the brief; sorting is fixed (title) with no sort UI. **Follow-ups:** 6b, 6c.
- 2026-09-19 — Claude Code: **step 5b done.** Photos wired into `addBook`/`editBook` (upload inside the write before the row, replace = rename, best-effort cache, retry once
  on a missing folder), `covers.ts` loader, `notices` slice, two-fake integration tests. **Verified:** `npm run verify` on the final code: 195 tests / 17 files, build OK, 1 known
  lint warning; four control checks red-then-green. **Not verified:** real Google, real browser, cover loader in a browser. **Deviation:** upload happens after the ID is chosen,
  inside the write (the file is named by Book ID), not strictly "before the write". **Follow-up:** outbox must handle orphan uploads (step 7).
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
