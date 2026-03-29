import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSupportTicketEmail } from '@/lib/resend';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: { subject?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 10000) : '';
  if (!message) {
    return NextResponse.json({ message: 'Message is required' }, { status: 400 });
  }

  const senderEmail = user.email ?? '';
  const senderName = user.user_metadata?.full_name || user.user_metadata?.name || null;

  const result = await sendSupportTicketEmail(senderEmail, subject || 'Support request', message, senderName);
  if (!result.ok) {
    return NextResponse.json({ message: result.error || 'Failed to send' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
