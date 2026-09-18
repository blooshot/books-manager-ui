# UI check (real Chrome, Google stubbed)

`npm run ui:check` starts the app with Vite, opens it in a real Chrome/Chromium (via `puppeteer-core`, which does not download a browser), and walks
the flows in `flows.mjs`. It exits non-zero if any flow fails. Options: `-- --only <text>` runs the flows whose name contains the text.

**What it is for:** the things component tests cannot see: real navigation and redirects, real layout at phone and desktop widths, real dialogs and focus.
Run it after any change to routing, layout, sign-in or sign-out, or anything a user navigates. Add a flow when you add a screen or a flow.

**What it is not:** it does not talk to Google. `stubs.mjs` replaces Google's sign-in script and answers the Sheets API (read, append, cell update; a 400 for an
unknown tab, as Google does) and 404 for Drive, at the network layer of the page. So it proves the app behaves in a browser; it does not prove real Google sign-in,
scopes, consent, real Sheets/Drive, dark mode, or a real phone. Say so in the Completion Report.

- Chrome is found automatically (`/usr/bin/google-chrome`, Chromium, macOS and Windows paths) or via `CHROME_PATH`.
- It sets `VITE_*` in the environment for the run only (they win over `.env.local`), so it never touches your real configuration.
- Screenshots of each flow's final state go to `node_modules/.cache/ui-check/` (git-ignored).
- Keep flows independent: each gets a fresh page and a fresh pretend Google (`newWorld()`); change `world.online` / `world.sheets` inside a flow to simulate failures.
