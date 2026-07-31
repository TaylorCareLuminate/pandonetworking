/**
 * Shared Message Filtering Logic for Connect Queue
 * 
 * This module provides consistent filtering logic across all connect queue pages:
 * - connect_review.html (Queue 1 - Admin Review)
 * - generate_messages.html (Message Generation)
 * - connect_push.html (Push to HeyReach)
 * 
 * Ensures all pages show identical message counts and apply the same business rules.
 */

/**
 * Normalize LinkedIn URL for consistent comparison
 * @param {string} url - LinkedIn URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeLinkedInUrl(url) {
    if (!url) return '';
    return url.toLowerCase()
        .replace(/\/$/, '')
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '');
}

/**
 * Check if a contact has an approved message in the past 75 days
 * Used to prevent duplicate messages to the same contact
 * 
 * @param {string} linkedinUrl - LinkedIn profile URL to check
 * @param {Array} allMessages - All messages in the queue (pending + approved)
 * @param {Array} approvedMessages - Optional separate array of approved messages for more complete checking
 * @returns {boolean} True if contact has approved message in past 75 days
 */
function hasApprovedMessageInPast45Days(linkedinUrl, allMessages, approvedMessages = null) {
    if (!linkedinUrl) return false;
    
    const normalizedProspectUrl = normalizeLinkedInUrl(linkedinUrl);
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 75);
    
    // Helper function to check a single message
    const checkMessage = (msg) => {
        // CRITICAL: Skip deleted messages - they shouldn't block other posts
        if (msg.deleted) return false;
        
        // Must be reviewed (approved) OR pending customer review (approved in Queue 1)
        // OR have reviewStatus 'approved' (fully approved in both queues)
        const isApproved = msg.reviewed || 
                          msg.reviewStatus === 'pending_customer_review' || 
                          msg.reviewStatus === 'approved';
        if (!isApproved) return false;
        
        // Check review date - use adminApprovedAt, customerApprovedAt, or review_date
        const reviewDateStr = msg.adminApprovedAt || msg.customerApprovedAt || msg.review_date;
        if (!reviewDateStr) return false;
        
        // Check if review date is within past 75 days
        const reviewDate = new Date(reviewDateStr);
        if (reviewDate < fortyFiveDaysAgo) return false;
        
        // Check if LinkedIn URL matches. Exact match only — normalizeLinkedInUrl()
        // already produces a canonical form, so a substring/.includes() check here
        // would falsely treat two *different* people as duplicates whenever one
        // profile slug happens to be a prefix of another (e.g. "linkedin.com/in/robert"
        // vs "linkedin.com/in/robertkrummen"), incorrectly suppressing legitimate,
        // distinct contacts from review.
        const msgUrl = normalizeLinkedInUrl(msg.prospect_li_url);
        if (!msgUrl) return false;
        
        return msgUrl === normalizedProspectUrl;
    };
    
    // Check allMessages first
    if (allMessages && allMessages.some(checkMessage)) {
        return true;
    }
    
    // If a separate approvedMessages array was provided, check it too
    if (approvedMessages && approvedMessages.some(checkMessage)) {
        return true;
    }
    
    return false;
}

/**
 * Filter messages for Queue 1 (Admin Review)
 * Shows messages that need admin review, excluding:
 * - Deleted messages
 * - Already approved/rejected messages
 * - Messages older than 30 days
 * - Contacts with approved messages in past 75 days (duplicates)
 * 
 * @param {Array} allMessages - All messages from connect_queue
 * @param {Array} approvedMessages - Optional: Array of approved messages from the past 75 days for duplicate checking
 * @returns {Object} Filtered messages and statistics
 */
function filterMessagesForAdminQueue(allMessages, approvedMessages = null) {
    const stats = {
        total: allMessages.length,
        deleted: 0,
        wrongStatus: 0,
        tooOld: 0,
        duplicates: 0,
        visible: 0
    };
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Stage 1: Filter by status and age
    let messagesToFilter = allMessages.filter(msg => {
        if (msg.deleted) {
            stats.deleted++;
            return false;
        }
        
        // Queue 1: Show pending admin review only
        const reviewStatus = msg.reviewStatus || 'pending_admin_review';
        if (reviewStatus !== 'pending_admin_review') {
            stats.wrongStatus++;
            return false;
        }
        
        // NEW: Only show messages created in past 30 days
        const createdAt = msg.createdAt || msg.created_at || msg.timestamp;
        if (createdAt) {
            const messageDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
            if (messageDate < thirtyDaysAgo) {
                stats.tooOld++;
                return false;
            }
        }
        
        return true;
    });
    
    // Stage 2: Filter duplicates (contacts with approved messages in past 75 days)
    const filteredMessages = messagesToFilter.filter(msg => {
        const isDuplicate = hasApprovedMessageInPast45Days(msg.prospect_li_url, allMessages, approvedMessages);
        if (isDuplicate) {
            stats.duplicates++;
            return false;
        }
        return true;
    });
    
    stats.visible = filteredMessages.length;
    
    return {
        messages: filteredMessages,
        stats: stats
    };
}

/**
 * Filter messages for Queue 2 (Customer Review)
 * Shows messages that BDRs need to review
 * 
 * @param {Array} allMessages - All messages from connect_queue
 * @returns {Object} Filtered messages and statistics
 */
function filterMessagesForCustomerQueue(allMessages) {
    const stats = {
        total: allMessages.length,
        deleted: 0,
        wrongStatus: 0,
        visible: 0
    };
    
    const filteredMessages = allMessages.filter(msg => {
        if (msg.deleted) {
            stats.deleted++;
            return false;
        }
        
        // Queue 2: Show pending customer review
        if (msg.reviewStatus !== 'pending_customer_review') {
            stats.wrongStatus++;
            return false;
        }
        
        return true;
    });
    
    stats.visible = filteredMessages.length;
    
    return {
        messages: filteredMessages,
        stats: stats
    };
}

/**
 * Count messages per BDR for Admin Queue (what shows in connect_review.html)
 * Returns counts that match exactly what BDRs see in Queue 1
 * 
 * @param {Array} allMessages - All messages from connect_queue
 * @returns {Object} Message counts per BDR email
 */
function countMessagesPerBDRForAdminQueue(allMessages) {
    const { messages, stats } = filterMessagesForAdminQueue(allMessages);
    
    const bdrCounts = {};
    
    messages.forEach(msg => {
        const bdrEmail = msg.bdr_auth_email || msg.accountEmail;
        if (!bdrEmail) return;
        
        if (!bdrCounts[bdrEmail]) {
            bdrCounts[bdrEmail] = { connect: 0, message: 0, total: 0 };
        }
        
        bdrCounts[bdrEmail].total++;
        
        const messageType = (msg.message_type || 'message').toLowerCase();
        if (messageType === 'connect' || messageType === 'connection') {
            bdrCounts[bdrEmail].connect++;
        } else {
            bdrCounts[bdrEmail].message++;
        }
    });
    
    return {
        counts: bdrCounts,
        stats: stats
    };
}

/**
 * Filter messages for Push Queue (approved and ready to send)
 * Shows messages that can be pushed to HeyReach
 * 
 * @param {Array} allMessages - All messages from connect_queue
 * @returns {Object} Filtered messages and statistics
 */
function filterMessagesForPushQueue(allMessages) {
    const stats = {
        total: allMessages.length,
        deleted: 0,
        alreadyPushed: 0,
        notApproved: 0,
        visible: 0
    };
    
    const filteredMessages = allMessages.filter(msg => {
        if (msg.deleted) {
            stats.deleted++;
            return false;
        }
        
        if (msg.pushed_to_heyreach) {
            stats.alreadyPushed++;
            return false;
        }
        
        if (msg.reviewStatus !== 'approved') {
            stats.notApproved++;
            return false;
        }
        
        return true;
    });
    
    stats.visible = filteredMessages.length;
    
    return {
        messages: filteredMessages,
        stats: stats
    };
}

// Export functions for use in other modules
if (typeof window !== 'undefined') {
    window.connectQueueFilters = {
        normalizeLinkedInUrl,
        hasApprovedMessageInPast45Days,
        filterMessagesForAdminQueue,
        filterMessagesForCustomerQueue,
        filterMessagesForPushQueue,
        countMessagesPerBDRForAdminQueue
    };
}

// Also support Node.js exports if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        normalizeLinkedInUrl,
        hasApprovedMessageInPast45Days,
        filterMessagesForAdminQueue,
        filterMessagesForCustomerQueue,
        filterMessagesForPushQueue,
        countMessagesPerBDRForAdminQueue
    };
}

