# 0005. React + Vite, not Next.js

## Status
Accepted

## Context
The frontend framework was questioned: React with Vite, or Next.js.
Every data call in this app happens in the browser with the signed-in user's
own OAuth token (ADR-0002); there is no server and no data that can be
rendered before sign-in.

## Decision
Use React + Vite, built to a plain static `dist/` folder, with client-side
routing (React Router or TanStack Router; hash routing or a 404 fallback on
GitHub Pages). Styling is Tailwind + shadcn/ui on the Fusion design tokens.

## Consequences
- Fits any free static host and a simple GitHub Actions deploy.
- No accidental server dependency can creep in — there is no server runtime to
  depend on.
- Next.js's main features (SSR, server components, server actions, API routes)
  would be unused or would violate the "no backend" constraint. `output:
  'export'` would make it a slower, more constrained SPA.
- The Next.js, Turborepo, and NestJS material under `.agents/ui/` is generic
  and inert for this project.
- If the project ever gains a server or multi-user needs, revisit together with
  ADR-0002.
