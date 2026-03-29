#!/usr/bin/env node
/**
 * Test what data we get from Facebook/Instagram Graph API.
 *
 * Usage (paste token and id from Supabase SocialAccount table):
 *   ACCESS_TOKEN="your_token" PLATFORM_USER_ID="..." PLATFORM=INSTAGRAM node scripts/test-graph-api.mjs
 *
 * IMPORTANT: Use the correct ID for each platform:
 *   - INSTAGRAM: use the INSTAGRAM row's platformUserId (e.g. 17841401603339747). Do NOT use the Facebook Page ID.
 *   - FACEBOOK: use the FACEBOOK row's platformUserId (e.g. 615419828321895).
 * Using a Page ID with PLATFORM=INSTAGRAM causes "media on node type (Page)" and "valid insights metric" errors.
 *
 * Or hit the API route (when the app is running):
 *   curl -s http://localhost:3000/api/debug/test-graph
 */
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PLATFORM_USER_ID = process.env.PLATFORM_USER_ID?.trim();
const PLATFORM = (process.env.PLATFORM || 'INSTAGRAM').toUpperCase();

const baseUrl = 'https://graph.facebook.com/v18.0';

async function main() {
  if (!ACCESS_TOKEN || !PLATFORM_USER_ID) {
    console.log('Usage: ACCESS_TOKEN="..." PLATFORM_USER_ID="..." PLATFORM=INSTAGRAM node scripts/test-graph-api.mjs');
    console.log('Get ACCESS_TOKEN and PLATFORM_USER_ID from Supabase SocialAccount table.');
    console.log('For INSTAGRAM use the Instagram row\'s platformUserId (e.g. 17841...). For FACEBOOK use the Page row\'s (e.g. 615...).');
    process.exit(1);
  }

  const pid = PLATFORM_USER_ID;
  const token = ACCESS_TOKEN;
  const enc = encodeURIComponent(token);

  console.log('\n---', PLATFORM, 'profile (followers) ---\n');
  const profileUrl = PLATFORM === 'INSTAGRAM'
    ? `${baseUrl}/${pid}?fields=followers_count&access_token=${enc}`
    : `${baseUrl}/${pid}?fields=fan_count&access_token=${enc}`;
  const profileRes = await fetch(profileUrl).then((r) => r.json());
  console.log(JSON.stringify(profileRes, null, 2));

  console.log('\n---', PLATFORM, 'insights (views, reach, profile_views) ---\n');
  const insightsUrl = PLATFORM === 'INSTAGRAM'
    ? `${baseUrl}/${pid}/insights?metric=reach,profile_views,views&metric_type=total_value&period=day&since=2026-01-16&until=2026-02-15&access_token=${enc}`
    : `${baseUrl}/${pid}/insights?metric=page_impressions,page_views_total,page_fan_reach&period=day&since=2026-01-16&until=2026-02-15&access_token=${enc}`;
  const insightsRes = await fetch(insightsUrl).then((r) => r.json());
  console.log(JSON.stringify(insightsRes, null, 2));

  console.log('\n---', PLATFORM, 'media / posts ---\n');
  const mediaUrl = PLATFORM === 'INSTAGRAM'
    ? `${baseUrl}/${pid}/media?fields=id,caption,timestamp&access_token=${enc}`
    : `${baseUrl}/${pid}/published_posts?fields=id,message,created_time&access_token=${enc}`;
  const mediaRes = await fetch(mediaUrl).then((r) => r.json());
  console.log(JSON.stringify(mediaRes, null, 2));

  if (PLATFORM === 'INSTAGRAM' || PLATFORM === 'FACEBOOK') {
    console.log('\n---', PLATFORM, 'conversations (inbox) ---\n');
    const convUrl = `${baseUrl}/${pid}/conversations?fields=id,updated_time,senders&access_token=${enc}`;
    const convRes = await fetch(convUrl).then((r) => r.json());
    console.log(JSON.stringify(convRes, null, 2));
  }

  console.log('\n--- Done ---\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
