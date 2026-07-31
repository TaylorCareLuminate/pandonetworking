/**
 * Profile Search Route — Job Queue Pattern
 * POST /api/profile-search/process-pending
 * GET  /api/profile-search/status/:jobId
 *
 * The frontend (contact_search_by_keyword.html) writes "pending" jobs directly
 * to `connect_contact_search_log` (source: 'profile_search').  This route is
 * called by a Railway cron or the frontend polling trigger to pick up and run
 * those jobs via harvestapi/linkedin-profile-search.
 *
 * SETUP in your Railway server entry point:
 *   const profileSearchRoute = require('./routes/profile-search-route');
 *   // or, if stored at the repo root:
 *   const profileSearchRoute = require('./profile-search-route');
 *   app.use('/api/profile-search', profileSearchRoute);
 *
 * Required env vars:
 *   APIFY_API_KEY  — Apify personal API token
 */

'use strict';

const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');

const ProfileSearchJobProcessor = require('../profile_search_job_processor');

// Lazy-init the processor so Firebase Admin is already configured by the time
// this module loads.
let _processor = null;
function getProcessor() {
  if (!_processor) {
    _processor = new ProfileSearchJobProcessor({ db: admin.firestore() });
  }
  return _processor;
}

// ── POST /process-pending ─────────────────────────────────────────────────────
//
// Picks up all pending `profile_search` jobs and processes them sequentially.
// Can be hit by a Railway cron every 1–5 minutes, or triggered by the frontend
// immediately after submitting a job.
//
// Response: { success: true, processed: number, results: Array }
//
router.post('/process-pending', async (req, res) => {
  console.log('📬 POST /api/profile-search/process-pending');
  try {
    const results = await getProcessor().processPendingJobs();
    res.json({ success: true, processed: results.length, results });
  } catch (err) {
    console.error('❌ process-pending error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /process-job ─────────────────────────────────────────────────────────
//
// Process a single job by ID (useful for immediate processing after submission).
//
// Body: { jobId: string }
// Response: { success: true, results: Object }
//
router.post('/process-job', async (req, res) => {
  const { jobId } = req.body || {};
  if (!jobId) {
    return res.status(400).json({ success: false, error: 'Missing jobId in request body' });
  }
  console.log(`📬 POST /api/profile-search/process-job  jobId=${jobId}`);
  try {
    const result = await getProcessor().processJob(jobId);
    res.json({ success: true, result });
  } catch (err) {
    console.error(`❌ process-job ${jobId} error:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /status/:jobId ────────────────────────────────────────────────────────
//
// Returns the current status of a profile search job from Firestore.
// The frontend can call this instead of (or in addition to) a real-time listener.
//
// Response: { success: true, job: Object }
//
router.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const snap = await admin.firestore()
      .collection('connect_contact_search_log')
      .doc(jobId)
      .get();

    if (!snap.exists) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, job: { id: snap.id, ...snap.data() } });
  } catch (err) {
    console.error(`❌ status/${jobId} error:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
