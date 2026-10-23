# Company Manage v38

Complete replacement package (one Vercel API function: `api/index.js`).

## New in v38: Delete by S Code tab
1. Load Hub companies.
2. Upload the Workday "Find Suppliers" export as-is (or the template: S Code, Supplier Name, Status, Reason).
   The header row and columns are detected automatically (Supplier ID = S code, Supplier Name, Supplier Status, Alternate Name).
3. Each S code is compared with the Hub company ERP ID. Dashes/spaces are ignored (S-205598 = S205598).
   Optional fallbacks: old code (Workday Alternate Name) = ERP ID, and name. Fallback matches are flagged "check".
4. Results: In Hub, In Hub - check, Not in Hub, Multiple Hub matches, Duplicate rows. Status other than Inactive (e.g. Hold) is flagged.
5. Select (Select exact S code matches / Select All Filtered / tick rows), then Delete. Type DELETE.
   Project members are removed first; a company is kept if anything fails.
6. Export Comparison Report: Summary, All Rows, In Hub, Check, Not in Hub, Deleted.

All earlier features retained.
