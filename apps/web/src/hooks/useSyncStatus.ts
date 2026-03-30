'use client';

/**
 * useSyncStatus — polls the sync-status endpoint for a connected account and
 * optionally triggers a background sync when data is stale.
 *
 * Usage:
 *   const { status, lastSyncedAgo, isSyncing, triggerSync } = useSyncStatus(accountId);
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

export type SyncStatusValue =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'partial'
  | 'error'
  | 'needs_reconnect'
  | 'unknown';

export interface SyncStatusData {
  status: SyncStatusValue;
  lastSuccessfulSyncAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncError: string | null;
  staleSinceMs: number | null;
  isStale: boolean;
  activeJob: { id: string; scope: string; syncType: string; startedAt: string | null } | null;
}

export interface UseSyncStatusResult {
  data: SyncStatusData | null;
  loading: boolean;
  /** Human-readable "X min ago" label, or null if never synced. */
  lastSyncedAgo: string | null;
  isSyncing: boolean;
  isStale: boolean;
  /** Trigger a manual sync for this account. Debounced automatically. */
  triggerSync: (scope?: string) => Promise<void>;
}

/** Poll interval while a sync is actively running (ms). */
const POLL_INTERVAL_SYNCING = 3_000;
/** Poll interval when idle/up-to-date (ms). */
const POLL_INTERVAL_IDLE = 60_000;
/** After this many ms without a fresh sync, automatically trigger one on mount. */
const AUTO_TRIGGER_THRESHOLD_MS = 30 * 60_000; // 30 min

function formatAgo(isoString: string | null): string | null {
  if (!isoString) return null;
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function useSyncStatus(
  accountId: string | null | undefined,
  options: {
    /** If true, automatically trigger a sync when data is stale on mount. Default: true. */
    autoTrigger?: boolean;
    /** Scope to sync when auto-triggering. Default: "full". */
    autoTriggerScope?: string;
  } = {}
): UseSyncStatusResult {
  const { autoTrigger = true, autoTriggerScope = 'full' } = options;

  const [data, setData] = useState<SyncStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const hasAutoTriggeredRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = data?.status === 'syncing' || data?.activeJob != null;

  const fetchStatus = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await api.get<SyncStatusData>(`/social/accounts/${accountId}/sync-status`);
      setData(res.data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [accountId]);

  const triggerSync = useCallback(async (scope?: string) => {
    if (!accountId) return;
    try {
      await api.post(`/social/accounts/${accountId}/sync`, {
        scope: scope ?? 'full',
        syncType: 'manual',
      });
      // Immediately poll for updated status
      setData((prev) => prev ? { ...prev, status: 'syncing' } : null);
      await fetchStatus();
    } catch { /* ignore */ }
  }, [accountId, fetchStatus]);

  // Initial load + polling
  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    fetchStatus();

    const schedule = () => {
      pollTimerRef.current = setTimeout(async () => {
        await fetchStatus();
        schedule();
      }, isSyncing ? POLL_INTERVAL_SYNCING : POLL_INTERVAL_IDLE);
    };
    schedule();

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Faster polling while syncing
  useEffect(() => {
    if (!isSyncing) return;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const id = setTimeout(fetchStatus, POLL_INTERVAL_SYNCING);
    pollTimerRef.current = id;
    return () => clearTimeout(id);
  }, [isSyncing, fetchStatus]);

  // Auto-trigger sync on mount when stale
  useEffect(() => {
    if (!autoTrigger || hasAutoTriggeredRef.current || !data) return;
    const shouldTrigger =
      data.isStale ||
      !data.lastSuccessfulSyncAt ||
      (data.staleSinceMs !== null && data.staleSinceMs > AUTO_TRIGGER_THRESHOLD_MS);
    if (shouldTrigger) {
      hasAutoTriggeredRef.current = true;
      triggerSync(autoTriggerScope);
    }
  }, [data, autoTrigger, autoTriggerScope, triggerSync]);

  return {
    data,
    loading,
    lastSyncedAgo: formatAgo(data?.lastSuccessfulSyncAt ?? null),
    isSyncing,
    isStale: data?.isStale ?? false,
    triggerSync,
  };
}
