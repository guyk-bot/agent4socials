'use client';

import React, { useEffect, useState, useRef } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import {
    Search,
    Filter,
    MoreVertical,
    Video,
    ExternalLink,
    ChevronRight,
    Loader2,
    ImageIcon,
} from 'lucide-react';
import { useAppData } from '@/context/AppDataContext';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';
import { InstagramIcon, YoutubeIcon, TikTokIcon, FacebookIcon, XTwitterIcon, LinkedinIcon, PinterestIcon } from '@/components/SocialPlatformIcons';

function postMediaThumbUrl(mediaItem: { fileUrl: string; type: string; metadata?: { thumbnailUrl?: string } | null } | undefined): string | null {
    if (!mediaItem?.fileUrl) return null;
    // For VIDEO/Reels: prefer thumbnail from metadata; don't use video URL as img src (fails to render)
    const url = mediaItem.type === 'VIDEO'
        ? (mediaItem.metadata && typeof mediaItem.metadata === 'object' && (mediaItem.metadata.thumbnailUrl as string | undefined)) || null
        : mediaItem.fileUrl;
    if (typeof url !== 'string' || !url) return null;
    if (url.startsWith('http') && (url.includes('r2.dev') || url.includes('cloudflarestorage.com'))) {
        return `/api/media/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
}

function isReelLikePost(post: any): boolean {
    if (typeof post?.mediaType === 'string' && post.mediaType.toLowerCase() === 'reel') return true;
    const firstType = Array.isArray(post?.media) && post.media.length > 0 ? post.media[0]?.type : null;
    const targets = Array.isArray(post?.targetPlatforms) ? post.targetPlatforms : [];
    return firstType === 'VIDEO' && (targets.includes('TIKTOK') || targets.includes('YOUTUBE') || targets.includes('INSTAGRAM'));
}

function PostMediaThumb({
    mediaItem,
    reelLike = false,
}: {
    mediaItem: { fileUrl: string; type: string; metadata?: { thumbnailUrl?: string } | null };
    reelLike?: boolean;
}) {
    const [imgError, setImgError] = useState(false);
    const thumbUrl = postMediaThumbUrl(mediaItem);
    const showIcon = !thumbUrl || imgError;
    return (
        <div className={`${reelLike ? 'w-10 h-16' : 'w-12 h-12'} rounded-lg bg-gray-100 overflow-hidden flex-shrink-0`}>
            {thumbUrl && !imgError && (
                <img src={thumbUrl} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
            )}
            {showIcon && (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                    {mediaItem.type === 'VIDEO' ? <Video size={20} /> : <ImageIcon size={20} />}
                </div>
            )}
        </div>
    );
}

export default function PostsPage() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const appData = useAppData();
    const appDataRef = useRef(appData);
    appDataRef.current = appData;
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');

    const draftSavedParam = searchParams.get('draft_saved');
    const refreshParam = searchParams.get('refresh');

    useEffect(() => {
        if (pathname !== '/posts') return;
        let cancelled = false;
        const forceRefresh = draftSavedParam === '1' || refreshParam === '1';
        const fromCache = appDataRef.current?.getScheduledPosts?.();
        const hasCachedList = Array.isArray(fromCache) && fromCache.length > 0;

        if (hasCachedList && !forceRefresh) {
            setPosts(fromCache as any[]);
            setLoading(false);
            return () => { cancelled = true; };
        }

        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 45_000);

        (async () => {
            try {
                setLoading(true);
                const res = await api.get('/posts', { signal: ctrl.signal });
                if (cancelled) return;
                const list = Array.isArray(res.data) ? res.data : [];
                setPosts(list);
                appDataRef.current?.setScheduledPosts?.(list);
            } catch {
                if (!cancelled) console.error('Failed to fetch posts');
            } finally {
                window.clearTimeout(t);
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            ctrl.abort();
            window.clearTimeout(t);
        };
    }, [pathname, draftSavedParam, refreshParam]);

    const highlightId = searchParams.get('highlight');
    useEffect(() => {
        if (!highlightId || loading || posts.length === 0) return;
        const scrollToHighlight = () => {
            const el = document.getElementById(`post-row-${highlightId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                router.replace('/posts', { scroll: false });
            }
        };
        const t = requestAnimationFrame(() => requestAnimationFrame(scrollToHighlight));
        return () => cancelAnimationFrame(t);
    }, [highlightId, loading, posts.length, router]);

    const filteredPosts = posts.filter((p: any) => {
        if (filter === 'ALL') return true;
        return p.status === filter;
    });

    const [showDraftSavedBanner, setShowDraftSavedBanner] = useState(false);
    const draftSaved = searchParams.get('draft_saved') === '1';
    const published = searchParams.get('published') === '1';
    useEffect(() => {
        if (draftSaved) {
            setShowDraftSavedBanner(true);
            router.replace('/posts', { scroll: false });
        }
    }, [draftSaved, router]);

    const [showPublishedBanner, setShowPublishedBanner] = useState(false);
    useEffect(() => {
        if (published) {
            setShowPublishedBanner(true);
            const keepHighlight = highlightId ? `?highlight=${encodeURIComponent(highlightId)}` : '';
            router.replace(`/posts${keepHighlight}`, { scroll: false });
        }
    }, [published, router, highlightId]);

    return (
        <div className="space-y-8">
            <LoadingVideoOverlay loading={loading} />
            {showDraftSavedBanner && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center justify-between">
                    <span>Draft saved. Find it in History below.</span>
                    <button type="button" onClick={() => setShowDraftSavedBanner(false)} className="text-green-600 hover:text-green-800 font-medium">Dismiss</button>
                </div>
            )}
            {showPublishedBanner && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center justify-between">
                    <span>Post published. Find it in History below.</span>
                    <button type="button" onClick={() => setShowPublishedBanner(false)} className="text-green-600 hover:text-green-800 font-medium">Dismiss</button>
                </div>
            )}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Post History</h1>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search posts..."
                            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-[var(--button)] focus:border-[var(--button)] bg-white"
                        />
                    </div>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-[var(--button)] focus:border-[var(--button)] bg-white cursor-pointer"
                    >
                        <option value="ALL">All Status</option>
                        <option value="POSTED">Posted</option>
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="DRAFT">Draft</option>
                        <option value="FAILED">Failed</option>
                    </select>
                </div>
            </div>

            <div className="card !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-4">
                        <Loader2 size={32} className="animate-spin text-[var(--button)]" />
                        <p className="text-gray-500">Loading history...</p>
                        <div className="w-full max-w-md space-y-3">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
                            ))}
                        </div>
                    </div>
                ) : filteredPosts.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platforms</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredPosts.map((post: any) => (
                                <tr key={post.id} id={`post-row-${post.id}`} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {(post.scheduledAt || post.postedAt || post.createdAt)
                                            ? new Date(post.scheduledAt || post.postedAt || post.createdAt).toLocaleString(undefined, {
                                                month: 'numeric',
                                                day: 'numeric',
                                                year: 'numeric',
                                                hour: 'numeric',
                                                minute: '2-digit',
                                            })
                                            : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-3">
                                            {post.media?.[0] && (
                                                <PostMediaThumb mediaItem={post.media[0]} reelLike={isReelLikePost(post)} />
                                            )}
                                            {!post.media?.length && (
                                                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400"><ImageIcon size={20} /></div>
                                            )}
                                            <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                                                {post.title || post.content}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {(() => {
                                                const targets = post.targets || [];
                                                const platforms = targets.length > 0 ? targets : (post.targetPlatforms || []).map((p: string) => ({ platform: p, status: post.status, id: p }));
                                                return platforms.length > 0 ? (
                                                platforms.map((t: any) => (
                                                    <span
                                                        key={t.id || t.platform}
                                                        title={typeof t === 'object' && t.socialAccount?.username ? `${t.platform} @${t.socialAccount.username} · ${t.status}` : t.platform || t}
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${(t.status || post.status) === 'POSTED' ? 'bg-green-100 text-green-800' : (t.status || post.status) === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}
                                                    >
                                                        {t.platform === 'INSTAGRAM' && <InstagramIcon size={14} />}
                                                        {t.platform === 'YOUTUBE' && <YoutubeIcon size={14} />}
                                                        {t.platform === 'TIKTOK' && <TikTokIcon size={14} />}
                                                        {t.platform === 'FACEBOOK' && <FacebookIcon size={14} />}
                                                        {t.platform === 'TWITTER' && <XTwitterIcon size={14} />}
                                                        {t.platform === 'LINKEDIN' && <LinkedinIcon size={14} />}
                                                        {t.platform === 'PINTEREST' && <PinterestIcon size={14} />}
                                                        <span>{t.platform}</span>
                                                    </span>
                                                ))
                                                ) : (
                                                <span className="text-gray-400 text-sm">—</span>
                                            );
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            const targets: Array<{ status?: string }> = Array.isArray(post.targets) ? post.targets : [];
                                            const hasPosted = targets.some((t) => t.status === 'POSTED');
                                            const hasFailed = targets.some((t) => t.status === 'FAILED');
                                            const partial = hasPosted && hasFailed;
                                            const label = partial ? 'PARTIAL' : post.status;
                                            const cls = partial
                                                ? 'bg-amber-100 text-amber-800'
                                                : post.status === 'POSTED'
                                                    ? 'bg-green-100 text-green-800'
                                                    : post.status === 'FAILED'
                                                        ? 'bg-red-100 text-red-800'
                                                        : post.status === 'SCHEDULED'
                                                            ? 'bg-neutral-200 text-neutral-700'
                                                            : 'bg-neutral-100 text-neutral-700';
                                            return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/composer?edit=${post.id}`}
                                            prefetch
                                            className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-800"
                                        >
                                            Open in Composer
                                            <ChevronRight size={18} />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : posts.length === 0 ? (
                    <div className="p-16 sm:p-20 text-center space-y-3">
                        <p className="text-gray-900 font-medium text-lg">No post history yet</p>
                        <p className="text-gray-500 text-sm max-w-md mx-auto">
                            Drafts, scheduled posts, and published posts will show up here. Create something in the composer to get started.
                        </p>
                        <Link
                            href="/composer"
                            prefetch
                            className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-neutral-700 hover:bg-neutral-800 transition-colors"
                        >
                            Open Composer
                        </Link>
                    </div>
                ) : (
                    <div className="p-20 text-center">
                        <p className="text-gray-500">No posts match this filter.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
