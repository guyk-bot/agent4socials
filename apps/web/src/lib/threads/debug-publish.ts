import { prisma } from '@/lib/db';
import { getValidThreadsToken } from './threads-token';
import { publishToThreads } from './publish';

export async function debugThreadsPublishWorkflow(
  accountId: string,
  text: string = "Test post from iZop AI - debugging publish workflow"
): Promise<{
  step: string;
  success: boolean;
  data?: any;
  error?: string;
}[]> {
  const steps: {
    step: string;
    success: boolean;
    data?: any;
    error?: string;
  }[] = [];

  try {
    // Step 1: Get social account
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
    };

    // Step 2: Validate/refresh token
    steps.push({ step: '2. Validating Threads token', success: false });
    
    let validToken: string;
    try {
      // First, fetch fresh token from DB (as implemented in our fix)
      const freshAccount = await prisma.socialAccount.findUnique({
        where: { id: accountId },
        select: { accessToken: true, expiresAt: true },
      });

      const accessToken = freshAccount?.accessToken?.trim() || socialAccount.accessToken;
      
      validToken = await getValidThreadsToken(
        {
          id: accountId,
          accessToken,
          expiresAt: freshAccount?.expiresAt ?? socialAccount.expiresAt,
        },
        { forceRefresh: false }
      );
      
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

    // Step 3: Test token with simple API call
    steps.push({ step: '3. Testing token with profile fetch', success: false });
    try {
      const { probeThreadsAccessToken } = await import('./threads-api');
      const probe = await probeThreadsAccessToken(validToken, 12000);
      
      steps[2].success = probe.valid;
      steps[2].data = {
        valid: probe.valid,
        httpStatus: probe.httpStatus,
        hasProfile: !!probe.profile,
        profileId: probe.profile?.id,
        username: probe.profile?.username,
      };
      
      if (!probe.valid) {
        steps[2].error = probe.apiError || 'Token probe failed';
        return steps;
      }
    } catch (probeError) {
      steps[2].error = (probeError as Error)?.message || 'Token probe failed';
      return steps;
    }

    // Step 4: Test actual publishing
    steps.push({ step: '4. Publishing to Threads', success: false });
    try {
      const result = await publishToThreads({
        accessToken: validToken,
        text: text,
        shareToInstagramStory: false,
      });
      
      steps[3].success = result.ok;
      if (result.ok) {
        steps[3].data = {
          platformPostId: result.platformPostId,
          success: true,
        };
      } else {
        steps[3].error = result.error;
      }
    } catch (publishError) {
      steps[3].error = (publishError as Error)?.message || 'Publish failed';
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