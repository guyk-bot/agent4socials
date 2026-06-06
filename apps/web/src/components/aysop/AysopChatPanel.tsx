'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import { Bot, Loader2, Paperclip, Send, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import {
  AYSOP_CHAT_FILE_ACCEPT,
  AYSOP_CHAT_MAX_ATTACHMENTS,
  attachmentKindFromMime,
  validateChatFile,
  type AysopChatAttachment,
} from '@/lib/ai/aysop-attachments';
import { AysopArtifactCards } from '@/components/aysop/AysopArtifactCards';
import {
  AysopMessageAttachments,
  AysopPendingAttachments,
} from '@/components/aysop/AysopMessageAttachments';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: AysopArtifact[];
  attachments?: AysopChatAttachment[];
};

const STARTERS = [
  'Show my Console analytics',
  'Open my brand context from AI Assistant',
  'What is scheduled on my calendar?',
  'Show Instagram analytics with a chart',
  'Open my automation rules',
];

type Props = {
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  sessionLoading?: boolean;
  disabled?: boolean;
};

async function uploadChatFile(file: File): Promise<AysopChatAttachment> {
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
  return {
    fileUrl,
    fileName: file.name,
    contentType: file.type || undefined,
    kind: attachmentKindFromMime(file.type || '', file.name),
  };
}

export default function AysopChatPanel({
  messages,
  onMessagesChange,
  sessionLoading,
  disabled,
}: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AysopChatAttachment[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, sessionLoading, pendingAttachments]);

  const handleFilePick = async (files: FileList | null) => {
    if (!files?.length || disabled || loading || uploading) return;
    setError(null);

    const remaining = AYSOP_CHAT_MAX_ATTACHMENTS - pendingAttachments.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${AYSOP_CHAT_MAX_ATTACHMENTS} files per message.`);
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining);
    for (const file of toUpload) {
      const validationError = validateChatFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setUploading(true);
    try {
      const uploaded: AysopChatAttachment[] = [];
      for (const file of toUpload) {
        uploaded.push(await uploadChatFile(file));
      }
      setPendingAttachments((prev) => [...prev, ...uploaded].slice(0, AYSOP_CHAT_MAX_ATTACHMENTS));
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e as Error).message ??
        'Upload failed. Check media storage configuration.';
      setError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const send = useCallback(
    async (text: string, attachments: AysopChatAttachment[] = []) => {
      const trimmed = text.trim();
      const hasAttachments = attachments.length > 0;
      if ((!trimmed && !hasAttachments) || loading || disabled || uploading) return;

      setError(null);
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        attachments: hasAttachments ? attachments : undefined,
      };
      const next = [...messages, userMsg];
      onMessagesChange(next);
      setInput('');
      setPendingAttachments([]);
      setLoading(true);
      try {
        const payload = next.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
        }));
        const res = await api.post<{ reply: string; artifacts?: AysopArtifact[] }>(
          '/ai/aysop-chat',
          { messages: payload },
          { timeout: 90_000 }
        );
        const withAssistant: ChatMessage[] = [
          ...next,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: res.data.reply,
            artifacts: res.data.artifacts,
          },
        ];
        onMessagesChange(withAssistant);
      } catch (e) {
        const axiosErr = e as {
          response?: { status?: number; data?: { message?: string } };
          code?: string;
        };
        const status = axiosErr.response?.status;
        const serverMsg = axiosErr.response?.data?.message;
        let msg = serverMsg ?? 'Something went wrong. Try again.';
        if (status === 504 || axiosErr.code === 'ECONNABORTED' || /timed out/i.test(String(serverMsg ?? ''))) {
          msg =
            'That took too long. Try a shorter question (one platform) or ask again in a moment.';
        }
        setError(msg);
        onMessagesChange(next);
      } finally {
        setLoading(false);
      }
    },
    [disabled, loading, messages, onMessagesChange, uploading]
  );

  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !loading && !disabled && !uploading;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100 bg-[var(--dark)] text-chrome-text shrink-0">
        <Bot size={20} className="text-[#53BEFA]" />
        <span className="font-semibold text-sm">{BRAND_NAME} AI</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#fafafa] dark:bg-neutral-950 min-h-0">
        {sessionLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center gap-2 text-neutral-500 dark:text-neutral-400 text-xs py-2">
            <Loader2 size={14} className="animate-spin" />
            Loading chat…
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Sparkles className="mx-auto text-[var(--primary)] mb-3" size={32} />
            <p className="text-neutral-700 dark:text-neutral-200 font-medium">Your social copilot</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-md mx-auto">
              Ask to open Dashboard, Console, Inbox, Calendar, Automation, Smart Links, brand context, or analytics charts. Attach images, videos, or files with the paperclip.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={disabled || loading || uploading}
                  className="text-xs px-3 py-2 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[95%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[var(--primary)] text-chrome-text rounded-br-md'
                    : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 rounded-bl-md shadow-sm'
                }`}
              >
                {m.content ? m.content : null}
                {m.attachments?.length ? (
                  <AysopMessageAttachments attachments={m.attachments} variant={m.role} />
                ) : null}
                {m.role === 'assistant' && m.artifacts?.length ? (
                  <AysopArtifactCards artifacts={m.artifacts} />
                ) : null}
              </div>
            </div>
          ))
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 text-sm">
            <Loader2 size={16} className="animate-spin" />
            {BRAND_NAME} is thinking…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="px-4 py-2 text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-t border-red-100 dark:border-red-900 shrink-0">{error}</p>
      ) : null}

      <AysopPendingAttachments
        attachments={pendingAttachments}
        uploading={uploading}
        onRemove={(index) => setPendingAttachments((prev) => prev.filter((_, i) => i !== index))}
      />

      <form
        className="p-3 border-t border-neutral-100 dark:border-neutral-800 flex gap-2 bg-white dark:bg-neutral-950 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input, pendingAttachments);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={AYSOP_CHAT_FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => void handleFilePick(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || disabled || uploading || pendingAttachments.length >= AYSOP_CHAT_MAX_ATTACHMENTS}
          className="shrink-0 rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 py-3 text-neutral-600 dark:text-neutral-300 hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-40 transition-colors"
          aria-label="Attach file"
          title="Attach image, video, or file"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything or attach media…"
          className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          disabled={loading || disabled || uploading}
        />
        <button
          type="submit"
          disabled={!canSend}
          className="shrink-0 rounded-xl bg-[var(--dark)] text-chrome-text px-4 py-3 hover:opacity-90 disabled:opacity-40 transition-opacity"
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
