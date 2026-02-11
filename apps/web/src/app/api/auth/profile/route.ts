import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { AuthProvider } from '@prisma/client';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const email = user.email ?? '';
  const name = user.user_metadata?.full_name || user.user_metadata?.name || null;
  const provider = user.app_metadata?.provider === 'google' ? AuthProvider.GOOGLE : AuthProvider.LOCAL;

  const hasDbUrl = !!process.env.DATABASE_URL;
  if (!hasDbUrl) {
    console.warn('[Profile API] DATABASE_URL is not set. User will not be synced to Supabase User table. Set it in Vercel (web project) or apps/web/.env');
  }

  // Sync to User table so users appear in Supabase Table Editor (requires DATABASE_URL in Vercel)
  try {
    if (hasDbUrl) {
      let dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
      if (!dbUser) {
        const existingByEmail = await prisma.user.findUnique({ where: { email } });
        if (existingByEmail) {
          await prisma.user.update({
            where: { id: existingByEmail.id },
            data: { supabaseId: user.id, name: name ?? existingByEmail.name },
          });
          dbUser = (await prisma.user.findUnique({ where: { supabaseId: user.id } }))!;
        } else {
          dbUser = await prisma.user.create({
            data: { supabaseId: user.id, email, name, provider, password: null },
          });
        }
      }
      return NextResponse.json({
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name ?? undefined,
        createdAt: dbUser.createdAt?.toISOString(),
      });
    }
  } catch (e) {
    const err = e as Error;
    console.error('[Profile API] DB sync failed:', err?.message ?? err);
    console.error('[Profile API] Stack:', err?.stack);
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        { message: 'Profile sync failed', error: err?.message, code: (e as { code?: string })?.code },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: name ?? undefined,
    createdAt: (user as { created_at?: string }).created_at ?? undefined,
  });
}
