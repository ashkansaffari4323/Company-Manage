# Company Manage v35

Complete replacement package (one Vercel API function: `api/index.js`).

## New in v35: ABN Lookup tab
Checks Forma companies against the Australian Business Register (official ABN Lookup web services).
1. If the Forma Tax ID is a valid ABN (checksum verified) it is looked up directly.
2. Otherwise the company name is searched; results are classed as Exact name match, Close name match,
   Name match - multiple ABNs, or No match.
3. Matches can fill the missing Tax ID (ABN), state and postcode in Forma. Optional overwrite of differing values.
4. ABN and exact-name matches are ticked automatically; close/multiple matches need manual review.
5. Excel report: Summary, All Companies, Updated, Needs Review, No Match.

ABR only publishes STATE and POSTCODE for a business address. Street address, suburb and phone are not available
from ABR and are never changed.

Requires a free ABN Lookup GUID: register at https://abr.business.gov.au/Tools/WebServices
Enter it in the ABN Lookup tab (saved in your browser) or set `ABR_GUID` in Vercel.

## Everything from v34
Company Directory (filters incl. No address, Replace with + verification, Auto Rename, ERP/Tax, Purge), Import,
Users & Access, User Removal, Bulk User Company, Project Numbers (job_number only), Reports & Excel,
Select All / Deselect All / Show selected only on every list.
