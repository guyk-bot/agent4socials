'use client';

import React, { useState, useEffect, useRef } from 'react';
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
    Plus,
    Hash
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

const HASHTAG_POOL_KEY = 'agent4socials_hashtag_pool';
const MAX_HASHTAGS_PER_POST = 5;

function normalizeHashtag(t: string): string {
    const s = t.trim().replace(/^#+/, '');
    return s ? `#${s}` : '';
}

export default function ComposerPage() {
    const router = useRouter();
    const [platforms, setPlatforms] = useState<string[]>([]);
    const [content, setContent] = useState('');
    const [contentByPlatform, setContentByPlatform] = useState<Record<string, string>>({});
    const [differentContentPerPlatform, setDifferentContentPerPlatform] = useState(false);
    const [mediaList, setMediaList] = useState<{ fileUrl: string, type: 'IMAGE' | 'VIDEO' }[]>([]);
    const [mediaByPlatform, setMediaByPlatform] = useState<Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>>({});
    const [differentMediaPerPlatform, setDifferentMediaPerPlatform] = useState(false);
    const [mediaUploading, setMediaUploading] = useState(false);
    const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileInputByPlatformRef = useRef<Record<string, HTMLInputElement | null>>({});
    const [scheduledAt, setScheduledAt] = useState('');
    const [accounts, setAccounts] = useState<{ id: string; platform: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);

    // Hashtags: pool (saved), selection for this post (max 5), per-platform option
    const [hashtagPool, setHashtagPool] = useState<string[]>([]);
    const [newHashtagInput, setNewHashtagInput] = useState('');
    const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
    const [differentHashtagsPerPlatform, setDifferentHashtagsPerPlatform] = useState(false);
    const [selectedHashtagsByPlatform, setSelectedHashtagsByPlatform] = useState<Record<string, string[]>>({});

    // Comment automation (optional): keyword capture + auto-reply for this post
    const [commentAutomationEnabled, setCommentAutomationEnabled] = useState(false);
    const [commentAutomationKeywords, setCommentAutomationKeywords] = useState('');
    const [commentAutomationReplyTemplate, setCommentAutomationReplyTemplate] = useState('');
    const [commentAutomationUsePrivateReply, setCommentAutomationUsePrivateReply] = useState(false);

    useEffect(() => {
        try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(HASHTAG_POOL_KEY) : null;
            if (raw) {
                const parsed = JSON.parse(raw) as string[];
                if (Array.isArray(parsed)) setHashtagPool(parsed);
            }
        } catch (_) { /* ignore */ }
    }, []);

    useEffect(() => {
        if (hashtagPool.length === 0) return;
        try {
            localStorage.setItem(HASHTAG_POOL_KEY, JSON.stringify(hashtagPool));
        } catch (_) { /* ignore */ }
    }, [hashtagPool]);

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

    const addToHashtagPool = () => {
        const tag = normalizeHashtag(newHashtagInput);
        if (!tag || hashtagPool.includes(tag)) return;
        setHashtagPool((prev) => [...prev, tag].sort());
        setNewHashtagInput('');
    };

    const removeFromHashtagPool = (tag: string) => {
        setHashtagPool((prev) => prev.filter((t) => t !== tag));
        setSelectedHashtags((prev) => prev.filter((t) => t !== tag));
        setSelectedHashtagsByPlatform((prev) => {
            const next = { ...prev };
            for (const p of Object.keys(next)) {
                next[p] = next[p].filter((t) => t !== tag);
            }
            return next;
        });
    };

    const toggleSelectedHashtag = (tag: string) => {
        setSelectedHashtags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < MAX_HASHTAGS_PER_POST ? [...prev, tag] : prev
        );
    };

    const toggleSelectedHashtagForPlatform = (platform: string, tag: string) => {
        setSelectedHashtagsByPlatform((prev) => {
            const list = prev[platform] ?? [];
            const next = list.includes(tag) ? list.filter((t) => t !== tag) : list.length < MAX_HASHTAGS_PER_POST ? [...list, tag] : list;
            return { ...prev, [platform]: next };
        });
    };

    async function uploadFile(file: File): Promise<{ fileUrl: string; type: 'IMAGE' | 'VIDEO' }> {
        const type: 'IMAGE' | 'VIDEO' = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE';
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
        return { fileUrl, type };
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;
        setMediaUploadError(null);
        setMediaUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
                const item = await uploadFile(file);
                setMediaList((prev) => [...prev, item]);
            }
        } catch (err: unknown) {
            const msg = err && typeof err === 'object' && 'response' in err && (err.response as { status?: number })?.status === 503
                ? 'Media storage is not configured. Add S3 (or R2) env vars to enable uploads.'
                : 'Upload failed. Try again.';
            setMediaUploadError(msg);
        } finally {
            setMediaUploading(false);
            e.target.value = '';
        }
    };

    const handleFileSelectForPlatform = async (platform: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;
        setMediaUploadError(null);
        setMediaUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
                const item = await uploadFile(file);
                setMediaByPlatform((prev) => ({
                    ...prev,
                    [platform]: [...(prev[platform] || []), item],
                }));
            }
        } catch (err: unknown) {
            const msg = err && typeof err === 'object' && 'response' in err && (err.response as { status?: number })?.status === 503
                ? 'Media storage is not configured. Add S3 (or R2) env vars to enable uploads.'
                : 'Upload failed. Try again.';
            setMediaUploadError(msg);
        } finally {
            setMediaUploading(false);
            e.target.value = '';
        }
    };

    const handleRemoveMedia = (index: number) => {
        setMediaList(mediaList.filter((_, i) => i !== index));
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
            // Append hashtags after content (per platform when "different hashtags per platform" is on)
            const hashtagSuffix = (tags: string[]) => (tags.length ? ' ' + tags.join(' ') : '');
            let contentFinal = content.trim() + hashtagSuffix(selectedHashtags);
            let contentByPlatformFinal: Record<string, string> | undefined;

            if (differentHashtagsPerPlatform) {
                contentByPlatformFinal = platforms.reduce((acc, p) => {
                    const text = (differentContentPerPlatform ? (contentByPlatform[p] ?? '') : content).trim();
                    const tags = selectedHashtagsByPlatform[p] ?? [];
                    acc[p] = text + hashtagSuffix(tags);
                    return acc;
                }, {} as Record<string, string>);
            } else if (differentContentPerPlatform && platforms.some((p) => (contentByPlatform[p] ?? '').trim())) {
                contentByPlatformFinal = platforms.reduce((acc, p) => {
                    const v = (contentByPlatform[p] ?? '').trim() + hashtagSuffix(selectedHashtags);
                    if (v.trim()) acc[p] = v;
                    return acc;
                }, {} as Record<string, string>);
            }

            const payload: {
                content: string;
                contentByPlatform?: Record<string, string>;
                media: { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[];
                mediaByPlatform?: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>;
                targets: { platform: string; socialAccountId: string }[];
                scheduledAt?: string;
                commentAutomation?: { keywords: string[]; replyTemplate: string; usePrivateReply?: boolean } | null;
            } = {
                content: contentFinal,
                media: mediaList,
                targets,
                scheduledAt: scheduledAt || undefined,
            };
            if (contentByPlatformFinal && Object.keys(contentByPlatformFinal).length > 0) {
                payload.contentByPlatform = contentByPlatformFinal;
            }
            if (commentAutomationEnabled && commentAutomationKeywords.trim() && commentAutomationReplyTemplate.trim()) {
                const keywords = commentAutomationKeywords
                    .split(/[\n,]+/)
                    .map((k) => k.trim().toLowerCase())
                    .filter(Boolean);
                if (keywords.length > 0) {
                    payload.commentAutomation = {
                        keywords,
                        replyTemplate: commentAutomationReplyTemplate.trim(),
                        usePrivateReply: commentAutomationUsePrivateReply,
                    };
                }
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
                        <div className="flex flex-wrap gap-3 justify-center">
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
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,video/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={mediaUploading}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        <ImageIcon size={18} />
                                        Add photo, video, reel or carousel from computer
                                    </button>
                                    {mediaUploading && <span className="text-sm text-neutral-500">Uploading…</span>}
                                </div>
                                {mediaUploadError && <p className="text-sm text-red-600">{mediaUploadError}</p>}
                                <div className="grid grid-cols-4 gap-3">
                                    {mediaList.map((m, i) => (
                                        <div key={i} className="relative group aspect-square rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
                                            {m.type === 'VIDEO' ? (
                                                <video src={m.fileUrl} className="object-cover w-full h-full" muted playsInline />
                                            ) : (
                                                <img src={m.fileUrl} alt="media" className="object-cover w-full h-full" />
                                            )}
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
                                        <input
                                            ref={(el) => { fileInputByPlatformRef.current[p] = el; }}
                                            type="file"
                                            accept="image/*,video/*"
                                            multiple
                                            className="hidden"
                                            onChange={(ev) => handleFileSelectForPlatform(p, ev)}
                                        />
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => fileInputByPlatformRef.current[p]?.click()}
                                                disabled={mediaUploading}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                            >
                                                <Plus size={16} />
                                                Add from computer
                                            </button>
                                            {mediaUploading && <span className="text-xs text-neutral-500">Uploading…</span>}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(mediaByPlatform[p] || []).map((m, i) => (
                                                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-neutral-200 shrink-0">
                                                    {m.type === 'VIDEO' ? (
                                                        <video src={m.fileUrl} className="w-full h-full object-cover" muted playsInline />
                                                    ) : (
                                                        <img src={m.fileUrl} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                    <button type="button" onClick={() => handleRemoveMediaForPlatform(p, i)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded text-xs">×</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {platforms.length === 0 && <p className="text-sm text-neutral-500">Select platforms above first.</p>}
                                {mediaUploadError && <p className="text-sm text-red-600">{mediaUploadError}</p>}
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
                        <h3 className="font-semibold text-neutral-900">4. Comment automation</h3>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={commentAutomationEnabled}
                                onChange={(e) => setCommentAutomationEnabled(e.target.checked)}
                                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-neutral-700">Enable keyword comment automation</span>
                        </label>
                        <p className="text-sm text-neutral-500">When comments contain your keywords on this post, automatically reply (or send a private DM on Instagram).</p>
                        {commentAutomationEnabled && (
                            <div className="space-y-4 pt-2 border-t border-neutral-100">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Keywords (one per line or comma-separated)</label>
                                    <textarea
                                        value={commentAutomationKeywords}
                                        onChange={(e) => setCommentAutomationKeywords(e.target.value)}
                                        placeholder="e.g. price, discount, help"
                                        rows={2}
                                        className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Auto-reply template</label>
                                    <textarea
                                        value={commentAutomationReplyTemplate}
                                        onChange={(e) => setCommentAutomationReplyTemplate(e.target.value)}
                                        placeholder="e.g. Thanks for your interest! We'll DM you with details."
                                        rows={3}
                                        className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    />
                                </div>
                                {platforms.includes('INSTAGRAM') && (
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={commentAutomationUsePrivateReply}
                                            onChange={(e) => setCommentAutomationUsePrivateReply(e.target.checked)}
                                            className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-neutral-700">Send as private reply (DM) on Instagram</span>
                                    </label>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-semibold text-neutral-900 flex items-center gap-2">
                            <Hash size={20} className="text-neutral-500" />
                            5. Hashtags
                        </h3>
                        <p className="text-sm text-neutral-500">Add hashtags to your pool, then choose up to 5 per post. They will be added after your content.</p>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newHashtagInput}
                                    onChange={(e) => setNewHashtagInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToHashtagPool())}
                                    placeholder="e.g. travel or #travel"
                                    className="flex-1 p-2.5 border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <button type="button" onClick={addToHashtagPool} className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition-colors">
                                    Add to pool
                                </button>
                            </div>
                            {hashtagPool.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {hashtagPool.map((tag) => (
                                        <span key={tag} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-neutral-100 rounded-full text-sm text-neutral-700">
                                            {tag}
                                            <button type="button" onClick={() => removeFromHashtagPool(tag)} className="p-0.5 rounded-full hover:bg-neutral-200 text-neutral-500" aria-label={`Remove ${tag}`}>
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        {hashtagPool.length > 0 && (
                            <>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={differentHashtagsPerPlatform} onChange={(e) => setDifferentHashtagsPerPlatform(e.target.checked)} className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-sm font-medium text-neutral-700">Use different hashtags per platform</span>
                                </label>
                                {!differentHashtagsPerPlatform ? (
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-neutral-700">Select up to 5 for this post</p>
                                        <div className="flex flex-wrap gap-2">
                                            {hashtagPool.map((tag) => {
                                                const selected = selectedHashtags.includes(tag);
                                                return (
                                                    <button key={tag} type="button" onClick={() => toggleSelectedHashtag(tag)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selected ? 'bg-indigo-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                                                        {tag}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {selectedHashtags.length > 0 && <p className="text-xs text-neutral-500">{selectedHashtags.length} selected (max 5)</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {platforms.map((p) => {
                                            const list = selectedHashtagsByPlatform[p] ?? [];
                                            return (
                                                <div key={p} className="space-y-2">
                                                    <p className="text-sm font-medium text-neutral-700">{PLATFORM_LABELS[p] || p} — up to 5</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {hashtagPool.map((tag) => {
                                                            const selected = list.includes(tag);
                                                            return (
                                                                <button key={tag} type="button" onClick={() => toggleSelectedHashtagForPlatform(p, tag)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selected ? 'bg-indigo-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                                                                    {tag}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    {list.length > 0 && <p className="text-xs text-neutral-500">{list.length} selected</p>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-semibold text-neutral-900">6. Schedule</h3>
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
                            platforms.map(p => {
                                const baseContent = differentContentPerPlatform ? (contentByPlatform[p] ?? '') : content;
                                const tags = differentHashtagsPerPlatform ? (selectedHashtagsByPlatform[p] ?? []) : selectedHashtags;
                                const contentWithHashtags = baseContent.trim() + (tags.length ? ' ' + tags.join(' ') : '');
                                return (
                                    <PostPreview
                                        key={p}
                                        platform={p}
                                        content={contentWithHashtags}
                                        media={differentMediaPerPlatform ? (mediaByPlatform[p] ?? []) : mediaList}
                                    />
                                );
                            })
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
            className={`w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 ${active
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm'
                    : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
        >
            <span className="flex items-center justify-center w-10 h-10 shrink-0">{icon}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-center leading-tight">{label}</span>
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
                    media[0].type === 'VIDEO' ? (
                        <video src={media[0].fileUrl} className="w-full h-full object-cover" muted playsInline />
                    ) : (
                        <img src={media[0].fileUrl} alt="preview" className="w-full h-full object-cover" />
                    )
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
