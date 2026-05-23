/** Message type posted from OAuth popup back to the opener tab after connect succeeds. */
export const OAUTH_COMPLETE_MESSAGE = 'agent4socials-oauth-complete';

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
export function listenForOAuthComplete(onComplete: (accountId?: string) => void): () => void {
  const handler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== OAUTH_COMPLETE_MESSAGE) return;
    onComplete(typeof event.data.accountId === 'string' ? event.data.accountId : undefined);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** When OAuth finishes in a popup, notify opener and close this tab. */
export function notifyOAuthOpenerAndClose(accountId?: string): void {
  if (typeof window === 'undefined' || !window.opener) return;
  try {
    window.opener.postMessage(
      { type: OAUTH_COMPLETE_MESSAGE, accountId: accountId ?? null },
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
