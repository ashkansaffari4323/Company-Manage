# Company Manage Final Complete

Full replacement application with one Vercel serverless function.

Core features:
- Autodesk Connect and Sign out
- Uses two-legged token for HQ company endpoints
- Uses signed-in three-legged Hub Admin token for ACC projects and project users
- Company pagination: 200 records per request, 5-second pause
- Quota/temporary failures move to Pending and retry at the end
- No ERP ID, No Tax ID, No Members and status filters
- Direct Add ERP / Add Tax actions
- Company logo upload
- Zero-member selection and purge
- Clickable Members and Projects counts
- Company project/member audit with names, status and Excel export
- Multi-project, multi-user access manager
- Excel reports

Vercel settings:
- Framework: Other
- Build command: npm run build
- Output directory: client/dist


## User-centric removal flow
- Select one hub user.
- List every accessible project where that user is a member.
- Select multiple projects and remove access.
- Remove access from all listed projects.
- Account-level user removal is enabled only after no project memberships remain and requires typing REMOVE USER.
- Project removal uses the signed-in Hub Admin token and is supported for ACC/Forma project writes, not BIM 360 project writes.
