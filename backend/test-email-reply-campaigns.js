/**
 * Test script for Email Reply Campaigns API
 * Run this to test the API endpoints before full integration
 */

const BASE_URL = 'https://railwayclemail-production.up.railway.app';

// Test email search functionality
async function testEmailSearch() {
  console.log('🔍 Testing email search...');
  
  const searchData = {
    accountId: 'test-account-id',
    searchTerm: 'john@example.com',
    mostRecentOnly: true
  };
  
  try {
    const response = await fetch(`${BASE_URL}/emails/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Email search successful:', result);
      return result;
    } else {
      console.error('❌ Email search failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ Email search error:', error);
  }
}

// Test campaign scheduling
async function testCampaignScheduling() {
  console.log('📧 Testing campaign scheduling...');
  
  const campaignData = {
    emails: [
      {
        accountId: 'test-account-id',
        to: 'john@example.com',
        subject: 'Re: Following up on our conversation',
        html: '<p>Hello John,</p><p>Just wanted to follow up on our previous conversation...</p>',
        text: 'Hello John,\n\nJust wanted to follow up on our previous conversation...',
        originalEmailId: 'original-email-123'
      },
      {
        accountId: 'test-account-id',
        to: 'jane@company.com',
        subject: 'Re: Your inquiry about our services',
        html: '<p>Hello Jane,</p><p>Thank you for your interest in our services...</p>',
        text: 'Hello Jane,\n\nThank you for your interest in our services...',
        originalEmailId: 'original-email-456'
      }
    ]
  };
  
  try {
    const response = await fetch(`${BASE_URL}/campaigns/schedule-reply-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaignData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Campaign scheduling successful:', result);
      return result;
    } else {
      console.error('❌ Campaign scheduling failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ Campaign scheduling error:', error);
  }
}

// Test queue status
async function testQueueStatus() {
  console.log('📊 Testing queue status...');
  
  try {
    const response = await fetch(`${BASE_URL}/emails/queue/status`);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Queue status retrieved:', result);
      return result;
    } else {
      console.error('❌ Queue status failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ Queue status error:', error);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Email Reply Campaigns API Tests...\n');
  
  await testEmailSearch();
  console.log('\n');
  
  await testCampaignScheduling();
  console.log('\n');
  
  await testQueueStatus();
  console.log('\n');
  
  console.log('🏁 All tests completed!');
}

// Mock data for testing without actual server
function runMockTests() {
  console.log('🧪 Running mock tests for development...\n');
  
  // Mock search results
  const mockSearchResults = {
    success: true,
    emails: [
      {
        id: 'email-1',
        from: 'john@example.com',
        to: 'taylor@healthluminate.com',
        subject: 'Question about your services',
        htmlContent: '<p>Hi Taylor, I have some questions about your healthcare technology solutions...</p>',
        textContent: 'Hi Taylor, I have some questions about your healthcare technology solutions...',
        sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        direction: 'inbound',
        fromName: 'John Smith'
      },
      {
        id: 'email-2',
        from: 'taylor@healthluminate.com',
        to: 'jane@company.com',
        subject: 'Healthcare Technology Demo',
        htmlContent: '<p>Hi Jane, Thank you for your interest in our healthcare technology platform...</p>',
        textContent: 'Hi Jane, Thank you for your interest in our healthcare technology platform...',
        sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        direction: 'outbound',
        toName: 'Jane Doe'
      }
    ],
    account: {
      id: 'account-1',
      name: 'Taylor Davis',
      email: 'taylor@healthluminate.com'
    }
  };
  
  console.log('✅ Mock search results:', mockSearchResults);
  console.log('\n');
  
  // Mock campaign scheduling results
  const mockSchedulingResults = {
    success: true,
    scheduled: 2,
    domains: 2,
    timespan: '4 hours',
    startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    details: [
      {
        id: 'scheduled-1',
        to: 'john@example.com',
        sendAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        domain: 'example.com'
      },
      {
        id: 'scheduled-2',
        to: 'jane@company.com',
        sendAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        domain: 'company.com'
      }
    ]
  };
  
  console.log('✅ Mock scheduling results:', mockSchedulingResults);
  console.log('\n');
  
  // Mock queue status
  const mockQueueStatus = {
    success: true,
    totalQueued: 8,
    domainCounts: {
      'example.com': 2,
      'company.com': 1,
      'healthcare.org': 3,
      'medical.net': 2
    },
    hourlySlots: {
      '2024-01-15T10': [
        { id: 'q1', to: 'user1@example.com', sendAt: '2024-01-15T10:30:00Z' }
      ],
      '2024-01-15T11': [
        { id: 'q2', to: 'user2@company.com', sendAt: '2024-01-15T11:15:00Z' },
        { id: 'q3', to: 'user3@healthcare.org', sendAt: '2024-01-15T11:45:00Z' }
      ]
    },
    nextAvailableSlot: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  };
  
  console.log('✅ Mock queue status:', mockQueueStatus);
  console.log('\n');
  
  console.log('🏁 Mock tests completed!');
}

// Usage examples
console.log('Email Reply Campaigns API Test Suite');
console.log('====================================');
console.log('');
console.log('Usage:');
console.log('  node test-email-reply-campaigns.js mock    - Run mock tests');
console.log('  node test-email-reply-campaigns.js live    - Run live API tests');
console.log('');

// Check command line arguments
const args = process.argv.slice(2);

if (args.includes('mock')) {
  runMockTests();
} else if (args.includes('live')) {
  runAllTests();
} else {
  console.log('No test mode specified. Use "mock" or "live"');
  console.log('Running mock tests by default...\n');
  runMockTests();
}

// Export for use in other scripts
module.exports = {
  testEmailSearch,
  testCampaignScheduling,
  testQueueStatus,
  runAllTests,
  runMockTests
};





