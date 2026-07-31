// cleanup_hosting.js — deletes old Firebase Hosting releases to free quota
const https = require('https');
const os    = require('os');
const path  = require('path');

const PROJECT = 'healthcareitdatabase';
const SITE    = 'careluminate-b5f76';
const KEEP    = 1; // keep the N most recent releases

const CONFIG_PATH = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const TOKEN = JSON.parse(require('fs').readFileSync(CONFIG_PATH, 'utf8')).tokens.access_token;

function apiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'firebasehosting.googleapis.com',
      path:     apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':  'application/json',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log(`Fetching releases for site: ${SITE}`);
  const res = await apiRequest('GET', `/v1beta1/sites/${SITE}/releases?pageSize=50`);
  if (res.status !== 200) {
    console.error('Failed to list releases:', res.body);
    process.exit(1);
  }

  const releases = res.body.releases || [];
  console.log(`Found ${releases.length} releases`);

  // Sort by createTime descending (newest first)
  releases.sort((a, b) => new Date(b.releaseTime) - new Date(a.releaseTime));

  const toDelete = releases.slice(KEEP);
  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  console.log(`Keeping ${KEEP} newest, deleting ${toDelete.length} older releases...`);

  for (const release of toDelete) {
    const versionName = release.version?.name;
    if (!versionName) { console.log('  Skipping release with no version name'); continue; }

    // Extract version ID from name like "sites/SITE/versions/VER_ID"
    const versionId = versionName.split('/').pop();
    const deletePath = `/v1beta1/sites/${SITE}/versions/${versionId}`;
    console.log(`  Deleting version: ${versionId} (release ${release.releaseTime})`);

    const delRes = await apiRequest('DELETE', deletePath);
    if (delRes.status === 200 || delRes.status === 204) {
      console.log(`    ✅ Deleted`);
    } else {
      console.log(`    ⚠️  Status ${delRes.status}:`, JSON.stringify(delRes.body).slice(0, 200));
    }
    // brief pause to avoid rate-limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone! Re-run deploy_hosting.js now.');
}

main().catch(e => { console.error(e); process.exit(1); });
