<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

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
                
                // Determine category based on filename if no subcategory
                if ($category === 'General') {
                    $title = pathinfo($item, PATHINFO_FILENAME);
                    $lowerTitle = strtolower($title);
                    
                    if (strpos($lowerTitle, 'executive') !== false) {
                        $category = 'Executive Summary';
                    } elseif (strpos($lowerTitle, 'modeling') !== false) {
                        $category = 'Modeling';
                    } elseif (strpos($lowerTitle, 'opportunity') !== false) {
                        $category = 'Opportunity Analysis';
                    } elseif (strpos($lowerTitle, 'plan') !== false) {
                        $category = 'Strategic Plan';
                    } elseif (strpos($lowerTitle, 'overview') !== false) {
                        $category = 'Overview';
                    } else {
                        $category = 'Presentation';
                    }
                }
                
                // Create deck object
                static $counter = 0;
                $deck = [
                    'id' => 'deck-' . (++$counter),
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
    
    // Create the data structure
    $data = [
        'success' => true,
        'decks' => $decks,
        'count' => count($decks),
        'totalDecks' => count($decks),
        'totalOrganizations' => count(array_unique(array_column($decks, 'organization'))),
        'lastScanned' => date('Y-m-d H:i:s')
    ];
    
    // Write to JSON file
    $jsonContent = json_encode($data, JSON_PRETTY_PRINT);
    if (file_put_contents(__DIR__ . '/slidedecks-data.json', $jsonContent) === false) {
        throw new Exception('Failed to write JSON file');
    }
    
    // Return success response
    echo json_encode([
        'success' => true,
        'message' => 'Slidedecks data regenerated successfully',
        'count' => count($decks),
        'totalOrganizations' => count(array_unique(array_column($decks, 'organization'))),
        'lastScanned' => $data['lastScanned']
    ]);
    
} catch (Exception $e) {
    // Return error response
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'count' => 0
    ]);
}
?> 