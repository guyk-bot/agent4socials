/**
 * Short-lived signed token for /api/media/serve so Meta gets a short URL (avoids long query strings).
 * Uses HMAC-SHA256; no JWT dependency.
 */

const ALG = 'sha256';
const EXPIRES_IN_SEC = 3600; // 1 hour

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

export function createMediaServeToken(fileUrl: string): string | null {
  const secret = process.env.MEDIA_SERVE_SECRET || process.env.CRON_SECRET;
  if (!secret || typeof secret !== 'string') return null;
  const exp = Math.floor(Date.now() / 1000) + EXPIRES_IN_SEC;
  const payload = JSON.stringify({ u: fileUrl, e: exp });
  const payloadB64 = base64UrlEncode(Buffer.from(payload, 'utf8'));
  const crypto = require('crypto');
  const sig = crypto.createHmac(ALG, secret).update(payloadB64).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export function verifyMediaServeToken(token: string): { url: string } | null {
  const secret = process.env.MEDIA_SERVE_SECRET || process.env.CRON_SECRET;
  if (!secret || typeof secret !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  try {
    const crypto = require('crypto');
    const sig = crypto.createHmac(ALG, secret).update(payloadB64).digest();
    const expectedB64 = base64UrlEncode(sig);
    if (sigB64 !== expectedB64) return null;
    const payload = JSON.parse(Buffer.from(base64UrlDecode(payloadB64)).toString('utf8'));
    if (typeof payload.u !== 'string' || typeof payload.e !== 'number') return null;
    if (payload.e < Math.floor(Date.now() / 1000)) return null; // expired
    return { url: payload.u };
  } catch {
    return null;
  }
}
