/**
 * Twitter OAuth 1.0a helpers for signing requests (e.g. v1.1 media upload).
 * Requires TWITTER_API_KEY and TWITTER_API_SECRET (Consumer Key/Secret from X Developer Portal).
 */

import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export function getTwitterOAuth1() {
  const key = process.env.TWITTER_API_KEY;
  const secret = process.env.TWITTER_API_SECRET;
  if (!key || !secret) return null;
  return OAuth({
    consumer: { key, secret },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string: string, key: string) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    },
  });
}

export type TwitterOAuth1Token = { key: string; secret: string };

/** Build Authorization header for a request. For POST multipart, use empty data so only oauth_* are in the signature. */
export function signTwitterRequest(
  method: string,
  url: string,
  token: TwitterOAuth1Token,
  data?: Record<string, string>
): { Authorization: string } {
  const oauth = getTwitterOAuth1();
  if (!oauth) throw new Error('TWITTER_API_KEY and TWITTER_API_SECRET are required for OAuth 1.0a');
  const authData = oauth.authorize(
    { url, method, data: data ?? {} },
    { key: token.key, secret: token.secret }
  );
  return oauth.toHeader(authData) as { Authorization: string };
}
