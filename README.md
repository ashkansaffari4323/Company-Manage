# Company Manage Full v16 Auth Fixed

Complete replacement build. No patch scripts.

- One Vercel API function
- Autodesk Connect and Sign out
- Company page loading: 200 records, 5-second gap, pending retry
- Hub-user loading: requests 500, automatic fallback to 200, 5-second gap, pending retry
- No ERP, No Tax, No Members and status filters
- Direct ERP/Tax maintenance, image upload and zero-member purge
- Clickable Members and Projects audit
- Two-legged HQ requests, three-legged ACC project/user requests
- Multi-project/multi-user access manager
- Select one hub user, remove from selected/all projects, then attempt Hub removal
- Excel/CSV exports

Vercel: Framework Other, Build `npm run build`, Output `client/dist`.


## Authentication correction
- The `/callback` route now exchanges the Autodesk authorization code before loading the application.
- After successful exchange, the browser returns to `/`, reads the secure session cookie, and fetches hubs.
- OAuth errors are displayed on the callback screen instead of silently returning to a disconnected app.
