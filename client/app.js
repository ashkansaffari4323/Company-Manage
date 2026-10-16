'use strict';
/* Company Manage v33 - complete admin console for Autodesk Construction Cloud / BIM 360 */

const API = '/api/index?action=';
const PAGE_STEP = 300;

const S = {
  tab: 'dashboard', connected: false, hubs: [], hub: '', queue: null, busyLock: false,
  companies: [], companiesLoaded: false, cSel: new Set(), cLimit: PAGE_STEP,
  cf: { search: '', status: 'all', noErp: false, noTax: false, noMembers: false, noImage: false, unused: false, dupes: false },
  projects: [], projectsLoaded: false,
  access: { pSearch: '', pStatus: 'all', pSel: new Set(), members: [], mSearch: '', mCompany: 'all', mSel: new Set(), mLimit: PAGE_STEP, errors: [], role: '' },
  user: { users: [], loaded: false, search: '', company: 'all', limit: PAGE_STEP, selected: null, projects: [], loading: false, pSearch: '', pSel: new Set() },
  bulk: { search: '', company: 'all', sel: new Set(), target: '', preview: false, limit: PAGE_STEP },
  jobs: { search: '', sel: new Set(), op: 'addPrefix', value: '', preview: [], noJob: false, limit: PAGE_STEP },
  imp: { rows: [], file: '' },
  audit: null,
  replace: { __bulk: '', __hub: true, __purge: false },
  reports: []
};

/* ------------------------------------------------------------ utilities */
const $ = (s, r) => (r || document).querySelector(s);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasText = (list, q) => !q || list.some((v) => String(v == null ? '' : v).toLowerCase().includes(q));
const roleNames = (roles) => (roles || []).map((r) => r.name || r).join(', ');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function api(action, opts) {
  const o = opts || {};
  const r = await fetch(API + action, {
    method: o.body ? 'POST' : 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: o.body ? JSON.stringify(o.body) : undefined
  });
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
  el.innerHTML = S.queue
    ? `<div class="notice"><b>${esc(S.queue.text)}</b>${S.queue.pct != null ? `<div class="progress"><div style="width:${Math.max(0, Math.min(100, S.queue.pct))}%"></div></div>` : ''}</div>`
    : '';
}
function flash(text) { setQueue(text); setTimeout(() => { if (S.queue && S.queue.text === text) setQueue(null); }, 9000); }
function showError(msg) { const el = $('#err'); if (el) el.innerHTML = msg ? `<div class="error">${esc(msg)} <button class="x" data-act="clearError">Dismiss</button></div>` : ''; }

function tbl(heads, rows, empty) {
  return `<div class="table"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((v) => `<td>${v == null ? '' : v}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="empty">${empty || 'No records loaded.'}</td></tr>`}</tbody></table></div>`;
}
const chip = (key, label, on, ch) => `<label class="chip"><input type="checkbox" data-ch="${ch}" data-k="${key}" ${on ? 'checked' : ''}> ${label}</label>`;
const rowBox = (set, id, on) => `<input type="checkbox" data-ch="row" data-set="${set}" data-id="${esc(id)}" ${on ? 'checked' : ''}>`;
const moreBtn = (key, shown, total) => (total > shown ? `<div class="bar" style="margin-top:10px"><button class="btn light" data-act="more" data-k="${key}">Show ${Math.min(PAGE_STEP, total - shown)} more (${shown} of ${total} shown)</button></div>` : '');

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
function closeModal() { $('#modal').innerHTML = ''; if (S.audit) S.audit.cancelled = true; S.audit = null; }

function keepFocus(container, paint) {
  const act = document.activeElement;
  const id = act && act.id;
  const pos = act && act.selectionStart;
  paint();
  if (id) {
    const el = document.getElementById(id);
    if (el && el.tagName === 'INPUT') { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  }
}

/* ------------------------------------------------------------- selection */
const SETS = () => ({ cSel: S.cSel, pSel: S.access.pSel, mSel: S.access.mSel, uProjSel: S.user.pSel, bulkSel: S.bulk.sel, jobSel: S.jobs.sel });
function paintCounts() {
  const sets = SETS();
  document.querySelectorAll('[data-count]').forEach((el) => { el.textContent = `${sets[el.dataset.count].size} selected`; });
}

/* --------------------------------------------------------------- filters */
function filteredCompanies() {
  const f = S.cf, q = f.search.trim().toLowerCase();
  let dupes = null;
  if (f.dupes) { dupes = new Map(); for (const c of S.companies) { const k = norm(c.name); dupes.set(k, (dupes.get(k) || 0) + 1); } }
  return S.companies.filter((c) => {
    if (f.status !== 'all' && c.status !== f.status) return false;
    if (f.noErp && c.erpId) return false;
    if (f.noTax && c.taxId) return false;
    if (f.noMembers && c.members > 0) return false;
    if (f.noImage && c.imageUrl) return false;
    if (f.unused && (c.members > 0 || c.projects > 0)) return false;
    if (dupes && dupes.get(norm(c.name)) < 2) return false;
    return hasText([c.name, c.trade, c.erpId, c.taxId], q);
  });
}
const filteredProjects = (search, status) => {
  const q = (search || '').trim().toLowerCase();
  return S.projects.filter((p) => (status === 'all' || !status || p.status === status) && hasText([p.name, p.jobNumber, p.status, p.id], q));
};
function filteredMembers() {
  const a = S.access, q = a.mSearch.trim().toLowerCase();
  return a.members.filter((m) => (a.mCompany === 'all' || m.company === a.mCompany) && hasText([m.projectName, m.name, m.email, m.company, roleNames(m.roles), m.status], q));
}
function filteredHubUsers(search, company) {
  const q = (search || '').trim().toLowerCase();
  return S.user.users.filter((u) => (company === 'all' || u.company === company) && hasText([u.name, u.email, u.company, u.status], q));
}
const filteredJobs = () => filteredProjects(S.jobs.search, 'all').filter((p) => !S.jobs.noJob || !p.jobNumber);

/* ---------------------------------------------------------------- shell */
const TABS = [
  ['dashboard', 'Dashboard'], ['companies', 'Company Directory'], ['import', 'Import Companies'],
  ['access', 'Users & Access'], ['user', 'User Removal'], ['bulk', 'Bulk User Company'],
  ['numbers', 'Project Numbers'], ['reports', 'Reports & Excel']
];

function render() {
  $('#app').innerHTML = `<div class="layout">
    <aside class="side"><div class="brand">Company Manage<small>v33 &middot; Hub administration</small></div>
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
  keepFocus(view, () => {
    view.innerHTML = S.connected || S.tab === 'dashboard' ? VIEWS[S.tab]() : connectView();
  });
}
const connectView = () => `<div class="card empty-state"><h2>Connect to Autodesk</h2><p>Sign in with an Autodesk account that has Hub Admin access. All actions use that account's permissions.</p><button class="btn" data-act="auth">Connect Autodesk</button></div>`;

/* ------------------------------------------------------------ dashboard */
VIEWS.dashboard = () => {
  const c = S.companies, n = c.length;
  const cnt = (f) => c.filter(f).length;
  const noErp = cnt((x) => !x.erpId), noTax = cnt((x) => !x.taxId), noMem = cnt((x) => x.members === 0), unused = cnt((x) => x.members === 0 && x.projects === 0), noImg = cnt((x) => !x.imageUrl);
  const cov = (miss) => (n ? Math.round(100 * (n - miss) / n) + '%' : '-');
  const stat = (label, val, hint) => `<div class="stat"><span>${label}</span><b>${val}</b>${hint ? `<small>${hint}</small>` : ''}</div>`;
  const quick = (q, label, val) => `<button class="quick" data-act="quick" data-q="${q}" ${n ? '' : 'disabled'}><b>${val}</b><span>${label}</span></button>`;
  return `${S.connected ? '' : connectView()}
  <div class="stats">${stat('Companies loaded', n.toLocaleString(), S.companiesLoaded ? 'Directory loaded' : 'Open Company Directory and load')}
    ${stat('ERP ID coverage', cov(noErp), `${noErp.toLocaleString()} missing`)}${stat('Tax ID coverage', cov(noTax), `${noTax.toLocaleString()} missing`)}
    ${stat('Projects loaded', S.projects.length.toLocaleString())}${stat('Hub users loaded', S.user.users.length.toLocaleString())}</div>
  <div class="card"><h3>Data quality shortcuts</h3><p class="muted">Jump straight to a filtered Company Directory view. Load companies first.</p>
    <div class="quicks">${quick('noErp', 'Companies without ERP ID', noErp.toLocaleString())}${quick('noTax', 'Companies without Tax ID', noTax.toLocaleString())}
    ${quick('noMembers', 'Companies with no members', noMem.toLocaleString())}${quick('unused', 'Unused (no members, no projects)', unused.toLocaleString())}
    ${quick('noImage', 'Companies without a logo', noImg.toLocaleString())}${quick('dupes', 'Possible duplicate names', '&#8943;')}</div></div>
  <div class="card"><h3>What each tab does</h3><ul class="steps">
    <li><b>Company Directory</b> - filter every company, add ERP/Tax IDs, upload logos, click Members/Projects for a full audit, <b>replace one company with another</b> (moves every member in every project), auto rename, bulk ERP/Tax from Excel, remove members and purge.</li>
    <li><b>Import Companies</b> - validate and import Excel files with every company field Autodesk accepts.</li>
    <li><b>Users &amp; Access</b> - select multiple projects, load their users, search, change roles or remove access in bulk.</li>
    <li><b>User Removal</b> - pick a Hub user, see every project, remove from selected or all projects, then remove from the Hub.</li>
    <li><b>Bulk User Company</b> - move users from many companies to one target company in one operation.</li>
    <li><b>Project Numbers</b> - add or remove prefixes and suffixes on BIM 360 job numbers (never the project name).</li>
    <li><b>Reports &amp; Excel</b> - action log and the comprehensive Hub User Project Register workbook.</li></ul></div>`;
};

/* ------------------------------------------------------ company directory */
VIEWS.companies = () => {
  const rows = filteredCompanies(), f = S.cf, shown = rows.slice(0, S.cLimit), R = S.replace;
  return `<div class="card">
    <div class="bar"><input id="cSearch" class="input grow" data-in="cSearch" placeholder="Search company name, trade, ERP ID or Tax ID" value="${esc(f.search)}">
      <select class="select" data-ch="cStatus">${['all', 'active', 'inactive', 'deleted'].map((s) => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
      <button class="btn" data-act="loadCompanies">${S.companiesLoaded ? 'Reload All Companies' : 'Load All Companies'}</button>
      <button class="btn light" data-act="exportCompanies">Export Filtered</button></div>
    <div class="bar chips">${chip('noErp', 'No ERP ID', f.noErp, 'cf')}${chip('noTax', 'No Tax ID', f.noTax, 'cf')}${chip('noMembers', 'No members', f.noMembers, 'cf')}${chip('noImage', 'No logo', f.noImage, 'cf')}${chip('unused', 'Unused (0 members, 0 projects)', f.unused, 'cf')}${chip('dupes', 'Duplicate names', f.dupes, 'cf')}
      <button class="btn light small" data-act="resetCompanyFilters">Reset filters</button></div>
    <div class="bar"><span class="badge">${rows.length.toLocaleString()} of ${S.companies.length.toLocaleString()} companies</span>
      <button class="btn soft" data-act="selectAll" data-set="cSel">Select All Filtered</button><button class="btn light" data-act="clearSel" data-set="cSel">Deselect All</button>
      <span class="badge" data-count="cSel">${S.cSel.size} selected</span>
      <input id="renamePrefix" class="input" value="Not integrated company" placeholder="Auto rename prefix">
      <button class="btn soft" data-act="autoRename">Auto Rename</button>
      <button class="btn light" data-act="bulkErpTax">Bulk ERP / Tax from Excel</button>
      <button class="btn danger" data-act="deepPurge">Remove Members + Purge</button></div>
    <datalist id="companyOptions">${companyOptions()}</datalist>
    <div class="bar replacebar"><b>Replace selected companies with</b>
      <input id="bulkReplace" class="input grow" list="companyOptions" data-in="bulkReplace" placeholder="Type to search the target company..." value="${esc(R.__bulk)}">
      <label class="chip"><input type="checkbox" data-ch="optHub" ${R.__hub ? 'checked' : ''}> Also change Hub default company</label>
      <label class="chip"><input type="checkbox" data-ch="optPurge" ${R.__purge ? 'checked' : ''}> Delete old company afterwards</label>
      <button class="btn" data-act="replaceSelected">Move Members of Selected</button></div>
    ${tbl(['Select', 'Logo', 'Company', 'Trade', 'ERP ID', 'Tax ID', 'Status', 'Members', 'Projects', 'Replace with (moves all members)', 'Logo upload'],
      shown.map((c) => [rowBox('cSel', c.id, S.cSel.has(c.id)),
        c.imageUrl ? `<img class="logo" src="${esc(c.imageUrl)}" alt="">` : '<span class="muted">-</span>',
        esc(c.name), esc(c.trade),
        c.erpId ? esc(c.erpId) : `<button class="btn soft small" data-act="addField" data-kind="erp" data-id="${esc(c.id)}">+ Add ERP ID</button>`,
        c.taxId ? esc(c.taxId) : `<button class="btn soft small" data-act="addField" data-kind="tax" data-id="${esc(c.id)}">+ Add Tax ID</button>`,
        `<span class="badge">${esc(c.status || 'active')}</span>`,
        `<button class="btn soft small" data-act="audit" data-id="${esc(c.id)}">${c.members} member${c.members === 1 ? '' : 's'}</button>`,
        `<button class="btn soft small" data-act="audit" data-id="${esc(c.id)}">${c.projects} project${c.projects === 1 ? '' : 's'}</button>`,
        `<div class="replacecell"><input id="rep_${esc(c.id)}" class="input small" list="companyOptions" data-in="replace" data-id="${esc(c.id)}" placeholder="Choose company..." value="${esc(R[c.id] || '')}"><button class="btn small" data-act="replaceOne" data-id="${esc(c.id)}">Move</button></div>`,
        `<label class="btn light small">Logo<input type="file" accept="image/*" hidden data-ch="logo" data-id="${esc(c.id)}"></label>`]),
      S.companiesLoaded ? 'No companies match the current filters.' : 'Select Load All Companies. Large directories load in safe groups of 1,000 with a 5-second pause.')}
    ${moreBtn('cLimit', shown.length, rows.length)}</div>`;
};

async function loadCompanies() {
  if (S.busyLock) return;
  S.busyLock = true;
  try {
    let offset = 0, total = 0, all = [], pending = [];
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
    for (const job of pending) {
      await sleep(5000);
      try { const d = await api(`companies-page&hubId=${encodeURIComponent(S.hub)}&status=all&limit=${job.lim}&offset=${job.offset}`); all.push(...d.items); } catch { /* reported below */ }
    }
    S.companies = [...new Map(all.map((c) => [c.id, c])).values()];
    S.companiesLoaded = true; S.cSel.clear();
    flash(`Loaded ${S.companies.length.toLocaleString()} companies.`);
    renderView();
  } finally { S.busyLock = false; }
}

async function loadProjects(force) {
  if (S.projectsLoaded && !force) return;
  let all = [], offset = 0, total = 1;
  while (offset < total) {
    const d = await api(`projects-page&hubId=${encodeURIComponent(S.hub)}&offset=${offset}`);
    all.push(...d.items); total = d.total; offset = d.nextOffset;
    setQueue(`Loading projects: ${all.length.toLocaleString()} of ${total.toLocaleString()}`, total ? 100 * all.length / total : 0);
    if (!d.items.length) break;
  }
  S.projects = all; S.projectsLoaded = true;
  setQueue(null);
}

async function loadHubUsers() {
  if (S.busyLock) return;
  S.busyLock = true;
  try {
    let out = [], offset = 0, more = true, pending = [];
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
  const c = S.companies.find((x) => x.id === id);
  const erp = kind === 'erp';
  openModal(`<h3>${erp ? 'Add ERP ID' : 'Add Tax ID / ABN'}</h3><p class="muted">${esc(c.name)}</p>
    <div class="bar"><input id="fieldValue" class="input grow" placeholder="${erp ? 'ERP ID' : 'Tax ID / ABN'}" value="${esc(erp ? c.erpId : c.taxId)}">
    <button class="btn" data-act="saveField" data-kind="${kind}" data-id="${esc(id)}">Save</button><button class="btn light" data-act="closeModal">Cancel</button></div>`);
  setTimeout(() => { const i = $('#fieldValue'); if (i) i.focus(); }, 30);
}
async function saveField(kind, id) {
  const v = $('#fieldValue').value.trim();
  if (!v) return showError('Enter a value before saving.');
  const body = { hubId: S.hub, companyId: id };
  body[kind === 'erp' ? 'erp_id' : 'tax_id'] = v;
  await api('company-update', { body });
  const c = S.companies.find((x) => x.id === id);
  if (kind === 'erp') c.erpId = v; else c.taxId = v;
  pushReports([{ Type: kind === 'erp' ? 'Add ERP ID' : 'Add Tax ID', Name: c.name, Result: 'Success', Detail: v }]);
  closeModal(); renderView();
}
async function uploadLogo(id, file) {
  if (!file) return;
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
  await api('company-image', { body: { hubId: S.hub, companyId: id, fileName: file.name, mimeType: file.type, base64: data } });
  flash('Logo uploaded. Reload the directory to display the new image.');
  const c = S.companies.find((x) => x.id === id); pushReports([{ Type: 'Logo upload', Name: c && c.name, Result: 'Success' }]);
}

/* --- auto rename */
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

/* --- bulk ERP/Tax from Excel */
const ERP_TEMPLATE = [{ 'Company ID': '', 'Company Name': 'Example Pty Ltd', 'ERP ID': 'ERP-0001', 'Tax ID': '12 345 678 901' }];
function bulkErpTax() {
  openModal(`<h3>Bulk ERP / Tax update from Excel</h3>
    <p class="muted">Columns: <b>Company ID</b> or <b>Company Name</b>, plus <b>ERP ID</b> and/or <b>Tax ID</b>. Companies are matched against the loaded directory.</p>
    <div class="bar"><button class="btn light" data-act="erpTemplate">Download template</button>
    <input type="file" accept=".xlsx,.xls,.csv" data-ch="erpFile"><button class="btn light" data-act="closeModal">Close</button></div><div id="erpPreview"></div>`, true);
}
let ERP_ROWS = [];
async function erpFile(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') return showError('The Excel reader is not available. Check your internet connection and reload.');
  const wb = XLSX.read(await file.arrayBuffer());
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const byId = new Map(S.companies.map((c) => [c.id, c])), byName = new Map(S.companies.map((c) => [norm(c.name), c]));
  ERP_ROWS = raw.map((r, i) => {
    const id = String(r['Company ID'] || '').trim(), name = String(r['Company Name'] || r.Name || '').trim();
    const c = (id && byId.get(id)) || (name && byName.get(norm(name)));
    return { row: i + 2, company: c, erp: String(r['ERP ID'] || '').trim(), tax: String(r['Tax ID'] || '').trim(), label: name || id };
  });
  const ready = ERP_ROWS.filter((r) => r.company && (r.erp || r.tax));
  $('#erpPreview').innerHTML = `<div class="notice">${ready.length} of ${ERP_ROWS.length} rows are ready.</div>
    ${tbl(['Row', 'Company', 'ERP ID', 'Tax ID', 'Match'], ERP_ROWS.slice(0, 300).map((r) => [r.row, esc(r.label), esc(r.erp), esc(r.tax), r.company ? '<span class="ok">Matched</span>' : '<span class="bad">Not in loaded directory</span>']))}
    <div class="bar" style="margin-top:12px"><button class="btn" data-act="applyErp" ${ready.length ? '' : 'disabled'}>Apply ${ready.length} updates</button></div>`;
}
async function applyErp() {
  const ready = ERP_ROWS.filter((r) => r.company && (r.erp || r.tax)), all = [];
  for (let i = 0; i < ready.length; i += 25) {
    const items = ready.slice(i, i + 25).map((r) => ({ id: r.company.id, name: r.company.name, erp_id: r.erp, tax_id: r.tax }));
    const d = await api('companies-bulk-update', { body: { hubId: S.hub, items } });
    all.push(...d.results);
    setQueue(`ERP/Tax update: ${Math.min(i + 25, ready.length)} of ${ready.length}`, 100 * Math.min(i + 25, ready.length) / ready.length);
  }
  const ok = new Set(all.filter((r) => r.success).map((r) => r.id));
  ready.forEach((r) => { if (ok.has(r.company.id)) { if (r.erp) r.company.erpId = r.erp; if (r.tax) r.company.taxId = r.tax; } });
  pushReports(all.map((r) => ({ Type: 'Bulk ERP/Tax', Name: r.name, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
  closeModal(); flash(`ERP/Tax update complete: ${ok.size} updated, ${all.length - ok.size} failed.`); renderView();
}

/* --- company audit (members / projects) */
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

function auditProgressHtml(st) {
  const pct = st.total ? Math.round(100 * st.checked / st.total) : 0;
  return `<b>Loading projects and members...</b><div class="progress"><div style="width:${pct}%"></div></div>${pct}% complete (${st.checked} of ${st.total} projects). Results appear when loading reaches 100%.`;
}
function auditLoadingHtml(st) {
  return `<div class="bar"><h3 class="grow">${esc(st.company.name)}</h3><button class="btn light" data-act="closeModal">Close</button></div>
    <div class="notice" id="auditProg">${auditProgressHtml(st)}</div>`;
}
function auditFinalHtml(st) {
  const q = (st.search || '').toLowerCase();
  const members = st.members.filter((m) => hasText([m.projectName, m.projectStatus, m.name, m.email, m.status, roleNames(m.roles)], q));
  const byProject = new Map();
  members.forEach((m) => byProject.set(m.projectId, { name: m.projectName, status: m.projectStatus, count: (byProject.has(m.projectId) ? byProject.get(m.projectId).count : 0) + 1 }));
  return `<div class="bar"><h3 class="grow">${esc(st.company.name)}</h3><span class="badge good">100% loaded - ${st.total} projects checked</span><button class="btn light" data-act="closeModal">Close</button></div>
    ${st.errors.length ? `<div class="error">${st.errors.length} project(s) could not be read (permissions or timeouts). Results may be incomplete.</div>` : ''}
    <div class="bar"><input id="auditSearch" class="input grow" data-in="auditSearch" placeholder="Search projects, members, email, role or status" value="${esc(st.search || '')}">
      <button class="btn soft" data-act="auditSelectAll">Select All Filtered</button><button class="btn light" data-act="auditClear">Deselect All</button>
      <span class="badge">${st.sel.size} selected</span><button class="btn danger" data-act="auditRemove" ${st.sel.size ? '' : 'disabled'}>Remove Selected From Projects</button>
      <button class="btn light" data-act="auditExport">Export Excel</button></div>
    <h4>Projects (${byProject.size})</h4>${tbl(['Project', 'Status', 'Members from this company'], [...byProject.values()].map((p) => [esc(p.name), esc(p.status), p.count]), 'No project memberships found for this company.')}
    <h4>Members (${members.length})</h4>${tbl(['Select', 'Project', 'Member', 'Email', 'Status', 'Roles'],
      members.slice(0, 600).map((m) => [`<input type="checkbox" data-ch="auditRow" data-key="${esc(m.key)}" ${st.sel.has(m.key) ? 'checked' : ''}>`, esc(m.projectName), esc(m.name), esc(m.email), esc(m.status), esc(roleNames(m.roles))]), 'No members.')}`;
}
function paintAudit() {
  const box = $('.modalbox');
  const top = box ? box.scrollTop : 0;
  keepFocus(null, () => openModal(auditFinalHtml(S.audit), true));
  const nb = $('.modalbox');
  if (nb) nb.scrollTop = top;
}

async function runAudit(id) {
  const c = S.companies.find((x) => x.id === id);
  const st = { company: c, members: [], errors: [], search: '', checked: 0, total: 0, sel: new Set(), cancelled: false };
  S.audit = st; openModal(auditLoadingHtml(st), true);
  try {
    const { found, errors } = await scanMemberships([id], (checked, total) => {
      st.checked = checked; st.total = total;
      const el = $('#auditProg');
      if (!st.cancelled && el) el.innerHTML = auditProgressHtml(st);
    });
    if (st.cancelled) return;
    st.members = found; st.errors = errors; st.total = S.projects.length; st.checked = st.total;
    paintAudit();
  } catch (e) { if (!st.cancelled) { closeModal(); showError(e.message); } }
}

async function removeMemberships(items, label) {
  const out = [];
  for (let i = 0; i < items.length; i += 25) {
    const d = await api('members-bulk', { body: { operation: 'remove', items: items.slice(i, i + 25) } });
    out.push(...d.results);
    setQueue(`${label}: ${Math.min(i + 25, items.length)} of ${items.length}`, 100 * Math.min(i + 25, items.length) / items.length);
  }
  pushReports(out.map((r) => ({ Type: label, Name: r.email || r.name, Project: r.projectName, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
  return out;
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

/* --- remove members + purge */
async function deepPurge() {
  const selected = filteredCompanies().filter((c) => S.cSel.has(c.id));
  if (!selected.length) return showError('Select at least one company first.');
  const typed = prompt(`This removes every project member assigned to ${selected.length} compan${selected.length === 1 ? 'y' : 'ies'} and then deletes the compan${selected.length === 1 ? 'y' : 'ies'}.\n\nType PURGE to continue.`);
  if (typed !== 'PURGE') return;
  const needScan = selected.filter((c) => c.members > 0 || c.projects > 0);
  let memberships = [], scanErrors = [];
  if (needScan.length) {
    const r = await scanMemberships(needScan.map((c) => c.id), (a, b) => setQueue(`Scanning projects for members: ${a} of ${b}`, 100 * a / b));
    memberships = r.found; scanErrors = r.errors;
  }
  const removeResults = memberships.length ? await removeMemberships(memberships, 'Purge: remove member') : [];
  const failedCompanies = new Set(removeResults.filter((r) => !r.success).map((r) => (memberships.find((m) => m.key === r.key) || {}).companyId));
  const deletable = selected.filter((c) => !failedCompanies.has(c.id) && !scanErrors.length);
  const deleted = new Set();
  for (let i = 0; i < deletable.length; i += 25) {
    const d = await api('companies-purge', { body: { hubId: S.hub, companies: deletable.slice(i, i + 25) } });
    d.results.forEach((r) => { if (r.success) deleted.add(r.id); });
    pushReports(d.results.map((r) => ({ Type: 'Company purge', Name: r.name, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
    setQueue(`Purging companies: ${Math.min(i + 25, deletable.length)} of ${deletable.length}`, 100 * Math.min(i + 25, deletable.length) / deletable.length);
  }
  const skipped = selected.filter((c) => !deleted.has(c.id) && !deletable.includes(c));
  pushReports(skipped.map((c) => ({ Type: 'Company purge', Name: c.name, Result: 'Pending', Detail: scanErrors.length ? 'Some projects could not be scanned; company kept.' : 'One or more memberships could not be removed.' })));
  S.companies = S.companies.filter((c) => !deleted.has(c.id)); S.cSel.clear();
  flash(`Purge complete: ${deleted.size} deleted, ${selected.length - deleted.size} kept. See Reports.`); renderView();
}

/* --- replace / merge company (moves members in every project) */
const companyLabel = (c) => `${c.name}  [${String(c.id).slice(0, 8)}]`;
let OPTION_CACHE = { key: '', html: '' };
function companyOptions() {
  const live = S.companies.filter((c) => c.status !== 'deleted');
  const key = live.length + '|' + live.reduce((n, c) => n + c.name.length, 0);
  if (OPTION_CACHE.key !== key) {
    OPTION_CACHE = { key, html: live.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${esc(companyLabel(c))}"></option>`).join('') };
  }
  return OPTION_CACHE.html;
}
function resolveCompany(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const live = S.companies.filter((c) => c.status !== 'deleted');
  const exact = live.find((c) => companyLabel(c) === t);
  if (exact) return exact;
  const byName = live.filter((c) => norm(c.name) === norm(t));
  return byName.length === 1 ? byName[0] : null;
}

async function moveCompanies(sources, target) {
  const opts = { hub: S.replace.__hub !== false, purge: !!S.replace.__purge };
  const ids = sources.map((c) => c.id);
  const names = sources.map((c) => c.name).join(', ');
  const msg = `Move every project member of:\n${names.length > 300 ? sources.length + ' companies' : names}\n\nto: ${target.name}\n\n` +
    (opts.hub ? 'Hub default company will also change.\n' : '') +
    (opts.purge ? `The old compan${sources.length === 1 ? 'y' : 'ies'} will then be deleted.\n` : '') + '\nContinue?';
  if (!confirm(msg)) return;

  // 1. find every membership of the source companies across all projects
  const { found, errors } = await scanMemberships(ids, (a, b) => setQueue(`Finding members in projects: ${a} of ${b}`, 100 * a / b));

  // 2. move each project membership to the target company
  const moved = [];
  for (let i = 0; i < found.length; i += 25) {
    const d = await api('members-bulk', { body: { operation: 'company', companyId: target.id, items: found.slice(i, i + 25) } });
    moved.push(...d.results);
    setQueue(`Moving project members: ${Math.min(i + 25, found.length)} of ${found.length}`, 100 * Math.min(i + 25, found.length) / found.length);
  }
  pushReports(moved.map((r) => ({ Type: 'Replace company (project)', Name: r.email || r.name, Project: r.projectName, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? `-> ${target.name}` : r.error })));

  // 3. change Hub default company for users whose default is a source company
  const hubMoved = [];
  if (opts.hub) {
    if (!S.user.loaded) { S.busyLock = false; await loadHubUsers(); }
    const hubUsers = S.user.users.filter((u) => ids.includes(u.companyId));
    for (let i = 0; i < hubUsers.length; i += 25) {
      const d = await api('bulk-user-company', { body: { hubId: S.hub, companyId: target.id, companyName: target.name, users: hubUsers.slice(i, i + 25) } });
      hubMoved.push(...d.results);
      setQueue(`Changing Hub default company: ${Math.min(i + 25, hubUsers.length)} of ${hubUsers.length}`, 100 * Math.min(i + 25, hubUsers.length) / hubUsers.length);
    }
    const okHub = new Set(hubMoved.filter((r) => r.success).map((r) => r.id));
    S.user.users.forEach((u) => { if (okHub.has(u.id)) { u.company = target.name; u.companyId = target.id; } });
    pushReports(hubMoved.map((r) => ({ Type: 'Replace company (Hub default)', Name: r.email, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? `${r.oldCompany || '(none)'} -> ${target.name}` : r.error })));
  }

  // 4. update counts locally; optionally delete sources that are now empty
  const okKeys = new Set(moved.filter((r) => r.success).map((r) => r.key));
  const failedBySource = new Map();
  found.forEach((m) => { if (!okKeys.has(m.key)) failedBySource.set(m.companyId, (failedBySource.get(m.companyId) || 0) + 1); });
  const movedProjects = new Set(found.filter((m) => okKeys.has(m.key)).map((m) => m.projectId));
  target.members += okKeys.size;
  target.projects = Math.max(target.projects, movedProjects.size);
  sources.forEach((c) => { if (!failedBySource.get(c.id) && !errors.length) { c.members = 0; c.projects = 0; } });

  let purged = 0;
  if (opts.purge) {
    const clean = sources.filter((c) => !failedBySource.get(c.id) && !errors.length);
    if (clean.length) {
      const d = await api('companies-purge', { body: { hubId: S.hub, companies: clean } });
      const ok = new Set(d.results.filter((r) => r.success).map((r) => r.id));
      purged = ok.size;
      S.companies = S.companies.filter((c) => !ok.has(c.id));
      pushReports(d.results.map((r) => ({ Type: 'Replace company (delete old)', Name: r.name, Result: r.success ? 'Success' : 'Failed', Detail: r.error || '' })));
    }
    sources.filter((c) => !clean.includes(c)).forEach((c) => pushReports([{ Type: 'Replace company (delete old)', Name: c.name, Result: 'Pending', Detail: 'Not deleted because some members could not be moved or some projects could not be read.' }]));
  }
  if (errors.length) pushReports(errors.map((e) => ({ Type: 'Replace company (scan)', Project: e.projectName, Result: 'Failed', Detail: e.error })));

  ids.forEach((id) => { delete S.replace[id]; S.cSel.delete(id); });
  S.replace.__bulk = '';
  const failed = found.length - okKeys.size;
  flash(`Replace complete: ${okKeys.size} project membership(s) moved to ${target.name}${failed ? `, ${failed} failed` : ''}` +
    (opts.hub ? `, ${hubMoved.filter((r) => r.success).length} Hub default(s) changed` : '') +
    (opts.purge ? `, ${purged} old compan${purged === 1 ? 'y' : 'ies'} deleted` : '') +
    (errors.length ? `. ${errors.length} project(s) could not be read - see Reports.` : '.'));
  renderView();
}

async function replaceOne(id) {
  const src = S.companies.find((c) => c.id === id);
  const typed = S.replace[id] || ($('#rep_' + id) || {}).value;
  const target = resolveCompany(typed);
  if (!target) return showError('Choose the replacement company from the list (start typing its name, then pick it).');
  if (target.id === src.id) return showError('The replacement company must be a different company.');
  await moveCompanies([src], target);
}
async function replaceSelected() {
  const target = resolveCompany(S.replace.__bulk);
  if (!target) return showError('Choose the target company from the list (start typing its name, then pick it).');
  const sources = filteredCompanies().filter((c) => S.cSel.has(c.id) && c.id !== target.id);
  if (!sources.length) return showError('Select one or more companies to replace (the target itself is excluded).');
  await moveCompanies(sources, target);
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
  const row = { 'Name': 'Example Company Pty Ltd', 'Trade': 'Corporate & Professional Services', 'Address Line 1': '123 Example Street', 'Address Line 2': 'Level 2', 'City': 'Adelaide', 'State or Province': 'South Australia', 'Postal Code': '5000', 'Country': 'Australia', 'Phone': '+61 8 0000 0000', 'Website URL': 'https://example.com', 'Description': 'Example description', 'ERP ID': 'ERP-0001', 'Tax ID': '12 345 678 901' };
  addSheet(wb, 'Companies', [row]);
  addSheet(wb, 'Instructions', [{ Field: 'Name', Required: 'Yes', Notes: 'Must be unique in the Hub (max 255 characters).' }, { Field: 'Trade', Required: 'No', Notes: 'Must match an Autodesk trade. Blank uses the default.' }, { Field: 'Country / State', Required: 'No', Notes: 'State must be valid for the selected country.' }, { Field: 'ERP ID / Tax ID', Required: 'No', Notes: 'Stored on the company for external systems.' }]);
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
  const a = S.access, projects = filteredProjects(a.pSearch, a.pStatus), members = filteredMembers();
  const statuses = [...new Set(S.projects.map((p) => p.status).filter(Boolean))].sort();
  const companies = [...new Set(a.members.map((m) => m.company).filter(Boolean))].sort();
  const roles = [...new Set(a.members.flatMap((m) => m.roles.map((r) => r.name)))].sort();
  return `<div class="card"><h3>1. Select projects</h3>
    <div class="bar"><input id="pSearch" class="input grow" data-in="pSearch" placeholder="Search project name, job number, status or ID" value="${esc(a.pSearch)}">
      <select class="select" data-ch="pStatus"><option value="all">All statuses</option>${statuses.map((s) => `<option ${a.pStatus === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <button class="btn" data-act="loadProjectsBtn">${S.projectsLoaded ? 'Reload Projects' : 'Load Projects'}</button>
      <button class="btn soft" data-act="selectAll" data-set="pSel">Select All Filtered</button><button class="btn light" data-act="clearSel" data-set="pSel">Deselect All</button>
      <span class="badge" data-count="pSel">${a.pSel.size} selected</span><button class="btn" data-act="loadMembers">Load Users From Selected Projects</button></div>
    ${tbl(['Select', 'Project', 'Job Number', 'Status'], projects.slice(0, 400).map((p) => [rowBox('pSel', p.id, a.pSel.has(p.id)), esc(p.name), esc(p.jobNumber), esc(p.status)]), 'Load projects to begin.')}</div>
  <div class="card"><h3>2. Users in selected projects</h3>
    ${a.errors.length ? `<div class="error">${a.errors.length} project(s) could not be read.</div>` : ''}
    <div class="bar"><input id="mSearch" class="input grow" data-in="mSearch" placeholder="Search user, email, company, project, role or status" value="${esc(a.mSearch)}">
      <select class="select" data-ch="mCompany"><option value="all">All companies</option>${companies.map((c) => `<option ${a.mCompany === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <span class="badge">${members.length.toLocaleString()} of ${a.members.length.toLocaleString()} memberships</span></div>
    <div class="bar"><button class="btn soft" data-act="selectAll" data-set="mSel">Select All Filtered</button><button class="btn light" data-act="clearSel" data-set="mSel">Deselect All</button>
      <span class="badge" data-count="mSel">${a.mSel.size} selected</span>
      <select class="select" data-ch="mRole"><option value="">Choose new role...</option>${roles.map((r) => `<option ${a.role === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <button class="btn" data-act="changeRole">Change Role</button><button class="btn danger" data-act="removeMembers">Remove From Projects</button>
      <button class="btn light" data-act="exportMembers">Export Excel</button></div>
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
  for (let i = 0; i < sendable.length; i += 25) {
    const d = await api('members-bulk', { body: { operation: 'role', items: sendable.slice(i, i + 25) } });
    out.push(...d.results);
  }
  const ok = new Set(out.filter((r) => r.success).map((r) => r.key));
  a.members.forEach((m) => { if (ok.has(m.key)) m.roles = [{ id: roleMap.get(`${m.projectId}::${role}`), name: role }]; });
  pushReports([...out.map((r) => ({ Type: 'Change role', Name: r.email, Project: r.projectName, Result: r.success ? 'Success' : 'Failed', Detail: r.error || role })),
    ...unresolved.map((m) => ({ Type: 'Change role', Name: m.email, Project: m.projectName, Result: 'Failed', Detail: `Role "${role}" is not currently held by any member of this project, so its ID is unknown.` }))]);
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
  const u = S.user, users = filteredHubUsers(u.search, u.company), shown = users.slice(0, u.limit);
  const companies = [...new Set(u.users.map((x) => x.company).filter(Boolean))].sort();
  const projects = u.projects.filter((p) => hasText([p.projectName, p.status, roleNames(p.roles)], u.pSearch.trim().toLowerCase()));
  const sel = u.selected;
  return `<div class="card"><h3>1. Find a Hub user</h3>
    <div class="bar"><input id="uSearch" class="input grow" data-in="uSearch" placeholder="Search name, email, company or status" value="${esc(u.search)}">
      <select class="select" data-ch="uCompany"><option value="all">All companies</option>${companies.map((c) => `<option ${u.company === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <button class="btn" data-act="loadHubUsers">${u.loaded ? 'Reload Hub Users' : 'Load Hub Users'}</button><span class="badge">${users.length.toLocaleString()} of ${u.users.length.toLocaleString()}</span></div>
    ${tbl(['User', 'Email', 'Company', 'Status', 'Action'], shown.map((x) => [esc(x.name), esc(x.email), esc(x.company), esc(x.status), `<button class="btn soft small" data-act="selectUser" data-id="${esc(x.id)}">Select User</button>`]), 'Load Hub users to begin.')}
    ${moreBtn('uLimit', shown.length, users.length)}</div>
  ${sel ? `<div class="card"><div class="bar"><div class="grow"><h3>${esc(sel.name || sel.email)}</h3><div class="muted">${esc(sel.email)} &middot; ${esc(sel.company || 'No company')} &middot; ${esc(sel.status)}</div></div>
      <span class="badge">${u.loading ? 'Loading projects...' : u.projects.length + ' project memberships'}</span></div>
    ${u.loading ? '<div class="notice"><b>Loading this user\'s projects...</b></div>' : `
    <div class="bar"><input id="uPSearch" class="input grow" data-in="uPSearch" placeholder="Search this user's projects" value="${esc(u.pSearch)}">
      <button class="btn soft" data-act="selectAll" data-set="uProjSel">Select All Filtered</button><button class="btn light" data-act="clearSel" data-set="uProjSel">Deselect All</button>
      <span class="badge" data-count="uProjSel">${u.pSel.size} selected</span>
      <button class="btn danger" data-act="removeUserSelected">Remove From Selected Projects</button><button class="btn danger" data-act="removeUserAll" ${u.projects.length ? '' : 'disabled'}>Remove From All Projects</button>
      <button class="btn light" data-act="exportUserProjects">Export Excel</button></div>
    ${tbl(['Select', 'Project', 'Status', 'Roles'], projects.map((p) => [rowBox('uProjSel', p.projectId, u.pSel.has(p.projectId)), esc(p.projectName), esc(p.status), esc(roleNames(p.roles))]), 'This user has no accessible project memberships.')}
    <div class="dangerbox"><h4>Remove user from the Hub</h4><p class="muted">Enabled only when no project memberships remain. Type REMOVE USER to confirm.</p>
      <div class="bar"><input id="removeText" class="input" placeholder="Type REMOVE USER"><button class="btn danger" data-act="removeHubUser" ${u.projects.length ? 'disabled' : ''}>Delete User From Hub</button></div></div>`}</div>` : ''}`;
};
async function selectUser(id) {
  const u = S.user; u.selected = u.users.find((x) => x.id === id); u.projects = []; u.pSel.clear(); u.loading = true; u.pSearch = ''; renderView();
  try { const d = await api(`user-projects-direct&hubId=${encodeURIComponent(S.hub)}&userId=${encodeURIComponent(id)}`); u.projects = d.projects.filter((p) => p.projectId); }
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
  const u = S.user, text = $('#removeText').value;
  const d = await api('remove-hub-user', { body: { hubId: S.hub, userId: u.selected.id, confirmText: text } });
  pushReports([{ Type: 'Hub user removal', Name: u.selected.email, Result: d.success ? 'Success' : 'Failed' }]);
  u.users = u.users.filter((x) => x.id !== u.selected.id); u.selected = null; flash('User removed from the Hub.'); renderView();
}

/* ------------------------------------------------- bulk user company */
VIEWS.bulk = () => {
  const b = S.bulk, users = filteredHubUsers(b.search, b.company), shown = users.slice(0, b.limit);
  const current = [...new Set(S.user.users.map((x) => x.company).filter(Boolean))].sort();
  const targets = S.companies.filter((c) => c.status !== 'deleted');
  const target = S.companies.find((c) => c.id === b.target);
  const count = b.sel.size;
  return `<div class="notice">Changes each selected user's <b>default Hub company</b>. Users can come from many different companies; all move to one target. To move a whole company's project members, use <b>Replace with</b> in the Company Directory.</div>
  <div class="card"><div class="bar"><button class="btn" data-act="loadHubUsers">${S.user.loaded ? 'Reload Hub Users' : 'Load Hub Users'}</button>
      <button class="btn" data-act="loadCompanies">${S.companiesLoaded ? 'Reload Companies' : 'Load Companies'}</button>
      <input id="bSearch" class="input grow" data-in="bSearch" placeholder="Search name, email, company or status" value="${esc(b.search)}">
      <select class="select" data-ch="bCompany"><option value="all">All current companies</option>${current.map((c) => `<option ${b.company === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="bar"><button class="btn soft" data-act="selectAll" data-set="bulkSel">Select All Filtered</button><button class="btn light" data-act="clearSel" data-set="bulkSel">Deselect All</button>
      <span class="badge" data-count="bulkSel">${count} selected</span>
      <select class="select grow" data-ch="bTarget"><option value="">Select target company...</option>${targets.map((c) => `<option value="${esc(c.id)}" ${b.target === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button class="btn soft" data-act="bulkPreview">Preview</button><button class="btn" data-act="bulkApply" ${b.preview && count && target ? '' : 'disabled'}>Apply Company Change</button></div>
    ${b.preview && target ? `<div class="notice"><b>${count}</b> users will move to <b>${esc(target.name)}</b>.</div>` : ''}
    ${tbl(['Select', 'User', 'Email', 'Current Company', 'Status', 'Target Company'], shown.map((x) => [rowBox('bulkSel', x.id, b.sel.has(x.id)), esc(x.name), esc(x.email), esc(x.company), esc(x.status), esc(target ? target.name : '')]), 'Load Hub users and companies to begin.')}
    ${moreBtn('bLimit', shown.length, users.length)}</div>`;
};
async function bulkApply() {
  const b = S.bulk, target = S.companies.find((c) => c.id === b.target), users = S.user.users.filter((u) => b.sel.has(u.id));
  if (!target || !users.length) return;
  if (!confirm(`Move ${users.length} user(s) to "${target.name}"?`)) return;
  const all = [];
  for (let i = 0; i < users.length; i += 25) {
    const d = await api('bulk-user-company', { body: { hubId: S.hub, companyId: target.id, companyName: target.name, users: users.slice(i, i + 25) } });
    all.push(...d.results); setQueue(`Changing company: ${Math.min(i + 25, users.length)} of ${users.length}`, 100 * Math.min(i + 25, users.length) / users.length);
  }
  const ok = new Set(all.filter((r) => r.success).map((r) => r.id));
  S.user.users.forEach((u) => { if (ok.has(u.id)) { u.company = target.name; u.companyId = target.id; } });
  pushReports(all.map((r) => ({ Type: 'User company change', Name: r.email, Result: r.success ? 'Success' : 'Failed', Detail: r.success ? `${r.oldCompany || '(none)'} -> ${r.newCompany}` : r.error })));
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
  return `<div class="notice"><b>Job number only.</b> This tool updates the BIM 360 <code>job_number</code> field. Project names are shown for identification and are never sent or changed. ACC/Forma projects may reject the update; failures are reported.</div>
  <div class="card"><div class="bar"><input id="jSearch" class="input grow" data-in="jSearch" placeholder="Search project name, job number, status or ID" value="${esc(J.search)}">
      ${chip('noJob', 'No job number', J.noJob, 'jobChip')}<button class="btn" data-act="loadProjectsBtn">${S.projectsLoaded ? 'Reload Projects' : 'Load Projects'}</button>
      <button class="btn soft" data-act="selectAll" data-set="jobSel">Select All Filtered</button><button class="btn light" data-act="clearSel" data-set="jobSel">Deselect All</button>
      <span class="badge" data-count="jobSel">${J.sel.size} selected</span></div>
    <div class="bar"><select class="select" data-ch="jobOp">${JOB_OPS.map(([v, l]) => `<option value="${v}" ${J.op === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input id="jValue" class="input grow" data-in="jValue" placeholder="Prefix, suffix or full job number" value="${esc(J.value)}">
      <button class="btn soft" data-act="jobPreview">Preview</button><button class="btn" data-act="jobApply" ${changed ? '' : 'disabled'}>Apply ${changed || ''} Job Number Changes</button>
      <button class="btn light" data-act="exportJobs">Export Preview</button></div>
    ${tbl(['Select', 'Project name (unchanged)', 'Current job number', 'Proposed job number', 'Status', 'Check'], shown.map((p) => { const x = pm.get(p.id); return [rowBox('jobSel', p.id, J.sel.has(p.id)), esc(p.name), esc(p.jobNumber), x ? `<b>${esc(x.proposed)}</b>` : '', esc(p.status), x ? `<span class="${x.valid ? 'ok' : 'bad'}">${esc(x.msg)}</span>` : '']; }), 'Load projects to begin.')}
    ${moreBtn('jLimit', shown.length, projects.length)}</div>`;
};
function jobPreview() {
  const J = S.jobs;
  J.preview = S.projects.filter((p) => J.sel.has(p.id)).map((p) => {
    const proposed = proposeJob(p.jobNumber, J.op, J.value), valid = proposed.length <= 100;
    return { id: p.id, name: p.name, jobNumber: p.jobNumber, proposed, valid, msg: !valid ? 'Over 100 characters' : proposed === p.jobNumber ? 'No change' : 'Ready - name unchanged' };
  });
  renderView();
}
async function jobApply() {
  const J = S.jobs, items = J.preview.filter((p) => p.valid && p.proposed !== p.jobNumber);
  if (!items.length || !confirm(`Update the job number on ${items.length} project(s)?`)) return;
  const all = [];
  for (let i = 0; i < items.length; i += 25) {
    const d = await api('project-job-numbers', { body: { hubId: S.hub, projects: items.slice(i, i + 25).map((p) => ({ id: p.id, name: p.name, jobNumber: p.jobNumber, proposedJobNumber: p.proposed })) } });
    all.push(...d.results); setQueue(`Updating job numbers: ${Math.min(i + 25, items.length)} of ${items.length}`, 100 * Math.min(i + 25, items.length) / items.length);
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
    <p class="muted">One Excel workbook listing every Hub user, every project they belong to, their company on each project and their role names. Sheets: Hub Users, User Project Memberships, Users by Company, Roles Summary, Projects, Companies (if loaded), Users Without Projects, Exceptions.</p>
    <div class="bar"><button class="btn" data-act="buildRegister">Build Register Workbook</button></div></div>
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
    try {
      const d = await api('project-users-batch', { body: { projects: S.projects.slice(i, i + 15) } });
      memberships.push(...d.items); errors.push(...d.errors);
    } catch (e) { S.projects.slice(i, i + 15).forEach((p) => errors.push({ projectName: p.name, error: e.message })); }
    setQueue(`Building register: ${Math.min(i + 15, total)} of ${total} projects`, 100 * Math.min(i + 15, total) / total);
  }
  const hubByEmail = new Map(S.user.users.map((u) => [norm(u.email), u]));
  const rows = memberships.map((m) => {
    const hu = hubByEmail.get(norm(m.email)) || {};
    return { 'User': m.name, 'Email': m.email, 'Hub company': hu.company || '', 'Hub status': hu.status || '', 'Project': m.projectName, 'Project status': m.projectStatus, 'Company on project': m.company, 'Role names': roleNames(m.roles), 'Role IDs': m.roles.map((r) => r.id).filter(Boolean).join(', '), 'Products': (m.products || []).join(', '), 'Member status': m.status, 'Project ID': m.projectId, 'User ID': m.userId };
  });
  rows.sort((a, b) => String(a['Hub company']).localeCompare(String(b['Hub company'])) || String(a.User).localeCompare(String(b.User)) || String(a.Project).localeCompare(String(b.Project)));
  const byCompany = new Map(), byRole = new Map(), usersWithProjects = new Set(), perProject = new Map();
  memberships.forEach((m) => {
    usersWithProjects.add(norm(m.email));
    perProject.set(m.projectId, (perProject.get(m.projectId) || 0) + 1);
    const ck = m.company || '(No company)', c = byCompany.get(ck) || { users: new Set(), projects: new Set(), count: 0 };
    c.users.add(norm(m.email)); c.projects.add(m.projectId); c.count++; byCompany.set(ck, c);
    (m.roles.length ? m.roles : [{ name: '(No role)' }]).forEach((r) => { const k = r.name, x = byRole.get(k) || { users: new Set(), count: 0 }; x.users.add(norm(m.email)); x.count++; byRole.set(k, x); });
  });
  const wb = XLSX.utils.book_new();
  addSheet(wb, 'Hub Users', S.user.users.map((u) => ({ Name: u.name, Email: u.email, Company: u.company, Status: u.status, 'Hub role': u.role, 'Last sign in': u.lastSignIn, 'User ID': u.id })));
  addSheet(wb, 'User Project Memberships', rows);
  addSheet(wb, 'Users by Company', [...byCompany].map(([k, v]) => ({ Company: k, 'Distinct users': v.users.size, 'Projects': v.projects.size, 'Memberships': v.count })).sort((a, b) => b.Memberships - a.Memberships));
  addSheet(wb, 'Roles Summary', [...byRole].map(([k, v]) => ({ Role: k, 'Distinct users': v.users.size, Memberships: v.count })).sort((a, b) => b.Memberships - a.Memberships));
  addSheet(wb, 'Projects', S.projects.map((p) => ({ Project: p.name, 'Job number': p.jobNumber, Status: p.status, Classification: p.classification, Members: perProject.get(p.id) || 0, 'Project ID': p.id })));
  if (S.companiesLoaded) addSheet(wb, 'Companies', S.companies.map((c) => ({ Company: c.name, Trade: c.trade, 'ERP ID': c.erpId, 'Tax ID': c.taxId, Status: c.status, Members: c.members, Projects: c.projects, 'Company ID': c.id })));
  addSheet(wb, 'Users Without Projects', S.user.users.filter((u) => !usersWithProjects.has(norm(u.email))).map((u) => ({ Name: u.name, Email: u.email, Company: u.company, Status: u.status })));
  addSheet(wb, 'Exceptions', errors.map((e) => ({ Project: e.projectName, Problem: e.error })));
  XLSX.writeFile(wb, `Hub_User_Project_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
  flash(`Register created: ${rows.length.toLocaleString()} memberships${errors.length ? `, ${errors.length} project(s) skipped (see Exceptions sheet)` : ''}.`);
}

/* ---------------------------------------------------------------- events */
const ACT = {
  nav: (el) => { S.tab = el.dataset.tab; showError(''); render(); },
  clearError: () => showError(''),
  auth: async () => { if (S.connected) { await api('auth-logout', { body: {} }); location.reload(); } else { location.href = (await api('auth-login')).url; } },
  refreshHubs: async () => { await loadHubs(); render(); },
  closeModal,
  more: (el) => { const k = el.dataset.k; const map = { cLimit: [S, 'cLimit'], mLimit: [S.access, 'mLimit'], uLimit: [S.user, 'limit'], bLimit: [S.bulk, 'limit'], jLimit: [S.jobs, 'limit'] }[k]; map[0][map[1]] += PAGE_STEP; renderView(); },
  selectAll: (el) => {
    const set = el.dataset.set, ids = {
      cSel: () => filteredCompanies().map((c) => c.id), pSel: () => filteredProjects(S.access.pSearch, S.access.pStatus).map((p) => p.id),
      mSel: () => filteredMembers().map((m) => m.key), uProjSel: () => S.user.projects.filter((p) => hasText([p.projectName, p.status, roleNames(p.roles)], S.user.pSearch.trim().toLowerCase())).map((p) => p.projectId),
      bulkSel: () => filteredHubUsers(S.bulk.search, S.bulk.company).map((u) => u.id), jobSel: () => filteredJobs().map((p) => p.id)
    }[set]();
    ids.forEach((id) => SETS()[set].add(id)); S.bulk.preview = false; renderView();
  },
  clearSel: (el) => { SETS()[el.dataset.set].clear(); S.bulk.preview = false; renderView(); },
  quick: (el) => { const f = S.cf; Object.keys(f).forEach((k) => { if (typeof f[k] === 'boolean') f[k] = false; }); f.search = ''; f.status = 'all'; f[el.dataset.q] = true; S.cLimit = PAGE_STEP; S.tab = 'companies'; render(); },
  resetCompanyFilters: () => { const f = S.cf; Object.keys(f).forEach((k) => { if (typeof f[k] === 'boolean') f[k] = false; }); f.search = ''; f.status = 'all'; renderView(); },
  loadCompanies, loadHubUsers,
  loadProjectsBtn: async () => { await loadProjects(true); flash(`Loaded ${S.projects.length.toLocaleString()} projects.`); renderView(); },
  exportCompanies: () => exportRows('Companies_Filtered.xlsx', filteredCompanies().map((c) => ({ Company: c.name, Trade: c.trade, 'ERP ID': c.erpId, 'Tax ID': c.taxId, Status: c.status, Members: c.members, Projects: c.projects, 'Company ID': c.id })), 'Companies'),
  addField: (el) => addField(el.dataset.kind, el.dataset.id), saveField: (el) => saveField(el.dataset.kind, el.dataset.id),
  autoRename, deepPurge, bulkErpTax, applyErp,
  replaceOne: (el) => replaceOne(el.dataset.id), replaceSelected,
  erpTemplate: () => exportRows('ERP_Tax_Update_Template.xlsx', ERP_TEMPLATE, 'Template'),
  audit: (el) => runAudit(el.dataset.id),
  auditSelectAll: () => { const st = S.audit; st.members.filter((m) => hasText([m.projectName, m.projectStatus, m.name, m.email, m.status, roleNames(m.roles)], (st.search || '').toLowerCase())).forEach((m) => st.sel.add(m.key)); paintAudit(); },
  auditClear: () => { S.audit.sel.clear(); paintAudit(); }, auditRemove,
  auditExport: () => exportRows(`${S.audit.company.name.slice(0, 20)}_members.xlsx`, S.audit.members.map((m) => ({ Project: m.projectName, 'Project status': m.projectStatus, Member: m.name, Email: m.email, Status: m.status, Roles: roleNames(m.roles) })), 'Members'),
  importTemplate, runImport,
  exportImportPreview: () => exportRows('Import_Validation.xlsx', S.imp.rows.map((r) => ({ Row: r.row, Status: r.status, ...r.data })), 'Validation'),
  loadMembers, changeRole, removeMembers,
  exportMembers: () => exportRows('Project_Users.xlsx', S.access.members.map((m) => ({ Project: m.projectName, User: m.name, Email: m.email, Company: m.company, Roles: roleNames(m.roles), Status: m.status })), 'Users'),
  selectUser: (el) => selectUser(el.dataset.id), removeUserSelected: () => removeUserProjects(false), removeUserAll: () => removeUserProjects(true), removeHubUser,
  exportUserProjects: () => exportRows('User_Projects.xlsx', S.user.projects.map((p) => ({ User: S.user.selected.email, Project: p.projectName, Status: p.status, Roles: roleNames(p.roles) })), 'Projects'),
  bulkPreview: () => { S.bulk.preview = true; renderView(); }, bulkApply,
  jobPreview, jobApply,
  exportJobs: () => exportRows('Job_Number_Preview.xlsx', S.jobs.preview.map((p) => ({ Project: p.name, 'Current job number': p.jobNumber, 'Proposed job number': p.proposed, Check: p.msg })), 'Preview'),
  buildRegister,
  exportReports: () => exportRows('Action_Log.xlsx', S.reports, 'Log'),
  clearReports: () => { S.reports = []; renderView(); }
};

const rerender = debounce(renderView, 160);
const debouncedAudit = debounce(() => { if (S.audit) paintAudit(); }, 200);
const IN = {
  cSearch: (el) => { S.cf.search = el.value; S.cLimit = PAGE_STEP; rerender(); },
  pSearch: (el) => { S.access.pSearch = el.value; rerender(); },
  mSearch: (el) => { S.access.mSearch = el.value; S.access.mLimit = PAGE_STEP; rerender(); },
  uSearch: (el) => { S.user.search = el.value; S.user.limit = PAGE_STEP; rerender(); },
  uPSearch: (el) => { S.user.pSearch = el.value; rerender(); },
  bSearch: (el) => { S.bulk.search = el.value; S.bulk.limit = PAGE_STEP; S.bulk.preview = false; rerender(); },
  jSearch: (el) => { S.jobs.search = el.value; S.jobs.limit = PAGE_STEP; rerender(); },
  jValue: (el) => { S.jobs.value = el.value; },
  replace: (el) => { S.replace[el.dataset.id] = el.value; },
  bulkReplace: (el) => { S.replace.__bulk = el.value; },
  auditSearch: (el) => { S.audit.search = el.value; debouncedAudit(); }
};

const CH = {
  hub: (el) => { S.hub = el.value; S.companies = []; S.companiesLoaded = false; S.projects = []; S.projectsLoaded = false; S.user.users = []; S.user.loaded = false; S.access.members = []; renderView(); },
  row: (el) => { const set = SETS()[el.dataset.set]; if (el.checked) set.add(el.dataset.id); else set.delete(el.dataset.id); if (el.dataset.set === 'bulkSel') S.bulk.preview = false; paintCounts(); },
  cf: (el) => { S.cf[el.dataset.k] = el.checked; S.cLimit = PAGE_STEP; renderView(); },
  cStatus: (el) => { S.cf.status = el.value; S.cLimit = PAGE_STEP; renderView(); },
  logo: (el) => uploadLogo(el.dataset.id, el.files[0]),
  erpFile: (el) => erpFile(el.files[0]), importFile: (el) => importFile(el.files[0]),
  auditRow: (el) => { if (el.checked) S.audit.sel.add(el.dataset.key); else S.audit.sel.delete(el.dataset.key); paintAudit(); },
  optHub: (el) => { S.replace.__hub = el.checked; }, optPurge: (el) => { S.replace.__purge = el.checked; },
  pStatus: (el) => { S.access.pStatus = el.value; renderView(); }, mCompany: (el) => { S.access.mCompany = el.value; renderView(); }, mRole: (el) => { S.access.role = el.value; },
  uCompany: (el) => { S.user.company = el.value; renderView(); },
  bCompany: (el) => { S.bulk.company = el.value; S.bulk.preview = false; renderView(); }, bTarget: (el) => { S.bulk.target = el.value; S.bulk.preview = false; renderView(); },
  jobOp: (el) => { S.jobs.op = el.value; }, jobChip: (el) => { S.jobs.noJob = el.checked; renderView(); }
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act]) return;
  try { await ACT[el.dataset.act](el, e); } catch (err) { setQueue(null); showError(err.message); }
});
document.addEventListener('input', (e) => { const el = e.target.closest('[data-in]'); if (el && IN[el.dataset.in]) IN[el.dataset.in](el); });
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
    S.connected = st.authenticated;
    if (S.connected) await loadHubs();
  } catch (e) { showError(e.message); }
  render();
}
start();
