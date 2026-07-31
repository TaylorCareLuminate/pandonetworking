/**
 * Migration Controller
 * Orchestrates the complete migration process
 */

class MigrationController {
    constructor() {
        // Initialize all migration components
        this.extractor = new LegacyDataExtractor();
        this.transformer = new DataTransformer();
        this.deduplicator = new DeduplicationEngine();
        this.indexBuilder = new IndexBuilder();
        
        // Migration state
        this.migrationState = {
            id: this.generateMigrationId(),
            status: 'initialized',
            startTime: null,
            endTime: null,
            currentStep: '',
            progress: 0,
            totalSteps: 5,
            results: {
                extraction: null,
                transformation: null,
                deduplication: null,
                indexing: null,
                validation: null
            },
            errors: [],
            warnings: []
        };
        
        // Configuration
        this.config = {
            batchSize: 1000,
            enableValidation: true,
            createBackup: true,
            dryRun: false,
            customerMapping: {
                // Add customer mapping logic here
                'default': 'internal'
            }
        };
    }

    /**
     * Run complete migration process
     */
    async runMigration(options = {}) {
        try {
            // Merge options with default config
            this.config = { ...this.config, ...options };
            
            console.log('🚀 Starting CRM migration process...');
            console.log(`📋 Migration ID: ${this.migrationState.id}`);
            console.log(`⚙️ Configuration:`, this.config);
            
            this.migrationState.status = 'running';
            this.migrationState.startTime = new Date().toISOString();
            
            // Step 1: Extract legacy data
            await this.runExtractionStep();
            
            // Step 2: Transform data
            await this.runTransformationStep();
            
            // Step 3: Deduplicate contacts
            await this.runDeduplicationStep();
            
            // Step 4: Build indexes
            await this.runIndexingStep();
            
            // Step 5: Validate migration
            if (this.config.enableValidation) {
                await this.runValidationStep();
            }
            
            // Complete migration
            await this.completeMigration();
            
            console.log('✅ Migration completed successfully!');
            return this.migrationState;
            
        } catch (error) {
            await this.handleMigrationError(error);
            throw error;
        }
    }

    /**
     * Step 1: Extract legacy data
     */
    async runExtractionStep() {
        try {
            console.log('📤 Step 1/5: Extracting legacy data...');
            this.migrationState.currentStep = 'extraction';
            this.migrationState.progress = 20;
            
            const extractionResult = await this.extractor.extractAllLegacyData();
            this.migrationState.results.extraction = extractionResult.results;
            
            console.log(`✅ Extraction completed: ${extractionResult.contacts.length} contacts extracted`);
            
            // Store extracted data for next step
            this.extractedContacts = extractionResult.contacts;
            
            // Export extraction results if requested
            if (this.config.exportIntermediateResults) {
                this.extractor.exportToJSON(
                    extractionResult.contacts,
                    `migration_${this.migrationState.id}_extracted.json`
                );
            }
            
        } catch (error) {
            this.migrationState.errors.push({
                step: 'extraction',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Step 2: Transform data
     */
    async runTransformationStep() {
        try {
            console.log('🔄 Step 2/5: Transforming data to unified schema...');
            this.migrationState.currentStep = 'transformation';
            this.migrationState.progress = 40;
            
            if (!this.extractedContacts || this.extractedContacts.length === 0) {
                throw new Error('No extracted contacts available for transformation');
            }
            
            const transformationResult = await this.transformer.transformContacts(this.extractedContacts);
            this.migrationState.results.transformation = transformationResult.results;
            
            console.log(`✅ Transformation completed: ${transformationResult.contacts.length} contacts transformed`);
            
            // Store transformed data for next step
            this.transformedContacts = transformationResult.contacts;
            
            // Export transformation results if requested
            if (this.config.exportIntermediateResults) {
                this.transformer.exportTransformedData(
                    transformationResult.contacts,
                    `migration_${this.migrationState.id}_transformed.json`
                );
            }
            
        } catch (error) {
            this.migrationState.errors.push({
                step: 'transformation',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Step 3: Deduplicate contacts
     */
    async runDeduplicationStep() {
        try {
            console.log('🔍 Step 3/5: Deduplicating contacts...');
            this.migrationState.currentStep = 'deduplication';
            this.migrationState.progress = 60;
            
            if (!this.transformedContacts || this.transformedContacts.length === 0) {
                throw new Error('No transformed contacts available for deduplication');
            }
            
            const deduplicationResult = await this.deduplicator.deduplicateContacts(this.transformedContacts);
            this.migrationState.results.deduplication = deduplicationResult.results;
            
            console.log(`✅ Deduplication completed: ${deduplicationResult.contacts.length} unique contacts`);
            
            // Store deduplicated data for next step
            this.finalContacts = deduplicationResult.contacts;
            
            // Export deduplication results if requested
            if (this.config.exportIntermediateResults) {
                this.deduplicator.exportDeduplicationReport(
                    `migration_${this.migrationState.id}_deduplication_report.json`
                );
            }
            
        } catch (error) {
            this.migrationState.errors.push({
                step: 'deduplication',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Step 4: Build indexes
     */
    async runIndexingStep() {
        try {
            console.log('🏗️ Step 4/5: Building search indexes...');
            this.migrationState.currentStep = 'indexing';
            this.migrationState.progress = 80;
            
            if (!this.finalContacts || this.finalContacts.length === 0) {
                throw new Error('No final contacts available for indexing');
            }
            
            // Write contacts to database first
            if (!this.config.dryRun) {
                await this.writeContactsToDatabase(this.finalContacts);
            }
            
            // Build indexes
            const indexingResult = await this.indexBuilder.buildIndexes(this.finalContacts);
            this.migrationState.results.indexing = indexingResult.results;
            
            console.log(`✅ Indexing completed: ${indexingResult.results.indexesCreated} indexes built`);
            
            // Export indexing statistics if requested
            if (this.config.exportIntermediateResults) {
                this.indexBuilder.exportIndexStats(
                    `migration_${this.migrationState.id}_index_stats.json`
                );
            }
            
        } catch (error) {
            this.migrationState.errors.push({
                step: 'indexing',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Step 5: Validate migration
     */
    async runValidationStep() {
        try {
            console.log('✅ Step 5/5: Validating migration results...');
            this.migrationState.currentStep = 'validation';
            this.migrationState.progress = 90;
            
            const validationResult = await this.validateMigration();
            this.migrationState.results.validation = validationResult;
            
            console.log(`✅ Validation completed: ${validationResult.passed ? 'PASSED' : 'FAILED'}`);
            
            if (!validationResult.passed) {
                this.migrationState.warnings.push({
                    step: 'validation',
                    message: 'Migration validation failed - review validation results',
                    details: validationResult.failures
                });
            }
            
        } catch (error) {
            this.migrationState.errors.push({
                step: 'validation',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Write contacts to database
     */
    async writeContactsToDatabase(contacts) {
        console.log(`💾 Writing ${contacts.length} contacts to database...`);
        
        try {
            // Group contacts by customer
            const contactsByCustomer = this.groupContactsByCustomer(contacts);
            
            // Write each customer's contacts
            for (const [customerId, customerContacts] of Object.entries(contactsByCustomer)) {
                await this.writeCustomerContacts(customerId, customerContacts);
            }
            
            console.log('✅ All contacts written to database');
            
        } catch (error) {
            console.error('❌ Error writing contacts to database:', error);
            throw error;
        }
    }

    /**
     * Write contacts for a single customer
     */
    async writeCustomerContacts(customerId, contacts) {
        console.log(`💾 Writing ${contacts.length} contacts for customer ${customerId}...`);
        
        const batchSize = 100;
        const batches = this.chunkArray(contacts, batchSize);
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} contacts)`);
            
            // Write batch to Firebase
            const updates = {};
            
            for (const contact of batch) {
                const contactPath = `crm_unified/${customerId}/contacts/${contact.contactId}`;
                updates[contactPath] = contact;
            }
            
            await window.firebaseRTDB.update(window.firebaseRTDB.ref(), updates);
        }
        
        console.log(`✅ ${contacts.length} contacts written for customer ${customerId}`);
    }

    /**
     * Validate migration results
     */
    async validateMigration() {
        const validation = {
            passed: true,
            checks: [],
            failures: [],
            summary: {
                totalContacts: 0,
                contactsInDatabase: 0,
                indexesCreated: 0,
                dataIntegrityIssues: 0
            }
        };
        
        try {
            // Check 1: Verify contact count
            const contactCountCheck = await this.validateContactCount();
            validation.checks.push(contactCountCheck);
            if (!contactCountCheck.passed) {
                validation.passed = false;
                validation.failures.push(contactCountCheck);
            }
            
            // Check 2: Verify data integrity
            const dataIntegrityCheck = await this.validateDataIntegrity();
            validation.checks.push(dataIntegrityCheck);
            if (!dataIntegrityCheck.passed) {
                validation.passed = false;
                validation.failures.push(dataIntegrityCheck);
            }
            
            // Check 3: Verify indexes
            const indexCheck = await this.validateIndexes();
            validation.checks.push(indexCheck);
            if (!indexCheck.passed) {
                validation.passed = false;
                validation.failures.push(indexCheck);
            }
            
            // Update summary
            validation.summary = {
                totalContacts: this.finalContacts?.length || 0,
                contactsInDatabase: contactCountCheck.databaseCount || 0,
                indexesCreated: this.migrationState.results.indexing?.indexesCreated || 0,
                dataIntegrityIssues: dataIntegrityCheck.issues?.length || 0
            };
            
        } catch (error) {
            validation.passed = false;
            validation.failures.push({
                check: 'validation_process',
                error: error.message
            });
        }
        
        return validation;
    }

    /**
     * Validate contact count
     */
    async validateContactCount() {
        try {
            const expectedCount = this.finalContacts?.length || 0;
            let actualCount = 0;
            
            // Count contacts in database
            const contactsByCustomer = this.groupContactsByCustomer(this.finalContacts || []);
            
            for (const customerId of Object.keys(contactsByCustomer)) {
                const customerContactsRef = window.firebaseRTDB.ref(`crm_unified/${customerId}/contacts`);
                const snapshot = await window.firebaseRTDB.get(customerContactsRef);
                
                if (snapshot.exists()) {
                    actualCount += Object.keys(snapshot.val()).length;
                }
            }
            
            const passed = expectedCount === actualCount;
            
            return {
                check: 'contact_count',
                passed,
                expected: expectedCount,
                actual: actualCount,
                databaseCount: actualCount,
                message: passed ? 
                    'Contact count matches expected' : 
                    `Contact count mismatch: expected ${expectedCount}, found ${actualCount}`
            };
            
        } catch (error) {
            return {
                check: 'contact_count',
                passed: false,
                error: error.message
            };
        }
    }

    /**
     * Validate data integrity
     */
    async validateDataIntegrity() {
        try {
            const issues = [];
            
            // Sample validation on first 10 contacts
            const sampleContacts = (this.finalContacts || []).slice(0, 10);
            
            for (const contact of sampleContacts) {
                // Verify contact exists in database
                const contactRef = window.firebaseRTDB.ref(
                    `crm_unified/${contact.customerId}/contacts/${contact.contactId}`
                );
                const snapshot = await window.firebaseRTDB.get(contactRef);
                
                if (!snapshot.exists()) {
                    issues.push({
                        type: 'missing_contact',
                        contactId: contact.contactId,
                        customerId: contact.customerId
                    });
                    continue;
                }
                
                const dbContact = snapshot.val();
                
                // Verify key fields match
                if (dbContact.email !== contact.email) {
                    issues.push({
                        type: 'email_mismatch',
                        contactId: contact.contactId,
                        expected: contact.email,
                        actual: dbContact.email
                    });
                }
                
                if (dbContact.customerId !== contact.customerId) {
                    issues.push({
                        type: 'customer_mismatch',
                        contactId: contact.contactId,
                        expected: contact.customerId,
                        actual: dbContact.customerId
                    });
                }
            }
            
            return {
                check: 'data_integrity',
                passed: issues.length === 0,
                issues,
                sampleSize: sampleContacts.length,
                message: issues.length === 0 ? 
                    'Data integrity check passed' : 
                    `Found ${issues.length} integrity issues in sample`
            };
            
        } catch (error) {
            return {
                check: 'data_integrity',
                passed: false,
                error: error.message
            };
        }
    }

    /**
     * Validate indexes
     */
    async validateIndexes() {
        try {
            const indexIssues = [];
            const expectedIndexes = Object.keys(this.indexBuilder.indexConfigs);
            
            // Check first customer's indexes
            const firstCustomerId = this.finalContacts?.[0]?.customerId;
            if (!firstCustomerId) {
                return {
                    check: 'indexes',
                    passed: false,
                    message: 'No contacts available to validate indexes'
                };
            }
            
            for (const indexName of expectedIndexes) {
                const indexPath = `crm_unified/${firstCustomerId}/indexes/${this.indexBuilder.indexConfigs[indexName].path}`;
                const indexRef = window.firebaseRTDB.ref(indexPath);
                const snapshot = await window.firebaseRTDB.get(indexRef);
                
                if (!snapshot.exists()) {
                    indexIssues.push({
                        type: 'missing_index',
                        indexName,
                        indexPath
                    });
                }
            }
            
            return {
                check: 'indexes',
                passed: indexIssues.length === 0,
                issues: indexIssues,
                expectedIndexes: expectedIndexes.length,
                message: indexIssues.length === 0 ? 
                    'All indexes created successfully' : 
                    `Missing ${indexIssues.length} indexes`
            };
            
        } catch (error) {
            return {
                check: 'indexes',
                passed: false,
                error: error.message
            };
        }
    }

    /**
     * Complete migration
     */
    async completeMigration() {
        this.migrationState.status = 'completed';
        this.migrationState.endTime = new Date().toISOString();
        this.migrationState.progress = 100;
        this.migrationState.currentStep = 'completed';
        
        // Calculate duration
        const startTime = new Date(this.migrationState.startTime);
        const endTime = new Date(this.migrationState.endTime);
        const durationMs = endTime - startTime;
        
        console.log(`⏱️ Migration completed in ${this.formatDuration(durationMs)}`);
        
        // Export final migration report
        this.exportMigrationReport();
    }

    /**
     * Handle migration error
     */
    async handleMigrationError(error) {
        console.error('❌ Migration failed:', error);
        
        this.migrationState.status = 'failed';
        this.migrationState.endTime = new Date().toISOString();
        this.migrationState.errors.push({
            step: this.migrationState.currentStep,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        // Export error report
        this.exportMigrationReport('migration_error_report.json');
    }

    /**
     * Utility functions
     */
    generateMigrationId() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const random = Math.random().toString(36).substr(2, 6);
        return `migration_${timestamp}_${random}`;
    }

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

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Export migration report
     */
    exportMigrationReport(filename = null) {
        if (!filename) {
            filename = `migration_report_${this.migrationState.id}.json`;
        }
        
        const report = {
            migrationId: this.migrationState.id,
            migrationState: this.migrationState,
            configuration: this.config,
            summary: {
                status: this.migrationState.status,
                duration: this.migrationState.endTime ? 
                    new Date(this.migrationState.endTime) - new Date(this.migrationState.startTime) : null,
                totalContacts: this.finalContacts?.length || 0,
                totalErrors: this.migrationState.errors.length,
                totalWarnings: this.migrationState.warnings.length
            }
        };
        
        const dataStr = JSON.stringify(report, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = filename;
        link.click();
        
        console.log(`📁 Migration report exported to ${filename}`);
    }

    /**
     * Get migration status (for external monitoring)
     */
    getMigrationStatus() {
        return {
            id: this.migrationState.id,
            status: this.migrationState.status,
            currentStep: this.migrationState.currentStep,
            progress: this.migrationState.progress,
            errors: this.migrationState.errors.length,
            warnings: this.migrationState.warnings.length
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MigrationController;
} else {
    window.MigrationController = MigrationController;
}


