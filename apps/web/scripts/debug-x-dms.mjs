#!/usr/bin/env node
/**
 * Comprehensive X DM debug script.
 * 1. Connects to DB via Prisma, gets full token + refreshToken for TWITTER account.
 * 2. Refreshes if TWITTER_CLIENT_ID + TWITTER_CLIENT_SECRET are set.
 * 3. Calls multiple DM endpoints and prints raw JSON.
 */
import { createRequire } from 'module';
import https from 'https';
import { URL } from 'url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('Set DATABASE_URL'); process.exit(1); }

// Ensure pgbouncer=true for pooler
const finalDbUrl = (DB_URL.includes(':6543/') || /pooler\.supabase/.test(DB_URL)) && !DB_URL.includes('pgbouncer=true')
  ? (DB_URL.includes('?') ? DB_URL.replace('?', '?pgbouncer=true&') : DB_URL + '?pgbouncer=true')
  : DB_URL;
process.env.DATABASE_URL = finalDbUrl;

const prisma = new PrismaClient();

function get(url, authHeader) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get(url, { headers: { Authorization: authHeader, 'User-Agent': 'agent4socials-debug/1.0' } }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, data: b }); }
      });
    }).on('error', reject);
  });
}

function post(url, body, auth) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new URLSearchParams(body).toString();
    const opts = {
      hostname: u.hostname, port: 443, path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        Authorization: 'Basic ' + Buffer.from(auth).toString('base64'),
      },
    };
    https.request(opts, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, data: b }); }
      });
    }).on('error', reject).end(data);
  });
}

(async () => {
  // 1. Get TWITTER account from DB
  const accounts = await prisma.socialAccount.findMany({ where: { platform: 'TWITTER' } });
  if (!accounts.length) { console.error('No TWITTER accounts in DB'); await prisma.$disconnect(); process.exit(1); }
  const acc = accounts[0];
  console.log('=== DB Account ===');
  console.log('  id:', acc.id);
  console.log('  platform:', acc.platform);
  console.log('  platformUserId:', acc.platformUserId);
  console.log('  username:', acc.username);
  console.log('  accessToken length:', acc.accessToken?.length, '| first 30:', acc.accessToken?.slice(0, 30));
  console.log('  refreshToken length:', acc.refreshToken?.length, '| first 20:', acc.refreshToken?.slice(0, 20));
  console.log('  expiresAt:', acc.expiresAt);
  console.log('  credentialsJson keys:', acc.credentialsJson ? Object.keys(acc.credentialsJson) : 'null');

  let token = acc.accessToken;

  // 2. Refresh token if expired and we have CLIENT_ID/SECRET
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const isExpired = acc.expiresAt && new Date(acc.expiresAt) < new Date();
  console.log('\n  Token expired?', isExpired ? 'YES' : 'NO');

  if (acc.refreshToken && clientId && clientSecret) {
    console.log('\n=== Refreshing token ===');
    const ref = await post(
      'https://api.twitter.com/2/oauth2/token',
      { refresh_token: acc.refreshToken, grant_type: 'refresh_token' },
      `${clientId}:${clientSecret}`
    );
    console.log('  Refresh status:', ref.status);
    console.log('  Refresh data:', JSON.stringify(ref.data));
    if (ref.status === 200 && ref.data?.access_token) {
      token = ref.data.access_token;
      console.log('  New token first 30:', token.slice(0, 30));
      // Update DB
      await prisma.socialAccount.update({
        where: { id: acc.id },
        data: {
          accessToken: token,
          ...(ref.data.refresh_token ? { refreshToken: ref.data.refresh_token } : {}),
          expiresAt: ref.data.expires_in ? new Date(Date.now() + ref.data.expires_in * 1000) : undefined,
        },
      });
      console.log('  DB updated with new token');
    }
  } else {
    console.log('  (Skipping refresh: no refresh_token or no CLIENT_ID/SECRET)');
  }

  const auth = `Bearer ${token}`;
  console.log('\n=== Testing endpoints with token ===');

  // 3a. /2/users/me
  const me = await get('https://api.x.com/2/users/me?user.fields=id,username,name', auth);
  console.log('\n--- GET /2/users/me ---');
  console.log('  status:', me.status, '| data:', JSON.stringify(me.data));

  // 3b. /2/dm_events (no filters)
  const dm1 = await get('https://api.x.com/2/dm_events?max_results=100', auth);
  console.log('\n--- GET /2/dm_events (no filter) ---');
  console.log('  status:', dm1.status, '| raw:', JSON.stringify(dm1.data));

  // 3c. /2/dm_events with event_types=MessageCreate
  const dm2 = await get('https://api.x.com/2/dm_events?max_results=100&event_types=MessageCreate&dm_event.fields=id,text,created_at,sender_id,dm_conversation_id&expansions=sender_id,participant_ids&user.fields=id,username,name', auth);
  console.log('\n--- GET /2/dm_events (MessageCreate + expansions) ---');
  console.log('  status:', dm2.status, '| raw:', JSON.stringify(dm2.data));

  // 3d. OAuth 1.0a credentials in credentialsJson?
  const creds = acc.credentialsJson;
  const oauth1Token = creds?.twitterOAuth1AccessToken;
  const oauth1Secret = creds?.twitterOAuth1AccessTokenSecret;
  if (oauth1Token && oauth1Secret) {
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    if (apiKey && apiSecret) {
      console.log('\n=== Also testing OAuth 1.0a from credentialsJson ===');
      const { createRequire: cr } = await import('module');
      const req2 = cr(import.meta.url);
      const OAuth = req2('oauth-1.0a');
      const crypto = req2('crypto');
      const oauth = new OAuth({
        consumer: { key: apiKey, secret: apiSecret },
        signature_method: 'HMAC-SHA1',
        hash_function: (b, k) => crypto.createHmac('sha1', k).update(b).digest('base64'),
      });
      const dmParams = { max_results: '100', event_types: 'MessageCreate', 'dm_event.fields': 'id,text,created_at,sender_id,dm_conversation_id' };
      const authData = oauth.authorize({ url: 'https://api.x.com/2/dm_events', method: 'GET', data: dmParams }, { key: oauth1Token, secret: oauth1Secret });
      const oauth1Header = oauth.toHeader(authData).Authorization;
      const dm3 = await get(
        `https://api.x.com/2/dm_events?max_results=100&event_types=MessageCreate&dm_event.fields=id,text,created_at,sender_id,dm_conversation_id`,
        oauth1Header
      );
      console.log('\n--- GET /2/dm_events (OAuth 1.0a from DB) ---');
      console.log('  status:', dm3.status, '| raw:', JSON.stringify(dm3.data));
    }
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('Fatal:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
