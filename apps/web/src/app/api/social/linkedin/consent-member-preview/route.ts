import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/social/linkedin/consent-member-preview
 * Member avatar for the in-app LinkedIn OAuth consent screen (before redirect to linkedin.com).
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ avatarUrl: null }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const rows = await prisma.socialAccount.findMany({
    where: { userId, platform: 'LINKEDIN', status: 'connected' },
    select: { profilePicture: true, accessToken: true, credentialsJson: true },
    orderBy: { updatedAt: 'desc' },
  });

  let avatarUrl: string | null = null;

  for (const row of rows) {
    const kind =
      row.credentialsJson && typeof row.credentialsJson === 'object'
        ? (row.credentialsJson as { linkedinConnectionKind?: string }).linkedinConnectionKind
        : undefined;
    if (kind === 'organization_page') continue;
    const pic = row.profilePicture?.trim();
    if (pic) {
      avatarUrl = pic;
      break;
    }
  }

  if (!avatarUrl) {
    for (const row of rows) {
      const pic = row.profilePicture?.trim();
      if (pic) {
        avatarUrl = pic;
        break;
      }
    }
  }

  if (!avatarUrl) {
    for (const row of rows) {
      const token = row.accessToken?.trim();
      if (!token) continue;
      try {
        const userRes = await axios.get<{ picture?: string }>('https://api.linkedin.com/v2/userinfo', {
          headers: linkedInRestCommunityHeaders(token),
          timeout: 8_000,
          validateStatus: (s) => s < 500,
        });
        const pic = userRes.data?.picture?.trim();
        if (pic) {
          avatarUrl = pic;
          break;
        }
      } catch {
        // try next row
      }
    }
  }

  const res = NextResponse.json({ avatarUrl });
  res.headers.set('Cache-Control', 'private, no-store, must-revalidate');
  return res;
}
