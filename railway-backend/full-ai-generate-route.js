/**
 * Full AI Generate Route  (Smart Routing Edition)
 * POST /api/connect/full-ai-generate-async
 * 
 * For each prospect, runs a three-stage smart routing pipeline:
 *
 *   Stage 1 — Post Reply
 *     · Scrapes the prospect's recent LinkedIn posts (Apify).
 *     · Llama evaluates whether any post is "worthy" (recent, substantive, non-hiring).
 *     · If yes → generates a warm post-reply connection message (same logic as the Post Reply tab).
 *     · If no worthy post → proceed to Stage 2.
 *
 *   Stage 2 — Classify prospect
 *     · Llama evaluates title to determine seniority level (C-Suite / VP / SVP / Director = "senior").
 *     · Looks up company in Firestore `prospect_organizations` for staff count / size range.
 *     · If no org data → Gemini searches the web for company size.
 *     · A contact is "senior at large org" when seniority ≥ Director AND company has ≥ 500 employees
 *       (or is a known large entity).
 *
 *   Stage 3 — Route to best message method
 *     · Senior + large org  → Internet Search first, then About Me Connect fallback.
 *     · All others          → About Me Connect first, then Internet Search fallback.
 *
 *   Internet Search (same logic as the Internet Search tab):
 *     · Gemini searches for recent contact / company news.
 *     · Llama generates a short news-hook message.
 *
 *   About Me Connect (same logic as the About Me Connect tab):
 *     · Maverick Call 1 — find genuine BDR ↔ prospect commonalities.
 *     · Maverick Call 2 — rank commonalities.
 *     · Maverick Call 3 — generate personalised connection message.
 *
 * The job runs asynchronously and can be polled via GET /api/connect/generation-job/:jobId
 */

'use strict';

const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const axios   = require('axios');

// ── Config ─────────────────────────────────────────────────────────────────────

const RAILWAY_BASE_URL  = process.env.RAILWAY_BASE_URL || 'https://railwayclemail-production.up.railway.app';
const APIFY_TOKEN       = process.env.APIFY_TOKEN;
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
const GROQ_API_KEY      = process.env.GROQ_API_KEY;

const APIFY_PROFILE_ACTOR = process.env.APIFY_PROFILE_ACTOR || 'apify~linkedin-profile-scraper';
const APIFY_POSTS_ACTOR   = process.env.APIFY_POSTS_ACTOR   || 'apify~linkedin-post-search';
const LLAMA_MODEL         = process.env.LLAMA_MODEL         || 'llama-3.3-70b-versatile';
const MAVERICK_MODEL      = process.env.MAVERICK_MODEL      || 'meta-llama/llama-4-maverick-17b-128e-instruct-fp8';
const GEMINI_MODEL        = process.env.GEMINI_MODEL        || 'gemini-2.0-flash';

// ── Active jobs ────────────────────────────────────────────────────────────────

const activeJobs = new Map();
module.exports.fullAiActiveJobs = activeJobs;

// ── Auth middleware ─────────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No auth token provided' });
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid auth token: ' + err.message });
    }
}

// ── POST /full-ai-generate-async ───────────────────────────────────────────────

router.post('/full-ai-generate-async', requireAuth, async (req, res) => {
    const {
        bdrEmail,
        count                  = 10,
        bdrSalesConfig         = null,
        scanJobId              = null,
        moveBatchId            = null,
        groupBatchId           = null,
        connectionFilterEnabled = true,
        minConnectionCount     = 250
    } = req.body;

    if (!bdrEmail) return res.status(400).json({ error: 'bdrEmail is required' });

    const jobId = `full-ai-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const job = {
        jobId,
        status:    'running',
        startedAt: new Date().toISOString(),
        startedBy: req.user.email,
        bdrEmail,
        progress: { processed: 0, total: count, fit: 0, notFit: 0, errors: 0 },
        logs:    [],
        results: []
    };
    activeJobs.set(jobId, job);
    res.json({ jobId, status: 'started' });

    runFullAiGenerate(job, { bdrEmail, count, bdrSalesConfig, scanJobId, moveBatchId, groupBatchId, connectionFilterEnabled, minConnectionCount })
        .catch(err => {
            job.status = 'failed';
            job.error  = err.message;
            addJobLog(job, `❌ Fatal error: ${err.message}`, 'error');
            console.error(`[Full AI Job ${jobId}] Fatal error:`, err);
        });
});

// ── Core orchestration ─────────────────────────────────────────────────────────

async function runFullAiGenerate(job, opts) {
    const { bdrEmail, count, scanJobId, moveBatchId = null, groupBatchId = null } = opts;
    let { bdrSalesConfig, connectionFilterEnabled, minConnectionCount } = opts;
    // Coerce types (values come from JSON body as booleans/numbers but keep safe)
    connectionFilterEnabled = connectionFilterEnabled !== false;     // default true
    minConnectionCount      = parseInt(minConnectionCount, 10) || 250;
    const db = admin.firestore();

    addJobLog(job, `🚀 Starting Full AI Smart Generate for ${bdrEmail} (${count} prospects)`, 'info');

    // ── 1. Load BDR Outreach Strategy ────────────────────────────────────────

    if (!bdrSalesConfig) {
        try {
            addJobLog(job, '📋 Loading BDR Outreach Strategy...', 'info');
            const profileDoc = await db.collection('contact_profiles').doc(bdrEmail).get();
            if (profileDoc.exists) {
                bdrSalesConfig = profileDoc.data().bdrSalesConfig || null;
                addJobLog(job, bdrSalesConfig
                    ? '✅ Outreach strategy loaded'
                    : '⚠️ No outreach strategy found — continuing without it', 'info');
            }
        } catch (err) {
            addJobLog(job, `⚠️ Could not load strategy: ${err.message}`, 'warning');
        }
    }
    const strategy = bdrSalesConfig || {};

    // ── 2. Load BDR About Me profile (needed for About Me Connect) ───────────

    let bdrProfileData = null;
    try {
        addJobLog(job, '📋 Loading BDR About Me profile...', 'info');
        const profileSnap = await db.collection('contact_profiles').doc(bdrEmail).get();
        if (profileSnap.exists) {
            bdrProfileData = profileSnap.data();
            addJobLog(job, bdrProfileData.statements
                ? '✅ About Me profile loaded'
                : '⚠️ About Me profile exists but has no statements — About Me Connect may be limited', 'info');
        } else {
            addJobLog(job, '⚠️ No About Me profile found — About Me Connect will be skipped', 'warning');
        }
    } catch (err) {
        addJobLog(job, `⚠️ Could not load About Me profile: ${err.message}`, 'warning');
    }

    // ── 3. Get eligible prospects ─────────────────────────────────────────────

    addJobLog(job, '📊 Loading prospects...', 'info');
    let prospects = [];
    try {
        const contactsSnap = await db.collection('prospect_contacts')
            .where('userEmail', '==', bdrEmail)
            .get();

        // ── Already-messaged: check both bdr_email and account_email (used in different parts) ──
        const [queueByBdr, queueByAccount, connectExclusionsSnap, prospectExclusionsSnap] = await Promise.all([
            db.collection('connect_queue').where('bdr_email',    '==', bdrEmail).get(),
            db.collection('connect_queue').where('account_email','==', bdrEmail).get(),
            db.collection('connect_exclusions').get(),
            db.collection('prospect_exclusions').get()
        ]);

        const messagedUrls = new Set();
        [queueByBdr, queueByAccount].forEach(snap =>
            snap.forEach(d => { const u = normalizeUrl(d.data().prospect_li_url || ''); if (u) messagedUrls.add(u); })
        );

        const excludedUrls = new Set();
        [connectExclusionsSnap, prospectExclusionsSnap].forEach(snap =>
            snap.forEach(d => { const u = normalizeUrl(d.data().linkedinUrl || ''); if (u) excludedUrls.add(u); })
        );

        // ── Already-connected: heyreach_contacts (primary) → heyreach_activity (fallback) ──
        const connectedUrls = new Set();
        try {
            addJobLog(job, '   🔗 Loading existing LinkedIn connections...', 'info');
            let foundHeyreach = false;
            for (const field of ['accountEmail', 'bdrEmail', 'linkedInAccountEmail']) {
                try {
                    const snap = await db.collection('heyreach_contacts').where(field, '==', bdrEmail).get();
                    if (!snap.empty) {
                        snap.forEach(d => {
                            const u = normalizeUrl(d.data().linkedin_url || d.data().profileUrl ||
                                                   d.data().leadProfileUrl || d.data().linkedInUrl || '');
                            if (u) connectedUrls.add(u);
                        });
                        foundHeyreach = true;
                    }
                } catch (_) {}
            }
            // Fallback: heyreach_activity CONNECTION_REQUEST_ACCEPTED events
            if (!foundHeyreach) {
                for (const field of ['bdrEmail', 'accountEmail']) {
                    try {
                        const snap = await db.collection('heyreach_activity')
                            .where('eventType', '==', 'CONNECTION_REQUEST_ACCEPTED')
                            .where(field, '==', bdrEmail)
                            .get();
                        snap.forEach(d => {
                            const u = normalizeUrl(d.data().leadProfileUrl || '');
                            if (u) connectedUrls.add(u);
                        });
                    } catch (_) {}
                }
            }
            addJobLog(job, `   ✅ ${connectedUrls.size} existing connections loaded`, 'info');
        } catch (err) {
            addJobLog(job, `   ⚠️ Could not load existing connections: ${err.message}`, 'warning');
        }

        // ── Apply all filters ──────────────────────────────────────────────────
        const allContacts = [];
        contactsSnap.forEach(d => allContacts.push({ id: d.id, ...d.data() }));

        const hasBatchFilter = !!(scanJobId || moveBatchId || groupBatchId);
        const inBatch = (c) => {
            if (!hasBatchFilter) return true;
            if (scanJobId   && c.scanJobId   !== scanJobId)   return false;
            if (moveBatchId && c.moveBatchId !== moveBatchId) return false;
            if (groupBatchId && c.groupBatchId !== groupBatchId) return false;
            return true;
        };

        let skippedHarvest   = 0, skippedNoUrl    = 0, skippedNonVanity = 0;
        let skippedMessaged  = 0, skippedExcluded = 0, skippedConnected = 0;
        let skippedConnCount = 0, skippedBatch    = 0;
        let batchTotal       = 0;
        let batchSkippedMessaged = 0, batchSkippedConnected = 0;
        let batchSkippedExcluded = 0, batchSkippedConnCount = 0;
        const seenUrls = new Set(); // deduplicate duplicate contact records

        const eligible = allContacts.filter(c => {
            if (c.movedToHarvest)  { skippedHarvest++;   return false; }
            const url = normalizeUrl(c.linkedInUrl || c.li_url || '');
            if (!url)              { skippedNoUrl++;      return false; }
            if (!isVanityUrl(url)) { skippedNonVanity++;  return false; }
            if (seenUrls.has(url)) return false; // silent dedup
            seenUrls.add(url);

            if (!inBatch(c)) { skippedBatch++; return false; }
            if (hasBatchFilter) batchTotal++;

            if (messagedUrls.has(url))  { skippedMessaged++;  if (hasBatchFilter) batchSkippedMessaged++;  return false; }
            if (excludedUrls.has(url))  { skippedExcluded++;  if (hasBatchFilter) batchSkippedExcluded++;  return false; }
            if (connectedUrls.has(url)) { skippedConnected++; if (hasBatchFilter) batchSkippedConnected++; return false; }

            if (connectionFilterEnabled && minConnectionCount > 0) {
                if (c.connectionCountNA === true ||
                    (c.linkedInConnectionCount != null && Number(c.linkedInConnectionCount) < minConnectionCount)) {
                    skippedConnCount++;
                    if (hasBatchFilter) batchSkippedConnCount++;
                    return false;
                }
            }

            return true;
        });

        // Diagnostic log — batch-aware so it's clear the filter is working
        let summaryLine;
        if (hasBatchFilter) {
            const batchDesc = scanJobId
                ? `import batch ${scanJobId}`
                : moveBatchId
                    ? `move batch ${moveBatchId}`
                    : `group batch ${groupBatchId}`;
            const batchSkipParts = [];
            if (batchSkippedMessaged)  batchSkipParts.push(`${batchSkippedMessaged} already messaged/queued`);
            if (batchSkippedConnected) batchSkipParts.push(`${batchSkippedConnected} already connected`);
            if (batchSkippedConnCount) batchSkipParts.push(`${batchSkippedConnCount} below ${minConnectionCount} connections`);
            if (batchSkippedExcluded)  batchSkipParts.push(`${batchSkippedExcluded} excluded`);
            summaryLine =
                `${allContacts.length} total BDR contacts` +
                ` | filter: ${batchDesc} → ${batchTotal} contacts in batch` +
                (batchSkipParts.length ? ` | skipped from batch: ${batchSkipParts.join(', ')}` : '') +
                ` | ${eligible.length} eligible | processing ${Math.min(eligible.length, count)}`;
        } else {
            const parts = [];
            if (skippedHarvest)   parts.push(`${skippedHarvest} in harvest pool`);
            if (skippedNoUrl)     parts.push(`${skippedNoUrl} no URL`);
            if (skippedNonVanity) parts.push(`${skippedNonVanity} non-vanity URL`);
            if (skippedMessaged)  parts.push(`${skippedMessaged} already messaged/queued`);
            if (skippedExcluded)  parts.push(`${skippedExcluded} excluded`);
            if (skippedConnected) parts.push(`${skippedConnected} already connected`);
            if (skippedConnCount) parts.push(`${skippedConnCount} below ${minConnectionCount} connections`);
            summaryLine =
                `${allContacts.length} total` +
                (parts.length ? ` | skipped: ${parts.join(', ')}` : '') +
                ` | ${eligible.length} eligible | processing ${Math.min(eligible.length, count)}`;
        }

        addJobLog(job, `✅ ${summaryLine}`, 'info');

        shuffle(eligible);
        prospects = eligible.slice(0, count);
        job.progress.total = prospects.length;
    } catch (err) {
        addJobLog(job, `❌ Error loading prospects: ${err.message}`, 'error');
        job.status = 'failed';
        job.error = err.message;
        return;
    }

    if (prospects.length === 0) {
        addJobLog(job, '⚠️ No eligible prospects found.', 'warning');
        job.status = 'completed';
        return;
    }

    // ── 4. Process each prospect ──────────────────────────────────────────────

    for (let i = 0; i < prospects.length; i++) {
        if (job.status === 'cancelled') {
            addJobLog(job, '⛔ Job cancelled', 'warning');
            break;
        }

        const prospect = prospects[i];
        const liUrl    = prospect.linkedInUrl || prospect.li_url || '';
        const name     = [prospect.firstName, prospect.lastName].filter(Boolean).join(' ')
            || prospect.name || liUrl.split('/in/')[1] || 'Unknown';
        const title    = prospect.title || prospect.currentTitle || '';
        const company  = prospect.company || prospect.organization || '';

        job.progress.processed = i + 1;
        addJobLog(job, `\n[${i + 1}/${prospects.length}] ── ${name} (${title || '?'} @ ${company || '?'}) ──`, 'info');

        try {
            // ── Stage 1: Try Post Reply ──────────────────────────────────────

            addJobLog(job, `   📬 Stage 1: Checking for a worthy recent post...`, 'info');
            const postReplyResult = await tryPostReply(liUrl, name, prospect, strategy, job);

            if (postReplyResult.message) {
                addJobLog(job, `   ✅ Post Reply message generated!`, 'success');
                job.results.push(buildResult(prospect, liUrl, name, title, company,
                    [postReplyResult.message], 'post-reply', 'Had a worthy recent post'));
                job.progress.fit++;
                await sleep(1500);
                continue;
            }

            addJobLog(job, `   → No worthy post found — moving to Stage 2`, 'info');

            // ── Stage 2: Classify seniority + org size ───────────────────────

            addJobLog(job, `   🧠 Stage 2: Classifying contact seniority and org size...`, 'info');
            const classification = await classifyContact(title, company, db, bdrEmail, job);
            addJobLog(job,
                `   📊 Classification: ${classification.seniority} seniority | ` +
                `${classification.orgSizeLabel} | isSeniorAtLargeOrg = ${classification.isSeniorAtLargeOrg}`,
                'info');

            // ── Stage 3: Route to best message method ────────────────────────

            let message       = null;
            let messageSource = '';
            let routeReason   = '';

            if (classification.isSeniorAtLargeOrg) {
                routeReason = `Senior (${classification.seniority}) at large org (${classification.orgSizeLabel})`;
                addJobLog(job, `   🌐 Stage 3a: Senior + large org → trying Internet Search first...`, 'info');

                const isResult = await tryInternetSearch(name, title, company, strategy, job);
                if (isResult.message) {
                    message       = isResult.message;
                    messageSource = 'internet-search';
                    addJobLog(job, `   ✅ Internet Search message generated!`, 'success');
            } else {
                    addJobLog(job, `   ⚠️ Internet Search yielded nothing — falling back to About Me Connect...`, 'warning');
                    const amcResult = await tryAboutMeConnect(liUrl, bdrEmail, bdrProfileData, prospect, job);
                    if (amcResult.message) {
                        message       = amcResult.message;
                        messageSource = 'about-me-connect';
                        addJobLog(job, `   ✅ About Me Connect message generated!`, 'success');
                    }
                }
            } else {
                routeReason = `${classification.seniority} at ${classification.orgSizeLabel}`;
                addJobLog(job, `   🤝 Stage 3b: Not senior+large → trying About Me Connect first...`, 'info');

                const amcResult = await tryAboutMeConnect(liUrl, bdrEmail, bdrProfileData, prospect, job);
                if (amcResult.message) {
                    message       = amcResult.message;
                    messageSource = 'about-me-connect';
                    addJobLog(job, `   ✅ About Me Connect message generated!`, 'success');
                } else {
                    addJobLog(job, `   ⚠️ About Me Connect yielded nothing — falling back to Internet Search...`, 'warning');
                    const isResult = await tryInternetSearch(name, title, company, strategy, job);
                    if (isResult.message) {
                        message       = isResult.message;
                        messageSource = 'internet-search';
                        addJobLog(job, `   ✅ Internet Search message generated!`, 'success');
                    }
                }
            }

            if (message) {
                job.results.push(buildResult(prospect, liUrl, name, title, company,
                    [message], messageSource, routeReason, classification));
                job.progress.fit++;
            } else {
                addJobLog(job, `   ❌ All methods failed — no message for ${name}`, 'warning');
                job.progress.notFit++;
            }

                } catch (err) {
            addJobLog(job, `   ❌ Error processing ${name}: ${err.message}`, 'error');
            job.progress.errors++;
        }

        await sleep(1500);
    }

    job.status = 'completed';
    addJobLog(job,
        `\n🎉 Full AI Smart Generate complete! ` +
        `${job.progress.fit} messages generated | ` +
        `${job.progress.notFit} contacts with no message | ` +
        `${job.progress.errors} errors`,
        'success');
}

// ── Stage 1: Post Reply ─────────────────────────────────────────────────────────

/**
 * Scrapes the prospect's recent posts, evaluates whether any is "worthy", and
 * generates a personalised connection message referencing that post — exactly as
 * the Post Reply tab does.
 *
 * Returns { message: string|null, postUsed: object|null }
 */
async function tryPostReply(liUrl, name, prospect, strategy, job) {
    // Scrape recent posts (last 3 months, same window as Post Reply tab)
    let posts = [];
    try {
        posts = await scrapeLinkedInPosts(liUrl, 3);
        addJobLog(job, `   → Fetched ${posts.length} recent posts`, 'info');
                } catch (err) {
        addJobLog(job, `   → Post scrape failed: ${err.message}`, 'warning');
        return { message: null, postUsed: null };
    }

    if (posts.length === 0) {
        addJobLog(job, `   → No posts in last 3 months`, 'info');
        return { message: null, postUsed: null };
    }

    // Ask Llama to find the single best worthy post (same classification the Post Reply tab uses)
    const worthyPost = await llamaPickBestPost(posts, name, job);
    if (!worthyPost) {
        return { message: null, postUsed: null };
    }
    addJobLog(job, `   → Worthy post found: "${worthyPost.text?.substring(0, 80)}..."`, 'info');

    // Generate a connection message referencing the post (Post Reply style)
    const message = await llamaGeneratePostReplyMessage(worthyPost, name, prospect, strategy);
    return { message: message || null, postUsed: worthyPost };
}

async function llamaPickBestPost(posts, prospectName, job) {
    if (!GROQ_API_KEY) return null;
    const postsText = posts.slice(0, 6).map((p, i) =>
        `Post ${i + 1} [${p.date || 'recent'}]: "${(p.text || '').substring(0, 350)}"`
    ).join('\n\n');

    const prompt = `You evaluate LinkedIn posts to decide if any is "worthy" to reference in a connection request message.

POSTS (ordered most-recent first):
${postsText}

A post is WORTHY if ALL of these are true:
1. It contains substantive original thoughts (not just a like/reshare with no text of their own).
2. It's about work, industry insights, career, or professional interests — not just personal milestones or generic inspirational quotes.
3. It is NOT primarily about hiring, open roles, or recruiting.
4. It was posted no more than 90 days ago (recent enough to mention naturally).

Return JSON:
{
  "worthyIndex": null or the 1-based index of the single best worthy post,
  "reason": "one sentence explaining your choice or why no post qualifies"
}`;

    try {
        const result = await callLlama(prompt, 'post_evaluation');
        if (!result || result.worthyIndex == null) {
            addJobLog(job, `   → Llama: no worthy post — ${result?.reason || ''}`, 'info');
            return null;
        }
        return posts[result.worthyIndex - 1] || null;
                } catch (err) {
        addJobLog(job, `   → Post evaluation error: ${err.message}`, 'warning');
        return null;
    }
}

async function llamaGeneratePostReplyMessage(post, name, prospect, strategy) {
    if (!GROQ_API_KEY) return null;

    const firstName  = prospect.firstName || name.split(' ')[0] || 'there';
    const title      = prospect.title || prospect.currentTitle || '';
    const company    = prospect.company || prospect.organization || '';
    const postDate   = post.date ? new Date(post.date) : null;
    const monthsAgo  = postDate
        ? Math.round((Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
        : null;
    const dateQualifier = (monthsAgo && monthsAgo > 3) ? 'a few months ago' : 'recently';

    const prompt = `Write a LinkedIn connection request message that references this person's ${dateQualifier} post.

PROSPECT: ${firstName} ${prospect.lastName || ''}, ${title}${company ? ` at ${company}` : ''}
POST (${dateQualifier}): "${(post.text || '').substring(0, 400)}"
${strategy.companyValueProposition ? `\nOUR CONTEXT (use subtly if helpful): ${strategy.companyValueProposition.substring(0, 150)}` : ''}

RULES:
1. The ENTIRE message must be under 200 characters.
2. Reference the post naturally and specifically — don't just say "I saw your recent post".
3. Warm, peer-to-peer tone. No pitch, no demo, no calendar asks.
4. Do NOT use em dashes or en dashes.
5. ${monthsAgo && monthsAgo > 3 ? 'The post is older than 3 months — phrase the reference as "your post from a few months ago about…".' : 'The post is recent — normal phrasing is fine.'}

Return ONLY a valid JSON object:
{"message": "the complete connection request message"}`;

    try {
        const result = await callLlama(prompt, 'post_reply_message');
        if (result && typeof result.message === 'string') {
            return sanitizeMessageDashes(result.message).substring(0, 200);
        }
        // Fallback: try parsing a raw string response
        if (typeof result === 'string') return sanitizeMessageDashes(result).substring(0, 200);
        return null;
        } catch (err) {
        console.error('[Full AI] Post reply message generation error:', err.message);
        return null;
    }
}

// ── Stage 2: Classify contact ───────────────────────────────────────────────────

/**
 * Returns { isSeniorAtLargeOrg, seniority, orgSizeLabel, orgStaffCount }
 *
 * "Senior" = Director / VP / SVP / EVP / C-Suite.
 * "Large org" = ≥ 500 employees, or a well-known large entity (hospital system, health plan, Fortune 500).
 * Org size is taken from Firestore prospect_organizations first; Gemini search as fallback.
 */
async function classifyContact(title, company, db, bdrEmail, job) {
    // ── A. Seniority from title ────────────────────────────────────────────────
    let seniority = 'mid-level';
    const t = (title || '').toLowerCase();
    if (/\b(c[ex]o|cto|cio|cfo|coo|cmo|cso|president|chief\s+\w+\s+officer)\b/.test(t)) {
        seniority = 'C-Suite';
    } else if (/\b(svp|senior\s+vice\s+president|exec(utive)?\s+(vice\s+)?president)\b/.test(t)) {
        seniority = 'SVP/EVP';
    } else if (/\bvice\s+president\b|\bvp\b/.test(t)) {
        seniority = 'VP';
    } else if (/\bdirector\b/.test(t)) {
        seniority = 'Director';
    } else if (/\bmanager\b/.test(t)) {
        seniority = 'Manager';
    }

    const isSenior = ['C-Suite', 'SVP/EVP', 'VP', 'Director'].includes(seniority);

    // ── B. Org size lookup ─────────────────────────────────────────────────────
    let orgStaffCount = null;
    let orgSizeLabel  = 'unknown size';

    if (company) {
        // 1. Try Firestore prospect_organizations (for this BDR)
        try {
            const normCompany = company.toLowerCase().trim();
            const orgSnap = await db.collection('prospect_organizations')
                .where('bdrEmail', '==', bdrEmail)
                .get();

            let bestMatch = null;
            orgSnap.forEach(d => {
                const storedName = (d.data().company_name || '').toLowerCase().trim();
                if (storedName === normCompany || normCompany.includes(storedName) || storedName.includes(normCompany)) {
                    bestMatch = d.data();
                }
            });

            if (bestMatch) {
                orgStaffCount = bestMatch.company_staff_count || null;
                const sizeRange = bestMatch.company_size_range || null;
                if (orgStaffCount) {
                    orgSizeLabel = `${orgStaffCount.toLocaleString()} employees`;
                } else if (sizeRange) {
                    orgSizeLabel = `${sizeRange} employees`;
                    // Try to infer a number from sizeRange "201–500"
                    const parts = sizeRange.toString().replace(/[,\s]/g, '').split(/[–\-]/);
                    if (parts[1]) orgStaffCount = parseInt(parts[1]) || null;
                }
                addJobLog(job, `   → Org found in Firestore: ${orgSizeLabel}`, 'info');
            }
        } catch (err) {
            addJobLog(job, `   → Firestore org lookup error: ${err.message}`, 'warning');
        }

        // 2. If no Firestore data → Gemini search for company size
        if (orgStaffCount === null) {
            try {
                addJobLog(job, `   → No org data found locally — searching for company size via Gemini...`, 'info');
                const searchResult = await geminiSearch(
                    `How many employees does "${company}" have? Is it a large organization (enterprise or health system)? ` +
                    `Return a short factual answer including the approximate employee count or size range.`
                );

                // Parse the Gemini result with Llama for a structured answer
                if (searchResult) {
                    const parseResult = await callLlama(
                        `Based on this company size information, return a JSON object with the approximate employee count.
                        
Company: "${company}"
Research: "${searchResult.substring(0, 600)}"

Return JSON: {"staffCount": number or null, "sizeLabel": "e.g. 500–1000 employees", "isLarge": true or false}`,
                        'org_size_parse'
                    );

                    if (parseResult) {
                        orgStaffCount = parseResult.staffCount || null;
                        if (parseResult.sizeLabel) orgSizeLabel = parseResult.sizeLabel;
                        addJobLog(job, `   → Gemini org size result: ${orgSizeLabel}`, 'info');
                    }
        }
    } catch (err) {
                addJobLog(job, `   → Gemini org size search failed: ${err.message}`, 'warning');
            }
        }
    }

    // ── C. Determine "large org" ───────────────────────────────────────────────
    // Large = ≥500 employees, OR contains keywords for known large entities
    const isLargeOrg = orgStaffCount != null
        ? orgStaffCount >= 500
        : /\b(health\s*system|hospital\s*system|health\s*plan|insurance|hca|ascension|tenet|commonspirit|kaiser|anthem|cigna|cvs|aetna|medicare|medicaid|fortune\s*\d+)\b/i.test(company);

    if (orgSizeLabel === 'unknown size' && isLargeOrg) {
        orgSizeLabel = 'large (size unknown)';
    }

    return {
        isSeniorAtLargeOrg: isSenior && isLargeOrg,
        seniority,
        orgSizeLabel,
        orgStaffCount,
        isLargeOrg
    };
}

// ── Stage 3a: Internet Search ───────────────────────────────────────────────────

/**
 * Uses Gemini to find recent news about the contact and/or their organisation,
 * then asks Llama to generate a short news-hook connection message.
 * Mirrors the logic of the Internet Search (Contact-Focused) tab.
 */
async function tryInternetSearch(name, title, company, strategy, job) {
    if (!GEMINI_API_KEY) {
        addJobLog(job, `   → Gemini not configured — Internet Search skipped`, 'warning');
        return { message: null };
    }

    const newsTypes = strategy.newsStoryTypes ||
        'new partnerships, leadership changes, technology implementations, awards, growth announcements, funding rounds';

    // Search 1: contact news
    let contactNews = '';
    try {
        contactNews = await geminiSearch(
            `Find recent news (last 6 months) about ${name}${company ? `, ${title} at ${company}` : ''}. ` +
            `Look for speaking engagements, published articles, awards, interviews, or notable achievements. ` +
            `Return specific facts only. If nothing found, say "No recent news."`)
        ;
    } catch (err) {
        addJobLog(job, `   → Contact news search error: ${err.message}`, 'warning');
    }

    // Search 2: company news
    let companyNews = '';
    if (company) {
        try {
            companyNews = await geminiSearch(
                `Find recent news (last 6 months) about "${company}" related to: ${newsTypes}. ` +
                `Return only factual, specific news items. If nothing found, say "No recent news."`
            );
    } catch (err) {
            addJobLog(job, `   → Company news search error: ${err.message}`, 'warning');
        }
    }

    const hasContactNews = contactNews && !/no recent news/i.test(contactNews);
    const hasCompanyNews = companyNews && !/no recent news/i.test(companyNews);

    if (!hasContactNews && !hasCompanyNews) {
        addJobLog(job, `   → No relevant news found for ${name} / ${company}`, 'info');
        return { message: null };
    }

    // Generate a news-hook message with Llama (same style as Internet Search tab)
    const message = await llamaGenerateNewsMessage({
        name,
        title,
        company,
        contactNews: hasContactNews ? contactNews.substring(0, 400) : null,
        companyNews: hasCompanyNews ? companyNews.substring(0, 400) : null,
        strategy
    });

    return { message: message || null };
}

async function llamaGenerateNewsMessage({ name, title, company, contactNews, companyNews, strategy }) {
    if (!GROQ_API_KEY) return null;

    const firstName  = name.split(' ')[0] || 'there';
    const newsContext = [
        contactNews ? `About ${firstName}: ${contactNews}` : '',
        companyNews ? `About ${company}: ${companyNews}` : ''
    ].filter(Boolean).join('\n\n');

    const prompt = `Write a LinkedIn connection request message based on relevant recent news.

PROSPECT: ${name}, ${title}${company ? ` at ${company}` : ''}

RECENT NEWS CONTEXT:
${newsContext}

${strategy.companyValueProposition ? `OUR CONTEXT (use subtly if it fits): ${strategy.companyValueProposition.substring(0, 150)}` : ''}

RULES:
1. The ENTIRE message must be under 200 characters.
2. Lead with something specific from the news — don't use generic phrases like "I've been following your work".
3. Warm, peer tone. No sales pitch, no demo, no calendar asks.
4. Do NOT use em dashes or en dashes.
5. Prioritise personal news about the contact over company news when both are available.

Return ONLY a valid JSON object:
{"message": "the complete connection request message"}`;

    try {
        const result = await callLlama(prompt, 'internet_search_message');
        if (result && typeof result.message === 'string') {
            return sanitizeMessageDashes(result.message).substring(0, 200);
        }
        if (typeof result === 'string') return sanitizeMessageDashes(result).substring(0, 200);
        return null;
    } catch (err) {
        console.error('[Full AI] Internet search message generation error:', err.message);
        return null;
    }
}

// ── Stage 3b: About Me Connect ──────────────────────────────────────────────────

/**
 * Runs the three-step Maverick About Me Connect pipeline — exactly as the
 * About Me Connect tab does — directly calling the shared helper functions.
 *
 * Returns { message: string|null }
 */
async function tryAboutMeConnect(liUrl, bdrEmail, bdrProfileData, prospect, job) {
    if (!bdrProfileData || !bdrProfileData.statements) {
        addJobLog(job, `   → No BDR About Me profile — About Me Connect skipped`, 'info');
        return { message: null };
    }

    const bdrProfileText = buildBdrProfileTextForAMC(bdrProfileData);
    if (bdrProfileText === '(No statements filled in yet)') {
        addJobLog(job, `   → BDR About Me profile has no statements — About Me Connect skipped`, 'info');
        return { message: null };
    }

    // Fetch prospect posts for commonality analysis
    let recentPosts = [];
    try {
        recentPosts = await scrapeLinkedInPosts(liUrl, 6);
        recentPosts = recentPosts.slice(0, 30);
        addJobLog(job, `   → AMC: fetched ${recentPosts.length} posts for commonality analysis`, 'info');
    } catch (err) {
        addJobLog(job, `   → AMC: post fetch failed (non-fatal): ${err.message}`, 'warning');
    }

    const postsText = recentPosts.length > 0
        ? recentPosts.map((p, i) => `Post ${i + 1} (${p.date || 'recent'}): ${String(p.text).substring(0, 400)}`).join('\n\n')
        : '(No recent posts found)';

    const prospectProfile = {
        currentTitle:         prospect.title || prospect.currentTitle || '',
        currentCompany:       prospect.company || prospect.organization || '',
        firstName:            prospect.firstName || '',
        lastName:             prospect.lastName  || '',
        location:             prospect.location  || '',
        headline:             prospect.headline  || '',
        about:                prospect.about     || '',
        experienceParagraph:  prospect.experienceParagraph || '',
        educationParagraph:   prospect.educationParagraph  || ''
    };
    const prospectProfileText = buildProspectProfileTextForAMC(prospectProfile);

    // ── Maverick Call 1: Find commonalities ───────────────────────────────────
    addJobLog(job, `   → AMC Call 1: finding commonalities...`, 'info');
    let commonalities = [];
    try {
        const call1 = await callMaverick(
            'You are an expert at finding genuine personal connections between two professionals. Return only valid JSON.',
            `Find all meaningful commonalities between this BDR and this prospect.

BDR ABOUT ME PROFILE:
${bdrProfileText}

PROSPECT LINKEDIN PROFILE:
${prospectProfileText}

PROSPECT'S RECENT LINKEDIN POSTS:
${postsText}

Look for: geographic (same city/state/region), educational (same college), career history (same company, similar roles), hobbies or personal interests, shared passions or professional missions.
Only include commonalities genuinely present in both. Be specific.
Do NOT treat hiring posts or job openings as a commonality.

Return JSON: {"commonalities": ["commonality 1", "commonality 2", ...]}`,
            512
        );
        commonalities = call1?.commonalities || [];
        addJobLog(job, `   → AMC: found ${commonalities.length} commonalities`, 'info');
    } catch (err) {
        addJobLog(job, `   → AMC Call 1 error: ${err.message}`, 'warning');
        return { message: null };
    }

    if (commonalities.length === 0) {
        addJobLog(job, `   → AMC: no commonalities found`, 'info');
        return { message: null };
    }

    // ── Maverick Call 2: Rank commonalities ───────────────────────────────────
    let bestCommonality   = commonalities[0];
    let secondCommonality = null;
    let secondScore       = 0;
    try {
        const call2 = await callMaverick(
            'You are an expert at evaluating which personal connections make the best foundation for a LinkedIn connection request. Return only valid JSON.',
            `Rank these commonalities by how likely they are to create a genuine, memorable connection.

COMMONALITIES:
${commonalities.map((c, i) => `${i + 1}. ${c}`).join('\n')}

SCORING GUIDE:
- Same city or neighborhood: 1-2 points
- Same state or region: 2-3 points
- Same college or university: 4-5 points
- Worked at same company: 5-6 points
- Similar career trajectory: 4-5 points
- Shared hobby or personal interest: 6-7 points
- Shared passion, mission, or professional focus: 8-10 points

Return JSON:
{
  "ranked": [{"commonality": "...", "score": 0, "type": "location|education|career|hobby|passion"}],
  "best": "The single strongest commonality",
  "bestScore": 0,
  "bestType": "location|education|career|hobby|passion",
  "second": "Second best or null",
  "secondScore": 0
}`,
            512
        );
        if (call2?.best) {
            bestCommonality = call2.best;
            secondScore     = call2.secondScore || 0;
            secondCommonality = secondScore >= 4 ? (call2.second || null) : null;
        }
    } catch (err) {
        addJobLog(job, `   → AMC Call 2 error (non-fatal): ${err.message}`, 'warning');
    }

    // ── Maverick Call 3: Generate message ─────────────────────────────────────
    addJobLog(job, `   → AMC Call 3: generating message...`, 'info');

    const prospectSpecific = (() => {
        const firstNonHiringPost = recentPosts.find(p => p.text && p.text.length > 30 && !isHiringPost(p.text));
        if (firstNonHiringPost) return `They recently posted about: "${firstNonHiringPost.text.substring(0, 200)}"`;
        if (prospectProfile.about)    return `Their about section: "${String(prospectProfile.about).substring(0, 200)}"`;
        if (prospectProfile.headline) return `Their headline: "${prospectProfile.headline}"`;
        return `Their work as ${prospectProfile.currentTitle || 'a professional'} at ${prospectProfile.currentCompany || 'their organization'}`;
    })();

    let generatedMessage = null;
    try {
        const call3 = await callMaverick(
            'You write short, genuine, human LinkedIn connection messages that feel personal and never salesy. Return only valid JSON.',
            `Generate a LinkedIn connection message using EXACTLY this format:

"I saw you [short specific reference to something from their profile or posts]. I [something personal about the BDR that creates the connection]. ${secondCommonality ? 'Plus we both [second shared thing].' : ''}"

BDR ABOUT ME (use for the "I [something about the BDR]" part):
${bdrProfileText.substring(0, 800)}

WHAT TO REFERENCE ABOUT THE PROSPECT (use for "I saw you"):
${prospectSpecific}

PRIMARY COMMONALITY TO BUILD ON:
${bestCommonality}
${secondCommonality ? `\nSECONDARY COMMONALITY (include as "Plus we both …" if it fits naturally):\n${secondCommonality}` : ''}

RULES:
- ENTIRE message must be under 200 characters
- Specific — use real details, not generic phrases
- Do NOT mention selling, business value, or job titles in a salesy way
- Natural, warm, human tone
- Do NOT use em dashes or en dashes

Return JSON: {"message": "...", "prospectReference": "...", "bdrReference": "...", "includedSecondary": true/false}`,
            512
        );
        if (call3?.message) {
            generatedMessage = sanitizeMessageDashes(call3.message);
        }
    } catch (err) {
        addJobLog(job, `   → AMC Call 3 error: ${err.message}`, 'warning');
    }

    if (!generatedMessage) {
        addJobLog(job, `   → AMC: message generation returned empty`, 'info');
        return { message: null };
    }

    addJobLog(job, `   → AMC: message generated (${generatedMessage.length} chars)`, 'info');
    return { message: generatedMessage.substring(0, 200) };
}

// ── About Me Connect endpoint (kept for the standalone About Me Connect tab) ───

router.post('/about-me-connect-generate', requireAuth, async (req, res) => {
    const { bdrEmail, prospectLinkedInUrl, prospectProfile = {}, bdrWeStatements, bdrIStatements, bdrAiInstructions, messageFocus } = req.body;

    if (!bdrEmail)            return res.status(400).json({ success: false, error: 'bdrEmail is required' });
    if (!prospectLinkedInUrl) return res.status(400).json({ success: false, error: 'prospectLinkedInUrl is required' });

    const db  = admin.firestore();
    const log = [];
    const addLog = msg => { log.push(msg); console.log(`[AMC] ${msg}`); };

    try {
        addLog(`Loading BDR profile for ${bdrEmail}...`);
        const profileSnap = await db.collection('contact_profiles').doc(bdrEmail).get();
        if (!profileSnap.exists) {
            return res.status(404).json({ success: false, error: `No About Me profile found for ${bdrEmail}.` });
        }
        const bdrProfileData = profileSnap.data();
        const bdrProfileText = buildBdrProfileTextForAMC(bdrProfileData);
        addLog(`BDR profile loaded (${bdrProfileText.length} chars)`);

        addLog(`Fetching recent posts for ${prospectLinkedInUrl}...`);
        let recentPosts = [];
        try {
            recentPosts = await scrapeLinkedInPosts(prospectLinkedInUrl, 6);
            recentPosts = recentPosts.slice(0, 30);
            addLog(`Found ${recentPosts.length} recent posts`);
        } catch (err) {
            addLog(`Post fetch failed (non-fatal): ${err.message}`);
        }

        const postsText = recentPosts.length > 0
            ? recentPosts.map((p, i) => `Post ${i + 1} (${p.date || 'recent'}): ${String(p.text).substring(0, 400)}`).join('\n\n')
            : '(No recent posts found)';

        const prospectProfileText = buildProspectProfileTextForAMC(prospectProfile);
        addLog(`Prospect profile ready (${prospectProfileText.length} chars)`);

        // Maverick Call 1 — Find commonalities
        addLog('Maverick Call 1: Finding commonalities...');
        const call1 = await callMaverick(
            'You are an expert at finding genuine personal connections between two professionals. Return only valid JSON.',
            `Find all meaningful commonalities between this BDR and this prospect.

BDR ABOUT ME PROFILE:
${bdrProfileText}

PROSPECT LINKEDIN PROFILE:
${prospectProfileText}

PROSPECT'S RECENT LINKEDIN POSTS:
${postsText}

Look for: geographic, educational, career history, hobbies, shared passions or professional missions.
Only include commonalities genuinely present in both. Be specific.
Do NOT treat hiring activity as a commonality.

Return JSON: {"commonalities": ["commonality 1", "commonality 2", ...]}`,
            512
        );

        const commonalities = call1?.commonalities || [];
        addLog(`Found ${commonalities.length} commonalities`);

        if (commonalities.length === 0) {
            return res.json({ success: true, commonalities: [], rankedCommonality: null, secondCommonality: null, message: null,
                findings: 'No clear commonalities found between the BDR and prospect profiles.', log });
        }

        // Maverick Call 2 — Rank commonalities
        addLog('Maverick Call 2: Ranking commonalities...');
        const call2 = await callMaverick(
            'You are an expert at evaluating which personal connections make the best foundation for a LinkedIn connection request. Return only valid JSON.',
            `Rank these commonalities by how likely they are to create a genuine, memorable connection.

COMMONALITIES:
${commonalities.map((c, i) => `${i + 1}. ${c}`).join('\n')}

SCORING GUIDE:
- Same city/neighborhood: 1-2 points
- Same state/region: 2-3 points
- Same college: 4-5 points
- Worked at same company: 5-6 points
- Similar career trajectory: 4-5 points
- Shared hobby/personal interest: 6-7 points
- Shared passion/mission: 8-10 points

Return JSON:
{
  "ranked": [{"commonality": "...", "score": 0, "type": "location|education|career|hobby|passion"}],
  "best": "The single strongest commonality",
  "bestScore": 0,
  "bestType": "location|education|career|hobby|passion",
  "second": "Second best or null",
  "secondScore": 0
}`,
            512
        );

        const bestCommonality   = call2?.best || commonalities[0] || null;
        const secondCommonality = (call2?.secondScore >= 4) ? (call2?.second || null) : null;
        const bestType          = call2?.bestType || 'unknown';
        addLog(`Best (${bestType}, score ${call2?.bestScore}): ${bestCommonality}`);

        // Maverick Call 3 — Generate message
        addLog('Maverick Call 3: Generating message...');

        const prospectSpecific = (() => {
            if (recentPosts.length > 0 && recentPosts[0].text && recentPosts[0].text.length > 30)
                return `Their recent post: "${String(recentPosts[0].text).substring(0, 200)}"`;
            if (prospectProfile.about)    return `Their about section: "${String(prospectProfile.about).substring(0, 200)}"`;
            if (prospectProfile.headline) return `Their headline: "${prospectProfile.headline}"`;
            return `Their work as ${prospectProfile.currentTitle || 'a professional'} at ${prospectProfile.currentCompany || 'their organization'}`;
        })();

        const call3 = await callMaverick(
            'You write short, genuine, human LinkedIn connection messages that feel personal and never salesy. Return only valid JSON.',
            `Generate a LinkedIn connection message using EXACTLY this format:

"I saw you [short specific reference to something from their profile or posts]. I [something personal about the BDR that creates the connection]. ${secondCommonality ? 'Plus we both [second shared thing].' : ''}"

BDR ABOUT ME (use for the "I [something about the BDR]" part):
${bdrProfileText.substring(0, 800)}

WHAT TO REFERENCE ABOUT THE PROSPECT (use for "I saw you"):
${prospectSpecific}

PRIMARY COMMONALITY TO BUILD ON:
${bestCommonality}
${secondCommonality ? `\nSECONDARY COMMONALITY (include as "Plus we both …" if it fits naturally):\n${secondCommonality}` : ''}

RULES:
- ENTIRE message must be under 200 characters
- Specific — use real details, not generic phrases
- Do NOT mention selling, business value, or job titles in a salesy way
- Natural, warm, human tone
- Do NOT use em dashes or en dashes

Return JSON: {"message": "...", "prospectReference": "...", "bdrReference": "...", "includedSecondary": true/false}`,
            512
        );

        const generatedMessage   = call3?.message ? sanitizeMessageDashes(call3.message) : null;
        const freeFormMessage    = null; // kept for API compat
        addLog(`Message (${(generatedMessage || '').length} chars): "${generatedMessage}"`);

        return res.json({
            success: true,
            commonalities,
            rankedCommonalities: call2?.ranked || [],
            bestCommonality,
            bestType,
            secondCommonality,
            message:           generatedMessage,
            messageFree:       freeFormMessage,
            prospectReference: call3?.prospectReference || '',
            bdrReference:      call3?.bdrReference      || '',
            findings: [
                `Top commonality (${bestType}): ${bestCommonality}`,
                secondCommonality ? `Secondary: ${secondCommonality}` : null,
                `All commonalities found: ${commonalities.join('; ')}`
            ].filter(Boolean).join('\n'),
            postsCount: recentPosts.length,
            log
        });

    } catch (err) {
        console.error('[AMC] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message, log });
    }
});

// ── Apify helpers ───────────────────────────────────────────────────────────────

async function scrapeLinkedInProfile(liUrl) {
    if (!APIFY_TOKEN) { console.warn('[Full AI] APIFY_TOKEN not set — profile scrape skipped'); return {}; }
    try {
        const response = await axios.post(
            `${RAILWAY_BASE_URL}/api/apify/scrape-profiles`,
            { profileUrls: [liUrl] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 90000 }
        );
        const profiles = response.data?.profiles || response.data?.results || [];
        return profiles[0] || {};
    } catch (err) {
        return await scrapeLinkedInProfileDirect(liUrl);
    }
}

async function scrapeLinkedInProfileDirect(liUrl) {
    if (!APIFY_TOKEN) return {};
    try {
        const runRes = await axios.post(
            `https://api.apify.com/v2/acts/${APIFY_PROFILE_ACTOR}/runs?token=${APIFY_TOKEN}`,
            { profileUrls: [liUrl] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
        );
        const runId = runRes.data?.data?.id;
        if (!runId) return {};
        for (let i = 0; i < 30; i++) {
            await sleep(5000);
            const statusRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
            const status    = statusRes.data?.data?.status;
            if (status === 'SUCCEEDED') {
                const itemsRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`);
                return itemsRes.data?.[0] || {};
            }
            if (status === 'FAILED' || status === 'ABORTED') break;
        }
    } catch (err) { console.error('[Full AI] Apify profile scrape error:', err.message); }
    return {};
}

const HIRING_PATTERNS = [
    /\bwe'?re\s+hiring\b/i, /\bnow\s+hiring\b/i, /\bwe\s+are\s+hiring\b/i,
    /\blooking\s+to\s+hire\b/i, /\bjoin\s+our\s+team\b/i,
    /\bopen\s+(position|role|roles|positions|req|requisition)s?\b/i,
    /\bjob\s+(opening|opportunity|posting|listings?)\b/i,
    /\bcareer\s+opportunit/i, /\bapply\s+(now|today|here)\b/i,
    /#(nowhiring|wearehiring|hiring|jobopening|joinus|careers?|recruitment)\b/i,
];
function isHiringPost(text) { if (!text) return false; return HIRING_PATTERNS.some(re => re.test(text)); }

async function scrapeLinkedInPosts(liUrl, monthsBack = 3) {
    if (!APIFY_TOKEN) { console.warn('[Full AI] APIFY_TOKEN not set — posts scrape skipped'); return []; }
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
    try {
        const runRes = await axios.post(
            `https://api.apify.com/v2/acts/${APIFY_POSTS_ACTOR}/runs?token=${APIFY_TOKEN}`,
            { profileUrls: [liUrl], maxPosts: 50, fromDate: cutoffDate.toISOString().split('T')[0] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
        );
        const runId = runRes.data?.data?.id;
        if (!runId) return [];
        for (let i = 0; i < 30; i++) {
            await sleep(5000);
            const statusRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
            const status    = statusRes.data?.data?.status;
            if (status === 'SUCCEEDED') {
                const itemsRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`);
                const posts    = itemsRes.data || [];
                return posts
                    .filter(p => p.text || p.content)
                    .filter(p => !isHiringPost(p.text || p.content || ''))
                    .map(p => ({ text: p.text || p.content || '', date: p.date || p.postedAt || '' }));
            }
            if (status === 'FAILED' || status === 'ABORTED') break;
        }
    } catch (err) { console.error('[Full AI] Apify posts scrape error:', err.message); }
    return [];
}

// ── Gemini web search ───────────────────────────────────────────────────────────

async function geminiSearch(query) {
    if (!GEMINI_API_KEY) { console.warn('[Full AI] GEMINI_API_KEY not set — search skipped'); return ''; }
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: query }] }],
                tools: [{ googleSearch: {} }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        const parts = response.data?.candidates?.[0]?.content?.parts || [];
        return parts.map(p => p.text || '').join('\n').trim();
    } catch (err) {
        console.error('[Full AI] Gemini search error:', err.response?.data || err.message);
        throw err;
    }
}

// ── Llama (Groq) ────────────────────────────────────────────────────────────────

async function callLlama(prompt, mode = 'general') {
    if (!GROQ_API_KEY) {
        console.warn('[Full AI] GROQ_API_KEY not set — Llama call skipped');
        if (mode === 'fit_evaluation')     return { isFit: true, reason: 'API not configured.' };
        if (mode === 'post_evaluation')    return null;
        if (mode === 'org_size_parse')     return null;
        return [];
    }
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: LLAMA_MODEL,
                messages: [
                    {
                        role:    'system',
                        content: mode === 'post_evaluation'
                            ? 'You are a precise LinkedIn post evaluator. Return only valid JSON.'
                            : mode === 'org_size_parse'
                            ? 'You extract company size information. Return only valid JSON.'
                            : 'You write short, natural LinkedIn connection messages. Return only valid JSON.'
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: ['fit_evaluation', 'post_evaluation', 'org_size_parse'].includes(mode) ? 0.1 : 0.8,
                max_tokens:  512
            },
            {
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 30000
            }
        );
        const content = response.data?.choices?.[0]?.message?.content?.trim() || '';
        try {
            const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            return JSON.parse(cleaned);
        } catch (_) {
            const m = content.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
            if (m) { try { return JSON.parse(m[1]); } catch (_2) {} }
            console.warn(`[Full AI] Could not parse Llama response for ${mode}:`, content.substring(0, 200));
            if (mode === 'post_evaluation') return null;
            if (mode === 'org_size_parse')  return null;
            return [];
        }
    } catch (err) {
        console.error(`[Full AI] Groq/Llama error for ${mode}:`, err.response?.data || err.message);
        throw err;
    }
}

// ── Maverick (Llama 4) ──────────────────────────────────────────────────────────

async function callMaverick(systemPrompt, userPrompt, maxTokens = 1024) {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured on server');
    const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model: MAVERICK_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt   }
            ],
            temperature: 0.6,
            max_tokens: maxTokens
        },
        { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const content = response.data?.choices?.[0]?.message?.content?.trim() || '';
    try {
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        const m = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (m) { try { return JSON.parse(m[1]); } catch (_) {} }
        return { raw: content };
    }
}

// ── About Me Connect profile helpers ────────────────────────────────────────────

function buildBdrProfileTextForAMC(profileData) {
    if (!profileData || !profileData.statements) return '(No profile data available)';
    const sections = [
        { key: 'background',        label: 'Background & Upbringing' },
        { key: 'education',          label: 'Education' },
        { key: 'pastExperience',     label: 'Past Experience' },
        { key: 'industryViewpoints', label: 'Industry Viewpoints' },
        { key: 'industryConcerns',   label: 'Industry Concerns' },
        { key: 'passion',            label: 'Passions' },
        { key: 'otherInsights',      label: 'Other Insights' }
    ];
    const lines = [];
    for (const s of sections) {
        const arr = profileData.statements[s.key];
        if (Array.isArray(arr) && arr.length > 0) {
            lines.push(`${s.label}:`);
            arr.forEach(stmt => lines.push(`  - ${stmt}`));
        }
    }
    return lines.length > 0 ? lines.join('\n') : '(No statements filled in yet)';
}

function buildProspectProfileTextForAMC(profile) {
    const parts = [];
    if (profile.currentTitle)        parts.push(`Title: ${profile.currentTitle}`);
    if (profile.currentCompany)      parts.push(`Company: ${profile.currentCompany}`);
    if (profile.location)            parts.push(`Location: ${profile.location}`);
    if (profile.headline)            parts.push(`Headline: ${profile.headline}`);
    if (profile.about)               parts.push(`About: ${String(profile.about).substring(0, 800)}`);
    if (profile.experienceParagraph) parts.push(`Experience: ${String(profile.experienceParagraph).substring(0, 1000)}`);
    if (profile.educationParagraph)  parts.push(`Education: ${String(profile.educationParagraph).substring(0, 500)}`);
    return parts.length > 0 ? parts.join('\n') : '(No profile data available)';
}

// ── Result builder ──────────────────────────────────────────────────────────────

function buildResult(prospect, liUrl, name, title, company, messages, messageSource, routeReason, classification) {
    return {
        prospect: {
            linkedinUrl: liUrl,
            firstName:   prospect.firstName  || name.split(' ')[0] || '',
            lastName:    prospect.lastName   || name.split(' ').slice(1).join(' ') || '',
            title,
            company,
            organization: company
        },
        fitStatus:     'fit',
        fitReason:     routeReason || '',
        messageSource: messageSource || 'unknown',
        classification: classification || null,
        messages,
        companyNews:   '',
        contactNews:   ''
    };
}

// ── Utilities ───────────────────────────────────────────────────────────────────

function sanitizeMessageDashes(text) {
    if (!text) return text;
    return text
        .replace(/\u2014/g, ', ')
        .replace(/\u2013/g, ', ')
        .replace(/\u00e2\u20ac\u201d/g, ', ')
        .replace(/\u00e2\u20ac\u201c/g, ', ');
}

function addJobLog(job, message, type = 'info') {
    job.logs.push({ message, type, time: new Date().toISOString() });
    if (job.logs.length > 500) job.logs = job.logs.slice(-500);
}

function normalizeUrl(url) {
    if (!url) return '';
    return url.trim().toLowerCase().replace(/\/$/, '').split('?')[0].split('#')[0];
}

function isVanityUrl(url) {
    const parts = url.split('/in/');
    if (parts.length < 2) return false;
    const handle = parts[1].split('/')[0];
    return !handle.startsWith('ACoA') && !handle.startsWith('ACoB') && !/^[A-Z]/.test(handle);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── POST /full-ai-init ─────────────────────────────────────────────────────────
//
// Synchronous init call: loads BDR context + eligible prospect list and returns
// them to the client in one shot. The client then processes each prospect
// individually via /full-ai-generate-single.
//
// Supports all three batch filter types:
//   scanJobId   — import batch (contacts from a specific Apify scan job)
//   moveBatchId — move batch   (contacts moved between workspaces, tagged with moveBatchId)
//   groupBatchId— group batch  (contacts grouped via Prospect Cleanup)
//
// The skip summary in the response uses batch-aware counts so the UI shows
// how many of the *batch contacts* were skipped — not the global BDR totals —
// making it immediately obvious the filter is working.

router.post('/full-ai-init', requireAuth, async (req, res) => {
    const {
        bdrEmail,
        count                  = 10,
        scanJobId              = null,
        moveBatchId            = null,
        groupBatchId           = null,
        importBatchStartTime   = null,
        importBatchEndTime     = null,
        connectionFilterEnabled = true,
        minConnectionCount     = 250
    } = req.body;

    if (!bdrEmail) return res.status(400).json({ success: false, error: 'bdrEmail is required' });

    try {
        const db = admin.firestore();

        // ── 1. Load BDR context ──────────────────────────────────────────────────
        let bdrSalesConfig  = null;
        let bdrProfileData  = null;
        let bdrLinkedInEmail = bdrEmail;
        let bdrName         = '';

        try {
            const profileDoc = await db.collection('contact_profiles').doc(bdrEmail).get();
            if (profileDoc.exists) {
                const pd         = profileDoc.data();
                bdrSalesConfig   = pd.bdrSalesConfig  || null;
                bdrProfileData   = pd;
                bdrLinkedInEmail = pd.linkedInEmail || pd.email || bdrEmail;
                bdrName          = pd.name
                                    || (pd.firstName || pd.lastName
                                        ? `${pd.firstName || ''} ${pd.lastName || ''}`.trim()
                                        : '');
            }
        } catch (_) {}

        const bdrContext = {
            bdrLinkedInEmail,
            bdrName,
            bdrSalesConfig,
            bdrProfileData
        };

        // ── 2. Load all contacts for this BDR ───────────────────────────────────
        const contactsSnap = await db.collection('prospect_contacts')
            .where('userEmail', '==', bdrEmail)
            .get();

        // ── 3. Build exclusion sets (messaged, connected, globally excluded) ─────
        const [queueByBdr, queueByAccount, connectExclusionsSnap, prospectExclusionsSnap] = await Promise.all([
            db.collection('connect_queue').where('bdr_email',    '==', bdrEmail).get(),
            db.collection('connect_queue').where('account_email','==', bdrEmail).get(),
            db.collection('connect_exclusions').get(),
            db.collection('prospect_exclusions').get()
        ]);

        const messagedUrls = new Set();
        [queueByBdr, queueByAccount].forEach(snap =>
            snap.forEach(d => { const u = normalizeUrl(d.data().prospect_li_url || ''); if (u) messagedUrls.add(u); })
        );

        const excludedUrls = new Set();
        [connectExclusionsSnap, prospectExclusionsSnap].forEach(snap =>
            snap.forEach(d => { const u = normalizeUrl(d.data().linkedinUrl || ''); if (u) excludedUrls.add(u); })
        );

        const connectedUrls = new Set();
        try {
            let foundHeyreach = false;
            for (const field of ['accountEmail', 'bdrEmail', 'linkedInAccountEmail']) {
                try {
                    const snap = await db.collection('heyreach_contacts').where(field, '==', bdrEmail).get();
                    if (!snap.empty) {
                        snap.forEach(d => {
                            const u = normalizeUrl(d.data().linkedin_url || d.data().profileUrl ||
                                                   d.data().leadProfileUrl || d.data().linkedInUrl || '');
                            if (u) connectedUrls.add(u);
                        });
                        foundHeyreach = true;
                    }
                } catch (_) {}
            }
            if (!foundHeyreach) {
                for (const field of ['bdrEmail', 'accountEmail']) {
                    try {
                        const snap = await db.collection('heyreach_activity')
                            .where('eventType', '==', 'CONNECTION_REQUEST_ACCEPTED')
                            .where(field, '==', bdrEmail)
                            .get();
                        snap.forEach(d => {
                            const u = normalizeUrl(d.data().leadProfileUrl || '');
                            if (u) connectedUrls.add(u);
                        });
                    } catch (_) {}
                }
            }
        } catch (_) {}

        // ── 4. Apply filters ─────────────────────────────────────────────────────
        const connFilter   = connectionFilterEnabled !== false;
        const minConn      = parseInt(minConnectionCount, 10) || 250;
        const hasBatchFilter = !!(scanJobId || moveBatchId || groupBatchId);

        const allContacts = [];
        contactsSnap.forEach(d => allContacts.push({ id: d.id, ...d.data() }));

        // First pass: deduplicate and identify contacts that are in the batch
        let skippedHarvest  = 0, skippedNoUrl     = 0, skippedNonVanity = 0;
        let skippedMessaged = 0, skippedExcluded  = 0, skippedConnected = 0;
        let skippedConnCount = 0, skippedBatch    = 0;
        const seenUrls = new Set();

        // Batch membership check helpers
        const inBatch = (c) => {
            if (!hasBatchFilter) return true;
            if (scanJobId) {
                if (c.scanJobId !== scanJobId) return false;
                // Optional time-window filter for import batches
                if (importBatchStartTime || importBatchEndTime) {
                    const ts = c.uploadedAt || c.scannedAt || c.createdAt;
                    const t  = ts?.toMillis ? ts.toMillis() : (ts ? new Date(ts).getTime() : null);
                    if (t == null)                            return false;
                    if (importBatchStartTime && t < importBatchStartTime) return false;
                    if (importBatchEndTime   && t > importBatchEndTime)   return false;
                }
                return true;
            }
            if (moveBatchId  && c.moveBatchId  !== moveBatchId)  return false;
            if (groupBatchId && c.groupBatchId !== groupBatchId) return false;
            return true;
        };

        // Separate: how many contacts are in the batch before any other filter?
        let batchTotal = 0;
        let batchSkippedMessaged  = 0, batchSkippedConnected = 0;
        let batchSkippedExcluded  = 0, batchSkippedConnCount = 0;
        let batchSkippedHarvest   = 0, batchSkippedNoUrl     = 0;

        const eligible = allContacts.filter(c => {
            if (c.movedToHarvest) { skippedHarvest++; return false; }
            const url = normalizeUrl(c.linkedInUrl || c.li_url || '');
            if (!url)             { skippedNoUrl++;     return false; }
            if (!isVanityUrl(url)){ skippedNonVanity++; return false; }
            if (seenUrls.has(url)) return false; // silent dedup
            seenUrls.add(url);

            // Batch membership test (silent, tracked separately)
            const inThisBatch = inBatch(c);
            if (hasBatchFilter && !inThisBatch) { skippedBatch++; return false; }

            // Count this as a batch member for the batch-aware summary
            if (hasBatchFilter) batchTotal++;

            // Skip filters — tracked both globally and per-batch
            if (messagedUrls.has(url))  {
                skippedMessaged++;
                if (hasBatchFilter) batchSkippedMessaged++;
                return false;
            }
            if (excludedUrls.has(url))  {
                skippedExcluded++;
                if (hasBatchFilter) batchSkippedExcluded++;
                return false;
            }
            if (connectedUrls.has(url)) {
                skippedConnected++;
                if (hasBatchFilter) batchSkippedConnected++;
                return false;
            }
            if (connFilter && minConn > 0) {
                if (c.connectionCountNA === true ||
                    (c.linkedInConnectionCount != null && Number(c.linkedInConnectionCount) < minConn)) {
                    skippedConnCount++;
                    if (hasBatchFilter) batchSkippedConnCount++;
                    return false;
                }
            }

            return true;
        });

        // ── 5. Build skip summary ────────────────────────────────────────────────
        let skipSummary;
        if (hasBatchFilter) {
            // Batch-aware summary: show counts relative to the batch so it's
            // immediately clear the filter is applied and working.
            const batchDesc = scanJobId
                ? `import batch ${scanJobId}`
                : moveBatchId
                    ? `move batch ${moveBatchId}`
                    : `group batch ${groupBatchId}`;

            const batchSkipParts = [];
            if (batchSkippedMessaged)  batchSkipParts.push(`${batchSkippedMessaged} already messaged/queued`);
            if (batchSkippedConnected) batchSkipParts.push(`${batchSkippedConnected} already connected`);
            if (batchSkippedConnCount) batchSkipParts.push(`${batchSkippedConnCount} below ${minConn} connections`);
            if (batchSkippedExcluded)  batchSkipParts.push(`${batchSkippedExcluded} excluded`);

            skipSummary =
                `${allContacts.length} total BDR contacts` +
                ` | filter: ${batchDesc} → ${batchTotal} contacts in batch` +
                (batchSkipParts.length ? ` | skipped from batch: ${batchSkipParts.join(', ')}` : '') +
                ` | ${eligible.length} eligible | processing ${Math.min(eligible.length, count)}`;
        } else {
            const parts = [];
            if (skippedHarvest)   parts.push(`${skippedHarvest} in harvest pool`);
            if (skippedNoUrl)     parts.push(`${skippedNoUrl} no URL`);
            if (skippedNonVanity) parts.push(`${skippedNonVanity} non-vanity URL`);
            if (skippedMessaged)  parts.push(`${skippedMessaged} already messaged/queued`);
            if (skippedExcluded)  parts.push(`${skippedExcluded} excluded`);
            if (skippedConnected) parts.push(`${skippedConnected} already connected`);
            if (skippedConnCount) parts.push(`${skippedConnCount} below ${minConn} connections`);

            skipSummary =
                `${allContacts.length} total` +
                (parts.length ? ` | skipped: ${parts.join(', ')}` : '') +
                ` | ${eligible.length} eligible | processing ${Math.min(eligible.length, count)}`;
        }

        shuffle(eligible);
        const prospects = eligible.slice(0, count);

        return res.json({
            success: true,
            bdrContext,
            prospects,
            stats: { skipSummary, total: allContacts.length, eligible: eligible.length }
        });

    } catch (err) {
        console.error('[full-ai-init] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── Export ──────────────────────────────────────────────────────────────────────

module.exports = router;
