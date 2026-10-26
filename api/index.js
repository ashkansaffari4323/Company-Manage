const {
  APS, SCOPES, account, requireEnv, getSession, setSession, clearSession,
  tokenRequest, appToken, userToken, request, get, page, allPages, pool, errorText, fail
} = require('../lib/core');
const abr = require('../lib/abr');

const H = {};
const DEFAULT_TRADE = process.env.DEFAULT_TRADE || 'Corporate & Professional Services';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const projUserUrl = (pid, uid) => `${APS}/construction/admin/v1/projects/${account(pid)}/users/${uid}`;
const companyOf = (u) => (u && (u.companyId || u.company_id || (u.company && u.company.id))) || '';

/* ---------------------------------------------------------------- auth */
H['auth-login'] = async (req, res) => {
  requireEnv();
  const url = new URL(`${APS}/authentication/v2/authorize`);
  url.search = new URLSearchParams({ response_type: 'code', client_id: process.env.APS_CLIENT_ID, redirect_uri: process.env.APS_CALLBACK_URL, scope: SCOPES }).toString();
  res.json({ url: url.toString() });
};
H['auth-callback'] = async (req, res) => {
  const d = await tokenRequest({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: process.env.APS_CALLBACK_URL });
  setSession(res, { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + d.expires_in * 1000 });
  res.json({ ok: true });
};
H['auth-status'] = async (req, res) => res.json({ authenticated: !!getSession(req), abrConfigured: !!process.env.ABR_GUID });
H['auth-logout'] = async (req, res) => { clearSession(res); res.json({ ok: true }); };
H['hubs'] = async (req, res) => {
  const t = await userToken(req, res);
  const r = await get(`${APS}/project/v1/hubs`, t);
  res.json({ hubs: (r.data.data || []).map((h) => ({ id: h.id, name: (h.attributes && h.attributes.name) || h.id, region: String(h.attributes?.extension?.data?.region || 'AUS').toUpperCase().replace('APAC', 'AUS') })) });
};

/* ----------------------------------------------------------- companies */
H['companies-page'] = async (req, res) => {
  const t = await userToken(req, res);
  const limit = Math.min(Number(req.query.limit) || 200, 200);
  const offset = Number(req.query.offset) || 0;
  const p = await page(`${APS}/construction/admin/v1/accounts/${account(req.query.hubId)}/companies`, t, limit, offset,
    { 'filter[status]': req.query.status || 'all', sort: 'name' });
  res.json({
    total: p.total != null ? p.total : offset + p.items.length,
    nextOffset: offset + p.items.length,
    items: p.items.map((c) => ({
      id: c.id, name: c.name || '', trade: c.trade || '', erpId: c.erpId || '', taxId: c.taxId || '',
      status: c.status || '', members: Number(c.userSize || 0), projects: Number(c.projectSize || 0), imageUrl: c.imageUrl || '',
      address1: c.addressLine1 || '', address2: c.addressLine2 || '', city: c.city || '', state: c.stateOrProvince || '', postcode: c.postalCode || '', country: c.country || ''
    }))
  });
};

const COMPANY_FIELDS = ['name', 'trade', 'erp_id', 'tax_id', 'address_line_1', 'address_line_2', 'city',
  'state_or_province', 'postal_code', 'country', 'phone', 'website_url', 'description'];

H['company-update'] = async (req, res) => {
  const t = await appToken('account:write');
  const body = {};
  for (const k of COMPANY_FIELDS) if (req.body[k] !== undefined) body[k] = String(req.body[k]).trim();
  const r = await request('patch', `${APS}/hq/v1/accounts/${account(req.body.hubId)}/companies/${req.body.companyId}`, t, { data: body, headers: JSON_HEADERS });
  res.json(r.data);
};

H['companies-bulk-update'] = async (req, res) => {
  const t = req.body.useUserToken ? await userToken(req, res) : await appToken('account:write');
  const aid = account(req.body.hubId);
  const region = String(req.body.region || 'AUS').toUpperCase().replace('APAC', 'AUS');
  const results = await pool(req.body.items || [], 5, async (item) => {
    const body = {};
    for (const k of COMPANY_FIELDS) if (k !== 'name' && item[k] !== undefined && item[k] !== '') body[k] = String(item[k]).trim();
    if (!Object.keys(body).length) return { id: item.id, name: item.name, success: false, sent: body, error: 'Nothing to update' };
    try {
      await request('patch', `${APS}/hq/v1/accounts/${aid}/companies/${item.id}`, t, { data: body, headers: { ...JSON_HEADERS, Region: region } });
      return { id: item.id, name: item.name, success: true, sent: body };
    } catch (e) {
      return { id: item.id, name: item.name, success: false, sent: body, error: errorText(e) };
    }
  });
  res.json({ results });
};

H['company-image'] = async (req, res) => {
  const t = await appToken('account:write');
  const form = new FormData();
  form.append('chunk', new Blob([Buffer.from(req.body.base64, 'base64')], { type: req.body.mimeType || 'image/png' }), req.body.fileName || 'logo.png');
  const r = await fetch(`${APS}/hq/v1/accounts/${account(req.body.hubId)}/companies/${req.body.companyId}/image`, { method: 'PATCH', headers: { Authorization: `Bearer ${t}` }, body: form });
  if (!r.ok) return res.status(r.status).json({ message: (await r.text()) || 'Image upload failed' });
  res.json({ ok: true });
};

H['companies-bulk-rename'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const prefix = String(req.body.prefix || 'Not integrated company').trim();
  const start = Number(req.body.startNumber) || 1;
  const items = (req.body.companies || []).map((c, i) => ({ ...c, newName: `${prefix} ${start + i}` }));
  const results = await pool(items, 5, async (c) => {
    try {
      await request('patch', `${APS}/hq/v1/accounts/${aid}/companies/${c.id}`, t, { data: { name: c.newName }, headers: JSON_HEADERS });
      return { id: c.id, oldName: c.name, newName: c.newName, success: true };
    } catch (e) {
      return { id: c.id, oldName: c.name, newName: c.newName, success: false, error: errorText(e) };
    }
  });
  res.json({ results });
};

H['companies-purge'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const results = await pool(req.body.companies || [], 5, async (c) => {
    try {
      await request('patch', `${APS}/hq/v1/accounts/${aid}/companies/${c.id}`, t, { data: { name: `removed ${new Date().toISOString().slice(0, 10)} ${c.id}`, status: 'deleted' }, headers: JSON_HEADERS });
      return { id: c.id, name: c.name, success: true };
    } catch (e) {
      return { id: c.id, name: c.name, success: false, error: errorText(e) };
    }
  });
  res.json({ results });
};

H['companies-import'] = async (req, res) => {
  const t = await appToken('account:write');
  const items = (req.body.companies || []).slice(0, 50).map((c) => {
    const out = {};
    for (const k of COMPANY_FIELDS) { const v = c[k] == null ? '' : String(c[k]).trim(); if (v) out[k] = v; }
    if (!out.trade) out.trade = DEFAULT_TRADE;
    return out;
  }).filter((c) => c.name);
  const r = await request('post', `${APS}/hq/v1/accounts/${account(req.body.hubId)}/companies/import`, t, { data: items, headers: JSON_HEADERS });
  res.json(r.data);
};

/* ---------------------------------------------------------- ABN Lookup */
H['abr-match'] = async (req, res) => {
  const guid = String(req.body.guid || process.env.ABR_GUID || '').trim();
  if (!guid) return res.status(400).json({ message: 'Enter your ABN Lookup GUID (free from abr.business.gov.au) or set ABR_GUID in Vercel.' });
  res.json({ results: await abr.matchCompanies((req.body.companies || []).slice(0, 25), guid) });
};

/* ------------------------------------------------------------ projects */
H['projects-page'] = async (req, res) => {
  const t = await userToken(req, res);
  const offset = Number(req.query.offset) || 0;
  const p = await page(`${APS}/construction/admin/v1/accounts/${account(req.query.hubId)}/projects`, t, 200, offset);
  res.json({
    total: p.total != null ? p.total : offset + p.items.length,
    nextOffset: offset + p.items.length,
    items: p.items.map((x) => ({ id: x.id, name: x.name || '', jobNumber: x.jobNumber || x.job_number || '', status: x.status || '', classification: x.classification || '', type: x.type || '', platform: String(x.platform || '').toLowerCase() }))
  });
};

const normRoles = (roles) => (roles || []).map((r) => ({ id: r.id || '', name: r.name || String(r) }));

H['project-users-batch'] = async (req, res) => {
  const t = await userToken(req, res);
  const wanted = req.body.companyIds ? new Set(req.body.companyIds) : null;
  const errors = [];
  const lists = await pool(req.body.projects || [], 10, async (pr) => {
    try {
      const users = await allPages(`${APS}/construction/admin/v1/projects/${pr.id}/users`, t, 200);
      return users.filter((u) => !wanted || wanted.has(companyOf(u))).map((u) => ({
        key: `${pr.id}::${u.id}`, projectId: pr.id, projectName: pr.name, projectStatus: pr.status || '', projectPlatform: pr.platform || '',
        userId: u.id, autodeskId: u.autodeskId || '', name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(), email: u.email || '',
        companyId: companyOf(u), company: u.companyName || (u.company && u.company.name) || '', roles: normRoles(u.roles),
        products: (u.products || []).map((p) => `${p.key || p.name || p}${p.access ? ':' + p.access : ''}`), status: u.status || ''
      }));
    } catch (e) {
      errors.push({ projectId: pr.id, projectName: pr.name, error: errorText(e) });
      return [];
    }
  });
  res.json({ items: lists.flat(), errors });
};

H['members-bulk'] = async (req, res) => {
  const t = await userToken(req, res);
  const op = req.body.operation;
  const targetCompany = String(req.body.companyId || '');
  const results = await pool(req.body.items || [], 5, async (m) => {
    const base = { key: m.key, projectId: m.projectId, projectName: m.projectName, userId: m.userId, email: m.email, name: m.name };
    const url = projUserUrl(m.projectId, m.userId);
    try {
      if (op === 'remove') { await request('delete', url, t); return { ...base, success: true }; }
      if (op === 'company') {
        if (!targetCompany) throw new Error('No target company supplied');
        await request('patch', url, t, { data: { companyId: targetCompany }, headers: JSON_HEADERS });
        let verified = null, actual = '';
        try { actual = companyOf((await get(url, t)).data); verified = actual === targetCompany; } catch { verified = null; }
        if (verified === false) return { ...base, success: false, verified: false, error: `Autodesk accepted the request but the member is still assigned to company ${actual || '(none)'}.` };
        return { ...base, success: true, verified };
      }
      await request('patch', url, t, { data: { roleIds: m.roleIds || [] }, headers: JSON_HEADERS });
      return { ...base, success: true };
    } catch (e) {
      const s = e.response && e.response.status;
      let hint = '';
      if (op === 'company' && /bim/i.test(m.projectPlatform || '')) hint = ' BIM 360 projects do not support changing a member company through the API.';
      else if (s === 403) hint = ' Your account needs Project Admin rights on this project.';
      else if (s === 404) hint = ' The member or project was not found (it may be a BIM 360 project or the member was already removed).';
      return { ...base, success: false, error: errorText(e) + hint };
    }
  });
  res.json({ results });
};

H['project-job-numbers'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const results = await pool(req.body.projects || [], 5, async (p) => {
    try {
      const body = { job_number: String(p.proposedJobNumber == null ? '' : p.proposedJobNumber) };
      await request('patch', `${APS}/hq/v1/accounts/${aid}/projects/${account(p.id)}`, t, { data: body, headers: JSON_HEADERS });
      return { id: p.id, name: p.name, original: p.jobNumber || '', proposed: body.job_number, success: true };
    } catch (e) {
      return { id: p.id, name: p.name, original: p.jobNumber || '', proposed: p.proposedJobNumber, success: false, error: errorText(e) };
    }
  });
  res.json({ results });
};

/* --------------------------------------------------------------- users */
H['hub-users-page'] = async (req, res) => {
  const t = await appToken('account:read');
  const limit = Math.min(Number(req.query.limit) || 100, 100);
  const offset = Number(req.query.offset) || 0;
  const p = await page(`${APS}/hq/v1/accounts/${account(req.query.hubId)}/users`, t, limit, offset);
  res.json({
    hasMore: p.items.length >= limit,
    nextOffset: offset + p.items.length,
    items: p.items.map((u) => ({ id: u.id, autodeskId: u.autodesk_id || u.autodeskId || '', name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim(), email: u.email || '', company: u.company_name || u.companyName || '', companyId: u.company_id || u.companyId || '', status: u.status || '', role: u.role || '', lastSignIn: u.last_sign_in || '' }))
  });
};

H['user-projects-direct'] = async (req, res) => {
  const t = await userToken(req, res);
  const items = await allPages(`${APS}/construction/admin/v1/accounts/${account(req.query.hubId)}/users/${req.query.userId}/projects`, t, 200);
  res.json({ projects: items.map((p) => ({ projectId: p.id || p.projectId, projectName: p.name || p.projectName || p.id, status: p.status || '', classification: p.classification || '', roles: normRoles(p.roles), projectUserId: req.query.userId })) });
};

H['remove-user-projects'] = async (req, res) => {
  const t = await userToken(req, res);
  const results = await pool(req.body.projects || [], 5, async (p) => {
    try { await request('delete', projUserUrl(p.projectId, req.body.userId), t); return { projectId: p.projectId, projectName: p.projectName, success: true }; }
    catch (e) { return { projectId: p.projectId, projectName: p.projectName, success: false, error: errorText(e) }; }
  });
  res.json({ results });
};

H['remove-hub-user'] = async (req, res) => {
  if (req.body.confirmText !== 'REMOVE USER') return res.status(400).json({ message: 'Type REMOVE USER to confirm.' });
  const t = await appToken('account:write');
  try {
    await request('delete', `${APS}/hq/v1/accounts/${account(req.body.hubId)}/users/${req.body.userId}`, t);
    res.json({ success: true });
  } catch (e) {
    const s = e.response && e.response.status;
    if (s === 404 || s === 405) return res.status(s).json({ message: 'Autodesk did not accept account-level user deletion through the API. Remove this user in Hub Admin > Members.' });
    throw e;
  }
};

H['bulk-user-company'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const target = String(req.body.companyId || '');
  if (!target) return res.status(400).json({ message: 'Select a target company.' });
  const results = await pool(req.body.users || [], 5, async (u) => {
    const base = { id: u.id, name: u.name, email: u.email, oldCompany: u.company || '', newCompany: req.body.companyName || '' };
    const url = `${APS}/hq/v1/accounts/${aid}/users/${u.id}`;
    try {
      const r = await request('patch', url, t, { data: { company_id: target }, headers: JSON_HEADERS });
      let actual = companyOf(r.data);
      if (!actual) { try { actual = companyOf((await get(url, t)).data); } catch { actual = ''; } }
      const verified = actual ? actual === target : null;
      if (verified === false) return { ...base, success: false, verified: false, error: `Hub still shows company ${actual}.` };
      return { ...base, success: true, verified };
    } catch (e) {
      return { ...base, success: false, error: errorText(e) };
    }
  });
  res.json({ results });
};

/* ------------------------------------------------------------- router */
module.exports = async (req, res) => {
  try {
    const action = String((req.query && req.query.action) || '');
    const handler = H[action];
    if (!handler) return res.status(404).json({ message: 'Unknown API action: ' + action });
    await handler(req, res);
  } catch (e) {
    fail(res, e);
  }
};
