import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Social accounts require DATABASE_URL' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const rows = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true, platform: true, username: true, profilePicture: true, platformUserId: true, status: true, updatedAt: true, credentialsJson: true },
  });
  const accounts = rows.map(({ credentialsJson, ...rest }) => {
    const out = { ...rest };
    if (rest.platform === 'TWITTER') {
      const creds = credentialsJson as { twitterOAuth1AccessToken?: string } | null;
      (out as { imageUploadEnabled?: boolean }).imageUploadEnabled = !!(creds?.twitterOAuth1AccessToken);
    }
    return out;
  });
  return NextResponse.json(accounts);
}
