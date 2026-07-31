// ROI Tracking and Cost Analysis System
// Comprehensive tracking of costs and return on investment for each client

class ROITracker {
    constructor() {
        this.costCategories = {
            labor: {
                admin: 'Administrative Labor',
                implementation: 'Implementation Labor', 
                consulting: 'Consulting Labor',
                oversight: 'Management Oversight'
            },
            technology: {
                software: 'Software and Licensing',
                infrastructure: 'Technology Infrastructure',
                development: 'Custom Development'
            },
            operational: {
                office: 'Office and Facilities',
                communications: 'Communications',
                marketing: 'Marketing and Sales',
                travel: 'Travel and Meetings',
                professional: 'Professional Services'
            },
            compliance: {
                audit: 'Audit and Compliance',
                legal: 'Legal Services',
                regulatory: 'Regulatory Fees'
            }
        };
        
        this.laborRates = {
            admin: 35.00, // $35/hour loaded cost
            implementation: 45.00, // $45/hour loaded cost
            consulting: 75.00, // $75/hour loaded cost
            oversight: 85.00, // $85/hour loaded cost
            sales: 65.00 // $65/hour loaded cost
        };
        
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        console.log('💰 ROI Tracker initializing...');
        
        // Wait for dependencies
        await window.revenueDb.initialize();
        await window.revenueCalculator.initialize();

        this.initialized = true;
        console.log('✅ ROI Tracker ready');
    }

    /**
     * Calculate comprehensive ROI for a specific plan
     */
    async calculatePlanROI(planId, yearRange = 3) {
        const plan = await this.getPlan(planId);
        if (!plan) {
            throw new Error(`Plan ${planId} not found`);
        }

        console.log(`📊 Calculating ROI for ${plan.name} over ${yearRange} years...`);

        const roiAnalysis = {
            planId: planId,
            planName: plan.name,
            provider: plan.provider,
            rep: plan.rep,
            admin: plan.admin,
            businessUnit: plan.businessUnit,
            analysisDate: new Date(),
            yearRange: yearRange,
            
            // Revenue Analysis
            revenue: await this.calculatePlanRevenue(plan, yearRange),
            
            // Cost Analysis
            costs: await this.calculatePlanCosts(plan, yearRange),
            
            // ROI Metrics
            roi: null, // Calculated below
            
            // Profitability Analysis
            profitability: null, // Calculated below
            
            // Efficiency Metrics
            efficiency: null // Calculated below
        };

        // Calculate ROI metrics
        roiAnalysis.roi = this.calculateROIMetrics(roiAnalysis.revenue, roiAnalysis.costs);
        
        // Calculate profitability analysis
        roiAnalysis.profitability = this.calculateProfitabilityMetrics(roiAnalysis.revenue, roiAnalysis.costs);
        
        // Calculate efficiency metrics
        roiAnalysis.efficiency = this.calculateEfficiencyMetrics(plan, roiAnalysis.revenue, roiAnalysis.costs);

        console.log(`💰 ROI Analysis complete for ${plan.name}: ${roiAnalysis.roi.totalROI.toFixed(1)}% ROI`);
        return roiAnalysis;
    }

    /**
     * Calculate total revenue for a plan over specified years
     */
    async calculatePlanRevenue(plan, years) {
        const revenue = {
            yearOne: 0,
            yearTwo: 0,
            yearThree: 0,
            ongoingAnnual: 0,
            total: 0,
            breakdown: {
                installation: 0,
                ongoing: 0,
                hardDollar: 0,
                consulting: 0
            }
        };

        // Calculate using revenue calculator
        const planData = {
            assets: plan.assets,
            deposits: plan.deposits,
            participants: plan.participants,
            provider: plan.provider,
            fees: plan.fees || {
                document: 0,
                adminBase: 1600,
                audit: 0,
                newComparability: 0,
                consulting: 0
            },
            isInstallationEligible: plan.eligibility?.installation || false,
            isOngoingEligible: plan.eligibility?.ongoing || false,
            participantRate: plan.fees?.participant || 25
        };

        const firstYear = window.revenueCalculator.calculateFirstYearTPA(planData);
        const secondYear = window.revenueCalculator.calculateSecondYearTPA(planData);

        revenue.yearOne = firstYear.total;
        revenue.yearTwo = secondYear.total;
        revenue.yearThree = secondYear.total; // Assume year 3+ same as year 2
        revenue.ongoingAnnual = secondYear.total;

        // Calculate total over specified years
        revenue.total = revenue.yearOne + (revenue.ongoingAnnual * (years - 1));

        // Breakdown by type
        revenue.breakdown.installation = firstYear.installation;
        revenue.breakdown.ongoing = firstYear.ongoing + (secondYear.ongoing * (years - 1));
        revenue.breakdown.hardDollar = firstYear.hardDollar + (secondYear.hardDollar * (years - 1));
        revenue.breakdown.consulting = (plan.fees?.consulting || 0) * years;

        return revenue;
    }

    /**
     * Calculate total costs for a plan over specified years
     */
    async calculatePlanCosts(plan, years) {
        const costs = {
            total: 0,
            yearOne: 0,
            ongoingAnnual: 0,
            breakdown: {
                labor: 0,
                technology: 0,
                operational: 0,
                compliance: 0
            },
            laborBreakdown: {
                admin: 0,
                implementation: 0,
                consulting: 0,
                oversight: 0,
                sales: 0
            }
        };

        // Calculate implementation costs (Year 1 only)
        const implementationCosts = await this.calculateImplementationCosts(plan);
        costs.yearOne += implementationCosts.total;

        // Calculate ongoing annual costs
        const ongoingCosts = await this.calculateOngoingCosts(plan);
        costs.ongoingAnnual = ongoingCosts.total;

        // Total costs over specified years
        costs.total = costs.yearOne + (costs.ongoingAnnual * (years - 1));

        // Merge breakdown data
        costs.breakdown = {
            labor: implementationCosts.labor + (ongoingCosts.labor * (years - 1)),
            technology: implementationCosts.technology + (ongoingCosts.technology * (years - 1)),
            operational: implementationCosts.operational + (ongoingCosts.operational * (years - 1)),
            compliance: implementationCosts.compliance + (ongoingCosts.compliance * (years - 1))
        };

        costs.laborBreakdown = {
            admin: implementationCosts.laborBreakdown.admin + (ongoingCosts.laborBreakdown.admin * (years - 1)),
            implementation: implementationCosts.laborBreakdown.implementation,
            consulting: implementationCosts.laborBreakdown.consulting + (ongoingCosts.laborBreakdown.consulting * (years - 1)),
            oversight: implementationCosts.laborBreakdown.oversight + (ongoingCosts.laborBreakdown.oversight * (years - 1)),
            sales: implementationCosts.laborBreakdown.sales
        };

        return costs;
    }

    /**
     * Calculate implementation costs (one-time, Year 1)
     */
    async calculateImplementationCosts(plan) {
        const costs = {
            total: 0,
            labor: 0,
            technology: 0,
            operational: 0,
            compliance: 0,
            laborBreakdown: {
                admin: 0,
                implementation: 0,
                consulting: 0,
                oversight: 0,
                sales: 0
            }
        };

        // Implementation labor hours based on plan complexity
        const complexity = this.assessPlanComplexity(plan);
        const laborHours = this.getImplementationLaborHours(complexity);

        // Calculate labor costs
        costs.laborBreakdown.admin = laborHours.admin * this.laborRates.admin;
        costs.laborBreakdown.implementation = laborHours.implementation * this.laborRates.implementation;
        costs.laborBreakdown.consulting = laborHours.consulting * this.laborRates.consulting;
        costs.laborBreakdown.oversight = laborHours.oversight * this.laborRates.oversight;
        costs.laborBreakdown.sales = laborHours.sales * this.laborRates.sales;

        costs.labor = Object.values(costs.laborBreakdown).reduce((sum, cost) => sum + cost, 0);

        // Technology implementation costs (one-time setup)
        costs.technology = this.getImplementationTechnologyCosts(plan);

        // Operational setup costs
        costs.operational = this.getImplementationOperationalCosts(plan);

        // Compliance setup costs
        costs.compliance = this.getImplementationComplianceCosts(plan);

        costs.total = costs.labor + costs.technology + costs.operational + costs.compliance;

        return costs;
    }

    /**
     * Calculate ongoing annual costs
     */
    async calculateOngoingCosts(plan) {
        const costs = {
            total: 0,
            labor: 0,
            technology: 0,
            operational: 0,
            compliance: 0,
            laborBreakdown: {
                admin: 0,
                implementation: 0,
                consulting: 0,
                oversight: 0,
                sales: 0
            }
        };

        // Ongoing labor hours based on plan size and complexity
        const complexity = this.assessPlanComplexity(plan);
        const annualLaborHours = this.getOngoingLaborHours(plan, complexity);

        // Calculate ongoing labor costs
        costs.laborBreakdown.admin = annualLaborHours.admin * this.laborRates.admin;
        costs.laborBreakdown.implementation = 0; // No ongoing implementation labor
        costs.laborBreakdown.consulting = annualLaborHours.consulting * this.laborRates.consulting;
        costs.laborBreakdown.oversight = annualLaborHours.oversight * this.laborRates.oversight;
        costs.laborBreakdown.sales = 0; // No ongoing sales labor

        costs.labor = Object.values(costs.laborBreakdown).reduce((sum, cost) => sum + cost, 0);

        // Ongoing technology costs (software, infrastructure)
        costs.technology = this.getOngoingTechnologyCosts(plan);

        // Ongoing operational costs
        costs.operational = this.getOngoingOperationalCosts(plan);

        // Ongoing compliance costs
        costs.compliance = this.getOngoingComplianceCosts(plan);

        costs.total = costs.labor + costs.technology + costs.operational + costs.compliance;

        return costs;
    }

    /**
     * Assess plan complexity for cost modeling
     */
    assessPlanComplexity(plan) {
        let complexity = 'simple';
        let score = 0;

        // Participant count
        if (plan.participants > 100) score += 2;
        else if (plan.participants > 50) score += 1;

        // Asset size
        if (plan.assets > 10000000) score += 2;
        else if (plan.assets > 5000000) score += 1;

        // Provider complexity
        const complexProviders = ['T Rowe Price', 'Empower'];
        if (complexProviders.includes(plan.provider)) score += 1;

        // Business unit
        if (plan.businessUnit === '3(16)') score += 2;
        else if (plan.businessUnit === 'Consulting') score += 3;

        // Plan type complexity
        if (plan.planType === 'Startup') score += 1;
        else if (plan.planType === 'TPA Change') score += 2;

        // Determine complexity level
        if (score >= 6) complexity = 'complex';
        else if (score >= 3) complexity = 'moderate';

        return complexity;
    }

    /**
     * Get implementation labor hours by complexity
     */
    getImplementationLaborHours(complexity) {
        const baseHours = {
            simple: {
                admin: 8,
                implementation: 12,
                consulting: 4,
                oversight: 3,
                sales: 6
            },
            moderate: {
                admin: 12,
                implementation: 20,
                consulting: 8,
                oversight: 5,
                sales: 8
            },
            complex: {
                admin: 18,
                implementation: 32,
                consulting: 16,
                oversight: 8,
                sales: 12
            }
        };

        return baseHours[complexity] || baseHours.simple;
    }

    /**
     * Get ongoing annual labor hours
     */
    getOngoingLaborHours(plan, complexity) {
        const baseHours = {
            simple: {
                admin: 24, // 2 hours per month
                consulting: 4,
                oversight: 6
            },
            moderate: {
                admin: 36, // 3 hours per month
                consulting: 8,
                oversight: 9
            },
            complex: {
                admin: 48, // 4 hours per month
                consulting: 16,
                oversight: 12
            }
        };

        // Adjust for participant count
        const participantMultiplier = Math.max(1, plan.participants / 50);
        const hours = baseHours[complexity] || baseHours.simple;

        return {
            admin: Math.round(hours.admin * participantMultiplier),
            consulting: hours.consulting,
            oversight: hours.oversight
        };
    }

    /**
     * Get implementation technology costs
     */
    getImplementationTechnologyCosts(plan) {
        // One-time setup costs for technology
        let cost = 200; // Base technology setup cost

        // Additional costs based on complexity
        if (plan.participants > 100) cost += 300;
        if (plan.assets > 5000000) cost += 200;
        if (plan.businessUnit === '3(16)') cost += 400;

        return cost;
    }

    /**
     * Get implementation operational costs
     */
    getImplementationOperationalCosts(plan) {
        // One-time operational setup costs
        let cost = 150; // Base operational cost

        // Travel costs for larger plans
        if (plan.assets > 10000000) cost += 800;
        else if (plan.assets > 5000000) cost += 400;

        return cost;
    }

    /**
     * Get implementation compliance costs
     */
    getImplementationComplianceCosts(plan) {
        // One-time compliance setup
        let cost = 300; // Base compliance cost

        if (plan.businessUnit === '3(16)') cost += 500;
        if (plan.planType === 'Startup') cost += 200;

        return cost;
    }

    /**
     * Get ongoing annual technology costs
     */
    getOngoingTechnologyCosts(plan) {
        // Annual technology costs allocated per plan
        return 240; // $20 per month per plan
    }

    /**
     * Get ongoing operational costs
     */
    getOngoingOperationalCosts(plan) {
        // Annual operational costs
        let cost = 180; // Base annual operational cost

        // Adjust for plan size
        if (plan.participants > 100) cost += 120;
        else if (plan.participants > 50) cost += 60;

        return cost;
    }

    /**
     * Get ongoing compliance costs
     */
    getOngoingComplianceCosts(plan) {
        // Annual compliance costs
        let cost = 200; // Base compliance cost

        if (plan.businessUnit === '3(16)') cost += 300;
        
        return cost;
    }

    /**
     * Calculate ROI metrics
     */
    calculateROIMetrics(revenue, costs) {
        const roi = {
            totalROI: 0,
            annualROI: 0,
            netProfit: 0,
            profitMargin: 0,
            paybackPeriod: 0,
            breakEvenPoint: 0
        };

        roi.netProfit = revenue.total - costs.total;
        roi.totalROI = costs.total > 0 ? (roi.netProfit / costs.total) * 100 : 0;
        roi.annualROI = roi.totalROI / 3; // Assuming 3-year analysis
        roi.profitMargin = revenue.total > 0 ? (roi.netProfit / revenue.total) * 100 : 0;

        // Calculate payback period (months to recover initial investment)
        if (revenue.ongoingAnnual > 0) {
            const monthlyProfit = (revenue.ongoingAnnual - costs.ongoingAnnual) / 12;
            roi.paybackPeriod = monthlyProfit > 0 ? Math.ceil(costs.yearOne / monthlyProfit) : 0;
        }

        // Break-even point (when total revenue equals total costs)
        roi.breakEvenPoint = costs.total;

        return roi;
    }

    /**
     * Calculate profitability metrics
     */
    calculateProfitabilityMetrics(revenue, costs) {
        const profitability = {
            grossProfit: revenue.total - costs.breakdown.labor,
            grossProfitMargin: 0,
            operatingProfit: revenue.total - costs.total,
            operatingProfitMargin: 0,
            contributionMargin: 0,
            variableCostRatio: 0
        };

        profitability.grossProfitMargin = revenue.total > 0 ? (profitability.grossProfit / revenue.total) * 100 : 0;
        profitability.operatingProfitMargin = revenue.total > 0 ? (profitability.operatingProfit / revenue.total) * 100 : 0;

        // Variable costs are primarily labor
        const variableCosts = costs.breakdown.labor;
        profitability.contributionMargin = revenue.total - variableCosts;
        profitability.variableCostRatio = revenue.total > 0 ? (variableCosts / revenue.total) * 100 : 0;

        return profitability;
    }

    /**
     * Calculate efficiency metrics
     */
    calculateEfficiencyMetrics(plan, revenue, costs) {
        const efficiency = {
            revenuePerParticipant: 0,
            costPerParticipant: 0,
            profitPerParticipant: 0,
            revenuePerAssetDollar: 0,
            laborEfficiency: 0,
            adminEfficiency: 0
        };

        if (plan.participants > 0) {
            efficiency.revenuePerParticipant = revenue.total / plan.participants;
            efficiency.costPerParticipant = costs.total / plan.participants;
            efficiency.profitPerParticipant = efficiency.revenuePerParticipant - efficiency.costPerParticipant;
        }

        if (plan.assets > 0) {
            efficiency.revenuePerAssetDollar = revenue.total / plan.assets;
        }

        // Labor efficiency (revenue per dollar of labor cost)
        if (costs.breakdown.labor > 0) {
            efficiency.laborEfficiency = revenue.total / costs.breakdown.labor;
        }

        // Admin efficiency (revenue per hour of admin time)
        const totalAdminHours = costs.laborBreakdown.admin / this.laborRates.admin;
        if (totalAdminHours > 0) {
            efficiency.adminEfficiency = revenue.total / totalAdminHours;
        }

        return efficiency;
    }

    /**
     * Generate ROI comparison report for multiple plans
     */
    async generateROIComparison(planIds, yearRange = 3) {
        console.log(`📊 Generating ROI comparison for ${planIds.length} plans...`);

        const comparisons = [];
        
        for (const planId of planIds) {
            try {
                const roiAnalysis = await this.calculatePlanROI(planId, yearRange);
                comparisons.push(roiAnalysis);
            } catch (error) {
                console.error(`Failed to calculate ROI for plan ${planId}:`, error);
            }
        }

        // Sort by ROI (highest first)
        comparisons.sort((a, b) => b.roi.totalROI - a.roi.totalROI);

        const comparisonReport = {
            generatedDate: new Date(),
            yearRange: yearRange,
            totalPlans: comparisons.length,
            summary: {
                averageROI: this.calculateAverage(comparisons, 'roi.totalROI'),
                medianROI: this.calculateMedian(comparisons, 'roi.totalROI'),
                totalRevenue: comparisons.reduce((sum, c) => sum + c.revenue.total, 0),
                totalCosts: comparisons.reduce((sum, c) => sum + c.costs.total, 0),
                totalProfit: comparisons.reduce((sum, c) => sum + c.roi.netProfit, 0)
            },
            topPerformers: comparisons.slice(0, 5),
            bottomPerformers: comparisons.slice(-5).reverse(),
            breakdownByRep: this.getROIBreakdownByRep(comparisons),
            breakdownByProvider: this.getROIBreakdownByProvider(comparisons),
            breakdownByBusinessUnit: this.getROIBreakdownByBusinessUnit(comparisons),
            comparisons: comparisons
        };

        console.log(`📊 ROI comparison complete: Avg ROI ${comparisonReport.summary.averageROI.toFixed(1)}%`);
        return comparisonReport;
    }

    /**
     * Get sample plan data (in production, this would query Firebase)
     */
    async getPlan(planId) {
        // Sample plan data - in production this would come from Firebase
        const samplePlans = {
            'plan_001': {
                id: 'plan_001',
                name: 'Mayville State Bank',
                provider: 'Transamerica',
                rep: 'Joe',
                admin: 'Jacob',
                businessUnit: 'DC',
                planType: 'Conversion',
                assets: 3100000,
                deposits: 86000,
                participants: 42,
                fees: {
                    document: 0,
                    adminBase: 1600,
                    audit: 0,
                    newComparability: 0,
                    participant: 25,
                    consulting: 0
                },
                eligibility: {
                    installation: true,
                    ongoing: true
                }
            }
            // Add more sample plans as needed
        };

        return samplePlans[planId] || null;
    }

    /**
     * Utility methods for statistics
     */
    calculateAverage(array, path) {
        if (array.length === 0) return 0;
        const sum = array.reduce((sum, item) => sum + this.getNestedValue(item, path), 0);
        return sum / array.length;
    }

    calculateMedian(array, path) {
        if (array.length === 0) return 0;
        const values = array.map(item => this.getNestedValue(item, path)).sort((a, b) => a - b);
        const mid = Math.floor(values.length / 2);
        return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj) || 0;
    }

    getROIBreakdownByRep(comparisons) {
        const breakdown = {};
        comparisons.forEach(comp => {
            if (!breakdown[comp.rep]) {
                breakdown[comp.rep] = { count: 0, totalROI: 0, totalRevenue: 0, totalCosts: 0 };
            }
            breakdown[comp.rep].count++;
            breakdown[comp.rep].totalROI += comp.roi.totalROI;
            breakdown[comp.rep].totalRevenue += comp.revenue.total;
            breakdown[comp.rep].totalCosts += comp.costs.total;
        });

        // Calculate averages
        Object.keys(breakdown).forEach(rep => {
            const data = breakdown[rep];
            data.averageROI = data.count > 0 ? data.totalROI / data.count : 0;
            data.averageRevenue = data.count > 0 ? data.totalRevenue / data.count : 0;
            data.averageCosts = data.count > 0 ? data.totalCosts / data.count : 0;
        });

        return breakdown;
    }

    getROIBreakdownByProvider(comparisons) {
        const breakdown = {};
        comparisons.forEach(comp => {
            if (!breakdown[comp.provider]) {
                breakdown[comp.provider] = { count: 0, totalROI: 0, totalRevenue: 0, totalCosts: 0 };
            }
            breakdown[comp.provider].count++;
            breakdown[comp.provider].totalROI += comp.roi.totalROI;
            breakdown[comp.provider].totalRevenue += comp.revenue.total;
            breakdown[comp.provider].totalCosts += comp.costs.total;
        });

        // Calculate averages
        Object.keys(breakdown).forEach(provider => {
            const data = breakdown[provider];
            data.averageROI = data.count > 0 ? data.totalROI / data.count : 0;
            data.averageRevenue = data.count > 0 ? data.totalRevenue / data.count : 0;
            data.averageCosts = data.count > 0 ? data.totalCosts / data.count : 0;
        });

        return breakdown;
    }

    getROIBreakdownByBusinessUnit(comparisons) {
        const breakdown = {};
        comparisons.forEach(comp => {
            if (!breakdown[comp.businessUnit]) {
                breakdown[comp.businessUnit] = { count: 0, totalROI: 0, totalRevenue: 0, totalCosts: 0 };
            }
            breakdown[comp.businessUnit].count++;
            breakdown[comp.businessUnit].totalROI += comp.roi.totalROI;
            breakdown[comp.businessUnit].totalRevenue += comp.revenue.total;
            breakdown[comp.businessUnit].totalCosts += comp.costs.total;
        });

        // Calculate averages
        Object.keys(breakdown).forEach(unit => {
            const data = breakdown[unit];
            data.averageROI = data.count > 0 ? data.totalROI / data.count : 0;
            data.averageRevenue = data.count > 0 ? data.totalRevenue / data.count : 0;
            data.averageCosts = data.count > 0 ? data.totalCosts / data.count : 0;
        });

        return breakdown;
    }

    /**
     * Export ROI data to CSV
     */
    exportROIToCSV(roiData) {
        if (Array.isArray(roiData)) {
            // Export comparison data
            const headers = [
                'Plan Name', 'Provider', 'Rep', 'Business Unit',
                'Total Revenue', 'Total Costs', 'Net Profit',
                'ROI %', 'Profit Margin %', 'Payback Period (months)',
                'Revenue per Participant', 'Cost per Participant'
            ];

            const rows = roiData.map(roi => [
                roi.planName,
                roi.provider,
                roi.rep,
                roi.businessUnit,
                roi.revenue.total.toFixed(2),
                roi.costs.total.toFixed(2),
                roi.roi.netProfit.toFixed(2),
                roi.roi.totalROI.toFixed(2),
                roi.roi.profitMargin.toFixed(2),
                roi.roi.paybackPeriod,
                roi.efficiency.revenuePerParticipant.toFixed(2),
                roi.efficiency.costPerParticipant.toFixed(2)
            ]);

            return this.arrayToCSV([headers, ...rows]);
        } else {
            // Export single plan data
            const data = [
                ['Metric', 'Value'],
                ['Plan Name', roiData.planName],
                ['Total Revenue', `$${roiData.revenue.total.toFixed(2)}`],
                ['Total Costs', `$${roiData.costs.total.toFixed(2)}`],
                ['Net Profit', `$${roiData.roi.netProfit.toFixed(2)}`],
                ['ROI %', `${roiData.roi.totalROI.toFixed(2)}%`],
                ['Profit Margin %', `${roiData.roi.profitMargin.toFixed(2)}%`],
                ['Payback Period', `${roiData.roi.paybackPeriod} months`]
            ];

            return this.arrayToCSV(data);
        }
    }

    arrayToCSV(array) {
        return array.map(row =>
            row.map(cell => `"${cell}"`).join(',')
        ).join('\n');
    }
}

// Create global instance
window.roiTracker = new ROITracker();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ROITracker;
}

// Example usage:
//
// // Calculate ROI for single plan
// const roi = await window.roiTracker.calculatePlanROI('plan_001', 3);
// console.log('Plan ROI:', roi);
//
// // Generate comparison report
// const comparison = await window.roiTracker.generateROIComparison(['plan_001', 'plan_002', 'plan_003']);
// console.log('ROI Comparison:', comparison);
//
// // Export to CSV
// const csvData = window.roiTracker.exportROIToCSV(comparison.comparisons);
// console.log('CSV Export:', csvData);


















