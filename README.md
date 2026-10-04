# Waste Analytics Dashboard

Static web app (no build step). Serve the folder (e.g. `python3 -m http.server`) and open `index.html`.

- **Upload waste report**: xlsx with a write-off records sheet (`Wastage Value`, `Write-off storage`, `Category`…) and a `Net Sales` sheet (`Store`, `Write-off storage`, `Net Sales`). **Download template** gives the exact layout.
- **Area manager mapping**: built in (from the AM/ROM file); replace via *Area manager mapping → Upload*. Stores are assigned by store code (B##).
- Thresholds: high > 1.4 %, unusually low < 1.0 % of net sales (editable).

## Area manager visits (`visits.html`)
Calendar of area manager store visits. **Download template** has every store with its area manager pre-filled; add the visit date and tasks (copy a row for more tasks; repeat a Task with a different Sub-task for sub-tasks) and **Upload schedule**. Admin password (set on first use) unlocks scheduling and the month dashboard (visits, task completion, overdue, store coverage, Excel export). Data is stored in the browser (localStorage); use Backup/Restore to move it between devices.
