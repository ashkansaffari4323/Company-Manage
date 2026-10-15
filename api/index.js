const {
  axios, APS, SCOPES, account, requireEnv, getSession, setSession, clearSession,
  tokenRequest, appToken, userToken, request, get, page, allPages, pool, errorText, fail
} = require('../lib/core');

const H = {};
const DEFAULT_TRADE = process.env.DEFAULT_TRADE || 'Corporate & Professional Services';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/* ---------------------------------------------------------------- auth */
H['auth-login'] = async (req, res) => {
  requireEnv();
  const url = new URL(`${APS}/authentication/v2/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.APS_CLIENT_ID,
    redirect_uri: process.env.APS_CALLBACK_URL,
    scope: SCOPES
  }).toString();
  res.json({ url: url.toString() });
};

H['auth-callback'] = async (req, res) => {
  const d = await tokenRequest({
    grant_type: 'authorization_code',
    code: req.query.code,
    redirect_uri: process.env.APS_CALLBACK_URL
  });
  setSession(res, {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + d.expires_in * 1000
  });
  res.json({ ok: true });
};

H['auth-status'] = async (req, res) => res.json({ authenticated: !!getSession(req) });

H['auth-logout'] = async (req, res) => {
  clearSession(res);
  res.json({ ok: true });
};

H['hubs'] = async (req, res) => {
  const t = await userToken(req, res);
  const r = await get(`${APS}/project/v1/hubs`, t);
  res.json({ hubs: (r.data.data || []).map((h) => ({ id: h.id, name: (h.attributes && h.attributes.name) || h.id })) });
};

/* ----------------------------------------------------------- companies */
H['companies-page'] = async (req, res) => {
  const t = await userToken(req, res);
  const limit = Math.min(Number(req.query.limit) || 200, 200);
  const offset = Number(req.query.offset) || 0;
  const p = await page(
    `${APS}/construction/admin/v1/accounts/${account(req.query.hubId)}/companies`,
    t, limit, offset, { 'filter[status]': req.query.status || 'all', sort: 'name' }
  );
  const total = p.total != null ? p.total : offset + p.items.length;
  res.json({
    total,
    nextOffset: offset + p.items.length,
    items: p.items.map((c) => ({
      id: c.id,
      name: c.name || '',
      trade: c.trade || '',
      erpId: c.erpId || '',
      taxId: c.taxId || '',
      status: c.status || '',
      members: Number(c.userSize || 0),
      projects: Number(c.projectSize || 0),
      imageUrl: c.imageUrl || ''
    }))
  });
};

const COMPANY_FIELDS = ['name', 'trade', 'erp_id', 'tax_id', 'address_line_1', 'address_line_2', 'city',
  'state_or_province', 'postal_code', 'country', 'phone', 'website_url', 'description'];

H['company-update'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const body = {};
  for (const k of COMPANY_FIELDS) if (req.body[k] !== undefined) body[k] = String(req.body[k]).trim();
  const r = await request('patch', `${APS}/hq/v1/accounts/${aid}/companies/${req.body.companyId}`, t,
    { data: body, headers: JSON_HEADERS });
  res.json(r.data);
};

H['companies-bulk-update'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const results = await pool(req.body.items || [], 5, async (item) => {
    const body = {};
    for (const k of COMPANY_FIELDS) if (item[k] !== undefined && item[k] !== '') body[k] = String(item[k]).trim();
    try {
      await request('patch', `${APS}/hq/v1/accounts/${aid}/companies/${item.id}`, t, { data: body, headers: JSON_HEADERS });
      return { id: item.id, name: item.name, success: true };
    } catch (e) {
      return { id: item.id, name: item.name, success: false, error: errorText(e) };
    }
  });
  res.json({ results });
};

H['company-image'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const form = new FormData();
  form.append('chunk', new Blob([Buffer.from(req.body.base64, 'base64')], { type: req.body.mimeType || 'image/png' }), req.body.fileName || 'logo.png');
  const r = await fetch(`${APS}/hq/v1/accounts/${aid}/companies/${req.body.companyId}/image`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${t}` }, body: form
  });
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
      await request('patch', `${APS}/hq/v1/accounts/${aid}/companies/${c.id}`, t, {
        data: { name: `removed ${new Date().toISOString().slice(0, 10)} ${c.id}`, status: 'deleted' },
        headers: JSON_HEADERS
      });
      return { id: c.id, name: c.name, success: true };
    } catch (e) {
      return { id: c.id, name: c.name, success: false, error: errorText(e) };
    }
  });
  res.json({ results });
};

H['companies-import'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const items = (req.body.companies || []).slice(0, 50).map((c) => {
    const out = {};
    for (const k of COMPANY_FIELDS) {
      const v = c[k] == null ? '' : String(c[k]).trim();
      if (v) out[k] = v;
    }
    if (!out.trade) out.trade = DEFAULT_TRADE;
    return out;
  }).filter((c) => c.name);
  const r = await request('post', `${APS}/hq/v1/accounts/${aid}/companies/import`, t, { data: items, headers: JSON_HEADERS });
  res.json(r.data);
};

/* ------------------------------------------------------------ projects */
H['projects-page'] = async (req, res) => {
  const t = await userToken(req, res);
  const limit = 200;
  const offset = Number(req.query.offset) || 0;
  const p = await page(`${APS}/construction/admin/v1/accounts/${account(req.query.hubId)}/projects`, t, limit, offset);
  const total = p.total != null ? p.total : offset + p.items.length;
  res.json({
    total,
    nextOffset: offset + p.items.length,
    items: p.items.map((x) => ({
      id: x.id,
      name: x.name || '',
      jobNumber: x.jobNumber || x.job_number || '',
      status: x.status || '',
      classification: x.classification || x.projectClassification || '',
      type: x.type || ''
    }))
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
      return users
        .filter((u) => !wanted || wanted.has(u.companyId || (u.company && u.company.id) || ''))
        .map((u) => ({
          key: `${pr.id}::${u.id}`,
          projectId: pr.id,
          projectName: pr.name,
          projectStatus: pr.status || '',
          userId: u.id,
          autodeskId: u.autodeskId || '',
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email || '',
          companyId: u.companyId || (u.company && u.company.id) || '',
          company: u.companyName || (u.company && u.company.name) || '',
          roles: normRoles(u.roles),
          products: (u.products || []).map((p) => `${p.key || p.name || p}${p.access ? ':' + p.access : ''}`),
          status: u.status || ''
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
  const results = await pool(req.body.items || [], 5, async (m) => {
    const base = { key: m.key, projectId: m.projectId, projectName: m.projectName, userId: m.userId, email: m.email, name: m.name };
    try {
      const url = `${APS}/construction/admin/v1/projects/${m.projectId}/users/${m.userId}`;
      if (op === 'remove') await request('delete', url, t);
      else await request('patch', url, t, { data: { roleIds: m.roleIds || [] }, headers: JSON_HEADERS });
      return { ...base, success: true };
    } catch (e) {
      return { ...base, success: false, error: errorText(e) };
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
    items: p.items.map((u) => ({
      id: u.id,
      autodeskId: u.autodesk_id || u.autodeskId || '',
      name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      email: u.email || '',
      company: u.company_name || u.companyName || '',
      companyId: u.company_id || u.companyId || '',
      status: u.status || '',
      role: u.role || '',
      lastSignIn: u.last_sign_in || ''
    }))
  });
};

H['user-projects-direct'] = async (req, res) => {
  const t = await userToken(req, res);
  const items = await allPages(
    `${APS}/construction/admin/v1/accounts/${account(req.query.hubId)}/users/${req.query.userId}/projects`, t, 200);
  res.json({
    projects: items.map((p) => ({
      projectId: p.id || p.projectId,
      projectName: p.name || p.projectName || p.id,
      status: p.status || '',
      classification: p.classification || '',
      roles: normRoles(p.roles),
      projectUserId: req.query.userId
    }))
  });
};

H['remove-user-projects'] = async (req, res) => {
  const t = await userToken(req, res);
  const results = await pool(req.body.projects || [], 5, async (p) => {
    try {
      await request('delete', `${APS}/construction/admin/v1/projects/${p.projectId}/users/${req.body.userId}`, t);
      return { projectId: p.projectId, projectName: p.projectName, success: true };
    } catch (e) {
      return { projectId: p.projectId, projectName: p.projectName, success: false, error: errorText(e) };
    }
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
    if (s === 404 || s === 405) {
      return res.status(s).json({ message: 'Autodesk did not accept account-level user deletion through the API. Remove this user in Hub Admin > Members.' });
    }
    throw e;
  }
};

H['bulk-user-company'] = async (req, res) => {
  const t = await appToken('account:write');
  const aid = account(req.body.hubId);
  const results = await pool(req.body.users || [], 5, async (u) => {
    try {
      await request('patch', `${APS}/hq/v1/accounts/${aid}/users/${u.id}`, t, { data: { company_id: req.body.companyId }, headers: JSON_HEADERS });
      return { id: u.id, name: u.name, email: u.email, oldCompany: u.company || '', newCompany: req.body.companyName || '', success: true };
    } catch (e) {
      return { id: u.id, name: u.name, email: u.email, oldCompany: u.company || '', newCompany: req.body.companyName || '', success: false, error: errorText(e) };
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
