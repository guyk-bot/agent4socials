'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Send, UserPlus, MessageSquare, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import {
  InstagramIcon,
  FacebookIcon,
  XTwitterIcon,
  TikTokIcon,
  YoutubeIcon,
  LinkedinIcon,
} from '@/components/SocialPlatformIcons';

type AutomationSettings = {
  dmWelcomeEnabled: boolean;
  dmWelcomeMessage: string | null;
  dmNewFollowerEnabled: boolean;
  dmNewFollowerMessage: string | null;
};

type SupportLevel = 'native' | 'partner' | 'none';
type PlatformCapability = {
  platform: string;
  keywordCommentAutomation: SupportLevel;
  autoDmWhenMessagedFirst: SupportLevel;
  welcomeMessageToNewFollower: SupportLevel;
  notes?: string[];
};

const defaultSettings: AutomationSettings = {
  dmWelcomeEnabled: false,
  dmWelcomeMessage: null,
  dmNewFollowerEnabled: false,
  dmNewFollowerMessage: null,
};
const AUTOMATION_SETTINGS_CACHE_KEY = 'agent4socials.automation.settings.v1';
const AUTOMATION_DM_PLATFORM_KEY = 'agent4socials.automation.dmWelcome.platform.v1';
const AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY = 'agent4socials.automation.newFollowerDm.platform.v1';
const AUTOMATION_FIRST_DM_MESSAGES_KEY = 'agent4socials.automation.firstDm.messages.v1';
const AUTOMATION_NEW_FOLLOWER_MESSAGES_KEY = 'agent4socials.automation.newFollower.messages.v1';
const FIRST_DM_SUPPORTED_PLATFORMS = ['Instagram', 'Facebook', 'X (Twitter)', 'TikTok'] as const;
const NEW_FOLLOWER_SUPPORTED_PLATFORMS = ['Instagram', 'Facebook', 'X (Twitter)'] as const;

const PLATFORM_CAPABILITIES: PlatformCapability[] = [
  {
    platform: 'Instagram',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'native',
    welcomeMessageToNewFollower: 'native',
  },
  {
    platform: 'Facebook',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'native',
    welcomeMessageToNewFollower: 'native',
  },
  {
    platform: 'X (Twitter)',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'native',
    welcomeMessageToNewFollower: 'native',
  },
  {
    platform: 'TikTok',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'native',
    welcomeMessageToNewFollower: 'none',
    notes: ['TikTok comment automation is only supported for business accounts.'],
  },
  {
    platform: 'YouTube',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'none',
    welcomeMessageToNewFollower: 'none',
  },
  {
    platform: 'LinkedIn',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'none',
    welcomeMessageToNewFollower: 'none',
  },
];

function levelBadge(level: SupportLevel): { label: string; className: string } {
  if (level === 'native') return { label: 'Available', className: 'bg-green-100 text-green-800 border-green-200' };
  if (level === 'partner') return { label: 'Available', className: 'bg-green-100 text-green-800 border-green-200' };
  return { label: 'Not available', className: 'bg-neutral-200 text-neutral-700 border-neutral-300' };
}

function platformIcon(platform: string) {
  if (platform === 'Instagram') return <InstagramIcon size={16} />;
  if (platform === 'Facebook') return <FacebookIcon size={16} />;
  if (platform === 'X (Twitter)') return <XTwitterIcon size={16} className="text-neutral-900" />;
  if (platform === 'TikTok') return <TikTokIcon size={16} />;
  if (platform === 'YouTube') return <YoutubeIcon size={16} />;
  if (platform === 'LinkedIn') return <LinkedinIcon size={16} />;
  return null;
}

export default function AutomationPage() {
  const [settings, setSettings] = useState<AutomationSettings>(defaultSettings);
  const [dmWelcomePlatform, setDmWelcomePlatform] = useState<string | null>(null);
  const [dmNewFollowerPlatform, setDmNewFollowerPlatform] = useState<string | null>(null);
  const [firstIncomingMessages, setFirstIncomingMessages] = useState<Record<string, string>>({});
  const [newFollowerMessages, setNewFollowerMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstDmSetupMessage, setFirstDmSetupMessage] = useState<string | null>(null);
  const [newFollowerSetupMessage, setNewFollowerSetupMessage] = useState<string | null>(null);
  const firstDmSectionRef = useRef<HTMLDivElement | null>(null);
  const newFollowerSectionRef = useRef<HTMLDivElement | null>(null);

  const scrollToSectionWithOffset = (el: HTMLDivElement | null) => {
    if (!el || typeof window === 'undefined') return;
    const y = el.getBoundingClientRect().top + window.scrollY;
    // Keep the section header clearly visible under sticky app chrome.
    const offset = 110;
    window.scrollTo({ top: Math.max(0, y - offset), behavior: 'smooth' });
  };

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
        const savedDmPlatform =
          sessionStorage.getItem(AUTOMATION_DM_PLATFORM_KEY) ??
          localStorage.getItem(AUTOMATION_DM_PLATFORM_KEY);
        if (savedDmPlatform) setDmWelcomePlatform(savedDmPlatform);
        const savedNewFollowerDmPlatform =
          sessionStorage.getItem(AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY) ??
          localStorage.getItem(AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY);
        if (savedNewFollowerDmPlatform) setDmNewFollowerPlatform(savedNewFollowerDmPlatform);
        const savedFirstIncomingMessages =
          sessionStorage.getItem(AUTOMATION_FIRST_DM_MESSAGES_KEY) ??
          localStorage.getItem(AUTOMATION_FIRST_DM_MESSAGES_KEY);
        if (savedFirstIncomingMessages) {
          try {
            const parsed = JSON.parse(savedFirstIncomingMessages) as Record<string, string>;
            if (parsed && typeof parsed === 'object') setFirstIncomingMessages(parsed);
          } catch {
            // ignore parse issues
          }
        }
        const savedNewFollowerMessages =
          sessionStorage.getItem(AUTOMATION_NEW_FOLLOWER_MESSAGES_KEY) ??
          localStorage.getItem(AUTOMATION_NEW_FOLLOWER_MESSAGES_KEY);
        if (savedNewFollowerMessages) {
          try {
            const parsed = JSON.parse(savedNewFollowerMessages) as Record<string, string>;
            if (parsed && typeof parsed === 'object') setNewFollowerMessages(parsed);
          } catch {
            // ignore parse issues
          }
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

  useEffect(() => {
    if (!settings.dmWelcomeEnabled) return;
    if (dmWelcomePlatform) return;
    const fallback = 'Instagram';
    setDmWelcomePlatform(fallback);
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(AUTOMATION_DM_PLATFORM_KEY, fallback);
        localStorage.setItem(AUTOMATION_DM_PLATFORM_KEY, fallback);
      }
    } catch {
      // ignore storage errors
    }
  }, [settings.dmWelcomeEnabled, dmWelcomePlatform]);

  useEffect(() => {
    if (!settings.dmNewFollowerEnabled) return;
    if (dmNewFollowerPlatform) return;
    const fallback = 'Instagram';
    setDmNewFollowerPlatform(fallback);
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY, fallback);
        localStorage.setItem(AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY, fallback);
      }
    } catch {
      // ignore storage errors
    }
  }, [settings.dmNewFollowerEnabled, dmNewFollowerPlatform]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const str = JSON.stringify(firstIncomingMessages);
      sessionStorage.setItem(AUTOMATION_FIRST_DM_MESSAGES_KEY, str);
      localStorage.setItem(AUTOMATION_FIRST_DM_MESSAGES_KEY, str);
    } catch {
      // ignore storage errors
    }
  }, [firstIncomingMessages]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const str = JSON.stringify(newFollowerMessages);
      sessionStorage.setItem(AUTOMATION_NEW_FOLLOWER_MESSAGES_KEY, str);
      localStorage.setItem(AUTOMATION_NEW_FOLLOWER_MESSAGES_KEY, str);
    } catch {
      // ignore storage errors
    }
  }, [newFollowerMessages]);

  const hasSetupMessage = (kind: 'first' | 'follower', platform: string) => {
    const source = kind === 'first' ? firstIncomingMessages : newFollowerMessages;
    return Boolean(source[platform]?.trim());
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10">
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--button)]" />
              Automation by connected platform
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Platform-specific automation controls are shown below.
            </p>
          </div>
          <Link href="/composer" prefetch className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
            Configure keywords <ArrowRight size={12} />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PLATFORM_CAPABILITIES.map((row) => {
              const keyword = levelBadge(row.keywordCommentAutomation);
              const dmFirst = levelBadge(row.autoDmWhenMessagedFirst);
              const newFollower = levelBadge(row.welcomeMessageToNewFollower);
              const keywordLabel =
                row.platform === 'Instagram' ||
                row.platform === 'Facebook' ||
                row.platform === 'X (Twitter)' ||
                row.platform === 'TikTok'
                  ? 'Keyword comment + DM automation'
                  : 'Keyword comment automation';
              const supportsDmFirstNative = row.autoDmWhenMessagedFirst === 'native';
              const supportsNewFollowerNative = row.welcomeMessageToNewFollower === 'native';
              return (
                <div key={row.platform} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <h3 className="text-base font-semibold text-neutral-900 inline-flex items-center gap-2">
                    {platformIcon(row.platform)}
                    {row.platform}
                  </h3>
                  <div className="mt-3 space-y-2">
                    {row.keywordCommentAutomation !== 'none' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-neutral-600">{keywordLabel}</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${keyword.className}`}>{keyword.label}</span>
                      </div>
                    )}
                    {row.autoDmWhenMessagedFirst !== 'none' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-neutral-600">Auto-DM when messaged first</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${dmFirst.className}`}>{dmFirst.label}</span>
                      </div>
                    )}
                    {row.welcomeMessageToNewFollower !== 'none' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-neutral-600">Welcome message to new follower</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${newFollower.className}`}>{newFollower.label}</span>
                      </div>
                    )}
                  </div>

                  {supportsDmFirstNative && (
                    <label className="mt-3 inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.dmWelcomeEnabled && dmWelcomePlatform === row.platform}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked && !hasSetupMessage('first', row.platform)) {
                            setFirstDmSetupMessage('Please set up the auto DM message first before enabling it.');
                            scrollToSectionWithOffset(firstDmSectionRef.current);
                            return;
                          }
                          setFirstDmSetupMessage(null);
                          setDmWelcomePlatform(checked ? row.platform : null);
                          try {
                            if (typeof window !== 'undefined') {
                              if (checked) {
                                sessionStorage.setItem(AUTOMATION_DM_PLATFORM_KEY, row.platform);
                                localStorage.setItem(AUTOMATION_DM_PLATFORM_KEY, row.platform);
                              } else {
                                sessionStorage.removeItem(AUTOMATION_DM_PLATFORM_KEY);
                                localStorage.removeItem(AUTOMATION_DM_PLATFORM_KEY);
                              }
                            }
                          } catch {
                            // ignore storage errors
                          }
                          update({
                            dmWelcomeEnabled: checked,
                            ...(checked
                              ? { dmWelcomeMessage: firstIncomingMessages[row.platform]?.trim() || null }
                              : {}),
                          });
                        }}
                        className="rounded border-neutral-300 text-[var(--button)] focus:ring-[var(--button)]/50"
                      />
                      <span className="text-xs font-medium text-neutral-700">Enable auto-DM for first incoming message</span>
                    </label>
                  )}

                  {supportsNewFollowerNative && (
                    <label className="mt-2 inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.dmNewFollowerEnabled && dmNewFollowerPlatform === row.platform}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked && !hasSetupMessage('follower', row.platform)) {
                            setNewFollowerSetupMessage('Please set up the welcome message first before enabling it.');
                            scrollToSectionWithOffset(newFollowerSectionRef.current);
                            return;
                          }
                          setNewFollowerSetupMessage(null);
                          setDmNewFollowerPlatform(checked ? row.platform : null);
                          try {
                            if (typeof window !== 'undefined') {
                              if (checked) {
                                sessionStorage.setItem(AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY, row.platform);
                                localStorage.setItem(AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY, row.platform);
                              } else {
                                sessionStorage.removeItem(AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY);
                                localStorage.removeItem(AUTOMATION_NEW_FOLLOWER_DM_PLATFORM_KEY);
                              }
                            }
                          } catch {
                            // ignore storage errors
                          }
                          update({
                            dmNewFollowerEnabled: checked,
                            ...(checked
                              ? { dmNewFollowerMessage: newFollowerMessages[row.platform]?.trim() || null }
                              : {}),
                          });
                        }}
                        className="rounded border-neutral-300 text-[var(--button)] focus:ring-[var(--button)]/50"
                      />
                      <span className="text-xs font-medium text-neutral-700">Enable welcome DM to new followers</span>
                    </label>
                  )}

                  {row.notes && row.notes.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {row.notes.map((note, idx) => (
                        <p key={`${row.platform}-note-${idx}`} className="text-[11px] leading-relaxed text-neutral-600">
                          {note}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
          })}
        </div>
      </div>

      <div ref={firstDmSectionRef} className="card space-y-4">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <Send size={20} className="text-neutral-500" />
          Auto DM for first incoming message
        </h2>
        {firstDmSetupMessage && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {firstDmSetupMessage}
          </div>
        )}
        <p className="text-sm text-neutral-600">
          Set your first incoming DM message per platform. You must set a message here before enabling it in the platform card.
        </p>
        <div className="space-y-3">
          {FIRST_DM_SUPPORTED_PLATFORMS.map((platform) => (
            <div key={`first-dm-${platform}`} className="rounded-xl border border-neutral-200 bg-white p-3">
              <label className="block text-sm font-medium text-neutral-800 mb-1.5">{platform}</label>
              <textarea
                value={firstIncomingMessages[platform] ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setFirstIncomingMessages((prev) => ({ ...prev, [platform]: value }));
                  if (settings.dmWelcomeEnabled && dmWelcomePlatform === platform) {
                    update({ dmWelcomeMessage: value || null });
                  }
                }}
                placeholder={`Enter auto DM for ${platform}`}
                rows={3}
                className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--button)]/30 focus:border-[var(--button)] text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <div ref={newFollowerSectionRef} className="card space-y-4">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <UserPlus size={20} className="text-neutral-500" />
          Welcome DM to new follower
        </h2>
        {newFollowerSetupMessage && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {newFollowerSetupMessage}
          </div>
        )}
        <p className="text-sm text-neutral-600">
          Set your welcome DM for each supported platform. You must set a message here before enabling it in the platform card.
        </p>
        <div className="space-y-3">
          {NEW_FOLLOWER_SUPPORTED_PLATFORMS.map((platform) => (
            <div key={`new-follower-dm-${platform}`} className="rounded-xl border border-neutral-200 bg-white p-3">
              <label className="block text-sm font-medium text-neutral-800 mb-1.5">{platform}</label>
              <textarea
                value={newFollowerMessages[platform] ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setNewFollowerMessages((prev) => ({ ...prev, [platform]: value }));
                  if (settings.dmNewFollowerEnabled && dmNewFollowerPlatform === platform) {
                    update({ dmNewFollowerMessage: value || null });
                  }
                }}
                placeholder={`Enter welcome DM for new followers on ${platform}`}
                rows={3}
                className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--button)]/30 focus:border-[var(--button)] text-sm"
              />
            </div>
          ))}
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

    </div>
  );
}
