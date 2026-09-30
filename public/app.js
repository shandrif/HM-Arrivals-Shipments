(function () {
  const S = window.Shipments;
  const $ = id => document.getElementById(id);
  const ENDPOINT = '/.netlify/functions/data';
  const KEY = 'hmArrivalsPw';

  let rawRows = [];
  let updatedLabel = '';
  let allData = [];
  let currentCategory = 'all';
  let currentStatus = 'all';
  let sortKey = null;
  let pendingUpload = null;

  /* ---------- password gate ---------- */
  function lock(message) {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    $('app').hidden = true; $('tools').hidden = true; $('confirmBox').hidden = true;
    $('gate').hidden = false;
    $('gateErr').textContent = message || '';
    $('gatePass').value = '';
    $('gatePass').focus();
  }

  async function load(password, fromGate) {
    let res;
    try {
      res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    } catch (e) { lock('Could not reach the server. Check your connection and try again.'); return; }
    if (res.status === 401) { lock(fromGate ? 'Wrong password. Try again.' : ''); return; }
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok || !data) { lock((data && data.error) || 'Something went wrong. Try again.'); return; }
    try { sessionStorage.setItem(KEY, password); } catch (e) { /* ignore */ }
    $('gate').hidden = true; $('app').hidden = false; $('tools').hidden = false;
    const warn = $('warnBar');
    warn.hidden = !data.warning; warn.textContent = data.warning || '';
    $('sourceLabel').textContent = data.source === 'sharepoint' ? 'Live from SharePoint' : 'Built-in data';
    updatedLabel = data.updatedLabel || '';
    setData(data.rows);
  }

  $('gateForm').addEventListener('submit', e => { e.preventDefault(); load($('gatePass').value, true); });

  /* ---------- data + table ---------- */
  function setData(rows) {
    rawRows = rows;
    allData = rows.map(r => S.derive(r));
    $('kTotal').textContent = allData.length;
    $('kDel').textContent = allData.filter(d => d.Status === 'Delivered').length;
    $('kTr').textContent = allData.filter(d => d.Status === 'In Transit').length;
    $('kIss').textContent = allData.filter(d => d.Status === 'Delayed' || d.Status === 'Not Manifested').length;
    $('updatedLabel').textContent = updatedLabel;
    applyView();
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  function applyView() {
    const q = $('searchInput').value.toLowerCase();
    const data = allData.filter(d =>
      (currentCategory === 'all' || d.Category === currentCategory) &&
      (currentStatus === 'all' || d.Status === currentStatus) &&
      (!q || d.Items.toLowerCase().includes(q) || d.Supplier.toLowerCase().includes(q) || d.POD.toLowerCase().includes(q)));
    if (sortKey === 'eta') data.sort((a, b) => (a._eta ?? 9e15) - (b._eta ?? 9e15));
    if (sortKey === 'etd') data.sort((a, b) => (a._etd ?? 9e15) - (b._etd ?? 9e15));
    if (sortKey === 'supplier') data.sort((a, b) => a.Supplier.localeCompare(b.Supplier));
    renderTable(data);
  }

  function renderTable(data) {
    $('tableBody').innerHTML = data.map((item, idx) => {
      const hasRemarks = item.Remarks.trim().length > 0;
      return `<tr>
        <td><strong>${escapeHtml(item.Items)}</strong></td>
        <td><span class="category-badge category-${item.Category.toLowerCase()}">${item.Category}</span></td>
        <td>${escapeHtml(item.Supplier)}</td>
        <td><span class="status-badge status-${item.Status.toLowerCase().replace(/\s+/g, '-')}">${item.Status}</span></td>
        <td><div style="font-size: 13px; font-weight: 600; color: #2d3436;">${item.ETD || '—'}</div></td>
        <td><div style="font-size: 13px; font-weight: 600; color: #2d3436;">${item.ETA || '—'}</div></td>
        <td>${escapeHtml(item.POD)}</td>
        <td style="text-align: center;">
          <span class="remarks-icon ${hasRemarks ? 'has-remarks' : ''}" data-idx="${idx}" title="${hasRemarks ? 'View notes' : 'View details'}" style="cursor: pointer;">${hasRemarks ? '📝' : '◦'}</span>
        </td>
      </tr>`;
    }).join('');
    window.currentTableData = data;
  }

  $('tableBody').addEventListener('click', e => {
    const el = e.target.closest('[data-idx]');
    if (el) openModal(+el.dataset.idx);
  });

  function openModal(idx) {
    const item = window.currentTableData[idx];
    $('modalBody').innerHTML = `
      <div class="remark-section"><div class="remark-section-label">📦 Item</div><p><strong>${escapeHtml(item.Items)}</strong></p></div>
      <div class="remark-section"><div class="remark-section-label">🏢 Supplier</div><p>${escapeHtml(item.Supplier) || '—'}</p></div>
      <div class="remark-section"><div class="remark-section-label">📍 Port of Destination</div><p>${escapeHtml(item.POD) || '—'}</p></div>
      <div class="remark-section"><div class="remark-section-label">🚢 Bill of Lading</div><p style="font-family: monospace; font-size: 13px;">${escapeHtml(item.BL) || '—'}</p></div>
      <div class="remark-section"><div class="remark-section-label">📋 Notes & Updates</div><p>${escapeHtml(item.Remarks).replace(/\n/g, '<br>') || '—'}</p></div>
      <div class="remark-section"><div class="remark-section-label">📅 Timeline</div>
        <p><strong>ETD (Dispatch):</strong> ${item.ETD || 'Not yet estimated'}<br>
           <strong>ETA (Warehouse):</strong> ${item.ETA || 'Not yet estimated'}<br>
           ${item.ProjectedArrival ? `<span class="projected-arrival"><strong>📍 Projected Arrival:</strong> ${item.ProjectedArrival}</span>` : ''}</p></div>
      <div class="remark-section"><div class="remark-section-label">✅ Current Status</div>
        <p><span class="status-badge status-${item.Status.toLowerCase().replace(/\s+/g, '-')}">${item.Status}</span></p></div>`;
    $('remarksModal').classList.add('active');
  }
  window.closeModal = () => $('remarksModal').classList.remove('active');
  $('remarksModal').addEventListener('click', e => { if (e.target === $('remarksModal')) window.closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeModal(); });

  $('searchInput').addEventListener('input', applyView);
  document.querySelectorAll('[data-category]').forEach(btn => btn.addEventListener('click', function () {
    document.querySelectorAll('[data-category]').forEach(b => b.classList.remove('active'));
    this.classList.add('active'); currentCategory = this.dataset.category; applyView();
  }));
  document.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', function () {
    document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
    this.classList.add('active'); currentStatus = this.dataset.status; applyView();
  }));
  $('sortETA').addEventListener('click', () => { sortKey = 'eta'; applyView(); });
  $('sortETD').addEventListener('click', () => { sortKey = 'etd'; applyView(); });
  $('sortSupplier').addEventListener('click', () => { sortKey = 'supplier'; applyView(); });

  /* ---------- template download + upload preview ---------- */
  const say = text => { $('toolMsg').textContent = text; };

  function downloadTemplate() {
    const dateCell = ts => ts == null ? '' : ts / 86400000 + 25569;
    const aoa = [S.HEADERS].concat(rawRows.map(r => [
      r.Supplier, r.Items, r.Category, r.Terms, r.CNTR, r.BL, dateCell(S.toTs(r.ETD)), dateCell(S.toTs(r.ETA)), r.POD, S.cleanRemark(r.Remarks)
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let i = 1; i < aoa.length; i++) ['G', 'H'].forEach(c => {
      const cell = ws[c + (i + 1)];
      if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = 'dd mmm yyyy'; }
    });
    ws['!cols'] = [26, 46, 14, 10, 8, 28, 13, 13, 20, 50].map(w => ({ wch: w }));
    const notes = XLSX.utils.aoa_to_sheet([
      ['How to use this template'],
      ['1. Edit the Shipments sheet. One row per shipment. Keep the header row as it is.'],
      ['2. Category must be one of: Packaging, Food, Merchandise, Others.'],
      ['3. ETD and ETA are dates (for example 20 Sep 2026). Leave ETA empty if it is not known yet.'],
      ['4. Remarks: type DELIVERED once received, NOT MANIFESTED if not yet manifested. Any other text is shown as a note.'],
      ['5. Status is worked out by the page. A shipment that is not delivered and whose ETA is before today becomes Delayed.'],
      ['6. Save the file in the shared SharePoint location. The dashboard reads it from there.']
    ]);
    notes['!cols'] = [{ wch: 110 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shipments');
    XLSX.utils.book_append_sheet(wb, notes, 'Notes');
    XLSX.writeFile(wb, 'HM_Arrivals_Template.xlsx');
    say('Template downloaded.');
  }

  $('tplBtn').addEventListener('click', downloadTemplate);
  $('upBtn').addEventListener('click', () => $('fileIn').click());
  $('fileIn').addEventListener('change', async function () {
    const file = this.files[0]; this.value = '';
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const res = S.parseWorkbook(XLSX, wb, rawRows);
      if (!res.rows.length) { say('No shipment rows found. Use the template and keep its header row.'); return; }
      pendingUpload = res.rows;
      const warn = [];
      if (res.unknownCat) warn.push(res.unknownCat + ' without a valid Category (set to Others)');
      if (res.noDate) warn.push(res.noDate + ' without an ETD');
      $('confirmText').textContent = 'Preview ' + res.rows.length + ' shipments from "' + file.name + '" on this screen? It is not saved. Reloading shows the saved data again.' + (warn.length ? ' Check: ' + warn.join('; ') + '.' : '');
      $('confirmYes').textContent = 'Preview';
      $('confirmBox').hidden = false;
    } catch (e) { say('Could not read that file. Upload an .xlsx file made from the template.'); }
  });
  $('confirmYes').addEventListener('click', () => {
    $('confirmBox').hidden = true;
    if (pendingUpload) { updatedLabel = S.fmtTs(S.todayTs()) + ' (preview)'; setData(pendingUpload); say('Showing the uploaded file on this screen only.'); }
    pendingUpload = null;
  });
  $('confirmNo').addEventListener('click', () => { pendingUpload = null; $('confirmBox').hidden = true; say(''); });

  /* ---------- boot ---------- */
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (saved) load(saved, false); else lock('');
})();
