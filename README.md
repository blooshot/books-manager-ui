# My Library

Personal, single-user book library: React + Vite, Google Sheets as the data
store, Google Drive for cover photos. No backend. Read `AGENTS.md` first;
decisions live in `docs/adr/`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in VITE_GOOGLE_CLIENT_ID and VITE_SHEET_ID
npm run dev
```

Google Cloud (one time): enable the Sheets and Drive APIs, create an OAuth
client (type *Web application*) with `http://localhost:5173` as an authorised
JavaScript origin (add your deployed origin later), and set the consent screen
to *In production*.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Unit tests (includes the ADR-0004 no-delete guard) |
| `npm run lint` | oxlint |

## Status

Sign-in gate (GIS token client), Redux store, Fusion theme with light/dark
toggle, and the Sheets service layer (read, add/edit books, borrow/return).
After sign-in the app shows book and lent-out counts from your Sheet. The Sheet
needs tabs named `Books` and `Borrowers` with the header columns listed in
`AGENTS.md`, and date columns formatted `yyyy-mm-dd`. Progress: `docs/STATUS.md`.
