const fs = require('fs');
const path = require('path');

// Function to format file size
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Function to determine category based on filename
function determineCategory(title) {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.includes('executive')) {
        return 'Executive Summary';
    } else if (lowerTitle.includes('modeling')) {
        return 'Modeling';
    } else if (lowerTitle.includes('opportunity')) {
        return 'Opportunity Analysis';
    } else if (lowerTitle.includes('plan')) {
        return 'Strategic Plan';
    } else if (lowerTitle.includes('overview')) {
        return 'Overview';
    } else if (lowerTitle.includes('unfinished') || lowerTitle.includes('draft')) {
        return 'Draft';
    }
    
    return 'Presentation';
}

// Function to scan slidedecks folder
function scanSlideDecksFolder(baseDir = 'slidedecks') {
    const decks = [];
    let counter = 0;
    
    // Check if base directory exists
    if (!fs.existsSync(baseDir)) {
        throw new Error('Slidedecks directory not found');
    }
    
    // Recursive function to scan directories
    function scanDirectory(dir, relativePath = '') {
        try {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const itemPath = path.join(dir, item);
                const stats = fs.statSync(itemPath);
                
                if (stats.isDirectory()) {
                    // Recursively scan subdirectories
                    scanDirectory(itemPath, path.join(relativePath, item));
                } else if (stats.isFile() && /\.(pptx?|pptm|PPTX?|PPTM)$/i.test(item)) {
                    // Found a PowerPoint file
                    const pathParts = relativePath.split(path.sep).filter(p => p);
                    const organization = pathParts[0] || 'Root';
                    const category = pathParts.length > 1 
                        ? pathParts.slice(1).join(' / ') 
                        : determineCategory(path.parse(item).name);
                    
                    decks.push({
                        id: `deck-${++counter}`,
                        title: path.parse(item).name,
                        organization: organization,
                        filename: item,
                        path: `kba/slidedecks/${relativePath ? relativePath + '/' : ''}${item}`,
                        size: formatBytes(stats.size),
                        date: stats.mtime.toISOString().split('T')[0], // YYYY-MM-DD format
                        category: category
                    });
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error);
        }
    }
    
    // Start scanning from the base directory
    scanDirectory(baseDir);
    
    // Get unique organizations
    const uniqueOrgs = new Set(decks.map(deck => deck.organization));
    
    // Sort decks by organization and title
    decks.sort((a, b) => {
        const orgCompare = a.organization.localeCompare(b.organization);
        if (orgCompare === 0) {
            return a.title.localeCompare(b.title);
        }
        return orgCompare;
    });
    
    return {
        success: true,
        decks: decks,
        count: decks.length,
        totalDecks: decks.length,
        totalOrganizations: uniqueOrgs.size,
        lastScanned: new Date().toISOString().replace('T', ' ').split('.')[0] // YYYY-MM-DD HH:MM:SS
    };
}

// Main execution
try {
    console.log('📁 Scanning slidedecks folder...');
    const result = scanSlideDecksFolder();
    
    // Write to JSON file
    const outputPath = 'slidedecks-data.json';
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    
    console.log(`✅ Successfully generated ${outputPath}`);
    console.log(`📊 Found ${result.totalDecks} slide decks from ${result.totalOrganizations} organizations`);
    console.log(`📅 Last scanned: ${result.lastScanned}`);
    
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
} 