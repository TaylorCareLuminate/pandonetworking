/**
 * HeyReach Auto-Resume Job
 * 
 * This script automatically resumes paused/completed "Connect" and "Message" campaigns
 * for all active customers with HeyReach enabled.
 * 
 * Schedule: Run daily at 2:00 AM (via cron job or task scheduler)
 * 
 * Usage:
 *   node heyreach-auto-resume.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
    try {
        // Try to initialize with service account
        const serviceAccount = require('./serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin initialized with service account');
    } catch (error) {
        // Fallback to default credentials
        admin.initializeApp();
        console.log('✅ Firebase Admin initialized with default credentials');
    }
}

const db = admin.firestore();

// Railway API URL for HeyReach proxy
const RAILWAY_API_URL = process.env.RAILWAY_API_URL || 'https://clemailapi-production.up.railway.app';

// Priority campaign types (Connect and Message)
const PRIORITY_TYPES = ['connect', 'message'];

/**
 * Detect campaign type based on name
 */
function detectCampaignType(campaignName) {
    const name = campaignName.toLowerCase();
    
    if (name.includes('connect') || name.includes('connection')) {
        return 'connect';
    } else if (name.includes('message') || name.includes('msg')) {
        return 'message';
    } else if (name.includes('like') || name.includes('engage')) {
        return 'like';
    }
    
    return 'other';
}

/**
 * Check if campaign is a priority campaign
 */
function isPriorityCampaign(campaign) {
    const detectedType = detectCampaignType(campaign.name);
    return PRIORITY_TYPES.includes(detectedType);
}

/**
 * Resume a specific campaign
 */
async function resumeCampaign(campaignId, apiKey) {
    try {
        const response = await fetch(`${RAILWAY_API_URL}/proxy/heyreach/campaign/resume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                campaignId: campaignId
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        return { success: true, result };
    } catch (error) {
        console.error(`   ❌ Error resuming campaign ${campaignId}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Fetch all campaigns for a customer
 */
async function fetchCampaigns(apiKey) {
    try {
        const response = await fetch(`${RAILWAY_API_URL}/proxy/heyreach/campaigns/getall`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                offset: 0,
                limit: 100
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        return result.items || result.list || [];
    } catch (error) {
        console.error(`   ❌ Error fetching campaigns:`, error.message);
        throw error;
    }
}

/**
 * Process a single customer
 */
async function processCustomer(customer) {
    console.log(`\n📊 Processing customer: ${customer.name}`);
    
    if (!customer.heyreachApiKey) {
        console.log('   ⚠️  No HeyReach API key configured');
        return {
            customerId: customer.id,
            customerName: customer.name,
            success: false,
            error: 'No API key',
            campaignsResumed: 0
        };
    }
    
    try {
        // Fetch all campaigns
        console.log('   🔍 Fetching campaigns...');
        const campaigns = await fetchCampaigns(customer.heyreachApiKey);
        console.log(`   📋 Found ${campaigns.length} campaigns`);
        
        let resumedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;
        const resumedCampaigns = [];
        const failedCampaigns = [];
        
        // Process each campaign
        for (const campaign of campaigns) {
            const isPriority = isPriorityCampaign(campaign);
            const detectedType = detectCampaignType(campaign.name);
            
            // Status: 1 = Running, 2 = Paused, 3 = Completed
            const needsResume = campaign.status === 2 || campaign.status === 3;
            
            if (!isPriority) {
                skippedCount++;
                continue;
            }
            
            if (!needsResume) {
                console.log(`   ⏭️  Skipping "${campaign.name}" (${detectedType}) - Already running`);
                skippedCount++;
                continue;
            }
            
            // This is a priority campaign that needs resuming
            console.log(`   ▶️  Resuming "${campaign.name}" (${detectedType}, status: ${campaign.status})`);
            
            const resumeResult = await resumeCampaign(campaign.id, customer.heyreachApiKey);
            
            if (resumeResult.success) {
                resumedCount++;
                resumedCampaigns.push({
                    id: campaign.id,
                    name: campaign.name,
                    type: detectedType,
                    previousStatus: campaign.status
                });
                console.log(`   ✅ Successfully resumed "${campaign.name}"`);
            } else {
                failedCount++;
                failedCampaigns.push({
                    id: campaign.id,
                    name: campaign.name,
                    type: detectedType,
                    error: resumeResult.error
                });
                console.log(`   ❌ Failed to resume "${campaign.name}": ${resumeResult.error}`);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log(`\n   📊 Summary for ${customer.name}:`);
        console.log(`      ✅ Resumed: ${resumedCount}`);
        console.log(`      ❌ Failed: ${failedCount}`);
        console.log(`      ⏭️  Skipped: ${skippedCount}`);
        
        return {
            customerId: customer.id,
            customerName: customer.name,
            success: true,
            totalCampaigns: campaigns.length,
            campaignsResumed: resumedCount,
            campaignsFailed: failedCount,
            campaignsSkipped: skippedCount,
            resumedCampaigns,
            failedCampaigns
        };
        
    } catch (error) {
        console.error(`   ❌ Error processing customer:`, error.message);
        return {
            customerId: customer.id,
            customerName: customer.name,
            success: false,
            error: error.message,
            campaignsResumed: 0
        };
    }
}

/**
 * Main execution function
 */
async function main() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   HeyReach Auto-Resume Job                             ║');
    console.log('║   Automatically resume priority campaigns              ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    const startTime = Date.now();
    
    try {
        // Fetch all active customers with HeyReach enabled
        console.log('🔍 Fetching customers with HeyReach enabled...');
        
        const customersSnapshot = await db.collection('customers')
            .where('heyreachEnabled', '==', true)
            .where('status', '==', 'active')
            .get();
        
        if (customersSnapshot.empty) {
            console.log('⚠️  No active customers with HeyReach enabled found');
            return;
        }
        
        console.log(`✅ Found ${customersSnapshot.size} customers with HeyReach enabled\n`);
        
        const results = [];
        
        // Process each customer
        for (const customerDoc of customersSnapshot.docs) {
            const customer = {
                id: customerDoc.id,
                ...customerDoc.data()
            };
            
            const result = await processCustomer(customer);
            results.push(result);
            
            // Small delay between customers to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Calculate totals
        const totalCustomersProcessed = results.length;
        const successfulCustomers = results.filter(r => r.success).length;
        const failedCustomers = results.filter(r => !r.success).length;
        const totalCampaignsResumed = results.reduce((sum, r) => sum + (r.campaignsResumed || 0), 0);
        
        // Print final summary
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║   FINAL SUMMARY                                        ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log(`\n📊 Customers Processed: ${totalCustomersProcessed}`);
        console.log(`   ✅ Successful: ${successfulCustomers}`);
        console.log(`   ❌ Failed: ${failedCustomers}`);
        console.log(`\n▶️  Total Campaigns Resumed: ${totalCampaignsResumed}`);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n⏱️  Duration: ${duration}s`);
        
        // Log to Firebase
        await db.collection('system_logs').add({
            type: 'heyreach_auto_resume',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            duration: parseFloat(duration),
            totalCustomersProcessed,
            successfulCustomers,
            failedCustomers,
            totalCampaignsResumed,
            results: results.map(r => ({
                customerId: r.customerId,
                customerName: r.customerName,
                success: r.success,
                campaignsResumed: r.campaignsResumed,
                error: r.error
            })),
            status: 'completed'
        });
        
        console.log('\n✅ Log saved to Firebase system_logs collection');
        
        // If there were any failures, print details
        if (failedCustomers > 0) {
            console.log('\n⚠️  Failed Customers:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`   • ${r.customerName}: ${r.error}`);
            });
        }
        
        // Print resumed campaigns summary
        if (totalCampaignsResumed > 0) {
            console.log('\n✅ Resumed Campaigns:');
            results.forEach(r => {
                if (r.resumedCampaigns && r.resumedCampaigns.length > 0) {
                    console.log(`\n   ${r.customerName}:`);
                    r.resumedCampaigns.forEach(c => {
                        console.log(`      • ${c.name} (${c.type})`);
                    });
                }
            });
        }
        
        console.log('\n✅ Auto-resume job completed successfully!\n');
        
    } catch (error) {
        console.error('\n❌ Fatal error during auto-resume job:', error);
        
        // Log error to Firebase
        try {
            await db.collection('system_logs').add({
                type: 'heyreach_auto_resume',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'error',
                error: error.message,
                stack: error.stack
            });
        } catch (logError) {
            console.error('Failed to log error to Firebase:', logError);
        }
        
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main()
        .then(() => {
            console.log('🎉 Job finished');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Job failed:', error);
            process.exit(1);
        });
}

module.exports = { main, processCustomer, resumeCampaign, isPriorityCampaign };











