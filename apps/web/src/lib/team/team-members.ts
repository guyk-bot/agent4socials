/**
 * Persistent team members, stored in a dedicated `team_members` table.
 *
 * Created idempotently with CREATE TABLE IF NOT EXISTS (same low-risk pattern as
 * support bookings) so no Prisma migration is required at build time. Members are
 * scoped to the owner's User id + a brand id (brands still live client-side for now).
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';

export type TeamMemberRole = 'Admin' | 'Editor' | 'Viewer';
export type TeamMemberStatus = 'pending' | 'active';

export type TeamMemberRecord = {
  id: string;
  brandId: string;
  brandName: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  invitedAt: string;
  acceptedAt: string | null;
  lastActiveAt: string | null;
};

const VALID_ROLES: TeamMemberRole[] = ['Admin', 'Editor', 'Viewer'];

export function normalizeRole(input: unknown): TeamMemberRole {
  const v = String(input ?? '').trim();
  return (VALID_ROLES as string[]).includes(v) ? (v as TeamMemberRole) : 'Editor';
}

type Row = {
  id: string;
  brandId: string;
  brandName: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  role: string;
  status: string;
  invitedAt: Date;
  acceptedAt: Date | null;
  lastActiveAt: Date | null;
};

function rowToRecord(r: Row): TeamMemberRecord {
  return {
    id: r.id,
    brandId: r.brandId,
    brandName: r.brandName,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    name: r.name,
    role: normalizeRole(r.role),
    status: r.status === 'active' ? 'active' : 'pending',
    invitedAt: r.invitedAt.toISOString(),
    acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
    lastActiveAt: r.lastActiveAt ? r.lastActiveAt.toISOString() : null,
  };
}

let _tableEnsured = false;
async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS team_members (
      id            TEXT PRIMARY KEY,
      "ownerUserId" TEXT NOT NULL,
      "brandId"     TEXT NOT NULL,
      "brandName"   TEXT,
      email         TEXT NOT NULL,
      "firstName"   TEXT,
      "lastName"    TEXT,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'Editor',
      status        TEXT NOT NULL DEFAULT 'pending',
      "memberUserId" TEXT,
      "inviteToken"  TEXT,
      "invitedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
      "acceptedAt"  TIMESTAMPTZ,
      "lastActiveAt" TIMESTAMPTZ,
      "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS team_members_owner_brand_email
       ON team_members ("ownerUserId", "brandId", lower(email))`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS team_members_member_user ON team_members ("memberUserId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS team_members_invite_token ON team_members ("inviteToken")`
  );
  _tableEnsured = true;
}

export async function listTeamMembers(
  ownerUserId: string,
  brandId: string
): Promise<TeamMemberRecord[]> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, "brandId", "brandName", email, "firstName", "lastName", name, role, status,
           "invitedAt", "acceptedAt", "lastActiveAt"
    FROM team_members
    WHERE "ownerUserId" = ${ownerUserId} AND "brandId" = ${brandId}
    ORDER BY "invitedAt" ASC
  `;
  return rows.map(rowToRecord);
}

export type AddTeamMemberInput = {
  ownerUserId: string;
  brandId: string;
  brandName?: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: TeamMemberRole;
};

export type AddTeamMemberResult =
  | { ok: true; member: TeamMemberRecord; inviteToken: string }
  | { ok: false; error: string; code: 'invalid' | 'duplicate' };

export async function addTeamMember(input: AddTeamMemberInput): Promise<AddTeamMemberResult> {
  await ensureTable();
  const email = input.email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { ok: false, error: 'Enter a valid email.', code: 'invalid' };
  }
  const firstName = (input.firstName ?? '').trim();
  const lastName = (input.lastName ?? '').trim();
  const name = `${firstName} ${lastName}`.trim() || email;
  const role = normalizeRole(input.role);

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM team_members
    WHERE "ownerUserId" = ${input.ownerUserId}
      AND "brandId" = ${input.brandId}
      AND lower(email) = ${email.toLowerCase()}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return { ok: false, error: 'That email is already on this team.', code: 'duplicate' };
  }

  const id = randomUUID();
  const inviteToken = randomUUID().replace(/-/g, '');
  await prisma.$executeRaw`
    INSERT INTO team_members
      (id, "ownerUserId", "brandId", "brandName", email, "firstName", "lastName", name, role, status, "inviteToken", "invitedAt", "createdAt", "updatedAt")
    VALUES
      (${id}, ${input.ownerUserId}, ${input.brandId}, ${input.brandName ?? null}, ${email},
       ${firstName || null}, ${lastName || null}, ${name}, ${role}, 'pending', ${inviteToken}, now(), now(), now())
  `;

  const member: TeamMemberRecord = {
    id,
    brandId: input.brandId,
    brandName: input.brandName ?? null,
    email,
    firstName: firstName || null,
    lastName: lastName || null,
    name,
    role,
    status: 'pending',
    invitedAt: new Date().toISOString(),
    acceptedAt: null,
    lastActiveAt: null,
  };
  return { ok: true, member, inviteToken };
}

export async function updateTeamMemberRole(
  ownerUserId: string,
  id: string,
  role: TeamMemberRole
): Promise<boolean> {
  await ensureTable();
  const affected = await prisma.$executeRaw`
    UPDATE team_members SET role = ${normalizeRole(role)}, "updatedAt" = now()
    WHERE id = ${id} AND "ownerUserId" = ${ownerUserId}
  `;
  return affected > 0;
}

export async function removeTeamMember(ownerUserId: string, id: string): Promise<boolean> {
  await ensureTable();
  const affected = await prisma.$executeRaw`
    DELETE FROM team_members WHERE id = ${id} AND "ownerUserId" = ${ownerUserId}
  `;
  return affected > 0;
}

/**
 * Called on login: flips any pending invites for this email to active (linking the
 * member's User id), and refreshes lastActiveAt for all of this user's memberships.
 * Safe to call on every profile load.
 */
export async function activateMembershipsForUser(memberUserId: string, email: string): Promise<void> {
  if (!email) return;
  try {
    await ensureTable();
    const lowered = email.toLowerCase();
    await prisma.$executeRaw`
      UPDATE team_members
      SET status = 'active',
          "memberUserId" = ${memberUserId},
          "acceptedAt" = COALESCE("acceptedAt", now()),
          "lastActiveAt" = now(),
          "updatedAt" = now()
      WHERE lower(email) = ${lowered}
        AND (status <> 'active' OR "memberUserId" IS NULL)
    `;
    await prisma.$executeRaw`
      UPDATE team_members
      SET "lastActiveAt" = now(), "updatedAt" = now()
      WHERE "memberUserId" = ${memberUserId}
    `;
  } catch {
    /* table may not exist yet; ignore */
  }
}
