/** Message type posted from OAuth popup back to the opener tab after connect succeeds. */
export const OAUTH_COMPLETE_MESSAGE = 'agent4socials-oauth-complete';

const OAUTH_CONNECT_IN_FLIGHT_KEY = 'agent4socials_oauth_connect_in_flight';
export const OAUTH_CONNECT_IN_FLIGHT_EVENT = 'izop-oauth-connect-in-flight';
export const ACCOUNT_DISCONNECTED_EVENT = 'izop-account-disconnected';

/** Max time to show sidebar "Connecting…" if OAuth never completes. */
export const OAUTH_IN_FLIGHT_TTL_MS = 90 * 1000;

type OAuthInFlightRecord = {
  platform: string;
  startedAt: number;
};

function parseInFlightRaw(raw: string | null): OAuthInFlightRecord | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as OAuthInFlightRecord;
    if (parsed?.platform && typeof parsed.startedAt === 'number') {
      return { platform: parsed.platform.trim().toUpperCase(), startedAt: parsed.startedAt };
    }
  } catch {
    /* legacy plain platform string */
  }
  return { platform: raw.trim().toUpperCase(), startedAt: 0 };
}

function readInFlightRecord(): OAuthInFlightRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const record = parseInFlightRaw(sessionStorage.getItem(OAUTH_CONNECT_IN_FLIGHT_KEY));
    if (!record?.platform) return null;
    if (record.startedAt <= 0) {
      clearOAuthConnectInFlight();
      return null;
    }
    const age = Date.now() - record.startedAt;
    if (record.startedAt > 0 && age > OAUTH_IN_FLIGHT_TTL_MS) {
      clearOAuthConnectInFlight();
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

function urlIndicatesOAuthPending(platform: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const p = platform.trim().toUpperCase();
    if (params.get('connecting') === '1' && params.get('newPlatform')?.trim().toUpperCase() === p) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Persist which platform OAuth is in progress (sidebar loading until callback completes). */
export function storeOAuthConnectInFlight(platform: string): void {
  if (typeof window === 'undefined') return;
  const p = platform.trim().toUpperCase();
  if (!p) return;
  try {
    const payload: OAuthInFlightRecord = { platform: p, startedAt: Date.now() };
    sessionStorage.setItem(OAUTH_CONNECT_IN_FLIGHT_KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event(OAUTH_CONNECT_IN_FLIGHT_EVENT));
  } catch {
    /* ignore */
  }
}

export function readOAuthConnectInFlight(): string | null {
  return readInFlightRecord()?.platform ?? null;
}

export function clearOAuthConnectInFlight(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(OAUTH_CONNECT_IN_FLIGHT_KEY);
    window.dispatchEvent(new Event(OAUTH_CONNECT_IN_FLIGHT_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearOAuthConnectInFlightForPlatform(platform: string): void {
  const p = platform.trim().toUpperCase();
  if (!p) return;
  if (readOAuthConnectInFlight() === p) {
    clearOAuthConnectInFlight();
  }
}

/** Instant client cleanup after disconnect so sidebar/dashboard never stay on "Connecting…". */
export function resetConnectUiAfterAccountDisconnect(platform: string): void {
  if (typeof window === 'undefined') return;
  clearOAuthConnectInFlight();
  try {
    const url = new URL(window.location.href);
    const p = platform.trim().toUpperCase();
    const connectParam = url.searchParams.get('connect')?.trim().toUpperCase();
    const newPlatform = url.searchParams.get('newPlatform')?.trim().toUpperCase();
    if (
      connectParam === p ||
      newPlatform === p ||
      url.searchParams.get('connecting') === '1'
    ) {
      url.searchParams.delete('connect');
      url.searchParams.delete('connecting');
      url.searchParams.delete('newPlatform');
      url.searchParams.delete('newUsername');
      url.searchParams.delete('newPic');
      url.searchParams.delete('accountId');
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', next);
    }
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(ACCOUNT_DISCONNECTED_EVENT, {
        detail: { platform: platform.trim().toUpperCase() },
      })
    );
  } catch {
    /* ignore */
  }
}

/** True while OAuth is in flight or the dashboard is finishing a fresh connect redirect. */
export function isPlatformOAuthPending(platform: string): boolean {
  const p = platform.trim().toUpperCase();
  if (!p) return false;
  if (urlIndicatesOAuthPending(p)) return true;
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connecting') === '1' && params.get('accountId') && !params.get('connect')) {
        const urlPlatform = params.get('newPlatform')?.trim().toUpperCase();
        if (urlPlatform === p) return true;
      }
    } catch {
      /* ignore */
    }
  }
  const inFlight = readInFlightRecord();
  if (inFlight?.platform === p) return true;
  return false;
}

/**
 * When the OAuth popup closes, the callback tab may still be saving the account.
 * Do not clear in-flight here; use {@link pollOAuthConnectAccount} and {@link watchOAuthConnectTimeout}.
 */
export function watchOAuthConnectPopup(
  popup: Window | null | undefined,
  platform: string,
  onPopupClosed?: () => void
): () => void {
  if (typeof window === 'undefined' || !popup || popup.closed) return () => {};
  let fired = false;
  const timer = window.setInterval(() => {
    if (!popup.closed) return;
    window.clearInterval(timer);
    if (fired) return;
    fired = true;
    onPopupClosed?.();
  }, 400);
  return () => window.clearInterval(timer);
}

type OAuthAccountRow = {
  id: string;
  platform: string;
  username?: string | null;
  profilePicture?: string | null;
};

/** Fallback when postMessage from the OAuth popup is missed: poll until the account appears. */
export function pollOAuthConnectAccount(
  platform: string,
  fetchAccounts: () => Promise<OAuthAccountRow[]>,
  onFound: (account: OAuthAccountRow) => void,
  opts?: { intervalMs?: number; maxMs?: number }
): () => void {
  if (typeof window === 'undefined') return () => {};
  const p = platform.trim().toUpperCase();
  const intervalMs = opts?.intervalMs ?? 2_000;
  const maxMs = opts?.maxMs ?? OAUTH_IN_FLIGHT_TTL_MS;
  const started = Date.now();
  let stopped = false;

  const tick = async (): Promise<boolean> => {
    if (stopped || readOAuthConnectInFlight() !== p) return true;
    if (Date.now() - started > maxMs) return true;
    try {
      const list = await fetchAccounts();
      const connected = list.find((a) => a.platform === p);
      if (connected?.id) {
        onFound(connected);
        return true;
      }
    } catch {
      /* retry */
    }
    return false;
  };

  const timer = window.setInterval(() => {
    void tick().then((done) => {
      if (done) window.clearInterval(timer);
    });
  }, intervalMs);
  void tick();

  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

/** Deliver OAuth success to the opener when polling finds the linked account. */
export function notifyOAuthCompleteLocally(account: OAuthAccountRow): void {
  if (typeof window === 'undefined') return;
  try {
    window.postMessage(
      {
        type: OAUTH_COMPLETE_MESSAGE,
        accountId: account.id,
        platform: account.platform,
        username: account.username ?? null,
        profilePicture: account.profilePicture ?? null,
      },
      window.location.origin
    );
  } catch {
    /* ignore */
  }
}

/** Auto-clear stuck OAuth UI if callback never returns (e.g. 504 on callback route). */
export function watchOAuthConnectTimeout(platform: string, onTimeout: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const p = platform.trim().toUpperCase();
  const timer = window.setInterval(() => {
    const record = readInFlightRecord();
    if (!record || record.platform !== p) {
      window.clearInterval(timer);
      return;
    }
    if (Date.now() - record.startedAt > OAUTH_IN_FLIGHT_TTL_MS) {
      clearOAuthConnectInFlight();
      window.clearInterval(timer);
      onTimeout();
    }
  }, 1000);
  return () => window.clearInterval(timer);
}

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
