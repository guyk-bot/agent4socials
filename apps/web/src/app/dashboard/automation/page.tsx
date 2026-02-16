'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageCircle, Send, UserPlus, MessageSquare, Loader2 } from 'lucide-react';
import api from '@/lib/api';

type AutomationSettings = {
  dmWelcomeEnabled: boolean;
  dmWelcomeMessage: string | null;
  dmNewFollowerEnabled: boolean;
  dmNewFollowerMessage: string | null;
};

const defaultSettings: AutomationSettings = {
  dmWelcomeEnabled: false,
  dmWelcomeMessage: null,
  dmNewFollowerEnabled: false,
  dmNewFollowerMessage: null,
};

export default function AutomationPage() {
  const [settings, setSettings] = useState<AutomationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AutomationSettings>('/automation/settings')
      .then((res) => {
        const data = res.data;
        if (data && typeof data.dmWelcomeEnabled === 'boolean') {
          setSettings({
            dmWelcomeEnabled: data.dmWelcomeEnabled,
            dmWelcomeMessage: data.dmWelcomeMessage ?? null,
            dmNewFollowerEnabled: data.dmNewFollowerEnabled ?? false,
            dmNewFollowerMessage: data.dmNewFollowerMessage ?? null,
          });
        }
        setLoadError(null);
      })
      .catch(() => {
        setSettings(defaultSettings);
        setLoadError('Could not load settings. You can still change options below and save.');
      })
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<AutomationSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    api
      .patch('/automation/settings', next)
      .then(() => setLoadError(null))
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 size={28} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-10">
      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Automation</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Auto-reply to comments with keywords (set per post in the Composer) and welcome DMs when someone messages you first.
        </p>
      </div>

      {/* Comment automation: set in Composer */}
      <div className="card border border-neutral-200 bg-neutral-50/50">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <MessageSquare size={20} className="text-neutral-500" />
          Keyword comment automation
        </h2>
        <p className="text-sm text-neutral-600 mt-1">
          When you create or schedule a post, enable &quot;Comment automation&quot; in the Composer to add keywords and an auto-reply template. Comments that contain your keywords will get an automatic reply (or a private DM on Instagram).
        </p>
        <Link
          href="/composer"
          className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Open Composer
        </Link>
      </div>

      {/* Auto-DM: welcome when someone DMs first */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <Send size={20} className="text-neutral-500" />
          Auto-DM when someone messages you first
        </h2>
        <p className="text-sm text-neutral-500">
          Send a welcome message automatically when someone starts a new conversation with you (Instagram, Facebook Page, or X). Messages are only sent within the platform&apos;s allowed window (e.g. 24 hours after they message).
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.dmWelcomeEnabled}
            onChange={(e) => update({ dmWelcomeEnabled: e.target.checked })}
            className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-neutral-700">Enable welcome message</span>
        </label>
        {settings.dmWelcomeEnabled && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Welcome message</label>
            <textarea
              value={settings.dmWelcomeMessage ?? ''}
              onChange={(e) => update({ dmWelcomeMessage: e.target.value || null })}
              placeholder="Hi! Thanks for reaching out. We'll get back to you soon."
              rows={4}
              className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            />
          </div>
        )}
        {saving && <p className="text-xs text-neutral-400 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Saving...</p>}
      </div>

      {/* Auto-DM new followers: not supported, show as disabled with note */}
      <div className="card space-y-4 border border-amber-100 bg-amber-50/30">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <UserPlus size={20} className="text-neutral-500" />
          Auto-DM new followers
        </h2>
        <p className="text-sm text-neutral-600">
          Instagram and most platforms do not allow apps to send the first DM to a user. You can only reply within 24 hours after they message you. So &quot;welcome new followers&quot; via DM is not supported by the APIs.
        </p>
        <label className="flex items-center gap-2 cursor-not-allowed opacity-70">
          <input type="checkbox" disabled className="rounded border-neutral-300" />
          <span className="text-sm text-neutral-500">Enable (not available via API)</span>
        </label>
        <p className="text-xs text-amber-800">
          You can still use &quot;Auto-DM when someone messages you first&quot; above to welcome anyone who DMs you.
        </p>
      </div>
    </div>
  );
}
