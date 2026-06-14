'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import { Loader2, Paperclip, Send, Square } from 'lucide-react';
import { IzopGlassLogo } from '@/components/IzopGlassLogo';
import { ZThinkingLoopAnimation } from '@/components/ZThinkingLoopAnimation';
import { useTheme } from '@/context/ThemeContext';
import api, {
  API_AYSOP_CHAT_ATTACHMENTS_TIMEOUT_MS,
  API_AYSOP_CHAT_TIMEOUT_MS,
} from '@/lib/api';
import { friendlyAysopChatError } from '@/lib/ai/aysop-chat-errors';
import {
  abortChatRunner,
  getChatRunnerJob,
  isChatRunnerActive,
  runChatInBackground,
  subscribeChatRunner,
} from '@/lib/ai/aysop-chat-runner';
import { readCachedMessages } from '@/lib/ai/aysop-chat-local-cache';
import { uploadMediaFile } from '@/lib/media/upload-client';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { MediaUploadProgress } from '@/components/media/MediaUploadProgress';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { resolveChatBrandContext } from '@/lib/ai/aysop-workspace-snapshot';
import {
  applyBrandContextClearedOnClient,
  artifactsClearedBrandContext,
  parseBrandContextApiPayload,
  readBrandContextCache,
} from '@/lib/brand-context-utils';
import { isAysopQuickReplyMessage } from '@/lib/ai/aysop-quick-replies';
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
import { leadsScanReplyText, leadsToChatArtifacts } from '@/lib/leads/leads-chat-artifact';
import { cacheLeadsScanPayload } from '@/lib/leads/leads-sync-client';
import type { ScannedLead } from '@/lib/leads/scan-leads';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: AysopArtifact[];
  attachments?: AysopChatAttachment[];
};

const STARTERS = [
  'Connect a platform for me',
  'Show my latest Threads replies',
  'Show my Console analytics',
  'Draft a post for X and let me schedule it',
];

type Props = {
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  disabled?: boolean;
  /** Bumped when the user switches chats so in-flight requests reset without remounting the panel. */
  panelResetKey?: number;
  sessionId?: string | null;
  userId?: string | null;
};

async function uploadChatFile(
  file: File, 
  uploadFile: (file: File) => Promise<any>
): Promise<AysopChatAttachment> {
  const result = await uploadFile(file);
  if (!result) throw new Error('Upload failed');
  
  return {
    fileUrl: result.fileUrl,
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
  panelResetKey = 0,
  sessionId = null,
  userId = null,
}: Props) {
  const accountsCache = useAccountsCache();
  const { theme } = useTheme();
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
  const userStoppedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const patchArtifact = useCallback(
    (
      messageId: string,
      artifactIndex: number,
      patch: { approvedAt?: string; dismissedAt?: string; resumeDismissedAt?: string }
    ) => {
      const next = messages.map((m) => {
        if (m.id !== messageId || !m.artifacts?.[artifactIndex]) return m;
        const artifacts = [...m.artifacts];
        const current = artifacts[artifactIndex];
        if (current?.type !== 'brand_context_update') return m;
        artifacts[artifactIndex] = { ...current, ...patch };
        return { ...m, artifacts };
      });
      onMessagesChange(next);
    },
    [messages, onMessagesChange]
  );

  useEffect(() => {
    if (!sessionId) return;
    setLoading(isChatRunnerActive(sessionId));
  }, [sessionId, panelResetKey]);

  useEffect(() => {
    if (!sessionId || !userId) return;

    return subscribeChatRunner((runnerSessionId, event) => {
      if (runnerSessionId !== sessionId) return;

      if (event === 'start') {
        setLoading(true);
        setError(null);
        return;
      }

      if (event === 'complete') {
        const cached = readCachedMessages(userId, sessionId);
        if (cached?.length) {
          onMessagesChange(cached as ChatMessage[]);
          const last = cached[cached.length - 1];
          if (
            last?.role === 'assistant' &&
            artifactsClearedBrandContext(last.artifacts)
          ) {
            applyBrandContextClearedOnClient(userId);
          }
        }
        setLoading(false);
        return;
      }

      if (event === 'error') {
        setLoading(false);
        return;
      }

      if (event === 'abort') {
        setLoading(false);
      }
    });
  }, [sessionId, userId, onMessagesChange]);

  // Media upload with platform awareness
  const mediaUpload = useMediaUpload({
    autoConvert: true,
    silentSuccess: true,
    onError: (error) => {
      setError(error);
      setUploading(false);
    },
  });

  /** ChatGPT-style auto-grow: expand up to 5 rows, then scroll within the box. */
  const autoResizeInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = window.getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
    const maxHeight = lineHeight * 5 + padTop + padBottom + borderTop + borderBottom;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    autoResizeInput();
  }, [input, pendingAttachments, autoResizeInput]);

  useEffect(() => {
    requestGenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(Boolean(sessionId && isChatRunnerActive(sessionId)));
    setInput('');
    setPendingAttachments([]);
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [panelResetKey, sessionId]);

  useEffect(() => {
    setLoading(Boolean(sessionId && isChatRunnerActive(sessionId)));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !userId) return;
    const job = getChatRunnerJob(sessionId);
    if (!job) return;
    const cached = readCachedMessages(userId, sessionId);
    if (cached?.length && cached.length > job.pendingMessages.length) {
      onMessagesChange(cached as ChatMessage[]);
      setLoading(false);
    }
  }, [sessionId, userId, onMessagesChange]);

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
    if (!files?.length || disabled || loading || uploading || mediaUpload.isUploading) return;
    setError(null);

    const remaining = AYSOP_CHAT_MAX_ATTACHMENTS - pendingAttachments.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${AYSOP_CHAT_MAX_ATTACHMENTS} files per message.`);
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining);
    
    // Basic file validation (size, type) - platform-specific validation happens in upload
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
        // Use new media upload system with auto-conversion
        const result = await mediaUpload.uploadFile(file);
        if (result) {
          uploaded.push({
            fileUrl: result.fileUrl,
            fileName: file.name,
            contentType: file.type || undefined,
            kind: attachmentKindFromMime(file.type || '', file.name),
          });
        }
      }
      
      setPendingAttachments((prev) => [...prev, ...uploaded].slice(0, AYSOP_CHAT_MAX_ATTACHMENTS));
    } catch (e) {
      setError(friendlyAysopChatError(e, 'Upload failed. Check media storage configuration.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const [scanningLeads, setScanningLeads] = useState(false);

  const runLeadsScan = useCallback(async () => {
    if (disabled || uploading || loading || scanningLeads) return;
    setError(null);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: 'Scan for leads',
    };
    const base = [...messages, userMsg];
    onMessagesChange(base);
    setScanningLeads(true);
    try {
      const res = await api.post<{ leads: ScannedLead[]; scanned: number; scannedAt?: string }>(
        '/leads/scan',
        {},
        { timeout: 90_000 }
      );
      const leads = res.data.leads ?? [];
      const scanned = res.data.scanned ?? 0;
      const scannedAt = res.data.scannedAt ?? new Date().toISOString();
      cacheLeadsScanPayload({ scanned, leads, scannedAt });
      onMessagesChange([
        ...base,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: leadsScanReplyText(leads, scanned),
          artifacts: leadsToChatArtifacts(leads, scanned, { lastScannedAt: scannedAt }),
        },
      ]);
    } catch (e) {
      setError(friendlyAysopChatError(e, 'Lead scan failed. Try again.'));
      onMessagesChange(base);
    } finally {
      setScanningLeads(false);
    }
  }, [disabled, uploading, loading, scanningLeads, messages, onMessagesChange]);

  const stopGeneration = useCallback(() => {
    userStoppedRef.current = true;
    requestGenRef.current += 1;
    if (sessionId) abortChatRunner(sessionId, true);
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, [sessionId]);

  const send = useCallback(
    async (text: string, attachments: AysopChatAttachment[] = [], opts?: { resume?: boolean }) => {
      const trimmed = text.trim();
      const hasAttachments = attachments.length > 0;
      if ((!trimmed && !hasAttachments) || disabled || uploading) return;
      if (loading && !opts?.resume) return;
      if (loading && opts?.resume) {
        userStoppedRef.current = true;
        requestGenRef.current += 1;
        if (sessionId) abortChatRunner(sessionId, true);
        abortRef.current?.abort();
        abortRef.current = null;
        setLoading(false);
      }

      setError(null);
      userStoppedRef.current = false;
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
        if (gen !== requestGenRef.current || ac.signal.aborted) {
          if (ac.signal.aborted && !userStoppedRef.current) {
            setError('Response was interrupted. Send again to retry.');
          }
          return;
        }

        const chatTimeout =
          hasAttachments && attachments.some((a) => a.kind === 'file' || a.kind === 'video')
            ? API_AYSOP_CHAT_ATTACHMENTS_TIMEOUT_MS
            : API_AYSOP_CHAT_TIMEOUT_MS;

        const brandContextSnapshot = userId
          ? parseBrandContextApiPayload(readBrandContextCache(userId) ?? {})
          : null;

        const apiBody = {
          messages: payload,
          workspaces: brandContext.workspaces,
          activeBrand: brandContext.activeBrand,
          brandContextSnapshot,
        };

        if (sessionId && userId) {
          const result = await runChatInBackground({
            sessionId,
            userId,
            pendingMessages: next,
            apiBody,
            timeout: chatTimeout,
          });
          if (gen !== requestGenRef.current) return;
          if (result) {
            onMessagesChange(result.messages as ChatMessage[]);
            if (artifactsClearedBrandContext(result.artifacts)) {
              applyBrandContextClearedOnClient(userId);
            }
          } else if (!userStoppedRef.current) {
            setError('Response was interrupted. Send again to retry.');
          }
          return;
        }

        const res = await api.post<{ reply: string; artifacts?: AysopArtifact[] }>(
          '/ai/aysop-chat',
          apiBody,
          { timeout: chatTimeout, signal: ac.signal }
        );
        if (gen !== requestGenRef.current || ac.signal.aborted) {
          if (ac.signal.aborted && !userStoppedRef.current) {
            setError('Response was interrupted. Send again to retry.');
          }
          return;
        }

        const withAssistant: ChatMessage[] = [
          ...next,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: res.data.reply,
            artifacts: res.data.artifacts,
          },
        ];
        if (artifactsClearedBrandContext(res.data.artifacts)) {
          applyBrandContextClearedOnClient(userId);
        }
        onMessagesChange(withAssistant);
      } catch (e) {
        if (isAbortError(e)) {
          if (!userStoppedRef.current) {
            setError('Response was interrupted. Send again to retry.');
          }
          return;
        }
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
    [accountsCache?.activeBrandId, allCachedAccounts, brands, disabled, getAccountBrandId, loading, messages, onMessagesChange, sessionId, uploading, userId]
  );

  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !loading && !disabled && !uploading;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[var(--bg-primary)] min-h-0"
      >
        {messages.length === 0 ? (
          <div className="text-center py-8 px-4">
            <IzopGlassLogo
              alt={`${BRAND_NAME} AI`}
              variant="square"
              tone={theme === 'dark' ? 'dark' : 'light'}
              className="mx-auto mb-3"
            />
            <p className="text-neutral-700 dark:text-neutral-200 font-medium">
              {BRAND_NAME} AI, your AI social media manager
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
          messages.map((m) => {
            const userHasMedia = m.role === 'user' && (m.attachments?.length ?? 0) > 0;

            if (userHasMedia) {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="flex max-w-[95%] flex-col items-end gap-2">
                    <AysopMessageAttachments attachments={m.attachments!} variant="user" detached />
                    {m.content ? (
                      <div className="rounded-2xl rounded-br-md px-4 py-3 text-sm whitespace-pre-wrap aysop-bubble-user">
                        <AysopChatMessageContent content={m.content} variant="user" />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[95%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'aysop-bubble-user rounded-br-md'
                      : 'aysop-bubble-assistant rounded-bl-md shadow-sm'
                  }`}
                >
                  {m.attachments?.length ? (
                    <AysopMessageAttachments attachments={m.attachments} variant={m.role} />
                  ) : null}
                  {m.content ? <AysopChatMessageContent content={m.content} variant={m.role} /> : null}
                  {m.role === 'assistant' && !m.content?.trim() && m.artifacts?.length ? (
                    <p className="text-neutral-600 dark:text-neutral-300">Here is what I prepared:</p>
                  ) : null}
                  {m.role === 'assistant' && m.artifacts?.length ? (
                    <AysopArtifactCards
                      artifacts={m.artifacts}
                      messageId={m.id}
                      onArtifactResolved={(artifactIndex, patch) =>
                        patchArtifact(m.id, artifactIndex, patch)
                      }
                      onScanLeads={() => void runLeadsScan()}
                      scanningLeads={scanningLeads}
                      onQuickReply={(text) =>
                        void send(text, [], {
                          resume:
                            isAysopQuickReplyMessage(text) &&
                            (text === "Let's upload" || text === 'Just create this post'),
                        })
                      }
                      quickReplyDisabled={loading || disabled || uploading}
                    />
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 text-sm">
            <ZThinkingLoopAnimation size={40} className="shrink-0" aria-label="Thinking" />
            <span>{BRAND_NAME} is thinking…</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="px-4 py-2 text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-t border-red-100 dark:border-red-900 shrink-0">{error}</p>
      ) : null}

      {/* Media upload progress - only show for conversion/errors */}
      {(mediaUpload.stage === 'converting' || mediaUpload.stage === 'error') && (
        <div className="px-3 py-2 border-t border-[var(--border)]">
          <MediaUploadProgress 
            state={mediaUpload} 
            className="bg-[var(--bg-surface)] border-[var(--border)]"
          />
        </div>
      )}

      <div className="aysop-chat-dock shrink-0">
        <AysopPendingAttachments
          attachments={pendingAttachments}
          uploading={uploading}
          onRemove={(index) => setPendingAttachments((prev) => prev.filter((_, i) => i !== index))}
        />

        <form
          className="p-3 flex items-end gap-2"
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
          disabled={loading || disabled || uploading || mediaUpload.isUploading || pendingAttachments.length >= AYSOP_CHAT_MAX_ATTACHMENTS}
          className="aysop-chat-icon-btn-glass shrink-0 rounded-xl px-3 py-3 text-neutral-600 dark:text-neutral-300 disabled:opacity-40 transition-colors"
          aria-label="Attach file"
          title="Attach image, video, or file"
        >
          {uploading || mediaUpload.isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) void send(input, pendingAttachments);
            }
          }}
          rows={1}
          placeholder={loading ? 'Type your next message…' : 'Ask anything or attach media…'}
          className="aysop-chat-input-glass flex-1 resize-none rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted)] px-4 py-3 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/45"
          disabled={disabled || uploading || mediaUpload.isUploading}
        />
        {loading ? (
          <button
            type="button"
            onClick={stopGeneration}
            className="aysop-chat-icon-btn-glass shrink-0 rounded-xl text-[var(--foreground)] px-4 py-3 transition-opacity"
            aria-label="Stop generating"
            title="Stop"
          >
            <Square size={18} className="fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="shrink-0 rounded-xl gradient-cta-pro px-4 py-3 hover:opacity-90 disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        )}
      </form>
      </div>
    </div>
  );
}
