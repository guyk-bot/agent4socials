'use client';

import React from 'react';
import { Lock } from 'lucide-react';

export interface AnalyticsUpgradeGateProps {
  title?: string;
  description?: string;
  buttonLabel?: string;
  onUpgrade?: () => void;
  className?: string;
}

const DEFAULT_TITLE = 'Unlock deeper analytics insights';
const DEFAULT_DESC = 'Upgrade your plan to access full history and advanced reports.';
const DEFAULT_BUTTON = 'Upgrade Plan';

export function AnalyticsUpgradeGate({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESC,
  buttonLabel = DEFAULT_BUTTON,
  onUpgrade,
  className = '',
}: AnalyticsUpgradeGateProps) {
  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm ${className}`}
      aria-hidden
    >
      <div className="text-center p-6 max-w-sm">
        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
          <Lock size={24} className="text-neutral-500" />
        </div>
        <p className="text-sm font-semibold text-[#111827]">{title}</p>
        <p className="text-xs text-[#6b7280] mt-1">{description}</p>
        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-[#5ff6fd] to-[#b030ad] text-neutral-900 font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </div>
  );
}
