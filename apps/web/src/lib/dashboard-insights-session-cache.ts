/** Per-account insights cache using localStorage (survives refresh + new tabs)
 *  and sessionStorage (fast fallback within same tab). */

import { stripLegacyInsightsHint } from '@/lib/strip-legacy-insights-hint';

const SESSION_PREFIX = 'a4s_dash_insights_v1';
const LS_PREFIX = 'a4s_acct_insights';
const MAX_BYTES = 450_000;

function sessionKey(userId: string, accountId: string) {
  return `${SESSION_PREFIX}_${userId}_${accountId}`;
}

function lsKey(accountId: string) {
  return `${LS_PREFIX}_${accountId}`;
}

function slimInsights(payload: Record<string, unknown>): Record<string, unknown> {
  const o = { ...payload };
  for (const k of ['raw', 'facebookInsightsSync', 'facebookInsightPersistence', 'facebookDataSourceDebug'] as const) {
    delete o[k];
  }
  return o;
}

/** Read per-account insights from localStorage (no userId needed). */
export function readInsightsFromLocalStorage(accountId: string): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(lsKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return stripLegacyInsightsHint(parsed as { insightsHint?: string }) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readDashboardInsightsSession(userId: string, accountId: string): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(sessionKey(userId, accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return stripLegacyInsightsHint(parsed as { insightsHint?: string }) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function writeDashboardInsightsSession(userId: string, accountId: string, payload: unknown): void {
  if (typeof window === 'undefined' || !payload || typeof payload !== 'object') return;
  try {
    const cleaned = stripLegacyInsightsHint(payload as { insightsHint?: string });
    const str = JSON.stringify(slimInsights((cleaned ?? payload) as Record<string, unknown>));
    if (str.length > MAX_BYTES) return;
    sessionStorage.setItem(sessionKey(userId, accountId), str);
    localStorage.setItem(lsKey(accountId), str);
  } catch {
    // quota or private mode
  }
}
