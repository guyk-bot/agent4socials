'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import {
  Zap,
  Trash2,
  Calendar,
  Gift,
  ArrowRight,
  X,
  AlertTriangle,
  Share2,
  Check,
  FileText,
} from 'lucide-react';

const TRIAL_DAYS = 7;
const CONFIRM_TEXT = 'CONFIRM';
const SHARE_URL = 'https://agent4socials.com';
const SHARE_TEXT = 'Check out Agent4Socials: schedule posts and analytics for Instagram, YouTube, TikTok, Facebook and more.';

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const sharePlatforms = [
  {
    name: 'WhatsApp',
    href: () => `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + ' ' + SHARE_URL)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.865 9.865 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    name: 'Telegram',
    href: () => `https://t.me/share/url?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.5 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    name: 'Email',
    href: () => `mailto:?subject=${encodeURIComponent('Agent4Socials')}&body=${encodeURIComponent(SHARE_TEXT + '\n\n' + SHARE_URL)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    name: 'X (Twitter)',
    href: () => `https://twitter.com/intent/tweet?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    name: 'LinkedIn',
    href: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
];

export default function AccountPage() {
  const { user } = useAuth();
  const { primaryColor } = useWhiteLabel();
  const accent = primaryColor || '#525252';

  const trialStart = user?.createdAt ? new Date(user.createdAt) : null;
  const trialEnd = trialStart
    ? new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const now = new Date();
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))) : 0;

  const [shareOpen, setShareOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleSharePlatform = (getHref: () => string) => {
    window.open(getHref(), '_blank', 'noopener,noreferrer,width=600,height=500');
    setShareOpen(false);
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Agent4Socials',
          text: SHARE_TEXT,
          url: SHARE_URL,
        });
        setShareOpen(false);
      } catch (err) {
        // User cancelled or error
      }
    }
    setShareOpen(false);
  };

  const canNativeShare = mounted && typeof navigator !== 'undefined' && !!navigator.share;

  const handleCancelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCancelModalOpen(true);
    setConfirmInput('');
    setCancelError('');
    setCancelSuccess(false);
  };

  const handleCancelClose = () => {
    setCancelModalOpen(false);
    setConfirmInput('');
    setCancelError('');
  };

  const handleConfirmCancel = () => {
    if (confirmInput.trim() !== CONFIRM_TEXT) {
      setCancelError(`Please type ${CONFIRM_TEXT} to confirm.`);
      return;
    }
    setCancelSuccess(true);
    setCancelModalOpen(false);
    setConfirmInput('');
    setCancelError('');
  };

  const cancelModal = cancelModalOpen && mounted && createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleCancelClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cancel subscription"
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleCancelClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900">Cancel subscription?</h3>
        </div>
        <p className="text-sm text-neutral-600 mb-4">
          You’ll lose access at the end of your current period. To confirm, type <strong>CONFIRM</strong> below.
        </p>
        <input
          type="text"
          value={confirmInput}
          onChange={(e) => {
            setConfirmInput(e.target.value.toUpperCase());
            setCancelError('');
          }}
          placeholder="Type CONFIRM"
          className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-sm"
          autoFocus
        />
        {cancelError && <p className="mt-2 text-sm text-red-600">{cancelError}</p>}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={handleCancelClose}
            className="flex-1 py-2.5 rounded-lg font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200"
          >
            Keep subscription
          </button>
          <button
            type="button"
            onClick={handleConfirmCancel}
            disabled={confirmInput.trim() !== CONFIRM_TEXT}
            className="flex-1 py-2.5 rounded-lg font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel subscription
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Account</h1>
        <p className="text-neutral-500 text-sm mt-1">Manage your trial, plan, and sharing.</p>
      </div>

      {/* Profile card */}
      <div className="card rounded-2xl overflow-hidden border border-neutral-200/80 shadow-sm">
        <div className="flex items-center gap-4 p-1">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold shrink-0"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-neutral-900 truncate">{user?.name || 'User'}</p>
            <p className="text-sm text-neutral-500 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Trial card */}
      {trialStart && trialEnd && (
        <div className="card rounded-2xl border-2 shadow-sm" style={{ borderColor: `${accent}25` }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl shrink-0" style={{ backgroundColor: `${accent}12` }}>
              <Calendar className="w-5 h-5" style={{ color: accent }} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-neutral-900">Your trial</h2>
              <p className="text-sm text-neutral-500">
                {formatDate(trialStart)} to {formatDate(trialEnd)}
              </p>
              {daysLeft > 0 && (
                <p className="text-sm font-medium mt-1" style={{ color: accent }}>
                  {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade to yearly */}
      <div
        className="card rounded-2xl border-2 shadow-md hover:shadow-lg transition-shadow overflow-hidden"
        style={{ borderColor: `${accent}35`, backgroundColor: `${accent}06` }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-white shadow-sm shrink-0">
              <Zap className="w-6 h-6" style={{ color: accent }} />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-900">Save with yearly</h2>
              <p className="text-sm text-neutral-600">$19.99/year, save ~44%</p>
            </div>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-white shadow-md hover:opacity-95 transition-opacity"
            style={{ backgroundColor: accent }}
          >
            Upgrade <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Billing & Invoices */}
      <div className="card rounded-2xl border border-neutral-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-neutral-100 shrink-0">
            <FileText className="w-5 h-5 text-neutral-600" />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">Billing & invoices</h2>
            <p className="text-sm text-neutral-500">View and download your invoices.</p>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                <th className="text-left py-3 px-4 font-medium text-neutral-600">Date</th>
                <th className="text-left py-3 px-4 font-medium text-neutral-600">Description</th>
                <th className="text-right py-3 px-4 font-medium text-neutral-600">Amount</th>
                <th className="text-right py-3 px-4 font-medium text-neutral-600 w-24">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {/* Invoices will be loaded from API when billing is connected */}
              <tr>
                <td colSpan={4} className="py-8 px-4 text-center text-neutral-500">
                  No invoices yet. Invoices will appear here once you have billing history.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Share with a friend */}
      <div className="card rounded-2xl border border-neutral-200 bg-gradient-to-b from-emerald-50/50 to-white shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-emerald-100 shrink-0">
            <Gift className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">Share with a friend</h2>
            <p className="text-sm text-neutral-500">Share Agent4Socials on your favorite app, one tap to share the link.</p>
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShareOpen(!shareOpen)}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
          >
            <Share2 className="w-5 h-5" />
            Share
          </button>
          {shareOpen && (
            <>
              <div className="absolute left-0 right-0 top-full mt-2 p-3 rounded-xl border border-neutral-200 bg-white shadow-xl z-50">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-3">Share via</p>
                <div className="flex flex-wrap gap-2">
                  {sharePlatforms.map((platform) => (
                    <button
                      key={platform.name}
                      type="button"
                      onClick={() => handleSharePlatform(platform.href)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-colors text-neutral-700"
                      title={platform.name}
                    >
                      <span className="text-neutral-500">{platform.icon()}</span>
                      <span className="text-sm font-medium">{platform.name}</span>
                    </button>
                  ))}
                  {canNativeShare && (
                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-colors text-neutral-700"
                      title="More options"
                    >
                      <Share2 className="w-5 h-5 text-neutral-500" />
                      <span className="text-sm font-medium">More</span>
                    </button>
                  )}
                </div>
              </div>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShareOpen(false)}
                aria-hidden="true"
              />
            </>
          )}
        </div>
      </div>

      {/* Cancel subscription */}
      <div className="card rounded-2xl border border-red-200/80 bg-red-50/40 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-red-100 shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-neutral-900">Cancel subscription</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              You’ll keep access until the end of your billing period.
            </p>
            {cancelSuccess ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-600">
                <Check className="w-4 h-4" /> Cancellation requested
              </p>
            ) : (
              <button
                type="button"
                onClick={handleCancelClick}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
              >
                Cancel subscription
              </button>
            )}
          </div>
        </div>
      </div>

      {cancelModal}
    </div>
  );
}
