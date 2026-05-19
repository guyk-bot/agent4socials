import axios from 'axios';
import { signTwitterRequest } from '@/lib/twitter-oauth1';
import { refreshTwitterToken } from '@/lib/twitter-refresh';

export type TwitterDmAccount = {
  accessToken: string;
  refreshToken?: string | null;
  credentialsJson: unknown;
};

function oauth1FromCredentials(credentialsJson: unknown): { key: string; secret: string } | null {
  const cred =
    credentialsJson && typeof credentialsJson === 'object' && !Array.isArray(credentialsJson)
      ? (credentialsJson as Record<string, unknown>)
      : {};
  const key = cred.twitterOAuth1AccessToken;
  const secret = cred.twitterOAuth1AccessTokenSecret;
  if (typeof key === 'string' && typeof secret === 'string' && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET) {
    return { key, secret };
  }
  return null;
}

/** Send a text-only DM on X (Twitter). Uses OAuth 1.0a when connected, else OAuth 2 bearer (with refresh). */
export async function sendTwitterDmText(
  account: TwitterDmAccount,
  participantId: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const trimmed = text.trim().slice(0, 10_000);
  if (!trimmed) return { ok: false, error: 'Message is empty' };

  const postUrl = `https://api.x.com/2/dm_conversations/with/${encodeURIComponent(participantId)}/messages`;
  const oauth1 = oauth1FromCredentials(account.credentialsJson);
  let accessToken = account.accessToken;

  const postOnce = async (token: string, oauth1Pair: { key: string; secret: string } | null) => {
    const headers = oauth1Pair
      ? { ...signTwitterRequest('POST', postUrl, oauth1Pair, {}), 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    return axios.post(postUrl, { text: trimmed }, { headers, timeout: 20_000, validateStatus: () => true });
  };

  try {
    let res = await postOnce(accessToken, oauth1);
    if (res.status === 401 && !oauth1 && account.refreshToken) {
      try {
        const refreshed = await refreshTwitterToken(account.refreshToken);
        accessToken = refreshed.accessToken;
        res = await postOnce(accessToken, null);
      } catch (refreshErr) {
        return { ok: false, error: (refreshErr as Error).message ?? 'Token refresh failed', status: 401 };
      }
    }
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const msg =
      (res.data as { detail?: string; error?: string; title?: string })?.detail ||
      (res.data as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ||
      (res.data as { error?: { message?: string } })?.error?.message ||
      `HTTP ${res.status}`;
    return { ok: false, error: String(msg), status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? String(e) };
  }
}

/** List follower user ids (up to 100) for proactive welcome cron. */
export async function listTwitterFollowerIds(
  account: TwitterDmAccount & { platformUserId: string }
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const oauth1 = oauth1FromCredentials(account.credentialsJson);
  const url = `https://api.x.com/2/users/${account.platformUserId}/followers`;
  const params = { max_results: '100' };

  const fetchOnce = async (token: string) => {
    const headers = oauth1
      ? signTwitterRequest('GET', url, oauth1, params)
      : { Authorization: `Bearer ${token}` };
    return axios.get<{ data?: Array<{ id: string }> }>(url, {
      params,
      headers,
      timeout: 20_000,
      validateStatus: () => true,
    });
  };

  try {
    let res = await fetchOnce(account.accessToken);
    if (res.status === 401 && !oauth1 && account.refreshToken) {
      const refreshed = await refreshTwitterToken(account.refreshToken);
      res = await fetchOnce(refreshed.accessToken);
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: `Failed to list followers: HTTP ${res.status}` };
    }
    return { ok: true, ids: (res.data?.data ?? []).map((d) => d.id).filter(Boolean) };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? String(e) };
  }
}
