import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { sendSupportTicketEmail } from '@/lib/resend';
import { createBooking, getUpcomingBookings } from '@/lib/support/bookings';

/** GET: upcoming taken slots (start time + duration only, no personal info). */
export async function GET(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const upcoming = await getUpcomingBookings();
  return NextResponse.json({
    taken: upcoming.map((b) => ({ startIso: b.startIso, durationMin: b.durationMin })),
  });
}

export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    startIso?: string;
    durationMin?: number;
    name?: string;
    email?: string;
    note?: string;
    timezone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const startIso = typeof body.startIso === 'string' ? body.startIso : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : 'UTC';

  if (!startIso) return NextResponse.json({ message: 'Pick a time.' }, { status: 400 });
  if (!name) return NextResponse.json({ message: 'Name is required.' }, { status: 400 });
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ message: 'A valid email is required.' }, { status: 400 });
  }

  const result = await createBooking({
    startIso,
    durationMin: 15,
    name,
    email,
    note,
    timezone,
    userId,
  });
  if (!result.ok) {
    return NextResponse.json({ message: result.error }, { status: result.code === 'conflict' ? 409 : 400 });
  }

  const when = new Date(result.booking.startIso);
  const human = when.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'UTC',
    timeZoneName: 'short',
  });
  const emailBody = [
    `New 15-minute Zoom call request.`,
    ``,
    `Name: ${name}`,
    `Email: ${email}`,
    `When: ${human} (${timezone})`,
    `Start (UTC): ${result.booking.startIso}`,
    note ? `Note: ${note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await sendSupportTicketEmail(email, `Zoom call booked: ${human}`, emailBody, name);
  } catch {
    /* booking is saved even if email fails */
  }

  return NextResponse.json({ ok: true, booking: { startIso: result.booking.startIso, durationMin: result.booking.durationMin } });
}
