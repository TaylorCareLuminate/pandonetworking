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

// ── POST /parse-availability ────────────────────────────────────────────────────
//
// Turns a pasted blob of free text ("I'm free Tuesday 9-11:30 and 2 to 4, all
// day Wednesday except lunch…") into structured open-meeting windows that
// conference-scheduling.js → parseAvailabilityText() feeds into the normal
// "Save & Generate Slots" flow.
//
// Body: { text, conferenceName?, startDate?, endDate?, today?,
//         calendar?: [{ date: 'YYYY-MM-DD', weekday: 'Tuesday' }] }
// Resp: { success, windows: [{ date, startTime, endTime }], warnings: [string] }

router.post('/parse-availability', requireAuth, async (req, res) => {
    const { text, conferenceName, startDate, endDate, today, calendar } = req.body || {};

    if (!text || !String(text).trim()) {
        return res.json({ success: true, windows: [], warnings: ['No text provided.'] });
    }
    if (!GEMINI_API_KEY) {
        return res.status(503).json({
            success: false,
            error: 'GEMINI_API_KEY is not configured on the server. Set it as a Railway environment variable.'
        });
    }

    try {
        const result = await extractAvailabilityWindows({
            text: String(text).slice(0, 12000),
            conferenceName: String(conferenceName || ''),
            startDate: String(startDate || ''),
            endDate: String(endDate || ''),
            today: String(today || ''),
            calendar: Array.isArray(calendar) ? calendar.slice(0, 31) : []
        });
        return res.json({
            success: true,
            windows: Array.isArray(result.windows) ? result.windows : [],
            warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : []
        });
    } catch (err) {
        console.error('[Conference Scan] Error parsing availability:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

async function extractAvailabilityWindows({ text, conferenceName, startDate, endDate, today, calendar }) {
    const calendarLines = calendar
        .filter(c => c && c.date)
        .map(c => `- ${c.date} (${c.weekday || ''})`)
        .join('\n');

    const prompt = `You convert a business development rep's free-text description of when they are available to take meetings at a conference into structured OPEN MEETING WINDOWS.

Conference: ${conferenceName || '(unnamed)'}
Conference dates: ${startDate || '?'} to ${endDate || startDate || '?'}
Today's date: ${today || '?'}
${calendarLines ? `Conference calendar (use this to resolve weekday names and "Day 1 / Day 2" to real dates):\n${calendarLines}` : ''}

Rules:
- Output a window for each continuous block of time the person is FREE to meet. Times are the conference's local time, exactly as the person wrote them — do not convert time zones.
- Convert every time to 24-hour "HH:MM". If am/pm is missing, assume normal business hours (e.g. "9-11" = 09:00-11:00, "2-4" = 14:00-16:00, "1-5" = 13:00-17:00).
- Resolve weekdays ("Tuesday"), relative days ("Day 1", "the first day", "tomorrow") and written dates ("Oct 14", "10/14") to a "YYYY-MM-DD" date. Prefer dates on the conference calendar above. If a date has no year, use the conference's year.
- "All day" with no hours given means 09:00-17:00. "Mornings" = 09:00-12:00. "Afternoons" = 13:00-17:00. "Lunch" is not a meeting time.
- When the person lists times they are UNAVAILABLE or BUSY ("free all day Wednesday except 12-1", "booked 3-4"), subtract those from the free time and output the remaining free blocks as separate windows.
- If the same days/times apply to several days ("every day 9-11", "Tuesday and Wednesday 2-4"), output one window per day.
- Windows must have endTime later than startTime and must not span midnight.
- Only use information actually present in the text. NEVER invent availability. If something is ambiguous or can't be resolved to a date/time, leave it out and add a short note to "warnings" explaining what was skipped.

Availability text:
"""
${text}
"""

Respond with ONLY valid JSON — no markdown, no explanation outside the JSON:
{"windows": [{"date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM"}], "warnings": []}`;

    const raw = await callGemini(prompt, 2048);
    return extractJson(raw) || { windows: [], warnings: ['The AI response could not be understood.'] };
}

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

async function callGemini(prompt, maxOutputTokens = 256) {
    const body = {
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens }
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
