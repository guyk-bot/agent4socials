import api from '@/lib/api';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import { writeCachedMessages } from '@/lib/ai/aysop-chat-local-cache';
import {
  applyBrandContextClearedOnClient,
  artifactsClearedBrandContext,
} from '@/lib/brand-context-utils';

export type ChatRunnerMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: AysopArtifact[];
  attachments?: unknown[];
};

export type ChatRunnerComplete = {
  messages: ChatRunnerMessage[];
  reply: string;
  artifacts?: AysopArtifact[];
};

type ChatRunnerJob = {
  sessionId: string;
  userId: string;
  pendingMessages: ChatRunnerMessage[];
  abortController: AbortController;
  startedAt: number;
};

export type ChatRunnerEvent = 'start' | 'complete' | 'error' | 'abort';

const jobs = new Map<string, ChatRunnerJob>();
const listeners = new Set<(sessionId: string, event: ChatRunnerEvent) => void>();

function emit(sessionId: string, event: ChatRunnerEvent) {
  for (const listener of listeners) listener(sessionId, event);
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: string; name?: string };
  return err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError';
}

export function subscribeChatRunner(listener: (sessionId: string, event: ChatRunnerEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getChatRunnerJob(sessionId: string | null | undefined): ChatRunnerJob | null {
  if (!sessionId) return null;
  return jobs.get(sessionId) ?? null;
}

export function isChatRunnerActive(sessionId: string | null | undefined): boolean {
  return Boolean(sessionId && jobs.has(sessionId));
}

export function abortChatRunner(sessionId: string, userStopped = false) {
  const job = jobs.get(sessionId);
  if (!job) return;
  job.abortController.abort();
  jobs.delete(sessionId);
  emit(sessionId, userStopped ? 'abort' : 'abort');
}

export async function runChatInBackground(opts: {
  sessionId: string;
  userId: string;
  pendingMessages: ChatRunnerMessage[];
  apiBody: {
    messages: Array<{ role: string; content: string; attachments?: unknown[] }>;
    workspaces?: unknown;
    activeBrand?: unknown;
    brandContextSnapshot?: unknown;
  };
  timeout: number;
}): Promise<ChatRunnerComplete | null> {
  const existing = jobs.get(opts.sessionId);
  if (existing) {
    existing.abortController.abort();
    jobs.delete(opts.sessionId);
  }

  const abortController = new AbortController();
  const job: ChatRunnerJob = {
    sessionId: opts.sessionId,
    userId: opts.userId,
    pendingMessages: opts.pendingMessages,
    abortController,
    startedAt: Date.now(),
  };
  jobs.set(opts.sessionId, job);
  emit(opts.sessionId, 'start');

  writeCachedMessages(opts.userId, opts.sessionId, opts.pendingMessages);

  try {
    const res = await api.post<{ reply: string; artifacts?: AysopArtifact[] }>(
      '/ai/aysop-chat',
      opts.apiBody,
      { timeout: opts.timeout, signal: abortController.signal }
    );

    const assistantMsg: ChatRunnerMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: res.data.reply,
      artifacts: res.data.artifacts,
    };
    const completeMessages = [...opts.pendingMessages, assistantMsg];
    writeCachedMessages(opts.userId, opts.sessionId, completeMessages);
    if (artifactsClearedBrandContext(res.data.artifacts)) {
      applyBrandContextClearedOnClient(opts.userId);
    }
    jobs.delete(opts.sessionId);
    emit(opts.sessionId, 'complete');

    return {
      messages: completeMessages,
      reply: res.data.reply,
      artifacts: res.data.artifacts,
    };
  } catch (e) {
    jobs.delete(opts.sessionId);
    if (isAbortError(e)) {
      emit(opts.sessionId, 'abort');
      return null;
    }
    emit(opts.sessionId, 'error');
    throw e;
  }
}
