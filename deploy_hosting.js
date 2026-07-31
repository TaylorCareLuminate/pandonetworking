#!/usr/bin/env node
'use strict';

/**
 * deploy_hosting.js
 *
 * Manual Firebase Hosting deploy that uses Node.js's built-in https module
 * (HTTP/1.1) instead of the Firebase CLI's undici/fetch (HTTP/2).
 *
 * Workaround for the Firebase CLI bug on Node.js v22+ where uploads to
 * upload-firebasehosting.googleapis.com hang indefinitely.
 *
 * Usage:
 *   node deploy_hosting.js
 */

const https    = require('https');
const fs       = require('fs');
const path     = require('path');
const zlib     = require('zlib');
const crypto   = require('crypto');
const os       = require('os');

// ── Config ─────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(
  os.homedir(),
  '.config', 'configstore', 'firebase-tools.json'
);
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const TOKEN   = config.tokens.access_token;

const SITE_ID  = 'careluminate-b5f76';
const ROOT_DIR = path.resolve(__dirname);

// ── Ignore patterns (mirrors .firebaseignore + firebase.json ignores) ───────
const IGNORE_PATTERNS = [
  /\.(ps1|sh|exe|dll|cache|download|bat|cmd|R|php|py|backup)$/i,
  /\.(xlsx|xls|pptx|ppt|docx|doc|pdf|zip|7z|tar|gz|db|sqlite|wasm)$/i,
  /[/\\](node_modules)[/\\]/,
  /[/\\]\.bin[/\\]/,
  /[/\\]\.firebase([/\\]|$)/,
  /[/\\]\.git([/\\]|$)/,
  /[/\\](public)[/\\](vflok_app)[/\\]/,
  /[/\\](public)[/\\](downloads)[/\\]/,
  /[/\\](railway-backend)[/\\]/,
  /[/\\](sandbox)[/\\]/,
  /[/\\](temp)[/\\]/,
  /[/\\](kba)[/\\]/,
  /[/\\](physiciangroups)[/\\]/,
  /[/\\](examples)[/\\]/,
  /\.(asar|node|blockmap|map|pdb|log)$/i,
  /firebase\.json$/,
  /deploy_hosting\.js$/,
  /regenerate_manifest\.js$/,
  /[/\\]\.[^/\\]+/,
];

function shouldIgnore(filePath) {
  const rel = filePath.replace(ROOT_DIR, '').replace(/\\/g, '/');
  return IGNORE_PATTERNS.some(p => p.test(rel));
}

function collectFiles(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (shouldIgnore(full)) continue;
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) collectFiles(full, results);
    else results.push(full);
  }
  return results;
}

function gzipSync(buf) {
  return zlib.gzipSync(buf, { level: 9 });
}
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function httpsReq(options, body) {
  return new Promise((resolve, reject) => {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${TOKEN}`;
    if (body && !options.headers['Content-Type'])
      options.headers['Content-Type'] = 'application/json';
    const bodyBuf = body
      ? (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
      : null;
    if (bodyBuf) options.headers['Content-Length'] = bodyBuf.length;

    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function main() {
  console.log('=== Firebase Hosting Deploy (HTTP/1.1 mode) ===\n');

  console.log('Regenerating Connect analysis manifest...');
  require('./connect/connect_analysis/regenerate_manifest.js')
    .regenerate(path.join(ROOT_DIR, 'connect', 'connect_analysis'));
  console.log('');

  console.log('Scanning files...');
  const allFiles = collectFiles(ROOT_DIR);
  console.log(`  ${allFiles.length} files found\n`);

  console.log('Hashing files...');
  const filesMap  = {};
  const gzipCache = {};
  for (const f of allFiles) {
    const webPath = f.replace(ROOT_DIR, '').replace(/\\/g, '/');
    const content = fs.readFileSync(f);
    const gz      = gzipSync(content);
    const hash    = sha256(gz);
    filesMap[webPath] = hash;
    if (!gzipCache[hash]) gzipCache[hash] = gz;
  }
  console.log(`  ${Object.keys(filesMap).length} files hashed\n`);

  console.log('Creating hosting version...');
  const createRes = await httpsReq({
    hostname: 'firebasehosting.googleapis.com',
    path: `/v1beta1/sites/${SITE_ID}/versions`,
    method: 'POST',
  }, '{}');
  if (createRes.status !== 200) { console.error('Create failed:', createRes.body); process.exit(1); }
  const versionName = createRes.body.name;
  const versionId   = versionName.split('/').pop();
  console.log(`  Version: ${versionId}\n`);

  console.log('Populating file manifest...');
  const popRes = await httpsReq({
    hostname: 'firebasehosting.googleapis.com',
    path: `/v1beta1/sites/${SITE_ID}/versions/${versionId}:populateFiles`,
    method: 'POST',
  }, JSON.stringify({ files: filesMap }));
  if (popRes.status !== 200) { console.error('PopulateFiles failed:', popRes.body); process.exit(1); }
  const requiredHashes = popRes.body.uploadRequiredHashes || [];
  console.log(`  ${requiredHashes.length} new files to upload\n`);

  for (let i = 0; i < requiredHashes.length; i++) {
    const hash = requiredHashes[i];
    const gz   = gzipCache[hash];
    if (!gz) { console.warn(`  [WARN] No content for hash ${hash}`); continue; }
    console.log(`  Uploading [${i + 1}/${requiredHashes.length}] ${hash.substring(0, 12)}... (${(gz.length / 1024).toFixed(1)} KB)`);
    const upRes = await httpsReq({
      hostname: 'upload-firebasehosting.googleapis.com',
      path: `/upload/sites/${SITE_ID}/versions/${versionId}/files/${hash}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': gz.length },
    }, gz);
    if (upRes.status !== 200) { console.error(`  Upload failed (${upRes.status}):`, upRes.body); process.exit(1); }
    console.log(`  ✓ Uploaded`);
  }

  console.log('Finalizing...');
  const finalRes = await httpsReq({
    hostname: 'firebasehosting.googleapis.com',
    path: `/v1beta1/sites/${SITE_ID}/versions/${versionId}?updateMask=status`,
    method: 'PATCH',
  }, JSON.stringify({ status: 'FINALIZED' }));
  if (finalRes.status !== 200) { console.error('Finalize failed:', finalRes.body); process.exit(1); }

  console.log('Creating release...');
  const relRes = await httpsReq({
    hostname: 'firebasehosting.googleapis.com',
    path: `/v1beta1/sites/${SITE_ID}/releases?versionName=${encodeURIComponent(versionName)}`,
    method: 'POST',
  }, '{}');
  if (relRes.status !== 200) { console.error('Release failed:', relRes.body); process.exit(1); }

  console.log(`\n✅ Deploy complete — https://${SITE_ID}.web.app`);
  console.log(`   Release: ${relRes.body.name}`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
