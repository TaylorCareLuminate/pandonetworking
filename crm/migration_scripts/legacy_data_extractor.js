/**
 * Legacy Data Extractor
 * Extracts data from hl_crm_input_25 in HealthcareITDatabase
 */

class LegacyDataExtractor {
    constructor() {
        this.firebaseRTDB = window.firebaseRTDB;
        this.batchSize = 100;
        this.extractionResults = {
            totalOrgs: 0,
            totalContacts: 0,
            totalActivities: 0,
            errors: [],
            warnings: []
        };
    }

    /**
     * Extract all legacy CRM data
     */
    async extractAllLegacyData() {
        console.log('🔍 Starting legacy data extraction from hl_crm_input_25...');
        
        try {
            const legacyRef = this.firebaseRTDB.ref('hl_crm_input_25');
            const snapshot = await this.firebaseRTDB.get(legacyRef);
            
            if (!snapshot.exists()) {
                console.log('⚠️ No legacy data found at hl_crm_input_25');
                return { contacts: [], results: this.extractionResults };
            }
            
            const legacyData = snapshot.val();
            const extractedContacts = [];
            
            console.log(`📊 Found ${Object.keys(legacyData).length} organizations in legacy data`);
            this.extractionResults.totalOrgs = Object.keys(legacyData).length;
            
            // Process each organization
            for (const [orgId, orgData] of Object.entries(legacyData)) {
                try {
                    const orgContacts = await this.extractOrganizationData(orgId, orgData);
                    extractedContacts.push(...orgContacts);
                } catch (error) {
                    this.extractionResults.errors.push({
                        type: 'org_extraction_error',
                        orgId,
                        error: error.message
                    });
                }
            }
            
            this.extractionResults.totalContacts = extractedContacts.length;
            
            console.log('✅ Legacy data extraction completed');
            console.log(`📈 Results: ${this.extractionResults.totalContacts} contacts, ${this.extractionResults.totalActivities} activities`);
            
            return {
                contacts: extractedContacts,
                results: this.extractionResults
            };
            
        } catch (error) {
            console.error('❌ Fatal error during legacy data extraction:', error);
            throw error;
        }
    }

    /**
     * Extract data for a specific organization
     */
    async extractOrganizationData(orgId, orgData) {
        const orgContacts = [];
        
        // Check if organization has outreach data
        if (!orgData || !orgData.outreach) {
            this.extractionResults.warnings.push({
                type: 'no_outreach_data',
                orgId,
                message: 'Organization has no outreach data'
            });
            return orgContacts;
        }
        
        // Process each contact's outreach history
        for (const [encodedEmail, outreachLogs] of Object.entries(orgData.outreach)) {
            try {
                const contact = await this.buildContactFromLegacy(orgId, encodedEmail, outreachLogs);
                if (contact) {
                    orgContacts.push(contact);
                }
            } catch (error) {
                this.extractionResults.errors.push({
                    type: 'contact_extraction_error',
                    orgId,
                    encodedEmail,
                    error: error.message
                });
            }
        }
        
        return orgContacts;
    }

    /**
     * Build contact object from legacy data
     */
    async buildContactFromLegacy(orgId, encodedEmail, outreachLogs) {
        try {
            // Decode email from Firebase key format
            const email = this.decodeEmailKey(encodedEmail);
            
            if (!this.isValidEmail(email)) {
                this.extractionResults.warnings.push({
                    type: 'invalid_email',
                    orgId,
                    encodedEmail,
                    decodedEmail: email
                });
                return null;
            }
            
            // Generate contact ID
            const contactId = this.generateContactId(email);
            
            // Process outreach activities
            const activities = this.processOutreachLogs(outreachLogs);
            this.extractionResults.totalActivities += activities.length;
            
            // Determine customer (you may need to customize this logic)
            const customerId = this.determineCustomerFromLegacyData(orgId, email, activities);
            
            // Build contact object
            const contact = {
                contactId,
                email,
                alternateEmails: [],
                phone: null, // Will be populated if found in activities
                linkedInUrl: null, // Will be populated if found in activities
                
                // Extract name from activities if available
                firstName: this.extractFirstName(activities),
                lastName: this.extractLastName(activities),
                fullName: this.extractFullName(activities),
                title: this.extractTitle(activities),
                company: this.extractOrgNameFromId(orgId),
                
                // Organization grouping
                orgId: orgId,
                orgName: this.extractOrgNameFromId(orgId),
                
                // Outreach history
                outreach: {
                    email: {
                        lastContact: activities.length > 0 ? activities[activities.length - 1].date : null,
                        totalContacts: activities.length,
                        activities: activities
                    },
                    linkedin: {
                        lastContact: null,
                        totalContacts: 0,
                        activities: []
                    },
                    phone: {
                        lastContact: null,
                        totalContacts: 0,
                        activities: []
                    }
                },
                
                // Quick access fields
                lastAnyContact: activities.length > 0 ? activities[activities.length - 1].date : null,
                totalContacts: activities.length,
                hasRecentContact: this.isRecentContact(activities),
                
                // Status and metadata
                status: 'active',
                tags: this.extractTags(activities),
                createdAt: activities.length > 0 ? activities[0].date : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastModifiedBy: 'migration_system',
                
                // Migration tracking
                migrationSource: 'legacy_hl_crm_input_25',
                migrationDate: new Date().toISOString(),
                legacyOrgId: orgId,
                legacyEncodedEmail: encodedEmail,
                customerId: customerId
            };
            
            return contact;
            
        } catch (error) {
            console.error(`❌ Error building contact from legacy data:`, error);
            throw error;
        }
    }

    /**
     * Process outreach logs into activities array
     */
    processOutreachLogs(outreachLogs) {
        const activities = [];
        
        if (!outreachLogs || typeof outreachLogs !== 'object') {
            return activities;
        }
        
        for (const [logKey, log] of Object.entries(outreachLogs)) {
            try {
                // Validate log data
                if (!log || !log.date) {
                    this.extractionResults.warnings.push({
                        type: 'invalid_log_entry',
                        logKey,
                        message: 'Log entry missing date'
                    });
                    continue;
                }
                
                const activity = {
                    date: log.date,
                    type: log.type || 'Unknown Activity',
                    campaign: this.extractCampaignFromType(log.type),
                    account: log.user || 'unknown',
                    result: 'completed', // Legacy data assumes completion
                    notes: log.notes || '',
                    legacyLogId: logKey,
                    migrationSource: 'legacy_hl_crm_input_25'
                };
                
                activities.push(activity);
                
            } catch (error) {
                this.extractionResults.errors.push({
                    type: 'activity_processing_error',
                    logKey,
                    error: error.message
                });
            }
        }
        
        // Sort activities by date
        activities.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        return activities;
    }

    /**
     * Utility functions
     */
    decodeEmailKey(encodedEmail) {
        return encodedEmail
            .replace(/_DOT_/g, '.')
            .replace(/_AT_/g, '@')
            .toLowerCase()
            .trim();
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    generateContactId(email) {
        return email.toLowerCase()
            .replace(/[^a-z0-9@.]/g, '_')
            .replace(/[@.]/g, '_');
    }

    determineCustomerFromLegacyData(orgId, email, activities) {
        // Default logic - you may want to customize this
        // Could be based on:
        // - Email domain patterns
        // - Date ranges
        // - User who created the data
        // - Organization patterns
        
        // For now, assign to internal customer
        return 'internal';
    }

    extractOrgNameFromId(orgId) {
        // Convert org ID to readable name
        return orgId
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    extractFirstName(activities) {
        // Try to extract first name from activity notes
        for (const activity of activities) {
            if (activity.notes) {
                const nameMatch = activity.notes.match(/first.*?name[:\s]+([a-zA-Z]+)/i);
                if (nameMatch) return nameMatch[1];
            }
        }
        return '';
    }

    extractLastName(activities) {
        // Try to extract last name from activity notes
        for (const activity of activities) {
            if (activity.notes) {
                const nameMatch = activity.notes.match(/last.*?name[:\s]+([a-zA-Z]+)/i);
                if (nameMatch) return nameMatch[1];
            }
        }
        return '';
    }

    extractFullName(activities) {
        const firstName = this.extractFirstName(activities);
        const lastName = this.extractLastName(activities);
        return `${firstName} ${lastName}`.trim() || '';
    }

    extractTitle(activities) {
        // Try to extract title from activity notes
        for (const activity of activities) {
            if (activity.notes) {
                const titleMatch = activity.notes.match(/title[:\s]+([^,\n]+)/i);
                if (titleMatch) return titleMatch[1].trim();
            }
        }
        return '';
    }

    extractCampaignFromType(type) {
        if (!type) return '';
        
        // Extract campaign info from activity type
        if (type.includes('Initial')) return 'initial_outreach';
        if (type.includes('Follow')) return 'follow_up';
        if (type.includes('LinkedIn')) return 'linkedin_outreach';
        
        return 'general_outreach';
    }

    extractTags(activities) {
        const tags = [];
        
        // Add tags based on activity patterns
        const hasEmail = activities.some(a => a.type.toLowerCase().includes('email'));
        const hasLinkedIn = activities.some(a => a.type.toLowerCase().includes('linkedin'));
        const hasPhone = activities.some(a => a.type.toLowerCase().includes('phone') || a.type.toLowerCase().includes('call'));
        
        if (hasEmail) tags.push('email_outreach');
        if (hasLinkedIn) tags.push('linkedin_outreach');
        if (hasPhone) tags.push('phone_outreach');
        
        return tags;
    }

    isRecentContact(activities) {
        if (activities.length === 0) return false;
        
        const lastActivity = activities[activities.length - 1];
        const lastDate = new Date(lastActivity.date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        return lastDate > thirtyDaysAgo;
    }

    /**
     * Export extracted data to JSON for review
     */
    exportToJSON(contacts, filename = 'legacy_extracted_data.json') {
        const exportData = {
            extractionDate: new Date().toISOString(),
            extractionResults: this.extractionResults,
            contacts: contacts
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        link.click();
        
        console.log(`📁 Extracted data exported to ${filename}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LegacyDataExtractor;
} else {
    window.LegacyDataExtractor = LegacyDataExtractor;
}


