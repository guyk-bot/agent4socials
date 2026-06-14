'use client';

import React from 'react';

type Props = {
  checked: boolean;
  disabled: boolean;
  eligible: boolean;
  label: string;
  description: string;
  hint?: string | null;
  onChange: (checked: boolean) => void;
};

export function ChatDraftStoryOption({
  checked,
  disabled,
  eligible,
  label,
  description,
  hint,
  onChange,
}: Props) {
  return (
    <label
      className={`flex items-start gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2.5 py-2 ${
        eligible ? 'cursor-pointer' : 'cursor-not-allowed opacity-90'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || !eligible}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)] disabled:opacity-50"
      />
      <span className="text-xs text-neutral-700 dark:text-neutral-300">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">{label}</span>
        <span className="mt-0.5 block text-[11px] text-neutral-500 dark:text-neutral-400">{description}</span>
        {hint ? (
          <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-300">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
