/**
 * Outreach Grouper Route
 * POST /api/connect/outreach-grouper
 *
 * Uses Llama (via Groq) to classify outreach contacts into user-defined groups
 * based on their title, organization, and message content.
 *
 * Request body:
 *   { contacts: [{id, name, title, organization, messagePreview, linkedInUrl}],
 *     groupingRules: string }
 *
 * Response:
 *   { success: true, groups: { [groupName]: contact[] }, counts: {}, total: number }
 *
 * INTEGRATION — add to server.js:
 *   const outreachGrouperRoute = require('./routes/outreach-grouper-route');
 *   app.use('/api/connect', outreachGrouperRoute);
 *
 * Required env var: GROQ_API_KEY
 */

'use strict';

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

// ── Config ──────────────────────────────────────────────────────────────────

const GROQ_API_KEY  = process.env.GROQ_API_KEY;
const LLAMA_MODEL   = process.env.LLAMA_MODEL || 'llama-3.3-70b-versatile';
const BATCH_SIZE    = 30; // contacts per Llama call

// ── POST /outreach-grouper ───────────────────────────────────────────────────

router.post('/outreach-grouper', async (req, res) => {
    const { contacts, groupingRules } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'contacts array is required and must be non-empty' });
    }
    if (!groupingRules || typeof groupingRules !== 'string' || !groupingRules.trim()) {
        return res.status(400).json({ error: 'groupingRules string is required' });
    }
    if (!GROQ_API_KEY) {
        return res.status(503).json({ error: 'GROQ_API_KEY is not configured on this server' });
    }

    console.log(`[Outreach Grouper] Received ${contacts.length} contacts to classify`);

    try {
        const groups   = {}; // groupName → contact[]
        const totalBatches = Math.ceil(contacts.length / BATCH_SIZE);

        for (let b = 0; b < totalBatches; b++) {
            const batchStart = b * BATCH_SIZE;
            const batch      = contacts.slice(batchStart, batchStart + BATCH_SIZE);

            console.log(`[Outreach Grouper] Batch ${b + 1}/${totalBatches}: classifying ${batch.length} contacts`);

            const assignments = await classifyBatch(batch, groupingRules.trim());

            // assignments is [{idx: 0, group: "Nursing"}, ...] — idx is relative to this batch
            assignments.forEach(({ idx, group }) => {
                const contact = batch[idx];
                if (!contact) return; // safety
                const groupName = (group || 'Other').trim();
                if (!groups[groupName]) groups[groupName] = [];
                groups[groupName].push(contact);
            });

            // Any contacts that weren't assigned (parse failure etc.) go to "Other"
            const assignedIndices = new Set(assignments.map(a => a.idx));
            batch.forEach((contact, i) => {
                if (!assignedIndices.has(i)) {
                    if (!groups['Other']) groups['Other'] = [];
                    groups['Other'].push(contact);
                }
            });
        }

        // Build counts
        const counts = {};
        Object.keys(groups).forEach(g => { counts[g] = groups[g].length; });

        console.log(`[Outreach Grouper] Done. Groups: ${JSON.stringify(counts)}`);

        return res.json({
            success: true,
            groups,
            counts,
            total: contacts.length
        });

    } catch (err) {
        console.error('[Outreach Grouper] Fatal error:', err.message);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ── Helper: classify one batch via Llama ────────────────────────────────────

async function classifyBatch(batch, groupingRules) {
    // Build a compact numbered list of contacts for the prompt
    const contactLines = batch.map((c, i) => {
        const parts = [];
        if (c.title)         parts.push(`Title: ${c.title}`);
        if (c.organization)  parts.push(`Org: ${c.organization}`);
        if (c.messagePreview) parts.push(`Msg: ${c.messagePreview.substring(0, 110)}`);
        return `[${i}] ${parts.length ? parts.join(' | ') : 'No data'}`;
    }).join('\n');

    const prompt =
`You are a contact segmentation engine. Classify each contact below into exactly one group based on the user's rules.

GROUPING RULES:
${groupingRules}

CONTACTS:
${contactLines}

INSTRUCTIONS:
- Assign every contact to exactly one group.
- Use the exact group name from the rules (e.g. "Nursing", "Finance & Ops", "Other").
- If a contact does not match any rule, assign it to the "Other" group (or the catch-all the rules specify).
- Return ONLY a valid JSON array. No explanation, no markdown, just raw JSON.

FORMAT: [{"idx": 0, "group": "Nursing"}, {"idx": 1, "group": "Other"}, ...]

JSON:`;

    let content = '';
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model:       LLAMA_MODEL,
                messages: [
                    {
                        role:    'system',
                        content: 'You are a precise contact classification engine. You always return valid JSON arrays and nothing else.'
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens:  batch.length * 25 + 100
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type':  'application/json'
                },
                timeout: 45000
            }
        );

        content = response.data?.choices?.[0]?.message?.content?.trim() || '';
    } catch (apiErr) {
        console.error('[Outreach Grouper] Groq API error:', apiErr.response?.data || apiErr.message);
        // On API failure, assign entire batch to "Other"
        return batch.map((_, i) => ({ idx: i, group: 'Other' }));
    }

    // Parse the JSON response
    try {
        const cleaned = content
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
        throw new Error('Not an array');
    } catch {
        // Try to extract array from the response text
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
            try {
                const parsed = JSON.parse(match[0]);
                if (Array.isArray(parsed)) return parsed;
            } catch {/* fall through */}
        }
        // Last resort: assign batch to "Other"
        console.warn('[Outreach Grouper] Could not parse Llama response — assigning batch to Other. Raw:', content.substring(0, 300));
        return batch.map((_, i) => ({ idx: i, group: 'Other' }));
    }
}

module.exports = router;
