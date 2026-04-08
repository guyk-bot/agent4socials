/** Session backup when AppData blob is skipped (size quota) or not yet rehydrated after refresh. */

const PREFIX = 'a4s_dash_insights_v1';
const MAX_BYTES = 450_000;

function key(userId: string, accountId: string) {
  return `${PREFIX}_${userId}_${accountId}`;
}

export function readDashboardInsightsSession(userId: string, accountId: string): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key(userId, accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function writeDashboardInsightsSession(userId: string, accountId: string, payload: unknown): void {
  if (typeof window === 'undefined' || !payload || typeof payload !== 'object') return;
  try {
    const str = JSON.stringify(payload);
    if (str.length > MAX_BYTES) return;
    sessionStorage.setItem(key(userId, accountId), str);
  } catch {
    // quota or private mode
  }
}
