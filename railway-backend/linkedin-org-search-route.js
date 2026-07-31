/**
 * LinkedIn Org Search Route — Job Queue Pattern
 * POST /api/org-search/submit-and-save
 *
 * Instead of making the browser wait for Apify to finish, this endpoint:
 *   1. Creates a job in `connect_org_search_log` with status "pending"
 *   2. Responds to the browser immediately with the jobId
 *   3. Runs Apify asynchronously (server-side — no browser timeout risk)
 *   4. Saves results directly to `prospect_organizations` in Firebase
 *   5. Updates the job document with status/progress so the browser can poll
 *
 * The browser polls Firebase (`connect_org_search_log/{jobId}`) every 5s
 * to show progress and auto-refresh the org table on completion.
 *
 * SETUP in your Railway server.js:
 *   const orgSearchRoute = require('./routes/linkedin-org-search-route');
 *   app.use('/api/org-search', orgSearchRoute);
 *
 * Required env vars (already present on Railway):
 *   RAILWAY_BASE_URL  — e.g. https://railwayclemail-production.up.railway.app
 *   (Apify token is used internally by the existing /api/apify/linkedin-company-search endpoint)
 */

'use strict';

const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const axios   = require('axios');

const RAILWAY_BASE_URL = process.env.RAILWAY_BASE_URL || 'https://railwayclemail-production.up.railway.app';

// ── POST /submit-and-save ──────────────────────────────────────────────────────
//
// Body: {
//   bdrEmail:    string   — BDR or workspace identifier
//   submittedBy: string   — logged-in user's email
//   criteria: {
//     companySize:  string[]  — e.g. ["51-200","201-500"]
//     industryIds:  string[]  — LinkedIn industry ID strings (empty = all)
//     locations:    string[]  — state/city/country names (can be 51 for all-states)
//     maxItems:     number    — max results per Apify run
//     scraperMode:  string    — "full" | "minimal"
//     takePages:    number    — Apify pages to scan
//     startPage:    number    — Apify start page
//   }
// }
//
// Response: { success: true, jobId: string }  (sent immediately, before Apify runs)

router.post('/submit-and-save', async (req, res) => {
    const { bdrEmail, criteria, submittedBy } = req.body || {};

    if (!bdrEmail || !criteria) {
        return res.status(400).json({ success: false, error: 'Missing required fields: bdrEmail and criteria' });
    }

    const db = admin.firestore();

    const locations = Array.isArray(criteria.locations) && criteria.locations.length > 0
        ? criteria.locations
        : [];

    const jobData = {
        status:      'pending',
        type:        'org_search',
        submittedBy: submittedBy || 'unknown',
        submittedAt: new Date().toISOString(),
        bdrEmail,
        criteria,
        results: {
            companies_found:   0,
            companies_saved:   0,
            companies_skipped: 0,
        },
        locationsTotal:     locations.length || 1,
        locationsProcessed: 0,
    };

    let jobRef;
    try {
        jobRef = await db.collection('connect_org_search_log').add(jobData);
    } catch (dbErr) {
        console.error('[OrgSearch] Failed to create job document:', dbErr);
        return res.status(500).json({ success: false, error: 'Failed to create job: ' + dbErr.message });
    }

    const jobId = jobRef.id;
    console.log(`[OrgSearch] Job ${jobId} created for ${bdrEmail} — ${locations.length || 1} location(s)`);

    // Respond immediately so the browser isn't blocked
    res.json({ success: true, jobId });

    // Process asynchronously after the HTTP response is sent
    setImmediate(() => {
        processOrgSearchJob(jobId, db, criteria, bdrEmail, submittedBy).catch(err => {
            console.error(`[OrgSearch] Job ${jobId} unhandled error:`, err);
            jobRef.update({
                status:    'failed',
                error:     err.message,
                failedAt:  new Date().toISOString(),
            }).catch(() => {});
        });
    });
});

// ── Core async processor ───────────────────────────────────────────────────────

async function processOrgSearchJob(jobId, db, criteria, bdrEmail, submittedBy) {
    const jobRef = db.collection('connect_org_search_log').doc(jobId);

    await jobRef.update({ status: 'processing', startedAt: new Date().toISOString() });

    const { locations = [], ...baseCriteria } = criteria;

    // If locations is empty, run one scan with no location filter
    const locationsToProcess = locations.length > 0 ? locations : [null];
    const totalLocations = locationsToProcess.length;

    let totalFound = 0, totalSaved = 0, totalSkipped = 0;

    for (let i = 0; i < locationsToProcess.length; i++) {
        const location = locationsToProcess[i];

        try {
            const scanCriteria = location
                ? { ...baseCriteria, locations: [location] }
                : baseCriteria;

            console.log(`[OrgSearch] Job ${jobId} — scanning location ${i + 1}/${totalLocations}: ${location || '(all)'}`);

            // Reuse the existing Railway endpoint which already handles Apify auth/formatting
            const resp = await axios.post(
                `${RAILWAY_BASE_URL}/api/apify/linkedin-company-search`,
                scanCriteria,
                { timeout: 600_000 } // 10-minute server-side timeout per location
            );

            if (!resp.data || !resp.data.success) {
                console.warn(`[OrgSearch] Job ${jobId} — location "${location}" returned no success`, resp.data?.error);
                continue;
            }

            const items = resp.data.items || [];
            totalFound += items.length;

            const { saved, skipped } = await saveOrgItems(db, items, bdrEmail, submittedBy);
            totalSaved   += saved;
            totalSkipped += skipped;

            // Update progress in Firebase so the browser can show it
            await jobRef.update({
                locationsProcessed:          i + 1,
                currentLocation:             location || '(all)',
                'results.companies_found':   totalFound,
                'results.companies_saved':   totalSaved,
                'results.companies_skipped': totalSkipped,
                lastUpdated:                 new Date().toISOString(),
            });

        } catch (locErr) {
            console.warn(`[OrgSearch] Job ${jobId} — error for location "${location}":`, locErr.message);
            // Continue to next location rather than failing the whole job
        }
    }

    await jobRef.update({
        status:       'completed',
        completedAt:  new Date().toISOString(),
        lastUpdated:  new Date().toISOString(),
        'results.companies_found':   totalFound,
        'results.companies_saved':   totalSaved,
        'results.companies_skipped': totalSkipped,
    });

    console.log(`[OrgSearch] Job ${jobId} COMPLETED — found: ${totalFound}, saved: ${totalSaved}, skipped: ${totalSkipped}`);
}

// ── Save items to prospect_organizations ──────────────────────────────────────

async function saveOrgItems(db, items, bdrEmail, submittedBy) {
    const orgsRef = db.collection('prospect_organizations');
    let saved = 0, skipped = 0;

    for (const item of items) {
        const name = (item.name || '').trim();
        if (!name) continue;

        // Duplicate check
        const existing = await orgsRef
            .where('bdrEmail', '==', bdrEmail)
            .where('company_name', '==', name)
            .limit(1)
            .get();

        if (!existing.empty) { skipped++; continue; }

        const hq       = (item.locations || []).find(l => l.headquarter) || item.locations?.[0] || {};
        const industry = item.industries?.[0]?.title || item.industries?.[0]?.name || '';
        const sizeRange = item.employeeCountRange
            ? `${item.employeeCountRange.start ?? ''}–${item.employeeCountRange.end ?? ''}`
            : (item.employeeCount ? String(item.employeeCount) : '');

        await orgsRef.add({
            bdrEmail,
            company_name:           name,
            company_domain:         item.website          || null,
            company_industry:       industry               || null,
            company_staff_count:    item.employeeCount     || null,
            company_size_range:     sizeRange              || null,
            company_street_address: hq.line1              || null,
            company_city:           hq.city               || null,
            company_state:          hq.geographicArea     || null,
            company_zip:            hq.postalCode         || null,
            company_description:    item.description      || null,
            company_linkedin_url:   item.linkedinUrl      || null,
            scanned:                false,
            scan_count:             0,
            last_scanned_at:        null,
            created_at:             new Date().toISOString(),
            created_by:             submittedBy || 'unknown',
            source:                 'apify_linkedin_company_search',
        });
        saved++;
    }

    return { saved, skipped };
}

module.exports = router;
