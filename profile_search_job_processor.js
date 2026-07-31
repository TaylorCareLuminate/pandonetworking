/**
 * Profile Search Job Processor
 *
 * Processes LinkedIn Profile Search jobs submitted from contact_search_by_keyword.html.
 * Uses Apify actor: harvestapi/linkedin-profile-search
 *
 * Key behaviours:
 *  - Reads the full `apifyInput` object stored by the frontend and passes it straight
 *    to the actor (seniorityLevelIds, functionIds, companyHeadcount, locations, etc.)
 *  - Runs Apify in configurable batches to avoid timeouts
 *  - Updates the job document with live progress after every batch
 *  - Saves / upserts contacts to `prospect_contacts` (deduplicates by linkedInUrlNormalized)
 */

const fetch = require('node-fetch');

const PAGES_PER_BATCH    = 20;   // pages per Apify run (25 results/page → 500 per batch)
const CONTACTS_PER_BATCH = 500;  // max items per Apify run

class ProfileSearchJobProcessor {
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
    this.db = firebaseService.db;
    this.LOG_COLLECTION = 'connect_contact_search_log';
    this.APIFY_API_KEY  = process.env.APIFY_API_KEY;
    this.APIFY_BASE_URL = 'https://api.apify.com/v2';
    this.ACTOR_ID       = 'harvestapi~linkedin-profile-search';

    if (!this.APIFY_API_KEY) {
      console.warn('⚠️ APIFY_API_KEY not set — profile search features will not work');
    }
    console.log('✅ Profile Search Job Processor initialized');
  }

  // ── Public: process a single job ────────────────────────────────────────────

  async processJob(jobId) {
    console.log(`\n🚀 Processing profile search job: ${jobId}`);

    const jobRef = this.db.collection(this.LOG_COLLECTION).doc(jobId);

    try {
      const jobDoc = await jobRef.get();
      if (!jobDoc.exists) throw new Error('Job not found');

      const jobData = jobDoc.data();
      jobData.id = jobId;

      if (jobData.source !== 'profile_search') {
        throw new Error(`Invalid job source: ${jobData.source}. Expected 'profile_search'`);
      }

      // The frontend stores the full actor input under `apifyInput`
      const apifyInput = jobData.apifyInput || {};

      const maxItemsTotal = Number(apifyInput.maxItems) || 0;  // 0 = unlimited
      let   startPage     = Number(apifyInput.startPage) || 1;
      let   totalSaved    = 0;
      let   batchNum      = 0;
      let   lastMaxPage   = startPage - 1;

      console.log(`📋 Job: seniority=[${(apifyInput.seniorityLevelIds||[]).join(',')}] functions=[${(apifyInput.functionIds||[]).join(',')}] locations=[${(apifyInput.locations||[]).join(', ')}] maxItems=${maxItemsTotal||'unlimited'} startPage=${startPage}`);

      await jobRef.update({
        status:    'running',
        startedAt: new Date().toISOString()
      });

      // ── Batch loop ──────────────────────────────────────────────────────────
      while (true) {
        batchNum++;

        // Check for cancellation between batches
        const freshSnap = await jobRef.get();
        if (['cancelled', 'paused'].includes(freshSnap.data()?.status)) {
          console.log(`⏹ Job ${jobId} cancelled/paused after batch ${batchNum - 1}`);
          break;
        }

        // Determine per-batch maxItems
        let batchMaxItems = CONTACTS_PER_BATCH;
        if (maxItemsTotal > 0) {
          const remaining = maxItemsTotal - totalSaved;
          if (remaining <= 0) {
            console.log('   🎯 Global maxItems reached before batch start');
            break;
          }
          batchMaxItems = Math.min(CONTACTS_PER_BATCH, remaining);
        }

        await jobRef.update({
          status:   'running',
          currentBatch: batchNum,
          currentPage: startPage,
          'results.contacts_saved': totalSaved,
          progress: { currentPage: startPage, batchNum }
        });

        console.log(`\n📦 Batch ${batchNum}: pages ${startPage}–${startPage + PAGES_PER_BATCH - 1}, maxItems=${batchMaxItems}`);

        let profiles, maxPageReached;
        try {
          ({ profiles, maxPageReached } = await this.callApifyActor(apifyInput, startPage, batchMaxItems));
        } catch (apifyErr) {
          console.error(`❌ Batch ${batchNum} Apify error: ${apifyErr.message}`);
          await jobRef.update({
            status:   'failed',
            errorMessage: `Batch ${batchNum} failed: ${apifyErr.message}`,
            failedAt: new Date().toISOString(),
            'results.contacts_saved': totalSaved,
            lastBatchNum:    batchNum,
            lastPageReached: lastMaxPage
          });
          return { success: false, jobId, error: apifyErr.message };
        }

        if (profiles.length === 0) {
          console.log(`   ℹ️ Batch ${batchNum} returned 0 profiles — end of results`);
          break;
        }

        lastMaxPage = maxPageReached;
        const batchSaved = await this.saveContacts(profiles, jobData);
        totalSaved += batchSaved;

        console.log(`   ✅ Batch ${batchNum} done: +${batchSaved} contacts (total ${totalSaved}), maxPage=${maxPageReached}`);

        // Stop: fewer profiles than requested → no more data
        if (profiles.length < batchMaxItems) {
          console.log(`   ℹ️ Received ${profiles.length} < ${batchMaxItems} → no more data`);
          break;
        }
        // Stop: total maxItems reached
        if (maxItemsTotal > 0 && totalSaved >= maxItemsTotal) {
          console.log(`   🎯 Global target of ${maxItemsTotal} contacts reached`);
          break;
        }

        startPage = maxPageReached + 1;
      }

      // ── Complete ────────────────────────────────────────────────────────────
      await jobRef.update({
        status:      'completed',
        completedAt: new Date().toISOString(),
        totalBatches: batchNum,
        lastPageReached: lastMaxPage,
        'results.contacts_saved': totalSaved
      });

      console.log(`\n✅ JOB COMPLETE — ${totalSaved} contacts, ${batchNum} batch(es), last page ${lastMaxPage}`);
      return { success: true, jobId, results: { contacts_saved: totalSaved, batches: batchNum } };

    } catch (error) {
      console.error(`❌ Job ${jobId} failed:`, error);
      try {
        await jobRef.update({
          status:   'failed',
          errorMessage: error.message,
          failedAt: new Date().toISOString()
        });
      } catch (_) {}
      throw error;
    }
  }

  // ── Public: process all pending jobs ────────────────────────────────────────

  async processPendingJobs() {
    console.log('\n🔄 Checking for pending profile search jobs...');
    try {
      const snapshot = await this.db.collection(this.LOG_COLLECTION)
        .where('status', '==', 'pending')
        .where('source', '==', 'profile_search')
        .limit(5)
        .get();

      if (snapshot.empty) { console.log('   No pending profile search jobs'); return []; }
      console.log(`   Found ${snapshot.size} pending job(s)`);

      const results = [];
      for (const doc of snapshot.docs) {
        try { results.push(await this.processJob(doc.id)); }
        catch (err) {
          console.error(`   Failed job ${doc.id}:`, err.message);
          results.push({ success: false, jobId: doc.id, error: err.message });
        }
      }
      return results;
    } catch (error) {
      console.error('Error processing pending profile search jobs:', error);
      throw error;
    }
  }

  // ── Private: call Apify actor for one batch ─────────────────────────────────

  /**
   * Calls harvestapi/linkedin-profile-search with the user-supplied apifyInput,
   * overriding startPage / takePages / maxItems for batching.
   *
   * Returns { profiles: Array, maxPageReached: number }
   */
  async callApifyActor(apifyInput, startPage, maxItems) {
    if (!this.APIFY_API_KEY) throw new Error('APIFY_API_KEY not set');

    // Build Apify input — pass all user-supplied filters, override pagination params
    const inputBody = {
      // ── Filters supplied by the user ──────────────────────────────────────
      ...(apifyInput.seniorityLevelIds?.length  && { seniorityLevelIds:  apifyInput.seniorityLevelIds  }),
      ...(apifyInput.functionIds?.length        && { functionIds:        apifyInput.functionIds        }),
      ...(apifyInput.companyHeadcount?.length   && { companyHeadcount:   apifyInput.companyHeadcount   }),
      ...(apifyInput.locations?.length          && { locations:          apifyInput.locations           }),
      ...(apifyInput.locations?.length          && { companyHeadquarterLocations: apifyInput.locations }),
      ...(apifyInput.currentJobTitles?.length   && { currentJobTitles:   apifyInput.currentJobTitles   }),
      ...(apifyInput.pastJobTitles?.length      && { pastJobTitles:      apifyInput.pastJobTitles      }),
      ...(apifyInput.industries?.length         && { industries:         apifyInput.industries         }),
      recentlyChangedJobs:      apifyInput.recentlyChangedJobs      || false,
      recentlyPostedOnLinkedIn: apifyInput.recentlyPostedOnLinkedIn || false,
      autoQuerySegmentation:    apifyInput.autoQuerySegmentation    || false,
      // ── Scraper mode ──────────────────────────────────────────────────────
      profileScraperMode: apifyInput.profileScraperMode || 'Full',
      // ── Pagination (controlled by batch logic) ────────────────────────────
      startPage,
      takePages: PAGES_PER_BATCH,
      maxItems
    };

    console.log(`   📡 Apify input: ${JSON.stringify(inputBody)}`);

    // Start run
    const startRes = await fetch(
      `${this.APIFY_BASE_URL}/acts/${this.ACTOR_ID}/runs?token=${this.APIFY_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.APIFY_API_KEY}` },
        body:    JSON.stringify(inputBody)
      }
    );
    if (!startRes.ok) {
      const t = await startRes.text();
      throw new Error(`Apify start failed (${startRes.status}): ${t.substring(0, 300)}`);
    }
    const startData = await startRes.json();
    const runId     = startData.data.id;
    let   datasetId = startData.data.defaultDatasetId;
    console.log(`   ✅ Run started: ${runId}`);

    // Poll (max 30 min per batch)
    const deadline  = Date.now() + 30 * 60 * 1000;
    const terminal  = ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'];
    let   status    = 'RUNNING';
    let   pollCount = 0;

    while (!terminal.includes(status) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, pollCount < 12 ? 5000 : 10000));
      pollCount++;
      try {
        const r = await fetch(
          `${this.APIFY_BASE_URL}/actor-runs/${runId}?token=${this.APIFY_API_KEY}`,
          { headers: { 'Authorization': `Bearer ${this.APIFY_API_KEY}` } }
        );
        if (!r.ok) { console.warn(`   ⚠️ Poll ${pollCount} HTTP ${r.status}`); continue; }
        const d = await r.json();
        status = d.data.status;
        if (!datasetId && d.data.defaultDatasetId) datasetId = d.data.defaultDatasetId;
        if (pollCount % 6 === 0 || !['RUNNING', 'READY'].includes(status)) {
          console.log(`   ⏳ ${status} | items: ${d.data.stats?.itemCount || 0} | poll: ${pollCount}`);
        }
      } catch (e) { console.warn(`   ⚠️ Poll error: ${e.message}`); }
    }

    if (!terminal.includes(status)) throw new Error('Apify batch timed out (30 min)');
    if (status !== 'SUCCEEDED')     throw new Error(`Apify run ended with status: ${status}`);
    if (!datasetId)                 throw new Error('No dataset ID after run completed');

    // Fetch results
    const itemsRes = await fetch(
      `${this.APIFY_BASE_URL}/datasets/${datasetId}/items?token=${this.APIFY_API_KEY}&clean=true&format=json`,
      { headers: { 'Authorization': `Bearer ${this.APIFY_API_KEY}` } }
    );
    if (!itemsRes.ok) {
      const t = await itemsRes.text();
      throw new Error(`Failed to fetch dataset (${itemsRes.status}): ${t.substring(0, 300)}`);
    }
    const profiles = await itemsRes.json();
    console.log(`   ✅ ${profiles.length} profiles retrieved`);

    // Determine max page number in this batch
    let maxPageReached = startPage;
    for (const p of profiles) {
      const pn = p?._meta?.pagination?.pageNumber;
      if (typeof pn === 'number' && pn > maxPageReached) maxPageReached = pn;
    }

    return { profiles, maxPageReached };
  }

  // ── Private: upsert contacts ─────────────────────────────────────────────────

  async saveContacts(profiles, jobData) {
    const allNormalizedUrls = profiles
      .map(p => this.normalizeLinkedInUrl(p.linkedinUrl || ''))
      .filter(Boolean);

    const existingMap = await this.fetchExistingContacts(allNormalizedUrls);

    let batch      = this.db.batch();
    let batchCnt   = 0;
    let totalSaved = 0;
    const seen     = new Set();

    for (const profile of profiles) {
      const linkedInUrl = profile.linkedinUrl || '';
      if (!linkedInUrl) continue;

      const normalizedUrl = this.normalizeLinkedInUrl(linkedInUrl);
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);

      const firstName = profile.firstName || (profile.name || '').split(' ')[0]              || '';
      const lastName  = profile.lastName  || (profile.name || '').split(' ').slice(1).join(' ') || '';
      const fullName  = profile.name      || `${firstName} ${lastName}`.trim();

      let locationString = '';
      if (profile.location) {
        if      (typeof profile.location === 'string') locationString = profile.location;
        else if (profile.location.linkedinText)        locationString = profile.location.linkedinText;
        else if (profile.location.parsed?.text)        locationString = profile.location.parsed.text;
      }

      const experienceRaw = profile.experience || profile.currentPosition || [];
      const educationRaw  = profile.education  || profile.profileTopEducation || [];

      // Current company from experience
      const currentCompany = profile.currentPosition?.[0]?.companyName
        || experienceRaw.find(e => e?.endDate?.text === 'Present')?.companyName
        || '';

      const apifyInput = jobData.apifyInput || {};

      const prospectData = {
        firstName, lastName, fullName, name: fullName,
        linkedInUrl, linkedInUrlNormalized: normalizedUrl,
        publicIdentifier: profile.publicIdentifier || '',
        linkedinId:       profile.id || profile.objectUrn || '',
        title:    profile.headline || profile.position || '',
        headline: profile.headline || '',
        position: profile.headline || '',
        location: locationString,
        locationRaw: profile.location || null,
        about:      profile.about || '',
        experience: experienceRaw.length > 0 ? JSON.stringify(experienceRaw) : '',
        education:  educationRaw.length  > 0 ? JSON.stringify(educationRaw)  : '',
        company: currentCompany,
        // Connection / follower counts (matches generate_messages.html cache key)
        linkedInConnectionCount:  profile.connectionsCount || 0,
        followerCount:            profile.followerCount    || 0,
        connectionCountFetchedAt: new Date().toISOString(),
        premium:    profile.premium    || false,
        verified:   profile.verified   || false,
        openToWork: profile.openToWork || false,
        hiring:     profile.hiring     || false,
        // Ownership / BDR assignment
        userEmail:            jobData.bdrEmail,
        bdrEmail:             jobData.bdrEmail,
        linkedInAccountEmail: jobData.bdrEmail,
        customerId:        jobData.customerId        || 'unknown',
        linkedInAccountId: jobData.linkedInAccountId || 'unknown',
        accountName:       jobData.accountName       || 'Profile Search',
        userId:       jobData.submittedBy || '',
        uploadedBy:   jobData.submittedBy || '',
        // Source metadata
        category:         'Profile Search',
        connectionStatus: 'not_connected',
        source:           'profile_search',
        sourceJobId:      jobData.id || '',
        sessionLabel:     jobData.sessionLabel || '',
        searchFilters: {
          seniorityLevelIds:  apifyInput.seniorityLevelIds  || [],
          functionIds:        apifyInput.functionIds        || [],
          companyHeadcount:   apifyInput.companyHeadcount   || [],
          locations:          apifyInput.locations          || [],
          currentJobTitles:   apifyInput.currentJobTitles   || [],
          profileScraperMode: apifyInput.profileScraperMode || 'Full'
        },
        lastUpdatedAt: new Date().toISOString(),
        // Workspace / snapshot assignment (if present)
        ...(jobData.workspaceId && { workspaceId: jobData.workspaceId }),
        ...(jobData.snapshotId  && { snapshotId:  jobData.snapshotId  }),
      };

      const existingRef = existingMap.get(normalizedUrl);
      if (existingRef) {
        batch.set(existingRef, prospectData, { merge: true });
      } else {
        prospectData.uploadedAt = new Date().toISOString();
        prospectData.createdAt  = new Date().toISOString();
        batch.set(this.db.collection('prospect_contacts').doc(), prospectData);
      }

      batchCnt++;
      totalSaved++;

      if (batchCnt >= 499) {
        await batch.commit();
        batch    = this.db.batch();
        batchCnt = 0;
      }
    }

    if (batchCnt > 0) await batch.commit();
    return totalSaved;
  }

  // ── Private: fetch existing contacts by normalized URL ───────────────────────

  async fetchExistingContacts(normalizedUrls) {
    const map = new Map();
    if (!normalizedUrls.length) return map;

    // Firestore `in` queries are limited to 30 items; chunk them
    const chunks = [];
    for (let i = 0; i < normalizedUrls.length; i += 30) {
      chunks.push(normalizedUrls.slice(i, i + 30));
    }

    for (const chunk of chunks) {
      const snap = await this.db.collection('prospect_contacts')
        .where('linkedInUrlNormalized', 'in', chunk)
        .get();
      for (const doc of snap.docs) {
        map.set(doc.data().linkedInUrlNormalized, doc.ref);
      }
    }
    return map;
  }

  // ── Private: normalise a LinkedIn profile URL ────────────────────────────────

  normalizeLinkedInUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
      const inIdx = parts.indexOf('in');
      if (inIdx >= 0 && parts[inIdx + 1]) {
        return `https://www.linkedin.com/in/${parts[inIdx + 1].toLowerCase()}`;
      }
    } catch (_) {}
    return url.toLowerCase().replace(/\/$/, '');
  }
}

module.exports = ProfileSearchJobProcessor;
