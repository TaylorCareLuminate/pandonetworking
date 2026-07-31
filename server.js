/**
 * Railway Server - PensionPro API Proxy
 * 
 * This server acts as a proxy between the frontend and PensionPro API.
 * It securely handles authentication using environment variables.
 * 
 * Environment Variables Required (set in Railway):
 * - pensionproapi: Your PensionPro API Key
 * - pensionpro_name: Your PensionPro Username
 * - pensionpro_pass: Your PensionPro Password (optional, not used in API auth)
 * - PORT: Railway automatically sets this
 */

const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Configuration
const PORT = process.env.PORT || 3000;
const PENSIONPRO_API_BASE = 'https://api.pensionpro.com/v2';

// Get configuration from environment variables
function getPensionProConfig() {
    const apiKey = process.env.pensionproapi;
    const username = process.env.pensionpro_name;
    
    if (!apiKey || !username) {
        throw new Error('Missing required environment variables: pensionproapi or pensionpro_name');
    }
    
    // PensionPro uses APIKey|Username format for authentication
    return {
        authHeader: `${apiKey}|${username}`,
        apiKey,
        username
    };
}

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'PensionPro API Proxy',
        endpoints: [
            '/api/pensionpro/clients',
            '/api/pensionpro/config'
        ]
    });
});

// Configuration endpoint (returns non-sensitive config info)
app.get('/api/pensionpro/config', (req, res) => {
    try {
        const config = getPensionProConfig();
        res.json({
            success: true,
            configured: true,
            username: config.username,
            apiBaseUrl: PENSIONPRO_API_BASE
        });
    } catch (error) {
        console.error('Configuration error:', error);
        res.status(500).json({
            success: false,
            configured: false,
            error: 'Configuration missing or invalid. Please check Railway environment variables.'
        });
    }
});

// PensionPro API Proxy - Get Clients
app.get('/api/pensionpro/clients', async (req, res) => {
    console.log('📥 Request: Fetch PensionPro clients');
    console.log('Query params:', req.query);
    
    try {
        const config = getPensionProConfig();
        
        // Build query string from request parameters
        const queryParams = new URLSearchParams();
        
        // Forward all query parameters to PensionPro API
        Object.keys(req.query).forEach(key => {
            queryParams.append(key, req.query[key]);
        });
        
        const url = `${PENSIONPRO_API_BASE}/clients${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        console.log('🔗 Calling PensionPro API:', url);
        
        // Make request to PensionPro API
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': config.authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        console.log('📊 PensionPro API Response Status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ PensionPro API Error:', errorText);
            
            return res.status(response.status).json({
                success: false,
                error: `PensionPro API Error: ${response.status} ${response.statusText}`,
                details: errorText
            });
        }
        
        const data = await response.json();
        console.log(`✅ Successfully fetched ${Array.isArray(data) ? data.length : 1} client(s)`);
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// PensionPro API Proxy - Get Single Client by ID
app.get('/api/pensionpro/clients/:clientId', async (req, res) => {
    console.log('📥 Request: Fetch PensionPro client by ID:', req.params.clientId);
    
    try {
        const config = getPensionProConfig();
        const clientId = req.params.clientId;
        
        // Build query string from request parameters
        const queryParams = new URLSearchParams();
        Object.keys(req.query).forEach(key => {
            queryParams.append(key, req.query[key]);
        });
        
        const url = `${PENSIONPRO_API_BASE}/clients/${clientId}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        console.log('🔗 Calling PensionPro API:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': config.authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        console.log('📊 PensionPro API Response Status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ PensionPro API Error:', errorText);
            
            return res.status(response.status).json({
                success: false,
                error: `PensionPro API Error: ${response.status} ${response.statusText}`,
                details: errorText
            });
        }
        
        const data = await response.json();
        console.log(`✅ Successfully fetched client ${clientId}`);
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// PensionPro API Proxy - Get Plans
app.get('/api/pensionpro/plans', async (req, res) => {
    console.log('📥 Request: Fetch PensionPro plans');
    
    try {
        const config = getPensionProConfig();
        
        const queryParams = new URLSearchParams();
        Object.keys(req.query).forEach(key => {
            queryParams.append(key, req.query[key]);
        });
        
        const url = `${PENSIONPRO_API_BASE}/plans${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        console.log('🔗 Calling PensionPro API:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': config.authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ PensionPro API Error:', errorText);
            
            return res.status(response.status).json({
                success: false,
                error: `PensionPro API Error: ${response.status} ${response.statusText}`,
                details: errorText
            });
        }
        
        const data = await response.json();
        console.log(`✅ Successfully fetched ${Array.isArray(data) ? data.length : 1} plan(s)`);
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// PensionPro API Proxy - Get Employer Data
app.get('/api/pensionpro/employerdata', async (req, res) => {
    console.log('📥 Request: Fetch PensionPro employer data');
    
    try {
        const config = getPensionProConfig();
        
        const queryParams = new URLSearchParams();
        Object.keys(req.query).forEach(key => {
            queryParams.append(key, req.query[key]);
        });
        
        const url = `${PENSIONPRO_API_BASE}/employerdata${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        console.log('🔗 Calling PensionPro API:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': config.authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ PensionPro API Error:', errorText);
            
            return res.status(response.status).json({
                success: false,
                error: `PensionPro API Error: ${response.status} ${response.statusText}`,
                details: errorText
            });
        }
        
        const data = await response.json();
        console.log(`✅ Successfully fetched employer data`);
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Generic PensionPro API Proxy - for any endpoint
app.get('/api/pensionpro/*', async (req, res) => {
    console.log('📥 Request: Generic PensionPro API call');
    
    try {
        const config = getPensionProConfig();
        
        // Extract the path after /api/pensionpro/
        const apiPath = req.params[0];
        
        const queryParams = new URLSearchParams();
        Object.keys(req.query).forEach(key => {
            queryParams.append(key, req.query[key]);
        });
        
        const url = `${PENSIONPRO_API_BASE}/${apiPath}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        console.log('🔗 Calling PensionPro API:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': config.authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ PensionPro API Error:', errorText);
            
            return res.status(response.status).json({
                success: false,
                error: `PensionPro API Error: ${response.status} ${response.statusText}`,
                details: errorText
            });
        }
        
        const data = await response.json();
        console.log(`✅ Successfully fetched data from ${apiPath}`);
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Google Photos media proxy (Picker API baseUrl requires Authorization; browsers block direct fetch)
app.options('/api/gphotos/media', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Range');
    res.status(204).end();
});

app.get('/api/gphotos/media', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');

    const rawUrl = req.query.url;
    const token = req.query.token;

    if (!rawUrl || !token) {
        res.status(400).json({ error: 'Missing url or token query parameters' });
        return;
    }

    let mediaUrl;
    try {
        mediaUrl = decodeURIComponent(rawUrl);
    } catch {
        res.status(400).json({ error: 'Invalid url parameter' });
        return;
    }

    if (!mediaUrl.startsWith('https://lh3.googleusercontent.com/')) {
        res.status(400).json({ error: 'Invalid media host' });
        return;
    }

    try {
        const upstreamHeaders = { Authorization: `Bearer ${token}` };
        if (req.headers.range) upstreamHeaders.Range = req.headers.range;

        const upstream = await fetch(mediaUrl, { headers: upstreamHeaders });

        res.status(upstream.status);
        const passHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
        for (const name of passHeaders) {
            const value = upstream.headers.get(name);
            if (value) res.set(name, value);
        }

        if (!upstream.ok) {
            res.send(await upstream.text());
            return;
        }

        if (upstream.body) {
            Readable.fromWeb(upstream.body).pipe(res);
        } else {
            res.end();
        }
    } catch (error) {
        console.error('Google Photos proxy error:', error);
        if (!res.headersSent) {
            res.status(502).json({ error: error.message });
        }
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.url} not found`
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🚀 PensionPro API Proxy Server Started - v1.0.1');
    console.log('='.repeat(60));
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
    console.log(`🔗 PensionPro API: ${PENSIONPRO_API_BASE}`);
    console.log('');
    console.log('📋 Available Endpoints:');
    console.log('  GET  /health                          - Health check');
    console.log('  GET  /api/pensionpro/config           - Configuration info');
    console.log('  GET  /api/pensionpro/clients          - Get all clients');
    console.log('  GET  /api/pensionpro/clients/:id      - Get single client');
    console.log('  GET  /api/pensionpro/plans            - Get all plans');
    console.log('  GET  /api/pensionpro/employerdata     - Get employer data');
    console.log('  GET  /api/pensionpro/*                - Generic proxy');
    console.log('  GET  /api/gphotos/media               - Google Photos video proxy');
    console.log('');
    console.log('🔐 Authentication: Using environment variables');
    console.log('  - pensionproapi: ' + (process.env.pensionproapi ? '✓ Set' : '✗ Not set'));
    console.log('  - pensionpro_name: ' + (process.env.pensionpro_name ? '✓ Set' : '✗ Not set'));
    console.log('');
    console.log('🌍 CORS: Enabled for all origins');
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 SIGINT signal received: closing HTTP server');
    process.exit(0);
});

