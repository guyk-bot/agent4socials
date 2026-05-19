'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, Trash2, CheckCircle, Loader2 } from 'lucide-react';

type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  variant?: 'confirm' | 'alert' | 'danger' | 'info';
  /** `high` stacks above full-screen overlays that use z-index 9999 (e.g. composer publishing). */
  stack?: 'default' | 'high';
  /** If false, the primary button does not call `onClose` after `onConfirm` (use when confirm navigates away). Default true. */
  closeOnConfirm?: boolean;
  /** When true, shows a spinner on the confirm button and blocks dismiss until loading ends. */
  confirmLoading?: boolean;
  /** Label while `confirmLoading` is true (defaults to confirmLabel). */
  confirmLoadingLabel?: string;
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
  stack = 'default',
  closeOnConfirm = true,
  confirmLoading = false,
  confirmLoadingLabel,
}: ConfirmModalProps) {
  const isAlert = variant === 'alert';
  const isDanger = variant === 'danger';
  const isInfo = variant === 'info';
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (confirmLoading) return;
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose, confirmLoading]);

  if (!open || !mounted) return null;

  const handleConfirm = () => {
    const result = onConfirm?.();
    if (result != null && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).finally(() => {
        if (closeOnConfirm) onClose();
      });
    } else if (closeOnConfirm) {
      onClose();
    }
  };

  const iconBg = isDanger ? 'bg-red-100' : isInfo ? 'bg-blue-100' : 'bg-amber-100';
  const Icon = isDanger ? Trash2 : isInfo ? Info : isAlert ? CheckCircle : AlertTriangle;
  const iconColor = isDanger ? 'text-red-600' : isInfo ? 'text-blue-600' : 'text-amber-600';
  const accentLine = isDanger ? 'bg-red-500' : isInfo ? 'bg-blue-500' : 'bg-amber-500';
  const zBackdrop = stack === 'high' ? 'z-[10140]' : 'z-[8500]';
  const zDialog = stack === 'high' ? 'z-[10150]' : 'z-[8600]';

  return createPortal(
    <>
      <div
        className={`fixed ${zBackdrop} min-h-screen min-h-[100dvh] min-h-[100lvh] w-screen`}
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15,15,15,0.65)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={() => {
          if (!confirmLoading) onClose();
        }}
        aria-hidden="true"
      />
      <div
        className={`fixed inset-0 ${zDialog} flex items-center justify-center p-4 pointer-events-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
      >
      <div
        className="pointer-events-auto relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'modal-pop 0.18s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        {/* Accent line at top */}
        <div className={`h-1 w-full ${accentLine}`} />

        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center mb-4`}>
            <Icon size={22} className={iconColor} />
          </div>

          {title && (
            <h3 id="confirm-modal-title" className="text-base font-semibold text-neutral-900 mb-1">
              {title}
            </h3>
          )}
          <p id="confirm-modal-desc" className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
            {message}
          </p>

          <div className="mt-6 flex gap-3 justify-end">
            {!isAlert && (
              <button
                type="button"
                onClick={onClose}
                disabled={confirmLoading}
                className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmLoading}
              className={
                isDanger
                  ? 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed min-w-[7.5rem]'
                  : isInfo || isAlert
                  ? 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-sm font-medium text-white hover:bg-orange-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed min-w-[7.5rem]'
                  : 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed min-w-[7.5rem]'
              }
            >
              {confirmLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
                  {confirmLoadingLabel ?? confirmLabel}
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
      </div>

      <style>{`
        @keyframes modal-pop {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>,
    document.body,
  );
}
