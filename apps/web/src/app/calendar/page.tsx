'use client';

import React, { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    Calendar as CalendarIcon,
    LayoutGrid,
    X,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlatformIcon, PLATFORM_ICON_MAP } from '@/components/SocialPlatformIcons';
import { useAppData } from '@/context/AppDataContext';

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
    SCHEDULED: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-800', label: 'Pending' },
    DRAFT:      { bg: 'bg-violet-50',  border: 'border-violet-200', text: 'text-violet-800',  label: 'Draft' },
    POSTED:     { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', label: 'Published' },
    FAILED:     { bg: 'bg-red-50',  border: 'border-red-200', text: 'text-red-800',  label: 'With errors' },
    POSTING:    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', label: 'Posting' },
};

const PLATFORM_CARD_STYLE: Record<string, { bg: string; border: string; text: string }> = {
    INSTAGRAM: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-900' },
    FACEBOOK:  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' },
    TWITTER:   { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-900' },
    LINKEDIN:  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-900' },
    PINTEREST: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900' },
    TIKTOK:    { bg: 'bg-zinc-100', border: 'border-zinc-300', text: 'text-zinc-900' },
    YOUTUBE:   { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900' },
};

function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function getPostPlatforms(p: any): string[] {
    const fromTargets = Array.isArray(p?.targets)
        ? p.targets.map((t: { platform?: string }) => t?.platform).filter(Boolean)
        : [];
    if (fromTargets.length > 0) return fromTargets as string[];
    const fromPostField = Array.isArray(p?.targetPlatforms) ? p.targetPlatforms.filter(Boolean) : [];
    return fromPostField as string[];
}

function getPostThumbnail(p: any): string | null {
    if (p?.thumbnailUrl && typeof p.thumbnailUrl === 'string') return p.thumbnailUrl;
    if (Array.isArray(p?.media) && p.media.length > 0) {
        const first = p.media[0];
        const metaThumb = first?.metadata && typeof first.metadata === 'object'
            ? (first.metadata as { thumbnailUrl?: string }).thumbnailUrl
            : null;
        if (typeof metaThumb === 'string' && metaThumb) return metaThumb;
        if (typeof first?.fileUrl === 'string' && first.fileUrl) return first.fileUrl;
    }
    if (p?.mediaByPlatform && typeof p.mediaByPlatform === 'object') {
        const firstPlatformMedia = Object.values(p.mediaByPlatform).find((arr) => Array.isArray(arr) && arr.length > 0) as Array<{ fileUrl?: string }> | undefined;
        if (firstPlatformMedia?.[0]?.fileUrl) return firstPlatformMedia[0].fileUrl;
    }
    return null;
}

function toSafeImageSrc(url: string | null): string | null {
    if (!url) return null;
    // Use the existing media proxy when possible for stable rendering in production.
    if (/^https?:\/\//i.test(url)) return `/api/media/proxy?url=${encodeURIComponent(url)}`;
    return url;
}

function getPrimaryPlatformStyle(platforms: string[]) {
    if (!platforms.length) return STATUS_STYLE.SCHEDULED;
    return PLATFORM_CARD_STYLE[platforms[0]] ?? STATUS_STYLE.SCHEDULED;
}

function isReelLikePost(p: any): boolean {
    if (typeof p?.mediaType === 'string' && p.mediaType.toLowerCase() === 'reel') return true;
    const firstMediaType = Array.isArray(p?.media) && p.media.length > 0 ? p.media[0]?.type : null;
    if (firstMediaType === 'VIDEO') {
        const platforms = getPostPlatforms(p);
        if (platforms.includes('TIKTOK') || platforms.includes('YOUTUBE') || platforms.includes('INSTAGRAM')) return true;
    }
    return false;
}

/** Week starts Sunday; return Date at 00:00 for that Sunday */
function getWeekStart(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
}

/** Format week range e.g. "Oct 29 – Nov 4, 2023" */
function formatWeekRange(weekStart: Date): string {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const a = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const b = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (weekStart.getMonth() === end.getMonth() && weekStart.getFullYear() === end.getFullYear()) {
        return `${weekStart.toLocaleDateString(undefined, { month: 'short' })} ${weekStart.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${a} – ${b}`;
}

const HOURS_START = 0;
const HOURS_END = 24;
const CALENDAR_POSTS_CACHE_KEY = 'calendar_posts_cache_v1';

export default function CalendarPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const appData = useAppData();
    const [view, setView] = useState<'week' | 'month'>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const weekScrollRef = useRef<HTMLDivElement | null>(null);
    const autoScrolledWeekKeyRef = useRef<string | null>(null);

    useEffect(() => {
        const fromCache = appData?.getScheduledPosts?.();
        const localCachedRaw = typeof window !== 'undefined' ? window.localStorage.getItem(CALENDAR_POSTS_CACHE_KEY) : null;
        let localCached: unknown = null;
        if (localCachedRaw) {
            try {
                localCached = JSON.parse(localCachedRaw);
            } catch {
                localCached = null;
            }
        }
        const localList = Array.isArray(localCached) ? localCached : [];
        const appList = Array.isArray(fromCache) ? (fromCache as any[]) : [];
        const immediateCached = appList.length > 0 ? appList : localList;
        const hasCached = immediateCached.length > 0;
        if (hasCached) {
            // Render instantly from cache, then refresh in background.
            setPosts(immediateCached);
            setLoading(false);
        }
        const fetchPosts = async (showLoading: boolean) => {
            if (showLoading) setLoading(true);
            try {
                const res = await api.get('/posts');
                const list = Array.isArray(res.data) ? res.data : [];
                setPosts(list);
                appData?.setScheduledPosts?.(list);
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(CALENDAR_POSTS_CACHE_KEY, JSON.stringify(list));
                }
            } catch (err) {
                console.error('Failed to fetch posts');
            } finally {
                if (showLoading) setLoading(false);
            }
        };
        fetchPosts(!hasCached);
    }, [appData]);

    const weekStart = getWeekStart(currentDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    useEffect(() => {
        if (view !== 'week') return;
        const now = new Date();
        const isSameWeek = now >= weekStart && now < weekEnd;
        if (!isSameWeek || !weekScrollRef.current) return;
        const weekKey = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
        if (autoScrolledWeekKeyRef.current === weekKey) return;
        const currentHour = now.getHours();
        const rowHeight = 52;
        const target = Math.max(0, (currentHour - HOURS_START) * rowHeight - rowHeight * 2);
        weekScrollRef.current.scrollTo({ top: target, behavior: 'auto' });
        autoScrolledWeekKeyRef.current = weekKey;
    }, [view, weekStart, weekEnd]);

    const postsInWeek = posts.filter((p: any) => {
        if (!p.scheduledAt) return false;
        const t = new Date(p.scheduledAt).getTime();
        return t >= weekStart.getTime() && t < weekEnd.getTime();
    });

    /** For week view: get posts for a given day index (0=Sun) and hour (0-23). Day index is relative to weekStart. */
    const getPostsForSlot = (dayIndex: number, hour: number) => {
        const dayStart = new Date(weekStart);
        dayStart.setDate(dayStart.getDate() + dayIndex);
        const targetDay = dayStart.getDate();
        const targetMonth = dayStart.getMonth();
        const targetYear = dayStart.getFullYear();
        return postsInWeek.filter((p: any) => {
            const d = new Date(p.scheduledAt);
            return d.getDate() === targetDay && d.getMonth() === targetMonth && d.getFullYear() === targetYear && d.getHours() === hour;
        });
    };

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const prevMonth = () => setCurrentDate(new Date(year, month - 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1));
    const prevWeek = () => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() - 7);
        setCurrentDate(d);
    };
    const nextWeek = () => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + 7);
        setCurrentDate(d);
    };
    const goToday = () => setCurrentDate(new Date());

    const monthName = currentDate.toLocaleString('default', { month: 'long' });
    const days: (number | null)[] = [];
    const totalDays = daysInMonth(year, month);
    const offset = firstDayOfMonth(year, month);
    for (let i = 0; i < offset; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);

    const getPostsForDay = (day: number) => {
        return posts.filter((p: any) => {
            if (!p.scheduledAt) return false;
            const d = new Date(p.scheduledAt);
            return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
        });
    };

    const justScheduled = searchParams.get('scheduled') === '1';
    const scheduledDelivery = searchParams.get('delivery'); // 'auto' or 'email'
    const scheduledPlatforms = searchParams.get('platforms'); // comma-separated
    const scheduledTime = searchParams.get('at'); // ISO string

    const [dismissScheduledBanner, setDismissScheduledBanner] = useState(false);
    const showScheduledBanner = justScheduled && !dismissScheduledBanner;

    const scheduledTimeFormatted = (() => {
        if (!scheduledTime) return null;
        try {
            return new Date(scheduledTime).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return null; }
    })();

    const platformNames: Record<string, string> = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', TWITTER: 'X (Twitter)', LINKEDIN: 'LinkedIn', PINTEREST: 'Pinterest', TIKTOK: 'TikTok', YOUTUBE: 'YouTube' };
    const platformsLabel = scheduledPlatforms
        ? scheduledPlatforms.split(',').map((p) => platformNames[p] ?? p).join(', ')
        : null;

    return (
        <div className="space-y-6">
            {showScheduledBanner && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                    {scheduledDelivery === 'email' ? (
                        <>
                            <p className="font-medium">Your post is scheduled.</p>
                            <p className="mt-1 text-green-700">
                                You will receive an email with fast edit and posting options for{platformsLabel ? ` ${platformsLabel}` : ' your platforms'}{scheduledTimeFormatted ? ` at ${scheduledTimeFormatted}` : ' at your scheduled time'}.
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="font-medium">Your post is scheduled.</p>
                            <p className="mt-1 text-green-700">
                                It will be posted automatically to{platformsLabel ? ` ${platformsLabel}` : ' your platforms'}{scheduledTimeFormatted ? ` at ${scheduledTimeFormatted}` : ' at your scheduled time'}.
                            </p>
                        </>
                    )}
                    </div>
                    <button type="button" onClick={() => { setDismissScheduledBanner(true); router.replace('/calendar', { scroll: false }); }} className="shrink-0 p-1 text-green-600 hover:text-green-800 rounded" aria-label="Dismiss"><X size={18} /></button>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                        <button
                            onClick={() => setView('week')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium ${view === 'week' ? 'bg-white shadow text-violet-700' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            <LayoutGrid size={16} />
                            Week
                        </button>
                        <button
                            onClick={() => setView('month')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium ${view === 'month' ? 'bg-white shadow text-violet-700' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            <CalendarIcon size={16} />
                            Month
                        </button>
                    </div>
                    {view === 'week' ? (
                        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                            <button onClick={prevWeek} className="p-2 hover:bg-gray-50 rounded" aria-label="Previous week">
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-semibold min-w-[200px] text-center">{formatWeekRange(weekStart)}</span>
                            <button onClick={nextWeek} className="p-2 hover:bg-gray-50 rounded" aria-label="Next week">
                                <ChevronRight size={20} />
                            </button>
                            <button onClick={goToday} className="ml-1 px-2 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 rounded">Today</button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                            <button onClick={prevMonth} className="p-2 hover:bg-gray-50 rounded" aria-label="Previous month">
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-semibold min-w-[140px] text-center">{monthName} {year}</span>
                            <button onClick={nextMonth} className="p-2 hover:bg-gray-50 rounded" aria-label="Next month">
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {view === 'week' && (
                <>
                    <div className="card !p-0 overflow-x-auto">
                        <div className="min-w-[800px]">
                            <div className="grid grid-cols-[56px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-gray-200 bg-gray-50">
                                <div className="py-2.5 text-xs font-semibold text-gray-500" />
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => (
                                    <div key={label} className="py-2.5 text-center text-xs font-semibold text-gray-600">
                                        {label}
                                        <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                                            {new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000).getDate()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div ref={weekScrollRef} className="max-h-[70vh] overflow-y-auto">
                                {Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i).map((hour) => (
                                    <div key={hour} className="grid grid-cols-[56px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-gray-100 min-h-[52px]">
                                        <div className="py-1 pr-2 text-right text-[11px] font-medium text-gray-400 border-r border-gray-100 bg-gray-50/50">
                                            {String(hour).padStart(2, '0')}:00
                                        </div>
                                        {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                                            const slotPosts = getPostsForSlot(dayIndex, hour);
                                            return (
                                                <div
                                                    key={dayIndex}
                                                    className="p-1 border-r border-gray-100 last:border-r-0 bg-white min-h-[52px] overflow-hidden"
                                                >
                                                    <div className="space-y-1">
                                                        {slotPosts.map((p: any) => {
                                                            const platforms = getPostPlatforms(p);
                                                            const style = getPrimaryPlatformStyle(platforms);
                                                            const thumb = toSafeImageSrc(getPostThumbnail(p));
                                                            return (
                                                                <Link
                                                                    key={p.id}
                                                                    href={`/composer?edit=${p.id}`}
                                                                    className={`relative block w-full max-w-full rounded-md border px-2 py-1.5 ${style.bg} ${style.border} ${style.text} hover:opacity-95 transition-all min-w-0 overflow-hidden`}
                                                                >
                                                                    <span className="absolute top-1.5 right-1.5 text-[10px] font-semibold rounded-md bg-violet-600 text-white px-2 py-0.5 shrink-0">Edit</span>
                                                                    <div className="mb-1 pr-12 min-w-0">
                                                                        <span className="block text-[10px] font-semibold leading-none mb-1">{formatTime(new Date(p.scheduledAt))}</span>
                                                                    </div>
                                                                    <div className="mt-0.5 flex items-start gap-1.5 min-w-0">
                                                                        {thumb && (
                                                                            <div
                                                                                className={`min-w-0 rounded-md overflow-hidden bg-black/5 ${isReelLikePost(p) ? 'w-10 h-[4.25rem] flex justify-center' : 'w-14 h-[4.25rem]'}`}
                                                                            >
                                                                                <img
                                                                                    src={thumb}
                                                                                    alt="Post thumbnail"
                                                                                    className={
                                                                                        isReelLikePost(p)
                                                                                            ? 'h-[4.25rem] w-[calc(4.25rem*9/16)] object-cover'
                                                                                            : 'h-[4.25rem] w-full object-cover'
                                                                                    }
                                                                                    loading="lazy"
                                                                                />
                                                                            </div>
                                                                        )}
                                                                        <div className="flex flex-wrap content-start items-center gap-0.5 max-w-[calc(100%-3rem)] min-h-[4.25rem]">
                                                                            {platforms.map((pl: string) => (
                                                                                <PlatformIcon key={pl} platform={pl as keyof typeof PLATFORM_ICON_MAP} size={18} className="opacity-95 shrink-0" />
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </Link>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                        <span className="font-medium text-gray-500">Status:</span>
                        {Object.entries(STATUS_STYLE).map(([status, { bg, border, label }]) => (
                            <span key={status} className="flex items-center gap-1.5">
                                <span className={`w-3 h-3 rounded-full border ${bg} ${border}`} />
                                {label}
                            </span>
                        ))}
                    </div>
                </>
            )}

            {view === 'month' && (
                <div className="card !p-0 overflow-hidden">
                    <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} className="py-3 text-center text-xs font-semibold text-gray-500 uppercase">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {days.map((day, i) => (
                            <div key={i} className={`min-h-[168px] border-b border-r border-gray-100 p-2 overflow-hidden ${day === null ? 'bg-gray-50' : 'bg-white'}`}>
                                {day && (
                                    <>
                                        <span className="text-sm font-medium text-gray-400">{day}</span>
                                        <div className="mt-2 space-y-1.5 max-h-[140px] overflow-y-auto overflow-x-hidden pr-0.5">
                                            {getPostsForDay(day).map((p: any) => {
                                                const platforms = getPostPlatforms(p);
                                                const style = getPrimaryPlatformStyle(platforms);
                                                const thumb = toSafeImageSrc(getPostThumbnail(p));
                                                return (
                                                    <Link
                                                        key={p.id}
                                                        href={`/composer?edit=${p.id}`}
                                                        className={`relative block w-full max-w-full p-1.5 rounded-md border ${style.bg} ${style.border} ${style.text} hover:opacity-95 transition-all min-w-0 overflow-hidden`}
                                                    >
                                                        <span className="absolute top-1.5 right-1.5 text-[10px] font-semibold rounded-md bg-violet-600 text-white px-2 py-0.5 shrink-0">Edit</span>
                                                        <div className="text-[11px] font-semibold leading-none mb-1 pr-12">{formatTime(new Date(p.scheduledAt))}</div>
                                                        <div className="flex items-start gap-1.5 min-w-0">
                                                            {thumb ? (
                                                                <div
                                                                    className={`rounded-md overflow-hidden bg-black/5 shrink-0 ${isReelLikePost(p) ? 'w-11 h-[5.25rem] flex justify-center' : 'w-16 h-[5rem]'}`}
                                                                >
                                                                    <img
                                                                        src={thumb}
                                                                        alt="Post thumbnail"
                                                                        className={
                                                                            isReelLikePost(p)
                                                                                ? 'h-[5.25rem] w-[calc(5.25rem*9/16)] object-cover'
                                                                                : 'h-[5rem] w-full object-cover'
                                                                        }
                                                                        loading="lazy"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="flex h-[5rem] w-11 items-center justify-center text-gray-400 shrink-0">
                                                                    <Clock size={16} className="opacity-70" aria-hidden />
                                                                </div>
                                                            )}
                                                            <div className="flex flex-wrap content-start items-center gap-1 max-w-[calc(100%-4.25rem)] min-h-[5rem]">
                                                                {platforms.map((pl: string) => (
                                                                    <PlatformIcon key={pl} platform={pl as keyof typeof PLATFORM_ICON_MAP} size={20} className="opacity-90 shrink-0" />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading && (
                <div className="card py-12 text-center text-gray-500">Loading calendar…</div>
            )}
        </div>
    );
}
