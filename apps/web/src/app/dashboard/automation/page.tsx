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
          When someone comments on your post with a keyword you set (e.g. &quot;demo&quot;), they get an automatic reply. Set keywords and the reply text per post in the Composer (section 4).
        </p>
        <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-900">
          <p className="font-medium mb-2">Setup checklist (do all steps)</p>
          <p className="text-green-800 mb-2 text-xs">You can use the <strong>same cron job</strong> you already have (the one that calls <code className="bg-green-100/80 px-1 rounded">/api/cron/process-scheduled</code>). That endpoint now also runs comment automation, so no need to create a second job.</p>
          <ol className="list-decimal list-inside space-y-1.5 text-green-800 mb-2">
            <li><strong>Secret header.</strong> Your existing job should already send <code className="bg-green-100/80 px-1 rounded text-xs">X-Cron-Secret</code> (same as <code className="bg-green-100/80 px-1 rounded text-xs">CRON_SECRET</code> in Vercel). If not, add it so the app accepts the request.</li>
            <li><strong>Create a post with comment automation.</strong> In Composer: add your content and platforms, then in section 4 enable &quot;Keyword comment automation&quot;, add keywords (e.g. <code className="bg-green-100/80 px-1 rounded text-xs">demo</code>, <code className="bg-green-100/80 px-1 rounded text-xs">hello</code>) and the reply text (or different text per platform). Schedule or save the post.</li>
            <li><strong>Publish that post.</strong> The post must be published (status Posted) to the platforms you want. Use &quot;Publish now&quot; or schedule with &quot;Auto&quot; so it goes out; the cron only checks posts that are already published.</li>
            <li><strong>Wait for the cron.</strong> When your cron runs (e.g. every 5 minutes), it processes scheduled posts and then runs comment automation. When someone comments with one of your keywords, the next run will reply (usually within 5 minutes).</li>
          </ol>
          <p className="text-green-800 text-xs">One cron job calling <code className="bg-green-100/80 px-1 rounded break-all">/api/cron/process-scheduled</code> does both. Use &quot;TEST RUN&quot; to trigger once; response includes <code className="bg-green-100/80 px-1 rounded">commentAutomation</code> when it ran.</p>
        </div>
        <div className="mt-2 p-2.5 rounded-lg bg-white border border-neutral-200 text-xs">
          <p className="font-medium text-neutral-700 mb-1.5">Platform capabilities</p>
          <ul className="space-y-1 text-neutral-600">
            <li><strong>Keyword reply:</strong> Instagram (public or DM), Facebook, X, LinkedIn (public)</li>
            <li><strong>Welcome DM:</strong> Instagram, Facebook, X (when someone messages you first)</li>
            <li><strong>New-follower DM:</strong> X only</li>
          </ul>
        </div>
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

      {/* Auto-DM new followers (Twitter/X) */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <UserPlus size={20} className="text-neutral-500" />
          Welcome message to new followers (Twitter/X)
        </h2>
        <p className="text-sm text-neutral-600">
          When someone follows your X (Twitter) account, they will receive this message as a direct message. Set up a cron to call <code className="bg-neutral-100 px-1 rounded text-xs">/api/cron/welcome-followers</code> with the same <strong>X-Cron-Secret</strong> header (e.g. every 15 minutes) so new followers get the DM.
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.dmNewFollowerEnabled}
            onChange={(e) => update({ dmNewFollowerEnabled: e.target.checked })}
            className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-neutral-700">Send welcome DM to new followers</span>
        </label>
        {settings.dmNewFollowerEnabled && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Welcome message (sent once per new follower)</label>
            <textarea
              value={settings.dmNewFollowerMessage ?? ''}
              onChange={(e) => update({ dmNewFollowerMessage: e.target.value || null })}
              placeholder="Thanks for following! Here's what we share..."
              rows={4}
              className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            />
            <p className="mt-2 text-xs text-neutral-500">Add a cron (e.g. every 15 min) calling <code className="bg-neutral-100 px-1 rounded">/api/cron/welcome-followers</code> with header <code className="bg-neutral-100 px-1 rounded">X-Cron-Secret: YOUR_CRON_SECRET</code>.</p>
          </div>
        )}
        {saving && <p className="text-xs text-neutral-400 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Saving...</p>}
      </div>

      {/* Introduction DM: LinkedIn / new connections */}
      <div className="card border border-neutral-200 bg-neutral-50/50">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <UserPlus size={20} className="text-neutral-500" />
          Introduction DM for new LinkedIn connections or followers
        </h2>
        <p className="text-sm text-neutral-600 mt-1">
          <strong>X (Twitter) new followers:</strong> Use the &quot;Welcome message to new followers&quot; section above. Enable it, set your message, and add a cron for <code className="bg-neutral-100 px-1 rounded text-xs">/api/cron/welcome-followers</code> (same X-Cron-Secret, e.g. every 15 minutes).
        </p>
        <p className="text-sm text-neutral-600 mt-2">
          <strong>LinkedIn new connections:</strong> LinkedIn&apos;s API does not expose a way for apps to detect when someone connects with you or to send an automatic intro DM to new connections. So we cannot offer &quot;auto-DM when someone connects on LinkedIn&quot; at this time. When LinkedIn adds support, we can add it here.
        </p>
      </div>
    </div>
  );
}
