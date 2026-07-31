// refresh_token.js — refreshes the Firebase access token and saves it back
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const config      = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const refreshToken = config.tokens.refresh_token;

if (!refreshToken) { console.error('No refresh_token found'); process.exit(1); }

const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8vu8WTIS5qAm9wJFn`;

const opts = {
  hostname: 'oauth2.googleapis.com',
  path: '/token',
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
};

const req = https.request(opts, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const tok = JSON.parse(data);
    if (!tok.access_token) { console.error('Failed:', data); process.exit(1); }
    config.tokens.access_token = tok.access_token;
    if (tok.refresh_token) config.tokens.refresh_token = tok.refresh_token;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('✅ Token refreshed and saved.');
    console.log('access_token:', tok.access_token.slice(0, 40) + '...');
  });
});
req.on('error', e => console.error(e.message));
req.write(body);
req.end();
