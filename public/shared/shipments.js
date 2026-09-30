/* Shared by the browser (upload preview, table) and the Netlify function (SharePoint read). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shipments = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CATEGORIES = ['Packaging', 'Food', 'Merchandise', 'Others'];
  const HEADERS = ['Supplier', 'Items', 'Category', 'Terms', 'CNTR', 'BL', 'ETD', 'ETA', 'POD', 'Remarks'];
  const DELAY_DAYS = 14; // Delayed shipments: projected arrival = ETA + 14 days
  const DAY = 86400000;

  function fmtTs(ts) {
    if (ts == null) return '';
    const d = new Date(ts);
    return String(d.getUTCDate()).padStart(2, '0') + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function toTs(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'number') return Math.floor(v - 25569) * DAY; // Excel serial date
    const s = String(v).trim();
    if (!s || /^nan$/i.test(s) || s === '-') return null;
    const yr = y => (String(y).length === 2 ? 2000 + +y : +y);
    let m = s.match(/^(\d{1,2})[ \-\/]([A-Za-z]{3})[A-Za-z]*[ \-\/,]*(\d{2}|\d{4})$/);
    if (m) {
      const mi = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
      if (mi >= 0) return Date.UTC(yr(m[3]), mi, +m[1]);
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) { // month/day/year (as exported from Excel); day/month/year when the first number cannot be a month
      const a = +m[1], b = +m[2];
      return a > 12 ? Date.UTC(+m[3], b - 1, a) : Date.UTC(+m[3], a - 1, b);
    }
    return null;
  }
  function todayTs() {
    const n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function isDateText(s) { return toTs(String(s).trim()) != null && !/[A-Za-z]{4,}/.test(String(s)); }
  const CATEGORY_RULES = [
    ['Packaging', /(CUP|NAPKIN|BAG|BOX|FILTER|VALVE|PACK|SLEEVE|LID|STRAW|CARTON)/i],
    ['Food', /(BEANS|MILK|MATCHA|TEA\b|COFFEE SACHET|SACHET|CORN FLAKES|PREMIX|COFFEE\b)/i],
    ['Merchandise', /(MUG|STANLEY|BOTTLE|TUMBLER)/i]
  ];
  function inferCategory(items) {
    for (const [cat, re] of CATEGORY_RULES) if (re.test(items)) return cat;
    return 'Others';
  }
  function cleanRemark(v) {
    if (v == null) return '';
    if (typeof v === 'number') return v > 30000 ? '' : String(v); // a date cell, not a note
    const s = String(v).trim();
    return /^nan$/i.test(s) || isDateText(s) ? '' : s; // a bare date is not a note
  }

  /* Raw row -> display row with status and projected arrival. */
  function derive(r, today) {
    today = today == null ? todayTs() : today;
    const etd = toTs(r.ETD), eta = toTs(r.ETA);
    const rem = cleanRemark(r.Remarks);
    const u = rem.toUpperCase();
    let status;
    if (u.startsWith('DELIVERED')) status = 'Delivered';
    else if (u.includes('NOT MANIFESTED')) status = 'Not Manifested';
    else if (u.includes('NOT DISCHARGE') || u.includes('DELAY')) status = 'Delayed';
    else status = 'In Transit';
    // Delayed = not delivered and ETA already before today
    if (eta != null && eta < today && (status === 'In Transit' || status === 'Delayed')) status = 'Delayed';
    // Only delayed shipments get a projected arrival
    const projected = status === 'Delayed' && eta != null ? fmtTs(eta + DELAY_DAYS * DAY) : '';
    return {
      Items: String(r.Items || '').trim(), Supplier: String(r.Supplier || '').trim(),
      Category: CATEGORIES.includes(r.Category) ? r.Category : 'Others',
      Terms: r.Terms || '', CNTR: r.CNTR || '', BL: r.BL ? String(r.BL).trim() : '',
      ETD: fmtTs(etd), ETA: fmtTs(eta), _etd: etd, _eta: eta,
      POD: String(r.POD || '').trim(), Status: status, ProjectedArrival: projected,
      Remarks: rem
    };
  }

  /* Sheet rows (from XLSX.utils.sheet_to_json, raw:true) -> raw shipment rows. `known` = rows used to fill a missing Category by BL/Items. */
  function parseRows(sheetRows, known) {
    const byKey = new Map((known || []).map(r => [r.BL || r.Items, r]));
    const rows = []; let unknownCat = 0, noDate = 0;
    sheetRows.forEach(row => {
      const o = {};
      Object.keys(row).forEach(k => { o[k.trim().toLowerCase()] = row[k]; });
      const items = String(o.items || '').replace(/\|\s*$/, '').trim();
      if (!items) return; // month labels, #REF! and stray number rows have no item
      const bl = o.bl == null || /^nan$/i.test(String(o.bl)) ? '' : String(o.bl).trim();
      let cat = CATEGORIES.find(c => c.toLowerCase() === String(o.category || '').trim().toLowerCase());
      if (!cat) { const prev = byKey.get(bl) || byKey.get(items); cat = prev ? prev.Category : inferCategory(items); if (!prev) unknownCat++; }
      const etd = toTs(o.etd), eta = toTs(o.eta);
      if (!bl && etd == null && eta == null) return; // stray line with no shipment details
      if (etd == null) noDate++;
      rows.push({
        Supplier: String(o.supplier || '').trim(), Items: items, Category: cat, Terms: String(o.terms || '').trim(),
        CNTR: String(o.cntr == null ? '' : o.cntr).trim(), BL: bl, ETD: fmtTs(etd), ETA: fmtTs(eta),
        POD: String(o.pod || '').trim(), Remarks: cleanRemark(o.remarks)
      });
    });
    return { rows, unknownCat, noDate };
  }

  function parseWorkbook(XLSX, workbook, known) {
    const name = workbook.SheetNames.find(n => /shipment/i.test(n)) || workbook.SheetNames[0];
    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true });
    const hi = aoa.findIndex(r => r.some(c => String(c).trim().toLowerCase() === 'items') && r.some(c => String(c).trim().toLowerCase() === 'bl'));
    if (hi < 0) return { rows: [], unknownCat: 0, noDate: 0 };
    const keys = aoa[hi].map(c => String(c).trim());
    const sheetRows = aoa.slice(hi + 1).map(r => { const o = {}; keys.forEach((k, i) => { if (k) o[k] = r[i]; }); return o; });
    return parseRows(sheetRows, known);
  }

  return { MONTHS, CATEGORIES, HEADERS, DELAY_DAYS, fmtTs, toTs, todayTs, cleanRemark, derive, parseRows, parseWorkbook };
});
