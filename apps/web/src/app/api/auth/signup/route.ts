import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || 'Agent4Socials <guyk@agent4socials.com>';

function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY not set' },
      { status: 500 }
    );
  }
  if (!resend) {
    return NextResponse.json(
      { error: 'Server configuration error: RESEND_API_KEY not set' },
      { status: 500 }
    );
  }

  let body: { email?: string; password?: string; full_name?: string; marketing_consent?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const marketing_consent = Boolean(body.marketing_consent);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const otp = randomOtp();
  const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data: userData, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name, marketing_consent },
  });

  if (createError) {
    if (createError.message?.toLowerCase().includes('already registered')) {
      return NextResponse.json({ error: 'An account with this email already exists. Try logging in.' }, { status: 409 });
    }
    console.error('[Signup] createUser error:', createError.message);
    return NextResponse.json({ error: createError.message || 'Could not create account' }, { status: 400 });
  }

  const { error: insertError } = await admin
    .from('verification_codes')
    .insert({ user_id: (userData as { user?: { id: string }; id?: string }).user?.id ?? (userData as { id: string }).id, email, code: otp, expires_at });

  if (insertError) {
    console.error('[Signup] verification_codes insert error:', insertError);
    return NextResponse.json(
      { error: 'Could not save verification code. Ensure Supabase tables are created (see supabase-migrations/001_onboarding_tables.sql).' },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com';

  const { error: emailError } = await resend.emails.send({
    from: FROM,
    to: [email],
    subject: 'Verify your Agent4Socials account',
    html: `
      <h1>Your verification code</h1>
      <p>Hi${full_name ? ` ${full_name}` : ''},</p>
      <p>Use this code to verify your email and activate your account:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p>
      <p>This code expires in 15 minutes.</p>
      <p>If you didn't request this, you can ignore this email.</p>
      <p><a href="${appUrl}">${appUrl}</a></p>
    `,
  });

  if (emailError) {
    console.error('[Signup] Resend error:', emailError);
    return NextResponse.json(
      { error: 'Account created but we could not send the verification email. Please try again or contact support.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, message: 'Verification code sent to your email' });
}
