Latest Company Manage feature patch

Changes:
- Removes All Projects navigation page
- Adds Users & Access page
- Select one project and multiple users
- Bulk role change or remove project access
- Company Directory still fetches all company pages
- No ERP, No Tax, and No Members checkboxes reload the filtered list automatically
- Keeps company rename, ERP/Tax editing, image upload, and purge
- Keeps exactly one Vercel API function

Important limitations:
- Autodesk does not currently expose a project-delete API for this workflow.
- Project user write actions are supported for Forma/ACC projects; BIM 360 project writes are not compatible.

Extract into repository root and run:
powershell -ExecutionPolicy Bypass -File .\apply-access-manager.ps1
