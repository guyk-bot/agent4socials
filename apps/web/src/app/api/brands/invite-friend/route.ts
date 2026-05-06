import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBrandFriendInviteEmail } from '@/lib/resend';

type InviteRole = 'Owner' | 'Admin' | 'Editor' | 'Viewer';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    email?: string;
    brandName?: string;
    friendName?: string;
    role?: InviteRole;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const to = typeof body.email === 'string' ? body.email.trim() : '';
  const brandName = typeof body.brandName === 'string' ? body.brandName.trim() : '';
  const friendName = typeof body.friendName === 'string' ? body.friendName.trim() : '';
  const role = body.role;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!to || !emailRegex.test(to)) {
    return NextResponse.json({ message: 'Valid email is required' }, { status: 400 });
  }
  if (!brandName) {
    return NextResponse.json({ message: 'Brand name is required' }, { status: 400 });
  }
  if (!role || !['Owner', 'Admin', 'Editor', 'Viewer'].includes(role)) {
    return NextResponse.json({ message: 'Valid role is required' }, { status: 400 });
  }

  const inviterName = (user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'A teammate').toString();
  const sent = await sendBrandFriendInviteEmail({
    to,
    inviterName,
    brandName,
    role,
    friendName,
  });
  if (!sent.ok) {
    return NextResponse.json({ message: sent.error || 'Failed to send invite email' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
