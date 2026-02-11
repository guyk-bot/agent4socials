'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import {
  Zap,
  Trash2,
  Copy,
  Check,
  Calendar,
  Gift,
  ArrowRight,
  X,
  AlertTriangle,
} from 'lucide-react';

const TRIAL_DAYS = 7;
const CONFIRM_TEXT = 'CONFIRM';

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

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

  const [shareCopied, setShareCopied] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    setShareLink(
      `${window.location.origin}/signup${user?.id ? `?ref=${user.id}` : ''}`
    );
  }, [user?.id]);

  const handleCopyShare = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const handleCancelClick = () => {
    setCancelModalOpen(true);
    setConfirmInput('');
    setCancelError('');
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
    // TODO: call API to cancel subscription when backend exists
    setCancelModalOpen(false);
    setConfirmInput('');
    setCancelError('');
  };

  return (
    <div className="max-w-2xl space-y-8">
      {/* Profile header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 border-2"
          style={{ backgroundColor: `${accent}18`, color: accent, borderColor: `${accent}40` }}
        >
          {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{user?.name || 'User'}</h1>
          <p className="text-neutral-500 mt-0.5">{user?.email}</p>
        </div>
      </div>

      {/* Trial card */}
      {trialStart && trialEnd && (
        <div className="card overflow-hidden border-2" style={{ borderColor: `${accent}30` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl" style={{ backgroundColor: `${accent}15` }}>
              <Calendar className="w-5 h-5" style={{ color: accent }} />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-900">Your trial</h2>
              <p className="text-sm text-neutral-500">
                Started {formatDate(trialStart)} · Ends {formatDate(trialEnd)}
              </p>
            </div>
          </div>
          {daysLeft > 0 && (
            <p className="text-sm font-medium" style={{ color: accent }}>
              {daysLeft} day{daysLeft !== 1 ? 's' : ''} left in your free trial
            </p>
          )}
        </div>
      )}

      {/* Upgrade to yearly */}
      <div
        className="card relative overflow-hidden border-2 hover:shadow-lg transition-shadow"
        style={{ borderColor: `${accent}40`, backgroundColor: `${accent}08` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-white shadow-sm">
              <Zap className="w-6 h-6" style={{ color: accent }} />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-900">Save with yearly</h2>
              <p className="text-sm text-neutral-600 mt-0.5">
                $20/year instead of $2.99/mo — save ~44%
              </p>
            </div>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-white shadow-md hover:shadow-lg transition-all"
            style={{ backgroundColor: accent }}
          >
            Upgrade
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Share with a friend */}
      <div className="card border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-emerald-100">
            <Gift className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">Share with a friend</h2>
            <p className="text-sm text-neutral-500">Give them your referral link — they sign up, you both win.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={shareLink}
            className="flex-1 px-3 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-600 truncate"
          />
          <button
            type="button"
            onClick={handleCopyShare}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
          >
            {shareCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {shareCopied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* Cancel subscription */}
      <div className="card border border-red-100 bg-red-50/30">
        <div className="flex items-center gap-3 mb-2">
          <Trash2 className="w-5 h-5 text-red-500" />
          <h2 className="font-semibold text-neutral-900">Cancel subscription</h2>
        </div>
        <p className="text-sm text-neutral-600 mb-4">
          You’ll keep access until the end of your billing period. This can’t be undone.
        </p>
        <button
          type="button"
          onClick={handleCancelClick}
          className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
        >
          Cancel subscription
        </button>
      </div>

      {/* Cancel confirmation modal */}
      {cancelModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={handleCancelClose}
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
                setConfirmInput(e.target.value);
                setCancelError('');
              }}
              placeholder="Type CONFIRM"
              className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-red-500 focus:border-red-500 uppercase font-mono text-sm"
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
        </div>
      )}
    </div>
  );
}
