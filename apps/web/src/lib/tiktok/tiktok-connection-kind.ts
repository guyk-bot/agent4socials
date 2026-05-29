/** TikTok account type chosen at connect (Personal vs Business). */

export type TikTokConnectionKind = 'personal' | 'business';

export function tikTokConnectionKindFromCredentials(
  credentialsJson: unknown
): TikTokConnectionKind | undefined {
  if (!credentialsJson || typeof credentialsJson !== 'object') return undefined;
  const kind = (credentialsJson as { tiktokConnectionKind?: string }).tiktokConnectionKind;
  return kind === 'personal' || kind === 'business' ? kind : undefined;
}

export function tikTokConnectionKindLabel(kind: TikTokConnectionKind | undefined): string | null {
  if (kind === 'business') return 'Business account';
  if (kind === 'personal') return 'Personal account';
  return null;
}
