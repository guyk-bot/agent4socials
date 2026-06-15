import { prisma } from '@/lib/db';
import { getValidThreadsToken } from './threads-token';
import { publishToThreads } from './publish';
import {
  defaultThreadsOAuthScopes,
  probeThreadsAccessToken,
  probeThreadsTokenScopes,
} from './threads-api';

const REQUIRED_PUBLISH_SCOPES = ['threads_basic', 'threads_content_publish'];

type DebugStep = {
  step: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

export async function debugThreadsPublishWorkflow(
  accountId: string,
  text: string = 'Test post from iZop AI - debugging publish workflow'
): Promise<DebugStep[]> {
  const steps: DebugStep[] = [];

  try {
    steps.push({ step: '1. Getting social account', success: false });
    const socialAccount = await prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        platform: true,
        accessToken: true,
        expiresAt: true,
        username: true,
        lastSyncStatus: true,
        lastSyncError: true,
        scopes: true,
      },
    });

    if (!socialAccount) {
      steps[0].error = 'Social account not found';
      return steps;
    }

    if (socialAccount.platform !== 'THREADS') {
      steps[0].error = `Wrong platform: ${socialAccount.platform}`;
      return steps;
    }

    steps[0].success = true;
    steps[0].data = {
      username: socialAccount.username,
      platform: socialAccount.platform,
      syncStatus: socialAccount.lastSyncStatus,
      syncError: socialAccount.lastSyncError,
      hasToken: !!socialAccount.accessToken,
      tokenLength: socialAccount.accessToken?.length || 0,
      expiresAt: socialAccount.expiresAt,
      storedScopes: socialAccount.scopes,
    };

    steps.push({ step: '2. Validating Threads token', success: false });

    let validToken: string;
    try {
      const freshAccount = await prisma.socialAccount.findUnique({
        where: { id: accountId },
        select: { accessToken: true, expiresAt: true },
      });

      const accessToken = freshAccount?.accessToken?.trim() || socialAccount.accessToken;

      try {
        validToken = await getValidThreadsToken(
          {
            id: accountId,
            accessToken,
            expiresAt: freshAccount?.expiresAt ?? socialAccount.expiresAt,
          },
          { forceRefresh: false }
        );
      } catch {
        validToken = await getValidThreadsToken(
          {
            id: accountId,
            accessToken,
            expiresAt: freshAccount?.expiresAt ?? socialAccount.expiresAt,
          },
          { forceRefresh: true }
        );
      }

      steps[1].success = true;
      steps[1].data = {
        originalTokenLength: socialAccount.accessToken?.length || 0,
        freshTokenLength: accessToken?.length || 0,
        validTokenLength: validToken?.length || 0,
        tokensMatch: accessToken === validToken,
      };
    } catch (tokenError) {
      steps[1].error = (tokenError as Error)?.message || 'Token validation failed';
      return steps;
    }

    steps.push({ step: '3. Checking granted OAuth scopes', success: false });
    const scopeProbe = await probeThreadsTokenScopes(validToken);
    const grantedScopes = scopeProbe.scopes;
    const missingScopes = REQUIRED_PUBLISH_SCOPES.filter((s) => !grantedScopes.includes(s));
    const scopeListUnavailable = scopeProbe.source === 'unavailable' || grantedScopes.length === 0;

    steps[2].success = !scopeListUnavailable ? missingScopes.length === 0 : true;
    steps[2].data = {
      grantedScopes,
      requiredScopes: REQUIRED_PUBLISH_SCOPES,
      configuredOAuthScopes: defaultThreadsOAuthScopes().split(','),
      missingScopes: scopeListUnavailable ? [] : missingScopes,
      scopeProbeSource: scopeProbe.source,
      scopeProbeHttpStatus: scopeProbe.httpStatus,
      tokenDebugValid: scopeProbe.isValid,
      ...(scopeListUnavailable
        ? {
            warning:
              'Meta did not return a scope list for this token (common on Threads). Continuing because the profile token check passed.',
          }
        : {}),
    };

    if (!scopeListUnavailable && missingScopes.length > 0) {
      steps[2].error = `Missing scopes: ${missingScopes.join(', ')}. Disconnect Threads in Accounts and reconnect, approving all permissions.`;
      return steps;
    }

    steps.push({ step: '4. Testing token with profile fetch', success: false });
    try {
      const probe = await probeThreadsAccessToken(validToken, 12000);

      steps[3].success = probe.valid;
      steps[3].data = {
        valid: probe.valid,
        httpStatus: probe.httpStatus,
        hasProfile: !!probe.profile,
        profileId: probe.profile?.id,
        username: probe.profile?.username,
      };

      if (!probe.valid) {
        steps[3].error = probe.apiError || 'Token probe failed';
        return steps;
      }
    } catch (probeError) {
      steps[3].error = (probeError as Error)?.message || 'Token probe failed';
      return steps;
    }

    steps.push({ step: '5. Publishing to Threads', success: false });
    try {
      const result = await publishToThreads({
        accessToken: validToken,
        text,
        shareToInstagramStory: false,
      });

      steps[4].success = result.ok;
      if (result.ok) {
        steps[4].data = {
          platformPostId: result.platformPostId,
          success: true,
        };
      } else {
        steps[4].error = result.error;
      }
    } catch (publishError) {
      steps[4].error = (publishError as Error)?.message || 'Publish failed';
    }

    return steps;
  } catch (error) {
    steps.push({
      step: 'FATAL ERROR',
      success: false,
      error: (error as Error)?.message || 'Unknown error',
    });
    return steps;
  }
}
