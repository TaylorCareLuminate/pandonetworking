<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Set error reporting
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Function to get file size in human readable format
function formatFileSize($bytes) {
    if ($bytes < 1024) return $bytes . ' B';
    if ($bytes < 1048576) return round($bytes / 1024, 1) . ' KB';
    return round($bytes / 1048576, 1) . ' MB';
}

// Function to scan directory recursively
function scanDirectory($dir, $baseDir = '') {
    $decks = [];
    
    if (!is_dir($dir)) {
        return $decks;
    }
    
    $items = scandir($dir);
    
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        
        $path = $dir . '/' . $item;
        
        if (is_dir($path)) {
            // Recursively scan subdirectories
            $subDecks = scanDirectory($path, $baseDir . $item . '/');
            $decks = array_merge($decks, $subDecks);
        } else {
            // Check if it's a PowerPoint file
            $extension = strtolower(pathinfo($item, PATHINFO_EXTENSION));
            if (in_array($extension, ['ppt', 'pptx', 'pptm'])) {
                // Extract organization from folder structure
                $pathParts = explode('/', trim($baseDir, '/'));
                $organization = !empty($pathParts[0]) ? $pathParts[0] : 'Unknown';
                $category = count($pathParts) > 1 ? implode(' / ', array_slice($pathParts, 1)) : 'General';
                
                // Create deck object
                $deck = [
                    'id' => md5($baseDir . $item),
                    'title' => pathinfo($item, PATHINFO_FILENAME),
                    'filename' => $item,
                    'organization' => $organization,
                    'category' => $category,
                    'path' => 'kba/slidedecks/' . $baseDir . $item,
                    'size' => formatFileSize(filesize($path)),
                    'date' => date('Y-m-d', filemtime($path))
                ];
                
                $decks[] = $deck;
            }
        }
    }
    
    return $decks;
}

try {
    // Define the slidedecks directory
    $slideDeckDir = __DIR__ . '/slidedecks';
    
    // Check if directory exists
    if (!is_dir($slideDeckDir)) {
        throw new Exception('Slide decks directory not found');
    }
    
    // Scan the directory
    $decks = scanDirectory($slideDeckDir);
    
    // Sort decks by organization and then by title
    usort($decks, function($a, $b) {
        $orgCompare = strcmp($a['organization'], $b['organization']);
        if ($orgCompare === 0) {
            return strcmp($a['title'], $b['title']);
        }
        return $orgCompare;
    });
    
    // Return success response
    echo json_encode([
        'success' => true,
        'decks' => $decks,
        'count' => count($decks),
        'lastScanned' => date('Y-m-d H:i:s')
    ]);
    
} catch (Exception $e) {
    // Return error response
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'decks' => [],
        'count' => 0
    ]);
}
?> 