import api from '@/lib/api';

export async function dismissPendingConnect(pendingId: string | undefined): Promise<void> {
  if (!pendingId) return;
  try {
    await api.post('/social/pending/dismiss', { pendingId });
  } catch {
    // ignore
  }
}
