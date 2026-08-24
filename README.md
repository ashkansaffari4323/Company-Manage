# ACC Company Manager - Hub Admin All Data

This build uses the signed-in Autodesk user's access for directory reads, company edits, image upload, and project listing. The app cannot grant permissions beyond the Autodesk role assigned to that user.

Features:
- Fetches all company pages, not only the first 200
- Search by company name, trade, ERP ID, or Tax ID
- Filters: no ERP ID, no Tax ID, no members, and status
- Company image upload
- Rename, edit trade, ERP ID, and Tax ID / ABN
- Per-company and bulk patch purge
- Lists all projects returned to the signed-in Hub Admin, including archived and template classifications when Autodesk returns them
- Excel export for companies, projects, import reports, purge previews, and purge results
- No raw API JSON in the UI
- 11 API functions, below the Vercel Hobby limit
