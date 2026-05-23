/** Message type posted from OAuth popup back to the opener tab after connect succeeds. */
export const OAUTH_COMPLETE_MESSAGE = 'agent4socials-oauth-complete';

export type OAuthCompletePayload = {
  accountId?: string;
  platform?: string;
  username?: string;
  profilePicture?: string | null;
};

export type OpenOAuthConnectResult = { opened: boolean; blocked: boolean };

/**
 * Open platform OAuth in a new tab. Keeps opener so the callback can postMessage back.
 * Do not use noopener here: it breaks window.opener and leaves two dashboard tabs open.
 */
export function openOAuthConnectUrl(url: string): OpenOAuthConnectResult {
  const popup = window.open(url, '_blank');
  if (!popup) {
    return { opened: false, blocked: true };
  }
  try {
    popup.focus();
  } catch {
    /* ignore */
  }
  return { opened: true, blocked: false };
}

/** Listen for OAuth completion from a popup tab. Returns cleanup. */
export function listenForOAuthComplete(onComplete: (payload: OAuthCompletePayload) => void): () => void {
  const handler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== OAUTH_COMPLETE_MESSAGE) return;
    const payload: OAuthCompletePayload = {};
    if (typeof event.data.accountId === 'string') payload.accountId = event.data.accountId;
    if (typeof event.data.platform === 'string') payload.platform = event.data.platform;
    if (typeof event.data.username === 'string') payload.username = event.data.username;
    if (typeof event.data.profilePicture === 'string') payload.profilePicture = event.data.profilePicture;
    onComplete(payload);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** When OAuth finishes in a popup, notify opener and close this tab. */
export function notifyOAuthOpenerAndClose(payload: OAuthCompletePayload = {}): void {
  if (typeof window === 'undefined' || !window.opener) return;
  try {
    window.opener.postMessage(
      {
        type: OAUTH_COMPLETE_MESSAGE,
        accountId: payload.accountId ?? null,
        platform: payload.platform ?? null,
        username: payload.username ?? null,
        profilePicture: payload.profilePicture ?? null,
      },
      window.location.origin
    );
  } catch {
    /* ignore cross-origin or closed opener */
  }
  window.setTimeout(() => {
    try {
      window.close();
    } catch {
      /* ignore */
    }
  }, 400);
}
