# Company Manage Full v19

Complete replacement ZIP. No patch scripts.

## Company Directory upgrades
- ERP and Tax actions open separate, focused forms.
- Member/project audit dialog opens immediately, then loads progressively in small project pages.
- Search boxes on company, project, membership, hub-user, selected-user-project, and audit lists.
- Select companies and run **Remove Members + Purge Companies**.
- Select multiple companies and rename sequentially as `Not integrated company 1`, `Not integrated company 2`, and so on.

## Loading
- Company groups: 500 records, using safe 200 + 200 + 100 requests, then a 5-second pause.
- Hub-user groups: 500 records, using five safe 100-user requests, then a 5-second pause.
- Retryable failures remain Pending and retry at the end.

## Safety and API limits
- Project-user removal uses signed-in ACC/Forma admin access. Autodesk does not support this write operation for legacy BIM 360 projects.
- Company deletion is attempted only after accessible associated project users are removed; unsupported or inaccessible associations are reported rather than hidden.
- One Vercel API function.
