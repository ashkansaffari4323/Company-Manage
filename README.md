# Company Manage Full v21

Complete replacement ZIP. No patch scripts.

## Company Directory corrections
- The multi-company rename action is labelled **Auto Rename**.
- The operator enters only the desired prefix. Selected companies are renamed as `<prefix> 1`, `<prefix> 2`, `<prefix> 3`, and so on.
- Auto Rename updates the loaded directory in memory and does not reload all companies from Autodesk.
- Remove Members + Purge updates the loaded directory in memory and does not reload all companies.
- The only operation that starts a complete company load is the explicit **Load All** button or a deliberate status reload.

## Purge behaviour
- Finds accessible project-user memberships assigned to each selected company.
- Removes those memberships from supported ACC/Forma projects.
- Attempts to mark the company deleted through the Autodesk company endpoint.
- Leaves failed companies visible and records every success/failure in Reports.
- Legacy BIM 360 project-user removals may be unsupported and will be reported.

All v20 features remain included: stable 100%-complete audit view, member removal in the audit, search fields, company filters, full Excel template, 500-record logical cycles, pending retry, authentication, user workflows, and one Vercel function.
