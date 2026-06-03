import crypto from 'crypto';

export function createTwitterOAuthPkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function defaultTwitterOAuthScopes(): string {
  if (typeof process.env.TWITTER_OAUTH_SCOPES === 'string' && process.env.TWITTER_OAUTH_SCOPES.trim()) {
    return process.env.TWITTER_OAUTH_SCOPES.trim();
  }
  return 'tweet.read tweet.write users.read media.write dm.read dm.write offline.access';
}

export function resolveTwitterOAuthCallbackUrl(baseUrl: string): string {
  const callbackUrl = `${baseUrl.replace(/\/+$/, '')}/api/social/oauth/twitter/callback`;
  return (process.env.TWITTER_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
}

export function buildTwitterOAuth2AuthorizeUrl(params: {
  userId: string;
  codeChallenge: string;
  baseUrl: string;
}): string {
  const redirectUri = resolveTwitterOAuthCallbackUrl(params.baseUrl);
  const qs = new URLSearchParams({
    client_id: process.env.TWITTER_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: defaultTwitterOAuthScopes(),
    state: params.userId,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://twitter.com/i/oauth2/authorize?${qs.toString()}`;
}
