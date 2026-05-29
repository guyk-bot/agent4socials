/** @jest-environment node */

import {
  buildLinkedInOAuthScopeString,
  LINKEDIN_PAGE_OAUTH_SCOPES,
  LINKEDIN_PERSONAL_OAUTH_SCOPES_FULL,
  LINKEDIN_PERSONAL_OAUTH_SCOPES_PUBLISH_ONLY,
} from '../oauth-scopes';

describe('linkedin oauth-scopes', () => {
  const prev = process.env.LINKEDIN_OAUTH_SCOPES;
  const prevPublishOnly = process.env.LINKEDIN_PERSONAL_PUBLISH_ONLY;
  const prevMemberRead = process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL;
  const prevPostAnalytics = process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS;

  afterEach(() => {
    if (prev === undefined) delete process.env.LINKEDIN_OAUTH_SCOPES;
    else process.env.LINKEDIN_OAUTH_SCOPES = prev;
    if (prevPublishOnly === undefined) delete process.env.LINKEDIN_PERSONAL_PUBLISH_ONLY;
    else process.env.LINKEDIN_PERSONAL_PUBLISH_ONLY = prevPublishOnly;
    if (prevMemberRead === undefined) delete process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL;
    else process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL = prevMemberRead;
    if (prevPostAnalytics === undefined) delete process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS;
    else process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS = prevPostAnalytics;
  });

  it('returns publish-only personal scopes by default', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    delete process.env.LINKEDIN_PERSONAL_PUBLISH_ONLY;
    delete process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL;
    delete process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS;
    expect(buildLinkedInOAuthScopeString('personal')).toBe(LINKEDIN_PERSONAL_OAUTH_SCOPES_PUBLISH_ONLY);
  });

  it('adds read and analytics scopes when env flags are set', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL = 'true';
    process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS = 'true';
    expect(buildLinkedInOAuthScopeString('personal')).toBe(LINKEDIN_PERSONAL_OAUTH_SCOPES_FULL);
  });

  it('returns publish-only when LINKEDIN_PERSONAL_PUBLISH_ONLY is set', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    process.env.LINKEDIN_PERSONAL_PUBLISH_ONLY = 'true';
    process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL = 'true';
    expect(buildLinkedInOAuthScopeString('personal')).toBe(LINKEDIN_PERSONAL_OAUTH_SCOPES_PUBLISH_ONLY);
  });

  it('returns page scopes for page method', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    expect(buildLinkedInOAuthScopeString('page')).toBe(LINKEDIN_PAGE_OAUTH_SCOPES);
  });
});
