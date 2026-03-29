import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY not set' },
      { status: 500 }
    );
  }

  let body: { email?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';

  if (!email || !code) {
    return NextResponse.json({ error: 'Email and verification code are required' }, { status: 400 });
  }

  const { data: row, error: fetchError } = await admin
    .from('verification_codes')
    .select('user_id')
    .eq('email', email)
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error('[Verify OTP] fetch error:', fetchError);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }

  if (!row?.user_id) {
    return NextResponse.json({ error: 'Invalid or expired code. Please try again or request a new code.' }, { status: 400 });
  }

  await admin.auth.admin.updateUserById(row.user_id, { email_confirm: true });

  await admin.from('verification_codes').delete().eq('email', email).eq('code', code);

  return NextResponse.json({ success: true, message: 'Email verified. You can now sign in.' });
}
