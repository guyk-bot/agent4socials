import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET/POST /api/cron/trigger-vercel-deploy
 * Call with X-Cron-Secret or Authorization: Bearer CRON_SECRET.
 * Fetches latest commit on main from GitHub; if it changed since last run,
 * POSTs to VERCEL_DEPLOY_HOOK_URL to trigger a deployment.
 * This avoids needing a GitHub Actions workflow (which requires workflow scope to push).
 *
 * Set up: add VERCEL_DEPLOY_HOOK_URL and optionally GITHUB_REPO (default: guyk-bot/agent4socials)
 * to Vercel env. Then use a cron (e.g. cron-job.org) to call this URL every 2–5 minutes.
 */
export async function GET(request: NextRequest) {
  return runTrigger(request);
}

export async function POST(request: NextRequest) {
  return runTrigger(request);
}

async function runTrigger(request: NextRequest) {
  const cronSecret = request.headers.get('X-Cron-Secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  const repo = process.env.GITHUB_REPO || 'guyk-bot/agent4socials';
  if (!hookUrl?.trim()) {
    return NextResponse.json({ message: 'VERCEL_DEPLOY_HOOK_URL not set', triggered: false }, { status: 200 });
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/main`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ message: `GitHub API: ${res.status} ${text.slice(0, 200)}`, triggered: false }, { status: 200 });
    }
    const data = (await res.json()) as { sha?: string };
    const latestSha = data.sha?.trim();
    if (!latestSha) {
      return NextResponse.json({ message: 'No commit SHA from GitHub', triggered: false }, { status: 200 });
    }

    const state = await prisma.deployTriggerState.upsert({
      where: { id: 'default' },
      create: { id: 'default', lastCommitSha: null, updatedAt: new Date() },
      update: {},
    });

    if (state.lastCommitSha === latestSha) {
      return NextResponse.json({ message: 'No new commit', commit: latestSha, triggered: false });
    }

    const hookRes = await fetch(hookUrl.trim(), { method: 'POST' });
    if (!hookRes.ok) {
      return NextResponse.json({
        message: `Deploy hook returned ${hookRes.status}`,
        commit: latestSha,
        triggered: false,
      }, { status: 200 });
    }

    await prisma.deployTriggerState.update({
      where: { id: 'default' },
      data: { lastCommitSha: latestSha, updatedAt: new Date() },
    });

    return NextResponse.json({ message: 'Deploy triggered', commit: latestSha, triggered: true });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    return NextResponse.json({ message: msg.slice(0, 300), triggered: false }, { status: 500 });
  }
}
