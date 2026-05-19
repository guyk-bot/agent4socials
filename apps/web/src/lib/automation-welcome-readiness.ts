import type { Platform } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  automationFirstIncomingReady,
  platformToUiLabel,
} from '@/lib/dm-first-welcome';
import { listTwitterFollowerIds } from '@/lib/twitter-send-dm';

const FIRST_INCOMING_CRON = '/api/cron/dm-first-welcome';
const NEW_FOLLOWER_CRON = '/api/cron/welcome-followers';

export type WelcomeFeatureId = 'first_incoming_dm' | 'new_follower_dm';

export type PlatformWelcomeReadiness = {
  platform: string;
  platformEnum: Platform | null;
  feature: WelcomeFeatureId;
  featureLabel: string;
  available: boolean;
  configured: boolean;
  enabled: boolean;
  accountConnected: boolean;
  accountId: string | null;
  accountUsername: string | null;
  cronPath: string | null;
  blockers: string[];
  testSteps: string[];
};

type AutomationJson = Record<string, unknown>;

function parseAutomation(raw: unknown): AutomationJson {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as AutomationJson) : {};
}

function firstIncomingEnabled(s: AutomationJson, label: string): boolean {
  const by = s.dmWelcomeEnabledByPlatform;
  if (by && typeof by === 'object' && !Array.isArray(by)) {
    const v = (by as Record<string, unknown>)[label];
    if (typeof v === 'boolean') return v;
  }
  return s.dmWelcomeEnabled === true && label === 'Instagram';
}

function firstIncomingMessage(s: AutomationJson, label: string): string {
  const by = s.dmWelcomeMessagesByPlatform;
  if (by && typeof by === 'object' && !Array.isArray(by)) {
    const m = (by as Record<string, unknown>)[label];
    if (typeof m === 'string') return m.trim();
  }
  if (label === 'Instagram' && typeof s.dmWelcomeMessage === 'string') return s.dmWelcomeMessage.trim();
  return '';
}

function newFollowerEnabled(s: AutomationJson): boolean {
  return s.dmNewFollowerEnabled === true;
}

function newFollowerMessage(s: AutomationJson): string {
  return typeof s.dmNewFollowerMessage === 'string' ? s.dmNewFollowerMessage.trim() : '';
}

export async function checkWelcomeAutomationReadiness(userId: string): Promise<{
  ok: boolean;
  platforms: PlatformWelcomeReadiness[];
  summary: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { automationSettings: true },
  });
  const settings = parseAutomation(user?.automationSettings ?? null);

  const accounts = await prisma.socialAccount.findMany({
    where: { userId, platform: { in: ['INSTAGRAM', 'FACEBOOK', 'TWITTER'] } },
    select: { id: true, platform: true, username: true, accessToken: true, refreshToken: true, platformUserId: true, credentialsJson: true },
  });

  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));

  const rows: PlatformWelcomeReadiness[] = [];

  for (const platform of ['INSTAGRAM', 'FACEBOOK', 'TWITTER'] as const) {
    const label = platformToUiLabel(platform);
    const acc = byPlatform.get(platform);
    const connected = Boolean(acc?.accessToken);

    const firstConfigured =
      automationFirstIncomingReady(user?.automationSettings ?? null, platform) ||
      (firstIncomingEnabled(settings, label) && Boolean(firstIncomingMessage(settings, label)));
    const firstEnabled = firstIncomingEnabled(settings, label);

    const firstBlockers: string[] = [];
    if (!connected) firstBlockers.push(`Connect ${label} in the sidebar.`);
    if (!firstConfigured) firstBlockers.push('Set a welcome message (or attachment) under Auto DM for first incoming message.');
    if (!firstEnabled) firstBlockers.push(`Enable auto-DM for first incoming message on the ${label} card.`);

    rows.push({
      platform: label,
      platformEnum: platform,
      feature: 'first_incoming_dm',
      featureLabel: 'Auto-DM when they message you first',
      available: true,
      configured: firstConfigured,
      enabled: firstEnabled,
      accountConnected: connected,
      accountId: acc?.id ?? null,
      accountUsername: acc?.username ?? null,
      cronPath: FIRST_INCOMING_CRON,
      blockers: firstBlockers,
      testSteps:
        platform === 'TWITTER'
          ? [
              'Enable the message and toggle on the platform card, then Save.',
              `Schedule cron ${FIRST_INCOMING_CRON} every 1 to 2 minutes (X-Cron-Secret header).`,
              'From your test account, send a DM to the connected account (do not only follow).',
              'Wait up to 2 minutes, or open the thread in Inbox to trigger immediately.',
            ]
          : [
              'Enable the message and toggle on the platform card, then Save.',
              `Schedule cron ${FIRST_INCOMING_CRON} every 1 to 2 minutes (X-Cron-Secret header).`,
              'From your test account, open DM and send a message to the connected account.',
              'A follow alone does not open a DM thread on Instagram or Facebook.',
              'Wait up to 2 minutes, or open the thread in Inbox to trigger immediately.',
            ],
    });

    if (platform === 'TWITTER') {
      const nfConfigured = newFollowerEnabled(settings) && Boolean(newFollowerMessage(settings));
      const nfBlockers: string[] = [];
      if (!connected) nfBlockers.push('Connect X (Twitter) in the sidebar.');
      if (!nfConfigured) nfBlockers.push('Set a welcome message under Welcome DM to new follower and enable it on the X card.');
      if (connected && acc && nfConfigured) {
        const followers = await listTwitterFollowerIds({
          accessToken: acc.accessToken,
          refreshToken: acc.refreshToken,
          credentialsJson: acc.credentialsJson,
          platformUserId: acc.platformUserId,
        });
        if (!followers.ok) {
          nfBlockers.push(`Cannot read followers via API: ${followers.error}. Reconnect X with dm.read and users.read scopes.`);
        }
      }

      rows.push({
        platform: label,
        platformEnum: platform,
        feature: 'new_follower_dm',
        featureLabel: 'Proactive welcome DM to new followers (X only)',
        available: true,
        configured: nfConfigured,
        enabled: newFollowerEnabled(settings),
        accountConnected: connected,
        accountId: acc?.id ?? null,
        accountUsername: acc?.username ?? null,
        cronPath: NEW_FOLLOWER_CRON,
        blockers: nfBlockers,
        testSteps: [
          'Enable welcome DM to new followers on the X card and Save.',
          `Schedule cron ${NEW_FOLLOWER_CRON} every 15 to 30 minutes.`,
          'Follow from your test account. New followers are picked up on the next cron run (not instant).',
          'The test account must accept DMs from people you follow or everyone, or the send will fail.',
        ],
      });
    } else {
      rows.push({
        platform: label,
        platformEnum: platform,
        feature: 'new_follower_dm',
        featureLabel: 'Proactive welcome DM to new followers',
        available: false,
        configured: false,
        enabled: false,
        accountConnected: connected,
        accountId: acc?.id ?? null,
        accountUsername: acc?.username ?? null,
        cronPath: null,
        blockers: [
          `${label} does not allow unsolicited DMs to someone who only followed you.`,
          'Use Auto-DM when they message you first instead.',
        ],
        testSteps: [
          'After following, send a DM from your test account.',
          'Use the first incoming message automation above.',
        ],
      });
    }
  }

  const readyFirst = rows.filter((r) => r.feature === 'first_incoming_dm' && r.enabled && r.configured && r.accountConnected && r.blockers.length === 0);
  const summary =
    readyFirst.length > 0
      ? `Ready to test first-incoming welcome on: ${readyFirst.map((r) => r.platform).join(', ')}.`
      : 'Complete the blockers below before testing.';

  return { ok: readyFirst.length > 0, platforms: rows, summary };
}
