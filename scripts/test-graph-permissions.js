#!/usr/bin/env node
/**
 * Test Meta Graph API permissions: pages_manage_engagement, instagram_business_manage_insights.
 *
 * Usage:
 *   1. Get an app access token (no user token needed):
 *      META_APP_ID=xxx META_APP_SECRET=xxx node scripts/test-graph-permissions.js
 *
 *   2. Debug a user/page token to see granted scopes:
 *      META_APP_ID=xxx META_APP_SECRET=xxx GRAPH_TEST_TOKEN=xxx node scripts/test-graph-permissions.js
 *
 * Loads .env from apps/web if present (optional).
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', 'apps', 'web', '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
        }
      }
      break;
    }
  }
}

loadEnv();

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const GRAPH_TEST_TOKEN = process.env.GRAPH_TEST_TOKEN;

async function main() {
  console.log('--- Meta Graph API permission test ---\n');

  if (!META_APP_ID || !META_APP_SECRET) {
    console.log('Set META_APP_ID and META_APP_SECRET (e.g. in apps/web/.env or env).');
    console.log('Optional: GRAPH_TEST_TOKEN = a user or page access token to debug.\n');
    process.exit(1);
  }

  // 1) App access token
  const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&grant_type=client_credentials`;
  console.log('1. Fetching app access token...');
  const tokenRes = await fetch(tokenUrl);
  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    console.log('   Error:', tokenData.error.message || JSON.stringify(tokenData.error));
    process.exit(1);
  }
  const appToken = tokenData.access_token;
  console.log('   OK (app token obtained)\n');

  // 2) Debug token if user provided one
  if (GRAPH_TEST_TOKEN) {
    console.log('2. Debug token (granted scopes):');
    const debugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${encodeURIComponent(GRAPH_TEST_TOKEN)}&access_token=${encodeURIComponent(appToken)}`;
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();
    if (debugData.error) {
      console.log('   Error:', debugData.error.message);
    } else {
      const info = debugData.data || {};
      console.log('   Valid:', info.is_valid);
      console.log('   Type:', info.type);
      if (info.scopes && info.scopes.length) {
        console.log('   Granted scopes:', info.scopes.join(', '));
        const want1 = 'pages_manage_engagement';
        const want2 = 'instagram_business_manage_insights';
        console.log('   Has', want1, ':', info.scopes.includes(want1) ? 'YES' : 'NO');
        console.log('   Has', want2, ':', info.scopes.includes(want2) ? 'YES' : 'NO');
      } else {
        console.log('   (no scopes in response)');
      }
    }
    console.log('');
  } else {
    console.log('2. Skip debug_token (set GRAPH_TEST_TOKEN to a user/page token to see granted scopes).\n');
  }

  // 3) Where to find these permissions in Meta dashboard
  console.log('3. Where to add these permissions in Meta for Developers:');
  console.log('   - pages_manage_engagement:');
  console.log('     App → App Review → Permissions and features. Search "pages_manage_engagement" or look for');
  console.log('     "Manage engagement with your Pages". Add it to your Facebook Login use case, then reconnect.');
  console.log('   - instagram_business_manage_insights:');
  console.log('     Used for Instagram Login (Connect with Instagram only). App → App Review → Permissions and features.');
  console.log('     Search "instagram_business_manage_insights" or "Read Instagram insights". For Instagram via');
  console.log('     Facebook Login the scope is instagram_manage_insights (different name, same idea).');
  console.log('');
  console.log('To see if a token has these scopes: set GRAPH_TEST_TOKEN to a user or page token (e.g. from');
  console.log('Graph API Explorer https://developers.facebook.com/tools/explorer or after connecting in your app).');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
