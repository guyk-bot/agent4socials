'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LinkedInPostVisibility } from '@/lib/linkedin/publish-settings';

const OPTIONS: { value: LinkedInPostVisibility; label: string }[] = [
  { value: 'PUBLIC', label: 'Anyone (public)' },
  { value: 'CONNECTIONS', label: 'Connections only' },
];

const TRIGGER_CLASS =
  'w-full inline-flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm transition-colors hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-orange-500/70';

const MENU_CLASS =
  'absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-900';

const ITEM_CLASS =
  'w-full px-3 py-2 text-left text-sm text-neutral-900 transition-colors hover:bg-orange-50 hover:text-orange-950 dark:text-neutral-100 dark:hover:bg-orange-950/45 dark:hover:text-orange-100';

const ITEM_SELECTED_CLASS =
  'bg-orange-100 font-medium text-orange-950 dark:bg-orange-950/50 dark:text-orange-100';

type Props = {
  id?: string;
  value: LinkedInPostVisibility;
  onChange: (value: LinkedInPostVisibility) => void;
};

export function LinkedInVisibilitySelect({ id, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative mt-2">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="LinkedIn visibility"
        onClick={() => setOpen((v) => !v)}
        className={TRIGGER_CLASS}
      >
        <span>{selected.label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div role="listbox" aria-label="LinkedIn visibility" className={MENU_CLASS}>
          {OPTIONS.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`${ITEM_CLASS} ${isSelected ? ITEM_SELECTED_CLASS : ''}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
