# STATUS — live progress ledger

Read this after `AGENTS.md` at the start of every session; update it at the end
of every session or milestone (protocol in `AGENTS.md`; how to keep it consistent: `conductor/workflow.md`).
Newest entries at the top of "Log". Keep it short and factual.

**Last updated:** 2026-09-19 · **By:** Claude Code (categories and languages, desktop layout, tests in `tests/` folders)

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
| 6a | Screens: shell + routing, book list (search/filter), book detail + borrow history, covers, notices | **Done** (Claude, committed `1c54d18`) — fake Sheets/Drive, jsdom only |
| 6b | Screens: add/edit book form with photo capture, form drafts | **Done** (Claude, committed `c7510da`) — fake Sheets/Drive, jsdom only |
| 6c | Screens: borrow / return, Lent out | **Done** (Claude, committed `1ff697f`) — fake Sheets/Drive, jsdom only |
| 7 | Outbox + Sync button | **Done** (Claude, committed `7e48b8a`) — fakes only |
| 7b | Owner's UI request: header menu, card grid, sort, **categories + languages** (ADR-0008) | **Done** (Claude) — fakes and stubbed Chrome only; **owner must add the two tabs and two columns to the real Sheet** (README > Sheet setup) |
| 8 | Protected range on `Books` (verify owner behaviour, ADR-0004) | **Next**, owner-driven (brief below) — needs the real Sheet |
| 9 | Deploy + CI/CD | Not started (brief below) |

`npm run verify` passes: **578 tests in 40 files**; `npm run ui:check` passes **9 flows**, build OK, 1 known lint warning (generated `button.tsx`).

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
- Tests: `src/store/tests/libraryThunks.photos.test.ts` runs `FakeSheets` and `FakeDrive` together (request order asserted). Control checks done: wrong upload
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

**Step 6b** — add / edit book (`src/features/books/`):
- Routes `/books/new` and `/books/:id/edit` (`AddBookPage`, `EditBookPage` in `BookFormPage.tsx`); "Add book" button on the list, "Edit" button on the detail page.
- `bookForm.ts` (pure, unit-tested): `validateBookForm` (title/author required, real `yyyy-mm-dd` date, amounts like `1,299.50`), `toNewBookInput`, `toBookPatch` (only changed fields, `null` clears an
  emptied optional field), `valuesFromBook`, `findDuplicate` (case/space-insensitive title + author, ignores the book being edited).
- Form: labelled fields with `aria-invalid` / `aria-describedby`, errors shown after the first submit and live afterwards, focus moved to the first invalid field (effect, not a timer), Book ID read-only,
  soft duplicate warning with a link (never blocks), "Saving…" locks the form, save errors shown by `error.name` with the form kept filled; an expired session says to reconnect and keeps the changes.
  Edit sends nothing when nothing changed; Cancel discards the draft.
- `PhotoField`: `<input type="file" accept="image/*" capture="environment">` -> real `createCoverVariants` -> preview (object URL made in the event handler, revoked on replace/clear/unmount);
  decode failure shows an alert and the book can still be saved; "Clear selection" only drops a not-yet-saved choice (there is no way to delete a saved cover).
- `useFormDraft`: fields mirrored to `sessionStorage` via `lib/storage` (`readSession`/`writeSession`/`removeSession`), kept only while different from the saved values, validated on read (corrupt/foreign
  drafts ignored), cleared by a successful save or Cancel, "Restored your unsaved changes" + Discard. Never contains the photo or a token.
- Tests: `BookFormPage.test.tsx` (29) with `src/test/imaging.ts`, which stubs the browser image APIs *under* the real resize code; control checks on five behaviours all red -> green.

**Step 6c** — borrow / return / Lent out (`src/features/loans/`, `src/components/ui/{dialog,accordion}.tsx`):
- `BookActions` on the detail page: available -> **Borrow**; borrowed -> **Mark returned** (one tap, date/time = now) and **Returned earlier…** (dialog). No delete anywhere.
- `BorrowDialog` / `ReturnDialog` in `ResponsiveDialog` (Radix Dialog; centred dialog on desktop, bottom sheet on phones via `data-presentation`; focus trap/restore, Escape, announced title + description). Borrow: borrower (native `datalist`
  autocomplete from past borrowers, one per person), date and time (default now, editable), optional place. Return: date/time (default now) that may not be before the loan.
- Pure logic in `loanForm.ts` (`validateBorrowForm`, `validateReturnForm`, `defaultDateTime`, `pastBorrowerNames`, `describeLoanError`). Errors by `error.name`: an out-of-date list (`AlreadyBorrowedError`/`NotBorrowedError`/`BookNotFoundError`)
  says so and offers **Refresh** (reload, then closes the dialog); an expired session says to reconnect and that nothing was saved; everything is kept in the form.
- **The dialogs stay mounted while a save is in flight.** The optimistic update flips the book's status mid-save; the return dialog remembers its loan (`returnTarget`) and the borrow dialog does not depend on `openLoan`.
- `LentOutPage` (`/lent-out`, nav item with `Users` icon): Radix Accordion, one borrower open at a time (first open by default), count badges, books oldest loan first with since date/time and place, links to each book, empty/loading/error states.
- `lib/clock.ts` (`clock.now()`, `setClockForTests`) pins "now" for form defaults in tests; `lib/datetime.ts` gained `isRealIsoDate` / `isValidTime` (shared with the book form); `FormField` moved to `components/`.
- `index.css`: dialog/sheet/accordion motion from the Fusion duration tokens, which `prefers-reduced-motion` zeroes.
- Tests: `BorrowReturn.test.tsx` (20), `LentOutPage.test.tsx` (9), `loanForm.test.ts` (25) incl. a full journey (borrow -> Lent out -> return -> gone). Control checks on five behaviours red -> green.

**Step 7** — outbox + Sync (design and reasoning: ADR-0006 "Outbox design"):
- `src/services/outbox/`: `types.ts` (ops: addBook / editBook / borrow / return; `OutboxRecord`, `OutboxStorage`), `indexedDbOutbox.ts` (IndexedDB `BookOutbox`, photo bytes as `ArrayBuffer` + type, every failure -> `OutboxUnavailableError`),
  `pending.ts` (`applyPending` overlay, `describeOp`). `lib/storedBlob.ts` is shared with the cover cache. `google/errors.ts`: `isRetryableFailure` (expired token or `NETWORK` only).
- Thunks (`store/libraryThunks.ts`, rewritten): on a retryable failure `addBook` / `editBook` / `borrowBook` / `returnBook` **keep the optimistic change and queue the operation** (`SAVED_OFFLINE_NOTICE`); any other failure rolls back and rejects as before. If nothing can be
  stored, the original error is reported and the change undone. `addBook` resolves `{ queued: true, id: '' }` (no Book ID yet; the form goes back to the list).
- `store/outboxThunks.ts`: `loadOutbox`, `flushOutbox` (strictly in order; a retryable failure stops the flush, a permanent one marks that entry `failed` with the reason and continues; guarded against concurrent runs), `syncAll` (flush, then reload; notices for a stopped or partly failed
  sync), `startSync` (sign-in and reconnect: read the queue, send it if anything waits, otherwise just load), `discardEntry`, `retryEntry`. `loadAll` overlays pending entries so Refresh/reload never hides a queued change.
- Retries are idempotent (`WriteOptions.idempotent` in `sheets/api.ts`): add found by `Added at` (now written as **forced text**), borrow by book + borrower + date + time, an already-applied return recognised; an uploaded cover's file ID is remembered and reused.
- Shared write helpers moved to `store/writeSupport.ts`; `store/thunkExtra.ts` adds `outbox` to the thunk `extra` (`makeStore` defaults to the IndexedDB outbox; tests inject `MemoryOutbox` / `UnavailableOutbox`).
- UI: `sync/SyncControl` in the header ("N pending" attention badge linking to `/pending`, "N failed" danger badge, **Sync** button; disabled while syncing or when the session has expired), `sync/PendingChangesPage` (`/pending`: what is waiting, why a change failed, Retry, two-step Discard),
  `AppLayout` calls `startSync` on sign-in/reconnect. `Badge` gained `attention` and `danger` variants.
- Tests: `store/outbox.test.ts` (34: queueing, ordering, partial failure, conflicts, expired token, concurrent flush, **lost-response retries for add/borrow/return/photo**, startup from a stored queue, overlay, discard/retry), `services/outbox/*.test.ts` (IndexedDB, overlay, retryable classification),
  `features/sync/Sync.test.tsx` (18: offline borrow/return/add/edit journeys, reload while offline and online, reconnect, conflict, pending page). Control checks: 8 on the outbox logic, 6 on the UI, plus the `Added at` fix, all red -> green.

**Login flow** (after step 7; looked at in real Chrome, see Not verified):
- `/login` (`LoginRoute`) is the only public route; `RequireSession` sends every other route there when signed out, keeping the requested location in router state so a successful sign-in returns to it (a deep link survives). After a deliberate sign-out
  (`session.signedOutByUser`) the location is not kept, so the next sign-in starts at `/`. A signed-in user visiting `/login` goes home. An expired session stays put (banner). `App` is now just `CoverProvider` + `AppRoutes`.
- `SignOutControl` (header, every screen): instant; if any outbox entries exist it asks "Sign out with unsent changes?" (Stay signed in / Sign out anyway). `signOut` does not await Google's token revoke; books, loans, library status, notices and the outbox *view* are cleared
  on `signOut.fulfilled`; unsent changes stay in IndexedDB and are sent automatically at the next sign-in (`startSync`).
- `SignInGate` preloads Google's script on mount so the sign-in click can open the popup at once. Tests: `features/auth/AuthFlow.test.tsx` (19; 7 control checks red -> green), including a journey: save a change offline -> sign out anyway -> back online -> sign in -> it is sent automatically.

**Sheet setup errors and the Chrome check** (after the first real request returned 400):
- `sheets/client.ts` maps Google's 400 `Unable to parse range: <tab>` to `SheetTabMissingError` (names the tab, says the app needs tabs named exactly `Books` and `Borrowers`, points to README > Sheet setup) and 400 `not supported for this document` (an uploaded Excel file) to a message saying
  to use File > Save as Google Sheets. Neither is retryable or queueable. Other 400s pass Google's own words through. `FakeSheets` now answers 400 for an unknown tab (it used to throw) and can simulate a non-native file (`notNativeSheet`).
- README > **Sheet setup**: the exact tab names, the two header rows to paste into A1, and the date (`yyyy-mm-dd`) and time (`HH:mm`) column formats.
- `scripts/ui-check/` (`npm run ui:check`, dev dependency `puppeteer-core`): real Chrome + Google stubbed at the network layer (sign-in script, userinfo, Sheets read/append/update, 400 for an unknown tab). 7 flows: deep-link login redirect, sign-out and next sign-in at home, add a book (a real write), offline change ->
  unsent-changes warning -> sent at next sign-in, missing tabs, wrong header, phone vs desktop layout. Control-checked (4 breakages, all caught). Not part of `verify`.

**Dropdowns** — `components/ui/select.tsx` is a themed Radix Select (`options`, `value`, `onValueChange`; `value: ''` is a normal choice such as "All categories"). Used for Sort by, Category, Language (list) and Language (form). A convention test forbids a native `<select>` in production code. In tests use `src/test/select.ts` (`chooseOption`, `optionsOf`, `shownIn`): open the trigger, then click the option; `setup.ts` polyfills the browser APIs Radix needs.

**Categories and languages** (ADR-0008; the owner's request after step 7):
- Sheet: tabs `Categories` / `Languages` (`Name`, `Active`) and `Books` columns `Categories` (names joined by `, `) / `Language`. All optional on read: `readAll` asks for four ranges in one `batchGet`, and if a list tab is missing repeats without it (`SheetTabMissingError.tab`); `LibraryData.setup`
  says what to add. Writing a category/language into a Books column the Sheet lacks throws `SheetSchemaError` (before any cover upload). `mapping.ts`: `OPTIONAL_BOOK_FIELDS` (column index -1), `parseNameList`, `parseOptions`.
- `sheets/api.ts`: `addOption` (an archived name is restored, not duplicated), `renameOption` (list row + the same text on every book in one `batchUpdate`; repeat-safe), `setOptionActive` (archive/restore). **No delete**: guard test and endpoint allow-list untouched.
- Store: `taxonomySlice` (`categories`, `languages`, `setup`), `taxonomyThunks` (not optimistic, **not queued** in the outbox, ADR-0008), `selectActiveCategories/Languages`. Book add/edit carry `categories` / `language` through the normal outbox ops.
- UI: category checkboxes + language select on the book form (`OptionFields.tsx`; archived values already on a book are kept on save; language shows `Name (archived)`); list has Category and Language filters, **Group by category** (default off, `?group=category`; a book in two categories appears under both; leftovers under Uncategorized), a tags line on cards, and detail rows;
  `/categories` page (`features/categories/`) with add / rename / archive / restore and per-entry book counts; "Categories" in the header menu and bottom nav. Filters and grouping live in the URL (`category`, `language`, `group`, `sort`).
- Tests: `api.options.test.ts` (25), `BookFormOptions` (9), `BookListOptions` (14), `ManageOptions` (12), form/mapping/list unit tests, two outbox tests. 8 control checks (no fallback for missing tabs, no book sweep on rename, writing to a missing column allowed, order-sensitive categories, Uncategorized first, archived shown in pickers, store changed before the Sheet, store books not renamed) all red -> green.

**Desktop layout** — header menu (Books, Lent out, Categories, Add book), sidebar hidden (`SHOW_SIDEBAR` in `AppLayout`; `layout/Sidebar.tsx` still tested), `max-w-6xl` column, product-card grid on desktop, Sort by purchase date.

**Guards/conventions** — `src/test/tests/no-delete.test.ts`: no delete/clear/`trashed:true`/trash/`FormData` upload; Sheets endpoint
allow-list; Drive method allow-list and PATCH-only-rename. `src/test/tests/conventions.test.ts`: no raw storage outside `lib/storage.ts`,
no `any`, default exports only for App/main/slices.

**Conductor** — `conductor/` context files defer to `AGENTS.md`. Coding rules for every tool: `conductor/code_styleguides/`
(`typescript.md`, `testing.md`, `google-apis.md`); past mistakes and their rules: `conductor/lessons-learned.md`.

## Not verified (be honest about these)

- **Categories and languages have never run against the real Sheet.** The two tabs and two columns do not exist there yet (owner action). Only `FakeSheets`, jsdom and the stubbed-Chrome check ran. Unverified against real Google: that a missing tab really returns `Unable to parse range: Categories` in a *four-range* `batchGet` (the fallback depends on it; the three-range case matched the earlier real 400), that `Active` = `Yes/No` typed cells read back as strings, and rename sweeping many rows in one `batchUpdate`.

- **Verified by the owner against real Google (2026-09-19):** sign-in, loading the Sheet, adding and editing books, **photo upload and replace on real Drive**, borrow, return, and the Lent out screen all worked on the owner's real Sheet. (Reported as working; details such as
  the exact Drive folder contents or renamed `deleted-file-*` files were not inspected by me.)
- **Still only tested against `FakeSheets` / `FakeDrive` / stubs:** the offline queue, Sync, the sign-out warning, the reconnect-after-expiry flow, and retries after a lost response against the real APIs (owner offline-test steps were given in chat; results not yet reported). Everything else in this list is unchanged.
- **Historic note (before the owner's run):** nothing had run against the real Google APIs.
  Those fakes encode Google's documented behaviour, but the docs, not a real run, are the source.
  Drive-specific risks to check on the first real run: multipart upload accepted; folder create/rename accepted (JSON content type);
  `drive.file` can see the folder it created on the next session; `files.get?fields=id,trashed` on the cached folder.
- **Browser-only code has never run in a browser:** `resizeToJpeg` (canvas, `createImageBitmap`, EXIF orientation), IndexedDB cache in
  real Safari/Chrome/Firefox, the UI (layout, dark mode, Button styling). jsdom has no canvas; only the logic around the browser APIs is tested.
- **The UI has never been seen in a browser:** layout at phone/desktop widths, dark mode, the Fusion look, focus rings, hover lift, `prefers-reduced-motion`, keyboard use,
  and the sidebar/bottom-nav switch at the 768px breakpoint. jsdom has no CSS or layout, so tests cover behaviour and accessibility roles only; `useMediaQuery` is driven by a stand-in.
- **Covers on screen:** the list/detail *display* covers through a stub loader in tests. `createBrowserCoverLoader` (real object URLs, real IndexedDB, canvas thumbnails) has never run in a browser.
- **Verified in real Chrome (headless, v153) with Google stubbed** by `npm run ui:check` (formerly a scratch harness), which stubs Google's sign-in script and the Sheets/Drive responses at the network layer, I walked: signed-out deep link -> `#/login` -> sign in -> back to the
  deep link; sign out -> `#/login` -> sign in -> `#/`; an unreachable Sheet -> "1 pending" and the unsent-changes warning; and looked at screenshots at 390px and 1280px (layout, Fusion styling, sidebar vs bottom nav, dialog as bottom sheet). **This is not real Google**: real sign-in,
  scopes, consent, real Sheets/Drive, and dark mode were not exercised, and the stub implements only the parts of the Sheets API the app uses.
- **The outbox has only run against `MemoryOutbox` and `fake-indexeddb`**, never real IndexedDB in Safari/Chrome/Firefox (quota, private windows, the connection closing between calls, storage eviction), and never against real network loss or a real 401. The "lost response"
  retries are simulated by a fake that applies a write and then throws.
- **Idempotency depends on how the Sheet formats things.** `Added at` is forced text so an add retry always matches. Borrow and return retries match on the date and time as *displayed*, so the `Borrowed date` / `Returned date` columns must be formatted `yyyy-mm-dd` and the time
  columns `HH:mm` (Format -> Number -> Custom). If they are not, a retry that follows a lost response ends up as a `failed` entry ("already borrowed"/"not currently borrowed") for the user to discard, never as a duplicate row. Rows added by steps 4-6 before this change have an `Added at` in
  whatever format Sheets chose; that only matters for retrying those (there are none yet).
- **Dialogs, sheets and the accordion have never been seen or used in a browser:** the bottom-sheet slide, focus handling on real devices, the native date/time pickers and `datalist` suggestions on iOS/Android, animation timing,
  and `prefers-reduced-motion` behaviour. jsdom covers roles, focus targets, and behaviour only. `useIsDesktop` is driven by a stand-in in tests.
- **Photo capture has never been tried with a real camera or real image:** `createCoverVariants` (canvas, `createImageBitmap`, EXIF rotation, JPEG encoding) is tested only with stand-ins under jsdom; the
  `capture` attribute's camera behaviour on iOS/Android, the file chooser on desktop, and preview rendering are browser-only.
- **The date field is a native `<input type="date">`:** its picker and format differ per browser; jsdom sanitizes invalid values, so the "invalid date" message is covered only by the pure `validateBookForm` tests.
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
- **Retryable means "nothing happened" or "unknown".** A 401 wrote nothing; a network failure may have written and lost the response. Only idempotent sends may be retried (ADR-0006). Never widen `isRetryableFailure` to 5xx/4xx.
- **`addBook` may resolve with `queued: true` and an empty `id`.** Code that navigates to the new book must check `queued` first.
- **Errors that used to roll back now queue.** An expired session no longer fails a save; it saves locally and the "N pending" indicator appears. Tests written for the old behaviour had to change (borrow dialog, add form, photo thunk).
- **`FakeSheets` parses ISO datetimes like real Sheets** (stores them as a US-style date-time); a value that must round-trip exactly must be forced text. Do not loosen that.
- **`renderApp` uses an in-memory outbox by default** (`outbox` option to inject one, `UnavailableOutbox` for the fallback); `makeStore` alone uses IndexedDB, which is absent in most test files (queueing then falls back to rollback).
- **UI must not unmount an editing surface because of the data it edits.** Borrowing flips the book to "borrowed" optimistically, which used to unmount the Borrow dialog mid-save (state and error lost; a blank dialog reappeared on failure).
  Keep dialogs mounted independent of the optimistic state, and remember what a dialog operates on when it opens.
- **Radix modals hide the rest of the page from assistive tech** (`aria-hidden` on everything outside), so `getByRole` cannot see the app behind an open dialog; query it by text, or close the dialog first.
- **Never move focus with a timer.** `requestAnimationFrame` after a failed submit fired mid-typing and pulled focus into the next invalid field (tests typing quickly saw "D" in Title and "une" in Author).
  Focus from an effect keyed to the submit instead. A test that passes alone but fails after another test is a real signal (shared state or timing), not flakiness to re-run.
- **`<input type="date">` under jsdom** drops values that aren't valid dates, so tests set it with `fireEvent.change(..., '2025-12-31')` and cover bad dates in the pure validator.
- **Testing the image path:** `src/test/imaging.ts` stubs `createImageBitmap` and canvas `getContext`/`toBlob`; the "JPEG" it produces is 2 bytes holding the canvas width so full (1000) and thumb (240) are distinguishable.
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

## Owner action for categories

On the real Sheet: add tabs `Categories` and `Languages` (header `Name`, `Active` in A1:B1) and the columns `Categories`, `Language` to the end of `Books` (README > Sheet setup). Then press Sync, open **Categories**, and add your lists (e.g. Self-help, Business, Psychology; English, Hindi). The app works without them, but shows a setup hint.

## Next: step 8 brief — protected range on `Books` (owner-driven; ADR-0004)

Goal: verify, on a **scratch copy** of the Sheet, what the protected range really does, then apply it to the real one and correct ADR-0004 with the facts. This cannot be done from tests.
1. Make a copy of the library Sheet. In it: Data -> Protect sheets and ranges -> the `Books` tab. Try both modes: "Show a warning when editing this range" and "Restrict who can edit" (only you).
2. With the **owner's own OAuth token** (dev app signed in as the owner, or the API Explorer), try what the app would never do: `values:clear`, `deleteDimension` on a row, and an ordinary `values:batchUpdate` on a protected cell. Record which succeed.
   Expectation to confirm or refute: the protection does **not** stop the owner (ADR-0004 already says so), and a *different* account (a second Google account given edit access) is blocked in "restrict" mode.
3. Update ADR-0004 "Consequences" with the observed behaviour and the mode chosen. Apply the chosen protection to the real Sheet. Do not add any code that deletes or clears; the guard tests stay as they are.
Claude can prepare a checklist/script for step 2 on request; running it needs the owner's Google account.

## Next after that: step 9 brief — deploy + CI/CD

Decisions needed first: static host (Cloudflare Pages / Netlify / GitHub Pages) and the deployed origin. Then: a GitHub Actions workflow on push to `main`: `npm ci` -> `npm run verify` -> `npm run build` (with `VITE_GOOGLE_CLIENT_ID`, `VITE_SHEET_ID`, `VITE_CURRENCY` from repository variables; none is a secret)
-> deploy `dist/`. Hash routing means no rewrite rules; for a GitHub Pages *project* site set Vite's `base` to `/<repo>/`. Add the deployed origin to the OAuth client's authorised JavaScript origins. Consider security headers (CSP allowing `accounts.google.com`,
`sheets.googleapis.com`, `www.googleapis.com`; `frame-ancestors 'none'`) on the host. Record the choices in a new ADR. Note: CI can only prove `verify`; it cannot prove real Google sign-in works on the deployed origin (an owner check).

## Log

- 2026-09-19 — Claude Code: **dropdowns are now the themed Select.** The owner saw the dropdown lists looked unstyled: they were native `<select>` elements, whose open list the browser draws. Replaced with a Radix Select (same `radix-ui` package the dialog uses, no new dependency) in the sort, category and language controls and the form's language field; the open list uses the Fusion card, border, highlight and check mark, with the same open motion as dialogs (reduced motion respected).
  **Verified:** `npm run verify` and `npm run ui:check` 9/9 (the flow now opens the dropdown with real mouse presses and saves `dropdown-open.png`, which I looked at); the convention test fails when a native `<select>` is planted. **Not verified:** on a real phone (touch, and how the popover sits above a mobile keyboard), dark mode, keyboard typeahead in a real browser (Radix provides it; only clicks were exercised). **Build:** the main JS bundle is now 518 kB (165 kB gzipped), just over Vite's 500 kB warning (a warning only; I did not measure it before this change, so I can't say how much the Select added). Code-splitting the routes would fix it if it matters. **Note:** the fixed phone bottom nav can cover a control scrolled to the very bottom edge of the screen; the Chrome flow had to scroll it to the middle first. Not changed.
- 2026-09-19 — Claude Code: **categories and languages (stage 2 of the owner's UI request).** Designed with the owner: multiple categories per book, "delete" = archive (`Active`), languages as a managed list too, list writes online-only (ADR-0008, new). Built the Sheets layer, store, form pickers, list filters/grouping, detail rows and the `/categories` page.
  **Verified:** `npm run verify` 578 tests / 40 files, build OK, 1 known lint warning; `npm run ui:check` 9/9 (new: manage/tag/group/rename/archive in real Chrome against the stub; an older Sheet without the tabs); 8 control checks red -> green; screenshots looked at (desktop list with filters, Categories page on phone). **Found and fixed by the new tests:** a missing list tab was mis-indexed
  (`indexOf` -1 read the Borrowers tab as the list), and a repeated rename treated its own already-renamed row as a name clash (would have broken retry). **Not verified:** the real Sheet (see Not verified), dark mode, a real phone. **Deviations:** list changes are not queued and not optimistic (ADR-0008 vs ADR-0006); grouping is off by default, not the default view. **Follow-ups:** owner adds the tabs/columns; step 8; step 9.
- 2026-09-19 — Claude Code: **desktop layout, sort, tests moved (stage 1 of the owner's UI request; stage 2 = categories + language is next, not started).** Desktop: the header now holds the menu (Books, Lent out, **Add book**); the sidebar is unchanged but hidden (`SHOW_SIDEBAR` in `AppLayout`; code in `layout/Sidebar.tsx`, still tested);
  header and page share a `max-w-6xl` column so a wide monitor no longer stretches; the desktop list is a **product-card grid** (cover, title, author, market price + "Paid", "Bought" date, status) instead of a table; phone is unchanged. New **Sort by** (title / purchased newest / purchased oldest, undated books always last, in the URL as `?sort=`).
  All test files moved from `dir/x.test.ts` into `dir/tests/x.test.ts` (`git mv`); they keep the `.test.ts(x)` suffix because vitest only discovers `*.test.*` (a `.tests.ts` name would have silently stopped every test running). The two guard tests now find `src` two levels up; a planted `DELETE` and a planted `any` both turned them red, then green after reverting.
  **Verified:** `npm run verify` 504 tests / 36 files, build OK, 1 known lint warning; `npm run ui:check` 7/7 (asserts header links, no sidebar/table, card grid, and a 1152px cap at 2560px wide); screenshot looked at. **Not verified:** real covers in the card grid (the stub has none), dark mode, real Google. **Deviation:** AGENTS.md says "Table on desktop, cards on phone"; this replaces that (see the Screens section). **Follow-ups:** stage 2; `AGENTS.md` Screens/list wording.
- 2026-09-19 — Claude Code: **polish.** The header **Sync** button is now the only refresh control (it sends unsent changes, then reloads; it spins and disables while sending *or* loading, and its tooltip says what it does); the list page's look-alike **Refresh** button is gone.
  The detail page shows `Added` as local `yyyy-mm-dd HH:mm` instead of the raw ISO timestamp (`formatTimestamp`). The owner reported real-Google runs of sign-in, Sheet load, add/edit, photos, borrow/return and Lent out all working. **Verified:** `npm run verify` on the final code: 491 tests / 35 files, build OK, 1 known lint warning;
  `npm run ui:check` 7/7 (the layout and add-book flows now assert the single Sync control and the readable Added time); 3 control checks red -> green in both layers; screenshots looked at. **Not verified:** dark mode; a real phone; the real offline/sync/expiry flows (owner steps given). **Follow-ups:** step 8 (owner), step 9.
- 2026-09-19 — Claude Code: **first real Sheet: 400 explained; Chrome check committed.** A `batchGet?ranges=Books` returned 400 from the owner's Sheet: Google answers `Unable to parse range: Books` when the spreadsheet has no tab of that name (a new Sheet's first tab is `Sheet1`). The client now says what to do, the fake
  answers like Google for unknown tabs, and README has the exact setup. Added `npm run ui:check` (7 flows). **Verified:** `npm run verify` on the final code: 482 tests / 34 files, build OK, 1 known lint warning; `npm run ui:check`: 7/7; 4 control checks on the script red -> green; the new tests were written red first.
  **Not verified:** the owner's real Sheet (the response body was not seen; the diagnosis is the standard cause and the friendly message will confirm it on the next run), real Google sign-in. **Follow-ups:** owner fixes the Sheet per README; step 8; step 9.
- 2026-09-19 — Claude Code: **login flow fixed after looking at the running UI.** Opening the app in real Chrome (Google stubbed) showed: no redirect after login (no login route), a deliberate sign-out returned you to the old page on the next sign-in, sign-out could hang while offline (it awaited the token revoke),
  the previous library stayed in memory after sign-out, and Google's script was only loaded after the click (popup-blocking risk). Added `/login` + `RequireSession`, instant sign-out that clears in-memory data, a confirm when changes are unsent, and script preloading. **Verified:** `npm run verify` on the final code:
  470 tests / 34 files, build OK, 1 known lint warning; 7 control checks red -> green; the flow re-walked in real Chrome. **Not verified:** real Google sign-in; dark mode; anything on a real phone. **Observations, not fixed:** the header **Sync** icon and the list page **Refresh** button look like the same control
  (two circular arrows); the detail page shows `Added` as a raw ISO timestamp. **Follow-ups:** a committed browser check script if wanted; step 8 (owner); step 9.
- 2026-09-19 — Claude Code: **step 7 done (awaiting owner review).** Outbox in IndexedDB; retryable failures (expired token, no network) keep the optimistic change and queue it; ordered, idempotent flush on sign-in, reconnect, and Sync; Pending changes page; header pending/failed indicator.
  **Verified:** `npm run verify` on the final code: 451 tests / 33 files, build OK, 1 known lint warning; 14 control checks red -> green (8 outbox logic, 6 UI) plus the `Added at` regression. **Found and fixed:** `Added at` (the add-retry key) would not have round-tripped through real Sheets (ISO datetimes are parsed), which would have
  made a retried add append a duplicate; the fake now models that and the value is forced text. Also: rewrote a vacuous "Syncing…" test and fixed a request-count assertion. **Not verified:** real IndexedDB in browsers, real network/401, real Sheet date/time formatting (see Not verified). **Deviations:** none from the brief; an offline-added book
  appears only in the pending list until sent (no temp IDs). **Follow-ups:** step 8 (owner), step 9.
- 2026-09-19 — Claude Code: **step 6c done (awaiting owner review).** Borrow / one-tap return / backdated return dialogs (dialog on desktop, bottom sheet on phone), borrower autocomplete, Lent out accordion screen and nav item, stale-list and
  expired-session handling. **Verified:** `npm run verify` on the final code: 365 tests / 29 files, build OK, 1 known lint warning; five control checks red -> green. **Found and fixed by the tests:** the optimistic status flip unmounted the Borrow dialog
  mid-save (state lost, blank reappearance on failure); also removed a placeholder assertion I had left in a test. **Not verified:** real browser, real devices/pickers, real Google. **Deviations:** none from the brief. **Follow-ups:** step 7.
- 2026-09-19 — Claude Code: **step 6b done (awaiting owner review).** Add/edit form pages with validation, duplicate warning, photo capture through the real resize code, sessionStorage drafts, error and saving states, Add/Edit entry
  points. **Verified:** `npm run verify` on the final code: 311 tests / 26 files, build OK, 1 known lint warning; five control checks red -> green. **Found and fixed:** a `requestAnimationFrame` focus timer that could pull focus into the next
  field mid-typing (surfaced as a test that only failed after another test). **Not verified:** real browser, real camera/image, real Google. **Deviations:** form is a page, not a dialog (deep-linkable, simpler). **Follow-ups:** 6c.
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
