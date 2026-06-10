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
 * Open a blank tab synchronously on the user's click (before any await).
 * Pass the returned window to `navigateOAuthConnect` once the OAuth URL is ready.
 */
export function prepareOAuthConnectPopup(): Window | null {
  try {
    return window.open('about:blank', '_blank');
  } catch {
    return null;
  }
}

export function closeOAuthConnectPopup(popup: Window | null | undefined): void {
  if (!popup || popup.closed) return;
  try {
    popup.close();
  } catch {
    /* ignore */
  }
}

/**
 * Send the user to platform OAuth. Prefer navigating a popup opened via `prepareOAuthConnectPopup`.
 * Falls back to this tab when the popup was blocked or is unavailable.
 */
export function navigateOAuthConnect(url: string, popup: Window | null): OpenOAuthConnectResult {
  if (popup && !popup.closed) {
    try {
      popup.location.replace(url);
      try {
        popup.focus();
      } catch {
        /* ignore */
      }
      return { opened: true, blocked: false };
    } catch {
      closeOAuthConnectPopup(popup);
    }
  }
  try {
    window.location.assign(url);
    return { opened: true, blocked: false };
  } catch {
    return { opened: false, blocked: true };
  }
}

/**
 * Open platform OAuth in a new tab when the URL is already known (same turn as the click).
 * Do not use noopener here: it breaks window.opener and leaves two dashboard tabs open.
 */
export function openOAuthConnectUrl(url: string): OpenOAuthConnectResult {
  const popup = window.open(url, '_blank');
  if (popup) {
    try {
      popup.focus();
    } catch {
      /* ignore */
    }
    return { opened: true, blocked: false };
  }
  return navigateOAuthConnect(url, null);
}

/** Origins allowed to post OAuth completion back to the funnel / dashboard opener. */
export function isTrustedOAuthMessageOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    if (host === 'izop.ai' || host === 'www.izop.ai') return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (typeof window !== 'undefined' && origin === window.location.origin) return true;
  } catch {
    return false;
  }
  return false;
}

/** Listen for OAuth completion from a popup tab. Returns cleanup. */
export function listenForOAuthComplete(onComplete: (payload: OAuthCompletePayload) => void): () => void {
  const handler = (event: MessageEvent) => {
    if (!isTrustedOAuthMessageOrigin(event.origin)) return;
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
