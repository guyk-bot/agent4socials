import { NextRequest, NextResponse, after } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { trackUsage } from '@/lib/usage-tracking';
import {
  failStuckPostingTargets,
  finalizePostPublishState,
  preparePostForBackgroundPublish,
  runPublishPostWorkflow,
  type PublishPostRequestBody,
} from '@/lib/publish-post-workflow';

/** Multi-platform video publish can exceed 60s; run in after() for user requests. */
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const { id: postId } = await params;
  const requestBody = (await request.json().catch(() => ({}))) as PublishPostRequestBody;
  const cronSecret = request.headers.get('X-Cron-Secret');
  const isCron = Boolean(process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);
  let userId: string | null = null;
  let linkToken: string | null = null;
  if (!isCron) {
    userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      try {
        linkToken = typeof requestBody?.token === 'string' ? requestBody.token.trim() : null;
        if (
          linkToken &&
          requestBody?.contentByPlatform &&
          typeof requestBody.contentByPlatform === 'object' &&
          Object.keys(requestBody.contentByPlatform).length > 0
        ) {
          await prisma.post.updateMany({
            where: { id: postId, emailOpenToken: linkToken, emailOpenTokenExpiresAt: { gte: new Date() } },
            data: { contentByPlatform: requestBody.contentByPlatform },
          });
        }
      } catch {
        linkToken = null;
      }
      if (!linkToken) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
    }
  }
  if (userId) trackUsage(userId, 'publish');

  const isDebug = request.nextUrl.searchParams.get('debug') === '1';

  if (!isCron && !linkToken) {
    const prep = await preparePostForBackgroundPublish(postId, userId!, requestBody);
    if (!prep.ok) {
      return NextResponse.json({ message: prep.message }, { status: prep.status });
    }
    after(async () => {
      try {
        await runPublishPostWorkflow({
          postId,
          isCron: false,
          userId,
          linkToken: null,
          requestBody,
          isDebug,
        });
      } catch (e) {
        console.error('[publish after]', postId, e instanceof Error ? e.message : e);
        try {
          await failStuckPostingTargets(
            postId,
            'Publishing was interrupted before it finished (server time limit). Check the platform, then open in Composer and try Post now again.'
          );
        } catch (stuckErr) {
          console.error('[publish after] failStuck', postId, stuckErr);
        }
        try {
          await finalizePostPublishState(postId);
        } catch (finalizeErr) {
          console.error('[publish after] finalize', postId, finalizeErr);
        }
      }
    });
    return NextResponse.json(
      {
        accepted: true,
        postId,
        message: 'Publishing started. Check History for per-platform status.',
      },
      { status: 202 }
    );
  }

  const wf = await runPublishPostWorkflow({
    postId,
    isCron,
    userId,
    linkToken,
    requestBody,
    isDebug,
  });
  return NextResponse.json(wf.body, { status: wf.status });
}
