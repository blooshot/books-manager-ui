# AGENTS.md — Personal Book Library App

Instructions for any AI coding agent (Claude Code, Codex CLI, Cursor, etc.)
working in this repository. Read this before making structural changes.

## What this project is

A personal, single-user web app to manage a home book collection:
book catalog with cover photos and purchase/market-price metadata,
plus a borrower log (who has a book, since when, where).

## Stack

- **Frontend:** React + Vite. Fully static — no backend server, no API routes.
  Not Next.js (ADR-0005).
- **UI:** Tailwind + shadcn/ui, themed with the Fusion design system in
  `.agents/ui/skills/custom-ui-design-system/` (see "Design system" below).
- **State:** Redux Toolkit — entity adapters, thunks, selectors (ADR-0006).
  Data is loaded once and read from the store.
- **Data store:** Google Sheets. One spreadsheet, two tabs (`Books`, `Borrowers`).
  There is no separate database.
- **Auth:** Google Identity Services token client (OAuth 2.0), directly in the
  browser. Scopes: `spreadsheets` + `drive.file`, plus the non-sensitive
  `userinfo.email` (only used for the "Continue as <email>" hint).
- **Photo storage:** A Google Drive folder created and owned by the app
  (`Book Covers`), accessed via the Drive API with the same OAuth session.
- **Hosting:** Any static host (Cloudflare Pages / Netlify / GitHub Pages).
- **CI/CD:** GitHub Actions, auto-deploy on push to main.

Full reasoning for each of these choices is in `docs/adr/`. If you're
considering a different approach to any of them, read the relevant ADR
first — and if you do change direction, add a new ADR rather than silently
deviating.

## Hard constraints — do not violate these

1. **Single user only.** Do not add multi-user auth, roles, or sharing
   features unless explicitly asked. There is exactly one signed-in user.
2. **$0 budget.** Do not introduce paid services, or any service that
   requires its own backend/server to run (e.g. Supabase, Firebase).
3. **Books are append-only.** Never implement, expose, or call a delete
   or clear operation on the `Books` tab, in the UI or in code. Add and
   edit are fine; delete is not. The same goes for Drive: no file-delete
   calls (replaced covers are renamed, not deleted). See ADR-0004.
4. **No backend component.** All API calls happen client-side using the
   signed-in user's own OAuth token. Never introduce a server, a proxy,
   or a service-account credential embedded in client code.
5. **No Firebase.** See ADR-0002.
6. **No Google Photos API.** Its broad read-library scope was restricted
   in March 2025; it can no longer read an existing photo library. Use
   Google Drive instead. See ADR-0003.
7. **Never store the access token outside memory.** No `localStorage`,
   `sessionStorage`, or IndexedDB for tokens. Only the email hint may be
   persisted (ADR-0002).

## Configuration

Build-time env (public in the bundle, which is fine — they are not secrets):

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | OAuth client ID |
| `VITE_SHEET_ID` | The spreadsheet holding `Books` and `Borrowers` |
| `VITE_CURRENCY` | ISO currency code for prices, e.g. `INR` |

The Drive folder ID is **not** config: the app creates `Book Covers` on
first run, finds it by name afterwards, and caches the ID locally.

## Data schema

Row 1 of each tab is a frozen header. The app locates columns **by header
name**, not position, and locates rows **by Book ID**, never by row index.

Formats: dates `yyyy-mm-dd`, times `HH:mm`. Write with `USER_ENTERED`, read
with `FORMATTED_VALUE`, and set explicit number formats on date columns so
hand-typed and app-written values read back identically.

### `Books` tab
| Column | Notes |
|---|---|
| Book ID | `B-0001` style. App-assigned as (max existing) + 1 at write time. Never edited |
| Title | Required |
| Author | Required |
| Purchase date | Optional |
| Price paid | Number, in `VITE_CURRENCY` |
| Current market price | Manually entered for now (see Open questions) |
| Photo | Google Drive file link for the cover; empty = placeholder cover |
| Added at | ISO timestamp, audit only |

### `Borrowers` tab
One row per loan.

| Column | Notes |
|---|---|
| Book ID | References Books tab |
| Borrower name | Free text (autocompleted from past rows) |
| Borrowed date | |
| Borrowed time | |
| Place | |
| Returned | Yes/No — app writes it together with the return date/time |
| Returned date | |
| Returned time | |

A book is **borrowed** iff it has a loan row with an empty `Returned date`.
If `Returned` and `Returned date` ever disagree, `Returned date` wins.
A book that is already out cannot be borrowed again.

## Data flow

1. **Load once** at startup with a single `batchGet` of both tabs into the
   Redux store. Search, filters, status, and the lent-out grouping are
   selectors over the store — no API calls.
2. **Write-through, optimistic.** Every add/edit/borrow/return updates the
   store immediately and fires the Sheets call right away; on failure the
   change rolls back with an error toast.
3. **Outbox.** A write that fails because of an expired token or no network
   stays in a persisted outbox (IndexedDB), shown as "N pending". The
   **Sync** button flushes the outbox, then reloads from the Sheet.
4. **Refresh** on startup, via a manual refresh button, and after a
   reconnect. Not on a timer.
5. **Expiry.** Tokens last ~1 hour. On expiry (or a 401) show a
   non-blocking "Session expired — Reconnect" banner, then retry the pending
   action automatically. A 401 means the write did not happen, so retrying
   is safe. Sign-out revokes the token.
6. **Drafts.** Add/edit form fields are mirrored to `sessionStorage` (no
   tokens, no photo) so a reload doesn't lose them. The whole store is not
   persisted.

## Photos

- Capture with `<input type="file" accept="image/*" capture="environment">`.
- Resize in the browser to a 1000px long edge, JPEG ~0.8, before upload.
- Upload the cover first, then append the Sheet row with the link.
- Read covers back as authenticated blobs (`files/{id}?alt=media`), lazily,
  cached in IndexedDB by file ID with ~240px list thumbnails.
- Replacing a cover: upload the new file, update the cell, then **rename**
  the old file to `deleted-file-<BookID>.jpg` for the owner to delete by hand.
- Books without a photo show a generated placeholder tile (title initial).

## Screens

1. Sign-in gate — "Continue as <email>" when a hint exists; "wrong account"
   message on a 403 from the Sheet
2. Book list — cover thumbnail, title, author, available/borrowed badge.
   Table on desktop, cards on phone
3. Book detail — full metadata + that book's borrow history (activity feed)
4. Add / Edit book form — shared form; Book ID read-only; photo optional;
   soft duplicate-title warning (does not block)
5. Borrow / return — name (autocomplete), date/time (default now), place;
   return is one tap with date/time defaulting to now. Dialog on desktop,
   bottom Sheet on phone
6. Search / filter by title, author, or status (client-side)
7. Lent out — grouped by borrower (Accordion): who holds which books, since when

The app must work equally well on phone and desktop.

## Design system

Use the Fusion design system (`.agents/ui/skills/custom-ui-design-system/`)
via Tailwind + shadcn/ui and its shadcn variable mapping. Default theme is
light, with a manual toggle (persisted in `localStorage`); do not hardcode colors.

- `accent` = primary actions (Add, Borrow, Sync). `secondary` = success
  (*Available* badge, returned). `tertiary` = attention only (e.g. "N pending").
- *Borrowed* is a **neutral** pill (`surface-2` + `text`), not tertiary.
- `danger` = errors only (failed write/sync). Extension to Fusion; see the
  design-system doc.
- Manrope for UI; IBM Plex Mono for Book IDs, dates, times, and ₹ amounts.
  Self-host fonts with `@fontsource`.
- Form controls are 16px on mobile (avoids iOS focus-zoom).
- Honour `prefers-reduced-motion`.

## Suggested build order

1. Create the Google Sheet with the exact columns above (frozen header,
   date formats)
2. Google Cloud project — enable Sheets + Drive APIs, create the OAuth client,
   set consent screen to "In production" (unverified)
3. Vite + React + Tailwind + shadcn/ui scaffold with Fusion tokens; Redux
   store; Google sign-in (token client)
4. Sheets read/write service layer (+ the no-delete guard test)
5. Drive photo upload/read/cache
6. Screens, in the order above
7. Outbox + Sync button
8. Protected range on the `Books` tab in the Sheet itself (defense in depth
   alongside the no-delete code rule)
9. Deploy + CI/CD

## Open questions (not yet decided)

- **Current market price:** manual entry (current default) vs. automatic
  lookup via a books/pricing API. Deferred — flag if this comes up rather
  than deciding it unilaterally.

## Working across tools (handoff protocol)

More than one AI tool works in this repo (Claude Code, Antigravity + Conductor).
The **repo is the only shared memory** — nothing that matters lives only in a chat.

- **Start of every session:** read this file, then `docs/STATUS.md`
  (what is done, in progress, next, and known gotchas). Check `git log` and
  `git status` if the repo has history.
- **Rules live here, decisions in `docs/adr/`, progress in `docs/STATUS.md`.**
  Conductor's own `conductor/` files must *link* to these, not restate them.
- **Definition of done:** `npm run verify` (lint + tests + typecheck + build)
  passes, and the change matches this file. Never report done without running it.
- **Deviating from a decision:** add a new ADR first (see the top of this file).
- **End of every session or milestone:** update `docs/STATUS.md` (move items,
  record surprises and anything unverified), then commit if the repo is under git.
  Leave the tree in a state where `npm run verify` passes, or say precisely why not.
- **Cross-review:** work started in one tool is reviewed by the other before the
  next step (e.g. `/code-review` in Claude Code; `/conductor:conductor-review`
  in Conductor). Review against this file and the ADRs.
- **Never silently:** delete files, skip or weaken tests (including
  `src/test/no-delete.test.ts`), or put secrets/tokens in storage or the repo.

## Notes on `.agents/ui`

That folder is a generic React/Next.js kit. In this project the Next.js,
Turborepo, and NestJS material is inert, and `rules/react-data-fetching.md`
(SWR for REST APIs) does not apply — state follows ADR-0006. Where those
files disagree with this document, this document wins.

## Architecture decisions

See `docs/adr/` for the full context and trade-offs behind each constraint
above:
- `0001-google-sheets-as-data-store.md`
- `0002-client-side-google-oauth-no-backend.md`
- `0003-google-drive-for-photos.md`
- `0004-books-append-only.md`
- `0005-react-vite-not-nextjs.md`
- `0006-write-through-outbox-sync.md`
- `0007-drive-scope-and-photo-pipeline.md`
