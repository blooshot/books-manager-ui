# Rules index

Topic-scoped craft guidance, copied from the shared collection at `AgentSkills/`. The canonical
instruction set is [`AGENTS.md`](../../../AGENTS.md); architecture decisions are in
[`docs/adr/`](../../../docs/adr/).

| Area | Files |
|---|---|
| React | `react/coding-style.md` · `react/patterns.md` · `react/testing.md` · `react/security.md` · `react/hooks.md` · `react-component-conventions.md` · `react-data-fetching.md` · `react-routing-conventions.md` |
| TypeScript | `typescript/coding-style.md` · `typescript/patterns.md` · `typescript/testing.md` · `typescript/security.md` · `typescript/hooks.md` |
| Web, general | `web/coding-style.md` · `web/patterns.md` · `web/testing.md` · `web/security.md` · `web/performance.md` · `web/design-quality.md` · `web/hooks.md` |
| Styling | `tailwind-styling-conventions.md` |
| Validation | `zod-validation-patterns.md` |
| Errors | `error-handling.md` |
| Review and security | `code-review.md` · `security.md` · `testing.md` |
| Language-agnostic base | `common/` — the tier the `react/`, `typescript/` and `web/` files extend |

> ⚠️ **These are multi-framework files.** Several mention Next.js, NestJS, Turborepo, Vue, Angular
> or Svelte. Those sections are **inert here** — this project is **React + Vite, fully static, no
> backend** (ADR-0005). Also inert: [`react-data-fetching.md`](react-data-fetching.md) (SWR against
> REST APIs) — state and data flow here follow ADR-0006 (Redux Toolkit, write-through + outbox).
> Do not follow the inert parts, and do not edit the files to strip the noise: that forks them from
> the collection they came from, and the next update overwrites your edit.

Where a rule here disagrees with [`AGENTS.md`](../../../AGENTS.md) or the ADRs in
[`docs/adr/`](../../../docs/adr/), **those win** — they are project decisions; these are general
craft.
