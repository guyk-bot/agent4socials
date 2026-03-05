'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Link2, Plus, Trash2, GripVertical, Eye, Copy, Check, 
  Image as ImageIcon, Palette, Type, ExternalLink, Save, Loader2,
  Instagram, Facebook, Youtube, Twitter, Linkedin, Github, Globe, Mail
} from 'lucide-react';
import api from '@/lib/api';
import { LinkPageRenderer } from '@/components/smart-links/LinkPageRenderer';
import { THEME_PRESETS, FONT_OPTIONS, type LinkPageDesign } from '@/components/smart-links/themes';

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
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin },
  { id: 'github', name: 'GitHub', icon: Github },
  { id: 'website', name: 'Website', icon: Globe },
  { id: 'email', name: 'Email', icon: Mail },
];

export default function SmartLinksPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'links' | 'design'>('links');
  const [data, setData] = useState<LinkPageData>({
    slug: '',
    title: '',
    bio: '',
    avatarUrl: '',
    design: THEME_PRESETS[0].design,
    links: [],
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<{ linkPage: LinkPageData | null }>('/smart-links');
        if (res.data.linkPage) {
          setData(res.data.linkPage);
        }
      } catch (e) {
        console.error('Failed to load smart links:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await api.post<{ linkPage: LinkPageData }>('/smart-links', {
        slug: data.slug,
        title: data.title,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
        design: data.design,
        links: data.links,
      });
      if (res.data.linkPage) {
        setData(res.data.linkPage);
      }
    } catch (e) {
      console.error('Failed to save:', e);
    } finally {
      setSaving(false);
    }
  }, [data]);

  const handleCopyLink = useCallback(() => {
    if (data.slug) {
      navigator.clipboard.writeText(`https://agent4socials.com/@${data.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data.slug]);

  const addLink = useCallback((type: string = 'link') => {
    const newLink: LinkItem = {
      id: `new-${Date.now()}`,
      type,
      label: type === 'header' ? 'Section Title' : '',
      url: '',
      icon: null,
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
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
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>

          {/* URL Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">agent4socials.com/@</span>
              <input
                type="text"
                value={data.slug}
                onChange={(e) => setData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                placeholder="username"
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
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
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setActiveTab('links')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'links' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Link2 className="w-4 h-4 inline mr-2" />
              Links
            </button>
            <button
              onClick={() => setActiveTab('design')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'design' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
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
                      <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden border-2 border-slate-200">
                        {data.avatarUrl ? (
                          <img src={data.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 space-y-3">
                      <input
                        type="text"
                        value={data.avatarUrl || ''}
                        onChange={(e) => setData((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                        placeholder="Avatar URL"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200"
                      />
                      <input
                        type="text"
                        value={data.title || ''}
                        onChange={(e) => setData((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Display Name"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-200"
                      />
                      <textarea
                        value={data.bio || ''}
                        onChange={(e) => setData((prev) => ({ ...prev, bio: e.target.value }))}
                        placeholder="Bio (optional)"
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Links List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Links</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => addLink('link')}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Link
                      </button>
                      <button
                        onClick={() => addLink('header')}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex items-center gap-1"
                      >
                        <Type className="w-3 h-3" /> Header
                      </button>
                    </div>
                  </div>

                  {data.links.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      No links yet. Add your first link above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.links.sort((a, b) => a.order - b.order).map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 group"
                        >
                          <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />
                          {link.type === 'header' ? (
                            <input
                              type="text"
                              value={link.label || ''}
                              onChange={(e) => updateLink(link.id, { label: e.target.value })}
                              placeholder="Section title"
                              className="flex-1 px-2 py-1 bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                            />
                          ) : (
                            <div className="flex-1 flex items-center gap-2">
                              <select
                                value={link.icon || ''}
                                onChange={(e) => updateLink(link.id, { icon: e.target.value || null })}
                                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                              >
                                <option value="">No icon</option>
                                {SOCIAL_OPTIONS.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={link.label || ''}
                                onChange={(e) => updateLink(link.id, { label: e.target.value })}
                                placeholder="Label"
                                className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                              />
                              <input
                                type="text"
                                value={link.url || ''}
                                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                                placeholder="https://..."
                                className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                              />
                            </div>
                          )}
                          <button
                            onClick={() => deleteLink(link.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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
                        className={`p-1 rounded-xl border-2 transition-all ${data.design?.theme === theme.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-transparent hover:border-slate-300'}`}
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
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.family}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {/* Button Style */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">Button Style</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {['rounded', 'pill', 'square', 'outline', 'shadow', 'glass'].map((style) => (
                      <button
                        key={style}
                        onClick={() => updateDesign({ buttonStyle: style as LinkPageDesign['buttonStyle'] })}
                        className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${data.design?.buttonStyle === style ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
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
                    <label className="text-sm font-semibold text-slate-700">Text Color</label>
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
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${data.design?.animation === anim ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
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
          <div className="bg-slate-900 rounded-[2.5rem] p-3 shadow-2xl">
            <div className="bg-white rounded-[2rem] overflow-hidden" style={{ height: 580 }}>
              <LinkPageRenderer data={data} isPreview />
            </div>
          </div>
          <p className="text-center text-xs text-slate-400 mt-3">Live Preview</p>
        </div>
      </div>
    </div>
  );
}
