# Outreach System Troubleshooting Guide

## Table of Contents
1. [Common Issues](#common-issues)
2. [Database Issues](#database-issues)
3. [Authentication Problems](#authentication-problems)
4. [LinkedIn Integration Issues](#linkedin-integration-issues)
5. [Email System Problems](#email-system-problems)
6. [Performance Issues](#performance-issues)
7. [UI and Frontend Issues](#ui-and-frontend-issues)
8. [Data Upload Problems](#data-upload-problems)
9. [Scheduling Issues](#scheduling-issues)
10. [Analytics and Reporting Issues](#analytics-and-reporting-issues)
11. [System Monitoring](#system-monitoring)
12. [Emergency Procedures](#emergency-procedures)

---

## Common Issues

### System Health Check Failed
**Symptoms**: Health check endpoint returns 503 status
**Causes**: Database connectivity, external API failures, memory issues
**Solutions**:
```bash
# Check system status
curl https://your-app.railway.app/health/detailed

# Check Railway logs
railway logs --tail 100

# Check resource usage
curl https://your-app.railway.app/api/system/resources
```

### Slow Response Times
**Symptoms**: API calls taking >2 seconds, UI loading slowly
**Causes**: Database query performance, network latency, memory leaks
**Solutions**:
1. Check database indexes: `firebase firestore:indexes`
2. Monitor memory usage: Check Railway metrics dashboard
3. Review query performance in logs
4. Enable caching for frequently accessed data

### High Error Rates
**Symptoms**: >5% of requests failing, error alerts firing
**Causes**: External API failures, database timeouts, code bugs
**Solutions**:
1. Check error logs: `railway logs --filter error`
2. Review external API status: PhantomBuster, SMTP providers
3. Check database performance metrics
4. Review recent code deployments

---

## Database Issues

### Firestore Connection Failures
**Error**: `FirebaseError: Failed to get document`
**Causes**: Network connectivity, quota limits, security rules
**Diagnosis**:
```javascript
// Test Firestore connectivity
const admin = require('firebase-admin');
const db = admin.firestore();

try {
    const testDoc = await db.collection('system_test').doc('connectivity').get();
    console.log('Firestore connection: OK');
} catch (error) {
    console.error('Firestore connection failed:', error.message);
}
```

**Solutions**:
1. Verify Firebase project configuration
2. Check quota limits in Firebase Console
3. Review Firestore security rules
4. Verify network connectivity from Railway

### Query Performance Issues
**Symptoms**: Slow database queries, timeouts
**Causes**: Missing indexes, complex queries, large result sets
**Diagnosis**:
```javascript
// Enable query profiling
const query = db.collection('outreach_sets')
    .where('customerId', '==', customerId)
    .where('approvalStatus', '==', 'approved')
    .limit(100);

const start = Date.now();
const snapshot = await query.get();
const duration = Date.now() - start;

console.log(`Query took ${duration}ms for ${snapshot.size} documents`);
```

**Solutions**:
1. Create composite indexes for complex queries
2. Add pagination to large result sets
3. Use collection group queries where appropriate
4. Implement caching for frequently accessed data

### Data Consistency Issues
**Symptoms**: Outdated data, sync conflicts, missing records
**Causes**: Race conditions, incomplete transactions, caching issues
**Solutions**:
```javascript
// Use transactions for data consistency
const batch = db.batch();

// Update multiple documents atomically
batch.update(outreachSetRef, { approvalStatus: 'approved' });
batch.set(analyticsRef, { approvedCount: increment(1) });

await batch.commit();
```

### Quota Exceeded Errors
**Error**: `Quota exceeded` or `Resource exhausted`
**Solutions**:
1. Check Firebase Console for quota usage
2. Implement request batching to reduce API calls
3. Add caching to reduce database reads
4. Consider upgrading Firebase plan

---

## Authentication Problems

### User Login Failures
**Symptoms**: Users cannot login, authentication errors
**Causes**: Invalid credentials, expired sessions, configuration issues
**Diagnosis**:
```javascript
// Test authentication
firebase.auth().signInWithEmailAndPassword(email, password)
    .then((user) => {
        console.log('Login successful:', user.uid);
    })
    .catch((error) => {
        console.error('Login failed:', error.code, error.message);
    });
```

**Solutions**:
1. Verify Firebase Auth configuration
2. Check user account status in Firebase Console
3. Review authentication rules and permissions
4. Clear browser cache and cookies

### Permission Denied Errors
**Error**: `FirebaseError: Missing or insufficient permissions`
**Causes**: Incorrect security rules, missing user roles, data isolation issues
**Solutions**:
1. Review Firestore security rules
2. Verify user's customerId and role claims
3. Check document-level permissions
4. Test with Firebase Auth emulator

### Session Management Issues
**Symptoms**: Users logged out unexpectedly, session timeouts
**Solutions**:
1. Check session timeout configuration
2. Implement proper token refresh logic
3. Add session persistence options
4. Monitor authentication state changes

---

## LinkedIn Integration Issues

### PhantomBuster API Failures
**Error**: `PhantomBuster API returned 429 (Rate Limited)`
**Causes**: Rate limit exceeded, invalid API key, service outage
**Diagnosis**:
```javascript
// Test PhantomBuster API
const response = await fetch('https://phantombuster.com/api/v2/agents', {
    headers: {
        'X-Phantombuster-Key': API_KEY
    }
});

if (!response.ok) {
    console.error('PhantomBuster API error:', response.status, response.statusText);
}
```

**Solutions**:
1. Check PhantomBuster account status and limits
2. Implement exponential backoff for retries
3. Verify API key configuration
4. Monitor PhantomBuster service status

### LinkedIn Cookie Issues
**Symptoms**: LinkedIn actions failing, authentication errors
**Causes**: Expired cookies, invalid sessions, account restrictions
**Solutions**:
1. Update LinkedIn account cookies in system
2. Verify account isn't restricted or suspended
3. Test cookie validity using validation endpoint
4. Implement cookie refresh workflow

### Research Queue Processing Failures
**Symptoms**: Research tasks stuck in queue, not processing
**Causes**: PhantomBuster failures, rate limiting, account issues
**Diagnosis**:
```javascript
// Check research queue status
const pendingResearch = await db.collection('linkedin_research')
    .where('status', '==', 'pending')
    .where('createdAt', '<', thirtyMinutesAgo)
    .get();

console.log(`${pendingResearch.size} stuck research tasks`);
```

**Solutions**:
1. Restart research processing service
2. Check LinkedIn account availability
3. Review rate limiting settings
4. Manual queue cleanup if necessary

---

## Email System Problems

### SMTP Connection Failures
**Error**: `SMTP connection failed` or `Authentication failed`
**Causes**: Invalid credentials, SMTP server issues, network problems
**Diagnosis**:
```javascript
// Test SMTP connection
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

await transporter.verify();
```

**Solutions**:
1. Verify SMTP credentials and configuration
2. Check email provider service status
3. Test with different SMTP settings
4. Implement connection retry logic

### Email Delivery Issues
**Symptoms**: Emails not being delivered, bounces, spam filtering
**Causes**: Poor sender reputation, blacklisting, content issues
**Solutions**:
1. Check sender domain reputation
2. Implement proper SPF/DKIM/DMARC records
3. Monitor bounce rates and spam complaints
4. Use email validation before sending

### Email Queue Backup
**Symptoms**: Emails stuck in queue, delayed sending
**Causes**: Rate limiting, SMTP failures, queue processing issues
**Diagnosis**:
```javascript
// Check email queue status
const queuedEmails = await db.collection('scheduledEmails')
    .where('status', '==', 'queued')
    .where('scheduledTime', '<', new Date())
    .get();

console.log(`${queuedEmails.size} emails overdue for sending`);
```

**Solutions**:
1. Restart email processing service
2. Check rate limit configurations
3. Process queue manually if necessary
4. Implement queue monitoring alerts

---

## Performance Issues

### High Memory Usage
**Symptoms**: Memory usage >80%, service restarts, slow performance
**Causes**: Memory leaks, large datasets in memory, inefficient queries
**Diagnosis**:
```javascript
// Monitor memory usage
setInterval(() => {
    const memUsage = process.memoryUsage();
    console.log('Memory usage:', {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
    });
}, 60000);
```

**Solutions**:
1. Implement proper garbage collection
2. Add data pagination for large queries
3. Clear unused variables and connections
4. Scale horizontally if needed

### Database Query Bottlenecks
**Symptoms**: Slow API responses, database timeouts
**Causes**: Missing indexes, complex queries, high concurrent load
**Solutions**:
1. Analyze slow queries in Firebase Console
2. Add appropriate indexes
3. Implement query result caching
4. Optimize query structure and filtering

### UI Rendering Performance
**Symptoms**: Slow page loads, laggy interactions, browser freezing
**Causes**: Large DOM trees, inefficient JavaScript, heavy assets
**Solutions**:
1. Implement virtual scrolling for large lists
2. Add lazy loading for images and components
3. Minimize DOM manipulation
4. Optimize asset sizes and loading

---

## UI and Frontend Issues

### JavaScript Errors
**Error**: `Uncaught TypeError`, `Cannot read property`
**Causes**: Missing dependencies, API changes, browser compatibility
**Diagnosis**:
```javascript
// Add global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    // Send to error tracking service
});
```

**Solutions**:
1. Check browser console for specific errors
2. Verify API response structures
3. Add proper error handling
4. Test across different browsers

### Firebase Connection Issues
**Symptoms**: Real-time updates not working, authentication failures
**Causes**: Network connectivity, Firebase configuration, browser blocking
**Solutions**:
1. Check browser network tab for failed requests
2. Verify Firebase configuration objects
3. Test with different network connections
4. Check browser security settings

### UI Responsiveness Issues
**Symptoms**: Mobile interface problems, layout breaking
**Causes**: CSS media queries, viewport settings, touch interactions
**Solutions**:
1. Test on various device sizes
2. Add proper viewport meta tags
3. Implement responsive CSS frameworks
4. Test touch interactions on mobile devices

---

## Data Upload Problems

### CSV Parsing Errors
**Error**: `Invalid CSV format`, `Column mapping failed`
**Causes**: Malformed CSV, encoding issues, missing headers
**Diagnosis**:
```javascript
// Validate CSV structure
function validateCSV(csvContent) {
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',');
    
    if (headers.length < 3) {
        throw new Error('CSV must have at least 3 columns');
    }
    
    return { headers, rowCount: lines.length - 1 };
}
```

**Solutions**:
1. Validate CSV format before processing
2. Handle different text encodings (UTF-8, UTF-16)
3. Provide clear error messages for format issues
4. Add CSV template download option

### Large File Upload Issues
**Symptoms**: Upload timeouts, memory errors, incomplete uploads
**Causes**: File size limits, network timeouts, browser memory limits
**Solutions**:
1. Implement chunked file upload
2. Add progress indicators
3. Set appropriate timeout limits
4. Validate file size before upload

### Data Validation Failures
**Symptoms**: Import fails with validation errors
**Causes**: Missing required fields, invalid data formats, duplicates
**Solutions**:
1. Provide detailed validation error messages
2. Implement preview mode before final import
3. Add data cleaning suggestions
4. Allow partial imports with error reporting

---

## Scheduling Issues

### Slot Assignment Conflicts
**Symptoms**: Double-booked slots, scheduling failures
**Causes**: Race conditions, concurrent scheduling, data inconsistency
**Diagnosis**:
```javascript
// Check for slot conflicts
const conflictingSlots = await db.collection('slot_calendar')
    .where('slotId', '==', slotId)
    .where('status', '==', 'assigned')
    .get();

if (conflictingSlots.size > 1) {
    console.error('Slot conflict detected:', slotId);
}
```

**Solutions**:
1. Implement atomic slot assignment using transactions
2. Add slot validation before scheduling
3. Implement conflict detection and resolution
4. Use pessimistic locking for critical operations

### Rate Limiting Issues
**Symptoms**: Scheduling blocked, quota exceeded messages
**Causes**: Exceeded daily limits, incorrect rate calculations
**Solutions**:
1. Check current usage against limits
2. Implement proper rate limit tracking
3. Add queue system for rate-limited operations
4. Display clear quota information to users

### Multi-Channel Coordination Problems
**Symptoms**: Uncoordinated outreach timing, sequence breaks
**Causes**: Service failures, timing miscalculations, dependency issues
**Solutions**:
1. Implement sequence validation
2. Add dependency checking before scheduling
3. Create fallback scheduling logic
4. Monitor sequence execution completion

---

## Analytics and Reporting Issues

### Data Aggregation Errors
**Symptoms**: Incorrect analytics data, missing metrics
**Causes**: Data processing failures, timing issues, calculation errors
**Diagnosis**:
```javascript
// Verify analytics calculations
const totalContacts = await db.collection('outreach_sets')
    .where('customerId', '==', customerId)
    .get();

const analyticsDoc = await db.collection('analytics_summary')
    .doc(customerId)
    .get();

const calculatedTotal = totalContacts.size;
const storedTotal = analyticsDoc.data().totalContacts;

if (calculatedTotal !== storedTotal) {
    console.error('Analytics mismatch:', { calculated: calculatedTotal, stored: storedTotal });
}
```

**Solutions**:
1. Implement data consistency checks
2. Add analytics recalculation functions
3. Monitor analytics processing jobs
4. Implement audit trails for data changes

### Chart Rendering Issues
**Symptoms**: Charts not displaying, rendering errors
**Causes**: Data format issues, Chart.js problems, browser compatibility
**Solutions**:
1. Validate chart data format
2. Check Chart.js version compatibility
3. Add fallback displays for chart failures
4. Test across different browsers

### Export Functionality Problems
**Symptoms**: Export failures, incomplete data, format issues
**Causes**: Large datasets, memory limits, encoding problems
**Solutions**:
1. Implement streaming exports for large datasets
2. Add progress indicators for long exports
3. Validate data before export
4. Support multiple export formats

---

## System Monitoring

### Health Check Implementation
```javascript
// Comprehensive health check
app.get('/health', async (req, res) => {
    const checks = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        checks: {}
    };
    
    try {
        // Database connectivity
        await db.collection('system_test').doc('health').get();
        checks.checks.database = { status: 'healthy' };
    } catch (error) {
        checks.checks.database = { status: 'unhealthy', error: error.message };
        checks.status = 'unhealthy';
    }
    
    // Memory usage
    const memUsage = process.memoryUsage();
    const memoryStatus = memUsage.heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'warning';
    checks.checks.memory = { 
        status: memoryStatus, 
        usage: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB' 
    };
    
    // External APIs
    try {
        const phantomResponse = await fetch('https://phantombuster.com/api/v2/agents', {
            headers: { 'X-Phantombuster-Key': process.env.PHANTOMBUSTER_API_KEY },
            timeout: 5000
        });
        checks.checks.phantombuster = { 
            status: phantomResponse.ok ? 'healthy' : 'unhealthy' 
        };
    } catch (error) {
        checks.checks.phantombuster = { status: 'unhealthy', error: error.message };
    }
    
    res.status(checks.status === 'healthy' ? 200 : 503).json(checks);
});
```

### Performance Monitoring
```javascript
// Performance metrics collection
const performanceMetrics = {
    requestCount: 0,
    responseTimeSum: 0,
    errorCount: 0,
    activeRequests: 0
};

app.use((req, res, next) => {
    const startTime = Date.now();
    performanceMetrics.activeRequests++;
    
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        performanceMetrics.requestCount++;
        performanceMetrics.responseTimeSum += responseTime;
        performanceMetrics.activeRequests--;
        
        if (res.statusCode >= 400) {
            performanceMetrics.errorCount++;
        }
        
        // Log slow requests
        if (responseTime > 2000) {
            console.warn('Slow request:', {
                path: req.path,
                method: req.method,
                responseTime: responseTime,
                statusCode: res.statusCode
            });
        }
    });
    
    next();
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
    const avgResponseTime = performanceMetrics.requestCount > 0 
        ? Math.round(performanceMetrics.responseTimeSum / performanceMetrics.requestCount)
        : 0;
    
    const errorRate = performanceMetrics.requestCount > 0
        ? (performanceMetrics.errorCount / performanceMetrics.requestCount * 100).toFixed(2)
        : 0;
    
    res.json({
        requests: {
            total: performanceMetrics.requestCount,
            active: performanceMetrics.activeRequests,
            errors: performanceMetrics.errorCount,
            errorRate: errorRate + '%'
        },
        performance: {
            averageResponseTime: avgResponseTime + 'ms',
            uptime: process.uptime() + 's'
        }
    });
});
```

### Log Analysis
```javascript
// Structured logging for troubleshooting
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { 
        service: 'outreach-system',
        version: process.env.npm_package_version 
    },
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        }),
        new winston.transports.File({ 
            filename: 'error.log', 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: 'combined.log' 
        })
    ]
});

// Usage in application
logger.info('User login attempt', { userId, email, timestamp: new Date() });
logger.error('Database connection failed', { error: error.message, stack: error.stack });
logger.warn('Rate limit approaching', { userId, currentUsage, limit });
```

---

## Emergency Procedures

### System Outage Response
1. **Immediate Actions**:
   - Check system status dashboard
   - Verify external service status (Firebase, Railway, PhantomBuster)
   - Check recent deployments and changes
   - Switch to maintenance mode if necessary

2. **Communication**:
   - Notify stakeholders of outage
   - Update status page/communication channels
   - Provide regular updates on resolution progress

3. **Resolution Steps**:
   - Identify root cause using logs and monitoring
   - Implement fix or rollback to previous version
   - Verify system recovery
   - Conduct post-incident review

### Data Recovery Procedures
```javascript
// Emergency data backup
async function emergencyBackup(customerId) {
    const collections = [
        'outreach_sets',
        'campaigns', 
        'bdr_leaders',
        'slot_calendar',
        'linkedin_research'
    ];
    
    const backupData = {};
    
    for (const collection of collections) {
        const snapshot = await db.collection(collection)
            .where('customerId', '==', customerId)
            .get();
        
        backupData[collection] = [];
        snapshot.forEach(doc => {
            backupData[collection].push({
                id: doc.id,
                data: doc.data()
            });
        });
    }
    
    // Save backup to secure location
    const backupId = `emergency_backup_${Date.now()}`;
    await db.collection('emergency_backups').doc(backupId).set({
        customerId,
        data: backupData,
        createdAt: new Date(),
        type: 'emergency'
    });
    
    return backupId;
}
```

### Contact Information
- **System Administrator**: [admin-email]
- **Database Administrator**: [db-admin-email]  
- **Development Team**: [dev-team-slack]
- **Firebase Support**: Firebase Console Support
- **Railway Support**: Railway Platform Support
- **PhantomBuster Support**: support@phantombuster.com

### Escalation Matrix
1. **Level 1**: System alerts, automated monitoring
2. **Level 2**: On-call administrator notification
3. **Level 3**: Development team escalation
4. **Level 4**: Management and stakeholder notification
5. **Level 5**: External vendor support engagement

This troubleshooting guide provides comprehensive solutions for common issues and emergency procedures to maintain system reliability and performance.





















