'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Link2, Plus, Trash2, GripVertical, Eye, Copy, Check, 
  Image as ImageIcon, Palette, Type, ExternalLink, Save, Loader2, Upload,
  Instagram, Facebook, Youtube, Twitter, Linkedin, Github, Globe, Mail, Music2
} from 'lucide-react';
import api from '@/lib/api';
import { LinkPageRenderer } from '@/components/smart-links/LinkPageRenderer';
import { THEME_PRESETS, FONT_OPTIONS, type LinkPageDesign } from '@/components/smart-links/themes';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';

type LinkItem = {
  id: string;
  type: string;
  label?: string | null;
  url?: string | null;
  icon?: string | null;
  order: number;
  isVisible: boolean;
};

type LinkPageData = {
  id?: string;
  slug: string;
  title?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  design?: LinkPageDesign | null;
  links: LinkItem[];
  isPublished?: boolean;
};

const SOCIAL_OPTIONS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram },
  { id: 'facebook', name: 'Facebook', icon: Facebook },
  { id: 'youtube', name: 'YouTube', icon: Youtube },
  { id: 'twitter', name: 'X (Twitter)', icon: Twitter },
  { id: 'tiktok', name: 'TikTok', icon: Music2 },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin },
  { id: 'github', name: 'GitHub', icon: Github },
  { id: 'website', name: 'Website', icon: Globe },
  { id: 'email', name: 'Email', icon: Mail },
];

const DRAFT_KEY = 'smart-links-draft';

/** Dedupe links by (order, type, label, url, icon) when sending to server. */
function dedupeLinksForSend(links: LinkItem[]): LinkItem[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const key = `${l.order}\t${l.type}\t${l.label ?? ''}\t${l.url ?? ''}\t${(l.icon ?? '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Dedupe links by id when applying server response. */
function dedupeLinksById(links: LinkItem[]): LinkItem[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const id = String(l.id ?? '');
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Dedupe links by content (type, label, url, icon) and re-assign order. Use when applying server data so we never show duplicate elements. */
function dedupeLinksByContent(links: LinkItem[]): LinkItem[] {
  const seen = new Set<string>();
  return links
    .filter((l) => {
      const key = `${l.type}\t${l.label ?? ''}\t${l.url ?? ''}\t${(l.icon ?? '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((l, i) => ({ ...l, order: i }));
}

function getDefaultData(): LinkPageData {
  return {
    slug: '',
    title: '',
    bio: '',
    avatarUrl: '',
    design: THEME_PRESETS[0].design,
    links: [],
  };
}

function readDraft(): LinkPageData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LinkPageData;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...getDefaultData(),
      ...parsed,
      design: parsed.design && Object.keys(parsed.design).length > 0 ? { ...THEME_PRESETS[0].design, ...parsed.design } : THEME_PRESETS[0].design,
      links: Array.isArray(parsed.links) ? parsed.links : [],
    };
  } catch {
    return null;
  }
}

function writeDraft(data: LinkPageData) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {}
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export default function SmartLinksPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'links' | 'design'>('links');
  const [data, setData] = useState<LinkPageData>(() => readDraft() || getDefaultData());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<{ linkPage: LinkPageData | null }>('/smart-links');
        if (cancelled) return;
        if (res.data.linkPage) {
          const server = res.data.linkPage;
          const serverLinks = Array.isArray(server.links) ? server.links : [];
          const localNewLinks = dataRef.current.links.filter((l) => String(l.id).startsWith('new-'));
          const uniqueServerLinks = dedupeLinksByContent(dedupeLinksById(serverLinks));
          const mergedLinks = [...uniqueServerLinks, ...localNewLinks];
          setData({
            ...server,
            design: server.design && Object.keys(server.design).length > 0 ? { ...THEME_PRESETS[0].design, ...server.design } : THEME_PRESETS[0].design,
            links: mergedLinks,
          });
          clearDraft();
          setSaveError(null);
        } else {
          const draft = readDraft();
          if (draft && (draft.title || draft.bio || draft.slug || (draft.links && draft.links.length > 0))) setData(draft);
        }
      } catch (e) {
        if (cancelled) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          await new Promise((r) => setTimeout(r, 400));
          try {
            const retry = await api.get<{ linkPage: LinkPageData | null }>('/smart-links');
            if (cancelled) return;
            if (retry.data.linkPage) {
              const server = retry.data.linkPage;
              const serverLinks = Array.isArray(server.links) ? server.links : [];
              const localNewLinks = dataRef.current.links.filter((l) => String(l.id).startsWith('new-'));
              const uniqueServerLinks = dedupeLinksByContent(dedupeLinksById(serverLinks));
              const mergedLinks = [...uniqueServerLinks, ...localNewLinks];
              setData({ ...server, design: server.design && Object.keys(server.design).length > 0 ? { ...THEME_PRESETS[0].design, ...server.design } : THEME_PRESETS[0].design, links: mergedLinks });
              clearDraft();
              setSaveError(null);
            } else {
              const draft = readDraft();
              if (draft && (draft.title || draft.bio || draft.slug || (draft.links && draft.links.length > 0))) setData(draft);
            }
          } catch {
            const draft = readDraft();
            if (draft && (draft.title || draft.bio || draft.slug || (draft.links && draft.links.length > 0))) setData(draft);
            console.error('Failed to load smart links:', e);
          }
        } else {
          const draft = readDraft();
          if (draft && (draft.title || draft.bio || draft.slug || (draft.links && draft.links.length > 0))) setData(draft);
          console.error('Failed to load smart links:', e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [uploadingIconFor, setUploadingIconFor] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ linkId: string; type: 'carousel' | 'image' | 'icon' | 'social'; platform?: string } | null>(null);

  async function uploadFile(file: File): Promise<string> {
    const res = await api.post<{ uploadUrl: string; fileUrl: string }>('/media/upload-url', {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
    });
    const { uploadUrl, fileUrl } = res.data;
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    return fileUrl;
  }

  // Load selected font in preview (Google Fonts)
  useEffect(() => {
    const family = data.design?.fontFamily ?? FONT_OPTIONS[0].family;
    const name = family.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!name) return;
    const id = 'smart-links-font';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    const fontParam = name.replace(/\s+/g, '+');
    const href = `https://fonts.googleapis.com/css2?family=${fontParam}:wght@400;600;700&display=swap`;
    if (link) {
      if (link.getAttribute('href') !== href) {
        link.href = href;
      }
      return;
    }
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    return () => {
      link?.parentNode?.removeChild(link);
    };
  }, [data.design?.fontFamily]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const linksToSend = dedupeLinksForSend(data.links);
      const res = await api.post<{ linkPage: LinkPageData }>('/smart-links', {
        slug: data.slug,
        title: data.title,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
        design: data.design,
        links: linksToSend,
        isPublished: true,
      });
      if (res.data.linkPage) {
        const server = res.data.linkPage;
        const serverLinks = Array.isArray(server.links) ? server.links : [];
        setData({
          ...server,
          design: server.design && Object.keys(server.design).length > 0 ? { ...THEME_PRESETS[0].design, ...server.design } : THEME_PRESETS[0].design,
          links: dedupeLinksByContent(dedupeLinksById(serverLinks)),
        });
        clearDraft();
      }
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { message?: string; error?: string } }; message?: string };
      const body = ax.response?.data;
      const msg =
        (typeof body?.message === 'string' && body.message) ||
        (typeof body?.error === 'string' && body.error) ||
        (ax.response?.status === 401 && 'Please log in again.') ||
        (ax.response?.status === 409 && 'This username is already taken.') ||
        (ax.response?.status === 400 && 'Invalid username or request. Check the username (2–30 letters, numbers, underscores).') ||
        (ax.response?.status && `Save failed (${ax.response.status}). Try again.`) ||
        ax.message ||
        'Failed to save';
      setSaveError(msg);
      console.error('Smart Links save error:', ax.response?.data ?? e);
    } finally {
      setSaving(false);
    }
  }, [data]);

  const dataRef = useRef(data);
  dataRef.current = data;

  // Serialized signatures so effects only re-run when content actually changes (not on new object refs from setData(server)).
  const designSig = JSON.stringify(data.design ?? {});
  const linksSig = JSON.stringify(data.links ?? []);

  // Persist draft to sessionStorage so edits survive refresh/remount until save.
  useEffect(() => {
    const t = setTimeout(() => writeDraft(dataRef.current), 500);
    return () => clearTimeout(t);
  }, [data.slug, data.title, data.bio, data.avatarUrl, designSig, linksSig]);

  // Auto-save when data changes (debounced) — fire and forget, NEVER updates local state.
  // Only the Save button applies server responses so editing is never interrupted.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const d = dataRef.current;
      const hasContent = d.title || d.bio || d.avatarUrl || (d.links && d.links.length > 0) || (d.design && Object.keys(d.design).length > 0);
      if (!hasContent) return;
      api.post('/smart-links', {
        slug: d.slug || undefined,
        title: d.title,
        bio: d.bio,
        avatarUrl: d.avatarUrl,
        design: d.design,
        links: dedupeLinksForSend(d.links),
        isPublished: true,
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timeout);
  }, [data.slug, data.title, data.bio, data.avatarUrl, designSig, linksSig]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const d = dataRef.current;
        const hasContent = d.title || d.bio || d.avatarUrl || (d.links && d.links.length > 0) || (d.design && Object.keys(d.design).length > 0);
        if (!hasContent) return;
        api.post('/smart-links', {
          slug: d.slug || undefined,
          title: d.title,
          bio: d.bio,
          avatarUrl: d.avatarUrl,
          design: d.design,
          links: dedupeLinksForSend(d.links),
          isPublished: true,
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const handleCopyLink = useCallback(() => {
    if (data.slug) {
      navigator.clipboard.writeText(`https://a4s.bio/@${data.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data.slug]);

  const addLink = useCallback((type: string = 'link') => {
    const newLink: LinkItem = {
      id: `new-${Date.now()}`,
      type,
      label: type === 'header' ? 'Section Title' : '',
      url: type === 'socials' ? '{}' : '',
      icon: type === 'carousel' ? '[]' : null,
      order: data.links.length,
      isVisible: true,
    };
    setData((prev) => ({ ...prev, links: [...prev.links, newLink] }));
  }, [data.links.length]);

  const updateLink = useCallback((id: string, updates: Partial<LinkItem>) => {
    setData((prev) => ({
      ...prev,
      links: prev.links.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
  }, []);

  const deleteLink = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      links: prev.links.filter((l) => l.id !== id),
    }));
  }, []);

  const moveLink = useCallback((id: string, direction: 'up' | 'down') => {
    setData((prev) => {
      const links = [...prev.links];
      const idx = links.findIndex((l) => l.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= links.length) return prev;
      [links[idx], links[newIdx]] = [links[newIdx], links[idx]];
      return { ...prev, links: links.map((l, i) => ({ ...l, order: i })) };
    });
  }, []);

  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, linkId: string) => {
    e.dataTransfer.setData('text/plain', linkId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toLinkId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const fromId = e.dataTransfer.getData('text/plain');
    if (!fromId || fromId === toLinkId) return;
    setData((prev) => {
      const links = [...prev.links].sort((a, b) => a.order - b.order);
      const fromIdx = links.findIndex((l) => l.id === fromId);
      const toIdx = links.findIndex((l) => l.id === toLinkId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [removed] = links.splice(fromIdx, 1);
      links.splice(toIdx, 0, removed);
      return { ...prev, links: links.map((l, i) => ({ ...l, order: i })) };
    });
  }, []);

  const updateDesign = useCallback((updates: Partial<LinkPageDesign>) => {
    setData((prev) => ({
      ...prev,
      design: { ...(prev.design || {}), ...updates },
    }));
  }, []);

  const applyTheme = useCallback((themeId: string) => {
    const theme = THEME_PRESETS.find((t) => t.id === themeId);
    if (theme) {
      setData((prev) => ({ ...prev, design: theme.design }));
    }
  }, []);

  if (loading) {
    return (
      <>
        <LoadingVideoOverlay loading={true} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 min-h-[calc(100vh-80px)]">
      {/* Editor Panel */}
      <div className="flex-1 max-w-2xl">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
                <Link2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">Smart Links</h1>
                <p className="text-xs text-slate-500">Create your link-in-bio page</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[var(--button)] text-white rounded-lg font-medium text-sm hover:bg-[var(--button-hover)] transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>

          {/* URL Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">a4s.bio/@</span>
              <input
                type="text"
                value={data.slug}
                onChange={(e) => {
                  setSaveError(null);
                  setData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }));
                }}
                placeholder="username"
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
              />
              <button
                onClick={handleCopyLink}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                title="Copy link"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
              </button>
              {data.slug && (
                <a
                  href={`/@${data.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Preview"
                >
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                </a>
              )}
            </div>
            {saveError && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {saveError}
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setActiveTab('links')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'links' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Link2 className="w-4 h-4 inline mr-2" />
              Links
            </button>
            <button
              onClick={() => setActiveTab('design')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'design' ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Palette className="w-4 h-4 inline mr-2" />
              Design
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-5 max-h-[60vh] overflow-y-auto">
            {activeTab === 'links' && (
              <div className="space-y-6">
                {/* Profile Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-700">Profile</h3>
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full bg-slate-100 overflow-hidden border-2 border-slate-200 flex-shrink-0">
                        {data.avatarUrl ? (
                          <img src={data.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <ImageIcon className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setAvatarUploading(true);
                          try {
                            const url = await uploadFile(file);
                            setData((prev) => ({ ...prev, avatarUrl: url }));
                          } catch {
                            console.error('Avatar upload failed');
                          } finally {
                            setAvatarUploading(false);
                            e.target.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[var(--button)] text-white flex items-center justify-center shadow hover:bg-[var(--button-hover)] disabled:opacity-50"
                        title="Upload profile photo (recommended: 400×400px square)"
                      >
                        {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex-1 space-y-3 min-w-0">
                      <p className="text-xs text-slate-500">Recommended: 400×400px square. Upload above.</p>
                      <input
                        type="text"
                        value={data.title || ''}
                        onChange={(e) => setData((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Display Name"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[var(--primary)]/30"
                      />
                      <textarea
                        value={data.bio || ''}
                        onChange={(e) => setData((prev) => ({ ...prev, bio: e.target.value }))}
                        placeholder="Bio (optional)"
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      />
                      {data.avatarUrl && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-600">Resize to fit</label>
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.1}
                            value={data.design?.avatarScale ?? 1}
                            onChange={(e) => updateDesign({ avatarScale: parseFloat(e.target.value) })}
                            className="w-full h-2 rounded-lg appearance-none bg-slate-200 accent-[var(--primary)]"
                          />
                          <p className="text-xs text-slate-400">
                            {(Math.round((data.design?.avatarScale ?? 1) * 100)).toString()}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Links List */}
                <div className="space-y-3">
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      const target = uploadTargetRef.current;
                      if (!file || !target) return;
                      try {
                        const url = await uploadFile(file);
                        if (target.type === 'carousel') {
                          setData((prev) => {
                            const link = prev.links.find((l) => l.id === target.linkId);
                            if (!link || link.type !== 'carousel') return prev;
                            let arr: string[] = [];
                            try {
                              if (link.icon && typeof link.icon === 'string' && link.icon.startsWith('[')) {
                                arr = JSON.parse(link.icon) as string[];
                              }
                            } catch {}
                            arr.push(url);
                            return {
                              ...prev,
                              links: prev.links.map((l) =>
                                l.id === target.linkId ? { ...l, icon: JSON.stringify(arr) } : l
                              ),
                            };
                          });
                        } else if (target.type === 'social') {
                          setData((prev) => {
                            const link = prev.links.find((l) => l.id === target.linkId);
                            if (!link || link.type !== 'socials' || !target.platform) return prev;
                            let iconJson: Record<string, string> = {};
                            try {
                              if (link.icon && typeof link.icon === 'string' && link.icon.startsWith('{')) {
                                iconJson = JSON.parse(link.icon) as Record<string, string>;
                              }
                            } catch {}
                            iconJson[target.platform] = url;
                            return {
                              ...prev,
                              links: prev.links.map((l) =>
                                l.id === target.linkId ? { ...l, icon: JSON.stringify(iconJson) } : l
                              ),
                            };
                          });
                        } else {
                          updateLink(target.linkId, { icon: url });
                        }
                      } catch {
                        console.error('Upload failed');
                      } finally {
                        setUploadingIconFor(null);
                        uploadTargetRef.current = null;
                        e.target.value = '';
                      }
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Links</h3>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => addLink('link')}
                        className="px-3 py-1.5 bg-[var(--primary)]/15 text-[var(--primary)] rounded-lg text-xs font-medium hover:bg-[var(--primary)]/25 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Link
                      </button>
                      <button
                        onClick={() => addLink('image')}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1"
                        title="Recommended: 16:9 ratio (e.g. 1920×1080px or 1080×608px)"
                      >
                        <ImageIcon className="w-3 h-3" /> Image
                      </button>
                      <button
                        onClick={() => addLink('carousel')}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1"
                        title="Recommended: 16:9 ratio per image (e.g. 1920×1080px or 1080×608px)"
                      >
                        <ImageIcon className="w-3 h-3" /> Carousel
                      </button>
                      <button
                        onClick={() => addLink('socials')}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1"
                      >
                        <Globe className="w-3 h-3" /> Social icons
                      </button>
                      <button
                        onClick={() => addLink('header')}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1"
                      >
                        <Type className="w-3 h-3" /> Header
                      </button>
                    </div>
                  </div>

                  {data.links.some((l) => l.type === 'carousel') && (
                    <div className="space-y-2 py-2 px-3 bg-[var(--primary)]/10 rounded-xl border border-[var(--primary)]/20">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-700">Carousel auto-advance</label>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={data.design?.carouselAutoplay !== false}
                          onClick={() => updateDesign({ carouselAutoplay: data.design?.carouselAutoplay === false })}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${data.design?.carouselAutoplay !== false ? 'bg-[var(--button)]' : 'bg-slate-200'}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${data.design?.carouselAutoplay !== false ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                        </button>
                      </div>
                      {data.design?.carouselAutoplay !== false && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-slate-600">Advance every</label>
                          <select
                            value={String(data.design?.carouselIntervalSeconds ?? 1.5)}
                            onChange={(e) => updateDesign({ carouselIntervalSeconds: parseFloat(e.target.value) })}
                            className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
                          >
                            <option value="1">1 sec</option>
                            <option value="1.5">1.5 sec</option>
                            <option value="2">2 sec</option>
                            <option value="2.5">2.5 sec</option>
                            <option value="3">3 sec</option>
                            <option value="4">4 sec</option>
                            <option value="5">5 sec</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {data.links.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      No links yet. Add your first link above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...data.links].sort((a, b) => a.order - b.order).map((link, index) => (
                        <div
                          key={`link-${index}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, link.id)}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverId(link.id); }}
                          onDragLeave={() => setDragOverId(null)}
                          onDrop={(e) => handleDrop(e, link.id)}
                          className={`flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 group transition-colors ${dragOverId === link.id ? 'ring-2 ring-[var(--primary)] bg-[var(--primary)]/15' : ''}`}
                        >
                          <GripVertical className="w-4 h-4 text-slate-300 cursor-grab shrink-0" />
                          {link.type === 'header' ? (
                            <input
                              type="text"
                              value={link.label || ''}
                              onChange={(e) => updateLink(link.id, { label: e.target.value })}
                              placeholder="Section title"
                              className="flex-1 px-2 py-1 bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            />
                          ) : link.type === 'image' ? (
                            <div className="flex-1 space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadingIconFor(link.id);
                                    uploadTargetRef.current = { linkId: link.id, type: 'image' };
                                    iconInputRef.current?.click();
                                  }}
                                  disabled={uploadingIconFor === link.id}
                                  className="shrink-0 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs hover:bg-slate-50 flex items-center gap-1"
                                >
                                  {uploadingIconFor === link.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                  Photo
                                </button>
                                <input
                                  type="text"
                                  value={link.label || ''}
                                  onChange={(e) => updateLink(link.id, { label: e.target.value })}
                                  placeholder="Caption (optional)"
                                  className="flex-1 min-w-[80px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                                />
                                <input
                                  type="text"
                                  value={link.url || ''}
                                  onChange={(e) => updateLink(link.id, { url: e.target.value })}
                                  placeholder="Link URL"
                                  className="flex-1 min-w-[80px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                                />
                              </div>
                              <p className="text-xs text-slate-500">Recommended: 16:9 ratio, e.g. 1920×1080px or 1080×608px.</p>
                            </div>
                          ) : link.type === 'carousel' ? (
                            <div className="flex-1 space-y-2 min-w-0">
                              <p className="text-xs text-slate-500">Recommended: 16:9 ratio per image, e.g. 1920×1080px or 1080×608px.</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadingIconFor(link.id);
                                    uploadTargetRef.current = { linkId: link.id, type: 'carousel' };
                                    iconInputRef.current?.click();
                                  }}
                                  disabled={uploadingIconFor === link.id}
                                  className="shrink-0 px-2 py-1 bg-[var(--primary)]/15 text-[var(--primary)] rounded-lg text-xs font-medium hover:bg-[var(--primary)]/25 flex items-center gap-1"
                                >
                                  {uploadingIconFor === link.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                  Add image
                                </button>
                                <input
                                  type="text"
                                  value={link.label || ''}
                                  onChange={(e) => updateLink(link.id, { label: e.target.value })}
                                  placeholder="Caption (optional)"
                                  className="flex-1 min-w-[100px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                                />
                                <input
                                  type="text"
                                  value={link.url || ''}
                                  onChange={(e) => updateLink(link.id, { url: e.target.value })}
                                  placeholder="Link URL (optional)"
                                  className="flex-1 min-w-[100px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                                />
                              </div>
                              {(() => {
                                let urls: string[] = [];
                                try {
                                  if (link.icon && link.icon.startsWith('[')) urls = JSON.parse(link.icon) as string[];
                                } catch {}
                                return urls.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {urls.map((url, i) => (
                                      <div key={i} className="relative group/img">
                                        <img src={url} alt="" className="w-12 h-12 rounded object-cover border border-slate-200" />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = urls.filter((_, j) => j !== i);
                                            updateLink(link.id, { icon: JSON.stringify(next) });
                                          }}
                                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover/img:opacity-100"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          ) : link.type === 'socials' ? (
                            <div className="flex-1 space-y-2 min-w-0">
                              {(() => {
                                let obj: Record<string, string> = {};
                                try {
                                  if (link.url && link.url.startsWith('{')) obj = JSON.parse(link.url) as Record<string, string>;
                                } catch {}
                                const updateSocial = (platform: string, value: string) => {
                                  const next = { ...obj, [platform]: value || undefined };
                                  Object.keys(next).forEach((k) => { if (!next[k]) delete next[k]; });
                                  updateLink(link.id, { url: JSON.stringify(next) });
                                };
                                return (
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                    {SOCIAL_OPTIONS.map((s) => (
                                      <div key={s.id} className="flex items-center gap-1.5">
                                        <s.icon className="w-4 h-4 text-slate-500 shrink-0" />
                                        <input
                                          type="url"
                                          value={obj[s.id] ?? ''}
                                          onChange={(e) => updateSocial(s.id, e.target.value)}
                                          placeholder={s.name}
                                          className="flex-1 min-w-0 px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
                              <select
                                value={link.icon?.startsWith('http') ? 'custom' : (link.icon || '')}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === 'custom') {
                                    setUploadingIconFor(link.id);
                                    uploadTargetRef.current = { linkId: link.id, type: 'icon' };
                                    setTimeout(() => iconInputRef.current?.click(), 0);
                                  } else {
                                    updateLink(link.id, { icon: v || null });
                                  }
                                }}
                                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs shrink-0"
                              >
                                <option value="">No icon</option>
                                {SOCIAL_OPTIONS.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                                <option value="custom">Custom (upload)</option>
                              </select>
                              {link.icon?.startsWith('http') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadingIconFor(link.id);
                                    uploadTargetRef.current = { linkId: link.id, type: 'icon' };
                                    iconInputRef.current?.click();
                                  }}
                                  disabled={uploadingIconFor === link.id}
                                  className="shrink-0 p-1 rounded hover:bg-slate-200"
                                  title="Change custom icon"
                                >
                                  {uploadingIconFor === link.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                </button>
                              )}
                              <input
                                type="text"
                                value={link.label || ''}
                                onChange={(e) => updateLink(link.id, { label: e.target.value })}
                                placeholder="Label"
                                className="flex-1 min-w-[60px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                              />
                              <input
                                type="text"
                                value={link.url || ''}
                                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                                placeholder="https://..."
                                className="flex-1 min-w-[60px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                              />
                            </div>
                          )}
                          <button
                            onClick={() => deleteLink(link.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'design' && (
              <div className="space-y-6">
                {/* Theme Presets */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700">Themes</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {THEME_PRESETS.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => applyTheme(theme.id)}
                        className={`p-1 rounded-xl border-2 transition-all ${data.design?.theme === theme.id ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/30' : 'border-transparent hover:border-slate-300'}`}
                      >
                        <div
                          className="w-full aspect-[3/4] rounded-lg"
                          style={{ background: theme.preview }}
                        />
                        <p className="text-xs text-slate-600 mt-1 truncate">{theme.name}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">Font</h3>
                  <select
                    value={data.design?.fontFamily || FONT_OPTIONS[0].family}
                    onChange={(e) => updateDesign({ fontFamily: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    style={{ fontFamily: data.design?.fontFamily || FONT_OPTIONS[0].family }}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.family} style={{ fontFamily: f.family }}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {/* Background */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700">Background</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {(['solid', 'gradient', 'image', 'video'] as const).map((bg) => (
                      <button
                        key={bg}
                        onClick={() => updateDesign({ bgType: bg })}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium capitalize ${data.design?.bgType === bg ? 'bg-[var(--button)] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                  {data.design?.bgType === 'image' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          ref={bgInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setBgUploading(true);
                            try {
                              const url = await uploadFile(file);
                              updateDesign({ bgImageUrl: url });
                            } catch {
                              console.error('Background upload failed');
                            } finally {
                              setBgUploading(false);
                              if (e.target) (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => bgInputRef.current?.click()}
                          disabled={bgUploading}
                          className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {bgUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                          Upload photo/GIF
                        </button>
                      </div>
                      <input
                        type="text"
                        value={data.design?.bgImageUrl || ''}
                        onChange={(e) => updateDesign({ bgImageUrl: e.target.value })}
                        placeholder="Or paste image URL"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                  )}
                  {data.design?.bgType === 'video' && (
                    <input
                      type="text"
                      value={data.design?.bgVideoUrl || ''}
                      onChange={(e) => updateDesign({ bgVideoUrl: e.target.value })}
                      placeholder="Video URL (MP4)"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  )}
                  {data.design?.bgType === 'solid' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-600">Color</label>
                      <input
                        type="color"
                        value={data.design?.bgColor || '#ffffff'}
                        onChange={(e) => updateDesign({ bgColor: e.target.value })}
                        className="h-10 w-14 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={data.design?.bgColor || '#ffffff'}
                        onChange={(e) => updateDesign({ bgColor: e.target.value })}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                      />
                    </div>
                  )}
                  {data.design?.bgType === 'gradient' && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-600">Gradient colors</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((i) => {
                          const colors = data.design?.bgGradientColors ?? ['#667eea', '#764ba2', '#f093fb'];
                          const value = colors[i] ?? (i === 2 ? '' : '#667eea');
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                type="color"
                                value={value || '#cccccc'}
                                onChange={(e) => {
                                  const next: [string, string, string?] = [
                                    data.design?.bgGradientColors?.[0] ?? '#667eea',
                                    data.design?.bgGradientColors?.[1] ?? '#764ba2',
                                    data.design?.bgGradientColors?.[2],
                                  ];
                                  next[i] = e.target.value;
                                  if (i === 2 && !e.target.value) next.pop();
                                  updateDesign({ bgGradientColors: next });
                                }}
                                className="h-10 w-full min-w-0 rounded cursor-pointer"
                              />
                              <span className="text-xs text-slate-500">Color {i + 1}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-400">Optional third color for a 3-stop gradient.</p>
                    </div>
                  )}
                </div>

                {/* Button Size */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">Button Size</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(['small', 'medium', 'large'] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => updateDesign({ buttonSize: sz })}
                        className={`px-3 py-2 rounded-lg text-xs font-medium capitalize ${(data.design?.buttonSize ?? 'medium') === sz ? 'bg-[var(--button)] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Button Style */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">Button Style</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {['rounded', 'pill', 'square', 'outline', 'shadow', 'glass'].map((style) => (
                      <button
                        key={style}
                        onClick={() => updateDesign({ buttonStyle: style as LinkPageDesign['buttonStyle'] })}
                        className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${data.design?.buttonStyle === style ? 'bg-[var(--button)] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bold button text */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Bold button text</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={data.design?.buttonTextBold ?? false}
                    onClick={() => updateDesign({ buttonTextBold: !(data.design?.buttonTextBold ?? false) })}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${data.design?.buttonTextBold ? 'bg-[var(--button)]' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${data.design?.buttonTextBold ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                  </button>
                </div>

                {/* Colors */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Button Color</label>
                    <input
                      type="color"
                      value={data.design?.buttonColor || '#0f172a'}
                      onChange={(e) => updateDesign({ buttonColor: e.target.value })}
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Button Text Color</label>
                    <input
                      type="color"
                      value={data.design?.buttonTextColor ?? '#ffffff'}
                      onChange={(e) => updateDesign({ buttonTextColor: e.target.value })}
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-sm font-semibold text-slate-700">Page Text Color</label>
                    <input
                      type="color"
                      value={data.design?.textColor || '#0f172a'}
                      onChange={(e) => updateDesign({ textColor: e.target.value })}
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Animation */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">Animation</h3>
                  <div className="grid grid-cols-5 gap-2">
                    {['none', 'fade', 'slide', 'scale', 'stagger'].map((anim) => (
                      <button
                        key={anim}
                        onClick={() => updateDesign({ animation: anim as LinkPageDesign['animation'] })}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${data.design?.animation === anim ? 'bg-[var(--button)] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {anim}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Panel */}
      <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
        <div className="sticky top-6">
          <p className="text-center text-xs font-medium text-slate-500 mb-3">Live Preview</p>
          <div className="bg-slate-900 rounded-[2.5rem] p-3 shadow-2xl">
            <div
              key={`preview-${data.design?.fontFamily ?? ''}-${data.design?.buttonSize ?? 'medium'}`}
              className="bg-white rounded-[2rem] overflow-hidden flex flex-col"
              style={{ height: 'min(720px, 80vh)' }}
            >
              <LinkPageRenderer data={data} isPreview />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
