/**
 * Data Transformer
 * Converts extracted legacy data to new unified CRM schema
 */

class DataTransformer {
    constructor() {
        this.transformationResults = {
            processed: 0,
            transformed: 0,
            skipped: 0,
            errors: [],
            warnings: []
        };
        
        // Configuration for data transformation rules
        this.transformationRules = {
            emailNormalization: true,
            phoneNormalization: true,
            nameCapitalization: true,
            companyNameCleaning: true,
            activityTypeMapping: true
        };
    }

    /**
     * Transform array of extracted contacts to unified schema
     */
    async transformContacts(extractedContacts) {
        console.log('🔄 Starting data transformation...');
        console.log(`📊 Processing ${extractedContacts.length} extracted contacts`);
        
        const transformedContacts = [];
        
        for (const contact of extractedContacts) {
            try {
                this.transformationResults.processed++;
                
                const transformedContact = await this.transformSingleContact(contact);
                
                if (transformedContact) {
                    transformedContacts.push(transformedContact);
                    this.transformationResults.transformed++;
                } else {
                    this.transformationResults.skipped++;
                }
                
            } catch (error) {
                this.transformationResults.errors.push({
                    type: 'contact_transformation_error',
                    contactId: contact.contactId,
                    email: contact.email,
                    error: error.message
                });
            }
        }
        
        console.log('✅ Data transformation completed');
        console.log(`📈 Results: ${this.transformationResults.transformed} transformed, ${this.transformationResults.skipped} skipped, ${this.transformationResults.errors.length} errors`);
        
        return {
            contacts: transformedContacts,
            results: this.transformationResults
        };
    }

    /**
     * Transform a single contact to unified schema
     */
    async transformSingleContact(extractedContact) {
        try {
            // Validate required fields
            if (!this.validateRequiredFields(extractedContact)) {
                return null;
            }
            
            // Transform contact data
            const transformedContact = {
                // Contact Identity (normalized)
                contactId: this.normalizeContactId(extractedContact.contactId),
                email: this.normalizeEmail(extractedContact.email),
                alternateEmails: this.normalizeAlternateEmails(extractedContact.alternateEmails),
                phone: this.normalizePhone(extractedContact.phone),
                linkedInUrl: this.normalizeLinkedInUrl(extractedContact.linkedInUrl),
                
                // Contact Info (cleaned)
                firstName: this.normalizePersonName(extractedContact.firstName),
                lastName: this.normalizePersonName(extractedContact.lastName),
                fullName: this.buildFullName(extractedContact.firstName, extractedContact.lastName),
                title: this.normalizeTitle(extractedContact.title),
                company: this.normalizeCompanyName(extractedContact.company),
                
                // Organization Grouping (normalized)
                orgId: this.normalizeOrgId(extractedContact.orgId),
                orgName: this.normalizeCompanyName(extractedContact.orgName),
                
                // Outreach History (transformed)
                outreach: this.transformOutreachHistory(extractedContact.outreach),
                
                // Quick Access Fields (calculated)
                lastAnyContact: this.calculateLastContact(extractedContact.outreach),
                totalContacts: this.calculateTotalContacts(extractedContact.outreach),
                hasRecentContact: this.calculateRecentContact(extractedContact.outreach),
                
                // Status and Classification
                status: this.determineContactStatus(extractedContact),
                tags: this.enhanceTags(extractedContact.tags, extractedContact.outreach),
                
                // Metadata (preserved and enhanced)
                createdAt: extractedContact.createdAt,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: 'data_transformer',
                
                // Migration tracking
                migrationSource: extractedContact.migrationSource,
                migrationDate: extractedContact.migrationDate,
                transformationDate: new Date().toISOString(),
                legacyData: {
                    orgId: extractedContact.legacyOrgId,
                    encodedEmail: extractedContact.legacyEncodedEmail
                },
                
                // Customer assignment
                customerId: extractedContact.customerId
            };
            
            // Validate transformed contact
            if (!this.validateTransformedContact(transformedContact)) {
                this.transformationResults.warnings.push({
                    type: 'validation_failed',
                    contactId: transformedContact.contactId,
                    message: 'Transformed contact failed validation'
                });
                return null;
            }
            
            return transformedContact;
            
        } catch (error) {
            console.error(`❌ Error transforming contact ${extractedContact.contactId}:`, error);
            throw error;
        }
    }

    /**
     * Validation functions
     */
    validateRequiredFields(contact) {
        const required = ['contactId', 'email', 'customerId'];
        
        for (const field of required) {
            if (!contact[field]) {
                this.transformationResults.warnings.push({
                    type: 'missing_required_field',
                    contactId: contact.contactId,
                    field: field
                });
                return false;
            }
        }
        
        return true;
    }

    validateTransformedContact(contact) {
        // Validate email format
        if (!this.isValidEmail(contact.email)) {
            return false;
        }
        
        // Validate contact ID format
        if (!contact.contactId || contact.contactId.length < 3) {
            return false;
        }
        
        // Validate customer ID
        if (!contact.customerId) {
            return false;
        }
        
        return true;
    }

    /**
     * Normalization functions
     */
    normalizeContactId(contactId) {
        if (!contactId) return '';
        
        return contactId
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '');
    }

    normalizeEmail(email) {
        if (!email) return '';
        
        return email
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '');
    }

    normalizeAlternateEmails(emails) {
        if (!Array.isArray(emails)) return [];
        
        return emails
            .map(email => this.normalizeEmail(email))
            .filter(email => this.isValidEmail(email))
            .filter((email, index, arr) => arr.indexOf(email) === index); // Remove duplicates
    }

    normalizePhone(phone) {
        if (!phone) return null;
        
        // Remove all non-numeric characters except +
        let normalized = phone.replace(/[^\d+]/g, '');
        
        // Add + if missing and appears to be international
        if (normalized.length > 10 && !normalized.startsWith('+')) {
            normalized = '+' + normalized;
        }
        
        // Validate basic phone format
        if (normalized.length < 10 || normalized.length > 15) {
            return null;
        }
        
        return normalized;
    }

    normalizeLinkedInUrl(url) {
        if (!url) return null;
        
        // Clean up LinkedIn URL
        let normalized = url.trim().toLowerCase();
        
        // Add https if missing
        if (!normalized.startsWith('http')) {
            normalized = 'https://' + normalized;
        }
        
        // Validate LinkedIn URL pattern
        if (!normalized.includes('linkedin.com/in/')) {
            return null;
        }
        
        // Remove trailing slashes and parameters
        normalized = normalized.split('?')[0].replace(/\/$/, '');
        
        return normalized;
    }

    normalizePersonName(name) {
        if (!name) return '';
        
        return name
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word
    }

    normalizeTitle(title) {
        if (!title) return '';
        
        let normalized = title.trim().replace(/\s+/g, ' ');
        
        // Common title corrections
        const titleMappings = {
            'cto': 'Chief Technology Officer',
            'cio': 'Chief Information Officer', 
            'ceo': 'Chief Executive Officer',
            'cfo': 'Chief Financial Officer',
            'vp': 'Vice President',
            'svp': 'Senior Vice President'
        };
        
        const lowerTitle = normalized.toLowerCase();
        if (titleMappings[lowerTitle]) {
            return titleMappings[lowerTitle];
        }
        
        // Capitalize properly
        return normalized.replace(/\b\w/g, l => l.toUpperCase());
    }

    normalizeCompanyName(company) {
        if (!company) return '';
        
        let normalized = company
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
        
        // Common company suffix corrections
        normalized = normalized
            .replace(/\bInc\.?$/i, 'Inc.')
            .replace(/\bLlc\.?$/i, 'LLC')
            .replace(/\bCorp\.?$/i, 'Corp.')
            .replace(/\bLtd\.?$/i, 'Ltd.');
        
        return normalized;
    }

    normalizeOrgId(orgId) {
        if (!orgId) return '';
        
        return orgId
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '');
    }

    buildFullName(firstName, lastName) {
        const first = this.normalizePersonName(firstName);
        const last = this.normalizePersonName(lastName);
        
        return `${first} ${last}`.trim();
    }

    /**
     * Outreach history transformation
     */
    transformOutreachHistory(outreach) {
        if (!outreach) {
            return this.createEmptyOutreachHistory();
        }
        
        const transformed = {
            email: this.transformChannelHistory(outreach.email),
            linkedin: this.transformChannelHistory(outreach.linkedin),
            phone: this.transformChannelHistory(outreach.phone)
        };
        
        return transformed;
    }

    transformChannelHistory(channel) {
        if (!channel) {
            return {
                lastContact: null,
                totalContacts: 0,
                activities: []
            };
        }
        
        return {
            lastContact: channel.lastContact,
            totalContacts: channel.totalContacts || 0,
            activities: this.transformActivities(channel.activities || [])
        };
    }

    transformActivities(activities) {
        if (!Array.isArray(activities)) return [];
        
        return activities.map(activity => {
            return {
                date: activity.date,
                type: this.mapActivityType(activity.type),
                campaign: activity.campaign || '',
                account: activity.account || 'unknown',
                result: this.mapActivityResult(activity.result),
                notes: activity.notes || '',
                metadata: {
                    legacyLogId: activity.legacyLogId,
                    migrationSource: activity.migrationSource
                }
            };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    createEmptyOutreachHistory() {
        return {
            email: { lastContact: null, totalContacts: 0, activities: [] },
            linkedin: { lastContact: null, totalContacts: 0, activities: [] },
            phone: { lastContact: null, totalContacts: 0, activities: [] }
        };
    }

    /**
     * Activity type mapping
     */
    mapActivityType(legacyType) {
        if (!legacyType) return 'Unknown Activity';
        
        const typeMap = {
            'Email Sent': 'Email Sent',
            'Email Queued (Initial)': 'Email Sent - Initial',
            'Email Queued (Follow-up #1)': 'Email Sent - Follow-up 1',
            'Email Queued (Follow-up #2)': 'Email Sent - Follow-up 2',
            'LinkedIn Connection': 'LinkedIn Connection Request',
            'LinkedIn Message': 'LinkedIn Message Sent',
            'Phone Call': 'Phone Call Made',
            'Voicemail': 'Voicemail Left'
        };
        
        return typeMap[legacyType] || legacyType;
    }

    mapActivityResult(legacyResult) {
        if (!legacyResult) return 'completed';
        
        const resultMap = {
            'completed': 'success',
            'sent': 'success',
            'delivered': 'success',
            'failed': 'failed',
            'bounced': 'failed',
            'pending': 'pending'
        };
        
        return resultMap[legacyResult.toLowerCase()] || legacyResult;
    }

    /**
     * Calculation functions
     */
    calculateLastContact(outreach) {
        if (!outreach) return null;
        
        const dates = [];
        
        if (outreach.email?.lastContact) dates.push(new Date(outreach.email.lastContact));
        if (outreach.linkedin?.lastContact) dates.push(new Date(outreach.linkedin.lastContact));
        if (outreach.phone?.lastContact) dates.push(new Date(outreach.phone.lastContact));
        
        if (dates.length === 0) return null;
        
        return new Date(Math.max(...dates)).toISOString();
    }

    calculateTotalContacts(outreach) {
        if (!outreach) return 0;
        
        return (outreach.email?.totalContacts || 0) +
               (outreach.linkedin?.totalContacts || 0) +
               (outreach.phone?.totalContacts || 0);
    }

    calculateRecentContact(outreach) {
        const lastContact = this.calculateLastContact(outreach);
        if (!lastContact) return false;
        
        const lastDate = new Date(lastContact);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        return lastDate > thirtyDaysAgo;
    }

    /**
     * Status and tag enhancement
     */
    determineContactStatus(contact) {
        // Check for opt-out indicators in activities
        const activities = [
            ...(contact.outreach?.email?.activities || []),
            ...(contact.outreach?.linkedin?.activities || []),
            ...(contact.outreach?.phone?.activities || [])
        ];
        
        const hasOptOut = activities.some(activity => 
            activity.notes?.toLowerCase().includes('opt') ||
            activity.notes?.toLowerCase().includes('unsubscribe') ||
            activity.notes?.toLowerCase().includes('do not contact')
        );
        
        if (hasOptOut) return 'opted_out';
        
        return contact.status || 'active';
    }

    enhanceTags(existingTags, outreach) {
        const tags = [...(existingTags || [])];
        
        // Add channel-based tags
        if (outreach?.email?.totalContacts > 0) tags.push('email_history');
        if (outreach?.linkedin?.totalContacts > 0) tags.push('linkedin_history');
        if (outreach?.phone?.totalContacts > 0) tags.push('phone_history');
        
        // Add engagement level tags
        const totalContacts = this.calculateTotalContacts(outreach);
        if (totalContacts > 5) tags.push('high_engagement');
        else if (totalContacts > 2) tags.push('medium_engagement');
        else if (totalContacts > 0) tags.push('low_engagement');
        
        // Add recency tags
        if (this.calculateRecentContact(outreach)) {
            tags.push('recent_contact');
        }
        
        // Remove duplicates
        return [...new Set(tags)];
    }

    /**
     * Utility functions
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Export transformed data
     */
    exportTransformedData(contacts, filename = 'transformed_contacts.json') {
        const exportData = {
            transformationDate: new Date().toISOString(),
            transformationResults: this.transformationResults,
            transformationRules: this.transformationRules,
            contacts: contacts
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        link.click();
        
        console.log(`📁 Transformed data exported to ${filename}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataTransformer;
} else {
    window.DataTransformer = DataTransformer;
}


