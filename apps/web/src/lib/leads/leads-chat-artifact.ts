import type { IzopArtifact } from '@/lib/ai/izop-artifacts';
import type { ScannedLead } from '@/lib/leads/scan-leads';

export function leadsToChatArtifacts(
  leads: ScannedLead[],
  scanned: number,
  opts?: { lastScannedAt?: string | null; accountId?: string | null }
): IzopArtifact[] {
  if (leads.length > 0) {
    const slice = leads.slice(0, 25);
    return [
      {
        type: 'leads',
        scanned,
        href: '/dashboard/leads',
        scannedAt: opts?.lastScannedAt ?? new Date().toISOString(),
        accountId: opts?.accountId ?? null,
        fullLeads: slice,
        leads: slice.map((l) => ({
          authorName: l.authorName,
          profileUrl: l.profileUrl,
          platform: l.platform,
          comment: l.comment,
          outreach: l.outreach,
          intent: l.intent,
        })),
      },
    ];
  }
  return [{ type: 'leads_scan_prompt', href: '/dashboard/leads', lastScannedAt: opts?.lastScannedAt ?? null }];
}

export function leadsScanReplyText(leads: ScannedLead[], scanned: number): string {
  if (leads.length > 0) {
    const high = leads.filter((l) => l.intent === 'high').length;
    return `Found ${leads.length} potential lead${leads.length === 1 ? '' : 's'} (${high} high intent) from ${scanned} comment${scanned === 1 ? '' : 's'}.`;
  }
  if (scanned > 0) {
    return `No potential leads in ${scanned} comments. Open Inbox once to cache recent comments, then scan again.`;
  }
  return 'No comments cached yet. Open Inbox for your accounts, then scan again.';
}
