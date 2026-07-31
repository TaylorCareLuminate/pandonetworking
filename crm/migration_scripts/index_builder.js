/**
 * Index Builder
 * Creates search indexes for efficient querying of CRM data
 */

class IndexBuilder {
    constructor() {
        this.firebaseRTDB = window.firebaseRTDB;
        this.indexResults = {
            totalContacts: 0,
            indexesCreated: 0,
            indexEntries: 0,
            errors: [],
            warnings: []
        };
        
        // Index configurations
        this.indexConfigs = {
            byEmail: {
                path: 'by_email',
                keyFunction: (contact) => this.hashEmail(contact.email),
                dataFunction: (contact) => ({
                    email: contact.email,
                    contactId: contact.contactId,
                    lastUpdated: new Date().toISOString()
                })
            },
            byCompany: {
                path: 'by_company',
                keyFunction: (contact) => contact.orgId,
                dataFunction: (contact) => ({
                    orgId: contact.orgId,
                    orgName: contact.orgName,
                    lastUpdated: new Date().toISOString()
                }),
                isGrouped: true // Multiple contacts per key
            },
            byRecentOutreach: {
                path: 'recent_outreach',
                keyFunction: (contact) => this.getRecentOutreachDate(contact),
                dataFunction: (contact) => ({
                    contactId: contact.contactId,
                    lastContact: contact.lastAnyContact,
                    totalContacts: contact.totalContacts
                }),
                condition: (contact) => contact.hasRecentContact,
                isGrouped: true
            },
            byStatus: {
                path: 'by_status',
                keyFunction: (contact) => contact.status || 'active',
                dataFunction: (contact) => ({
                    contactId: contact.contactId,
                    email: contact.email,
                    lastUpdated: new Date().toISOString()
                }),
                isGrouped: true
            },
            byTag: {
                path: 'by_tag',
                keyFunction: (contact) => contact.tags || [],
                dataFunction: (contact) => ({
                    contactId: contact.contactId,
                    email: contact.email,
                    tags: contact.tags || []
                }),
                isMultiKey: true, // One contact can have multiple tags
                isGrouped: true
            }
        };
    }

    /**
     * Build all indexes for contacts
     */
    async buildIndexes(contacts) {
        console.log('🏗️ Starting index building process...');
        console.log(`📊 Building indexes for ${contacts.length} contacts`);
        
        this.indexResults.totalContacts = contacts.length;
        
        try {
            // Group contacts by customer for isolation
            const contactsByCustomer = this.groupContactsByCustomer(contacts);
            
            // Build indexes for each customer
            for (const [customerId, customerContacts] of Object.entries(contactsByCustomer)) {
                console.log(`🔄 Building indexes for customer: ${customerId} (${customerContacts.length} contacts)`);
                
                await this.buildCustomerIndexes(customerId, customerContacts);
            }
            
            console.log('✅ Index building completed');
            console.log(`📈 Results: ${this.indexResults.indexesCreated} indexes created, ${this.indexResults.indexEntries} entries`);
            
            return {
                results: this.indexResults
            };
            
        } catch (error) {
            console.error('❌ Fatal error during index building:', error);
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
     * Build indexes for a single customer
     */
    async buildCustomerIndexes(customerId, contacts) {
        try {
            // Build each configured index
            for (const [indexName, config] of Object.entries(this.indexConfigs)) {
                await this.buildSingleIndex(customerId, indexName, config, contacts);
            }
            
        } catch (error) {
            this.indexResults.errors.push({
                type: 'customer_index_error',
                customerId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Build a single index
     */
    async buildSingleIndex(customerId, indexName, config, contacts) {
        try {
            console.log(`📝 Building ${indexName} index for customer ${customerId}...`);
            
            const indexData = {};
            let entriesCreated = 0;
            
            for (const contact of contacts) {
                try {
                    // Check condition if specified
                    if (config.condition && !config.condition(contact)) {
                        continue;
                    }
                    
                    // Get key(s) for this contact
                    const keys = this.getIndexKeys(contact, config);
                    
                    for (const key of keys) {
                        if (!key) continue;
                        
                        const data = config.dataFunction(contact);
                        
                        if (config.isGrouped) {
                            // Multiple contacts per key
                            if (!indexData[key]) {
                                indexData[key] = this.initializeGroupedIndex(key, config, contact);
                            }
                            
                            this.addToGroupedIndex(indexData[key], contact, data);
                        } else {
                            // Single contact per key
                            indexData[key] = data;
                        }
                        
                        entriesCreated++;
                    }
                    
                } catch (error) {
                    this.indexResults.warnings.push({
                        type: 'contact_indexing_warning',
                        customerId,
                        indexName,
                        contactId: contact.contactId,
                        error: error.message
                    });
                }
            }
            
            // Write index to Firebase
            await this.writeIndexToFirebase(customerId, indexName, indexData);
            
            this.indexResults.indexesCreated++;
            this.indexResults.indexEntries += entriesCreated;
            
            console.log(`✅ ${indexName} index created: ${entriesCreated} entries`);
            
        } catch (error) {
            this.indexResults.errors.push({
                type: 'index_creation_error',
                customerId,
                indexName,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get index key(s) for a contact
     */
    getIndexKeys(contact, config) {
        const keyResult = config.keyFunction(contact);
        
        if (config.isMultiKey) {
            // Multiple keys (e.g., tags)
            return Array.isArray(keyResult) ? keyResult : [keyResult];
        } else {
            // Single key
            return [keyResult];
        }
    }

    /**
     * Initialize a grouped index entry
     */
    initializeGroupedIndex(key, config, contact) {
        const baseData = {
            lastUpdated: new Date().toISOString(),
            contactCount: 0,
            contactIds: []
        };
        
        // Add index-specific initialization
        switch (config.path) {
            case 'by_company':
                return {
                    ...baseData,
                    orgId: contact.orgId,
                    orgName: contact.orgName
                };
            case 'recent_outreach':
                return {
                    ...baseData,
                    date: key
                };
            case 'by_status':
                return {
                    ...baseData,
                    status: key
                };
            case 'by_tag':
                return {
                    ...baseData,
                    tag: key
                };
            default:
                return baseData;
        }
    }

    /**
     * Add contact to grouped index
     */
    addToGroupedIndex(indexEntry, contact, data) {
        // Add contact ID if not already present
        if (!indexEntry.contactIds.includes(contact.contactId)) {
            indexEntry.contactIds.push(contact.contactId);
            indexEntry.contactCount = indexEntry.contactIds.length;
        }
        
        // Update timestamp
        indexEntry.lastUpdated = new Date().toISOString();
        
        // Add any additional data from the contact
        if (data.lastContact && (!indexEntry.lastContact || data.lastContact > indexEntry.lastContact)) {
            indexEntry.lastContact = data.lastContact;
        }
        
        if (data.totalContacts) {
            indexEntry.totalOutreachContacts = (indexEntry.totalOutreachContacts || 0) + data.totalContacts;
        }
    }

    /**
     * Write index to Firebase Realtime Database
     */
    async writeIndexToFirebase(customerId, indexName, indexData) {
        try {
            const indexPath = `crm_unified/${customerId}/indexes/${this.indexConfigs[indexName].path}`;
            const indexRef = this.firebaseRTDB.ref(indexPath);
            
            // Write the entire index
            await this.firebaseRTDB.set(indexRef, indexData);
            
            // Write metadata
            const metadataRef = this.firebaseRTDB.ref(`crm_unified/${customerId}/indexes/_metadata/${indexName}`);
            await this.firebaseRTDB.set(metadataRef, {
                indexName: indexName,
                indexPath: this.indexConfigs[indexName].path,
                createdAt: new Date().toISOString(),
                entryCount: Object.keys(indexData).length,
                isGrouped: this.indexConfigs[indexName].isGrouped || false,
                isMultiKey: this.indexConfigs[indexName].isMultiKey || false
            });
            
        } catch (error) {
            console.error(`❌ Error writing ${indexName} index to Firebase:`, error);
            throw error;
        }
    }

    /**
     * Update indexes for a single contact (for real-time updates)
     */
    async updateContactIndexes(customerId, contact, operation = 'upsert') {
        try {
            console.log(`🔄 Updating indexes for contact ${contact.contactId} (${operation})`);
            
            for (const [indexName, config] of Object.entries(this.indexConfigs)) {
                await this.updateSingleContactIndex(customerId, indexName, config, contact, operation);
            }
            
        } catch (error) {
            console.error(`❌ Error updating indexes for contact ${contact.contactId}:`, error);
            throw error;
        }
    }

    /**
     * Update a single index for one contact
     */
    async updateSingleContactIndex(customerId, indexName, config, contact, operation) {
        try {
            // Check condition if specified
            if (config.condition && !config.condition(contact)) {
                // If condition not met, remove from index if exists
                if (operation !== 'delete') {
                    await this.removeContactFromIndex(customerId, indexName, config, contact);
                }
                return;
            }
            
            const keys = this.getIndexKeys(contact, config);
            
            for (const key of keys) {
                if (!key) continue;
                
                const indexPath = `crm_unified/${customerId}/indexes/${config.path}/${key}`;
                const indexRef = this.firebaseRTDB.ref(indexPath);
                
                if (operation === 'delete') {
                    await this.removeContactFromIndex(customerId, indexName, config, contact);
                } else {
                    // Upsert operation
                    if (config.isGrouped) {
                        await this.updateGroupedIndex(indexRef, contact, config);
                    } else {
                        const data = config.dataFunction(contact);
                        await this.firebaseRTDB.set(indexRef, data);
                    }
                }
            }
            
        } catch (error) {
            console.error(`❌ Error updating ${indexName} index for contact ${contact.contactId}:`, error);
            throw error;
        }
    }

    /**
     * Update grouped index entry
     */
    async updateGroupedIndex(indexRef, contact, config) {
        await this.firebaseRTDB.transaction(indexRef, (current) => {
            if (!current) {
                current = this.initializeGroupedIndex(
                    config.keyFunction(contact), 
                    config, 
                    contact
                );
            }
            
            const data = config.dataFunction(contact);
            this.addToGroupedIndex(current, contact, data);
            
            return current;
        });
    }

    /**
     * Remove contact from index
     */
    async removeContactFromIndex(customerId, indexName, config, contact) {
        const keys = this.getIndexKeys(contact, config);
        
        for (const key of keys) {
            if (!key) continue;
            
            const indexPath = `crm_unified/${customerId}/indexes/${config.path}/${key}`;
            const indexRef = this.firebaseRTDB.ref(indexPath);
            
            if (config.isGrouped) {
                // Remove contact from grouped index
                await this.firebaseRTDB.transaction(indexRef, (current) => {
                    if (!current || !current.contactIds) return current;
                    
                    const contactIndex = current.contactIds.indexOf(contact.contactId);
                    if (contactIndex > -1) {
                        current.contactIds.splice(contactIndex, 1);
                        current.contactCount = current.contactIds.length;
                        current.lastUpdated = new Date().toISOString();
                        
                        // Remove the entire index entry if no contacts left
                        if (current.contactIds.length === 0) {
                            return null;
                        }
                    }
                    
                    return current;
                });
            } else {
                // Remove single contact index
                await this.firebaseRTDB.remove(indexRef);
            }
        }
    }

    /**
     * Utility functions
     */
    hashEmail(email) {
        if (!email) return '';
        
        return email.toLowerCase()
            .replace(/[^a-z0-9@.]/g, '_')
            .replace(/[@.]/g, '_');
    }

    getRecentOutreachDate(contact) {
        if (!contact.hasRecentContact || !contact.lastAnyContact) {
            return null;
        }
        
        // Group by date (YYYY-MM-DD)
        return new Date(contact.lastAnyContact).toISOString().split('T')[0];
    }

    /**
     * Query helper functions (for use by other modules)
     */
    async queryByEmail(customerId, email) {
        const emailHash = this.hashEmail(email);
        const indexRef = this.firebaseRTDB.ref(`crm_unified/${customerId}/indexes/by_email/${emailHash}`);
        const snapshot = await this.firebaseRTDB.get(indexRef);
        
        return snapshot.exists() ? snapshot.val() : null;
    }

    async queryByCompany(customerId, orgId) {
        const indexRef = this.firebaseRTDB.ref(`crm_unified/${customerId}/indexes/by_company/${orgId}`);
        const snapshot = await this.firebaseRTDB.get(indexRef);
        
        return snapshot.exists() ? snapshot.val() : null;
    }

    async queryRecentOutreach(customerId, days = 30) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const contacts = [];
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateKey = d.toISOString().split('T')[0];
            const indexRef = this.firebaseRTDB.ref(`crm_unified/${customerId}/indexes/recent_outreach/${dateKey}`);
            const snapshot = await this.firebaseRTDB.get(indexRef);
            
            if (snapshot.exists()) {
                const data = snapshot.val();
                contacts.push(...(data.contactIds || []));
            }
        }
        
        // Remove duplicates
        return [...new Set(contacts)];
    }

    async queryByStatus(customerId, status) {
        const indexRef = this.firebaseRTDB.ref(`crm_unified/${customerId}/indexes/by_status/${status}`);
        const snapshot = await this.firebaseRTDB.get(indexRef);
        
        return snapshot.exists() ? snapshot.val() : null;
    }

    async queryByTag(customerId, tag) {
        const indexRef = this.firebaseRTDB.ref(`crm_unified/${customerId}/indexes/by_tag/${tag}`);
        const snapshot = await this.firebaseRTDB.get(indexRef);
        
        return snapshot.exists() ? snapshot.val() : null;
    }

    /**
     * Rebuild all indexes (for maintenance)
     */
    async rebuildAllIndexes(customerId) {
        console.log(`🔄 Rebuilding all indexes for customer ${customerId}...`);
        
        try {
            // Load all contacts for this customer
            const contactsRef = this.firebaseRTDB.ref(`crm_unified/${customerId}/contacts`);
            const contactsSnapshot = await this.firebaseRTDB.get(contactsRef);
            
            if (!contactsSnapshot.exists()) {
                console.log(`⚠️ No contacts found for customer ${customerId}`);
                return;
            }
            
            const contactsData = contactsSnapshot.val();
            const contacts = Object.values(contactsData);
            
            // Clear existing indexes
            const indexesRef = this.firebaseRTDB.ref(`crm_unified/${customerId}/indexes`);
            await this.firebaseRTDB.remove(indexesRef);
            
            // Rebuild indexes
            await this.buildCustomerIndexes(customerId, contacts);
            
            console.log(`✅ All indexes rebuilt for customer ${customerId}`);
            
        } catch (error) {
            console.error(`❌ Error rebuilding indexes for customer ${customerId}:`, error);
            throw error;
        }
    }

    /**
     * Export index statistics
     */
    exportIndexStats(filename = 'index_statistics.json') {
        const stats = {
            buildDate: new Date().toISOString(),
            results: this.indexResults,
            indexConfigurations: this.indexConfigs
        };
        
        const dataStr = JSON.stringify(stats, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        link.click();
        
        console.log(`📁 Index statistics exported to ${filename}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IndexBuilder;
} else {
    window.IndexBuilder = IndexBuilder;
}


