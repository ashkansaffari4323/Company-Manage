'use strict';
/* Company Manage v39 - admin console for Autodesk Construction Cloud / BIM 360 */

const API = '/api/index?action=';
const PAGE_STEP = 300;

const S = {
  tab: 'dashboard', connected: false, abrConfigured: false, hubs: [], hub: '', queue: null, busyLock: false,
  companies: [], companiesLoaded: false, cSel: new Set(), cLimit: PAGE_STEP,
  cf: { search: '', status: 'all', noErp: false, noTax: false, noMembers: false, noImage: false, unused: false, dupes: false, noAddress: false },
  projects: [], projectsLoaded: false,
  access: { pSearch: '', pStatus: 'all', pSel: new Set(), members: [], mSearch: '', mCompany: 'all', mSel: new Set(), mLimit: PAGE_STEP, errors: [], role: '' },
  user: { users: [], loaded: false, search: '', company: 'all', limit: PAGE_STEP, selected: null, projects: [], loading: false, pSearch: '', pSel: new Set() },
  bulk: { search: '', company: 'all', sel: new Set(), preview: false, limit: PAGE_STEP },
  jobs: { search: '', sel: new Set(), op: 'addPrefix', value: '', preview: [], noJob: false, limit: PAGE_STEP },
  abn: { guid: localStorage.getItem('abrGuid') || '', scope: 'filtered', rows: [], sel: new Set(), search: '', match: 'all', limit: PAGE_STEP,
    opts: { address: true, fillTax: true, overwrite: false }, running: false, stop: false, done: 0, total: 0 },
  xdel: { file: '', wb: null, sheets: [], sheet: '', headerRow: 1, cols: {}, headers: [], raw: [], rows: [], sel: new Set(), search: '', filter: 'all', limit: PAGE_STEP,
    running: false, opts: { nameFallback: true, altCode: true } },
  imp: { rows: [], file: '' },
  addr: { rows: [], file: '', sel: new Set(), search: '', filter: 'all', limit: PAGE_STEP, running: false },
  only: {}, pick: {}, moveOpts: { hub: true, purge: false }, move: null, audit: null, reports: []
};

/* ------------------------------------------------------------ utilities */
const $ = (s, r) => (r || document).querySelector(s);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasText = (list, q) => !q || list.some((v) => String(v == null ? '' : v).toLowerCase().includes(q));
const roleNames = (roles) => (roles || []).map((r) => r.name || r).join(', ');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const companies = (n) => `${n} compan${n === 1 ? 'y' : 'ies'}`;
const isBim = (platform) => /bim/i.test(platform || '');
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');
const fmtAbn = (a) => { const d = digitsOnly(a); return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : a || ''; };
const coreName = (s) => norm(s).replace(/\((inactive|hold|canceled|cancelled|denied)\)/g, ' ').replace(/&/g, ' and ').replace(/\bp\s*\/\s*l\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(pty|ltd|limited|proprietary|inc|incorporated|the|inactive|canceled|cancelled)\b/g, ' ').replace(/\s+/g, ' ').trim();
/* Supplier code canonical form: upper case, letters and digits only. "S-205598", "s 205598", "S205598" all become "S205598". */
const codeKey = (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeTokens = (v) => { const s = String(v == null ? '' : v); const out = new Set(); const whole = codeKey(s); if (whole) out.add(whole); s.split(/[\s,;|/]+/).forEach((t) => { const k = codeKey(t); if (k) out.add(k); }); return [...out]; };

async function api(action, opts) {
  const o = opts || {};
  const r = await fetch(API + action, { method: o.body ? 'POST' : 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined });
  let d;
  try { d = await r.json(); } catch { d = { message: r.statusText }; }
  if (!r.ok) { const e = new Error(d.message || r.statusText); e.status = r.status; throw e; }
  return d;
}
const retryable = (e) => [408, 429, 500, 502, 503, 504].includes(e.status) || /quota|rate|timeout|temporar/i.test(e.message || '');

function setQueue(text, pct) { S.queue = text ? { text, pct } : null; paintBanner(); }
function paintBanner() {
  const el = $('#banner');
  if (!el) return;
  el.innerHTML = S.queue ? `<div class="notice"><b>${esc(S.queue.text)}</b>${S.queue.pct != null ? `<div class="progress"><div style="width:${Math.max(0, Math.min(100, S.queue.pct))}%"></div></div>` : ''}</div>` : '';
}
function flash(text) { setQueue(text); setTimeout(() => { if (S.queue && S.queue.text === text) setQueue(null); }, 9000); }
function showError(msg) { const el = $('#err'); if (el) el.innerHTML = msg ? `<div class="error">${esc(msg)} <button class="x" data-act="clearError">Dismiss</button></div>` : ''; }

function tbl(heads, rows, empty) {
  return `<div class="table"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((v) => `<td>${v == null ? '' : v}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="empty">${empty || 'No records loaded.'}</td></tr>`}</tbody></table></div>`;
}
const chip = (key, label, on, ch) => `<label class="chip ${on ? 'on' : ''}"><input type="checkbox" data-ch="${ch}" data-k="${key}" ${on ? 'checked' : ''}> ${label}</label>`;
const rowBox = (set, id, on) => `<input type="checkbox" data-ch="row" data-set="${set}" data-id="${esc(id)}" ${on ? 'checked' : ''}>`;
const moreBtn = (key, shown, total) => (total > shown ? `<div class="bar" style="margin-top:10px"><button class="btn light" data-act="more" data-k="${key}">Show ${Math.min(PAGE_STEP, total - shown)} more (${shown} of ${total} shown)</button></div>` : '');
function selBar(set) {
  return `<button class="btn soft" data-act="selectAll" data-set="${set}">Select All Filtered</button>
    <button class="btn light" data-act="clearSel" data-set="${set}">Deselect All</button>
    <label class="chip ${S.only[set] ? 'on' : ''}"><input type="checkbox" data-ch="only" data-set="${set}" ${S.only[set] ? 'checked' : ''}> Show selected only</label>
    <span class="badge" data-count="${set}">${SETS()[set].size} selected</span>`;
}
const onlySel = (set, list, idf) => (S.only[set] ? list.filter((x) => SETS()[set].has(idf(x))) : list);

function pushReports(rows) {
  const t = new Date().toLocaleString();
  for (const r of rows) S.reports.push({ Time: t, Type: r.Type || '', Name: r.Name || '', Project: r.Project || '', Result: r.Result || '', Detail: r.Detail || '' });
}
function exportRows(name, rows, sheet) {
  if (typeof XLSX === 'undefined') {
    const heads = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const blob = new Blob([heads.map(q).join(',') + '\n' + rows.map((r) => heads.map((h) => q(r[h])).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name.replace(/\.xlsx$/, '.csv'); a.click();
    return;
  }
  const wb = XLSX.utils.book_new();
  addSheet(wb, sheet || 'Data', rows);
  XLSX.writeFile(wb, name);
}
function addSheet(wb, name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No records' }]);
  const heads = Object.keys(rows[0] || { Note: '' });
  ws['!cols'] = heads.map((h) => ({ wch: Math.min(60, Math.max(12, h.length + 2, ...rows.slice(0, 200).map((r) => String(r[h] == null ? '' : r[h]).length + 2))) }));
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

function openModal(html, wide) { $('#modal').innerHTML = `<div class="modal"><div class="modalbox ${wide ? 'wide' : ''}">${html}</div></div>`; }
function closeModal() {
  $('#modal').innerHTML = '';
  if (S.audit) S.audit.cancelled = true;
  S.audit = null;
  if (S.move && !S.move.running) S.move = null;
}
function keepFocus(paint) {
  const act = document.activeElement, id = act && act.id, pos = act && act.selectionStart;
  paint();
  if (id) { const el = document.getElementById(id); if (el && el.tagName === 'INPUT') { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* ignore */ } } }
}

const SETS = () => ({ cSel: S.cSel, pSel: S.access.pSel, mSel: S.access.mSel, uProjSel: S.user.pSel, bulkSel: S.bulk.sel, jobSel: S.jobs.sel, abnSel: S.abn.sel, xdelSel: S.xdel.sel, addrSel: S.addr.sel, moveSel: S.move ? S.move.sel : new Set() });
function paintCounts() { const sets = SETS(); document.querySelectorAll('[data-count]').forEach((el) => { el.textContent = `${sets[el.dataset.count].size} selected`; }); }

/* ------------------------------------------------- company combobox */
const liveCompanies = () => S.companies.filter((c) => c.status !== 'deleted');
const companyById = (id) => S.companies.find((c) => c.id === id);
function comboHtml(key, placeholder, exclude) {
  const c = companyById(S.pick[key]);
  return `<div class="combo ${c ? 'has' : ''}"><input id="combo_${esc(key)}" class="input combo-in" autocomplete="off" data-combo="${esc(key)}" data-exclude="${esc(exclude || '')}" placeholder="${esc(placeholder || 'Search company...')}" value="${esc(c ? c.name : '')}">${c ? `<button class="combo-x" title="Clear" data-act="comboClear" data-key="${esc(key)}">&times;</button>` : '<span class="combo-caret">&#9662;</span>'}</div>`;
}
const COMBO = { input: null, items: [], idx: 0 };
function comboMatches(text, exclude) {
  const q = norm(text), pool = liveCompanies().filter((c) => c.id !== exclude);
  if (!q) return pool.slice().sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));
  const starts = [], contains = [];
  for (const c of pool) {
    const n = norm(c.name);
    if (n.startsWith(q)) starts.push(c);
    else if (n.includes(q) || norm(c.erpId).includes(q) || norm(c.taxId).includes(q)) contains.push(c);
  }
  return starts.sort((a, b) => a.name.localeCompare(b.name)).concat(contains.sort((a, b) => a.name.localeCompare(b.name)));
}
function comboOpen(input) {
  COMBO.input = input;
  const all = comboMatches(input.value, input.dataset.exclude);
  COMBO.items = all.slice(0, 60); COMBO.idx = 0;
  let panel = $('#comboPanel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'comboPanel'; panel.className = 'combo-panel'; document.body.appendChild(panel); }
  if (!S.companiesLoaded) panel.innerHTML = '<div class="combo-empty">Load the company directory first.</div>';
  else if (!COMBO.items.length) panel.innerHTML = '<div class="combo-empty">No matching company.</div>';
  else panel.innerHTML = COMBO.items.map((c, i) => `<div class="combo-opt ${i === 0 ? 'act' : ''}" data-i="${i}"><b>${esc(c.name)}</b><small>${plural(c.members, 'member')} &middot; ${plural(c.projects, 'project')}${c.erpId ? ' &middot; ERP ' + esc(c.erpId) : ''}${c.trade ? ' &middot; ' + esc(c.trade) : ''}</small></div>`).join('') +
    (all.length > COMBO.items.length ? `<div class="combo-more">Showing 60 of ${all.length.toLocaleString()} matches - keep typing to narrow down</div>` : '');
  const r = input.getBoundingClientRect(), below = window.innerHeight - r.bottom;
  panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 420))}px`;
  panel.style.width = `${Math.max(r.width, 380)}px`;
  if (below < 300 && r.top > below) { panel.style.top = ''; panel.style.bottom = `${window.innerHeight - r.top + 4}px`; } else { panel.style.bottom = ''; panel.style.top = `${r.bottom + 4}px`; }
  panel.style.display = 'block';
}
function comboClose() { const p = $('#comboPanel'); if (p) p.style.display = 'none'; COMBO.input = null; }
function comboHighlight(i) {
  const opts = document.querySelectorAll('#comboPanel .combo-opt');
  if (!opts.length) return;
  COMBO.idx = (i + opts.length) % opts.length;
  opts.forEach((o, n) => o.classList.toggle('act', n === COMBO.idx));
  opts[COMBO.idx].scrollIntoView({ block: 'nearest' });
}
function comboChoose(i) {
  const c = COMBO.items[i], input = COMBO.input;
  if (!c || !input) return;
  S.pick[input.dataset.combo] = c.id;
  input.value = c.name;
  const box = input.closest('.combo');
  if (box) { box.classList.add('has'); const caret = box.querySelector('.combo-caret'); if (caret) caret.outerHTML = `<button class="combo-x" title="Clear" data-act="comboClear" data-key="${esc(input.dataset.combo)}">&times;</button>`; }
  comboClose();
  if (input.dataset.combo === '__bulkUser') { S.bulk.preview = false; renderView(); }
}

/* --------------------------------------------------------------- filters */
const hasAddress = (c) => !!(c.state || c.postcode || c.address1);
function filteredCompanies() {
  const f = S.cf, q = f.search.trim().toLowerCase();
  let dupes = null;
  if (f.dupes) { dupes = new Map(); for (const c of S.companies) { const k = norm(c.name); dupes.set(k, (dupes.get(k) || 0) + 1); } }
  const list = S.companies.filter((c) => {
    if (f.status !== 'all' && c.status !== f.status) return false;
    if (f.noErp && c.erpId) return false;
    if (f.noTax && c.taxId) return false;
    if (f.noMembers && c.members > 0) return false;
    if (f.noImage && c.imageUrl) return false;
    if (f.noAddress && hasAddress(c)) return false;
    if (f.unused && (c.members > 0 || c.projects > 0)) return false;
    if (dupes && dupes.get(norm(c.name)) < 2) return false;
    return hasText([c.name, c.trade, c.erpId, c.taxId], q);
  });
  return onlySel('cSel', list, (c) => c.id);
}
const searchProjects = (search, status) => { const q = (search || '').trim().toLowerCase(); return S.projects.filter((p) => (status === 'all' || !status || p.status === status) && hasText([p.name, p.jobNumber, p.status, p.id, p.platform], q)); };
const accessProjects = () => onlySel('pSel', searchProjects(S.access.pSearch, S.access.pStatus), (p) => p.id);
function filteredMembers() {
  const a = S.access, q = a.mSearch.trim().toLowerCase();
  return onlySel('mSel', a.members.filter((m) => (a.mCompany === 'all' || m.company === a.mCompany) && hasText([m.projectName, m.name, m.email, m.company, roleNames(m.roles), m.status], q)), (m) => m.key);
}
function searchHubUsers(search, company) { const q = (search || '').trim().toLowerCase(); return S.user.users.filter((u) => (company === 'all' || u.company === company) && hasText([u.name, u.email, u.company, u.status], q)); }
const bulkUsers = () => onlySel('bulkSel', searchHubUsers(S.bulk.search, S.bulk.company), (u) => u.id);
const userProjects = () => onlySel('uProjSel', S.user.projects.filter((p) => hasText([p.projectName, p.status, roleNames(p.roles)], S.user.pSearch.trim().toLowerCase())), (p) => p.projectId);
const filteredJobs = () => onlySel('jobSel', searchProjects(S.jobs.search, 'all').filter((p) => !S.jobs.noJob || !p.jobNumber), (p) => p.id);
const moveRows = () => (S.move ? onlySel('moveSel', S.move.rows.filter((r) => hasText([r.projectName, r.name, r.email, r.company], (S.move.search || '').toLowerCase())), (r) => r.key) : []);

/* --- ABN result categories */
const MATCH_TYPES = ['ABN match', 'Exact name match', 'Close name match', 'Name match - multiple ABNs', 'No match', 'Lookup error'];
const isCancelled = (r) => !!(r.abr && !/active/i.test(r.abr.status));
const isNoMatch = (r) => r.match === 'No match' || r.match === 'Lookup error';
const isReview = (r) => r.match === 'Close name match' || r.match === 'Name match - multiple ABNs' || /different/.test(r.note || '');
const isReady = (r) => !!r.changes && (r.match === 'ABN match' || r.match === 'Exact name match') && !/different/.test(r.note || '');
const isDeleted = (r) => r.result === 'Deleted';
const ABN_FILTERS = [
  ['all', 'All results', () => true],
  ['problems', 'Cancelled + not matched', (r) => !isDeleted(r) && (isCancelled(r) || isNoMatch(r))],
  ['cancelled', 'Cancelled / inactive ABN', (r) => !isDeleted(r) && isCancelled(r)],
  ['nomatch', 'Not matched (no match or lookup error)', (r) => !isDeleted(r) && isNoMatch(r)],
  ['review', 'Needs review (close, multiple ABNs, name different)', (r) => !isDeleted(r) && isReview(r)],
  ['ready', 'Ready to apply (ABN / exact match with changes)', (r) => !isDeleted(r) && isReady(r)],
  ['changes', 'Any row with changes to apply', (r) => !isDeleted(r) && !!r.changes],
  ...MATCH_TYPES.map((t) => [t, t, (r) => !isDeleted(r) && r.match === t]),
  ['deleted', 'Deleted in this session', (r) => isDeleted(r)]
];
function abnRows() {
  const A = S.abn, q = A.search.trim().toLowerCase();
  const f = (ABN_FILTERS.find((x) => x[0] === A.match) || ABN_FILTERS[0])[2];
  return onlySel('abnSel', A.rows.filter((r) => f(r) && hasText([r.name, r.taxId, r.abr && r.abr.entityName, r.abr && r.abr.abn, r.note, r.match], q)), (r) => r.id);
}

/* ---------------------------------------------------------------- shell */
const TABS = [['dashboard', 'Dashboard'], ['companies', 'Company Directory'], ['address', 'Company Address Upload'], ['xdel', 'Delete by S Code'], ['abn', 'ABN Lookup'], ['import', 'Import Companies'], ['access', 'Users & Access'], ['user', 'User Removal'], ['bulk', 'Bulk User Company'], ['numbers', 'Project Numbers'], ['reports', 'Reports & Excel']];

function render() {
  comboClose();
  $('#app').innerHTML = `<div class="layout">
    <aside class="side"><div class="brand">Company Manage<small>v38 &middot; Hub administration</small></div>
      <nav>${TABS.map(([id, label]) => `<button data-act="nav" data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${label}</button>`).join('')}</nav></aside>
    <main class="main">
      <header class="head"><h1>${esc(TABS.find((t) => t[0] === S.tab)[1])}</h1>
        <div class="bar"><span class="badge ${S.connected ? 'good' : 'warn'}">${S.connected ? 'Autodesk connected' : 'Not connected'}</span>
        <button class="btn ${S.connected ? 'light' : ''}" data-act="auth">${S.connected ? 'Sign out' : 'Connect Autodesk'}</button></div></header>
      <div class="card bar"><b>Active Hub</b><select class="select grow" data-ch="hub">${S.hubs.map((h) => `<option value="${esc(h.id)}" ${h.id === S.hub ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
        <button class="btn light" data-act="refreshHubs">Refresh Hubs</button></div>
      <div id="err"></div><div id="banner"></div><section id="view"></section>
    </main></div>`;
  renderView();
  paintBanner();
}
const VIEWS = {};
function renderView() {
  const view = $('#view');
  if (!view) return;
  comboClose();
  keepFocus(() => { view.innerHTML = S.connected || S.tab === 'dashboard' ? VIEWS[S.tab]() : connectView(); });
}
const connectView = () => `<div class="card empty-state"><h2>Connect to Autodesk</h2><p>Sign in with an Autodesk account that has Hub Admin access. All actions use that account's permissions.</p><button class="btn" data-act="auth">Connect Autodesk</button></div>`;

/* ------------------------------------------------------------ dashboard */
VIEWS.dashboard = () => {
  const c = S.companies, n = c.length, cnt = (f) => c.filter(f).length;
  const noErp = cnt((x) => !x.erpId), noTax = cnt((x) => !x.taxId), noMem = cnt((x) => x.members === 0), unused = cnt((x) => x.members === 0 && x.projects === 0), noImg = cnt((x) => !x.imageUrl), noAddr = cnt((x) => !hasAddress(x));
  const cov = (miss) => (n ? Math.round(100 * (n - miss) / n) + '%' : '-');
  const stat = (label, val, hint) => `<div class="stat"><span>${label}</span><b>${val}</b>${hint ? `<small>${hint}</small>` : ''}</div>`;
  const quick = (q, label, val) => `<button class="quick" data-act="quick" data-q="${q}" ${n ? '' : 'disabled'}><b>${val}</b><span>${label}</span></button>`;
  return `${S.connected ? '' : connectView()}
  <div class="stats">${stat('Companies loaded', n.toLocaleString(), S.companiesLoaded ? 'Directory loaded' : 'Open Company Directory and load')}
    ${stat('ERP ID (S code) coverage', cov(noErp), `${noErp.toLocaleString()} missing`)}${stat('Tax ID coverage', cov(noTax), `${noTax.toLocaleString()} missing`)}
    ${stat('Address coverage', cov(noAddr), `${noAddr.toLocaleString()} missing`)}${stat('Hub users loaded', S.user.users.length.toLocaleString())}</div>
  <div class="card"><h3>Data quality shortcuts</h3><p class="muted">Jump to a filtered Company Directory view. Load companies first.</p>
    <div class="quicks">${quick('noErp', 'Companies without ERP ID / S code', noErp.toLocaleString())}${quick('noTax', 'Companies without Tax ID', noTax.toLocaleString())}
    ${quick('noAddress', 'Companies without address', noAddr.toLocaleString())}${quick('noMembers', 'Companies with no members', noMem.toLocaleString())}
    ${quick('unused', 'Unused (no members, no projects)', unused.toLocaleString())}${quick('noImage', 'Companies without a logo', noImg.toLocaleString())}</div></div>
  <div class="card"><h3>What each tab does</h3><ul class="steps">
    <li><b>Company Directory</b> - filters, ERP/Tax IDs, logos, Members/Projects audit, Replace with (verified), Auto Rename, Bulk ERP/Tax, Remove Members + Purge.</li>
    <li><b>Delete by S Code</b> - upload the Workday supplier export (or the template). Each Workday S code is compared with the Hub company ERP ID; select the matches and delete them.</li>
    <li><b>ABN Lookup</b> - checks companies against the Australian Business Register and fills ABN, state and postcode.</li>
    <li><b>Company Address Upload</b> - match Supplier ID / S Code to ERP ID, preview and update addresses from Excel.</li>
    <li><b>Import Companies</b>, <b>Users &amp; Access</b>, <b>User Removal</b>, <b>Bulk User Company</b>, <b>Project Numbers</b>, <b>Reports &amp; Excel</b>.</li></ul></div>`;
};

/* ------------------------------------------------------ company directory */
VIEWS.companies = () => {
  const rows = filteredCompanies(), f = S.cf, shown = rows.slice(0, S.cLimit);
  return `<div class="card">
    <div class="bar"><input id="cSearch" class="input grow" data-in="cSearch" placeholder="Search company name, trade, ERP ID / S code or Tax ID" value="${esc(f.search)}">
      <select class="select" data-ch="cStatus">${['all', 'active', 'inactive', 'deleted'].map((s) => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
      <button class="btn" data-act="loadCompanies">${S.companiesLoaded ? 'Reload All Companies' : 'Load All Companies'}</button>
      <button class="btn light" data-act="exportCompanies">Export Filtered</button></div>
    <div class="bar chips">${chip('noErp', 'No ERP ID', f.noErp, 'cf')}${chip('noTax', 'No Tax ID', f.noTax, 'cf')}${chip('noAddress', 'No address', f.noAddress, 'cf')}${chip('noMembers', 'No members', f.noMembers, 'cf')}${chip('noImage', 'No logo', f.noImage, 'cf')}${chip('unused', 'Unused', f.unused, 'cf')}${chip('dupes', 'Duplicate names', f.dupes, 'cf')}
      <button class="btn light small" data-act="resetCompanyFilters">Reset filters</button></div>
    <div class="bar"><span class="badge">${rows.length.toLocaleString()} of ${S.companies.length.toLocaleString()} companies</span>${selBar('cSel')}</div>
    <div class="bar"><input id="renamePrefix" class="input" value="Not integrated company" placeholder="Auto rename prefix">
      <button class="btn soft" data-act="autoRename">Auto Rename</button><button class="btn light" data-act="bulkErpTax">Bulk ERP / Tax from Excel</button>
      <button class="btn soft" data-act="abnFromDirectory">ABN Lookup for these</button><button class="btn danger" data-act="deepPurge">Remove Members + Purge</button></div>
    <div class="replacebar"><div class="bar" style="margin:0"><b>Replace selected companies with</b>
      <div class="grow">${comboHtml('__bulk', 'Search the company that will receive all members...')}</div>
      <button class="btn" data-act="replaceSelected">Preview Move</button></div>
      <p class="muted small">Every member of the selected companies, in every project, is moved to the chosen company with preview, test and read-back verification.</p></div>
    ${tbl(['Select', 'Logo', 'Company', 'Trade', 'ERP ID / S code', 'Tax ID', 'State / Postcode', 'Status', 'Members', 'Projects', 'Replace with (moves all members)', 'Logo upload'],
      shown.map((c) => [rowBox('cSel', c.id, S.cSel.has(c.id)),
        c.imageUrl ? `<img class="logo" src="${esc(c.imageUrl)}" alt="">` : '<span class="muted">-</span>',
        esc(c.name), esc(c.trade),
        c.erpId ? esc(c.erpId) : `<button class="btn soft small" data-act="addField" data-kind="erp" data-id="${esc(c.id)}">+ Add ERP ID</button>`,
        c.taxId ? esc(c.taxId) : `<button class="btn soft small" data-act="addField" data-kind="tax" data-id="${esc(c.id)}">+ Add Tax ID</button>`,
        hasAddress(c) ? esc([c.state, c.postcode].filter(Boolean).join(' ')) : '<span class="muted">-</span>',
        `<span class="badge">${esc(c.status || 'active')}</span>`,
        `<button class="btn soft small" data-act="audit" data-id="${esc(c.id)}">${plural(c.members, 'member')}</button>`,
        `<button class="btn soft small" data-act="audit" data-id="${esc(c.id)}">${plural(c.projects, 'project')}</button>`,
        `<div class="replacecell">${comboHtml(c.id, 'Choose company...', c.id)}<button class="btn small" data-act="replaceOne" data-id="${esc(c.id)}">Move</button></div>`,
        `<label class="btn light small">Logo<input type="file" accept="image/*" hidden data-ch="logo" data-id="${esc(c.id)}"></label>`]),
      S.companiesLoaded ? 'No companies match the current filters.' : 'Select Load All Companies. Large directories load in safe groups of 1,000 with a 5-second pause.')}
    ${moreBtn('cLimit', shown.length, rows.length)}</div>`;
};

async function loadCompanies() {
  if (S.busyLock) return;
  S.busyLock = true;
  try {
    let offset = 0, total = 0;
    const all = [], pending = [];
    setQueue('Loading companies...', 0);
    do {
      let group = 0;
      while (group < 1000 && (total === 0 || offset < total)) {
        const lim = Math.min(200, 1000 - group);
        try {
          const d = await api(`companies-page&hubId=${encodeURIComponent(S.hub)}&status=all&limit=${lim}&offset=${offset}`);
          all.push(...d.items); total = d.total; offset = d.nextOffset; group += d.items.length;
          setQueue(`Loading companies: ${all.length.toLocaleString()} of ${total.toLocaleString()}${pending.length ? ` | ${pending.length} pending` : ''}`, total ? 100 * all.length / total : 0);
          if (!d.items.length) { offset = total; break; }
        } catch (e) {
          if (!retryable(e) || pending.length > 15) throw e;
          pending.push({ offset, lim }); offset += lim; group += lim;
        }
      }
      if (offset < total) { setQueue(`Loaded ${all.length.toLocaleString()} of ${total.toLocaleString()}. Waiting 5 seconds before the next 1,000...`, 100 * all.length / total); await sleep(5000); }
    } while (offset < total);
    for (const job of pending) { await sleep(5000); try { const d = await api(`companies-page&hubId=${encodeURIComponent(S.hub)}&status=all&limit=${job.lim}&offset=${job.offset}`); all.push(...d.items); } catch { /* ignore */ } }
    S.companies = [...new Map(all.map((c) => [c.id, c])).values()];
    S.companiesLoaded = true; S.cSel.clear();
    if (S.xdel.raw.length) xdelMatch();
    flash(`Loaded ${S.companies.length.toLocaleString()} companies.`);
    renderView();
  } finally { S.busyLock = false; }
}

async function loadProjects(force) {
  if (S.projectsLoaded && !force) return;
  const all = [];
  let offset = 0, total = 1;
  while (offset < total) {
    const d = await api(`projects-page&hubId=${encodeURIComponent(S.hub)}&offset=${offset}`);
    all.push(...d.items); total = d.total; offset = d.nextOffset;
    setQueue(`Loading projects: ${all.length.toLocaleString()} of ${total.toLocaleString()}`, total ? 100 * all.length / total : 0);
    if (!d.items.length) break;
  }
  S.projects = all; S.projectsLoaded = true; setQueue(null);
}

async function loadHubUsers() {
  if (S.busyLock) return;
  S.busyLock = true;
  try {
    const out = [], pending = [];
    let offset = 0, more = true;
    setQueue('Loading Hub users...');
    while (more) {
      let group = 0;
      while (group < 500 && more) {
        try {
          const d = await api(`hub-users-page&hubId=${encodeURIComponent(S.hub)}&limit=100&offset=${offset}`);
          out.push(...d.items); offset = d.nextOffset; group += d.items.length; more = d.hasMore && d.items.length > 0;
          setQueue(`Loading Hub users: ${out.length.toLocaleString()} loaded${pending.length ? ` | ${pending.length} pending` : ''}`);
        } catch (e) {
          if (!retryable(e) || pending.length > 15) throw e;
          pending.push(offset); offset += 100; group += 100;
        }
      }
      if (more) { setQueue(`Loaded ${out.length.toLocaleString()} users. Waiting 5 seconds before the next 500...`); await sleep(5000); }
    }
    for (const o of pending) { await sleep(5000); try { const d = await api(`hub-users-page&hubId=${encodeURIComponent(S.hub)}&limit=100&offset=${o}`); out.push(...d.items); } catch { /* ignore */ } }
    S.user.users = [...new Map(out.map((u) => [u.id, u])).values()]; S.user.loaded = true;
    flash(`Loaded ${S.user.users.length.toLocaleString()} Hub users.`);
    renderView();
  } finally { S.busyLock = false; }
}

/* --- company field edits */
function addField(kind, id) {
  const c = companyById(id), erp = kind === 'erp';
  openModal(`<h3>${erp ? 'Add ERP ID / S code' : 'Add Tax ID / ABN'}</h3><p class="muted">${esc(c.name)}</p>
    <div class="bar"><input id="fieldValue" class="input grow" placeholder="${erp ? 'ERP ID / S code' : 'Tax ID / ABN'}" value="${esc(erp ? c.erpId : c.taxId)}">
    <button class="btn" data-act="saveField" data-kind="${kind}" data-id="${esc(id)}">Save</button><button class="btn light" data-act="closeModal">Cancel</button></div>`);
  setTimeout(() => { const i = $('#fieldValue'); if (i) i.focus(); }, 30);
}
async function saveField(kind, id) {
  const v = $('#fieldValue').value.trim();
  if (!v) return showError('Enter a value before saving.');
  const body = { hubId: S.hub, companyId: id };
  body[kind === 'erp' ? 'erp_id' : 'tax_id'] = v;
  await api('company-update', { body });
  const c = companyById(id);
  if (kind === 'erp') c.erpId = v; else c.taxId = v;
  pushReports([{ Type: kind === 'erp' ? 'Add ERP ID' : 'Add Tax ID', Name: c.name, Result: 'Success', Detail: v }]);
  closeModal(); if (S.xdel.raw.length) xdelMatch(); renderView();
}
async function uploadLogo(id, file) {
  if (!file) return;
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
  await api('company-image', { body: { hubId: S.hub, companyId: id, fileName: file.name, mimeType: file.type, base64: data } });
  flash('Logo uploaded. Reload the directory to display the new image.');
  const c = companyById(id); pushReports([{ Type: 'Logo upload', Name: c && c.name, Result: 'Success' }]);
}

async function autoRename() {
  const prefix = ($('#renamePrefix').value || '').trim() || 'Not integrated company';
  const rows = filteredCompanies().filter((c) => S.cSel.has(c.id));
  if (!rows.length) return showError('Select at least one company first.');
  if (!confirm(`Rename ${rows.length} companies to "${prefix} 1" ... "${prefix} ${rows.length}"?`)) return;
  const done = [];
  for (let i = 0; i < rows.length; i += 50) {
    const d = await api('companies-bulk-rename', { body: { hubId: S.hub, prefix, startNumber: i + 1, companies: rows.slice(i, i + 50) } });
    done.push(...d.results);
    setQueue(`Auto rename: ${Math.min(i + 50, rows.length)} of ${rows.length}`, 100 * Math.min(i + 50, rows.length) / rows.length);
  }
  const ok = new Map(done.filter((r) => r.success).map((r) => [r.id, r.newName]));
  S.companies.forEach((c) => { if (ok.has(c.id)) c.name = ok.get(c.id); });
  pushReports(done.map((r) => ({ Type: 'Auto Rename', Name: r.oldName, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? r.newName : r.error })));
  S.cSel.clear(); flash(`Auto rename complete: ${ok.size} renamed, ${done.length - ok.size} failed.`); renderView();
}

const ERP_TEMPLATE = [{ 'Company ID': '', 'Company Name': 'Example Pty Ltd', 'ERP ID': 'S-200001', 'Tax ID': '12 345 678 901' }];
let ERP_ROWS = [];
function bulkErpTax() {
  openModal(`<h3>Bulk ERP / Tax update from Excel</h3>
    <p class="muted">Columns: <b>Company ID</b> or <b>Company Name</b>, plus <b>ERP ID</b> (S code) and/or <b>Tax ID</b>.</p>
    <div class="bar"><button class="btn light" data-act="erpTemplate">Download template</button><input type="file" accept=".xlsx,.xls,.csv" data-ch="erpFile"><button class="btn light" data-act="closeModal">Close</button></div><div id="erpPreview"></div>`, true);
}
async function erpFile(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') return showError('The Excel reader is not available. Check your internet connection and reload.');
  const wb = XLSX.read(await file.arrayBuffer());
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const byId = new Map(S.companies.map((c) => [c.id, c])), byName = new Map(S.companies.map((c) => [norm(c.name), c]));
  ERP_ROWS = raw.map((r, i) => {
    const id = String(r['Company ID'] || '').trim(), name = String(r['Company Name'] || r.Name || '').trim();
    return { row: i + 2, company: (id && byId.get(id)) || (name && byName.get(norm(name))), erp: String(r['ERP ID'] || r['S Code'] || '').trim(), tax: String(r['Tax ID'] || '').trim(), label: name || id };
  });
  const ready = ERP_ROWS.filter((r) => r.company && (r.erp || r.tax));
  $('#erpPreview').innerHTML = `<div class="notice">${ready.length} of ${ERP_ROWS.length} rows are ready.</div>
    ${tbl(['Row', 'Company', 'ERP ID', 'Tax ID', 'Match'], ERP_ROWS.slice(0, 300).map((r) => [r.row, esc(r.label), esc(r.erp), esc(r.tax), r.company ? '<span class="ok">Matched</span>' : '<span class="bad">Not in loaded directory</span>']))}
    <div class="bar" style="margin-top:12px"><button class="btn" data-act="applyErp" ${ready.length ? '' : 'disabled'}>Apply ${ready.length} updates</button></div>`;
}
async function applyErp() {
  const ready = ERP_ROWS.filter((r) => r.company && (r.erp || r.tax)), all = [];
  for (let i = 0; i < ready.length; i += 25) {
    const d = await api('companies-bulk-update', { body: { hubId: S.hub, items: ready.slice(i, i + 25).map((r) => ({ id: r.company.id, name: r.company.name, erp_id: r.erp, tax_id: r.tax })) } });
    all.push(...d.results);
    setQueue(`ERP/Tax update: ${Math.min(i + 25, ready.length)} of ${ready.length}`, 100 * Math.min(i + 25, ready.length) / ready.length);
  }
  const ok = new Set(all.filter((r) => r.success).map((r) => r.id));
  ready.forEach((r) => { if (ok.has(r.company.id)) { if (r.erp) r.company.erpId = r.erp; if (r.tax) r.company.taxId = r.tax; } });
  pushReports(all.map((r) => ({ Type: 'Bulk ERP/Tax', Name: r.name, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
  closeModal(); if (S.xdel.raw.length) xdelMatch(); flash(`ERP/Tax update complete: ${ok.size} updated, ${all.length - ok.size} failed.`); renderView();
}

/* ======================================================== DELETE BY S CODE */
/* Column aliases. Workday "Find Suppliers" export and the template are both recognised. */
const XCOLS = {
  code: ['s code', 'scode', 's-code', 'supplier id', 'supplier code', 'erp id', 'erp', 'erp_id', 'workday id', 'vendor id'],
  name: ['supplier name', 'company name', 'forma company', 'company', 'name', 'supplier'],
  status: ['supplier status', 'status', 'workday status'],
  alt: ['alternate name', 'old code', 'legacy code', 'alternate code'],
  id: ['company id', 'forma company id', 'acc company id'],
  reason: ['reason', 'comment', 'comments', 'note']
};
const XDEL_TEMPLATE = [
  { 'S Code': 'S-200017', 'Supplier Name': 'A_Space Australia Pty Ltd', 'Status': 'Inactive', 'Reason': 'Inactive in Workday' },
  { 'S Code': 'S-205598', 'Supplier Name': 'Telstra - Satellite Services', 'Status': 'Hold', 'Reason': 'On hold in Workday' }
];
function detectColumns(headers) {
  const lower = headers.map((h) => norm(h));
  const out = {};
  for (const [key, aliases] of Object.entries(XCOLS)) {
    const hit = aliases.map((a) => lower.indexOf(a)).find((i) => i >= 0);
    out[key] = hit != null && hit >= 0 ? headers[hit] : '';
  }
  if (out.name && out.name === out.code) out.name = '';
  return out;
}
/* Find the header row (Workday exports sometimes have title rows above the header). */
function sheetRows(ws) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerIdx = 0;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cols = detectColumns(grid[i].map((x) => String(x)));
    if (cols.code) { headerIdx = i; break; }
  }
  const headers = (grid[headerIdx] || []).map((h, i) => String(h || `Column ${i + 1}`).trim());
  const rows = grid.slice(headerIdx + 1).map((arr) => { const o = {}; headers.forEach((h, i) => { o[h] = arr[i] == null ? '' : arr[i]; }); return o; });
  return { headers, rows, headerRow: headerIdx + 1 };
}
async function xdelFile(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') return showError('The Excel reader is not available. Check your internet connection and reload.');
  const X = S.xdel;
  X.wb = XLSX.read(await file.arrayBuffer());
  X.file = file.name;
  X.sheets = X.wb.SheetNames.map((n) => ({ n, count: Math.max(0, sheetRows(X.wb.Sheets[n]).rows.length) }));
  const best = X.wb.SheetNames.find((n) => detectColumns(sheetRows(X.wb.Sheets[n]).headers).code) || X.wb.SheetNames[0];
  xdelLoadSheet(best);
}
function xdelLoadSheet(name) {
  const X = S.xdel;
  X.sheet = name;
  const { headers, rows, headerRow } = sheetRows(X.wb.Sheets[name]);
  X.headers = headers; X.raw = rows; X.headerRow = headerRow;
  X.cols = detectColumns(headers);
  X.filter = 'all'; X.search = ''; X.limit = PAGE_STEP;
  xdelMatch();
  renderView();
}

/* Matching: S code vs Hub ERP ID (exact, after removing spaces/dashes). Optional fallbacks: old code (Alternate Name) and name. */
function xdelMatch() {
  const X = S.xdel, c = X.cols;
  const byCode = new Map();
  for (const co of S.companies) for (const t of codeTokens(co.erpId)) { if (!byCode.has(t)) byCode.set(t, []); byCode.get(t).push(co); }
  const byId = new Map(S.companies.map((co) => [String(co.id).toLowerCase(), co]));
  const byName = new Map();
  for (const co of S.companies) { const k = coreName(co.name); if (k) { if (!byName.has(k)) byName.set(k, []); byName.get(k).push(co); } }
  const seenCompany = new Map(), seenCode = new Map();
  X.rows = X.raw.map((r, i) => {
    const code = String(c.code ? r[c.code] : '').trim(), name = String(c.name ? r[c.name] : '').trim();
    const wstatus = String(c.status ? r[c.status] : '').trim(), alt = String(c.alt ? r[c.alt] : '').trim();
    const fid = String(c.id ? r[c.id] : '').trim(), reason = String(c.reason ? r[c.reason] : '').trim();
    const row = { key: `r${i}`, row: i + 1 + X.headerRow, code, name, wstatus, alt, fid, reason, company: null, candidates: [], by: '', status: '', detail: '' };
    if (!code && !name && !fid) { row.status = 'Empty row'; return row; }
    if (!S.companiesLoaded) { row.status = 'Load companies'; return row; }
    const ck = codeKey(code);
    if (ck && seenCode.has(ck)) { row.status = 'Duplicate row'; row.detail = `Same S code as row ${seenCode.get(ck)}`; return row; }
    if (ck) seenCode.set(ck, row.row);
    const live = (list) => (list || []).filter((x) => x.status !== 'deleted');
    let list = [];
    if (fid && byId.has(fid.toLowerCase())) { list = [byId.get(fid.toLowerCase())]; row.by = 'Company ID'; }
    if (!list.length && ck) { list = live(byCode.get(ck)); if (list.length) row.by = 'S code = ERP ID'; }
    if (!list.length && X.opts.altCode && alt) { const ak = codeKey(alt); list = live(byCode.get(ak)); if (list.length) row.by = 'Old code (Alternate Name) = ERP ID'; }
    if (!list.length && X.opts.nameFallback && name) { list = live(byName.get(coreName(name))); if (list.length) row.by = 'Name only'; }
    row.candidates = list;
    if (!list.length) { row.status = 'Not in Hub'; row.detail = ck ? `No Hub company has ERP ID ${code}` : 'No S code in this row'; return row; }
    if (list.length > 1) { row.status = 'Multiple matches'; row.detail = `${list.length} Hub companies: ${list.slice(0, 4).map((x) => `${x.name} [${x.erpId || 'no ERP'}]`).join('; ')}`; return row; }
    row.company = list[0];
    if (seenCompany.has(row.company.id)) { row.status = 'Duplicate row'; row.detail = `Same Hub company as row ${seenCompany.get(row.company.id)}`; return row; }
    seenCompany.set(row.company.id, row.row);
    row.status = 'Match';
    const notes = [];
    if (row.by !== 'S code = ERP ID' && row.by !== 'Company ID') notes.push(`Matched by ${row.by.toLowerCase()} - check`);
    if (name && coreName(name) !== coreName(row.company.name)) notes.push('Hub name differs from Workday name - check');
    if (wstatus && !/inactive/i.test(wstatus)) notes.push(`Workday status is ${wstatus}, not Inactive`);
    if (row.company.erpId && ck && !codeTokens(row.company.erpId).includes(ck) && row.by === 'Name only') notes.push(`Hub ERP ID is ${row.company.erpId}`);
    if ((row.company.members || 0) > 0) notes.push(`${plural(row.company.members, 'project member')} will be removed`);
    row.detail = notes.join('. ');
    row.check = notes.some((n) => /check|not Inactive/.test(n));
    return row;
  });
  X.sel = new Set([...X.sel].filter((k) => { const r = X.rows.find((x) => x.key === k); return r && r.status === 'Match'; }));
}
const XDEL_FILTERS = [
  ['all', 'All rows', () => true],
  ['Match', 'In Hub (match)', (r) => r.status === 'Match'],
  ['exact', 'S code = ERP ID', (r) => r.status === 'Match' && r.by === 'S code = ERP ID' && !r.check],
  ['check', 'Match, but check', (r) => r.status === 'Match' && r.check],
  ['members', 'Match with project members', (r) => r.status === 'Match' && (r.company.members || 0) > 0],
  ['hold', 'Workday status not Inactive', (r) => r.wstatus && !/inactive/i.test(r.wstatus)],
  ['Not in Hub', 'Not in Hub', (r) => r.status === 'Not in Hub'],
  ['Multiple matches', 'Multiple Hub matches', (r) => r.status === 'Multiple matches'],
  ['Duplicate row', 'Duplicate rows', (r) => r.status === 'Duplicate row'],
  ['Deleted', 'Deleted in this session', (r) => r.status === 'Deleted'],
  ['Not deleted', 'Delete failed / kept', (r) => r.status === 'Not deleted']
];
const xdelSelectable = (r) => r.status === 'Match';
function xdelRows() {
  const X = S.xdel, q = X.search.trim().toLowerCase();
  const f = (XDEL_FILTERS.find((x) => x[0] === X.filter) || XDEL_FILTERS[0])[2];
  return onlySel('xdelSel', X.rows.filter((r) => f(r) && hasText([r.code, r.name, r.wstatus, r.alt, r.reason, r.company && r.company.name, r.company && r.company.erpId, r.status, r.detail], q)), (r) => r.key);
}

VIEWS.xdel = () => {
  const X = S.xdel, rows = xdelRows(), shown = rows.slice(0, X.limit);
  const count = (k) => X.rows.filter((XDEL_FILTERS.find((x) => x[0] === k) || XDEL_FILTERS[0])[2]).length;
  const sel = X.rows.filter((r) => X.sel.has(r.key) && xdelSelectable(r));
  const members = sel.reduce((n, r) => n + (r.company.members || 0), 0);
  const stCls = (k) => ({ Match: 'good', exact: 'good', check: 'warn', members: 'warn', hold: 'warn', 'Multiple matches': 'warn', 'Duplicate row': 'warn', 'Not in Hub': 'bad', 'Not deleted': 'bad' }[k] || '');
  const rowCls = (r) => (r.status === 'Match' ? (r.check ? 'warn' : 'good') : r.status === 'Deleted' ? '' : r.status === 'Not in Hub' || r.status === 'Not deleted' ? 'bad' : 'warn');
  const colSel = (key, label) => `<label class="small"><b>${label}</b><select class="select" data-ch="xdelCol" data-k="${key}"><option value="">(none)</option>${X.headers.map((h) => `<option ${X.cols[key] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`;
  const inHub = count('Match'), total = X.rows.filter((r) => r.status !== 'Empty row').length;
  return `<div class="card"><h3>Delete Hub companies by Workday S code</h3>
    <p class="muted">Upload the Workday supplier export (for example <b>Find Suppliers</b> with Inactive / Hold suppliers) or the template. Each <b>S code</b> (Supplier ID) is compared with the <b>ERP ID</b> of every Hub company. Matching companies are listed so you can select and delete them. Dashes and spaces are ignored, so <b>S-205598</b> matches <b>S205598</b>.</p>
    <div class="bar"><button class="btn light" data-act="xdelTemplate">Download template</button>
      <input type="file" accept=".xlsx,.xls,.csv" data-ch="xdelFile">
      ${S.companiesLoaded ? `<span class="badge good">${S.companies.length.toLocaleString()} Hub companies loaded &middot; ${S.companies.filter((c) => c.erpId).length.toLocaleString()} with ERP ID</span>` : '<button class="btn" data-act="loadCompanies">Load Hub companies (required)</button>'}</div>
    ${X.file ? `<div class="bar"><span class="badge">${esc(X.file)}</span>
      <label class="small"><b>Sheet</b><select class="select" data-ch="xdelSheet">${X.sheets.map((s) => `<option value="${esc(s.n)}" ${s.n === X.sheet ? 'selected' : ''}>${esc(s.n)} (${s.count} rows)</option>`).join('')}</select></label>
      ${colSel('code', 'S code column')}${colSel('name', 'Name column')}${colSel('status', 'Status column')}${colSel('alt', 'Old code column')}</div>
      <div class="bar chips"><b>Also match by</b>${chip('altCode', 'Old code (Alternate Name) = ERP ID', X.opts.altCode, 'xdelOpt')}${chip('nameFallback', 'Name when no S code match', X.opts.nameFallback, 'xdelOpt')}<span class="muted small">Fallback matches are always flagged "check".</span></div>
      ${!X.cols.code ? '<div class="error">No S code column found. Choose it in "S code column" above.</div>' : ''}` : ''}</div>
  ${X.rows.length ? `<div class="stats compact">
      <div class="stat"><span>Rows in file</span><b>${total.toLocaleString()}</b></div>
      <div class="stat"><span>Found in Hub</span><b>${inHub.toLocaleString()}</b><small>${count('exact').toLocaleString()} exact S code</small></div>
      <div class="stat"><span>Not in Hub</span><b>${count('Not in Hub').toLocaleString()}</b><small>nothing to delete</small></div>
      <div class="stat"><span>Need checking</span><b>${(count('check') + count('Multiple matches')).toLocaleString()}</b></div></div>
  <div class="card">
    <div class="bar chips"><b>Show</b>${XDEL_FILTERS.filter(([k]) => k === 'all' || count(k)).map(([k, label]) => `<button class="badge ${stCls(k)} clickable ${X.filter === k ? 'sel' : ''}" data-act="xdelFilter" data-k="${esc(k)}">${esc(label)}: ${count(k).toLocaleString()}</button>`).join('')}</div>
    <div class="bar"><input id="xdelSearch" class="input grow" data-in="xdelSearch" placeholder="Search S code, Workday name, Hub name, ERP ID or note" value="${esc(X.search)}"><span class="badge">${rows.length.toLocaleString()} shown</span></div>
    <div class="bar">${selBar('xdelSel')}<button class="btn soft" data-act="xdelSelectExact">Select exact S code matches</button><button class="btn light" data-act="xdelExport">Export Comparison Report</button></div>
    <div class="dangerbox"><div class="bar"><b>Delete from Hub</b><span class="muted small">Removes every project member of each selected company, then deletes the company. A company is kept if any member cannot be removed or any project cannot be read.</span></div>
      <div class="bar"><button class="btn danger" data-act="xdelDelete" ${X.running || !sel.length ? 'disabled' : ''}>Delete ${companies(sel.length)}</button>
        ${sel.length ? `<span class="muted small">${sel.filter((r) => r.by === 'S code = ERP ID').length} exact S code &middot; ${sel.filter((r) => r.check).length} flagged check &middot; ${members} project members will be removed</span>` : '<span class="muted small">Only rows found in the Hub can be selected.</span>'}</div></div>
    ${tbl(['Select', 'Row', 'Workday S code', 'Workday supplier', 'Workday status', 'Hub company', 'Hub ERP ID', 'Members / projects', 'Matched by', 'Result', 'Detail'],
      shown.map((r) => [xdelSelectable(r) ? rowBox('xdelSel', r.key, X.sel.has(r.key)) : '<span class="muted">-</span>', r.row,
        `<b>${esc(r.code)}</b>${r.alt ? `<div class="muted small">old ${esc(r.alt)}</div>` : ''}`, esc(r.name), esc(r.wstatus),
        r.company ? esc(r.company.name) : '<span class="muted">-</span>', r.company ? esc(r.company.erpId) : '',
        r.company ? `${r.company.members || 0} / ${r.company.projects || 0}` : '',
        esc(r.by), `<span class="badge ${rowCls(r)}">${esc(r.status === 'Match' ? (r.check ? 'In Hub - check' : 'In Hub') : r.status)}</span>`, `<span class="small">${esc(r.detail)}</span>`]), 'No rows match.')}
    ${moreBtn('xdelLimit', shown.length, rows.length)}</div>` : ''}`;
};
async function xdelDelete() {
  const X = S.xdel;
  const rows = X.rows.filter((r) => X.sel.has(r.key) && xdelSelectable(r));
  const list = rows.map((r) => r.company);
  if (!list.length) return showError('Select Hub companies to delete first.');
  const members = list.reduce((n, c) => n + (c.members || 0), 0);
  const msg = `Delete ${companies(list.length)} from the Hub?\n\n` +
    `- ${rows.filter((r) => r.by === 'S code = ERP ID').length} matched by exact S code\n- ${rows.filter((r) => r.by !== 'S code = ERP ID').length} matched by old code, Company ID or name\n- ${rows.filter((r) => r.check).length} flagged "check"\n\n` +
    `${members} project member(s) will be removed from their projects first.\nExport the comparison report before continuing.\n\nType DELETE to continue.`;
  if (prompt(msg) !== 'DELETE') return;
  X.running = true; renderView();
  try {
    const { deleted, kept } = await purgeCompanyList(list, 'Delete by S code');
    rows.forEach((r) => {
      if (deleted.has(r.company.id)) { r.status = 'Deleted'; r.detail = 'Deleted from Hub'; X.sel.delete(r.key); }
      else { r.status = 'Not deleted'; r.detail = kept.get(r.company.id) || 'See Reports'; }
    });
    flash(`Delete complete: ${deleted.size} deleted, ${list.length - deleted.size} kept. Export the comparison report for the full result.`);
  } catch (e) { showError(e.message); }
  finally { X.running = false; setQueue(null); renderView(); }
}
function xdelExport() {
  const X = S.xdel;
  const row = (r) => ({
    Row: r.row, 'Workday S code': r.code, 'Workday supplier': r.name, 'Workday status': r.wstatus, 'Old code': r.alt,
    'Hub company': r.company ? r.company.name : (r.candidates || []).map((x) => x.name).join('; '), 'Hub ERP ID': r.company ? r.company.erpId : (r.candidates || []).map((x) => x.erpId).join('; '),
    'Hub Company ID': r.company ? r.company.id : '', Members: r.company ? r.company.members : '', Projects: r.company ? r.company.projects : '',
    'Matched by': r.by, Result: r.status === 'Match' ? (r.check ? 'In Hub - check' : 'In Hub') : r.status, Detail: r.detail
  });
  if (typeof XLSX === 'undefined') return exportRows('S_Code_Comparison.xlsx', X.rows.map(row), 'Comparison');
  const wb = XLSX.utils.book_new();
  const cnt = (k) => X.rows.filter((XDEL_FILTERS.find((x) => x[0] === k) || XDEL_FILTERS[0])[2]).length;
  addSheet(wb, 'Summary', [
    { Item: 'File', Value: X.file }, { Item: 'Rows', Value: X.rows.filter((r) => r.status !== 'Empty row').length },
    { Item: 'Found in Hub', Value: cnt('Match') }, { Item: 'Exact S code = ERP ID', Value: cnt('exact') }, { Item: 'Match, but check', Value: cnt('check') },
    { Item: 'Not in Hub', Value: cnt('Not in Hub') }, { Item: 'Multiple Hub matches', Value: cnt('Multiple matches') }, { Item: 'Duplicate rows', Value: cnt('Duplicate row') },
    { Item: 'Deleted', Value: cnt('Deleted') }, { Item: 'Delete failed / kept', Value: cnt('Not deleted') }
  ]);
  addSheet(wb, 'All Rows', X.rows.map(row));
  addSheet(wb, 'In Hub', X.rows.filter((r) => r.status === 'Match' || r.status === 'Deleted' || r.status === 'Not deleted').map(row));
  addSheet(wb, 'Check', X.rows.filter((r) => (r.status === 'Match' && r.check) || r.status === 'Multiple matches').map(row));
  addSheet(wb, 'Not in Hub', X.rows.filter((r) => r.status === 'Not in Hub').map(row));
  addSheet(wb, 'Deleted', X.rows.filter((r) => r.status === 'Deleted').map(row));
  XLSX.writeFile(wb, `S_Code_Comparison_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ======================================================== ABN LOOKUP */
function abnScope() {
  const A = S.abn;
  if (A.scope === 'selected') return S.companies.filter((c) => S.cSel.has(c.id));
  if (A.scope === 'all') return liveCompanies();
  return filteredCompanies().filter((c) => c.status !== 'deleted');
}
function abnChanges(r) {
  const A = S.abn, c = companyById(r.id), d = r.abr;
  const out = {};
  if (!c || !d || !/active/i.test(d.status) || isDeleted(r)) return out;
  const digits = digitsOnly(c.taxId);
  if (A.opts.fillTax && (!c.taxId || (A.opts.overwrite && digits !== d.abn))) out.tax_id = fmtAbn(d.abn);
  if (A.opts.address) {
    if (d.state && (!c.state || (A.opts.overwrite && norm(c.state) !== norm(d.state)))) out.state_or_province = d.state;
    if (d.postcode && (!c.postcode || (A.opts.overwrite && c.postcode !== d.postcode))) out.postal_code = d.postcode;
    if ((out.state_or_province || out.postal_code) && !c.country) out.country = 'Australia';
  }
  return out;
}
function refreshAbnChanges() { S.abn.rows.forEach((r) => { const ch = abnChanges(r); r.changes = Object.keys(ch).length ? ch : null; }); }

VIEWS.abn = () => {
  const A = S.abn, scope = abnScope(), rows = abnRows(), shown = rows.slice(0, A.limit);
  const live = A.rows.filter((r) => !isDeleted(r));
  const counts = MATCH_TYPES.map((t) => [t, live.filter((r) => r.match === t).length]).filter(([, n]) => n);
  const nCancelled = live.filter(isCancelled).length, nNoMatch = live.filter(isNoMatch).length, nDeleted = A.rows.filter(isDeleted).length;
  const pct = A.total ? Math.round(100 * A.done / A.total) : 0;
  const selRows = A.rows.filter((r) => A.sel.has(r.id) && !isDeleted(r));
  const changeText = (r) => (r.changes ? Object.entries(r.changes).map(([k, v]) => `<div><span class="muted small">${{ tax_id: 'Tax ID', state_or_province: 'State', postal_code: 'Postcode', country: 'Country' }[k]}</span> ${esc(v)}</div>`).join('') : '<span class="muted">-</span>');
  const matchCls = (m) => (m === 'ABN match' || m === 'Exact name match' ? 'good' : m === 'Close name match' || m.startsWith('Name match') ? 'warn' : 'bad');
  const quickF = (k, label, n, cls) => `<button class="badge ${cls} clickable ${A.match === k ? 'sel' : ''}" data-act="abnFilter" data-k="${k}">${label}: ${n}</button>`;
  return `<div class="card"><h3>Check companies against the Australian Business Register</h3>
    <p class="muted">The app uses the Forma <b>Tax ID</b> if it is a valid ABN, otherwise it searches ABN Lookup by <b>company name</b>. Matches can fill the missing ABN, <b>state</b> and <b>postcode</b> (ABR does not publish street addresses).</p>
    <div class="bar"><b>ABN Lookup GUID</b>
      <input id="abrGuid" class="input grow" data-in="abrGuid" type="password" placeholder="${S.abrConfigured ? 'Using ABR_GUID from Vercel (optional override)' : 'Paste the GUID emailed to you by ABR'}" value="${esc(A.guid)}">
      <a class="btn light" href="https://abr.business.gov.au/Tools/WebServices" target="_blank" rel="noopener">Get a free GUID</a></div>
    <div class="bar"><b>Companies to check</b>
      <select class="select" data-ch="abnScope">
        <option value="filtered" ${A.scope === 'filtered' ? 'selected' : ''}>Current Company Directory filter</option>
        <option value="selected" ${A.scope === 'selected' ? 'selected' : ''}>Selected companies only</option>
        <option value="all" ${A.scope === 'all' ? 'selected' : ''}>All active companies</option></select>
      <span class="badge">${companies(scope.length)}</span>
      ${A.running ? `<button class="btn danger" data-act="abnStop">Stop</button>` : `<button class="btn" data-act="abnRun" ${scope.length && S.companiesLoaded ? '' : 'disabled'}>Run ABN Lookup</button>`}
      ${S.companiesLoaded ? '' : '<button class="btn soft" data-act="loadCompanies">Load companies first</button>'}</div>
    ${A.running || A.done ? `<div class="notice"><b>${A.running ? 'Checking ABN Lookup...' : 'Lookup finished.'}</b> ${A.done} of ${A.total} companies<div class="progress"><div style="width:${pct}%"></div></div></div>` : ''}</div>
  ${A.rows.length ? `<div class="card">
    <div class="bar chips"><b>Results</b>${counts.map(([t, n]) => quickF(t, t, n, matchCls(t))).join('')}
      ${quickF('cancelled', 'Cancelled ABN', nCancelled, 'bad')}${quickF('problems', 'Cancelled + not matched', nCancelled + nNoMatch, 'bad')}
      ${quickF('ready', 'Ready to apply', live.filter(isReady).length, 'good')}${nDeleted ? quickF('deleted', 'Deleted', nDeleted, '') : ''}${quickF('all', 'All', A.rows.length, '')}</div>
    <div class="bar"><input id="abnSearch" class="input grow" data-in="abnSearch" placeholder="Search company, ABN, ABR name or note" value="${esc(A.search)}">
      <select class="select" data-ch="abnMatch">${ABN_FILTERS.map(([k, label]) => `<option value="${esc(k)}" ${A.match === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
      <span class="badge">${rows.length.toLocaleString()} shown</span></div>
    <div class="bar">${selBar('abnSel')}</div>
    <div class="actionbox">
      <div class="bar"><b>Update Forma</b>
        ${chip('fillTax', 'Fill missing Tax ID with ABN', A.opts.fillTax, 'abnOpt')}${chip('address', 'Fill missing state and postcode', A.opts.address, 'abnOpt')}${chip('overwrite', 'Overwrite existing values that differ', A.opts.overwrite, 'abnOpt')}</div>
      <div class="bar"><button class="btn soft" data-act="abnSelectReady">Select rows ready to apply</button>
        <button class="btn" data-act="abnApply" ${A.running ? 'disabled' : ''}>Apply ${selRows.filter((r) => r.changes).length} selected updates to Forma</button>
        <button class="btn light" data-act="abnExport">Export Report</button></div></div>
    <div class="dangerbox">
      <div class="bar"><b>Delete companies</b><span class="muted small">Removes every project member of the selected companies, then deletes the companies.</span></div>
      <div class="bar"><button class="btn danger" data-act="abnDelete" ${A.running || !selRows.length ? 'disabled' : ''}>Delete ${companies(selRows.length)} selected</button></div></div>
    ${tbl(['Select', 'Forma company', 'Members / projects', 'Forma Tax ID', 'Match', 'ABN', 'ABR registered name', 'ABN status', 'ABR state / postcode', 'Changes to apply', 'Note / result'],
      shown.map((r) => {
        const d = r.abr, c = companyById(r.id) || {};
        return [isDeleted(r) ? '<span class="muted">-</span>' : rowBox('abnSel', r.id, A.sel.has(r.id)), esc(r.name),
          isDeleted(r) ? '<span class="muted">deleted</span>' : `${c.members || 0} / ${c.projects || 0}`,
          esc(c.taxId || r.taxId),
          `<span class="badge ${matchCls(r.match)}">${esc(r.match)}</span>${r.confidence ? `<div class="muted small">${r.confidence}% name similarity</div>` : ''}`,
          d ? `<a href="https://abr.business.gov.au/ABN/View?abn=${esc(d.abn)}" target="_blank" rel="noopener">${esc(fmtAbn(d.abn))}</a>` : '',
          d ? esc(d.entityName) + (d.businessNames.length ? `<div class="muted small">Trading as: ${esc(d.businessNames.slice(0, 3).join(', '))}</div>` : '') : '',
          d ? `<span class="${/active/i.test(d.status) ? 'ok' : 'bad'}">${esc(d.status)}</span>` : '',
          d ? esc(`${d.stateCode} ${d.postcode}`.trim()) : '', changeText(r),
          `${r.note ? esc(r.note) : ''}${r.result ? `<div class="${r.result === 'Updated' || r.result === 'Deleted' ? 'ok' : 'bad'}">${esc(r.result)}${r.error ? ': ' + esc(r.error) : ''}</div>` : ''}`];
      }), 'No rows match.')}
    ${moreBtn('abnLimit', shown.length, rows.length)}</div>` : ''}`;
};

async function abnRun() {
  const A = S.abn, list = abnScope();
  if (!list.length) return showError('No companies to check.');
  if (!A.guid && !S.abrConfigured) return showError('Enter your ABN Lookup GUID first. Register free at abr.business.gov.au.');
  A.rows = []; A.sel.clear(); A.running = true; A.stop = false; A.done = 0; A.total = list.length; A.match = 'all'; renderView();
  try {
    for (let i = 0; i < list.length && !A.stop; i += 20) {
      const chunk = list.slice(i, i + 20).map((c) => ({ id: c.id, name: c.name, taxId: c.taxId, state: c.state, postcode: c.postcode }));
      let d;
      try { d = await api('abr-match', { body: { guid: A.guid, companies: chunk } }); }
      catch (e) {
        if (e.status === 400) throw e;
        await sleep(3000);
        d = await api('abr-match', { body: { guid: A.guid, companies: chunk } }).catch((e2) => ({ results: chunk.map((c) => ({ id: c.id, name: c.name, taxId: c.taxId, match: 'Lookup error', note: e2.message })) }));
      }
      A.rows.push(...d.results);
      A.done = Math.min(i + 20, list.length);
      refreshAbnChanges();
      renderView();
    }
    flash(`ABN Lookup complete: ${A.rows.filter((r) => r.abr).length} of ${A.rows.length} companies matched.`);
  } catch (e) {
    showError(e.message);
  } finally { A.running = false; renderView(); }
}
async function abnApply() {
  const A = S.abn;
  refreshAbnChanges();
  const rows = A.rows.filter((r) => A.sel.has(r.id) && r.changes);
  if (!rows.length) return showError('Tick at least one row that has changes to apply. Tip: use "Select rows ready to apply".');
  if (!confirm(`Update ${companies(rows.length)} in Forma with ABN Lookup data?`)) return;
  const all = [];
  for (let i = 0; i < rows.length; i += 25) {
    const items = rows.slice(i, i + 25).map((r) => ({ id: r.id, name: r.name, ...r.changes }));
    const d = await api('companies-bulk-update', { body: { hubId: S.hub, items } });
    all.push(...d.results);
    setQueue(`Updating Forma: ${Math.min(i + 25, rows.length)} of ${rows.length}`, 100 * Math.min(i + 25, rows.length) / rows.length);
  }
  all.forEach((res) => {
    const r = A.rows.find((x) => x.id === res.id), c = companyById(res.id);
    if (!r) return;
    r.result = res.success ? 'Updated' : 'Failed'; r.error = res.error || ''; r.applied = res.sent;
    if (res.success && c) {
      if (res.sent.tax_id) c.taxId = res.sent.tax_id;
      if (res.sent.state_or_province) c.state = res.sent.state_or_province;
      if (res.sent.postal_code) c.postcode = res.sent.postal_code;
      if (res.sent.country) c.country = res.sent.country;
      A.sel.delete(res.id);
    }
  });
  refreshAbnChanges();
  pushReports(all.map((x) => ({ Type: 'ABN Lookup update', Name: x.name, Result: x.success ? 'Success' : 'Failed', Detail: x.success ? Object.entries(x.sent).map(([k, v]) => `${k}=${v}`).join('; ') : x.error })));
  const ok = all.filter((x) => x.success).length;
  setQueue(null); flash(`Forma updated: ${ok} companies, ${all.length - ok} failed.`); renderView();
}
async function abnDelete() {
  const A = S.abn;
  const rows = A.rows.filter((r) => A.sel.has(r.id) && !isDeleted(r));
  const list = rows.map((r) => companyById(r.id)).filter(Boolean);
  if (!list.length) return showError('Select the companies to delete first.');
  const members = list.reduce((n, c) => n + (c.members || 0), 0);
  if (prompt(`Delete ${companies(list.length)} from Forma?\n\n${members} project member(s) will be removed first.\n\nType DELETE to continue.`) !== 'DELETE') return;
  A.running = true; renderView();
  try {
    const { deleted, kept } = await purgeCompanyList(list, 'ABN Lookup delete');
    rows.forEach((r) => {
      if (deleted.has(r.id)) { r.result = 'Deleted'; r.error = ''; r.changes = null; A.sel.delete(r.id); }
      else { r.result = 'Not deleted'; r.error = kept.get(r.id) || 'See Reports'; }
    });
    flash(`Delete complete: ${deleted.size} deleted, ${list.length - deleted.size} kept.`);
  } catch (e) { showError(e.message); }
  finally { A.running = false; setQueue(null); renderView(); }
}
function abnExport() {
  const A = S.abn;
  if (typeof XLSX === 'undefined') return exportRows('ABN_Lookup_Report.xlsx', A.rows.map(abnReportRow), 'Report');
  const wb = XLSX.utils.book_new();
  const summary = MATCH_TYPES.map((t) => ({ Category: t, Companies: A.rows.filter((r) => r.match === t).length }));
  summary.push({ Category: 'Cancelled / inactive ABN', Companies: A.rows.filter(isCancelled).length });
  summary.push({ Category: 'Updated in Forma', Companies: A.rows.filter((r) => r.result === 'Updated').length });
  summary.push({ Category: 'Deleted from Forma', Companies: A.rows.filter(isDeleted).length });
  addSheet(wb, 'Summary', summary);
  addSheet(wb, 'All Companies', A.rows.map(abnReportRow));
  addSheet(wb, 'Updated', A.rows.filter((r) => r.result === 'Updated').map(abnReportRow));
  addSheet(wb, 'Deleted', A.rows.filter(isDeleted).map(abnReportRow));
  addSheet(wb, 'Cancelled ABN', A.rows.filter(isCancelled).map(abnReportRow));
  addSheet(wb, 'Needs Review', A.rows.filter(isReview).map(abnReportRow));
  addSheet(wb, 'No Match', A.rows.filter(isNoMatch).map(abnReportRow));
  XLSX.writeFile(wb, `ABN_Lookup_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
function abnReportRow(r) {
  const d = r.abr || {}, c = companyById(r.id) || {};
  return {
    'Company ID': r.id, 'Forma company': r.name, 'ERP ID': c.erpId || '', 'Forma Tax ID (original)': r.taxId || '', 'Match type': r.match, 'Name similarity %': r.confidence || '',
    ABN: d.abn ? fmtAbn(d.abn) : '', 'ABR entity name': d.entityName || '', 'ABR business names': (d.businessNames || []).join('; '), 'ABN status': d.status || '',
    'ABR state': d.state || '', 'ABR postcode': d.postcode || '',
    'Changes proposed': r.changes ? Object.entries(r.changes).map(([k, v]) => `${k}=${v}`).join('; ') : '',
    'Changes applied': r.applied ? Object.entries(r.applied).map(([k, v]) => `${k}=${v}`).join('; ') : '',
    Result: r.result || 'No action', Error: r.error || '', Note: r.note || '', Members: c.members || 0, Projects: c.projects || 0
  };
}

/* --- membership scanning shared by audit, purge and replace */
async function scanMemberships(companyIds, onProgress) {
  await loadProjects();
  const found = [], errors = [], total = S.projects.length;
  for (let i = 0; i < total; i += 30) {
    const d = await api('project-users-batch', { body: { projects: S.projects.slice(i, i + 30), companyIds } });
    found.push(...d.items); errors.push(...d.errors);
    if (onProgress) onProgress(Math.min(i + 30, total), total);
  }
  return { found, errors };
}

/* --- company audit */
function auditProgressHtml(st) {
  const pct = st.total ? Math.round(100 * st.checked / st.total) : 0;
  return `<b>Loading projects and members...</b><div class="progress"><div style="width:${pct}%"></div></div>${pct}% complete (${st.checked} of ${st.total} projects). Results appear when loading reaches 100%.`;
}
function auditFinalHtml(st) {
  const q = (st.search || '').toLowerCase();
  const members = st.members.filter((m) => hasText([m.projectName, m.projectStatus, m.name, m.email, m.status, roleNames(m.roles)], q));
  const byProject = new Map();
  members.forEach((m) => byProject.set(m.projectId, { name: m.projectName, status: m.projectStatus, platform: m.projectPlatform || '', count: (byProject.has(m.projectId) ? byProject.get(m.projectId).count : 0) + 1 }));
  const hubUsers = st.hubUsers || [];
  const staleMembers = Math.max(0, Number(st.company.members || 0) - st.members.length);
  const staleProjects = Math.max(0, Number(st.company.projects || 0) - byProject.size);
  const safe = !st.members.length && !hubUsers.length && !st.errors.length;
  return `<div class="bar"><h3 class="grow">${esc(st.company.name)}</h3><span class="badge good">100% loaded - ${st.total} projects checked</span><button class="btn light" data-act="closeModal">Close</button></div>
    ${st.errors.length ? `<div class="error">${st.errors.length} project(s) could not be read. Deletion is blocked until these projects can be checked.</div>` : ''}
    <div class="stats compact">
      <div class="stat"><span>Directory counter</span><b>${st.company.members || 0} / ${st.company.projects || 0}</b><small>members / projects reported by Autodesk</small></div>
      <div class="stat"><span>Found memberships</span><b>${st.members.length}</b><small>across ${byProject.size} accessible projects</small></div>
      <div class="stat"><span>Hub default users</span><b>${hubUsers.length}</b><small>users whose Hub company is this company</small></div>
      <div class="stat"><span>Unresolved counter</span><b>${staleMembers} / ${staleProjects}</b><small>${staleMembers || staleProjects ? 'likely archived, inaccessible, legacy or stale Autodesk references' : 'fully reconciled'}</small></div>
    </div>
    <div class="notice"><b>Dependency result:</b> ${safe ? 'No visible project membership, Hub-default user or unreadable project remains. The company can be safely marked deleted.' : 'Resolve the records below before deletion.'}</div>
    <div class="bar"><input id="auditSearch" class="input grow" data-in="auditSearch" placeholder="Search projects, members, email, role or status" value="${esc(st.search || '')}">
      <button class="btn soft" data-act="auditSelectAll">Select All Filtered</button><button class="btn light" data-act="auditClear">Deselect All</button>
      <span class="badge">${st.sel.size} selected</span><button class="btn danger" data-act="auditRemove" ${st.sel.size ? '' : 'disabled'}>Remove Selected From Projects</button>
      <button class="btn light" data-act="auditExport">Export Excel</button></div>
    <h4>Project memberships (${byProject.size})</h4>${tbl(['Project', 'Status', 'Platform', 'Members from this company'], [...byProject.values()].map((p) => [esc(p.name), esc(p.status), esc(p.platform), p.count]), 'No accessible project memberships found for this company.')}
    <h4>Members (${members.length})</h4>${tbl(['Select', 'Project', 'Member', 'Email', 'Status', 'Roles'], members.slice(0, 600).map((m) => [`<input type="checkbox" data-ch="auditRow" data-key="${esc(m.key)}" ${st.sel.has(m.key) ? 'checked' : ''}>`, esc(m.projectName), esc(m.name), esc(m.email), esc(m.status), esc(roleNames(m.roles))]), 'No project members.')}
    <h4>Hub default-company users (${hubUsers.length})</h4>
    ${hubUsers.length ? `<div class="bar"><div class="grow">${comboHtml('__auditTarget', 'Choose another company for these Hub users...', st.company.id)}</div><button class="btn" data-act="auditMoveHub">Change ${hubUsers.length} Hub default${hubUsers.length === 1 ? '' : 's'}</button></div>` : ''}
    ${tbl(['User', 'Email', 'Status', 'Current company'], hubUsers.map((u) => [esc(u.name), esc(u.email), esc(u.status), esc(u.company)]), 'No Hub users use this as their default company.')}
    <div class="dangerbox"><div class="bar"><b>Delete company</b><span class="muted small">Autodesk exposes this as status “deleted”; it is not a physical database erase.</span><button class="btn danger" data-act="auditPurge" ${safe ? '' : 'disabled'}>Mark Company Deleted</button></div></div>`;
}
function paintModalKeepScroll(html) {
  const box = $('.modalbox'), top = box ? box.scrollTop : 0;
  keepFocus(() => openModal(html, true));
  const nb = $('.modalbox'); if (nb) nb.scrollTop = top;
}
const paintAudit = () => paintModalKeepScroll(auditFinalHtml(S.audit));
async function runAudit(id) {
  const c = companyById(id);
  const st = { company: c, members: [], hubUsers: [], errors: [], search: '', checked: 0, total: 0, sel: new Set(), cancelled: false };
  S.audit = st;
  openModal(`<div class="bar"><h3 class="grow">${esc(c.name)}</h3><button class="btn light" data-act="closeModal">Close</button></div><div class="notice" id="auditProg">${auditProgressHtml(st)}</div>`, true);
  try {
    const { found, errors } = await scanMemberships([id], (checked, total) => { st.checked = checked; st.total = total; const el = $('#auditProg'); if (!st.cancelled && el) el.innerHTML = auditProgressHtml(st); });
    if (st.cancelled) return;
    st.members = found; st.errors = errors; st.total = S.projects.length; st.checked = st.total;
    if (!S.user.loaded) { S.busyLock = false; await loadHubUsers(); }
    st.hubUsers = S.user.users.filter((u) => u.companyId === id || (!u.companyId && norm(u.company) === norm(c.name)));
    paintAudit();
  } catch (e) { if (!st.cancelled) { closeModal(); showError(e.message); } }
}
async function removeMemberships(items, label) {
  const out = [];
  for (let i = 0; i < items.length; i += 25) {
    const d = await api('members-bulk', { body: { operation: 'remove', items: items.slice(i, i + 25) } });
    out.push(...d.results);
    setQueue(`${label}: removing members ${Math.min(i + 25, items.length)} of ${items.length}`, 100 * Math.min(i + 25, items.length) / items.length);
  }
  pushReports(out.map((r) => ({ Type: `${label} (remove member)`, Name: r.email || r.name, Project: r.projectName, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
  return out;
}
async function auditMoveHub() {
  const st = S.audit, target = companyById(S.pick.__auditTarget);
  if (!target) return showError('Choose the replacement company for the Hub users.');
  if (!st.hubUsers.length) return;
  if (!confirm(`Change ${st.hubUsers.length} Hub user default compan${st.hubUsers.length === 1 ? 'y' : 'ies'} to "${target.name}"?`)) return;
  const all = [];
  for (let i = 0; i < st.hubUsers.length; i += 25) {
    const d = await api('bulk-user-company', { body: { hubId: S.hub, companyId: target.id, companyName: target.name, users: st.hubUsers.slice(i, i + 25) } });
    all.push(...d.results);
  }
  const ok = new Set(all.filter((r) => r.success).map((r) => r.id));
  S.user.users.forEach((u) => { if (ok.has(u.id)) { u.company = target.name; u.companyId = target.id; } });
  st.hubUsers = st.hubUsers.filter((u) => !ok.has(u.id));
  pushReports(all.map((r) => ({ Type: 'Company audit (Hub default)', Name: r.email, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? `-> ${target.name}` : r.error })));
  delete S.pick.__auditTarget;
  flash(`${ok.size} Hub default compan${ok.size === 1 ? 'y' : 'ies'} changed.`); paintAudit();
}
async function auditPurge() {
  const st = S.audit;
  if (st.members.length || st.hubUsers.length || st.errors.length) return showError('Resolve all project memberships, Hub users and scan errors first.');
  if (prompt(`Mark "${st.company.name}" as deleted in Autodesk?\n\nType DELETE COMPANY to continue.`) !== 'DELETE COMPANY') return;
  const d = await api('companies-purge', { body: { hubId: S.hub, companies: [{ id: st.company.id, name: st.company.name }] } });
  const r = d.results && d.results[0];
  pushReports([{ Type: 'Company audit (delete company)', Name: st.company.name, Result: r && r.success ? 'Success' : 'Failed', Detail: r && r.error || '' }]);
  if (r && r.success) { S.companies = S.companies.filter((c) => c.id !== st.company.id); S.cSel.delete(st.company.id); closeModal(); flash('Company marked deleted.'); renderView(); }
  else showError((r && r.error) || 'Autodesk did not delete the company.');
}

async function auditRemove() {
  const st = S.audit, items = st.members.filter((m) => st.sel.has(m.key));
  if (!items.length || !confirm(`Remove ${items.length} project membership(s)? This cannot be undone.`)) return;
  const out = await removeMemberships(items, 'Company audit removal');
  const ok = new Set(out.filter((r) => r.success).map((r) => r.key));
  st.members = st.members.filter((m) => !ok.has(m.key)); st.sel.clear();
  S.access.members = S.access.members.filter((m) => !ok.has(m.key));
  flash(`${ok.size} removed, ${out.length - ok.size} failed.`); paintAudit();
}

/* Shared delete: remove every project member of the companies, then delete the companies.
   A company is only deleted when all of its memberships were removed and every project could be read. */
async function purgeCompanyList(list, label) {
  const deleted = new Set(), kept = new Map();
  const needScan = list.filter((c) => (c.members || 0) > 0 || (c.projects || 0) > 0);
  let memberships = [], scanErrors = [];
  if (needScan.length) {
    const r = await scanMemberships(needScan.map((c) => c.id), (a, b) => setQueue(`${label}: scanning projects for members ${a} of ${b}`, 100 * a / b));
    memberships = r.found; scanErrors = r.errors;
  }
  const removeResults = memberships.length ? await removeMemberships(memberships, label) : [];
  const failedCompanies = new Set(removeResults.filter((r) => !r.success).map((r) => (memberships.find((m) => m.key === r.key) || {}).companyId));
  const deletable = list.filter((c) => {
    if (failedCompanies.has(c.id)) { kept.set(c.id, 'Some project members could not be removed'); return false; }
    if (scanErrors.length && needScan.includes(c)) { kept.set(c.id, `${scanErrors.length} project(s) could not be read, company kept for safety`); return false; }
    return true;
  });
  for (let i = 0; i < deletable.length; i += 25) {
    const d = await api('companies-purge', { body: { hubId: S.hub, companies: deletable.slice(i, i + 25).map((c) => ({ id: c.id, name: c.name })) } });
    d.results.forEach((r) => { if (r.success) deleted.add(r.id); else kept.set(r.id, r.error); });
    pushReports(d.results.map((r) => ({ Type: `${label} (delete company)`, Name: r.name, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
    setQueue(`${label}: deleting companies ${Math.min(i + 25, deletable.length)} of ${deletable.length}`, 100 * Math.min(i + 25, deletable.length) / deletable.length);
  }
  list.filter((c) => !deletable.includes(c)).forEach((c) => pushReports([{ Type: `${label} (delete company)`, Name: c.name, Result: 'Pending', Detail: kept.get(c.id) }]));
  S.companies.forEach((c) => { if (deleted.has(c.id)) { c.status = 'deleted'; c.members = 0; c.projects = 0; } });
  S.companies = S.companies.filter((c) => !deleted.has(c.id));
  deleted.forEach((id) => S.cSel.delete(id));
  return { deleted, kept };
}

async function deepPurge() {
  const selected = filteredCompanies().filter((c) => S.cSel.has(c.id));
  if (!selected.length) return showError('Select at least one company first.');
  if (prompt(`This removes every project member assigned to ${companies(selected.length)} and then deletes them.\n\nType PURGE to continue.`) !== 'PURGE') return;
  const { deleted } = await purgeCompanyList(selected, 'Company purge');
  setQueue(null);
  flash(`Purge complete: ${deleted.size} deleted, ${selected.length - deleted.size} kept. See Reports.`); renderView();
}

/* ======================================================== REPLACE COMPANY */
async function startReplace(sources, target) {
  if (!target) return showError('Choose the replacement company from the drop-down list.');
  sources = sources.filter((c) => c && c.id !== target.id);
  if (!sources.length) return showError('Select at least one company that is different from the target.');
  const M = { sources, target, rows: [], errors: [], sel: new Set(), search: '', phase: 'scan', checked: 0, total: 0, results: [], hubResults: [], purged: [], running: false };
  S.move = M; S.only.moveSel = false;
  paintMove();
  try {
    const { found, errors } = await scanMemberships(sources.map((c) => c.id), (a, b) => { M.checked = a; M.total = b; const el = $('#moveProg'); if (el) el.innerHTML = moveProgressHtml(M); });
    if (S.move !== M) return;
    const plat = new Map(S.projects.map((p) => [p.id, p.platform]));
    M.rows = found.map((m) => ({ ...m, sourceId: m.companyId, projectPlatform: m.projectPlatform || plat.get(m.projectId) || '', status2: 'Pending' }));
    M.rows.forEach((r) => { if (isBim(r.projectPlatform)) r.status2 = 'BIM 360 - not supported'; });
    M.errors = errors;
    M.rows.filter((r) => !isBim(r.projectPlatform)).forEach((r) => M.sel.add(r.key));
    M.phase = 'preview';
    if (!S.user.loaded && S.moveOpts.hub) { S.busyLock = false; await loadHubUsers(); }
    paintMove();
  } catch (e) { M.phase = 'error'; M.fatal = e.message; paintMove(); }
}
function moveProgressHtml(M) {
  const pct = M.total ? Math.round(100 * M.checked / M.total) : 0;
  return `<b>Finding every member of ${M.sources.length === 1 ? esc(M.sources[0].name) : companies(M.sources.length)} across all projects...</b><div class="progress"><div style="width:${pct}%"></div></div>${pct}% (${M.checked} of ${M.total || '?'} projects)`;
}
function paintMove() {
  const M = S.move;
  if (!M) return;
  const head = `<div class="bar"><div class="grow"><h3 style="margin:0">Replace company</h3><div class="muted">${M.sources.length > 5 ? companies(M.sources.length) : M.sources.map((c) => esc(c.name)).join(', ')} &rarr; <b>${esc(M.target.name)}</b></div></div>
    <button class="btn light" data-act="closeModal" ${M.running ? 'disabled' : ''}>Close</button></div>`;
  if (M.phase === 'scan') return openModal(head + `<div class="notice" id="moveProg">${moveProgressHtml(M)}</div>`, true);
  if (M.phase === 'error') return openModal(head + `<div class="error">${esc(M.fatal)}</div>`, true);
  const acc = M.rows.filter((r) => !isBim(r.projectPlatform)), bim = M.rows.filter((r) => isBim(r.projectPlatform));
  const hubUsers = S.user.users.filter((u) => M.sources.some((c) => c.id === u.companyId));
  const done = M.phase === 'done', okCount = M.results.filter((r) => r.success).length, verified = M.results.filter((r) => r.success && r.verified).length, failed = M.results.filter((r) => !r.success).length;
  const rows = moveRows();
  const statusCell = (r) => `<span class="${/Moved/.test(r.status2) ? 'ok' : /Failed|not supported/.test(r.status2) ? 'bad' : 'muted'}">${esc(r.status2)}</span>${r.err ? `<div class="small bad">${esc(r.err)}</div>` : ''}`;
  paintModalKeepScroll(head + `
    <div class="stats compact">
      <div class="stat"><span>Members found</span><b>${M.rows.length}</b><small>in ${plural(new Set(M.rows.map((r) => r.projectId)).size, 'project')}</small></div>
      <div class="stat"><span>Can be moved (ACC)</span><b>${acc.length}</b></div>
      <div class="stat"><span>BIM 360 (not supported)</span><b>${bim.length}</b><small>change in BIM 360 admin</small></div>
      <div class="stat"><span>Hub defaults to change</span><b>${S.moveOpts.hub ? hubUsers.length : 0}</b></div></div>
    ${M.errors.length ? `<div class="error">${M.errors.length} project(s) could not be read. The old company will not be deleted.</div>` : ''}
    ${done ? `<div class="notice"><b>Finished.</b> ${okCount} moved (${verified} verified), ${failed} failed.${S.moveOpts.hub ? ` Hub default company: ${M.hubResults.filter((r) => r.success).length} changed.` : ''}${S.moveOpts.purge ? ` Old companies deleted: ${M.purged.length}.` : ''} Full detail is in Reports.</div>` : ''}
    ${!done ? `<div class="bar">${chip('hub', 'Also change Hub default company of these users', S.moveOpts.hub, 'moveOpt')}${chip('purge', 'Delete old company when fully moved', S.moveOpts.purge, 'moveOpt')}</div>` : ''}
    <div class="bar"><input id="moveSearch" class="input grow" data-in="moveSearch" placeholder="Search project, member, email" value="${esc(M.search)}">${selBar('moveSel')}</div>
    ${!done ? `<div class="bar"><button class="btn soft" data-act="moveTest" ${M.running || !M.sel.size ? 'disabled' : ''}>Test on 1 member first</button>
        <button class="btn" data-act="moveRun" ${M.running ? 'disabled' : ''}>Move ${M.sel.size} selected member${M.sel.size === 1 ? '' : 's'}${S.moveOpts.hub ? ' + Hub defaults' : ''}</button>
        <button class="btn light" data-act="moveExport">Export Preview</button>${M.running ? '<span class="badge warn">Working...</span>' : ''}</div>`
      : `<div class="bar"><button class="btn light" data-act="moveExport">Export Results</button><button class="btn" data-act="closeModal">Done</button></div>`}
    ${tbl(['Select', 'Project', 'Platform', 'Member', 'Email', 'Current company', 'Result'],
      rows.slice(0, 800).map((r) => [isBim(r.projectPlatform) ? '<span class="muted">-</span>' : rowBox('moveSel', r.key, M.sel.has(r.key)), esc(r.projectName), esc(r.projectPlatform || 'acc'), esc(r.name), esc(r.email), esc(r.company), statusCell(r)]),
      M.rows.length ? 'No rows match the search.' : 'No project members found. Hub default company and old-company deletion can still be applied.')}`);
}
async function moveMembers(items) {
  const M = S.move, out = [];
  for (let i = 0; i < items.length; i += 20) {
    const chunk = items.slice(i, i + 20);
    let d;
    try { d = await api('members-bulk', { body: { operation: 'company', companyId: M.target.id, items: chunk } }); }
    catch (e) { d = { results: chunk.map((m) => ({ key: m.key, success: false, error: e.message })) }; }
    d.results.forEach((r) => {
      const row = M.rows.find((x) => x.key === r.key);
      if (!row) return;
      row.status2 = r.success ? (r.verified ? 'Moved - verified' : 'Moved (not re-checked)') : 'Failed';
      row.err = r.success ? '' : r.error;
      if (r.success) { row.company = M.target.name; row.companyId = M.target.id; M.sel.delete(r.key); }
    });
    out.push(...d.results);
    setQueue(`Moving members to ${M.target.name}: ${Math.min(i + 20, items.length)} of ${items.length}`, 100 * Math.min(i + 20, items.length) / items.length);
    paintMove();
  }
  M.results.push(...out);
  pushReports(out.map((r) => ({ Type: 'Replace company (project member)', Name: r.email || r.name, Project: r.projectName, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? `-> ${M.target.name}${r.verified ? ' (verified)' : ''}` : r.error })));
  return out;
}
async function moveTest() {
  const M = S.move, first = M.rows.find((r) => M.sel.has(r.key));
  if (!first) return;
  M.running = true; paintMove();
  try {
    const [r] = await moveMembers([first]);
    setQueue(null);
    if (r && r.success) { M.target.members += 1; M.countedMoves = (M.countedMoves || 0) + 1; flash(`Test passed: ${first.name || first.email} in ${first.projectName} now belongs to ${M.target.name}${r.verified ? ' (confirmed by Autodesk)' : ''}.`); }
    else showError(`Test failed: ${r ? r.error : 'no response'}. Nothing else was changed.`);
  } finally { M.running = false; paintMove(); }
}
async function moveRun() {
  const M = S.move, items = M.rows.filter((r) => M.sel.has(r.key));
  const hubUsers = S.moveOpts.hub ? S.user.users.filter((u) => M.sources.some((c) => c.id === u.companyId)) : [];
  if (!items.length && !hubUsers.length && !S.moveOpts.purge) return showError('Nothing selected to move.');
  if (!confirm(`Move ${items.length} project membership(s) to "${M.target.name}"${hubUsers.length ? ` and change ${hubUsers.length} Hub default compan${hubUsers.length === 1 ? 'y' : 'ies'}` : ''}${S.moveOpts.purge ? ', then delete the old company if fully moved' : ''}?`)) return;
  M.running = true; paintMove();
  try {
    if (items.length) await moveMembers(items);
    if (hubUsers.length) {
      for (let i = 0; i < hubUsers.length; i += 25) {
        const d = await api('bulk-user-company', { body: { hubId: S.hub, companyId: M.target.id, companyName: M.target.name, users: hubUsers.slice(i, i + 25) } });
        M.hubResults.push(...d.results);
      }
      const okHub = new Set(M.hubResults.filter((r) => r.success).map((r) => r.id));
      S.user.users.forEach((u) => { if (okHub.has(u.id)) { u.company = M.target.name; u.companyId = M.target.id; } });
      pushReports(M.hubResults.map((r) => ({ Type: 'Replace company (Hub default)', Name: r.email, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? `${r.oldCompany || '(none)'} -> ${M.target.name}` : r.error })));
    }
    const movedNow = M.rows.filter((r) => /Moved/.test(r.status2));
    M.target.members += movedNow.length - (M.countedMoves || 0);
    M.countedMoves = movedNow.length;
    M.target.projects = Math.max(M.target.projects, new Set(movedNow.map((r) => r.projectId)).size);
    if (S.moveOpts.purge) {
      const clean = M.sources.filter((src) => !M.errors.length && M.rows.filter((r) => r.sourceId === src.id).every((r) => /Moved/.test(r.status2)));
      if (clean.length) {
        const d = await api('companies-purge', { body: { hubId: S.hub, companies: clean.map((c) => ({ id: c.id, name: c.name })) } });
        M.purged = d.results.filter((r) => r.success).map((r) => r.id);
        S.companies = S.companies.filter((c) => !M.purged.includes(c.id));
        pushReports(d.results.map((r) => ({ Type: 'Replace company (delete old)', Name: r.name, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
      }
      M.sources.filter((c) => !clean.includes(c)).forEach((c) => pushReports([{ Type: 'Replace company (delete old)', Name: c.name, Result: 'Pending', Detail: 'Kept: some members were not moved, are on BIM 360 projects, or some projects could not be read.' }]));
    }
    M.sources.forEach((src) => {
      const left = M.rows.filter((r) => r.sourceId === src.id && !/Moved/.test(r.status2));
      if (!M.errors.length) { src.members = left.length; src.projects = new Set(left.map((r) => r.projectId)).size; }
      delete S.pick[src.id]; S.cSel.delete(src.id);
    });
    M.phase = 'done'; setQueue(null);
  } catch (e) { showError(e.message); }
  finally { M.running = false; paintMove(); const keep = $('#modal').innerHTML; renderView(); $('#modal').innerHTML = keep; }
}
function moveExport() {
  const M = S.move;
  exportRows(`Replace_${M.target.name.slice(0, 20)}.xlsx`, M.rows.map((r) => ({ Project: r.projectName, Platform: r.projectPlatform || 'acc', Member: r.name, Email: r.email, 'Original company': (companyById(r.sourceId) || {}).name || '', 'Target company': M.target.name, Result: r.status2, Error: r.err || '' })), 'Replace');
}


/* ================================================= COMPANY ADDRESS UPLOAD */
const ADDRESS_TEMPLATE = [
  { 'S Code': 'S-200001', 'Supplier Name': 'Example Supplier Pty Ltd', 'Address Line 1': '123 Example Street', 'Address Line 2': 'Level 2', City: 'Adelaide', 'State/Province': 'SA', 'Postal Code': '5000', Country: 'Australia' }
];
const STATE_NAMES = { ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory', QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria', WA: 'Western Australia' };
const countryName = (v) => ({ AU: 'Australia', AUS: 'Australia', AUSTRALIA: 'Australia', NZ: 'New Zealand', 'NEW ZEALAND': 'New Zealand' }[String(v || 'Australia').trim().toUpperCase()] || String(v || 'Australia').trim());
function addressText(x) { return [x.address1, x.address2, x.city, x.state, x.postcode, x.country].filter(Boolean).join(', '); }
function parseSupplierAddress(v) {
  const lines = String(v || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  let country = 'Australia';
  if (lines.length && /^(australia|new zealand|singapore|malaysia|united states.*)$/i.test(lines[lines.length - 1])) country = lines.pop();
  const local = lines.pop() || '';
  const m = local.match(/^(.*?)(?:,)?\s+(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s+(\d{4})$/i);
  return { address1: lines.shift() || '', address2: lines.join(', '), city: m ? m[1].trim() : local, state: m ? STATE_NAMES[m[2].toUpperCase()] : '', postcode: m ? m[3] : '', country: countryName(country) };
}
function addressCol(headers, names) { const n = headers.map((h) => norm(h)); for (const x of names) { const i = n.indexOf(norm(x)); if (i >= 0) return headers[i]; } return ''; }
async function addressFile(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') return showError('The Excel reader is not available. Reload the page.');
  if (!S.companiesLoaded) return showError('Load all companies first, then upload the address file.');
  const wb = XLSX.read(await file.arrayBuffer()), ws = wb.Sheets[wb.SheetNames[0]], raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const h = Object.keys(raw[0] || {}), code = addressCol(h, ['S Code', 'Supplier ID', 'ERP ID', 'Supplier Code']), name = addressCol(h, ['Supplier Name', 'Company Name', 'Name']);
  const full = addressCol(h, ['Address']), a1 = addressCol(h, ['Address Line 1', 'Street Address']), a2 = addressCol(h, ['Address Line 2']);
  const city = addressCol(h, ['City', 'Suburb']), state = addressCol(h, ['State/Province', 'State or Province', 'State']), post = addressCol(h, ['Postal Code', 'Postcode']), country = addressCol(h, ['Country']);
  if (!code) return showError('No Supplier ID / S Code column was found. Use the template or the original Supplier List export.');
  const byCode = new Map();
  S.companies.filter((c) => c.status !== 'deleted').forEach((c) => codeTokens(c.erpId).forEach((k) => { if (!byCode.has(k)) byCode.set(k, []); byCode.get(k).push(c); }));
  S.addr.rows = raw.map((r, i) => {
    const sc = String(r[code] || '').trim(), supplier = String(r[name] || '').trim();
    let ad = full ? parseSupplierAddress(r[full]) : { address1: String(r[a1] || '').trim(), address2: String(r[a2] || '').trim(), city: String(r[city] || '').trim(), state: String(r[state] || '').trim(), postcode: String(r[post] || '').trim(), country: countryName(r[country]) };
    ad.state = STATE_NAMES[String(ad.state || '').toUpperCase()] || ad.state;
    ad.country = countryName(ad.country);
    const matches = byCode.get(codeKey(sc)) || [], company = matches.length === 1 ? matches[0] : null;
    let status = matches.length === 1 ? 'Matched' : matches.length > 1 ? 'Multiple matches' : 'Not found';
    if (!ad.address1 && !ad.city && !ad.postcode) status = 'No address';
    const changed = company ? addressText(company) !== addressText(ad) : false;
    return { key: `a${i}`, row: i + 2, sCode: sc, supplier, ...ad, company, status, changed, result: '', error: '' };
  });
  S.addr.file = file.name; S.addr.sel = new Set(S.addr.rows.filter((r) => r.status === 'Matched' && r.changed).map((r) => r.key)); S.addr.limit = PAGE_STEP; renderView();
}
function addressRows() {
  const A = S.addr, q = A.search.trim().toLowerCase();
  return A.rows.filter((r) => (A.filter === 'all' || (A.filter === 'changes' ? r.status === 'Matched' && r.changed : r.status === A.filter)) && hasText([r.sCode, r.supplier, r.company && r.company.name, r.status, r.result, addressText(r)], q));
}
VIEWS.address = () => {
  const A = S.addr, rows = addressRows(), shown = rows.slice(0, A.limit), selected = A.rows.filter((r) => A.sel.has(r.key) && r.status === 'Matched' && r.changed);
  const count = (x) => A.rows.filter((r) => x === 'changes' ? r.status === 'Matched' && r.changed : r.status === x).length;
  return `<div class="card"><h3>Upload and update company addresses</h3>
    <p class="muted">Upload the complete Supplier List export or the clean template. Supplier ID / S Code is matched to the Hub company ERP ID. Review every change before updating.</p>
    <div class="bar"><button class="btn light" data-act="addressTemplate">Download Address Template</button><input type="file" accept=".xlsx,.xls,.csv" data-ch="addressFile">
      ${S.companiesLoaded ? `<span class="badge good">${S.companies.length.toLocaleString()} companies loaded</span>` : '<button class="btn" data-act="loadCompanies">Load Hub companies first</button>'}</div>
    ${A.file ? `<div class="notice"><b>${esc(A.file)}</b> · ${A.rows.length} rows · ${count('Matched')} matched · ${count('changes')} changed · ${count('Not found')} not found</div>` : ''}</div>
  ${A.rows.length ? `<div class="card"><div class="bar"><input id="addrSearch" class="input grow" data-in="addrSearch" placeholder="Search S Code, supplier, Hub company, address or result" value="${esc(A.search)}">
    <select class="select" data-ch="addrFilter"><option value="all">All rows</option><option value="changes" ${A.filter === 'changes' ? 'selected' : ''}>Matched changes</option><option ${A.filter === 'Matched' ? 'selected' : ''}>Matched</option><option ${A.filter === 'Not found' ? 'selected' : ''}>Not found</option><option ${A.filter === 'Multiple matches' ? 'selected' : ''}>Multiple matches</option><option ${A.filter === 'No address' ? 'selected' : ''}>No address</option></select></div>
    <div class="bar"><button class="btn soft" data-act="addressSelectChanged">Select all matched changes</button><button class="btn light" data-act="addressClear">Deselect all</button><span class="badge">${A.sel.size} selected</span>
      <button class="btn light" data-act="addressExport">Export Comparison</button><button class="btn" data-act="addressApply" ${A.running || !selected.length ? 'disabled' : ''}>${A.running ? 'Updating...' : `Update ${selected.length} Addresses`}</button></div>
    ${tbl(['Select', 'Row', 'S Code', 'Excel Supplier', 'Hub Company', 'Current Address', 'New Address', 'Result'], shown.map((r) => [r.status === 'Matched' && r.changed ? `<input type="checkbox" data-ch="addrRow" data-key="${esc(r.key)}" ${A.sel.has(r.key) ? 'checked' : ''}>` : '-', r.row, `<b>${esc(r.sCode)}</b>`, esc(r.supplier), esc(r.company ? r.company.name : ''), esc(r.company ? addressText(r.company) : ''), esc(addressText(r)), `<span class="badge ${r.result === 'Updated' || r.status === 'Matched' ? 'good' : r.result === 'Failed' ? 'bad' : 'warn'}">${esc(r.result || (r.status === 'Matched' && !r.changed ? 'No change' : r.status))}</span>${r.error ? `<div class="bad small">${esc(r.error)}</div>` : ''}`]), 'No rows match.')}
    ${moreBtn('addrLimit', shown.length, rows.length)}</div>` : ''}`;
};
function addressTemplate() { exportRows('Company_Address_Update_Template.xlsx', ADDRESS_TEMPLATE, 'Company Addresses'); }
function addressExport() { exportRows('Company_Address_Comparison.xlsx', S.addr.rows.map((r) => ({ Row: r.row, 'S Code': r.sCode, 'Excel Supplier': r.supplier, 'Hub Company': r.company ? r.company.name : '', 'Current Address': r.company ? addressText(r.company) : '', 'New Address': addressText(r), Match: r.status, Changed: r.changed ? 'Yes' : 'No', Result: r.result, Error: r.error })), 'Comparison'); }
async function addressApply() {
  const A = S.addr, rows = A.rows.filter((r) => A.sel.has(r.key) && r.status === 'Matched' && r.changed);
  if (!rows.length) return showError('Select at least one matched address change.');
  if (prompt(`Update ${rows.length} company address(es)?\n\nType UPDATE ADDRESSES to continue.`) !== 'UPDATE ADDRESSES') return;
  A.running = true; renderView(); const all = [], region = (S.hubs.find((h) => h.id === S.hub) || {}).region || 'AUS';
  try {
    for (let i = 0; i < rows.length; i += 25) {
      const items = rows.slice(i, i + 25).map((r) => ({ id: r.company.id, name: r.company.name, address_line_1: r.address1, address_line_2: r.address2, city: r.city, state_or_province: r.state, postal_code: r.postcode, country: r.country }));
      const d = await api('companies-bulk-update', { body: { hubId: S.hub, region, useUserToken: true, items } }); all.push(...d.results);
      setQueue(`Updating addresses: ${Math.min(i + 25, rows.length)} of ${rows.length}`, 100 * Math.min(i + 25, rows.length) / rows.length);
    }
    all.forEach((x) => { const r = rows.find((z) => z.company.id === x.id); if (!r) return; r.result = x.success ? 'Updated' : 'Failed'; r.error = x.error || ''; if (x.success) { Object.assign(r.company, { address1: r.address1, address2: r.address2, city: r.city, state: r.state, postcode: r.postcode, country: r.country }); r.changed = false; A.sel.delete(r.key); } });
    pushReports(all.map((x) => ({ Type: 'Company address update', Name: x.name, Result: x.success ? 'Success' : 'Failed', Detail: x.success ? Object.entries(x.sent).map(([k, v]) => `${k}=${v}`).join('; ') : x.error })));
    flash(`Address update complete: ${all.filter((x) => x.success).length} updated, ${all.filter((x) => !x.success).length} failed.`);
  } finally { A.running = false; setQueue(null); renderView(); }
}

/* ---------------------------------------------------------- import */
const IMPORT_COLUMNS = [['Name', 'name'], ['Trade', 'trade'], ['Address Line 1', 'address_line_1'], ['Address Line 2', 'address_line_2'], ['City', 'city'], ['State or Province', 'state_or_province'], ['Postal Code', 'postal_code'], ['Country', 'country'], ['Phone', 'phone'], ['Website URL', 'website_url'], ['Description', 'description'], ['ERP ID', 'erp_id'], ['Tax ID', 'tax_id']];
VIEWS.import = () => {
  const rows = S.imp.rows, ready = rows.filter((r) => r.status === 'Ready').length;
  return `<div class="card"><h3>Import companies from Excel</h3>
    <p class="muted">Only <b>Name</b> is required. Trade defaults to Corporate &amp; Professional Services. Load the company directory first so existing names are detected.</p>
    <div class="bar"><button class="btn light" data-act="importTemplate">Download Full Template</button><input type="file" accept=".xlsx,.xls,.csv" data-ch="importFile">
      <button class="btn soft" data-act="loadCompanies" ${S.companiesLoaded ? 'disabled' : ''}>${S.companiesLoaded ? `Directory loaded (${S.companies.length.toLocaleString()})` : 'Load directory for validation'}</button>
      <button class="btn" data-act="runImport" ${ready ? '' : 'disabled'}>Import ${ready} Ready Companies</button>
      <button class="btn light" data-act="exportImportPreview" ${rows.length ? '' : 'disabled'}>Export Validation</button></div></div>
    <div class="card">${rows.length ? `<div class="bar"><span class="badge">${rows.length} rows</span><span class="badge good">${ready} ready</span><span class="badge warn">${rows.filter((r) => r.status === 'Already exists').length} already exist</span><span class="badge warn">${rows.filter((r) => r.status === 'Duplicate in file').length} duplicates</span><span class="badge bad">${rows.filter((r) => r.status === 'Missing name').length} missing name</span></div>` : ''}
    ${tbl(['Row', 'Status', 'Name', 'Trade', 'City', 'Country', 'ERP ID', 'Tax ID'], rows.slice(0, 500).map((r) => [r.row, `<span class="${r.status === 'Ready' ? 'ok' : 'bad'}">${esc(r.status)}</span>`, esc(r.data.name), esc(r.data.trade), esc(r.data.city), esc(r.data.country), esc(r.data.erp_id), esc(r.data.tax_id)]), 'Upload an Excel file to preview rows.')}</div>`;
};
function importTemplate() {
  if (typeof XLSX === 'undefined') return showError('The Excel writer is not available. Check your internet connection.');
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Companies', [{ Name: 'Example Company Pty Ltd', Trade: 'Corporate & Professional Services', 'Address Line 1': '123 Example Street', 'Address Line 2': 'Level 2', City: 'Adelaide', 'State or Province': 'South Australia', 'Postal Code': '5000', Country: 'Australia', Phone: '+61 8 0000 0000', 'Website URL': 'https://example.com', Description: 'Example description', 'ERP ID': 'S-200001', 'Tax ID': '12 345 678 901' }]);
  addSheet(wb, 'Instructions', [{ Field: 'Name', Required: 'Yes', Notes: 'Must be unique in the Hub (max 255 characters).' }, { Field: 'Trade', Required: 'No', Notes: 'Must match an Autodesk trade. Blank uses the default.' }, { Field: 'ERP ID', Required: 'No', Notes: 'Workday S code, e.g. S-200001.' }, { Field: 'Tax ID', Required: 'No', Notes: 'ABN.' }]);
  XLSX.writeFile(wb, 'Company_Import_Full_Template.xlsx');
}
async function importFile(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') return showError('The Excel reader is not available. Check your internet connection and reload.');
  const wb = XLSX.read(await file.arrayBuffer());
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const existing = new Set(S.companies.map((c) => norm(c.name))), seen = new Set();
  S.imp.rows = raw.map((r, i) => {
    const data = {};
    IMPORT_COLUMNS.forEach(([label, key]) => { data[key] = String(r[label] != null && r[label] !== '' ? r[label] : (key === 'name' ? r['Company Name'] || '' : '')).trim(); });
    const k = norm(data.name);
    let status = 'Ready';
    if (!data.name) status = 'Missing name'; else if (existing.has(k)) status = 'Already exists'; else if (seen.has(k)) status = 'Duplicate in file';
    if (data.name) seen.add(k);
    return { row: i + 2, data, status };
  });
  S.imp.file = file.name; renderView();
}
async function runImport() {
  const ready = S.imp.rows.filter((r) => r.status === 'Ready');
  if (!ready.length || !confirm(`Import ${ready.length} companies?`)) return;
  const added = [], failed = [];
  for (let i = 0; i < ready.length; i += 50) {
    try {
      const d = await api('companies-import', { body: { hubId: S.hub, companies: ready.slice(i, i + 50).map((r) => r.data) } });
      (d.success_items || []).forEach((x) => added.push(x));
      (d.failure_items || []).forEach((x) => failed.push({ name: x.item && x.item.name, error: x.error || 'Import failed' }));
    } catch (e) { ready.slice(i, i + 50).forEach((r) => failed.push({ name: r.data.name, error: e.message })); }
    setQueue(`Importing: ${Math.min(i + 50, ready.length)} of ${ready.length}`, 100 * Math.min(i + 50, ready.length) / ready.length);
    if (i + 50 < ready.length) await sleep(5000);
  }
  pushReports([...added.map((x) => ({ Type: 'Company import', Name: x.name, Result: 'Success' })), ...failed.map((x) => ({ Type: 'Company import', Name: x.name, Result: 'Failed', Detail: x.error }))]);
  flash(`Import complete: ${added.length} added, ${failed.length} failed. Reload the directory to see new companies.`);
  S.companiesLoaded = false; S.imp.rows = []; S.tab = 'reports'; render();
}

/* ----------------------------------------------------- users & access */
VIEWS.access = () => {
  const a = S.access, projects = accessProjects(), members = filteredMembers();
  const statuses = [...new Set(S.projects.map((p) => p.status).filter(Boolean))].sort();
  const comps = [...new Set(a.members.map((m) => m.company).filter(Boolean))].sort();
  const roles = [...new Set(a.members.flatMap((m) => m.roles.map((r) => r.name)))].sort();
  return `<div class="card"><h3>1. Select projects</h3>
    <div class="bar"><input id="pSearch" class="input grow" data-in="pSearch" placeholder="Search project name, job number, status, platform or ID" value="${esc(a.pSearch)}">
      <select class="select" data-ch="pStatus"><option value="all">All statuses</option>${statuses.map((s) => `<option ${a.pStatus === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <button class="btn" data-act="loadProjectsBtn">${S.projectsLoaded ? 'Reload Projects' : 'Load Projects'}</button></div>
    <div class="bar">${selBar('pSel')}<button class="btn" data-act="loadMembers">Load Users From Selected Projects</button></div>
    ${tbl(['Select', 'Project', 'Job Number', 'Status', 'Platform'], projects.slice(0, 500).map((p) => [rowBox('pSel', p.id, a.pSel.has(p.id)), esc(p.name), esc(p.jobNumber), esc(p.status), esc(p.platform)]), 'Load projects to begin.')}</div>
  <div class="card"><h3>2. Users in selected projects</h3>
    ${a.errors.length ? `<div class="error">${a.errors.length} project(s) could not be read.</div>` : ''}
    <div class="bar"><input id="mSearch" class="input grow" data-in="mSearch" placeholder="Search user, email, company, project, role or status" value="${esc(a.mSearch)}">
      <select class="select" data-ch="mCompany"><option value="all">All companies</option>${comps.map((c) => `<option ${a.mCompany === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <span class="badge">${members.length.toLocaleString()} of ${a.members.length.toLocaleString()} memberships</span></div>
    <div class="bar">${selBar('mSel')}
      <select class="select" data-ch="mRole"><option value="">Choose new role...</option>${roles.map((r) => `<option ${a.role === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <button class="btn" data-act="changeRole">Change Role</button><button class="btn danger" data-act="removeMembers">Remove From Projects</button><button class="btn light" data-act="exportMembers">Export Excel</button></div>
    ${tbl(['Select', 'Project', 'User', 'Email', 'Company', 'Roles', 'Status'], members.slice(0, a.mLimit).map((m) => [rowBox('mSel', m.key, a.mSel.has(m.key)), esc(m.projectName), esc(m.name), esc(m.email), esc(m.company), esc(roleNames(m.roles)), esc(m.status)]), 'Select projects above, then load their users.')}
    ${moreBtn('mLimit', Math.min(a.mLimit, members.length), members.length)}</div>`;
};
async function loadMembers() {
  const a = S.access, projects = S.projects.filter((p) => a.pSel.has(p.id));
  if (!projects.length) return showError('Select at least one project.');
  const all = [], errors = [];
  for (let i = 0; i < projects.length; i += 10) {
    const d = await api('project-users-batch', { body: { projects: projects.slice(i, i + 10) } });
    all.push(...d.items); errors.push(...d.errors);
    setQueue(`Loading users: ${Math.min(i + 10, projects.length)} of ${projects.length} projects`, 100 * Math.min(i + 10, projects.length) / projects.length);
  }
  a.members = all; a.errors = errors; a.mSel.clear(); a.mLimit = PAGE_STEP;
  flash(`Loaded ${all.length.toLocaleString()} memberships from ${projects.length} projects.`); renderView();
}
async function changeRole() {
  const a = S.access, role = a.role, items = a.members.filter((m) => a.mSel.has(m.key));
  if (!role) return showError('Choose the new role first.');
  if (!items.length || !confirm(`Set role "${role}" for ${items.length} membership(s)? This replaces their current roles in those projects.`)) return;
  const roleMap = new Map();
  a.members.forEach((m) => m.roles.forEach((r) => { if (r.id) roleMap.set(`${m.projectId}::${r.name}`, r.id); }));
  const sendable = [], unresolved = [];
  items.forEach((m) => { const id = roleMap.get(`${m.projectId}::${role}`); if (id) sendable.push({ ...m, roleIds: [id] }); else unresolved.push(m); });
  const out = [];
  for (let i = 0; i < sendable.length; i += 25) out.push(...(await api('members-bulk', { body: { operation: 'role', items: sendable.slice(i, i + 25) } })).results);
  const ok = new Set(out.filter((r) => r.success).map((r) => r.key));
  a.members.forEach((m) => { if (ok.has(m.key)) m.roles = [{ id: roleMap.get(`${m.projectId}::${role}`), name: role }]; });
  pushReports([...out.map((r) => ({ Type: 'Change role', Name: r.email, Project: r.projectName, Result: r.success ? 'Success' : 'Failed', Detail: r.error || role })),
    ...unresolved.map((m) => ({ Type: 'Change role', Name: m.email, Project: m.projectName, Result: 'Failed', Detail: `Role "${role}" is not held by anyone in this project, so its ID is unknown.` }))]);
  flash(`Role change: ${ok.size} updated, ${items.length - ok.size} not changed.`); renderView();
}
async function removeMembers() {
  const a = S.access, items = a.members.filter((m) => a.mSel.has(m.key));
  if (!items.length || !confirm(`Remove ${items.length} membership(s) from their projects?`)) return;
  const out = await removeMemberships(items, 'Remove from project');
  const ok = new Set(out.filter((r) => r.success).map((r) => r.key));
  a.members = a.members.filter((m) => !ok.has(m.key)); a.mSel.clear();
  flash(`${ok.size} removed, ${out.length - ok.size} failed.`); renderView();
}

/* -------------------------------------------------------- user removal */
VIEWS.user = () => {
  const u = S.user, users = searchHubUsers(u.search, u.company), shown = users.slice(0, u.limit);
  const comps = [...new Set(u.users.map((x) => x.company).filter(Boolean))].sort();
  const projects = userProjects(), sel = u.selected;
  return `<div class="card"><h3>1. Find a Hub user</h3>
    <div class="bar"><input id="uSearch" class="input grow" data-in="uSearch" placeholder="Search name, email, company or status" value="${esc(u.search)}">
      <select class="select" data-ch="uCompany"><option value="all">All companies</option>${comps.map((c) => `<option ${u.company === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <button class="btn" data-act="loadHubUsers">${u.loaded ? 'Reload Hub Users' : 'Load Hub Users'}</button><span class="badge">${users.length.toLocaleString()} of ${u.users.length.toLocaleString()}</span></div>
    ${tbl(['User', 'Email', 'Company', 'Status', 'Action'], shown.map((x) => [esc(x.name), esc(x.email), esc(x.company), esc(x.status), `<button class="btn soft small" data-act="selectUser" data-id="${esc(x.id)}">Select User</button>`]), 'Load Hub users to begin.')}
    ${moreBtn('uLimit', shown.length, users.length)}</div>
  ${sel ? `<div class="card"><div class="bar"><div class="grow"><h3>${esc(sel.name || sel.email)}</h3><div class="muted">${esc(sel.email)} &middot; ${esc(sel.company || 'No company')} &middot; ${esc(sel.status)}</div></div>
      <span class="badge">${u.loading ? 'Loading projects...' : plural(u.projects.length, 'project membership')}</span></div>
    ${u.loading ? '<div class="notice"><b>Loading this user\'s projects...</b></div>' : `
    <div class="bar"><input id="uPSearch" class="input grow" data-in="uPSearch" placeholder="Search this user's projects" value="${esc(u.pSearch)}">${selBar('uProjSel')}</div>
    <div class="bar"><button class="btn danger" data-act="removeUserSelected">Remove From Selected Projects</button><button class="btn danger" data-act="removeUserAll" ${u.projects.length ? '' : 'disabled'}>Remove From All Projects</button><button class="btn light" data-act="exportUserProjects">Export Excel</button></div>
    ${tbl(['Select', 'Project', 'Status', 'Roles'], projects.map((p) => [rowBox('uProjSel', p.projectId, u.pSel.has(p.projectId)), esc(p.projectName), esc(p.status), esc(roleNames(p.roles))]), 'This user has no accessible project memberships.')}
    <div class="dangerbox"><h4>Remove user from the Hub</h4><p class="muted">Enabled only when no project memberships remain. Type REMOVE USER to confirm.</p>
      <div class="bar"><input id="removeText" class="input" placeholder="Type REMOVE USER"><button class="btn danger" data-act="removeHubUser" ${u.projects.length ? 'disabled' : ''}>Delete User From Hub</button></div></div>`}</div>` : ''}`;
};
async function selectUser(id) {
  const u = S.user; u.selected = u.users.find((x) => x.id === id); u.projects = []; u.pSel.clear(); u.loading = true; u.pSearch = ''; renderView();
  try { u.projects = (await api(`user-projects-direct&hubId=${encodeURIComponent(S.hub)}&userId=${encodeURIComponent(id)}`)).projects.filter((p) => p.projectId); }
  finally { u.loading = false; renderView(); }
}
async function removeUserProjects(all) {
  const u = S.user, list = all ? u.projects : u.projects.filter((p) => u.pSel.has(p.projectId));
  if (!list.length) return showError('Select at least one project.');
  if (!confirm(`Remove ${u.selected.name || u.selected.email} from ${list.length} project(s)?`)) return;
  const d = await api('remove-user-projects', { body: { userId: u.selected.id, projects: list } });
  const ok = new Set(d.results.filter((r) => r.success).map((r) => r.projectId));
  pushReports(d.results.map((r) => ({ Type: 'User project removal', Name: u.selected.email, Project: r.projectName, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
  u.projects = u.projects.filter((p) => !ok.has(p.projectId)); u.pSel.clear();
  flash(`${ok.size} removed, ${d.results.length - ok.size} failed.`); renderView();
}
async function removeHubUser() {
  const u = S.user;
  const d = await api('remove-hub-user', { body: { hubId: S.hub, userId: u.selected.id, confirmText: $('#removeText').value } });
  pushReports([{ Type: 'Hub user removal', Name: u.selected.email, Result: d.success ? 'Success' : 'Failed' }]);
  u.users = u.users.filter((x) => x.id !== u.selected.id); u.selected = null; flash('User removed from the Hub.'); renderView();
}

/* ------------------------------------------------- bulk user company */
VIEWS.bulk = () => {
  const b = S.bulk, users = bulkUsers(), shown = users.slice(0, b.limit);
  const current = [...new Set(S.user.users.map((x) => x.company).filter(Boolean))].sort();
  const target = companyById(S.pick.__bulkUser);
  return `<div class="notice">Changes each selected user's <b>default Hub company</b>. To move a whole company's members inside every project, use <b>Replace with</b> in the Company Directory.</div>
  <div class="card"><div class="bar"><button class="btn" data-act="loadHubUsers">${S.user.loaded ? 'Reload Hub Users' : 'Load Hub Users'}</button>
      <button class="btn" data-act="loadCompanies">${S.companiesLoaded ? 'Reload Companies' : 'Load Companies'}</button>
      <input id="bSearch" class="input grow" data-in="bSearch" placeholder="Search name, email, company or status" value="${esc(b.search)}">
      <select class="select" data-ch="bCompany"><option value="all">All current companies</option>${current.map((c) => `<option ${b.company === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="bar">${selBar('bulkSel')}</div>
    <div class="bar"><b>Target company</b><div class="grow">${comboHtml('__bulkUser', 'Search the target company...')}</div>
      <button class="btn soft" data-act="bulkPreview">Preview</button><button class="btn" data-act="bulkApply" ${b.preview && b.sel.size && target ? '' : 'disabled'}>Apply Company Change</button></div>
    ${b.preview && target ? `<div class="notice"><b>${b.sel.size}</b> users will move to <b>${esc(target.name)}</b>.</div>` : ''}
    ${tbl(['Select', 'User', 'Email', 'Current Company', 'Status', 'Target Company'], shown.map((x) => [rowBox('bulkSel', x.id, b.sel.has(x.id)), esc(x.name), esc(x.email), esc(x.company), esc(x.status), esc(target ? target.name : '')]), 'Load Hub users and companies to begin.')}
    ${moreBtn('bLimit', shown.length, users.length)}</div>`;
};
async function bulkApply() {
  const b = S.bulk, target = companyById(S.pick.__bulkUser), users = S.user.users.filter((u) => b.sel.has(u.id));
  if (!target || !users.length) return;
  if (!confirm(`Move ${users.length} user(s) to "${target.name}"?`)) return;
  const all = [];
  for (let i = 0; i < users.length; i += 25) {
    all.push(...(await api('bulk-user-company', { body: { hubId: S.hub, companyId: target.id, companyName: target.name, users: users.slice(i, i + 25) } })).results);
    setQueue(`Changing company: ${Math.min(i + 25, users.length)} of ${users.length}`, 100 * Math.min(i + 25, users.length) / users.length);
  }
  const ok = new Set(all.filter((r) => r.success).map((r) => r.id));
  S.user.users.forEach((u) => { if (ok.has(u.id)) { u.company = target.name; u.companyId = target.id; } });
  pushReports(all.map((r) => ({ Type: 'User company change', Name: r.email, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? `${r.oldCompany || '(none)'} -> ${r.newCompany}${r.verified ? ' (verified)' : ''}` : r.error })));
  b.sel.clear(); b.preview = false; flash(`${ok.size} users moved, ${all.length - ok.size} failed.`); renderView();
}

/* ------------------------------------------------------ project numbers */
const JOB_OPS = [['addPrefix', 'Add prefix to job number'], ['removePrefix', 'Remove prefix from job number'], ['addSuffix', 'Add suffix to job number'], ['removeSuffix', 'Remove suffix from job number'], ['set', 'Replace full job number']];
function proposeJob(current, op, value) {
  const j = String(current || '');
  if (op === 'addPrefix') return value + j;
  if (op === 'removePrefix') return value && j.startsWith(value) ? j.slice(value.length) : j;
  if (op === 'addSuffix') return j + value;
  if (op === 'removeSuffix') return value && j.endsWith(value) ? j.slice(0, -value.length) : j;
  return value;
}
VIEWS.numbers = () => {
  const J = S.jobs, projects = filteredJobs(), shown = projects.slice(0, J.limit), pm = new Map(J.preview.map((p) => [p.id, p]));
  const changed = J.preview.filter((p) => p.valid && p.proposed !== p.jobNumber).length;
  return `<div class="notice"><b>Job number only.</b> Updates the BIM 360 <code>job_number</code> field. Project names are never sent or changed. ACC projects may reject the update; failures are reported.</div>
  <div class="card"><div class="bar"><input id="jSearch" class="input grow" data-in="jSearch" placeholder="Search project name, job number, status, platform or ID" value="${esc(J.search)}">
      ${chip('noJob', 'No job number', J.noJob, 'jobChip')}<button class="btn" data-act="loadProjectsBtn">${S.projectsLoaded ? 'Reload Projects' : 'Load Projects'}</button></div>
    <div class="bar">${selBar('jobSel')}</div>
    <div class="bar"><select class="select" data-ch="jobOp">${JOB_OPS.map(([v, l]) => `<option value="${v}" ${J.op === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input id="jValue" class="input grow" data-in="jValue" placeholder="Prefix, suffix or full job number" value="${esc(J.value)}">
      <button class="btn soft" data-act="jobPreview">Preview</button><button class="btn" data-act="jobApply" ${changed ? '' : 'disabled'}>Apply ${changed || ''} Job Number Changes</button><button class="btn light" data-act="exportJobs">Export Preview</button></div>
    ${tbl(['Select', 'Project name (unchanged)', 'Platform', 'Current job number', 'Proposed job number', 'Status', 'Check'], shown.map((p) => { const x = pm.get(p.id); return [rowBox('jobSel', p.id, J.sel.has(p.id)), esc(p.name), esc(p.platform), esc(p.jobNumber), x ? `<b>${esc(x.proposed)}</b>` : '', esc(p.status), x ? `<span class="${x.valid ? 'ok' : 'bad'}">${esc(x.msg)}</span>` : '']; }), 'Load projects to begin.')}
    ${moreBtn('jLimit', shown.length, projects.length)}</div>`;
};
function jobPreview() {
  const J = S.jobs;
  J.preview = S.projects.filter((p) => J.sel.has(p.id)).map((p) => { const proposed = proposeJob(p.jobNumber, J.op, J.value), valid = proposed.length <= 100; return { id: p.id, name: p.name, jobNumber: p.jobNumber, proposed, valid, msg: !valid ? 'Over 100 characters' : proposed === p.jobNumber ? 'No change' : 'Ready - name unchanged' }; });
  renderView();
}
async function jobApply() {
  const J = S.jobs, items = J.preview.filter((p) => p.valid && p.proposed !== p.jobNumber);
  if (!items.length || !confirm(`Update the job number on ${items.length} project(s)?`)) return;
  const all = [];
  for (let i = 0; i < items.length; i += 25) {
    all.push(...(await api('project-job-numbers', { body: { hubId: S.hub, projects: items.slice(i, i + 25).map((p) => ({ id: p.id, name: p.name, jobNumber: p.jobNumber, proposedJobNumber: p.proposed })) } })).results);
    setQueue(`Updating job numbers: ${Math.min(i + 25, items.length)} of ${items.length}`, 100 * Math.min(i + 25, items.length) / items.length);
  }
  const ok = new Map(all.filter((r) => r.success).map((r) => [r.id, r.proposed]));
  S.projects.forEach((p) => { if (ok.has(p.id)) p.jobNumber = ok.get(p.id); });
  pushReports(all.map((r) => ({ Type: 'Job number', Name: r.name, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? `${r.original || '(blank)'} -> ${r.proposed}` : r.error })));
  J.preview = []; J.sel.clear(); flash(`${ok.size} updated, ${all.length - ok.size} failed.`); renderView();
}

/* --------------------------------------------------------------- reports */
VIEWS.reports = () => {
  const r = S.reports, ok = r.filter((x) => x.Result === 'Success').length, bad = r.filter((x) => x.Result === 'Failed').length;
  return `<div class="card"><h3>Comprehensive Hub User Project Register</h3>
    <p class="muted">One Excel workbook listing every Hub user, every project they belong to, their company on each project and their role names.</p>
    <div class="bar"><button class="btn" data-act="buildRegister">Build Register Workbook</button>${S.abn.rows.length ? '<button class="btn light" data-act="abnExport">ABN Lookup Report</button>' : ''}${S.xdel.rows.length ? '<button class="btn light" data-act="xdelExport">S Code Comparison Report</button>' : ''}</div></div>
  <div class="card"><div class="bar"><h3 class="grow">Action log</h3><span class="badge good">${ok} success</span><span class="badge bad">${bad} failed</span>
      <button class="btn light" data-act="exportReports" ${r.length ? '' : 'disabled'}>Export Excel</button><button class="btn light" data-act="clearReports" ${r.length ? '' : 'disabled'}>Clear</button></div>
    ${tbl(['Time', 'Type', 'Name', 'Project', 'Result', 'Detail'], r.slice(-1000).reverse().map((x) => [esc(x.Time), esc(x.Type), esc(x.Name), esc(x.Project), `<span class="${x.Result === 'Success' ? 'ok' : 'bad'}">${esc(x.Result)}</span>`, esc(x.Detail)]), 'Actions you run appear here.')}</div>`;
};
async function buildRegister() {
  if (typeof XLSX === 'undefined') return showError('The Excel writer is not available. Check your internet connection and reload.');
  if (!confirm('This loads every project and every project membership in the Hub. It can take a few minutes for large Hubs. Continue?')) return;
  await loadProjects(true);
  if (!S.user.loaded) await loadHubUsers();
  const memberships = [], errors = [], total = S.projects.length;
  for (let i = 0; i < total; i += 15) {
    try { const d = await api('project-users-batch', { body: { projects: S.projects.slice(i, i + 15) } }); memberships.push(...d.items); errors.push(...d.errors); }
    catch (e) { S.projects.slice(i, i + 15).forEach((p) => errors.push({ projectName: p.name, error: e.message })); }
    setQueue(`Building register: ${Math.min(i + 15, total)} of ${total} projects`, 100 * Math.min(i + 15, total) / total);
  }
  const hubByEmail = new Map(S.user.users.map((u) => [norm(u.email), u]));
  const rows = memberships.map((m) => { const hu = hubByEmail.get(norm(m.email)) || {}; return { User: m.name, Email: m.email, 'Hub company': hu.company || '', 'Hub status': hu.status || '', Project: m.projectName, 'Project status': m.projectStatus, Platform: m.projectPlatform, 'Company on project': m.company, 'Role names': roleNames(m.roles), 'Member status': m.status, 'Project ID': m.projectId, 'User ID': m.userId }; });
  rows.sort((a, b) => String(a['Hub company']).localeCompare(String(b['Hub company'])) || String(a.User).localeCompare(String(b.User)) || String(a.Project).localeCompare(String(b.Project)));
  const byCompany = new Map(), withProjects = new Set(), perProject = new Map();
  memberships.forEach((m) => {
    withProjects.add(norm(m.email)); perProject.set(m.projectId, (perProject.get(m.projectId) || 0) + 1);
    const ck = m.company || '(No company)', c = byCompany.get(ck) || { users: new Set(), projects: new Set(), count: 0 };
    c.users.add(norm(m.email)); c.projects.add(m.projectId); c.count++; byCompany.set(ck, c);
  });
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Hub Users', S.user.users.map((u) => ({ Name: u.name, Email: u.email, Company: u.company, Status: u.status, 'Hub role': u.role, 'Last sign in': u.lastSignIn, 'User ID': u.id })));
  addSheet(wb, 'User Project Memberships', rows);
  addSheet(wb, 'Users by Company', [...byCompany].map(([k, v]) => ({ Company: k, 'Distinct users': v.users.size, Projects: v.projects.size, Memberships: v.count })).sort((a, b) => b.Memberships - a.Memberships));
  addSheet(wb, 'Projects', S.projects.map((p) => ({ Project: p.name, 'Job number': p.jobNumber, Status: p.status, Platform: p.platform, Members: perProject.get(p.id) || 0, 'Project ID': p.id })));
  if (S.companiesLoaded) addSheet(wb, 'Companies', S.companies.map((c) => ({ 'Company ID': c.id, Company: c.name, Trade: c.trade, 'ERP ID': c.erpId, 'Tax ID': c.taxId, Status: c.status, Members: c.members, Projects: c.projects })));
  addSheet(wb, 'Users Without Projects', S.user.users.filter((u) => !withProjects.has(norm(u.email))).map((u) => ({ Name: u.name, Email: u.email, Company: u.company, Status: u.status })));
  addSheet(wb, 'Exceptions', errors.map((e) => ({ Project: e.projectName, Problem: e.error })));
  XLSX.writeFile(wb, `Hub_User_Project_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
  flash(`Register created: ${rows.length.toLocaleString()} memberships${errors.length ? `, ${errors.length} project(s) skipped` : ''}.`);
}

/* ---------------------------------------------------------------- events */
const SELECT_ALL = {
  cSel: () => filteredCompanies().map((c) => c.id), pSel: () => accessProjects().map((p) => p.id), mSel: () => filteredMembers().map((m) => m.key),
  uProjSel: () => userProjects().map((p) => p.projectId), bulkSel: () => bulkUsers().map((u) => u.id), jobSel: () => filteredJobs().map((p) => p.id),
  abnSel: () => abnRows().filter((r) => !isDeleted(r)).map((r) => r.id),
  xdelSel: () => xdelRows().filter(xdelSelectable).map((r) => r.key),
  addrSel: () => addressRows().filter((r) => r.status === 'Matched' && r.changed).map((r) => r.key),
  moveSel: () => moveRows().filter((r) => !isBim(r.projectPlatform) && !/Moved/.test(r.status2)).map((r) => r.key)
};
const repaint = (set) => (set === 'moveSel' ? paintMove() : renderView());
const resetFilters = () => { const f = S.cf; Object.keys(f).forEach((k) => { if (typeof f[k] === 'boolean') f[k] = false; }); f.search = ''; f.status = 'all'; };

const ACT = {
  nav: (el) => { S.tab = el.dataset.tab; showError(''); render(); },
  clearError: () => showError(''),
  auth: async () => { if (S.connected) { await api('auth-logout', { body: {} }); location.reload(); } else { location.href = (await api('auth-login')).url; } },
  refreshHubs: async () => { await loadHubs(); render(); },
  closeModal,
  more: (el) => { const map = { cLimit: [S, 'cLimit'], mLimit: [S.access, 'mLimit'], uLimit: [S.user, 'limit'], bLimit: [S.bulk, 'limit'], jLimit: [S.jobs, 'limit'], abnLimit: [S.abn, 'limit'], xdelLimit: [S.xdel, 'limit'], addrLimit: [S.addr, 'limit'] }[el.dataset.k]; map[0][map[1]] += PAGE_STEP; renderView(); },
  selectAll: (el) => { const set = el.dataset.set; SELECT_ALL[set]().forEach((id) => SETS()[set].add(id)); S.bulk.preview = false; repaint(set); },
  clearSel: (el) => { const set = el.dataset.set; SETS()[set].clear(); S.only[set] = false; S.bulk.preview = false; repaint(set); },
  quick: (el) => { resetFilters(); S.cf[el.dataset.q] = true; S.cLimit = PAGE_STEP; S.tab = 'companies'; render(); },
  resetCompanyFilters: () => { resetFilters(); S.only.cSel = false; renderView(); },
  loadCompanies, loadHubUsers,
  loadProjectsBtn: async () => { await loadProjects(true); flash(`Loaded ${S.projects.length.toLocaleString()} projects.`); renderView(); },
  exportCompanies: () => exportRows('Companies_Filtered.xlsx', filteredCompanies().map((c) => ({ 'Company ID': c.id, Company: c.name, Trade: c.trade, 'ERP ID': c.erpId, 'Tax ID': c.taxId, State: c.state, Postcode: c.postcode, Status: c.status, Members: c.members, Projects: c.projects })), 'Companies'),
  addField: (el) => addField(el.dataset.kind, el.dataset.id), saveField: (el) => saveField(el.dataset.kind, el.dataset.id),
  autoRename, deepPurge, bulkErpTax, applyErp,
  abnFromDirectory: () => { S.abn.scope = S.cSel.size ? 'selected' : 'filtered'; S.tab = 'abn'; render(); },
  abnRun, abnApply, abnExport, abnDelete,
  abnStop: () => { S.abn.stop = true; flash('Stopping after the current batch...'); },
  abnFilter: (el) => { S.abn.match = el.dataset.k; S.abn.limit = PAGE_STEP; renderView(); },
  abnSelectReady: () => { abnRows().filter(isReady).forEach((r) => S.abn.sel.add(r.id)); renderView(); },
  xdelTemplate: () => exportRows('Delete_by_S_Code_Template.xlsx', XDEL_TEMPLATE, 'Suppliers'),
  xdelFilter: (el) => { S.xdel.filter = el.dataset.k; S.xdel.limit = PAGE_STEP; renderView(); },
  xdelSelectExact: () => { S.xdel.rows.filter((r) => r.status === 'Match' && r.by === 'S code = ERP ID' && !r.check).forEach((r) => S.xdel.sel.add(r.key)); renderView(); },
  xdelDelete, xdelExport,
  addressTemplate, addressApply, addressExport,
  addressSelectChanged: () => { S.addr.rows.filter((r) => r.status === 'Matched' && r.changed).forEach((r) => S.addr.sel.add(r.key)); renderView(); },
  addressClear: () => { S.addr.sel.clear(); renderView(); },
  comboClear: (el, e) => { e.preventDefault(); delete S.pick[el.dataset.key]; const i = document.getElementById('combo_' + el.dataset.key); if (i) { i.value = ''; i.focus(); } const box = el.closest('.combo'); if (box) box.classList.remove('has'); el.outerHTML = '<span class="combo-caret">&#9662;</span>'; if (el.dataset.key === '__bulkUser') { S.bulk.preview = false; renderView(); } },
  replaceOne: (el) => startReplace([companyById(el.dataset.id)], companyById(S.pick[el.dataset.id])),
  replaceSelected: () => { const sources = S.companies.filter((c) => S.cSel.has(c.id)); if (!sources.length) return showError('Tick the companies to replace first.'); return startReplace(sources, companyById(S.pick.__bulk)); },
  moveTest, moveRun, moveExport,
  erpTemplate: () => exportRows('ERP_Tax_Update_Template.xlsx', ERP_TEMPLATE, 'Template'),
  audit: (el) => runAudit(el.dataset.id),
  auditSelectAll: () => { const st = S.audit; st.members.filter((m) => hasText([m.projectName, m.projectStatus, m.name, m.email, m.status, roleNames(m.roles)], (st.search || '').toLowerCase())).forEach((m) => st.sel.add(m.key)); paintAudit(); },
  auditClear: () => { S.audit.sel.clear(); paintAudit(); }, auditRemove, auditMoveHub, auditPurge,
  auditExport: () => exportRows(`${S.audit.company.name.slice(0, 20)}_members.xlsx`, S.audit.members.map((m) => ({ Project: m.projectName, 'Project status': m.projectStatus, Member: m.name, Email: m.email, Status: m.status, Roles: roleNames(m.roles) })), 'Members'),
  importTemplate, runImport,
  exportImportPreview: () => exportRows('Import_Validation.xlsx', S.imp.rows.map((r) => ({ Row: r.row, Status: r.status, ...r.data })), 'Validation'),
  loadMembers, changeRole, removeMembers,
  exportMembers: () => exportRows('Project_Users.xlsx', S.access.members.map((m) => ({ Project: m.projectName, User: m.name, Email: m.email, Company: m.company, Roles: roleNames(m.roles), Status: m.status })), 'Users'),
  selectUser: (el) => selectUser(el.dataset.id), removeUserSelected: () => removeUserProjects(false), removeUserAll: () => removeUserProjects(true), removeHubUser,
  exportUserProjects: () => exportRows('User_Projects.xlsx', S.user.projects.map((p) => ({ User: S.user.selected.email, Project: p.projectName, Status: p.status, Roles: roleNames(p.roles) })), 'Projects'),
  bulkPreview: () => { if (!companyById(S.pick.__bulkUser)) return showError('Choose the target company from the drop-down.'); S.bulk.preview = true; renderView(); }, bulkApply,
  jobPreview, jobApply,
  exportJobs: () => exportRows('Job_Number_Preview.xlsx', S.jobs.preview.map((p) => ({ Project: p.name, 'Current job number': p.jobNumber, 'Proposed job number': p.proposed, Check: p.msg })), 'Preview'),
  buildRegister,
  exportReports: () => exportRows('Action_Log.xlsx', S.reports, 'Log'),
  clearReports: () => { S.reports = []; renderView(); }
};

const rerender = debounce(renderView, 160);
const debouncedAudit = debounce(() => { if (S.audit) paintAudit(); }, 200);
const debouncedMove = debounce(() => { if (S.move) paintMove(); }, 200);
const IN = {
  cSearch: (el) => { S.cf.search = el.value; S.cLimit = PAGE_STEP; rerender(); },
  pSearch: (el) => { S.access.pSearch = el.value; rerender(); },
  mSearch: (el) => { S.access.mSearch = el.value; S.access.mLimit = PAGE_STEP; rerender(); },
  uSearch: (el) => { S.user.search = el.value; S.user.limit = PAGE_STEP; rerender(); },
  uPSearch: (el) => { S.user.pSearch = el.value; rerender(); },
  bSearch: (el) => { S.bulk.search = el.value; S.bulk.limit = PAGE_STEP; S.bulk.preview = false; rerender(); },
  jSearch: (el) => { S.jobs.search = el.value; S.jobs.limit = PAGE_STEP; rerender(); },
  jValue: (el) => { S.jobs.value = el.value; },
  abrGuid: (el) => { S.abn.guid = el.value.trim(); localStorage.setItem('abrGuid', S.abn.guid); },
  abnSearch: (el) => { S.abn.search = el.value; S.abn.limit = PAGE_STEP; rerender(); },
  xdelSearch: (el) => { S.xdel.search = el.value; S.xdel.limit = PAGE_STEP; rerender(); },
  addrSearch: (el) => { S.addr.search = el.value; S.addr.limit = PAGE_STEP; rerender(); },
  auditSearch: (el) => { S.audit.search = el.value; debouncedAudit(); },
  moveSearch: (el) => { S.move.search = el.value; debouncedMove(); }
};
const CH = {
  hub: (el) => { S.hub = el.value; S.companies = []; S.companiesLoaded = false; S.projects = []; S.projectsLoaded = false; S.user.users = []; S.user.loaded = false; S.access.members = []; S.pick = {}; S.abn.rows = []; S.abn.sel.clear(); if (S.xdel.raw.length) xdelMatch(); S.addr.rows = []; S.addr.sel.clear(); renderView(); },
  row: (el) => {
    const set = SETS()[el.dataset.set];
    if (el.checked) set.add(el.dataset.id); else set.delete(el.dataset.id);
    if (el.dataset.set === 'bulkSel') S.bulk.preview = false;
    if (el.dataset.set === 'moveSel') { paintMove(); return; }
    if (el.dataset.set === 'abnSel' || el.dataset.set === 'xdelSel' || (S.only[el.dataset.set] && !el.checked)) { renderView(); return; }
    paintCounts();
  },
  only: (el) => { S.only[el.dataset.set] = el.checked; repaint(el.dataset.set); },
  cf: (el) => { S.cf[el.dataset.k] = el.checked; S.cLimit = PAGE_STEP; renderView(); },
  cStatus: (el) => { S.cf.status = el.value; S.cLimit = PAGE_STEP; renderView(); },
  logo: (el) => uploadLogo(el.dataset.id, el.files[0]),
  erpFile: (el) => erpFile(el.files[0]), importFile: (el) => importFile(el.files[0]),
  xdelFile: (el) => xdelFile(el.files[0]),
  addressFile: (el) => addressFile(el.files[0]), addrRow: (el) => { if (el.checked) S.addr.sel.add(el.dataset.key); else S.addr.sel.delete(el.dataset.key); paintCounts(); }, addrFilter: (el) => { S.addr.filter = el.value; S.addr.limit = PAGE_STEP; renderView(); },
  xdelSheet: (el) => xdelLoadSheet(el.value),
  xdelCol: (el) => { S.xdel.cols[el.dataset.k] = el.value; xdelMatch(); renderView(); },
  xdelOpt: (el) => { S.xdel.opts[el.dataset.k] = el.checked; xdelMatch(); renderView(); },
  auditRow: (el) => { if (el.checked) S.audit.sel.add(el.dataset.key); else S.audit.sel.delete(el.dataset.key); paintAudit(); },
  moveOpt: (el) => { S.moveOpts[el.dataset.k] = el.checked; paintMove(); },
  abnScope: (el) => { S.abn.scope = el.value; renderView(); },
  abnMatch: (el) => { S.abn.match = el.value; S.abn.limit = PAGE_STEP; renderView(); },
  abnOpt: (el) => { S.abn.opts[el.dataset.k] = el.checked; refreshAbnChanges(); renderView(); },
  pStatus: (el) => { S.access.pStatus = el.value; renderView(); }, mCompany: (el) => { S.access.mCompany = el.value; renderView(); }, mRole: (el) => { S.access.role = el.value; },
  uCompany: (el) => { S.user.company = el.value; renderView(); },
  bCompany: (el) => { S.bulk.company = el.value; S.bulk.preview = false; renderView(); },
  jobOp: (el) => { S.jobs.op = el.value; }, jobChip: (el) => { S.jobs.noJob = el.checked; renderView(); }
};

document.addEventListener('click', async (e) => {
  if (!e.target.closest('.combo') && !e.target.closest('#comboPanel')) comboClose();
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act]) return;
  try { await ACT[el.dataset.act](el, e); } catch (err) { setQueue(null); showError(err.message); }
});
document.addEventListener('mousedown', (e) => { const opt = e.target.closest('#comboPanel .combo-opt'); if (opt) { e.preventDefault(); comboChoose(Number(opt.dataset.i)); } });
document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('.combo-in')) { e.target.select(); comboOpen(e.target); } });
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('.combo-in')) {
    if (S.pick[e.target.dataset.combo]) { delete S.pick[e.target.dataset.combo]; const b = e.target.closest('.combo'); if (b) b.classList.remove('has'); }
    comboOpen(e.target);
    return;
  }
  const el = e.target.closest('[data-in]');
  if (el && IN[el.dataset.in]) IN[el.dataset.in](el);
});
document.addEventListener('keydown', (e) => {
  if (!COMBO.input || e.target !== COMBO.input) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); comboHighlight(COMBO.idx + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); comboHighlight(COMBO.idx - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); comboChoose(COMBO.idx); }
  else if (e.key === 'Escape') comboClose();
});
document.addEventListener('focusout', (e) => {
  if (!e.target.matches || !e.target.matches('.combo-in')) return;
  const input = e.target;
  setTimeout(() => { if (document.activeElement === input) return; const picked = companyById(S.pick[input.dataset.combo]); input.value = picked ? picked.name : input.value; if (COMBO.input === input) comboClose(); }, 150);
});
window.addEventListener('scroll', () => { if (COMBO.input) comboClose(); }, true);
window.addEventListener('resize', () => { if (COMBO.input) comboClose(); });
document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-ch]');
  if (!el || !CH[el.dataset.ch]) return;
  try { await CH[el.dataset.ch](el, e); } catch (err) { showError(err.message); }
});

/* ---------------------------------------------------------------- start */
async function loadHubs() {
  const d = await api('hubs');
  S.hubs = d.hubs;
  if (!S.hubs.find((h) => h.id === S.hub)) S.hub = S.hubs[0] ? S.hubs[0].id : '';
}
async function start() {
  if (location.pathname === '/callback') {
    document.body.innerHTML = '<div style="font-family:Segoe UI,Arial;padding:40px"><h2>Connecting Autodesk...</h2><p id="cb">Completing secure sign-in.</p></div>';
    const p = new URLSearchParams(location.search);
    if (p.get('error') || !p.get('code')) { $('#cb').textContent = p.get('error_description') || p.get('error') || 'Autodesk did not return an authorization code.'; return; }
    try { await api('auth-callback&code=' + encodeURIComponent(p.get('code'))); location.replace('/'); } catch (e) { $('#cb').textContent = 'Autodesk sign-in failed: ' + e.message; }
    return;
  }
  render();
  try {
    const st = await api('auth-status');
    S.connected = st.authenticated; S.abrConfigured = !!st.abrConfigured;
    if (S.connected) await loadHubs();
  } catch (e) { showError(e.message); }
  render();
}
start();
