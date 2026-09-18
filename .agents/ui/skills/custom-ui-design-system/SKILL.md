---
name: custom-ui-design-system
description: Use when building or styling any UI in this project. The Fusion design system - color tokens (light/dark), typography, spacing, radius, interaction states, component inventory, and the project's `danger` and reduced-motion extensions. Read design-system.md; tokens live in tokens.css / tokens.json.
---

# Fusion design system

Read `design-system.md` in this folder before building or styling a screen.
Tokens: `tokens.css` (imported by `src/index.css`) and `tokens.json`.

Project rules (see AGENTS.md > Design system):
- Never hardcode colors; use the Tailwind/shadcn utilities mapped in `src/index.css`.
- `bg-primary` = primary actions, `bg-success` = success (Available, returned),
  `bg-attention` = attention only, `bg-destructive` = errors only.
- *Borrowed* is a neutral pill, not tertiary.
- Manrope for UI; IBM Plex Mono for IDs, dates, times, amounts.
- Form controls are 16px on mobile; honour `prefers-reduced-motion`.
