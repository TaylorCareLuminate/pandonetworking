// CLEmail API Client for Backend Proxy Approach
// Version: 1.0.0
// Purpose: Secure API client for accessing CLEmail via Railway backend

console.log('🔌 CLEmail API Client Loading...');

/**
 * CLEmail API Client
 * Provides secure access to CLEmail data via authenticated API calls
 */
class ClemailAPI {
  constructor() {
    // Railway backend URL for secure CLEmail API access
    this.baseUrl = 'https://railwayclemail-production.up.railway.app/api/clemail';
    console.log('📡 CLEmail API Client initialized:', this.baseUrl);
  }
  
  /**
   * Get the current user's ID token for authentication
   */
  async getAuthToken() {
    if (!window.auth || !window.auth.currentUser) {
      throw new Error('User not authenticated');
    }
    return await window.auth.currentUser.getIdToken();
  }
  
  /**
   * Make an authenticated API request
   */
  async request(endpoint, options = {}) {
    const token = await this.getAuthToken();
    
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`📡 API Request: ${options.method || 'GET'} ${endpoint}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || `API request failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  // ==========================================
  // Test Endpoints
  // ==========================================
  
  /**
   * Test the API connection and authentication
   */
  async test() {
    return await this.request('/test');
  }
  
  /**
   * Create a test document (for security testing)
   */
  async createTestDocument(data) {
    return await this.request('/test/document', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  // ==========================================
  // Email Accounts
  // ==========================================
  
  /**
   * Get all email accounts
   */
  async getEmailAccounts() {
    return await this.request('/emailAccounts');
  }
  
  /**
   * Get a single email account by ID
   */
  async getEmailAccount(accountId) {
    return await this.request(`/emailAccounts/${accountId}`);
  }
  
  /**
   * Create a new email account
   */
  async createEmailAccount(data) {
    return await this.request('/emailAccounts', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  /**
   * Update an email account
   */
  async updateEmailAccount(accountId, data) {
    return await this.request(`/emailAccounts/${accountId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  /**
   * Delete an email account
   */
  async deleteEmailAccount(accountId) {
    return await this.request(`/emailAccounts/${accountId}`, {
      method: 'DELETE'
    });
  }
  
  // ==========================================
  // Email Campaigns
  // ==========================================
  
  /**
   * Get all email campaigns
   */
  async getCampaigns() {
    return await this.request('/campaigns');
  }
  
  /**
   * Get a single campaign by ID
   */
  async getCampaign(campaignId) {
    return await this.request(`/campaigns/${campaignId}`);
  }
  
  // ==========================================
  // Scheduled Emails
  // ==========================================
  
  /**
   * Get scheduled emails
   */
  async getScheduledEmails(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const endpoint = params ? `/scheduledEmails?${params}` : '/scheduledEmails';
    return await this.request(endpoint);
  }
  
  // ==========================================
  // HeyReach
  // ==========================================
  
  /**
   * Get HeyReach accounts
   */
  async getHeyreachAccounts() {
    return await this.request('/heyreachAccounts');
  }
  
  /**
   * Get HeyReach campaigns
   */
  async getHeyreachCampaigns() {
    return await this.request('/heyreachCampaigns');
  }
  
  // ==========================================
  // Generic Operations
  // ==========================================
  
  /**
   * Get documents from any collection
   */
  async getCollection(collectionName, filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const endpoint = params ? `/${collectionName}?${params}` : `/${collectionName}`;
    return await this.request(endpoint);
  }
  
  /**
   * Get a single document
   */
  async getDocument(collectionName, docId) {
    return await this.request(`/${collectionName}/${docId}`);
  }
  
  /**
   * Create a document
   */
  async createDocument(collectionName, data) {
    return await this.request(`/${collectionName}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  /**
   * Update a document
   */
  async updateDocument(collectionName, docId, data) {
    return await this.request(`/${collectionName}/${docId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  /**
   * Delete a document
   */
  async deleteDocument(collectionName, docId) {
    return await this.request(`/${collectionName}/${docId}`, {
      method: 'DELETE'
    });
  }
  
  // ==========================================
  // Folder Access
  // ==========================================
  
  /**
   * Check if current user has access to a specific folder
   */
  async checkFolderAccess(folderName) {
    return await this.request(`/access/${folderName}`);
  }
  
  // ==========================================
  // Prospects (Connect folder)
  // ==========================================
  
  /**
   * Get prospects
   */
  async getProspects(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const endpoint = params ? `/prospects?${params}` : '/prospects';
    return await this.request(endpoint);
  }
  
  /**
   * Save prospect (create or update)
   */
  async saveProspect(data) {
    return await this.request('/prospects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  // ==========================================
  // Leads (Connect folder)
  // ==========================================
  
  /**
   * Get leads
   */
  async getLeads(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const endpoint = params ? `/leads?${params}` : '/leads';
    return await this.request(endpoint);
  }
  
  /**
   * Save lead (create or update)
   */
  async saveLead(data) {
    return await this.request('/leads', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  // ==========================================
  // LinkedIn Messages (Connect folder)
  // ==========================================
  
  /**
   * Get LinkedIn messages
   */
  async getLinkedInMessages(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const endpoint = params ? `/linkedinMessages?${params}` : '/linkedinMessages';
    return await this.request(endpoint);
  }
  
  /**
   * Save LinkedIn message
   */
  async saveLinkedInMessage(data) {
    return await this.request('/linkedinMessages', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  // ==========================================
  // Advanced Query Operations
  // ==========================================
  
  /**
   * List documents from a collection with simple filtering
   * Uses GET /api/clemail/list/:collectionName
   * @param {string} collectionName - Name of the collection
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of documents to return
   * @param {string} options.orderBy - Field to order by
   * @param {string} options.order - 'asc' or 'desc' (default: 'desc')
   * @param {string} options.whereField - Field for simple filter
   * @param {string} options.whereValue - Value for simple filter
   * @param {string} options.whereOp - Operator for simple filter (default: '==')
   */
  async listCollection(collectionName, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.order) params.append('order', options.order);
    if (options.whereField) params.append('whereField', options.whereField);
    if (options.whereValue !== undefined) params.append('whereValue', options.whereValue);
    if (options.whereOp) params.append('whereOp', options.whereOp);
    
    const queryString = params.toString();
    const endpoint = queryString ? `/list/${collectionName}?${queryString}` : `/list/${collectionName}`;
    return await this.request(endpoint);
  }
  
  /**
   * Query documents with complex filters
   * Uses POST /api/clemail/query/:collectionName
   * @param {string} collectionName - Name of the collection
   * @param {Object} queryOptions - Query configuration
   * @param {Array} queryOptions.where - Array of filter objects [{field, operator, value}]
   * @param {Object|Array} queryOptions.orderBy - Order configuration {field, direction} or array of them
   * @param {number} queryOptions.limit - Maximum number of documents
   */
  async queryCollection(collectionName, queryOptions = {}) {
    return await this.request(`/query/${collectionName}`, {
      method: 'POST',
      body: JSON.stringify(queryOptions)
    });
  }
  
  /**
   * Get a single document by ID using the generic endpoint
   * Uses GET /api/clemail/doc/:collectionName/:docId
   */
  async getDocById(collectionName, docId) {
    return await this.request(`/doc/${collectionName}/${docId}`);
  }
  
  /**
   * Create a document using the generic endpoint
   * Uses POST /api/clemail/doc/:collectionName
   */
  async createDoc(collectionName, data) {
    return await this.request(`/doc/${collectionName}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  /**
   * Update a document by ID using the generic endpoint
   * Uses PUT /api/clemail/doc/:collectionName/:docId
   */
  async updateDoc(collectionName, docId, data) {
    return await this.request(`/doc/${collectionName}/${docId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  /**
   * Delete a document by ID using the generic endpoint
   * Uses DELETE /api/clemail/doc/:collectionName/:docId
   */
  async deleteDoc(collectionName, docId) {
    return await this.request(`/doc/${collectionName}/${docId}`, {
      method: 'DELETE'
    });
  }
  
  /**
   * Execute batch operations
   * Uses POST /api/clemail/batch
   * @param {Array} operations - Array of operations [{type: 'create'|'update'|'delete', collection, docId?, data?}]
   */
  async batchOperations(operations) {
    return await this.request('/batch', {
      method: 'POST',
      body: JSON.stringify({ operations })
    });
  }
}

// Create global instance
window.clemailAPI = new ClemailAPI();

console.log('✅ CLEmail API Client loaded (v1.1.0 - with advanced queries)');

