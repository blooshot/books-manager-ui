# Fusion Design System

A dual-personality theme built for a product that spans dashboard, ecommerce,
school, and blog contexts — on both web and mobile.

- **Light mode**: navy, emerald, and olive. Deep and legible rather than bright,
  used the way a mature product uses color — one dominant action color, with
  the other two doing real semantic work instead of sitting there as decoration.
- **Dark mode**: teal and pine. Calmer, easier on long sessions, with a soft red
  held back for genuine alerts only.

Files in this package:
- `tokens.css` — CSS custom properties, drop-in ready, includes a commented
  shadcn/ui variable mapping
- `tokens.json` — the same values, framework-agnostic (Tailwind config, Figma
  Tokens plugin, or as a machine-readable spec for an AI tool)
- `design-system.md` — this file

---

## Color tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `bg` | `#F5F6F1` | `#0B1614` | Page background |
| `surface` | `#FFFFFF` | `#12201D` | Cards, panels, menus |
| `surface-2` | `#EAEBE2` | `#182C27` | Subtle fills, hover backgrounds |
| `text` | `#1B2430` | `#E7F3EE` | Primary text |
| `text-muted` | `#5C6570` | `#8FA89D` | Secondary text, labels |
| `border` | `#DADCD1` | `#24413A` | Dividers, input borders |
| `accent` | `#1F3A5F` navy | `#2FBFA6` teal | Primary actions, links, focus ring |
| `secondary` | `#1B6B4A` emerald | `#4C9A7C` pine | Success, positive deltas |
| `tertiary` | `#6E7233` olive | `#E2685C` soft red | Caution / attention-needed |

Rule of thumb: **accent = do the primary thing. secondary = it went well.
tertiary = look at this.** Don't reach for tertiary as a second accent color —
it's semantic, not decorative.

### Extension: `danger` (added for the books-management app)

| Token | Light | Dark | Role |
|---|---|---|---|
| `danger` | `#B3261E` | `#E2685C` | Errors only — failed writes, failed sync |

Light-mode tertiary is olive, which reads as caution, not error. `danger` gives
errors a proper red in light mode; dark mode reuses the existing soft red. In
the shadcn mapping, `destructive` points at `danger`. Tertiary stays for
attention states such as "N pending changes".

## Motion accessibility (extension)

`tokens.css` zeroes the transition durations and press-scale under
`prefers-reduced-motion: reduce`. Component animations (accordion height,
dialog scale-in, toast slide) must read these tokens rather than hard-coding
durations.

## Typography

Single family (Manrope) across display and body — friendly, geometric,
modern. Monospace (IBM Plex Mono) reserved for data: IDs, timestamps, token
values, table figures.

| Token | Size |
|---|---|
| `text-xs` | 12px |
| `text-sm` | 13px |
| `text-base` | 14px (default body) |
| `text-md` | 16px |
| `text-lg` | 18px |
| `text-xl` | 21px |
| `text-2xl` | 28px |
| `text-3xl` | 36px |
| `text-display` | 44px |

## Spacing & radius

Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px.
Radius: `sm` 6px (tags, chips) · `md` 10px (buttons, inputs, small cards) ·
`lg` 14px (cards, modals, sidebar) · `full` 999px (pills, badges).

## Elevation

Three shadow levels (`shadow-sm/md/lg`), darker and more opaque in dark mode
since surfaces there rely on shadow rather than a light backdrop to read as
"lifted." Used sparingly — on hover/open states (cards, dropdowns, modals,
toasts), not as a resting default on every box.

---

## Interaction behavior (shadcn-style)

These apply to every interactive element, not just buttons:

- **Hover**: opacity → 0.88 (filled elements), or background shifts to
  `surface-2` (ghost/ outline elements). Transition 150ms.
- **Press/active**: opacity → 0.78, `transform: scale(0.97)`. Transition 100ms.
- **Focus-visible**: 2px solid ring in `accent`, 2px offset. Inputs use a
  soft accent-tinted glow instead (`box-shadow` with ~20% accent alpha).
- **Cards that are clickable** (product, blog, course cards): lift
  `translateY(-3px)` on hover, border shifts to `accent`, settles back on
  click.

## Component inventory

Everything below has already been prototyped and behavior-tested in the
explorer artifact. Treat this as the build checklist:

| Component | Behavior notes |
|---|---|
| Button (primary / secondary / ghost) | Hover dim, press scale, focus ring |
| Input / select | Border-hover, accent focus ring |
| Dropdown (single-select) | Fade + scale open, closes on select/outside/Escape |
| Dropdown (multi-select) | Checkbox items, stays open, live count, Clear action |
| Dropdown (searchable / combobox) | Filter-as-you-type, empty state |
| Accordion | One open at a time, chevron rotates, animated height |
| Modal / Dialog | Backdrop fade, scale-in panel, closes on X/Cancel/backdrop/Escape |
| Sidebar | Active-item highlight, collapsible to icon-only |
| Toast | Slide in bottom-right, auto-dismiss ~4s, manual close, stacks |
| Alert (info/success/warning) | Tinted background at ~8% token alpha |
| Data table | Search filter, status filter, sortable columns with arrow indicator |
| Dashboard charts | Line, donut, bar — colored from the same semantic tokens as everything else |
| Progress bar | Token-colored fill, animated width |
| Activity feed | Colored status dot + timestamp |

---

## Handing this to an AI coding tool

Paste the block below along with `tokens.css` (or `tokens.json`) into
Claude Code, Cursor, v0, or similar, before asking it to build a screen:

```
Use the Fusion design system for all UI you generate.

Tokens: see attached tokens.css / tokens.json. Support both
data-theme="light" and data-theme="dark" via the tokens provided —
don't hardcode colors.

Rules:
- accent = primary actions/links only. secondary = success/positive only.
  tertiary = caution/attention only. Never use tertiary as a decorative
  second accent.
- Typography: Manrope for display/body, IBM Plex Mono only for data
  (IDs, timestamps, numeric table values).
- Radius: sm=6px (chips), md=10px (buttons/inputs/small cards),
  lg=14px (cards/modals/sidebar), full=999px (pills).
- Interactive elements: hover → opacity 0.88 or surface-2 background;
  active/press → opacity 0.78 + scale(0.97); focus-visible → 2px accent
  ring, 2px offset. All transitions 120–150ms.
- Prefer shadcn/ui primitives (Button, Select, Command, Dialog, Sheet,
  Toast, Accordion) mapped to these tokens over custom-built equivalents.
- Elevation (shadow-sm/md/lg) only on hover/open states, not as a resting
  default.
```

This is deliberately specific about the *rules*, not just the colors —
an AI tool that only sees hex codes will still invent its own spacing and
hover behavior. The rules above are what make output feel consistent
across separate prompts and sessions.
