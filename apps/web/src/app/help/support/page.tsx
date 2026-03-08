'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Send, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const SUPPORT_EMAIL = 'support@agent4socials.com';

export default function SupportPage() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus('sending');
    setErrorMessage('');
    try {
      await api.post('/support', { subject: subject.trim() || undefined, message: message.trim() });
      setStatus('success');
      setSubject('');
      setMessage('');
    } catch (err: unknown) {
      setStatus('error');
      const msg = err && typeof err === 'object' && 'response' in err && err.response && typeof (err.response as { data?: { message?: string } }).data?.message === 'string'
        ? (err.response as { data: { message: string } }).data.message
        : 'Something went wrong. Please try again or email us directly.';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="max-w-xl mx-auto pb-16">
      <Link
        href="/help"
        className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-indigo-600 mb-8"
      >
        <ArrowLeft size={16} />
        Back to Help & Knowledge Base
      </Link>

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-8 sm:px-8 border-b border-neutral-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-indigo-100">
              <Mail className="w-6 h-6 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Open a support ticket</h1>
          </div>
          <p className="text-neutral-600 text-sm mt-1">
            Can&apos;t find what you need? Send us a message and we&apos;ll get back to you. Your ticket will be sent from your account email.
          </p>
        </div>

        <div className="px-6 py-8 sm:px-8">
          {status === 'success' && (
            <div className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 text-green-800 px-4 py-3 text-sm">
              <CheckCircle size={20} className="shrink-0" />
              <span>Your ticket was sent. We&apos;ll reply to {user?.email || 'your email'} as soon as we can.</span>
            </div>
          )}
          {status === 'error' && (
            <div className="mb-6 flex items-start gap-2 rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div>
                <p>{errorMessage}</p>
                <p className="mt-1">You can also email us directly: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline">{SUPPORT_EMAIL}</a></p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {user?.email && (
              <div>
                <label htmlFor="support-email" className="block text-xs font-medium text-neutral-500 mb-1">From (your account)</label>
                <input
                  id="support-email"
                  type="email"
                  value={user.email}
                  readOnly
                  className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
                />
              </div>
            )}
            <div>
              <label htmlFor="support-subject" className="block text-xs font-medium text-neutral-500 mb-1">Subject (optional)</label>
              <input
                id="support-subject"
                type="text"
                placeholder="e.g. Can't connect Instagram"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="support-message" className="block text-xs font-medium text-neutral-500 mb-1">Message <span className="text-red-500">*</span></label>
              <textarea
                id="support-message"
                placeholder="Describe your question or issue..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                maxLength={10000}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[120px]"
              />
            </div>
            <button
              type="submit"
              disabled={status === 'sending' || !message.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {status === 'sending' ? (
                <>Sending...</>
              ) : (
                <>
                  <Send size={18} />
                  Send ticket
                </>
              )}
            </button>
          </form>

          <p className="text-neutral-500 text-xs mt-6">
            Or email us directly: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-600 hover:underline">{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
