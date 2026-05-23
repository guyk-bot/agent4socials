#!/usr/bin/env node
/**
 * Meta App Review: trigger threads_share_to_instagram (1 API call).
 *
 * Cross-shares a new Threads text post to the linked Instagram account as a Story
 * via POST me/threads_publish with crossreshare_to_ig=true.
 *
 * Prerequisites:
 * - Threads profile linked to an Instagram account (Threads app → Settings).
 * - Access token includes threads_share_to_instagram + threads_content_publish + threads_basic.
 *
 * Usage:
 *   cd apps/web
 *   node scripts/run-threads-share-to-instagram-test.js
 *
 * Or pass a token from Graph API Explorer (recommended if DB token lacks the scope):
 *   node scripts/run-threads-share-to-instagram-test.js "THAAxxxx..."
 */

const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

const BASE = 'https://graph.threads.net/v1.0';
const tokenArg = process.argv[2]?.trim();

function trimToken(t) {
  if (typeof t !== 'string') return '';
  return t.trim().replace(/\r?\n/g, '');
}

async function postForm(pathSuffix, token, form) {
  const body = new URLSearchParams(form);
  const res = await fetch(`${BASE}/${pathSuffix.replace(/^\//, '')}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${trimToken(token)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function getJson(pathSuffix, token, params = {}) {
  const q = new URLSearchParams({ ...params, access_token: trimToken(token) });
  const res = await fetch(`${BASE}/${pathSuffix.replace(/^\//, '')}?${q}`);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function waitForReady(containerId, token, maxMs = 60_000) {
  const step = 3_000;
  for (let elapsed = 0; elapsed < maxMs; elapsed += step) {
    const r = await getJson(containerId, token, { fields: 'status' });
    const status = r.data?.status;
    if (status === 'FINISHED') return true;
    if (status === 'ERROR') {
      console.error('   Container status ERROR:', JSON.stringify(r.data));
      return false;
    }
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
}

async function getTokenFromDb() {
  if (!process.env.DATABASE_URL || !/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)) {
    return null;
  }
  const { PrismaClient } = require('@prisma/client');
  const dbUrl = process.env.DATABASE_URL.includes('pgbouncer=true')
    ? process.env.DATABASE_URL
    : process.env.DATABASE_URL +
      (process.env.DATABASE_URL.includes('?') ? '&' : '?') +
      'pgbouncer=true&connection_limit=1';
  const prisma = new PrismaClient({ datasourceUrl: dbUrl });
  try {
    const acc = await prisma.socialAccount.findFirst({
      where: { platform: 'THREADS' },
      orderBy: { createdAt: 'desc' },
    });
    return acc?.accessToken ? trimToken(acc.accessToken) : null;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log('--- threads_share_to_instagram test (crossreshare_to_ig) ---\n');

  const token = tokenArg || (await getTokenFromDb());
  if (!token) {
    console.error('No token. Pass one as argv or connect Threads in production and set DATABASE_URL in apps/web/.env');
    process.exit(1);
  }

  console.log(`Token: ${token.slice(0, 12)}... (${tokenArg ? 'from argument' : 'from DB'})\n`);
  console.log('Step 1: Create Threads media container (TEXT)...');

  const create = await postForm('me/threads', token, {
    media_type: 'TEXT',
    text: `Agent4Socials App Review test ${new Date().toISOString().slice(0, 19)}Z`,
  });

  if (!create.ok || !create.data?.id) {
    console.error('   Failed:', create.data?.error?.message || JSON.stringify(create.data));
    console.error('\nIf error mentions permission, generate a token in Graph API Explorer with');
    console.error('threads_share_to_instagram checked, then run:');
    console.error('  node scripts/run-threads-share-to-instagram-test.js "YOUR_TOKEN"');
    process.exit(1);
  }

  const containerId = create.data.id;
  console.log(`   OK – container id ${containerId}`);

  console.log('\nStep 2: Wait for container FINISHED...');
  const ready = await waitForReady(containerId, token);
  if (!ready) {
    console.log('   Still processing; trying publish anyway (text posts are often instant)...');
  } else {
    console.log('   OK – FINISHED');
  }

  console.log('\nStep 3: Publish with crossreshare_to_ig=true (threads_share_to_instagram)...');
  const publish = await postForm('me/threads_publish', token, {
    creation_id: containerId,
    crossreshare_to_ig: 'true',
  });

  if (!publish.ok || !publish.data?.id) {
    console.error('   Failed:', publish.data?.error?.message || JSON.stringify(publish.data));
    console.error('\nCommon fixes:');
    console.error('- Link Instagram to your Threads account in the Threads mobile app.');
    console.error('- Token must include threads_share_to_instagram (Graph API Explorer → Get token).');
    process.exit(1);
  }

  console.log(`   OK – published thread id ${publish.data.id}`);
  console.log('\nCheck Instagram Stories on the linked account. Wait 2–5 min, then refresh Meta → App Review → Testing.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
