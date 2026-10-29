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


### New in v39: Company Address Upload
- Added as a new tab without removing any v38 feature.
- Matches Supplier ID / S Code to Hub ERP ID.
- Supports Supplier List multiline addresses and clean template.
- Preview, select, export comparison, typed confirmation and AUS regional update.

## v40: Deep company dependency resolution
- Company audit now reconciles Autodesk directory counters against accessible project memberships.
- Shows project status and platform, including archived/template projects returned by Autodesk.
- Finds Hub users whose default company still points to the selected company.
- Allows Hub default-company reassignment directly from the audit.
- Identifies unresolved/stale directory counters separately from visible members.
- Blocks deletion while project scan errors, project memberships, or Hub-default users remain.
- Allows a guarded Autodesk soft-delete only after the audit is clear.

## v41: Archived Projects company and member cleanup
- New Archived Projects tab for archived, inactive, closed and template projects.
- Lists project company/member relationships and unreadable projects.
- Reassigns ACC project memberships to another company with Autodesk read-back verification.
- Removes selected memberships where Autodesk permits the operation.
- Exports archived-project company/member evidence to Excel.
- Detects and protects the Hub Host company from purge workflows.
- BIM 360 rows remain visible and report API failures for manual administration.
