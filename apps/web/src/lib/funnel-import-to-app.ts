import { randomUUID } from 'crypto';
import type { Platform, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createAysopChatSession, updateAysopChatSession } from '@/lib/ai/aysop-chat-store';
import type { StoredAysopMessage } from '@/lib/ai/aysop-chat-sessions';
import type { FunnelChatPayload } from '@/lib/funnel-guest';

export type GuestPublishMeta = {
  caption: string;
  platform: Platform;
  platformPostId?: string;
  publishedAt?: string;
};

type FunnelBlock = {
  kind?: string;
  text?: string;
  labels?: string[];
  items?: Array<{ value?: string; label?: string }>;
};

export function funnelBlocksToAysopMessages(blocks: unknown[]): StoredAysopMessage[] {
  const messages: StoredAysopMessage[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const block = raw as FunnelBlock;
    if (block.kind === 'user_pills' && Array.isArray(block.labels) && block.labels.length > 0) {
      messages.push({
        id: randomUUID(),
        role: 'user',
        content: block.labels.join(', '),
      });
    } else if (block.kind === 'ai' && typeof block.text === 'string' && block.text.trim()) {
      messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: block.text.trim(),
      });
    } else if (block.kind === 'stats' && Array.isArray(block.items) && block.items.length > 0) {
      const summary = block.items
        .map((item) => `${item.label ?? 'Metric'}: ${item.value ?? '0'}`)
        .join(', ');
      messages.push({
        id: randomUUID(),
        role: 'assistant',
        content: `Analytics snapshot: ${summary}`,
      });
    }
  }
  return messages.slice(-40);
}

export async function importFunnelChatToAysop(
  userId: string,
  chatPayload: FunnelChatPayload | null | undefined
): Promise<string | undefined> {
  const blocks = Array.isArray(chatPayload?.blocks) ? chatPayload.blocks : [];
  const messages = funnelBlocksToAysopMessages(blocks);
  if (messages.length === 0) return undefined;

  const session = await createAysopChatSession(userId, 'Landing chat');
  const updated = await updateAysopChatSession(userId, session.id, { messages });
  return updated?.id ?? session.id;
}

export async function importGuestPublishToPost(
  userId: string,
  socialAccountId: string,
  meta: GuestPublishMeta | null | undefined
): Promise<string | undefined> {
  if (!meta?.caption?.trim() || !meta.platform) return undefined;

  const account = await prisma.socialAccount.findFirst({
    where: { id: socialAccountId, userId, status: 'connected' },
    select: { id: true, platform: true },
  });
  if (!account) return undefined;

  const postedAt = meta.publishedAt ? new Date(meta.publishedAt) : new Date();
  const platform = meta.platform;

  const existing = meta.platformPostId
    ? await prisma.postTarget.findFirst({
        where: {
          socialAccountId: account.id,
          platform,
          platformPostId: meta.platformPostId,
        },
        select: { postId: true },
      })
    : null;
  if (existing) return existing.postId;

  const post = await prisma.post.create({
    data: {
      userId,
      content: meta.caption.trim(),
      status: 'POSTED',
      postedAt,
      targetPlatforms: [platform],
      targets: {
        create: {
          platform,
          socialAccountId: account.id,
          status: 'POSTED',
          platformPostId: meta.platformPostId ?? null,
        },
      },
    },
    select: { id: true },
  });

  if (meta.platformPostId) {
    await prisma.importedPost
      .upsert({
        where: {
          socialAccountId_platformPostId: {
            socialAccountId: account.id,
            platformPostId: meta.platformPostId,
          },
        },
        create: {
          socialAccountId: account.id,
          platformPostId: meta.platformPostId,
          platform,
          content: meta.caption.trim(),
          publishedAt: postedAt,
        },
        update: {
          content: meta.caption.trim(),
          publishedAt: postedAt,
        },
      })
      .catch(() => {});
  }

  return post.id;
}

export function parseGuestPublishMeta(value: unknown): GuestPublishMeta | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const caption = typeof row.caption === 'string' ? row.caption.trim() : '';
  const platform = typeof row.platform === 'string' ? (row.platform as Platform) : null;
  if (!caption || !platform) return null;
  return {
    caption,
    platform,
    platformPostId: typeof row.platformPostId === 'string' ? row.platformPostId : undefined,
    publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : undefined,
  };
}

export function guestPublishMetaToJson(meta: GuestPublishMeta): Prisma.InputJsonValue {
  return meta as unknown as Prisma.InputJsonValue;
}
