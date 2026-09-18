# 0004. Books are append-only — no delete capability

## Status
Accepted (amended: limits of the sheet-layer protection, code-level guard,
Drive rename-not-delete; **amended again by ADR-0009**: the app may offer a
"Delete book" control that only sets `Active` = No; no row is ever removed)

## Context
Requirement: books can be created and read (and later edited), but must
never be deleted. Google Sheets does not offer an OAuth scope granular
enough to allow read/write access while blocking deletes at the API
level — the only scopes available are read-only or full read/write.

## Decision
Enforce "never delete" at three layers instead of one:
1. **UI layer** — the app never exposes a delete action for books, and
   no code path calls a delete or clear operation on the `Books` tab.
2. **Code guard** — the Sheets/Drive service layer exposes no delete or clear
   functions at all (no `deleteDimension`, `clear`, `values.clear`,
   `files.delete`, `emptyTrash`). A test/lint check asserts this so a future
   change can't quietly add one.
3. **Sheet layer** — a Google Sheets "protected range" on the `Books` tab, as a
   backstop independent of the app code.

**Drive:** covers are never deleted either. When a cover is replaced, the app
uploads the new file, updates the Photo cell, then **renames** the old file to
`deleted-file-<BookID>.jpg`. The owner removes those by hand in Drive whenever
they like. A rename is a `files.update`, not a delete.

## Consequences
- Defense in depth: an app bug alone can't delete a book, since the
  code guard and the sheet-level protection are separate safeguards.
- **The protected range does not bind the sheet owner.** The signed-in user is
  the owner, so the app's own token can probably still perform a protected
  action; the protected range mainly guards against accidental edits and other
  collaborators. It is a backstop, not a guarantee, and the code guard (layer 2)
  is the layer that actually stops the app itself. This should be verified in a
  scratch sheet when the protected range is set up.
- Not an absolute guarantee — the sheet owner could still remove the
  protection or edit the sheet directly outside the app. Acceptable,
  since this is the user's own data and the goal is to prevent accidental
  loss, not to defend against the owner themselves. Sheets version history is
  the recovery path.
- Any future agent adding book-management features must not add a delete
  action without first revisiting this decision. (ADR-0009 did that: the
  only "delete" is the reversible `Active` flag.)
