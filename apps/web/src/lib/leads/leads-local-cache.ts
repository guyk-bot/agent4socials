/** Client-side mirror of the last lead scan (instant load on Leads page after chat scan). */

export type LocalLeadsScan = {
  accountId: string | null;
  scanned: number;
  leads: Array<{
    commentId: string;
    accountId: string;
    platform: string;
    authorName: string;
    profileUrl: string | null;
    authorPictureUrl: string | null;
    comment: string;
    postPreview: string;
    postUrl: string | null;
    createdAt: string;
    intent: 'high' | 'medium' | 'low';
    reason: string;
    outreach: string;
  }>;
  message?: string;
  scannedAt: string;
};

const KEY = 'izop:leads:last:v1';

export function readLeadsLocalCache(): LocalLeadsScan | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalLeadsScan;
    if (!parsed || !Array.isArray(parsed.leads)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLeadsLocalCache(scan: LocalLeadsScan): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(scan));
  } catch {
    /* quota */
  }
}
