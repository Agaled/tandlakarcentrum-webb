<?php
declare(strict_types=1);

/***************************************************
 * muntra-proxy.php – vidarebefordrar till Muntra API
 * och ser till att frontend ALLTID får JSON.
 ***************************************************/
const MUNTRA_BASE = 'https://app.testing.muntra.com/api';     // justera om din bas-URL är annan
const API_KEY     = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjI5ZmRhYzA2ZjQxOTEzOTkzNTA3N2E2YzhhNzE4ZGY1YzM2MTYxZWFmZjc3N2I0YzE2YWY1NzNlZDBlYWRmYTQ5Y2U1NTc2ODMzOWJlNmEyIn0.eyJhdWQiOiIxIiwianRpIjoiMjlmZGFjMDZmNDE5MTM5OTM1MDc3YTZjOGE3MThkZjVjMzYxNjFlYWZmNzc3YjRjMTZhZjU3M2VkMGVhZGZhNDljZTU1NzY4MzM5YmU2YTIiLCJpYXQiOjE3NTgwNDU0ODIsIm5iZiI6MTc1ODA0NTQ4MiwiZXhwIjoxNzg5NTgxNDgyLCJzdWIiOiIyNjQ0Iiwic2NvcGVzIjpbInBlcnNvbmFsIl19.KrufRz468xIhcopIPjb_uPty6PhLs0yhlonIN-6pNpGKcVOfuufyHcA6Z7Dnnh2QE2fFfzKY-9IRDVKeHjj2Cl5cAz-m4zPibLctqHc8x0o26rR1lPPfGSm8x3tYsxxN2VIX-cK7BI44CDXUhXCgrWui6RM1qYdy6GLImIuF8UZ_jKXNjkKGRS1PQQcHbqRTyR1tAlAbhvJmf_qo1rNg_qjyAPC4nRKIEr3t8NBVBfPnwd3GaPo2A-lUw-yrC2VfNyV9Pe_svdyeKaUwfPgas-LfTIJ5m1JSmdhnQxJcoMqcsU_uKhmWt3BxcBlWTriGpUfDZFHhhompEZCEMzhYL4QOt4gXAjagevkmQBBOzOVyRzCdL1RiptLwpIY9dwNa2THc_bcfy0joxR-LwkjFHq0mgfgTkNYcquPUqvCmgq6JLgFBQ0-TUCsgmo3bIywpOUkABZiK_PSMMU0Q1FZ_Qr9c5qXiVxxQq42XNnMQFmy3psnGiMtQoo6W8ZAx1lL0BaDcLBa9KSRvUzbIW1lKh5SalYWbfytGxwZD0hUW6BVAizECzbaESTkJkNZLfqtMeI7mwMcNVvuph5MJDknYNzaU70jwZf2Fvocpc2KP0yUr6Adk8cepi8Yj3RMim6RaSaB3TBFLzZxtNywc0F2xdP1hlCvxZy5qQ5XagyWstIs';         // <-- BYT UT

// --- CORS ---
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// --- Hjälpare ---
function out_json($payload, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=UTF-8');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}
function json_error(int $code, string $msg, $extra = null): void {
  out_json(['error' => $msg, 'details' => $extra], $code);
}

// --- Parametrar ---
$path  = $_GET['path'] ?? '';
$debug = isset($_GET['debug']);
if (!$path) json_error(400, 'Saknar "path"');

// bygg querystring av alla GET-parametrar utom "path" och "debug"
$params = $_GET;
unset($params['path'], $params['debug']);
$query = http_build_query($params);

// slutlig URL
$url = rtrim(MUNTRA_BASE, '/') . '/' . ltrim($path, '/');
if ($query) $url .= (strpos($url, '?') === false ? '?' : '&') . $query;

// --- cURL mot Muntra ---
$ch = curl_init($url);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, $raw);
}

$headers = [
  // Tillåt JSON på båda varianterna
  'Accept: application/json, application/vnd.api+json',
  'Content-Type: application/json',
  'Authorization: Bearer ' . API_KEY,
];

curl_setopt_array($ch, [
  CURLOPT_HTTPHEADER     => $headers,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HEADER         => true,
  CURLOPT_FOLLOWLOCATION => false,
  CURLOPT_TIMEOUT        => 25,
]);

$response = curl_exec($ch);
if ($response === false) {
  json_error(502, 'Kunde inte nå Muntra', curl_error($ch));
}

$status     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$rawHeaders = substr($response, 0, $headerSize);
$body       = substr($response, $headerSize);
curl_close($ch);

// Försök tolka Muntras svar som JSON
$decoded = null;
if ($body !== '' && $body !== false) {
  $decoded = json_decode($body, true);
}

// Debug-läge: skicka med info om vad vi slog på
$meta = [
  'method'  => $method,
  'url'     => $url,
  'status'  => $status,
];

// Om Muntra gav valid JSON, skicka vidare exakt den payloaden men
// bädda in debug-info om användaren bett om det.
if ($decoded !== null && json_last_error() === JSON_ERROR_NONE) {
  if ($debug) {
    out_json(['debug' => $meta, 'data_raw' => $decoded], $status);
  }
  out_json($decoded, $status);
}

// Om svaret var tomt eller inte-JSON, paketera som JSON-fel
$errPayload = [
  'error'   => 'Upstream svarade inte med giltig JSON',
  'status'  => $status,
  'debug'   => $meta,
  'headers' => $debug ? $rawHeaders : null,
  'body'    => $body, // kan vara tom sträng
];
out_json($errPayload, $status >= 400 ? $status : 502);
