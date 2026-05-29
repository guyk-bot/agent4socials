/** @jest-environment node */

import {
  buildLinkedInOAuthScopeString,
  LINKEDIN_PAGE_OAUTH_SCOPES,
  LINKEDIN_PERSONAL_OAUTH_SCOPES,
} from '../oauth-scopes';

describe('linkedin oauth-scopes', () => {
  const prev = process.env.LINKEDIN_OAUTH_SCOPES;

  afterEach(() => {
    if (prev === undefined) delete process.env.LINKEDIN_OAUTH_SCOPES;
    else process.env.LINKEDIN_OAUTH_SCOPES = prev;
  });

  it('returns personal scopes for personal method', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    expect(buildLinkedInOAuthScopeString('personal')).toBe(LINKEDIN_PERSONAL_OAUTH_SCOPES);
  });

  it('returns page scopes for page method', () => {
    delete process.env.LINKEDIN_OAUTH_SCOPES;
    expect(buildLinkedInOAuthScopeString('page')).toBe(LINKEDIN_PAGE_OAUTH_SCOPES);
  });
});
