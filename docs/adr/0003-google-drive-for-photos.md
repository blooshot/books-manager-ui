# 0003. Google Drive for cover photos, not Google Photos

## Status
Accepted

## Context
Book cover photos were originally going to come from the user's existing
Google Photos library. In March 2025, Google removed the Google Photos
Library API's broad read scope (`photoslibrary.readonly`); apps can now
only read photos they themselves uploaded, or use a one-time manual
picker — there is no way to programmatically read an existing library or
album automatically anymore.

Public "hotlinking" of Drive files (`drive.google.com/uc?export=view`)
was also considered, since it requires no API auth — but it's unofficial,
unreliable, and depends on files being publicly link-shared.

## Decision
Use a dedicated Google Drive folder, accessed via the Drive API using the
same OAuth session already used for Sheets (see ADR-0002). Cover images
are uploaded to this folder from the app and read back authenticated,
not via public links.

## Consequences
- Reliable, authenticated image access — no dependency on public sharing
  links that can be throttled or broken.
- No new service or cost — uses the user's existing Google Drive storage.
- Requires the Drive API scope in addition to the Sheets scope during
  sign-in.
- Google Photos remains off the table entirely unless Google reopens
  broader read access in the future.
- Scope choice, folder handling, image sizing, and caching are specified in
  ADR-0007.
