# Company Manage Final v30

Emergency correction after v29.

The Project Numbers tab modifies BIM 360 `job_number` only. The backend PATCH body never includes `name`.

Supported job-number operations:
- Add prefix
- Remove prefix
- Add suffix
- Remove suffix
- Replace complete job number
- Search and multi-select projects
- Select all filtered and deselect all
- Preview and Excel export

The exact BIM 360 update body is `{ "job_number": "..." }`.
