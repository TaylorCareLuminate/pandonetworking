/**
 * PAYMENT CONFIGURATION - SINGLE SOURCE OF TRUTH
 * 
 * This file contains the payment structure for all call outcomes.
 * Update rates here and they will automatically apply to:
 * - Team Performance Dashboard (crm/team-performance.html)
 * - Individual Agent Performance (team/performance.html)
 * - Call-Performance-Payments Documentation (team/call-performance-payments.html)
 * 
 * Last Updated: 2025-01-28
 */

// Base payment rates for call outcomes
// Supports both display names (for documentation) and kebab-case (for phone-calls.html)
export const PAYMENT_STRUCTURE = {
    // === DISPLAY NAMES (used in crm/team-performance.html and documentation) ===
    'Left Personalized Recorded Message': 0.50,
    'Left Message With Receptionist/Team Member': 0.50,
    'Unable to Leave Message, but Good Number': 0.50,
    'Bad Number': 0.00,
    'Spoke to Prospect - Declined Meeting': 1.50,
    'Spoke to Prospect - Scheduled Meeting': 0.50, // Note: Does not include Achievement Pool bonus
    'Spoke to Prospect - Asked for Email Follow Up': 0.50,
    'Spoke to Prospect - Scheduled Callback': 0.50,
    'Skip Call for Now': 0.00,
    
    // === KEBAB-CASE ALIASES (used in team/phone-calls.html) ===
    'left-recorded-message': 0.50,
    'left-message-receptionist': 0.50,
    'good-number-no-message': 0.50,
    'bad-number': 0.00,
    'bad-number-disconnected': 0.00,
    'bad-number-wrong-person': 0.00,
    'contact-left-no-replacement': 0.00,
    'spoke-declined': 1.50,
    'spoke-scheduled-meeting': 0.50,
    'spoke-email-followup': 0.50,
    'spoke-scheduled-callback': 0.50,
    'spoke-referred': 0.50,
    'skip': 0.00,
    'flagged': 0.00, // Contact flagged for admin review
    'company-already-engaged': 0.00, // Company has active meeting scheduled - no payment
    
    // === OTHER VARIATIONS (for backwards compatibility) ===
    'Left Message': 0.50,
    'Left w/ Receptionist': 0.50,
    'Good Number': 0.50,
    'Declined Meeting': 1.50,
    'Scheduled Meeting': 0.50,
    'Email Follow Up': 0.50,
    'Scheduled Callback': 0.50,
    'Scheduled': 0.50,
    'Meeting Scheduled': 0.50
};

// Outcomes that contribute to the Achievement Pool (both naming conventions)
export const QUALIFYING_OUTCOMES = [
    // Display names
    'Left Personalized Recorded Message',
    'Left Message With Receptionist/Team Member',
    'Unable to Leave Message, but Good Number',
    'Spoke to Prospect - Asked for Email Follow Up',
    'Spoke to Prospect - Scheduled Callback',
    // Kebab-case
    'left-recorded-message',
    'left-message-receptionist',
    'good-number-no-message',
    'spoke-email-followup',
    'spoke-scheduled-callback',
    'spoke-referred',
    // Other variations
    'Left Message',
    'Left w/ Receptionist',
    'Good Number',
    'Email Follow Up',
    'Scheduled Callback'
];

// Date when the $200 soft cap was introduced (commit 6931ad226: "Call payment soft cap")
// Meetings scheduled BEFORE this date use the legacy (no-cap) calculation.
// Meetings scheduled ON OR AFTER this date use the soft-cap calculation.
export const SOFT_CAP_EFFECTIVE_DATE = new Date('2026-04-16T20:32:26Z'); // 2026-04-16 14:32:26 MDT

// Achievement Pool Configuration
export const ACHIEVEMENT_POOL_CONFIG = {
    startingAmount: 40.00,
    softCapThreshold: 200.00,
    postThresholdIncrement: 0.10,
    tiers: [
        { minCalls: 1,  maxCalls: 20,  increment: 0.10 },
        { minCalls: 21, maxCalls: 40,  increment: 0.20 },
        { minCalls: 41, maxCalls: 60,  increment: 0.30 },
        { minCalls: 61, maxCalls: 80,  increment: 0.40 },
        { minCalls: 81, maxCalls: Infinity, increment: 0.50 }
    ]
};

/**
 * Calculate Achievement Pool amount based on qualifying call count.
 *
 * Applies date-aware logic:
 *   - If `asOfDate` is provided AND it falls before SOFT_CAP_EFFECTIVE_DATE,
 *     uses the legacy formula (tiered increments with NO $200 soft cap).
 *   - Otherwise (no date, or date on/after the effective date), uses the
 *     current formula with the $200 soft cap that limits subsequent
 *     increments to $0.10 per call.
 *
 * @param {number} qualifyingCallCount - Number of qualifying calls made
 * @param {Date|string|number} [asOfDate] - The date the meeting was scheduled
 *        (or when the calculation should be evaluated). Optional.
 * @returns {number} Current Achievement Pool amount
 */
export function calculateAchievementPool(qualifyingCallCount, asOfDate = null) {
    const qualifyingCalls = Math.max(0, qualifyingCallCount || 0);

    // Determine if we should use legacy (pre-soft-cap) calculation
    let useLegacy = false;
    if (asOfDate) {
        const dateObj = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
        if (!isNaN(dateObj.getTime()) && dateObj < SOFT_CAP_EFFECTIVE_DATE) {
            useLegacy = true;
        }
    }

    let poolAmount = ACHIEVEMENT_POOL_CONFIG.startingAmount;

    for (let callNumber = 1; callNumber <= qualifyingCalls; callNumber++) {
        let increment = getAchievementPoolTierIncrement(callNumber);

        if (!useLegacy) {
            // Modern calculation: apply $200 soft cap
            if (poolAmount >= ACHIEVEMENT_POOL_CONFIG.softCapThreshold) {
                increment = ACHIEVEMENT_POOL_CONFIG.postThresholdIncrement;
            } else if (poolAmount + increment > ACHIEVEMENT_POOL_CONFIG.softCapThreshold) {
                increment = ACHIEVEMENT_POOL_CONFIG.softCapThreshold - poolAmount;
            }
        }
        // Legacy: no cap, just apply tiered increment as-is

        poolAmount = roundCurrency(poolAmount + increment);
    }

    return roundCurrency(poolAmount);
}

function getAchievementPoolTierIncrement(callNumber) {
    for (const tier of ACHIEVEMENT_POOL_CONFIG.tiers) {
        if (callNumber >= tier.minCalls && callNumber <= tier.maxCalls) {
            return tier.increment;
        }
    }

    return 0;
}

function roundCurrency(amount) {
    return Math.round(amount * 100) / 100;
}

/**
 * Get payment amount for a specific call outcome
 * @param {string} outcome - The call outcome
 * @param {number} poolAmount - Current Achievement Pool amount (for scheduled meetings)
 * @returns {number} Payment amount
 */
export function getPaymentForOutcome(outcome, poolAmount = 0) {
    const basePayment = PAYMENT_STRUCTURE[outcome] || 0;
    
    // Add Achievement Pool bonus for scheduled meetings
    if (outcome === 'Spoke to Prospect - Scheduled Meeting' || 
        outcome === 'Scheduled Meeting' || 
        outcome === 'Meeting Scheduled') {
        return basePayment + poolAmount;
    }
    
    return basePayment;
}

/**
 * Check if an outcome contributes to the Achievement Pool
 * @param {string} outcome - The call outcome
 * @returns {boolean} True if outcome contributes to pool
 */
export function isQualifyingOutcome(outcome) {
    return QUALIFYING_OUTCOMES.includes(outcome);
}

/**
 * Get a formatted display name for an outcome
 * @param {string} outcome - The call outcome
 * @returns {string} Display name
 */
export function getOutcomeDisplayName(outcome) {
    return outcome || 'No Outcome Recorded';
}

/**
 * Get all unique outcome names (for debugging/configuration)
 * @returns {string[]} Array of outcome names
 */
export function getAllOutcomes() {
    return Object.keys(PAYMENT_STRUCTURE);
}

// Export default object for convenience
export default {
    PAYMENT_STRUCTURE,
    QUALIFYING_OUTCOMES,
    ACHIEVEMENT_POOL_CONFIG,
    SOFT_CAP_EFFECTIVE_DATE,
    calculateAchievementPool,
    getPaymentForOutcome,
    isQualifyingOutcome,
    getOutcomeDisplayName,
    getAllOutcomes
};

