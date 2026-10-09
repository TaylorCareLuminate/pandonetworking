/**
 * Vendor Billed vs Tracked panel
 *
 * Shared by monthly_cost_overview.html and the Apify / AI / Brave cost tracking pages so every
 * cost report answers the same question the same way: "what did the vendor actually bill us,
 * how much of that did our per-call ledgers capture, and how much is untracked?"
 *
 * The ledgers (apify_run_ledger, ai_usage_ledger, brave_usage_ledger) can only see calls that
 * were recorded. Vendor-billed totals come from /api/vendor-costs (pulled from the vendor's API
 * where one exists, or entered by hand from an invoice). The difference is surfaced as an explicit
 * "Untracked" amount instead of the report quietly under-stating spend.
 *
 * Usage:
 *   VendorCostPanel.mount({ container: 'vendorCostPanel', vendors: ['apify','openrouter','brave'],
 *                           onChange: totals => { ... } });
 *   VendorCostPanel.update({ since: Date, until: Date|null,
 *                            tracked: { apify: { usd, count }, openrouter: {...}, brave: {...} } });
 *
 * Billed totals are per calendar month, so a comparison is only made when the selected range is
 * made of whole calendar months (This month / Last month / This year).
 */
(function () {
  'use strict';

  var API_DEFAULT = 'https://railwayclemail-production.up.railway.app';

  var META = {
    apify:      { label: 'Apify',            icon: 'fa-robot',           unit: 'runs',        canSync: true,
                  hint: 'Pulled from Apify usage. Enter your invoice total to override (e.g. if it includes a plan fee).' },
    openrouter: { label: 'OpenRouter (AI)',  icon: 'fa-brain',           unit: 'generations', canSync: true,
                  hint: 'Derived from OpenRouter credit usage between month boundaries (available from the day snapshots began). Enter the invoice/dashboard total for earlier months.' },
    brave:      { label: 'Brave Search',     icon: 'fa-magnifying-glass', unit: 'searches',   canSync: false,
                  hint: 'Brave has no billing API — enter the figure from your Brave dashboard/invoice.' }
  };

  var state = {
    cfg: null, container: null, since: null, until: null, tracked: {}, months: null,
    records: [], rate: null, loading: false, error: null, syncMsg: '', pollTimer: null, lastTotals: null
  };

  // ── helpers ──────────────────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v) {
    var n = Number(v) || 0;
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthLabel(m) {
    var p = m.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  function rangeMonths(since, until) {
    if (!since || since.getDate() !== 1) return null;
    if (until && until.getDate() !== 1) return null;
    var end = until ? new Date(until.getFullYear(), until.getMonth(), until.getDate() - 1) : new Date();
    var out = [];
    var d = new Date(since.getFullYear(), since.getMonth(), 1);
    while (d <= end && out.length < 120) {
      out.push(monthKey(d));
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return out.length ? out : null;
  }

  async function token() {
    if (state.cfg.getAuthToken) return state.cfg.getAuthToken();
    var u = window.auth && window.auth.currentUser;
    if (!u) throw new Error('Not signed in');
    return u.getIdToken();
  }

  async function api(path, opts) {
    var t = await token();
    var resp = await fetch((state.cfg.apiBase || API_DEFAULT) + path, Object.assign({
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }
    }, opts || {}, { headers: Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }, (opts && opts.headers) || {}) }));
    var body = null;
    try { body = await resp.json(); } catch (e) { /* non-JSON error body */ }
    if (!resp.ok || (body && body.success === false)) {
      var msg = (body && (body.error || body.message)) || ('HTTP ' + resp.status);
      if (resp.status === 403) msg = 'Admin access required (' + msg + ')';
      throw new Error(msg);
    }
    return body;
  }

  // ── styles ───────────────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('vcp-styles')) return;
    var css = [
      '.vcp-table{width:100%;border-collapse:collapse;font-size:.88rem}',
      '.vcp-table th,.vcp-table td{text-align:left;padding:.6rem .75rem;border-bottom:1px solid var(--border,#e2e8f0);vertical-align:middle}',
      '.vcp-table th{background:var(--light-gray,#f8fafc);font-weight:700;white-space:nowrap}',
      '.vcp-table td.num,.vcp-table th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.vcp-bar{height:8px;border-radius:99px;background:#e5e7eb;overflow:hidden;min-width:90px}',
      '.vcp-bar>span{display:block;height:100%;background:var(--success,#10b981)}',
      '.vcp-bar.low>span{background:var(--warning,#f59e0b)}',
      '.vcp-bar.bad>span{background:var(--danger,#ef4444)}',
      '.vcp-pill{display:inline-block;padding:.05rem .5rem;border-radius:99px;font-size:.72rem;font-weight:700}',
      '.vcp-pill.manual{background:#ede9fe;color:#5b21b6}.vcp-pill.api{background:#dbeafe;color:#1e40af}',
      '.vcp-pill.none{background:#fee2e2;color:#991b1b}',
      '.vcp-gap{color:var(--danger,#ef4444);font-weight:700}.vcp-ok{color:var(--success,#10b981);font-weight:700}',
      '.vcp-muted{color:var(--gray,#6b7280)}.vcp-small{font-size:.8rem}',
      '.vcp-actions{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:1rem}',
      '.vcp-btn{padding:.5rem .9rem;border-radius:8px;font-size:.85rem;font-weight:600;cursor:pointer;border:2px solid var(--primary,#0F2D4D);background:#fff;color:var(--primary,#0F2D4D)}',
      '.vcp-btn.primary{background:var(--primary,#0F2D4D);color:#fff}.vcp-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.vcp-link{background:none;border:none;color:var(--primary,#0F2D4D);text-decoration:underline;cursor:pointer;font-size:.8rem;padding:0}',
      '.vcp-msg{margin-top:.75rem;font-size:.85rem;padding:.6rem .8rem;border-radius:8px;background:#eff6ff;color:#1d4ed8}',
      '.vcp-msg.err{background:#fef2f2;color:#991b1b}',
      '.vcp-modal-bg{position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:99999}',
      '.vcp-modal{background:#fff;border-radius:12px;padding:1.5rem;width:min(460px,92vw);box-shadow:0 20px 40px rgba(0,0,0,.25)}',
      '.vcp-modal h3{margin:0 0 .25rem;color:var(--primary,#0F2D4D)}',
      '.vcp-modal label{display:block;font-weight:600;font-size:.82rem;color:var(--gray,#6b7280);margin:.8rem 0 .25rem}',
      '.vcp-modal input,.vcp-modal select{width:100%;padding:.55rem .7rem;border:2px solid var(--border,#e2e8f0);border-radius:8px;font:inherit}',
      '.vcp-modal .row{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1.1rem;flex-wrap:wrap}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'vcp-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── data → totals ────────────────────────────────────────────────────────────────────────
  function compute() {
    var vendors = state.cfg.vendors;
    var months = state.months;
    var totals = { aligned: !!months, months: months || [], vendors: {}, braveImpliedRate: null };
    vendors.forEach(function (v) {
      var t = state.tracked[v] || { usd: 0, count: 0 };
      var row = { vendor: v, tracked: Number(t.usd) || 0, trackedCount: Number(t.count) || 0,
                  billed: null, missing: [], sources: {}, complete: false, gap: null, coverage: null, apiError: null };
      if (months) {
        var billed = 0, have = 0;
        months.forEach(function (m) {
          var r = state.records.filter(function (x) { return x.vendor === v && x.month === m; })[0];
          if (r && r.effectiveUsd != null) { billed += r.effectiveUsd; have++; row.sources[m] = r.effectiveSource; }
          else { row.missing.push(m); if (r && r.apiError) row.apiError = r.apiError; }
        });
        row.billed = have ? billed : null;
        row.complete = have === months.length;
        if (row.complete) {
          row.gap = Math.max(0, row.billed - row.tracked);
          row.over = row.tracked > row.billed ? row.tracked - row.billed : 0;
          row.coverage = row.billed > 0 ? Math.min(1, row.tracked / row.billed) : null;
        }
      }
      totals.vendors[v] = row;
    });
    var b = totals.vendors.brave;
    if (b && b.complete && b.trackedCount > 0 && b.billed > 0) totals.braveImpliedRate = b.billed / b.trackedCount;
    state.lastTotals = totals;
    return totals;
  }

  // ── render ───────────────────────────────────────────────────────────────────────────────
  function render() {
    if (!state.container) return;
    var totals = compute();
    var html = '';

    if (!totals.aligned) {
      html += '<div class="vcp-msg">Vendor invoices are monthly. Choose <strong>This month</strong>, <strong>Last month</strong> or <strong>This year</strong> to compare ledger totals against what each vendor billed.</div>';
      state.container.innerHTML = html;
      fire(totals);
      return;
    }

    html += '<div class="vcp-small vcp-muted" style="margin-bottom:.6rem">Billed period: ' +
      esc(monthLabel(totals.months[0])) + (totals.months.length > 1 ? ' – ' + esc(monthLabel(totals.months[totals.months.length - 1])) : '') + '</div>';

    html += '<div style="overflow-x:auto"><table class="vcp-table"><thead><tr>' +
      '<th>Vendor</th><th class="num">Billed by vendor</th><th class="num">Tracked in ledger</th>' +
      '<th class="num">Untracked</th><th>Coverage</th><th></th></tr></thead><tbody>';

    state.cfg.vendors.forEach(function (v) {
      var m = META[v], r = totals.vendors[v];
      var srcs = Object.keys(r.sources).map(function (k) { return r.sources[k]; });
      var pill = !srcs.length ? '<span class="vcp-pill none">no data</span>'
        : (srcs.every(function (s) { return s === 'manual'; }) ? '<span class="vcp-pill manual">invoice</span>'
          : (srcs.every(function (s) { return s === 'api'; }) ? '<span class="vcp-pill api">vendor API</span>' : '<span class="vcp-pill api">mixed</span>'));

      var billedCell = r.billed == null ? '<span class="vcp-muted">—</span>' : '<strong>' + money(r.billed) + '</strong> ' + pill;
      if (r.billed != null && !r.complete) billedCell += '<div class="vcp-small vcp-muted">missing ' + esc(r.missing.map(monthLabel).join(', ')) + '</div>';
      if (r.billed == null && r.apiError) billedCell += '<div class="vcp-small vcp-muted" title="' + esc(r.apiError) + '">' + esc(r.apiError.slice(0, 70)) + '</div>';

      var untracked, cov;
      if (r.complete) {
        if (r.over > 0.005) untracked = '<span class="vcp-muted" title="Ledger recorded more than the vendor billed">ledger +' + money(r.over) + '</span>';
        else untracked = '<span class="' + (r.gap > 0.5 ? 'vcp-gap' : 'vcp-ok') + '">' + money(r.gap) + '</span>';
        var pct = r.coverage == null ? 0 : Math.round(r.coverage * 100);
        cov = '<div class="vcp-bar ' + (pct < 50 ? 'bad' : pct < 90 ? 'low' : '') + '"><span style="width:' + pct + '%"></span></div>' +
              '<div class="vcp-small vcp-muted">' + pct + '% captured</div>';
      } else {
        untracked = '<span class="vcp-muted">—</span>';
        cov = '<span class="vcp-small vcp-muted">enter missing months</span>';
      }

      html += '<tr><td><i class="fas ' + m.icon + '"></i> <strong>' + esc(m.label) + '</strong>' +
        '<div class="vcp-small vcp-muted">' + esc(r.trackedCount.toLocaleString()) + ' ' + m.unit + ' logged</div></td>' +
        '<td class="num">' + billedCell + '</td>' +
        '<td class="num">' + money(r.tracked) + '</td>' +
        '<td class="num">' + untracked + '</td>' +
        '<td>' + cov + '</td>' +
        '<td><button class="vcp-link" data-vcp-edit="' + v + '">' + (r.billed == null ? 'Enter invoice' : 'Edit invoice') + '</button></td></tr>';
    });

    // overall row
    var sumBilled = 0, sumTracked = 0, sumGap = 0, allComplete = true;
    state.cfg.vendors.forEach(function (v) {
      var r = totals.vendors[v];
      sumTracked += r.tracked;
      if (r.complete) { sumBilled += r.billed; sumGap += r.gap; } else { allComplete = false; if (r.billed != null) sumBilled += r.billed; }
    });
    if (state.cfg.vendors.length > 1) {
      html += '<tr style="background:var(--light-gray,#f8fafc)"><td><strong>All vendors</strong></td>' +
        '<td class="num"><strong>' + money(sumBilled) + '</strong>' + (allComplete ? '' : '<div class="vcp-small vcp-muted">partial</div>') + '</td>' +
        '<td class="num"><strong>' + money(sumTracked) + '</strong></td>' +
        '<td class="num">' + (allComplete ? '<span class="vcp-gap">' + money(sumGap) + '</span>' : '<span class="vcp-muted">—</span>') + '</td><td></td><td></td></tr>';
    }
    html += '</tbody></table></div>';

    if (totals.braveImpliedRate != null && totals.vendors.brave) {
      var assumed = state.rate;
      html += '<div class="vcp-small vcp-muted" style="margin-top:.6rem">Brave: invoice ÷ logged searches = <strong>' +
        '$' + totals.braveImpliedRate.toFixed(4) + '/request</strong>' + (assumed ? ' (ledger assumes $' + Number(assumed).toFixed(4) + ')' : '') +
        '. A big difference means either the per-request rate is wrong (set <code>BRAVE_COST_PER_REQUEST_USD</code>) or searches are happening outside the ledger.</div>';
    }

    html += '<div class="vcp-actions">' +
      '<button class="vcp-btn primary" data-vcp-sync="1"' + (state.loading ? ' disabled' : '') + '><i class="fas fa-cloud-arrow-down"></i> Sync billed totals from vendors</button>' +
      '<span class="vcp-small vcp-muted">Pulls Apify &amp; OpenRouter totals and backfills the Apify run ledger from Apify\'s own account runs. Brave is invoice-only.</span></div>';

    if (state.syncMsg) html += '<div class="vcp-msg' + (state.syncErr ? ' err' : '') + '">' + state.syncMsg + '</div>';
    if (state.error) html += '<div class="vcp-msg err">' + esc(state.error) + '</div>';

    state.container.innerHTML = html;
    wire();
    fire(totals);
  }

  function fire(totals) {
    if (state.cfg && typeof state.cfg.onChange === 'function') {
      try { state.cfg.onChange(totals); } catch (e) { console.warn('[VendorCostPanel] onChange failed:', e); }
    }
  }

  function wire() {
    var c = state.container;
    Array.prototype.forEach.call(c.querySelectorAll('[data-vcp-edit]'), function (b) {
      b.addEventListener('click', function () { openEditor(b.getAttribute('data-vcp-edit')); });
    });
    var sync = c.querySelector('[data-vcp-sync]');
    if (sync) sync.addEventListener('click', runSync);
  }

  // ── actions ──────────────────────────────────────────────────────────────────────────────
  async function runSync() {
    if (!state.months) return;
    state.loading = true; state.syncErr = false; state.syncMsg = 'Syncing billed totals…'; render();
    try {
      var vendors = state.cfg.vendors.filter(function (v) { return META[v].canSync; });
      var res = await api('/api/vendor-costs/sync', { method: 'POST', body: JSON.stringify({ months: state.months.slice(-13), vendors: vendors }) });
      var failed = (res.results || []).filter(function (r) { return r.ok === false; });
      var ok = (res.results || []).filter(function (r) { return r.ok; });
      var msg = 'Synced ' + ok.length + ' vendor-month total(s).';
      if (failed.length) msg += ' ' + failed.length + ' could not be pulled: ' + failed.map(function (f) { return esc(f.vendor + (f.month ? ' ' + f.month : '') + ' — ' + f.error); }).join('; ');
      if (res.reconcile === 'started') { msg += ' Apify run ledger is backfilling in the background — refresh the page in a few minutes to see updated tracked totals.'; pollReconcile(); }
      state.syncMsg = msg; state.syncErr = failed.length > 0 && !ok.length;
      await loadRecords();
    } catch (e) {
      state.syncMsg = esc(e.message); state.syncErr = true;
    } finally {
      state.loading = false; render();
    }
  }

  function pollReconcile() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    var tries = 0;
    state.pollTimer = setInterval(async function () {
      tries++;
      try {
        var s = await api('/api/vendor-costs/sync-status');
        var r = s.lastApifyReconcile;
        if (r && r.status !== 'running') {
          clearInterval(state.pollTimer); state.pollTimer = null;
          state.syncErr = r.status === 'error';
          state.syncMsg = r.status === 'error'
            ? 'Apify backfill failed: ' + esc(r.error || 'unknown error')
            : 'Apify backfill finished: ' + (r.apifyRunsFetched || 0) + ' runs checked, ' + (r.backfilled || 0) + ' costs backfilled, ' + (r.created || 0) + ' previously-unrecorded runs added. Refresh the page to update tracked totals.';
          render();
        } else if (tries > 60) { clearInterval(state.pollTimer); state.pollTimer = null; }
      } catch (e) { /* keep polling */ }
    }, 5000);
  }

  function openEditor(vendor) {
    if (!state.months) return;
    var m = META[vendor];
    var bg = document.createElement('div');
    bg.className = 'vcp-modal-bg';
    var opts = state.months.map(function (mo) {
      var r = state.records.filter(function (x) { return x.vendor === vendor && x.month === mo; })[0];
      var cur = r && r.manualUsd != null ? ' — invoice ' + money(r.manualUsd) : (r && r.apiUsd != null ? ' — API ' + money(r.apiUsd) : '');
      return '<option value="' + mo + '">' + esc(monthLabel(mo)) + esc(cur) + '</option>';
    }).join('');
    bg.innerHTML = '<div class="vcp-modal"><h3>' + esc(m.label) + ' — billed amount</h3>' +
      '<div class="vcp-small vcp-muted">' + esc(m.hint) + '</div>' +
      '<label>Month</label><select id="vcpMonth">' + opts + '</select>' +
      '<label>Amount billed (USD)</label><input id="vcpAmt" type="number" min="0" step="0.01" placeholder="e.g. 1455.00">' +
      '<label>Note (optional)</label><input id="vcpNote" type="text" maxlength="200" placeholder="Invoice #, source…">' +
      '<div id="vcpErr" class="vcp-small" style="color:#991b1b;margin-top:.6rem"></div>' +
      '<div class="row"><button class="vcp-btn" id="vcpClear">Clear invoice</button>' +
      '<button class="vcp-btn" id="vcpCancel">Cancel</button><button class="vcp-btn primary" id="vcpSave">Save</button></div></div>';
    document.body.appendChild(bg);

    var $ = function (id) { return bg.querySelector(id); };
    function prefill() {
      var mo = $('#vcpMonth').value;
      var r = state.records.filter(function (x) { return x.vendor === vendor && x.month === mo; })[0];
      $('#vcpAmt').value = r && r.manualUsd != null ? r.manualUsd : '';
      $('#vcpNote').value = (r && r.manualNote) || '';
    }
    $('#vcpMonth').value = state.months[state.months.length - 1];
    prefill();
    $('#vcpMonth').addEventListener('change', prefill);
    $('#vcpCancel').addEventListener('click', function () { bg.remove(); });
    bg.addEventListener('click', function (e) { if (e.target === bg) bg.remove(); });

    async function save(clear) {
      var amt = $('#vcpAmt').value;
      if (!clear && (amt === '' || isNaN(Number(amt)) || Number(amt) < 0)) { $('#vcpErr').textContent = 'Enter a non-negative amount.'; return; }
      $('#vcpSave').disabled = true; $('#vcpClear').disabled = true;
      try {
        await api('/api/vendor-costs/manual', { method: 'PUT', body: JSON.stringify({
          vendor: vendor, month: $('#vcpMonth').value, amountUsd: clear ? null : Number(amt), note: $('#vcpNote').value
        }) });
        bg.remove();
        await loadRecords();
        render();
      } catch (e) {
        $('#vcpErr').textContent = e.message;
        $('#vcpSave').disabled = false; $('#vcpClear').disabled = false;
      }
    }
    $('#vcpSave').addEventListener('click', function () { save(false); });
    $('#vcpClear').addEventListener('click', function () { save(true); });
  }

  async function loadRecords() {
    if (!state.months) { state.records = []; return; }
    var from = state.months[0], to = state.months[state.months.length - 1];
    var res = await api('/api/vendor-costs?from=' + from + '&to=' + to);
    state.records = res.records || [];
    state.rate = res.braveRatePerRequestUsd || null;
  }

  // ── public api ───────────────────────────────────────────────────────────────────────────
  var seq = 0;
  window.VendorCostPanel = {
    mount: function (cfg) {
      injectStyles();
      state.cfg = cfg;
      state.container = typeof cfg.container === 'string' ? document.getElementById(cfg.container) : cfg.container;
      if (!state.container) console.warn('[VendorCostPanel] container not found');
    },
    update: async function (opts) {
      if (!state.cfg) return;
      var mine = ++seq;
      state.since = opts.since; state.until = opts.until || null; state.tracked = opts.tracked || {};
      state.months = rangeMonths(state.since, state.until);
      state.error = null;
      try { await loadRecords(); } catch (e) { state.error = 'Could not load vendor billed totals: ' + e.message; state.records = []; }
      if (mine !== seq) return; // a newer update superseded this one
      render();
    },
    getTotals: function () { return state.lastTotals; }
  };
})();
