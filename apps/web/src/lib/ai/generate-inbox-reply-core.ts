import { openAiChat } from '@/lib/openai-client';

export type InboxReplyBrandContext = {
  toneOfVoice?: string | null;
  toneExamples?: string | null;
  inboxReplyExamples?: string | null;
  commentReplyExamples?: string | null;
};

export type GenerateInboxReplyInput = {
  type: 'comment' | 'message';
  text: string;
  context?: string;
  platform?: string;
  brand?: InboxReplyBrandContext | null;
};

export type InboxBatchItem = {
  id: string;
  text: string;
  context?: string;
  platform?: string;
};

function buildInboxReplySystemPrompt(type: 'comment' | 'message', brand: InboxReplyBrandContext | null | undefined): string {
  const systemParts: string[] = [
    'You are a helpful assistant that writes short, natural replies for social media inbox messages and comments.',
    'Use plain text only. No markdown (no ** or *). No em dashes or en dashes; use commas or " to " instead.',
    'Keep each reply concise and friendly (1-2 sentences). Match the brand tone.',
  ];
  if (brand?.toneOfVoice?.trim()) {
    systemParts.push(`Tone: ${brand.toneOfVoice.trim()}`);
  }
  if (brand?.toneExamples?.trim()) {
    systemParts.push(`Example tone: ${brand.toneExamples.trim().slice(0, 200)}`);
  }
  if (type === 'message' && brand?.inboxReplyExamples?.trim()) {
    systemParts.push(`Example DM replies:\n${brand.inboxReplyExamples.trim().slice(0, 500)}`);
  }
  if (type === 'comment' && brand?.commentReplyExamples?.trim()) {
    systemParts.push(`Example comment replies:\n${brand.commentReplyExamples.trim().slice(0, 500)}`);
  }
  return systemParts.join('\n');
}

function parseBatchRepliesJson(raw: string, expectedIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const cleaned = raw.trim();
  if (!cleaned) return out;
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const map =
      parsed.replies && typeof parsed.replies === 'object' && !Array.isArray(parsed.replies)
        ? (parsed.replies as Record<string, unknown>)
        : parsed;
    for (const id of expectedIds) {
      const v = map[id];
      if (typeof v === 'string' && v.trim()) {
        out[id] = cleanInboxReply(v).slice(0, 2000);
      }
    }
  } catch {
    /* fall through to per-item */
  }
  return out;
}

export function cleanInboxReply(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * One OpenAI request for many replies (much faster than N parallel calls).
 */
export async function generateInboxRepliesBatch(args: {
  type: 'comment' | 'message';
  items: InboxBatchItem[];
  brand?: InboxReplyBrandContext | null;
}): Promise<{ replies: Record<string, string>; errors: Record<string, string> }> {
  const { type, items, brand } = args;
  const ids = items.map((i) => i.id);
  const errors: Record<string, string> = {};
  if (items.length === 0) return { replies: {}, errors };

  const batchModel =
    process.env.OPENAI_INBOX_BATCH_MODEL?.trim() ||
    process.env.OPENAI_CHAT_MODEL?.trim() ||
    'gpt-4o-mini';

  const lines = items.map((item, idx) => {
    const parts = [
      `[${idx + 1}] id=${item.id}`,
      `incoming: ${item.text.slice(0, 400)}`,
    ];
    if (item.context) parts.push(`post: ${item.context.slice(0, 120)}`);
    if (item.platform) parts.push(`platform: ${item.platform}`);
    return parts.join('\n');
  });

  const userContent = [
    `Write one unique ${type === 'comment' ? 'comment' : 'DM'} reply for each item below.`,
    'Return JSON only: {"replies":{"<id>":"<reply text>", ...}}',
    'Use the exact id= values as keys. Each reply: 1-2 sentences, plain text, ready to post.',
    '',
    ...lines,
  ].join('\n');

  const maxTokens = Math.min(2500, Math.max(400, items.length * 100 + 150));

  const result = await openAiChat(
    [
      { role: 'system', content: buildInboxReplySystemPrompt(type, brand) },
      { role: 'user', content: userContent },
    ],
    {
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      model: batchModel,
    }
  );

  const replies = parseBatchRepliesJson(result.content, ids);
  for (const id of ids) {
    if (!replies[id]) {
      errors[id] = 'No reply in batch response';
    }
  }

  const missing = ids.filter((id) => !replies[id]);
  for (const id of missing.slice(0, 8)) {
    const item = items.find((i) => i.id === id);
    if (!item) continue;
    try {
      replies[id] = await generateInboxReply({
        type,
        text: item.text,
        context: item.context,
        platform: item.platform,
        brand,
      });
      delete errors[id];
    } catch (e) {
      errors[id] = e instanceof Error ? e.message : 'Failed to generate reply';
    }
  }

  for (const id of ids) {
    if (replies[id] && !replies[id].trim()) {
      replies[id] = 'Thanks for your message!';
    }
  }

  return { replies, errors };
}

export async function generateInboxReply(input: GenerateInboxReplyInput): Promise<string> {
  const type = input.type;
  const text = input.text.trim();
  const context = input.context?.trim() ?? '';
  const platform = input.platform?.trim().toUpperCase() ?? '';
  const brand = input.brand;

  const typeLabel = type === 'comment' ? 'Comment' : 'Message';
  let userContent = `${typeLabel} to reply to:\n"${text.slice(0, 800)}"`;
  if (context) {
    userContent += `\n\nContext: ${context.slice(0, 300)}`;
  }
  if (platform) {
    const hints: Record<string, string> = {
      TWITTER: 'Under 280 characters.',
      INSTAGRAM: 'Conversational.',
      FACEBOOK: 'Friendly and clear.',
      YOUTUBE: 'Friendly and clear.',
      LINKEDIN: 'Professional but warm.',
    };
    if (hints[platform]) userContent += `\n\n${hints[platform]}`;
  }
  userContent += '\n\nReply text only, no quotes or labels.';

  const result = await openAiChat(
    [
      { role: 'system', content: buildInboxReplySystemPrompt(type, brand) },
      { role: 'user', content: userContent },
    ],
    { max_tokens: 150 }
  );

  const reply = cleanInboxReply(result.content).slice(0, 2000);
  return reply || 'Thanks for your message!';
}
