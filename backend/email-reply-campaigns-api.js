/**
 * Email Reply Campaigns Backend API
 * Supports email search and reply-all campaign scheduling
 * Integrates with existing Railway CLEmail system
 */

const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const router = express.Router();

// Enable CORS for all routes
router.use(cors());
router.use(express.json());

// Firebase Admin Setup (should be initialized elsewhere in main app)
// const admin = require('firebase-admin');
// const db = admin.firestore();

/**
 * Search for emails by name or email address
 * Returns the most recent email for each unique contact
 * 
 * POST /emails/search
 * Body: {
 *   accountId: string,
 *   searchTerm: string,
 *   mostRecentOnly: boolean
 * }
 */
router.post('/emails/search', async (req, res) => {
  try {
    const { accountId, searchTerm, mostRecentOnly = true } = req.body;

    if (!accountId || !searchTerm) {
      return res.status(400).json({
        error: 'Missing required parameters: accountId and searchTerm'
      });
    }

    console.log(`🔍 Searching emails for account ${accountId} with term: "${searchTerm}"`);

    // Get account details from Firebase
    const db = getFirestore();
    const accountDoc = await db.collection('emailAccounts').doc(accountId).get();
    
    if (!accountDoc.exists) {
      return res.status(404).json({
        error: 'Email account not found'
      });
    }

    const account = { id: accountDoc.id, ...accountDoc.data() };

    // Search for emails in both sent and received collections
    // This would integrate with your IMAP/email storage system
    const searchResults = await searchEmailsByContact(account, searchTerm, mostRecentOnly);

    console.log(`✅ Found ${searchResults.length} unique contacts`);

    res.json({
      success: true,
      emails: searchResults,
      account: {
        id: account.id,
        name: account.name,
        email: account.email
      }
    });

  } catch (error) {
    console.error('❌ Error searching emails:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Schedule a reply-all campaign with calendar and domain limiting
 * 
 * POST /campaigns/schedule-reply-all
 * Body: {
 *   emails: [{
 *     accountId: string,
 *     to: string,
 *     subject: string,
 *     html: string,
 *     text: string,
 *     originalEmailId: string
 *   }]
 * }
 */
router.post('/campaigns/schedule-reply-all', async (req, res) => {
  try {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        error: 'Missing or invalid emails array'
      });
    }

    console.log(`📧 Scheduling reply-all campaign with ${emails.length} emails`);

    // Load calendar availability
    const calendarData = await loadEmailCalendarData();
    
    // Load current queue to avoid conflicts
    const currentQueue = await getCurrentEmailQueue();

    // Schedule emails with domain limiting and calendar integration
    const schedulingResult = await scheduleReplyCampaign(emails, {
      calendarData,
      currentQueue,
      maxPerDomain: 2, // Max 2 emails per domain per hour
      minHourDelay: 1,  // Minimum 1 hour from now
      timeBetweenEmails: 180 // 3 minutes between emails
    });

    console.log(`✅ Campaign scheduled successfully: ${schedulingResult.scheduled} emails`);

    res.json({
      success: true,
      scheduled: schedulingResult.scheduled,
      domains: schedulingResult.uniqueDomains,
      timespan: schedulingResult.timespan,
      startTime: schedulingResult.startTime,
      endTime: schedulingResult.endTime,
      details: schedulingResult.details
    });

  } catch (error) {
    console.error('❌ Error scheduling campaign:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Get current email queue status
 * GET /emails/queue/status
 */
router.get('/emails/queue/status', async (req, res) => {
  try {
    const db = getFirestore();
    
    // Query scheduled emails from Firebase
    const now = new Date();
    const queueSnapshot = await db.collection('emailQueue')
      .where('status', 'in', ['scheduled', 'pending'])
      .where('sendAt', '>', now.toISOString())
      .orderBy('sendAt', 'asc')
      .get();

    const queuedEmails = [];
    queueSnapshot.forEach(doc => {
      queuedEmails.push({ id: doc.id, ...doc.data() });
    });

    // Group by domain and time slots
    const domainCounts = {};
    const hourlySlots = {};
    
    queuedEmails.forEach(email => {
      const domain = email.to.split('@')[1];
      const hour = new Date(email.sendAt).toISOString().substring(0, 13); // YYYY-MM-DDTHH
      
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      hourlySlots[hour] = (hourlySlots[hour] || []);
      hourlySlots[hour].push(email);
    });

    res.json({
      success: true,
      totalQueued: queuedEmails.length,
      domainCounts,
      hourlySlots,
      nextAvailableSlot: findNextAvailableSlot(hourlySlots)
    });

  } catch (error) {
    console.error('❌ Error getting queue status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Helper Functions

/**
 * Search for emails by contact in IMAP/email storage
 * This is a placeholder - integrate with your actual email storage system
 */
async function searchEmailsByContact(account, searchTerm, mostRecentOnly) {
  // This would integrate with your IMAP client or email storage
  // For now, we'll simulate the response structure
  
  const db = getFirestore();
  
  // Search in sent emails collection (if you store them)
  const sentResults = await searchCollection('sentEmails', account.id, searchTerm);
  const receivedResults = await searchCollection('receivedEmails', account.id, searchTerm);
  
  // Combine and deduplicate by contact
  const allResults = [...sentResults, ...receivedResults];
  const contactMap = new Map();
  
  allResults.forEach(email => {
    const contactEmail = email.direction === 'inbound' ? email.from : email.to;
    const contactKey = contactEmail.toLowerCase();
    
    if (!contactMap.has(contactKey) || 
        new Date(email.sentAt || email.receivedAt) > new Date(contactMap.get(contactKey).sentAt || contactMap.get(contactKey).receivedAt)) {
      contactMap.set(contactKey, email);
    }
  });
  
  return Array.from(contactMap.values()).slice(0, 50); // Limit results
}

/**
 * Search a specific collection for emails matching the search term
 */
async function searchCollection(collectionName, accountId, searchTerm) {
  const db = getFirestore();
  const results = [];
  
  try {
    // Search by email address (exact match)
    if (searchTerm.includes('@')) {
      const emailQuery = await db.collection(collectionName)
        .where('accountId', '==', accountId)
        .where('to', '==', searchTerm)
        .limit(10)
        .get();
      
      emailQuery.forEach(doc => {
        results.push({ id: doc.id, ...doc.data(), direction: 'outbound' });
      });
      
      const fromQuery = await db.collection(collectionName)
        .where('accountId', '==', accountId)
        .where('from', '==', searchTerm)
        .limit(10)
        .get();
      
      fromQuery.forEach(doc => {
        results.push({ id: doc.id, ...doc.data(), direction: 'inbound' });
      });
    } else {
      // Search by name in subject or content (simplified)
      const subjectQuery = await db.collection(collectionName)
        .where('accountId', '==', accountId)
        .orderBy('sentAt', 'desc')
        .limit(100) // Get recent emails and filter
        .get();
      
      subjectQuery.forEach(doc => {
        const data = doc.data();
        const searchLower = searchTerm.toLowerCase();
        
        if (data.subject && data.subject.toLowerCase().includes(searchLower) ||
            data.fromName && data.fromName.toLowerCase().includes(searchLower) ||
            data.toName && data.toName.toLowerCase().includes(searchLower) ||
            data.textContent && data.textContent.toLowerCase().includes(searchLower)) {
          results.push({ 
            id: doc.id, 
            ...data, 
            direction: data.from ? 'inbound' : 'outbound' 
          });
        }
      });
    }
  } catch (error) {
    console.warn(`⚠️ Error searching ${collectionName}:`, error);
  }
  
  return results;
}

/**
 * Load email calendar availability data
 */
async function loadEmailCalendarData() {
  try {
    const db = getFirestore();
    const calendarDoc = await db.collection('emailSettings').doc('calendar').get();
    
    if (calendarDoc.exists) {
      const data = calendarDoc.data();
      return {
        availableDays: new Set(data.availableDays || []),
        unavailableDates: new Set(data.unavailableDates || []),
        workingHours: data.workingHours || { start: '09:00', end: '17:00' },
        timezone: data.timezone || 'America/New_York'
      };
    }
  } catch (error) {
    console.warn('⚠️ Could not load calendar data:', error);
  }
  
  // Default schedule - weekdays only
  return {
    availableDays: new Set([1, 2, 3, 4, 5]), // Monday-Friday
    unavailableDates: new Set(),
    workingHours: { start: '09:00', end: '17:00' },
    timezone: 'America/New_York'
  };
}

/**
 * Get current email queue
 */
async function getCurrentEmailQueue() {
  try {
    const db = getFirestore();
    const queueSnapshot = await db.collection('emailQueue')
      .where('status', 'in', ['scheduled', 'pending'])
      .where('sendAt', '>', new Date().toISOString())
      .get();
    
    const queue = [];
    queueSnapshot.forEach(doc => {
      queue.push({ id: doc.id, ...doc.data() });
    });
    
    return queue;
  } catch (error) {
    console.warn('⚠️ Could not load current queue:', error);
    return [];
  }
}

/**
 * Schedule reply campaign with domain limiting and calendar integration
 */
async function scheduleReplyCampaign(emails, options) {
  const { calendarData, currentQueue, maxPerDomain, minHourDelay, timeBetweenEmails } = options;
  
  // Group emails by domain
  const emailsByDomain = {};
  emails.forEach(email => {
    const domain = email.to.split('@')[1];
    if (!emailsByDomain[domain]) {
      emailsByDomain[domain] = [];
    }
    emailsByDomain[domain].push(email);
  });
  
  // Find next available time slots
  const startTime = new Date();
  startTime.setHours(startTime.getHours() + minHourDelay);
  
  const scheduledEmails = [];
  const db = getFirestore();
  
  let currentScheduleTime = findNextAvailableTimeSlot(startTime, calendarData);
  const domainScheduleCounts = {}; // Track emails per domain per hour
  
  // Schedule emails with domain limiting
  for (const [domain, domainEmails] of Object.entries(emailsByDomain)) {
    for (const email of domainEmails) {
      // Find next available slot for this domain
      while (true) {
        const hourKey = currentScheduleTime.toISOString().substring(0, 13); // YYYY-MM-DDTHH
        const domainKey = `${hourKey}_${domain}`;
        
        if ((domainScheduleCounts[domainKey] || 0) < maxPerDomain) {
          // This slot is available
          domainScheduleCounts[domainKey] = (domainScheduleCounts[domainKey] || 0) + 1;
          break;
        } else {
          // Find next hour slot
          currentScheduleTime = new Date(currentScheduleTime.getTime() + 60 * 60 * 1000);
          currentScheduleTime = findNextAvailableTimeSlot(currentScheduleTime, calendarData);
        }
      }
      
      // Schedule this email
      const emailData = {
        id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        accountId: email.accountId,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text || '',
        sendAt: currentScheduleTime.toISOString(),
        status: 'scheduled',
        type: 'reply',
        originalEmailId: email.originalEmailId || null,
        createdAt: new Date().toISOString(),
        campaignType: 'reply-all'
      };
      
      // Save to Firebase queue
      await db.collection('emailQueue').doc(emailData.id).set(emailData);
      
      // Also call the existing schedule-email endpoint to integrate with Railway system
      try {
        const response = await fetch('https://railwayclemail-production.up.railway.app/schedule-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData)
        });
        
        if (!response.ok) {
          console.warn(`⚠️ Warning: Could not sync to Railway system for email ${emailData.id}`);
        }
      } catch (railwayError) {
        console.warn(`⚠️ Warning: Railway sync failed for email ${emailData.id}:`, railwayError);
      }
      
      scheduledEmails.push(emailData);
      
      // Move to next time slot (minimum time between emails)
      currentScheduleTime = new Date(currentScheduleTime.getTime() + timeBetweenEmails * 1000);
      currentScheduleTime = findNextAvailableTimeSlot(currentScheduleTime, calendarData);
    }
  }
  
  const endTime = scheduledEmails.length > 0 ? 
    new Date(scheduledEmails[scheduledEmails.length - 1].sendAt) : startTime;
  
  return {
    scheduled: scheduledEmails.length,
    uniqueDomains: Object.keys(emailsByDomain).length,
    timespan: Math.ceil((endTime - startTime) / (1000 * 60 * 60)) + ' hours',
    startTime: scheduledEmails.length > 0 ? scheduledEmails[0].sendAt : null,
    endTime: scheduledEmails.length > 0 ? scheduledEmails[scheduledEmails.length - 1].sendAt : null,
    details: scheduledEmails.map(email => ({
      id: email.id,
      to: email.to,
      sendAt: email.sendAt,
      domain: email.to.split('@')[1]
    }))
  };
}

/**
 * Find the next available time slot based on calendar data
 */
function findNextAvailableTimeSlot(startTime, calendarData) {
  let candidateTime = new Date(startTime);
  
  while (true) {
    // Check if this day is available
    const dayOfWeek = candidateTime.getDay();
    const dateString = candidateTime.toISOString().split('T')[0];
    
    // Skip if day is not available or is an unavailable date
    if (!calendarData.availableDays.has(dayOfWeek) || 
        calendarData.unavailableDates.has(dateString)) {
      candidateTime = new Date(candidateTime.getTime() + 24 * 60 * 60 * 1000);
      candidateTime.setHours(9, 0, 0, 0); // Reset to start of business day
      continue;
    }
    
    // Check if time is within working hours
    const hour = candidateTime.getHours();
    const minute = candidateTime.getMinutes();
    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    if (timeString >= calendarData.workingHours.start && 
        timeString < calendarData.workingHours.end) {
      return candidateTime;
    }
    
    // Move to next business hour or next day
    if (timeString < calendarData.workingHours.start) {
      // Too early, move to start of business day
      const [startHour, startMinute] = calendarData.workingHours.start.split(':').map(Number);
      candidateTime.setHours(startHour, startMinute, 0, 0);
    } else {
      // Too late, move to next day
      candidateTime = new Date(candidateTime.getTime() + 24 * 60 * 60 * 1000);
      candidateTime.setHours(9, 0, 0, 0);
    }
  }
}

/**
 * Find the next available scheduling slot
 */
function findNextAvailableSlot(hourlySlots) {
  const now = new Date();
  let candidate = new Date(now.getTime() + 60 * 60 * 1000); // Start 1 hour from now
  
  while (true) {
    const hourKey = candidate.toISOString().substring(0, 13);
    const slotEmails = hourlySlots[hourKey] || [];
    
    if (slotEmails.length < 10) { // Assuming max 10 emails per hour
      return candidate.toISOString();
    }
    
    candidate = new Date(candidate.getTime() + 60 * 60 * 1000); // Next hour
  }
}

module.exports = router;





