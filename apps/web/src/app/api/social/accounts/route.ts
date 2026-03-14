import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma, databaseUrlLooksDirect } from '@/lib/db';

const POOLER_MESSAGE =
  'Database: use the Supabase Transaction pooler (port 6543) to avoid max connections. Set DATABASE_URL in Vercel to the Transaction pooler URI, add ?pgbouncer=true if needed, then redeploy. https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler';

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Social accounts require DATABASE_URL' }, { status: 503 });
  }
  if (databaseUrlLooksDirect) {
    return NextResponse.json({ message: POOLER_MESSAGE }, { status: 503 });
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
  try {
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
    const res = NextResponse.json(accounts);
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;
  } catch (e) {
    const msg = (e as Error)?.message?.toLowerCase() ?? '';
    if (msg.includes('max client connections') || msg.includes('too many clients')) {
      return NextResponse.json({ message: POOLER_MESSAGE }, { status: 503 });
    }
    console.error('[GET /social/accounts] findMany failed:', (e as Error)?.message);
    return NextResponse.json({ message: 'Database error. Try again later.' }, { status: 503 });
  }
}
