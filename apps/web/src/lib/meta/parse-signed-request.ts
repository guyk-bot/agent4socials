import crypto from 'crypto';

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

/** Parse Meta `signed_request` (Facebook / Threads deauthorize and data deletion). */
export function parseMetaSignedRequest(
  signedRequest: string,
  appSecret: string
): Record<string, unknown> | null {
  if (!signedRequest?.trim() || !appSecret?.trim()) return null;
  const parts = signedRequest.split('.');
  if (parts.length !== 2) return null;
  const [encodedSig, payload] = parts;
  try {
    const sig = base64UrlDecode(encodedSig);
    const expected = crypto.createHmac('sha256', appSecret).update(payload).digest();
    if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
      return null;
    }
    const json = base64UrlDecode(payload).toString('utf8');
    const data = JSON.parse(json) as Record<string, unknown>;
    if (data.algorithm !== 'HMAC-SHA256') return null;
    return data;
  } catch {
    return null;
  }
}

export function metaSignedRequestUserId(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const id = data.user_id;
  if (id === undefined || id === null) return null;
  return String(id);
}
