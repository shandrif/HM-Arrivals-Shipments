(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = s => clean(s).toLowerCase();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayISO = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
const fmtDate = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };

// ---------- stores / area managers (same mapping the wastage tracker uses) ----------
function loadStores() {
  let rows = null;
  try { const r = JSON.parse(localStorage.getItem('wasteMapping') || 'null'); if (Array.isArray(r) && r.length && r[0].am) rows = r; } catch (e) {}
  rows = rows || window.DEFAULT_MAPPING || [];
  const seen = new Set();
  return rows.filter(r => r.am && (r.code || r.branch)).map(r => ({ code: clean(r.code).toUpperCase(), name: clean(r.branch), am: clean(r.am), city: clean(r.city) }))
    .filter(r => { const k = r.code + '|' + norm(r.name); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.name.localeCompare(b.name));
}
const STORES = loadStores();
const AMS = [...new Set(STORES.map(s => s.am))].sort();
const storeLabel = s => (s.code ? s.code + ' · ' : '') + s.name;
const findStore = (code, name) => STORES.find(s => code && s.code === clean(code).toUpperCase()) || STORES.find(s => name && norm(s.name) === norm(name));

// ---------- persistence ----------
const KEY = 'hmVisits';
let db = { visits: [], pw: null };
try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && Array.isArray(d.visits)) db = { visits: d.visits, pw: d.pw || null }; } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Could not save in this browser (storage blocked/full).'); } }
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 4000); }

// ---------- admin password ----------
let admin = false;
try { admin = sessionStorage.getItem('hmVisitsAdmin') === '1' && !!db.pw; } catch (e) {}
const hash = async (pw, salt) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pw)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
async function setPassword(pw) { const salt = uid(); db.pw = { salt, h: await hash(pw, salt) }; save(); }
async function checkPassword(pw) { return db.pw && (await hash(pw, db.pw.salt)) === db.pw.h; }
function setAdmin(v) {
  admin = v; try { sessionStorage.setItem('hmVisitsAdmin', v ? '1' : '0'); } catch (e) {}
  $('adminState').textContent = v ? 'Admin mode' : 'Viewing only';
  $('btnLogin').hidden = v; $('adminMenu').hidden = !v; $('btnAdd').hidden = !v;
  $('storeInfo').textContent = `${STORES.length} stores · ${AMS.length} area managers`;
  if (!v && state.tab === 'dashboard') showTab('calendar');
  render();
}
function pwDialog(title, fields, onOk) {
  openModal(`<h2>${esc(title)}</h2>${fields.map((f, i) => `<label class="field">${esc(f)}<input type="password" id="pw${i}" autocomplete="off"></label>`).join('')}
    <div id="pwMsg" class="small" style="color:var(--high)" role="alert"></div>
    <div class="row end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pwOk">OK</button></div>`);
  const go = async () => { try { const err = await onOk(fields.map((_, i) => $('pw' + i).value)); if (err) $('pwMsg').textContent = err; else closeModal(); } catch (e) { $('pwMsg').textContent = 'Something went wrong.'; } };
  $('pwOk').onclick = go; $('pw0').focus();
  document.querySelectorAll('#modalCard input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
}
function login() {
  if (!db.pw) return pwDialog('Create the admin password', ['New password (min 6 characters)', 'Repeat password'], async ([a, b]) => {
    if (a.length < 6) return 'Use at least 6 characters.'; if (a !== b) return 'Passwords do not match.';
    await setPassword(a); setAdmin(true); toast('Admin password set. You are logged in.');
  });
  pwDialog('Admin login', ['Password'], async ([a]) => { if (!(await checkPassword(a))) return 'Wrong password.'; setAdmin(true); });
}
function changePw() {
  pwDialog('Change password', ['Current password', 'New password (min 6 characters)'], async ([a, b]) => {
    if (!(await checkPassword(a))) return 'Current password is wrong.'; if (b.length < 6) return 'Use at least 6 characters.';
    await setPassword(b); toast('Password changed.');
  });
}

// ---------- status helpers ----------
const units = v => v.tasks.reduce((a, t) => { const n = t.subs && t.subs.length ? t.subs : [t]; return [a[0] + n.length, a[1] + n.filter(x => x.done).length]; }, [0, 0]);
function taskDone(t) { return t.subs && t.subs.length ? t.subs.every(s => s.done) : !!t.done; }
function visitStatus(v) {
  const [tot, done] = units(v);
  const complete = tot ? done === tot : !!v.done;
  if (complete) return 'done';
  if (v.date < todayISO()) return 'over';
  return done > 0 ? 'prog' : 'planned';
}
const SLABEL = { planned: 'Planned', prog: 'In progress', done: 'Completed', over: 'Overdue' };
const shortAm = a => a.split(' ')[0];

// ---------- state + calendar ----------
const now = new Date();
const state = { y: now.getFullYear(), m: now.getMonth(), am: '', tab: 'calendar', charts: {} };
function monthVisits() {
  const p = `${state.y}-${pad(state.m + 1)}-`;
  return db.visits.filter(v => v.date.startsWith(p) && (!state.am || v.am === state.am)).sort((a, b) => a.date.localeCompare(b.date) || a.am.localeCompare(b.am));
}
function showTab(t) {
  if (t === 'dashboard' && !admin) { toast('Admin login required for the dashboard.'); return login(); }
  state.tab = t;
  document.querySelectorAll('#tabs button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  $('tab-calendar').hidden = t !== 'calendar'; $('tab-dashboard').hidden = t !== 'dashboard';
  render();
}
function render() { $('monthLabel').textContent = `${MONTHS[state.m]} ${state.y}`; if (state.tab === 'calendar') renderCal(); else renderDash(); }
function renderCal() {
  $('calHead').innerHTML = DOW.map(d => `<div>${d}</div>`).join('');
  const first = new Date(state.y, state.m, 1), lead = (first.getDay() + 6) % 7, start = new Date(state.y, state.m, 1 - lead);
  const vs = monthVisits(), byDay = {}; vs.forEach(v => (byDay[v.date] ||= []).push(v));
  const edgeVs = db.visits.filter(v => !state.am || v.am === state.am); edgeVs.forEach(v => { if (!v.date.startsWith(`${state.y}-${pad(state.m + 1)}-`)) (byDay[v.date] ||= []).push(v); });
  const t = todayISO(); let h = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), key = iso(d.getFullYear(), d.getMonth(), d.getDate()), list = byDay[key] || [];
    if (i >= 35 && d.getMonth() !== state.m) break;
    h += `<button class="day${d.getMonth() !== state.m ? ' out' : ''}${key === t ? ' today' : ''}" data-day="${key}" aria-label="${key}, ${list.length} visits"><span class="n">${d.getDate()}</span>` +
      list.slice(0, 3).map(v => `<span class="vchip s-${visitStatus(v)}">${esc(shortAm(v.am))} · ${esc(v.store)}</span>`).join('') +
      (list.length > 3 ? `<span class="more-n">+${list.length - 3} more</span>` : '') + '</button>';
  }
  $('calGrid').innerHTML = h;
}

// ---------- modal ----------
function openModal(html) { $('modalCard').innerHTML = html; $('modal').hidden = false; }
function closeModal() { $('modal').hidden = true; $('modalCard').innerHTML = ''; }
$('modal').addEventListener('click', e => { if (e.target === $('modal') || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

function dayModal(day) {
  const list = db.visits.filter(v => v.date === day && (!state.am || v.am === state.am));
  openModal(`<h2>${fmtDate(day)}</h2><div class="vmeta">${list.length} visit${list.length === 1 ? '' : 's'}</div>
    ${list.map(v => `<div class="vitem"><div class="row"><h4 style="flex:1">${esc(v.store)} <span class="vmeta">${esc(v.code || '')}</span></h4><span class="chip s-${visitStatus(v)}">${SLABEL[visitStatus(v)]}</span></div>
      <div class="vmeta">${esc(v.am)}${units(v)[0] ? ` · ${units(v)[1]}/${units(v)[0]} tasks done` : ''}</div>
      <div class="row" style="margin-top:6px"><button class="btn" data-open="${v.id}">Open</button></div></div>`).join('') || '<p class="muted">No visits on this day.</p>'}
    <div class="row end">${admin ? `<button class="btn primary" data-new="${day}">+ Schedule visit</button>` : ''}<button class="btn" data-close>Close</button></div>`);
}
function visitModal(id) {
  const v = db.visits.find(x => x.id === id); if (!v) return closeModal();
  const taskHtml = v.tasks.map(t => {
    const subs = t.subs || [];
    return `<div class="task${taskDone(t) ? ' done' : ''}"><div class="row"><label style="flex:1"><input type="checkbox" data-t="${t.id}" ${taskDone(t) ? 'checked' : ''}><span class="tt">${esc(t.title)}</span></label>${admin ? `<button class="x" data-delt="${t.id}" title="Remove task" aria-label="Remove task">✕</button>` : ''}</div>
      ${subs.map(s => `<div class="sub${s.done ? ' done' : ''}"><div class="row"><label style="flex:1"><input type="checkbox" data-t="${t.id}" data-s="${s.id}" ${s.done ? 'checked' : ''}><span>${esc(s.title)}</span></label>${admin ? `<button class="x" data-delt="${t.id}" data-dels="${s.id}" title="Remove sub-task" aria-label="Remove sub-task">✕</button>` : ''}</div></div>`).join('')}
      ${admin ? `<div class="addline sub"><input class="mini" placeholder="Add sub-task…" data-addsub="${t.id}"><button class="btn" data-addsubbtn="${t.id}">Add</button></div>` : ''}</div>`;
  }).join('');
  openModal(`<div class="row"><h2 style="flex:1">${esc(v.store)} <span class="vmeta">${esc(v.code || '')}</span></h2><span class="chip s-${visitStatus(v)}">${SLABEL[visitStatus(v)]}</span></div>
    <div class="vmeta">${fmtDate(v.date)} · ${esc(v.am)}</div>${v.notes ? `<p>${esc(v.notes)}</p>` : ''}
    <h3 style="margin:14px 0 4px;font-size:13px">Tasks</h3>${taskHtml || '<p class="muted small">No tasks assigned.</p>'}
    ${!v.tasks.length ? `<label class="row"><input type="checkbox" id="vDone" ${v.done ? 'checked' : ''}> Mark visit as completed</label>` : ''}
    ${admin ? `<div class="addline"><input class="mini" id="newTask" placeholder="Add task…"><button class="btn" id="addTaskBtn">Add task</button></div>` : ''}
    <div class="row end">${admin ? `<button class="btn" data-edit="${v.id}">Edit visit</button><button class="btn danger" data-del="${v.id}">Delete</button>` : ''}<button class="btn" data-day2="${v.date}">Back</button><button class="btn primary" data-close>Done</button></div>`);
  const touch = () => { save(); render(); visitModal(id); };
  const addTask = () => { const t = clean($('newTask').value); if (!t) return; v.tasks.push({ id: uid(), title: t, done: false, subs: [] }); touch(); };
  if (admin) { $('addTaskBtn').onclick = addTask; $('newTask').onkeydown = e => { if (e.key === 'Enter') addTask(); }; }
  if ($('vDone')) $('vDone').onchange = e => { v.done = e.target.checked; touch(); };
  document.querySelectorAll('#modalCard input[type=checkbox][data-t]').forEach(c => c.onchange = () => {
    const t = v.tasks.find(x => x.id === c.dataset.t); if (!t) return;
    if (c.dataset.s) t.subs.find(s => s.id === c.dataset.s).done = c.checked;
    else if (t.subs.length) t.subs.forEach(s => s.done = c.checked); else t.done = c.checked;
    touch();
  });
  const addSub = tid => { const inp = document.querySelector(`[data-addsub="${tid}"]`), s = clean(inp.value), t = v.tasks.find(x => x.id === tid); if (!s) return; t.subs.push({ id: uid(), title: s, done: false }); touch(); };
  document.querySelectorAll('[data-addsubbtn]').forEach(b => b.onclick = () => addSub(b.dataset.addsubbtn));
  document.querySelectorAll('[data-addsub]').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') addSub(i.dataset.addsub); });
  document.querySelectorAll('[data-delt]').forEach(b => b.onclick = () => {
    const t = v.tasks.find(x => x.id === b.dataset.delt);
    if (b.dataset.dels) t.subs = t.subs.filter(s => s.id !== b.dataset.dels); else v.tasks = v.tasks.filter(x => x.id !== t.id);
    touch();
  });
}
// form: create (multi-store) or edit one visit
function formModal(day, editId) {
  const ev = editId && db.visits.find(x => x.id === editId);
  const am0 = ev ? ev.am : (state.am || AMS[0] || '');
  const tasks = ev ? ev.tasks.map(t => ({ title: t.title, subs: (t.subs || []).map(s => s.title) })) : [{ title: '', subs: [] }];
  const draft = { tasks };
  const body = () => `<h2>${ev ? 'Edit visit' : 'Schedule visit'}</h2>
    <label class="field">Date<input type="date" id="fDate" value="${ev ? ev.date : day || iso(state.y, state.m, 1)}"></label>
    <label class="field">Area manager<select id="fAm">${AMS.map(a => `<option ${a === am0 ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
    <div class="field">Store${ev ? '' : 's (tick one or more)'}<div class="storepick" id="fStores"></div>
      <label style="font-weight:500"><input type="checkbox" id="fAll"> Show stores of all area managers</label></div>
    <label class="field">Notes<textarea id="fNotes" rows="2">${esc(ev ? ev.notes : '')}</textarea></label>
    <div class="field">Tasks &amp; sub-tasks <div id="fTasks"></div><button class="btn" id="fAddTask" type="button" style="align-self:flex-start">+ Add task</button></div>
    <div id="fMsg" class="small" style="color:var(--high)" role="alert"></div>
    <div class="row end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="fSave">Save</button></div>`;
  openModal(body());
  const sel = new Set(ev ? [ev.code + '|' + ev.store] : []);
  const paintStores = () => {
    const am = $('fAm').value, all = $('fAll').checked;
    $('fStores').innerHTML = STORES.filter(s => all || s.am === am).map(s => { const k = s.code + '|' + s.name;
      return `<label><input type="${ev ? 'radio' : 'checkbox'}" name="fs" value="${esc(k)}" ${sel.has(k) ? 'checked' : ''}> ${esc(storeLabel(s))}</label>`; }).join('') || '<span class="muted small">No stores</span>';
    $('fStores').querySelectorAll('input').forEach(i => i.onchange = () => { if (ev) sel.clear(); i.checked ? sel.add(i.value) : sel.delete(i.value); });
  };
  const paintTasks = () => {
    $('fTasks').innerHTML = draft.tasks.map((t, i) => `<div class="vitem"><div class="row"><input class="mini" style="flex:1" data-tt="${i}" placeholder="Task" value="${esc(t.title)}"><button class="x" data-rt="${i}" aria-label="Remove task">✕</button></div>
      ${t.subs.map((s, j) => `<div class="row sub" style="margin:4px 0 0 20px"><input class="mini" style="flex:1" data-ts="${i}.${j}" placeholder="Sub-task" value="${esc(s)}"><button class="x" data-rs="${i}.${j}" aria-label="Remove sub-task">✕</button></div>`).join('')}
      <button class="btn" type="button" data-as="${i}" style="margin:6px 0 0 20px">+ Sub-task</button></div>`).join('');
    $('fTasks').querySelectorAll('[data-tt]').forEach(e => e.oninput = () => draft.tasks[e.dataset.tt].title = e.value);
    $('fTasks').querySelectorAll('[data-ts]').forEach(e => e.oninput = () => { const [i, j] = e.dataset.ts.split('.'); draft.tasks[i].subs[j] = e.value; });
    $('fTasks').querySelectorAll('[data-rt]').forEach(e => e.onclick = () => { draft.tasks.splice(e.dataset.rt, 1); paintTasks(); });
    $('fTasks').querySelectorAll('[data-rs]').forEach(e => e.onclick = () => { const [i, j] = e.dataset.rs.split('.'); draft.tasks[i].subs.splice(j, 1); paintTasks(); });
    $('fTasks').querySelectorAll('[data-as]').forEach(e => e.onclick = () => { draft.tasks[e.dataset.as].subs.push(''); paintTasks(); const ins = $('fTasks').querySelectorAll(`[data-ts^="${e.dataset.as}."]`); ins[ins.length - 1].focus(); });
  };
  $('fAm').onchange = () => { if (!ev) sel.clear(); paintStores(); }; $('fAll').onchange = paintStores;
  $('fAddTask').onclick = () => { draft.tasks.push({ title: '', subs: [] }); paintTasks(); };
  paintStores(); paintTasks();
  $('fSave').onclick = () => {
    const date = $('fDate').value, am = $('fAm').value, notes = clean($('fNotes').value), msg = $('fMsg');
    if (!date) return msg.textContent = 'Pick a date.'; if (!sel.size) return msg.textContent = 'Pick at least one store.';
    const tl = draft.tasks.filter(t => clean(t.title));
    const mk = old => tl.map(t => {
      const o = old && old.find(x => norm(x.title) === norm(t.title));
      return { id: o ? o.id : uid(), title: clean(t.title), done: o ? o.done : false, subs: t.subs.filter(clean).map(s => { const os = o && o.subs.find(y => norm(y.title) === norm(s)); return { id: os ? os.id : uid(), title: clean(s), done: os ? os.done : false }; }) };
    });
    if (ev) { const [code, ...n] = [...sel][0].split('|'); const st = STORES.find(s => s.code === code && s.name === n.join('|'));
      Object.assign(ev, { date, am, code: st.code, store: st.name, notes, tasks: mk(ev.tasks) }); }
    else for (const k of sel) { const [code, ...n] = k.split('|'); const st = STORES.find(s => s.code === code && s.name === n.join('|'));
      db.visits.push({ id: uid(), date, am, code: st.code, store: st.name, notes, done: false, tasks: mk(null) }); }
    save(); closeModal(); if (date.slice(0, 7) !== `${state.y}-${pad(state.m + 1)}`) { state.y = +date.slice(0, 4); state.m = +date.slice(5, 7) - 1; }
    render(); toast(ev ? 'Visit updated.' : `${sel.size} visit${sel.size > 1 ? 's' : ''} scheduled.`);
  };
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-day],[data-open],[data-new],[data-edit],[data-del],[data-day2]'); if (!t) return;
  const d = t.dataset;
  if (d.day) return dayModal(d.day);
  if (d.open) return visitModal(d.open);
  if (d.day2) return dayModal(d.day2);
  if (d.new && admin) return formModal(d.new);
  if (d.edit && admin) return formModal(null, d.edit);
  if (d.del && admin && confirm('Delete this visit and its tasks?')) { db.visits = db.visits.filter(v => v.id !== d.del); save(); closeModal(); render(); }
});

// ---------- dashboard ----------
function amStats(vs) {
  const rows = AMS.map(a => {
    const mine = vs.filter(v => v.am === a), u = mine.reduce((x, v) => { const [t, d] = units(v); return [x[0] + t, x[1] + d]; }, [0, 0]);
    const st = { planned: 0, prog: 0, done: 0, over: 0 }; mine.forEach(v => st[visitStatus(v)]++);
    return { am: a, visits: mine.length, stores: new Set(mine.map(v => v.code + v.store)).size, tasks: u[0], tdone: u[1], pct: u[0] ? u[1] / u[0] : (mine.length ? st.done / mine.length : null), ...st, total: STORES.filter(s => s.am === a).length };
  });
  return rows;
}
const pctTxt = p => p == null ? '–' : Math.round(p * 100) + '%';
function renderDash() {
  const full = db.visits.filter(v => v.date.startsWith(`${state.y}-${pad(state.m + 1)}-`)), vs = state.am ? full.filter(v => v.am === state.am) : full;
  const rows = amStats(vs).filter(r => !state.am || r.am === state.am);
  const st = { planned: 0, prog: 0, done: 0, over: 0 }; vs.forEach(v => st[visitStatus(v)]++);
  const tt = rows.reduce((a, r) => a + r.tasks, 0), td = rows.reduce((a, r) => a + r.tdone, 0);
  const visited = new Set(vs.map(v => v.code + '|' + v.store)), scopeStores = STORES.filter(s => !state.am || s.am === state.am);
  const unv = scopeStores.filter(s => !visited.has(s.code + '|' + s.name));
  const activeAm = rows.filter(r => r.visits).length;
  const kpi = (l, v, s) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s || ''}</div></div>`;
  $('kpis').innerHTML = kpi('Visits scheduled', vs.length, `${activeAm} area manager${activeAm === 1 ? '' : 's'} active`) +
    kpi('Completed', st.done, vs.length ? pctTxt(st.done / vs.length) + ' of visits' : '') + kpi('Overdue', st.over, 'past date, not completed') +
    kpi('Upcoming / in progress', st.planned + st.prog, '') + kpi('Task completion', tt ? pctTxt(td / tt) : '–', `${td} of ${tt} tasks/sub-tasks`) +
    kpi('Store coverage', pctTxt(scopeStores.length ? visited.size / scopeStores.length : null), `${visited.size} of ${scopeStores.length} stores scheduled`);
  $('tblAm').innerHTML = '<thead><tr><th>Area manager</th><th>Stores</th><th>Visits</th><th>Completed</th><th>In progress</th><th>Planned</th><th>Overdue</th><th>Tasks done</th><th>Completion</th><th>Coverage</th></tr></thead><tbody>' +
    rows.map(r => `<tr><td>${esc(r.am)}</td><td>${r.total}</td><td>${r.visits}</td><td>${r.done}</td><td>${r.prog}</td><td>${r.planned}</td><td>${r.over ? `<span class="chip s-over">${r.over}</span>` : 0}</td><td>${r.tdone}/${r.tasks}</td><td><div class="row"><div class="bar"><i style="width:${(r.pct || 0) * 100}%"></i></div>${pctTxt(r.pct)}</div></td><td>${r.total ? pctTxt(r.stores / r.total) : '–'}</td></tr>`).join('') + '</tbody>';
  $('tblVisits').innerHTML = '<thead><tr><th>Date</th><th>Area manager</th><th>Store</th><th>Status</th><th>Tasks</th><th></th></tr></thead><tbody>' +
    (vs.slice().sort((a, b) => a.date.localeCompare(b.date)).map(v => { const [t, d] = units(v); return `<tr><td>${fmtDate(v.date)}</td><td>${esc(v.am)}</td><td>${esc(v.code ? v.code + ' · ' : '')}${esc(v.store)}</td><td><span class="chip s-${visitStatus(v)}">${SLABEL[visitStatus(v)]}</span></td><td>${t ? `${d}/${t}` : '–'}</td><td><button class="btn" data-open="${v.id}">Open</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">No visits scheduled this month.</td></tr>') + '</tbody>';
  $('unvisCount').textContent = `(${unv.length})`;
  $('unvisited').innerHTML = unv.map(s => `<span class="chip" title="${esc(s.am)}">${esc(storeLabel(s))}</span>`).join('') || '<span class="muted">Every store has a visit scheduled.</span>';
  Object.values(state.charts).forEach(c => c.destroy()); state.charts = {};
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim() || '#2b8a74';
  const tick = { color: col('--muted') }, grid = { color: col('--line') };
  state.charts.am = new Chart($('chAm'), { type: 'bar', data: { labels: rows.map(r => r.am), datasets: [{ label: 'Completion %', data: rows.map(r => r.pct == null ? 0 : Math.round(r.pct * 100)), backgroundColor: col('--teal-deep') }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100, ticks: tick, grid }, y: { ticks: tick, grid: { display: false } } } } });
  state.charts.st = new Chart($('chStatus'), { type: 'doughnut', data: { labels: Object.values(SLABEL), datasets: [{ data: [st.planned, st.prog, st.done, st.over], backgroundColor: [col('--tan'), col('--low'), col('--ok'), col('--high')] }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: col('--ink') } } } } });
}

// ---------- Excel template / upload / export ----------
async function saveWB(wb, name) { XLSX.writeFile(wb, name); }
function dlTemplate() {
  const head = ['Visit Date (YYYY-MM-DD)', 'Area Manager', 'Store Code', 'Store Name', 'Task', 'Sub-tasks (separate with ;)', 'Notes'];
  const rows = STORES.slice().sort((a, b) => a.am.localeCompare(b.am) || a.name.localeCompare(b.name)).map(s => ['', s.am, s.code, s.name, '', '', '']);
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
  ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 11 }, { wch: 28 }, { wch: 32 }, { wch: 40 }, { wch: 30 }]; ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Visits');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['How to fill this template'], [''],
    ['1. Every store is already listed with its area manager - nothing to type for names.'],
    ['2. Fill "Visit Date" (YYYY-MM-DD) for the stores that will be visited. Rows without a date are ignored.'],
    ['3. Add a Task (and optional Sub-tasks separated by ;) on the same row.'],
    ['4. Need more tasks for one visit? Copy the row and keep the same date, area manager and store - extra rows are merged into the same visit.'],
    ['5. Need a second visit to the same store? Copy the row with a different date.'],
    ['6. To change the area manager of a visit, pick a name from the "Lists" sheet.'],
    ['7. Save and use Admin > Upload filled template.']]), 'Instructions');
  const n = Math.max(AMS.length, STORES.length), l = [['Area Managers', '', 'Store Code', 'Store Name', 'Default Area Manager']];
  for (let i = 0; i < n; i++) l.push([AMS[i] || '', '', STORES[i] ? STORES[i].code : '', STORES[i] ? STORES[i].name : '', STORES[i] ? STORES[i].am : '']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(l), 'Lists');
  saveWB(wb, 'Area_Manager_Visit_Template.xlsx');
}
function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  const s = clean(v); let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/); if (m) return iso(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s); return isNaN(d) ? null : iso(d.getFullYear(), d.getMonth(), d.getDate());
}
async function uploadVisits(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }), ws = wb.Sheets['Visits'] || wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const hi = aoa.findIndex(r => r.some(c => /visit date/i.test(c || '')));
  if (hi < 0) return toast('Not the visit template: "Visit Date" column not found.');
  const h = aoa[hi].map(c => norm(c)), col = re => h.findIndex(x => re.test(x));
  const c = { date: col(/visit date/), am: col(/area manager/), code: col(/store code/), name: col(/store name/), task: col(/^task/), subs: col(/sub-?task/), notes: col(/notes/) };
  let added = 0, merged = 0, skipped = 0, nodate = 0; const bad = [];
  aoa.slice(hi + 1).forEach((r, i) => {
    if (r.every(x => x == null || x === '')) return;
    if (r[c.date] == null || r[c.date] === '') { nodate++; return; }
    const date = parseDate(r[c.date]), st = findStore(r[c.code], r[c.name]);
    if (!date || !st) { skipped++; bad.push(hi + i + 2); return; }
    const am = AMS.find(a => norm(a) === norm(r[c.am])) || st.am;
    let v = db.visits.find(x => x.date === date && x.code === st.code && x.store === st.name && x.am === am);
    if (!v) { v = { id: uid(), date, am, code: st.code, store: st.name, notes: '', done: false, tasks: [] }; db.visits.push(v); added++; } else merged++;
    if (c.notes >= 0 && clean(r[c.notes]) && !v.notes) v.notes = clean(r[c.notes]);
    const title = clean(r[c.task]), subs = c.subs >= 0 ? String(r[c.subs] ?? '').split(/[;\n]/).map(clean).filter(Boolean) : [];
    if (title) { let t = v.tasks.find(x => norm(x.title) === norm(title)); if (!t) v.tasks.push(t = { id: uid(), title, done: false, subs: [] });
      subs.forEach(s => { if (!t.subs.some(x => norm(x.title) === norm(s))) t.subs.push({ id: uid(), title: s, done: false }); }); }
  });
  save(); render();
  const first = db.visits.map(v => v.date).sort()[0]; if (added && first && !monthVisits().length) { const l = db.visits.map(v => v.date).sort()[db.visits.length - 1]; state.y = +l.slice(0, 4); state.m = +l.slice(5, 7) - 1; render(); }
  toast(`Upload done: ${added} new visit${added === 1 ? '' : 's'}, ${merged} row(s) merged into existing visits, ${nodate} row(s) without date ignored${skipped ? `, ${skipped} skipped (bad date/store, rows ${bad.slice(0, 8).join(', ')})` : ''}.`);
}
function exportMonth() {
  const vs = monthVisits(), out = [['Date', 'Area Manager', 'Store Code', 'Store', 'Status', 'Task', 'Task done', 'Sub-task', 'Sub-task done', 'Notes']];
  vs.forEach(v => { const s = SLABEL[visitStatus(v)]; if (!v.tasks.length) out.push([v.date, v.am, v.code, v.store, s, '', '', '', '', v.notes]);
    v.tasks.forEach(t => { if (!t.subs.length) out.push([v.date, v.am, v.code, v.store, s, t.title, t.done ? 'Yes' : 'No', '', '', v.notes]); else t.subs.forEach(x => out.push([v.date, v.am, v.code, v.store, s, t.title, taskDone(t) ? 'Yes' : 'No', x.title, x.done ? 'Yes' : 'No', v.notes])); }); });
  const sum = [['Area Manager', 'Stores', 'Visits', 'Completed', 'In progress', 'Planned', 'Overdue', 'Tasks done', 'Tasks total', 'Completion %']];
  amStats(vs).forEach(r => sum.push([r.am, r.total, r.visits, r.done, r.prog, r.planned, r.over, r.tdone, r.tasks, r.pct == null ? '' : Math.round(r.pct * 100)]));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Summary'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(out), 'Visits & tasks');
  saveWB(wb, `AM_visits_${state.y}-${pad(state.m + 1)}.xlsx`);
}
function backup() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ visits: db.visits })], { type: 'application/json' })); a.download = `am_visits_backup_${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
async function restore(file) {
  try { const d = JSON.parse(await file.text()); if (!Array.isArray(d.visits)) throw 0; if (!confirm(`Replace the ${db.visits.length} current visits with ${d.visits.length} from the backup?`)) return; db.visits = d.visits; save(); render(); toast('Backup restored.'); }
  catch (e) { toast('That file is not a valid backup.'); }
}

// ---------- wiring ----------
$('amFilter').innerHTML += AMS.map(a => `<option>${esc(a)}</option>`).join('');
$('amFilter').onchange = e => { state.am = e.target.value; render(); };
const shift = n => { state.m += n; if (state.m < 0) { state.m = 11; state.y--; } if (state.m > 11) { state.m = 0; state.y++; } render(); };
$('prevM').onclick = () => shift(-1); $('nextM').onclick = () => shift(1);
$('todayM').onclick = () => { state.y = now.getFullYear(); state.m = now.getMonth(); render(); };
$('btnLogin').onclick = login; $('btnLogout').onclick = () => { setAdmin(false); toast('Logged out.'); };
$('btnChangePw').onclick = changePw; $('btnAdd').onclick = () => formModal(null);
$('btnTemplate').onclick = dlTemplate; $('btnBackup').onclick = backup; $('btnExportMonth').onclick = exportMonth;
$('fileVisits').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f && admin) uploadVisits(f).catch(() => toast('Could not read that file.')); };
$('fileBackup').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f && admin) restore(f); };
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
setAdmin(admin);
})();
