const axios = require('axios');
const crypto = require('crypto');

const APS = 'https://developer.api.autodesk.com';
const SCOPES = 'data:read account:read account:write';
const COOKIE = 'acm_session';

const account = (id) => String(id || '').replace(/^b\./, '');

function requireEnv() {
  for (const k of ['APS_CLIENT_ID', 'APS_CLIENT_SECRET', 'APS_CALLBACK_URL', 'SESSION_SECRET']) {
    if (!process.env[k]) {
      const e = new Error('Missing Vercel environment variable: ' + k);
      e.status = 500;
      throw e;
    }
  }
}

const basic = () => Buffer.from(`${process.env.APS_CLIENT_ID}:${process.env.APS_CLIENT_SECRET}`).toString('base64');
const secretKey = () => crypto.createHash('sha256').update(process.env.SESSION_SECRET || '').digest();

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
function decrypt(value) {
  try {
    const buf = Buffer.from(value || '', 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString());
  } catch {
    return null;
  }
}
function getSession(req) {
  const match = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
  return decrypt(match && match[1]);
}
function setSession(res, obj) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encrypt(obj)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

async function tokenRequest(params) {
  requireEnv();
  const r = await axios.post(`${APS}/authentication/v2/token`, new URLSearchParams(params), {
    headers: { Authorization: `Basic ${basic()}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return r.data;
}
async function appToken(scope) {
  return (await tokenRequest({ grant_type: 'client_credentials', scope })).access_token;
}
async function userToken(req, res) {
  const s = getSession(req);
  if (!s || !s.access_token) {
    const e = new Error('Autodesk is not connected. Select Connect Autodesk.');
    e.status = 401;
    throw e;
  }
  if (s.expires_at && Date.now() > s.expires_at - 60000 && s.refresh_token) {
    const d = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh_token, scope: SCOPES });
    const next = { access_token: d.access_token, refresh_token: d.refresh_token || s.refresh_token, expires_at: Date.now() + d.expires_in * 1000 };
    setSession(res, next);
    return next.access_token;
  }
  return s.access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(method, url, token, { params, data, headers } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await axios({ method, url, params, data, headers: { Authorization: `Bearer ${token}`, ...(headers || {}) } });
    } catch (e) {
      const status = e.response && e.response.status;
      if (attempt < 3 && (status === 429 || status >= 500)) {
        const wait = Math.min(Number(e.response.headers && e.response.headers['retry-after']) || 2, 5);
        await sleep(wait * 1000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}
const get = (url, token, params) => request('get', url, token, { params });

async function page(url, token, limit, offset, extra) {
  const r = await get(url, token, { limit, offset, ...(extra || {}) });
  const body = r.data;
  const items = Array.isArray(body) ? body : body.results || body.users || body.projects || body.data || [];
  const total = body && body.pagination && body.pagination.totalResults != null ? body.pagination.totalResults : null;
  return { items, total };
}
async function allPages(url, token, limit, extra) {
  const out = [];
  for (let offset = 0; ; ) {
    const p = await page(url, token, limit, offset, extra);
    out.push(...p.items);
    offset += p.items.length;
    if (!p.items.length || (p.total != null && offset >= p.total) || (p.total == null && p.items.length < limit)) break;
  }
  return out;
}
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

function errorText(e) {
  const d = e.response && e.response.data;
  const status = e.response && e.response.status;
  let msg = '';
  if (d) {
    if (d.developerMessage) msg = d.developerMessage;
    else if (d.message) msg = d.message;
    else if (d.detail) msg = d.detail;
    else if (Array.isArray(d.errors)) msg = d.errors.map((x) => x.detail || x.title || x.message).join('; ');
    else if (typeof d === 'string') msg = d.slice(0, 300);
  }
  msg = msg || e.message || 'Request failed';
  return status ? `HTTP ${status}: ${msg}` : msg;
}
function fail(res, e) {
  res.status(e.status || (e.response && e.response.status) || 500).json({ message: errorText(e) });
}

module.exports = {
  axios, APS, SCOPES, account, requireEnv, basic, getSession, setSession, clearSession,
  tokenRequest, appToken, userToken, request, get, page, allPages, pool, errorText, fail, sleep
};
