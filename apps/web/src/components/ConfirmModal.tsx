'use client';

import React, { useEffect } from 'react';

type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  variant?: 'confirm' | 'alert' | 'danger';
};

export function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'confirm',
}: ConfirmModalProps) {
  const isAlert = variant === 'alert';
  const isDanger = variant === 'danger';

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h3
            id="confirm-modal-title"
            className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {title}
          </h3>
        )}
        <p id="confirm-modal-desc" className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {message}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {!isAlert && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={
              isDanger
                ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700'
                : 'btn-primary rounded-lg px-4 py-2 text-sm font-medium'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
