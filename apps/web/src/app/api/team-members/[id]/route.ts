import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { removeTeamMember, updateTeamMemberRole, normalizeRole } from '@/lib/team/team-members';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.role) {
    return NextResponse.json({ message: 'role is required' }, { status: 400 });
  }
  try {
    const ok = await updateTeamMemberRole(userId, id, normalizeRole(body.role));
    if (!ok) return NextResponse.json({ message: 'Member not found' }, { status: 404 });
    return NextResponse.json({ ok: true, role: normalizeRole(body.role) });
  } catch (e) {
    console.error('[team-members PATCH]', e);
    return NextResponse.json({ message: 'Failed to update role' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const ok = await removeTeamMember(userId, id);
    if (!ok) return NextResponse.json({ message: 'Member not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[team-members DELETE]', e);
    return NextResponse.json({ message: 'Failed to remove member' }, { status: 500 });
  }
}
