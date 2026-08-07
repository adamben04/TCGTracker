# Security

## Reporting

Do not open a public issue for a suspected vulnerability. Contact the repository
owner privately with reproduction steps, affected endpoints, and impact.

## Production boundaries

- Authentication uses an HttpOnly cookie. Cross-site production requests require
  `SameSite=None; Secure`, `credentials: include`, and an exact `CORS_ORIGIN`.
- Admin access is a server-managed database role; usernames do not grant privileges.
- Grading history and retained images are authenticated and scoped by `user_id`.
- Scanner CORS fails closed in production, uploaded images have byte and decoded
  dimension limits, and image history is disabled by default.
- SQLite backups use consistent snapshots, checksums, integrity checks, immutable
  backup objects, and single-flight execution.
- Supabase service-role credentials belong only in the Render API environment.
  Never expose them through `VITE_*` variables or commit them.

## Dependency audit note

`npm audit` currently reports the React Router RSC action advisory
`GHSA-qwww-vcr4-c8h2`. This SPA uses declarative `BrowserRouter` only: it has no
React Server Components, server actions, framework mode, or React Router server
runtime, so the affected code path is not present. The project stays on the
newest patched client release rather than downgrading to versions with
client-side redirect/XSS advisories.

## Local data

Anonymous vault data is browser-local. Account vaults use user-namespaced local
storage and conflict-aware synchronization. Users should still export important
collections before clearing browser storage.
