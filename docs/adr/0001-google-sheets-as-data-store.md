# 0001. Use Google Sheets as the single data store

## Status
Accepted

## Context
The app needs a book catalog and a borrower log. It's used by exactly one
person, and the goal is zero cost and as few moving parts as possible. A
managed database (e.g. Supabase/Postgres) was considered early on, mainly
to handle concurrent multi-user writes and per-user access control — but
those problems don't exist for a single user. The user also already
maintains their book list in a Google Sheet and wants to keep editing it
by hand as the catalog's authoritative copy.

## Decision
Store all app data in one Google Sheet with two tabs: `Books` and
`Borrowers`. No external database.

## Consequences
- Zero cost, zero extra services, one clear source of truth.
- Data stays human-readable and hand-editable at all times.
- No relational integrity constraints — the app must enforce schema
  conventions itself (e.g. valid `Book ID` references).
- Subject to Google Sheets API rate limits, which are not a concern at
  single-user scale.
- No safe concurrent multi-writer support — acceptable, since there is
  only one writer.
