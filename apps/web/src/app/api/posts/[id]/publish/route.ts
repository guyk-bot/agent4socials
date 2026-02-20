import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const { id: postId } = await params;
  const cronSecret = request.headers.get('X-Cron-Secret');
  const isCron = process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  let userId: string | null = null;
  let linkToken: string | null = null;
  if (!isCron) {
    userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      try {
        const body = (await request.json().catch(() => ({}))) as { token?: string; contentByPlatform?: Record<string, string> };
        linkToken = typeof body?.token === 'string' ? body.token.trim() : null;
        if (linkToken && body?.contentByPlatform && typeof body.contentByPlatform === 'object' && Object.keys(body.contentByPlatform).length > 0) {
          await prisma.post.updateMany({
            where: { id: postId, emailOpenToken: linkToken, emailOpenTokenExpiresAt: { gte: new Date() } },
            data: { contentByPlatform: body.contentByPlatform },
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
  let post = await prisma.post.findFirst({
    where: isCron
      ? { id: postId, status: PostStatus.SCHEDULED, scheduledAt: { lte: new Date() }, scheduleDelivery: 'auto' }
      : linkToken
        ? { id: postId, emailOpenToken: linkToken, emailOpenTokenExpiresAt: { gte: new Date() } }
        : { id: postId, userId: userId! },
    include: {
      media: true,
      targets: {
        include: {
          socialAccount: { select: { id: true, platform: true, platformUserId: true, accessToken: true } },
        },
      },
    },
  });
  if (!post) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }
  if (post.status !== PostStatus.DRAFT && post.status !== PostStatus.SCHEDULED) {
    return NextResponse.json({ message: 'Post already published or in progress' }, { status: 400 });
  }

  await prisma.post.update({
    where: { id: postId },
    data: { status: PostStatus.POSTING },
  });

  const contentByPlatform = (post as { contentByPlatform?: Record<string, string> | null }).contentByPlatform ?? null;
  const mediaByPlatform = (post as { mediaByPlatform?: Record<string, { fileUrl: string; type: string }[]> | null }).mediaByPlatform ?? null;
  const defaultMedia = post.media.map((m) => ({ fileUrl: m.fileUrl, type: m.type }));
  const results: { platform: string; ok: boolean; error?: string }[] = [];

  for (const target of post.targets) {
    const { platform, socialAccount } = target;
    const token = socialAccount.accessToken;
    const platformUserId = socialAccount.platformUserId;
    const caption = (contentByPlatform?.[platform] ?? post.content ?? '').trim();
    const platformMedia = mediaByPlatform?.[platform];
    const targetMedia = (platformMedia && platformMedia.length > 0 ? platformMedia : defaultMedia) as { fileUrl: string; type: string }[];
    const firstImageUrl = targetMedia.find((m) => m.type === 'IMAGE')?.fileUrl;
    const firstMediaUrl = targetMedia[0]?.fileUrl;

    try {
      if (platform === 'INSTAGRAM') {
        if (!firstImageUrl) {
          await prisma.postTarget.update({
            where: { id: target.id },
            data: { status: PostStatus.FAILED, error: 'Instagram requires at least one image' },
          });
          results.push({ platform: 'INSTAGRAM', ok: false, error: 'Instagram requires at least one image' });
          continue;
        }
        const containerRes = await axios.post<{ id?: string }>(
          `https://graph.facebook.com/v18.0/${platformUserId}/media`,
          null,
          {
            params: {
              image_url: firstImageUrl,
              caption: caption || undefined,
              access_token: token,
            },
          }
        );
        const creationId = containerRes.data?.id;
        if (!creationId) {
          throw new Error(JSON.stringify(containerRes.data));
        }
        const publishRes = await axios.post<{ id?: string }>(
          `https://graph.facebook.com/v18.0/${platformUserId}/media_publish`,
          null,
          {
            params: {
              creation_id: creationId,
              access_token: token,
            },
          }
        );
        const mediaId = publishRes.data?.id;
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: PostStatus.POSTED, ...(mediaId ? { platformPostId: mediaId } : {}) },
        });
        results.push({ platform: 'INSTAGRAM', ok: true });
      } else if (platform === 'FACEBOOK') {
        let pageToken = token;
        try {
          const pagesRes = await axios.get<{ data?: Array<{ id: string; access_token?: string }> }>(
            'https://graph.facebook.com/v18.0/me/accounts',
            { params: { fields: 'id,access_token', access_token: token } }
          );
          const page = pagesRes.data?.data?.find((p) => p.id === platformUserId);
          if (page?.access_token) pageToken = page.access_token;
        } catch (_) {}
        const feedParams: Record<string, string> = {
          message: caption || ' ',
          access_token: pageToken,
        };
        if (firstMediaUrl) feedParams.link = firstMediaUrl;
        const feedRes = await axios.post<{ id?: string }>(
          `https://graph.facebook.com/v18.0/${platformUserId}/feed`,
          null,
          { params: feedParams }
        );
        const postId = feedRes.data?.id;
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: PostStatus.POSTED, ...(postId ? { platformPostId: postId } : {}) },
        });
        results.push({ platform: 'FACEBOOK', ok: true });
      } else if (platform === 'LINKEDIN') {
        const author = platformUserId.startsWith('urn:li:') ? platformUserId : `urn:li:person:${platformUserId}`;
        const postRes = await axios.post<{ id?: string }>(
          'https://api.linkedin.com/rest/posts',
          {
            author,
            commentary: caption || ' ',
            visibility: 'PUBLIC',
            distribution: {
              feedDistribution: 'MAIN_FEED',
              targetEntities: [],
              thirdPartyDistributionChannels: [],
            },
            lifecycleState: 'PUBLISHED',
            isReshareDisabledByAuthor: false,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
              'Linkedin-Version': '202602',
            },
          }
        );
        const postUrn = postRes.headers?.['x-restli-id'] ?? postRes.data?.id;
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: PostStatus.POSTED, ...(postUrn ? { platformPostId: postUrn } : {}) },
        });
        results.push({ platform: 'LINKEDIN', ok: true });
      } else {
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: PostStatus.FAILED, error: `Publish not implemented for ${platform}` },
        });
        results.push({ platform, ok: false, error: `Publish not implemented for ${platform}` });
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: unknown }; message?: string })?.response?.data
        ? JSON.stringify((err as { response: { data: unknown } }).response.data)
        : (err as Error)?.message || 'Unknown error';
      await prisma.postTarget.update({
        where: { id: target.id },
        data: { status: PostStatus.FAILED, error: message.slice(0, 500) },
      });
      results.push({ platform, ok: false, error: message.slice(0, 200) });
    }
  }

  const anyFailed = results.some((r) => !r.ok);
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: anyFailed ? PostStatus.FAILED : PostStatus.POSTED,
      ...(anyFailed ? {} : { postedAt: new Date() }),
    },
  });

  return NextResponse.json({ ok: !anyFailed, results });
}
