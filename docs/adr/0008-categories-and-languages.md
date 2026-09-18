# 0008. Categories and languages: managed lists, archived not deleted

## Status
Accepted. Builds on ADR-0001 (Sheet as store), ADR-0004 (append-only) and ADR-0006 (write-through, outbox).

## Context
The owner wants books grouped and filterable by category (self-help, business, psychology, ...), with categories the owner can add, edit and
delete, and a language (English, Hindi, ...) chosen per book. A book can belong to several categories. Books must still never be deleted,
and the Sheets client has a guard test that forbids any delete or clear call (ADR-0004).

## Decision
**Where it lives (all in the same Sheet, no new service):**
- Two new tabs, `Categories` and `Languages`, each with the header row `Name`, `Active`.
- Two new columns on `Books`: `Categories` (names joined by `, `) and `Language` (one name).
- Books store the **name as text**, not an ID. The Sheet stays readable and hand-editable. Category names cannot contain a comma (the form and the
  API refuse it), which keeps the joined cell unambiguous.

**"Delete" means archive.** Deleting a list entry would need a `deleteDimension` call, which the guard forbids and ADR-0004 rules out in spirit.
Instead an entry has `Active = Yes/No`. Archiving sets it to No: the entry disappears from pickers, filters and the grouped view, its row stays,
and every book keeps its text. Restoring flips it back and everything reappears. Adding the name of an archived entry restores it rather than
adding a duplicate. No new Sheets endpoint is used: every write is `values:append` or `values:batchUpdate` on cells.

**Rename** changes the entry's row and the same text on every book that has it, in **one** `values:batchUpdate`. It is safe to repeat: if the row
was already renamed, the books are still swept, so a half-finished earlier attempt is completed rather than reported as a clash.

**Book edits keep hidden values.** The edit form only offers active entries but keeps the names the book already has, so saving a title change never
drops an archived category or language. A book shows only its active categories on screen.

**Older Sheets keep working.** Loading is still one `batchGet`, now of four ranges. If `Categories` or `Languages` is missing, the read is repeated
without it and the app shows what to add (a setup hint in the form and on the Categories page); the new `Books` columns are optional on read. Only
*writing* a value into a column that does not exist is an error (`SheetSchemaError` naming the column), because it would otherwise be lost silently.
`Books`, `Borrowers`, and every original `Books` column stay required.

**List writes are online-only, not outbox-queued.** Add / rename / archive / restore of a category or language wait for the Sheet (not optimistic) and,
if the session has expired or the network is down, fail with a message and change nothing. This departs from ADR-0006 for these writes only.
Reasoning: they are quick, occasional admin actions; queueing a rename needs a new operation type with ordering rules against queued book edits
(a queued edit could re-add an old name after a rename), which is more machinery than the benefit. Adding a book or editing a book's
categories/language **does** use the outbox as before, because those fields are part of the book operations.

## Consequences
- The owner must add the two tabs and two columns (README > Sheet setup). Until then the app works but cannot set categories or languages.
- A category renamed in the app while a book edit that still carries the old name waits in the outbox will bring the old name back on that book when the
  edit is sent. Rare (needs offline + rename); the Categories page shows the book count, so it is visible and fixable by editing the book.
- Category names are matched ignoring case and surrounding spaces; two names that differ only by case are treated as the same.
- The no-delete guard and its endpoint allow-list are unchanged and still pass.
- Reversible: if a real delete is ever wanted, that is a new ADR that relaxes the guard for the two list tabs only.
