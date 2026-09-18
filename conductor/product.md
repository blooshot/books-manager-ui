# Books Management - Product Definition

> **Note on Canonical Documentation:**
> The primary sources of truth for this project are `AGENTS.md`, `docs/adr/`, and `docs/STATUS.md`. This document serves as a high-level summary and defers to those files for technical and architectural details.

## Vision
A web-based library management system built with React, Vite, Tailwind CSS, and Redux. It uses Google Sheets as a strict schema backend to manage books and borrowers, featuring sign-in via Google, Google Drive integration for book cover photos, and offline-first syncing capabilities.

## Target Audience
Designed for a single librarian managing the entire catalog and loan process.

## Core Features
- Book catalog management (add, edit, and cover photo integration via Google Drive).
- Loan management (borrowing and returning books).
- Offline support via a sync outbox mechanism to handle Google API latency and offline states.

## Constraints & Architecture
The project strictly adheres to the following hard constraints (refer to `AGENTS.md` and Architecture Decision Records in `docs/adr/` for detailed context):

1. **Single user only**: No multi-user auth, roles, or sharing features. There is exactly one signed-in user.
2. **$0 budget**: No paid services or services requiring their own backend/server (e.g., Supabase, Firebase).
3. **Books are append-only**: No delete or clear operations on the `Books` tab, in the UI or in code. Add and edit only. Drive files are not deleted; replaced covers are renamed.
4. **No backend component**: All API calls happen client-side using the signed-in user's own OAuth token. No server, proxy, or service-account credential embedded in client code.
5. **No Firebase**: Strictly prohibited.
6. **No Google Photos API**: Strictly prohibited. Use Google Drive instead for photo storage.
7. **Never store the access token outside memory**: No `localStorage`, `sessionStorage`, or IndexedDB for tokens. Only the email hint may be persisted.
