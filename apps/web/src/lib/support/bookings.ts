/**
 * Zoom call bookings, persisted in the shared app_kv table (no Prisma migration needed).
 * Bookings are global (calls with the iZop team), keyed under a single row.
 */
import { prisma } from '@/lib/db';

export type SupportBooking = {
  id: string;
  startIso: string;
  durationMin: number;
  name: string;
  email: string;
  note: string;
  timezone: string;
  userId: string | null;
  createdAt: string;
};

const BOOKINGS_KEY = 'support_bookings_v1';

let _tableEnsured = false;
async function ensureAppKvTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    _tableEnsured = true;
  } catch {
    _tableEnsured = true;
  }
}

export async function getAllBookings(): Promise<SupportBooking[]> {
  try {
    await ensureAppKvTable();
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM app_kv WHERE key = ${BOOKINGS_KEY} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return [];
    const parsed = JSON.parse(row.value) as SupportBooking[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Future bookings only, sorted ascending by start time. */
export async function getUpcomingBookings(): Promise<SupportBooking[]> {
  const now = Date.now();
  const all = await getAllBookings();
  return all
    .filter((b) => Date.parse(b.startIso) > now - 60 * 60 * 1000)
    .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
}

async function saveBookings(bookings: SupportBooking[]): Promise<void> {
  await ensureAppKvTable();
  const value = JSON.stringify(bookings);
  await prisma.$executeRaw`
    INSERT INTO app_kv (key, value, "updatedAt")
    VALUES (${BOOKINGS_KEY}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, "updatedAt" = now()
  `;
}

export type CreateBookingResult =
  | { ok: true; booking: SupportBooking }
  | { ok: false; error: string; code: 'conflict' | 'past' | 'invalid' };

export async function createBooking(input: {
  startIso: string;
  durationMin?: number;
  name: string;
  email: string;
  note?: string;
  timezone?: string;
  userId?: string | null;
}): Promise<CreateBookingResult> {
  const startMs = Date.parse(input.startIso);
  if (!Number.isFinite(startMs)) {
    return { ok: false, error: 'Invalid time.', code: 'invalid' };
  }
  if (startMs < Date.now()) {
    return { ok: false, error: 'That time is in the past. Pick a future slot.', code: 'past' };
  }
  const duration = input.durationMin && input.durationMin > 0 ? input.durationMin : 15;

  // Prune past bookings while we have the list loaded.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const existing = (await getAllBookings()).filter((b) => Date.parse(b.startIso) > cutoff);

  const conflict = existing.some((b) => {
    const bStart = Date.parse(b.startIso);
    const bEnd = bStart + b.durationMin * 60 * 1000;
    const newEnd = startMs + duration * 60 * 1000;
    return startMs < bEnd && newEnd > bStart;
  });
  if (conflict) {
    return { ok: false, error: 'That slot was just taken. Please pick another.', code: 'conflict' };
  }

  const booking: SupportBooking = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startIso: new Date(startMs).toISOString(),
    durationMin: duration,
    name: input.name.slice(0, 200),
    email: input.email.slice(0, 200),
    note: (input.note ?? '').slice(0, 2000),
    timezone: (input.timezone ?? 'UTC').slice(0, 80),
    userId: input.userId ?? null,
    createdAt: new Date().toISOString(),
  };

  await saveBookings([...existing, booking]);
  return { ok: true, booking };
}
