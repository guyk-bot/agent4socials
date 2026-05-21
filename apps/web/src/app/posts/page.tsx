'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import {
    Search,
    Video,
    ChevronRight,
    Loader2,
    ImageIcon,
    Sparkles,
    ArrowRight,
} from 'lucide-react';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import {
    PostHistoryPlatformFilter,
    postMatchesPlatformFilter,
} from '@/components/posts/PostHistoryPlatformFilter';
import { AnalyticsDateRangePicker } from '@/components/analytics/AnalyticsDateRangePicker';
import {
    getDefaultAnalyticsDateRange,
    localCalendarDateFromIso,
    readStoredAnalyticsDateRange,
    writeStoredAnalyticsDateRange,
} from '@/lib/calendar-date';
import { InstagramIcon, YoutubeIcon, TikTokIcon, FacebookIcon, XTwitterIcon, LinkedinIcon, PinterestIcon } from '@/components/SocialPlatformIcons';
import {
    readScheduledPostsClientCache,
    writeScheduledPostsClientCache,
} from '@/lib/scheduled-posts-client-cache';
import {
    getPostHistoryFormat,
    isPostHistoryVerticalThumb,
    POST_HISTORY_FORMAT_FILTER_OPTIONS,
    type PostHistoryFormat,
    type PostHistoryFormatFilterValue,
    type PostHistoryFormatKey,
} from '@/lib/post-history-format';
import { PostHistoryFilterDropdown } from '@/components/posts/PostHistoryFilterDropdown';
import {
    mergePostsHistoryLists,
    postsHistoryListsVisuallyEqual,
    upsertPostInHistoryList,
    type PostHistoryRow,
} from '@/lib/posts-history-merge';

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

function postCalendarDate(post: { scheduledAt?: string | null; postedAt?: string | null; createdAt?: string | null }): string {
    const iso = post.scheduledAt || post.postedAt || post.createdAt;
    return iso ? localCalendarDateFromIso(iso) : '';
}

function postSearchHaystack(post: any): string {
    const parts: string[] = [];
    if (post?.title) parts.push(String(post.title));
    if (post?.content) parts.push(String(post.content));
    if (post?.status) parts.push(String(post.status));
    if (Array.isArray(post?.targetPlatforms)) {
        parts.push(...post.targetPlatforms.map(String));
    }
    if (Array.isArray(post?.targets)) {
        for (const t of post.targets) {
            if (t?.platform) parts.push(String(t.platform));
            if (t?.status) parts.push(String(t.status));
            if (t?.socialAccount?.username) parts.push(String(t.socialAccount.username));
        }
    }
    if (post?.contentByPlatform && typeof post.contentByPlatform === 'object') {
        parts.push(...Object.values(post.contentByPlatform as Record<string, unknown>).map(String));
    }
    return parts.join(' ').toLowerCase();
}

function postMatchesSearch(post: any, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return postSearchHaystack(post).includes(q);
}

const POST_FORMAT_BADGE_CLASS: Record<PostHistoryFormatKey, string> = {
    photo: 'bg-slate-100 text-slate-800 dark:bg-neutral-800 dark:text-neutral-200',
    carousel: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200',
    story: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200',
    reel: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200',
    video: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
    text: 'bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300',
};

function PostFormatBadge({ format }: { format: PostHistoryFormat }) {
    return (
        <span
            className={`mr-1.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${POST_FORMAT_BADGE_CLASS[format.key]}`}
        >
            {format.label}
        </span>
    );
}

function postMatchesStatusFilter(post: any, filter: string): boolean {
    if (filter === 'ALL') return true;
    const targets: Array<{ status?: string }> = Array.isArray(post.targets) ? post.targets : [];
    const hasPosted = targets.some((t) => t.status === 'POSTED');
    const hasFailed = targets.some((t) => t.status === 'FAILED');
    const partial = hasPosted && hasFailed;
    if (filter === 'POSTED') return post.status === 'POSTED' || partial;
    if (filter === 'FAILED') return post.status === 'FAILED' || partial;
    return post.status === filter;
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
    const { user } = useAuth();
    const appData = useAppData();
    const scheduledPostsFromApp = appData?.scheduledPosts ?? [];
    const appDataRef = useRef(appData);
    appDataRef.current = appData;
    const [posts, setPosts] = useState<PostHistoryRow[]>([]);
    const postsRef = useRef<PostHistoryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filter, setFilter] = useState('ALL');
    const [formatFilter, setFormatFilter] = useState<PostHistoryFormatFilterValue>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
    const [dateRange, setDateRange] = useState(() => getDefaultAnalyticsDateRange());
    const accountsCache = useAccountsCache();
    const connectedPlatforms = React.useMemo(() => {
        const accounts = accountsCache?.cachedAccounts ?? [];
        return [...new Set(accounts.map((a) => a.platform).filter(Boolean))];
    }, [accountsCache?.cachedAccounts]);

    const togglePlatformFilter = useCallback((platform: string) => {
        setSelectedPlatforms((prev) =>
            prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
        );
    }, []);

    useEffect(() => {
        if (!user?.id) return;
        const stored = readStoredAnalyticsDateRange(user.id);
        if (stored) setDateRange(stored);
    }, [user?.id]);

    const onDateRangeChange = useCallback(
        (range: { start: string; end: string }) => {
            setDateRange(range);
            if (user?.id) writeStoredAnalyticsDateRange(range, user.id);
        },
        [user?.id]
    );

    const draftSavedParam = searchParams.get('draft_saved');
    const refreshParam = searchParams.get('refresh');

    const applyHistoryList = useCallback((incoming: PostHistoryRow[]) => {
        const merged = mergePostsHistoryLists(postsRef.current, incoming);
        if (postsHistoryListsVisuallyEqual(postsRef.current, merged)) return;
        postsRef.current = merged;
        setPosts(merged);
        appDataRef.current?.setScheduledPosts?.(merged as never);
        writeScheduledPostsClientCache(merged);
    }, []);

    const applyHistoryPost = useCallback((post: PostHistoryRow) => {
        const merged = upsertPostInHistoryList(postsRef.current, post);
        if (postsHistoryListsVisuallyEqual(postsRef.current, merged)) return;
        postsRef.current = merged;
        setPosts(merged);
        appDataRef.current?.setScheduledPosts?.(merged as never);
        writeScheduledPostsClientCache(merged);
    }, []);

    // Paint cached rows before first paint so History is never empty while the network warms up.
    useLayoutEffect(() => {
        if (pathname !== '/posts') return;
        const fromLocal = readScheduledPostsClientCache() as PostHistoryRow[];
        if (fromLocal.length > 0) {
            applyHistoryList(fromLocal);
            setLoading(false);
        }
    }, [pathname, applyHistoryList]);

    // React as soon as dashboard prefetch (or Composer) updates shared post list.
    useEffect(() => {
        if (pathname !== '/posts') return;
        if (!Array.isArray(scheduledPostsFromApp) || scheduledPostsFromApp.length === 0) return;
        applyHistoryList(scheduledPostsFromApp as PostHistoryRow[]);
        setLoading(false);
    }, [pathname, scheduledPostsFromApp, applyHistoryList]);

    useEffect(() => {
        if (pathname !== '/posts') return;
        let cancelled = false;
        const hadRows = postsRef.current.length > 0;
        if (!hadRows) setLoading(true);

        (async () => {
            try {
                const res = await api.get('/posts', { timeout: 30_000, params: { _: Date.now() } });
                if (cancelled) return;
                const list = Array.isArray(res.data) ? (res.data as PostHistoryRow[]) : [];
                applyHistoryList(list);
                appDataRef.current?.setScheduledPosts?.(list as never);
                setLoadError(null);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to fetch posts', err);
                const res =
                    err && typeof err === 'object' && 'response' in err
                        ? (err as { response?: { status?: number; data?: { message?: string } } }).response
                        : undefined;
                const serverMsg =
                    typeof res?.data?.message === 'string' && res.data.message.trim()
                        ? res.data.message.trim()
                        : null;
                const poolBusy = res?.status === 503;
                if (postsRef.current.length > 0) {
                    setLoadError(
                        poolBusy
                            ? serverMsg ?? 'Database is busy. Showing cached history; refresh again in a few seconds.'
                            : 'Could not refresh history right now. Showing latest available data.'
                    );
                } else {
                    setLoadError(
                        poolBusy
                            ? serverMsg ?? 'Database is busy. Wait a few seconds and refresh, or close extra dashboard tabs.'
                            : 'Could not load post history. Check your connection and try again.'
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [pathname, draftSavedParam, refreshParam, applyHistoryList]);

    const highlightId = searchParams.get('highlight');
    useEffect(() => {
        if (pathname !== '/posts' || !highlightId) return;
        let cancelled = false;
        api.get<PostHistoryRow>(`/posts/${highlightId}`, { timeout: 20_000 })
            .then((r) => {
                if (!cancelled && r.data && typeof r.data === 'object' && r.data.id) {
                    applyHistoryPost(r.data);
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [pathname, highlightId, applyHistoryPost]);

    const publishingPostIds = useMemo(
        () =>
            posts
                .filter(
                    (p) =>
                        p?.status === 'POSTING' &&
                        typeof p?.id === 'string' &&
                        p.id.length > 0 &&
                        !p.id.startsWith('pending-')
                )
                .map((p) => p.id as string),
        [posts]
    );

    useEffect(() => {
        if (pathname !== '/posts' || publishingPostIds.length === 0) return;
        let cancelled = false;
        const tick = async () => {
            const results = await Promise.all(
                publishingPostIds.map((id) =>
                    api.get<PostHistoryRow>(`/posts/${id}`, { timeout: 30_000 }).then((r) => r.data).catch(() => null)
                )
            );
            if (cancelled) return;
            for (const post of results) {
                if (post && typeof post === 'object' && post.id) applyHistoryPost(post);
            }
        };
        void tick();
        const id = window.setInterval(() => void tick(), 8_000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [pathname, publishingPostIds.join(','), applyHistoryPost]);

    useEffect(() => {
        if (pathname !== '/posts') return;
        const onRefresh = (ev: Event) => {
            const detail = (ev as CustomEvent<{ posts?: PostHistoryRow[]; post?: PostHistoryRow }>).detail;
            if (detail?.post && typeof detail.post === 'object') {
                applyHistoryPost(detail.post);
                return;
            }
            const list = Array.isArray(detail?.posts) ? detail.posts : [];
            if (list.length === 0) return;
            applyHistoryList(list);
        };
        window.addEventListener('agent4socials:posts-history-refresh', onRefresh);
        return () => window.removeEventListener('agent4socials:posts-history-refresh', onRefresh);
    }, [pathname, applyHistoryList, applyHistoryPost]);

    useEffect(() => {
        if (!highlightId || loading || posts.length === 0) return;
        const scrollToHighlight = () => {
            const el = document.getElementById(`post-row-${highlightId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };
        const t = requestAnimationFrame(() => requestAnimationFrame(scrollToHighlight));
        return () => cancelAnimationFrame(t);
    }, [highlightId, loading, posts.length, router]);

    const filteredPosts = posts.filter((p: any) => {
        if (p?.status === 'POSTING' || p?._optimistic) return true;
        const d = postCalendarDate(p);
        if (d && (d < dateRange.start || d > dateRange.end)) return false;
        if (!postMatchesSearch(p, searchQuery)) return false;
        if (!postMatchesPlatformFilter(p, selectedPlatforms)) return false;
        if (!postMatchesStatusFilter(p, filter)) return false;
        if (formatFilter !== 'ALL' && getPostHistoryFormat(p).key !== formatFilter) return false;
        return true;
    });

    const [showDraftSavedBanner, setShowDraftSavedBanner] = useState(false);
    const draftSaved = searchParams.get('draft_saved') === '1';
    const published = searchParams.get('published') === '1';
    const partialPublished = searchParams.get('partial') === '1';
    useEffect(() => {
        if (draftSaved) {
            setShowDraftSavedBanner(true);
            router.replace('/posts', { scroll: false });
        }
    }, [draftSaved, router]);

    const [showPublishedBanner, setShowPublishedBanner] = useState(false);
    const [showPartialBanner, setShowPartialBanner] = useState(false);
    useEffect(() => {
        if (published) {
            setShowPublishedBanner(true);
            const keepHighlight = highlightId ? `?highlight=${encodeURIComponent(highlightId)}` : '';
            router.replace(`/posts${keepHighlight}`, { scroll: false });
        }
    }, [published, router, highlightId]);
    useEffect(() => {
        if (partialPublished) {
            setShowPartialBanner(true);
            const keepHighlight = highlightId ? `?highlight=${encodeURIComponent(highlightId)}` : '';
            router.replace(`/posts${keepHighlight}`, { scroll: false });
        }
    }, [partialPublished, router, highlightId]);

    return (
        <div className="analytics-dark-scope space-y-3" style={{ maxWidth: 1400 }}>
            {loadError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {loadError}
                </div>
            )}
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
            {showPartialBanner && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center justify-between">
                    <span>Published on some platforms only. Check per-platform status below (PARTIAL). Retry failed platforms from Composer.</span>
                    <button type="button" onClick={() => setShowPartialBanner(false)} className="text-amber-800 hover:text-amber-950 font-medium">Dismiss</button>
                </div>
            )}

            <div className="w-full rounded-2xl border upgrade-banner-warm px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm ring-1 ring-slate-200/70 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 upgrade-badge-warm">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Your plan</span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                        <span className="text-lg font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-tight">Free</span>
                        <span className="text-sm text-neutral-700 dark:text-neutral-300 leading-snug">
                            Unlock more than 30 days of history without watermarks and more analytics when you upgrade.
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => router.push('/pricing')}
                    className="shrink-0 inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] gradient-cta-pro"
                >
                    Upgrade now
                    <ArrowRight className="w-4 h-4" aria-hidden />
                </button>
            </div>

            <section className="rounded-[20px] border p-3 md:p-3.5 bg-[var(--card-bg)] border-[var(--border)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <PostHistoryPlatformFilter
                        connectedPlatforms={connectedPlatforms}
                        selectedPlatforms={selectedPlatforms}
                        onTogglePlatform={togglePlatformFilter}
                    />
                    <AnalyticsDateRangePicker
                        start={dateRange.start}
                        end={dateRange.end}
                        onChange={onDateRangeChange}
                    />
                </div>
            </section>

            <div className="flex items-center justify-between pt-2">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Post History</h1>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search posts..."
                            aria-label="Search posts"
                            className="pl-10 pr-4 py-2 border border-gray-200 dark:border-neutral-700 rounded-lg text-sm focus:ring-[var(--button)] focus:border-[var(--button)] bg-white dark:bg-neutral-900 dark:text-neutral-100 w-48 sm:w-56"
                        />
                    </div>
                    <PostHistoryFilterDropdown
                        ariaLabel="Filter by status"
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { value: 'ALL', label: 'All Status' },
                            { value: 'POSTED', label: 'Posted' },
                            { value: 'SCHEDULED', label: 'Scheduled' },
                            { value: 'DRAFT', label: 'Draft' },
                            { value: 'FAILED', label: 'Failed' },
                        ]}
                    />
                    <PostHistoryFilterDropdown
                        ariaLabel="Filter by format"
                        value={formatFilter}
                        onChange={(v) => setFormatFilter(v as PostHistoryFormatFilterValue)}
                        options={POST_HISTORY_FORMAT_FILTER_OPTIONS}
                    />
                </div>
            </div>

            <div className="card !p-0 overflow-hidden">
                {loading && posts.length === 0 ? (
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
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-800">
                        <thead className="bg-gray-50 dark:bg-neutral-900/60">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wider">Content</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wider">Platforms</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-neutral-800">
                            {filteredPosts.map((post: any) => {
                                const postFormat = getPostHistoryFormat(post);
                                return (
                                <tr
                                    key={post.id}
                                    id={`post-row-${post.id}`}
                                    className={`transition-colors group outline-none focus:outline-none ${
                                        highlightId === post.id
                                            ? 'bg-amber-50/70 dark:bg-amber-950/30'
                                            : 'hover:bg-gray-50 dark:hover:bg-neutral-800/40'
                                    }`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-neutral-400">
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
                                                <PostMediaThumb
                                                    mediaItem={post.media[0]}
                                                    reelLike={isPostHistoryVerticalThumb(postFormat)}
                                                />
                                            )}
                                            {!post.media?.length && (
                                                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400"><ImageIcon size={20} /></div>
                                            )}
                                            <div className="text-sm font-medium text-gray-900 dark:text-neutral-100 truncate max-w-xs">
                                                <PostFormatBadge format={postFormat} />
                                                {post.title || post.content || (
                                                    <span className="text-gray-400 dark:text-neutral-500">No caption</span>
                                                )}
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
                                                        title={
                                                            typeof t === 'object'
                                                                ? [
                                                                      t.socialAccount?.username ? `${t.platform} @${t.socialAccount.username}` : t.platform,
                                                                      t.status,
                                                                      t.error ? `Error: ${t.error}` : null,
                                                                  ]
                                                                      .filter(Boolean)
                                                                      .join(' · ')
                                                                : String(t.platform || t)
                                                        }
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                                            (t.status || post.status) === 'POSTED'
                                                                ? 'bg-green-100 text-green-800'
                                                                : (t.status || post.status) === 'FAILED'
                                                                  ? 'bg-red-100 text-red-800'
                                                                  : (t.status || post.status) === 'POSTING' || post.status === 'POSTING'
                                                                    ? 'bg-blue-100 text-blue-800'
                                                                    : 'bg-gray-100 text-gray-700'
                                                        }`}
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
                                            const label = partial
                                                ? 'PARTIAL'
                                                : post.status === 'POSTING'
                                                  ? 'PUBLISHING'
                                                  : post.status;
                                            const cls = partial
                                                ? 'bg-amber-100 text-amber-800'
                                                : post.status === 'POSTING'
                                                  ? 'bg-blue-100 text-blue-800'
                                                  : post.status === 'POSTED'
                                                    ? 'bg-green-100 text-green-800'
                                                    : post.status === 'FAILED'
                                                      ? 'bg-red-100 text-red-800'
                                                      : post.status === 'SCHEDULED'
                                                        ? 'bg-neutral-200 text-neutral-700'
                                                        : 'bg-neutral-100 text-neutral-700';
                                            const failedErrors = (Array.isArray(post.targets) ? post.targets : [])
                                                .filter((t: { status?: string; error?: string }) => t.status === 'FAILED' && typeof t.error === 'string' && t.error.trim())
                                                .map((t: { platform?: string; error?: string }) => {
                                                    const platform = (t.platform ?? 'Platform').toUpperCase();
                                                    const err = t.error!.trim();
                                                    const prefix = `${platform}:`;
                                                    const msg = err.toUpperCase().startsWith(prefix) ? err.slice(prefix.length).trim() : err;
                                                    return `${platform}: ${msg}`;
                                                });
                                            return (
                                                <div className="space-y-1">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
                                                    {failedErrors.length > 0 ? (
                                                        <p
                                                            className="max-w-[14rem] truncate text-xs text-red-600 dark:text-red-400"
                                                            title={failedErrors.join('\n')}
                                                        >
                                                            {failedErrors[0]}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            );
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
                                );
                            })}
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
                        <p className="text-gray-500 dark:text-neutral-400">
                            {searchQuery.trim() || selectedPlatforms.length > 0 || formatFilter !== 'ALL'
                                ? 'No posts match your search, platform, status, format, or date filters.'
                                : 'No posts match this filter or date range.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
