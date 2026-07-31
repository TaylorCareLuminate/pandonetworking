// Temp generator: builds Clarissa's per-call evidence sheet + per-period summary.
// Matches system disposition records against RingCentral call logs.
// Usage: node crm/tmp_build_evidence.js
const fs = require('fs');
const path = require('path');

const DESK = path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop');

// --- Inputs (edit SYS_FILE to the freshest export through 6/3-6/4 when available) ---
const SYS_FILE = path.join(DESK, 'complete_records_clarissa_b3213_gmail_com (1).csv');
const RC_FILES = [
  path.join(DESK, 'CallLog_20260529-151710.csv'), // Jan 2 - May 27
  path.join(DESK, 'CallLog_20260604-171403.csv'), // Jun 1 - Jun 3
];
const OUT_DIR = process.env.EVID_OUT_DIR || DESK;
const OUT_DETAIL = path.join(OUT_DIR, 'clarissa_call_evidence.csv');
const OUT_SUMMARY = path.join(OUT_DIR, 'clarissa_call_evidence_summary.csv');

const SHORT_DECLINE_SEC = 10;   // declined calls this short = likely disconnected/bad number
const MATCH_WINDOW_MIN = 240;   // +/- minutes to match a system record to an RC call

// Meetings confirmed HELD by management even though the system status was still blank.
// Keyed by 10-digit phone. Forces the Achievement Pool bonus to "earned/payable".
const CONFIRMED_HELD_PHONES = new Set(['7202618978']); // Jen Bock / AllHealth Network (5/18)

// --- tiny CSV parser (handles quoted fields w/ commas) ---
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readObjects(file) {
  const rows = parseCSV(fs.readFileSync(file, 'utf8')).filter(r => r.length && r.some(c => c !== ''));
  const header = rows.shift().map(h => h.trim());
  return rows.map(r => { const o = {}; header.forEach((h, i) => o[h] = (r[i] !== undefined ? r[i] : '')); return o; });
}

// --- helpers ---
function norm10(raw) {
  let s = String(raw || '').split(/[xX]/)[0];
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length > 10) d = d.slice(-10);
  return d;
}
function usable(raw) { return norm10(raw).length === 10; }

function durToSec(d) {
  if (!d) return null;
  const p = String(d).trim().split(':').map(Number);
  if (p.some(isNaN)) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0];
}
function secToDisp(s) {
  if (s == null) return '\u2014';
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

// Mountain offset: MST (-7) before DST, MDT (-6) from 2026-03-08 09:00Z to 2026-11-01 08:00Z
function mtOffsetHours(utcMs) {
  const start = Date.UTC(2026, 2, 8, 9, 0, 0);
  const end = Date.UTC(2026, 10, 1, 8, 0, 0);
  return (utcMs >= start && utcMs < end) ? -6 : -7;
}
// Convert system UTC ISO -> Mountain wall-clock parts {y,mo,d,h,mi, ms(synthetic)}
function toMountain(iso) {
  const u = new Date(iso).getTime();
  const off = mtOffsetHours(u);
  const shifted = new Date(u + off * 3600 * 1000);
  return {
    y: shifted.getUTCFullYear(), mo: shifted.getUTCMonth(), d: shifted.getUTCDate(),
    h: shifted.getUTCHours(), mi: shifted.getUTCMinutes(),
    wall: Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), shifted.getUTCHours(), shifted.getUTCMinutes())
  };
}
function fmtMountain(p) {
  let h = p.h % 12; if (h === 0) h = 12;
  const ap = p.h < 12 ? 'AM' : 'PM';
  return `${String(p.mo + 1).padStart(2, '0')}/${String(p.d).padStart(2, '0')}/${p.y} ${String(h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')} ${ap}`;
}

// RC wall-clock parse: Date "Wed 06/03/2026", Time "12:01 PM"
function rcWall(dateStr, timeStr) {
  const m = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const mo = +m[1], d = +m[2], y = +m[3];
  const t = String(timeStr).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!t) return null;
  let h = +t[1] % 12; if (/PM/i.test(t[3])) h += 12;
  return Date.UTC(y, mo - 1, d, h, +t[2]);
}

// Pay period: clean 14-day buckets anchored at 2026-02-01 (Mountain)
function payPeriod(p) {
  const anchor = Date.UTC(2026, 1, 1);
  const day = Date.UTC(p.y, p.mo, p.d);
  const k = Math.floor((day - anchor) / (14 * 86400000));
  const startMs = anchor + k * 14 * 86400000;
  const endMs = startMs + 13 * 86400000;
  const s = new Date(startMs), e = new Date(endMs);
  return `${s.getUTCMonth() + 1}/${s.getUTCDate()} - ${e.getUTCMonth() + 1}/${e.getUTCDate()}`;
}

// --- load RC outgoing calls indexed by number ---
const rcByNum = new Map();
for (const f of RC_FILES) {
  if (!fs.existsSync(f)) { console.warn('RC file missing:', f); continue; }
  for (const r of readObjects(f)) {
    if (!/out/i.test(r.Direction || '')) continue;
    const num = norm10(r.To);
    if (num.length !== 10) continue;
    const wall = rcWall(r.Date, r.Time);
    if (wall == null) continue;
    if (!rcByNum.has(num)) rcByNum.set(num, []);
    rcByNum.get(num).push({ wall, sec: durToSec(r.Duration), result: r['Action Result'] || '', used: false });
  }
}
for (const arr of rcByNum.values()) arr.sort((a, b) => a.wall - b.wall);

function matchRC(num, wall) {
  const arr = rcByNum.get(num);
  if (!arr) return null;
  let best = null, bestDiff = Infinity;
  for (const c of arr) {
    if (c.used) continue;
    const diff = Math.abs(c.wall - wall);
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }
  if (best && bestDiff <= MATCH_WINDOW_MIN * 60000) { best.used = true; return best; }
  return null;
}

// --- process system records ---
const sys = readObjects(SYS_FILE).filter(r => r.Date);
sys.sort((a, b) => new Date(a.Date) - new Date(b.Date));

const detail = [];
const periods = new Map(); // label -> aggregates
function bucket(label) {
  if (!periods.has(label)) periods.set(label, {
    calls: 0, recorded: 0, payable: 0, pending: 0, noshow: 0,
    noPhone$: 0, noPhoneN: 0, noCall$: 0, noCallN: 0, shortDec$: 0, shortDecN: 0,
  });
  return periods.get(label);
}

for (const r of sys) {
  const mt = toMountain(r.Date);
  const label = payPeriod(mt);
  const b = bucket(label);
  b.calls++;

  const recorded = Number(r['Total Payment'] || 0) || 0;
  const basePay = Number(r['Base Pay'] || 0) || 0;
  const outcome = r.Outcome || '';
  const phoneRaw = r.Phone || '';
  const hasPhone = usable(phoneRaw);
  b.recorded += recorded;

  let durDisp = '\u2014', rcResult = '', payStatus, amtPayable = 0, note = '';

  const isMeeting = outcome === 'spoke-scheduled-meeting';
  const mstatus = (r['Meeting Status'] || '').trim().toLowerCase();

  if (isMeeting) {
    // base payable; pool contingent on the meeting actually happening
    const pool = Math.max(0, recorded - basePay);
    const rc = hasPhone ? matchRC(norm10(phoneRaw), mt.wall) : null;
    if (rc) { durDisp = secToDisp(rc.sec); rcResult = rc.result; }
    const confirmedHeld = hasPhone && CONFIRMED_HELD_PHONES.has(norm10(phoneRaw));
    if (mstatus === 'included' || confirmedHeld) {           // held
      payStatus = 'Payable'; amtPayable = recorded;
      note = confirmedHeld && mstatus !== 'included'
        ? 'Meeting confirmed held by management \u2014 base + Achievement Pool now earned (to be paid in your next cycle).'
        : 'Meeting held \u2014 base + Achievement Pool earned.';
    } else if (mstatus === 'excluded') {    // no-show
      payStatus = 'No-show'; amtPayable = basePay; b.noshow += pool;
      note = 'Meeting was a no-show \u2014 base paid; Achievement Pool returned to pool (not earned).';
    } else {                                // pending
      payStatus = 'Pending'; amtPayable = basePay; b.pending += pool;
      note = 'Meeting scheduled but not yet held \u2014 base paid; Achievement Pool pays out once the meeting takes place.';
    }
    b.payable += amtPayable;
  } else if (recorded === 0) {
    // correctly $0 outcome (bad number, skip, etc.)
    const rc = hasPhone ? matchRC(norm10(phoneRaw), mt.wall) : null;
    if (rc) { durDisp = secToDisp(rc.sec); rcResult = rc.result; }
    payStatus = 'Payable'; amtPayable = 0;
    note = 'No pay for this outcome (correctly logged).';
  } else if (!hasPhone) {
    // paid outcome on a contact with NO usable phone number -> cannot bill
    payStatus = 'CANNOT PAY'; amtPayable = 0;
    rcResult = 'No phone number on file';
    b.noPhone$ += recorded; b.noPhoneN++;
    note = `Logged as "${outcome}" on a contact with no phone number on file \u2014 no call could be placed; correct disposition is "Bad Number" ($0). Not billable.`;
  } else {
    // paid outcome, has phone -> verify against RingCentral
    const rc = matchRC(norm10(phoneRaw), mt.wall);
    if (!rc) {
      payStatus = 'CANNOT PAY'; amtPayable = 0;
      rcResult = 'No call found in RingCentral';
      b.noCall$ += recorded; b.noCallN++;
      note = `Logged as "${outcome}" but no outgoing call to this number exists in RingCentral \u2014 no call was placed; we cannot bill the client.`;
    } else {
      durDisp = secToDisp(rc.sec); rcResult = rc.result;
      if (outcome === 'spoke-declined' && rc.sec != null && rc.sec <= SHORT_DECLINE_SEC) {
        payStatus = 'CANNOT PAY'; amtPayable = 0;
        b.shortDec$ += recorded; b.shortDecN++;
        note = `Logged as "Spoke - Declined" but the call was only ${rc.sec}s \u2014 too short for a real conversation (typically a disconnected/bad number). Should be "Bad Number".`;
      } else {
        payStatus = 'Payable'; amtPayable = recorded; b.payable += recorded;
        note = 'Verified call \u2014 payable.';
      }
    }
  }

  detail.push([
    label, fmtMountain(mt), r.Contact || '', r.Company || '', phoneRaw,
    durDisp, rcResult, outcome, recorded.toFixed(2), payStatus, amtPayable.toFixed(2), note
  ]);
}

// --- write detail ---
function csvCell(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const detailHeader = ['Pay Period', 'Call Time (Mountain)', 'Contact', 'Company', 'Phone Number',
  'Call Duration', 'RingCentral Result', 'Outcome', 'Call Value (recorded)', 'Pay Status', 'Amount Payable', 'Reason / Note'];
fs.writeFileSync(OUT_DETAIL, [detailHeader, ...detail].map(r => r.map(csvCell).join(',')).join('\n'));

// --- write summary (period order by date) ---
const order = [...periods.keys()].sort((a, b) => {
  const pa = a.split(' - ')[0].split('/').map(Number), pb = b.split(' - ')[0].split('/').map(Number);
  return (pa[0] - pb[0]) || (pa[1] - pb[1]);
});
const sumHeader = ['Pay Period', 'Calls Logged', 'Recorded $ (system)', 'Payable Now $',
  'CANNOT PAY $ (no call/no phone)', 'Pending Meeting $', 'No-show Lost $',
  '  No-Phone $ (#)', '  No-Call $ (#)', '  Short-Declined $ (#)'];
const sumRows = [];
const tot = { calls: 0, recorded: 0, payable: 0, pending: 0, noshow: 0, noPhone$: 0, noPhoneN: 0, noCall$: 0, noCallN: 0, shortDec$: 0, shortDecN: 0 };
for (const k of order) {
  const b = periods.get(k);
  const cannot = b.noPhone$ + b.noCall$ + b.shortDec$;
  sumRows.push([k, b.calls, b.recorded.toFixed(2), b.payable.toFixed(2), cannot.toFixed(2),
    b.pending.toFixed(2), b.noshow.toFixed(2),
    `${b.noPhone$.toFixed(2)} (${b.noPhoneN})`, `${b.noCall$.toFixed(2)} (${b.noCallN})`, `${b.shortDec$.toFixed(2)} (${b.shortDecN})`]);
  for (const key of Object.keys(tot)) tot[key] += b[key];
}
const cannotT = tot.noPhone$ + tot.noCall$ + tot.shortDec$;
sumRows.push(['TOTAL', tot.calls, tot.recorded.toFixed(2), tot.payable.toFixed(2), cannotT.toFixed(2),
  tot.pending.toFixed(2), tot.noshow.toFixed(2),
  `${tot.noPhone$.toFixed(2)} (${tot.noPhoneN})`, `${tot.noCall$.toFixed(2)} (${tot.noCallN})`, `${tot.shortDec$.toFixed(2)} (${tot.shortDecN})`]);
fs.writeFileSync(OUT_SUMMARY, [sumHeader, ...sumRows].map(r => r.map(csvCell).join(',')).join('\n'));

// --- console: key reconciliation ---
const fairer = tot.payable + tot.noCall$ + tot.shortDec$;
console.log('Rows:', sys.length);
console.log('Recorded $ (system):', tot.recorded.toFixed(2));
console.log('Payable Now $ (RC-verified):', tot.payable.toFixed(2));
console.log('  No-Phone $:', tot.noPhone$.toFixed(2), `(${tot.noPhoneN})`);
console.log('  No-Call $:', tot.noCall$.toFixed(2), `(${tot.noCallN})`);
console.log('  Short-Declined $:', tot.shortDec$.toFixed(2), `(${tot.shortDecN})`);
console.log('  Pending Meeting $:', tot.pending.toFixed(2));
console.log('  No-show Lost $:', tot.noshow.toFixed(2));
console.log('Verified earned (fairer = payable + no-call + short-decline):', fairer.toFixed(2));
console.log('Wrote:', OUT_DETAIL);
console.log('Wrote:', OUT_SUMMARY);
