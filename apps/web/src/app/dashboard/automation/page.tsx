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

type PlatformCapability = {
  platform: string;
  keywordCommentAutomation: boolean;
  autoDmWhenMessagedFirst: boolean;
  welcomeMessageToNewFollower: boolean;
};

const defaultSettings: AutomationSettings = {
  dmWelcomeEnabled: false,
  dmWelcomeMessage: null,
  dmNewFollowerEnabled: false,
  dmNewFollowerMessage: null,
};
const AUTOMATION_SETTINGS_CACHE_KEY = 'agent4socials.automation.settings.v1';

const PLATFORM_CAPABILITIES: PlatformCapability[] = [
  {
    platform: 'Instagram',
    keywordCommentAutomation: true,
    autoDmWhenMessagedFirst: true,
    welcomeMessageToNewFollower: false,
  },
  {
    platform: 'Facebook',
    keywordCommentAutomation: true,
    autoDmWhenMessagedFirst: true,
    welcomeMessageToNewFollower: false,
  },
  {
    platform: 'X (Twitter)',
    keywordCommentAutomation: true,
    autoDmWhenMessagedFirst: true,
    welcomeMessageToNewFollower: true,
  },
  {
    platform: 'LinkedIn',
    keywordCommentAutomation: true,
    autoDmWhenMessagedFirst: false,
    welcomeMessageToNewFollower: false,
  },
  {
    platform: 'Pinterest',
    keywordCommentAutomation: false,
    autoDmWhenMessagedFirst: false,
    welcomeMessageToNewFollower: false,
  },
  {
    platform: 'TikTok',
    keywordCommentAutomation: false,
    autoDmWhenMessagedFirst: false,
    welcomeMessageToNewFollower: false,
  },
  {
    platform: 'YouTube',
    keywordCommentAutomation: true,
    autoDmWhenMessagedFirst: false,
    welcomeMessageToNewFollower: false,
  },
];

export default function AutomationPage() {
  const [settings, setSettings] = useState<AutomationSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Render instantly from local cache when possible, then refresh in background.
    try {
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem(AUTOMATION_SETTINGS_CACHE_KEY) ?? localStorage.getItem(AUTOMATION_SETTINGS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AutomationSettings>;
          if (typeof parsed.dmWelcomeEnabled === 'boolean') {
            setSettings({
              dmWelcomeEnabled: parsed.dmWelcomeEnabled,
              dmWelcomeMessage: parsed.dmWelcomeMessage ?? null,
              dmNewFollowerEnabled: parsed.dmNewFollowerEnabled ?? false,
              dmNewFollowerMessage: parsed.dmNewFollowerMessage ?? null,
            });
          }
        } else {
          setLoading(true);
        }
      }
    } catch {
      setLoading(true);
    }

    const ctrl = new AbortController();
    // Fail fast so this page never stays blocked behind a full-screen loader.
    const t = window.setTimeout(() => ctrl.abort(), 12_000);
    let cancelled = false;
    api
      .get<AutomationSettings>('/automation/settings', { signal: ctrl.signal })
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        if (data && typeof data.dmWelcomeEnabled === 'boolean') {
          const next = {
            dmWelcomeEnabled: data.dmWelcomeEnabled,
            dmWelcomeMessage: data.dmWelcomeMessage ?? null,
            dmNewFollowerEnabled: data.dmNewFollowerEnabled ?? false,
            dmNewFollowerMessage: data.dmNewFollowerMessage ?? null,
          };
          setSettings(next);
          try {
            if (typeof window !== 'undefined') {
              const str = JSON.stringify(next);
              sessionStorage.setItem(AUTOMATION_SETTINGS_CACHE_KEY, str);
              localStorage.setItem(AUTOMATION_SETTINGS_CACHE_KEY, str);
            }
          } catch {
            // ignore storage errors
          }
        }
        setLoadError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSettings(defaultSettings);
        setLoadError('Could not load settings. You can still change options below and save.');
      })
      .finally(() => {
        window.clearTimeout(t);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, []);

  const update = (patch: Partial<AutomationSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      if (typeof window !== 'undefined') {
        const str = JSON.stringify(next);
        sessionStorage.setItem(AUTOMATION_SETTINGS_CACHE_KEY, str);
        localStorage.setItem(AUTOMATION_SETTINGS_CACHE_KEY, str);
      }
    } catch {
      // ignore storage errors
    }
    setSaving(true);
    api
      .patch('/automation/settings', next)
      .then(() => setLoadError(null))
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-10">
      {loading && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          Loading automation settings…
        </div>
      )}
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

      <div className="card border border-neutral-200 bg-neutral-50/50">
        <h2 className="font-semibold text-neutral-900">Platform automation capabilities</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Overview of what is currently available for each platform.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left border-b border-neutral-200">
                <th className="py-2 pr-3 font-medium text-neutral-700">Platform</th>
                <th className="py-2 pr-3 font-medium text-neutral-700">Keyword comment automation</th>
                <th className="py-2 pr-3 font-medium text-neutral-700">Auto-DM when messaged first</th>
                <th className="py-2 font-medium text-neutral-700">Welcome message to new follower</th>
              </tr>
            </thead>
            <tbody>
              {PLATFORM_CAPABILITIES.map((row) => (
                <tr key={row.platform} className="border-b border-neutral-100 last:border-b-0">
                  <td className="py-2.5 pr-3 text-neutral-900 font-medium">{row.platform}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.keywordCommentAutomation ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'}`}>
                      {row.keywordCommentAutomation ? 'Available' : 'Not available'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.autoDmWhenMessagedFirst ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'}`}>
                      {row.autoDmWhenMessagedFirst ? 'Available' : 'Not available'}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.welcomeMessageToNewFollower ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'}`}>
                      {row.welcomeMessageToNewFollower ? 'Available' : 'Not available'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-600">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1">
            <MessageSquare size={13} className="text-neutral-500" />
            Keyword comment automation
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1">
            <Send size={13} className="text-neutral-500" />
            Auto-DM when messaged first
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1">
            <UserPlus size={13} className="text-neutral-500" />
            Welcome message to new follower
          </span>
        </div>
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
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
          <strong>LinkedIn:</strong> Keyword comment automation is not supported for LinkedIn. Replies run on Instagram, Facebook, X, and YouTube.
        </p>
        <p className="text-xs text-neutral-500 mt-2">
          <strong>X (Twitter):</strong> If keyword replies on X don’t run, check that your X app has the right access and that you have not hit rate or usage limits. Reconnect X from the Dashboard if needed.
        </p>
        <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-900">
          <p className="font-medium mb-2">Setup checklist (do all steps)</p>
          <p className="text-green-800 mb-2 text-xs">You can use the <strong>same cron job</strong> you already have (the one that calls <code className="bg-green-100/80 px-1 rounded">/api/cron/process-scheduled</code>). That endpoint now also runs comment automation, so no need to create a second job.</p>
          <ol className="list-decimal list-inside space-y-1.5 text-green-800 mb-2">
            <li><strong>Secret.</strong> Use header <code className="bg-green-100/80 px-1 rounded text-xs">X-Cron-Secret: YOUR_CRON_SECRET</code> or add <code className="bg-green-100/80 px-1 rounded text-xs">?secret=YOUR_CRON_SECRET</code> to the URL.</li>
            <li><strong>Create a post with comment automation.</strong> In Composer: add your content and platforms, then in section 4 enable &quot;Keyword comment automation&quot;, add keywords (e.g. <code className="bg-green-100/80 px-1 rounded text-xs">demo</code>, <code className="bg-green-100/80 px-1 rounded text-xs">hello</code>) and the reply text (or different text per platform). Schedule or save the post.</li>
            <li><strong>Publish that post.</strong> The post must be published (status Posted) to the platforms you want. Use &quot;Publish now&quot; or schedule with &quot;Auto&quot; so it goes out; the cron only checks posts that are already published.</li>
            <li><strong>When do replies run?</strong> We use cron jobs so you control how often it runs. On Vercel Hobby the built-in cron runs <strong>once per day</strong>, so keyword replies can take up to ~24 hours. For <strong>faster replies (e.g. within 5 minutes)</strong>, add an external cron (e.g. <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="underline">cron-job.org</a>) that calls <code className="bg-green-100/80 px-1 rounded">/api/cron/comment-automation</code> every 5 minutes with the same <code className="bg-green-100/80 px-1 rounded">X-Cron-Secret</code> header.</li>
          </ol>
          <p className="text-green-800 text-xs">One cron job calling <code className="bg-green-100/80 px-1 rounded break-all">/api/cron/process-scheduled</code> does both.</p>
        </div>
        <div className="mt-2 p-2.5 rounded-lg bg-white border border-neutral-200 text-xs">
          <p className="font-medium text-neutral-700 mb-1.5">Platform capabilities</p>
          <ul className="space-y-1 text-neutral-600">
            <li><strong>Keyword reply:</strong> Instagram (public or DM), Facebook, X, and YouTube. For X, if you see an error when running, reconnect X from the Dashboard.</li>
            <li><strong>Welcome DM:</strong> Instagram, Facebook, X (when someone messages you first)</li>
            <li><strong>New-follower DM:</strong> X only</li>
          </ul>
        </div>
        <Link
          href="/composer"
          prefetch
          className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-[var(--button)] hover:opacity-90"
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
            className="rounded border-neutral-300 text-[var(--button)] focus:ring-[var(--button)]/50"
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
              className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--button)]/30 focus:border-[var(--button)] text-sm"
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
            className="rounded border-neutral-300 text-[var(--button)] focus:ring-[var(--button)]/50"
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
              className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--button)]/30 focus:border-[var(--button)] text-sm"
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
