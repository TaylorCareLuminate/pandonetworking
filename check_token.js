const fs   = require('fs');
const path = require('path');
const os   = require('os');
const CONFIG_PATH = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
console.log('Keys in tokens:', Object.keys(config.tokens || {}));
console.log('client_id:', config.tokens?.client_id);
console.log('client_secret exists:', !!config.tokens?.client_secret);
console.log('token_type:', config.tokens?.token_type);
// Show first 20 chars of access token to check if it changed
console.log('access_token prefix:', config.tokens?.access_token?.slice(0, 30));
