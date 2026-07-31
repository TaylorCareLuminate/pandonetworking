/**
 * Analytics Cache API Client
 * Client-side module for fetching pre-computed analytics from cache service
 */

// Configure the API endpoint
const ANALYTICS_CACHE_API = 'https://railwayclemail-production.up.railway.app/api/analytics';
const CLIENT_PORTAL_API = 'https://railwayclemail-production.up.railway.app/api/client-portal';

// Flag to enable/disable cache (for gradual rollout)
const USE_CACHE = true;

/**
 * Fetch all campaign analytics from cache
 */
async function fetchCampaignAnalytics() {
    try {
        console.log('📊 Fetching campaign analytics from cache...');
        const startTime = Date.now();
        
        const response = await fetch(`${ANALYTICS_CACHE_API}/campaigns`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        const duration = Date.now() - startTime;
        
        console.log(`✅ Loaded ${result.count} campaigns from cache in ${duration}ms`);
        console.log(`   Last cache update: ${result.timestamp}`);
        
        return result.data;
    } catch (error) {
        console.error('❌ Error fetching campaign analytics from cache:', error);
        throw error;
    }
}

/**
 * Fetch campaign analytics for a specific customer
 */
async function fetchCustomerCampaigns(customerId) {
    try {
        console.log(`📊 Fetching campaigns for customer ${customerId} from cache...`);
        const startTime = Date.now();
        
        const response = await fetch(`${ANALYTICS_CACHE_API}/campaigns/${customerId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        const duration = Date.now() - startTime;
        
        console.log(`✅ Loaded ${result.count} campaigns from cache in ${duration}ms`);
        
        return result.data;
    } catch (error) {
        console.error('❌ Error fetching customer campaigns from cache:', error);
        throw error;
    }
}

/**
 * Fetch client portal data for a customer
 */
async function fetchClientPortalData(customerId) {
    try {
        console.log(`🏢 Fetching client portal data for ${customerId} from cache...`);
        const startTime = Date.now();
        
        const response = await fetch(`${CLIENT_PORTAL_API}/${customerId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        const duration = Date.now() - startTime;
        
        console.log(`✅ Loaded client portal data from cache in ${duration}ms`);
        
        return result.data;
    } catch (error) {
        console.error('❌ Error fetching client portal data from cache:', error);
        throw error;
    }
}

/**
 * Get cache status
 */
async function getCacheStatus() {
    try {
        const response = await fetch(`${ANALYTICS_CACHE_API}/status`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.status;
    } catch (error) {
        console.error('❌ Error fetching cache status:', error);
        throw error;
    }
}

/**
 * Fetch detailed outcome contacts for a customer (with names, orgs, emails)
 * @param {string} customerId - The customer ID
 * @param {string} status - Optional filter: 'scheduled', 'interested', or 'declined'
 */
async function fetchOutcomeDetails(customerId, status = null) {
    try {
        console.log(`🎯 Fetching detailed outcomes for ${customerId}${status ? ` (${status})` : ''}...`);
        const startTime = Date.now();
        
        let url = `${CLIENT_PORTAL_API}/${customerId}/outcomes`;
        if (status) {
            url += `?status=${status}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        const duration = Date.now() - startTime;
        
        console.log(`✅ Loaded ${result.count} detailed outcomes in ${duration}ms`);
        
        return result.outcomes;
    } catch (error) {
        console.error('❌ Error fetching outcome details:', error);
        throw error;
    }
}

/**
 * Trigger cache refresh (async)
 */
async function triggerCacheRefresh(type = 'full') {
    try {
        console.log(`🔄 Triggering ${type} cache refresh...`);
        
        const response = await fetch(`${ANALYTICS_CACHE_API}/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: type,
                triggeredBy: 'frontend_manual'
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ Cache refresh triggered:', result);
        
        return result;
    } catch (error) {
        console.error('❌ Error triggering cache refresh:', error);
        throw error;
    }
}

/**
 * Transform cached data to match frontend format
 */
function transformCachedCampaignData(cachedData, customers, bdrLeaders) {
    return cachedData.map(item => {
        // Find customer (if not provided in cache, fetch from customers list)
        let customer = customers.find(c => c.id === item.customer_id);
        if (!customer && item.customer_name) {
            // Create customer object from cached data
            customer = {
                id: item.customer_id,
                name: item.customer_name
            };
        }
        
        // Parse BDR assignments (might be object or string)
        let bdrAssignments = item.bdr_assignments || {};
        if (typeof bdrAssignments === 'string') {
            try {
                bdrAssignments = JSON.parse(bdrAssignments);
            } catch (e) {
                console.warn('Failed to parse BDR assignments:', e);
                bdrAssignments = {};
            }
        }
        
        return {
            campaign: {
                id: item.campaign_id,
                name: item.campaign_name,
                customerId: item.customer_id,
                createdAt: item.campaign_created_at ? { 
                    seconds: new Date(item.campaign_created_at).getTime() / 1000 
                } : null
            },
            customer: customer,
            status: item.status,
            // 'standard' (scheduled via campaign_schedule.html) or 'phone_only'
            // (no-contact org calling campaigns scheduled via phone_campaigns.html)
            campaignType: item.campaign_type || 'standard',
            totalRecords: item.total_records || 0,
            reviewedRecords: item.reviewed_records || 0,
            scheduledEmails: item.scheduled_emails || 0,
            completedEmails: item.completed_emails || 0,
            phoneActivities: item.phone_activities || 0,
            completedPhone: item.completed_phone || 0,
            linkedinActivities: item.linkedin_activities || 0,
            completedLinkedIn: item.completed_linkedin || 0,
            linkedinConnections: item.linkedin_connections || 0,
            totalScheduledActivities: item.total_scheduled_activities || 0,
            totalCompletedActivities: item.total_completed_activities || 0,
            outcomesScheduled: item.outcomes_scheduled || 0,
            outcomesInterested: item.outcomes_interested || 0,
            outcomesBounced: item.outcomes_bounced || 0,
            outcomesDeclined: item.outcomes_declined || 0,
            bdrAssignments: bdrAssignments,
            hasManualOverrides: item.has_manual_overrides || false,
            lastComputed: item.last_computed
        };
    });
}

/**
 * Check if cache API is available
 */
async function isCacheAvailable() {
    try {
        const response = await fetch(`${ANALYTICS_CACHE_API.replace('/api/analytics', '/health')}`);
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Export functions
window.analyticsCacheAPI = {
    USE_CACHE,
    fetchCampaignAnalytics,
    fetchCustomerCampaigns,
    fetchClientPortalData,
    fetchOutcomeDetails,
    getCacheStatus,
    triggerCacheRefresh,
    transformCachedCampaignData,
    isCacheAvailable
};

console.log('✅ Analytics Cache API client loaded');
console.log(`   Cache enabled: ${USE_CACHE}`);
console.log(`   API endpoint: ${ANALYTICS_CACHE_API}`);

