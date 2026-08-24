Extract these files into the root of Company Manage, then run:
powershell -ExecutionPolicy Bypass -File .\apply-single-api.ps1
This deletes every old API route and creates exactly ONE Vercel function.
