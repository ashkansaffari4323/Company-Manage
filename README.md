# Company Manage v34

Complete replacement package (one Vercel API function: `api/index.js`).

## New in v34
- **Searchable company picker** for Replace with, Replace selected, and Bulk User Company target:
  type to filter 10,000+ companies, arrow keys + Enter, shows members, projects, ERP ID and trade.
- **Show selected only** toggle on every list (companies, projects, project users, Hub users, user projects, job numbers, replace preview).
- **Replace company with preview, test and verification**:
  1. Finds every member of the company across all projects.
  2. Preview shows ACC (movable) vs BIM 360 (not supported by Autodesk API) rows.
  3. "Test on 1 member first" moves one member and confirms by reading it back from Autodesk.
  4. Move selected members, optionally change Hub default company, optionally delete the old company only if fully moved.
  Every change is read back from Autodesk; rows show "Moved - verified" or the exact error.

## Requirements for changing a member's company
- Signed-in user must be Project Admin (or Hub Admin) on those projects. Uses the ACC project-user PATCH with `companyId`.
- BIM 360 projects cannot be changed through the API; change them in BIM 360 Project Admin.

Vercel: Framework Other | Build `npm run build` | Output `client/dist`. Environment variables: see `.env.example`.
