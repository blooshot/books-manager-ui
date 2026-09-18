# 0002. Client-side Google OAuth, no backend, no Firebase

## Status
Accepted (amended: token client instead of PKCE; expiry UX and consent-screen
status added)

## Context
The app needs to authenticate the user and get scoped access to the
Sheets and Drive APIs, ideally without running or paying for a server.
Firebase Auth was considered as a way to simplify session handling.

## Decision
Use Google Identity Services (GIS) directly in the browser, via its
**token client** (`google.accounts.oauth2.initTokenClient`). No server or
proxy of any kind.

The original draft of this ADR said "OAuth 2.0 with PKCE". That is not
achievable here: GIS's authorization-code flow needs a client secret for
Google web clients, which cannot live in static client code, and would need a
backend for the code exchange. The token client returns a short-lived access
token and no refresh token, which is what this app uses.

Firebase was evaluated and rejected: it manages its own session token, but
the token that actually expires in this app is the Google API access token
used for Sheets/Drive — Firebase doesn't touch that, so it doesn't remove the
one real pain point, while adding a whole SDK and a second Google-adjacent
project to manage.

Session handling:
- The access token and its expiry live **in memory only** — never in
  `localStorage`, `sessionStorage`, or IndexedDB.
- Only the user's email is persisted (`localStorage`), used as `login_hint`
  for a one-click "Continue as …" after a reload.
- All API calls go through one client that checks expiry first. On imminent
  expiry or a 401 the UI shows a non-blocking "Session expired — Reconnect"
  banner; after the user reconnects, the pending action retries
  automatically. Retrying after a 401 is safe because the write did not happen.
- Silent re-request (`prompt: ''`) is not relied on: browsers may block the
  popup when it is not triggered by a click.
- Sign-out calls `google.accounts.oauth2.revoke` and clears memory.
- The OAuth consent screen is set to **In production (unverified)**. In
  *Testing* status Google forces re-consent about every 7 days; in production
  the user clicks through a one-time "unverified app" warning instead.

## Consequences
- The app is fully static and can be hosted anywhere for free.
- No service-account credentials or secrets exist anywhere in the client
  code — the user's own OAuth token is used directly.
- The Sheets/Drive access token expires roughly every hour, requiring an
  occasional one-click reconnect. Accepted as minor friction for a personal tool.
- If the project ever needs offline support, push notifications, or
  multi-user auth, Firebase (or an equivalent) should be reconsidered —
  it was rejected for the current single-user scope only.

## Clarifications (from building and looking at the sign-in flow)
- **Routes:** `/login` is the only public route. A `RequireSession` guard sends everyone else to `/login`, remembering the requested location so a successful sign-in returns there. After a deliberate sign-out the location is *not* remembered
  (the next sign-in starts at home). An *expired* session is not signed out: the app stays on screen with the reconnect banner (nothing in progress is lost).
- **Sign-out is instant.** The token is revoked at Google in the background and never awaited: Google's revoke only returns when the network does, and an early sign-out (or one while offline) must not hang. All in-memory library data (books, loans, notices,
  the outbox view) is cleared on sign-out. Unsent changes stay in IndexedDB and are sent the next time you sign in; because of that, Sign out asks for confirmation when any exist. The email hint, the theme, and the cover cache stay on the device.
- **Google's script is preloaded** when the login screen appears, so the click that starts sign-in can open the popup immediately. Loading it only after the click risks the browser treating the popup as not user-initiated (Safari especially) and blocking it.

