#!/usr/bin/env node
/**
 * Run the 3 API calls required by Meta App Review → Testing:
 *   - pages_manage_engagement
 *   - instagram_business_manage_insights
 *   - instagram_business_manage_comments
 *
 * Usage:
 *   GRAPH_TEST_TOKEN=user_token node scripts/run-meta-app-review-tests.js
 *
 * Optional (for Instagram tests; if not set, script prints manual steps):
 *   INSTAGRAM_TOKEN=instagram_token  IG_USER_ID=123456  node scripts/run-meta-app-review-tests.js
 *
 * Loads .env from apps/web if present.
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

const BASE = 'https://graph.facebook.com/v18.0';
const GRAPH_TEST_TOKEN = process.env.GRAPH_TEST_TOKEN;
const INSTAGRAM_TOKEN = process.env.INSTAGRAM_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;

async function get(url, token) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}access_token=${encodeURIComponent(token)}`);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log('--- Meta App Review: 3 required API tests ---\n');

  if (!GRAPH_TEST_TOKEN) {
    console.log('Set GRAPH_TEST_TOKEN (User Token with pages_manage_engagement).');
    console.log('Get it from: https://developers.facebook.com/tools/explorer/\n');
    process.exit(1);
  }

  // 1) pages_manage_engagement: get pages, then call an endpoint that uses this scope
  console.log('1. pages_manage_engagement');
  const accountsRes = await get(`${BASE}/me/accounts?fields=id,name,access_token`, GRAPH_TEST_TOKEN);
  if (!accountsRes.ok || !accountsRes.data.data?.length) {
    console.log('   Failed to get pages:', accountsRes.data.error?.message || JSON.stringify(accountsRes.data));
    console.log('   Ensure GRAPH_TEST_TOKEN has pages_manage_engagement and you have at least one Page.\n');
  } else {
    const page = accountsRes.data.data[0];
    const pageToken = page.access_token;
    const pageId = page.id;
    const postsRes = await get(
      `${BASE}/${pageId}/posts?fields=id,message,comments.summary(true)&limit=5`,
      pageToken
    );
    if (postsRes.ok) {
      console.log('   OK – Called GET /' + pageId + '/posts (pages_manage_engagement).');
    } else {
      console.log('   Failed:', postsRes.data.error?.message || JSON.stringify(postsRes.data));
    }
  }
  console.log('');

  // 2) instagram_business_manage_insights
  console.log('2. instagram_business_manage_insights');
  if (INSTAGRAM_TOKEN && IG_USER_ID) {
    const insightsRes = await get(
      `${BASE}/${IG_USER_ID}/insights?metric=impressions&period=day`,
      INSTAGRAM_TOKEN
    );
    if (insightsRes.ok) {
      console.log('   OK – Called GET /' + IG_USER_ID + '/insights.');
    } else {
      console.log('   Failed:', insightsRes.data.error?.message || JSON.stringify(insightsRes.data));
    }
  } else {
    console.log('   Skipped (no INSTAGRAM_TOKEN or IG_USER_ID).');
    console.log('   See scripts/meta-app-review-api-tests.md for manual steps in Graph API Explorer.');
    console.log('   You need an Instagram token (Instagram Login product), then:');
    console.log('   GET ' + BASE + '/{ig-user-id}/insights?metric=impressions&period=day');
  }
  console.log('');

  // 3) instagram_business_manage_comments
  console.log('3. instagram_business_manage_comments');
  if (INSTAGRAM_TOKEN && IG_USER_ID) {
    const mediaRes = await get(
      `${BASE}/${IG_USER_ID}/media?fields=id,caption&limit=1`,
      INSTAGRAM_TOKEN
    );
    if (!mediaRes.ok || !mediaRes.data.data?.length) {
      console.log('   Failed to get media:', mediaRes.data.error?.message || 'no media');
    } else {
      const mediaId = mediaRes.data.data[0].id;
      const commentsRes = await get(
        `${BASE}/${mediaId}/comments?fields=username,text,timestamp`,
        INSTAGRAM_TOKEN
      );
      if (commentsRes.ok) {
        console.log('   OK – Called GET /' + mediaId + '/comments.');
      } else {
        console.log('   Failed:', commentsRes.data.error?.message || JSON.stringify(commentsRes.data));
      }
    }
  } else {
    console.log('   Skipped (no INSTAGRAM_TOKEN or IG_USER_ID).');
    console.log('   See scripts/meta-app-review-api-tests.md: get media id, then GET /{ig-media-id}/comments');
  }

  console.log('\nRefresh Review → Testing in a few minutes to see "1 of 1" for each.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
