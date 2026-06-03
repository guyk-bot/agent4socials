import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

type AccountItem = {
  id: string;
  username?: string;
  profilePicture?: string;
  pageId?: string;
  pageName?: string;
  pagePicture?: string;
};

type PageItem = {
  id: string;
  name?: string;
  picture?: string;
  instagram_business_account_id?: string;
};

export type InstagramPageChoice = {
  pageId: string;
  pageName?: string;
  pagePicture?: string;
  instagramId?: string;
  instagramUsername?: string;
  instagramPicture?: string;
};

export function buildInstagramPageChoices(
  pages: PageItem[],
  accounts: AccountItem[]
): InstagramPageChoice[] {
  const byPageId = new Map<string, AccountItem>();
  for (const a of accounts) {
    if (a.pageId) byPageId.set(a.pageId, a);
  }
  if (pages.length > 0) {
    return pages.map((page) => {
      const ig = page.instagram_business_account_id
        ? accounts.find((a) => a.id === page.instagram_business_account_id) ?? byPageId.get(page.id)
        : byPageId.get(page.id);
      return {
        pageId: page.id,
        pageName: page.name ?? ig?.pageName,
        pagePicture: page.picture ?? ig?.pagePicture,
        instagramId: page.instagram_business_account_id ?? ig?.id,
        instagramUsername: ig?.username,
        instagramPicture: ig?.profilePicture,
      };
    });
  }
  return accounts.map((a) => ({
    pageId: a.pageId ?? a.id,
    pageName: a.pageName,
    pagePicture: a.pagePicture,
    instagramId: a.id,
    instagramUsername: a.username,
    instagramPicture: a.profilePicture,
  }));
}

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const pendingId = request.nextUrl.searchParams.get('pendingId');
  if (!pendingId) {
    return NextResponse.json({ message: 'Missing pendingId' }, { status: 400 });
  }
  const pending = await prisma.pendingConnection.findUnique({
    where: { id: pendingId },
  });
  if (!pending || pending.userId !== userId || pending.platform !== 'INSTAGRAM') {
    return NextResponse.json({ message: 'Not found or expired' }, { status: 404 });
  }
  const payload = pending.payload as { accounts?: AccountItem[]; pages?: PageItem[]; accessToken?: string };
  if (pending.expiresAt && new Date() > pending.expiresAt) {
    await prisma.pendingConnection.delete({ where: { id: pendingId } }).catch(() => {});
    return NextResponse.json({ message: 'Expired' }, { status: 410 });
  }
  const accounts = (payload?.accounts ?? []) as AccountItem[];
  const pages = (payload?.pages ?? []) as PageItem[];
  const choices = buildInstagramPageChoices(pages, accounts);
  return NextResponse.json({ accounts, pages, choices });
}
