import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { analyzeReel } from '@/lib/reel-analysis/analyze';
import type { ShortVideoMetadata } from '@/lib/reel-analysis/types';
import { validateShortVideoMetadata } from '@/lib/reel-analysis/scoring';

/**
 * POST /api/reels/analyze
 * Analyzes a short-form video (reel/short) and returns a performance score, sub-scores, recommendations, and risk factors.
 * Input: videoUrl, caption, optional targetPlatform, metadata (durationSec, width, height, ...), optional transcript.
 * Does not send the raw video to the LLM; uses caption + transcript + metadata for a low-cost pipeline.
 */
export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { message: 'Reel analysis is not configured (OPENROUTER_API_KEY).' },
      { status: 503 }
    );
  }

  let body: {
    videoUrl?: string;
    caption?: string;
    targetPlatform?: string;
    metadata?: { durationSec?: number; width?: number; height?: number; hasAudio?: boolean; hasSubtitles?: boolean; dynamicFirst3Sec?: boolean };
    transcript?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const caption = typeof body.caption === 'string' ? body.caption : '';
  const targetPlatform = typeof body.targetPlatform === 'string' ? body.targetPlatform.trim().toLowerCase() : undefined;
  const allowedPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook'];
  const platform = targetPlatform && allowedPlatforms.includes(targetPlatform) ? targetPlatform : undefined;

  const meta = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const durationSec = typeof meta.durationSec === 'number' ? meta.durationSec : 0;
  const width = typeof meta.width === 'number' ? meta.width : 1080;
  const height = typeof meta.height === 'number' ? meta.height : 1920;

  if (!videoUrl) {
    return NextResponse.json({ message: 'videoUrl is required' }, { status: 400 });
  }
  if (durationSec <= 0 || width <= 0 || height <= 0) {
    return NextResponse.json(
      { message: 'metadata.durationSec, metadata.width, and metadata.height are required and must be positive' },
      { status: 400 }
    );
  }

  const metadata: ShortVideoMetadata = {
    durationSec,
    width,
    height,
    hasAudio: meta.hasAudio,
    hasSubtitles: meta.hasSubtitles,
    dynamicFirst3Sec: meta.dynamicFirst3Sec,
  };

  const { warnings } = validateShortVideoMetadata(metadata);

  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : undefined;

  try {
    const result = await analyzeReel(
      {
        videoUrl,
        caption,
        targetPlatform: platform as 'instagram' | 'tiktok' | 'youtube' | 'facebook' | undefined,
        metadata,
        transcript,
      },
      { openRouterApiKey: apiKey }
    );

    return NextResponse.json({
      ...result,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    console.error('[reels/analyze]', message);
    return NextResponse.json(
      { message: message.includes('AI') ? message : 'Reel analysis failed. Try again.' },
      { status: 502 }
    );
  }
}
