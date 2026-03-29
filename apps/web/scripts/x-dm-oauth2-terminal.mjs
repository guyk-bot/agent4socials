#!/usr/bin/env node
/**
 * One-shot: open browser for X login, get user token, fetch DMs, print to terminal.
 * Requires: TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET
 * Before first run: In X Developer Portal → your app → User authentication settings
 *   → Callback URI: add http://localhost:3456/callback → Save.
 */
import http from 'http';
import https from 'https';
import { exec } from 'child_process';

const PORT = parseInt(process.env.PORT || '3456', 10);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = 'tweet.read tweet.write users.read dm.read dm.write offline.access';
const CODE_VERIFIER = 'challenge';

const clientId = process.env.TWITTER_CLIENT_ID?.trim();
const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim();
if (!clientId || !clientSecret) {
  console.error('Set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET, then run again.');
  process.exit(1);
}

let server;
const codePromise = new Promise((resolve, reject) => {
  const authUrl = `https://twitter.com/i/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPE)}&state=term&code_challenge=challenge&code_challenge_method=plain`;

  server = http.createServer((req, res) => {
    const u = new URL(req.url || '', `http://localhost:${PORT}`);
    const code = u.searchParams.get('code');
    const error = u.searchParams.get('error');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (code) {
      res.end('<p>Done. You can close this tab and return to the terminal.</p>');
      resolve(code);
    } else {
      res.end('<p>Error: ' + (error || 'no code') + '. Check terminal.</p>');
      resolve(null);
    }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('Port', PORT, 'is in use. Free it with: kill $(lsof -t -i:' + PORT + ')');
      console.error('Or run with: PORT=3457 node scripts/x-dm-oauth2-terminal.mjs');
    } else {
      console.error(err);
    }
    reject(err);
  });
  server.listen(PORT, () => {
    console.log('Opening browser. Log in to X and authorize the app…');
    exec(`open "${authUrl}"`, () => {});
  });
});

function post(url, body, auth) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        ...(auth ? { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') } : {}),
      },
    };
    https.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(b) });
        } catch {
          resolve({ status: res.statusCode, data: b });
        }
      });
    }).on('error', reject).end(data);
  });
}

function get(url, authHeader) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: authHeader } }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(b) });
        } catch {
          resolve({ status: res.statusCode, data: b });
        }
      });
    }).on('error', reject);
  });
}

(async () => {
  let code;
  try {
    code = await codePromise;
  } catch (e) {
    process.exit(1);
  }
  server.close();
  if (!code) {
    console.error('No authorization code. Add', REDIRECT_URI, 'in X Developer Portal → app → Callback URI.');
    process.exit(1);
  }
  const tokenRes = await post(
    'https://api.twitter.com/2/oauth2/token',
    { code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI, code_verifier: CODE_VERIFIER },
    `${clientId}:${clientSecret}`
  );
  if (tokenRes.status !== 200 || !tokenRes.data?.access_token) {
    console.error('Token exchange failed:', tokenRes.data);
    process.exit(1);
  }
  const accessToken = tokenRes.data.access_token;
  const dmRes = await get(
    'https://api.x.com/2/dm_events?max_results=50&dm_event.fields=event_type,created_at,text,sender_id,participant_ids',
    'Bearer ' + accessToken
  );
  console.log('\n--- DMs ---\n');
  if (dmRes.status !== 200) {
    console.log(dmRes.data);
    process.exit(1);
  }
  const events = dmRes.data?.data || [];
  if (events.length === 0) {
    console.log('No recent DM events. Accept message requests on x.com/messages to see them here.');
  } else {
    console.log(JSON.stringify(dmRes.data, null, 2));
    console.log('\n--- Messages (text) ---');
    events.forEach((e, i) => console.log(`${i + 1}. [${e.created_at || ''}] ${e.text ?? '(no text)'}`));
  }
})();
