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
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true, platform: true, username: true, profilePicture: true, status: true, updatedAt: true },
  });
  return NextResponse.json(accounts);
}
