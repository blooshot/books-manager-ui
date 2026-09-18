# Lessons Learned

Each row is a mistake that actually shipped, why it slipped through, the rule that now prevents it, and what enforces the rule.
Add a row whenever a review finds something the process should have caught. Keep the rules in `code_styleguides/`; this file is the "why".

## Step 5: Drive photo pipeline (found in cross-review, 2026-09-19)

| # | What went wrong | Why it slipped through | Rule now | Enforced by |
|---|---|---|---|---|
| 1 | `npm run verify` failed (unused import) but the track was marked done | `verify` was not re-run after the last edit; tests were green so it "looked" done | Run `verify` after the final edit; done means verify passes | workflow.md Definition of Done |
| 2 | Cache tests "tested" a local `mockCache` object, never the cache | Tests were written to pass, not to be able to fail | A test must exercise the code under test; delete-the-implementation self-check | testing.md rule 1 |
| 3 | Spec said "full image + ~240px thumbnail"; only one blob was stored; task was ticked | No line-by-line check of the spec before ticking | Spec conformance step; unimplemented bullet is never ticked | workflow.md (Write Code, DoD 1) |
| 4 | JSON bodies sent without `Content-Type: application/json` | Tests mocked the client, which accepts anything; exact-call assertions froze the mistake | Fake at the `fetch` boundary; strict fakes; assert outcomes | testing.md rules 2, 3, 6; `FakeDrive` |
| 5 | Upload used `FormData` (`multipart/form-data`); Drive requires `multipart/related` | API reference not read; mock client could not object | Read the endpoint's docs first; `buildMultipartRelated`; ban `FormData` in Drive code | google-apis.md; guard `Drive FormData upload`; `FakeDrive` |
| 6 | Drive defined its own `SessionExpiredError`; the store's `instanceof` check would miss it | Copy-paste of a class with the same name | One shared `GoogleApiError` / `SessionExpiredError` | typescript.md (Errors); `client.test.ts` asserts both instanceof |
| 7 | Folder ID cached in raw `localStorage`, globally, never revalidated | Convention (`lib/storage`) was not written down; no failure test | Use `lib/storage`; per-account key; verify once per session; recover from 404/trashed | typescript.md; google-apis.md; `conventions.test.ts`; `folder.test.ts` |
| 8 | Guard did not forbid `trashed: true` (soft delete) | Guard only looked for the obvious delete calls | Forbid `trashed: true` and `/trash`; PATCH body must be exactly `{ name }` | `no-delete.test.ts` (patterns + allow-list) |
| 9 | Link parser had a fallback regex that matched any 25+ char string | Tests only covered friendly inputs | Test hostile/unrelated inputs; parse strictly (host + shape) | testing.md rule 5; `links.test.ts` |
| 10 | STATUS.md said "Done" and still showed the old "Next" brief; Drive not listed as unverified | STATUS was edited in place, not reviewed as a whole | Update STATUS completely; Completion Report with Not verified | workflow.md (STATUS consistency, Completion Report) |
| 11 | The style guide in `conductor/` (Google `gts`: semicolons, no default exports) contradicted the real code and was never enforced | Generated at setup, never reconciled with the repo | Style guide describes *this* codebase; mechanical checks for what can be checked | typescript.md; `conventions.test.ts` |
| 12 | IndexedDB tests could not store a Blob under jsdom (`fake-indexeddb` returns `{}`) | Environment limit hit after the code was written | Store `ArrayBuffer` + type; isolate browser-only APIs behind injectable deps; list them as Not verified | testing.md rule 7; `coverCache.ts` |

## Step 4 (Claude Code), for the record

| What went wrong | Rule now |
|---|---|
| Overlapping writes could give two books the same ID | Sheet writes run one at a time (`inWriteQueue`) |
| Redux drops `status` from serialized errors | Errors carry `code`; branch on `name`/`code` |
| Blank input showed briefly before rejection | Validate before any optimistic change |
| shadcn CLI installed an unrelated `cn` package | Re-read `package.json` and imports after any generator |

## Step 6b (Claude Code), for the record

| What went wrong | Rule now |
|---|---|
| A `requestAnimationFrame` focus timer after a failed submit could fire mid-typing and move focus into another field; found because a test failed only after another test | Never move focus on a timer; investigate order-dependent failures instead of re-running (testing.md rule 9) |

## Step 6c (Claude Code), for the record

| What went wrong | Rule now |
|---|---|
| The Borrow dialog was rendered only for available books; the optimistic update flipped the status mid-save and unmounted it (state and error lost, blank dialog on failure). Found by a failing test | Keep dialogs/forms mounted independent of the data they change; remember what a dialog operates on when it opens (typescript.md, React) |
| A placeholder assertion (`expect(true).toBe(true)`) was left in a test while iterating | Never leave a tautology behind; grep for it before finishing (testing.md rule 1) |

