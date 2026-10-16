# Company Manage v33

Complete replacement package (one Vercel API function: `api/index.js`).

## New in v33: Replace company
Every Company Directory row has a searchable **Replace with** picker and a **Move** button.
Move finds every member of that company in every project and reassigns them to the chosen company.
Options: also change the Hub default company of those users, and delete the old company afterwards.
Select several companies and use **Replace selected companies with** to merge many into one.
Project-member company changes use the ACC project-user PATCH (`companyId`); BIM 360 projects may reject it and are reported.

## Everything else
- Company Directory: No ERP ID / No Tax ID / No members / No logo / Unused / Duplicate filters, Add ERP/Tax, logos,
  clickable Members/Projects audit with member removal, Auto Rename, Bulk ERP/Tax from Excel, Remove Members + Purge.
- Import Companies (full template), Users & Access, User Removal, Bulk User Company,
  Project Numbers (job_number only), Reports & Excel (Hub User Project Register).

Vercel: Framework Other | Build `npm run build` | Output `client/dist`. Environment variables: see `.env.example`.
