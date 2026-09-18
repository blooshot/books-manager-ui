# Testing Guide

Tests are how the next tool (and the owner) can trust work they did not watch. They are only worth
having if they can fail. Step 5 shipped 112 green tests around code that was wrong; these rules exist so
that cannot happen again. Runner: Vitest + jsdom. Gate: `npm run verify`.

## 1. A test must exercise the code under test
- Every test calls the real function/module and asserts on its result or an observable side effect.
- **Forbidden:** a test that writes to a local variable/object and asserts on what it just wrote (the
  `mockCache` tests that "tested" the cover cache without calling it). Self-check for every test:
  *"If I delete the implementation, does this test fail?"* If not, it is decoration; rewrite or delete it.
- Do not import something a test does not use (this also breaks the build).

## 2. Fake at the network boundary, not at your own module
- Behaviour tests use the in-memory fakes in `src/test/` (`FakeSheets`, `FakeDrive`) passed as `fetchImpl`,
  so the real client, URL building, headers, and body encoding all run.
- `vi.fn()` doubles for your own client are acceptable only for narrow wiring checks (which URL, which header).
  Mocking `DriveClient.request` hid two real-API bugs, because the mock accepts anything.

## 3. Fakes must be as strict as the real service
- A fake that is more forgiving than Google hides bugs. `FakeDrive` rejects a JSON body without
  `application/json`, rejects `multipart/form-data` uploads, hides files the app did not create, and refuses DELETE.
  `FakeSheets` returns strings, trims trailing empty cells, and strips the formula-escaping apostrophe.
- When you learn how the real API behaves (docs, an error from a real run), **encode it in the fake first**, watch a
  test go red, then fix the code. Cite the API doc in a comment next to the fake's rule.
- Never weaken a fake to make a test pass. If the fake is wrong, fix it and say why in the plan notes.

## 4. Prove a guard catches its bug (control check)
- For every rule added as a guard/regression test, temporarily reintroduce the bug once and confirm the test
  goes red, then restore. Record "control check done" in the task's notes.
- Guard patterns in `src/test/tests/no-delete.test.ts` have a self-test (`guard patterns`); add a sample for every new pattern.

## 5. What to cover
- Happy path **and** each failure class: 401, 403, 404, 5xx, network error, malformed/empty response.
- Invalid and boundary input: empty, whitespace, duplicates, trashed/deleted-elsewhere, too short/long, unknown IDs.
- Ordering and concurrency where state is derived from a read (next ID, row lookup, folder find-or-create).
- Storage/IndexedDB unavailable (blocked storage must not crash the app).
- Data that breaks naive code: binary bytes with CRLF/NUL/high bytes, values that start with `= + - @`,
  reordered or extra sheet columns.

## 6. Assert outcomes, not implementation trivia
- Prefer "the file in the fake Drive is named X and has these bytes" over "`request` was called with this exact
  JSON string". Exact-call assertions freeze mistakes in place (the old test cemented the missing Content-Type).
- For rejected thunks assert `toMatchObject({ name, code })` (Redux serializes errors; see typescript.md).

## 7. Environment limits (jsdom)
- jsdom has no canvas, no `createImageBitmap`, and `fake-indexeddb` cannot round-trip a `Blob` (it returns `{}`).
- Do not paper over this with a fake that makes a test pass. Put the browser API behind an injectable dependency
  (`ImageDeps`), test the logic around it with a stand-in, store `ArrayBuffer` + type in IndexedDB instead of a
  `Blob`, and list the browser-only part under **Not verified** in `docs/STATUS.md`.

## 8. Determinism and hygiene
- Inject the clock (`now`) and boundaries; no real timers, network, or randomness in assertions.
- Each test sets up its own state (`beforeEach`); tests never depend on run order.
- TypeScript strict applies to tests too: no `any`, no unused imports. Casts (`as unknown as ImageBitmap`) are
  acceptable in tests to build minimal stand-ins.
- Keep tests readable: name them as sentences describing behaviour.

## 9. Order-dependent failures are real bugs
- A test that passes alone but fails after another test (or only sometimes) means shared state or a timing race. Find it; never re-run until green.
  (Step 6b: a `requestAnimationFrame` focus timer fired mid-typing and moved focus into another field. The fix was a real code change.)
- Do not move focus, or do anything else user-visible, on a timer; do it from an effect tied to the state change.

## 10. Definition of "tested"
A behaviour is tested when a test fails if that behaviour breaks. A behaviour that only ever ran against a fake is
**tested but not verified against the real service**; say exactly that in the plan notes and STATUS.md.
