# Company Manage Complete

One clean Vercel-ready build with a single API function.

Features:
- Autodesk Connect and Sign out
- Name-only company import, optional trade
- Full company pagination beyond 200 records
- Working No ERP ID, No Tax ID, and No members filters
- Add ERP ID or Tax ID directly from filtered rows
- Edit and rename companies
- Upload company images
- Individual and selected zero-member company purge
- Multi-project selection
- Multi-user membership selection across projects
- Bulk role update or access removal for supported ACC/Forma projects
- Human-readable reports and Excel exports
- No raw API reports

Vercel:
- Framework: Other
- Build: npm run build
- Output: client/dist
- API functions: 1

## Smart quota queue
- Company and user data load in batches of 50.
- The client waits 10 seconds between batches.
- HTTP 429, 408, 500, 502, 503, 504, quota, rate, timeout, and temporary failures are placed in a pending queue.
- Pending batches are retried at the end instead of failing the entire load.
- The UI shows loaded, total, pending, and current queue status.

## Clickable company project count
- The Projects number in Company Directory is now a button.
- Clicking it opens a Project Associations dialog.
- The dialog lists project name, status, classification, member count, and project ID.
- If member details are available, they are included in the Excel export.
- Project associations can be exported to Excel.


## Performance and project audit
- Company and membership pages load 200 records at a time.
- The client pauses 5 seconds between requests.
- Retryable quota batches remain pending and are retried at the end.
- The generic Edit/Rename action was removed from Company Directory.
- Missing ERP and Tax buttons remain available.
- Clicking the project count opens a project/company/member audit with project names, company status, member status, and deleted/inactive indicators when returned by Autodesk.
- The audit exports to Excel.
