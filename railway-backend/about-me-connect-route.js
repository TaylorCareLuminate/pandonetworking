/**
 * About Me Connect Route
 * POST /api/connect/about-me-connect-generate
 *
 * Generates a personalized LinkedIn connection message by:
 *   1. Loading the BDR's "About Me" profile statements from Firestore
 *   2. Fetching the prospect's last 30 LinkedIn posts via Apify
 *   3. Llama Maverick Call 1: Find commonalities between BDR and prospect
 *   4. Llama Maverick Call 2: Rank commonalities by connection potential
 *   5. Llama Maverick Call 3: Generate a personalized message following the specified format
 *
 * INTEGRATION:
 *   In server.js:
 *     const aboutMeConnectRoute = require('./routes/about-me-connect-route');
 *     app.use('/api/connect', aboutMeConnectRoute);
 *
 * Required environment variables:
 *   GROQ_API_KEY      — Groq API key (for Llama 4 Maverick)
 *   APIFY_TOKEN       — Apify token (for post scraping)
 *   APIFY_POSTS_ACTOR — Default: apify~linkedin-post-search
 */

'use strict';

const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const axios   = require('axios');

// ── Config ─────────────────────────────────────────────────────────────────────

const GROQ_API_KEY      = process.env.GROQ_API_KEY;
const APIFY_TOKEN       = process.env.APIFY_TOKEN;
const APIFY_POSTS_ACTOR = process.env.APIFY_POSTS_ACTOR || 'apify~linkedin-post-search';

// Llama 4 Maverick via Groq
const MAVERICK_MODEL = process.env.MAVERICK_MODEL || 'meta-llama/llama-4-maverick-17b-128e-instruct-fp8';

// ── Auth middleware ─────────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No auth token provided' });
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid auth token: ' + err.message });
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Hiring-post filter ────────────────────────────────────────────────────────
// Returns true if a post is primarily about job openings / recruiting.
// We skip these so the AI never references them — referencing a hiring post
// makes the outreach sound like the sender wants a job.

const HIRING_PATTERNS = [
    /\bwe'?re\s+hiring\b/i,
    /\bnow\s+hiring\b/i,
    /\bwe\s+are\s+hiring\b/i,
    /\blooking\s+to\s+hire\b/i,
    /\bjoin\s+our\s+team\b/i,
    /\bopen\s+(position|role|roles|positions|req|requisition)s?\b/i,
    /\bjob\s+(opening|opportunity|posting|listings?)\b/i,
    /\bcareer\s+opportunit/i,
    /\bapply\s+(now|today|here)\b/i,
    /#(nowhiring|wearehiring|hiring|jobopening|joinus|careers?|recruitment)\b/i,
];

function isHiringPost(text) {
    if (!text) return false;
    return HIRING_PATTERNS.some(re => re.test(text));
}

/**
 * Fetch the last N LinkedIn posts for a profile URL via Apify.
 * Returns array of { text, date } objects.
 */
async function fetchRecentPosts(liUrl, maxPosts = 30) {
    if (!APIFY_TOKEN) {
        console.warn('[About Me Connect] APIFY_TOKEN not set — post scraping skipped');
        return [];
    }

    try {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 6); // Last 6 months

        const runRes = await axios.post(
            `https://api.apify.com/v2/acts/${APIFY_POSTS_ACTOR}/runs?token=${APIFY_TOKEN}`,
            {
                profileUrls: [liUrl],
                maxPosts,
                fromDate: cutoffDate.toISOString().split('T')[0]
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
        );

        const runId = runRes.data?.data?.id;
        if (!runId) return [];

        // Poll for completion (max 30 checks × 5s = 2.5 minutes)
        for (let i = 0; i < 30; i++) {
            await sleep(5000);
            const statusRes = await axios.get(
                `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
            );
            const status = statusRes.data?.data?.status;
            if (status === 'SUCCEEDED') {
                const itemsRes = await axios.get(
                    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
                );
                const posts = itemsRes.data || [];
                return posts
                    .filter(p => p.text || p.content)
                    .filter(p => !isHiringPost(p.text || p.content || ''))
                    .slice(0, maxPosts)
                    .map(p => ({
                        text: (p.text || p.content || '').substring(0, 500),
                        date: p.date || p.postedAt || ''
                    }));
            }
            if (status === 'FAILED' || status === 'ABORTED') break;
        }
    } catch (err) {
        console.error('[About Me Connect] Apify posts scrape error:', err.message);
    }
    return [];
}

/**
 * Call Llama 4 Maverick via Groq with a custom prompt.
 * Returns the raw text response.
 */
async function callMaverick(systemPrompt, userPrompt, maxTokens = 1024) {
    if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY not configured on server');
    }

    const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model: MAVERICK_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.6,
            max_tokens: maxTokens
        },
        {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim() || '';

    // Try to parse JSON, stripping markdown code fences if present
    try {
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        // Try to extract JSON object/array from the response
        const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[1]); } catch (e2) { /* fall through */ }
        }
        // Return raw text wrapped in an object as fallback
        return { raw: content };
    }
}

/**
 * Serialize BDR About Me profile statements into a text block for the LLM.
 */
function buildBdrProfileText(profileData) {
    if (!profileData || !profileData.statements) return '(No profile data available)';

    const sections = [
        { key: 'background',         label: 'Background & Upbringing' },
        { key: 'education',           label: 'Education' },
        { key: 'pastExperience',      label: 'Past Experience' },
        { key: 'industryViewpoints',  label: 'Industry Viewpoints' },
        { key: 'industryConcerns',    label: 'Industry Concerns' },
        { key: 'passion',             label: 'Passions' },
        { key: 'otherInsights',       label: 'Other Insights' }
    ];

    const lines = [];
    for (const section of sections) {
        const statements = profileData.statements[section.key];
        if (Array.isArray(statements) && statements.length > 0) {
            lines.push(`${section.label}:`);
            statements.forEach(s => lines.push(`  - ${s}`));
        }
    }

    return lines.length > 0 ? lines.join('\n') : '(No statements filled in yet)';
}

/**
 * Serialize prospect profile into a text block for the LLM.
 */
function buildProspectProfileText(profile) {
    const parts = [];
    if (profile.currentTitle)          parts.push(`Title: ${profile.currentTitle}`);
    if (profile.currentCompany)        parts.push(`Company: ${profile.currentCompany}`);
    if (profile.location)              parts.push(`Location: ${profile.location}`);
    if (profile.headline)              parts.push(`Headline: ${profile.headline}`);
    if (profile.about)                 parts.push(`About: ${profile.about.substring(0, 800)}`);
    if (profile.experienceParagraph)   parts.push(`Experience: ${profile.experienceParagraph.substring(0, 1000)}`);
    if (profile.educationParagraph)    parts.push(`Education: ${profile.educationParagraph.substring(0, 500)}`);
    return parts.length > 0 ? parts.join('\n') : '(No profile data available)';
}

// ── Sanitize em/en dashes from AI output ──────────────────────────────────────
function sanitizeMessageDashes(text) {
    if (!text) return text;
    return text
        .replace(/\u2014/g, ', ')        // em dash —
        .replace(/\u2013/g, ', ')        // en dash –
        .replace(/\u00e2\u20ac\u201d/g, ', ')  // corrupted em dash (UTF-8 E2 80 94 read as Win-1252)
        .replace(/\u00e2\u20ac\u201c/g, ', '); // corrupted en dash (UTF-8 E2 80 93 read as Win-1252)
}

// ── POST /about-me-connect-generate ────────────────────────────────────────────

router.post('/about-me-connect-generate', requireAuth, async (req, res) => {
    const { bdrEmail, prospectLinkedInUrl, prospectProfile = {} } = req.body;

    if (!bdrEmail) {
        return res.status(400).json({ success: false, error: 'bdrEmail is required' });
    }
    if (!prospectLinkedInUrl) {
        return res.status(400).json({ success: false, error: 'prospectLinkedInUrl is required' });
    }

    const db = admin.firestore();
    const log = [];
    const addLog = (msg) => { log.push(msg); console.log(`[About Me Connect] ${msg}`); };

    try {
        // ── Step 1: Load BDR About Me profile from Firestore ─────────────────

        addLog(`Loading BDR profile for ${bdrEmail}...`);
        const profileSnap = await db.collection('contact_profiles').doc(bdrEmail).get();

        if (!profileSnap.exists) {
            return res.status(404).json({
                success: false,
                error: `No About Me profile found for ${bdrEmail}. Please complete the About Me profile first.`
            });
        }

        const bdrProfileData = profileSnap.data();
        const bdrProfileText = buildBdrProfileText(bdrProfileData);
        addLog(`BDR profile loaded (${bdrProfileText.length} chars)`);

        // ── Step 2: Fetch prospect's recent posts from Apify ─────────────────

        addLog(`Fetching recent posts for ${prospectLinkedInUrl}...`);
        let recentPosts = [];
        try {
            recentPosts = await fetchRecentPosts(prospectLinkedInUrl, 30);
            addLog(`Found ${recentPosts.length} recent posts`);
        } catch (err) {
            addLog(`Post fetch failed (non-fatal): ${err.message}`);
        }

        // Build posts text
        const postsText = recentPosts.length > 0
            ? recentPosts.map((p, i) => `Post ${i + 1} (${p.date || 'recent'}): ${p.text}`).join('\n\n')
            : '(No recent posts found)';

        // ── Step 3: Build prospect profile text ──────────────────────────────

        const prospectProfileText = buildProspectProfileText(prospectProfile);
        addLog(`Prospect profile ready (${prospectProfileText.length} chars)`);

        // ── Maverick Call 1: Find Commonalities ──────────────────────────────

        addLog('Maverick Call 1: Finding commonalities...');
        const commonalitiesResult = await callMaverick(
            'You are an expert at finding genuine personal connections between two professionals. Return only valid JSON.',
            `Find all meaningful commonalities between this BDR and this prospect.

BDR ABOUT ME PROFILE:
${bdrProfileText}

PROSPECT LINKEDIN PROFILE:
${prospectProfileText}

PROSPECT'S RECENT LINKEDIN POSTS:
${postsText}

Look for these types of commonalities:
- Geographic (same city, same state, same region)
- Educational (same college, similar educational background)
- Career history (worked at same company, similar industry experience, same type of role)
- Hobbies or personal interests (mentioned in posts or profile)
- Shared passions or professional missions (healthcare focus, technology views, etc.)
- Family or life experience similarities

List each commonality clearly and specifically. Only include ones that are genuinely present in both profiles.
Do NOT treat hiring activity, recruiting posts, or job openings as a meaningful commonality.

Return JSON: {"commonalities": ["commonality 1", "commonality 2", ...]}`,
            512
        );

        const commonalities = commonalitiesResult?.commonalities || [];
        addLog(`Found ${commonalities.length} commonalities`);

        if (commonalities.length === 0) {
            // Return with a basic message even if no commonalities found
            return res.json({
                success: true,
                commonalities: [],
                rankedCommonality: null,
                secondaryCommonality: null,
                message: null,
                findings: 'No clear commonalities found between the BDR and prospect profiles.',
                log
            });
        }

        // ── Maverick Call 2: Rank Commonalities ──────────────────────────────

        addLog('Maverick Call 2: Ranking commonalities...');
        const rankingResult = await callMaverick(
            'You are an expert at evaluating which personal connections make the best foundation for a LinkedIn connection request. Return only valid JSON.',
            `Rank these commonalities between two professionals by how likely they are to create a genuine, memorable connection.

COMMONALITIES FOUND:
${commonalities.map((c, i) => `${i + 1}. ${c}`).join('\n')}

RANKING CRITERIA (higher = better for connection):
- Same city or neighborhood: 1-2 points (very common, not memorable)
- Same state or region: 2-3 points (low value)
- Same college or university: 4-5 points (meaningful, shared experience)
- Worked at the same company or organization: 5-6 points (strong shared context)
- Similar career trajectory or type of role: 4-5 points
- Shared hobby or personal interest (sports, music, travel, etc.): 6-7 points (personal, memorable)
- Shared passion, mission, or professional focus (e.g., healthcare equity, AI in medicine): 8-10 points (most powerful)

Return JSON:
{
  "ranked": [{"commonality": "...", "score": 0, "type": "location|education|career|hobby|passion"}],
  "best": "The single strongest commonality to lead with",
  "bestScore": 0,
  "bestType": "location|education|career|hobby|passion",
  "second": "The second best commonality to optionally include, or null if not worth including",
  "secondScore": 0
}`,
            512
        );

        const bestCommonality = rankingResult?.best || (commonalities[0] || null);
        const secondCommonality = rankingResult?.second || null;
        const bestType = rankingResult?.bestType || 'unknown';
        addLog(`Best commonality (${bestType}): ${bestCommonality}`);
        if (secondCommonality) addLog(`Second commonality: ${secondCommonality}`);

        // ── Maverick Call 3: Generate Message ────────────────────────────────

        addLog('Maverick Call 3: Generating message...');

        const prospectFirstName = prospectProfile.firstName || '';
        const bdrStatements = bdrProfileText.substring(0, 800); // Trim for context window

        // Pick a specific thing from the prospect to reference
        const prospectSpecific = (() => {
            // Prefer a recent post topic (skip hiring posts), then about section, then title/company
            const firstNonHiringPost = recentPosts.find(p => p.text && p.text.length > 30 && !isHiringPost(p.text));
            if (firstNonHiringPost) {
                return `They recently posted about: "${firstNonHiringPost.text.substring(0, 200)}"`;
            }
            if (prospectProfile.about) return `Their about section: "${prospectProfile.about.substring(0, 200)}"`;
            if (prospectProfile.headline) return `Their headline: "${prospectProfile.headline}"`;
            return `Their work as ${prospectProfile.currentTitle || 'a professional'} at ${prospectProfile.currentCompany || 'their organization'}`;
        })();

        const messageResult = await callMaverick(
            'You write short, genuine, human LinkedIn connection messages that feel personal and never salesy. Return only valid JSON.',
            `Generate a LinkedIn connection message using this exact format:

FORMAT:
"I saw you [short specific reference to something from their profile or recent posts]. I [something personal about the BDR that connects]. [ONLY IF there is a strong second commonality: "Plus we both [second thing in common]."]"

BDR'S ABOUT ME (use this to write the "I [something about the BDR]" part):
${bdrStatements}

PROSPECT REFERENCE (use this for the "I saw you" part):
${prospectSpecific}

PRIMARY COMMONALITY TO BUILD ON:
${bestCommonality}
${secondCommonality && rankingResult?.secondScore >= 4 ? `\nSECONDARY COMMONALITY (include if it fits naturally under 200 chars):\n${secondCommonality}` : ''}

RULES:
- The ENTIRE message must be under 200 characters total
- Be specific — use real details from the profiles, not generic phrases
- Do NOT mention selling or business value
- Do NOT say "I'd love to connect" (use the specified closing instead)
- Natural, warm, human tone
- Do NOT reference hiring posts, job openings, or recruiting content - it makes the sender sound like a job seeker
- Do NOT use em dashes or en dashes - use "and" or a comma instead

Return JSON:
{
  "message": "the complete message under 200 chars",
  "prospectReference": "what specific thing you referenced about the prospect",
  "bdrReference": "what personal thing you shared about the BDR",
  "includedSecondary": true or false
}`,
            512
        );

        const generatedMessage = messageResult?.message ? sanitizeMessageDashes(messageResult.message) : null;
        addLog(`Message generated (${(generatedMessage || '').length} chars): "${generatedMessage}"`);

        // ── Return Results ────────────────────────────────────────────────────

        return res.json({
            success: true,
            commonalities,
            rankedCommonalities: rankingResult?.ranked || [],
            bestCommonality,
            bestType,
            secondCommonality: (rankingResult?.secondScore >= 4) ? secondCommonality : null,
            message: generatedMessage,
            prospectReference: messageResult?.prospectReference || '',
            bdrReference: messageResult?.bdrReference || '',
            findings: [
                `Top commonality (${bestType}): ${bestCommonality}`,
                secondCommonality && rankingResult?.secondScore >= 4 ? `Secondary: ${secondCommonality}` : null,
                `All commonalities found: ${commonalities.join('; ')}`
            ].filter(Boolean).join('\n'),
            postsCount: recentPosts.length,
            log
        });

    } catch (err) {
        console.error('[About Me Connect] Error:', err.message);
        return res.status(500).json({
            success: false,
            error: err.message,
            log
        });
    }
});

module.exports = router;
