/**
 * Legacy fire-and-forget inbox warm. Prefer AppDataContext systematic sync (every 2 min).
 * Still used sparingly after connect; not called when opening Inbox.
 */
import api from '@/lib/api';

const WARM_KEY = 'inbox_warm_ts';
const WARM_INTERVAL_MS = 15 * 60 * 1000;

/** Start loading DM threads into server cache without opening Inbox. */
export function triggerInboxWarmClient(force = false): void {
  if (typeof window === 'undefined') return;
  if (!force) {
    try {
      const last = Number(sessionStorage.getItem(WARM_KEY) ?? '0');
      if (Date.now() - last < WARM_INTERVAL_MS) return;
    } catch {
      /* ignore */
    }
  }
  try {
    sessionStorage.setItem(WARM_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  void api.post('/inbox/warm').catch(() => {});
}
