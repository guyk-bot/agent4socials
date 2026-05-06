'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import api from '@/lib/api';
import { ConnectedAccountsPanel } from '@/components/account/ConnectedAccountsPanel';
import {
  Trash2,
  Gift,
  X,
  AlertTriangle,
  Share2,
  Check,
  Copy,
  FileText,
  LogOut,
  Sparkles,
  ArrowRight,
  Plus,
  Image,
  MoreHorizontal,
  Users,
  Shield,
  PencilLine,
} from 'lucide-react';

const CONFIRM_TEXT = 'CONFIRM';
const SHARE_URL = 'https://agent4socials.com';
const SHARE_TEXT = 'Check out Agent4Socials: schedule posts and analytics for Instagram, YouTube, TikTok, Facebook and more.';

const sharePlatforms = [
  {
    name: 'WhatsApp',
    href: () => `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + ' ' + SHARE_URL)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.865 9.865 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    name: 'Telegram',
    href: () => `https://t.me/share/url?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.5 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    name: 'Email',
    href: () => `mailto:?subject=${encodeURIComponent('Agent4Socials')}&body=${encodeURIComponent(SHARE_TEXT + '\n\n' + SHARE_URL)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    name: 'X (Twitter)',
    href: () => `https://twitter.com/intent/tweet?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    name: 'LinkedIn',
    href: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`,
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
];

export default function AccountPage() {
  type TeamRole = 'Owner' | 'Admin' | 'Editor' | 'Viewer';
  type TeamMember = {
    id: string;
    name: string;
    email?: string;
    role: TeamRole;
    imageUrl?: string | null;
  };

  const router = useRouter();
  const { user, logout } = useAuth();
  const {
    brands,
    activeBrandId,
    setActiveBrandId,
    createBrand,
    renameBrand,
    deleteBrand,
    setBrandImage,
    allCachedAccounts,
    getAccountBrandId,
  } = useAccountsCache() ?? {
    brands: [],
    activeBrandId: '',
    setActiveBrandId: () => {},
    createBrand: () => '',
    renameBrand: () => {},
    deleteBrand: () => false,
    setBrandImage: () => {},
    allCachedAccounts: [],
    getAccountBrandId: () => 'brand-default',
  };
  const { clearSelection } = useSelectedAccount() ?? { clearSelection: () => {} };

  const [shareOpen, setShareOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [brandImageTargetId, setBrandImageTargetId] = useState<string | null>(null);
  const [createBrandModalOpen, setCreateBrandModalOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandImageUrl, setNewBrandImageUrl] = useState<string | null>(null);
  const [newBrandMembers, setNewBrandMembers] = useState<TeamMember[]>([]);
  const [newBrandMemberName, setNewBrandMemberName] = useState('');
  const [newBrandMemberEmail, setNewBrandMemberEmail] = useState('');
  const [newBrandMemberRole, setNewBrandMemberRole] = useState<TeamRole>('Editor');
  const [newBrandMemberImageUrl, setNewBrandMemberImageUrl] = useState<string | null>(null);
  const [createBrandInviteFeedback, setCreateBrandInviteFeedback] = useState('');
  const [createBrandInviteError, setCreateBrandInviteError] = useState('');
  const [createBrandInviteSending, setCreateBrandInviteSending] = useState(false);
  const [brandMenuOpenId, setBrandMenuOpenId] = useState<string | null>(null);
  const [editBrandModalOpen, setEditBrandModalOpen] = useState(false);
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingBrandName, setEditingBrandName] = useState('');
  const [deleteBrandModalOpen, setDeleteBrandModalOpen] = useState(false);
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteBrandError, setDeleteBrandError] = useState('');
  const [teamMembersByBrand, setTeamMembersByBrand] = useState<Record<string, TeamMember[]>>({});
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>('Editor');
  const [newMemberImageUrl, setNewMemberImageUrl] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string>('');
  const [inviteError, setInviteError] = useState<string>('');
  const [inviteSending, setInviteSending] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!brandMenuOpenId) return;
    const onDocClick = () => setBrandMenuOpenId(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [brandMenuOpenId]);
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('agent4socials_brand_team_members_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, TeamMember[]>;
      if (parsed && typeof parsed === 'object') setTeamMembersByBrand(parsed);
    } catch {
      // Ignore bad local data
    }
  }, [mounted]);
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    try {
      localStorage.setItem('agent4socials_brand_team_members_v1', JSON.stringify(teamMembersByBrand));
    } catch {
      // Ignore storage errors
    }
  }, [teamMembersByBrand, mounted]);

  const userId = user?.id ?? '';
  const copyUserId = () => {
    if (!userId) return;
    navigator.clipboard.writeText(userId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSharePlatform = (getHref: () => string) => {
    window.open(getHref(), '_blank', 'noopener,noreferrer,width=600,height=500');
    setShareOpen(false);
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Agent4Socials',
          text: SHARE_TEXT,
          url: SHARE_URL,
        });
        setShareOpen(false);
      } catch (err) {
        // User cancelled or error
      }
    }
    setShareOpen(false);
  };

  const canNativeShare = mounted && typeof navigator !== 'undefined' && !!navigator.share;

  const handleCancelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCancelModalOpen(true);
    setConfirmInput('');
    setCancelError('');
    setCancelSuccess(false);
  };

  const handleCancelClose = () => {
    setCancelModalOpen(false);
    setConfirmInput('');
    setCancelError('');
  };

  const handleConfirmCancel = () => {
    if (confirmInput.trim() !== CONFIRM_TEXT) {
      setCancelError(`Please type ${CONFIRM_TEXT} to confirm.`);
      return;
    }
    setCancelSuccess(true);
    setCancelModalOpen(false);
    setConfirmInput('');
    setCancelError('');
  };

  const cancelModal = cancelModalOpen && mounted && createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleCancelClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cancel subscription"
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleCancelClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900">Cancel subscription?</h3>
        </div>
        <p className="text-sm text-neutral-600 mb-4">
          You’ll lose access at the end of your current period. To confirm, type <strong>CONFIRM</strong> below.
        </p>
        <input
          type="text"
          value={confirmInput}
          onChange={(e) => {
            setConfirmInput(e.target.value.toUpperCase());
            setCancelError('');
          }}
          placeholder="Type CONFIRM"
          className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-sm"
          autoFocus
        />
        {cancelError && <p className="mt-2 text-sm text-red-600">{cancelError}</p>}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={handleCancelClose}
            className="flex-1 py-2.5 rounded-lg font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200"
          >
            Keep subscription
          </button>
          <button
            type="button"
            onClick={handleConfirmCancel}
            disabled={confirmInput.trim() !== CONFIRM_TEXT}
            className="flex-1 py-2.5 rounded-lg font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel subscription
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  const userIdShort = userId.length >= 7 ? userId.slice(0, 7) : userId;
  const editingBrand = brands.find((b) => b.id === editingBrandId) ?? null;
  const editingMembers = editingBrand ? (teamMembersByBrand[editingBrand.id] ?? []) : [];

  const openCreateBrandModal = () => {
    setNewBrandName('');
    setNewBrandImageUrl(null);
    setNewBrandMembers([]);
    setNewBrandMemberName('');
    setNewBrandMemberEmail('');
    setNewBrandMemberRole('Editor');
    setNewBrandMemberImageUrl(null);
    setCreateBrandInviteFeedback('');
    setCreateBrandInviteError('');
    setCreateBrandModalOpen(true);
  };

  const handleCreateBrand = () => {
    const trimmed = newBrandName.trim();
    if (!trimmed) return;
    const createdId = createBrand(trimmed, newBrandImageUrl);
    if (!createdId) return;
    if (newBrandMembers.length > 0) {
      setTeamMembersByBrand((prev) => ({ ...prev, [createdId]: newBrandMembers }));
    }
    clearSelection();
    setCreateBrandModalOpen(false);
    setNewBrandName('');
    router.push('/dashboard');
  };

  const handleAddNewBrandMember = async () => {
    const name = newBrandMemberName.trim();
    const email = newBrandMemberEmail.trim();
    if (!name) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      setCreateBrandInviteError('Enter a valid email or leave it empty.');
      return;
    }
    setCreateBrandInviteFeedback('');
    setCreateBrandInviteError('');
    const member: TeamMember = {
      id: `member-${Date.now().toString(36)}`,
      name,
      email: email || undefined,
      role: newBrandMemberRole,
      imageUrl: newBrandMemberImageUrl || null,
    };
    setNewBrandMembers((prev) => [...prev, member]);
    if (email) {
      setCreateBrandInviteSending(true);
      try {
        await api.post('/brands/invite-friend', {
          email,
          friendName: name,
          role: newBrandMemberRole,
          brandName: newBrandName.trim() || 'New brand',
        });
        setCreateBrandInviteFeedback(`Invite sent to ${email}.`);
      } catch (err) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setCreateBrandInviteError(message || 'Friend added, but invite email failed to send.');
      } finally {
        setCreateBrandInviteSending(false);
      }
    }
    setNewBrandMemberName('');
    setNewBrandMemberEmail('');
    setNewBrandMemberRole('Editor');
    setNewBrandMemberImageUrl(null);
  };

  const handleRemoveNewBrandMember = (memberId: string) => {
    setNewBrandMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const openEditBrandModal = (brandId: string) => {
    const brand = brands.find((b) => b.id === brandId);
    if (!brand) return;
    setEditingBrandId(brand.id);
    setEditingBrandName(brand.name);
    setEditBrandModalOpen(true);
    setBrandMenuOpenId(null);
  };

  const handleSaveBrandSettings = () => {
    if (!editingBrand) return;
    renameBrand(editingBrand.id, editingBrandName);
    setEditBrandModalOpen(false);
  };

  const openDeleteBrandModal = (brandId: string) => {
    setDeletingBrandId(brandId);
    setDeleteConfirmText('');
    setDeleteBrandError('');
    setDeleteBrandModalOpen(true);
    setBrandMenuOpenId(null);
  };

  const handleDeleteBrand = () => {
    if (!deletingBrandId) return;
    if (deleteConfirmText.trim().toLowerCase() !== 'delete') return;
    const targetBrandId = deletingBrandId;
    const deleted = deleteBrand(targetBrandId);
    if (!deleted) {
      setDeleteBrandError('Cannot delete this brand. Keep at least one brand workspace.');
      return;
    }
    setTeamMembersByBrand((prev) => {
      const next = { ...prev };
      delete next[targetBrandId];
      return next;
    });
    setDeleteBrandModalOpen(false);
    setDeletingBrandId(null);
    setDeleteConfirmText('');
    setDeleteBrandError('');
  };

  const handleAddTeamMember = async () => {
    if (!editingBrand) return;
    setInviteFeedback('');
    setInviteError('');
    const name = newMemberName.trim();
    const email = newMemberEmail.trim();
    if (!name) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      setInviteError('Enter a valid email or leave it empty.');
      return;
    }
    const friend: TeamMember = {
      id: `member-${Date.now().toString(36)}`,
      name,
      email: email || undefined,
      role: newMemberRole,
      imageUrl: newMemberImageUrl || null,
    };
    setTeamMembersByBrand((prev) => {
      const existing = prev[editingBrand.id] ?? [];
      return {
        ...prev,
        [editingBrand.id]: [...existing, friend],
      };
    });
    if (email) {
      setInviteSending(true);
      try {
        await api.post('/brands/invite-friend', {
          email,
          friendName: name,
          role: newMemberRole,
          brandName: editingBrand.name,
        });
        setInviteFeedback(`Invite sent to ${email}.`);
      } catch (err) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setInviteError(message || 'Friend added, but invite email failed to send.');
      } finally {
        setInviteSending(false);
      }
    } else {
      setInviteFeedback('Friend added without email invite.');
    }
    setNewMemberName('');
    setNewMemberEmail('');
    setNewMemberRole('Editor');
    setNewMemberImageUrl(null);
  };

  const handleDeleteTeamMember = (memberId: string) => {
    if (!editingBrand) return;
    setTeamMembersByBrand((prev) => {
      const existing = prev[editingBrand.id] ?? [];
      return {
        ...prev,
        [editingBrand.id]: existing.filter((m) => m.id !== memberId),
      };
    });
  };

  const createBrandModal = createBrandModalOpen && mounted && createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => setCreateBrandModalOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Create brand"
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-neutral-200 bg-[var(--card-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setCreateBrandModalOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold text-neutral-900">Create brand</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Brand name</label>
          <input
            type="text"
            value={newBrandName}
            onChange={(e) => setNewBrandName(e.target.value)}
            placeholder="Enter brand name"
            className="w-full rounded-xl border border-neutral-300 bg-[var(--background)] px-3 py-2.5 text-sm text-neutral-900"
            autoFocus
          />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Brand image</label>
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-[var(--background)] px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100/70">
              <Image size={14} />
              {newBrandImageUrl ? 'Change image' : 'Upload image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') setNewBrandImageUrl(reader.result);
                  };
                  reader.readAsDataURL(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-neutral-200 bg-[var(--background)] p-4">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-neutral-500" />
            <h4 className="text-sm font-semibold text-neutral-900">Employees & roles</h4>
          </div>
          <div className="mt-3 space-y-2">
            {newBrandMembers.length === 0 ? (
              <p className="text-sm text-neutral-500">No employees added yet.</p>
            ) : (
              newBrandMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-[var(--card-bg)] px-3 py-2">
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100 flex items-center justify-center">
                    {member.imageUrl ? (
                      <img src={member.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-neutral-500">
                        {(member.name || 'E').slice(0, 1).toUpperCase()}
                      </span>
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
                    onClick={() => handleRemoveNewBrandMember(member.id)}
                    className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto_auto]">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100/70">
              <Image size={14} />
              {newBrandMemberImageUrl ? 'Change image' : 'Employee image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') setNewBrandMemberImageUrl(reader.result);
                  };
                  reader.readAsDataURL(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <input
              type="text"
              value={newBrandMemberName}
              onChange={(e) => setNewBrandMemberName(e.target.value)}
              placeholder="Employee name"
              className="rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-900"
            />
            <input
              type="email"
              value={newBrandMemberEmail}
              onChange={(e) => setNewBrandMemberEmail(e.target.value)}
              placeholder="Email (optional)"
              className="rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-900"
            />
            <select
              value={newBrandMemberRole}
              onChange={(e) => setNewBrandMemberRole(e.target.value as TeamRole)}
              className="rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-2 py-2 text-sm text-neutral-900"
            >
              <option value="Owner">Owner</option>
              <option value="Admin">Admin</option>
              <option value="Editor">Editor</option>
              <option value="Viewer">Viewer</option>
            </select>
            <button
              type="button"
              onClick={handleAddNewBrandMember}
              disabled={!newBrandMemberName.trim() || createBrandInviteSending}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {createBrandInviteSending ? 'Sending...' : 'Add employee'}
            </button>
          </div>
          {createBrandInviteFeedback ? <p className="mt-2 text-xs text-emerald-600">{createBrandInviteFeedback}</p> : null}
          {createBrandInviteError ? <p className="mt-2 text-xs text-red-600">{createBrandInviteError}</p> : null}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setCreateBrandModalOpen(false)}
            className="flex-1 rounded-xl border border-neutral-300 bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateBrand}
            disabled={!newBrandName.trim()}
            className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Create brand
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  const deletingBrandName = brands.find((b) => b.id === deletingBrandId)?.name ?? 'this brand';
  const deleteBrandModal = deleteBrandModalOpen && mounted && createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => setDeleteBrandModalOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Delete brand"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-[var(--card-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setDeleteBrandModalOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold text-neutral-900">Delete brand</h3>
        <p className="mt-1 text-sm text-neutral-500">
          You are deleting <strong>{deletingBrandName}</strong>. This action cannot be undone.
        </p>
        <p className="mt-3 text-sm text-neutral-500">Type <strong>delete</strong> to confirm.</p>
        <input
          type="text"
          value={deleteConfirmText}
          onChange={(e) => {
            setDeleteConfirmText(e.target.value);
            setDeleteBrandError('');
          }}
          placeholder="type delete"
          className="mt-3 w-full rounded-xl border border-neutral-300 bg-[var(--background)] px-3 py-2.5 text-sm text-neutral-900"
          autoFocus
        />
        {deleteBrandError ? <p className="mt-2 text-xs text-red-600">{deleteBrandError}</p> : null}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setDeleteBrandModalOpen(false)}
            className="flex-1 rounded-xl border border-neutral-300 bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteBrand}
            disabled={deleteConfirmText.trim().toLowerCase() !== 'delete'}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Delete brand
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  const editBrandModal = editBrandModalOpen && editingBrand && mounted && createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => setEditBrandModalOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Edit brand settings"
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-neutral-200 bg-[var(--card-bg)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setEditBrandModalOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold text-neutral-900">Edit brand</h3>
        <p className="mt-1 text-sm text-neutral-500">Update brand details, image, and team roles.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Brand name</label>
            <input
              type="text"
              value={editingBrandName}
              onChange={(e) => setEditingBrandName(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-[var(--background)] px-3 py-2.5 text-sm text-neutral-900"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Brand image</label>
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-[var(--background)] px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100/70">
              <Image size={14} />
              Upload image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file || !editingBrand) return;
                  setBrandImageTargetId(editingBrand.id);
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') setBrandImage(editingBrand.id, reader.result);
                    setBrandImageTargetId(null);
                  };
                  reader.readAsDataURL(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-neutral-200 bg-[var(--background)] p-4">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-neutral-500" />
            <h4 className="text-sm font-semibold text-neutral-900">Team members & roles</h4>
          </div>
          <div className="mt-3 space-y-2">
            {editingMembers.length === 0 ? (
              <p className="text-sm text-neutral-500">No team members yet.</p>
            ) : (
              editingMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-[var(--card-bg)] px-3 py-2">
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100 flex items-center justify-center">
                    {member.imageUrl ? (
                      <img src={member.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-neutral-500">
                        {(member.name || 'F').slice(0, 1).toUpperCase()}
                      </span>
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

          <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto_auto]">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100/70">
              <Image size={14} />
              {newMemberImageUrl ? 'Change image' : 'Friend image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') setNewMemberImageUrl(reader.result);
                  };
                  reader.readAsDataURL(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="Friend name"
              className="rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-900"
            />
            <input
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="Email (optional)"
              className="rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-3 py-2 text-sm text-neutral-900"
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value as TeamRole)}
              className="rounded-lg border border-neutral-300 bg-[var(--card-bg)] px-2 py-2 text-sm text-neutral-900"
            >
              <option value="Owner">Owner</option>
              <option value="Admin">Admin</option>
              <option value="Editor">Editor</option>
              <option value="Viewer">Viewer</option>
            </select>
            <button
              type="button"
              onClick={handleAddTeamMember}
              disabled={!newMemberName.trim() || inviteSending}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {inviteSending ? 'Sending...' : 'Add friend'}
            </button>
          </div>
          {inviteFeedback ? <p className="mt-2 text-xs text-emerald-600">{inviteFeedback}</p> : null}
          {inviteError ? <p className="mt-2 text-xs text-red-600">{inviteError}</p> : null}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setEditBrandModalOpen(false)}
            className="flex-1 rounded-xl border border-neutral-300 bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveBrandSettings}
            disabled={!editingBrandName.trim()}
            className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* Profile + plan + connected accounts (#connected-accounts for legacy redirects) */}
      <div className="card rounded-2xl overflow-hidden border border-neutral-200/80 shadow-sm">
        <div className="p-4 sm:p-6 space-y-5">
          {/* Plan row at top of card (matches analytics upgrade styling) */}
          <div className="w-full rounded-2xl border upgrade-banner-warm px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm ring-1 ring-slate-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 upgrade-badge-warm">
                <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-wide">Your plan</span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="text-lg font-bold text-neutral-900 tracking-tight leading-tight">Free</span>
                <span className="text-sm text-neutral-600 leading-snug">
                  More networks, scheduling, and analytics when you upgrade.
                </span>
              </div>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] gradient-cta-pro"
            >
              Upgrade now
              <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Account</h1>

          <div className="flex items-start gap-4 min-w-0 pt-0">
            <div className="flex items-stretch w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-neutral-100 text-neutral-700">
              <span className="flex flex-1 min-h-0 min-w-0 items-center justify-center text-xl font-bold leading-none">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-neutral-900 truncate">{user?.name || 'User'}</p>
              <p className="text-sm text-neutral-500 truncate">{user?.email}</p>
              {userId ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 text-xs text-neutral-600">
                  <span className="text-neutral-500">User ID:</span>
                  <code className="font-mono text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded">{userIdShort}</code>
                  <button
                    type="button"
                    onClick={copyUserId}
                    className="p-1 text-neutral-500 hover:text-orange-800 hover:bg-orange-50 rounded transition-colors"
                    title="Copy full User ID"
                  >
                    {copiedId ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="brand-section-frame rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight">Brands</h2>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {brands.map((brand) => {
                const isActive = brand.id === activeBrandId;
                const mappedCount = allCachedAccounts.filter((a) => getAccountBrandId(a.id) === brand.id).length;
                return (
                  <div
                    key={brand.id}
                    className={`brand-section-box rounded-xl border p-3 sm:p-4 ${isActive ? 'bg-white' : 'sidebar-item-selected'}`}
                    style={{ borderColor: 'rgba(15,23,42,0.08)' }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100 flex items-center justify-center">
                        {brand.imageUrl ? (
                          <img src={brand.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-neutral-500">
                            {(brand.name || 'B').slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-neutral-900">{brand.name}</p>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBrandMenuOpenId((prev) => (prev === brand.id ? null : brand.id));
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100"
                              aria-label="Brand actions"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {brandMenuOpenId === brand.id ? (
                              <div
                                className="absolute right-0 top-8 z-20 min-w-36 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => openEditBrandModal(brand.id)}
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                                >
                                  <PencilLine size={12} />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDeleteBrandModal(brand.id)}
                                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={12} />
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">{mappedCount} connected accounts</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveBrandId(brand.id);
                              clearSelection();
                              router.push('/dashboard');
                            }}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                              isActive
                                ? 'bg-neutral-900 text-white'
                                : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                            }`}
                          >
                            Open dashboard
                          </button>
                          {brandImageTargetId === brand.id ? (
                            <span className="text-xs text-neutral-500">Uploading...</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={openCreateBrandModal}
                className="brand-section-box sidebar-item-selected rounded-xl border border-dashed border-neutral-300 p-3 sm:p-4 text-left hover:border-neutral-400 transition-colors"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
                  <Plus size={18} />
                </div>
                <p className="mt-3 text-sm font-semibold text-neutral-900">Add brand</p>
                <p className="mt-0.5 text-xs text-neutral-500">Create another brand workspace.</p>
              </button>
            </div>
          </div>
        </div>

        <div id="connected-accounts" className="border-t border-neutral-200 px-4 sm:px-6 py-5 scroll-mt-28 space-y-3">
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Connected accounts</h2>
          <ConnectedAccountsPanel />
        </div>
      </div>

      {/* Log out */}
      <div className="card rounded-2xl border border-neutral-200 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-neutral-100 shrink-0">
              <LogOut className="w-5 h-5 text-neutral-600" />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-900">Log out</h2>
              <p className="text-sm text-neutral-500">Sign out of your account on this device.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium text-neutral-700 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>

      {/* Billing & Invoices */}
      <div className="card rounded-2xl border border-neutral-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-neutral-100 shrink-0">
            <FileText className="w-5 h-5 text-neutral-600" />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">Billing & invoices</h2>
            <p className="text-sm text-neutral-500">View and download your invoices.</p>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                <th className="text-left py-3 px-4 font-medium text-neutral-600">Date</th>
                <th className="text-left py-3 px-4 font-medium text-neutral-600">Description</th>
                <th className="text-right py-3 px-4 font-medium text-neutral-600">Amount</th>
                <th className="text-right py-3 px-4 font-medium text-neutral-600 w-24">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {/* Invoices will be loaded from API when billing is connected */}
              <tr>
                <td colSpan={4} className="py-8 px-4 text-center text-neutral-500">
                  No invoices yet. Invoices will appear here once you have billing history.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Share with a friend */}
      <div className="card rounded-2xl border border-neutral-200 bg-gradient-to-b from-emerald-50/50 to-white shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-emerald-100 shrink-0">
            <Gift className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">Share with a friend</h2>
            <p className="text-sm text-neutral-500">Share Agent4Socials on your favorite app, one tap to share the link.</p>
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShareOpen(!shareOpen)}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
          >
            <Share2 className="w-5 h-5" />
            Share
          </button>
          {shareOpen && (
            <>
              <div className="absolute left-0 right-0 top-full mt-2 p-3 rounded-xl border border-neutral-200 bg-white shadow-xl z-50">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-3">Share via</p>
                <div className="flex flex-wrap gap-2">
                  {sharePlatforms.map((platform) => (
                    <button
                      key={platform.name}
                      type="button"
                      onClick={() => handleSharePlatform(platform.href)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-colors text-neutral-700"
                      title={platform.name}
                    >
                      <span className="text-neutral-500">{platform.icon()}</span>
                      <span className="text-sm font-medium">{platform.name}</span>
                    </button>
                  ))}
                  {canNativeShare && (
                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-colors text-neutral-700"
                      title="More options"
                    >
                      <Share2 className="w-5 h-5 text-neutral-500" />
                      <span className="text-sm font-medium">More</span>
                    </button>
                  )}
                </div>
              </div>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShareOpen(false)}
                aria-hidden="true"
              />
            </>
          )}
        </div>
      </div>

      {/* Cancel subscription */}
      <div className="card rounded-2xl border border-red-200/80 bg-red-50/40 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-red-100 shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-neutral-900">Cancel subscription</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              You’ll keep access until the end of your billing period.
            </p>
            {cancelSuccess ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-600">
                <Check className="w-4 h-4" /> Cancellation requested
              </p>
            ) : (
              <button
                type="button"
                onClick={handleCancelClick}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
              >
                Cancel subscription
              </button>
            )}
          </div>
        </div>
      </div>

      {cancelModal}
      {createBrandModal}
      {editBrandModal}
      {deleteBrandModal}
    </div>
  );
}
