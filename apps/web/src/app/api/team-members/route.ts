import { NextRequest, NextResponse } from 'next/server';
import { resolveAppBaseUrl } from '@/lib/app-base-url';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { sendBrandFriendInviteEmail } from '@/lib/resend';
import {
  addTeamMember,
  listTeamMembers,
  normalizeRole,
} from '@/lib/team/team-members';

function requireDb() {
  return Boolean(process.env.DATABASE_URL);
}

export async function GET(request: NextRequest) {
  if (!requireDb()) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const brandId = request.nextUrl.searchParams.get('brandId')?.trim();
  if (!brandId) {
    return NextResponse.json({ message: 'brandId is required' }, { status: 400 });
  }
  try {
    const members = await listTeamMembers(userId, brandId);
    return NextResponse.json({ members });
  } catch (e) {
    console.error('[team-members GET]', e);
    return NextResponse.json({ message: 'Failed to load team members' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!requireDb()) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    brandId?: string;
    brandName?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    silent?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const brandId = (body.brandId ?? '').trim();
  if (!brandId) {
    return NextResponse.json({ message: 'brandId is required' }, { status: 400 });
  }
  const brandName = (body.brandName ?? '').trim() || null;

  try {
    const result = await addTeamMember({
      ownerUserId: userId,
      brandId,
      brandName,
      email: body.email ?? '',
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      role: normalizeRole(body.role),
    });
    if (!result.ok) {
      return NextResponse.json({ message: result.error }, { status: result.code === 'duplicate' ? 409 : 400 });
    }

    // Migration import: persist without emailing existing members.
    if (body.silent) {
      return NextResponse.json({ member: result.member, inviteLink: '', emailError: null });
    }

    // Send the invite email (best effort; member is already persisted).
    let inviteLink = '';
    let emailError: string | null = null;
    try {
      const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
      const inviterName = inviter?.name || inviter?.email || 'A teammate';
      const baseUrl = resolveAppBaseUrl();
      const params = new URLSearchParams({
        email: result.member.email,
        brand: brandName || '',
        role: result.member.role,
        invite: result.inviteToken,
      });
      inviteLink = `${baseUrl}/signup?${params.toString()}`;
      const sent = await sendBrandFriendInviteEmail({
        to: result.member.email,
        inviterName,
        brandName: brandName || 'your workspace',
        role: result.member.role,
        friendName: result.member.name,
        inviteLink,
      });
      if (!sent.ok) emailError = sent.error || 'Invite email failed to send.';
    } catch (e) {
      emailError = e instanceof Error ? e.message : 'Invite email failed to send.';
    }

    return NextResponse.json({ member: result.member, inviteLink, emailError });
  } catch (e) {
    console.error('[team-members POST]', e);
    return NextResponse.json({ message: 'Failed to add team member' }, { status: 500 });
  }
}
