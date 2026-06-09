import api from '@/lib/api';
import type { ScannedLead } from '@/lib/leads/scan-leads';
import { writeLeadsLocalCache, type LocalLeadsScan } from '@/lib/leads/leads-local-cache';

export function cacheLeadsScanPayload(payload: {
  accountId?: string | null;
  scanned: number;
  leads: ScannedLead[];
  message?: string;
  scannedAt?: string;
}): void {
  writeLeadsLocalCache({
    accountId: payload.accountId ?? null,
    scanned: payload.scanned,
    leads: payload.leads,
    message: payload.message,
    scannedAt: payload.scannedAt ?? new Date().toISOString(),
  });
}

export async function fetchAndCacheLastLeadsScan(): Promise<LocalLeadsScan | null> {
  try {
    const res = await api.get<{
      leads: ScannedLead[];
      scanned: number;
      message?: string;
      accountId?: string | null;
      scannedAt?: string | null;
    }>('/leads/last', { timeout: 30_000 });

    const leads = res.data.leads ?? [];
    const scanned = res.data.scanned ?? 0;
    if (leads.length === 0 && scanned === 0) return null;

    const payload: LocalLeadsScan = {
      accountId: res.data.accountId ?? null,
      scanned,
      leads,
      message: res.data.message,
      scannedAt: res.data.scannedAt ?? new Date().toISOString(),
    };
    writeLeadsLocalCache(payload);
    return payload;
  } catch {
    return null;
  }
}
