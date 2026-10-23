/* ABN Lookup (Australian Business Register) web services client.
   Official JSON service: https://abr.business.gov.au/json/  (requires a free GUID)
   ABR publishes only the STATE and POSTCODE of a business address, never the street address. */
const { axios, pool, sleep } = require('./core');

const ABR = 'https://abr.business.gov.au/json';

const STATES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', NT: 'Northern Territory', ACT: 'Australian Capital Territory'
};

const abnDigits = (v) => String(v || '').replace(/\D/g, '');

function isValidAbn(v) {
  const d = abnDigits(v);
  if (d.length !== 11) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += (Number(d[i]) - (i === 0 ? 1 : 0)) * w[i];
  return sum % 89 === 0;
}

const SUFFIX = /\b(pty|ltd|limited|proprietary|co|company|inc|incorporated|the|trust|trustee|for|as|atf)\b/g;
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bp\s*\/\s*l\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokenSimilarity(a, b) {
  const A = new Set(normName(a).split(' ').filter(Boolean));
  const B = new Set(normName(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}

function parseJsonp(text) {
  const s = String(text || '');
  const start = s.indexOf('(');
  const end = s.lastIndexOf(')');
  return JSON.parse(start >= 0 && end > start ? s.slice(start + 1, end) : s);
}

async function abrGet(path, params, guid) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await axios.get(`${ABR}/${path}`, {
        params: { ...params, guid, callback: 'cb' },
        responseType: 'text',
        transformResponse: (x) => x,
        timeout: 15000
      });
      const data = parseJsonp(r.data);
      if (data && data.Message && /guid/i.test(data.Message)) {
        const e = new Error('ABN Lookup rejected the GUID: ' + data.Message);
        e.status = 400;
        throw e;
      }
      return data;
    } catch (e) {
      if (e.status === 400) throw e;
      if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

async function abnDetails(abn, guid) {
  const d = await abrGet('AbnDetails.aspx', { abn: abnDigits(abn) }, guid);
  if (!d || !d.Abn) return null;
  return {
    abn: d.Abn, status: d.AbnStatus || '', statusFrom: d.AbnStatusEffectiveFrom || '',
    entityName: d.EntityName || '', entityType: d.EntityTypeName || '',
    businessNames: Array.isArray(d.BusinessName) ? d.BusinessName : [], gst: d.Gst || '',
    stateCode: d.AddressState || '', state: STATES[d.AddressState] || d.AddressState || '',
    postcode: d.AddressPostcode || '', addressDate: d.AddressDate || ''
  };
}

async function nameSearch(name, guid) {
  const d = await abrGet('MatchingNames.aspx', { name, maxResults: 10 }, guid);
  return (d && Array.isArray(d.Names) ? d.Names : []).map((n) => ({
    abn: n.Abn, name: n.Name, nameType: n.NameType, score: Number(n.Score || 0),
    status: n.AbnStatus, current: n.IsCurrent, state: n.State, postcode: n.Postcode
  }));
}

async function matchCompany(c, guid) {
  const out = {
    id: c.id, name: c.name, taxId: c.taxId || '', formaState: c.state || '', formaPostcode: c.postcode || '',
    match: 'No match', confidence: 0, abr: null, candidates: 0, note: ''
  };
  const digits = abnDigits(c.taxId);
  if (digits.length === 11) {
    if (!isValidAbn(digits)) {
      out.note = 'Tax ID is 11 digits but fails the ABN checksum';
    } else {
      const d = await abnDetails(digits, guid);
      if (d) {
        out.abr = d;
        const sim = Math.max(tokenSimilarity(c.name, d.entityName), ...d.businessNames.map((b) => tokenSimilarity(c.name, b)), 0);
        out.confidence = Math.round(sim * 100);
        out.match = 'ABN match';
        if (!/active/i.test(d.status)) out.note = `ABN status is ${d.status}`;
        else if (sim < 0.5) out.note = 'ABN found but the registered name is different - check';
        return out;
      }
      out.note = 'Tax ID not found on ABR';
    }
  } else if (digits) {
    out.note = digits.length === 9 ? 'Tax ID looks like an ACN (9 digits), searched by name' : 'Tax ID is not an ABN, searched by name';
  }
  if (!normName(c.name)) return out;
  const names = await nameSearch(c.name, guid);
  out.candidates = names.length;
  if (!names.length) return out;
  const ranked = names
    .map((n) => ({ ...n, sim: tokenSimilarity(c.name, n.name), exact: normName(n.name) === normName(c.name) }))
    .sort((a, b) => (b.exact - a.exact) || (/active/i.test(b.status) - /active/i.test(a.status)) || (b.score - a.score) || (b.sim - a.sim));
  const best = ranked[0];
  const exactCount = ranked.filter((n) => n.exact && /active/i.test(n.status)).length;
  if (best.exact) out.match = exactCount > 1 ? 'Name match - multiple ABNs' : 'Exact name match';
  else if (best.score >= 90 || best.sim >= 0.75) out.match = 'Close name match';
  else {
    out.match = 'No match';
    out.note = [out.note, `Best ABR result: ${best.name} (${best.score}%)`].filter(Boolean).join('. ');
    return out;
  }
  out.confidence = best.exact ? 100 : Math.max(best.score, Math.round(best.sim * 100));
  out.abr = await abnDetails(best.abn, guid);
  if (!out.abr) { out.match = 'No match'; out.note = 'Matched name but ABN details unavailable'; }
  else if (!/active/i.test(out.abr.status)) out.note = `ABN status is ${out.abr.status}`;
  return out;
}

async function matchCompanies(items, guid) {
  return pool(items, 4, async (c) => {
    try {
      return await matchCompany(c, guid);
    } catch (e) {
      if (e.status === 400) throw e;
      return { id: c.id, name: c.name, taxId: c.taxId || '', match: 'Lookup error', confidence: 0, abr: null, note: e.message };
    }
  });
}

module.exports = { STATES, isValidAbn, abnDigits, normName, tokenSimilarity, parseJsonp, matchCompanies, abnDetails };
