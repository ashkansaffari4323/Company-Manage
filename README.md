# Company Manage v32

Complete replacement package (one Vercel API function: `api/index.js`).

## Tabs
- **Dashboard** - ERP/Tax coverage, data-quality shortcuts.
- **Company Directory** - filters: No ERP ID, No Tax ID, No members, No logo, Unused, Duplicate names, status, search.
  Add ERP/Tax IDs, logo upload, clickable Members/Projects audit (with member removal), Auto Rename (prefix + 1,2,3...),
  Bulk ERP/Tax from Excel, Remove Members + Purge. Loads 1,000 companies per group (5 x 200) with a 5-second pause.
- **Import Companies** - full Excel template (every field Autodesk accepts), validation, batches of 50.
- **Users & Access** - multi-project selection, load users, search/filter, change role, remove access, select all/deselect all.
- **User Removal** - Hub user search + company filter, direct project list, remove from selected/all, remove from Hub.
- **Bulk User Company** - many users from many companies to one target company (preview + apply).
- **Project Numbers** - BIM 360 `job_number` only (never the project name): add/remove prefix or suffix, replace.
- **Reports & Excel** - action log and the comprehensive Hub User Project Register workbook.

## Vercel
Framework: Other | Build: `npm run build` | Output: `client/dist`
Environment variables: see `.env.example`. Callback URL must match the APS app exactly.
