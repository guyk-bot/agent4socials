/** LinkedIn account shape used by Composer and dashboard UI. */

export type LinkedInAwareSocialAccount = {
  platform?: string;
  linkedinConnectionKind?: string;
  username?: string | null;
};

export function isLinkedInPersonalSocialAccount(account: LinkedInAwareSocialAccount): boolean {
  if (String(account.platform ?? '').toUpperCase() !== 'LINKEDIN') return false;
  if (account.linkedinConnectionKind === 'organization_page') return false;
  if (account.username === 'LinkedIn Page') return false;
  return true;
}

const COMMENT_AUTOMATION_PLATFORMS = new Set([
  'INSTAGRAM',
  'FACEBOOK',
  'TWITTER',
  'YOUTUBE',
  'LINKEDIN',
]);

/** Comment keyword automation is not available for LinkedIn personal profiles. */
export function commentAutomationSupportedForPlatform(
  platformKey: string,
  accounts: LinkedInAwareSocialAccount[]
): boolean {
  const p = String(platformKey).toUpperCase();
  if (!COMMENT_AUTOMATION_PLATFORMS.has(p)) return false;
  if (p !== 'LINKEDIN') return true;
  const linkedIn = accounts.find((a) => String(a.platform).toUpperCase() === 'LINKEDIN');
  if (!linkedIn) return false;
  return !isLinkedInPersonalSocialAccount(linkedIn);
}
