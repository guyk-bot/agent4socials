'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, Trash2, CheckCircle } from 'lucide-react';

type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  variant?: 'confirm' | 'alert' | 'danger' | 'info';
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
  const isInfo = variant === 'info';
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const handleConfirm = () => { onConfirm?.(); onClose(); };

  const iconBg = isDanger ? 'bg-red-100' : isInfo ? 'bg-blue-100' : 'bg-amber-100';
  const Icon = isDanger ? Trash2 : isInfo ? Info : isAlert ? CheckCircle : AlertTriangle;
  const iconColor = isDanger ? 'text-red-600' : isInfo ? 'text-blue-600' : 'text-amber-600';
  const accentLine = isDanger ? 'bg-red-500' : isInfo ? 'bg-blue-500' : 'bg-amber-500';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        minHeight: '100dvh',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          minHeight: '100dvh',
          background: 'rgba(15,15,15,0.65)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
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
                className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className={
                isDanger
                  ? 'px-4 py-2 rounded-xl bg-red-600 text-sm font-medium text-white hover:bg-red-700 transition-colors'
                  : isInfo || isAlert
                  ? 'px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 transition-colors'
                  : 'px-4 py-2 rounded-xl bg-amber-500 text-sm font-medium text-white hover:bg-amber-600 transition-colors'
              }
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modal-pop {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
