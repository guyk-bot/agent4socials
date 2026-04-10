import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM =
  process.env.RESEND_WELCOME_FROM_EMAIL ||
  process.env.RESEND_FROM_EMAIL ||
  process.env.RESEND_FROM ||
  'Agent4Socials <guyk@agent4socials.com>';

const RESEND_COOLDOWN_MS = 30_000;
const MAX_RESENDS_BEFORE_LOCKOUT = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const LOCKOUT_MESSAGE =
  'You requested the code too many times. Please try again later, or sign in with a different method.';

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

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const { data: rows, error: fetchError } = await admin
    .from('verification_codes')
    .select('id, user_id, email, created_at, last_sent_at, resend_count, lockout_until')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError) {
    console.error('[Resend verification] fetch error:', fetchError);
    return NextResponse.json({ error: 'Could not look up verification' }, { status: 500 });
  }

  const row = rows?.[0] as
    | {
        id: string;
        user_id: string;
        email: string;
        created_at: string;
        last_sent_at?: string | null;
        resend_count?: number | null;
        lockout_until?: string | null;
      }
    | undefined;

  if (!row?.user_id) {
    return NextResponse.json(
      { error: 'No pending verification for this email. Sign up again or log in.' },
      { status: 404 }
    );
  }

  const { data: authUser, error: userError } = await admin.auth.admin.getUserById(row.user_id);
  if (userError) {
    console.error('[Resend verification] getUserById error:', userError.message);
    return NextResponse.json({ error: 'Could not verify account state' }, { status: 500 });
  }

  if (authUser.user?.email_confirmed_at) {
    return NextResponse.json({ error: 'This email is already verified. Log in instead.' }, { status: 400 });
  }

  const now = Date.now();
  let resendCount = typeof row.resend_count === 'number' ? row.resend_count : 0;
  let lockoutUntilIso: string | null = row.lockout_until ?? null;

  if (resendCount >= MAX_RESENDS_BEFORE_LOCKOUT) {
    if (lockoutUntilIso) {
      const lockEnd = new Date(lockoutUntilIso).getTime();
      if (now < lockEnd) {
        return NextResponse.json(
          { error: LOCKOUT_MESSAGE, lockoutUntil: lockoutUntilIso },
          { status: 429 }
        );
      }
    }
    resendCount = 0;
    lockoutUntilIso = null;
  }

  const lastSentRaw = row.last_sent_at ?? row.created_at;
  const lastSent = new Date(lastSentRaw).getTime();
  const elapsed = now - lastSent;
  if (elapsed < RESEND_COOLDOWN_MS) {
    const retryAfterSec = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
    return NextResponse.json(
      {
        error: `Please wait ${retryAfterSec} seconds before requesting another code.`,
        retryAfterSec,
      },
      { status: 429 }
    );
  }

  const otp = randomOtp();
  const expires_at = new Date(now + 15 * 60 * 1000).toISOString();
  const nextResendCount = resendCount + 1;
  const newLockout =
    nextResendCount >= MAX_RESENDS_BEFORE_LOCKOUT ? new Date(now + LOCKOUT_MS).toISOString() : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com';
  const fullName =
    (authUser.user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() || '';

  const { error: emailError } = await resend.emails.send({
    from: FROM,
    to: [email],
    subject: 'Your Agent4Socials verification code',
    html: `
      <h1>Your verification code</h1>
      <p>Hi${fullName ? ` ${fullName}` : ''},</p>
      <p>Use this code to verify your email and activate your account:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p>
      <p>This code expires in 15 minutes.</p>
      <p>If you didn't request this, you can ignore this email.</p>
      <p><a href="${appUrl}">${appUrl}</a></p>
    `,
  });

  if (emailError) {
    console.error('[Resend verification] Resend error:', emailError);
    return NextResponse.json({ error: 'Could not send email. Try again shortly.' }, { status: 502 });
  }

  const { error: updateError } = await admin
    .from('verification_codes')
    .update({
      code: otp,
      expires_at,
      last_sent_at: new Date(now).toISOString(),
      resend_count: nextResendCount,
      lockout_until: newLockout,
    })
    .eq('id', row.id);

  if (updateError) {
    console.error('[Resend verification] update error:', updateError);
    return NextResponse.json({ error: 'Could not update verification code.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'A new code was sent to your email.',
    cooldownSeconds: 30,
    lockoutUntil: newLockout,
    resendCount: nextResendCount,
  });
}
