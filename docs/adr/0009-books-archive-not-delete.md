# 0009. "Delete book" archives it (Active flag); no row is ever removed

## Status
Accepted. Amends ADR-0004 (books are append-only): the intent (no data loss) stays; the rule text changes so the app may offer a delete
control that only hides a book.

## Context
The owner wants to be able to delete a book from the app, but nothing may really be erased from the Sheet. ADR-0004 forbade any delete
control. ADR-0008 already established the pattern for categories and languages: an `Active` cell, archived rather than removed.

## Decision
- `Books` gets an optional `Active` column (Yes/No, blank counts as Yes). **Delete book** sets it to `No`; **Restore** sets it to `Yes`.
  Both are ordinary cell edits found by Book ID, through the same `values:batchUpdate` as any other edit, so they use the optimistic
  update and the outbox like an edit (ADR-0006).
- The rule that stays absolute: **no row is deleted or cleared, and no delete or clear API call exists.** `src/test/tests/no-delete.test.ts`
  (patterns and endpoint allow-list) is unchanged and still enforces it. Drive covers are still never deleted (renamed on replace).
- Hidden means hidden from the app's screens: a deleted book leaves All / Available / Borrowed, the counts, the category grouping and
  the filters, and is found under the list filter **Archived**, where it can be restored. Its row, loans and cover stay.
- A book that is currently lent out cannot be deleted; return it first (its loan would otherwise vanish from every screen).
- Book IDs are `max existing + 1` over **all** rows, archived ones included, so a deleted book's ID is never reused.
- The delete control asks first, and says plainly that the book is hidden, not erased.
- Older Sheets: the `Active` column is optional on read (all books count as active). Deleting needs the column; without it the app says
  what to add and the button is disabled. Writing to a missing column is an error, never a silent loss.

**Sheet protection (ADR-0004 layer 3):** the owner set the `Books` tab to owner-only editing on 2026-09-19 (reported by the owner, not
re-tested by us; the scratch-copy API test in STATUS step 8 was not run). The app signs in as the owner, so its writes are expected to
continue to work; if a write is ever refused with a permission error, this is the first place to look.

## Consequences
- Hard constraint 3 in `AGENTS.md` now reads "no row is removed", not "no delete control". UI tests that said "no delete or remove
  control on the book page" were changed to "the only such control is Delete book, and it never removes a row".
- A deleted book still costs a row; the Sheet grows. The owner can remove archived rows by hand in the Sheet (their data, their call), which
  the app tolerates like any hand edit.
- Loan history of a deleted book stays in `Borrowers`; it just has no book screen to show on until restored.
