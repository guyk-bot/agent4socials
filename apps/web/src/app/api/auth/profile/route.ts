import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendWelcomeEmail } from '@/lib/resend';

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
  const payload = {
    id: user.id,
    email: user.email,
    name: name ?? undefined,
    createdAt: (user as { created_at?: string }).created_at ?? undefined,
  };

  const hasDbUrl = !!process.env.DATABASE_URL;
  const admin = getSupabaseAdmin();

  if (!hasDbUrl && admin) {
    const { data: existing } = await admin
      .from('user_profiles')
      .select('user_id, email, full_name, tier, monthly_word_limit, created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      const res = NextResponse.json({
        id: existing.user_id,
        email: existing.email,
        name: existing.full_name ?? undefined,
        createdAt: existing.created_at,
      });
      res.headers.set('X-Profile-Sync', 'ok');
      return res;
    }

    const marketing_consent = Boolean(user.user_metadata?.marketing_consent);
    await admin.from('user_profiles').insert({
      user_id: user.id,
      email,
      full_name: name,
      tier: 'account',
      monthly_word_limit: 0,
      marketing_consent,
      updated_at: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    const { data: claimed } = await admin
      .from('user_profiles')
      .update({ welcome_email_sent_at: now, updated_at: now })
      .eq('user_id', user.id)
      .is('welcome_email_sent_at', null)
      .select('email, full_name')
      .single();

    if (claimed) {
      console.log('[Profile API] Sending welcome email for new profile:', claimed.email);
      await sendWelcomeEmail(claimed.email, claimed.full_name);
    }

    const { data: profile } = await admin
      .from('user_profiles')
      .select('user_id, email, full_name, created_at')
      .eq('user_id', user.id)
      .single();

    if (profile) {
      const res = NextResponse.json({
        id: profile.user_id,
        email: profile.email,
        name: profile.full_name ?? undefined,
        createdAt: profile.created_at,
      });
      res.headers.set('X-Profile-Sync', 'ok');
      return res;
    }
  }

  if (!hasDbUrl) {
    const res = NextResponse.json(payload);
    res.headers.set('X-Profile-Sync', 'skipped');
    return res;
  }

  try {
    const { prisma } = await import('@/lib/db');
    const { AuthProvider } = await import('@prisma/client');
    const provider = user.app_metadata?.provider === 'google' ? AuthProvider.GOOGLE : AuthProvider.LOCAL;

    let dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
    if (!dbUser) {
      const existingByEmail = await prisma.user.findUnique({ where: { email } });
      if (existingByEmail) {
        await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { supabaseId: user.id, name: name ?? existingByEmail.name },
        });
        dbUser = (await prisma.user.findUnique({ where: { supabaseId: user.id } }))!;
        console.log('[Profile API] Updated existing User row by email:', email);
      } else {
        dbUser = await prisma.user.create({
          data: { supabaseId: user.id, email, name, provider, password: null },
        });
        console.log('[Profile API] Created User row for:', email);
        const { sendWelcomeEmail } = await import('@/lib/resend');
        await sendWelcomeEmail(dbUser.email, dbUser.name);
      }
    }
    const res = NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name ?? undefined,
      createdAt: dbUser.createdAt?.toISOString(),
    });
    res.headers.set('X-Profile-Sync', 'ok');
    return res;
  } catch (e) {
    const err = e as Error;
    const msg = err?.message ?? String(e);
    console.error('[Profile API] DB sync failed:', msg);
    const res = NextResponse.json(payload);
    res.headers.set('X-Profile-Sync', 'failed');
    res.headers.set('X-Profile-Sync-Error', msg.slice(0, 120));
    return res;
  }
}
