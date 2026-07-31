// Use CLEmail secure wrapper (loaded by parent HTML)
// Wrapper functions are available via window.clemailFirestore
let db;

// Initialize Firebase for clemail project via secure wrapper
function initializeFirebase() {
    try {
        if (!window.clemailFirestore || !window.clemailDb) {
            throw new Error('CLEmail wrapper not loaded. Ensure clemail-firestore-wrapper.js is included before this script.');
        }
        
        db = window.clemailDb;
        console.log('🔒 Using CLEmail secure wrapper for analytics (fast)');
    } catch (error) {
        console.error('❌ Failed to initialize CLEmail wrapper for analytics:', error);
        throw error;
    }
}

// Helper to get Firestore functions from wrapper
function getFirestoreFunctions() {
    const { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, orderBy, limit } = window.clemailFirestore;
    return { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, orderBy, limit };
}

// Global state
let customers = [];
let campaigns = [];
let bdrLeaders = [];
let allAnalyticsData = [];
let filteredData = [];
let lastUpdated = null;

// Initialize the application
async function initialize() {
    console.log('🚀 Initializing Fast Campaign Analytics Dashboard (Cache API)...');
    
    try {
        // Wait for authentication to be ready
        await window.firebaseReady;
        console.log('✅ Authentication ready');
        
        // Initialize Firebase for clemail project (needed for fallback and other features)
        initializeFirebase();
        
        // Load overrides from Firestore (must happen after auth is ready)
        await loadOverrides();
        
        showAlert('Loading pre-computed analytics from cache...', 'info');
        
        // Try loading from PostgreSQL cache API first (fastest!)
        if (window.analyticsCacheAPI && window.analyticsCacheAPI.USE_CACHE) {
            try {
                console.log('🚀 Attempting to load from PostgreSQL cache API...');
                const cacheAvailable = await window.analyticsCacheAPI.isCacheAvailable();
                
                if (cacheAvailable) {
                    // Load minimal data from Firestore (just customers and BDRs for dropdowns)
                    await Promise.all([
                        loadCustomers(),
                        loadBdrLeaders()
                    ]);
                    
                    // Load analytics from cache API (super fast!)
                    const cachedData = await window.analyticsCacheAPI.fetchCampaignAnalytics();
                    
                    // Transform to frontend format
                    allAnalyticsData = window.analyticsCacheAPI.transformCachedCampaignData(cachedData, customers, bdrLeaders);
                    
                    // Apply any saved overrides
                    applyOverridesToAll();
                    
                    filteredData = [...allAnalyticsData];
                    updateKPIs();
                    renderCampaignTable();
                    
                    console.log(`✅ Loaded ${allAnalyticsData.length} campaigns from PostgreSQL cache!`);
                } else {
                    throw new Error('Cache API not available');
                }
            } catch (cacheError) {
                console.warn('⚠️ Cache API failed, falling back to Firestore cache:', cacheError.message);
                
                // Fallback to original Firestore cache method
                await Promise.all([
                    loadCustomers(),
                    loadCampaigns(),
                    loadBdrLeaders(),
                    loadMasterActivityLog()
                ]);
                
                // If Firestore cache is also empty, compute on-the-fly
                if (allAnalyticsData.length === 0 && campaigns.length > 0) {
                    console.warn('⚠️ Firestore cache also empty, computing analytics on-the-fly...');
                    showAlert('Computing analytics now. This may take a moment...', 'warning');
                    await computeAnalyticsOnTheFly();
                    console.log('✅ Analytics computation complete!');
                }
            }
        } else {
            // Cache API disabled, use original method
            console.log('📊 Cache API disabled, using Firestore cache...');
            await Promise.all([
                loadCustomers(),
                loadCampaigns(),
                loadBdrLeaders(),
                loadMasterActivityLog()
            ]);
            
            if (allAnalyticsData.length === 0 && campaigns.length > 0) {
                console.warn('⚠️ Cache is empty, falling back to computing analytics on-the-fly...');
                showAlert('Cache empty - computing analytics now. This may take a moment...', 'warning');
                await computeAnalyticsOnTheFly();
                console.log('✅ Analytics computation complete!');
            }
        }
        
        console.log('🎨 Showing dashboard UI...');
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('kpiSection').style.display = 'grid';
        document.getElementById('dashboardContent').style.display = 'block';
        
        hideAlert();
        console.log(`✅ Dashboard initialized with ${allAnalyticsData.length} campaigns!`);

        // Fast path (cache) only has the aggregate completed-phone count. Compute the
        // live-call vs auto-resolved split in the background so the Phone column stops
        // implying every "completed" activity was a call an agent actually placed.
        enhancePhoneBreakdowns().catch(err => console.warn('⚠️ Phone breakdown enhancement error:', err.message));
    } catch (error) {
        console.error('❌ Error initializing dashboard:', error);
        showAlert('Error loading dashboard: ' + error.message, 'danger');
        document.getElementById('loadingSpinner').style.display = 'none';
    }
}

// Load customers
async function loadCustomers() {
    try {
        const { collection, getDocs } = getFirestoreFunctions();
        const customersSnapshot = await getDocs(collection(db, 'customerList'));
        const customerSelect = document.getElementById('customerFilter');
        
        customers = [];
        customersSnapshot.docs.forEach((doc) => {
            customers.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort alphabetically
        customers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        // Populate dropdown
        customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = customer.name || customer.id;
            customerSelect.appendChild(option);
        });

        console.log('✅ Loaded customers:', customers.length);
    } catch (error) {
        console.error('❌ Error loading customers:', error);
        throw error;
    }
}

// Load campaigns (contact-based 'campaigns' + phone-only 'phone_campaigns', merged)
async function loadCampaigns() {
    try {
        const { collection, getDocs } = getFirestoreFunctions();

        // Fetch both collections in parallel — loadCampaigns() itself runs alongside
        // loadMasterActivityLog() via Promise.all in initialize(), so keeping this to a
        // single await (rather than two sequential ones) avoids widening that race.
        const [campaignsSnapshot, phoneCampaignsSnapshot] = await Promise.all([
            getDocs(collection(db, 'campaigns')),
            getDocs(collection(db, 'phone_campaigns'))
        ]);
        
        campaigns = [];
        campaignsSnapshot.docs.forEach((doc) => {
            campaigns.push({ id: doc.id, ...doc.data(), campaignType: 'standard' });
        });

        // Phone-only (no-contact) campaigns scheduled via phone_campaigns.html, normalized
        // to the same {id, name, customerId, ...} shape so every downstream computation —
        // cache lookups, on-the-fly analytics, rendering — treats them uniformly.
        phoneCampaignsSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            campaigns.push({
                id: doc.id,
                name: data.campaignName || doc.id,
                customerId: data.customerId || null,
                status: data.status || 'draft',
                createdAt: data.createdAt,
                campaignType: 'phone_only', // No known contact — org-only calling campaign
                orgCount: data.orgCount || 0,
                approvedCount: data.approvedCount || 0
            });
        });

        console.log(`✅ Loaded campaigns: ${campaignsSnapshot.docs.length} contact-based, ${phoneCampaignsSnapshot.docs.length} phone-only`);
    } catch (error) {
        console.error('❌ Error loading campaigns:', error);
        throw error;
    }
}

// Load BDR leaders
async function loadBdrLeaders() {
    try {
        const { collection, getDocs } = getFirestoreFunctions();
        const bdrsSnapshot = await getDocs(collection(db, 'bdr_leaders'));
        
        bdrLeaders = [];
        bdrsSnapshot.docs.forEach((doc) => {
            bdrLeaders.push({ id: doc.id, ...doc.data() });
        });

        console.log('✅ Loaded BDR leaders:', bdrLeaders.length);
    } catch (error) {
        console.error('❌ Error loading BDR leaders:', error);
        throw error;
    }
}

// Load pre-computed analytics from campaign_analytics_cache
async function loadMasterActivityLog() {
    try {
        console.log('📊 Loading pre-computed analytics from campaign_analytics_cache...');
        
        const { collection, getDocs } = getFirestoreFunctions();
        const cacheSnapshot = await getDocs(collection(db, 'campaign_analytics_cache'));
        
        allAnalyticsData = [];
        let mostRecentUpdate = null;
        
        cacheSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            
            // Track most recent update
            if (data.lastUpdated) {
                const updateTime = window.toDate ? window.toDate(data.lastUpdated) : new Date(data.lastUpdated);
                if (!mostRecentUpdate || updateTime > mostRecentUpdate) {
                    mostRecentUpdate = updateTime;
                }
            }
            
            // Find related campaign and customer
            const campaign = campaigns.find(c => c.id === data.campaignId);
            const customer = campaign ? customers.find(c => c.id === campaign.customerId) : null;
            
            if (!campaign) {
                console.warn(`Campaign not found for activity log: ${data.campaignId}`);
                return;
            }
            
            // Calculate total scheduled and completed activities
            const totalScheduledActivities = (data.scheduledEmails || 0) + (data.phoneActivities || 0) + (data.linkedinActivities || 0);
            const totalCompletedActivities = (data.completedEmails || 0) + (data.completedPhone || 0) + (data.completedLinkedIn || 0);
            
            // Determine status
            const status = determineStatus(data.totalRecords || 0, data.reviewedRecords || 0, totalScheduledActivities);
            
            allAnalyticsData.push({
                campaign: campaign,
                customer: customer,
                campaignType: data.campaignType || campaign.campaignType || 'standard',
                totalRecords: data.totalRecords || 0,
                reviewedRecords: data.reviewedRecords || 0,
                scheduledEmails: data.scheduledEmails || 0,
                completedEmails: data.completedEmails || 0,
                phoneActivities: data.phoneActivities || 0,
                completedPhone: data.completedPhone || 0,
                linkedinActivities: data.linkedinActivities || 0,
                completedLinkedIn: data.completedLinkedIn || 0,
                linkedinConnections: data.linkedinConnections || 0,
                outcomesScheduled: data.outcomesScheduled || 0,
                outcomesInterested: data.outcomesInterested || 0,
                outcomesBounced: data.outcomesBounced || 0,
                outcomesDeclined: data.outcomesDeclined || 0,
                totalScheduledActivities: totalScheduledActivities,
                totalCompletedActivities: totalCompletedActivities,
                bdrAssignments: data.bdrAssignments || {},
                status: status,
                lastUpdated: data.lastUpdated
            });
        });
        
        // Update last updated timestamp in header
        if (mostRecentUpdate) {
            lastUpdated = mostRecentUpdate;
            document.getElementById('lastUpdated').textContent = 
                `Last updated: ${mostRecentUpdate.toLocaleString()}`;
            document.getElementById('lastCacheUpdate').textContent = 
                mostRecentUpdate.toLocaleString();
        } else {
            document.getElementById('lastCacheUpdate').textContent = 'Never';
        }

        filteredData = [...allAnalyticsData];
        updateKPIs();
        renderCampaignTable();
        
        console.log('✅ Loaded analytics for', allAnalyticsData.length, 'campaigns from master_activity_log');
    } catch (error) {
        console.error('❌ Error loading master activity log:', error);
        throw error;
    }
}

// Fallback: Compute analytics on-the-fly if cache is empty
async function computeAnalyticsOnTheFly() {
    try {
        console.log('🔄 Computing analytics for', campaigns.length, 'campaigns...');
        allAnalyticsData = [];
        
        // Disable controls during computation to prevent race conditions
        const customerFilter = document.getElementById('customerFilter');
        const wasDisabled = customerFilter.disabled;
        customerFilter.disabled = true;
        
        // Process campaigns in batches of 5 for better performance
        const batchSize = 5;
        for (let i = 0; i < campaigns.length; i += batchSize) {
            const batch = campaigns.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(campaigns.length / batchSize);
            
            console.log(`📦 Processing batch ${batchNum}/${totalBatches}...`);
            console.log(`   Campaigns in this batch:`, batch.map(c => c.name).join(', '));
            
            try {
                const batchPromises = batch.map(campaign => processCampaignAnalytics(campaign));
                console.log(`   ⏳ Waiting for ${batchPromises.length} campaigns to complete...`);
                
                const batchResults = await Promise.all(batchPromises);
                console.log(`   ⏹️ Promise.all completed for batch ${batchNum}`);
                
                const validResults = batchResults.filter(r => r !== null);
                allAnalyticsData.push(...validResults);
                
                console.log(`  ✅ Batch ${batchNum} complete. Added ${validResults.length} campaigns. Total: ${allAnalyticsData.length}`);
                
                // Update UI progressively
                try {
                    console.log(`   🎨 Starting UI update...`);
                    filteredData = [...allAnalyticsData];
                    updateKPIs();
                    renderCampaignTable();
                    console.log(`  📊 UI updated with ${allAnalyticsData.length} campaigns`);
                } catch (renderError) {
                    console.error(`  ❌ Error rendering UI:`, renderError);
                    console.error('Render error stack:', renderError.stack);
                }
            } catch (batchError) {
                console.error(`❌ Error in batch ${batchNum}:`, batchError);
                console.error('Batch error stack:', batchError.stack);
                // Continue with next batch even if this one fails
            }
        }
        
        // Re-enable controls
        customerFilter.disabled = wasDisabled;
        
        console.log('✅ Computed analytics for', allAnalyticsData.length, 'campaigns');
        console.log('📊 Final data:', allAnalyticsData);
    } catch (error) {
        console.error('❌ Error computing analytics:', error);
        console.error('Error details:', error.stack);
        throw error;
    }
}

// Process a single campaign's analytics (simplified version)
async function processCampaignAnalytics(campaign) {
    // Phone-only (no-contact) campaigns from phone_campaigns.html have a completely
    // different shape (no outreach_sets/scheduledEmails/linkedin_activities), so they
    // get their own computation path.
    if (campaign.campaignType === 'phone_only') {
        return processPhoneCampaignAnalytics(campaign);
    }

    try {
        console.log(`  🔍 Processing: ${campaign.name}`);
        const customer = customers.find(c => c.id === campaign.customerId);
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        
        // Count documents in parallel
        const [
            outreachSetsSnapshot,
            reviewedSnapshot,
            scheduledEmailsSnapshot,
            completedEmailsSnapshot,
            phoneActivitiesSnapshot,
            completedPhoneSnapshot,
            linkedinActivitiesSnapshot,
            completedLinkedInSnapshot,
            outcomesScheduledSnapshot,
            outcomesInterestedSnapshot,
            outcomesBouncedSnapshot,
            outcomesDeclinedSnapshot,
            linkedinConnectionsSnapshot
        ] = await Promise.all([
            getDocs(query(collection(db, 'outreach_sets'), where('campaignId', '==', campaign.id))),
            getDocs(query(collection(db, 'outreach_sets'), where('campaignId', '==', campaign.id), where('approvalStatus', '==', 'approved'))),
            getDocs(query(collection(db, 'scheduledEmails'), where('campaignId', '==', campaign.id))),
            getDocs(query(collection(db, 'scheduledEmails'), where('campaignId', '==', campaign.id), where('status', '==', 'sent'))),
            getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaign.id))),
            getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaign.id), where('status', '==', 'completed'))),
            getDocs(query(collection(db, 'linkedin_activities'), where('campaignId', '==', campaign.id))),
            getDocs(query(collection(db, 'linkedin_activities'), where('campaignId', '==', campaign.id), where('status', '==', 'sent_to_heyreach'))),
            getDocs(query(collection(db, 'outreach_sets'), where('campaignId', '==', campaign.id), where('outcomeStatus', '==', 'scheduled'))),
            getDocs(query(collection(db, 'outreach_sets'), where('campaignId', '==', campaign.id), where('outcomeStatus', '==', 'interested'))),
            getDocs(query(collection(db, 'outreach_sets'), where('campaignId', '==', campaign.id), where('outcomeStatus', '==', 'bounced'))),
            getDocs(query(collection(db, 'outreach_sets'), where('campaignId', '==', campaign.id), where('outcomeStatus', '==', 'declined'))),
            getDocs(query(collection(db, 'heyreach_activity'), where('campaignId', '==', campaign.id), where('eventType', '==', 'CONNECTION_REQUEST_ACCEPTED')))
        ]);
        
        // Deduplicate scheduled outcomes by company
        const uniqueScheduledCompanies = new Set();
        outcomesScheduledSnapshot.docs.forEach(doc => {
            const data = doc.data();
            // Normalize company name (lowercase, trim whitespace)
            const companyName = (data.companyName || data.company || data.organization || '').toLowerCase().trim();
            if (companyName) {
                uniqueScheduledCompanies.add(companyName);
            } else {
                // If no company name, count the individual contact
                uniqueScheduledCompanies.add(`__no_company_${doc.id}`);
            }
        });
        
        const counts = {
            totalRecords: outreachSetsSnapshot.docs.length,
            reviewedRecords: reviewedSnapshot.docs.length,
            scheduledEmails: scheduledEmailsSnapshot.docs.length,
            completedEmails: completedEmailsSnapshot.docs.length,
            phoneActivities: phoneActivitiesSnapshot.docs.length,
            completedPhone: completedPhoneSnapshot.docs.length,
            linkedinActivities: linkedinActivitiesSnapshot.docs.length,
            completedLinkedIn: completedLinkedInSnapshot.docs.length,
            outcomesScheduled: uniqueScheduledCompanies.size, // Deduplicated count
            outcomesInterested: outcomesInterestedSnapshot.docs.length,
            outcomesBounced: outcomesBouncedSnapshot.docs.length,
            outcomesDeclined: outcomesDeclinedSnapshot.docs.length,
            linkedinConnections: linkedinConnectionsSnapshot.docs.length
        };
        
        // Get BDR assignments
        const bdrAssignments = {};
        scheduledEmailsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.bdrLeaderId) {
                if (!bdrAssignments[data.bdrLeaderId]) {
                    bdrAssignments[data.bdrLeaderId] = { email: 0, phone: 0, linkedin: 0 };
                }
                bdrAssignments[data.bdrLeaderId].email++;
            }
        });
        phoneActivitiesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.bdrLeaderId) {
                if (!bdrAssignments[data.bdrLeaderId]) {
                    bdrAssignments[data.bdrLeaderId] = { email: 0, phone: 0, linkedin: 0 };
                }
                bdrAssignments[data.bdrLeaderId].phone++;
            }
        });
        linkedinActivitiesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.bdrLeaderId) {
                if (!bdrAssignments[data.bdrLeaderId]) {
                    bdrAssignments[data.bdrLeaderId] = { email: 0, phone: 0, linkedin: 0 };
                }
                bdrAssignments[data.bdrLeaderId].linkedin++;
            }
        });
        
        const totalScheduledActivities = counts.scheduledEmails + counts.phoneActivities + counts.linkedinActivities;
        const totalCompletedActivities = counts.completedEmails + counts.completedPhone + counts.completedLinkedIn;

        const result = {
            campaign: campaign,
            customer: customer,
            campaignType: 'standard',
            ...counts,
            totalScheduledActivities,
            totalCompletedActivities,
            bdrAssignments,
            status: determineStatus(counts.totalRecords, counts.reviewedRecords, totalScheduledActivities)
        };
        
        console.log(`  ✅ Finished processing: ${campaign.name}`);
        return result;
    } catch (error) {
        console.error(`❌ Error processing campaign "${campaign.name}":`, error);
        console.error('Error stack:', error.stack);
        return null;
    }
}

// Process a single phone-only (no-contact) campaign's call statistics.
// These campaigns consist entirely of 'phone_activities' docs (campaignType:
// 'phone_only') tied to imported organizations rather than outreach_sets contacts,
// and outcomes are recorded directly on those phone_activities docs (see outcomes.html).
async function processPhoneCampaignAnalytics(campaign) {
    try {
        console.log(`  🔍 Processing phone campaign: ${campaign.name}`);
        const customer = customers.find(c => c.id === campaign.customerId);
        const { collection, getDocs, query, where } = getFirestoreFunctions();

        const [
            phoneActivitiesSnapshot,
            completedPhoneSnapshot,
            outcomesScheduledSnapshot,
            outcomesInterestedSnapshot,
            outcomesBouncedSnapshot,
            outcomesDeclinedSnapshot
        ] = await Promise.all([
            getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaign.id), where('campaignType', '==', 'phone_only'))),
            getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaign.id), where('campaignType', '==', 'phone_only'), where('status', '==', 'completed'))),
            getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaign.id), where('campaignType', '==', 'phone_only'), where('outcomeStatus', '==', 'scheduled'))),
            getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaign.id), where('campaignType', '==', 'phone_only'), where('outcomeStatus', '==', 'interested'))),
            getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaign.id), where('campaignType', '==', 'phone_only'), where('outcomeStatus', '==', 'bounced'))),
            getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaign.id), where('campaignType', '==', 'phone_only'), where('outcomeStatus', '==', 'declined')))
        ]);

        // Each org can have multiple call-attempt docs sharing the same orgId, so
        // outcomes are deduplicated by org (falling back to normalized org name).
        const dedupeByOrg = (snapshot) => {
            const unique = new Set();
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                unique.add(data.orgId || (data.orgName || '').toLowerCase().trim() || doc.id);
            });
            return unique.size;
        };

        const phoneActivities = phoneActivitiesSnapshot.docs.length;
        const completedPhone = completedPhoneSnapshot.docs.length;

        const result = {
            campaign: campaign,
            customer: customer,
            campaignType: 'phone_only',
            totalRecords: campaign.orgCount || 0,
            reviewedRecords: campaign.approvedCount || 0,
            scheduledEmails: 0,
            completedEmails: 0,
            phoneActivities: phoneActivities,
            completedPhone: completedPhone,
            linkedinActivities: 0,
            completedLinkedIn: 0,
            linkedinConnections: 0,
            outcomesScheduled: dedupeByOrg(outcomesScheduledSnapshot),
            outcomesInterested: dedupeByOrg(outcomesInterestedSnapshot),
            outcomesBounced: dedupeByOrg(outcomesBouncedSnapshot),
            outcomesDeclined: dedupeByOrg(outcomesDeclinedSnapshot),
            totalScheduledActivities: phoneActivities,
            totalCompletedActivities: completedPhone,
            bdrAssignments: {}, // No BDR-leader concept for org-only calling campaigns
            status: campaign.status || 'draft'
        };

        console.log(`  ✅ Finished processing phone campaign: ${campaign.name}`);
        return result;
    } catch (error) {
        console.error(`❌ Error processing phone campaign "${campaign.name}":`, error);
        console.error('Error stack:', error.stack);
        return null;
    }
}

// Determine campaign status
function determineStatus(totalRecords, reviewedRecords, scheduledActivities) {
    if (scheduledActivities > 0) return 'active';
    if (reviewedRecords > 0) return 'paused';
    return 'completed';
}

// Overall progress = average completion % across ONLY the channels the campaign
// actually uses (scheduled > 0). A phone-only campaign at 100% phone completion
// should read 100%, not 33% (which the old fixed "÷3" produced).
function computeProgressPercent(data) {
    const channelPercents = [];
    if (data.scheduledEmails > 0) channelPercents.push((data.completedEmails / data.scheduledEmails) * 100);
    if (data.phoneActivities > 0) channelPercents.push((data.completedPhone / data.phoneActivities) * 100);
    if (data.linkedinActivities > 0) channelPercents.push((data.completedLinkedIn / data.linkedinActivities) * 100);

    if (channelPercents.length === 0) return 0;
    const avg = channelPercents.reduce((sum, p) => sum + p, 0) / channelPercents.length;
    return Math.round(avg);
}

// =============================================================================
// PHONE COMPLETION BREAKDOWN: live calls placed vs. completed-without-a-call
// =============================================================================
// The Phone column's raw "completed" count = phone_activities marked
// status:'completed'. That is NOT the same as "calls an agent actually placed":
// activities also get marked completed with no live call by the bad-number sweep,
// stale-callback auto-close, admin/phone-inbox actions, and bulk recovery scripts
// — with varying completedBy values, so we can't rely on a single tag.
//
// The source of truth for real calls is campaign_call_tracking (one record per
// call an agent placed — this is what call_manager.html's "Total Calls" counts).
// So we reconcile against it:
//   livePhoneCalls        = # campaign_call_tracking records for the campaign
//   completedActivities   = # phone_activities marked completed
//   completedNoLiveCall   = completedActivities − livePhoneCalls  (clamped ≥ 0)
// and we break the completed activities down by OUTCOME (bad-number,
// spoke-declined, left-message, …) so it's clear WHY they were completed, plus
// flag the ones explicitly tagged 'system-auto*'.

// Map a phone_activities outcome string to a coarse reason bucket + display color.
function classifyPhoneOutcome(outcome) {
    const o = String(outcome || '').toLowerCase();
    if (!o) return { key: 'unknown', label: 'No outcome recorded', color: '#94a3b8' };
    if (o.includes('bad-number') || o.includes('wrong') || o.includes('disconnect')) return { key: 'bad-number', label: 'Bad number', color: '#d97706' };
    if (o.includes('declined') || o.includes('not-interested') || o.includes('no-replacement')) return { key: 'declined', label: 'Declined / not interested', color: '#dc2626' };
    if (o.includes('scheduled-meeting') || o.includes('interested') || o === 'scheduled') return { key: 'meeting', label: 'Meeting / interested', color: '#16a34a' };
    if (o.includes('callback')) return { key: 'callback', label: 'Callback scheduled', color: '#ea580c' };
    if (o.includes('spoke')) return { key: 'spoke', label: 'Spoke (other)', color: '#2563eb' };
    if (o.includes('message') || o.includes('voicemail') || o.includes('no-message')) return { key: 'message', label: 'Left message / voicemail', color: '#0891b2' };
    return { key: 'other', label: 'Other', color: '#64748b' };
}

// How an activity got its 'completed' status. This is what distinguishes a real
// call a scheduler placed (and chose an outcome for) from the system/cascade
// auto-completions that never involved a fresh call:
//   • live-call     → agent completed it directly (real call, scheduler-chosen outcome)
//   • agent-cascade → an agent's single call auto-closed related/duplicate scheduled
//                     activities (same contact/org/number); no separate call placed.
//                     Signal: completedBy is an email AND originalCallId/autoCompletedReason set.
//   • auto-bad-number → the cross-campaign bad-number SWEEP: marks scheduled calls whose
//                     number was already reported bad elsewhere. No call placed.
//   • auto-declined → stale-callback auto-close (contact later marked declined). No call.
//   • auto-other    → any other system-auto automation.
//   • no-owner      → completed with no completedBy recorded at all (needs review).
// These are keyed off completedBy + write-path flags (see team/phone-calls.html), NOT
// phone matching — the sweep reuses a number that WAS called once, so phone matching
// would wrongly credit swept rows as live calls.
const PHONE_SOURCE_META = {
    'live-call':     { label: 'Scheduler placed a live call', group: 'agent', color: '#059669', desc: 'Agent dialed and chose this outcome.' },
    'agent-cascade': { label: 'Auto-closed from a related call', group: 'auto', color: '#0891b2', desc: 'One agent call closed duplicate/linked scheduled activities (same contact/org/number) — no separate call.' },
    'auto-bad-number': { label: 'Auto: bad-number sweep', group: 'auto', color: '#d97706', desc: 'System marked scheduled calls whose number was already reported bad elsewhere — no call placed.' },
    'auto-declined': { label: 'Auto: declined-callback close', group: 'auto', color: '#dc2626', desc: 'Callback auto-closed because the contact was later marked declined/unavailable — no call placed.' },
    'auto-other':    { label: 'Auto: other automation', group: 'auto', color: '#64748b', desc: 'Other system automation.' },
    'no-owner':      { label: 'No completer recorded', group: 'none', color: '#94a3b8', desc: 'Completed with no completedBy — needs review.' }
};

function classifyCompletionSource(data) {
    const completedBy = String(data.completedBy || '');
    if (completedBy.startsWith('system-auto')) {
        if (completedBy === 'system-auto-bad-number') return 'auto-bad-number';
        if (completedBy === 'system-auto-declined-callback') return 'auto-declined';
        return 'auto-other';
    }
    if (completedBy) {
        // Agent email present. If it was cascaded from another call, it's not a fresh call.
        if (data.originalCallId || data.autoCompletedReason) return 'agent-cascade';
        return 'live-call';
    }
    return 'no-owner';
}

// Categorize completed phone_activities: tally per outcome, per completion SOURCE
// (how it got completed), a per-outcome × source matrix, flag system-auto docs, and
// keep a compact record list for the drill-down modal.
function categorizePhoneCompleted(docs) {
    const outcomeCounts = {};
    const sourceCounts = { 'live-call': 0, 'agent-cascade': 0, 'auto-bad-number': 0, 'auto-declined': 0, 'auto-other': 0, 'no-owner': 0 };
    const outcomeSourceMatrix = {}; // outcomeKey -> { agent, auto, none, total }
    let systemAutoTotal = 0;
    let autoBadNumber = 0;
    let autoDeclined = 0;
    let autoOther = 0;
    const items = [];

    docs.forEach(doc => {
        const data = typeof doc.data === 'function' ? doc.data() : doc;
        const completedBy = String(data.completedBy || '');
        const outcome = data.outcome || '';
        const outcomeKey = outcome || '(none)';
        const isSystemAuto = completedBy.startsWith('system-auto');
        const source = classifyCompletionSource(data);
        const group = PHONE_SOURCE_META[source]?.group || 'auto';

        outcomeCounts[outcomeKey] = (outcomeCounts[outcomeKey] || 0) + 1;
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;

        if (!outcomeSourceMatrix[outcomeKey]) outcomeSourceMatrix[outcomeKey] = { agent: 0, auto: 0, none: 0, total: 0 };
        outcomeSourceMatrix[outcomeKey][group]++;
        outcomeSourceMatrix[outcomeKey].total++;

        if (isSystemAuto) {
            systemAutoTotal++;
            if (completedBy === 'system-auto-bad-number' || outcome === 'bad-number') autoBadNumber++;
            else if (completedBy === 'system-auto-declined-callback' || data.autoCompletedReason === 'callback-for-declined-contact' || outcome === 'spoke-declined') autoDeclined++;
            else autoOther++;
        }

        items.push({
            name: data.contactName || data.orgName || data.companyName || data.contactCompany || 'Unknown',
            org: data.companyName || data.contactCompany || data.orgName || '',
            phone: data.phoneNumber || data.phone || data.workphone || '',
            outcome,
            completedBy,
            completedAt: data.completedAt || data.autoMarkedAt || '',
            isSystemAuto,
            source
        });
    });

    return { outcomeCounts, sourceCounts, outcomeSourceMatrix, systemAutoTotal, autoBadNumber, autoDeclined, autoOther, items };
}

// Attach a computed phone breakdown onto an analytics data row.
function attachPhoneBreakdown(data, bd) {
    data.livePhoneCalls = bd.livePhoneCalls;
    data.completedActivities = bd.completedActivities;
    data.completedNoLiveCall = Math.max(0, bd.completedActivities - bd.livePhoneCalls);
    data.systemAutoTotal = bd.systemAutoTotal;
    data.autoBreakdown = { badNumber: bd.autoBadNumber, declined: bd.autoDeclined, other: bd.autoOther };
    data.phoneOutcomeCounts = bd.outcomeCounts;
    data.phoneSourceCounts = bd.sourceCounts || {};
    data.phoneOutcomeSourceMatrix = bd.outcomeSourceMatrix || {};
    data.phoneBreakdownItems = bd.items;
    data.phoneBreakdownComputed = true;
}

// For one campaign, reconcile completed phone_activities against the real calls in
// campaign_call_tracking. Queries by campaignId only (single-field equality — no
// composite index needed) and filters completed client-side.
async function computeCampaignPhoneBreakdown(campaignId) {
    const { collection, getDocs, query, where } = getFirestoreFunctions();
    const [activitiesSnap, callTrackingSnap] = await Promise.all([
        getDocs(query(collection(db, 'phone_activities'), where('campaignId', '==', campaignId))),
        getDocs(query(collection(db, 'campaign_call_tracking'), where('campaignId', '==', campaignId)))
    ]);

    const completedDocs = activitiesSnap.docs.filter(doc => {
        const data = typeof doc.data === 'function' ? doc.data() : doc;
        return data.status === 'completed';
    });

    const cat = categorizePhoneCompleted(completedDocs);
    return {
        livePhoneCalls: callTrackingSnap.docs.length,
        completedActivities: completedDocs.length,
        ...cat
    };
}

// Progressive enhancement for the fast (cache) path: the cache only stores the
// aggregate completed-phone count, not the live-call reconciliation. After the
// fast render, compute it per campaign in small concurrent batches and update the
// Phone column in place. Fire-and-forget so it never delays initial load.
async function enhancePhoneBreakdowns() {
    const targets = allAnalyticsData.filter(d => !d.phoneBreakdownComputed && ((d.phoneActivities || 0) > 0 || (d.completedPhone || 0) > 0));
    if (targets.length === 0) return;

    console.log(`📞 Reconciling live calls vs completed activities for ${targets.length} campaign(s)...`);
    // Re-render so those cells immediately show a "resolving…" spinner instead
    // of a raw completed count that would misrepresent calls actually placed.
    renderCampaignTable();

    const CONCURRENCY = 4;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const chunk = targets.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async (d) => {
            try {
                const bd = await computeCampaignPhoneBreakdown(d.campaign.id);
                attachPhoneBreakdown(d, bd);
            } catch (err) {
                console.warn(`⚠️ Phone breakdown failed for "${d.campaign.name}":`, err.message);
                // Fail safe: stop the spinner. Fall back to the cached completed count
                // as both "completed" and "live" so we don't overstate the split.
                attachPhoneBreakdown(d, { livePhoneCalls: d.completedPhone || 0, completedActivities: d.completedPhone || 0, systemAutoTotal: 0, autoBadNumber: 0, autoDeclined: 0, autoOther: 0, outcomeCounts: {}, items: [] });
                d.phoneBreakdownError = true;
            }
        }));
        renderCampaignTable();
    }

    console.log('✅ Phone live-call reconciliation complete');
}

// Helper function to escape text for use in onclick attributes
function escapeForOnclick(text) {
    return (text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

// Update KPIs
function updateKPIs() {
    const totalRecords = filteredData.reduce((sum, d) => sum + d.totalRecords, 0);
    const totalReviewed = filteredData.reduce((sum, d) => sum + d.reviewedRecords, 0);
    const totalScheduled = filteredData.reduce((sum, d) => sum + d.totalScheduledActivities, 0);
    const totalEmailsSent = filteredData.reduce((sum, d) => sum + d.completedEmails, 0);

    document.getElementById('totalRecords').textContent = totalRecords.toLocaleString();
    document.getElementById('totalReviewed').textContent = totalReviewed.toLocaleString();
    document.getElementById('totalScheduled').textContent = totalScheduled.toLocaleString();
    document.getElementById('totalEmailsSent').textContent = totalEmailsSent.toLocaleString();
}

// Render campaign table
function renderCampaignTable() {
    const tbody = document.querySelector('#campaignsTable tbody');
    const noCampaigns = document.getElementById('noCampaigns');
    
    if (filteredData.length === 0) {
        tbody.innerHTML = '';
        noCampaigns.style.display = 'block';
        return;
    }

    noCampaigns.style.display = 'none';
    
    tbody.innerHTML = filteredData.map(data => {
        // Overall progress = average completion % across ONLY the channels this
        // campaign actually uses. Averaging over a fixed 3 channels made a fully
        // completed phone-only campaign read 33% (100%/3), so we divide by the
        // number of channels with scheduled activity instead.
        const progressPercent = computeProgressPercent(data);

        // Phone column: show live calls actually placed (from campaign_call_tracking)
        // vs scheduled, and surface how many activities were completed WITHOUT a live
        // call (bad numbers, auto-closes, bulk completions) with an outcome breakdown.
        const phoneComputed = data.phoneBreakdownComputed;
        const phoneMainNumber = phoneComputed ? (data.livePhoneCalls || 0) : (data.completedPhone || 0);
        const completedNoLiveCall = phoneComputed ? (data.completedNoLiveCall || 0) : 0;
        const phoneMainTitle = phoneComputed ? 'Live calls placed (from campaign_call_tracking)' : 'Completed activities (reconciling live calls…)';
        let phoneSubline = '';
        if (!phoneComputed && ((data.completedPhone || 0) > 0 || (data.phoneActivities || 0) > 0)) {
            phoneSubline = `<div style="font-size: 0.7rem; color: var(--gray); margin-top: 0.15rem;"><i class="fas fa-spinner fa-spin"></i> reconciling live calls…</div>`;
        } else if (completedNoLiveCall > 0) {
            phoneSubline = `<div class="clickable-metric" style="font-size: 0.7rem; color: #b45309; margin-top: 0.15rem; font-weight: 600;"
                  onclick="showPhoneCompletionBreakdown('${data.campaign.id}', '${escapeForOnclick(data.campaign.name)}')"
                  title="Activities marked completed without a live call (bad numbers, auto-closes, bulk completions) — click for the outcome breakdown">
                <i class="fas fa-robot"></i> +${completedNoLiveCall.toLocaleString()} completed w/o live call ▸
            </div>`;
        } else if (phoneComputed && (data.completedActivities || 0) > 0) {
            phoneSubline = `<div class="clickable-metric" style="font-size: 0.7rem; color: var(--gray); margin-top: 0.15rem;"
                  onclick="showPhoneCompletionBreakdown('${data.campaign.id}', '${escapeForOnclick(data.campaign.name)}')"
                  title="View completion outcome breakdown">
                <i class="fas fa-list"></i> ${(data.completedActivities || 0).toLocaleString()} completed · details ▸
            </div>`;
        }

        const bdrAssignmentsList = Object.entries(data.bdrAssignments).map(([bdrId, counts]) => {
            const bdr = bdrLeaders.find(b => b.id === bdrId);
            const bdrName = bdr ? bdr.name : 'Unknown BDR';
            const totalAssignments = counts.email + counts.phone + counts.linkedin;
            
            return `
                <div class="bdr-assignment">
                    <span class="bdr-name">${bdrName}</span>
                    <span class="assignment-count">${totalAssignments}</span>
                </div>
            `;
        }).join('');

        return `
            <tr>
                <td>
                    <div class="campaign-name">
                        ${data.campaign.name}
                        ${data.campaignType === 'phone_only' ? '<span class="campaign-type-badge phone-only" title="No-contact org calling campaign (scheduled via phone_campaigns.html)"><i class="fas fa-phone-volume"></i> Phone Campaign</span> ' : ''}
                        ${data.hasOverrides ? '<span class="override-indicator" title="Has manual overrides">⚠️ OVERRIDE</span>' : ''}
                    </div>
                    <button class="override-btn" onclick="openOverrideModal('${data.campaign.id}', '${escapeForOnclick(data.campaign.name)}')" title="Override analytics values">
                        <i class="fas fa-edit"></i> Override
                    </button>
                </td>
                <td>
                    <div class="customer-name">${data.customer ? data.customer.name : 'Unknown'}</div>
                </td>
                <td>
                    <span class="status-badge status-${data.status}">${data.status}</span>
                </td>
                <td>
                    <span class="metric-value">${data.totalRecords.toLocaleString()}</span>
                </td>
                <td>
                    <span class="metric-value">${data.reviewedRecords.toLocaleString()}</span>
                </td>
                <td>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <div class="progress-text">${data.totalCompletedActivities}/${data.totalScheduledActivities} complete (${progressPercent}%)</div>
                </td>
                <td>
                    <div class="channel-item">
                        <i class="fas fa-envelope channel-icon email"></i>
                        <span class="metric-value" style="font-weight: 700;">${data.completedEmails}</span>
                        <span style="color: var(--gray); margin: 0 0.25rem;">/</span>
                        <span style="color: var(--gray);">${data.scheduledEmails}</span>
                    </div>
                </td>
                <td>
                    <div class="channel-item">
                        <i class="fas fa-phone channel-icon phone"></i>
                        <span class="metric-value" style="font-weight: 700;" title="${phoneMainTitle}">${phoneMainNumber.toLocaleString()}</span>
                        <span style="color: var(--gray); margin: 0 0.25rem;">/</span>
                        <span style="color: var(--gray);" title="Phone activities scheduled">${(data.phoneActivities || 0).toLocaleString()}</span>
                    </div>
                    ${phoneSubline}
                </td>
                <td>
                    <div class="channel-item">
                        <i class="fab fa-linkedin channel-icon linkedin"></i>
                        <span class="metric-value" style="font-weight: 700;">${data.completedLinkedIn}</span>
                        <span style="color: var(--gray); margin: 0 0.25rem;">/</span>
                        <span style="color: var(--gray);">${data.linkedinActivities}</span>
                    </div>
                </td>
                <td>
                    <span class="metric-value" style="font-weight: 700; color: #0077b5;">${data.linkedinConnections || 0}</span>
                </td>
                <td>
                    <span class="metric-value clickable-metric" style="font-weight: 600; color: #10b981;" 
                          onclick="showOutcomeContacts('${data.campaign.id}', 'Scheduled', '${escapeForOnclick(data.campaign.name)}', '${data.campaignType}')" 
                          title="Click to view contacts">
                        ${data.outcomesScheduled || 0}
                    </span>
                </td>
                <td>
                    <span class="metric-value clickable-metric" style="font-weight: 600; color: #3b82f6;" 
                          onclick="showOutcomeContacts('${data.campaign.id}', 'Interested', '${escapeForOnclick(data.campaign.name)}', '${data.campaignType}')" 
                          title="Click to view contacts">
                        ${data.outcomesInterested || 0}
                    </span>
                </td>
                <td>
                    <span class="metric-value clickable-metric" style="font-weight: 600; color: #f59e0b;" 
                          onclick="showOutcomeContacts('${data.campaign.id}', 'Bounced', '${escapeForOnclick(data.campaign.name)}', '${data.campaignType}')" 
                          title="Click to view contacts">
                        ${data.outcomesBounced || 0}
                    </span>
                </td>
                <td>
                    <span class="metric-value clickable-metric" style="font-weight: 600; color: #ef4444;" 
                          onclick="showOutcomeContacts('${data.campaign.id}', 'Declined', '${escapeForOnclick(data.campaign.name)}', '${data.campaignType}')" 
                          title="Click to view contacts">
                        ${data.outcomesDeclined || 0}
                    </span>
                </td>
                <td>
                    <div class="bdr-assignments">
                        ${bdrAssignmentsList || '<span style="color: var(--gray); font-style: italic;">No assignments</span>'}
                    </div>
                </td>
                <td>
                    <span style="font-size: 0.8rem; color: var(--gray);">
                        ${data.campaign.createdAt ? new Date(data.campaign.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter campaigns by customer and/or campaign type
window.filterCampaigns = function() {
    const customerId = document.getElementById('customerFilter').value;
    const typeFilterEl = document.getElementById('campaignTypeFilter');
    const campaignType = typeFilterEl ? typeFilterEl.value : '';
    
    filteredData = allAnalyticsData.filter(d => {
        if (customerId && (!d.customer || d.customer.id !== customerId)) return false;
        if (campaignType && (d.campaignType || 'standard') !== campaignType) return false;
        return true;
    });
    
    updateKPIs();
    renderCampaignTable();
};

// Refresh dashboard
window.refreshDashboard = async function() {
    document.getElementById('loadingSpinner').style.display = 'flex';
    document.getElementById('kpiSection').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'none';
    
    await initialize();
};

// Export report (placeholder)
window.exportReport = function() {
    const csvData = generateCSVReport();
    downloadCSV(csvData, 'campaign-analytics-report.csv');
};

// Generate CSV report
function generateCSVReport() {
    const headers = [
        'Campaign Name',
        'Campaign Type',
        'Customer',
        'Status',
        'Total Records',
        'Reviewed Records',
        'Scheduled Activities',
        'Completed Activities',
        'Activity Completion %',
        'Scheduled Emails',
        'Completed Emails',
        'Phone Activities (Scheduled)',
        'Phone - Live Calls Placed',
        'Phone - Activities Completed',
        'Phone - Completed w/o Live Call',
        'Phone - System Auto-Resolved',
        'Auto - Bad Number',
        'Auto - Declined',
        'Auto - Other',
        'Phone - Scheduler Live Completions',
        'Phone - Bad-Number Sweep (auto)',
        'Phone - Cascade Auto-Closed',
        'Phone - No Completer Recorded',
        'LinkedIn Activities',
        'Completed LinkedIn',
        'LinkedIn Connections',
        'Outcomes - Scheduled',
        'Outcomes - Interested',
        'Outcomes - Bounced',
        'Outcomes - Declined',
        'BDR Assignments',
        'Created Date',
        'Last Updated'
    ];

    const rows = filteredData.map(data => {
        const progressPercent = computeProgressPercent(data);

        const bdrAssignments = Object.entries(data.bdrAssignments).map(([bdrId, counts]) => {
            const bdr = bdrLeaders.find(b => b.id === bdrId);
            const bdrName = bdr ? bdr.name : 'Unknown BDR';
            const totalAssignments = counts.email + counts.phone + counts.linkedin;
            return `${bdrName}: ${totalAssignments}`;
        }).join('; ');

        const lastUpdatedStr = data.lastUpdated ? 
            (data.lastUpdated.toDate ? data.lastUpdated.toDate() : new Date(data.lastUpdated)).toLocaleString() : 
            'Unknown';

        return [
            data.campaign.name,
            data.campaignType === 'phone_only' ? 'Phone Campaign (No Contact)' : 'Contact Campaign',
            data.customer ? data.customer.name : 'Unknown',
            data.status,
            data.totalRecords,
            data.reviewedRecords,
            data.totalScheduledActivities,
            data.totalCompletedActivities,
            progressPercent,
            data.scheduledEmails,
            data.completedEmails,
            data.phoneActivities,
            data.phoneBreakdownComputed ? (data.livePhoneCalls || 0) : '',
            data.phoneBreakdownComputed ? (data.completedActivities || 0) : data.completedPhone,
            data.phoneBreakdownComputed ? (data.completedNoLiveCall || 0) : '',
            data.phoneBreakdownComputed ? (data.systemAutoTotal || 0) : '',
            data.autoBreakdown ? data.autoBreakdown.badNumber : 0,
            data.autoBreakdown ? data.autoBreakdown.declined : 0,
            data.autoBreakdown ? data.autoBreakdown.other : 0,
            data.phoneSourceCounts ? (data.phoneSourceCounts['live-call'] || 0) : '',
            data.phoneSourceCounts ? (data.phoneSourceCounts['auto-bad-number'] || 0) : '',
            data.phoneSourceCounts ? (data.phoneSourceCounts['agent-cascade'] || 0) : '',
            data.phoneSourceCounts ? (data.phoneSourceCounts['no-owner'] || 0) : '',
            data.linkedinActivities,
            data.completedLinkedIn,
            data.linkedinConnections || 0,
            data.outcomesScheduled || 0,
            data.outcomesInterested || 0,
            data.outcomesBounced || 0,
            data.outcomesDeclined || 0,
            bdrAssignments || 'No assignments',
            data.campaign.createdAt ? new Date(data.campaign.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown',
            lastUpdatedStr
        ];
    });

    return [headers, ...rows].map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
}

// Download CSV file
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showAlert('Report exported successfully!', 'success');
}

// Show alert
function showAlert(message, type) {
    const container = document.getElementById('alertContainer');
    container.innerHTML = `
        <div class="alert alert-${type}">
            <i class="fas fa-info-circle"></i>
            ${message}
        </div>
    `;
}

// Hide alert
function hideAlert() {
    const container = document.getElementById('alertContainer');
    container.innerHTML = '';
}

// Refresh cache manually by calling Railway API
window.refreshCacheManually = async function() {
    const btn = event.target.closest('button');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing Cache...';

    const statusText = document.getElementById('cacheStatusText');
    const originalStatus = statusText.innerHTML;
    statusText.innerHTML = '<span style="color: #f59e0b;">⏳ Cache refresh in progress...</span>';

    try {
        console.log('🔄 Triggering manual cache refresh...');
        
        const response = await fetch('https://railwayclemail-production.up.railway.app/api/analytics/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ triggeredBy: 'dashboard_manual' })
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ Cache refresh complete:', result);
            
            // Show success message
            showAlert(`✅ Cache refreshed successfully!\n\nCampaigns processed: ${result.processed}\nDuration: ${result.duration}s`, 'success');
            
            // Reload the dashboard data
            console.log('🔄 Reloading dashboard data...');
            await initialize();
            
            statusText.innerHTML = `<span style="color: #10b981;">✅ Cache refreshed at ${new Date().toLocaleString()}</span>`;
            
            // Reset status text after 5 seconds
            setTimeout(() => {
                statusText.innerHTML = originalStatus;
            }, 5000);
        } else {
            console.error('❌ Cache refresh failed:', result.error);
            showAlert('❌ Cache refresh failed: ' + result.error, 'danger');
            statusText.innerHTML = originalStatus;
        }
    } catch (error) {
        console.error('❌ Error refreshing cache:', error);
        showAlert('❌ Error refreshing cache: ' + error.message, 'danger');
        statusText.innerHTML = originalStatus;
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
};

// Show outcome contacts in modal
window.showOutcomeContacts = async function(campaignId, outcome, campaignName, campaignType) {
    const modal = document.getElementById('outcomeModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    // Show modal with loading state
    modal.style.display = 'block';
    modalTitle.innerHTML = `<i class="fas fa-users"></i> ${outcome} ${campaignType === 'phone_only' ? 'Organizations' : 'Contacts'} - ${campaignName}`;
    modalBody.innerHTML = `
        <div class="loading-modal">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading ${campaignType === 'phone_only' ? 'organizations' : 'contacts'}...</p>
        </div>
    `;
    
    try {
        console.log(`Fetching ${outcome} ${campaignType === 'phone_only' ? 'organizations' : 'contacts'} for campaign ${campaignId}...`);
        
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        const outcomeStatusValue = outcome.toLowerCase(); // 'Scheduled' -> 'scheduled'

        if (campaignType === 'phone_only') {
            await renderPhoneOutcomeOrgs(campaignId, outcomeStatusValue, outcome, modalBody);
            return;
        }
        
        // Query outreach_sets with the specific outcome status (lowercase for database field)
        const contactsQuery = query(
            collection(db, 'outreach_sets'),
            where('campaignId', '==', campaignId),
            where('outcomeStatus', '==', outcomeStatusValue)
        );
        
        const contactsSnapshot = await getDocs(contactsQuery);
        
        if (contactsSnapshot.docs.length === 0) {
            modalBody.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No contacts found with outcome: ${outcome}</p>
                </div>
            `;
            return;
        }
        
        const contacts = [];
        contactsSnapshot.docs.forEach((doc) => {
            contacts.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by name
        contacts.sort((a, b) => {
            const nameA = a.fullName || a.name || a.firstName + ' ' + a.lastName || '';
            const nameB = b.fullName || b.name || b.firstName + ' ' + b.lastName || '';
            return nameA.localeCompare(nameB);
        });
        
        // Render contacts (outreach_sets structure)
        const contactsHTML = contacts.map(contact => {
            const displayName = contact.fullName || contact.name || 
                                (contact.firstName && contact.lastName ? `${contact.firstName} ${contact.lastName}` : 
                                contact.firstName || contact.lastName || 'Unknown');
            const company = contact.companyName || contact.company || contact.organization || 'No company';
            const email = contact.email || 'No email';
            
            return `
                <li class="contact-item">
                    <div>
                        <div class="contact-name">${displayName}</div>
                        <div class="contact-company">${company}</div>
                    </div>
                    <div class="contact-email">${email}</div>
                </li>
            `;
        }).join('');
        
        modalBody.innerHTML = `
            <div style="margin-bottom: 1rem; font-weight: 600; color: var(--primary);">
                Total: ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}
            </div>
            <ul class="contact-list">
                ${contactsHTML}
            </ul>
        `;
        
        console.log(`✅ Loaded ${contacts.length} contacts with outcome: ${outcome}`);
    } catch (error) {
        console.error('❌ Error loading outcome contacts:', error);
        modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Error loading contacts: ${error.message}
            </div>
        `;
    }
};

// Render outcome organizations for a phone-only (no-contact) campaign. Outcomes for
// these campaigns live directly on 'phone_activities' docs (campaignType: 'phone_only')
// rather than on outreach_sets, and each org can have several call-attempt docs, so
// results are deduplicated by orgId before rendering.
async function renderPhoneOutcomeOrgs(campaignId, outcomeStatusValue, outcome, modalBody) {
    const { collection, getDocs, query, where } = getFirestoreFunctions();

    const orgsQuery = query(
        collection(db, 'phone_activities'),
        where('campaignId', '==', campaignId),
        where('campaignType', '==', 'phone_only'),
        where('outcomeStatus', '==', outcomeStatusValue)
    );

    const orgsSnapshot = await getDocs(orgsQuery);

    if (orgsSnapshot.docs.length === 0) {
        modalBody.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No organizations found with outcome: ${outcome}</p>
            </div>
        `;
        return;
    }

    const orgsByKey = new Map();
    orgsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const key = data.orgId || (data.orgName || '').toLowerCase().trim() || doc.id;
        if (!orgsByKey.has(key)) {
            orgsByKey.set(key, { id: doc.id, ...data });
        }
    });

    const orgs = [...orgsByKey.values()].sort((a, b) => (a.orgName || '').localeCompare(b.orgName || ''));

    const orgsHTML = orgs.map(org => {
        const displayName = org.orgName || 'Unknown Organization';
        const location = [org.city, org.state].filter(Boolean).join(', ') || org.address || 'No address on file';
        const phone = org.phone || 'No phone';

        return `
            <li class="contact-item">
                <div>
                    <div class="contact-name">${displayName}</div>
                    <div class="contact-company">${location}</div>
                </div>
                <div class="contact-email">${phone}</div>
            </li>
        `;
    }).join('');

    modalBody.innerHTML = `
        <div style="margin-bottom: 1rem; font-weight: 600; color: var(--primary);">
            Total: ${orgs.length} organization${orgs.length !== 1 ? 's' : ''}
        </div>
        <ul class="contact-list">
            ${orgsHTML}
        </ul>
    `;

    console.log(`✅ Loaded ${orgs.length} organizations with outcome: ${outcome}`);
}

// Close outcome modal
window.closeOutcomeModal = function() {
    const modal = document.getElementById('outcomeModal');
    modal.style.display = 'none';
};

// Show the completion breakdown for a campaign's phone activities: reconcile the
// real calls placed (campaign_call_tracking) against activities marked completed,
// and show WHY they were completed via an outcome breakdown.
window.showPhoneCompletionBreakdown = async function(campaignId, campaignName) {
    const modal = document.getElementById('outcomeModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modal.style.display = 'block';
    modalTitle.innerHTML = `<i class="fas fa-phone"></i> Phone Completion Breakdown — ${campaignName}`;
    modalBody.innerHTML = `
        <div class="loading-modal">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Reconciling live calls vs completed activities...</p>
        </div>
    `;

    try {
        const data = allAnalyticsData.find(d => d.campaign.id === campaignId);
        let bd;

        if (data && data.phoneBreakdownComputed && !data.phoneBreakdownError) {
            bd = {
                livePhoneCalls: data.livePhoneCalls || 0,
                completedActivities: data.completedActivities || 0,
                systemAutoTotal: data.systemAutoTotal || 0,
                autoBadNumber: data.autoBreakdown?.badNumber || 0,
                autoDeclined: data.autoBreakdown?.declined || 0,
                autoOther: data.autoBreakdown?.other || 0,
                outcomeCounts: data.phoneOutcomeCounts || {},
                sourceCounts: data.phoneSourceCounts || {},
                outcomeSourceMatrix: data.phoneOutcomeSourceMatrix || {},
                items: data.phoneBreakdownItems || []
            };
        } else {
            // Clicked before the background pass finished (or it errored) — compute now.
            bd = await computeCampaignPhoneBreakdown(campaignId);
            if (data) {
                attachPhoneBreakdown(data, bd);
                data.phoneBreakdownError = false;
                renderCampaignTable();
            }
        }

        const completedNoLiveCall = Math.max(0, bd.completedActivities - bd.livePhoneCalls);

        const card = (value, label, bg, border, valueColor, labelColor) => `
            <div style="background: ${bg}; border: 1px solid ${border}; border-radius: 8px; padding: 0.75rem; text-align: center;">
                <div style="font-size: 1.5rem; font-weight: 800; color: ${valueColor};">${value.toLocaleString()}</div>
                <div style="font-size: 0.7rem; color: ${labelColor}; text-transform: uppercase; font-weight: 600;">${label}</div>
            </div>
        `;

        const summaryCards = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem;">
                ${card(bd.livePhoneCalls, 'Live Calls Placed', '#ecfdf5', '#a7f3d0', '#059669', '#065f46')}
                ${card(bd.completedActivities, 'Activities Completed', '#eff6ff', '#bfdbfe', '#1d4ed8', '#1e40af')}
                ${card(completedNoLiveCall, 'Completed w/o Live Call', '#fffbeb', '#fde68a', '#d97706', '#92400e')}
                ${card(bd.systemAutoTotal, 'System Auto-Resolved', '#fef2f2', '#fecaca', '#dc2626', '#991b1b')}
            </div>
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; color: #1e40af; font-size: 0.85rem;">
                <i class="fas fa-info-circle"></i>
                <strong>Live Calls Placed</strong> comes from campaign_call_tracking — the same source as call_manager.html's "Total Calls" (a real call an agent dialed).
                <strong>${completedNoLiveCall.toLocaleString()}</strong> activities were marked completed with <em>no matching live call</em>. The two tables below answer <em>how</em> each activity got completed (scheduler live call vs. system/cascade auto-completion) and <em>why</em> (its outcome).
            </div>
        `;

        // "How they were completed" — the key view for telling apart a scheduler's real
        // call from the bad-number sweep / cascade auto-completions that mark future or
        // related scheduled calls without a fresh dial.
        const sourceCounts = bd.sourceCounts || {};
        const sourceOrder = ['live-call', 'agent-cascade', 'auto-bad-number', 'auto-declined', 'auto-other', 'no-owner'];
        const totalSourced = sourceOrder.reduce((s, k) => s + (sourceCounts[k] || 0), 0);
        const sourceRows = sourceOrder
            .filter(k => (sourceCounts[k] || 0) > 0)
            .map(k => {
                const meta = PHONE_SOURCE_META[k];
                const count = sourceCounts[k] || 0;
                const pct = totalSourced > 0 ? Math.round((count / totalSourced) * 100) : 0;
                return `
                    <tr>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border);">
                            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${meta.color};margin-right:0.5rem;vertical-align:middle;"></span>
                            <strong>${meta.label}</strong>
                            <div style="font-size:0.75rem; color:var(--gray); margin-left:1rem;">${meta.desc}</div>
                        </td>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); text-align:right; font-weight:700; vertical-align:top;">${count.toLocaleString()}</td>
                        <td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); text-align:right; color:var(--gray); vertical-align:top;">${pct}%</td>
                    </tr>
                `;
            }).join('');

        const sourceTable = sourceRows ? `
            <div style="font-weight: 700; color: var(--primary); margin-bottom: 0.5rem;">How they were completed (${totalSourced.toLocaleString()} activities)</div>
            <table style="width:100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 1.5rem;">
                <thead>
                    <tr>
                        <th style="text-align:left; padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border); color: var(--gray); text-transform: uppercase; font-size: 0.72rem;">Completion source</th>
                        <th style="text-align:right; padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border); color: var(--gray); text-transform: uppercase; font-size: 0.72rem;">Count</th>
                        <th style="text-align:right; padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border); color: var(--gray); text-transform: uppercase; font-size: 0.72rem;">%</th>
                    </tr>
                </thead>
                <tbody>${sourceRows}</tbody>
            </table>
        ` : '';

        // Outcome breakdown table — the definitive "why were they completed" view, now
        // split by source so you can see, per outcome (e.g. bad-number), how many were a
        // scheduler's live call vs. auto-marked by the system/cascade without a call.
        const outcomeMatrix = bd.outcomeSourceMatrix || {};
        const outcomeEntries = Object.entries(bd.outcomeCounts)
            .sort((a, b) => b[1] - a[1]);
        const totalCompleted = bd.completedActivities || outcomeEntries.reduce((s, [, c]) => s + c, 0);
        const th = (txt, align) => `<th style="text-align:${align}; padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border); color: var(--gray); text-transform: uppercase; font-size: 0.72rem;">${txt}</th>`;
        const td = (txt, extra) => `<td style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); ${extra || ''}">${txt}</td>`;

        const outcomeRows = outcomeEntries.map(([outcome, count]) => {
            const cls = classifyPhoneOutcome(outcome === '(none)' ? '' : outcome);
            const pct = totalCompleted > 0 ? Math.round((count / totalCompleted) * 100) : 0;
            const label = outcome === '(none)' ? 'No outcome recorded' : outcome;
            const m = outcomeMatrix[outcome] || { agent: 0, auto: 0, none: 0 };
            return `
                <tr>
                    ${td(`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cls.color};margin-right:0.5rem;"></span>${label}`)}
                    ${td(count.toLocaleString(), 'text-align:right; font-weight:700;')}
                    ${td(m.agent ? `<span style="color:#059669; font-weight:700;">${m.agent.toLocaleString()}</span>` : '<span style="color:var(--border);">—</span>', 'text-align:right;')}
                    ${td(m.auto ? `<span style="color:#d97706; font-weight:700;">${m.auto.toLocaleString()}</span>` : '<span style="color:var(--border);">—</span>', 'text-align:right;')}
                    ${td(m.none ? `<span style="color:#dc2626; font-weight:700;">${m.none.toLocaleString()}</span>` : '<span style="color:var(--border);">—</span>', 'text-align:right;')}
                    ${td(`${pct}%`, 'text-align:right; color:var(--gray);')}
                </tr>
            `;
        }).join('');

        const outcomeTable = outcomeEntries.length > 0 ? `
            <div style="font-weight: 700; color: var(--primary); margin-bottom: 0.5rem;">Why completed — outcome × source (${totalCompleted.toLocaleString()} activities)</div>
            <div style="font-size:0.75rem; color:var(--gray); margin-bottom:0.5rem;">
                <span style="color:#059669; font-weight:700;">Scheduler</span> = agent placed a live call ·
                <span style="color:#d97706; font-weight:700;">Auto-marked</span> = system sweep / cascade, no call ·
                <span style="color:#dc2626; font-weight:700;">No owner</span> = completed with no completer recorded
            </div>
            <table style="width:100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 1.5rem;">
                <thead>
                    <tr>
                        ${th('Outcome', 'left')}
                        ${th('Total', 'right')}
                        ${th('Scheduler', 'right')}
                        ${th('Auto-marked', 'right')}
                        ${th('No owner', 'right')}
                        ${th('%', 'right')}
                    </tr>
                </thead>
                <tbody>${outcomeRows}</tbody>
            </table>
        ` : '';

        // Record list (first 500 to keep the DOM light), sorted by outcome.
        const items = [...bd.items].sort((a, b) =>
            String(a.outcome).localeCompare(String(b.outcome)) || String(a.name).localeCompare(String(b.name)));
        const MAX_ROWS = 500;
        const shown = items.slice(0, MAX_ROWS);
        const itemsHtml = shown.map(it => {
            const dt = it.completedAt ? (window.toDate ? window.toDate(it.completedAt) : new Date(it.completedAt)) : null;
            const dtStr = dt && !isNaN(dt) ? dt.toLocaleDateString() : '';
            const cls = classifyPhoneOutcome(it.outcome);
            const src = PHONE_SOURCE_META[it.source] || PHONE_SOURCE_META['auto-other'];
            return `
                <li class="contact-item">
                    <div>
                        <div class="contact-name">${it.name} <span class="status-badge" style="background:${src.color}22;color:${src.color};">${src.label}</span></div>
                        <div class="contact-company">${it.org || ''}${it.phone ? ' · ' + it.phone : ''}${it.completedBy ? ' · by ' + it.completedBy : ' · no completer'}</div>
                    </div>
                    <div style="text-align: right;">
                        <span class="status-badge" style="background: ${cls.color}22; color: ${cls.color};">${it.outcome || 'no outcome'}</span>
                        ${dtStr ? `<div class="contact-company" style="margin-top: 0.25rem;">${dtStr}</div>` : ''}
                    </div>
                </li>
            `;
        }).join('');

        modalBody.innerHTML = `
            ${summaryCards}
            ${sourceTable}
            ${outcomeTable}
            <div style="margin-bottom: 0.75rem; font-weight: 600; color: var(--primary);">
                Completed activity records${items.length > MAX_ROWS ? ` (showing first ${MAX_ROWS.toLocaleString()} of ${items.length.toLocaleString()})` : ` (${items.length.toLocaleString()})`}
            </div>
            <ul class="contact-list">${itemsHtml}</ul>
        `;

        console.log(`✅ Loaded phone completion breakdown for ${campaignName}: ${bd.livePhoneCalls} live calls, ${bd.completedActivities} completed, ${completedNoLiveCall} w/o live call`);
    } catch (error) {
        console.error('❌ Error loading phone completion breakdown:', error);
        modalBody.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Error loading breakdown: ${error.message}
            </div>
        `;
    }
};

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('outcomeModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
    
    const overrideModal = document.getElementById('overrideModal');
    if (event.target === overrideModal) {
        overrideModal.style.display = 'none';
    }
};

// =============================================================================
// CAMPAIGN VALUE OVERRIDE SYSTEM
// =============================================================================

// Store overrides in Firestore (so backend can apply them during cache refresh)
let campaignOverrides = {};
let currentOverrideCampaignId = null;

// Load overrides from Firestore
async function loadOverrides() {
    try {
        console.log('📝 Loading campaign overrides from Firestore...');
        const { collection, getDocs } = getFirestoreFunctions();
        const overridesCollection = collection(db, 'campaign_analytics_overrides');
        const overridesSnapshot = await getDocs(overridesCollection);
        
        campaignOverrides = {};
        overridesSnapshot.forEach((doc) => {
            campaignOverrides[doc.id] = doc.data();
        });
        
        console.log('✅ Loaded campaign overrides:', Object.keys(campaignOverrides).length, 'campaigns');
    } catch (error) {
        console.error('❌ Error loading overrides:', error);
        campaignOverrides = {};
    }
}

// Save overrides to Firestore
async function saveOverridesToFirestore(campaignId, overrides) {
    try {
        const { doc, setDoc, deleteDoc } = getFirestoreFunctions();
        const overrideDoc = doc(db, 'campaign_analytics_overrides', campaignId);
        
        if (overrides && Object.keys(overrides).length > 0) {
            await setDoc(overrideDoc, {
                ...overrides,
                updatedAt: new Date().toISOString(),
                updatedBy: window.auth?.currentUser?.email || 'unknown'
            });
            console.log('💾 Saved overrides to Firestore for campaign:', campaignId);
        } else {
            await deleteDoc(overrideDoc);
            console.log('🗑️ Deleted overrides from Firestore for campaign:', campaignId);
        }
    } catch (error) {
        console.error('❌ Error saving overrides to Firestore:', error);
        throw error;
    }
}

// Apply overrides to campaign data
function applyOverrides(data) {
    const campaignId = data.campaign.id;
    
    if (campaignOverrides[campaignId]) {
        const overrides = campaignOverrides[campaignId];
        console.log(`🔧 Applying overrides to campaign ${data.campaign.name}:`, overrides);
        
        // Apply each override field
        const fields = [
            'totalRecords', 'reviewedRecords', 'scheduledEmails', 'completedEmails',
            'phoneActivities', 'completedPhone', 'linkedinActivities', 'completedLinkedIn',
            'linkedinConnections', 'outcomesScheduled', 'outcomesInterested',
            'outcomesBounced', 'outcomesDeclined'
        ];
        
        fields.forEach(field => {
            if (overrides[field] !== undefined && overrides[field] !== null && overrides[field] !== '') {
                data[field] = parseInt(overrides[field]);
            }
        });
        
        // Recalculate totals
        data.totalScheduledActivities = data.scheduledEmails + data.phoneActivities + data.linkedinActivities;
        data.totalCompletedActivities = data.completedEmails + data.completedPhone + data.completedLinkedIn;
        
        // Mark as overridden
        data.hasOverrides = true;
    }
    
    return data;
}

// Apply overrides to all campaigns
function applyOverridesToAll() {
    allAnalyticsData = allAnalyticsData.map(data => applyOverrides(data));
    filteredData = [...allAnalyticsData];
}

// Open override modal for a campaign
window.openOverrideModal = function(campaignId, campaignName) {
    currentOverrideCampaignId = campaignId;
    
    const modal = document.getElementById('overrideModal');
    const title = document.getElementById('overrideCampaignName');
    
    title.textContent = campaignName;
    
    // Load existing overrides if any
    const overrides = campaignOverrides[campaignId] || {};
    
    // Populate form with current overrides
    const fields = [
        'totalRecords', 'reviewedRecords', 'scheduledEmails', 'completedEmails',
        'phoneActivities', 'completedPhone', 'linkedinActivities', 'completedLinkedIn',
        'linkedinConnections', 'outcomesScheduled', 'outcomesInterested',
        'outcomesBounced', 'outcomesDeclined'
    ];
    
    fields.forEach(field => {
        const input = document.getElementById(`override_${field}`);
        if (input) {
            input.value = overrides[field] !== undefined ? overrides[field] : '';
        }
    });
    
    modal.style.display = 'block';
};

// Close override modal
window.closeOverrideModal = function() {
    const modal = document.getElementById('overrideModal');
    modal.style.display = 'none';
    currentOverrideCampaignId = null;
};

// Save overrides
window.saveOverrides = async function() {
    if (!currentOverrideCampaignId) return;
    
    const fields = [
        'totalRecords', 'reviewedRecords', 'scheduledEmails', 'completedEmails',
        'phoneActivities', 'completedPhone', 'linkedinActivities', 'completedLinkedIn',
        'linkedinConnections', 'outcomesScheduled', 'outcomesInterested',
        'outcomesBounced', 'outcomesDeclined'
    ];
    
    const overrides = {};
    let hasAnyOverride = false;
    
    fields.forEach(field => {
        const input = document.getElementById(`override_${field}`);
        if (input && input.value !== '') {
            overrides[field] = parseInt(input.value);
            hasAnyOverride = true;
        }
    });
    
    try {
        if (hasAnyOverride) {
            campaignOverrides[currentOverrideCampaignId] = overrides;
            await saveOverridesToFirestore(currentOverrideCampaignId, overrides);
            console.log('✅ Saved overrides for campaign:', currentOverrideCampaignId, overrides);
        } else {
            // If no overrides, remove from storage
            delete campaignOverrides[currentOverrideCampaignId];
            await saveOverridesToFirestore(currentOverrideCampaignId, null);
            console.log('🗑️ Removed overrides for campaign:', currentOverrideCampaignId);
        }
        
        // Reapply overrides and refresh display
        applyOverridesToAll();
        updateKPIs();
        renderCampaignTable();
        
        showAlert('✅ Overrides saved successfully!\n\nNote: These will be applied to the cache on the next scheduled refresh (10 AM or 2 PM MT)', 'success');
        setTimeout(hideAlert, 5000);
        
        closeOverrideModal();
    } catch (error) {
        console.error('❌ Error saving overrides:', error);
        showAlert('❌ Error saving overrides: ' + error.message, 'danger');
    }
};

// Clear all overrides for current campaign
window.clearOverrides = async function() {
    if (!currentOverrideCampaignId) return;
    
    if (confirm('Are you sure you want to clear all overrides for this campaign?')) {
        try {
            delete campaignOverrides[currentOverrideCampaignId];
            await saveOverridesToFirestore(currentOverrideCampaignId, null);
            
            // Reapply overrides and refresh display
            applyOverridesToAll();
            updateKPIs();
            renderCampaignTable();
            
            showAlert('✅ Overrides cleared!', 'success');
            setTimeout(hideAlert, 3000);
            
            closeOverrideModal();
        } catch (error) {
            console.error('❌ Error clearing overrides:', error);
            showAlert('❌ Error clearing overrides: ' + error.message, 'danger');
        }
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initialize();
});
