<?php
// Secure file download handler for KBA slide decks
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

// Get the requested file path
$file = isset($_GET['file']) ? $_GET['file'] : '';

// Security: Only allow files from the slidedecks directory
if (empty($file) || strpos($file, '..') !== false || strpos($file, 'slidedecks/') !== 0) {
    http_response_code(400);
    die('Invalid file request');
}

// Construct the full file path
$filePath = __DIR__ . '/' . $file;

// Check if file exists
if (!file_exists($filePath) || !is_file($filePath)) {
    http_response_code(404);
    die('File not found');
}

// Get file info
$fileName = basename($filePath);
$fileSize = filesize($filePath);
$fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

// Define MIME types for PowerPoint files
$mimeTypes = [
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'pptm' => 'application/vnd.ms-powerpoint.presentation.macroEnabled.12'
];

// Get the appropriate MIME type
$mimeType = isset($mimeTypes[$fileExtension]) ? $mimeTypes[$fileExtension] : 'application/octet-stream';

// Sanitize filename for download
$safeFileName = preg_replace('/[^a-zA-Z0-9\-_\. ]/', '', $fileName);

// Set headers for secure download
header('Content-Type: ' . $mimeType);
header('Content-Disposition: attachment; filename="' . $safeFileName . '"');
header('Content-Length: ' . $fileSize);
header('Content-Transfer-Encoding: binary');
header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
header('Pragma: public');
header('Expires: 0');

// Prevent execution of any embedded scripts
header('Content-Security-Policy: default-src \'none\'; sandbox');

// Clear any previous output
if (ob_get_level()) {
    ob_end_clean();
}

// Read and output the file
$handle = fopen($filePath, 'rb');
if ($handle === false) {
    http_response_code(500);
    die('Error reading file');
}

while (!feof($handle)) {
    echo fread($handle, 8192);
    flush();
}

fclose($handle);
exit;
?> 