# STATUS — live progress ledger

Read this after `AGENTS.md` at the start of every session; update it at the end
of every session or milestone (protocol in `AGENTS.md`). Newest entries at the top
of "Log". Keep it short and factual.

**Last updated:** 2026-09-18 · **By:** Claude Code

## Where we are

Build order (from `AGENTS.md`):

| # | Step | State |
|---|---|---|
| 1 | Create the Google Sheet with exact columns | **Owner action** — not confirmed done |
| 2 | Google Cloud project, OAuth client, consent screen "In production" | **Owner action** — not confirmed done |
| 3 | Vite + React + Tailwind + shadcn/ui scaffold, Fusion tokens, Redux store, GIS sign-in | **Done** |
| 4 | Sheets read/write service layer + no-delete guard | **Next** (brief below) |
| 5 | Drive photo upload/read/cache | Not started |
| 6 | Screens (in the order in `AGENTS.md`) | Not started |
| 7 | Outbox + Sync button | Not started |
| 8 | Protected range on `Books` (verify owner behaviour, ADR-0004) | Not started, needs the real Sheet |
| 9 | Deploy + CI/CD | Not started |

## What exists (step 3)

- Sign-in gate, reconnect banner, token-expiry timer, theme toggle, app shell.
- Redux: `session` (token in memory only, email hint in localStorage), `books`,
  `borrowers` (entity adapters), selectors (`selectOpenLoanByBookId`,
  `selectLentOutByBorrower`). **No thunks for Sheets/Drive yet.**
- Tests: session, selectors, and `src/test/no-delete.test.ts` (ADR-0004 guard).
- Design: Fusion tokens imported from `.agents/ui/skills/custom-ui-design-system/tokens.css`.
  Tailwind mapping is in `src/index.css` (`bg-primary`, `bg-success`, `bg-attention`, `bg-destructive`).
- `npm run verify` passes (last run: 13 tests, build OK, 1 known lint warning in the generated `button.tsx`).

## Not verified (be honest about these)

- **GIS sign-in has never run against real Google** — no OAuth client exists yet. Popup,
  scopes, `userinfo` email fetch and the expiry flow are untested outside unit tests with mocks.
- **Nothing has been viewed in a browser.** Layout, dark mode and the Button styling were only
  checked by build output and CSS inspection.
- Whether the owner's own token can delete protected rows (ADR-0004) — test in a scratch sheet.
- Whether Antigravity/Conductor auto-load `AGENTS.md` (docs are silent; `.agents/rules/agents.md`
  symlink is the fallback). Smoke test: fresh session, ask "what are this project's hard constraints?".

## Gotchas (learned the hard way)

- The `shadcn` CLI mis-resolved the alias and installed an unrelated npm package `cn`; it was removed and
  imports use `@/lib/utils`. **After `npx shadcn add ...`, check `package.json` and the new file's imports.**
- Tailwind mapping uses `@theme inline`; do **not** redefine Fusion's `--accent`/`--secondary` (shadcn's
  meaning differs and would silently recolor everything).
- TS 6: don't use `baseUrl`; `paths` alone works. `tsconfig.app.json` includes `node` types (the guard test uses `node:fs`).
- Symlinks: `.agents/rules/agents.md` → `AGENTS.md`; `.agents/skills/custom-ui-design-system` → `.agents/ui/skills/custom-ui-design-system`.

## Next: step 4 brief (Sheets service layer)

Goal: typed, tested read/write access to the two tabs. **Only** these Sheets endpoints:
`values.batchGet`, `values.append`, `values.update`. Never clear/delete (guard test enforces it).

Modules (proposed; keep pure logic separate from fetch):
- `src/services/sheets/mapping.ts` — header-name based parse/serialize between sheet rows and
  `Book` / `Loan` (`src/types/library.ts`). Columns by header, never position. Missing required header → clear error.
- `src/services/sheets/ids.ts` — `nextBookId(books)` = max `B-NNNN` + 1, zero-padded to 4.
- `src/services/sheets/client.ts` — one fetch wrapper: Bearer token, 401 → dispatch `tokenExpired` and throw a typed
  `SessionExpiredError` (safe to retry: the write did not happen); other errors → typed `SheetsError`.
- `src/services/sheets/api.ts` — `readAll`, `appendBook`, `updateBookRow`, `appendLoan`, `returnLoan`.
  Writes use `valueInputOption=USER_ENTERED`, reads use `valueRenderOption=FORMATTED_VALUE`.
  Update/return **re-read and locate the row by Book ID (and empty `Returned date` for loans) right before writing.**
- Thunks in the store: `loadAll`, `addBook`, `editBook`, `borrowBook`, `returnBook` — optimistic, rollback on
  failure. No delete thunk. (Outbox is step 7; for now failures just roll back and toast.)

Acceptance criteria:
1. Unit tests for mapping (reordered columns, empty optional cells, extra columns, missing header, date/number formats).
2. Unit tests for `nextBookId` (empty sheet, gaps, hand-added IDs).
3. Tests with mocked `fetch`: 401 → `tokenExpired` + retry-safe error; append then read-back; return finds the right
   row after rows were reordered; borrowing an already-borrowed book is rejected.
4. `src/test/no-delete.test.ts` still passes; no new endpoint outside the three above.
5. `npm run verify` passes. Update this file.

Later steps have their design in `AGENTS.md` (Data flow, Photos, Screens) and ADR-0006/0007.

## Log

- 2026-09-18 — Claude Code: scaffold (step 3) done; docs aligned (ADR-0002/0004 amended, 0005–0007 added);
  handoff protocol, `npm run verify`, `.agents/rules` + `.agents/skills` links, `CLAUDE.md` imports `AGENTS.md`.
