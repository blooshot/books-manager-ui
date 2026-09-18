# 0006. Redux Toolkit store with write-through writes and an outbox

## Status
Accepted

## Context
The app should hit the Sheets API as little as is sensible. A fully deferred
model — all changes staged locally and pushed by a "Sync" button — was
considered. It has real risks here: unsynced adds are lost if the tab closes or
the token expires; Book IDs derived from a stale max can collide; hand-edits
made in the Sheet meanwhile can be overwritten or hit the wrong row. It would
need temp IDs, conflict detection and a persisted queue. Sheets quotas (about
60 writes/min per user) are far above what a single user generates, so API
call volume is not a real constraint.

## Decision
- **State:** Redux Toolkit. `books` and `borrowers` use `createEntityAdapter`;
  `session` holds token, expiry and email; a small `drafts` slice mirrors form
  fields to `sessionStorage`. Async work uses `createAsyncThunk` (`loadAll`,
  `addBook`, `editBook`, `borrowBook`, `returnBook`) — there is no delete thunk
  for books (ADR-0004). Derived data (`isBorrowed`, lent-out by borrower,
  filtered/sorted lists) are `createSelector`s. RTK Query is not used: the
  "API" is two sheet ranges, so its cache/invalidation model adds little.
- **Reads:** load both tabs once with a single `batchGet`; everything else is
  served from the store. Refresh on startup, on a manual button, and after a
  reconnect — not on a timer.
- **Writes:** write-through and optimistic. The store updates instantly, the
  Sheets call fires immediately, and on failure the change rolls back with an
  error toast. Book IDs are computed as max + 1 at write time.
- **Outbox:** a write that fails because of an expired token or no network is
  kept in a persisted outbox (IndexedDB, so photo Blobs fit), shown as
  "N pending". The **Sync** button flushes the outbox and then reloads from
  the Sheet.
- The whole store is **not** persisted between sessions; stale book data is
  worse than a fresh load.

## Consequences
- The Sheet stays the source of truth and is never silently behind the UI for
  long.
- No temp IDs or conflict-resolution logic are needed.
- Sync semantics are simple: flush, then reload.
- The generic SWR rule in `.agents/ui/rules/react-data-fetching.md` does not
  apply here.
- If offline-first use becomes a goal, this should be revisited (see ADR-0002).

## Clarifications (from implementing step 4)
- **Adding a book is not optimistic.** The Book ID is assigned from a fresh read at write time, so the book enters the
  store once the Sheet confirms it. Edit, borrow and return *are* optimistic and roll back on failure. Blank required
  fields are rejected before any optimistic change.
- **Sheet writes run one at a time** (an in-process queue). Each write derives something from a fresh read (next ID, row),
  so overlapping writes such as a double-clicked Add could otherwise duplicate an ID.
- **Row edits write only the changed cells** (`values:batchUpdate`), never a whole row, so columns the app doesn't know
  about are never overwritten. Endpoints are limited to `values:batchGet`, `:append`, `values:batchUpdate`
  (enforced by an allow-list test).
- **Errors:** Redux serializes thunk errors to `{name, message, code}`. `SheetsError.code` is the HTTP status as a string or
  `'NETWORK'`; the outbox (step 7) retries only `SessionExpiredError` and `NETWORK`.

## Outbox design (step 7)
- **What is queued:** only a write that fails for a *retryable* reason: an expired token (`SessionExpiredError`; nothing was written) or a network failure (`code: 'NETWORK'`; the outcome is unknown). Validation errors, conflicts, 4xx and 5xx are reported and
  rolled back as before, because sending them again unchanged would not help. Operations: add book (with optional photo), edit book (with optional photo), borrow, return.
- **No temporary IDs.** A book added while it cannot be sent has no Book ID until the Sheet assigns one, so it appears only in the *Pending changes* list, not among the books. Nothing can depend on it (borrow/return/edit refer to books that already exist), which
  removes the temp-ID remapping problem entirely.
- **Storage:** IndexedDB (`BookOutbox`), because entries can carry photo bytes (`ArrayBuffer` + type). The token is never stored. If IndexedDB is unavailable, or the write to it fails, the original error is reported and the optimistic change is undone: a change that is neither
  saved nor queued must not be lost silently. The Pending changes page says when the browser can't keep a queue.
- **Order:** entries are sent strictly in the order they were saved. A retryable failure stops the flush there and leaves that entry and everything after it queued. A permanent failure (e.g. someone else borrowed the book meanwhile) marks only that entry `failed` with the reason
  and the flush carries on. The user can Retry a failed entry or Discard it (a two-step action that drops only the local, unsent change; it never touches the Sheet or Drive).
- **Retries never write twice.** A network failure is ambiguous: the write may have reached Google and only the response been lost. So each send is idempotent: an add is found again by its `Added at` timestamp (chosen once, when the user saved, and stored as forced text so the exact
  string reads back); a borrow is found by book + borrower + date + time; a return already applied is recognised. A cover that was uploaded before the row write failed is remembered by its Drive file ID and linked on retry instead of uploading a second copy.
  If a Sheet's date/time formatting stops these matches from working, the degraded outcome is a `failed` entry the user can discard, not a duplicate row (for borrow and return); the add's key is forced text so it does not depend on formatting.
- **Refresh keeps pending changes on screen.** Loading from the Sheet overlays `pending` entries on the loaded data (edits applied, a queued borrow shown as a temporary open loan, a queued return applied), so pressing Refresh, or reloading the page, never makes a queued change disappear.
- **When it sends:** on sign-in (app start) and after a reconnect the app reads the stored queue, sends it if anything is waiting, then loads; the **Sync** button does the same on demand (flush, then reload). Sync is off while it runs and while the session is expired. A stopped or partly failed sync says so
  in a notice; a clean one is quiet (the "N pending" indicator disappears).
- **Deliberately not done:** conflict *resolution* beyond marking the entry failed (no merge UI); syncing a queued add's dependents (there are none); background/timed sync (the app sends on start, reconnect, and Sync only).

