'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type PostHistoryFilterOption = {
  value: string;
  label: string;
};

const TRIGGER_CLASS =
  'inline-flex min-w-[8.5rem] items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-orange-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-orange-500/60';

const MENU_CLASS =
  'absolute right-0 z-30 mt-1 min-w-full overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900';

const ITEM_CLASS =
  'w-full px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-orange-50 hover:text-orange-950 dark:text-neutral-100 dark:hover:bg-orange-950/40 dark:hover:text-orange-100';

const ITEM_SELECTED_CLASS =
  'bg-orange-100/90 font-medium text-orange-950 dark:bg-orange-950/50 dark:text-orange-100';

export function PostHistoryFilterDropdown({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PostHistoryFilterOption[];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={TRIGGER_CLASS}
      >
        <span className="truncate">{selected?.label ?? ariaLabel}</span>
        <ChevronDown size={16} className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div role="listbox" aria-label={ariaLabel} className={MENU_CLASS}>
          {options.map((opt) => {
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
