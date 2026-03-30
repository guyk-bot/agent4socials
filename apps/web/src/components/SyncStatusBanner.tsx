'use client';

/**
 * SyncStatusBanner — displays the current sync state for a connected account.
 *
 * Shows one of five states with appropriate messaging and a manual refresh button:
 *   1. Fresh / up-to-date
 *   2. Syncing in progress
 *   3. Partial data (some scopes failed)
 *   4. Error (last sync failed)
 *   5. Needs reconnect
 */

import React from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, WifiOff, Clock, Loader2 } from 'lucide-react';
import { useSyncStatus } from '@/hooks/useSyncStatus';

interface SyncStatusBannerProps {
  accountId: string | null | undefined;
  /** Platform name for context (e.g. "Instagram") */
  platform?: string;
  /** Additional className for the wrapper. */
  className?: string;
  /**
   * Compact mode: shows a single small pill instead of the full banner row.
   * Suitable for embedding near a header.
   */
  compact?: boolean;
}

export default function SyncStatusBanner({
  accountId,
  platform,
  className = '',
  compact = false,
}: SyncStatusBannerProps) {
  const { data, isSyncing, lastSyncedAgo, triggerSync } = useSyncStatus(accountId, {
    autoTrigger: true,
    autoTriggerScope: 'full',
  });

  if (!accountId || !data) return null;

  const { status, lastSyncError } = data;

  const config = getSyncConfig(status, isSyncing, platform, lastSyncedAgo, lastSyncError);

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs ${config.textColor} ${className}`}>
        <config.Icon size={13} className={isSyncing ? 'animate-spin' : ''} />
        <span>{config.shortLabel}</span>
        {!isSyncing && status !== 'needs_reconnect' && (
          <button
            type="button"
            onClick={() => triggerSync()}
            className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
            title="Refresh now"
          >
            <RefreshCw size={11} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm ${config.bg} ${config.textColor} ${className}`}
    >
      <config.Icon size={16} className={`shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{config.label}</span>
        {config.sub && (
          <span className="ml-1.5 opacity-70 text-xs">{config.sub}</span>
        )}
      </div>
      {!isSyncing && status !== 'needs_reconnect' && (
        <button
          type="button"
          onClick={() => triggerSync()}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium opacity-80 hover:opacity-100 transition-opacity"
          style={{ borderColor: 'currentColor' }}
          title="Refresh data now"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      )}
    </div>
  );
}

interface StatusConfig {
  label: string;
  shortLabel: string;
  sub: string | null;
  bg: string;
  textColor: string;
  Icon: React.ElementType;
}

function getSyncConfig(
  status: string,
  isSyncing: boolean,
  platform: string | undefined,
  lastSyncedAgo: string | null,
  lastSyncError: string | null
): StatusConfig {
  const platformLabel = platform ? `${platform} ` : '';

  if (isSyncing || status === 'syncing') {
    return {
      label: `Syncing ${platformLabel}data…`,
      shortLabel: 'Syncing…',
      sub: 'Latest data will appear shortly',
      bg: 'bg-blue-50',
      textColor: 'text-blue-700',
      Icon: Loader2,
    };
  }

  if (status === 'needs_reconnect') {
    return {
      label: `Reconnect ${platformLabel}to restore access to insights`,
      shortLabel: 'Reconnect needed',
      sub: null,
      bg: 'bg-amber-50',
      textColor: 'text-amber-700',
      Icon: WifiOff,
    };
  }

  if (status === 'error') {
    return {
      label: `We couldn't update this data right now. Showing the latest saved data.`,
      shortLabel: 'Sync error',
      sub: lastSyncError ? lastSyncError.slice(0, 80) : null,
      bg: 'bg-red-50',
      textColor: 'text-red-700',
      Icon: AlertTriangle,
    };
  }

  if (status === 'partial') {
    return {
      label: 'Some data is still loading',
      shortLabel: 'Partial data',
      sub: lastSyncedAgo ? `Last updated ${lastSyncedAgo}` : null,
      bg: 'bg-yellow-50',
      textColor: 'text-yellow-700',
      Icon: Clock,
    };
  }

  if (status === 'success' || status === 'idle') {
    return {
      label: 'Up to date',
      shortLabel: lastSyncedAgo ? `Updated ${lastSyncedAgo}` : 'Up to date',
      sub: lastSyncedAgo ? `Last updated ${lastSyncedAgo}` : null,
      bg: 'bg-emerald-50',
      textColor: 'text-emerald-700',
      Icon: CheckCircle2,
    };
  }

  // Fallback / unknown
  return {
    label: 'Checking sync status…',
    shortLabel: 'Checking…',
    sub: null,
    bg: 'bg-neutral-50',
    textColor: 'text-neutral-500',
    Icon: RefreshCw,
  };
}
