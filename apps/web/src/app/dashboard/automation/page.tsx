'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, UserPlus, MessageSquare, Loader2, Sparkles, Plus, Trash2, Paperclip, Save } from 'lucide-react';
import api from '@/lib/api';
import {
  InstagramIcon,
  FacebookIcon,
  XTwitterIcon,
  TikTokIcon,
  YoutubeIcon,
  LinkedinIcon,
} from '@/components/SocialPlatformIcons';

type DmWelcomeAttachment = {
  fileUrl: string;
  fileName?: string;
  contentType?: string;
  kind: 'image' | 'video' | 'file';
};

type AutomationSettings = {
  dmWelcomeEnabled: boolean;
  dmWelcomeMessage: string | null;
  dmWelcomeEnabledByPlatform: Record<string, boolean>;
  dmWelcomeMessagesByPlatform: Record<string, string | null>;
  dmWelcomeAttachmentsByPlatform: Record<string, DmWelcomeAttachment[]>;
  dmNewFollowerEnabled: boolean;
  dmNewFollowerMessage: string | null;
  dmNewFollowerEnabledByPlatform: Record<string, boolean>;
  dmNewFollowerMessagesByPlatform: Record<string, string | null>;
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
  dmWelcomeEnabledByPlatform: {},
  dmWelcomeMessagesByPlatform: {},
  dmWelcomeAttachmentsByPlatform: {},
  dmNewFollowerEnabled: false,
  dmNewFollowerMessage: null,
  dmNewFollowerEnabledByPlatform: {},
  dmNewFollowerMessagesByPlatform: {},
};
const AUTOMATION_SETTINGS_CACHE_KEY = 'agent4socials.automation.settings.v1';
const AUTOMATION_NEW_FOLLOWER_MESSAGES_KEY = 'agent4socials.automation.newFollower.messages.v1';
const AUTOMATION_KEYWORD_STEPS_KEY = 'agent4socials.automation.keyword.steps.v1';
const MAX_FIRST_DM_ATTACHMENTS = 5;
const FIRST_DM_SUPPORTED_PLATFORMS = ['Instagram', 'Facebook', 'X (Twitter)'] as const;
const NEW_FOLLOWER_SUPPORTED_PLATFORMS = ['Instagram', 'Facebook', 'X (Twitter)'] as const;

const PLATFORM_CAPABILITIES: PlatformCapability[] = [
  {
    platform: 'Instagram',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'native',
    welcomeMessageToNewFollower: 'native',
    notes: ['Instagram cannot DM someone who only followed you. Enable this toggle and use first incoming DM when they message you, or both.'],
  },
  {
    platform: 'Facebook',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'native',
    welcomeMessageToNewFollower: 'native',
    notes: ['Facebook cannot DM someone who only followed you. Enable this toggle and use first incoming DM when they message you, or both.'],
  },
  {
    platform: 'X (Twitter)',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'native',
    welcomeMessageToNewFollower: 'native',
    notes: ['Proactive welcome DM to new followers needs cron /api/cron/welcome-followers every 15 to 30 min.'],
  },
  {
    platform: 'TikTok',
    keywordCommentAutomation: 'native',
    autoDmWhenMessagedFirst: 'none',
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

function firstDmAttachmentUrlsHint(platform: string): string {
  const n = MAX_FIRST_DM_ATTACHMENTS;
  if (platform === 'Instagram') {
    return `Up to ${n} files. URLs must stay publicly reachable for Instagram deliverability.`;
  }
  if (platform === 'Facebook') {
    return `Up to ${n} files. URLs must stay publicly reachable for Facebook deliverability.`;
  }
  if (platform === 'X (Twitter)') {
    return `Up to ${n} files. Images upload to X for DMs (OAuth 1.0a or token with media.write). URLs must stay publicly reachable.`;
  }
  return `Up to ${n} files.`;
}

type KeywordAutomationStep = {
  id: string;
  keyword: string;
  platforms: Array<'Instagram' | 'Facebook' | 'X (Twitter)' | 'TikTok' | 'YouTube'>;
  actionType: 'reply' | 'send_file_or_link' | 'forward_to_page';
  actionValue: string;
  replyVariants: string[];
  replyVariantStrategy: 'rotate' | 'random';
  enabled: boolean;
};

type AutomationSettingsResponse = AutomationSettings & { keywordAutomationSteps?: KeywordAutomationStep[] };

const KEYWORD_AUTOMATION_PLATFORMS = ['Instagram', 'Facebook', 'X (Twitter)', 'TikTok', 'YouTube'] as const;

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
  const [keywordSteps, setKeywordSteps] = useState<KeywordAutomationStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [savingPlatformToggles, setSavingPlatformToggles] = useState(false);
  const [savingFirstDmPlatform, setSavingFirstDmPlatform] = useState<string | null>(null);
  const [savingNewFollowerPlatform, setSavingNewFollowerPlatform] = useState<string | null>(null);
  const [savingKeywordStepId, setSavingKeywordStepId] = useState<string | null>(null);
  const [savingAllFirstDm, setSavingAllFirstDm] = useState(false);
  const [savingAllNewFollower, setSavingAllNewFollower] = useState(false);
  const [savingAllKeyword, setSavingAllKeyword] = useState(false);
  const [firstDmUploadingPlatform, setFirstDmUploadingPlatform] = useState<string | null>(null);
  const [firstDmUploadError, setFirstDmUploadError] = useState<string | null>(null);
  const [firstDmSetupMessage, setFirstDmSetupMessage] = useState<string | null>(null);
  const [newFollowerSetupMessage, setNewFollowerSetupMessage] = useState<string | null>(null);
  const [welcomeReadinessSummary, setWelcomeReadinessSummary] = useState<string | null>(null);
  const [welcomeReadinessLoading, setWelcomeReadinessLoading] = useState(false);
  const [resetHistoryLoading, setResetHistoryLoading] = useState(false);
  const [resetHistoryMsg, setResetHistoryMsg] = useState<string | null>(null);
  const firstDmSectionRef = useRef<HTMLDivElement | null>(null);
  const newFollowerSectionRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const keywordStepsRef = useRef(keywordSteps);
  keywordStepsRef.current = keywordSteps;
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
          if (typeof parsed.dmWelcomeEnabled === 'boolean' || (parsed.dmWelcomeEnabledByPlatform && typeof parsed.dmWelcomeEnabledByPlatform === 'object')) {
            const atts = parsed.dmWelcomeAttachmentsByPlatform;
            const safeAtts =
              atts && typeof atts === 'object' && !Array.isArray(atts)
                ? (atts as Record<string, DmWelcomeAttachment[]>)
                : {};
            const enabledBy =
              parsed.dmWelcomeEnabledByPlatform && typeof parsed.dmWelcomeEnabledByPlatform === 'object' && !Array.isArray(parsed.dmWelcomeEnabledByPlatform)
                ? (parsed.dmWelcomeEnabledByPlatform as Record<string, boolean>)
                : {};
            const messagesBy =
              parsed.dmWelcomeMessagesByPlatform && typeof parsed.dmWelcomeMessagesByPlatform === 'object' && !Array.isArray(parsed.dmWelcomeMessagesByPlatform)
                ? (parsed.dmWelcomeMessagesByPlatform as Record<string, string | null>)
                : {};
            const newFollowerEnabledBy =
              parsed.dmNewFollowerEnabledByPlatform && typeof parsed.dmNewFollowerEnabledByPlatform === 'object' && !Array.isArray(parsed.dmNewFollowerEnabledByPlatform)
                ? (parsed.dmNewFollowerEnabledByPlatform as Record<string, boolean>)
                : {};
            let newFollowerMessagesBy =
              parsed.dmNewFollowerMessagesByPlatform && typeof parsed.dmNewFollowerMessagesByPlatform === 'object' && !Array.isArray(parsed.dmNewFollowerMessagesByPlatform)
                ? (parsed.dmNewFollowerMessagesByPlatform as Record<string, string | null>)
                : {};
            const savedNewFollowerMessages =
              sessionStorage.getItem(AUTOMATION_NEW_FOLLOWER_MESSAGES_KEY) ??
              localStorage.getItem(AUTOMATION_NEW_FOLLOWER_MESSAGES_KEY);
            if (Object.keys(newFollowerMessagesBy).length === 0 && savedNewFollowerMessages) {
              try {
                const legacyMsgs = JSON.parse(savedNewFollowerMessages) as Record<string, string>;
                if (legacyMsgs && typeof legacyMsgs === 'object') {
                  newFollowerMessagesBy = Object.fromEntries(
                    Object.entries(legacyMsgs).map(([k, v]) => [k, typeof v === 'string' ? v : null]),
                  );
                }
              } catch {
                // ignore parse issues
              }
            }
            setSettings({
              dmWelcomeEnabled: parsed.dmWelcomeEnabled ?? false,
              dmWelcomeMessage: parsed.dmWelcomeMessage ?? null,
              dmWelcomeEnabledByPlatform: enabledBy,
              dmWelcomeMessagesByPlatform: messagesBy,
              dmWelcomeAttachmentsByPlatform: safeAtts,
              dmNewFollowerEnabled: parsed.dmNewFollowerEnabled ?? false,
              dmNewFollowerMessage: parsed.dmNewFollowerMessage ?? null,
              dmNewFollowerEnabledByPlatform: newFollowerEnabledBy,
              dmNewFollowerMessagesByPlatform: newFollowerMessagesBy,
            });
          }
        } else {
          setLoading(true);
        }
        const savedKeywordSteps =
          sessionStorage.getItem(AUTOMATION_KEYWORD_STEPS_KEY) ??
          localStorage.getItem(AUTOMATION_KEYWORD_STEPS_KEY);
        if (savedKeywordSteps) {
          try {
            const parsed = JSON.parse(savedKeywordSteps) as KeywordAutomationStep[];
            if (Array.isArray(parsed)) {
              setKeywordSteps(
                parsed.map((step) => ({
                  ...step,
                  platforms:
                    Array.isArray((step as { platforms?: string[] }).platforms) &&
                    (step as { platforms?: string[] }).platforms!.length > 0
                      ? ((step as { platforms?: string[] }).platforms!.filter((p): p is KeywordAutomationStep['platforms'][number] =>
                          KEYWORD_AUTOMATION_PLATFORMS.includes(p as KeywordAutomationStep['platforms'][number]),
                        ))
                      : ((step as { platform?: string }).platform &&
                        KEYWORD_AUTOMATION_PLATFORMS.includes((step as { platform?: string }).platform as KeywordAutomationStep['platforms'][number])
                          ? [((step as { platform?: string }).platform as KeywordAutomationStep['platforms'][number])]
                          : ['Instagram']),
                  replyVariants:
                    Array.isArray(step?.replyVariants) &&
                    step.replyVariants.every((v) => typeof v === 'string')
                      ? step.replyVariants
                      : [],
                  replyVariantStrategy:
                    step?.replyVariantStrategy === 'random' ? 'random' : 'rotate',
                })),
              );
            }
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
      .get<AutomationSettingsResponse>('/automation/settings', { signal: ctrl.signal })
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        if (data) {
          const atts = data.dmWelcomeAttachmentsByPlatform;
          const safeAtts =
            atts && typeof atts === 'object' && !Array.isArray(atts)
              ? (atts as Record<string, DmWelcomeAttachment[]>)
              : {};
          const next: AutomationSettings = {
            dmWelcomeEnabled: data.dmWelcomeEnabled ?? false,
            dmWelcomeMessage: data.dmWelcomeMessage ?? null,
            dmWelcomeEnabledByPlatform:
              data.dmWelcomeEnabledByPlatform && typeof data.dmWelcomeEnabledByPlatform === 'object' && !Array.isArray(data.dmWelcomeEnabledByPlatform)
                ? (data.dmWelcomeEnabledByPlatform as Record<string, boolean>)
                : {},
            dmWelcomeMessagesByPlatform:
              data.dmWelcomeMessagesByPlatform && typeof data.dmWelcomeMessagesByPlatform === 'object' && !Array.isArray(data.dmWelcomeMessagesByPlatform)
                ? (data.dmWelcomeMessagesByPlatform as Record<string, string | null>)
                : {},
            dmWelcomeAttachmentsByPlatform: safeAtts,
            dmNewFollowerEnabled: data.dmNewFollowerEnabled ?? false,
            dmNewFollowerMessage: data.dmNewFollowerMessage ?? null,
            dmNewFollowerEnabledByPlatform:
              data.dmNewFollowerEnabledByPlatform && typeof data.dmNewFollowerEnabledByPlatform === 'object' && !Array.isArray(data.dmNewFollowerEnabledByPlatform)
                ? (data.dmNewFollowerEnabledByPlatform as Record<string, boolean>)
                : {},
            dmNewFollowerMessagesByPlatform:
              data.dmNewFollowerMessagesByPlatform && typeof data.dmNewFollowerMessagesByPlatform === 'object' && !Array.isArray(data.dmNewFollowerMessagesByPlatform)
                ? (data.dmNewFollowerMessagesByPlatform as Record<string, string | null>)
                : {},
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
          const rawSteps = data.keywordAutomationSteps;
          if (Array.isArray(rawSteps) && rawSteps.length > 0) {
            setKeywordSteps(
              rawSteps.map((step: unknown) => {
                const s = step && typeof step === 'object' ? (step as Record<string, unknown>) : {};
                const platformsRaw = s.platforms;
                const legacyPlatform = s.platform;
                let platforms: KeywordAutomationStep['platforms'] = ['Instagram'];
                if (Array.isArray(platformsRaw)) {
                  const filtered = platformsRaw.filter(
                    (p): p is KeywordAutomationStep['platforms'][number] =>
                      typeof p === 'string' && KEYWORD_AUTOMATION_PLATFORMS.includes(p as KeywordAutomationStep['platforms'][number]),
                  );
                  if (filtered.length > 0) platforms = filtered;
                } else if (typeof legacyPlatform === 'string' && KEYWORD_AUTOMATION_PLATFORMS.includes(legacyPlatform as KeywordAutomationStep['platforms'][number])) {
                  platforms = [legacyPlatform as KeywordAutomationStep['platforms'][number]];
                }
                const replyVariants = Array.isArray(s.replyVariants)
                  ? (s.replyVariants as unknown[]).filter((v): v is string => typeof v === 'string')
                  : [];
                const actionType =
                  s.actionType === 'send_file_or_link' || s.actionType === 'forward_to_page' || s.actionType === 'reply'
                    ? s.actionType
                    : 'reply';
                return {
                  id: typeof s.id === 'string' ? s.id : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  keyword: typeof s.keyword === 'string' ? s.keyword : '',
                  platforms,
                  actionType,
                  actionValue: typeof s.actionValue === 'string' ? s.actionValue : '',
                  replyVariants,
                  replyVariantStrategy: s.replyVariantStrategy === 'random' ? 'random' : 'rotate',
                  enabled: s.enabled !== false,
                };
              }),
            );
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Keep cached or default settings; do not show an error banner for a background refresh failure.
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

  function mergeLocalSettings(patch: Partial<AutomationSettings>) {
    setSettings((prev) => {
      const merged: AutomationSettings = { ...prev, ...patch };
      if (patch.dmWelcomeEnabledByPlatform !== undefined) {
        const combined = { ...(prev.dmWelcomeEnabledByPlatform ?? {}), ...patch.dmWelcomeEnabledByPlatform };
        for (const key of Object.keys(combined)) {
          if (!combined[key]) delete combined[key];
        }
        merged.dmWelcomeEnabledByPlatform = combined;
        if (patch.dmWelcomeEnabled === undefined) {
          merged.dmWelcomeEnabled = Object.values(combined).some(Boolean);
        }
      }
      if (patch.dmWelcomeMessagesByPlatform !== undefined) {
        merged.dmWelcomeMessagesByPlatform = {
          ...(prev.dmWelcomeMessagesByPlatform ?? {}),
          ...patch.dmWelcomeMessagesByPlatform,
        };
      }
      if (patch.dmWelcomeAttachmentsByPlatform !== undefined) {
        merged.dmWelcomeAttachmentsByPlatform = {
          ...(prev.dmWelcomeAttachmentsByPlatform ?? {}),
          ...patch.dmWelcomeAttachmentsByPlatform,
        };
      }
      if (patch.dmNewFollowerEnabledByPlatform !== undefined) {
        const combined = { ...(prev.dmNewFollowerEnabledByPlatform ?? {}), ...patch.dmNewFollowerEnabledByPlatform };
        for (const key of Object.keys(combined)) {
          if (!combined[key]) delete combined[key];
        }
        merged.dmNewFollowerEnabledByPlatform = combined;
        if (patch.dmNewFollowerEnabled === undefined) {
          merged.dmNewFollowerEnabled = Object.values(combined).some(Boolean);
        }
      }
      if (patch.dmNewFollowerMessagesByPlatform !== undefined) {
        merged.dmNewFollowerMessagesByPlatform = {
          ...(prev.dmNewFollowerMessagesByPlatform ?? {}),
          ...patch.dmNewFollowerMessagesByPlatform,
        };
      }
      try {
        if (typeof window !== 'undefined') {
          const str = JSON.stringify(merged);
          sessionStorage.setItem(AUTOMATION_SETTINGS_CACHE_KEY, str);
          localStorage.setItem(AUTOMATION_SETTINGS_CACHE_KEY, str);
        }
      } catch {
        // ignore storage errors
      }
      return merged;
    });
  }

  function firstDmPatchPayloadForPlatform(platform: string, snapshot: AutomationSettings) {
    return {
      dmWelcomeMessagesByPlatform: {
        [platform]: snapshot.dmWelcomeMessagesByPlatform?.[platform] ?? null,
      },
      dmWelcomeAttachmentsByPlatform: {
        [platform]: snapshot.dmWelcomeAttachmentsByPlatform?.[platform] ?? [],
      },
    };
  }

  async function flushFirstDmPlatformToServer(platform: string, snapshot: AutomationSettings) {
    setSavingFirstDmPlatform(platform);
    try {
      await api.patch('/automation/settings', firstDmPatchPayloadForPlatform(platform, snapshot));
    } catch {
      // keep local state; user can retry Save
    } finally {
      setSavingFirstDmPlatform(null);
    }
  }

  function buildFullAutomationPayload(snapshot: AutomationSettings) {
    return {
      ...snapshot,
      keywordAutomationSteps: keywordStepsRef.current,
    };
  }

  async function savePlatformToggles() {
    const s = settingsRef.current;
    setSavingPlatformToggles(true);
    try {
      await api.patch('/automation/settings', {
        dmWelcomeEnabled: s.dmWelcomeEnabled,
        dmWelcomeEnabledByPlatform: s.dmWelcomeEnabledByPlatform,
        dmNewFollowerEnabled: s.dmNewFollowerEnabled,
        dmNewFollowerEnabledByPlatform: s.dmNewFollowerEnabledByPlatform,
      });
    } catch {
      // keep local state; user can retry
    } finally {
      setSavingPlatformToggles(false);
    }
  }

  function newFollowerPatchPayloadForPlatform(platform: string, snapshot: AutomationSettings) {
    return {
      dmNewFollowerMessagesByPlatform: {
        [platform]: snapshot.dmNewFollowerMessagesByPlatform?.[platform] ?? null,
      },
    };
  }

  async function flushNewFollowerPlatformToServer(platform: string, snapshot: AutomationSettings) {
    setSavingNewFollowerPlatform(platform);
    try {
      await api.patch('/automation/settings', newFollowerPatchPayloadForPlatform(platform, snapshot));
    } catch {
      // keep local state; user can retry Save
    } finally {
      setSavingNewFollowerPlatform(null);
    }
  }

  async function saveKeywordStep(stepId: string) {
    setSavingKeywordStepId(stepId);
    try {
      await api.patch('/automation/settings', { keywordAutomationSteps: keywordStepsRef.current });
    } catch {
      // keep local state; user can retry
    } finally {
      setSavingKeywordStepId(null);
    }
  }

  async function saveAllFirstDmSection() {
    const s = settingsRef.current;
    setSavingAllFirstDm(true);
    try {
      await api.patch('/automation/settings', {
        dmWelcomeMessagesByPlatform: s.dmWelcomeMessagesByPlatform,
        dmWelcomeAttachmentsByPlatform: s.dmWelcomeAttachmentsByPlatform,
      });
    } catch {
      // keep local state; user can retry
    } finally {
      setSavingAllFirstDm(false);
    }
  }

  async function saveAllNewFollowerSection() {
    const s = settingsRef.current;
    setSavingAllNewFollower(true);
    try {
      await api.patch('/automation/settings', {
        dmNewFollowerMessagesByPlatform: s.dmNewFollowerMessagesByPlatform,
      });
    } catch {
      // keep local state; user can retry
    } finally {
      setSavingAllNewFollower(false);
    }
  }

  async function saveAllKeywordSection() {
    setSavingAllKeyword(true);
    try {
      await api.patch('/automation/settings', { keywordAutomationSteps: keywordStepsRef.current });
    } catch {
      // keep local state; user can retry
    } finally {
      setSavingAllKeyword(false);
    }
  }

  async function saveAllAutomation() {
    setSavingAll(true);
    try {
      await api.patch('/automation/settings', buildFullAutomationPayload(settingsRef.current));
    } catch {
      // keep local state; user can retry
    } finally {
      setSavingAll(false);
    }
  }

  async function runWelcomeReadinessCheck() {
    setWelcomeReadinessLoading(true);
    setWelcomeReadinessSummary(null);
    try {
      const { data } = await api.get<{
        ok: boolean;
        summary: string;
        platforms: Array<{
          platform: string;
          featureLabel: string;
          available: boolean;
          configured: boolean;
          enabled: boolean;
          accountConnected: boolean;
          accountUsername: string | null;
          cronPath: string | null;
          blockers: string[];
          testSteps: string[];
        }>;
      }>('/automation/welcome-readiness');
      const lines: string[] = [data.summary, ''];
      for (const row of data.platforms) {
        const ready =
          row.available &&
          row.enabled &&
          row.configured &&
          row.accountConnected &&
          row.blockers.length === 0;
        const status = !row.available ? 'N/A' : ready ? 'READY' : 'NOT READY';
        lines.push(`${row.platform}: ${row.featureLabel} [${status}]`);
        if (row.accountUsername) lines.push(`  Connected: @${row.accountUsername}`);
        if (row.cronPath) lines.push(`  Cron: ${row.cronPath}`);
        for (const b of row.blockers) lines.push(`  Blocker: ${b}`);
        if (ready || row.enabled) {
          for (const step of row.testSteps) lines.push(`  Step: ${step}`);
        }
        lines.push('');
      }
      setWelcomeReadinessSummary(lines.join('\n').trim());
    } catch {
      setWelcomeReadinessSummary('Could not load readiness check. Sign in and try again.');
    } finally {
      setWelcomeReadinessLoading(false);
    }
  }

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const str = JSON.stringify(keywordSteps);
      sessionStorage.setItem(AUTOMATION_KEYWORD_STEPS_KEY, str);
      localStorage.setItem(AUTOMATION_KEYWORD_STEPS_KEY, str);
    } catch {
      // ignore storage errors
    }
  }, [keywordSteps]);

  function fileKindFromMime(file: File): DmWelcomeAttachment['kind'] {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'file';
  }

  async function handleFirstDmFilePick(platform: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setFirstDmUploadError(null);
    const prev = settingsRef.current;
    const existing = prev.dmWelcomeAttachmentsByPlatform?.[platform] ?? [];
    if (existing.length >= MAX_FIRST_DM_ATTACHMENTS) {
      setFirstDmUploadError(`You can add up to ${MAX_FIRST_DM_ATTACHMENTS} files per platform.`);
      return;
    }
    setFirstDmUploadingPlatform(platform);
    try {
      const res = await api.post<{ uploadUrl: string; fileUrl: string }>('/media/upload-url', {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      });
      const { uploadUrl, fileUrl } = res.data;
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      const att: DmWelcomeAttachment = {
        fileUrl,
        fileName: file.name,
        contentType: file.type || undefined,
        kind: fileKindFromMime(file),
      };
      const p2 = settingsRef.current;
      const list = p2.dmWelcomeAttachmentsByPlatform?.[platform] ?? [];
      const next: AutomationSettings = {
        ...p2,
        dmWelcomeAttachmentsByPlatform: {
          ...(p2.dmWelcomeAttachmentsByPlatform ?? {}),
          [platform]: [...list, att],
        },
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
      await flushFirstDmPlatformToServer(platform, next);
    } catch (e) {
      setFirstDmUploadError((e as Error)?.message ?? 'Upload failed. Check media storage configuration.');
    } finally {
      setFirstDmUploadingPlatform(null);
    }
  }

  function removeFirstDmAttachment(platform: string, index: number) {
    const prev = settingsRef.current;
    const existing = prev.dmWelcomeAttachmentsByPlatform?.[platform] ?? [];
    const nextList = existing.filter((_, i) => i !== index);
    const nextMap: Record<string, DmWelcomeAttachment[]> = { ...(prev.dmWelcomeAttachmentsByPlatform ?? {}) };
    if (nextList.length === 0) delete nextMap[platform];
    else nextMap[platform] = nextList;
    const next: AutomationSettings = { ...prev, dmWelcomeAttachmentsByPlatform: nextMap };
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
    void flushFirstDmPlatformToServer(platform, next);
  }

  const hasSetupMessage = (kind: 'first' | 'follower', platform: string) => {
    if (kind === 'first') {
      const msg = settings.dmWelcomeMessagesByPlatform?.[platform]?.trim();
      const atts = settings.dmWelcomeAttachmentsByPlatform?.[platform];
      return Boolean(msg) || (Array.isArray(atts) && atts.length > 0);
    }
    const msg = settings.dmNewFollowerMessagesByPlatform?.[platform]?.trim();
    return Boolean(msg);
  };

  const anySaveInProgress =
    savingAll ||
    savingPlatformToggles ||
    savingAllFirstDm ||
    savingAllNewFollower ||
    savingAllKeyword ||
    savingFirstDmPlatform !== null ||
    savingNewFollowerPlatform !== null ||
    savingKeywordStepId !== null;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10">
      {loading && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          Loading automation settings…
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Automation</h1>
      </div>

      <div className="card border border-neutral-200 bg-neutral-50/50">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--button)]" />
            Automation by connected platform
          </h2>
          <p className="text-sm text-neutral-600 mt-1">
            Platform-specific automation controls are shown below.
          </p>
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
                        checked={Boolean(settings.dmWelcomeEnabledByPlatform?.[row.platform])}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked && !hasSetupMessage('first', row.platform)) {
                            setFirstDmSetupMessage('Please set up the auto DM message or add at least one attachment before enabling it.');
                            scrollToSectionWithOffset(firstDmSectionRef.current);
                            return;
                          }
                          setFirstDmSetupMessage(null);
                          mergeLocalSettings({
                            dmWelcomeEnabledByPlatform: { [row.platform]: checked },
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
                        checked={Boolean(settings.dmNewFollowerEnabledByPlatform?.[row.platform])}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked && !hasSetupMessage('follower', row.platform)) {
                            setNewFollowerSetupMessage('Please set up the welcome message first before enabling it.');
                            scrollToSectionWithOffset(newFollowerSectionRef.current);
                            return;
                          }
                          setNewFollowerSetupMessage(null);
                          mergeLocalSettings({
                            dmNewFollowerEnabledByPlatform: { [row.platform]: checked },
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
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void savePlatformToggles()}
            disabled={anySaveInProgress && !savingPlatformToggles}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
          >
            {savingPlatformToggles ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save
          </button>
          <button
            type="button"
            onClick={() => void saveAllAutomation()}
            disabled={anySaveInProgress && !savingAll}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--button)] px-4 py-2 text-sm font-medium text-chrome-text hover:opacity-90 disabled:opacity-50"
          >
            {savingAll ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save all
          </button>
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
          <strong className="font-medium text-neutral-800">Instagram and Facebook:</strong> this is how you welcome new followers. They must send you a DM first (following alone does not open a thread). Set a message here, enable the toggle on each platform card, Save, then run the readiness check.
        </p>
        <p className="text-sm text-neutral-600">
          We send when their latest inbound message is at most about 15 minutes old. Schedule <code className="text-xs">/api/cron/dm-first-welcome</code> every 1 to 2 minutes, or open the thread in Inbox to trigger immediately.
        </p>
        <p className="text-sm text-neutral-600">
          <button
            type="button"
            className="text-[var(--button)] font-medium underline hover:opacity-90 disabled:opacity-50"
            disabled={welcomeReadinessLoading}
            onClick={() => void runWelcomeReadinessCheck()}
          >
            {welcomeReadinessLoading ? 'Checking…' : 'Run welcome readiness check'}
          </button>
          {welcomeReadinessSummary ? (
            <span className="block mt-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 whitespace-pre-wrap">
              {welcomeReadinessSummary}
            </span>
          ) : null}
        </p>
        <p className="text-sm text-neutral-600">
          <strong className="font-medium text-neutral-700">Testing again?</strong>{' '}
          The auto-DM only fires once per conversation. If you sent a test message to the same thread before, reset the send history so the automation can fire again.{' '}
          <button
            type="button"
            className="text-orange-600 font-medium underline hover:opacity-90 disabled:opacity-50"
            disabled={resetHistoryLoading}
            onClick={async () => {
              setResetHistoryLoading(true);
              setResetHistoryMsg(null);
              try {
                const { data } = await api.delete<{ ok: boolean; deleted: number }>('/automation/reset-welcome-history');
                setResetHistoryMsg(`Done. Cleared ${data.deleted} conversation record${data.deleted === 1 ? '' : 's'}. Send a new message to trigger the auto-DM.`);
              } catch {
                setResetHistoryMsg('Could not reset. Try again or refresh the page.');
              } finally {
                setResetHistoryLoading(false);
              }
            }}
          >
            {resetHistoryLoading ? 'Resetting…' : 'Reset sent history'}
          </button>
          {resetHistoryMsg && (
            <span className="block mt-1 text-xs text-neutral-600">{resetHistoryMsg}</span>
          )}
        </p>
        {firstDmUploadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{firstDmUploadError}</div>
        )}
        <div className="space-y-3">
          {FIRST_DM_SUPPORTED_PLATFORMS.map((platform) => (
            <div key={`first-dm-${platform}`} className="rounded-xl border border-neutral-200 bg-white p-3">
              <label className="block text-sm font-medium text-neutral-800 mb-1.5">{platform}</label>
              <textarea
                value={settings.dmWelcomeMessagesByPlatform?.[platform] ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const prev = settingsRef.current;
                  const nextMsgs = { ...(prev.dmWelcomeMessagesByPlatform ?? {}), [platform]: value || null };
                  mergeLocalSettings({ dmWelcomeMessagesByPlatform: nextMsgs });
                }}
                placeholder={`Enter auto DM for ${platform}`}
                rows={3}
                className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--button)]/30 focus:border-[var(--button)] text-sm"
              />
              <div className="mt-2 space-y-2">
                {(settings.dmWelcomeAttachmentsByPlatform?.[platform] ?? []).map((att, idx) => (
                  <div
                    key={`${att.fileUrl}-${idx}`}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs"
                  >
                    {att.kind === 'image' ? (
                      <img src={att.fileUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                    ) : att.kind === 'video' ? (
                      <video src={att.fileUrl} className="h-10 w-14 rounded object-cover shrink-0 bg-black" muted playsInline />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded bg-neutral-200 flex items-center justify-center text-[10px] font-semibold text-neutral-600">
                        FILE
                      </div>
                    )}
                    <span className="truncate flex-1 text-neutral-700">{att.fileName ?? att.fileUrl}</span>
                    <button
                      type="button"
                      onClick={() => removeFirstDmAttachment(platform, idx)}
                      className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                      aria-label="Remove attachment"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-neutral-700 cursor-pointer hover:bg-neutral-50">
                    {firstDmUploadingPlatform === platform ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Paperclip size={14} />
                    )}
                    Attach file
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt"
                      disabled={firstDmUploadingPlatform !== null}
                      onChange={(e) => {
                        void handleFirstDmFilePick(platform, e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <span className="text-[11px] text-neutral-500">{firstDmAttachmentUrlsHint(platform)}</span>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void flushFirstDmPlatformToServer(platform, settingsRef.current)}
                  disabled={(savingFirstDmPlatform !== null && savingFirstDmPlatform !== platform) || savingAllFirstDm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--button)] px-3 py-1.5 text-xs font-medium text-chrome-text hover:opacity-90 disabled:opacity-50"
                >
                  {savingFirstDmPlatform === platform ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => void saveAllFirstDmSection()}
            disabled={anySaveInProgress && !savingAllFirstDm}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--button)] px-4 py-2 text-sm font-medium text-chrome-text hover:opacity-90 disabled:opacity-50"
          >
            {savingAllFirstDm ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save all
          </button>
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
          <strong className="font-medium text-neutral-800">X (Twitter) only:</strong> we can DM new followers automatically (schedule{' '}
          <code className="text-xs">/api/cron/welcome-followers</code> every 15 to 30 min). Instagram and Facebook cannot receive a proactive DM from a new follower alone: use{' '}
          <strong className="font-medium">Auto DM for first incoming message</strong> above when they send you a DM after following.
        </p>
        <p className="text-sm text-neutral-600">
          Before a live test, open{' '}
          <button
            type="button"
            className="text-[var(--button)] font-medium underline hover:opacity-90 disabled:opacity-50"
            disabled={welcomeReadinessLoading}
            onClick={() => void runWelcomeReadinessCheck()}
          >
            {welcomeReadinessLoading ? 'Checking…' : 'Run welcome readiness check'}
          </button>
          {welcomeReadinessSummary ? (
            <span className="block mt-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 whitespace-pre-wrap">
              {welcomeReadinessSummary}
            </span>
          ) : null}
        </p>
        <div className="space-y-3">
          {NEW_FOLLOWER_SUPPORTED_PLATFORMS.map((platform) => (
            <div key={`new-follower-dm-${platform}`} className="rounded-xl border border-neutral-200 bg-white p-3">
              <label className="block text-sm font-medium text-neutral-800 mb-1.5">{platform}</label>
              <textarea
                value={settings.dmNewFollowerMessagesByPlatform?.[platform] ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  mergeLocalSettings({
                    dmNewFollowerMessagesByPlatform: { [platform]: value || null },
                  });
                }}
                placeholder={`Enter welcome DM for new followers on ${platform}`}
                rows={3}
                className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--button)]/30 focus:border-[var(--button)] text-sm"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void flushNewFollowerPlatformToServer(platform, settingsRef.current)}
                  disabled={(savingNewFollowerPlatform !== null && savingNewFollowerPlatform !== platform) || savingAllNewFollower}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--button)] px-3 py-1.5 text-xs font-medium text-chrome-text hover:opacity-90 disabled:opacity-50"
                >
                  {savingNewFollowerPlatform === platform ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => void saveAllNewFollowerSection()}
            disabled={anySaveInProgress && !savingAllNewFollower}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--button)] px-4 py-2 text-sm font-medium text-chrome-text hover:opacity-90 disabled:opacity-50"
          >
            {savingAllNewFollower ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save all
          </button>
        </div>
      </div>

      <div className="card border border-neutral-200 bg-neutral-50/50">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <MessageSquare size={20} className="text-neutral-500" />
          Keyword automations
        </h2>
        <p className="text-sm text-neutral-600 mt-1">
          Build step-based keyword flows for comments. Example: if a user comments a keyword, send a reply, send a file or link, or forward to another page.
        </p>
        <div className="space-y-3 mt-2">
          {keywordSteps.map((step, idx) => (
            <div key={step.id} className="rounded-xl border border-neutral-200 bg-white p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">Step {idx + 1}</p>
                <button
                  type="button"
                  onClick={() => setKeywordSteps((prev) => prev.filter((s) => s.id !== step.id))}
                  className="inline-flex items-center gap-1 text-xs rounded-lg border border-neutral-200 px-2 py-1 text-neutral-600 hover:bg-neutral-100"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Trigger keyword</label>
                  <input
                    value={step.keyword}
                    onChange={(e) => setKeywordSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, keyword: e.target.value } : s)))}
                    placeholder="e.g. guide"
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Platforms</label>
                  <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 space-y-2">
                    <p className="text-[11px] text-neutral-500">
                      Choose one or more platforms.
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {KEYWORD_AUTOMATION_PLATFORMS.map((platform) => {
                        const checked = step.platforms.includes(platform);
                        return (
                          <label key={`${step.id}-${platform}`} className="inline-flex items-center gap-2 text-xs text-neutral-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setKeywordSteps((prev) =>
                                  prev.map((s) => {
                                    if (s.id !== step.id) return s;
                                    if (e.target.checked) {
                                      if (s.platforms.includes(platform)) return s;
                                      return { ...s, platforms: [...s.platforms, platform] };
                                    }
                                    const nextPlatforms = s.platforms.filter((p) => p !== platform);
                                    // Keep at least one platform selected for each step.
                                    if (nextPlatforms.length === 0) return s;
                                    return { ...s, platforms: nextPlatforms };
                                  }),
                                )
                              }
                              className="rounded border-neutral-300 text-[var(--button)] focus:ring-[var(--button)]/50"
                            />
                            <span>{platform}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Action</label>
                  <select
                    value={step.actionType}
                    onChange={(e) => setKeywordSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, actionType: e.target.value as KeywordAutomationStep['actionType'] } : s)))}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 bg-white"
                  >
                    <option value="reply">Send reply message</option>
                    <option value="send_file_or_link">Send file or link</option>
                    <option value="forward_to_page">Forward to page</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    {step.actionType === 'reply' ? 'Reply message' : step.actionType === 'send_file_or_link' ? 'File URL or link' : 'Page URL'}
                  </label>
                  {step.actionType === 'reply' ? (
                    <textarea
                      value={step.replyVariants.join('\n')}
                      onChange={(e) =>
                        setKeywordSteps((prev) =>
                          prev.map((s) =>
                            s.id === step.id
                              ? {
                                  ...s,
                                  replyVariants: e.target.value
                                    .split('\n')
                                    .map((v) => v.trim())
                                    .filter(Boolean),
                                  actionValue: e.target.value,
                                }
                              : s,
                          ),
                        )
                      }
                      placeholder="Write one reply per line. A different line can be sent each time."
                      rows={4}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
                    />
                  ) : (
                    <input
                      value={step.actionValue}
                      onChange={(e) => setKeywordSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, actionValue: e.target.value } : s)))}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
                    />
                  )}
                </div>
                {step.actionType === 'reply' && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Reply phrasing strategy</label>
                    <select
                      value={step.replyVariantStrategy}
                      onChange={(e) =>
                        setKeywordSteps((prev) =>
                          prev.map((s) =>
                            s.id === step.id
                              ? {
                                  ...s,
                                  replyVariantStrategy:
                                    e.target.value === 'random' ? 'random' : 'rotate',
                                }
                              : s,
                          ),
                        )
                      }
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 bg-white"
                    >
                      <option value="rotate">Rotate replies (A, then B, then C)</option>
                      <option value="random">Random reply each time</option>
                    </select>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Add multiple lines above, the system will use a different reply each trigger.
                    </p>
                  </div>
                )}
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={(e) => setKeywordSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, enabled: e.target.checked } : s)))}
                  className="rounded border-neutral-300 text-[var(--button)] focus:ring-[var(--button)]/50"
                />
                <span className="text-xs font-medium text-neutral-700">Enable this step</span>
              </label>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => void saveKeywordStep(step.id)}
                  disabled={(savingKeywordStepId !== null && savingKeywordStepId !== step.id) || savingAllKeyword}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--button)] px-3 py-1.5 text-xs font-medium text-chrome-text hover:opacity-90 disabled:opacity-50"
                >
                  {savingKeywordStepId === step.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
          <button
            type="button"
            onClick={() =>
              setKeywordSteps((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  keyword: '',
                  platforms: ['Instagram'],
                  actionType: 'reply',
                  actionValue: '',
                  replyVariants: [],
                  replyVariantStrategy: 'rotate',
                  enabled: true,
                },
              ])
            }
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <Plus size={14} />
            Add step
          </button>
          <button
            type="button"
            onClick={() => void saveAllKeywordSection()}
            disabled={anySaveInProgress && !savingAllKeyword}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--button)] px-4 py-2 text-sm font-medium text-chrome-text hover:opacity-90 disabled:opacity-50"
          >
            {savingAllKeyword ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save all
          </button>
        </div>
      </div>

    </div>
  );
}
