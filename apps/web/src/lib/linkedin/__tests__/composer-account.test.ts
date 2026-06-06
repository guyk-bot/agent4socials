import { describe, expect, it } from 'vitest';
import { isLinkedInPersonalSocialAccount } from '../composer-account';

describe('isLinkedInPersonalSocialAccount', () => {
  it('returns true for personal LinkedIn accounts', () => {
    expect(
      isLinkedInPersonalSocialAccount({
        platform: 'LINKEDIN',
        linkedinConnectionKind: 'personal',
        username: 'rona kogen',
      })
    ).toBe(true);
  });

  it('returns false for company pages', () => {
    expect(
      isLinkedInPersonalSocialAccount({
        platform: 'LINKEDIN',
        linkedinConnectionKind: 'organization_page',
        username: 'Acme Inc',
      })
    ).toBe(false);
  });
});
