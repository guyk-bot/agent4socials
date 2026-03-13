import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Social accounts require DATABASE_URL' }, { status: 503 });
  }
  let userId: string | null;
  try {
    userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  } catch (e) {
    console.error('[GET /social/accounts] getPrismaUserIdFromRequest failed:', (e as Error)?.message);
    return NextResponse.json({ message: 'Database error. Try again later.' }, { status: 503 });
  }
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  let rows: Awaited<ReturnType<typeof prisma.socialAccount.findMany>>;
  try {
    rows = await prisma.socialAccount.findMany({
      where: { userId },
      select: { id: true, platform: true, username: true, profilePicture: true, platformUserId: true, status: true, updatedAt: true, credentialsJson: true },
    });
  } catch (e) {
    console.error('[GET /social/accounts] findMany failed:', (e as Error)?.message);
    return NextResponse.json({ message: 'Database error. Try again later.' }, { status: 503 });
  }
  const accounts = rows.map(({ credentialsJson, ...rest }) => {
    const out = { ...rest };
    if (rest.platform === 'TWITTER') {
      const creds = credentialsJson as { twitterOAuth1AccessToken?: string } | null;
      (out as { imageUploadEnabled?: boolean }).imageUploadEnabled = !!(creds?.twitterOAuth1AccessToken);
    }
    return out;
  });
  const res = NextResponse.json(accounts);
  res.headers.set('Cache-Control', 'private, max-age=30');
  return res;
}
