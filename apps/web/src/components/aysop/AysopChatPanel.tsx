'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import { Bot, Loader2, Paperclip, Send, Sparkles, Square } from 'lucide-react';
import api, {
  API_AYSOP_CHAT_ATTACHMENTS_TIMEOUT_MS,
  API_AYSOP_CHAT_TIMEOUT_MS,
  API_MEDIA_UPLOAD_TIMEOUT_MS,
  R2_DIRECT_UPLOAD_TIMEOUT_MS,
} from '@/lib/api';
import { friendlyAysopChatError } from '@/lib/ai/aysop-chat-errors';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { resolveChatBrandContext } from '@/lib/ai/aysop-workspace-snapshot';
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
import { AysopChatMessageContent } from '@/components/aysop/AysopChatMessageContent';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: AysopArtifact[];
  attachments?: AysopChatAttachment[];
};

const STARTERS = [
  'Connect a platform for me',
  'Show my latest comments so I can reply',
  'Draft a post for X and let me schedule it',
  'Show my Console analytics',
];

type Props = {
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  disabled?: boolean;
};

async function uploadChatFile(file: File): Promise<AysopChatAttachment> {
  const res = await api.post<{ uploadUrl: string; fileUrl: string }>(
    '/media/upload-url',
    {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
    },
    { timeout: API_MEDIA_UPLOAD_TIMEOUT_MS }
  );
  const { uploadUrl, fileUrl } = res.data;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), R2_DIRECT_UPLOAD_TIMEOUT_MS);
  let putRes: Response;
  try {
    putRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      signal: ac.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Upload timed out. Try a smaller file or check your connection.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
  return {
    fileUrl,
    fileName: file.name,
    contentType: file.type || undefined,
    kind: attachmentKindFromMime(file.type || '', file.name),
  };
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: string; name?: string };
  return err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError';
}

export default function AysopChatPanel({
  messages,
  onMessagesChange,
  disabled,
}: Props) {
  const accountsCache = useAccountsCache();
  const brands = accountsCache?.brands ?? [];
  const allCachedAccounts = accountsCache?.allCachedAccounts ?? [];
  const getAccountBrandId = accountsCache?.getAccountBrandId;
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AysopChatAttachment[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialScrollRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);

  useLayoutEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (initialScrollRef.current) {
      initialScrollRef.current = false;
      container.scrollTop = container.scrollHeight;
      prevMessageCountRef.current = messages.length;
      return;
    }

    const messageCountGrew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (messageCountGrew || loading) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading]);

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
      setError(friendlyAysopChatError(e, 'Upload failed. Check media storage configuration.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const stopGeneration = useCallback(() => {
    requestGenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const send = useCallback(
    async (text: string, attachments: AysopChatAttachment[] = []) => {
      const trimmed = text.trim();
      const hasAttachments = attachments.length > 0;
      if ((!trimmed && !hasAttachments) || disabled || uploading) return;
      if (loading) return;

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

      abortRef.current?.abort();
      const gen = requestGenRef.current + 1;
      requestGenRef.current = gen;
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const payload = next.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
        }));
        const brandContext = await resolveChatBrandContext({
          contextBrands: brands,
          contextAccounts: allCachedAccounts,
          getAccountBrandId: getAccountBrandId,
          activeBrandId: accountsCache?.activeBrandId,
          fetchAccounts: async () => {
            const res = await api.get<Array<{ id: string; platform: string; username?: string | null }>>(
              '/social/accounts',
              { signal: ac.signal, timeout: API_AYSOP_CHAT_TIMEOUT_MS }
            );
            const rows = Array.isArray(res.data) ? res.data : [];
            return rows.map((a) => ({
              id: a.id,
              platform: a.platform,
              username: a.username ?? null,
            }));
          },
        });
        if (gen !== requestGenRef.current || ac.signal.aborted) return;

        const chatTimeout =
          hasAttachments && attachments.some((a) => a.kind === 'file' || a.kind === 'video')
            ? API_AYSOP_CHAT_ATTACHMENTS_TIMEOUT_MS
            : API_AYSOP_CHAT_TIMEOUT_MS;

        const res = await api.post<{ reply: string; artifacts?: AysopArtifact[] }>(
          '/ai/aysop-chat',
          {
            messages: payload,
            workspaces: brandContext.workspaces,
            activeBrand: brandContext.activeBrand,
          },
          { timeout: chatTimeout, signal: ac.signal }
        );
        if (gen !== requestGenRef.current || ac.signal.aborted) return;

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
        if (isAbortError(e)) return;
        if (gen !== requestGenRef.current) return;

        setError(friendlyAysopChatError(e, 'Something went wrong. Try again.'));
        onMessagesChange(next);
      } finally {
        if (gen === requestGenRef.current) {
          setLoading(false);
          if (abortRef.current === ac) abortRef.current = null;
        }
      }
    },
    [accountsCache?.activeBrandId, allCachedAccounts, brands, disabled, getAccountBrandId, loading, messages, onMessagesChange, uploading]
  );

  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !loading && !disabled && !uploading;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100 bg-[var(--dark)] text-chrome-text shrink-0">
        <Bot size={20} className="text-[#53BEFA]" />
        <span className="font-semibold text-sm">{BRAND_NAME} AI</span>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#fafafa] dark:bg-neutral-950 min-h-0"
      >
        {messages.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Sparkles className="mx-auto text-[var(--primary)] mb-3" size={32} />
            <p className="text-neutral-700 dark:text-neutral-200 font-medium">Your social copilot</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-md mx-auto">
              Connect platforms, draft and schedule posts, reply to comments, and pull analytics, all from chat. Attach media with the paperclip.
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
                {m.content ? <AysopChatMessageContent content={m.content} variant={m.role} /> : null}
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
            <Loader2 size={16} className="animate-spin shrink-0" />
            <span>{BRAND_NAME} is thinking…</span>
          </div>
        ) : null}
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
          placeholder={loading ? 'Type your next message…' : 'Ask anything or attach media…'}
          className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          disabled={disabled || uploading}
        />
        {loading ? (
          <button
            type="button"
            onClick={stopGeneration}
            className="shrink-0 rounded-xl bg-[var(--dark)] text-chrome-text px-4 py-3 hover:opacity-90 transition-opacity"
            aria-label="Stop generating"
            title="Stop"
          >
            <Square size={18} className="fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="shrink-0 rounded-xl bg-[var(--dark)] text-chrome-text px-4 py-3 hover:opacity-90 disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        )}
      </form>
    </div>
  );
}
