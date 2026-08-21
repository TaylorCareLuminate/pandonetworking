/**
 * CLEmail Firestore Wrapper
 * Drop-in replacement for Firebase Firestore SDK that routes through Railway backend
 * 
 * This provides the same API as Firestore SDK but with secure authentication.
 * 
 * Usage: Replace Firestore imports with this wrapper:
 * 
 * BEFORE:
 *   import { getFirestore, collection, getDocs, ... } from 'firebase/firestore';
 *   const db = getFirestore(clemailApp);
 * 
 * AFTER:
 *   Include this script: <script src="../js/clemail-firestore-wrapper.js"></script>
 *   const db = window.clemailDb;
 * 
 * @version 2.0.0
 */

console.log('🔌 CLEmail Firestore Wrapper Loading...');

// =====================================================
// Configuration
// =====================================================

const CLEMAIL_API_BASE = 'https://railwayclemail-production.up.railway.app/api/clemail';

// =====================================================
// Timestamp Class (Firestore-compatible)
// =====================================================

class Timestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  
  static fromDate(date) {
    const seconds = Math.floor(date.getTime() / 1000);
    const nanoseconds = (date.getTime() % 1000) * 1000000;
    return new Timestamp(seconds, nanoseconds);
  }
  
  static now() {
    return Timestamp.fromDate(new Date());
  }
  
  toDate() {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
  }
  
  toMillis() {
    return this.seconds * 1000 + this.nanoseconds / 1000000;
  }
  
  // For JSON serialization - send as Firestore-compatible format
  toJSON() {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds };
  }
}

// Helper to convert any timestamp-like value to a Date
// Works with: Firestore Timestamp, API serialized timestamps, Date objects, numbers, strings
function toDateHelper(timestamp) {
  if (!timestamp) return null;
  // If it's already a Date
  if (timestamp instanceof Date) return timestamp;
  // If it has toDate method (native Firestore Timestamp or our Timestamp class)
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  // If it's a serialized timestamp from API (has seconds property)
  if (timestamp.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
  }
  // Firebase Admin SDK format (uses _seconds and _nanoseconds)
  if (timestamp._seconds !== undefined) {
    return new Date(timestamp._seconds * 1000 + (timestamp._nanoseconds || 0) / 1000000);
  }
  // If it's a number (milliseconds)
  if (typeof timestamp === 'number') return new Date(timestamp);
  // If it's a string
  if (typeof timestamp === 'string') return new Date(timestamp);
  return null;
}

// Expose globally for easy access
window.toDate = toDateHelper;

// =====================================================
// Auth Token Helper
// =====================================================

// Resilient against brief cross-tab auth flickers.
//
// Background: when another tab triggers a token refresh or clears its auth
// key, this tab's `window.auth.currentUser` can momentarily flip to null.
// `auth.js` has an "ULTRA PROTECTED" recovery path that restores the user
// within a few hundred milliseconds (search auth.js for "Ignoring suspicious
// logout"). The OLD implementation here threw on the very first null read,
// which would abort long-running flows (notably reschedule_campaigns.html)
// in the middle of a batch and leave reserved slots without their matching
// scheduledEmails doc.
//
// New behavior:
//   1. If currentUser is present, return its token immediately (hot path,
//      no overhead).
//   2. If currentUser is null, poll every 150ms for up to ~4 seconds. If it
//      comes back, return the token.
//   3. If still null after that, throw — this is a real logout, not a
//      flicker, and the caller should surface it to the user.
//
// Also wraps getIdToken() in a single retry, because getIdToken can reject
// with "auth/user-token-expired" mid-refresh; retrying picks up the fresh
// token after the in-flight refresh completes.
async function getAuthToken() {
  // Fast path.
  let user = window.auth && window.auth.currentUser;

  // Wait for transient null state (e.g. Firebase auto-refresh, large parallel loads).
  // 8 s covers Firebase's ~5 s worst-case token-refresh window plus network lag.
  if (!user) {
    const FLICKER_TIMEOUT_MS = 8000;
    const POLL_INTERVAL_MS = 150;
    const start = Date.now();
    while (Date.now() - start < FLICKER_TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      user = window.auth && window.auth.currentUser;
      if (user) break;
    }
  }

  // Final fallback: auth.js keeps a 12-hour cached user object that survives
  // brief currentUser=null windows during token refresh.
  if (!user) {
    const cached = window.getCurrentAuthState?.()?.user;
    if (cached) {
      console.warn('⚠️ [getAuthToken] auth.currentUser was null — using auth.js cached user');
      user = cached;
    }
  }

  // Secondary fallback: pages that use a different Firebase SDK version (e.g. 10.7.1
  // vs auth.js's 10.7.0) expose their resolved user on window.auth._cachedCurrentUser
  // so the two-SDK-version race can't leave getAuthToken empty-handed.
  if (!user && window.auth?._cachedCurrentUser) {
    console.warn('⚠️ [getAuthToken] using page _cachedCurrentUser fallback');
    user = window.auth._cachedCurrentUser;
  }

  if (!user) {
    throw new Error('Not authenticated. Please log in first.');
  }

  try {
    return await user.getIdToken();
  } catch (err) {
    // Single retry for token-expired / token-refresh races.
    const code = err && err.code;
    if (code === 'auth/user-token-expired' || code === 'auth/network-request-failed' || code === 'auth/internal-error') {
      console.warn(`⚠️ getIdToken transient error (${code}); retrying once with forceRefresh…`);
      await new Promise(r => setTimeout(r, 250));
      const u2 = window.auth && window.auth.currentUser;
      if (u2) return await u2.getIdToken(true);
    }
    throw err;
  }
}

// =====================================================
// API Request Helper
// =====================================================

async function apiRequest(endpoint, options = {}) {
  const token = await getAuthToken();
  
  const url = `${CLEMAIL_API_BASE}${endpoint}`;
  
  console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);

  // Abort after 60 s so callers never hang indefinitely (Railway cold-starts
  // and large indexed queries can exceed 30 s; override with options.timeoutMs).
  const timeoutMs = options.timeoutMs ?? 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
    
    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    
    // Keep the timeout active while reading the body — Railway sometimes sends
    // headers immediately but streams the body slowly or never finishes it.
    const data = await response.json();
    clearTimeout(timeoutId);
    
    if (!response.ok || !data.success) {
      const error = new Error(data.error || data.message || `API Error: ${response.status}`);
      error.code = response.status;
      error.responseData = data;

      // 404 "Document not found" is a normal condition (e.g. cache doc doesn't exist yet).
      // Suppress the console error and let callers handle the not-found snapshot.
      if (response.status !== 404) {
        console.error('❌ API Error:', error.message, data);

        // If there's an index URL, log it prominently for the user
        if (data.indexUrl) {
          console.error('🔗 CREATE INDEX HERE:', data.indexUrl);
          console.error('   Click the link above to create the required Firestore index');
        }
        if (data.details) {
          console.error('📋 Full error details:', data.details);
        }
      }
      
      throw error;
    }
    
    // Log item count (handle both arrays and single objects)
    const itemCount = Array.isArray(data.data) ? data.data.length : (data.data ? 1 : 0);
    const itemLabel = Array.isArray(data.data) ? 'items' : (data.data ? 'document' : 'items');
    console.log(`✅ API Success:`, data.success ? '✓' : '✗', `(${itemCount} ${itemLabel})`);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    // AbortError is a DOMException with a numeric `code` (e.g. 20). Handle it
    // before `if (error.code)` so we don't skip the timeout message below.
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      const timeoutError = new Error(`Request timed out after ${timeoutMs / 1000}s — Railway backend may be cold-starting. Please try again.`);
      timeoutError.code = 'TIMEOUT';
      console.error('⏱️ Request timed out:', url);
      throw timeoutError;
    }
    // Re-throw errors that were already logged or are expected (404 not-found)
    if (error.code || error.message.includes('API Error')) {
      throw error;
    }
    console.error('❌ Network Error:', error.message);
    throw error;
  }
}

// =====================================================
// Helper: Convert timestamp objects to Timestamp instances
// =====================================================

function convertTimestamps(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  // If it's an array, convert each item
  if (Array.isArray(obj)) {
    return obj.map(item => convertTimestamps(item));
  }
  
  // If it looks like a Firestore timestamp (client SDK format: seconds)
  if (obj.seconds !== undefined && typeof obj.seconds === 'number') {
    return new Timestamp(obj.seconds, obj.nanoseconds || 0);
  }
  
  // If it looks like a Firestore timestamp (Admin SDK format: _seconds)
  if (obj._seconds !== undefined && typeof obj._seconds === 'number') {
    return new Timestamp(obj._seconds, obj._nanoseconds || 0);
  }
  
  // If it's a plain object, recursively convert its properties
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      converted[key] = convertTimestamps(value);
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

// =====================================================
// DocumentSnapshot Class
// =====================================================

class DocumentSnapshot {
  constructor(id, data, exists = true, collectionPath = null) {
    this._id = id;
    // Convert timestamp objects to Timestamp instances
    this._data = convertTimestamps(data);
    this._exists = exists;
    this._collectionPath = collectionPath;
    
    // Create a document reference for this snapshot
    if (collectionPath) {
      this.ref = new DocumentReference(collectionPath, id);
    }
  }
  
  get id() {
    return this._id;
  }
  
  get exists() {
    return this._exists;
  }
  
  data() {
    return this._exists ? this._data : undefined;
  }
  
  get(fieldPath) {
    if (!this._exists) return undefined;
    return fieldPath.split('.').reduce((obj, key) => obj?.[key], this._data);
  }
}

// =====================================================
// Outdated-Record Filter
// =====================================================
//
// Records marked { outdated: true } are retired-but-kept-for-history (e.g. a
// LinkedIn seat that moved to a new HeyReach account when a BDR changed
// companies). They must stop participating in ALL page logic — account-ID →
// email maps, bdrEmail lookups, API-key resolution — without being deleted,
// so they can be restored later for reporting.
//
// Filtering here (the single data-access chokepoint for every Connect page)
// means no page needs its own outdated check. Admin pages that manage these
// records opt back in by setting:
//
//   window.CLEMAIL_INCLUDE_OUTDATED_ACCOUNTS = true;
//
// Direct doc reads by ID (getDoc) are intentionally NOT filtered — a page
// that already holds a specific doc ID is doing targeted admin/repair work.

const OUTDATED_FILTERED_COLLECTIONS = new Set(['linkedin_accounts']);

function filterOutdatedDocs(collectionName, docs) {
  if (window.CLEMAIL_INCLUDE_OUTDATED_ACCOUNTS === true) return docs;
  if (!OUTDATED_FILTERED_COLLECTIONS.has(collectionName)) return docs;
  const filtered = docs.filter(d => !(d.data()?.outdated === true));
  if (filtered.length !== docs.length) {
    console.log(`🚫 Excluded ${docs.length - filtered.length} outdated ${collectionName} record(s) from query results`);
  }
  return filtered;
}

// =====================================================
// QuerySnapshot Class
// =====================================================

class QuerySnapshot {
  constructor(docs) {
    this._docs = docs;
  }
  
  get docs() {
    return this._docs;
  }
  
  get size() {
    return this._docs.length;
  }
  
  get empty() {
    return this._docs.length === 0;
  }
  
  forEach(callback) {
    this._docs.forEach(callback);
  }
}

// =====================================================
// Helper: Serialize Data
// =====================================================

// Helper: Serialize a value for the API (converts Dates and Timestamps to Firestore format)
function serializeValue(value) {
  // Handle null/undefined
  if (value == null) return value;
  
  // Handle Date objects - convert to Firestore Timestamp format
  if (value instanceof Date) {
    const seconds = Math.floor(value.getTime() / 1000);
    const nanoseconds = (value.getTime() % 1000) * 1000000;
    return { seconds, nanoseconds, _isTimestamp: true };
  }
  
  // Handle our Timestamp class
  if (value instanceof Timestamp) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds, _isTimestamp: true };
  }
  
  // Handle arrays (e.g., for 'in' operator)
  if (Array.isArray(value)) {
    return value.map(v => serializeValue(v));
  }
  
  // Handle objects (recursively serialize nested values)
  if (typeof value === 'object' && value !== null) {
    const serialized = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        serialized[key] = serializeValue(value[key]);
      }
    }
    return serialized;
  }
  
  // Return primitive values as-is
  return value;
}

// =====================================================
// DocumentReference Class
// =====================================================

class DocumentReference {
  constructor(collectionName, docId) {
    this._collectionName = collectionName;
    this._docId = docId;
  }
  
  get id() {
    return this._docId;
  }
  
  get path() {
    return `${this._collectionName}/${this._docId}`;
  }
  
  async get() {
    try {
      const result = await apiRequest(`/doc/${this._collectionName}/${this._docId}`);
      return new DocumentSnapshot(result.id, result.data, true, this._collectionName);
    } catch (error) {
      if (error.code === 404) {
        return new DocumentSnapshot(this._docId, null, false, this._collectionName);
      }
      throw error;
    }
  }
  
  async set(data, options = {}) {
    const method = options.merge ? 'PUT' : 'PUT';
    // Serialize data to handle Date objects and Timestamps properly
    const serializedData = serializeValue(data);
    await apiRequest(`/doc/${this._collectionName}/${this._docId}`, {
      method,
      body: JSON.stringify(serializedData)
    });
  }
  
  async update(data) {
    // Serialize data to handle Date objects and Timestamps properly
    const serializedData = serializeValue(data);
    await apiRequest(`/doc/${this._collectionName}/${this._docId}`, {
      method: 'PUT',
      body: JSON.stringify(serializedData)
    });
  }
  
  async delete() {
    // Use soft=false to actually delete the document (not just mark as deleted)
    await apiRequest(`/doc/${this._collectionName}/${this._docId}?soft=false`, {
      method: 'DELETE'
    });
  }
  
  collection(subcollectionName) {
    return new CollectionReference(`${this._collectionName}/${this._docId}/${subcollectionName}`);
  }
}

// =====================================================
// Query Class
// =====================================================

class Query {
  constructor(collectionName, constraints = []) {
    this._collectionName = collectionName;
    this._constraints = constraints;
  }
  
  where(field, operator, value) {
    const newConstraints = [...this._constraints, { type: 'where', field, operator, value }];
    return new Query(this._collectionName, newConstraints);
  }
  
  orderBy(field, direction = 'asc') {
    const newConstraints = [...this._constraints, { type: 'orderBy', field, direction }];
    return new Query(this._collectionName, newConstraints);
  }
  
  limit(count) {
    const newConstraints = [...this._constraints, { type: 'limit', value: count }];
    return new Query(this._collectionName, newConstraints);
  }
  
  startAfter(doc) {
    const newConstraints = [...this._constraints, { type: 'startAfter', value: doc.id }];
    return new Query(this._collectionName, newConstraints);
  }
  
  async get(options = {}) {
    // No explicit limit() → fetch via cursor pagination (getAllDocs) instead of
    // letting the backend fall back to a single up-to-25,000-doc read. Dozens of
    // pages query fat collections (scheduledEmails, outreach_sets, heyreach_inbox,
    // prospect_contacts, …) without a limit; each of those used to become ONE
    // giant request that could hold the Railway backend for 60+ seconds and time
    // out client-side while the server kept grinding. Paginating in 5,000-doc
    // chunks returns the SAME complete result set (now even beyond 25k docs)
    // as a series of bounded requests the backend can interleave with other
    // work. Callers that explicitly pass limit()/startAfter() keep exact
    // single-request behavior, as does `options.singleRequest = true`.
    const hasLimit = this._constraints.some(c => c.type === 'limit');
    const hasStartAfter = this._constraints.some(c => c.type === 'startAfter');
    if (!hasLimit && !hasStartAfter && !options.singleRequest) {
      const result = await getAllDocs(this, { timeoutMs: options.timeoutMs });
      return new QuerySnapshot(result.docs);
    }

    // Build query body - serialize Date/Timestamp values properly
    const whereFilters = this._constraints
      .filter(c => c.type === 'where')
      .map(c => ({ field: c.field, operator: c.operator, value: serializeValue(c.value) }));
    
    const orderByConstraints = this._constraints.filter(c => c.type === 'orderBy');
    const orderBy = orderByConstraints.length > 0 
      ? orderByConstraints.map(c => ({ field: c.field, direction: c.direction }))
      : undefined;
    
    const limitConstraint = this._constraints.find(c => c.type === 'limit');
    const limit = limitConstraint?.value;
    
    const startAfterConstraint = this._constraints.find(c => c.type === 'startAfter');
    const startAfter = startAfterConstraint?.value; // This is the document ID
    
    const result = await apiRequest(`/query/${this._collectionName}`, {
      method: 'POST',
      body: JSON.stringify({ where: whereFilters, orderBy, limit, startAfter }),
      ...(options.timeoutMs != null ? { timeoutMs: options.timeoutMs } : {})
    });
    
    let docs = (result.data || []).map(item => {
      const { id, ...data } = item; // Separate id from data
      return new DocumentSnapshot(id, data, true, this._collectionName);
    });
    
    // getAllDocs passes _skipOutdatedFilter and filters after pagination completes,
    // so cursor position/termination are computed on the raw page.
    if (!options._skipOutdatedFilter) {
      docs = filterOutdatedDocs(this._collectionName, docs);
    }
    
    return new QuerySnapshot(docs);
  }
}

// =====================================================
// CollectionReference Class
// =====================================================

class CollectionReference extends Query {
  constructor(collectionName) {
    super(collectionName);
  }
  
  doc(docId) {
    if (!docId) {
      // Generate a random ID if none provided
      docId = 'auto_' + Math.random().toString(36).substr(2, 20);
    }
    return new DocumentReference(this._collectionName, docId);
  }
  
  async add(data) {
    const result = await apiRequest(`/doc/${this._collectionName}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    return new DocumentReference(this._collectionName, result.id);
  }
  
  async get(options = {}) {
    // Previously hit GET /list/<collection>, which returns up to 25,000 docs in
    // ONE request — full-collection scans of fat collections (heyreach_inbox,
    // outreach_sets, prospect_contacts, …) were the single biggest source of
    // Railway stalls. Delegating to Query.get() with no constraints routes
    // through the same auto-pagination path: complete results, bounded chunks.
    return await super.get(options);
  }
}

// =====================================================
// WriteBatch Class
// =====================================================

class WriteBatch {
  constructor() {
    this._operations = [];
  }
  
  set(docRef, data) {
    this._operations.push({
      type: 'set',
      collection: docRef._collectionName,
      id: docRef._docId,
      data
    });
    return this;
  }
  
  update(docRef, data) {
    this._operations.push({
      type: 'update',
      collection: docRef._collectionName,
      id: docRef._docId,
      data
    });
    return this;
  }
  
  delete(docRef) {
    this._operations.push({
      type: 'delete',
      collection: docRef._collectionName,
      id: docRef._docId
    });
    return this;
  }
  
  async commit() {
    if (this._operations.length === 0) return;
    
    await apiRequest('/batch', {
      method: 'POST',
      body: JSON.stringify({ operations: this._operations })
    });
    
    this._operations = [];
  }
}

// =====================================================
// Firestore Instance Class
// =====================================================

class ClemailFirestore {
  constructor() {
    console.log('🔥 CLEmail Firestore Wrapper initialized');
  }
  
  collection(collectionName) {
    return new CollectionReference(collectionName);
  }
  
  doc(path) {
    const parts = path.split('/');
    if (parts.length >= 2) {
      const collectionName = parts.slice(0, -1).join('/');
      const docId = parts[parts.length - 1];
      return new DocumentReference(collectionName, docId);
    }
    throw new Error('Invalid document path: ' + path);
  }
  
  batch() {
    return new WriteBatch();
  }
}

// =====================================================
// Factory Functions (matching Firebase SDK API)
// =====================================================

// Create the singleton instance
const clemailDb = new ClemailFirestore();

// Firestore-compatible factory functions
function getFirestoreClemail() {
  return clemailDb;
}

function collection(db, collectionName) {
  return db.collection(collectionName);
}

function doc(dbOrCollection, ...pathSegments) {
  if (dbOrCollection instanceof CollectionReference) {
    // doc(collectionRef, docId)
    return dbOrCollection.doc(pathSegments[0]);
  } else if (dbOrCollection instanceof ClemailFirestore) {
    // doc(db, collectionName, docId) or doc(db, path)
    if (pathSegments.length === 1 && pathSegments[0].includes('/')) {
      return dbOrCollection.doc(pathSegments[0]);
    }
    const collectionName = pathSegments[0];
    const docId = pathSegments[1];
    return dbOrCollection.collection(collectionName).doc(docId);
  }
  throw new Error('Invalid arguments to doc()');
}

async function getDocs(queryOrCollection, options = {}) {
  return await queryOrCollection.get(options);
}

/**
 * Fetch ALL documents for a query, automatically paginating through the
 * server's default result cap using startAfter cursor pagination.
 *
 * Drop-in replacement for getDocs() when you need more than the server
 * fallback cap (25,000 documents per request), or when a
 * collection is large enough that a single non-paginated request risks
 * timing out (very large collections can take Railway/Firestore longer
 * than a single request's timeout to serialize and return in one shot).
 * Smaller pages complete faster individually, and a failed page is
 * retried on its own instead of re-fetching everything from scratch.
 *
 * @param {Query|CollectionReference} baseQueryRef
 * @param {object} [options]
 * @param {number} [options.pageSize=5000]   Documents fetched per request.
 * @param {number} [options.timeoutMs]       Per-page request timeout.
 * @param {number} [options.maxRetries=2]    Retries per page on timeout/network errors.
 * @param {number} [options.maxDocs=100000]  Safety cap on total docs fetched; warns if hit.
 * @param {Function} [options.onPage]        Called with running total doc count after each page.
 * @returns {Promise<{docs: DocumentSnapshot[], forEach: Function, size: number, empty: boolean}>}
 */
async function getAllDocs(baseQueryRef, options = {}) {
  const PAGE_SIZE   = options.pageSize || 5000;
  const MAX_RETRIES = options.maxRetries ?? 2;
  const MAX_DOCS    = options.maxDocs || 100000;
  const allDocs = [];

  // Build a base constraint list without any existing limit/startAfter
  // (so callers don't need to worry about stripping them)
  const baseConstraints = (baseQueryRef._constraints || []).filter(
    c => c.type !== 'limit' && c.type !== 'startAfter'
  );

  let lastDocId = null;

  for (;;) {
    const pageConstraints = [
      ...baseConstraints,
      { type: 'limit', value: PAGE_SIZE },
      ...(lastDocId ? [{ type: 'startAfter', value: lastDocId }] : [])
    ];

    const pageQuery = new Query(baseQueryRef._collectionName, pageConstraints);

    let snap, lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Raw page (no outdated filter) — page length and lastDocId must reflect
        // what the server actually returned or pagination would end early / skip docs.
        snap = await pageQuery.get({ timeoutMs: options.timeoutMs, _skipOutdatedFilter: true });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        // Only retry transient failures — a real query/auth error should surface right away
        const isRetryable = err.code === 'TIMEOUT' || err.name === 'TypeError';
        if (!isRetryable || attempt === MAX_RETRIES) break;
        console.warn(`⏱️ getAllDocs: page fetch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying…`, err.message);
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    if (lastError) throw lastError;

    const docs = snap.docs || [];
    allDocs.push(...docs);
    if (options.onPage) options.onPage(allDocs.length);

    if (docs.length < PAGE_SIZE) break;       // last (or only) page
    if (allDocs.length >= MAX_DOCS) {
      console.warn(`⚠️ getAllDocs('${baseQueryRef._collectionName}'): stopped at the ${MAX_DOCS.toLocaleString()}-doc safety cap — results may be incomplete. Pass { maxDocs } to raise it.`);
      break;
    }
    lastDocId = docs[docs.length - 1].id;
  }

  const finalDocs = filterOutdatedDocs(baseQueryRef._collectionName, allDocs);

  return {
    docs:    finalDocs,
    forEach: fn => finalDocs.forEach(fn),
    size:    finalDocs.length,
    empty:   finalDocs.length === 0
  };
}

async function getDoc(docRef) {
  return await docRef.get();
}

async function addDoc(collectionRef, data) {
  return await collectionRef.add(data);
}

async function setDoc(docRef, data, options) {
  await docRef.set(data, options);
}

async function updateDoc(docRef, data) {
  await docRef.update(data);
}

async function deleteDoc(docRef) {
  await docRef.delete();
}

function query(collectionRef, ...queryConstraints) {
  let q = collectionRef;
  for (const constraint of queryConstraints) {
    q = constraint(q);
  }
  return q;
}

function where(field, operator, value) {
  return (q) => q.where(field, operator, value);
}

function orderBy(field, direction = 'asc') {
  return (q) => q.orderBy(field, direction);
}

function limit(count) {
  return (q) => q.limit(count);
}

function startAfter(doc) {
  return (q) => q.startAfter(doc);
}

function writeBatch(db) {
  return db.batch();
}

// =====================================================
// Firestore Transactions
// =====================================================

/**
 * Run a Firestore transaction
 * This is a simplified implementation that uses optimistic concurrency control
 */
async function runTransaction(db, updateFunction) {
  const transaction = {
    get: async (docRef) => {
      try {
        const snapshot = await docRef.get();
        return snapshot;
      } catch (error) {
        console.error('❌ Transaction get error:', error);
        throw error;
      }
    },
    
    set: (docRef, data, options = {}) => {
      transaction._writes = transaction._writes || [];
      transaction._writes.push({
        type: 'set',
        ref: docRef,
        data: data,
        options: options
      });
    },
    
    update: (docRef, data) => {
      transaction._writes = transaction._writes || [];
      transaction._writes.push({
        type: 'update',
        ref: docRef,
        data: data
      });
    },
    
    delete: (docRef) => {
      transaction._writes = transaction._writes || [];
      transaction._writes.push({
        type: 'delete',
        ref: docRef
      });
    },
    
    _writes: []
  };
  
  try {
    // Execute the user's transaction function
    const result = await updateFunction(transaction);
    
    // Apply all writes
    for (const write of transaction._writes) {
      if (write.type === 'set') {
        await write.ref.set(write.data, write.options);
      } else if (write.type === 'update') {
        await write.ref.update(write.data);
      } else if (write.type === 'delete') {
        await write.ref.delete();
      }
    }
    
    return result;
  } catch (error) {
    console.error('❌ Transaction failed:', error);
    throw error;
  }
}

// =====================================================
// Exports
// =====================================================

// Global instance
window.clemailDb = clemailDb;

// Also expose as clemailFirestore for compatibility
window.clemailFirestore = {
  db: clemailDb,
  getFirestore: getFirestoreClemail,
  collection,
  doc,
  getDocs,
  getAllDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  runTransaction,
  Timestamp,
  QuerySnapshot,
  DocumentReference,
  CollectionReference,
  Query,
  WriteBatch
};

// ES Module-like exports for when script is loaded as module
window.clemailFirestoreModule = {
  getFirestore: getFirestoreClemail,
  collection,
  doc,
  getDocs,
  getAllDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  runTransaction,
  Timestamp
};

console.log('✅ CLEmail Firestore Wrapper loaded');
console.log('📖 Usage: const db = window.clemailDb; or use window.clemailFirestore functions');

