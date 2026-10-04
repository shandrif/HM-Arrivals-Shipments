(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = s => clean(s).toLowerCase();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());

// ---------- stores / area managers (from the built-in mapping) ----------
const MAP = (window.DEFAULT_MAPPING || []).filter(r => r.am && r.code);
const AMS = [...new Set(MAP.map(r => r.am))].sort();
const storesOf = am => MAP.filter(r => r.am === am);
const storeByCode = c => MAP.find(r => r.code === c);
const storeLabel = r => `${r.code} · ${r.branch}`;

// ---------- storage ----------
// NOTE: data lives in this browser (localStorage). Use Backup / Restore to move it between devices.
const KEY = 'hmVisits', AUTH = 'hmVisitsAdmin';
let visits = [];
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
try { visits = JSON.parse(lsGet(KEY) || '[]'); if (!Array.isArray(visits)) visits = []; } catch (e) { visits = []; }
const save = () => { if (!lsSet(KEY, JSON.stringify(visits))) toast('Could not save in this browser (storage blocked or full).'); };

// ---------- admin password (SHA-256 + salt, kept in this browser) ----------
let isAdmin = false;
try { isAdmin = sessionStorage.getItem(AUTH) === '1'; } catch (e) {}
async function hashPw(pw, salt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pw));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const getCred = () => { try { return JSON.parse(lsGet('hmVisitsCred') || 'null'); } catch (e) { return null; } };
async function setPassword(pw) { const salt = uid() + uid(); lsSet('hmVisitsCred', JSON.stringify({ salt, hash: await hashPw(pw, salt) })); }
async function checkPassword(pw) { const c = getCred(); return !!c && (await hashPw(pw, c.salt)) === c.hash; }
function setAdmin(on) {
  isAdmin = on; try { on ? sessionStorage.setItem(AUTH, '1') : sessionStorage.removeItem(AUTH); } catch (e) {}
  $('btnAdmin').textContent = on ? '🔓 Admin (on)' : '🔒 Admin';
  $('btnAdd').hidden = !on; $('btnUploadAsk').hidden = !on;
  $('sub').textContent = on ? 'Admin mode: you can schedule and edit visits' : 'Visit calendar';
  render();
}

// ---------- status ----------
function progress(v) {
  let t = 0, d = 0;
  for (const k of v.tasks) { t++; if (k.done) d++; }
  return { t, d };
}
function statusOf(v) {
  const { t, d } = progress(v), past = v.date < todayISO();
  if (t && d === t) return 'done';
  if (past) return 'over';
  return d > 0 ? 'part' : 'open';
}
const STATUS_LABEL = { open: 'Scheduled', part: 'In progress', done: 'Completed', over: 'Overdue' };

// ---------- ui helpers ----------
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 5000); }
function notice(msg) { $('notice').hidden = !msg; $('notice').textContent = msg || ''; }
function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; requestAnimationFrame(() => $('modal').classList.add('open')); $('modalBox').focus(); }
function closeModal() { $('modal').classList.remove('open'); $('modal').hidden = true; }
$('modalClose').onclick = closeModal;
$('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
function saveWB(wb, name) { XLSX.writeFile(wb, name); }

// ---------- state ----------
const now = new Date();
const ui = { y: now.getFullYear(), m: now.getMonth(), am: '', tab: 'calendar', dash: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`, dashAm: '', charts: {} };

// ---------- calendar ----------
function chipText(v) { const s = storeByCode(v.code); return `${v.am.split(' ')[0]} · ${s ? s.branch : v.store}`; }
function renderCalendar() {
  $('monthTitle').textContent = `${MONTHS[ui.m]} ${ui.y}`;
  const first = new Date(ui.y, ui.m, 1), start = new Date(ui.y, ui.m, 1 - first.getDay()), t = todayISO();
  const list = visits.filter(v => !ui.am || v.am === ui.am);
  let h = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = iso(d);
    if (i >= 35 && d.getMonth() !== ui.m) break;
    const vs = list.filter(v => v.date === k).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    h += `<button type="button" class="day${d.getMonth() !== ui.m ? ' out' : ''}${k === t ? ' today' : ''}" data-d="${k}" aria-label="${k}, ${vs.length} visits"><span class="n">${d.getDate()}</span>` +
      vs.slice(0, 3).map(v => `<span class="chip s-${statusOf(v)}" title="${esc(v.am + ' – ' + v.store)}">${esc(chipText(v))}</span>`).join('') +
      (vs.length > 3 ? `<span class="more-n">+${vs.length - 3} more</span>` : '') + '</button>';
  }
  $('calGrid').innerHTML = h;
}
$('calGrid').onclick = e => { const b = e.target.closest('.day'); if (b) dayModal(b.dataset.d); };
$('prevM').onclick = () => { ui.m--; if (ui.m < 0) { ui.m = 11; ui.y--; } renderCalendar(); };
$('nextM').onclick = () => { ui.m++; if (ui.m > 11) { ui.m = 0; ui.y++; } renderCalendar(); };
$('todayM').onclick = () => { ui.y = now.getFullYear(); ui.m = now.getMonth(); renderCalendar(); };
$('amFilter').onchange = e => { ui.am = e.target.value; renderCalendar(); };
function fillAmSelects() {
  const opts = '<option value="">All area managers</option>' + AMS.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  $('amFilter').innerHTML = opts; $('dashAm').innerHTML = opts;
}

// ---------- day + visit modals ----------
function dayModal(date) {
  const vs = visits.filter(v => v.date === date && (!ui.am || v.am === ui.am));
  openModal(`<h2>${date}</h2><p class="muted small">${vs.length} visit${vs.length === 1 ? '' : 's'}</p>
    <div class="vlist">${vs.map(v => { const p = progress(v), s = statusOf(v); return `<div class="vcard s-${s}" data-id="${v.id}" tabindex="0"><b>${esc(v.am)}</b> → ${esc(v.store)}${v.time ? ' · ' + esc(v.time) : ''}<br><span class="small muted">${p.d}/${p.t} tasks done · ${STATUS_LABEL[s]}</span></div>`; }).join('') || '<p class="muted">No visits on this day.</p>'}</div>
    ${isAdmin ? `<div class="frow"><button class="btn primary" id="addHere" type="button">+ Schedule visit on this day</button></div>` : ''}`);
  $('modalBody').querySelectorAll('.vcard').forEach(c => { c.onclick = () => visitModal(c.dataset.id); c.onkeydown = e => { if (e.key === 'Enter') visitModal(c.dataset.id); }; });
  if ($('addHere')) $('addHere').onclick = () => formModal(null, date);
}
function visitModal(id) {
  const v = visits.find(x => x.id === id); if (!v) return closeModal();
  const s = statusOf(v), p = progress(v);
  openModal(`<h2>${esc(v.store)}</h2>
    <p><span class="pill s-${s}">${STATUS_LABEL[s]}</span> <span class="muted">${esc(v.am)} · ${v.date}${v.time ? ' ' + esc(v.time) : ''} · ${p.d}/${p.t} tasks</span></p>
    ${v.notes ? `<p>${esc(v.notes)}</p>` : ''}
    <h3>Tasks <span class="muted small">tick to mark done</span></h3>
    <div id="vt">${v.tasks.map(k => `<div class="vtask"><label><input type="checkbox" data-t="${k.id}"${k.done ? ' checked' : ''}><span class="${k.done ? 'done-t' : ''}">${esc(k.title)}</span></label>
      ${k.subs.length ? `<div class="subs">${k.subs.map(x => `<label><input type="checkbox" data-t="${k.id}" data-s="${x.id}"${x.done ? ' checked' : ''}><span class="${x.done ? 'done-t' : ''}">${esc(x.title)}</span></label>`).join('')}</div>` : ''}</div>`).join('') || '<p class="muted">No tasks assigned.</p>'}</div>
    <div class="frow">${isAdmin ? '<button class="btn" id="vEdit" type="button">Edit</button><button class="btn danger" id="vDel" type="button">Delete</button>' : ''}<button class="btn" id="vBack" type="button">Back</button></div>`);
  $('vt').onchange = e => {
    const c = e.target; if (!c.dataset.t) return;
    const k = v.tasks.find(x => x.id === c.dataset.t); if (!k) return;
    if (c.dataset.s) {
      const x = k.subs.find(y => y.id === c.dataset.s); x.done = c.checked;
      k.done = k.subs.length > 0 && k.subs.every(y => y.done) ? true : (c.checked ? k.done : false);
    } else { k.done = c.checked; k.subs.forEach(y => y.done = c.checked); }
    save(); renderAll(); visitModal(id);
  };
  $('vBack').onclick = () => dayModal(v.date);
  if (isAdmin) {
    $('vEdit').onclick = () => formModal(v);
    $('vDel').onclick = () => { if (confirm('Delete this visit and its tasks?')) { visits = visits.filter(x => x.id !== id); save(); renderAll(); dayModal(v.date); } };
  }
}
function taskRowHtml(k) {
  return `<div class="tk" data-id="${k.id}"><div class="trow"><input type="checkbox" class="td" title="Done"${k.done ? ' checked' : ''}><input type="text" class="tt" placeholder="Task" value="${esc(k.title)}"><button type="button" class="mini add as">+ sub-task</button><button type="button" class="mini rt" aria-label="Remove task">✕</button></div>${k.subs.map(subRowHtml).join('')}</div>`;
}
const subRowHtml = x => `<div class="srow" data-id="${x.id}"><input type="checkbox" class="sd" title="Done"${x.done ? ' checked' : ''}><input type="text" class="st" placeholder="Sub-task" value="${esc(x.title)}"><button type="button" class="mini rs" aria-label="Remove sub-task">✕</button></div>`;
function formModal(v, date) {
  const cur = v || { id: '', date: date || todayISO(), time: '', am: ui.am || AMS[0] || '', code: '', store: '', notes: '', tasks: [] };
  openModal(`<h2>${v ? 'Edit visit' : 'Schedule visit'}</h2>
  <div class="vf">
    <div class="row">
      <label>Area manager<select id="fAm">${AMS.map(a => `<option${a === cur.am ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
      <label>Store<select id="fStore"></select><span class="chk"><input type="checkbox" id="fAll"> Show all stores</span></label>
    </div>
    <div class="row">
      <label>Date<input type="date" id="fDate" value="${cur.date}"></label>
      <label>Time (optional)<input type="time" id="fTime" value="${esc(cur.time)}"></label>
    </div>
    <label>Notes<textarea id="fNotes" rows="2">${esc(cur.notes)}</textarea></label>
    <div><b>Tasks</b> <span class="muted small">add any tasks and sub-tasks you need</span></div>
    <div class="taskbox" id="fTasks">${cur.tasks.map(taskRowHtml).join('')}</div>
    <div><button class="btn" type="button" id="fAddTask">+ Add task</button></div>
    <div class="gate-msg small" id="fMsg" role="alert" style="color:var(--high);font-weight:600"></div>
    <div class="frow"><button class="btn" type="button" id="fCancel">Cancel</button><button class="btn primary" type="button" id="fSave">Save visit</button></div>
  </div>`);
  const fillStores = () => {
    const am = $('fAm').value, all = $('fAll').checked, sel = v && v.am === am ? v.code : '';
    const list = all ? MAP.slice().sort((a, b) => a.branch.localeCompare(b.branch)) : storesOf(am);
    $('fStore').innerHTML = list.map(r => `<option value="${esc(r.code)}"${r.code === (sel || cur.code) ? ' selected' : ''}>${esc(storeLabel(r))}</option>`).join('');
  };
  fillStores(); $('fAm').onchange = () => { cur.code = ''; fillStores(); }; $('fAll').onchange = fillStores;
  const box = $('fTasks');
  const newTask = () => { const k = { id: uid(), title: '', done: false, subs: [] }; box.insertAdjacentHTML('beforeend', taskRowHtml(k)); box.lastElementChild.querySelector('.tt').focus(); };
  $('fAddTask').onclick = newTask;
  if (!cur.tasks.length) newTask();
  box.onclick = e => {
    const tk = e.target.closest('.tk'); if (!tk) return;
    if (e.target.closest('.rt')) tk.remove();
    else if (e.target.closest('.rs')) e.target.closest('.srow').remove();
    else if (e.target.closest('.as')) { tk.insertAdjacentHTML('beforeend', subRowHtml({ id: uid(), title: '', done: false })); tk.lastElementChild.querySelector('.st').focus(); }
  };
  $('fCancel').onclick = () => v ? visitModal(v.id) : closeModal();
  $('fSave').onclick = () => {
    const am = $('fAm').value, code = $('fStore').value, date = $('fDate').value, s = storeByCode(code);
    if (!am || !code || !date) { $('fMsg').textContent = 'Pick an area manager, a store and a date.'; return; }
    const tasks = [...box.querySelectorAll('.tk')].map(tk => ({
      id: tk.dataset.id, title: clean(tk.querySelector('.tt').value), done: tk.querySelector('.td').checked,
      subs: [...tk.querySelectorAll('.srow')].map(r => ({ id: r.dataset.id, title: clean(r.querySelector('.st').value), done: r.querySelector('.sd').checked })).filter(x => x.title)
    })).filter(k => k.title);
    const rec = { id: v ? v.id : uid(), date, time: $('fTime').value, am, code, store: s ? s.branch : code, notes: clean($('fNotes').value), tasks };
    if (v) visits[visits.findIndex(x => x.id === v.id)] = rec; else visits.push(rec);
    save(); ui.y = +date.slice(0, 4); ui.m = +date.slice(5, 7) - 1; renderAll(); toast('Visit saved.'); dayModal(date);
  };
}

// ---------- template + upload ----------
const HEAD = ['Visit Date (YYYY-MM-DD)', 'Time (optional)', 'Store Code', 'Store Name', 'Area Manager', 'Task', 'Sub-task (optional)', 'Notes'];
function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const rows = [HEAD].concat(MAP.slice().sort((a, b) => a.am.localeCompare(b.am) || a.branch.localeCompare(b.branch)).map(r => ['', '', r.code, r.branch, r.am, '', '', '']));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 24 }, { wch: 30 }, { wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Visits');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['How to use'],
    ['1. Every store and its area manager are already filled in. Do not retype names.'],
    ['2. Fill Visit Date (and Task) on the rows of the stores to be visited. Delete rows you do not need.'],
    ['3. Several tasks for one visit: copy the row and change the Task. Sub-tasks: copy the row, keep the same Task, change Sub-task.'],
    ['4. To change who visits a store, replace Area Manager on that row with another name from the "Area Managers" sheet.'],
    ['5. Save and use Upload schedule in the web app. Rows without a date are ignored.']
  ]), 'Instructions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Area Managers']].concat(AMS.map(a => [a]))), 'Area Managers');
  saveWB(wb, 'Area_Manager_Visit_Template.xlsx');
}
function toISODate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : ''; }
  const s = clean(v); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return '';
}
const toTime = v => { if (v == null || v === '') return ''; if (typeof v === 'number') { const t = Math.round(v * 1440); return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; } const m = clean(v).match(/^(\d{1,2}):(\d{2})/); return m ? `${pad(m[1])}:${m[2]}` : ''; };
async function handleUpload(file) {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets.Visits || wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const hi = aoa.findIndex(r => r.some(c => /visit date/i.test(c)));
    if (hi < 0) throw new Error('Could not find the "Visit Date" column. Download the template and use its layout.');
    const h = aoa[hi].map(norm), col = re => h.findIndex(x => re.test(x));
    const ci = { date: col(/visit date/), time: col(/^time/), code: col(/store code|^code$/), store: col(/store name|branch/), am: col(/area manager/), task: col(/^task/), sub: col(/sub/), notes: col(/notes/) };
    const groups = new Map(); let skipped = 0, rowsUsed = 0;
    const amByNorm = new Map(AMS.map(a => [norm(a), a]));
    for (const r of aoa.slice(hi + 1)) {
      const date = toISODate(r[ci.date]); if (!date) { if (clean(r[ci.date])) skipped++; continue; }
      const code = ci.code >= 0 ? clean(r[ci.code]).toUpperCase() : '';
      let s = storeByCode(code) || MAP.find(x => norm(x.branch) === norm(r[ci.store]));
      const am = amByNorm.get(norm(r[ci.am])) || (s && s.am);
      if (!s || !am) { skipped++; continue; }
      const key = [date, s.code, am].join('|');
      let g = groups.get(key); if (!g) groups.set(key, g = { id: uid(), date, time: '', am, code: s.code, store: s.branch, notes: '', tasks: [] });
      if (ci.time >= 0 && !g.time) g.time = toTime(r[ci.time]);
      if (ci.notes >= 0 && !g.notes) g.notes = clean(r[ci.notes]);
      const t = clean(r[ci.task]), sub = ci.sub >= 0 ? clean(r[ci.sub]) : '';
      if (t) { let k = g.tasks.find(x => norm(x.title) === norm(t)); if (!k) g.tasks.push(k = { id: uid(), title: t, done: false, subs: [] }); if (sub && !k.subs.some(x => norm(x.title) === norm(sub))) k.subs.push({ id: uid(), title: sub, done: false }); }
      rowsUsed++;
    }
    const incoming = [...groups.values()];
    if (!incoming.length) throw new Error('No rows with a visit date and a known store were found.');
    let added = 0, merged = 0;
    for (const g of incoming) {
      const ex = visits.find(v => v.date === g.date && v.code === g.code && v.am === g.am);
      if (!ex) { visits.push(g); added++; continue; }
      for (const t of g.tasks) { let k = ex.tasks.find(x => norm(x.title) === norm(t.title)); if (!k) ex.tasks.push(t); else for (const s of t.subs) if (!k.subs.some(x => norm(x.title) === norm(s.title))) k.subs.push(s); }
      if (!ex.time) ex.time = g.time; if (!ex.notes) ex.notes = g.notes; merged++;
    }
    save(); renderAll();
    const d0 = incoming.map(g => g.date).sort()[0]; ui.y = +d0.slice(0, 4); ui.m = +d0.slice(5, 7) - 1; renderCalendar();
    notice(`Upload done: ${added} new visit${added === 1 ? '' : 's'}, ${merged} merged into existing visits${skipped ? `, ${skipped} row${skipped === 1 ? '' : 's'} skipped (bad date or unknown store)` : ''}.`);
  } catch (err) { notice('Upload failed: ' + err.message); }
}
$('btnTemplate').onclick = downloadTemplate;
$('btnUploadAsk').onclick = () => $('fileUpload').click();
$('fileUpload').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) handleUpload(f); };
$('btnAdd').onclick = () => formModal(null);

// ---------- admin login / password ----------
function gateModal(msg) {
  const first = !getCred();
  openModal(`<div class="gate-box"><h2>${first ? 'Create admin password' : 'Admin password'}</h2>
    <p class="muted small">${first ? 'Choose a password (at least 6 characters). It protects scheduling and the admin dashboard in this browser.' : 'Enter the admin password to schedule visits and open the dashboard.'}</p>
    <input type="password" id="gPw" placeholder="Password" autocomplete="${first ? 'new-password' : 'current-password'}">
    ${first ? '<input type="password" id="gPw2" placeholder="Repeat password" autocomplete="new-password">' : ''}
    <button class="btn primary" id="gGo" type="button" style="justify-content:center">${first ? 'Save and sign in' : 'Sign in'}</button>
    <div class="small" id="gMsg" role="alert" style="color:var(--high);font-weight:600;min-height:18px">${esc(msg || '')}</div></div>`);
  $('gPw').focus();
  const go = async () => {
    const pw = $('gPw').value;
    if (first) {
      if (pw.length < 6) { $('gMsg').textContent = 'Use at least 6 characters.'; return; }
      if (pw !== $('gPw2').value) { $('gMsg').textContent = 'The two passwords do not match.'; return; }
      await setPassword(pw);
    } else if (!(await checkPassword(pw))) { $('gMsg').textContent = 'Wrong password.'; return; }
    closeModal(); setAdmin(true); toast('Signed in as admin.');
  };
  $('gGo').onclick = go; $('modalBody').onkeydown = e => { if (e.key === 'Enter') go(); };
}
function changePwModal() {
  openModal(`<div class="gate-box"><h2>Change password</h2>
    <input type="password" id="cOld" placeholder="Current password" autocomplete="current-password">
    <input type="password" id="cNew" placeholder="New password (6+ characters)" autocomplete="new-password">
    <button class="btn primary" id="cGo" type="button" style="justify-content:center">Change password</button>
    <div class="small" id="cMsg" role="alert" style="color:var(--high);font-weight:600;min-height:18px"></div></div>`);
  $('cGo').onclick = async () => {
    if (!(await checkPassword($('cOld').value))) { $('cMsg').textContent = 'Current password is wrong.'; return; }
    if ($('cNew').value.length < 6) { $('cMsg').textContent = 'Use at least 6 characters.'; return; }
    await setPassword($('cNew').value); closeModal(); toast('Password changed.');
  };
}
$('btnAdmin').onclick = () => { if (isAdmin) { setAdmin(false); if (ui.tab === 'dashboard') setTab('calendar'); toast('Signed out.'); } else gateModal(); };
$('btnLogout').onclick = $('btnAdmin').onclick;
$('btnPw').onclick = changePwModal;

// ---------- tabs ----------
function setTab(t) {
  if (t === 'dashboard' && !isAdmin) { gateModal(); return; }
  ui.tab = t;
  document.querySelectorAll('#tabs button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  $('tab-calendar').hidden = t !== 'calendar'; $('tab-dashboard').hidden = t !== 'dashboard';
  render();
}
$('tabs').onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); };

// ---------- admin dashboard ----------
function monthVisits() { return visits.filter(v => v.date.startsWith(ui.dash) && (!ui.dashAm || v.am === ui.dashAm)); }
function amStats(vs) {
  return AMS.filter(a => !ui.dashAm || a === ui.dashAm).map(a => {
    const mine = vs.filter(v => v.am === a);
    let t = 0, d = 0, done = 0, over = 0;
    mine.forEach(v => { const p = progress(v), s = statusOf(v); t += p.t; d += p.d; if (s === 'done') done++; if (s === 'over') over++; });
    const visited = new Set(mine.map(v => v.code)).size, assigned = storesOf(a).length;
    return { a, visits: mine.length, done, over, t, d, pct: t ? d / t : null, visited, assigned };
  });
}
function renderDashboard() {
  if (!isAdmin) return;
  $('dashMonth').value = ui.dash; $('dashAm').value = ui.dashAm;
  const vs = monthVisits(), st = amStats(vs), cnt = { open: 0, part: 0, done: 0, over: 0 };
  vs.forEach(v => cnt[statusOf(v)]++);
  const T = st.reduce((s, x) => s + x.t, 0), D = st.reduce((s, x) => s + x.d, 0);
  const storesIn = ui.dashAm ? storesOf(ui.dashAm) : MAP, seen = new Set(vs.map(v => v.code));
  const kp = (l, v, s = '') => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('dashKpis').innerHTML = kp('Visits scheduled', vs.length, (n => `${n} area manager${n === 1 ? '' : 's'}`)(new Set(vs.map(v => v.am)).size)) +
    kp('Visits completed', cnt.done, vs.length ? Math.round(cnt.done / vs.length * 100) + '% of visits' : '–') +
    kp('Tasks done', `${D}/${T}`, T ? Math.round(D / T * 100) + '% completion' : 'no tasks') +
    kp('Overdue visits', cnt.over, 'past date, tasks not finished') +
    kp('Store coverage', `${storesIn.filter(s => seen.has(s.code)).length}/${storesIn.length}`, 'stores with a visit this month');
  $('tblAm').innerHTML = '<tr><th>Area manager</th><th class="r">Visits</th><th class="r">Completed</th><th class="r">Overdue</th><th class="r">Tasks done</th><th>Completion</th><th class="r">Stores covered</th></tr>' +
    st.map(x => `<tr><td>${esc(x.a)}</td><td class="r">${x.visits}</td><td class="r">${x.done}</td><td class="r"${x.over ? ' style="color:var(--high);font-weight:700"' : ''}>${x.over}</td><td class="r">${x.d}/${x.t}</td><td><div class="bar" title="${x.pct == null ? 'no tasks' : Math.round(x.pct * 100) + '%'}"><i style="width:${x.pct == null ? 0 : x.pct * 100}%"></i></div></td><td class="r">${x.visited}/${x.assigned}</td></tr>`).join('');
  const attn = vs.filter(v => statusOf(v) === 'over' || (v.date <= todayISO() && statusOf(v) !== 'done')).sort((a, b) => a.date.localeCompare(b.date));
  $('tblAttn').innerHTML = attn.length ? '<tr><th>Date</th><th>Area manager</th><th>Store</th><th>Status</th><th>Open tasks</th></tr>' + attn.map(v => {
    const open = v.tasks.filter(k => !k.done).map(k => k.title).join(', ') || '–';
    return `<tr><td>${v.date}</td><td>${esc(v.am)}</td><td>${esc(v.store)}</td><td><span class="pill s-${statusOf(v)}">${STATUS_LABEL[statusOf(v)]}</span></td><td style="white-space:normal">${esc(open)}</td></tr>`; }).join('') : '<tr><td class="muted">Nothing needs attention.</td></tr>';
  const un = storesIn.filter(s => !seen.has(s.code));
  $('unvisited').innerHTML = un.length ? un.map(s => `<span title="${esc(s.am)}">${esc(storeLabel(s))}</span>`).join('') : 'Every store has a visit scheduled.';
  drawCharts(st, cnt);
}
function drawCharts(st, cnt) {
  Object.values(ui.charts).forEach(c => c.destroy()); ui.charts = {};
  if (typeof Chart === 'undefined') return;
  const col = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const withVisits = st.filter(x => x.visits);
  ui.charts.am = new Chart($('chAm'), { type: 'bar', data: { labels: withVisits.map(x => x.a), datasets: [{ label: '% tasks done', data: withVisits.map(x => x.pct == null ? 0 : Math.round(x.pct * 100)), backgroundColor: '#84c5b2' }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });
  ui.charts.st = new Chart($('chStatus'), { type: 'doughnut', data: { labels: ['Scheduled', 'In progress', 'Completed', 'Overdue'], datasets: [{ data: [cnt.open, cnt.part, cnt.done, cnt.over], backgroundColor: ['#d4b38b', '#e0b84d', '#84c5b2', '#d9776c'] }] }, options: { maintainAspectRatio: false } });
}
$('dashMonth').onchange = e => { if (e.target.value) { ui.dash = e.target.value; renderDashboard(); } };
$('dashAm').onchange = e => { ui.dashAm = e.target.value; renderDashboard(); };
$('btnExport').onclick = () => {
  const rows = [['Date', 'Time', 'Area Manager', 'Store Code', 'Store', 'Status', 'Task', 'Task done', 'Sub-task', 'Sub-task done', 'Notes']];
  monthVisits().sort((a, b) => a.date.localeCompare(b.date)).forEach(v => {
    const base = [v.date, v.time, v.am, v.code, v.store, STATUS_LABEL[statusOf(v)]];
    if (!v.tasks.length) rows.push([...base, '', '', '', '', v.notes]);
    v.tasks.forEach(k => { if (!k.subs.length) rows.push([...base, k.title, k.done ? 'Yes' : 'No', '', '', v.notes]); else k.subs.forEach(s => rows.push([...base, k.title, k.done ? 'Yes' : 'No', s.title, s.done ? 'Yes' : 'No', v.notes])); });
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Visits');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Area manager', 'Visits', 'Completed', 'Overdue', 'Tasks done', 'Tasks total', 'Stores covered', 'Stores assigned']].concat(amStats(monthVisits()).map(x => [x.a, x.visits, x.done, x.over, x.d, x.t, x.visited, x.assigned]))), 'Summary');
  saveWB(wb, `AM_Visits_${ui.dash}.xlsx`);
};
$('btnBackup').onclick = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, visits }, null, 1)], { type: 'application/json' }));
  a.download = `AM_Visits_backup_${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('btnRestoreAsk').onclick = () => $('fileRestore').click();
$('fileRestore').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (!d || !Array.isArray(d.visits)) throw new Error('not a backup file');
    if (!confirm(`Replace the ${visits.length} visits in this browser with ${d.visits.length} from the backup?`)) return;
    visits = d.visits; save(); renderAll(); toast('Backup restored.');
  } catch (err) { toast('Could not restore: ' + err.message); }
};

function render() { if (ui.tab === 'calendar') renderCalendar(); else renderDashboard(); }
function renderAll() { renderCalendar(); if (ui.tab === 'dashboard') renderDashboard(); }

fillAmSelects();
setAdmin(isAdmin);
})();
