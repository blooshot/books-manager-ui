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

