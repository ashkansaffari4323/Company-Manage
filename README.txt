Corrected authentication fix. This version avoids PowerShell quoting errors.

Extract both files into the repository root, then run:

powershell -ExecutionPolicy Bypass -File .\apply-auth-fix-v2.ps1

Expected result:
Authentication fix applied successfully.
API function count: 1

Then commit and push to origin/main.
