import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { trackUsage } from '@/lib/usage-tracking';
import { runPublishPostWorkflow, type PublishPostRequestBody } from '@/lib/publish-post-workflow';

export const maxDuration = 55;

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

  const wf = await runPublishPostWorkflow({
    postId,
    isCron,
    userId,
    linkToken,
    requestBody,
    isDebug: request.nextUrl.searchParams.get('debug') === '1',
  });
  return NextResponse.json(wf.body, { status: wf.status });
}
