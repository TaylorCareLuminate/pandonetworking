/**
 * connect-link.js
 * Shared by client-health.html, pipeline.html and ai-sync.html.
 *
 * Ties CRM accounts (hccrm/leads) to what Connect knows about them:
 *   CRM account  ->  Connect client (customerList)  ->  BDRs (bdr_leaders)  ->  LinkedIn accounts (linkedin_accounts)
 * and computes meeting numbers straight from Connect (the scheduled-meetings API that backs Connect's
 * calendar and Company Reporting), Read.ai and the CRM timeline. No meeting count in here is ever read
 * from a ChatGPT import.
 *
 * Link storage on a lead (hccrm/leads/<id>/connectLink):
 *   { customerId, customerName, method, linkedAt, linkedBy }   -> linked to that Connect client
 *   { none: true, linkedAt, linkedBy }                          -> "not a Connect client" (no meetings expected)
 * Older leads may only have connectClientNames (written by early AI Sync imports); those are still honoured.
 */

export const RAILWAY_URL = 'https://railwayclemail-production.up.railway.app';
export const DAY = 86400000;

export const ONBOARDING_STAGES = ['Contract Signed', 'Building'];
export const LIVE_STAGES = ['Active', 'Paused'];
export const HEALTH_STAGES = [...ONBOARDING_STAGES, ...LIVE_STAGES];
export const MEETING_NOTE_TYPES = ['In-Person Meeting', 'Virtual Meeting'];
export const CONTACT_NOTE_TYPES = ['Phone Call', 'Email', 'Virtual Meeting', 'In-Person Meeting'];
export const GENERIC_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'me.com', 'live.com', 'msn.com', 'protonmail.com', 'comcast.net', 'healthluminate.com', 'careluminate.com']);

export const isOnboarding = stage => ONBOARDING_STAGES.includes(stage);

// ---------------------------------------------------------------- small helpers
export const toArr = v => v == null ? [] : (Array.isArray(v) ? v.filter(Boolean) : Object.values(v).filter(Boolean));
const lower = s => String(s == null ? '' : s).trim().toLowerCase();

export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') { const d = new Date(v < 1e12 ? v * 1000 : v); return isNaN(d) ? null : d; }
  if (typeof v === 'object') {
    const sec = v._seconds ?? v.seconds;
    return sec != null ? new Date(sec * 1000) : null;
  }
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

export function normName(v) {
  return String(v || '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(inc|llc|llp|corp|corporation|co|company|ltd|limited|the|pllc|pc|plc)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function normDomain(v) {
  if (!v) return '';
  let s = String(v).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  return s.split(/[\/?#]/)[0];
}

export const leadName = l => (l && ((l.organization && l.organization.name) || l.organizationName)) || 'Unnamed';
export const leadDomain = l => normDomain((l && l.organization && (l.organization.domain || l.organization.website)) || (l && l.domain) || '');

export function resolveMerged(id, leads) {
  let cur = id, hops = 0;
  while (cur && leads[cur] && leads[cur].mergedInto && hops < 6) { cur = leads[cur].mergedInto; hops++; }
  return cur;
}

export function windowStats(dates, now = new Date()) {
  const past = dates.filter(d => d <= now).sort((a, b) => b - a);
  const future = dates.filter(d => d > now).sort((a, b) => a - b);
  const inRange = (from, to) => past.filter(d => (now - d) >= from * DAY && (now - d) < to * DAY).length;
  return {
    last30Days: inRange(0, 30), previous30Days: inRange(30, 60), last90Days: inRange(0, 90),
    totalInWindow: dates.length,
    lastMeetingAt: past[0] ? past[0].toISOString() : null,
    daysSinceLastMeeting: past[0] ? Math.floor((now - past[0]) / DAY) : null,
    nextMeetingAt: future[0] ? future[0].toISOString() : null,
    upcomingCount: future.length
  };
}

async function fetchJson(url, ms = 45000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------- Connect data
/** Meetings BDRs have booked for paying Connect clients, straight from Connect's scheduled-meetings API. */
export async function fetchConnectMeetings({ days = 120, now = new Date() } = {}) {
  const from = new Date(now.getTime() - days * DAY);
  const res = await fetchJson(`${RAILWAY_URL}/api/scheduled-meetings?from=${encodeURIComponent(from.toISOString())}`);
  return (res.meetings || []).map(m => ({
    id: m.conversationId || '',
    customerId: m.customerId || '',
    clientName: m.clientName || '',
    bdrEmail: lower(m.bdrEmail),
    bdrName: m.bdrName || m.bdrEmail || '',
    prospectCompany: m.companyName || '',
    contactName: m.contactName || '',
    committed: !!m.meetingCommitted,
    date: parseDate(m.meetingDateTime)
  })).filter(m => m.date);
}

export async function fetchReadAiMeetings({ days = 120, now = new Date() } = {}) {
  const from = new Date(now.getTime() - days * DAY);
  const res = await fetchJson(`${RAILWAY_URL}/readai/meetings?limit=200`);
  const all = res.meetings || [];
  return {
    truncated: all.length >= 200,
    meetings: all.map(m => ({ ...m, _d: parseDate(m.start_time) || parseDate(m.receivedAt) })).filter(m => m._d && m._d >= from)
  };
}

/**
 * Reads Connect's own records for the clients, BDRs and LinkedIn accounts via the Firestore wrapper
 * (js/clemail-firestore-wrapper.js). Each collection is read independently so one failure only loses that part.
 */
export async function loadConnectDirectory(fs) {
  const errors = [], failed = [];
  const read = async name => {
    try {
      const snap = await fs.getDocs(fs.collection(fs.db || window.clemailDb, name));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { errors.push(`${name}: ${e.message || e}`); failed.push(name); return []; }
  };
  const [cust, bdrs, accts] = await Promise.all([read('customerList'), read('bdr_leaders'), read('linkedin_accounts')]);
  return makeDirectory({
    errors, failed,
    customers: cust.map(c => ({ id: c.id, name: c.name || c.shortName || c.id, shortName: c.shortName || '', inactive: c.status === 'inactive' || c.active === false })),
    bdrs: bdrs.map(b => ({ id: b.id, name: b.name || b.primaryEmail || b.id, email: lower(b.primaryEmail), linkedInEmail: lower(b.linkedInEmail), customerId: b.customerId || '', status: b.status || '' })),
    accounts: accts.map(a => ({
      id: a.id, bdrEmail: lower(a.bdrEmail), bdrName: a.bdrName || '', customerId: a.customerId || '', bdrLeaderId: a.bdrLeaderId || '',
      heyreachAccountId: a.heyreachAccountId != null ? String(a.heyreachAccountId) : '',
      profileUrl: a.linkedinProfileUrl || '', profileName: a.profileName || a.linkedinProfileName || a.accountName || '', status: a.status || ''
    }))
  });
}

const pushTo = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

export function makeDirectory({ customers = [], bdrs = [], accounts = [], errors = [], failed = [] } = {}) {
  const customerById = new Map(customers.map(c => [c.id, c]));
  const bdrByEmail = new Map();
  bdrs.forEach(b => [b.email, b.linkedInEmail].filter(Boolean).forEach(e => bdrByEmail.set(lower(e), b)));
  const bdrsBy = new Map(), acctsBy = new Map();
  bdrs.forEach(b => { if (b.customerId) pushTo(bdrsBy, b.customerId, b); });
  accounts.forEach(a => {
    let cid = a.customerId;
    if (!cid) { const b = bdrByEmail.get(lower(a.bdrEmail)); cid = b && b.customerId; }
    if (cid) pushTo(acctsBy, cid, a);
  });
  return {
    customers, bdrs, accounts, errors, customerById, bdrByEmail,
    // false when that collection could not be read: an empty list then means "unknown", not "none"
    customersKnown: !failed.includes('customerList'), bdrsKnown: !failed.includes('bdr_leaders'), accountsKnown: !failed.includes('linkedin_accounts'),
    bdrsOf: id => (bdrsBy.get(id) || []).filter(b => b.status !== 'inactive'),
    accountsOf: id => acctsBy.get(id) || []
  };
}

// ---------------------------------------------------------------- the link
/** Where does this CRM account stand with Connect? -> { state: linked | broken | unlinked | not_applicable, ... } */
export function resolveConnectLink(lead, dir) {
  const l = lead && lead.connectLink;
  if (l && l.none) return { state: 'not_applicable', by: l.linkedBy || '', at: l.linkedAt || '' };
  if (l && l.customerId) {
    const c = dir && dir.customerById.get(l.customerId);
    const haveDir = !!(dir && dir.customers.length);
    return {
      state: c || !haveDir ? 'linked' : 'broken', customerId: l.customerId,
      customerName: c ? c.name : (l.customerName || l.customerId), method: l.method || 'manual', by: l.linkedBy || '', at: l.linkedAt || ''
    };
  }
  const names = toArr(lead && lead.connectClientNames);
  if (names.length && dir) {
    for (const n of names) {
      const k = normName(n);
      const hit = dir.customers.filter(c => normName(c.name) === k || (c.shortName && normName(c.shortName) === k));
      if (hit.length === 1) return { state: 'linked', customerId: hit[0].id, customerName: hit[0].name, method: 'legacy-name' };
    }
  }
  return { state: 'unlinked', legacyNames: names };
}

/** Likely Connect clients for a CRM account name (exact name > one contains the other > shared words). */
export function suggestConnectCustomers(name, dir, limit = 3) {
  const k = normName(name);
  if (!k || !dir) return [];
  const toks = new Set(k.split(' ').filter(t => t.length > 2));
  const out = [];
  dir.customers.forEach(c => {
    if (c.inactive) return;
    const cands = [normName(c.name), normName(c.shortName)].filter(Boolean);
    let score = 0;
    if (cands.includes(k)) score = 100;
    else if (cands.some(x => x.length >= 4 && k.length >= 4 && (x.includes(k) || k.includes(x)))) score = 70;
    else {
      cands.forEach(x => {
        const xt = new Set(x.split(' ').filter(t => t.length > 2));
        if (!xt.size || !toks.size) return;
        const inter = [...xt].filter(t => toks.has(t)).length;
        const j = inter / (xt.size + toks.size - inter);
        if (j >= 0.5) score = Math.max(score, Math.round(40 + j * 20));
      });
    }
    if (score) out.push({ customer: c, score });
  });
  return out.sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name)).slice(0, limit);
}

/** The value to store at hccrm/leads/<id>/connectLink. Pass customer = null for "not a Connect client". */
export function buildConnectLink(customer, userEmail, now = new Date(), method = 'manual') {
  const base = { linkedAt: now.toISOString(), linkedBy: userEmail || '' };
  return customer ? { customerId: customer.id, customerName: customer.name, method, ...base } : { none: true, ...base };
}

// ---------------------------------------------------------------- Connect meetings per client
export function indexConnectMeetings(meetings) {
  const byCustomerId = new Map(), byClientName = new Map(), unresolved = [];
  meetings.forEach(m => {
    if (m.customerId) pushTo(byCustomerId, m.customerId, m); else unresolved.push(m);
    if (m.clientName) pushTo(byClientName, normName(m.clientName), m);
  });
  return { byCustomerId, byClientName, unresolved, all: meetings };
}

/** Meetings for one CRM account via its link (by Connect client id; legacy name links fall back to client name). */
export function connectMeetingsFor(link, idx) {
  if (!link || !idx) return [];
  if (link.customerId) return idx.byCustomerId.get(link.customerId) || [];
  const out = [];
  toArr(link.legacyNames).forEach(n => (idx.byClientName.get(normName(n)) || []).forEach(m => out.push(m)));
  return out;
}

export function connectStats(meetings, now = new Date()) {
  const s = windowStats(meetings.map(m => m.date), now);
  const groups = new Map();
  meetings.forEach(m => {
    const k = m.bdrEmail || lower(m.bdrName) || '(unknown)';
    if (!groups.has(k)) groups.set(k, { bdrEmail: m.bdrEmail, bdrName: m.bdrName || m.bdrEmail || 'Unknown BDR', dates: [] });
    groups.get(k).dates.push(m.date);
  });
  s.byBdr = [...groups.values()].map(g => ({ bdrEmail: g.bdrEmail, bdrName: g.bdrName, ...windowStats(g.dates, now) }))
    .sort((a, b) => b.last30Days - a.last30Days || b.upcomingCount - a.upcomingCount || a.bdrName.localeCompare(b.bdrName));
  return s;
}

/**
 * Are meetings being scheduled for this client regularly?  (Connect numbers only.)
 *   not_applicable | unlinked | broken | ramping | none | declining | ok
 */
export function schedulingSignal({ link, stats, stage }) {
  if (!link || link.state === 'unlinked') return { status: 'unlinked' };
  if (link.state === 'not_applicable') return { status: 'not_applicable' };
  if (link.state === 'broken') return { status: 'broken' };
  if (!stats) return { status: 'unlinked' };
  const recent = stats.last30Days + stats.previous30Days;
  if (recent === 0 && stats.upcomingCount === 0) {
    return { status: isOnboarding(stage) && stats.totalInWindow === 0 ? 'ramping' : 'none' };
  }
  if (stats.previous30Days >= 2 && stats.last30Days <= stats.previous30Days * 0.5) return { status: 'declining' };
  return { status: 'ok' };
}

/** Are we meeting with them regularly? (Read.ai + CRM-logged meetings.)  ok | behind | none */
export function cadenceSignal({ daysSinceLastMeeting, upcomingCount, expectedDays }) {
  const exp = Math.max(1, expectedDays || 30);
  if (daysSinceLastMeeting == null) return { status: upcomingCount > 0 ? 'ok' : 'none', needsScheduling: upcomingCount === 0, expectedDays: exp };
  if (daysSinceLastMeeting <= exp) return { status: 'ok', needsScheduling: false, expectedDays: exp };
  const status = daysSinceLastMeeting <= exp * 2 ? 'behind' : 'none';
  return { status: upcomingCount > 0 ? 'ok' : status, needsScheduling: upcomingCount === 0, expectedDays: exp };
}

// ---------------------------------------------------------------- meetings with us (Read.ai + CRM timeline)
export function crmLoggedMeetingDates(lead) {
  return Object.values((lead && lead.notes) || {})
    .filter(n => n && typeof n === 'object' && !n.archived && MEETING_NOTE_TYPES.includes(n.type))
    .map(n => parseDate(n.date || n.createdAt)).filter(Boolean);
}

/** leadId -> Date[] of Read.ai meetings matched by linked account id, else by participant e-mail domain. */
export function indexReadAi(readAiMeetings, leads) {
  const active = {};
  Object.entries(leads).forEach(([id, l]) => { if (l && l.archived !== true && !l.mergedInto && (l.organization || l.organizationName)) active[id] = l; });
  const byDomain = new Map();
  Object.entries(active).forEach(([id, l]) => { const d = leadDomain(l); if (d && !GENERIC_DOMAINS.has(d)) pushTo(byDomain, d, id); });
  const out = new Map();
  readAiMeetings.forEach(m => {
    let cid = null;
    const direct = m.linkedAccountId || m.addedAccountId || m.matchedAccountId;
    if (direct && leads[direct]) { const r = resolveMerged(direct, leads); if (active[r]) cid = r; }
    if (!cid) {
      const doms = (m.participants || []).map(p => normDomain(String(p.email || '').split('@')[1])).filter(d => d && !GENERIC_DOMAINS.has(d));
      for (const d of doms) { const hit = byDomain.get(d); if (hit && hit.length) { cid = hit[0]; break; } }
    }
    if (cid) pushTo(out, cid, m._d);
  });
  return out;
}

// ---------------------------------------------------------------- lead timeline helpers (pipeline + health)
export function liveNotes(lead) {
  return Object.values((lead && lead.notes) || {}).filter(n => n && typeof n === 'object' && !n.archived);
}

export function lastContactDate(lead, now = new Date()) {
  const ds = liveNotes(lead).filter(n => CONTACT_NOTE_TYPES.includes(n.type)).map(n => parseDate(n.date || n.createdAt)).filter(d => d && d <= now);
  return ds.length ? ds.sort((a, b) => b - a)[0] : null;
}

export function openTasks(lead) {
  const tasks = liveNotes(lead).filter(n => n.type === 'Task' && String(n.status || '').toLowerCase() === 'open');
  tasks.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  return tasks;
}

/** Days since the account entered its current stage. approx = true when stageChangedAt was never recorded. */
export function daysInStage(lead, now = new Date()) {
  const exact = parseDate(lead && lead.stageChangedAt);
  const d = exact || parseDate(lead && lead.updatedAt) || parseDate(lead && lead.createdAt);
  return d ? { days: Math.max(0, Math.floor((now - d) / DAY)), since: d, approx: !exact } : { days: null, since: null, approx: true };
}
