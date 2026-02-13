'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import api from '@/lib/api';
import {
    Instagram,
    Youtube,
    Facebook,
    Linkedin,
    Send,
    Calendar,
    Image as ImageIcon,
    Video,
    X,
    Plus
} from 'lucide-react';
import { useRouter } from 'next/navigation';

function TikTokIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
        </svg>
    );
}

function XTwitterIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
}

const PLATFORM_LABELS: Record<string, string> = {
    INSTAGRAM: 'Instagram',
    TIKTOK: 'TikTok',
    YOUTUBE: 'YouTube',
    FACEBOOK: 'Facebook',
    TWITTER: 'X',
    LINKEDIN: 'LinkedIn',
};

export default function ComposerPage() {
    const router = useRouter();
    const [platforms, setPlatforms] = useState<string[]>([]);
    const [content, setContent] = useState('');
    const [contentByPlatform, setContentByPlatform] = useState<Record<string, string>>({});
    const [differentContentPerPlatform, setDifferentContentPerPlatform] = useState(false);
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaList, setMediaList] = useState<{ fileUrl: string, type: 'IMAGE' | 'VIDEO' }[]>([]);
    const [mediaByPlatform, setMediaByPlatform] = useState<Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>>({});
    const [mediaUrlByPlatform, setMediaUrlByPlatform] = useState<Record<string, string>>({});
    const [differentMediaPerPlatform, setDifferentMediaPerPlatform] = useState(false);
    const [scheduledAt, setScheduledAt] = useState('');
    const [accounts, setAccounts] = useState<{ id: string; platform: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const res = await api.get('/social/accounts');
                setAccounts(res.data);
            } catch (err) {
                console.error('Failed to fetch accounts');
            }
        };
        fetchAccounts();
    }, []);

    const handleAddMedia = () => {
        if (!mediaUrl) return;
        const type = mediaUrl.match(/\.(mp4|webm|mov)$/i) ? 'VIDEO' : 'IMAGE';
        setMediaList([...mediaList, { fileUrl: mediaUrl, type: type as 'IMAGE' | 'VIDEO' }]);
        setMediaUrl('');
    };

    const handleRemoveMedia = (index: number) => {
        setMediaList(mediaList.filter((_, i) => i !== index));
    };

    const handleAddMediaForPlatform = (platform: string) => {
        const url = mediaUrlByPlatform[platform]?.trim();
        if (!url) return;
        const type = url.match(/\.(mp4|webm|mov)$/i) ? 'VIDEO' : 'IMAGE';
        setMediaByPlatform((prev) => ({
            ...prev,
            [platform]: [...(prev[platform] || []), { fileUrl: url, type }],
        }));
        setMediaUrlByPlatform((prev) => ({ ...prev, [platform]: '' }));
    };

    const handleRemoveMediaForPlatform = (platform: string, index: number) => {
        setMediaByPlatform((prev) => ({
            ...prev,
            [platform]: (prev[platform] || []).filter((_, i) => i !== index),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (platforms.length === 0) {
            setAlertMessage('Select at least one platform');
            return;
        }
        const targets = platforms
            .map((p) => {
                const acc = accounts.find((a: { platform: string }) => a.platform === p);
                return acc?.id ? { platform: p, socialAccountId: acc.id } : null;
            })
            .filter(Boolean) as { platform: string; socialAccountId: string }[];
        if (targets.length === 0) {
            setAlertMessage('Connect at least one account for the selected platforms (Accounts page).');
            return;
        }

        setLoading(true);
        try {
            const payload: {
                content: string;
                contentByPlatform?: Record<string, string>;
                media: { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[];
                mediaByPlatform?: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>;
                targets: { platform: string; socialAccountId: string }[];
                scheduledAt?: string;
            } = {
                content,
                media: mediaList,
                targets,
                scheduledAt: scheduledAt || undefined,
            };
            if (differentContentPerPlatform && platforms.some((p) => (contentByPlatform[p] ?? '').trim())) {
                payload.contentByPlatform = platforms.reduce((acc, p) => {
                    const v = (contentByPlatform[p] ?? '').trim();
                    if (v) acc[p] = v;
                    return acc;
                }, {} as Record<string, string>);
            }
            if (differentMediaPerPlatform) {
                payload.mediaByPlatform = platforms.reduce((acc, p) => {
                    const list = mediaByPlatform[p];
                    if (list?.length) acc[p] = list;
                    return acc;
                }, {} as Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>);
                const firstWithMedia = platforms.find((p) => (mediaByPlatform[p]?.length ?? 0) > 0);
                payload.media = firstWithMedia ? mediaByPlatform[firstWithMedia]! : mediaList;
            }
            const createRes = await api.post<{ id: string }>('/posts', payload);
            const postId = createRes.data?.id;
            if (postId && !scheduledAt) {
                try {
                    const publishRes = await api.post<{ ok: boolean; results?: { platform: string; ok: boolean; error?: string }[] }>(`/posts/${postId}/publish`);
                    const results = publishRes.data?.results;
                    if (results?.some((r) => !r.ok)) {
                        const failed = results.filter((r) => !r.ok).map((r) => `${r.platform}: ${r.error || 'failed'}`).join('; ');
                        setAlertMessage(`Post created. Some platforms failed: ${failed}`);
                    }
                } catch (_) {
                    setAlertMessage('Post saved but publishing failed. Check Dashboard or History.');
                }
            }
            router.push('/dashboard');
        } catch (err) {
            setAlertMessage('Failed to create post');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <ConfirmModal
                open={alertMessage !== null}
                onClose={() => setAlertMessage(null)}
                message={alertMessage ?? ''}
                variant="alert"
                confirmLabel="OK"
            />
            <div>
                <h1 className="text-2xl font-bold text-neutral-900">Create Post</h1>
                <p className="text-neutral-500 mt-1">Draft, preview and schedule your content across platforms.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="card space-y-4">
                        <h3 className="font-semibold text-neutral-900">1. Select Platforms</h3>
                        <div className="flex flex-wrap gap-3">
                            <PlatformToggle
                                platform="INSTAGRAM"
                                label="Instagram"
                                icon={<Instagram size={22} className="text-pink-600" />}
                                active={platforms.includes('INSTAGRAM')}
                                onClick={() => setPlatforms(prev => prev.includes('INSTAGRAM') ? prev.filter(p => p !== 'INSTAGRAM') : [...prev, 'INSTAGRAM'])}
                            />
                            <PlatformToggle
                                platform="TIKTOK"
                                label="TikTok"
                                icon={<TikTokIcon size={22} className="text-neutral-900" />}
                                active={platforms.includes('TIKTOK')}
                                onClick={() => setPlatforms(prev => prev.includes('TIKTOK') ? prev.filter(p => p !== 'TIKTOK') : [...prev, 'TIKTOK'])}
                            />
                            <PlatformToggle
                                platform="YOUTUBE"
                                label="YouTube"
                                icon={<Youtube size={22} className="text-red-600" />}
                                active={platforms.includes('YOUTUBE')}
                                onClick={() => setPlatforms(prev => prev.includes('YOUTUBE') ? prev.filter(p => p !== 'YOUTUBE') : [...prev, 'YOUTUBE'])}
                            />
                            <PlatformToggle
                                platform="FACEBOOK"
                                label="Facebook"
                                icon={<Facebook size={22} className="text-blue-600" />}
                                active={platforms.includes('FACEBOOK')}
                                onClick={() => setPlatforms(prev => prev.includes('FACEBOOK') ? prev.filter(p => p !== 'FACEBOOK') : [...prev, 'FACEBOOK'])}
                            />
                            <PlatformToggle
                                platform="TWITTER"
                                label="X"
                                icon={<XTwitterIcon size={22} className="text-neutral-900" />}
                                active={platforms.includes('TWITTER')}
                                onClick={() => setPlatforms(prev => prev.includes('TWITTER') ? prev.filter(p => p !== 'TWITTER') : [...prev, 'TWITTER'])}
                            />
                            <PlatformToggle
                                platform="LINKEDIN"
                                label="LinkedIn"
                                icon={<Linkedin size={22} className="text-blue-700" />}
                                active={platforms.includes('LINKEDIN')}
                                onClick={() => setPlatforms(prev => prev.includes('LINKEDIN') ? prev.filter(p => p !== 'LINKEDIN') : [...prev, 'LINKEDIN'])}
                            />
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-semibold text-neutral-900">2. Media</h3>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={differentMediaPerPlatform}
                                onChange={(e) => setDifferentMediaPerPlatform(e.target.checked)}
                                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-neutral-700">Use different media per platform</span>
                        </label>
                        {!differentMediaPerPlatform ? (
                            <>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={mediaUrl}
                                        onChange={(e) => setMediaUrl(e.target.value)}
                                        placeholder="Paste image or video URL..."
                                        className="flex-1 p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <button type="button" onClick={handleAddMedia} className="p-3 btn-primary rounded-xl shrink-0">
                                        <Plus size={20} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-4 gap-3">
                                    {mediaList.map((m, i) => (
                                        <div key={i} className="relative group aspect-square rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
                                            <img src={m.fileUrl} alt="media" className="object-cover w-full h-full" />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveMedia(i)}
                                                className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4">
                                {platforms.map((p) => (
                                    <div key={p} className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                                        <p className="text-sm font-medium text-neutral-700">{PLATFORM_LABELS[p] || p}</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={mediaUrlByPlatform[p] ?? ''}
                                                onChange={(e) => setMediaUrlByPlatform((prev) => ({ ...prev, [p]: e.target.value }))}
                                                placeholder="Image or video URL..."
                                                className="flex-1 p-2 border border-neutral-200 rounded-lg text-sm"
                                            />
                                            <button type="button" onClick={() => handleAddMediaForPlatform(p)} className="p-2 btn-primary rounded-lg shrink-0">
                                                <Plus size={18} />
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(mediaByPlatform[p] || []).map((m, i) => (
                                                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-neutral-200">
                                                    <img src={m.fileUrl} alt="" className="w-full h-full object-cover" />
                                                    <button type="button" onClick={() => handleRemoveMediaForPlatform(p, i)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded text-xs">×</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {platforms.length === 0 && <p className="text-sm text-neutral-500">Select platforms above first.</p>}
                            </div>
                        )}
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-semibold text-neutral-900">3. Content</h3>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={differentContentPerPlatform}
                                onChange={(e) => setDifferentContentPerPlatform(e.target.checked)}
                                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-neutral-700">Use different content per platform</span>
                        </label>
                        {!differentContentPerPlatform ? (
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="What's on your mind?..."
                                className="w-full h-32 p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        ) : (
                            <div className="space-y-4">
                                {platforms.map((p) => (
                                    <div key={p} className="space-y-1">
                                        <label className="text-sm font-medium text-neutral-700">{PLATFORM_LABELS[p] || p}</label>
                                        <textarea
                                            value={contentByPlatform[p] ?? ''}
                                            onChange={(e) => setContentByPlatform((prev) => ({ ...prev, [p]: e.target.value }))}
                                            placeholder="Content for this platform..."
                                            className="w-full h-24 p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                        />
                                    </div>
                                ))}
                                {platforms.length === 0 && <p className="text-sm text-neutral-500">Select platforms above first.</p>}
                            </div>
                        )}
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-semibold text-neutral-900">4. Schedule</h3>
                        <div className="flex items-center gap-3">
                            <Calendar size={22} className="text-neutral-400 shrink-0" />
                            <input
                                type="datetime-local"
                                value={scheduledAt}
                                onChange={(e) => setScheduledAt(e.target.value)}
                                className="flex-1 p-3 border border-neutral-200 rounded-xl text-neutral-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full btn-primary flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-medium"
                    >
                        <Send size={20} />
                        <span>{scheduledAt ? 'Schedule Post' : 'Post Now'}</span>
                    </button>
                </form>

                <div className="hidden lg:block space-y-6">
                    <h2 className="text-xl font-semibold text-neutral-900">Preview</h2>
                    <div className="sticky top-8 space-y-6">
                        {platforms.length === 0 ? (
                            <div className="card border-2 border-dashed border-neutral-200 bg-neutral-50/50 flex flex-col items-center justify-center py-16 text-neutral-400">
                                <ImageIcon size={40} strokeWidth={1.5} className="text-neutral-300" />
                                <p className="mt-3 text-sm font-medium">Select a platform to see preview</p>
                            </div>
                        ) : (
                            platforms.map(p => (
                                <PostPreview
                                    key={p}
                                    platform={p}
                                    content={differentContentPerPlatform ? (contentByPlatform[p] ?? '') : content}
                                    media={differentMediaPerPlatform ? (mediaByPlatform[p] ?? []) : mediaList}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlatformToggle({ platform, label, icon, active, onClick }: { platform: string; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`min-w-[4.5rem] p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 ${active
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm'
                    : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
        >
            <span className="flex items-center justify-center w-8 h-8 shrink-0">{icon}</span>
            <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        </button>
    );
}

function PostPreview({ platform, content, media }: { platform: string; content: string; media: { fileUrl: string; type: string }[] }) {
    const PlatformIcon = () => {
        switch (platform) {
            case 'INSTAGRAM': return <Instagram size={22} className="text-pink-600" />;
            case 'YOUTUBE': return <Youtube size={22} className="text-red-600" />;
            case 'TIKTOK': return <TikTokIcon size={22} className="text-neutral-800" />;
            case 'FACEBOOK': return <Facebook size={22} className="text-blue-600" />;
            case 'TWITTER': return <XTwitterIcon size={22} className="text-neutral-800" />;
            case 'LINKEDIN': return <Linkedin size={22} className="text-blue-700" />;
            default: return <Video size={22} className="text-neutral-500" />;
        }
    };
    return (
        <div className="card overflow-hidden !p-0 max-w-sm mx-auto shadow-lg border border-neutral-200">
            <div className="p-3 border-b border-neutral-100 flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
                    <PlatformIcon />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="h-3 w-24 bg-neutral-200 rounded" />
                    <div className="h-2.5 w-16 bg-neutral-100 rounded mt-1.5" />
                </div>
            </div>
            <div className="aspect-square bg-neutral-50 flex items-center justify-center overflow-hidden">
                {media.length > 0 ? (
                    <img src={media[0].fileUrl} alt="preview" className="w-full h-full object-cover" />
                ) : (
                    <ImageIcon size={36} className="text-neutral-200" strokeWidth={1.5} />
                )}
            </div>
            <div className="p-3 space-y-2">
                <p className="text-sm text-neutral-800 line-clamp-3">
                    {content || 'Your caption will appear here...'}
                </p>
            </div>
        </div>
    );
}
