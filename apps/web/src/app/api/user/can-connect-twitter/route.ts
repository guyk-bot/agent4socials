import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** Paid tiers that can connect X (Twitter). Free tier is 'account' or missing. */
const PAID_TIERS = ['starter', 'pro'];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ canConnectTwitter: false }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ canConnectTwitter: false }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ canConnectTwitter: false });
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('tier')
    .eq('user_id', user.id)
    .maybeSingle();

  const tier = (profile?.tier ?? 'account')?.toString().toLowerCase();
  const canConnectTwitter = PAID_TIERS.includes(tier);

  return NextResponse.json({ canConnectTwitter });
}
