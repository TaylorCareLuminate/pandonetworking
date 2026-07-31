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
        console.log('🔒 Using CLEmail secure wrapper for analytics');
    } catch (error) {
        console.error('❌ Failed to initialize CLEmail wrapper for analytics:', error);
        throw error;
    }
}

// Helper to get Firestore functions from wrapper
function getFirestoreFunctions() {
    const { collection, getDocs, doc, getDoc, query, where, orderBy, limit } = window.clemailFirestore;
    return { collection, getDocs, doc, getDoc, query, where, orderBy, limit };
}

// Global state
let campaigns = [];
let customers = [];
let bdrLeaders = [];
let allAnalyticsData = [];
let filteredData = [];
let emailTrackingData = new Map(); // Store tracking data by campaign ID

// Initialize the application
async function initialize() {
    console.log('🚀 Initializing Campaign Analytics Dashboard (Cache API)...');
    
    try {
        // Wait for authentication to be ready
        await window.firebaseReady;
        console.log('✅ Authentication ready');
        
        // Initialize Firebase for clemail project (needed for fallback and other features)
        initializeFirebase();
        
        showAlert('Loading pre-computed analytics from cache...', 'info');
        
        // Show dashboard sections immediately
        document.getElementById('kpiSection').style.display = 'grid';
        document.getElementById('dashboardContent').style.display = 'block';
        
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
                    
                    filteredData = [...allAnalyticsData];
                    updateKPIs();
                    renderCampaignTable();
                    
                    console.log(`✅ Loaded ${allAnalyticsData.length} campaigns from PostgreSQL cache!`);
                } else {
                    throw new Error('Cache API not available');
                }
            } catch (cacheError) {
                console.warn('⚠️ Cache API failed, falling back to computing analytics:', cacheError.message);
                
                // Fallback to computing analytics from Firestore
                await Promise.all([
                    loadCustomers(),
                    loadCampaigns(),
                    loadBdrLeaders()
                ]);
                
                await loadCampaignAnalytics();
            }
        } else {
            // Cache API disabled, compute from Firestore
            console.log('📊 Cache API disabled, computing analytics from Firestore...');
            await Promise.all([
                loadCustomers(),
                loadCampaigns(),
                loadBdrLeaders()
            ]);
            
            await loadCampaignAnalytics();
        }
        
        // Load email tracking data from Railway API
        await loadEmailTrackingData();
        
        document.getElementById('loadingSpinner').style.display = 'none';
        
        hideAlert();
        console.log('✅ Dashboard initialized successfully');
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
        customers = [];
        
        customersSnapshot.docs.forEach((doc) => {
            customers.push({ id: doc.id, ...doc.data() });
        });

        // Populate customer filter
        const customerFilter = document.getElementById('customerFilter');
        customerFilter.innerHTML = '<option value="">All Customers</option>';
        
        // Sort customers by name for better UX
        customers.sort((a, b) => {
            const nameA = (a.name || a.id).toLowerCase();
            const nameB = (b.name || b.id).toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = customer.name || customer.id;
            customerFilter.appendChild(option);
        });

        console.log('✅ Loaded customers:', customers.length);
    } catch (error) {
        console.error('❌ Error loading customers:', error);
        throw error;
    }
}

// Load campaigns
async function loadCampaigns() {
    try {
        const { collection, getDocs } = getFirestoreFunctions();
        const campaignsSnapshot = await getDocs(collection(db, 'campaigns'));
        campaigns = [];
        
        campaignsSnapshot.docs.forEach((doc) => {
            campaigns.push({ id: doc.id, ...doc.data() });
        });

        console.log('✅ Loaded campaigns:', campaigns.length);
    } catch (error) {
        console.error('❌ Error loading campaigns:', error);
        throw error;
    }
}

// Load BDR leaders
async function loadBdrLeaders() {
    try {
        const { collection, getDocs } = getFirestoreFunctions();
        const bdrSnapshot = await getDocs(collection(db, 'bdr_leaders'));
        bdrLeaders = [];
        
        bdrSnapshot.docs.forEach((doc) => {
            bdrLeaders.push({ id: doc.id, ...doc.data() });
        });

        console.log('✅ Loaded BDR leaders:', bdrLeaders.length);
    } catch (error) {
        console.error('❌ Error loading BDR leaders:', error);
        throw error;
    }
}

// Load email tracking data from Railway API
async function loadEmailTrackingData() {
    try {
        console.log('📊 Loading email tracking data...');
        emailTrackingData.clear();
        
        for (const campaign of campaigns) {
            try {
                // Call Railway API to get tracking stats for this campaign
                const response = await fetch(`https://railwayclemail-production.up.railway.app/api/tracking/campaign/${campaign.id}/stats`);
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.data) {
                        emailTrackingData.set(campaign.id, result.data);
                        console.log(`✅ Loaded tracking data for campaign ${campaign.name}:`, result.data);
                    }
                } else {
                    console.warn(`⚠️ Failed to load tracking data for campaign ${campaign.name}: ${response.status}`);
                }
            } catch (error) {
                console.warn(`⚠️ Error loading tracking data for campaign ${campaign.name}:`, error);
                // Continue with other campaigns even if one fails
            }
        }
        
        console.log(`✅ Loaded tracking data for ${emailTrackingData.size} campaigns`);
    } catch (error) {
        console.error('❌ Error loading email tracking data:', error);
        // Don't throw error - dashboard should work even without tracking data
    }
}

// Process a single campaign's analytics
async function processCampaignAnalytics(campaign, index, total) {
    try {
        console.log(`  Processing campaign ${index + 1}/${total}: ${campaign.name}...`);
        const customer = customers.find(c => c.id === campaign.customerId);
        
        // Count data in each collection for this campaign
        const [
            outreachSetsCount,
            reviewedCount,
            scheduledEmailsCount,
            completedEmailsCount,
            phoneActivitiesCount,
            completedPhoneCount,
            linkedinActivitiesCount,
            completedLinkedInCount,
            outcomesScheduled,
            outcomesInterested,
            outcomesBounced,
            outcomesDeclined,
            linkedinConnections,
            bdrAssignments
        ] = await Promise.all([
            countDocuments('outreach_sets', 'campaignId', campaign.id),
            countDocuments('outreach_sets', 'campaignId', campaign.id, { approvalStatus: 'approved' }),
            countDocuments('scheduledEmails', 'campaignId', campaign.id),
            countDocuments('scheduledEmails', 'campaignId', campaign.id, { status: 'sent' }),
            countDocuments('phone_activities', 'campaignId', campaign.id),
            countDocuments('phone_activities', 'campaignId', campaign.id, { status: 'completed' }),
            countLinkedInActivities(campaign.id),
            countLinkedInCompleted(campaign.id),
            countScheduledOutcomesDeduped(campaign.id), // Deduplicated by company
            countDocuments('outreach_sets', 'campaignId', campaign.id, { outcomeStatus: 'interested' }),
            countDocuments('outreach_sets', 'campaignId', campaign.id, { outcomeStatus: 'bounced' }),
            countDocuments('outreach_sets', 'campaignId', campaign.id, { outcomeStatus: 'declined' }),
            countLinkedInConnections(campaign.id),
            getBdrAssignments(campaign.id)
        ]);

        const totalScheduledActivities = scheduledEmailsCount + phoneActivitiesCount + linkedinActivitiesCount;
        const totalCompletedActivities = completedEmailsCount + completedPhoneCount + completedLinkedInCount;

        const analyticsData = {
            campaign: campaign,
            customer: customer,
            totalRecords: outreachSetsCount,
            reviewedRecords: reviewedCount,
            scheduledEmails: scheduledEmailsCount,
            completedEmails: completedEmailsCount,
            phoneActivities: phoneActivitiesCount,
            completedPhone: completedPhoneCount,
            linkedinActivities: linkedinActivitiesCount,
            completedLinkedIn: completedLinkedInCount,
            totalScheduledActivities: totalScheduledActivities,
            totalCompletedActivities: totalCompletedActivities,
            outcomesScheduled: outcomesScheduled,
            outcomesInterested: outcomesInterested,
            outcomesBounced: outcomesBounced,
            outcomesDeclined: outcomesDeclined,
            linkedinConnections: linkedinConnections,
            bdrAssignments: bdrAssignments,
            status: determineStatus(outreachSetsCount, reviewedCount, totalScheduledActivities)
        };

        console.log(`  ✓ Completed ${campaign.name}: ${totalScheduledActivities} activities`);
        return analyticsData;
    } catch (campaignError) {
        console.error(`❌ Error processing campaign "${campaign.name}":`, campaignError);
        return null;
    }
}

// Process campaigns in parallel batches
async function processCampaignsInBatches(campaigns, batchSize = 5) {
    const results = [];
    const total = campaigns.length;
    
    for (let i = 0; i < campaigns.length; i += batchSize) {
        const batch = campaigns.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(campaigns.length / batchSize);
        
        console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} campaigns)...`);
        updateLoadingMessage(`Processing campaigns ${i + 1}-${Math.min(i + batchSize, total)} of ${total}...`);
        
        // Process this batch in parallel
        const batchPromises = batch.map((campaign, idx) => 
            processCampaignAnalytics(campaign, i + idx, total)
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(r => r !== null));
        
        // Progressive rendering - update UI after each batch
        allAnalyticsData = results;
        filteredData = [...allAnalyticsData];
        updateKPIs();
        renderCampaignTable();
    }
    
    return results;
}

// Update loading message
function updateLoadingMessage(message) {
    const messageElement = document.getElementById('loadingMessage');
    if (messageElement) {
        messageElement.textContent = message;
    }
}

// Load campaign analytics data
async function loadCampaignAnalytics() {
    try {
        console.log('📊 Starting analytics processing for', campaigns.length, 'campaigns...');
        allAnalyticsData = [];
        
        // Process campaigns in parallel batches of 5
        const results = await processCampaignsInBatches(campaigns, 5);
        
        allAnalyticsData = results;
        filteredData = [...allAnalyticsData];
        updateKPIs();
        renderCampaignTable();
        
        console.log('✅ Loaded analytics for', allAnalyticsData.length, 'campaigns');
    } catch (error) {
        console.error('❌ Error loading campaign analytics:', error);
        throw error;
    }
}

// Count documents in a collection with filters
async function countDocuments(collectionName, field, value, additionalFilters = {}) {
    try {
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        let q = query(collection(db, collectionName), where(field, '==', value));
        
        // Add additional filters
        for (const [filterField, filterValue] of Object.entries(additionalFilters)) {
            q = query(q, where(filterField, '==', filterValue));
        }
        
        const snapshot = await getDocs(q);
        return snapshot.docs.length;
    } catch (error) {
        console.warn(`Warning: Could not count documents in ${collectionName}:`, error);
        return 0;
    }
}

// Count scheduled outcomes with deduplication by company
async function countScheduledOutcomesDeduped(campaignId) {
    try {
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        const q = query(
            collection(db, 'outreach_sets'),
            where('campaignId', '==', campaignId),
            where('outcomeStatus', '==', 'scheduled')
        );
        
        const snapshot = await getDocs(q);
        
        // Deduplicate by company/organization name OR email domain
        const uniqueCompanies = new Set();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            
            // Try to get company name from various fields
            let companyName = (
                data.customFields?.company_name ||  // From custom fields
                data.prospectOrgName ||             // Prospect org name field
                data.companyName ||                 // Direct company name
                data.company ||                     // Alternative field
                data.organization ||                // Organization field
                ''
            ).toLowerCase().trim();
            
            // If no company name, use email domain as organization identifier
            if (!companyName) {
                const email = (data.email || data.prospectEmail || '').toLowerCase().trim();
                if (email && email.includes('@')) {
                    const domain = email.split('@')[1];
                    // Use domain as company identifier (e.g., "gastrohealth.com")
                    // Exclude common personal email providers
                    if (domain && !domain.includes('gmail') && !domain.includes('yahoo') && 
                        !domain.includes('hotmail') && !domain.includes('outlook') && !domain.includes('aol')) {
                        companyName = domain;
                    }
                }
            }
            
            if (companyName) {
                uniqueCompanies.add(companyName);
            } else {
                // If still no company identifier, count individual contact
                uniqueCompanies.add(`__no_company_${doc.id}`);
            }
        });
        
        console.log(`📊 Campaign ${campaignId}: ${snapshot.size} scheduled contacts → ${uniqueCompanies.size} unique orgs`);
        return uniqueCompanies.size;
    } catch (error) {
        console.warn(`Warning: Could not count scheduled outcomes:`, error);
        return 0;
    }
}

// Count LinkedIn activities (all statuses - don't filter by status)
async function countLinkedInActivities(campaignId) {
    try {
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        const q = query(collection(db, 'linkedin_activities'), where('campaignId', '==', campaignId));
        const snapshot = await getDocs(q);
        return snapshot.docs.length;
    } catch (error) {
        console.warn(`Warning: Could not count LinkedIn activities:`, error);
        return 0;
    }
}

// Count completed LinkedIn activities (sent to HeyReach)
async function countLinkedInCompleted(campaignId) {
    try {
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        const q = query(
            collection(db, 'linkedin_activities'), 
            where('campaignId', '==', campaignId),
            where('status', '==', 'sent_to_heyreach')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.length;
    } catch (error) {
        console.warn(`Warning: Could not count completed LinkedIn activities:`, error);
        return 0;
    }
}

// Count LinkedIn connections from HeyReach activity
async function countLinkedInConnections(campaignId) {
    try {
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        // Query heyreach_activity collection for CONNECTION_REQUEST_ACCEPTED events
        const q = query(
            collection(db, 'heyreach_activity'),
            where('campaignId', '==', campaignId),
            where('eventType', '==', 'CONNECTION_REQUEST_ACCEPTED')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.length;
    } catch (error) {
        console.warn(`Warning: Could not count LinkedIn connections:`, error);
        return 0;
    }
}

// Get BDR assignments for a campaign
async function getBdrAssignments(campaignId) {
    try {
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        const assignments = {};
        
        // Check scheduled emails
        const emailQuery = query(
            collection(db, 'scheduledEmails'),
            where('campaignId', '==', campaignId)
        );
        const emailSnapshot = await getDocs(emailQuery);
        
        emailSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.bdrLeaderId) {
                if (!assignments[data.bdrLeaderId]) {
                    assignments[data.bdrLeaderId] = { email: 0, phone: 0, linkedin: 0 };
                }
                assignments[data.bdrLeaderId].email++;
            }
        });

        // Check phone activities
        const phoneQuery = query(
            collection(db, 'phone_activities'),
            where('campaignId', '==', campaignId)
        );
        const phoneSnapshot = await getDocs(phoneQuery);
        
        phoneSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.bdrLeaderId) {
                if (!assignments[data.bdrLeaderId]) {
                    assignments[data.bdrLeaderId] = { email: 0, phone: 0, linkedin: 0 };
                }
                assignments[data.bdrLeaderId].phone++;
            }
        });

        // Check LinkedIn activities
        const linkedinQuery = query(
            collection(db, 'linkedin_activities'),
            where('campaignId', '==', campaignId)
        );
        const linkedinSnapshot = await getDocs(linkedinQuery);
        
        linkedinSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.bdrLeaderId) {
                if (!assignments[data.bdrLeaderId]) {
                    assignments[data.bdrLeaderId] = { email: 0, phone: 0, linkedin: 0 };
                }
                assignments[data.bdrLeaderId].linkedin++;
            }
        });

        return assignments;
    } catch (error) {
        console.warn('Warning: Could not get BDR assignments:', error);
        return {};
    }
}

// Determine campaign status
function determineStatus(total, reviewed, scheduled) {
    if (scheduled > 0) return 'active';
    if (reviewed > 0) return 'paused';
    return 'completed';
}

// Update KPI section
function updateKPIs() {
    const totals = filteredData.reduce((acc, item) => {
        acc.totalRecords += item.totalRecords;
        acc.reviewedRecords += item.reviewedRecords;
        acc.scheduledActivities += item.totalScheduledActivities;
        acc.pendingReview += item.totalRecords - item.reviewedRecords;
        
        // Use completed emails from Firestore
        acc.totalEmailsSent += item.completedEmails || 0;
        
        // Add email tracking metrics for open rates
        const trackingData = emailTrackingData.get(item.campaign.id);
        if (trackingData) {
            acc.totalEmailsOpened += trackingData.uniqueOpens || 0;
            acc.totalOpenRate += trackingData.openRate || 0;
            acc.campaignsWithTracking += 1;
        }
        
        return acc;
    }, { 
        totalRecords: 0, 
        reviewedRecords: 0, 
        scheduledActivities: 0, 
        pendingReview: 0,
        totalEmailsSent: 0,
        totalEmailsOpened: 0,
        totalOpenRate: 0,
        campaignsWithTracking: 0
    });

    // Calculate average open rate
    const avgOpenRate = totals.campaignsWithTracking > 0 ? 
        (totals.totalOpenRate / totals.campaignsWithTracking) : 0;

    document.getElementById('totalRecords').textContent = totals.totalRecords.toLocaleString();
    document.getElementById('totalReviewed').textContent = totals.reviewedRecords.toLocaleString();
    document.getElementById('totalScheduled').textContent = totals.scheduledActivities.toLocaleString();
    document.getElementById('totalEmailsSent').textContent = totals.totalEmailsSent.toLocaleString();
    document.getElementById('totalEmailsOpened').textContent = totals.totalEmailsOpened.toLocaleString();
    document.getElementById('avgOpenRate').textContent = avgOpenRate.toFixed(1) + '%';
}

// Helper function to safely escape text for HTML attributes
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Helper function to escape text for use in onclick attributes
function escapeForOnclick(text) {
    return (text || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
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
        // Calculate progress using new formula: 
        // (% Calls Completed) * (1/3) + (% Emails Completed) * (1/3) + (% LinkedIn Contacts Sent) * (1/3)
        const emailPercent = data.scheduledEmails > 0 
            ? (data.completedEmails / data.scheduledEmails) * 100 
            : 0;
        const phonePercent = data.phoneActivities > 0 
            ? (data.completedPhone / data.phoneActivities) * 100 
            : 0;
        const linkedinPercent = data.linkedinActivities > 0 
            ? (data.completedLinkedIn / data.linkedinActivities) * 100 
            : 0;
        
        const progressPercent = Math.round((emailPercent + phonePercent + linkedinPercent) / 3);

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
                    <div class="campaign-name">${data.campaign.name}</div>
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
                        <span class="metric-value" style="font-weight: 700;">${data.completedPhone}</span>
                        <span style="color: var(--gray); margin: 0 0.25rem;">/</span>
                        <span style="color: var(--gray);">${data.phoneActivities}</span>
                    </div>
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
                          onclick="showOutcomeContacts('${data.campaign.id}', 'scheduled', '${escapeForOnclick(data.campaign.name)}', 'Scheduled')" 
                          title="Click to view contacts">
                        ${data.outcomesScheduled || 0}
                    </span>
                </td>
                <td>
                    <span class="metric-value clickable-metric" style="font-weight: 600; color: #3b82f6;" 
                          onclick="showOutcomeContacts('${data.campaign.id}', 'interested', '${escapeForOnclick(data.campaign.name)}', 'Interested')" 
                          title="Click to view contacts">
                        ${data.outcomesInterested || 0}
                    </span>
                </td>
                <td>
                    <span class="metric-value clickable-metric" style="font-weight: 600; color: #f59e0b;" 
                          onclick="showOutcomeContacts('${data.campaign.id}', 'bounced', '${escapeForOnclick(data.campaign.name)}', 'Bounced')" 
                          title="Click to view contacts">
                        ${data.outcomesBounced || 0}
                    </span>
                </td>
                <td>
                    <span class="metric-value clickable-metric" style="font-weight: 600; color: #ef4444;" 
                          onclick="showOutcomeContacts('${data.campaign.id}', 'declined', '${escapeForOnclick(data.campaign.name)}', 'Declined')" 
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

// Filter campaigns by customer
window.filterCampaigns = function() {
    const customerFilter = document.getElementById('customerFilter').value;
    
    if (customerFilter) {
        filteredData = allAnalyticsData.filter(data => data.customer && data.customer.id === customerFilter);
    } else {
        filteredData = [...allAnalyticsData];
    }
    
    updateKPIs();
    renderCampaignTable();
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
        'Customer',
        'Status',
        'Total Records',
        'Reviewed Records',
        'Scheduled Activities',
        'Completed Activities',
        'Activity Completion %',
        'Scheduled Emails',
        'Completed Emails',
        'Phone Activities',
        'Completed Phone',
        'LinkedIn Activities',
        'Completed LinkedIn',
        'LinkedIn Connections',
        'Outcomes - Scheduled',
        'Outcomes - Interested',
        'Outcomes - Bounced',
        'Outcomes - Declined',
        'BDR Assignments',
        'Created Date'
    ];

    const rows = filteredData.map(data => {
        // Use new completion formula
        const emailPercent = data.scheduledEmails > 0 
            ? (data.completedEmails / data.scheduledEmails) * 100 
            : 0;
        const phonePercent = data.phoneActivities > 0 
            ? (data.completedPhone / data.phoneActivities) * 100 
            : 0;
        const linkedinPercent = data.linkedinActivities > 0 
            ? (data.completedLinkedIn / data.linkedinActivities) * 100 
            : 0;
        
        const progressPercent = Math.round((emailPercent + phonePercent + linkedinPercent) / 3);

        const bdrAssignments = Object.entries(data.bdrAssignments).map(([bdrId, counts]) => {
            const bdr = bdrLeaders.find(b => b.id === bdrId);
            const bdrName = bdr ? bdr.name : 'Unknown BDR';
            const totalAssignments = counts.email + counts.phone + counts.linkedin;
            return `${bdrName}: ${totalAssignments}`;
        }).join('; ');

        return [
            data.campaign.name,
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
            data.completedPhone,
            data.linkedinActivities,
            data.completedLinkedIn,
            data.linkedinConnections || 0,
            data.outcomesScheduled || 0,
            data.outcomesInterested || 0,
            data.outcomesBounced || 0,
            data.outcomesDeclined || 0,
            bdrAssignments || 'No assignments',
            data.campaign.createdAt ? new Date(data.campaign.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'
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
}

// Refresh dashboard
window.refreshDashboard = function() {
    location.reload();
};

// Show alert
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-triangle' : 'info-circle'}"></i>
        ${message}
    `;
    alertContainer.appendChild(alertDiv);
    
    if (type !== 'danger') {
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
    }
}

// Hide alerts
function hideAlert() {
    document.getElementById('alertContainer').innerHTML = '';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initialize);

// Show tracking details modal
window.showTrackingDetails = async function(campaignId) {
    const campaign = campaigns.find(c => c.id === campaignId);
    const customer = customers.find(c => c.id === campaign?.customerId);
    
    if (!campaign) {
        console.error('Campaign not found:', campaignId);
        return;
    }

    // Set modal title
    document.getElementById('trackingModalTitle').textContent = 
        `Email Tracking Details - ${campaign.name}`;

    // Show modal
    document.getElementById('trackingModal').style.display = 'flex';

    // Show loading state
    document.getElementById('trackingModalContent').innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner"></i>
            Loading detailed tracking information...
        </div>
    `;

    try {
        // Fetch detailed tracking data
        const response = await fetch(`https://railwayclemail-production.up.railway.app/api/tracking/campaign/${campaignId}/details`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch tracking details');
        }

        const trackingDetails = result.data;
        
        // Render detailed tracking information
        renderTrackingDetails(trackingDetails, campaign, customer);
        
    } catch (error) {
        console.error('Error fetching tracking details:', error);
        document.getElementById('trackingModalContent').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Error loading tracking details: ${error.message}
            </div>
        `;
    }
};

// Close tracking modal
window.closeTrackingModal = function() {
    document.getElementById('trackingModal').style.display = 'none';
};

// Render tracking details in modal
function renderTrackingDetails(trackingDetails, campaign, customer) {
    const stats = trackingDetails.stats || {};
    const emails = trackingDetails.emails || [];
    
    const content = `
        <div class="tracking-stats-grid">
            <div class="tracking-stat-card" style="--stat-color: #3b82f6;">
                <div class="tracking-stat-value">${(stats.totalTrackedEmails || 0).toLocaleString()}</div>
                <div class="tracking-stat-label">Total Tracked Emails</div>
            </div>
            <div class="tracking-stat-card" style="--stat-color: #10b981;">
                <div class="tracking-stat-value">${(stats.uniqueOpens || 0).toLocaleString()}</div>
                <div class="tracking-stat-label">Unique Opens</div>
            </div>
            <div class="tracking-stat-card" style="--stat-color: #f59e0b;">
                <div class="tracking-stat-value">${(stats.totalOpens || 0).toLocaleString()}</div>
                <div class="tracking-stat-label">Total Opens</div>
            </div>
            <div class="tracking-stat-card" style="--stat-color: #ef4444;">
                <div class="tracking-stat-value">${(stats.openRate || 0).toFixed(1)}%</div>
                <div class="tracking-stat-label">Open Rate</div>
            </div>
        </div>

        <div class="dashboard-card">
            <div class="card-header">
                <div class="card-title">
                    <i class="fas fa-list"></i>
                    Email Tracking Records
                </div>
            </div>
            <div class="card-body" style="padding: 0; max-height: 400px; overflow-y: auto;">
                ${emails.length > 0 ? `
                    <table class="tracking-details-table">
                        <thead>
                            <tr>
                                <th>Recipient</th>
                                <th>Subject</th>
                                <th>Sent Date</th>
                                <th>Status</th>
                                <th>Opens</th>
                                <th>First Opened</th>
                                <th>Last Opened</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${emails.map(email => `
                                <tr>
                                    <td>${email.recipientEmail || 'N/A'}</td>
                                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" 
                                        title="${email.subject || 'N/A'}">${email.subject || 'N/A'}</td>
                                    <td>${email.sentAt ? new Date(email.sentAt).toLocaleString() : 'N/A'}</td>
                                    <td>
                                        <span class="open-indicator ${email.openCount > 0 ? 'opened' : 'not-opened'}">
                                            <i class="fas fa-${email.openCount > 0 ? 'envelope-open' : 'envelope'}"></i>
                                            ${email.openCount > 0 ? 'Opened' : 'Not Opened'}
                                        </span>
                                    </td>
                                    <td><strong>${email.openCount || 0}</strong></td>
                                    <td>${email.firstOpenedAt ? new Date(email.firstOpenedAt).toLocaleString() : '-'}</td>
                                    <td>${email.lastOpenedAt ? new Date(email.lastOpenedAt).toLocaleString() : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : `
                    <div class="no-data">
                        <i class="fas fa-inbox"></i>
                        <p>No tracked emails found for this campaign.</p>
                    </div>
                `}
            </div>
        </div>
    `;
    
    document.getElementById('trackingModalContent').innerHTML = content;
}

// Show outcome contacts in modal
window.showOutcomeContacts = async function(campaignId, outcomeStatus, campaignName, outcomeLabel) {
    const modal = document.getElementById('outcomeModal');
    const modalTitle = document.getElementById('outcomeModalTitle');
    const modalBody = document.getElementById('outcomeModalBody');
    
    // Show modal with loading state
    modal.style.display = 'block';
    modalTitle.innerHTML = `<i class="fas fa-users"></i> ${outcomeLabel} Contacts - ${campaignName}`;
    modalBody.innerHTML = `
        <div class="loading-modal">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading contacts...</p>
        </div>
    `;
    
    try {
        console.log(`Fetching ${outcomeLabel} contacts for campaign ${campaignId}...`);
        
        const { collection, getDocs, query, where } = getFirestoreFunctions();
        
        // Query outreach_sets with the specific outcome status
        const contactsQuery = query(
            collection(db, 'outreach_sets'),
            where('campaignId', '==', campaignId),
            where('outcomeStatus', '==', outcomeStatus)
        );
        
        const contactsSnapshot = await getDocs(contactsQuery);
        
        if (contactsSnapshot.docs.length === 0) {
            modalBody.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No contacts found with outcome: ${outcomeLabel}</p>
                </div>
            `;
            return;
        }
        
        const contacts = [];
        contactsSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            contacts.push({ 
                id: doc.id, 
                ...data 
            });
        });
        
        // Sort by name
        contacts.sort((a, b) => {
            const nameA = a.fullName || a.name || a.firstName + ' ' + a.lastName || '';
            const nameB = b.fullName || b.name || b.firstName + ' ' + b.lastName || '';
            return nameA.localeCompare(nameB);
        });
        
        // Render contacts
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
        
        console.log(`✅ Loaded ${contacts.length} contacts with outcome: ${outcomeLabel}`);
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

// Close outcome modal
window.closeOutcomeModal = function() {
    const modal = document.getElementById('outcomeModal');
    modal.style.display = 'none';
};

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const outcomeModal = document.getElementById('outcomeModal');
    if (event.target === outcomeModal) {
        outcomeModal.style.display = 'none';
    }
});
