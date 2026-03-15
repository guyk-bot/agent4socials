#!/usr/bin/env node
/**
 * Fetch last ~30 days of X DMs using OAuth 1.0a with same signing as the app.
 * Loads TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET from .env at repo root.
 * Writes dms_page_1.json, dms_page_2.json, ... and dms_all.json into scripts/x_dm_backups.
 */
import { createRequire } from 'module';
import https from 'https';
import { URL } from 'url';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load .env from repo root and apps/web
for (const p of [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env')]) {
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) {
        const val = m[2].replace(/^["']|["']$/g, '').trim();
        if (!process.env[m[1]]) process.env[m[1]] = val;
      }
    }
  }
}

const API_KEY = process.env.TWITTER_API_KEY?.trim();
const API_SECRET = process.env.TWITTER_API_SECRET?.trim();
let ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN?.trim();
let ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET?.trim();

/** @type {'oauth1' | 'bearer'} */
let authMode = 'oauth1';
/** When authMode === 'bearer', this is the Bearer token. */
let BEARER_TOKEN = null;

// Optional: load from DB when DATABASE_URL is set (done inside main())
const DATABASE_URL = process.env.DATABASE_URL?.trim();
async function loadCredsFromDb() {
  if (!DATABASE_URL || (!DATABASE_URL.startsWith('postgresql://') && !DATABASE_URL.startsWith('postgres://'))) return;
  try {
    const dbUrl = (DATABASE_URL.includes(':6543/') || /pooler\.supabase/.test(DATABASE_URL)) && !DATABASE_URL.includes('pgbouncer=true')
      ? (DATABASE_URL.includes('?') ? DATABASE_URL.replace('?', '?pgbouncer=true&') : DATABASE_URL + '?pgbouncer=true')
      : DATABASE_URL;
    process.env.DATABASE_URL = dbUrl;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const acc = await prisma.socialAccount.findFirst({ where: { platform: 'TWITTER' } });
    await prisma.$disconnect();
    if (acc) {
      const cred = acc.credentialsJson || {};
      const oa1 = cred.twitterOAuth1AccessToken;
      const oa1s = cred.twitterOAuth1AccessTokenSecret;
      if (oa1 && oa1s && API_KEY && API_SECRET) {
        ACCESS_TOKEN = oa1;
        ACCESS_TOKEN_SECRET = oa1s;
        console.log('Using OAuth 1.0a from DB (credentialsJson).');
      } else if (acc.accessToken) {
        BEARER_TOKEN = acc.accessToken;
        authMode = 'bearer';
        console.log('Using Bearer token from DB (accessToken).');
      }
    }
  } catch (e) {
    console.warn('DB load failed:', e.message);
  }
}

const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

const oauth = API_KEY && API_SECRET ? OAuth({
  consumer: { key: API_KEY, secret: API_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  },
}) : null;

function sign(method, url, params) {
  return oauth.toHeader(oauth.authorize(
    { url, method, data: params || {} },
    { key: ACCESS_TOKEN, secret: ACCESS_TOKEN_SECRET }
  )).Authorization;
}

function get(urlString, params) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    u.search = new URLSearchParams(params).toString();
    const fullUrl = u.toString();
    const headers = { 'User-Agent': 'agent4socials-fetch-dms/1.0' };
    if (authMode === 'bearer' && BEARER_TOKEN) {
      headers.Authorization = 'Bearer ' + BEARER_TOKEN;
    } else {
      headers.Authorization = sign('GET', urlString, params);
    }
    https.get(fullUrl, { headers }, (res) => {
      let b = '';
      res.on('data', c => b += c);
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

const OUT_DIR = path.join(__dirname, 'x_dm_backups');
const BASE = 'https://api.x.com/2/dm_events';
const PARAMS = {
  max_results: '100',
  event_types: 'MessageCreate',
  'dm_event.fields': 'created_at,id,text,sender_id,participant_ids,dm_conversation_id',
  expansions: 'sender_id',
  'user.fields': 'id,name,username',
};

async function main() {
  await loadCredsFromDb();

  if (authMode === 'oauth1' && (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET)) {
    console.error('Set TWITTER_* in .env or DATABASE_URL to use stored credentials.');
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const allEvents = [];
  let nextToken = null;
  let page = 0;

  console.log('Fetching GET /2/dm_events (' + (authMode === 'bearer' ? 'Bearer' : 'OAuth 1.0a') + ')...');
  console.log('---');

  while (true) {
    page++;
    const params = { ...PARAMS };
    if (nextToken) params.pagination_token = nextToken;
    const res = await get(BASE, params);

    if (res.status !== 200) {
      const summary = {
        error: true,
        status: res.status,
        message: res.data?.detail || res.data?.title || 'Request failed',
        nextSteps: res.status === 401
          ? 'Regenerate Access Token and Secret in developer.x.com → your app → Keys and tokens → Access Token and Secret. Then update .env.'
          : res.status === 429
            ? 'Rate limited. Wait a few minutes or check X Usage/Billing (Pro for higher DM limits).'
            : 'Check X Developer Portal app permissions (Read and write and Direct message).',
      };
      const summaryPath = path.join(OUT_DIR, 'fetch_result.json');
      if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
      console.error('Request failed:', res.status, JSON.stringify(res.data));
      console.error(summary.nextSteps);
      console.error('Wrote', summaryPath);
      process.exit(1);
    }

    const data = res.data;
    const events = data.data || [];
    allEvents.push(...events);

    const outFile = path.join(OUT_DIR, `dms_page_${page}.json`);
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');
    console.log('Saved:', outFile);

    const includes = data.includes || {};
    const users = (includes.users || []).reduce((m, u) => { m[u.id] = u; return m; }, {});

    for (const ev of events) {
      const u = users[ev.sender_id];
      const name = u ? (u.username || u.name || ev.sender_id) : ev.sender_id;
      const text = (ev.text || '').slice(0, 80);
      console.log(`  [${ev.created_at}] @${name} | ${text}${(ev.text || '').length > 80 ? '…' : ''}`);
    }

    const meta = data.meta || {};
    nextToken = meta.next_token || null;
    if (!nextToken) break;
    console.log('  ... next page');
  }

  const allPath = path.join(OUT_DIR, 'dms_all.json');
  fs.writeFileSync(allPath, JSON.stringify({ data: allEvents }, null, 2), 'utf8');
  console.log('---');
  console.log('Total messages:', allEvents.length);
  console.log('All events saved to:', allPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
