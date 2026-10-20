# Company Manage v36

Complete replacement package (one Vercel API function: `api/index.js`).

## New in v36: filter and delete on the ABN Lookup tab
- Result filters: Cancelled + not matched, Cancelled / inactive ABN, Not matched, Needs review, Ready to apply,
  each match type, and Deleted. Clickable count badges switch filters.
- Every result row can be selected (Select All Filtered / Deselect All / Show selected only).
- **Delete selected**: removes every project member of the selected companies, then deletes the companies.
  A company is only deleted when all its members were removed and every project could be read; otherwise it is kept and reported.
  Requires typing DELETE. Shows how many are cancelled, not matched or other, and how many project members will be removed.
- "Select rows ready to apply" replaces automatic ticking, so deletion can never pick up good rows by accident.
- Report now includes Deleted and Cancelled ABN sheets.

## Everything from v35
ABN Lookup matching and update, Company Directory (filters, Replace with + verification, Auto Rename, ERP/Tax, Purge),
Import, Users & Access, User Removal, Bulk User Company, Project Numbers (job_number only), Reports & Excel.
