/**
 * Conference Contact Info Scan Route
 * POST /api/conference/scan-contact-info
 *
 * Used by the "AI-Scan Missing Info" feature on conference_scheduling.html
 * (and the per-contact scan button on its Meeting Requests report).
 *
 * The client already runs a fast deterministic regex pass over the LinkedIn
 * conversation transcript for a contact (see connect/conference-scheduling.js
 * → scanContactInfo()) and only calls this endpoint for whichever of
 * email/phone regex could NOT find — e.g. "reach me at my work email,
 * first initial last name at the company domain" or a phone number spelled
 * out in words. Gemini is asked to extract (not invent) contact info from
 * that free-text conversation.
 *
 * INTEGRATION:
 *   In server.js:
 *     const conferenceContactScanRoute = require('./routes/conference-contact-scan-route');
 *     app.use('/api/conference', conferenceContactScanRoute);
 *
 * Required environment variable:
 *   GEMINI_API_KEY  — Google Gemini API key (already used by ai-review-route.js)
 */

'use strict';

const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const axios   = require('axios');

// ── Config ─────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

// ── Auth middleware ─────────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'No auth token provided' });
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid auth token: ' + err.message });
    }
}

// ── POST /scan-contact-info ─────────────────────────────────────────────────────

router.post('/scan-contact-info', requireAuth, async (req, res) => {
    const { text } = req.body || {};

    if (!text || !String(text).trim()) {
        return res.json({ success: true, email: '', phone: '' });
    }

    if (!GEMINI_API_KEY) {
        return res.status(503).json({
            success: false,
            error: 'GEMINI_API_KEY is not configured on the server. Set it as a Railway environment variable.'
        });
    }

    try {
        const result = await extractContactInfo(String(text).slice(0, 8000));
        return res.json({ success: true, email: result.email || '', phone: result.phone || '' });
    } catch (err) {
        console.error('[Conference Scan] Error extracting contact info:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── Gemini: extract email / phone from free text ──────────────────────────────

async function extractContactInfo(conversationText) {
    const prompt = `You are extracting contact information from a LinkedIn message conversation between a BDR (sales rep) and a prospect.

Read the conversation below and find, if present, the PROSPECT's (not the BDR's) email address and/or phone number. Prospects sometimes share these informally, e.g. "you can reach me at jane dot doe at acmehealth dot com" or "my cell is five five five, one two three, four five six seven".

Rules:
- Only extract information that is ACTUALLY present in the text — never invent, guess, or infer a plausible-looking email/phone that isn't explicitly stated.
- Normalize spelled-out emails/phones into standard format (e.g. "jane dot doe at acme dot com" → "jane.doe@acme.com").
- If nothing is present, return empty strings.

Conversation:
"""
${conversationText}
"""

Respond with ONLY valid JSON — no explanation outside the JSON:
{"email": "", "phone": ""}`;

    const text = await callGemini(prompt);
    return extractJson(text) || { email: '', phone: '' };
}

async function callGemini(prompt) {
    const body = {
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 256 }
    };

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        body,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const candidates = response.data?.candidates || [];
    const parts = candidates[0]?.content?.parts || [];
    return parts.map(p => p.text || '').join('\n').trim();
}

function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
        try { return JSON.parse(match[0]); } catch (_) { /* fall through */ }
    }
    return null;
}

// ── Export ─────────────────────────────────────────────────────────────────────

module.exports = router;
