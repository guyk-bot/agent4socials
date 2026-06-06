import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSupabaseUserIdFromAuthHeader } from '@/lib/get-prisma-user';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];
  const supabaseUserId = await getSupabaseUserIdFromAuthHeader(authHeader);
  if (!supabaseUserId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: { newEmail?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const newEmail = typeof body.newEmail === 'string' ? normalizeEmail(body.newEmail) : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!newEmail || !isValidEmail(newEmail)) {
    return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const currentEmail = normalizeEmail(user.email);
  if (newEmail === currentEmail) {
    return NextResponse.json({ message: 'That is already your email address.' }, { status: 400 });
  }

  const provider = user.app_metadata?.provider ?? 'email';
  const isPasswordAccount = provider === 'email' || provider === 'local';

  if (isPasswordAccount) {
    if (!password) {
      return NextResponse.json({ message: 'Enter your current password to confirm this change.' }, { status: 400 });
    }
    const verify = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error: signInError } = await verify.auth.signInWithPassword({
      email: currentEmail,
      password,
    });
    if (signInError) {
      return NextResponse.json({ message: 'Incorrect password.' }, { status: 401 });
    }
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ message: 'Email change is temporarily unavailable.' }, { status: 503 });
  }

  if (process.env.DATABASE_URL) {
    try {
      const { prisma } = await import('@/lib/db');
      const existing = await prisma.user.findUnique({ where: { email: newEmail }, select: { supabaseId: true } });
      if (existing && existing.supabaseId !== supabaseUserId) {
        return NextResponse.json(
          { message: 'That email is already registered to another account.' },
          { status: 409 }
        );
      }
    } catch (e) {
      console.error('[change-email] prisma lookup failed:', e);
    }
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(supabaseUserId, {
    email: newEmail,
    email_confirm: true,
  });

  if (updateError) {
    const msg = updateError.message?.toLowerCase() ?? '';
    if (msg.includes('already') || msg.includes('registered')) {
      return NextResponse.json(
        { message: 'That email is already registered to another account.' },
        { status: 409 }
      );
    }
    console.error('[change-email] Supabase update failed:', updateError.message);
    return NextResponse.json({ message: 'Could not update email. Try again or contact support.' }, { status: 500 });
  }

  if (process.env.DATABASE_URL) {
    try {
      const { prisma } = await import('@/lib/db');
      await prisma.user.updateMany({
        where: { supabaseId: supabaseUserId },
        data: { email: newEmail },
      });
    } catch (e) {
      console.error('[change-email] prisma update failed:', e);
    }
  }

  try {
    await admin
      .from('user_profiles')
      .update({ email: newEmail, updated_at: new Date().toISOString() })
      .eq('user_id', supabaseUserId);
  } catch {
    /* optional table */
  }

  return NextResponse.json({
    email: newEmail,
    message: 'Email updated successfully.',
  });
}
