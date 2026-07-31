<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    // Get the posted data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data) {
        throw new Exception('Invalid JSON data');
    }
    
    // Validate the data structure
    if (!isset($data['decks']) || !is_array($data['decks'])) {
        throw new Exception('Invalid data structure');
    }
    
    // Write to JSON file
    $jsonContent = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (file_put_contents(__DIR__ . '/slidedecks-data.json', $jsonContent) === false) {
        throw new Exception('Failed to write JSON file');
    }
    
    // Return success response
    echo json_encode([
        'success' => true,
        'message' => 'Data saved successfully',
        'count' => count($data['decks']),
        'file' => 'slidedecks-data.json'
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?> 