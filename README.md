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

## Sheet setup

The app reads and writes one Google Sheet (a **native** Google Sheet: if the file was uploaded as Excel, use File > Save as Google Sheets).
Its ID is the long part of the URL: `https://docs.google.com/spreadsheets/d/<THIS-PART>/edit`; put it in `VITE_SHEET_ID`.

1. Two tabs named **exactly** `Books` and `Borrowers` (capital first letter, no spaces). A new Sheet's first tab is called `Sheet1`: rename it.
2. Row 1 of each tab is the header row. Paste one line into cell **A1** of each tab (the tabs spread it across the columns):

   `Books`
   ```
   Book ID	Title	Author	Purchase date	Price paid	Current market price	Photo	Added at	Categories	Language
   ```
   `Borrowers`
   ```
   Book ID	Borrower name	Borrowed date	Borrowed time	Place	Returned	Returned date	Returned time
   ```
   (The gaps are tab characters. If pasting puts everything in one cell, use Data > Split text to columns.) Column order may change and extra columns
   may be added; the app finds columns by header name. Every header above must exist.
3. Format the date columns (`Purchase date`, `Borrowed date`, `Returned date`) as **Format > Number > Custom date and time > `yyyy-mm-dd`**, and the time columns
   (`Borrowed time`, `Returned time`) as **`HH:mm`**. Otherwise dates read back in your locale's format and retried writes cannot be recognised.
4. For categories and languages, add two more tabs named **exactly** `Categories` and `Languages`, each with this header row (paste into **A1**):
   ```
   Name	Active
   ```
   Then manage the lists in the app (**Categories** in the header menu). The `Categories` and `Languages` tabs and the `Categories` / `Language` columns on
   `Books` are optional: an older Sheet without them still works, and the app tells you what to add. Never delete rows from these tabs by hand if you want to
   restore something later: the app archives instead (`Active` = `No`), and a hand-typed row with no `Active` value counts as active.
5. Optional: freeze row 1, and protect the `Books` tab (see `docs/STATUS.md`, step 8).

If the app says *"The Sheet has no tab named ..."* or *"is missing column(s) ..."*, this section is the fix.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Unit tests (includes the ADR-0004 no-delete guard) |
| `npm run lint` | oxlint |
| `npm run ui:check` | Walks the real app in a real Chrome with Google stubbed (login, redirects, sign-out, offline queue, layout, Sheet setup errors). Needs Chrome (`CHROME_PATH` if not found). Not part of `verify`. See `scripts/ui-check/README.md` |

## Status

Sign-in gate (GIS token client), Redux store, Fusion theme with light/dark
toggle, and the Sheets service layer (read, add/edit books, borrow/return).
After sign-in the app shows book and lent-out counts from your Sheet. The Sheet
needs tabs named `Books` and `Borrowers` with the header columns listed in
`AGENTS.md`, and date columns formatted `yyyy-mm-dd`. Progress: `docs/STATUS.md`.
