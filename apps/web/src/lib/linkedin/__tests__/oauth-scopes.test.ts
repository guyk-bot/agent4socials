/** @jest-environment node */

import {
  buildLinkedInOAuthScopeString,
  LINKEDIN_PAGE_OAUTH_SCOPES,
  LINKEDIN_PERSONAL_OAUTH_SCOPES,
} from '../oauth-scopes';

describe('linkedin oauth-scopes', () => {
  const prev = process.env.LINKEDIN_OAUTH_SCOPES;
  const prevRead = process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL;
  const prevPostAnalytics = process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS;

  afterEach(() => {
    if (prev === undefined) delete process.env.LINKEDIN_OAUTH_SCOPES;
    else process.env.LINKEDIN_OAUTH_SCOPES = prev;
    if (prevRead === undefined) delete process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL;
    else process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL = prevRead;
    if (prevPostAnalytics === undefined) delete process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS;
    else process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS = prevPostAnalytics;
  });

  it('returns personal publish scopes by default (no member read)', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    delete process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL;
    delete process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS;
    expect(buildLinkedInOAuthScopeString('personal')).toBe(LINKEDIN_PERSONAL_OAUTH_SCOPES);
  });

  it('adds member read scopes when env flags are set', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL = 'true';
    process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS = 'true';
    expect(buildLinkedInOAuthScopeString('personal')).toBe(
      `${LINKEDIN_PERSONAL_OAUTH_SCOPES} r_member_social r_member_postAnalytics`
    );
  });

  it('returns page scopes for page method', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    expect(buildLinkedInOAuthScopeString('page')).toBe(LINKEDIN_PAGE_OAUTH_SCOPES);
  });
});
