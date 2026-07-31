/**
 * AI Review Route for Connect Queue
 * POST /api/connect-queue/ai-review
 *
 * Before messages are pushed to HeyReach, this endpoint:
 *   1. Fetches all connect_queue items with reviewStatus === 'approved'
 *   2. Runs a grammar/spelling check via Gemini (no search grounding)
 *   3. Runs a factual accuracy check via Gemini with Google Search grounding
 *   4. Updates flagged items in Firestore: reviewStatus → 'mistake_queue'
 *   5. Returns a summary of what passed / was flagged
 *
 * Items that came from mistake_queue (skip_ai_review === true) are passed through untouched.
 *
 * INTEGRATION:
 *   In server.js:
 *     const aiReviewRoute = require('./routes/ai-review-route');
 *     app.use('/api/connect-queue', aiReviewRoute);
 *
 * Required environment variable:
 *   GEMINI_API_KEY  — Google Gemini API key (already used by full-ai-generate-route)
 */

'use strict';

const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const axios   = require('axios');

// ── Config ─────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

// ── POST /ai-review ────────────────────────────────────────────────────────────

router.post('/ai-review', async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(503).json({
            success: false,
            message: 'GEMINI_API_KEY is not configured on the server. Set it as a Railway environment variable.',
            skipped: true
        });
    }

    try {
        const db = admin.firestore();

        // ── 1. Fetch all approved queue items ──────────────────────────────────
        console.log('[AI Review] Fetching approved queue items...');
        const snapshot = await db.collection('connect_queue')
            .where('reviewStatus', '==', 'approved')
            .limit(200)
            .get();

        const items = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Skip deleted, already pushed, or items bypassing review
            if (!data.deleted && !data.pushed_to_heyreach && !data.skip_ai_review) {
                items.push({ id: doc.id, ...data });
            }
        });

        console.log(`[AI Review] Found ${items.length} items to review.`);

        if (items.length === 0) {
            return res.json({
                success: true,
                reviewed: 0,
                passed: 0,
                failed: 0,
                flaggedItems: [],
                message: 'No approved items to review.'
            });
        }

        // ── 2. Review each item ────────────────────────────────────────────────
        const flaggedItems = [];
        let passedCount = 0;

        for (const item of items) {
            const messageText  = item.message_to_contact || item.messageText || item.message || '';
            const contactName  = [item.contact_first_name, item.contact_last_name].filter(Boolean).join(' ') || item.contactName || 'Unknown';
            const companyName  = item.company_name || item.contactCompany || '';
            const isConnect    = (item.message_type || 'message') === 'connect';

            // Connect requests with no message content pass automatically
            if (!messageText.trim()) {
                passedCount++;
                continue;
            }

            const issues = [];

            // ── 2a. Grammar / spelling check ──────────────────────────────────
            try {
                const grammarResult = await checkGrammar(messageText);
                if (grammarResult.hasErrors && Array.isArray(grammarResult.errors) && grammarResult.errors.length > 0) {
                    grammarResult.errors.forEach(e => issues.push({ type: 'grammar', description: e }));
                }
            } catch (err) {
                console.warn(`[AI Review] Grammar check failed for item ${item.id}:`, err.message);
            }

            // ── 2b. Factual accuracy check (search-grounded) ──────────────────
            try {
                const factResult = await checkFacts(messageText, contactName, companyName);
                if (factResult.hasConcerns && Array.isArray(factResult.concerns) && factResult.concerns.length > 0) {
                    factResult.concerns.forEach(c => issues.push({ type: 'factual', description: c }));
                }
            } catch (err) {
                console.warn(`[AI Review] Fact check failed for item ${item.id}:`, err.message);
            }

            // ── 2c. Save result ────────────────────────────────────────────────
            if (issues.length > 0) {
                // Move to mistake_queue in Firestore
                try {
                    await db.collection('connect_queue').doc(item.id).update({
                        reviewStatus:    'mistake_queue',
                        aiReviewIssues:  issues,
                        aiReviewedAt:    new Date().toISOString(),
                        aiReviewedBy:    'railway-ai-review'
                    });
                } catch (fsErr) {
                    console.error(`[AI Review] Failed to update item ${item.id} in Firestore:`, fsErr.message);
                }

                flaggedItems.push({
                    id:          item.id,
                    contactName,
                    companyName,
                    messageType: isConnect ? 'connect' : 'message',
                    bdrName:     item.bdrName || '',
                    issues
                });

                console.log(`[AI Review] Flagged: ${contactName} @ ${companyName} — ${issues.length} issue(s)`);
            } else {
                passedCount++;
            }
        }

        const summary = {
            success:      true,
            reviewed:     items.length,
            passed:       passedCount,
            failed:       flaggedItems.length,
            flaggedItems
        };

        console.log(`[AI Review] Complete — ${passedCount} passed, ${flaggedItems.length} flagged.`);
        return res.json(summary);

    } catch (err) {
        console.error('[AI Review] Unexpected error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ── Gemini: grammar / spelling check ──────────────────────────────────────────

async function checkGrammar(messageText) {
    const prompt = `You are a grammar and spelling checker for short LinkedIn outreach messages.

Review the following message for ACTUAL errors only.

DO NOT flag any of these (they are intentional style choices):
- Words in ALL CAPS used for emphasis (e.g. "LOVE", "AMAZING", "YES")
- Very short sentences used for impact (e.g. "Impressive.", "Exactly.", "Right.")
- Casual, informal, or conversational phrasing
- Missing Oxford commas
- Starting a sentence with "And" or "But"
- Sentence fragments used deliberately for tone

ONLY flag genuine mistakes such as:
- Clearly misspelled words
- Wrong verb tense/agreement that makes a sentence ungrammatical
- Repeated words (e.g. "the the")
- Missing or extra letters that change meaning (e.g. "form" vs "from")

Message:
"""
${messageText}
"""

Respond with ONLY valid JSON — no explanation outside the JSON:
{"hasErrors": false, "errors": []}

or if errors found:
{"hasErrors": true, "errors": ["Description of error 1", "Description of error 2"]}`;

    const text = await callGemini(prompt, false);
    return extractJson(text) || { hasErrors: false, errors: [] };
}

// ── Gemini: factual accuracy check (search-grounded) ─────────────────────────

async function checkFacts(messageText, contactName, companyName) {
    const prompt = `You are a fact-checker for LinkedIn outreach messages sent to business prospects.

The following message was sent to ${contactName || 'a prospect'} who works at ${companyName || 'a company'}.

Use your search capability to check if any factual claims in the message are significantly wrong, outdated, or misleading.

Focus ONLY on significant factual problems such as:
- The company does not do what the message claims
- A statistic or fact mentioned is clearly incorrect
- A news item referenced is inaccurate or about the wrong company
- The industry or business description is wrong

Do NOT flag:
- Compliments or subjective opinions ("great company", "impressive work")
- Vague statements that cannot be verified
- Minor differences in how a company describes itself
- Anything that is merely uncertain

Company: ${companyName || 'Unknown'}
Recipient: ${contactName || 'Unknown'}

Message:
"""
${messageText}
"""

Respond with ONLY valid JSON — no explanation outside the JSON:
{"hasConcerns": false, "concerns": []}

or if significant factual concerns found:
{"hasConcerns": true, "concerns": ["Description of concern 1"]}`;

    const text = await callGemini(prompt, true);
    return extractJson(text) || { hasConcerns: false, concerns: [] };
}

// ── Gemini API call ───────────────────────────────────────────────────────────

async function callGemini(prompt, useSearch = false) {
    const body = {
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
    };

    if (useSearch) {
        body.tools = [{ googleSearch: {} }];
    }

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        body,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const candidates = response.data?.candidates || [];
    const parts = candidates[0]?.content?.parts || [];
    return parts.map(p => p.text || '').join('\n').trim();
}

// ── JSON extractor ────────────────────────────────────────────────────────────

function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
        try { return JSON.parse(match[0]); } catch (_) { /* fall through */ }
    }
    return null;
}

// ── Export ─────────────────────────────────────────────────────────────────────

module.exports = router;
