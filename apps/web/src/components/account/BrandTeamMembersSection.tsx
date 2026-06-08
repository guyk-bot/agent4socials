'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, HelpCircle, Plus, Shield, ChevronDown, Check, Clock, CircleCheck, Loader2 } from 'lucide-react';
import api from '@/lib/api';

const ROLE_GUIDE_URL = '/help/roles-permissions';

export type BrandTeamRole = 'Admin' | 'Editor' | 'Viewer';

export type BrandTeamMemberStatus = 'active' | 'pending';

export type BrandTeamMember = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: BrandTeamRole;
  imageUrl?: string | null;
  status?: BrandTeamMemberStatus;
  addedAt?: string;
};

/** Server record shape from /api/team-members. */
type ApiTeamMember = {
  id: string;
  brandId: string;
  brandName: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  role: BrandTeamRole;
  status: BrandTeamMemberStatus;
  invitedAt: string;
  acceptedAt: string | null;
  lastActiveAt: string | null;
};

const ROLE_PERMISSIONS: Record<BrandTeamRole, string[]> = {
  Admin: [
    'Manage team members and roles',
    'Edit brand details and brand image',
    'Create, edit, schedule, and publish content',
    'View analytics and reports',
  ],
  Editor: [
    'Create, edit, schedule, and publish content',
    'Reply to inbox comments and DMs',
    'View analytics and reports',
    'Cannot manage team or brand settings',
  ],
  Viewer: [
    'View analytics and reports',
    'View content and inbox (read-only)',
    'Cannot create, edit, or publish',
    'Cannot manage team or settings',
  ],
};

const ROLE_BADGE_CLASS: Record<BrandTeamRole, string> = {
  Admin: 'border-violet-300 bg-violet-50 text-violet-700',
  Editor: 'border-sky-300 bg-sky-50 text-sky-700',
  Viewer: 'border-neutral-300 bg-neutral-50 text-neutral-600',
};

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function apiToBrandMember(m: ApiTeamMember): BrandTeamMember {
  return {
    id: m.id,
    firstName: m.firstName ?? '',
    lastName: m.lastName ?? '',
    name: m.name,
    email: m.email,
    role: m.role,
    imageUrl: null,
    status: m.status,
    addedAt: m.invitedAt,
  };
}

export type BrandTeamMembersSectionProps = {
  brands: Array<{ id: string; name: string }>;
  activeBrandId: string;
  teamMembersByBrand: Record<string, BrandTeamMember[]>;
  setTeamMembersByBrand: React.Dispatch<React.SetStateAction<Record<string, BrandTeamMember[]>>>;
};

export function BrandTeamMembersSection({
  brands,
  activeBrandId,
  teamMembersByBrand,
  setTeamMembersByBrand,
}: BrandTeamMembersSectionProps) {
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [newMemberFirstName, setNewMemberFirstName] = useState('');
  const [newMemberLastName, setNewMemberLastName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<BrandTeamRole>('Editor');
  const [inviteFeedback, setInviteFeedback] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [rolesTooltipOpen, setRolesTooltipOpen] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<ApiTeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const brandMenuRef = useRef<HTMLDivElement>(null);
  const migratedBrands = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!brandMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (brandMenuRef.current && !brandMenuRef.current.contains(e.target as Node)) {
        setBrandMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [brandMenuOpen]);

  useEffect(() => {
    if (!brands.length) {
      setSelectedBrandId('');
      return;
    }
    setSelectedBrandId((prev) => {
      if (prev && brands.some((b) => b.id === prev)) return prev;
      if (activeBrandId && brands.some((b) => b.id === activeBrandId)) return activeBrandId;
      return brands[0]!.id;
    });
  }, [brands, activeBrandId]);

  const selectedBrand = brands.find((b) => b.id === selectedBrandId) ?? null;

  const mirrorToParent = useCallback(
    (brandId: string, apiMembers: ApiTeamMember[]) => {
      setTeamMembersByBrand((prev) => ({
        ...prev,
        [brandId]: apiMembers.map(apiToBrandMember),
      }));
    },
    [setTeamMembersByBrand]
  );

  const loadMembers = useCallback(
    async (brand: { id: string; name: string }) => {
      setLoadingMembers(true);
      try {
        const res = await api.get<{ members: ApiTeamMember[] }>('/team-members', {
          params: { brandId: brand.id },
        });
        let list = res.data.members ?? [];

        // One-time migration: if the DB has no rows but localStorage does, import them silently.
        if (list.length === 0 && !migratedBrands.current.has(brand.id)) {
          migratedBrands.current.add(brand.id);
          const legacy = teamMembersByBrand[brand.id] ?? [];
          if (legacy.length > 0) {
            await Promise.allSettled(
              legacy.map((m) =>
                api.post('/team-members', {
                  brandId: brand.id,
                  brandName: brand.name,
                  email: m.email,
                  firstName: m.firstName,
                  lastName: m.lastName,
                  role: m.role,
                  silent: true,
                })
              )
            );
            const after = await api.get<{ members: ApiTeamMember[] }>('/team-members', {
              params: { brandId: brand.id },
            });
            list = after.data.members ?? [];
          }
        }

        setMembers(list);
        mirrorToParent(brand.id, list);
      } catch {
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    },
    [teamMembersByBrand, mirrorToParent]
  );

  useEffect(() => {
    if (!selectedBrand) {
      setMembers([]);
      return;
    }
    void loadMembers(selectedBrand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrandId]);

  const handleAddTeamMember = async () => {
    if (!selectedBrand) return;
    setInviteFeedback('');
    setInviteError('');
    setInviteLink('');
    const firstName = newMemberFirstName.trim();
    const lastName = newMemberLastName.trim();
    const email = newMemberEmail.trim();
    if (!firstName || !lastName || !email) {
      setInviteError('First name, last name, and email are required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setInviteError('Enter a valid email.');
      return;
    }
    setInviteSending(true);
    try {
      const res = await api.post<{ member: ApiTeamMember; inviteLink?: string; emailError?: string | null }>(
        '/team-members',
        {
          brandId: selectedBrand.id,
          brandName: selectedBrand.name,
          email,
          firstName,
          lastName,
          role: newMemberRole,
        }
      );
      const next = [...members, res.data.member];
      setMembers(next);
      mirrorToParent(selectedBrand.id, next);
      setInviteLink(res.data.inviteLink || '');
      if (res.data.emailError) {
        setInviteError(`Member added, but the invite email failed: ${res.data.emailError}`);
      } else {
        setInviteFeedback(`Invite sent to ${email}. If they cannot find it, ask them to check spam.`);
      }
      setNewMemberFirstName('');
      setNewMemberLastName('');
      setNewMemberEmail('');
      setNewMemberRole('Editor');
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setInviteError(message || 'Could not add team member. Try again.');
    } finally {
      setInviteSending(false);
    }
  };

  const handleDeleteTeamMember = async (memberId: string) => {
    if (!selectedBrand) return;
    const next = members.filter((m) => m.id !== memberId);
    setMembers(next);
    mirrorToParent(selectedBrand.id, next);
    try {
      await api.delete(`/team-members/${memberId}`);
    } catch {
      void loadMembers(selectedBrand);
    }
  };

  const handleChangeRole = async (memberId: string, role: BrandTeamRole) => {
    if (!selectedBrand) return;
    const next = members.map((m) => (m.id === memberId ? { ...m, role } : m));
    setMembers(next);
    mirrorToParent(selectedBrand.id, next);
    try {
      await api.patch(`/team-members/${memberId}`, { role });
    } catch {
      void loadMembers(selectedBrand);
    }
  };

  const teamSummary = useMemo(() => {
    const counts = { Admin: 0, Editor: 0, Viewer: 0, pending: 0 };
    for (const m of members) {
      counts[m.role] += 1;
      if (m.status === 'pending') counts.pending += 1;
    }
    return counts;
  }, [members]);

  return (
    <div className="team-members-frame rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4 sm:p-5 shadow-sm space-y-4">
      <div className="space-y-2">
        <span id="team-brand-select-label" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Brand
        </span>
        <div ref={brandMenuRef} className="relative w-full max-w-md">
          <button
            type="button"
            id="team-brand-select"
            aria-haspopup="listbox"
            aria-expanded={brandMenuOpen}
            aria-labelledby="team-brand-select-label team-brand-select"
            disabled={!brands.length}
            onClick={() => setBrandMenuOpen((o) => !o)}
            className="team-brand-select-trigger team-members-field flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-300 bg-[var(--background)] px-3 py-2.5 text-left text-sm text-neutral-900 disabled:opacity-50"
          >
            <span className="truncate">{selectedBrand?.name ?? 'Select brand'}</span>
            <ChevronDown size={16} className={`shrink-0 text-neutral-500 transition-transform ${brandMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {brandMenuOpen && brands.length > 0 ? (
            <ul
              role="listbox"
              aria-labelledby="team-brand-select-label"
              className="brand-select-panel brand-select-menu absolute left-0 right-0 z-30 mt-1 rounded-xl border border-neutral-300 bg-[var(--background)] py-1 shadow-lg"
            >
              {brands.map((b) => {
                const isSelected = b.id === selectedBrandId;
                return (
                  <li key={b.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={`brand-select-option flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${isSelected ? '' : 'text-neutral-900'}`}
                      onClick={() => {
                        setSelectedBrandId(b.id);
                        setBrandMenuOpen(false);
                        setInviteFeedback('');
                        setInviteError('');
                        setInviteLink('');
                      }}
                    >
                      <span className="truncate">{b.name}</span>
                      {isSelected ? <Check size={14} className="shrink-0 text-[var(--color-accent-orange-light)]" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        {!brands.length ? <p className="text-sm text-neutral-500">Create a brand above to add team members.</p> : null}
      </div>

      {selectedBrand ? (
        <div className="team-members-inner rounded-xl border border-neutral-200 bg-[var(--background)] p-4">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-neutral-500" />
            <h3 className="text-sm font-semibold text-neutral-900">Team members & roles</h3>
            {loadingMembers ? <Loader2 size={13} className="animate-spin text-neutral-400" /> : null}
            <div
              className="relative"
              onMouseEnter={() => setRolesTooltipOpen(true)}
              onMouseLeave={() => setRolesTooltipOpen(false)}
            >
              <span
                className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-orange-300 bg-orange-100 text-orange-700"
                aria-label="Role permissions"
              >
                <HelpCircle size={12} />
              </span>
              <div className="absolute left-1/2 top-5 z-20 h-4 w-[330px] -translate-x-1/2" />
              <div
                className={`absolute left-1/2 top-7 z-30 w-[330px] -translate-x-1/2 rounded-xl border border-orange-200 bg-white p-3 text-xs text-neutral-700 shadow-2xl transition-opacity duration-75 ${
                  rolesTooltipOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <p className="font-semibold text-neutral-900">Roles and permissions</p>
                <p className="mt-1">
                  <strong>Admin:</strong> Manage team members, edit brand details, update brand image, and manage content and analytics.
                </p>
                <p className="mt-1">
                  <strong>Editor:</strong> Add and edit content, view analytics, and collaborate with team members. Cannot manage brand settings or team access.
                </p>
                <p className="mt-1">
                  <strong>Viewer:</strong> Read-only access to analytics and content visibility. Cannot create, edit, publish, or manage settings.
                </p>
                <a
                  href={ROLE_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-semibold text-orange-700 underline hover:text-orange-800"
                >
                  Check all roles and permissions
                </a>
              </div>
            </div>
          </div>

          {members.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Members', value: members.length },
                { label: 'Admins', value: teamSummary.Admin },
                { label: 'Editors', value: teamSummary.Editor },
                { label: 'Pending', value: teamSummary.pending },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-neutral-200 bg-[var(--card-bg)] px-3 py-2">
                  <p className="text-lg font-bold text-neutral-900">{stat.value}</p>
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500">{stat.label}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {members.length === 0 ? (
              <p className="text-sm text-neutral-500">{loadingMembers ? 'Loading team members…' : 'No team members yet.'}</p>
            ) : (
              members.map((member) => {
                const since = formatDate(member.invitedAt);
                const lastActive = formatDate(member.lastActiveAt);
                const isExpanded = expandedMemberId === member.id;
                return (
                  <div
                    key={member.id}
                    className="team-member-row rounded-lg border border-neutral-200 bg-[var(--card-bg)] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-100 flex items-center justify-center">
                        <span className="text-xs font-semibold text-neutral-500">{(member.name || 'F').slice(0, 1).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">{member.name}</p>
                        <p className="truncate text-xs text-neutral-500">{member.email || 'No email'}</p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          member.status === 'active'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-amber-300 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {member.status === 'active' ? <CircleCheck size={11} /> : <Clock size={11} />}
                        {member.status === 'active' ? 'Active' : 'Invited'}
                      </span>
                      <select
                        value={member.role}
                        onChange={(e) => void handleChangeRole(member.id, e.target.value as BrandTeamRole)}
                        aria-label={`Role for ${member.name}`}
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[member.role]}`}
                      >
                        <option value="Admin">Admin</option>
                        <option value="Editor">Editor</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTeamMember(member.id)}
                        className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 text-[11px] text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {member.status === 'active'
                          ? lastActive
                            ? `Last active ${lastActive}`
                            : 'Active'
                          : since
                            ? `Invited ${since}`
                            : 'Invitation sent'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedMemberId(isExpanded ? null : member.id)}
                        className="inline-flex items-center gap-1 font-medium text-neutral-600 hover:text-neutral-900"
                      >
                        <Shield size={11} />
                        {isExpanded ? 'Hide permissions' : 'View permissions'}
                        <ChevronDown size={11} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {isExpanded ? (
                      <ul className="mt-2 ml-11 space-y-1 border-l border-neutral-200 pl-3 text-xs text-neutral-600">
                        {ROLE_PERMISSIONS[member.role].map((perm) => (
                          <li key={perm} className="flex items-start gap-1.5">
                            <Check size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                            <span>{perm}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newMemberFirstName}
              onChange={(e) => setNewMemberFirstName(e.target.value)}
              placeholder="First name"
              className="team-members-field min-w-0 flex-[1_1_160px] rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-900"
            />
            <input
              type="text"
              value={newMemberLastName}
              onChange={(e) => setNewMemberLastName(e.target.value)}
              placeholder="Last name"
              className="team-members-field min-w-0 flex-[1_1_160px] rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-900"
            />
            <input
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="Email"
              className="team-members-field min-w-0 flex-[1_1_180px] rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-900"
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value as BrandTeamRole)}
              className="team-members-field flex-[0_1_120px] rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-2 py-2 text-sm text-neutral-900"
            >
              <option value="Admin">Admin</option>
              <option value="Editor">Editor</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void handleAddTeamMember()}
              disabled={!newMemberFirstName.trim() || !newMemberLastName.trim() || !newMemberEmail.trim() || inviteSending}
              className="team-members-add-btn accent-orange-light-btn inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-[var(--card-bg)] px-3.5 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100/70 disabled:opacity-50"
            >
              <Plus size={14} />
              {inviteSending ? 'Sending...' : 'Add another team member'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
            Invitations are sent from <span className="font-semibold">noreply@agent4social.com</span>. If they cannot find it, ask them to check spam.
          </p>
          {inviteLink ? (
            <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
              Invitation link:{' '}
              <a href={inviteLink} target="_blank" rel="noopener noreferrer" className="underline text-neutral-600 hover:text-neutral-700 break-all">
                {inviteLink}
              </a>
            </p>
          ) : null}
          {inviteFeedback ? <p className="mt-2 text-xs text-emerald-600">{inviteFeedback}</p> : null}
          {inviteError ? <p className="mt-2 text-xs text-red-600">{inviteError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
