# Company Manage Full v25

Complete replacement ZIP. No PowerShell patch scripts.

## Restored Users & Access list
- The project-user list remains visible after loading users from selected projects.
- Search users by name, email, company, role, or project.
- Select individual users or select all filtered users.
- Change roles or remove selected project memberships.

## Instant company Members / Projects audit
- Clicking a company Members or Projects count sends one audit request.
- No staged project pages, no five-second gap, and no repeated modal redraw.
- The server loads the account project list once, scans project users in controlled parallel groups, and returns one final response.
- The UI shows one stable loading panel, then one final audit view.
- Members can be selected and removed from projects from the final view.

The full company directory loader still uses safe 1,000-company logical groups with a five-second gap, and Hub users still use safe 100-user pages grouped by 500.
