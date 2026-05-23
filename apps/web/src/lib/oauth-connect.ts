/** Message type posted from OAuth popup back to the opener tab after connect succeeds. */
export const OAUTH_COMPLETE_MESSAGE = 'agent4socials-oauth-complete';

/** Open platform OAuth in a new browser tab (keeps the app open in the current tab). */
export function openOAuthConnectUrl(url: string): Window | null {
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    // Popup blocked: fall back so connect still works.
    window.location.href = url;
    return null;
  }
  popup.focus();
  return popup;
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
