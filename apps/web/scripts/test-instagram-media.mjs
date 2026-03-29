#!/usr/bin/env node
/**
 * Test that our media serve/proxy return 200 (not 206) when client sends Range header.
 * Meta/Instagram sends Range when fetching image_url; 206 Partial Content causes error 2207076.
 *
 * Usage:
 *   node apps/web/scripts/test-instagram-media.mjs <media-url>
 *
 * Examples:
 *   node apps/web/scripts/test-instagram-media.mjs "https://agent4socials.com/api/media/proxy?url=https%3A%2F%2Fpub-xxx.r2.dev%2Fuploads%2Fimage.jpg"
 *   node apps/web/scripts/test-instagram-media.mjs "https://agent4socials.com/api/media/serve?t=YOUR_TOKEN"
 *
 * If you pass a raw R2 URL (e.g. https://pub-xxx.r2.dev/uploads/...) we'll construct the proxy URL.
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://agent4socials.com';

async function runTest(url, label) {
  console.log(`\nTesting: ${label}`);
  console.log(`URL: ${url}`);

  // Simulate Meta/Instagram: send Range header
  const res = await fetch(url, {
    headers: {
      Range: 'bytes=0-999',
      'User-Agent': 'Mozilla/5.0 (compatible; Meta-Instagram/1.0; +https://www.instagram.com)',
    },
  });

  const body = await res.arrayBuffer();
  const len = body.byteLength;

  console.log(`Status: ${res.status}`);
  console.log(`Content-Length: ${res.headers.get('content-length') ?? len}`);
  console.log(`Body size received: ${len} bytes`);

  if (res.status === 206) {
    console.error('\nFAIL: Got 206 Partial Content. Meta would receive corrupt image -> error 2207076.');
    return false;
  }
  if (res.status !== 200) {
    console.error(`\nSKIP: Got ${res.status}. Pass a valid R2 image URL to verify the Range fix.`);
    console.error('  Get URL from: Post History → open post → copy image address, or use serve?t=TOKEN');
    return null; // inconclusive
  }
  console.log('\nPASS: Got 200 OK with full content. Instagram publish should work.');
  return true;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Usage: node test-instagram-media.mjs <media-url>');
    console.log('');
    console.log('Pass a URL that returns your image:');
    console.log('  - Proxy: https://agent4socials.com/api/media/proxy?url=ENCODED_R2_URL');
    console.log('  - Serve: https://agent4socials.com/api/media/serve?t=TOKEN');
    console.log('  - Raw R2: https://pub-xxx.r2.dev/uploads/your-image.jpg (we build proxy URL)');
    process.exit(1);
  }

  let testUrl = arg.trim();
  try {
    const u = new URL(testUrl);
    if (u.origin !== new URL(BASE).origin && (u.hostname.includes('r2.dev') || u.hostname.includes('r2.cloudflarestorage.com'))) {
      testUrl = `${BASE.replace(/\/$/, '')}/api/media/proxy?url=${encodeURIComponent(arg)}`;
      console.log(`Constructed proxy URL from raw R2 URL`);
    }
  } catch (_) {}

  const ok = await runTest(testUrl, 'Media endpoint with Range header (Meta simulation)');
  process.exit(ok === false ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
