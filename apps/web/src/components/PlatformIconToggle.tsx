'use client';

import React from 'react';

export type PlatformIconToggleProps = {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
};

/** Square platform chip (icon only), matches Composer Select Platforms styling. */
export function PlatformIconToggle({ label, icon, active, onClick, disabled = false }: PlatformIconToggleProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`w-12 h-12 sm:w-[3.25rem] sm:h-[3.25rem] rounded-xl border-2 flex items-center justify-center transition-all duration-200 shrink-0 ${
        disabled
          ? 'border-neutral-100 bg-neutral-50 text-neutral-300 cursor-not-allowed opacity-50 dark:border-neutral-800 dark:bg-neutral-900'
          : active
            ? 'border-slate-300 sidebar-item-selected text-neutral-900 shadow-sm dark:text-neutral-100'
            : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-100/80 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800'
      }`}
    >
      <span className="flex items-center justify-center w-9 h-9 shrink-0">{icon}</span>
    </button>
  );
}
