#!/usr/bin/env node
/**
 * Local / VPS scheduler: runs daily at 01:00 (server local time) and POSTs the niche-trends cron.
 * On Vercel, use an external cron (e.g. cron-job.org) instead of this process.
 *
 * Usage:
 *   APP_URL=https://your-domain.com CRON_SECRET=... node scripts/niche-trends-cron.cjs
 *
 * Requires: YOUTUBE_API_KEY on the server (Vercel env), not in this script.
 */
const cron = require('node-cron');

const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const secret = (process.env.CRON_SECRET || '').trim();

if (!secret) {
  console.error('CRON_SECRET is required');
  process.exit(1);
}

async function hit() {
  const url = `${base}/api/cron/niche-trends`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Cron-Secret': secret },
    });
    const body = await res.json().catch(() => ({}));
    console.log(new Date().toISOString(), res.status, body);
  } catch (e) {
    console.error(new Date().toISOString(), e);
  }
}

cron.schedule('0 1 * * *', () => {
  void hit();
});

console.log('Niche trends: scheduled daily at 01:00 (server local). Base URL:', base);
if (process.env.NICHE_CRON_RUN_ON_START === '1') void hit();
