import { describe, expect, it } from 'vitest';
import {
  commentAutomationSupportedForPlatform,
  isLinkedInPersonalSocialAccount,
} from '../composer-account';

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

describe('commentAutomationSupportedForPlatform', () => {
  const personalOnly = [
    { platform: 'LINKEDIN', linkedinConnectionKind: 'personal', username: 'rona kogen' },
  ];

  it('disables LinkedIn personal', () => {
    expect(commentAutomationSupportedForPlatform('LINKEDIN', personalOnly)).toBe(false);
    expect(commentAutomationSupportedForPlatform('INSTAGRAM', personalOnly)).toBe(true);
  });

  it('allows LinkedIn company page', () => {
    expect(
      commentAutomationSupportedForPlatform('LINKEDIN', [
        { platform: 'LINKEDIN', linkedinConnectionKind: 'organization_page' },
      ])
    ).toBe(true);
  });
});
