/**
 * HeyReach Campaigns — shared library
 * -----------------------------------
 * Single source of truth for the standard Pando BDR campaign set
 * (Connect / Message / Quick Message): sequence definitions, default
 * schedule, starter contacts, HeyReach account matching, and the
 * list → leads → campaign → start build pipeline.
 *
 * Used by:
 *   - admin/heyreach_campaign_builder.html  (manual builder page)
 *   - admin/email_controls.html             (Easy BDR Enrollment + Audit & Fix)
 *
 * All HeyReach calls go through the Railway proxy with the customer's
 * API key in the x-api-key header.
 *
 * Exposes window.HeyReachCampaigns
 */
(function () {
  'use strict';

  const DEFAULT_FALLBACK_MESSAGE = 'Saw your post. Absolutely agree!';

  // Every day, 12:00–21:00 America/Denver
  const DEFAULT_SCHEDULE = Object.freeze({
    dailyStartTime: '12:00:00',
    dailyEndTime: '21:00:00',
    timeZoneId: 'America/Denver',
    enabledMonday: true,
    enabledTuesday: true,
    enabledWednesday: true,
    enabledThursday: true,
    enabledFriday: true,
    enabledSaturday: true,
    enabledSunday: true
  });

  // Contents of "Basic List Start - connect.csv" — seeded into every new list
  const DEFAULT_STARTER_LEADS = [
    {
      firstName: 'Taylor',
      lastName: 'Davis',
      profileUrl: 'https://www.linkedin.com/in/taylorkentdavis/',
      customUserFields: [{ name: 'content', value: 'This is a test message' }]
    },
    {
      firstName: 'Joe',
      lastName: 'Annoreno',
      profileUrl: 'https://www.linkedin.com/in/joe-annoreno-3383b69/',
      customUserFields: [{ name: 'content', value: 'This is a test message' }]
    }
  ];

  const CAMPAIGN_TYPES = [
    { key: 'connect', suffix: 'Connect' },
    { key: 'message', suffix: 'Message' },
    { key: 'quick_message', suffix: 'Quick Message' }
  ];

  // Wait between liking the lead's post and sending the connection request /
  // message (Connect and Message campaigns only; Quick Message is unaffected).
  const DELAY_CHOICES = {
    '3h': { actionDelay: 3, actionDelayUnit: 'HOUR', label: '3 hours' },
    '2d': { actionDelay: 2, actionDelayUnit: 'DAY', label: '2 days' }
  };
  const DEFAULT_DELAY_CHOICE = '3h';

  // ── Sequences (HeyReach Campaign API PublicSequenceNodeDto) ───────────────
  // Translated from the exported Kevin-Connect / Kevin-Message /
  // Kevin-Quick-Message sequences. HeyReach's validator requires a delay of at
  // least 3 hours on CONNECTION_REQUEST and END nodes, so 0-delay nodes from
  // the exports are bumped to 3 HOUR. Messages send the {content} custom field.
  const END = (delay, unit) => ({ nodeType: 'END', actionDelay: delay, actionDelayUnit: unit });

  const likePayload = () => ({
    reactionType: 'LIKE',
    randomReaction: false,
    reactBefore: 'MONTH3',
    skipDelayIfCannotLike: false
  });

  function buildSequence(typeKey, fallbackMessage, options = {}) {
    const fallback = fallbackMessage || DEFAULT_FALLBACK_MESSAGE;
    const delay = DELAY_CHOICES[options.delayChoice] || DELAY_CHOICES[DEFAULT_DELAY_CHOICE];

    if (typeKey === 'connect') {
      // Like post → (3h or 2d) already connected? yes: end / no: connection
      // request with {content}, withdraw after 21 days → accepted: end (1d) /
      // not accepted: view profile (5d) → end (5d)
      return {
        nodeType: 'LIKE_POST',
        actionDelay: 0, actionDelayUnit: 'HOUR',
        payload: likePayload(),
        unconditionalNode: {
          nodeType: 'CHECK_IS_CONNECTION',
          actionDelay: delay.actionDelay, actionDelayUnit: delay.actionDelayUnit,
          conditionalNode: END(3, 'HOUR'),
          unconditionalNode: {
            nodeType: 'CONNECTION_REQUEST',
            actionDelay: 3, actionDelayUnit: 'HOUR',
            payload: {
              messages: ['{content}'],
              fallbackMessage: fallback,
              toBeWithdrawnAfterDays: 21
            },
            conditionalNode: END(1, 'DAY'),
            unconditionalNode: {
              nodeType: 'VIEW_PROFILE',
              actionDelay: 5, actionDelayUnit: 'DAY',
              unconditionalNode: END(5, 'DAY')
            }
          }
        }
      };
    }

    if (typeKey === 'message') {
      // Like post → (3h or 2d) connected? yes: message {content} → replied:
      // end (1d) / no reply: view profile (1d) → end (1d); not connected: end
      return {
        nodeType: 'LIKE_POST',
        actionDelay: 0, actionDelayUnit: 'HOUR',
        payload: likePayload(),
        unconditionalNode: {
          nodeType: 'CHECK_IS_CONNECTION',
          actionDelay: delay.actionDelay, actionDelayUnit: delay.actionDelayUnit,
          conditionalNode: {
            nodeType: 'MESSAGE',
            actionDelay: 0, actionDelayUnit: 'HOUR',
            payload: { messages: ['{content}'], fallbackMessage: fallback },
            conditionalNode: END(1, 'DAY'),
            unconditionalNode: {
              nodeType: 'VIEW_PROFILE',
              actionDelay: 1, actionDelayUnit: 'DAY',
              unconditionalNode: END(1, 'DAY')
            }
          },
          unconditionalNode: END(3, 'HOUR')
        }
      };
    }

    if (typeKey === 'quick_message') {
      // Connected? yes: message {content} immediately → end; not connected: end
      return {
        nodeType: 'CHECK_IS_CONNECTION',
        actionDelay: 0, actionDelayUnit: 'HOUR',
        conditionalNode: {
          nodeType: 'MESSAGE',
          actionDelay: 0, actionDelayUnit: 'HOUR',
          payload: { messages: ['{content}'], fallbackMessage: fallback },
          conditionalNode: END(1, 'DAY'),
          unconditionalNode: END(1, 'DAY')
        },
        unconditionalNode: END(3, 'HOUR')
      };
    }

    throw new Error(`Unknown campaign type: ${typeKey}`);
  }

  // ── Proxy call helper ──────────────────────────────────────────────────────
  async function call(railwayUrl, apiKey, path, body, method = 'POST') {
    const resp = await fetch(`${railwayUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await resp.json(); } catch (_) { /* non-JSON body */ }
    if (!resp.ok) {
      const detail = data
        ? String(data.errorMessage || data.error || data.message || JSON.stringify(data)).slice(0, 400)
        : resp.statusText;
      throw new Error(`${path} → HTTP ${resp.status}: ${detail}`);
    }
    return data;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── HeyReach LinkedIn sender accounts ─────────────────────────────────────
  async function fetchLinkedInSenders({ railwayUrl, apiKey }) {
    const result = await call(railwayUrl, apiKey, '/proxy/heyreach/accounts/getall', { offset: 0, limit: 100 });
    let accounts = result;
    if (result && Array.isArray(result.items)) accounts = result.items;
    else if (result && Array.isArray(result.data)) accounts = result.data;
    else if (result && Array.isArray(result.accounts)) accounts = result.accounts;
    if (!Array.isArray(accounts)) accounts = [];

    return accounts
      .map((a) => ({
        id: a.id ?? a.accountId ?? a._id,
        firstName: a.firstName || '',
        lastName: a.lastName || '',
        email: a.emailAddress || a.email || '',
        profileUrl: a.profileUrl || a.linkedInProfileUrl || a.publicProfileUrl || '',
        active: a.isActive !== false,
        raw: a
      }))
      .filter((a) => a.id !== undefined && a.id !== null);
  }

  /**
   * Score how well a HeyReach sender account matches a person's full name
   * (and optionally their email). Returns candidates sorted best-first,
   * each as { account, score }. Scores ≥ 70 are considered a confident match.
   */
  // Common first-name variants so "Patti" matches "Patricia", "Mike" matches "Michael", etc.
  const NICKNAME_GROUPS = [
    ['patricia', 'patti', 'pattie', 'patty', 'pat', 'trish', 'tricia', 'patsy'],
    ['michael', 'mike', 'mick', 'mikey'],
    ['christopher', 'chris', 'topher'],
    ['christine', 'christina', 'chris', 'christy', 'tina'],
    ['robert', 'rob', 'bob', 'bobby', 'robbie'],
    ['william', 'will', 'bill', 'billy', 'willy'],
    ['richard', 'rick', 'rich', 'dick', 'richie'],
    ['james', 'jim', 'jimmy', 'jamie'],
    ['john', 'jon', 'johnny', 'jack'],
    ['jonathan', 'jon', 'jonny'],
    ['joseph', 'joe', 'joey'],
    ['thomas', 'tom', 'tommy'],
    ['daniel', 'dan', 'danny'],
    ['matthew', 'matt'],
    ['anthony', 'tony'],
    ['andrew', 'andy', 'drew'],
    ['steven', 'stephen', 'steve'],
    ['charles', 'charlie', 'chuck', 'chas'],
    ['edward', 'ed', 'eddie', 'ted', 'teddy'],
    ['timothy', 'tim', 'timmy'],
    ['kenneth', 'ken', 'kenny'],
    ['donald', 'don', 'donny'],
    ['gregory', 'greg'],
    ['jeffrey', 'jeff', 'geoff', 'geoffrey'],
    ['nicholas', 'nick', 'nicky'],
    ['alexander', 'alex', 'xander', 'sasha'],
    ['alexandra', 'alex', 'alexis', 'sandra'],
    ['benjamin', 'ben', 'benny'],
    ['samuel', 'sam', 'sammy'],
    ['elizabeth', 'liz', 'lizzie', 'beth', 'betty', 'eliza', 'liza', 'libby'],
    ['katherine', 'catherine', 'kathryn', 'kate', 'katie', 'kathy', 'cathy', 'kat', 'kit'],
    ['jennifer', 'jen', 'jenny', 'jenn'],
    ['jessica', 'jess', 'jessie'],
    ['margaret', 'maggie', 'meg', 'peggy', 'marge', 'greta'],
    ['deborah', 'debra', 'deb', 'debbie'],
    ['susan', 'sue', 'suzy', 'susie'],
    ['rebecca', 'becky', 'becca'],
    ['barbara', 'barb', 'barbie'],
    ['victoria', 'vicky', 'vicki', 'tori'],
    ['samantha', 'sam', 'sammy'],
    ['stephanie', 'steph', 'stephie'],
    ['kimberly', 'kim', 'kimmy'],
    ['theresa', 'teresa', 'terri', 'terry', 'tess'],
    ['dorothy', 'dot', 'dottie'],
    ['nancy', 'nan'],
    ['joanne', 'joann', 'jo']
  ];

  const NAME_NOISE = new Set([
    'jr', 'sr', 'ii', 'iii', 'iv', 'md', 'phd', 'rn', 'np', 'cpa', 'mba', 'msn', 'dnp',
    'dr', 'mr', 'mrs', 'ms', 'cpc', 'pmp', 'lpn', 'bsn', 'chc'
  ]);

  function normName(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')                     // punctuation → space
      .replace(/['’]/g, '')
      .replace(/-/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !NAME_NOISE.has(t))
      .join(' ');
  }

  function sameFirstName(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    return NICKNAME_GROUPS.some((g) => g.includes(a) && g.includes(b));
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }

  function linkedInSlug(url) {
    const m = String(url || '').toLowerCase().match(/linkedin\.com\/in\/([^/?#\s]+)/);
    return m ? decodeURIComponent(m[1]).replace(/\/+$/, '') : '';
  }

  /**
   * Score how well each HeyReach sender account matches a person.
   * Returns candidates (score > 0) sorted best-first, each as
   * { account, score, reason }. Scores ≥ 75 are treated as a confident match
   * for auto-selection; anything lower is shown to the user as "possible".
   *
   * Signals: LinkedIn profile URL, email, exact/nickname/initial/prefix/fuzzy
   * name match (accent + credential-insensitive; handles first/last swapped or
   * crammed into one field).
   */
  function findAccountMatches(accounts, fullName, email, linkedInUrl) {
    const name = normName(fullName);
    const parts = name.split(' ').filter(Boolean);
    const first = parts[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const emailNorm = String(email || '').trim().toLowerCase();
    const emailLocal = emailNorm.split('@')[0] || '';
    const slug = linkedInSlug(linkedInUrl);

    const scored = accounts.map((a) => {
      const aFirst = normName(a.firstName).split(' ')[0] || '';
      const aLastParts = normName(a.lastName).split(' ').filter(Boolean);
      const aLast = aLastParts[aLastParts.length - 1] || '';
      const aFull = normName(`${a.firstName} ${a.lastName}`);
      const aTokens = aFull.split(' ').filter(Boolean);
      const aEmail = String(a.email || '').trim().toLowerCase();

      let score = 0;
      let reason = '';
      const bump = (s, r) => { if (s > score) { score = s; reason = r; } };

      // Strongest: same LinkedIn profile
      if (slug && linkedInSlug(a.profileUrl) === slug) bump(99, 'same LinkedIn profile URL');

      // Email signals
      if (emailNorm && aEmail && aEmail === emailNorm) bump(98, 'same email');
      else if (emailLocal && aEmail && aEmail.split('@')[0] === emailLocal) bump(80, 'email username matches');

      // Name signals
      if (name) {
        if (aFull === name) bump(100, 'exact name match');
        else if (first && last && aFirst === first && aLast === last) bump(95, 'first + last name match');
        else if (first && last && sameFirstName(first, aFirst) && aLast === last) bump(90, `nickname match ("${aFirst}" ≈ "${first}")`);
        else if (first && last && parts.length >= 2 && parts.every((p) => aTokens.includes(p))) bump(85, 'all name parts present (different order/fields)');
        else if (first && last && aFirst === first && aLast && (aLast.startsWith(last) || last.startsWith(aLast))) bump(75, 'first name + similar last name');
        else if (first && last && aLast === last && aFirst && aFirst[0] === first[0]) bump(70, 'same last name + first initial');
        else if (first && aFirst === first && !last) bump(60, 'first name match');
        else if (first && aFirst === first) bump(50, 'first name matches only');
        else if (first && last && sameFirstName(first, aFirst)) bump(45, 'similar first name only');
        else if (last && aLast === last) bump(40, 'last name matches only');

        // Fuzzy catch-all (typos, spelling variants) — capped below the auto-select threshold
        if (score < 74 && aFull) {
          const sim = similarity(name, aFull);
          if (sim >= 0.7) bump(Math.min(74, Math.round(40 + sim * 34)), `similar name (${Math.round(sim * 100)}%)`);
        }
      }

      return { account: a, score, reason };
    });

    return scored.filter((s) => s.score > 0).sort((x, y) => y.score - x.score);
  }

  // ── Build pipeline ─────────────────────────────────────────────────────────
  /**
   * Builds the standard campaign set. For each requested type:
   * create empty list → add starter leads (with 'content' custom field) →
   * create campaign (DRAFT) with the standard sequence → optionally start it.
   *
   * @param {object} opts
   *   railwayUrl, apiKey     — proxy target + customer HeyReach key
   *   namePrefix             — e.g. "Chris" → "Chris Connect" etc.
   *   accountIds             — HeyReach LinkedIn sender account IDs (numbers)
   *   leads                  — lead objects (defaults to DEFAULT_STARTER_LEADS)
   *   schedule               — CampaignScheduleApiDto (defaults to DEFAULT_SCHEDULE)
   *   fallbackMessage        — back-up message (defaults to DEFAULT_FALLBACK_MESSAGE)
   *   types                  — array of type keys (defaults to all three)
   *   delayChoice            — '3h' (default) or '2d': wait between liking the post
   *                            and the connect/message step (Connect + Message types)
   *   start                  — launch after create (default true)
   *   onLog(message, level)  — optional progress callback ('info'|'ok'|'warn'|'err'|'head')
   *
   * @returns [{ type, name, listId, campaignId, started, error }]
   */
  async function buildCampaignSet(opts) {
    const {
      railwayUrl, apiKey, namePrefix,
      accountIds,
      leads = DEFAULT_STARTER_LEADS,
      schedule = DEFAULT_SCHEDULE,
      fallbackMessage = DEFAULT_FALLBACK_MESSAGE,
      types = CAMPAIGN_TYPES.map((t) => t.key),
      delayChoice = DEFAULT_DELAY_CHOICE,
      start = true,
      onLog = () => {}
    } = opts;

    if (!railwayUrl || !apiKey) throw new Error('buildCampaignSet: railwayUrl and apiKey are required');
    if (!namePrefix || !String(namePrefix).trim()) throw new Error('buildCampaignSet: namePrefix is required');
    if (!Array.isArray(accountIds) || accountIds.length === 0) throw new Error('buildCampaignSet: accountIds is required');

    const selectedTypes = CAMPAIGN_TYPES.filter((t) => types.includes(t.key));
    const delayLabel = (DELAY_CHOICES[delayChoice] || DELAY_CHOICES[DEFAULT_DELAY_CHOICE]).label;
    if (selectedTypes.some((t) => t.key !== 'quick_message')) {
      onLog(`Connect/Message delay after liking the post: ${delayLabel}`, 'info');
    }
    const results = [];

    for (const type of selectedTypes) {
      const name = `${String(namePrefix).trim()} ${type.suffix}`;
      const result = { type: type.key, name, listId: null, campaignId: null, started: false, error: null };
      results.push(result);

      try {
        onLog(`━━━ ${name} ━━━`, 'head');

        onLog(`1/4 Creating lead list "${name}"...`, 'info');
        const listResp = await call(railwayUrl, apiKey, '/proxy/heyreach/lists/createempty', { name, type: 'USER_LIST' });
        result.listId = listResp?.id ?? listResp?.listId;
        if (!result.listId) throw new Error(`Could not read list ID from response: ${JSON.stringify(listResp).slice(0, 200)}`);
        onLog(`    ✔ List created (ID ${result.listId})`, 'ok');
        await sleep(400);

        onLog(`2/4 Adding ${leads.length} contact(s) with 'content' custom field...`, 'info');
        const addResp = await call(railwayUrl, apiKey, '/proxy/heyreach/lists/addleadstolist', { listId: result.listId, leads });
        onLog(`    ✔ Added: ${addResp?.addedLeadsCount ?? '?'}, updated: ${addResp?.updatedLeadsCount ?? 0}, failed: ${addResp?.failedLeadsCount ?? 0}`, 'ok');
        await sleep(400);

        onLog(`3/4 Creating campaign "${name}" (${schedule.dailyStartTime.slice(0, 5)}–${schedule.dailyEndTime.slice(0, 5)} ${schedule.timeZoneId})...`, 'info');
        const campResp = await call(railwayUrl, apiKey, '/proxy/heyreach/campaign/create', {
          name,
          linkedInUserListId: result.listId,
          linkedInAccountIds: accountIds.map(Number),
          schedule,
          sequence: buildSequence(type.key, fallbackMessage, { delayChoice })
        });
        result.campaignId = campResp?.campaignId ?? campResp?.id;
        if (!result.campaignId) throw new Error(`Could not read campaign ID from response: ${JSON.stringify(campResp).slice(0, 200)}`);
        onLog(`    ✔ Campaign created in DRAFT (ID ${result.campaignId})`, 'ok');
        await sleep(400);

        if (start) {
          onLog(`4/4 Starting campaign ${result.campaignId}...`, 'info');
          await call(railwayUrl, apiKey, '/proxy/heyreach/campaign/start', { campaignId: result.campaignId });
          result.started = true;
          onLog(`    ✔ Campaign launched (IN_PROGRESS)`, 'ok');
        } else {
          onLog(`4/4 Skipping launch — campaign left in DRAFT.`, 'warn');
        }
        await sleep(400);
      } catch (err) {
        result.error = err.message;
        onLog(`    ✘ FAILED: ${err.message}`, 'err');
        onLog(`    Continuing with remaining campaigns...`, 'warn');
      }
    }

    return results;
  }

  /**
   * Convert successful buildCampaignSet results into the heyreachCampaigns
   * entry shape stored on bdr_leaders docs (same shape email_controls.html
   * writes when campaigns are associated manually).
   */
  function toBdrCampaignEntries(results, { accountId, namePrefix }) {
    const suffixFor = (key) => (CAMPAIGN_TYPES.find((t) => t.key === key) || {}).suffix || key;
    return results
      .filter((r) => r.campaignId && !r.error)
      .map((r) => ({
        id: String(r.campaignId),
        name: r.name,
        status: r.started ? 'IN_PROGRESS' : 'DRAFT',
        accountId: String(accountId),
        listId: String(r.listId),
        type: r.type,
        label: `${namePrefix} ${suffixFor(r.type)} (auto-built)`,
        createdVia: 'heyreach_campaigns_lib',
        createdAt: new Date().toISOString()
      }));
  }

  window.HeyReachCampaigns = {
    DEFAULT_FALLBACK_MESSAGE,
    DEFAULT_SCHEDULE,
    DEFAULT_STARTER_LEADS,
    CAMPAIGN_TYPES,
    DELAY_CHOICES,
    DEFAULT_DELAY_CHOICE,
    buildSequence,
    call,
    fetchLinkedInSenders,
    findAccountMatches,
    buildCampaignSet,
    toBdrCampaignEntries
  };

  console.log('✅ HeyReachCampaigns library loaded');
})();
