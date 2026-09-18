# Books Management - Product Guidelines

## Voice and Tone
- **Professional and straightforward:** The application should communicate clearly and concisely, prioritizing utility and ease of use over unnecessary flourish. Error messages and notifications should be direct and actionable.

## UI / UX Principles
The project strictly follows the **Fusion Design System**. Do not deviate from these rules.

### Styling & Tokens
- **Never hardcode colors.** Always use the Tailwind/shadcn utilities mapped in `src/index.css`.
- Rely on the design tokens defined in `.agents/skills/custom-ui-design-system/tokens.css` and `tokens.json`.

### Semantic Coloring
- `bg-primary`: Primary actions (e.g., Add, Borrow, Sync).
- `bg-success`: Success states (e.g., 'Available' badge, returned confirmation).
- `bg-attention`: Items requiring attention (e.g., "N pending").
- `bg-destructive`: Errors only (e.g., failed write/sync).
- **Note:** *Borrowed* status should be represented as a **neutral** pill (`surface-2` + `text`), not an attention or tertiary color.

### Typography
- **UI Text:** Manrope.
- **Data/Monospace:** IBM Plex Mono (used for Book IDs, dates, times, and ₹ amounts).
- Fonts are self-hosted via `@fontsource`.

### Accessibility & Responsiveness
- **Form Controls:** Must be exactly 16px on mobile devices to prevent iOS focus-zoom behavior.
- **Motion:** Always honour `prefers-reduced-motion` settings.
