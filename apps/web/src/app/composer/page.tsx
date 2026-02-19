'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import api from '@/lib/api';
import {
    Send,
    Calendar,
    Image as ImageIcon,
    Video,
    X,
    Plus,
    Hash,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const COMPOSER_DRAFT_KEY = 'agent4socials_composer_draft';

type ComposerDraft = {
    platforms: string[];
    content: string;
    contentByPlatform: Record<string, string>;
    differentContentPerPlatform: boolean;
    mediaType: MediaTypeChoice;
    mediaList: { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[];
    mediaByPlatform: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>;
    differentMediaPerPlatform: boolean;
    scheduledAt: string;
    scheduleDelivery: 'auto' | 'email_links';
    selectedHashtags: string[];
    differentHashtagsPerPlatform: boolean;
    selectedHashtagsByPlatform: Record<string, string[]>;
    commentAutomationEnabled: boolean;
    commentAutomationKeywords: string;
    commentAutomationReplyTemplate: string;
    commentAutomationUsePrivateReply: boolean;
};

function isPersistableMediaUrl(url: string): boolean {
    return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

/** Use proxy for R2 URLs so the browser gets correct Content-Type and avoids CORB. */
function mediaDisplayUrl(fileUrl: string): string {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) return fileUrl;
    if (fileUrl.includes('r2.dev') || fileUrl.includes('cloudflarestorage.com')) {
        return `/api/media/proxy?url=${encodeURIComponent(fileUrl)}`;
    }
    return fileUrl;
}

const PLATFORM_LABELS: Record<string, string> = {
    INSTAGRAM: 'Instagram',
    TIKTOK: 'TikTok',
    YOUTUBE: 'YouTube',
    FACEBOOK: 'Facebook',
    TWITTER: 'Twitter/X',
    LINKEDIN: 'LinkedIn',
};

const HASHTAG_POOL_KEY = 'agent4socials_hashtag_pool';
const MAX_HASHTAGS_PER_POST = 5;

type MediaTypeChoice = 'photo' | 'video' | 'reel' | 'carousel';

const MEDIA_RECOMMENDATIONS: Record<MediaTypeChoice, { label: string; accept: string; multiple: boolean; hint: string }> = {
    photo: { label: 'Photo', accept: 'image/*', multiple: false, hint: 'Recommended: 1080×1080 (square) or 1080×1350 (portrait). Works on all platforms.' },
    video: { label: 'Video', accept: 'video/*', multiple: false, hint: 'Recommended: 1080×1920 (9:16) or 1920×1080. Max length varies by platform.' },
    reel: { label: 'Reel / Short', accept: 'video/*', multiple: false, hint: 'Instagram Reels / TikTok: 1080×1920 (9:16), 15–90 sec. YouTube Shorts: 1080×1920, up to 60 sec.' },
    carousel: { label: 'Carousel', accept: 'image/*', multiple: true, hint: 'Add multiple images (2–10). Recommended: 1080×1080 per slide. Instagram, Facebook, Twitter/X, and LinkedIn support carousels.' },
};

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
    const [mediaType, setMediaType] = useState<MediaTypeChoice>('photo');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileInputByPlatformRef = useRef<Record<string, HTMLInputElement | null>>({});
    const [scheduledAt, setScheduledAt] = useState('');
    const [scheduleDelivery, setScheduleDelivery] = useState<'auto' | 'email_links'>('auto');
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

    // AI description (optional): generate copy from brand context
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiPlatform, setAiPlatform] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [hasBrandContext, setHasBrandContext] = useState<boolean | null>(null);

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

    // Restore composer draft from localStorage on mount (so progress survives navigation/refresh)
    const [draftRestored, setDraftRestored] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || draftRestored) return;
        try {
            const raw = localStorage.getItem(COMPOSER_DRAFT_KEY);
            if (!raw) {
                setDraftRestored(true);
                return;
            }
            const d = JSON.parse(raw) as Partial<ComposerDraft>;
            if (d && typeof d === 'object') {
                if (Array.isArray(d.platforms)) setPlatforms(d.platforms);
                if (typeof d.content === 'string') setContent(d.content);
                if (d.contentByPlatform && typeof d.contentByPlatform === 'object') setContentByPlatform(d.contentByPlatform);
                if (typeof d.differentContentPerPlatform === 'boolean') setDifferentContentPerPlatform(d.differentContentPerPlatform);
                if (d.mediaType === 'photo' || d.mediaType === 'video' || d.mediaType === 'reel' || d.mediaType === 'carousel') setMediaType(d.mediaType);
                if (Array.isArray(d.mediaList)) {
                    const valid = d.mediaList.filter((m) => m && isPersistableMediaUrl(m.fileUrl));
                    if (valid.length) setMediaList(valid);
                }
                if (d.mediaByPlatform && typeof d.mediaByPlatform === 'object') {
                    const cleaned: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]> = {};
                    for (const [k, arr] of Object.entries(d.mediaByPlatform)) {
                        if (Array.isArray(arr)) {
                            const v = arr.filter((m) => m && isPersistableMediaUrl(m.fileUrl));
                            if (v.length) cleaned[k] = v;
                        }
                    }
                    if (Object.keys(cleaned).length) setMediaByPlatform(cleaned);
                }
                if (typeof d.differentMediaPerPlatform === 'boolean') setDifferentMediaPerPlatform(d.differentMediaPerPlatform);
                if (typeof d.scheduledAt === 'string') setScheduledAt(d.scheduledAt);
                if (d.scheduleDelivery === 'auto' || d.scheduleDelivery === 'email_links') setScheduleDelivery(d.scheduleDelivery);
                if (Array.isArray(d.selectedHashtags)) setSelectedHashtags(d.selectedHashtags);
                if (typeof d.differentHashtagsPerPlatform === 'boolean') setDifferentHashtagsPerPlatform(d.differentHashtagsPerPlatform);
                if (d.selectedHashtagsByPlatform && typeof d.selectedHashtagsByPlatform === 'object') setSelectedHashtagsByPlatform(d.selectedHashtagsByPlatform);
                if (typeof d.commentAutomationEnabled === 'boolean') setCommentAutomationEnabled(d.commentAutomationEnabled);
                if (typeof d.commentAutomationKeywords === 'string') setCommentAutomationKeywords(d.commentAutomationKeywords);
                if (typeof d.commentAutomationReplyTemplate === 'string') setCommentAutomationReplyTemplate(d.commentAutomationReplyTemplate);
                if (typeof d.commentAutomationUsePrivateReply === 'boolean') setCommentAutomationUsePrivateReply(d.commentAutomationUsePrivateReply);
            }
        } catch (_) { /* ignore */ }
        setDraftRestored(true);
    }, [draftRestored]);

    const clearComposerDraft = useCallback(() => {
        try {
            localStorage.removeItem(COMPOSER_DRAFT_KEY);
        } catch (_) { /* ignore */ }
    }, []);

    const openAiModal = useCallback(() => {
        setAiError(null);
        setAiTopic('');
        setAiPrompt('');
        setAiPlatform(platforms[0] || '');
        setAiModalOpen(true);
        api.get('/ai/brand-context').then((res) => {
            const data = res.data;
            setHasBrandContext(!!(data && typeof data === 'object' && (data.targetAudience ?? data.toneOfVoice ?? data.productDescription)));
        }).catch(() => setHasBrandContext(false));
    }, [platforms]);

    const handleAiGenerate = useCallback(() => {
        if (!aiTopic.trim()) {
            setAiError('Describe what this post is about.');
            return;
        }
        setAiLoading(true);
        setAiError(null);
        const topic = aiTopic.trim();
        const prompt = aiPrompt.trim() || undefined;

        if (differentContentPerPlatform && platforms.length > 0) {
            // Generate one description per selected platform, each suited to that platform
            Promise.all(
                platforms.map((p) =>
                    api.post('/ai/generate-description', { topic, prompt, platform: p }).then((res) => ({ platform: p, text: res.data?.content ?? '' }))
                )
            )
                .then((results) => {
                    setContentByPlatform((prev) => {
                        const next = { ...prev };
                        for (const { platform, text } of results) next[platform] = text;
                        return next;
                    });
                    setAiModalOpen(false);
                })
                .catch((err) => {
                    const msg = err.response?.data?.message ?? 'Failed to generate for one or more platforms. Try again.';
                    setAiError(msg);
                })
                .finally(() => setAiLoading(false));
        } else {
            // Single description for all platforms (optional platform hint)
            api.post('/ai/generate-description', {
                topic,
                prompt,
                platform: aiPlatform || undefined,
            }).then((res) => {
                const text = res.data?.content ?? '';
                setContent(text);
                setAiModalOpen(false);
            }).catch((err) => {
                const msg = err.response?.data?.message ?? 'Failed to generate. Try again.';
                setAiError(msg);
            }).finally(() => setAiLoading(false));
        }
    }, [aiTopic, aiPrompt, aiPlatform, differentContentPerPlatform, platforms]);

    // Persist composer draft when state changes (debounced; shorter delay when only media changed so carousel keeps all images after upload)
    const mediaSignature = mediaList.map((m) => m.fileUrl).join('|');
    const debounceMs = mediaList.some((m) => isPersistableMediaUrl(m.fileUrl)) ? 150 : 400;
    useEffect(() => {
        if (!draftRestored) return;
        const t = setTimeout(() => {
            try {
                const mediaListToSave = mediaList.filter((m) => isPersistableMediaUrl(m.fileUrl));
                const mediaByPlatformToSave: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]> = {};
                for (const [k, arr] of Object.entries(mediaByPlatform)) {
                    const v = (arr || []).filter((m) => isPersistableMediaUrl(m.fileUrl));
                    if (v.length) mediaByPlatformToSave[k] = v;
                }
                const draft: ComposerDraft = {
                    platforms,
                    content,
                    contentByPlatform,
                    differentContentPerPlatform,
                    mediaType,
                    mediaList: mediaListToSave,
                    mediaByPlatform: mediaByPlatformToSave,
                    differentMediaPerPlatform,
                    scheduledAt,
                    scheduleDelivery,
                    selectedHashtags,
                    differentHashtagsPerPlatform,
                    selectedHashtagsByPlatform,
                    commentAutomationEnabled,
                    commentAutomationKeywords,
                    commentAutomationReplyTemplate,
                    commentAutomationUsePrivateReply,
                };
                localStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify(draft));
            } catch (_) { /* ignore */ }
        }, debounceMs);
        return () => clearTimeout(t);
    }, [
        draftRestored,
        platforms,
        content,
        contentByPlatform,
        differentContentPerPlatform,
        mediaType,
        mediaList,
        mediaByPlatform,
        differentMediaPerPlatform,
        scheduledAt,
        scheduleDelivery,
        selectedHashtags,
        differentHashtagsPerPlatform,
        selectedHashtagsByPlatform,
        commentAutomationEnabled,
        commentAutomationKeywords,
        commentAutomationReplyTemplate,
        commentAutomationUsePrivateReply,
        mediaSignature,
        debounceMs,
    ]);

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

    // Photo / Video / Reel: only one item allowed; trim if more
    useEffect(() => {
        const singleFormat = mediaType === 'photo' || mediaType === 'video' || mediaType === 'reel';
        if (singleFormat && mediaList.length > 1) {
            setMediaList([mediaList[0]]);
        }
    }, [mediaType, mediaList.length]);

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
        const singleFormat = mediaType === 'photo' || mediaType === 'video' || mediaType === 'reel';
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
                const item = await uploadFile(file);
                setMediaList((prev) => (singleFormat ? [item] : [...prev, item]));
                if (singleFormat) break; // only one file for Photo / Video / Reel
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

    const moveCarouselToPosition = (fromIndex: number, toPosition: number) => {
        if (fromIndex === toPosition) return;
        setMediaList((prev) => {
            const arr = [...prev];
            const [item] = arr.splice(fromIndex, 1);
            arr.splice(toPosition, 0, item);
            return arr;
        });
    };

    const [carouselDraggingIndex, setCarouselDraggingIndex] = useState<number | null>(null);
    const handleCarouselDragStart = (e: React.DragEvent, index: number) => {
        setCarouselDraggingIndex(index);
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleCarouselDragEnd = () => setCarouselDraggingIndex(null);
    const handleCarouselDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    const handleCarouselDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        setCarouselDraggingIndex(null);
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
        moveCarouselToPosition(fromIndex, toIndex);
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
                scheduleDelivery?: 'auto' | 'email_links';
                commentAutomation?: { keywords: string[]; replyTemplate: string; usePrivateReply?: boolean } | null;
            } = {
                content: contentFinal,
                media: mediaList,
                targets,
                scheduledAt: scheduledAt || undefined,
                scheduleDelivery: scheduledAt ? scheduleDelivery : undefined,
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
            clearComposerDraft();
            if (scheduledAt) {
                router.push('/calendar?scheduled=1');
            } else {
                router.push('/dashboard');
            }
        } catch (err: unknown) {
            let msg = 'Failed to create post';
            if (err && typeof err === 'object' && 'response' in err) {
                const res = (err as { response?: { data?: unknown; status?: number } }).response;
                const status = res?.status;
                const data = res?.data;
                if (typeof window !== 'undefined') console.error('[Composer] Create post error:', { status, data, err });
                if (status === 401) {
                    msg = 'Session expired or not logged in. Please sign in again.';
                } else if (status === 400) {
                    msg = typeof data === 'object' && data !== null && 'message' in data ? String((data as { message: unknown }).message) : 'Invalid request. Connect at least one account for the selected platforms in Accounts.';
                } else if (data != null) {
                    if (typeof data === 'string') msg = data;
                    else if (typeof data === 'object' && data !== null && 'message' in data && typeof (data as { message: unknown }).message === 'string') msg = (data as { message: string }).message;
                    else if (typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string') msg = (data as { error: string }).error;
                }
            } else {
                if (err instanceof Error) msg = err.message;
                if (typeof window !== 'undefined') console.error('[Composer] Create post error (no response):', err);
            }
            if (msg === 'Failed to create post') msg += ' Open the browser console (F12 → Console) for details.';
            setAlertMessage(msg);
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
            {aiModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={() => !aiLoading && setAiModalOpen(false)} aria-hidden="true" />
                    <div className="relative w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-neutral-900">Generate with AI</h3>
                        {hasBrandContext === false && (
                            <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                                Set up your brand context first in <Link href="/dashboard/ai-assistant" className="underline font-medium">Dashboard → AI Assistant</Link> so the AI can match your voice and audience.
                            </p>
                        )}
                        {hasBrandContext === true && (
                            <>
                                <label className="mt-4 block text-sm font-medium text-neutral-700">What&apos;s this post about?</label>
                                <input
                                    type="text"
                                    value={aiTopic}
                                    onChange={(e) => setAiTopic(e.target.value)}
                                    placeholder="e.g. New feature launch, tip of the week"
                                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                />
                                <label className="mt-3 block text-sm font-medium text-neutral-700">Extra instructions (optional)</label>
                                <textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    placeholder="e.g. Keep it under 150 chars, add a CTA"
                                    rows={2}
                                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                />
                                {differentContentPerPlatform && platforms.length > 0 ? (
                                    <p className="mt-3 text-sm text-neutral-600">
                                        We&apos;ll generate a separate description for each selected platform: {platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')}.
                                    </p>
                                ) : platforms.length > 0 ? (
                                    <>
                                        <label className="mt-3 block text-sm font-medium text-neutral-700">Platform (optional)</label>
                                        <select
                                            value={aiPlatform}
                                            onChange={(e) => setAiPlatform(e.target.value)}
                                            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                        >
                                            <option value="">Any</option>
                                            {platforms.map((p) => (
                                                <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                                            ))}
                                        </select>
                                    </>
                                ) : null}
                                {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
                                {aiLoading && differentContentPerPlatform && platforms.length > 1 && (
                                    <p className="mt-2 text-sm text-neutral-500">Generating for {platforms.length} platforms…</p>
                                )}
                                <div className="mt-6 flex flex-wrap justify-end gap-3">
                                    <button type="button" onClick={() => !aiLoading && setAiModalOpen(false)} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
                                    <button type="button" onClick={handleAiGenerate} disabled={aiLoading} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                                        {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                        Generate
                                    </button>
                                </div>
                            </>
                        )}
                        {hasBrandContext === null && (
                            <div className="mt-4 flex items-center gap-2 text-neutral-500">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm">Checking brand context…</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
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
                                icon={<InstagramIcon size={26} />}
                                active={platforms.includes('INSTAGRAM')}
                                onClick={() => setPlatforms(prev => prev.includes('INSTAGRAM') ? prev.filter(p => p !== 'INSTAGRAM') : [...prev, 'INSTAGRAM'])}
                            />
                            <PlatformToggle
                                platform="TIKTOK"
                                label="TikTok"
                                icon={<TikTokIcon size={26} />}
                                active={platforms.includes('TIKTOK')}
                                onClick={() => setPlatforms(prev => prev.includes('TIKTOK') ? prev.filter(p => p !== 'TIKTOK') : [...prev, 'TIKTOK'])}
                            />
                            <PlatformToggle
                                platform="YOUTUBE"
                                label="YouTube"
                                icon={<YoutubeIcon size={26} />}
                                active={platforms.includes('YOUTUBE')}
                                onClick={() => setPlatforms(prev => prev.includes('YOUTUBE') ? prev.filter(p => p !== 'YOUTUBE') : [...prev, 'YOUTUBE'])}
                            />
                            <PlatformToggle
                                platform="FACEBOOK"
                                label="Facebook"
                                icon={<FacebookIcon size={26} />}
                                active={platforms.includes('FACEBOOK')}
                                onClick={() => setPlatforms(prev => prev.includes('FACEBOOK') ? prev.filter(p => p !== 'FACEBOOK') : [...prev, 'FACEBOOK'])}
                            />
                            <PlatformToggle
                                platform="TWITTER"
                                label="Twitter/X"
                                icon={<XTwitterIcon size={26} className="text-neutral-800" />}
                                active={platforms.includes('TWITTER')}
                                onClick={() => setPlatforms(prev => prev.includes('TWITTER') ? prev.filter(p => p !== 'TWITTER') : [...prev, 'TWITTER'])}
                            />
                            <PlatformToggle
                                platform="LINKEDIN"
                                label="LinkedIn"
                                icon={<LinkedinIcon size={26} />}
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
                                <p className="text-sm font-medium text-neutral-700">Choose what to upload</p>
                                <div className="flex flex-wrap gap-2">
                                    {(['photo', 'video', 'reel', 'carousel'] as const).map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => {
                                                if (type !== mediaType) {
                                                    setMediaType(type);
                                                    setMediaList([]);
                                                    setMediaByPlatform((prev) => {
                                                        const next = { ...prev };
                                                        for (const p of Object.keys(next)) next[p] = [];
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${mediaType === type
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                                }`}
                                        >
                                            {MEDIA_RECOMMENDATIONS[type].label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-neutral-500">{MEDIA_RECOMMENDATIONS[mediaType].hint}</p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={MEDIA_RECOMMENDATIONS[mediaType].accept}
                                    multiple={MEDIA_RECOMMENDATIONS[mediaType].multiple}
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
                                        {mediaType === 'carousel'
                                            ? 'Add images for carousel'
                                            : `Add ${MEDIA_RECOMMENDATIONS[mediaType].label.toLowerCase()} from computer`}
                                    </button>
                                    {mediaUploading && <span className="text-sm text-neutral-500">Uploading…</span>}
                                </div>
                                {mediaUploadError && <p className="text-sm text-red-600">{mediaUploadError}</p>}
                                <div className="grid grid-cols-4 gap-3">
                                    {mediaList.map((m, i) => (
                                        <div
                                            key={i}
                                            className={`relative group aspect-square rounded-xl overflow-hidden bg-neutral-100 border-2 ${mediaType === 'carousel' ? 'cursor-grab active:cursor-grabbing border-neutral-300 hover:border-indigo-400' : 'border-neutral-200'} ${carouselDraggingIndex === i ? 'opacity-50 ring-2 ring-indigo-400' : ''}`}
                                            onClick={mediaType === 'carousel' ? () => moveCarouselToPosition(i, 0) : undefined}
                                            role={mediaType === 'carousel' ? 'button' : undefined}
                                            draggable={mediaType === 'carousel'}
                                            onDragStart={mediaType === 'carousel' ? (e) => handleCarouselDragStart(e, i) : undefined}
                                            onDragEnd={mediaType === 'carousel' ? handleCarouselDragEnd : undefined}
                                            onDragOver={mediaType === 'carousel' ? handleCarouselDragOver : undefined}
                                            onDrop={mediaType === 'carousel' ? (e) => handleCarouselDrop(e, i) : undefined}
                                        >
                                            {m.type === 'VIDEO' ? (
                                                <video src={mediaDisplayUrl(m.fileUrl)} className="object-cover w-full h-full pointer-events-none" muted playsInline />
                                            ) : (
                                                <img src={mediaDisplayUrl(m.fileUrl)} alt="media" className="object-cover w-full h-full pointer-events-none" draggable={false} />
                                            )}
                                            {mediaType === 'carousel' && (
                                                <span className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-black/70 text-white text-sm font-bold flex items-center justify-center pointer-events-none">
                                                    {i + 1}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleRemoveMedia(i); }}
                                                className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {mediaType === 'carousel' && mediaList.length > 1 && (
                                    <p className="text-xs text-neutral-500">Drag images to reorder. Click an image to move it to position 1.</p>
                                )}
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
                                                        <video src={mediaDisplayUrl(m.fileUrl)} className="w-full h-full object-cover" muted playsInline />
                                                    ) : (
                                                        <img src={mediaDisplayUrl(m.fileUrl)} alt="" className="w-full h-full object-cover" />
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
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={openAiModal}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Sparkles size={16} />
                                Generate with AI
                            </button>
                            <span className="text-xs text-neutral-500">Optional. Set brand context in Dashboard → AI Assistant first.</span>
                        </div>
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
                        <p className="text-sm text-neutral-500">When comments contain your keywords on this post, automatically reply (or send a private DM on Instagram). Your settings are saved with the post. Auto-reply will work first on Instagram when we enable it; Twitter/X and LinkedIn support may follow (LinkedIn’s API is more limited).</p>
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
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-neutral-700">
                                {scheduledAt ? 'At scheduled time:' : 'When you set a date above, at that time:'}
                            </p>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="scheduleDelivery"
                                    checked={scheduleDelivery === 'auto'}
                                    onChange={() => setScheduleDelivery('auto')}
                                    className="text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-neutral-800">Post automatically to all platforms</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="scheduleDelivery"
                                    checked={scheduleDelivery === 'email_links'}
                                    onChange={() => setScheduleDelivery('email_links')}
                                    className="text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-neutral-800">Email me a link per platform so I can open each one, edit or add sound, and publish manually</span>
                            </label>
                            {scheduleDelivery === 'email_links' && scheduledAt && (
                                <p className="text-xs text-neutral-500 mt-1 ml-6">You will receive the email when the scheduled time is reached (usually within a few minutes).</p>
                            )}
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
                                const accountForPlatform = accounts.find((a: { platform: string }) => a.platform === p) as { username?: string; profilePicture?: string } | undefined;
                                return (
                                    <PostPreview
                                        key={p}
                                        platform={p}
                                        profileName={accountForPlatform?.username ?? ''}
                                        profilePicture={accountForPlatform?.profilePicture ?? undefined}
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

function PostPreview({
    platform,
    profileName,
    profilePicture,
    content,
    media,
}: {
    platform: string;
    profileName: string;
    profilePicture?: string;
    content: string;
    media: { fileUrl: string; type: string }[];
}) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const slideIndex = media.length > 0 ? Math.min(currentSlide, media.length - 1) : 0;
    const currentMedia = media[slideIndex];

    const PlatformIcon = () => {
        switch (platform) {
            case 'INSTAGRAM': return <InstagramIcon size={22} />;
            case 'YOUTUBE': return <YoutubeIcon size={22} />;
            case 'TIKTOK': return <TikTokIcon size={22} />;
            case 'FACEBOOK': return <FacebookIcon size={22} />;
            case 'TWITTER': return <XTwitterIcon size={22} className="text-neutral-800" />;
            case 'LINKEDIN': return <LinkedinIcon size={22} />;
            default: return <Video size={22} className="text-neutral-500" />;
        }
    };
    return (
        <div className="card overflow-hidden !p-0 max-w-sm mx-auto shadow-lg border border-neutral-200">
            <div className="p-3 border-b border-neutral-100 flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 overflow-hidden">
                    {profilePicture ? (
                        <img src={profilePicture} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <PlatformIcon />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{profileName || 'Your profile'}</p>
                    <p className="text-xs text-neutral-500 truncate">{PLATFORM_LABELS[platform] || platform}</p>
                </div>
            </div>
            <div className="aspect-square bg-neutral-50 flex items-center justify-center overflow-hidden relative">
                {currentMedia ? (
                    <>
                        {currentMedia.type === 'VIDEO' ? (
                            <video src={mediaDisplayUrl(currentMedia.fileUrl)} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                            <img src={mediaDisplayUrl(currentMedia.fileUrl)} alt="preview" className="w-full h-full object-cover" />
                        )}
                        {media.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setCurrentSlide((s) => (s <= 0 ? media.length - 1 : s - 1)); }}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center shadow"
                                    aria-label="Previous"
                                >
                                    <ChevronLeft size={22} />
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setCurrentSlide((s) => (s >= media.length - 1 ? 0 : s + 1)); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center shadow"
                                    aria-label="Next"
                                >
                                    <ChevronRight size={22} />
                                </button>
                                <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium">
                                    {slideIndex + 1} / {media.length}
                                </span>
                            </>
                        )}
                    </>
                ) : (
                    <ImageIcon size={36} className="text-neutral-200" strokeWidth={1.5} />
                )}
            </div>
            <div className="p-3 space-y-2">
                <p className="text-sm text-neutral-800 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    {content || 'Your caption will appear here...'}
                </p>
            </div>
        </div>
    );
}
