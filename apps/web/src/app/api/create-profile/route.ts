import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { id: user.id, email: user.email, name: user.user_metadata?.full_name ?? undefined, createdAt: (user as { created_at?: string }).created_at },
      { headers: { 'X-Profile-Source': 'auth-only' } }
    );
  }

  const email = user.email ?? '';
  const full_name = user.user_metadata?.full_name || user.user_metadata?.name || null;
  const marketing_consent = Boolean(user.user_metadata?.marketing_consent);

  const { data: existing } = await admin
    .from('user_profiles')
    .select('id, user_id, email, full_name, tier, monthly_word_limit, marketing_consent, welcome_email_sent_at, created_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      id: existing.user_id,
      email: existing.email,
      name: existing.full_name ?? undefined,
      createdAt: existing.created_at,
      tier: existing.tier,
      monthlyWordLimit: existing.monthly_word_limit,
    });
  }

  const { error: insertError } = await admin.from('user_profiles').insert({
    user_id: user.id,
    email,
    full_name,
    tier: 'account',
    monthly_word_limit: 0,
    marketing_consent,
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error('[Create Profile] insert error:', insertError);
    return NextResponse.json(
      { id: user.id, email, name: full_name ?? undefined, createdAt: (user as { created_at?: string }).created_at },
      { headers: { 'X-Profile-Source': 'auth-fallback' } }
    );
  }

  const now = new Date().toISOString();
  const { data: claimed, error: updateError } = await admin
    .from('user_profiles')
    .update({ welcome_email_sent_at: now, updated_at: now })
    .eq('user_id', user.id)
    .is('welcome_email_sent_at', null)
    .select('user_id, email, full_name, created_at')
    .single();

  if (!updateError && claimed) {
    await sendWelcomeEmail(claimed.email, claimed.full_name);
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('user_id, email, full_name, tier, monthly_word_limit, created_at')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({
      id: user.id,
      email,
      name: full_name ?? undefined,
      createdAt: (user as { created_at?: string }).created_at,
    });
  }

  return NextResponse.json({
    id: profile.user_id,
    email: profile.email,
    name: profile.full_name ?? undefined,
    createdAt: profile.created_at,
    tier: profile.tier,
    monthlyWordLimit: profile.monthly_word_limit,
  });
}
