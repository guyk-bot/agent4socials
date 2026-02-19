#!/usr/bin/env node
/**
 * Run the 3 Meta App Review API tests using tokens from the database
 * (connected Facebook and Instagram accounts). No Graph API Explorer needed.
 *
 * Run from repo root:  node apps/web/scripts/run-meta-app-review-tests.js
 * Or from apps/web:    node scripts/run-meta-app-review-tests.js
 */

const path = require('path');
const fs = require('fs');

// Load .env from apps/web
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

if (!process.env.DATABASE_URL || !/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  console.error('DATABASE_URL is missing or invalid (need postgresql://...).');
  console.error('Run this script from your machine where apps/web/.env has DATABASE_URL and Facebook + Instagram are connected.');
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE = 'https://graph.facebook.com/v18.0';

function trimToken(t) {
  if (typeof t !== 'string') return t;
  return t.trim().replace(/\r?\n/g, '');
}

async function get(url, token) {
  const t = trimToken(token);
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}access_token=${encodeURIComponent(t)}`);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log('--- Meta App Review: 3 required API tests (using DB tokens) ---\n');

  const fb = await prisma.socialAccount.findFirst({ where: { platform: 'FACEBOOK' } });
  const ig = await prisma.socialAccount.findFirst({ where: { platform: 'INSTAGRAM' } });
  if (ig && (!ig.accessToken || trimToken(ig.accessToken).length < 20)) {
    console.log('Instagram token in DB looks invalid (too short or empty). Reconnect with "Connect with Instagram only".\n');
  }

  // 1) pages_manage_engagement
  console.log('1. pages_manage_engagement');
  if (fb) {
    const postsRes = await get(
      `${BASE}/${fb.platformUserId}/posts?fields=id,message,comments.summary(true)&limit=5`,
      fb.accessToken
    );
    if (postsRes.ok) {
      console.log('   OK – GET /' + fb.platformUserId + '/posts');
    } else {
      console.log('   Failed:', postsRes.data?.error?.message || JSON.stringify(postsRes.data));
    }
  } else {
    console.log('   Skipped (no connected Facebook account in DB).');
  }
  console.log('');

  // 2) instagram_business_manage_insights
  console.log('2. instagram_business_manage_insights');
  if (ig) {
    const insightsRes = await get(
      `${BASE}/${ig.platformUserId}/insights?metric=reach&period=day`,
      ig.accessToken
    );
    if (insightsRes.ok) {
      console.log('   OK – GET /' + ig.platformUserId + '/insights');
    } else {
      console.log('   Failed:', insightsRes.data?.error?.message || JSON.stringify(insightsRes.data));
    }
  } else {
    console.log('   Skipped (no connected Instagram account in DB).');
  }
  console.log('');

  // 3) instagram_business_manage_comments
  console.log('3. instagram_business_manage_comments');
  if (ig) {
    const mediaRes = await get(
      `${BASE}/${ig.platformUserId}/media?fields=id,caption&limit=1`,
      ig.accessToken
    );
    if (!mediaRes.ok || !mediaRes.data.data?.length) {
      console.log('   Failed (get media):', mediaRes.data?.error?.message || 'no media');
    } else {
      const mediaId = mediaRes.data.data[0].id;
      const commentsRes = await get(
        `${BASE}/${mediaId}/comments?fields=username,text,timestamp`,
        ig.accessToken
      );
      if (commentsRes.ok) {
        console.log('   OK – GET /' + mediaId + '/comments');
      } else {
        console.log('   Failed:', commentsRes.data?.error?.message || JSON.stringify(commentsRes.data));
      }
    }
  } else {
    console.log('   Skipped (no connected Instagram account in DB).');
  }

  await prisma.$disconnect();
  console.log('\nRefresh Review → Testing in a few minutes to see "1 of 1" for each.');
}

main().catch(async (e) => {
  await prisma.$disconnect();
  console.error(e);
  process.exit(1);
});
