// upload_installer.js — uploads a large file to GCS via resumable upload
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BUCKET   = 'healthcareitdatabase.firebasestorage.app';
const VERSION  = '1.3.17';
const FILENAME = `vFlok Hospital Dashboard-Setup-${VERSION}.exe`;
const SRC      = path.join(__dirname, 'public', 'vflok_app', 'dist', FILENAME);
const DEST     = `installers/${encodeURIComponent(FILENAME)}`;

const os = require('os');
const CONFIG_PATH = require('path').join(
  os.homedir(), '.config', 'configstore', 'firebase-tools.json'
);
const TOKEN = JSON.parse(require('fs').readFileSync(CONFIG_PATH, 'utf8')).tokens.access_token;

const stat   = fs.statSync(SRC);
const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
console.log(`Uploading ${FILENAME} (${sizeMB} MB) → gs://${BUCKET}/${DEST}`);

// Step 1 — initiate resumable upload
const initOpts = {
  hostname: 'storage.googleapis.com',
  path: `/upload/storage/v1/b/${encodeURIComponent(BUCKET)}/o?uploadType=resumable&name=${encodeURIComponent('installers/' + FILENAME)}`,
  method: 'POST',
  headers: {
    'Authorization':  `Bearer ${TOKEN}`,
    'Content-Type':   'application/json',
    'X-Upload-Content-Type': 'application/octet-stream',
    'X-Upload-Content-Length': stat.size,
  },
};

const initReq = https.request(initOpts, res => {
  const uploadUrl = res.headers.location;
  if (!uploadUrl) {
    console.error('No upload URL in response. Status:', res.statusCode);
    res.resume();
    return;
  }
  console.log('Resumable upload URL obtained. Starting upload...');

  // Step 2 — stream the file
  const url      = new URL(uploadUrl);
  const fileStream = fs.createReadStream(SRC);
  let uploaded   = 0;
  let lastPct    = 0;

  const upOpts = {
    hostname: url.hostname,
    path:     url.pathname + url.search,
    method:   'PUT',
    headers: {
      'Content-Type':   'application/octet-stream',
      'Content-Length': stat.size,
    },
  };

  const upReq = https.request(upOpts, upRes => {
    let body = '';
    upRes.on('data', d => body += d);
    upRes.on('end', () => {
      if (upRes.statusCode === 200 || upRes.statusCode === 201) {
        const obj = JSON.parse(body);
        console.log(`\n✅ Upload complete!`);
        console.log(`   GCS URL: https://storage.googleapis.com/${BUCKET}/installers/${encodeURIComponent(FILENAME)}`);
        console.log(`   Size: ${(parseInt(obj.size)/1024/1024).toFixed(1)} MB`);
      } else {
        console.error(`\n❌ Upload failed. Status: ${upRes.statusCode}`);
        console.error(body.slice(0, 500));
      }
    });
  });

  upReq.on('error', e => console.error('Upload error:', e.message));

  fileStream.on('data', chunk => {
    uploaded += chunk.length;
    const pct = Math.floor(uploaded / stat.size * 100);
    if (pct >= lastPct + 10) {
      lastPct = pct;
      process.stdout.write(`\r  Progress: ${pct}% (${(uploaded/1024/1024).toFixed(0)} / ${sizeMB} MB)`);
    }
  });

  fileStream.pipe(upReq);
});

initReq.on('error', e => console.error('Init error:', e.message));
initReq.end(JSON.stringify({ name: `installers/${FILENAME}`, contentType: 'application/octet-stream' }));
