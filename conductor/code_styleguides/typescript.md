# TypeScript / React Style Guide (this project)

Replaces the Google `gts` guide that was here before. That guide required semicolons and
named exports only; this codebase uses neither, nothing enforced the guide, and following it
would have produced code that clashes with everything around it. **Match the code that exists.**

Precedence: `AGENTS.md` and `docs/adr/` > this file > everything else. Read
[testing.md](./testing.md) and [google-apis.md](./google-apis.md) as well; they are part of the style.

## Formatting (no formatter is configured; copy the surrounding code)
- No semicolons. Single quotes. 2-space indent. Trailing commas in multi-line literals.
- Template literals for interpolation. `===` / `!==` only.
- Lines under ~120 characters. One blank line between top-level declarations.

## Modules and imports
- Import across folders with the `@/` alias (`@/services/sheets/api`); relative paths only for a
  sibling in the same folder.
- `import type { X }` for anything used only as a type (`verbatimModuleSyntax` is on).
- Named exports everywhere. A default export is allowed **only** for `App.tsx`, `main.tsx` and Redux
  `*Slice.ts` reducers (checked by `src/test/conventions.test.ts`).
- No barrel files (`index.ts` that re-exports a folder) unless a task asks for one.

## Types
- **No `any`** in production code (checked by `conventions.test.ts`). Use `unknown` and narrow, or write the type.
- No `as` casts except to type the JSON of an API response inside a client wrapper
  (`(await response.json()) as { ... }`). Anywhere else, fix the types instead.
- No non-null assertions (`x!`) outside tests.
- Prefer optional fields (`price?: number`) to `number | undefined`. Use `null` only where an API/`patch`
  contract needs it to mean "clear this value" (see `BookPatch`).
- `tsconfig` has `erasableSyntaxOnly`: **no `enum`, no `namespace`, no constructor parameter properties**
  (`constructor(private x: T)`). Declare the field, then assign it.
- Unused imports and variables fail the build (`noUnusedLocals`). Remove them; do not prefix with `_`.

## Naming and files
- Modules and non-component files: `camelCase.ts` (`coverCache.ts`). React components: `PascalCase.tsx`.
  Tests sit next to the code as `name.test.ts`; shared fakes live in `src/test/`.
- Types, interfaces, classes: `PascalCase`. Functions/variables: `camelCase`. Module constants: `CONSTANT_CASE`.
- Error classes end in `Error` and set a stable `this.name` (the name is how errors are recognised, see below).

## Structure
- Keep pure logic apart from I/O: parsing/mapping/math in plain functions (`mapping.ts`, `image.ts`),
  network in a thin client, orchestration in `api.ts` / thunks. Pure code is what gets unit-tested.
- Pass dependencies in instead of reaching for globals: a client takes `getAccessToken` and `fetchImpl`;
  thunks get `{ sheetId, fetchImpl, now }` from the store's `extra`. **Never call `new Date()` or `Math.random()`
  deep inside logic that is tested**; accept a `now`/boundary argument (default it at the edge).
- Functions do one thing. If a function needs a paragraph to explain, split it.
- Release resources in `finally` (`bitmap.close()`, IndexedDB `db.close()`).
- No floating promises: `await` it, return it, or write `void promise` on purpose with a reason.
- No `console.log` in production code.

## Errors
- Google API failures extend `GoogleApiError` (`src/services/google/errors.ts`): `name`, `message`,
  `status?`, and `code` (`'401'`, `'500'`, `'NETWORK'`). Use the shared `SessionExpiredError` for 401 from
  every API; never define a second class with the same name.
- Redux Toolkit serializes thunk errors to `{ name, message, code }`. Code that handles a thunk's error
  must branch on `error.name` / `error.code`, never `instanceof` or `status`.
- Validate input before any optimistic state change. User-facing messages are direct and actionable.

## Browser storage
- Use `src/lib/storage.ts` (`readStored` / `writeStored` / `removeStored`); raw `localStorage` throws when
  storage is blocked (private windows). Checked by `conventions.test.ts`.
- Never persist the access token anywhere (AGENTS.md hard constraint 7).
- Cache keys are namespaced `bm.` and, when the value belongs to a Google account, include the account.

## Comments
- Explain *why* (a constraint, a Google API quirk, an ADR), not what the line does. Cite the ADR or the API
  reference URL when the code exists because of one.
- Do not restate types in JSDoc. Do not leave commented-out code or `// TODO` without a STATUS.md entry.

## Dependencies
- No new runtime dependency without updating `tech-stack.md` and, if it changes a decision, adding an ADR.
- After running any generator (`npx shadcn add`, `npm create`, ...), re-read `package.json` and the new files'
  imports. The shadcn CLI once installed an unrelated package called `cn`.

## React and styling
- Function components and hooks; state that matters lives in Redux (ADR-0006), local UI state in `useState`.
- Style with Tailwind utilities mapped to Fusion tokens (`bg-primary`, `bg-success`, `bg-attention`,
  `bg-destructive`); never hardcode colors. Details: [product-guidelines.md](../product-guidelines.md).
- Form controls 16px on mobile; honour `prefers-reduced-motion`.
