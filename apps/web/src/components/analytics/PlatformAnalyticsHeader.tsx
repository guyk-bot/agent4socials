'use client';

import React from 'react';
import { RefreshCw, HelpCircle, ExternalLink } from 'lucide-react';

export interface PlatformAnalyticsHeaderAccount {
  id: string;
  platform: string;
  username?: string | null;
  profilePicture?: string | null;
}

export interface PlatformAnalyticsHeaderProps {
  account: PlatformAnalyticsHeaderAccount;
  profileUrl: string;
  platformLabel: string;
  icon: React.ReactNode;
  onReconnect: () => void;
  onDisconnectClick: () => void;
  onCheckPermissions?: () => void;
  reconnectLoading?: boolean;
  checkPermissionsLoading?: boolean;
  disconnectLoading?: boolean;
  /** Optional extra action buttons (e.g. Twitter "Enable image upload") */
  extraActions?: React.ReactNode;
  /** When true, only show compact profile (avatar + name + link). No Reconnect/Check/Disconnect. Use on analytics page; manage accounts on Accounts page. */
  compact?: boolean;
  className?: string;
}

export function PlatformAnalyticsHeader({
  account,
  profileUrl,
  platformLabel,
  icon,
  onReconnect,
  onDisconnectClick,
  onCheckPermissions,
  reconnectLoading = false,
  checkPermissionsLoading = false,
  disconnectLoading = false,
  extraActions,
  compact = false,
  className = '',
}: PlatformAnalyticsHeaderProps) {
  const profileLink = (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 bg-white rounded-xl border border-neutral-200/80 shadow-sm hover:border-neutral-300 hover:shadow transition-all duration-150 w-fit ${
        compact ? 'py-1.5 pr-2.5 pl-1.5 gap-2' : 'p-3 gap-3 rounded-2xl border-[rgba(0,0,0,0.06)] shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
      }`}
    >
      <div
        className={`rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden shrink-0 ${
          compact ? 'w-8 h-8' : 'w-12 h-12'
        }`}
      >
        {account.profilePicture ? (
          <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className={compact ? '[&>svg]:w-4 [&>svg]:h-4' : ''}>{icon}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className={`font-semibold text-[#111827] truncate ${compact ? 'text-sm' : ''}`}>
          {account.username || account.platform}
        </p>
        <p className={`text-[#6b7280] flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
          {platformLabel}
          <ExternalLink size={compact ? 10 : 12} className="opacity-70 shrink-0" />
          <span className="sr-only">Open profile</span>
        </p>
      </div>
    </a>
  );

  if (compact) {
    return <div className={className}>{profileLink}</div>;
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        {profileLink}
        <button
          type="button"
          onClick={onReconnect}
          disabled={!!reconnectLoading}
          title="Reconnect account"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 bg-white text-[#374151] text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {reconnectLoading ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {reconnectLoading ? 'Reconnecting…' : 'Reconnect'}
        </button>
        {onCheckPermissions && (
          <button
            type="button"
            onClick={onCheckPermissions}
            disabled={!!checkPermissionsLoading}
            title="Validate token and show granted scopes"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 bg-white text-[#374151] text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {checkPermissionsLoading ? <RefreshCw size={16} className="animate-spin" /> : <HelpCircle size={16} />}
            {checkPermissionsLoading ? 'Checking…' : 'Check permissions'}
          </button>
        )}
        {extraActions}
        <button
          type="button"
          onClick={onDisconnectClick}
          disabled={!!disconnectLoading}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-white text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disconnectLoading ? <RefreshCw size={16} className="animate-spin" aria-hidden /> : null}
          {disconnectLoading ? 'Disconnecting…' : 'Disconnect account'}
        </button>
      </div>
    </div>
  );
}
