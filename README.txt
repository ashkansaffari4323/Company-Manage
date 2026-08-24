Fix for: Only support 2 legged access token

Cause:
The legacy HQ company-detail endpoint was being called with the signed-in 3-legged user token.

Fix:
- HQ company detail uses a two-legged account:read token.
- ACC Admin project and project-user reads continue using the signed-in user token.
- Keeps exactly one Vercel API function.

Extract into repository root and run:
powershell -ExecutionPolicy Bypass -File .\apply-company-projects-2leg-fix.ps1
