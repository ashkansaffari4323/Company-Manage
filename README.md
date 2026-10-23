# Company Manage v37

Complete replacement package (one Vercel API function: `api/index.js`).

## New in v37: Delete from Excel tab
1. Load companies, then upload an Excel/CSV file (any sheet). The ABN Lookup report works as-is (e.g. its "No Match" sheet).
2. Columns are detected automatically and can be changed: Company ID, Name, Tax ID / ABN, ERP ID, Reason.
3. Each row is matched to a Forma company in this order:
   Company ID (exact) -> Tax ID / ABN (digits) -> ERP ID -> name -> name ignoring Pty Ltd.
   Rows are marked Ready, Not found, Ambiguous (several companies match), Duplicate row or Already deleted.
   Matches not made by Company ID, or where the Forma name differs, are flagged "check".
4. Only Ready rows can be selected. Delete removes all project members of each company first, then deletes the company.
   Type DELETE to confirm. Companies are kept if any member cannot be removed or any project cannot be read.
5. Export Match Report shows every row, what it matched, and the final result.

The ABN Lookup report and the Company Directory export now include a Company ID column so files round-trip exactly.
