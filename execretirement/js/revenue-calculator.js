// Revenue Calculation Engine
// Handles all TPA revenue calculations based on provider rules and plan data

class RevenueCalculator {
  constructor() {
    this.providerRules = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Load provider rules from database
    await this.loadProviderRules();
    this.initialized = true;
    console.log('💰 Revenue Calculator initialized');
  }

  async loadProviderRules() {
    // Load from our known provider rules (from Excel analysis)
    const rules = {
      'Transamerica': {
        installRateAssets: 0.0020,      // 0.20%
        installRateDeposits: 0.0020,    // 0.20%
        ongoingRateAssets: 0.0005,      // 0.05% (5 bps)
        ongoingRequiresBuiltIn: false,
        qualificationNotes: 'None',
        notes: 'Upfront Rev Share Bonus for selling 10 plans and 12MM/year'
      },
      'John Hancock': {
        installRateAssets: 0.0020,      // 0.20%
        installRateDeposits: 0.0100,    // 1.00%
        ongoingRateAssets: 0.0005,      // 0.05% (5 bps)
        ongoingRequiresBuiltIn: false,
        qualificationNotes: '5 plans'
      },
      'Empower': {
        installRateAssets: 0.0000,
        installRateDeposits: 0.0000,
        ongoingRateAssets: null,
        ongoingRequiresBuiltIn: true,
        notes: 'Must build in, they start at zero'
      },
      'American Funds': {
        installRateAssets: 0.0000,
        installRateDeposits: 0.0000,
        ongoingRateAssets: 0.0005,      // 0.05% (conditional on share class)
        ongoingRequiresBuiltIn: false,
        notes: 'R2-R4 generally have 2bps-5bps. R5-R6 have Zero.'
      },
      'Voya': {
        installRateAssets: 0.0035,      // 0.35%
        installRateDeposits: 0.0035,    // 0.35%
        ongoingRateAssets: 0.0005,      // 0.05% (5 bps)
        ongoingRequiresBuiltIn: false,
        qualificationNotes: '5 plans or 50MM'
      },
      'T Rowe Price': {
        installRateAssets: 0.0000,
        installRateDeposits: 0.0000,
        ongoingRateAssets: null,
        ongoingRequiresBuiltIn: true,
        notes: 'Have to build in TPA Comp or bill direct'
      },
      'Principal': {
        installRateAssets: 0.0025,      // 0.25%
        installRateDeposits: 0.0025,    // 0.25%
        ongoingRateAssets: 0.0005,      // 0.05% (5 bps)
        ongoingRequiresBuiltIn: false
      },
      'Lincoln': {
        installRateAssets: 0.0000,
        installRateDeposits: 0.0000,
        ongoingRateAssets: null,
        ongoingRequiresBuiltIn: true,
        notes: 'Must build in TPA compensation or bill direct'
      },
      'Fidelity': {
        installRateAssets: 0.0000,
        installRateDeposits: 0.0000,
        ongoingRateAssets: null,
        ongoingRequiresBuiltIn: true,
        notes: 'Must build in TPA compensation or bill direct'
      },
      'Plan Premier': {
        installRateAssets: 0.0000,
        installRateDeposits: 0.0000,
        ongoingRateAssets: null,
        ongoingRequiresBuiltIn: true,
        notes: 'Must build in TPA compensation or bill direct'
      }
    };

    // Store rules in map for quick lookup (with case-insensitive keys)
    Object.entries(rules).forEach(([provider, rule]) => {
      // Store with normalized key (lowercase) for case-insensitive lookup
      this.providerRules.set(provider.toLowerCase(), rule);
    });
  }
  
  // Helper method to normalize provider name for lookup
  normalizeProviderName(provider) {
    if (!provider) return null;
    
    // Simple lowercase normalization - database already has clean provider names
    // Just handle case-insensitivity and basic whitespace cleanup
    return provider.toLowerCase().trim();
  }

  // Core Calculation Methods

  /**
   * Calculate installation payment based on assets, deposits, and provider rates
   * @param {number} assets - Plan assets in dollars
   * @param {number} deposits - First year deposits in dollars  
   * @param {string} provider - Provider name
   * @returns {number} Installation payment in dollars
   */
  calculateInstallationPayment(assets, deposits, provider) {
    const normalizedProvider = this.normalizeProviderName(provider);
    const rule = this.providerRules.get(normalizedProvider);
    if (!rule) {
      console.warn(`⚠️ Provider not found in calculator: "${provider}" (normalized: "${normalizedProvider}") - returning $0`);
      return 0;
    }

    const assetsPayment = assets * rule.installRateAssets;
    const depositsPayment = deposits * rule.installRateDeposits;
    
    return Math.round((assetsPayment + depositsPayment) * 100) / 100; // Round to cents
  }

  /**
   * Calculate ongoing revenue share (5 bps typically)
   * @param {number} assets - Plan assets in dollars
   * @param {string} provider - Provider name
   * @param {boolean} isEligible - Whether plan is eligible for ongoing revenue
   * @returns {number} Annual ongoing revenue in dollars
   */
  calculateOngoingRevenue(assets, provider, isEligible = true) {
    if (!isEligible) return 0;
    
    const normalizedProvider = this.normalizeProviderName(provider);
    const rule = this.providerRules.get(normalizedProvider);
    if (!rule) {
      console.warn(`⚠️ Provider not found in calculator: "${provider}" (normalized: "${normalizedProvider}") - returning $0`);
      return 0;
    }

    // If provider requires built-in BPS, return 0 (no direct revenue share)
    if (rule.ongoingRequiresBuiltIn || rule.ongoingRateAssets === null) {
      return 0;
    }

    return Math.round((assets * rule.ongoingRateAssets) * 100) / 100;
  }

  /**
   * Calculate participant fees
   * @param {number} participants - Number of plan participants
   * @param {number} ratePerParticipant - Fee per participant in dollars
   * @returns {number} Total participant fees in dollars
   */
  calculateParticipantFees(participants, ratePerParticipant) {
    return participants * ratePerParticipant;
  }

  /**
   * Calculate total hard dollar fees (excluding revenue share)
   * @param {Object} fees - Object containing all fee amounts
   * @returns {number} Total hard dollar fees
   */
  calculateHardDollarFees(fees) {
    const {
      document = 0,
      adminBase = 0,
      audit = 0,
      newComparability = 0,
      participant = 0,
      consulting = 0
    } = fees;

    return document + adminBase + audit + newComparability + participant + consulting;
  }

  /**
   * Calculate total first year TPA revenue
   * @param {Object} planData - Complete plan data
   * @returns {Object} Breakdown of first year revenue
   */
  calculateFirstYearTPA(planData) {
    const {
      assets,
      deposits,
      participants,
      provider,
      fees,
      isInstallationEligible = true,
      isOngoingEligible = true,
      participantRate = 25
    } = planData;

    // Installation payment
    const installation = isInstallationEligible ? 
      this.calculateInstallationPayment(assets, deposits, provider) : 0;

    // Ongoing revenue (prorated for first year)
    const ongoingAnnual = this.calculateOngoingRevenue(assets, provider, isOngoingEligible);
    const ongoing = ongoingAnnual; // Assume full year for first year

    // Participant fees
    const participantFees = this.calculateParticipantFees(participants, participantRate);

    // Hard dollar fees
    const hardDollar = this.calculateHardDollarFees({
      ...fees,
      participant: participantFees
    });

    // Record keeper total (installation + ongoing)
    const recordKeeperTotal = installation + ongoing;

    // Total first year TPA
    const total = recordKeeperTotal + hardDollar;

    return {
      installation: Math.round(installation * 100) / 100,
      ongoing: Math.round(ongoing * 100) / 100,
      recordKeeperTotal: Math.round(recordKeeperTotal * 100) / 100,
      hardDollar: Math.round(hardDollar * 100) / 100,
      participantFees: Math.round(participantFees * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  /**
   * Calculate second year TPA revenue (recurring fees only)
   * @param {Object} planData - Complete plan data
   * @returns {Object} Breakdown of second year revenue
   */
  calculateSecondYearTPA(planData) {
    const {
      assets,
      participants,
      provider,
      fees,
      isOngoingEligible = true,
      participantRate = 25
    } = planData;

    // No installation payment in second year
    const installation = 0;

    // Ongoing revenue (full year)
    const ongoing = this.calculateOngoingRevenue(assets, provider, isOngoingEligible);

    // Participant fees
    const participantFees = this.calculateParticipantFees(participants, participantRate);

    // Recurring hard dollar fees (no document fee in year 2)
    const hardDollar = this.calculateHardDollarFees({
      document: 0, // No document fee in year 2
      adminBase: fees.adminBase || 0,
      audit: fees.audit || 0,
      newComparability: fees.newComparability || 0,
      participant: participantFees,
      consulting: 0 // Typically not recurring
    });

    // Record keeper total (ongoing only)
    const recordKeeperTotal = ongoing;

    // Total second year TPA
    const total = recordKeeperTotal + hardDollar;

    return {
      installation: 0,
      ongoing: Math.round(ongoing * 100) / 100,
      recordKeeperTotal: Math.round(recordKeeperTotal * 100) / 100,
      hardDollar: Math.round(hardDollar * 100) / 100,
      participantFees: Math.round(participantFees * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  /**
   * Validate calculation against Excel data (for testing)
   * @param {Object} planData - Plan data
   * @param {Object} excelData - Excel calculated values
   * @returns {Object} Validation results
   */
  validateAgainstExcel(planData, excelData) {
    const calculated = this.calculateFirstYearTPA(planData);
    const tolerance = 1.00; // $1.00 tolerance

    const results = {
      installation: {
        calculated: calculated.installation,
        excel: excelData.projectedInstallation || 0,
        variance: Math.abs(calculated.installation - (excelData.projectedInstallation || 0)),
        pass: Math.abs(calculated.installation - (excelData.projectedInstallation || 0)) <= tolerance
      },
      ongoing: {
        calculated: calculated.ongoing,
        excel: excelData.ongoing5bps || 0,
        variance: Math.abs(calculated.ongoing - (excelData.ongoing5bps || 0)),
        pass: Math.abs(calculated.ongoing - (excelData.ongoing5bps || 0)) <= tolerance
      },
      total1stYear: {
        calculated: calculated.total,
        excel: excelData.total1stYearTPA || 0,
        variance: Math.abs(calculated.total - (excelData.total1stYearTPA || 0)),
        pass: Math.abs(calculated.total - (excelData.total1stYearTPA || 0)) <= tolerance
      }
    };

    results.allPass = results.installation.pass && results.ongoing.pass && results.total1stYear.pass;
    results.maxVariance = Math.max(results.installation.variance, results.ongoing.variance, results.total1stYear.variance);

    return results;
  }

  // Utility Methods

  /**
   * Get provider rule information
   * @param {string} provider - Provider name
   * @returns {Object} Provider rules
   */
  getProviderRules(provider) {
    const normalizedProvider = this.normalizeProviderName(provider);
    return this.providerRules.get(normalizedProvider) || null;
  }

  /**
   * Check if provider requires built-in BPS
   * @param {string} provider - Provider name
   * @returns {boolean} True if built-in required
   */
  requiresBuiltInBPS(provider) {
    const normalizedProvider = this.normalizeProviderName(provider);
    const rule = this.providerRules.get(normalizedProvider);
    return rule ? rule.ongoingRequiresBuiltIn : false;
  }

  /**
   * Format currency for display
   * @param {number} amount - Amount in dollars
   * @returns {string} Formatted currency string
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  /**
   * Format percentage for display
   * @param {number} rate - Rate as decimal (0.0020 = 0.20%)
   * @returns {string} Formatted percentage string
   */
  formatPercentage(rate) {
    return `${(rate * 100).toFixed(2)}%`;
  }
}

// Create global instance
window.revenueCalculator = new RevenueCalculator();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.revenueCalculator.initialize();
    console.log('💰 Revenue Calculator ready');
  } catch (error) {
    console.error('❌ Revenue Calculator initialization failed:', error);
  }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RevenueCalculator;
}


















