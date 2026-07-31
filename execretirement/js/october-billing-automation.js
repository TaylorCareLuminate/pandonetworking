// October Q1-Q3 Lump Sum Billing Automation
// Handles the automated quarterly billing process for October

class OctoberBillingAutomation {
    constructor() {
        this.billingYear = new Date().getFullYear();
        this.eligiblePlans = [];
        this.billingQueue = [];
        this.processedBilling = [];
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        console.log('📅 October Billing Automation initializing...');
        
        // Wait for dependencies
        await window.revenueDb.initialize();
        await window.revenueCalculator.initialize();

        this.initialized = true;
        console.log('✅ October Billing Automation ready');
    }

    /**
     * Main entry point for October billing process
     * Should be called on October 1st or manually triggered
     */
    async executeOctoberBilling() {
        try {
            console.log(`🎯 Starting October ${this.billingYear} Q1-Q3 lump sum billing...`);

            // Step 1: Identify eligible plans
            await this.identifyEligiblePlans();

            // Step 2: Calculate quarterly amounts
            await this.calculateQuarterlyAmounts();

            // Step 3: Generate billing records
            await this.generateBillingRecords();

            // Step 4: Create consolidated invoices
            await this.createConsolidatedInvoices();

            // Step 5: Update revenue recognition
            await this.updateRevenueRecognition();

            // Step 6: Generate reports
            const report = await this.generateBillingReport();

            console.log('🎉 October billing process completed successfully');
            return {
                success: true,
                processedPlans: this.eligiblePlans.length,
                totalBilled: this.getTotalBilledAmount(),
                report: report
            };

        } catch (error) {
            console.error('❌ October billing process failed:', error);
            return {
                success: false,
                error: error.message,
                processedPlans: 0
            };
        }
    }

    /**
     * Identify plans eligible for Q1-Q3 October billing
     */
    async identifyEligiblePlans() {
        console.log('🔍 Identifying eligible plans for October billing...');

        // In production, this would query Firebase for active plans
        // For now, using sample data to demonstrate the process
        const allPlans = await this.getAllActivePlans();
        
        this.eligiblePlans = allPlans.filter(plan => {
            return this.isPlanEligibleForOctoberBilling(plan);
        });

        console.log(`📋 Found ${this.eligiblePlans.length} plans eligible for October billing`);
    }

    /**
     * Check if a plan is eligible for October Q1-Q3 billing
     */
    isPlanEligibleForOctoberBilling(plan) {
        // Eligibility criteria:
        // 1. Plan must be active
        // 2. Plan must have ongoing revenue (not built-in only)
        // 3. Plan must not have been fully billed for Q1-Q3 already
        // 4. Plan must have had activity in current year

        if (plan.status !== 'active') return false;
        
        if (!plan.eligibility?.ongoing) return false;
        
        // Check if provider requires built-in BPS (no revenue share)
        if (window.revenueCalculator.requiresBuiltInBPS(plan.provider)) return false;

        // Check if already fully billed for Q1-Q3
        if (this.isAlreadyBilledForQuarters(plan)) return false;

        // Check if plan had activity this year
        if (!this.hasActivityInCurrentYear(plan)) return false;

        return true;
    }

    /**
     * Check if plan has already been billed for Q1-Q3
     */
    isAlreadyBilledForQuarters(plan) {
        // In production, this would check billing records in Firebase
        // For now, assume some plans have partial billing
        const billingHistory = plan.billingHistory || {};
        const currentYear = this.billingYear;
        
        const q1Billed = billingHistory[`${currentYear}-Q1`]?.billed || false;
        const q2Billed = billingHistory[`${currentYear}-Q2`]?.billed || false;
        const q3Billed = billingHistory[`${currentYear}-Q3`]?.billed || false;

        // If all three quarters already billed, skip
        return q1Billed && q2Billed && q3Billed;
    }

    /**
     * Check if plan had activity in current year
     */
    hasActivityInCurrentYear(plan) {
        // Check if plan was active during any part of the current year
        const planStartDate = new Date(plan.firstBilled || '2023-01-01');
        const currentYearStart = new Date(this.billingYear, 0, 1);
        
        return planStartDate <= new Date(); // Plan existed before now
    }

    /**
     * Calculate quarterly amounts for each eligible plan
     */
    async calculateQuarterlyAmounts() {
        console.log('💰 Calculating quarterly amounts...');

        for (const plan of this.eligiblePlans) {
            const quarterlyAmounts = await this.calculatePlanQuarterlyAmounts(plan);
            plan.octoberBilling = quarterlyAmounts;
        }
    }

    /**
     * Calculate quarterly billing amounts for a specific plan
     */
    async calculatePlanQuarterlyAmounts(plan) {
        // Calculate ongoing revenue for the plan
        const ongoingAnnual = window.revenueCalculator.calculateOngoingRevenue(
            plan.assets,
            plan.provider,
            plan.eligibility?.ongoing || false
        );

        // Quarterly amount (divide annual by 4)
        const quarterlyAmount = Math.round((ongoingAnnual / 4) * 100) / 100;

        // Determine which quarters need billing
        const billingHistory = plan.billingHistory || {};
        const currentYear = this.billingYear;

        const quarters = [
            {
                quarter: 'Q1',
                amount: quarterlyAmount,
                alreadyBilled: billingHistory[`${currentYear}-Q1`]?.billed || false,
                billedAmount: billingHistory[`${currentYear}-Q1`]?.amount || 0
            },
            {
                quarter: 'Q2',
                amount: quarterlyAmount,
                alreadyBilled: billingHistory[`${currentYear}-Q2`]?.billed || false,
                billedAmount: billingHistory[`${currentYear}-Q2`]?.amount || 0
            },
            {
                quarter: 'Q3',
                amount: quarterlyAmount,
                alreadyBilled: billingHistory[`${currentYear}-Q3`]?.billed || false,
                billedAmount: billingHistory[`${currentYear}-Q3`]?.amount || 0
            }
        ];

        // Calculate unbilled amounts
        const unbilledQuarters = quarters.filter(q => !q.alreadyBilled);
        const totalUnbilledAmount = unbilledQuarters.reduce((sum, q) => sum + q.amount, 0);

        return {
            annualOngoing: ongoingAnnual,
            quarterlyAmount: quarterlyAmount,
            quarters: quarters,
            unbilledQuarters: unbilledQuarters,
            totalUnbilledAmount: totalUnbilledAmount,
            calculatedDate: new Date()
        };
    }

    /**
     * Generate billing records for October lump sum
     */
    async generateBillingRecords() {
        console.log('📄 Generating billing records...');

        this.billingQueue = [];

        for (const plan of this.eligiblePlans) {
            if (plan.octoberBilling.totalUnbilledAmount > 0) {
                const billingRecord = {
                    planId: plan.id,
                    planName: plan.name,
                    provider: plan.provider,
                    rep: plan.rep,
                    admin: plan.admin,
                    billingDate: new Date(),
                    billingYear: this.billingYear,
                    billingType: 'OCTOBER_Q1Q3_LUMP',
                    quarters: plan.octoberBilling.unbilledQuarters,
                    totalAmount: plan.octoberBilling.totalUnbilledAmount,
                    invoiceGenerated: false,
                    paymentReceived: false,
                    notes: `October ${this.billingYear} Q1-Q3 lump sum billing`
                };

                this.billingQueue.push(billingRecord);
            }
        }

        console.log(`📋 Generated ${this.billingQueue.length} billing records`);
    }

    /**
     * Create consolidated invoices for October billing
     */
    async createConsolidatedInvoices() {
        console.log('🧾 Creating consolidated invoices...');

        // Group billing records by admin for easier processing
        const billingByAdmin = this.groupBillingByAdmin();

        for (const [adminId, adminBilling] of billingByAdmin) {
            const invoice = await this.createAdminInvoice(adminId, adminBilling);
            
            // Mark billing records as invoice generated
            adminBilling.forEach(billing => {
                billing.invoiceGenerated = true;
                billing.invoiceId = invoice.id;
            });
        }

        // In production, this would also:
        // - Generate PDF invoices
        // - Send email notifications
        // - Update billing system
    }

    /**
     * Group billing records by admin for consolidated invoices
     */
    groupBillingByAdmin() {
        const grouped = new Map();

        this.billingQueue.forEach(billing => {
            const adminId = billing.admin;
            if (!grouped.has(adminId)) {
                grouped.set(adminId, []);
            }
            grouped.get(adminId).push(billing);
        });

        return grouped;
    }

    /**
     * Create invoice for specific admin's plans
     */
    async createAdminInvoice(adminId, adminBilling) {
        const totalAmount = adminBilling.reduce((sum, billing) => sum + billing.totalAmount, 0);
        const planCount = adminBilling.length;

        const invoice = {
            id: `OCT_${this.billingYear}_${adminId}_${Date.now()}`,
            adminId: adminId,
            adminName: this.getAdminName(adminId),
            billingDate: new Date(),
            billingPeriod: `Q1-Q3 ${this.billingYear}`,
            billingType: 'OCTOBER_LUMP_SUM',
            planCount: planCount,
            totalAmount: totalAmount,
            lineItems: adminBilling.map(billing => ({
                planId: billing.planId,
                planName: billing.planName,
                provider: billing.provider,
                quarters: billing.quarters.map(q => q.quarter).join(', '),
                amount: billing.totalAmount
            })),
            status: 'GENERATED',
            generatedDate: new Date()
        };

        // In production, save to Firebase
        console.log(`📄 Generated invoice ${invoice.id} for ${adminId}: ${this.formatCurrency(totalAmount)}`);

        return invoice;
    }

    /**
     * Update revenue recognition for October billing
     */
    async updateRevenueRecognition() {
        console.log('📊 Updating revenue recognition...');

        for (const billing of this.billingQueue) {
            // Update plan billing history
            await this.updatePlanBillingHistory(billing);
            
            // Update revenue recognition records
            await this.updateRevenueRecognitionRecords(billing);
            
            // Update invoice year breakdown
            await this.updateInvoiceYearBreakdown(billing);
        }

        this.processedBilling = [...this.billingQueue];
        console.log(`📈 Updated revenue recognition for ${this.processedBilling.length} billing records`);
    }

    /**
     * Update plan billing history
     */
    async updatePlanBillingHistory(billing) {
        const planId = billing.planId;
        
        // Mark each quarter as billed
        billing.quarters.forEach(quarter => {
            const billingKey = `${billing.billingYear}-${quarter.quarter}`;
            // In production: update plan.billingHistory[billingKey] in Firebase
            console.log(`✓ Marked ${planId} ${billingKey} as billed: ${this.formatCurrency(quarter.amount)}`);
        });
    }

    /**
     * Update revenue recognition records
     */
    async updateRevenueRecognitionRecords(billing) {
        // Create revenue recognition entries for each quarter
        billing.quarters.forEach(quarter => {
            const revenueEntry = {
                planId: billing.planId,
                planName: billing.planName,
                provider: billing.provider,
                workYear: billing.billingYear,
                invoiceYear: billing.billingYear,
                quarter: quarter.quarter,
                amount: quarter.amount,
                recognitionDate: new Date(),
                recognitionMethod: 'CASH',
                billingType: 'OCTOBER_LUMP_SUM',
                invoiceId: billing.invoiceId || null
            };

            // In production: save revenueEntry to Firebase
            console.log(`📊 Revenue recognition: ${billing.planName} ${quarter.quarter} ${this.formatCurrency(quarter.amount)}`);
        });
    }

    /**
     * Update invoice year breakdown for analytics
     */
    async updateInvoiceYearBreakdown(billing) {
        // Update the invoiceYearBreakdown for work year vs invoice year analytics
        const workYear = billing.billingYear;
        const invoiceYear = billing.billingYear;
        const amount = billing.totalAmount;

        // In production: update plan.years[workYear].invoiceYearBreakdown[invoiceYear]
        console.log(`📈 Invoice breakdown: Work Year ${workYear} → Invoice Year ${invoiceYear}: ${this.formatCurrency(amount)}`);
    }

    /**
     * Generate comprehensive billing report
     */
    async generateBillingReport() {
        const report = {
            executionDate: new Date(),
            billingYear: this.billingYear,
            billingPeriod: 'Q1-Q3',
            summary: {
                totalPlansProcessed: this.eligiblePlans.length,
                plansWithBilling: this.billingQueue.length,
                totalAmountBilled: this.getTotalBilledAmount(),
                averageAmountPerPlan: this.getAverageAmountPerPlan()
            },
            breakdownByProvider: this.getBreakdownByProvider(),
            breakdownByRep: this.getBreakdownByRep(),
            breakdownByAdmin: this.getBreakdownByAdmin(),
            quarterlyBreakdown: this.getQuarterlyBreakdown(),
            processingDetails: {
                eligiblePlansIdentified: this.eligiblePlans.length,
                billingRecordsGenerated: this.billingQueue.length,
                invoicesCreated: this.getUniqueAdminCount(),
                revenueRecognitionUpdated: this.processedBilling.length
            }
        };

        console.log('📊 October billing report generated:', report.summary);
        return report;
    }

    /**
     * Helper methods for report generation
     */
    getTotalBilledAmount() {
        return this.billingQueue.reduce((sum, billing) => sum + billing.totalAmount, 0);
    }

    getAverageAmountPerPlan() {
        const total = this.getTotalBilledAmount();
        const count = this.billingQueue.length;
        return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
    }

    getBreakdownByProvider() {
        const breakdown = {};
        this.billingQueue.forEach(billing => {
            if (!breakdown[billing.provider]) {
                breakdown[billing.provider] = { count: 0, amount: 0 };
            }
            breakdown[billing.provider].count++;
            breakdown[billing.provider].amount += billing.totalAmount;
        });
        return breakdown;
    }

    getBreakdownByRep() {
        const breakdown = {};
        this.billingQueue.forEach(billing => {
            if (!breakdown[billing.rep]) {
                breakdown[billing.rep] = { count: 0, amount: 0 };
            }
            breakdown[billing.rep].count++;
            breakdown[billing.rep].amount += billing.totalAmount;
        });
        return breakdown;
    }

    getBreakdownByAdmin() {
        const breakdown = {};
        this.billingQueue.forEach(billing => {
            if (!breakdown[billing.admin]) {
                breakdown[billing.admin] = { count: 0, amount: 0 };
            }
            breakdown[billing.admin].count++;
            breakdown[billing.admin].amount += billing.totalAmount;
        });
        return breakdown;
    }

    getQuarterlyBreakdown() {
        const breakdown = { Q1: 0, Q2: 0, Q3: 0 };
        this.billingQueue.forEach(billing => {
            billing.quarters.forEach(quarter => {
                breakdown[quarter.quarter] += quarter.amount;
            });
        });
        return breakdown;
    }

    getUniqueAdminCount() {
        const admins = new Set(this.billingQueue.map(billing => billing.admin));
        return admins.size;
    }

    /**
     * Get all active plans (sample data)
     */
    async getAllActivePlans() {
        // In production, this would query Firebase for all active plans
        // For now, returning sample data
        return [
            {
                id: 'plan_001',
                name: 'Mayville State Bank',
                provider: 'Transamerica',
                rep: 'Joe',
                admin: 'Jacob',
                status: 'active',
                assets: 3100000,
                deposits: 86000,
                eligibility: { installation: true, ongoing: true },
                firstBilled: '2023-01-15',
                billingHistory: {
                    '2024-Q1': { billed: false, amount: 0 },
                    '2024-Q2': { billed: false, amount: 0 }
                }
            },
            {
                id: 'plan_002',
                name: 'Jeff\'s Bronco Graveyard 401(k)',
                provider: 'John Hancock',
                rep: 'Joe',
                admin: 'Glenn',
                status: 'active',
                assets: 3900000,
                deposits: 135000,
                eligibility: { installation: true, ongoing: true },
                firstBilled: '2023-03-01',
                billingHistory: {
                    '2024-Q1': { billed: true, amount: 487.5 },
                    '2024-Q2': { billed: false, amount: 0 }
                }
            },
            {
                id: 'plan_003',
                name: 'ColdQuanta Inc',
                provider: 'T Rowe Price',
                rep: 'Dean',
                admin: 'Kim',
                status: 'active',
                assets: 10280000,
                deposits: 0,
                eligibility: { installation: false, ongoing: false }, // Built-in BPS
                firstBilled: '2023-02-01'
            },
            {
                id: 'plan_004',
                name: 'Parts and Screens Manufacturing',
                provider: 'Transamerica',
                rep: 'Joe',
                admin: 'Jacob',
                status: 'active',
                assets: 4800000,
                deposits: 100000,
                eligibility: { installation: true, ongoing: true },
                firstBilled: '2023-01-01',
                billingHistory: {}
            }
        ];
    }

    /**
     * Get admin name by ID
     */
    getAdminName(adminId) {
        const adminNames = {
            'jacob': 'Jacob',
            'kim': 'Kim',
            'glenn': 'Glenn',
            'jennifer': 'Jennifer',
            'logan': 'Logan'
        };
        return adminNames[adminId] || adminId;
    }

    /**
     * Format currency for display
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    /**
     * Schedule October billing to run automatically
     */
    scheduleAutomaticBilling() {
        // In production, this would set up a scheduled Cloud Function
        // to run on October 1st each year
        console.log('📅 Scheduling automatic October billing for October 1st...');
        
        const now = new Date();
        const currentYear = now.getFullYear();
        const nextOctoberFirst = new Date(currentYear, 9, 1); // October 1st (month 9 = October)
        
        // If October 1st has already passed this year, schedule for next year
        if (now > nextOctoberFirst) {
            nextOctoberFirst.setFullYear(currentYear + 1);
        }
        
        const msUntilOctober = nextOctoberFirst.getTime() - now.getTime();
        const daysUntilOctober = Math.ceil(msUntilOctober / (1000 * 60 * 60 * 24));
        
        console.log(`📅 Next automatic October billing scheduled for ${nextOctoberFirst.toDateString()} (${daysUntilOctober} days)`);
        
        // In production: Create Cloud Scheduler job or Firebase scheduled function
        return {
            nextRunDate: nextOctoberFirst,
            daysUntil: daysUntilOctober
        };
    }

    /**
     * Get preview of October billing without executing
     */
    async previewOctoberBilling() {
        console.log('👁️ Generating October billing preview...');
        
        await this.identifyEligiblePlans();
        await this.calculateQuarterlyAmounts();

        const preview = {
            eligiblePlans: this.eligiblePlans.length,
            totalProjectedBilling: this.eligiblePlans.reduce((sum, plan) => sum + (plan.octoberBilling?.totalUnbilledAmount || 0), 0),
            planBreakdown: this.eligiblePlans.map(plan => ({
                planId: plan.id,
                planName: plan.name,
                provider: plan.provider,
                rep: plan.rep,
                admin: plan.admin,
                unbilledQuarters: plan.octoberBilling?.unbilledQuarters?.map(q => q.quarter) || [],
                projectedAmount: plan.octoberBilling?.totalUnbilledAmount || 0
            })),
            providerBreakdown: this.getPreviewBreakdownByProvider(),
            repBreakdown: this.getPreviewBreakdownByRep()
        };

        console.log(`👁️ October billing preview: ${preview.eligiblePlans} plans, ${this.formatCurrency(preview.totalProjectedBilling)} total`);
        return preview;
    }

    getPreviewBreakdownByProvider() {
        const breakdown = {};
        this.eligiblePlans.forEach(plan => {
            const provider = plan.provider;
            const amount = plan.octoberBilling?.totalUnbilledAmount || 0;
            
            if (!breakdown[provider]) {
                breakdown[provider] = { count: 0, amount: 0 };
            }
            breakdown[provider].count++;
            breakdown[provider].amount += amount;
        });
        return breakdown;
    }

    getPreviewBreakdownByRep() {
        const breakdown = {};
        this.eligiblePlans.forEach(plan => {
            const rep = plan.rep;
            const amount = plan.octoberBilling?.totalUnbilledAmount || 0;
            
            if (!breakdown[rep]) {
                breakdown[rep] = { count: 0, amount: 0 };
            }
            breakdown[rep].count++;
            breakdown[rep].amount += amount;
        });
        return breakdown;
    }
}

// Create global instance
window.octoberBilling = new OctoberBillingAutomation();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OctoberBillingAutomation;
}

// Example usage:
// 
// // Preview October billing
// const preview = await window.octoberBilling.previewOctoberBilling();
// console.log('Preview:', preview);
//
// // Execute October billing
// const result = await window.octoberBilling.executeOctoberBilling();
// console.log('Result:', result);
//
// // Schedule automatic billing
// const schedule = window.octoberBilling.scheduleAutomaticBilling();
// console.log('Schedule:', schedule);


















