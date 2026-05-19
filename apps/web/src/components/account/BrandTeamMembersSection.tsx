'use client';

import React, { useEffect, useState } from 'react';
import { Users, HelpCircle, Plus, Shield } from 'lucide-react';
import api from '@/lib/api';

const ROLE_GUIDE_URL = '/help/roles-permissions';

export type BrandTeamRole = 'Admin' | 'Editor' | 'Viewer';

export type BrandTeamMember = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: BrandTeamRole;
  imageUrl?: string | null;
};

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
  const members = selectedBrand ? (teamMembersByBrand[selectedBrand.id] ?? []) : [];

  const handleAddTeamMember = async () => {
    if (!selectedBrand) return;
    setInviteFeedback('');
    setInviteError('');
    setInviteLink('');
    const firstName = newMemberFirstName.trim();
    const lastName = newMemberLastName.trim();
    const name = `${firstName} ${lastName}`.trim();
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
    const friend: BrandTeamMember = {
      id: `member-${Date.now().toString(36)}`,
      firstName,
      lastName,
      name,
      email,
      role: newMemberRole,
      imageUrl: null,
    };
    setTeamMembersByBrand((prev) => {
      const existing = prev[selectedBrand.id] ?? [];
      return {
        ...prev,
        [selectedBrand.id]: [...existing, friend],
      };
    });
    setInviteSending(true);
    try {
      const response = await api.post('/brands/invite-friend', {
        email,
        friendName: name,
        role: newMemberRole,
        brandName: selectedBrand.name,
      });
      const generatedLink = String(response?.data?.inviteLink || '');
      setInviteLink(generatedLink);
      setInviteFeedback(`Invite sent to ${email}. If they cannot find it, ask them to check spam.`);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setInviteError(message || 'Team member added, but invite email failed to send.');
    } finally {
      setInviteSending(false);
    }
    setNewMemberFirstName('');
    setNewMemberLastName('');
    setNewMemberEmail('');
    setNewMemberRole('Editor');
  };

  const handleDeleteTeamMember = (memberId: string) => {
    if (!selectedBrand) return;
    setTeamMembersByBrand((prev) => {
      const existing = prev[selectedBrand.id] ?? [];
      return {
        ...prev,
        [selectedBrand.id]: existing.filter((m) => m.id !== memberId),
      };
    });
  };

  return (
    <div className="team-members-frame rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4 sm:p-5 shadow-sm space-y-4">
      <div className="space-y-2">
        <label htmlFor="team-brand-select" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Brand
        </label>
        <select
          id="team-brand-select"
          value={selectedBrandId}
          onChange={(e) => {
            setSelectedBrandId(e.target.value);
            setInviteFeedback('');
            setInviteError('');
            setInviteLink('');
          }}
          disabled={!brands.length}
          className="team-members-field w-full max-w-md rounded-xl border border-neutral-300 bg-[var(--background)] px-3 py-2.5 text-sm text-neutral-900"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {!brands.length ? <p className="text-sm text-neutral-500">Create a brand above to add team members.</p> : null}
      </div>

      {selectedBrand ? (
        <div className="team-members-inner rounded-xl border border-neutral-200 bg-[var(--background)] p-4">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-neutral-500" />
            <h3 className="text-sm font-semibold text-neutral-900">Team members & roles</h3>
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
          <div className="mt-3 space-y-2">
            {members.length === 0 ? (
              <p className="text-sm text-neutral-500">No team members yet.</p>
            ) : (
              members.map((member) => (
                <div key={member.id} className="team-member-row flex items-center gap-2 rounded-lg border border-neutral-200 bg-[var(--card-bg)] px-3 py-2">
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100 flex items-center justify-center">
                    {member.imageUrl ? (
                      <img src={member.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-neutral-500">{(member.name || 'F').slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">{member.name}</p>
                    <p className="truncate text-xs text-neutral-500">{member.email || 'No email'}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700">
                    <Shield size={11} />
                    {member.role}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteTeamMember(member.id)}
                    className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))
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
              className="team-members-add-btn inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-[var(--card-bg)] px-3.5 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100/70 disabled:opacity-50"
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
