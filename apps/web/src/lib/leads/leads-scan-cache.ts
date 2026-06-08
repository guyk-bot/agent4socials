/** Persist the user's most recent lead scan (app_kv) so Leads page + iZop AI share results. */
import { prisma } from '@/lib/db';
import type { ScannedLead } from '@/lib/leads/scan-leads';

export type SavedLeadsScan = {
  accountId: string | null;
  scanned: number;
  leads: ScannedLead[];
  message?: string;
  scannedAt: string;
};

function cacheKey(userId: string): string {
  return `leads_last_scan_v1:${userId}`;
}

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

export async function getSavedLeadsScan(userId: string): Promise<SavedLeadsScan | null> {
  try {
    await ensureAppKvTable();
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT value FROM app_kv WHERE key = ${cacheKey(userId)} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    const parsed = JSON.parse(row.value) as SavedLeadsScan;
    if (!parsed || !Array.isArray(parsed.leads)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveLeadsScan(userId: string, scan: Omit<SavedLeadsScan, 'scannedAt'>): Promise<void> {
  try {
    await ensureAppKvTable();
    const payload: SavedLeadsScan = { ...scan, scannedAt: new Date().toISOString() };
    const value = JSON.stringify(payload);
    const key = cacheKey(userId);
    await prisma.$executeRaw`
      INSERT INTO app_kv (key, value, "updatedAt")
      VALUES (${key}, ${value}, now())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, "updatedAt" = now()
    `;
  } catch (e) {
    console.error('[leads-scan-cache] save failed', e);
  }
}
