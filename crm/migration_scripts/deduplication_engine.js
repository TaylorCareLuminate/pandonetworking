/**
 * Deduplication Engine
 * Handles duplicate detection and merging of contact records
 */

class DeduplicationEngine {
    constructor() {
        this.deduplicationResults = {
            totalContacts: 0,
            duplicatesFound: 0,
            duplicateGroups: 0,
            merged: 0,
            errors: [],
            warnings: []
        };
        
        // Configuration for duplicate detection
        this.matchingRules = {
            exactEmailMatch: { weight: 1.0, required: true },
            phoneMatch: { weight: 0.8, required: false },
            linkedInMatch: { weight: 0.9, required: false },
            nameMatch: { weight: 0.6, required: false },
            companyMatch: { weight: 0.4, required: false },
            fuzzyEmailMatch: { weight: 0.7, required: false }
        };
        
        this.confidenceThreshold = 0.85;
        this.timeWindowDays = 1; // For temporal proximity matching
    }

    /**
     * Process contacts for duplicates and merge them
     */
    async deduplicateContacts(contacts) {
        console.log('🔍 Starting deduplication process...');
        console.log(`📊 Processing ${contacts.length} contacts for duplicates`);
        
        this.deduplicationResults.totalContacts = contacts.length;
        
        try {
            // Step 1: Group contacts by customer for isolation
            const contactsByCustomer = this.groupContactsByCustomer(contacts);
            
            const deduplicatedContacts = [];
            
            // Step 2: Process each customer's contacts separately
            for (const [customerId, customerContacts] of Object.entries(contactsByCustomer)) {
                console.log(`🔄 Processing ${customerContacts.length} contacts for customer: ${customerId}`);
                
                const customerDeduplicated = await this.deduplicateCustomerContacts(
                    customerId, 
                    customerContacts
                );
                
                deduplicatedContacts.push(...customerDeduplicated);
            }
            
            console.log('✅ Deduplication completed');
            console.log(`📈 Results: ${this.deduplicationResults.duplicateGroups} duplicate groups found, ${this.deduplicationResults.merged} contacts merged`);
            
            return {
                contacts: deduplicatedContacts,
                results: this.deduplicationResults
            };
            
        } catch (error) {
            console.error('❌ Fatal error during deduplication:', error);
            throw error;
        }
    }

    /**
     * Group contacts by customer ID
     */
    groupContactsByCustomer(contacts) {
        const grouped = {};
        
        for (const contact of contacts) {
            const customerId = contact.customerId || 'unknown';
            
            if (!grouped[customerId]) {
                grouped[customerId] = [];
            }
            
            grouped[customerId].push(contact);
        }
        
        return grouped;
    }

    /**
     * Deduplicate contacts within a single customer
     */
    async deduplicateCustomerContacts(customerId, contacts) {
        const duplicateGroups = await this.findDuplicateGroups(contacts);
        const deduplicatedContacts = [];
        const processedContactIds = new Set();
        
        // Process duplicate groups
        for (const group of duplicateGroups) {
            try {
                const mergedContact = await this.mergeContactGroup(group);
                deduplicatedContacts.push(mergedContact);
                
                // Mark all contacts in group as processed
                group.contacts.forEach(contact => {
                    processedContactIds.add(contact.contactId);
                });
                
                this.deduplicationResults.merged += group.contacts.length - 1; // -1 because we keep one
                
            } catch (error) {
                this.deduplicationResults.errors.push({
                    type: 'merge_error',
                    customerId,
                    groupId: group.groupId,
                    error: error.message
                });
                
                // Add contacts individually if merge fails
                group.contacts.forEach(contact => {
                    if (!processedContactIds.has(contact.contactId)) {
                        deduplicatedContacts.push(contact);
                        processedContactIds.add(contact.contactId);
                    }
                });
            }
        }
        
        // Add non-duplicate contacts
        for (const contact of contacts) {
            if (!processedContactIds.has(contact.contactId)) {
                deduplicatedContacts.push(contact);
            }
        }
        
        return deduplicatedContacts;
    }

    /**
     * Find groups of duplicate contacts
     */
    async findDuplicateGroups(contacts) {
        const duplicateGroups = [];
        const processed = new Set();
        
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            
            if (processed.has(contact.contactId)) continue;
            
            // Find all matches for this contact
            const matches = await this.findMatches(contact, contacts);
            
            if (matches.length > 1) {
                const group = {
                    groupId: `group_${duplicateGroups.length + 1}`,
                    primaryContact: contact,
                    contacts: matches,
                    confidence: this.calculateGroupConfidence(matches),
                    matchReasons: this.getMatchReasons(matches)
                };
                
                duplicateGroups.push(group);
                this.deduplicationResults.duplicateGroups++;
                this.deduplicationResults.duplicatesFound += matches.length - 1;
                
                // Mark all contacts in group as processed
                matches.forEach(match => processed.add(match.contactId));
            }
        }
        
        return duplicateGroups;
    }

    /**
     * Find all matching contacts for a given contact
     */
    async findMatches(targetContact, allContacts) {
        const matches = [targetContact]; // Always include the target contact
        
        for (const candidate of allContacts) {
            if (candidate.contactId === targetContact.contactId) continue;
            
            const matchScore = this.calculateMatchScore(targetContact, candidate);
            
            if (matchScore >= this.confidenceThreshold) {
                matches.push({
                    ...candidate,
                    _matchScore: matchScore,
                    _matchReasons: this.getMatchReasons([targetContact, candidate])
                });
            }
        }
        
        return matches;
    }

    /**
     * Calculate match score between two contacts
     */
    calculateMatchScore(contact1, contact2) {
        let totalScore = 0;
        let totalWeight = 0;
        
        // Exact email match
        if (this.exactEmailMatch(contact1.email, contact2.email)) {
            totalScore += this.matchingRules.exactEmailMatch.weight;
            totalWeight += this.matchingRules.exactEmailMatch.weight;
        } else {
            // Check alternate emails
            const emailMatch = this.alternateEmailMatch(contact1, contact2);
            if (emailMatch > 0) {
                totalScore += emailMatch * this.matchingRules.fuzzyEmailMatch.weight;
                totalWeight += this.matchingRules.fuzzyEmailMatch.weight;
            }
        }
        
        // Phone match
        if (contact1.phone && contact2.phone) {
            if (this.phoneMatch(contact1.phone, contact2.phone)) {
                totalScore += this.matchingRules.phoneMatch.weight;
            }
            totalWeight += this.matchingRules.phoneMatch.weight;
        }
        
        // LinkedIn match
        if (contact1.linkedInUrl && contact2.linkedInUrl) {
            if (this.linkedInMatch(contact1.linkedInUrl, contact2.linkedInUrl)) {
                totalScore += this.matchingRules.linkedInMatch.weight;
            }
            totalWeight += this.matchingRules.linkedInMatch.weight;
        }
        
        // Name match
        if (contact1.firstName && contact1.lastName && contact2.firstName && contact2.lastName) {
            const nameScore = this.nameMatch(contact1, contact2);
            totalScore += nameScore * this.matchingRules.nameMatch.weight;
            totalWeight += this.matchingRules.nameMatch.weight;
        }
        
        // Company match
        if (contact1.company && contact2.company) {
            const companyScore = this.companyMatch(contact1.company, contact2.company);
            totalScore += companyScore * this.matchingRules.companyMatch.weight;
            totalWeight += this.matchingRules.companyMatch.weight;
        }
        
        // Return normalized score
        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }

    /**
     * Matching algorithms
     */
    exactEmailMatch(email1, email2) {
        return email1.toLowerCase() === email2.toLowerCase();
    }

    alternateEmailMatch(contact1, contact2) {
        const allEmails1 = [contact1.email, ...(contact1.alternateEmails || [])];
        const allEmails2 = [contact2.email, ...(contact2.alternateEmails || [])];
        
        for (const email1 of allEmails1) {
            for (const email2 of allEmails2) {
                if (this.exactEmailMatch(email1, email2)) {
                    return 1.0;
                }
            }
        }
        
        return 0;
    }

    phoneMatch(phone1, phone2) {
        // Normalize phones for comparison
        const normalize = (phone) => phone.replace(/[^\d]/g, '');
        
        const norm1 = normalize(phone1);
        const norm2 = normalize(phone2);
        
        // Exact match
        if (norm1 === norm2) return true;
        
        // Match last 10 digits (for US numbers with/without country code)
        if (norm1.length >= 10 && norm2.length >= 10) {
            return norm1.slice(-10) === norm2.slice(-10);
        }
        
        return false;
    }

    linkedInMatch(url1, url2) {
        // Normalize LinkedIn URLs
        const normalize = (url) => {
            return url.toLowerCase()
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .replace(/\/$/, '')
                .replace(/\?.*$/, '');
        };
        
        return normalize(url1) === normalize(url2);
    }

    nameMatch(contact1, contact2) {
        const name1 = `${contact1.firstName} ${contact1.lastName}`.toLowerCase().trim();
        const name2 = `${contact2.firstName} ${contact2.lastName}`.toLowerCase().trim();
        
        // Exact match
        if (name1 === name2) return 1.0;
        
        // Fuzzy match using Levenshtein distance
        const distance = this.levenshteinDistance(name1, name2);
        const maxLength = Math.max(name1.length, name2.length);
        
        return 1 - (distance / maxLength);
    }

    companyMatch(company1, company2) {
        const norm1 = company1.toLowerCase().trim();
        const norm2 = company2.toLowerCase().trim();
        
        // Exact match
        if (norm1 === norm2) return 1.0;
        
        // Fuzzy match
        const distance = this.levenshteinDistance(norm1, norm2);
        const maxLength = Math.max(norm1.length, norm2.length);
        
        return 1 - (distance / maxLength);
    }

    /**
     * Merge a group of duplicate contacts
     */
    async mergeContactGroup(group) {
        try {
            // Select the primary contact (most complete data)
            const primaryContact = this.selectPrimaryContact(group.contacts);
            
            // Merge data from all contacts
            const mergedContact = await this.mergeContactData(primaryContact, group.contacts);
            
            // Add merge metadata
            mergedContact.mergeHistory = {
                mergedAt: new Date().toISOString(),
                mergedFrom: group.contacts
                    .filter(c => c.contactId !== primaryContact.contactId)
                    .map(c => ({
                        contactId: c.contactId,
                        email: c.email,
                        matchScore: c._matchScore || 0
                    })),
                mergeConfidence: group.confidence,
                mergeReasons: group.matchReasons
            };
            
            return mergedContact;
            
        } catch (error) {
            console.error(`❌ Error merging contact group:`, error);
            throw error;
        }
    }

    /**
     * Select the primary contact from a group (most complete data)
     */
    selectPrimaryContact(contacts) {
        return contacts.reduce((best, current) => {
            const bestScore = this.calculateCompletenessScore(best);
            const currentScore = this.calculateCompletenessScore(current);
            
            return currentScore > bestScore ? current : best;
        });
    }

    calculateCompletenessScore(contact) {
        let score = 0;
        
        // Basic fields
        if (contact.email) score += 10;
        if (contact.firstName) score += 5;
        if (contact.lastName) score += 5;
        if (contact.phone) score += 3;
        if (contact.linkedInUrl) score += 3;
        if (contact.title) score += 2;
        if (contact.company) score += 2;
        
        // Outreach history
        score += (contact.totalContacts || 0);
        
        // Recent activity bonus
        if (contact.hasRecentContact) score += 5;
        
        return score;
    }

    /**
     * Merge data from multiple contacts
     */
    async mergeContactData(primaryContact, allContacts) {
        const merged = { ...primaryContact };
        
        // Merge alternate emails
        const allEmails = new Set([merged.email]);
        allContacts.forEach(contact => {
            if (contact.email && contact.email !== merged.email) {
                allEmails.add(contact.email);
            }
            if (contact.alternateEmails) {
                contact.alternateEmails.forEach(email => allEmails.add(email));
            }
        });
        merged.alternateEmails = Array.from(allEmails).filter(email => email !== merged.email);
        
        // Merge phone numbers (take the most complete one)
        if (!merged.phone) {
            for (const contact of allContacts) {
                if (contact.phone) {
                    merged.phone = contact.phone;
                    break;
                }
            }
        }
        
        // Merge LinkedIn URLs (take the most complete one)
        if (!merged.linkedInUrl) {
            for (const contact of allContacts) {
                if (contact.linkedInUrl) {
                    merged.linkedInUrl = contact.linkedInUrl;
                    break;
                }
            }
        }
        
        // Merge names (take the most complete one)
        if (!merged.firstName || !merged.lastName) {
            for (const contact of allContacts) {
                if (!merged.firstName && contact.firstName) merged.firstName = contact.firstName;
                if (!merged.lastName && contact.lastName) merged.lastName = contact.lastName;
            }
            merged.fullName = `${merged.firstName} ${merged.lastName}`.trim();
        }
        
        // Merge outreach history
        merged.outreach = this.mergeOutreachHistory(allContacts.map(c => c.outreach));
        
        // Recalculate aggregated fields
        merged.lastAnyContact = this.calculateLastContact(merged.outreach);
        merged.totalContacts = this.calculateTotalContacts(merged.outreach);
        merged.hasRecentContact = this.calculateRecentContact(merged.outreach);
        
        // Merge tags
        const allTags = new Set();
        allContacts.forEach(contact => {
            if (contact.tags) {
                contact.tags.forEach(tag => allTags.add(tag));
            }
        });
        merged.tags = Array.from(allTags);
        
        // Update metadata
        merged.updatedAt = new Date().toISOString();
        merged.lastModifiedBy = 'deduplication_engine';
        
        return merged;
    }

    /**
     * Merge outreach histories from multiple contacts
     */
    mergeOutreachHistory(outreachHistories) {
        const merged = {
            email: { lastContact: null, totalContacts: 0, activities: [] },
            linkedin: { lastContact: null, totalContacts: 0, activities: [] },
            phone: { lastContact: null, totalContacts: 0, activities: [] }
        };
        
        const channels = ['email', 'linkedin', 'phone'];
        
        for (const channel of channels) {
            const allActivities = [];
            
            outreachHistories.forEach(outreach => {
                if (outreach && outreach[channel] && outreach[channel].activities) {
                    allActivities.push(...outreach[channel].activities);
                }
            });
            
            // Remove duplicate activities and sort by date
            const uniqueActivities = this.deduplicateActivities(allActivities);
            uniqueActivities.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            merged[channel] = {
                lastContact: uniqueActivities.length > 0 ? 
                    uniqueActivities[uniqueActivities.length - 1].date : null,
                totalContacts: uniqueActivities.length,
                activities: uniqueActivities
            };
        }
        
        return merged;
    }

    /**
     * Remove duplicate activities
     */
    deduplicateActivities(activities) {
        const unique = [];
        const seen = new Set();
        
        for (const activity of activities) {
            const key = `${activity.date}_${activity.type}_${activity.account}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(activity);
            }
        }
        
        return unique;
    }

    /**
     * Utility functions
     */
    calculateGroupConfidence(contacts) {
        if (contacts.length <= 1) return 1.0;
        
        const scores = contacts.filter(c => c._matchScore).map(c => c._matchScore);
        return scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0;
    }

    getMatchReasons(contacts) {
        // This would analyze why contacts were matched
        return ['email_match', 'name_similarity'];
    }

    calculateLastContact(outreach) {
        const dates = [];
        if (outreach.email?.lastContact) dates.push(new Date(outreach.email.lastContact));
        if (outreach.linkedin?.lastContact) dates.push(new Date(outreach.linkedin.lastContact));
        if (outreach.phone?.lastContact) dates.push(new Date(outreach.phone.lastContact));
        
        return dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;
    }

    calculateTotalContacts(outreach) {
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

    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Export deduplication report
     */
    exportDeduplicationReport(filename = 'deduplication_report.json') {
        const report = {
            deduplicationDate: new Date().toISOString(),
            results: this.deduplicationResults,
            configuration: {
                matchingRules: this.matchingRules,
                confidenceThreshold: this.confidenceThreshold,
                timeWindowDays: this.timeWindowDays
            }
        };
        
        const dataStr = JSON.stringify(report, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        link.click();
        
        console.log(`📁 Deduplication report exported to ${filename}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeduplicationEngine;
} else {
    window.DeduplicationEngine = DeduplicationEngine;
}


