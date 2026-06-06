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
