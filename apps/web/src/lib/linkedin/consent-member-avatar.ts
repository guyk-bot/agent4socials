'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { avatarDisplayUrl } from '@/lib/avatar-display-url';
import { LINKEDIN_OAUTH_MEMBER_AVATAR_URL } from '@/lib/linkedin/oauth-consent-copy';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

const USER_AVATAR_STORAGE_KEY = 'agent4socials-user-avatar-v1';

function readStoredUserAvatar(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(USER_AVATAR_STORAGE_KEY);
    if (stored && (stored.startsWith('data:') || stored.startsWith('http'))) return stored;
  } catch {
    // ignore
  }
  return null;
}

function linkedInPictureFromCache(
  accounts: Array<{ platform: string; profilePicture?: string | null; linkedinConnectionKind?: string }>
): string | null {
  const linkedIn = accounts.filter((a) => a.platform === 'LINKEDIN');
  const personal = linkedIn.find(
    (a) => a.linkedinConnectionKind !== 'organization_page' && (a.profilePicture ?? '').trim()
  );
  const any = linkedIn.find((a) => (a.profilePicture ?? '').trim());
  const raw = personal?.profilePicture ?? any?.profilePicture ?? null;
  return avatarDisplayUrl('LINKEDIN', raw);
}

/**
 * Best-effort member photo for the LinkedIn-style consent UI (cached accounts, app user avatar, live userinfo).
 */
export function useLinkedInConsentMemberAvatar(_method: LinkedInConnectMethod): string {
  const { user } = useAuth();
  const cache = useAccountsCache();
  const allAccounts = cache?.allCachedAccounts ?? [];
  const [avatarUrl, setAvatarUrl] = useState(LINKEDIN_OAUTH_MEMBER_AVATAR_URL);

  useEffect(() => {
    const fromStorage = readStoredUserAvatar();
    const fromAuth = user?.avatarUrl?.trim() || null;
    const fromCache = linkedInPictureFromCache(
      allAccounts.map((a) => ({
        platform: a.platform,
        profilePicture: typeof a.profilePicture === 'string' ? a.profilePicture : null,
        linkedinConnectionKind:
          typeof (a as { linkedinConnectionKind?: string }).linkedinConnectionKind === 'string'
            ? (a as { linkedinConnectionKind?: string }).linkedinConnectionKind
            : undefined,
      }))
    );
    const immediate = fromCache ?? fromStorage ?? fromAuth;
    if (immediate) setAvatarUrl(immediate);

    let cancelled = false;
    void api
      .get<{ avatarUrl?: string | null }>('/social/linkedin/consent-member-preview')
      .then((res) => {
        if (cancelled) return;
        const pic = res.data?.avatarUrl?.trim();
        if (pic) setAvatarUrl(avatarDisplayUrl('LINKEDIN', pic) ?? pic);
      })
      .catch(() => {
        /* keep immediate fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.avatarUrl, allAccounts]);

  return avatarUrl;
}
