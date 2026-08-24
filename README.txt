Fixes the User Project Removal 404 error and increases hub-user loading.

Cause:
The app used /construction/admin/v1/accounts/{accountId}/users, but account-level users are served by the HQ account-users endpoint.

Fix:
- Uses /hq/v1/accounts/{accountId}/users
- Uses a two-legged account:read token
- Requests up to 500 users per page
- Falls back to 200 if Autodesk rejects a 500-item page
- Waits five seconds between pages
- Moves quota/temporary failures to Pending
- Retries Pending pages at the end
- Keeps one Vercel function

Run from repository root:
powershell -ExecutionPolicy Bypass -File .\apply-hub-users-500-fix.ps1
