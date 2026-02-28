#!/usr/bin/env node
/**
 * Validate a Meta (Instagram/Facebook) access token and print granted scopes.
 *
 * Usage:
 *   node scripts/validate-meta-token.mjs [TOKEN]
 *
 * If TOKEN is omitted, fetches the first Instagram account from DB (requires DATABASE_URL).
 * Requires META_APP_ID and META_APP_SECRET (or INSTAGRAM_APP_ID/SECRET) in env.
 *
 * Requires .env with META_APP_ID and META_APP_SECRET (loads from apps/web or root).
 *
 *   cd apps/web && npm run validate-meta-token
 *   cd apps/web && npm run validate-meta-token -- YOUR_TOKEN
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const dirs = [join(__dirname, '..'), join(__dirname, '..', '..')];
  for (const dir of dirs) {
    for (const name of ['.env.local', '.env']) {
      const p = join(dir, name);
      if (existsSync(p)) {
        const content = readFileSync(p, 'utf8');
        for (const line of content.split('\n')) {
          const m = line.match(/^([^#=]+)=(.*)$/);
          if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
        }
        return p;
      }
    }
  }
}

loadEnv();

const tokenArg = process.argv[2];
const appId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID;
const appSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;

async function debugToken(inputToken) {
  if (!appId || !appSecret) {
    console.error('Error: Set META_APP_ID and META_APP_SECRET in .env or environment.');
    process.exit(1);
  }
  const appToken = `${appId}|${appSecret}`;
  const res = await fetch(
    `https://graph.facebook.com/v18.0/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appToken)}`
  );
  const json = await res.json();
  if (json.error) {
    console.error('Meta API error:', json.error);
    process.exit(1);
  }
  const d = json.data || {};
  const scopes = d.scopes || [];
  const hasPublish = scopes.some((s) => s.includes('content_publish') || s.includes('manage_posts'));
  const exp = d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'N/A';
  console.log('\n=== Meta Token Validation ===');
  console.log('Valid:', d.is_valid ?? false);
  console.log('Expires:', exp);
  console.log('Publish scope:', hasPublish ? 'YES' : 'NO');
  console.log('Scopes:', scopes.length ? scopes.join(', ') : '(none)');
  console.log('');
}

async function main() {
  if (tokenArg) {
    await debugToken(tokenArg);
    return;
  }
  // No token: try to fetch from DB
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const account = await prisma.socialAccount.findFirst({
      where: { platform: 'INSTAGRAM' },
      select: { id: true, username: true, accessToken: true },
    });
    await prisma.$disconnect();
    if (!account) {
      console.error('No Instagram account found in DB. Pass token as arg: node validate-meta-token.mjs YOUR_TOKEN');
      process.exit(1);
    }
    console.log(`Using token for @${account.username || 'instagram'} (id: ${account.id})\n`);
    await debugToken(account.accessToken);
  } catch (err) {
    console.error('Could not fetch from DB (check DATABASE_URL in .env).');
    console.error('Pass token as arg: npm run validate-meta-token -- YOUR_TOKEN');
    console.error(err.message);
    process.exit(1);
  }
}

main();
