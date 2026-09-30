# HM Arrivals Control Center

Password-protected shipment dashboard for Netlify. Static page in `public/`, one Netlify Function in `netlify/functions/`.

## How it works
- The page asks for a password. It sends the password to `/.netlify/functions/data`, which checks it and returns the shipments. The data is not part of the static files.
- Data source: the SharePoint workbook when the settings below are set. Otherwise the built-in `netlify/functions/data/shipments.json`.
- Status, Delayed and Projected Arrival are worked out on the page. Delayed = not delivered and ETA before today. Projected arrival = ETA + 14 days (only for Delayed).
- Small "template" and "upload" links at the bottom right. Upload previews a file on that screen only; the shared data lives in SharePoint.

## Netlify settings (Site configuration > Environment variables)
| Name | Value |
|---|---|
| `SITE_PASSWORD` | the password viewers type (required) |
| `MS_TENANT_ID` | Azure directory (tenant) ID |
| `MS_CLIENT_ID` | Azure app (client) ID |
| `MS_CLIENT_SECRET` | Azure app client secret |
| `SP_FILE_URL` | sharing link or URL of the SharePoint .xlsx file |

The Azure app registration needs the Microsoft Graph application permission `Files.Read.All` (or `Sites.Selected` limited to the site) with admin consent. Without the four `MS_*`/`SP_*` values the built-in data is shown.

## Workbook layout
Sheet `Shipments` (or the first sheet) with the header row: Supplier, Items, Category, Terms, CNTR, BL, ETD, ETA, POD, Remarks. Use the template link on the page to get the exact layout.
