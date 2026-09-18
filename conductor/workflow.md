# Project Workflow

## Guiding Principles

1.  **The Plan is the Source of Truth:** All work must be tracked in `plan.md`
2.  **The Tech Stack is Deliberate:** Changes to the tech stack must be documented in `tech-stack.md` *before* implementation.
3.  **User Experience First:** Every decision should prioritize user experience.

## Custom Task Workflow (Strict Rules)

All tasks follow a strict 4-step lifecycle: **Plan -> Write Code -> Review -> Commit**.

### 1. Plan (Keep it Brief)
- When presenting a plan for a task, you **MUST** provide a maximum of 2 lines explaining what you are going to do. Do not write long explanations.

### 2. Write Code
- Write the application code and necessary tests to fulfill the task.
- Ensure all tests pass (`npm run verify` must pass before considering a task done, per `AGENTS.md`).

### 3. Review (Show Code Only)
- Before committing, you **MUST** present the code changes to the user for manual review.
- **CRITICAL:** During the review presentation, **DO NOT** write any English paragraphs explaining the code. **ONLY** show the code you wrote (e.g., using diffs or code blocks).

### 4. Commit
- Only after the user explicitly approves the manual review, stage and commit the changes.
- Attach the task summary using `git notes` to the commit (see standard Conductor workflow).
- Mark the task as complete in `plan.md` with the commit SHA.

## Definition of Done

A task is complete when:
1.  All code implemented to specification.
2.  `npm run verify` passes (lint + tests + typecheck + build).
3.  User has manually reviewed and approved the code (with no English explanations during the review prompt).
4.  Implementation notes added to `plan.md`.
5.  Changes committed with a proper commit message.

## Cross-Tool Handshake
As defined in `AGENTS.md`:
- At the start of a session, read `AGENTS.md` and `docs/STATUS.md`.
- At the end of a session, update `docs/STATUS.md`.
