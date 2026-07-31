const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
const PORT = 3002; // Different port from the slidedecks scanner

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// MIME types for PowerPoint files
const mimeTypes = {
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'pptm': 'application/vnd.ms-powerpoint.presentation.macroEnabled.12'
};

// Regenerate slidedecks data endpoint
app.post('/regenerate', (req, res) => {
    console.log('🔄 Regenerating slidedecks data...');
    
    exec('node generate-slidedecks-json.js', (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Regeneration failed:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
        
        if (stderr) {
            console.warn('⚠️ Regeneration warnings:', stderr);
        }
        
        console.log('✅ Regeneration output:', stdout);
        
        // Try to read the updated JSON file to get counts
        try {
            const jsonData = fs.readFileSync('slidedecks-data.json', 'utf8');
            const data = JSON.parse(jsonData);
            
            res.json({
                success: true,
                message: 'Slidedecks data regenerated successfully',
                count: data.count || 0,
                totalOrganizations: data.totalOrganizations || 0,
                lastScanned: data.lastScanned
            });
        } catch (readError) {
            console.error('❌ Error reading regenerated file:', readError);
            res.json({
                success: true,
                message: 'Regeneration completed but could not read counts',
                count: 0
            });
        }
    });
});

// Download endpoint
app.get('/download', (req, res) => {
    const file = req.query.file;
    
    // Security validation
    if (!file || file.includes('..') || !file.startsWith('slidedecks/')) {
        return res.status(400).send('Invalid file request');
    }
    
    // Construct file path
    const filePath = path.join(__dirname, file);
    
    // Check if file exists
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return res.status(404).send('File not found');
    }
    
    // Get file info
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;
    const fileExtension = path.extname(fileName).toLowerCase().substring(1);
    
    // Get MIME type
    const mimeType = mimeTypes[fileExtension] || 'application/octet-stream';
    
    // Sanitize filename
    const safeFileName = fileName.replace(/[^a-zA-Z0-9\-_\. ]/g, '');
    
    // Set download headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Transfer-Encoding', 'binary');
    res.setHeader('Cache-Control', 'must-revalidate, post-check=0, pre-check=0');
    res.setHeader('Pragma', 'public');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    
    console.log(`📥 Serving download: ${fileName} (${fileSize} bytes)`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
        console.error('Error streaming file:', error);
        if (!res.headersSent) {
            res.status(500).send('Error reading file');
        }
    });
    
    fileStream.pipe(res);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'KBA Download Server' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🔒 Secure download server running on http://localhost:${PORT}`);
    console.log(`📥 Download endpoint: http://localhost:${PORT}/download?file=slidedecks/path/to/file.pptx`);
    console.log(`🔄 Regenerate endpoint: http://localhost:${PORT}/regenerate`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Download server shutting down...');
    process.exit(0);
}); 