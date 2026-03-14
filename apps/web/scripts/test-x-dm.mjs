#!/usr/bin/env node
/**
 * Test X (Twitter) DM API from the terminal.
 *
 * Option A – OAuth 2.0 Bearer (recommended if you connected X in the app):
 *   export BEARER_TOKEN="<paste from app/DB: SocialAccount.accessToken for TWITTER>"
 *   cd apps/web && node scripts/test-x-dm.mjs
 *
 * Option B – OAuth 1.0a (Keys and tokens from X Developer Portal):
 *   export TWITTER_API_KEY="..." TWITTER_API_SECRET="..." TWITTER_ACCESS_TOKEN="..." TWITTER_ACCESS_TOKEN_SECRET="..."
 *   cd apps/web && node scripts/test-x-dm.mjs
 */

import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import https from 'https';

const bearerToken = process.env.BEARER_TOKEN?.trim();
const apiKey = process.env.TWITTER_API_KEY;
const apiSecret = process.env.TWITTER_API_SECRET;
const accessToken = process.env.TWITTER_ACCESS_TOKEN;
const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

const useBearer = Boolean(bearerToken);
const useOAuth1 = Boolean(apiKey && apiSecret && accessToken && accessTokenSecret);

if (!useBearer && !useOAuth1) {
  console.error('Set either:');
  console.error('  BEARER_TOKEN="<OAuth 2.0 user token from app>"');
  console.error('  or all four: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET');
  process.exit(1);
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      })
      .on('error', reject);
  });
}

let authHeader;
if (useBearer) {
  authHeader = `Bearer ${bearerToken}`;
} else {
  const oauth = new OAuth({
    consumer: { key: apiKey, secret: apiSecret },
    signature_method: 'HMAC-SHA1',
    hash_function(baseString, key) {
      return crypto.createHmac('sha1', key).update(baseString).digest('base64');
    },
  });
  const getAuthHeader = (method, url, data = {}) => {
    const authData = oauth.authorize({ url, method, data }, { key: accessToken, secret: accessTokenSecret });
    return oauth.toHeader(authData).Authorization;
  };
  authHeader = getAuthHeader('GET', 'https://api.x.com/2/users/me', { 'user.fields': 'id,username,name' });
}

(async () => {
  const usersMeUrl = 'https://api.x.com/2/users/me?user.fields=id,username,name';
  const usersMe = await get(usersMeUrl, { Authorization: authHeader });
  console.log('--- GET /2/users/me ---');
  console.log(JSON.stringify(usersMe.data, null, 2));
  if (usersMe.status !== 200) {
    if (useOAuth1) {
      console.error('\n401: Access Token + Secret are invalid or not for this app.');
      if (process.env.DEBUG) {
        console.error('Debug: API_KEY (consumer) starts with:', (apiKey || '').slice(0, 8) + '...');
        console.error('Debug: ACCESS_TOKEN starts with:', (accessToken || '').slice(0, 25) + '...');
      }
      console.error('Fix: In X Developer Portal open the app that has API Key starting with:', (apiKey || '').slice(0, 8) + '...');
      console.error('  On the SAME "Keys and tokens" page, use the "API Key" and "API Secret" (or "Consumer Key/Secret") shown there.');
      console.error('  Generate "Access Token and Secret" on that page and use those 4 values. No mixing keys from different apps.');
      console.error('  Then: User authentication settings → App permissions → "Read and write and Direct Messages" → Save.');
    } else {
      console.error('\n401: Bearer token invalid or expired. Connect X again in the app and use the new token.');
    }
    process.exit(1);
  }

  const dmBaseUrl = 'https://api.x.com/2/dm_events';
  const dmParams = {
    event_types: 'MessageCreate',
    'dm_event.fields': 'id,created_at,sender_id,text,dm_conversation_id',
    max_results: '100',
  };
  const dmQuery = new URLSearchParams(dmParams).toString();
  const dmFullUrl = `${dmBaseUrl}?${dmQuery}`;

  let dmAuth = authHeader;
  if (useOAuth1) {
    const oauth = new OAuth({
      consumer: { key: apiKey, secret: apiSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(baseString, key) {
        return crypto.createHmac('sha1', key).update(baseString).digest('base64');
      },
    });
    const authData = oauth.authorize(
      { url: dmBaseUrl, method: 'GET', data: dmParams },
      { key: accessToken, secret: accessTokenSecret }
    );
    dmAuth = oauth.toHeader(authData).Authorization;
  }

  const dmRes = await get(dmFullUrl, { Authorization: dmAuth });
  console.log('\n--- GET /2/dm_events ---');
  console.log(JSON.stringify(dmRes.data, null, 2));

  if (dmRes.status !== 200) {
    if (dmRes.data?.detail) console.error('\n' + dmRes.data.detail);
    if (dmRes.status === 401 || dmRes.status === 403) {
      console.error('Ensure app permission is "Read and write and Direct Messages" and token is fresh.');
    }
    process.exit(1);
  }

  const events = dmRes.data?.data || [];
  if (events.length > 0) {
    console.log('\n--- Messages (text only) ---');
    events.forEach((e, i) => {
      const t = e.text ?? '(no text)';
      const at = e.created_at ?? '';
      console.log(`${i + 1}. [${at}] ${t}`);
    });
  } else {
    console.log('\nNo DM events in this window. Accept message requests on x.com/messages to see them here.');
  }
})();
