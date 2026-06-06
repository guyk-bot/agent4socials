'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import BrandContextForm from '@/components/brand-context/BrandContextForm';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AysopBrandContextDrawer({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close brand context panel"
        className="fixed inset-0 z-[8100] bg-black/55 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="aysop-brand-context-title"
        className="fixed top-14 right-0 bottom-0 z-[8101] flex w-full max-w-xl flex-col border-l border-neutral-800 bg-neutral-950 text-chrome-text shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
          <h2 id="aysop-brand-context-title" className="text-base font-semibold text-chrome-text">
            Brand Context
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-900 hover:text-chrome-text transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <BrandContextForm variant="drawer" />
        </div>
      </aside>
    </>,
    document.body
  );
}
