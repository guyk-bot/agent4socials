import type { OpenAIContentPart } from '@/lib/openai-client';
import type { IzopChatAttachment } from '@/lib/ai/izop-attachments';

export type IzopChatInputMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: IzopChatAttachment[];
};

export function buildOpenAiUserContent(msg: IzopChatInputMessage): string | OpenAIContentPart[] {
  const parts: OpenAIContentPart[] = [];
  const text = msg.content.trim();
  if (text) parts.push({ type: 'text', text });

  for (const att of msg.attachments ?? []) {
    if (att.kind === 'image') {
      parts.push({ type: 'image_url', image_url: { url: att.fileUrl, detail: 'low' } });
      continue;
    }
    const label = att.kind === 'video' ? 'Video' : 'File';
    parts.push({
      type: 'text',
      text: `[User attached ${label}: ${att.fileName}${att.contentType ? ` (${att.contentType})` : ''}. URL: ${att.fileUrl}]`,
    });
  }

  if (parts.length === 0) return '';
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
  return parts;
}

export function threadHasImages(messages: IzopChatInputMessage[]): boolean {
  return messages.some(
    (m) => m.role === 'user' && (m.attachments?.some((a) => a.kind === 'image') ?? false)
  );
}

/** Vision is only needed when the latest user turn includes images. */
export function lastUserMessageHasImages(messages: IzopChatInputMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser?.attachments?.some((a) => a.kind === 'image') ?? false;
}

export function findLatestMediaUserMessage(
  messages: IzopChatInputMessage[]
): IzopChatInputMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'user' && (m.attachments?.length ?? 0) > 0) {
      return m;
    }
  }
  return null;
}
