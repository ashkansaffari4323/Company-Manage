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
