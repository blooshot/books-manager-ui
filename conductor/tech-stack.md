# Books Management - Technology Stack

> **Note on Canonical Documentation:**
> The definitive source for the technology stack, architecture, and technical constraints is `AGENTS.md` (under the "Stack" section).

## Overview
- **Frontend:** React + Vite (Static, no backend)
- **UI:** Tailwind + shadcn/ui + Fusion design system
- **State:** Redux Toolkit
- **Data & Auth:** Google Sheets & Google Drive, accessed client-side via Google Identity Services (OAuth 2.0).

Please refer to `AGENTS.md` and `docs/adr/` before considering any changes to this stack.

## Tooling
- **Language:** TypeScript 6 (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`), React 19, Vite 8, Tailwind v4, shadcn/ui.
- **Tests:** Vitest + jsdom + Testing Library; `fake-indexeddb` for IndexedDB. Shared fakes in `src/test/` (`FakeSheets`, `FakeDrive`).
- **Lint / typecheck / build:** `oxlint`, `tsc -b`, `vite build`. The gate for every task is `npm run verify`.
- **Coding rules:** `conductor/code_styleguides/` (`typescript.md`, `testing.md`, `google-apis.md`). Past mistakes: `lessons-learned.md`.
- Adding a runtime dependency requires updating this file first (and an ADR if it changes a decision).

