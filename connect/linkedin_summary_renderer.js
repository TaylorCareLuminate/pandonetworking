/**
 * LinkedIn summary email renderer (weekly / daily / alert)
 * ------------------------------------------------------------------------------
 * Pure HTML builder — no Firestore, no DOM. Used in two places:
 *
 *   1. RailwayCLemail/services/linkedin_summary_email_service.js  (scheduled sends)
 *   2. pandonetworking/connect/linkedin_summary_renderer.js        (preview + manual sends in
 *      connect/email_summary.html)
 *
 * !! The two files are byte-for-byte copies. Edit one, then copy it over the other. !!
 *
 * Visual language matches connect/outcomes_calculator.html (the Pando proposal system):
 * Playfair Display serif headings, Inter body, navy / cream / gold / sage palette, hairline
 * borders, no gradients, no emoji. Everything is table + inline-style so it renders in email clients
 * (Playfair falls back to Georgia where web fonts are blocked).
 *
 * Inputs
 *   data: {
 *     connectionRequestsSent, messagesSent, postsLiked,
 *     connectionsReceived[], repliesReceived[], interestedInMeeting[], meetingRequests[],
 *     highlightResponses[],                       // alert only
 *     monthly: { connectionsReceived, repliesReceived, meetingRequests },
 *     harvestPool: <harvest_pool_stats doc> | null
 *   }
 *   contact: { name, title, company, message, profilePicture, timestamp: Date,
 *              responseCategory, messages: [{ text, timestamp: Date|null, isFromLead: bool|null }] }
 *   win: { display, periodLabel, startMs, endMs, monthName }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LinkedInSummaryRenderer = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TZ = 'America/Denver';
  const MEANINGFUL_RESPONSE_CATEGORIES = ['Response Engaged', 'Response Willing to Meet', 'Scheduled'];

  // ── Design tokens (from outcomes_calculator.html) ──────────────────────────
  const C = {
    navy: '#12314C', navyDeep: '#0C2236', navySoft: '#1F4462',
    cream: '#F6F4EF', paper: '#FFFFFF',
    ink: '#1B2430', inkSoft: '#4B5563', muted: '#7C8594',
    line: '#E4E0D6', lineStrong: '#CFC9BA',
    gold: '#B9A77E', goldSoft: '#EFE9DA', goldInk: '#7A6A3F',
    sage: '#4E6E4A', sageSoft: '#94AD82', sageTint: '#EEF2EC',
    onNavyMuted: '#B8C4D0', onNavyLine: '#2F4F6B'
  };
  const SANS = "font-family:Inter,Arial,Helvetica,sans-serif;";
  const SERIF = "font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:500;letter-spacing:-0.01em;";

  // ── helpers ────────────────────────────────────────────────────────────────
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const truncateText = (text, max) => {
    if (!text) return '';
    return text.length <= max ? text : text.substring(0, max).trim() + '...';
  };
  const plural = (n, one, many) => (n === 1 ? one : many);

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const contactMs = (c) => {
    if (!c || c.timestamp == null) return 0;
    if (c.timestamp instanceof Date) return c.timestamp.getTime();
    const n = Number(c.timestamp);
    return Number.isFinite(n) ? n : 0;
  };

  const fmtLong = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ });
  const fmtWhen = (d) => (d instanceof Date && !isNaN(d.getTime()))
    ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })
    : '';

  function subjectFor(type, win) {
    if (type === 'weekly') return `Pando Weekly LinkedIn Update - ${win.display}`;
    if (type === 'alert') return `Recent LinkedIn Activity You Might Need to Know About - ${win.display}`;
    return `Pando Daily LinkedIn Update - ${win.display}`;
  }

  // ── building blocks ────────────────────────────────────────────────────────
  const eyebrow = (text, color = C.gold) =>
    `<div style="${SANS}font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${color};line-height:1.4;"><span style="display:inline-block;width:22px;height:1px;background-color:${color};vertical-align:middle;margin-right:8px;"></span>${text}</div>`;

  const PILLS = {
    gold:    { bg: C.goldSoft,  border: C.gold,       color: C.goldInk },
    sage:    { bg: C.sageTint,  border: C.sageSoft,   color: C.sage },
    navy:    { bg: C.navy,      border: C.navy,       color: '#ffffff' },
    neutral: { bg: C.paper,     border: C.lineStrong, color: C.inkSoft }
  };
  const pill = (text, kind = 'neutral') => {
    const p = PILLS[kind] || PILLS.neutral;
    return `<span style="display:inline-block;${SANS}font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:3px;border:1px solid ${p.border};background-color:${p.bg};color:${p.color};white-space:nowrap;">${text}</span>`;
  };

  const avatar = (contact, bg = C.navy, size = 40) => contact.profilePicture
    ? `<img src="${esc(contact.profilePicture)}" alt="" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;border-radius:50%;border:1px solid ${C.line};" />`
    : `<div style="width:${size}px;height:${size}px;border-radius:50%;background-color:${bg};color:#ffffff;${SANS}font-weight:600;font-size:${Math.round(size * 0.34)}px;text-align:center;line-height:${size}px;">${esc(getInitials(contact.name))}</div>`;

  /** Section: eyebrow, serif title, count pill, hairline, body. */
  const section = (eyebrowText, title, count, bodyHTML) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;"><tr><td>`
    + eyebrow(eyebrowText)
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>`
    + `<td valign="middle" style="${SERIF}font-size:21px;line-height:1.25;color:${C.navy};padding:7px 12px 11px 0;">${title}</td>`
    + `<td valign="middle" align="right" style="padding:7px 0 11px 0;">${pill(count, 'navy')}</td>`
    + `</tr></table>`
    + `<div style="height:1px;background-color:${C.line};line-height:1px;font-size:1px;margin-bottom:14px;">&nbsp;</div>`
    + bodyHTML
    + `</td></tr></table>`;

  /** White card with a coloured left rule. */
  const card = (accent, innerHTML, mb = 10) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:${mb}px;"><tr><td bgcolor="${C.paper}" style="background-color:${C.paper};border:1px solid ${C.line};border-left:3px solid ${accent};border-radius:4px;padding:14px 16px;">${innerHTML}</td></tr></table>`;

  const personHeader = (contact, { accent = C.navy, badge = '', subtitle = '', status = '' } = {}) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>`
    + `<td width="52" valign="top" style="padding-right:12px;">${avatar(contact, accent)}</td>`
    + `<td valign="top">`
    + `<div style="${SANS}font-weight:600;font-size:14px;color:${C.ink};line-height:1.3;">${esc(contact.name)}</div>`
    + `<div style="${SANS}font-size:12px;color:${C.muted};line-height:1.45;margin-top:2px;">${subtitle}</div>`
    + (status ? `<div style="${SANS}font-size:11px;font-weight:600;color:${C.sage};line-height:1.4;margin-top:5px;">${status}</div>` : '')
    + `</td>`
    + (badge ? `<td valign="top" align="right" style="padding-left:10px;">${badge}</td>` : '')
    + `</tr></table>`;

  const titleLine = (c) => esc(c.title || '') + (c.company ? `${c.title ? ' <span style="color:' + C.lineStrong + ';">|</span> ' : ''}${esc(c.company)}` : '');

  // One chat bubble. Lead = cream, Pando = navy-tinted and indented, unknown = neutral.
  function bubble(msg, contact, outboundLabel) {
    const text = (msg.text || '').trim();
    if (!text) return '';
    const isLead = typeof msg.isFromLead === 'boolean'
      ? msg.isFromLead
      : (typeof contact.fromLead === 'function' ? contact.fromLead(msg) : null);
    const when = fmtWhen(msg.timestamp);
    const body = esc(text).replace(/\r?\n/g, '<br>');
    const label = (name, color) =>
      `<div style="${SANS}font-size:9px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${color};margin-bottom:4px;">${name}${when ? `<span style="font-weight:400;letter-spacing:0.02em;text-transform:none;color:${C.muted};"> &nbsp;${when}</span>` : ''}</div>`;
    const txt = `<div style="${SANS}font-size:13px;color:${C.ink};line-height:1.6;">${body}</div>`;

    if (isLead === false) {
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;"><tr><td width="8%"></td><td bgcolor="#EDF1F5" style="background-color:#EDF1F5;border:1px solid #D5DEE8;border-radius:4px;padding:10px 13px;">${label(esc(outboundLabel), C.navy)}${txt}</td></tr></table>`;
    }
    if (isLead === true) {
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;"><tr><td bgcolor="${C.cream}" style="background-color:${C.cream};border:1px solid ${C.line};border-radius:4px;padding:10px 13px;">${label(esc((contact.name || 'Contact').split(' ')[0]), C.goldInk)}${txt}</td></tr></table>`;
    }
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;"><tr><td bgcolor="#FBFAF7" style="background-color:#FBFAF7;border:1px solid ${C.line};border-radius:4px;padding:10px 13px;">${txt}</td></tr></table>`;
  }

  /**
   * Conversation card: header + the actual message thread (both sides).
   * opts: { accent, badge (html), maxMessages, outboundLabel }
   */
  function conversationCard(contact, opts = {}) {
    const accent = opts.accent || C.gold;
    const outboundLabel = opts.outboundLabel || 'Pando';
    const badge = opts.badge || pill('Replied', 'gold');
    const msgs = (contact.messages || []).filter(m => (m.text || '').trim());

    if (msgs.length === 0) {
      return card(accent,
        personHeader(contact, { accent, badge, subtitle: titleLine(contact) })
        + `<div style="margin-top:12px;background-color:${C.cream};border:1px solid ${C.line};border-radius:4px;padding:10px 13px;${SANS}font-size:13px;color:${C.inkSoft};font-style:italic;line-height:1.6;">&ldquo;${esc(truncateText(contact.message, 240))}&rdquo;</div>`);
    }

    const shown = opts.maxMessages ? msgs.slice(-opts.maxMessages) : msgs;
    const last = msgs[msgs.length - 1];
    const status = last.isFromLead === false
      ? `Pando has replied${fmtWhen(last.timestamp) ? ' &middot; ' + fmtWhen(last.timestamp) : ''}`
      : '';
    const omitted = msgs.length - shown.length;
    const earlier = omitted > 0
      ? `<div style="${SANS}font-size:11px;color:${C.muted};margin-bottom:8px;">${omitted} earlier ${plural(omitted, 'message', 'messages')} not shown</div>`
      : '';

    return card(accent,
      personHeader(contact, { accent, badge, subtitle: titleLine(contact), status })
      + `<div style="margin-top:14px;">${earlier}${shown.map(m => bubble(m, contact, outboundLabel)).join('')}</div>`);
  }

  function simpleContactCard(contact, { accent, badge, withMessage = false } = {}) {
    return card(accent,
      personHeader(contact, { accent, badge, subtitle: titleLine(contact) })
      + (withMessage && contact.message
        ? `<div style="margin-top:10px;${SANS}font-size:12px;color:${C.inkSoft};font-style:italic;line-height:1.55;">&ldquo;${esc(truncateText(contact.message, 160))}&rdquo;</div>`
        : ''), 8);
  }

  function connectionRows(list, emptyText) {
    if (!list.length) return `<p style="${SANS}font-size:12px;color:${C.muted};font-style:italic;margin:4px 0;">${emptyText}</p>`;
    return list.map(c => simpleContactCard(c, { accent: C.sage, badge: pill('Connected', 'sage') })).join('');
  }

  // KPI tile (outcomes_calculator .kpi): hairline box, thin accent rule on top, serif value.
  const tile = (value, label, accent, width, size = 30) =>
    `<td width="${width}" valign="top" bgcolor="${C.paper}" style="background-color:${C.paper};border:1px solid ${C.line};border-top:2px solid ${accent};border-radius:4px;padding:14px 8px 12px;text-align:center;"><div style="${SERIF}font-size:${size}px;line-height:1;color:${C.navy};">${value}</div><div style="${SANS}font-size:9.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.muted};margin-top:9px;line-height:1.45;">${label}</div></td>`;
  const gap = (w) => `<td width="${w}" style="font-size:0;line-height:0;">&nbsp;</td>`;
  const tileRow = (cells, mb = 22) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:${mb}px;"><tr>${cells}</tr></table>`;

  // ── page chrome ────────────────────────────────────────────────────────────
  const wrapOpen = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.cream}" style="background-color:${C.cream};"><tr><td align="center" style="padding:24px 12px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background-color:${C.paper};border:1px solid ${C.line};border-radius:6px;">`;
  const wrapClose = `</table></td></tr></table>`;
  const goldRule = `<tr><td height="2" bgcolor="${C.gold}" style="background-color:${C.gold};height:2px;font-size:0;line-height:0;border-radius:6px 6px 0 0;">&nbsp;</td></tr>`;

  function hero({ kicker, title, win, extraHTML = '' }) {
    return goldRule
      + `<tr><td bgcolor="${C.navy}" style="background-color:${C.navy};padding:30px 32px 28px;">`
      + eyebrow(kicker)
      + `<h1 style="${SERIF}font-size:30px;line-height:1.18;color:#ffffff;margin:14px 0 10px 0;">${title}</h1>`
      + `<div style="${SANS}font-size:13px;color:${C.onNavyMuted};">${esc(win.display)}</div>`
      + extraHTML
      + `</td></tr>`;
  }

  const footerRow = `<tr><td bgcolor="${C.cream}" style="background-color:${C.cream};border-top:1px solid ${C.line};border-radius:0 0 6px 6px;text-align:center;padding:20px 24px 22px;"><p style="${SANS}font-size:11px;color:${C.inkSoft};margin:0 0 6px 0;">Sent by <b style="color:${C.sage};">PandoConnect</b> &nbsp;&middot;&nbsp; Powered by <b style="color:${C.navy};">Pando</b></p><p style="${SANS}font-size:10px;color:${C.muted};margin:0;"><a href="https://healthluminate.com" style="color:${C.navy};text-decoration:underline;">healthluminate.com</a> &nbsp;|&nbsp; <a href="https://pandonetworking.com" style="color:${C.navy};text-decoration:underline;">pandonetworking.com</a></p></td></tr>`;

  const greeting = (firstName, introHTML) =>
    `<h2 style="${SERIF}font-size:26px;line-height:1.2;color:${C.navy};margin:0 0 10px 0;">Hi ${esc(firstName)},</h2>`
    + `<p style="${SANS}font-size:14px;color:${C.inkSoft};line-height:1.65;margin:0 0 24px 0;">${introHTML}</p>`;

  const strategyBlock = (text) => text
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:26px;"><tr><td bgcolor="${C.cream}" style="background-color:${C.cream};border:1px solid ${C.line};border-left:3px solid ${C.gold};border-radius:4px;padding:16px 18px;">${eyebrow('Outreach strategy')}<p style="${SANS}font-size:13px;color:${C.ink};line-height:1.7;margin:10px 0 0 0;white-space:pre-wrap;">${esc(text)}</p></td></tr></table>`
    : '';

  // ── company monthly summary (companies with 2+ leaders) ────────────────────
  function renderCompanySummary({ companyName, monthLabel, totals, rows }) {
    const th = (label, align = 'center') => `<th style="${SANS}padding:9px 8px;text-align:${align};font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.lineStrong};background-color:${C.paper};">${label}</th>`;
    const td = (v, align = 'center', extra = '') => `<td style="${SANS}padding:9px 8px;text-align:${align};font-size:12px;color:${C.ink};border-bottom:1px solid ${C.line};${extra}">${v}</td>`;
    const body = rows.map(r =>
      `<tr>${td(esc(r.name || 'Unnamed') + (r.hasAccountId ? '' : ` <span style="color:${C.goldInk};font-size:10px;" title="No LinkedIn account ID mapped">(unmapped)</span>`), 'left', 'font-weight:600;')}`
      + td(r.reqSent) + td(r.postsLiked) + td(r.connAccepted) + td(r.repliesRec) + td(r.interested) + td(r.scheduled) + `</tr>`).join('');

    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 22px;"><tr><td bgcolor="${C.cream}" style="background-color:${C.cream};border:1px solid ${C.line};border-left:3px solid ${C.navy};border-radius:4px;padding:18px 20px;">`
      + eyebrow('Company monthly summary')
      + `<div style="${SERIF}font-size:20px;line-height:1.25;color:${C.navy};margin:8px 0 4px;">Outreach results: all leaders at ${esc(companyName)}</div>`
      + `<div style="${SANS}font-size:12px;color:${C.muted};">${esc(monthLabel)}</div></td></tr></table>`
      + tileRow(
        tile(totals.requestsSent, 'Requests<br>sent', C.navy, '48%', 32) + gap('4%') + tile(totals.postsLiked, 'Posts<br>liked', C.gold, '48%', 32), 14)
      + tileRow(
        tile(totals.connections, 'Connections<br>accepted', C.sage, '23.5%', 28) + gap('2%')
        + tile(totals.replies, 'Replies<br>received', C.gold, '23.5%', 28) + gap('2%')
        + tile(totals.interested, 'Interested<br>in meeting', C.sage, '23.5%', 28) + gap('2%')
        + tile(totals.scheduled, 'Meetings<br>scheduled', C.navy, '23.5%', 28), 16)
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${C.line};border-radius:4px;border-collapse:separate;margin-bottom:20px;"><thead><tr>`
      + th('Leader', 'left') + th('Requests') + th('Liked') + th('Connected') + th('Replies') + th('Interested') + th('Meetings')
      + `</tr></thead><tbody>${body}</tbody></table>`;
  }

  // ── main entry ─────────────────────────────────────────────────────────────
  /** @returns {{ subject, html, text, hasContent }} — hasContent is false only for an empty alert. */
  function renderEmail({ type, bdr, data, win, companyHTML = '', strategyText = '', includeConnections = true }) {
    const firstName = ((bdr && bdr.name) || 'there').split(' ')[0];
    const subject = subjectFor(type, win);
    const strategy = strategyBlock((strategyText || '').trim());

    // ══ Alert: daily, only when something meaningful happened ══════════════════
    if (type === 'alert') {
      const responses = data.highlightResponses || [];
      if (responses.length === 0) return { subject, html: '', text: '', hasContent: false };

      const styles = {
        'Response Engaged':         { accent: C.sage,  badge: pill('Engaged', 'sage') },
        'Response Willing to Meet': { accent: C.gold,  badge: pill('Willing to meet', 'gold') },
        'Scheduled':                { accent: C.navy,  badge: pill('Scheduled', 'navy') }
      };
      const rank = { 'Scheduled': 0, 'Response Willing to Meet': 1, 'Response Engaged': 2 };
      const ordered = [...responses].sort((a, b) =>
        (rank[a.responseCategory] ?? 9) - (rank[b.responseCategory] ?? 9) || contactMs(b) - contactMs(a));
      const responsesHTML = ordered.map(c => conversationCard(c, { ...(styles[c.responseCategory] || {}), maxMessages: 12, outboundLabel: 'Pando' })).join('');

      const accepted = (data.connectionsReceived || []).length;
      const showConnections = includeConnections && accepted > 0;

      const intro = `Just keeping you in the loop: ${plural(responses.length, 'a contact has', `${responses.length} contacts have`)} replied to our LinkedIn outreach. The Pando team is handling all replies.`;

      const html = wrapOpen
        + hero({ kicker: 'PandoConnect', title: 'Recent LinkedIn Activity You Might Need to Know About', win })
        + `<tr><td bgcolor="${C.paper}" style="background-color:${C.paper};padding:30px 32px 12px;">`
        + greeting(firstName, intro)
        + strategy
        + section('Replies', `Recent replies - don't worry, we are following up`, responses.length, responsesHTML)
        + (showConnections ? section('Network', `Recent ${plural(accepted, 'connection', 'connections')}`, accepted, connectionRows(data.connectionsReceived, '')) : '')
        + `</td></tr>`
        + footerRow + wrapClose;

      const text = `Recent LinkedIn Activity You Might Need to Know About (${win.display})\n\nHi ${firstName},\n\n`
        + `${responses.length} ${plural(responses.length, 'contact has', 'contacts have')} replied to our LinkedIn outreach. The Pando team is handling all replies.\n\n`
        + ordered.map(c => `- ${c.name} (${c.responseCategory}): ${truncateText(c.message, 160)}`).join('\n')
        + `\n\nView this email in an HTML-capable client for the full conversations.`;
      return { subject, html, text, hasContent: true };
    }

    // ══ Weekly / Daily ═══════════════════════════════════════════════════════
    const isWeekly = type === 'weekly';
    const periodLabel = win.periodLabel;
    const accepted = data.connectionsReceived.length;
    const replies = data.repliesReceived.length;
    const sent = data.connectionRequestsSent;
    const acceptRate = sent > 0 ? Math.round((accepted / sent) * 100) : null;

    // Navy KPI strip inside the hero
    const strip = (n, label, first) =>
      `<td align="left" valign="top" style="${first ? '' : `border-left:1px solid ${C.onNavyLine};`}padding:0 0 0 ${first ? 0 : 18}px;"><div style="${SERIF}font-size:30px;line-height:1;color:#ffffff;">${n}</div><div style="${SANS}font-size:11px;color:${C.onNavyMuted};margin-top:8px;line-height:1.4;">${label}</div></td>`;
    const heroStrip = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;border-top:1px solid ${C.onNavyLine};"><tr><td style="padding-top:20px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>`
      + strip(sent, 'Requests sent', true) + strip(accepted, 'Accepted', false) + strip(replies, 'Replies', false)
      + (acceptRate !== null ? strip(`${acceptRate}%`, 'Accept rate', false) : '')
      + `</tr></table></td></tr></table>`;

    // Replies (full threads)
    const repliesHTML = replies > 0
      ? data.repliesReceived.map(c => conversationCard(c, { accent: C.gold, badge: pill('Replied', 'gold'), maxMessages: 12, outboundLabel: 'Pando' })).join('')
      : `<p style="${SANS}font-size:12px;color:${C.muted};font-style:italic;margin:4px 0;">No replies ${periodLabel}</p>`;
    const interestedHTML = data.interestedInMeeting.map(c => simpleContactCard(c, { accent: C.gold, badge: pill('Interested', 'gold'), withMessage: true })).join('');
    const meetingsHTML = data.meetingRequests.map(c => simpleContactCard(c, { accent: C.navy, badge: pill('Booked', 'navy'), withMessage: true })).join('');

    // Harvest pool
    const poolChart = data.harvestPool && data.harvestPool.poolGrowthChart;
    const poolNow = poolChart ? (poolChart.inPoolNow || 0) : null;
    let poolWeekGrowth = 0;
    if (data.harvestPool) {
      const daily = (poolChart && poolChart.daily) || data.harvestPool.poolGrowthDaily;
      if (daily && daily.length) {
        const key = new Date(Date.now() - 7 * 24 * 3600000).toISOString().slice(0, 10);
        for (const row of daily) if (row.date >= key && !row.isFuture) poolWeekGrowth += (row.newThatDay || 0);
      }
    }
    const isNewPool = poolNow === null || poolNow < 5;
    const poolTitle = isNewPool ? 'Your Harvest Pool is growing' : `Harvest Pool: ${poolNow} contacts`;
    const poolNote = poolWeekGrowth > 0
      ? `<span style="color:${C.sage};font-weight:600;">+${poolWeekGrowth}</span> new contacts entered your pool this week.`
      : (poolNow !== null && poolNow > 0)
        ? 'No new contacts entered the pool this week. Keep building connections.'
        : 'Connections accepted today will enter your pool in 30 days. Keep reaching out.';
    const poolBig = poolNow !== null && poolNow > 0
      ? `<td width="96" valign="middle" align="center" style="padding-left:14px;"><div style="background-color:${C.paper};border:1px solid ${C.sageSoft};border-radius:4px;padding:12px 6px;"><div style="${SERIF}font-size:30px;line-height:1;color:${C.sage};">${poolNow}</div><div style="${SANS}font-size:9px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.sage};margin-top:6px;">In pool</div></div></td>`
      : '';
    const harvestHTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:22px;"><tr><td bgcolor="${C.sageTint}" style="background-color:${C.sageTint};border:1px solid ${C.sageSoft};border-left:3px solid ${C.sage};border-radius:4px;padding:18px 20px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td valign="middle">`
      + eyebrow('Harvest Pool', C.sage)
      + `<div style="${SERIF}font-size:19px;line-height:1.25;color:${C.navy};margin:8px 0 8px;">${poolTitle}</div>`
      + `<p style="${SANS}font-size:12px;color:${C.inkSoft};line-height:1.6;margin:0;">Your Pando Harvest Pool is the group of your target LinkedIn connections that have aged 30 days since connection. These leaders are at a high likelihood for engagement in the future.</p>`
      + `<p style="${SANS}font-size:12px;color:${C.inkSoft};line-height:1.6;margin:8px 0 0;">${poolNote}</p>`
      + `</td>${poolBig}</tr></table></td></tr></table>`;

    // Month to date
    const monthHTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:22px;"><tr><td bgcolor="${C.paper}" style="background-color:${C.paper};border:1px solid ${C.line};border-radius:4px;padding:18px 20px;">`
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;"><tr><td style="${SERIF}font-size:19px;color:${C.navy};">${esc(win.monthName)} so far</td><td align="right" style="${SANS}font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${C.muted};">Month to date</td></tr></table>`
      + tileRow(
        tile(data.monthly.connectionsReceived, 'New<br>connections', C.sage, '32%', 28) + gap('2%')
        + tile(data.monthly.repliesReceived, 'Contact<br>replies', C.gold, '32%', 28) + gap('2%')
        + tile(data.monthly.meetingRequests, 'Meetings<br>booked', C.navy, '32%', 28), 0)
      + `</td></tr></table>`;

    const outreachRow = data.messagesSent > 0
      ? tile(sent, 'Requests<br>sent', C.navy, '32%') + gap('2%') + tile(data.messagesSent, 'Messages to<br>connections', C.navySoft, '32%') + gap('2%') + tile(data.postsLiked, 'Posts<br>liked', C.gold, '32%')
      : tile(sent, 'Requests<br>sent', C.navy, '48%') + gap('4%') + tile(data.postsLiked, 'Posts<br>liked', C.gold, '48%');
    const resultsRow =
      tile(accepted, 'Connections<br>accepted', C.sage, '23.5%', 28) + gap('2%')
      + tile(replies, 'Replies<br>received', C.gold, '23.5%', 28) + gap('2%')
      + tile(data.interestedInMeeting.length, 'Interested<br>in meeting', C.sage, '23.5%', 28) + gap('2%')
      + tile(data.meetingRequests.length, 'Meetings<br>scheduled', C.navy, '23.5%', 28);

    const intro = isWeekly
      ? `Here is a summary of the work the Pando team has done for you between <b>${fmtLong(win.startMs)}</b> and <b>${fmtLong(win.endMs)}</b>.`
      : `Here is a summary of the work the Pando team has done for you on <b>${fmtLong(win.endMs)}</b>.`;

    const closing = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 24px;"><tr><td height="2" bgcolor="${C.gold}" style="background-color:${C.gold};height:2px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr><tr><td bgcolor="${C.navy}" style="background-color:${C.navy};border-radius:0 0 4px 4px;padding:20px 24px;"><div style="${SERIF}font-size:19px;color:#ffffff;margin:0 0 6px;">Thank you, ${esc(firstName)}.</div><div style="${SANS}font-size:12px;color:${C.onNavyMuted};line-height:1.6;">The Pando team continues to run your LinkedIn outreach and to follow up on every reply.</div></td></tr></table>`;

    const html = wrapOpen
      + hero({ kicker: isWeekly ? 'PandoConnect &middot; Weekly update' : 'PandoConnect &middot; Daily update', title: isWeekly ? 'Weekly LinkedIn Update' : 'Daily LinkedIn Update', win, extraHTML: heroStrip })
      + `<tr><td bgcolor="${C.paper}" style="background-color:${C.paper};padding:30px 32px 12px;">`
      + greeting(firstName, intro)
      + strategy
      + `<div style="margin-bottom:10px;">${eyebrow('What we did')}</div>`
      + tileRow(outreachRow, 24)
      + `<div style="margin-bottom:10px;">${eyebrow('What came back')}</div>`
      + tileRow(resultsRow, 30)
      + (accepted > 0 ? section('Network', `${plural(accepted, 'A new person', 'New people')} accepted your request`, accepted, connectionRows(data.connectionsReceived, '')) : '')
      + (replies > 0 ? section('Replies', `${plural(replies, 'A conversation', 'Conversations')} started`, replies, repliesHTML) : '')
      + (data.interestedInMeeting.length > 0 ? section('Meetings', 'Interested in meeting with you', data.interestedInMeeting.length, interestedHTML) : '')
      + (data.meetingRequests.length > 0 ? section('Meetings', `${plural(data.meetingRequests.length, 'Meeting', 'Meetings')} on the calendar`, data.meetingRequests.length, meetingsHTML) : '')
      + harvestHTML
      + monthHTML
      + closing
      + companyHTML
      + `</td></tr>`
      + footerRow + wrapClose;

    const text = `${isWeekly ? 'Weekly' : 'Daily'} LinkedIn Update (${win.display})\n\nHi ${firstName},\n\n`
      + `Requests sent: ${sent}\nConnections accepted: ${accepted}\nReplies: ${replies}\n`
      + `Interested in meeting: ${data.interestedInMeeting.length}\nMeetings scheduled: ${data.meetingRequests.length}\n\n`
      + `View this email in an HTML-capable client for the full summary.`;
    return { subject, html, text, hasContent: true };
  }

  return { renderEmail, renderCompanySummary, subjectFor, MEANINGFUL_RESPONSE_CATEGORIES, tokens: C };
}));
