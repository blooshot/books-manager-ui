# Project Workflow

## Guiding Principles

1.  **The Plan is the Source of Truth:** All work must be tracked in `plan.md`.
2.  **The Tech Stack is Deliberate:** Changes to the tech stack must be documented in `tech-stack.md` *before* implementation.
3.  **User Experience First:** Every decision should prioritize user experience.
4.  **Correct before "done":** A task is done when it meets its spec and the gate passes. Never mark work complete on
    appearance. Never claim what was not checked.
5.  **The repo is the only shared memory.** Another tool (Claude Code) works in this repo too. What it needs to know must be in
    `AGENTS.md`, `docs/adr/`, `docs/STATUS.md`, or the code, never only in a chat.

## Before You Start a Task (required)

1.  Read `AGENTS.md`, `docs/STATUS.md`, and the ADRs the task touches (`docs/adr/`).
2.  Read **all** guides in `conductor/code_styleguides/`: `typescript.md`, `testing.md`, `google-apis.md`, `general.md`.
    They encode mistakes already made once ([lessons-learned.md](./lessons-learned.md)).
3.  Run `npm run verify`. If it is already red, say so and stop; do not build on a broken base.
4.  For anything that calls a Google API, read the official reference for that endpoint first (`google-apis.md`).

## Custom Task Workflow (Strict Rules)

All tasks follow a strict 4-step lifecycle: **Plan -> Write Code -> Review -> Commit**.

### 1. Plan (Keep it Brief)
- When presenting a plan for a task, you **MUST** provide a maximum of 2 lines explaining what you are going to do. Do not write long explanations.

### 2. Write Code
- Write the application code and the tests that fulfil the task, following `code_styleguides/`.
- Write the failing test first for anything with a real-API rule ([testing.md](./code_styleguides/testing.md) rule 3).
- **Spec conformance (required before step 3):** re-read the track's `spec.md` bullet by bullet and, in the task notes,
  map each bullet to the file/test that satisfies it, or to an explicit deviation. A bullet that is not implemented is
  never ticked. (Step 5 ticked "store full image and ~240px thumbnail" while the cache stored one blob.)
- Run `npm run verify` **after the last edit** (not an earlier one) and read the output. See Definition of Done.

### 3. Review (Show Code Only)
- Before committing, you **MUST** present the code changes to the user for manual review.
- **CRITICAL:** During the review presentation, **DO NOT** write any English paragraphs explaining the code. **ONLY** show the code you wrote (e.g., using diffs or code blocks).
- This rule governs the review presentation only. The **Completion Report** below is separate and always required.

### 4. Commit
- Only after the user explicitly approves the manual review, stage and commit the changes.
- Attach the task summary using `git notes` to the commit (see standard Conductor workflow).
- Mark the task as complete in `plan.md` with the commit SHA **only if** the Definition of Done is met.

## Definition of Done

A task is complete when **all** of these hold:
1.  Every bullet of the spec is implemented, or listed as an explicit deviation (with reason) in `plan.md` and `docs/STATUS.md`.
2.  `npm run verify` passes **on the final code**: lint with no new warnings, all tests, typecheck, build. (`tsc` fails on unused
    imports/variables; a green test run alone is not enough.)
3.  For anything a user sees or navigates, it has been **looked at in a real browser** (or the Not verified list says it has not); component tests cannot show a missing redirect or a broken layout. Tests are real ([testing.md](./code_styleguides/testing.md)): they call the code under test, use the strict fakes, cover
    failure paths, and a control check was done for any new guard.
4.  Code follows `code_styleguides/`; no `any`, no raw `localStorage`, no new dependency without updating `tech-stack.md`.
5.  New network calls are covered by the allow-list guard in `src/test/no-delete.test.ts`; the append-only rules are intact.
6.  `docs/STATUS.md` is updated **completely** (see below).
7.  User has manually reviewed and approved the code (no English explanations during the review prompt).
8.  Implementation notes added to `plan.md`; changes committed with a proper message.

**If verify fails or a spec bullet is missing, the task is not done. Leave it unticked and say why.** Do not commit a red tree
and do not describe partial work as complete.

## Completion Report (required at the end of every task or track)

Put this in the task notes in `plan.md` and summarise it in `docs/STATUS.md`. Be specific and honest:

-   **Done:** what now exists (files/modules), mapped to spec bullets.
-   **Verified:** the exact commands run and their result (e.g. `npm run verify`: 166 tests, build OK).
-   **Not verified:** everything that only ran against a fake, only in jsdom, or was not run (real Google APIs, real browser,
    real device). Never omit this section; "none" is almost never true.
-   **Deviations:** spec bullets not done or done differently, and why.
-   **Follow-ups:** anything left for a later task.

## Keeping `docs/STATUS.md` consistent

Update all of these together, and delete anything that has become stale:
-   The step table (state per step) and **Last updated** line.
-   **What exists:** add the new modules and what they do.
-   **Not verified:** add new unverified items; remove only what was actually verified.
-   **Gotchas:** anything a future session would trip on.
-   Replace the old "Next: ..." brief with the next step's brief. Never leave a brief for a finished step.
-   **Log:** one entry, newest first, with date, tool, and test count.

## Cross-Tool Handshake
As defined in `AGENTS.md`:
- At the start of a session, read `AGENTS.md` and `docs/STATUS.md`.
- At the end of a session, update `docs/STATUS.md`.
- Work started in one tool is reviewed by the other before the next step. Findings become a "Post-review corrections"
  section at the end of the track's `plan.md` and a STATUS.md log entry.
- `AGENTS.md` wins over anything in `conductor/`. If they disagree, fix `conductor/` (link to `AGENTS.md`, do not copy it).
