/**
 * Keyword Search Job Processor
 *
 * Processes LinkedIn keyword search jobs submitted from the frontend.
 * Uses Apify actor: harvestapi/linkedin-profile-search-by-services
 *
 * Key behaviours:
 *  - Runs Apify in batches of 500 contacts (20 pages × 25) to avoid timeouts
 *  - Loops through batches automatically until: target reached, end of data, or cancelled
 *  - Updates job document with live progress after every batch
 *  - Passes `locations` array correctly to Apify
 *  - Tracks actual page numbers returned (_meta/pagination/pageNumber)
 *  - Saves per-keyword pagination state so the frontend can resume
 *  - Saves linkedInConnectionCount (matches generate_messages.html caching)
 *  - Deduplicates by linkedInUrlNormalized (update existing, create otherwise)
 */

const fetch = require('node-fetch');

const CONTACTS_PER_BATCH = 500;  // contacts per Apify run
const PAGES_PER_BATCH    = 20;   // at 25 contacts/page

class KeywordSearchJobProcessor {
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
    this.db = firebaseService.db;
    this.LOG_COLLECTION = 'connect_contact_search_log';
    this.APIFY_API_KEY = process.env.APIFY_API_KEY;
    this.APIFY_BASE_URL = 'https://api.apify.com/v2';
    this.ACTOR_ID = 'harvestapi~linkedin-profile-search-by-services';

    if (!this.APIFY_API_KEY) {
      console.warn('⚠️ APIFY_API_KEY not set — keyword search features will not work');
    }
    console.log('✅ Keyword Search Job Processor initialized');
  }

  // ── Public: process a single job ──────────────────────────────────────────

  async processJob(jobId) {
    console.log(`\n🚀 Processing keyword search job: ${jobId}`);

    const jobRef = this.db.collection(this.LOG_COLLECTION).doc(jobId);

    try {
      const jobDoc = await jobRef.get();
      if (!jobDoc.exists) throw new Error('Job not found');

      const jobData = jobDoc.data();
      jobData.id = jobId;

      if (jobData.source !== 'keyword_search') {
        throw new Error(`Invalid job source: ${jobData.source}. Expected 'keyword_search'`);
      }

      const keyword   = jobData.searchKeyword  || '';
      const locations = jobData.searchConfig?.locations || [];
      // targetContacts = 0 means "run until Apify has no more results"
      const targetContacts = Number(jobData.searchConfig?.targetContacts) || 0;

      let currentPage  = Number(jobData.searchConfig?.startPage) || 1;
      let totalSaved   = 0;
      let batchNum     = 0;
      let lastMaxPage  = currentPage - 1;

      console.log(`📋 Job: keyword="${keyword}" locations=[${locations.join(', ')}] target=${targetContacts || 'unlimited'} startPage=${currentPage}`);

      await jobRef.update({
        status:    'running',
        startedAt: new Date().toISOString()
      });

      // ── Batch loop ────────────────────────────────────────────────────────
      while (true) {
        batchNum++;

        // Check for cancellation between batches
        const freshSnap = await jobRef.get();
        if (['cancelled', 'paused'].includes(freshSnap.data()?.status)) {
          console.log(`⏹ Job ${jobId} cancelled/paused after batch ${batchNum - 1}`);
          break;
        }

        // Update live progress
        await jobRef.update({
          status:               'running',
          currentBatch:         batchNum,
          currentPage,
          'results.contacts_saved': totalSaved
        });

        console.log(`\n📦 Batch ${batchNum}: pages ${currentPage}–${currentPage + PAGES_PER_BATCH - 1}`);

        // Build per-batch search config
        const batchConfig = {
          search:             keyword,
          locations,
          profileScraperMode: jobData.searchConfig?.profileScraperMode || 'Full',
          startPage:          currentPage,
          takePages:          PAGES_PER_BATCH,
          maxItems:           CONTACTS_PER_BATCH
        };

        let profiles, maxPageReached;
        try {
          ({ profiles, maxPageReached } = await this.callApifyActor(batchConfig));
        } catch (apifyErr) {
          console.error(`❌ Batch ${batchNum} Apify error: ${apifyErr.message}`);
          await jobRef.update({
            status:    'failed',
            error:     `Batch ${batchNum} failed: ${apifyErr.message}`,
            failedAt:  new Date().toISOString(),
            'results.contacts_saved': totalSaved,
            lastBatchNum: batchNum,
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

        // Update per-keyword pagination state after every batch
        await this.updatePaginationState(jobData, totalSaved, maxPageReached);

        // ── Stop conditions ────────────────────────────────────────────────
        // 1. Fewer results than we asked for → end of Apify data
        if (profiles.length < CONTACTS_PER_BATCH) {
          console.log(`   ℹ️ Received ${profiles.length} < ${CONTACTS_PER_BATCH} → no more data`);
          break;
        }
        // 2. Target reached
        if (targetContacts > 0 && totalSaved >= targetContacts) {
          console.log(`   🎯 Target of ${targetContacts} contacts reached`);
          break;
        }

        // Advance to next batch
        currentPage = maxPageReached + 1;
      }

      // ── Complete ──────────────────────────────────────────────────────────
      await jobRef.update({
        status:      'completed',
        completedAt: new Date().toISOString(),
        totalBatches: batchNum,
        lastPageReached: lastMaxPage,
        'results.contacts_saved': totalSaved
      });

      await this.updatePaginationState(jobData, totalSaved, lastMaxPage);

      console.log(`\n✅ JOB COMPLETE — ${totalSaved} contacts, ${batchNum} batch(es), last page ${lastMaxPage}`);
      return { success: true, jobId, results: { contacts_saved: totalSaved, batches: batchNum } };

    } catch (error) {
      console.error(`❌ Job ${jobId} failed:`, error);
      try {
        await jobRef.update({
          status:   'failed',
          error:    error.message,
          failedAt: new Date().toISOString()
        });
      } catch (_) {}
      throw error;
    }
  }

  // ── Public: process all pending jobs ──────────────────────────────────────

  async processPendingJobs() {
    console.log('\n🔄 Checking for pending keyword search jobs...');
    try {
      const snapshot = await this.db.collection(this.LOG_COLLECTION)
        .where('status', '==', 'pending')
        .where('source', '==', 'keyword_search')
        .limit(5)
        .get();

      if (snapshot.empty) { console.log('   No pending jobs'); return []; }
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
      console.error('Error processing pending jobs:', error);
      throw error;
    }
  }

  // ── Private: single Apify call (one batch) ─────────────────────────────────

  /**
   * Returns { profiles: Array, maxPageReached: number }
   */
  async callApifyActor(searchConfig) {
    if (!this.APIFY_API_KEY) throw new Error('APIFY_API_KEY not set');

    // Build Apify input
    const inputBody = {
      maxItems:           searchConfig.maxItems           || CONTACTS_PER_BATCH,
      profileScraperMode: searchConfig.profileScraperMode || 'Full',
      search:             searchConfig.search,
      takePages:          searchConfig.takePages          || PAGES_PER_BATCH,
      startPage:          searchConfig.startPage          || 1
    };

    // locations is an array of strings confirmed by actor schema
    const rawLocs = searchConfig.locations;
    if (Array.isArray(rawLocs) && rawLocs.length > 0) {
      const cleaned = rawLocs.map(l => String(l).trim()).filter(Boolean);
      if (cleaned.length > 0) {
        inputBody.locations = cleaned;
        console.log(`   📍 Locations: [${cleaned.join(', ')}]`);
      }
    }

    console.log(`   📡 Apify input: ${JSON.stringify(inputBody)}`);

    // Start run
    const startRes = await fetch(
      `${this.APIFY_BASE_URL}/acts/${this.ACTOR_ID}/runs?token=${this.APIFY_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.APIFY_API_KEY}` },
        body: JSON.stringify(inputBody)
      }
    );
    if (!startRes.ok) {
      const t = await startRes.text();
      throw new Error(`Apify start failed (${startRes.status}): ${t.substring(0, 300)}`);
    }
    const startData = await startRes.json();
    const runId = startData.data.id;
    let datasetId = startData.data.defaultDatasetId;
    console.log(`   ✅ Run started: ${runId}`);

    // Poll (max 25 min per batch — 500 contacts should complete well under this)
    const deadline  = Date.now() + 25 * 60 * 1000;
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

    if (!terminal.includes(status)) throw new Error('Apify batch timed out (25 min)');
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

    // Determine max page number returned
    let maxPageReached = searchConfig.startPage || 1;
    for (const p of profiles) {
      const pn = p?._meta?.pagination?.pageNumber;
      if (typeof pn === 'number' && pn > maxPageReached) maxPageReached = pn;
    }

    return { profiles, maxPageReached };
  }

  // ── Private: upsert contacts ───────────────────────────────────────────────

  async saveContacts(profiles, jobData) {
    const allNormalizedUrls = profiles
      .map(p => this.normalizeLinkedInUrl(p.linkedinUrl || ''))
      .filter(Boolean);

    const existingMap = await this.fetchExistingContacts(allNormalizedUrls);

    let batch     = this.db.batch();
    let batchCnt  = 0;
    let totalSaved = 0;
    const seen    = new Set();

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

      const prospectData = {
        firstName, lastName, fullName, name: fullName,
        linkedInUrl, linkedInUrlNormalized: normalizedUrl,
        publicIdentifier: profile.publicIdentifier || '',
        linkedinId:       profile.id || profile.objectUrn || '',
        title:    profile.position || profile.headline || '',
        headline: profile.headline || '',
        position: profile.position || '',
        location: locationString,
        locationRaw: profile.location || null,
        about:      profile.about || '',
        experience: experienceRaw.length > 0 ? JSON.stringify(experienceRaw) : '',
        education:  educationRaw.length  > 0 ? JSON.stringify(educationRaw)  : '',
        // Field name matches generate_messages.html cache key
        linkedInConnectionCount:  profile.connectionsCount || 0,
        followerCount:            profile.followerCount    || 0,
        connectionCountFetchedAt: new Date().toISOString(),
        premium:    profile.premium    || false,
        verified:   profile.verified   || false,
        openToWork: profile.openToWork || false,
        hiring:     profile.hiring     || false,
        company: profile.currentPosition?.[0]?.companyName || '',
        userEmail:            jobData.bdrEmail,
        bdrEmail:             jobData.bdrEmail,
        linkedInAccountEmail: jobData.bdrEmail,
        customerId:        jobData.customerId       || 'unknown',
        linkedInAccountId: jobData.linkedInAccountId || 'unknown',
        accountName:       jobData.accountName      || 'Keyword Search',
        userId:        jobData.submittedBy || '',
        category:      'Keyword Search',
        connectionStatus: 'not_connected',
        uploadedBy:    jobData.submittedBy || '',
        lastUpdatedAt: new Date().toISOString(),
        source:        'keyword_search',
        sourceJobId:   jobData.id || '',
        searchKeyword: jobData.searchKeyword || '',
        searchLocations: jobData.searchConfig?.locations || []
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

  // ── Private: fetch existing contacts by normalized URL ────────────────────

  async fetchExistingContacts(normalizedUrls) {
    const result = new Map();
    if (!normalizedUrls.length) return result;
    const CHUNK = 30;
    for (let i = 0; i < normalizedUrls.length; i += CHUNK) {
      const chunk = normalizedUrls.slice(i, i + CHUNK);
      try {
        const snap = await this.db.collection('prospect_contacts')
          .where('linkedInUrlNormalized', 'in', chunk)
          .get();
        snap.forEach(doc => {
          const url = doc.data().linkedInUrlNormalized;
          if (url && !result.has(url)) result.set(url, doc.ref);
        });
      } catch (err) {
        console.warn(`   ⚠️ Existing-contact lookup failed: ${err.message}`);
      }
    }
    return result;
  }

  // ── Private: update per-keyword pagination state ───────────────────────────

  async updatePaginationState(jobData, savedCount, maxPageReached) {
    const bdrKey = jobData.bdrEmail;
    if (!bdrKey || bdrKey.startsWith('__ws__:') || bdrKey.startsWith('__snapshot__:')) return;
    const keyword  = jobData.searchKeyword || '';
    const safeKw   = this.safeKeywordKey(keyword);
    const nextPage = maxPageReached + 1;
    const nowIso   = new Date().toISOString();
    try {
      const docRef = this.db.collection('keyword_search_pagination').doc(bdrKey);
      let existingTotal = 0;
      try { existingTotal = (await docRef.get()).data()?.totalSearches || 0; } catch (_) {}
      await docRef.set({
        currentPage:   nextPage,
        lastKeyword:   keyword,
        lastSearch:    nowIso,
        totalSearches: existingTotal + 1,
        [`byKeyword.${safeKw}.lastPage`]:      maxPageReached,
        [`byKeyword.${safeKw}.nextPage`]:      nextPage,
        [`byKeyword.${safeKw}.lastSearchAt`]:  nowIso,
        [`byKeyword.${safeKw}.totalContacts`]: savedCount
      }, { merge: true });
    } catch (err) {
      console.warn(`   ⚠️ Pagination state update failed: ${err.message}`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  normalizeLinkedInUrl(url) {
    if (!url) return '';
    return url.trim().replace(/\/$/, '').split('?')[0].split('#')[0].toLowerCase();
  }

  safeKeywordKey(keyword) {
    return (keyword || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
  }
}

module.exports = KeywordSearchJobProcessor;
