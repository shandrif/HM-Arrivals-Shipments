# Waste Analytics Dashboard

Static web app (no build step). Serve the folder (e.g. `python3 -m http.server`) and open `index.html`.

- **Upload waste report**: xlsx with a write-off records sheet (`Wastage Value`, `Write-off storage`, `Category`…) and a `Net Sales` sheet (`Store`, `Write-off storage`, `Net Sales`). **Download template** gives the exact layout.
- **Area manager mapping**: built in (from the AM/ROM file); replace via *Area manager mapping → Upload*. Stores are assigned by store code (B##).
- Thresholds: high > 1.4 %, unusually low < 1.0 % of net sales (editable).

## Area manager visit calendar (`visits.html`)
- Month calendar of area manager visits; anyone can view and tick tasks/sub-tasks as done.
- **Admin** (password created on first login) can schedule visits (pick area manager + stores, tasks, sub-tasks), edit/delete, **download the visit template** (all stores + their area managers pre-filled, just add date/task) and **upload** it back.
- **Admin dashboard**: month KPIs, per-area-manager completion, overdue visits, store coverage, unvisited stores, Excel export.
- Data is stored in the browser (localStorage); use Admin → Backup/Restore to move it between devices. The password is a client-side gate only, not server security.
