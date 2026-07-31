/**
 * Test Script for Background Jobs
 * 
 * This script allows you to test individual jobs locally before deploying.
 * 
 * Usage:
 *   node test-jobs.js release      # Test release expired
 *   node test-jobs.js rebalance    # Test daily rebalance
 *   node test-jobs.js cleanup      # Test cleanup abandoned
 *   node test-jobs.js all          # Test all jobs
 */

const jobs = require('./call-assignment-jobs');

// Get command from arguments
const command = process.argv[2] || 'help';

async function runTest() {
    console.log('🧪 Call Assignment Jobs - Test Runner');
    console.log('=====================================\n');

    try {
        switch (command.toLowerCase()) {
            case 'release':
                console.log('Testing: Release Expired Assignments\n');
                const releaseResult = await jobs.releaseExpiredAssignments();
                console.log('\n📊 Result:', JSON.stringify(releaseResult, null, 2));
                break;

            case 'rebalance':
                console.log('Testing: Daily Rebalance\n');
                const rebalanceResult = await jobs.dailyRebalance();
                console.log('\n📊 Result:', JSON.stringify(rebalanceResult, null, 2));
                break;

            case 'cleanup':
                console.log('Testing: Cleanup Abandoned Reservations\n');
                const cleanupResult = await jobs.cleanupAbandonedReservations();
                console.log('\n📊 Result:', JSON.stringify(cleanupResult, null, 2));
                break;

            case 'all':
                console.log('Testing: All Jobs\n');
                console.log('--- Test 1: Release Expired ---');
                const r1 = await jobs.releaseExpiredAssignments();
                console.log('Result:', JSON.stringify(r1, null, 2));
                
                console.log('\n--- Test 2: Cleanup Abandoned ---');
                const r2 = await jobs.cleanupAbandonedReservations();
                console.log('Result:', JSON.stringify(r2, null, 2));
                
                console.log('\n--- Test 3: Daily Rebalance ---');
                const r3 = await jobs.dailyRebalance();
                console.log('Result:', JSON.stringify(r3, null, 2));
                break;

            case 'help':
            default:
                console.log('Usage:');
                console.log('  node test-jobs.js release      # Test release expired assignments');
                console.log('  node test-jobs.js rebalance    # Test daily rebalance');
                console.log('  node test-jobs.js cleanup      # Test cleanup abandoned reservations');
                console.log('  node test-jobs.js all          # Test all jobs');
                console.log('\nExamples:');
                console.log('  node test-jobs.js release');
                console.log('  node test-jobs.js all');
                process.exit(0);
        }

        console.log('\n✅ Test complete!');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the test
runTest();

