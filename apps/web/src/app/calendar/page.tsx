'use client';

import React, { useEffect, useState } from 'react';
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

const PLATFORM_SHORT: Record<string, string> = {
    INSTAGRAM: 'IG',
    FACEBOOK: 'FB',
    TWITTER: 'X',
    LINKEDIN: 'LI',
    PINTEREST: 'Pin',
    TIKTOK: 'TT',
    YOUTUBE: 'YT',
};

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
    SCHEDULED: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', label: 'Pending' },
    DRAFT:      { bg: 'bg-sky-50',  border: 'border-sky-200', text: 'text-sky-800',  label: 'Draft' },
    POSTED:     { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', label: 'Published' },
    FAILED:     { bg: 'bg-red-50',  border: 'border-red-200', text: 'text-red-800',  label: 'With errors' },
    POSTING:    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', label: 'Posting' },
};

const PLATFORM_CARD_STYLE: Record<string, { bg: string; border: string; text: string }> = {
    INSTAGRAM: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-900' },
    FACEBOOK:  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' },
    TWITTER:   { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-900' },
    LINKEDIN:  { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-900' },
    PINTEREST: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900' },
    TIKTOK:    { bg: 'bg-zinc-100', border: 'border-zinc-300', text: 'text-zinc-900' },
    YOUTUBE:   { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900' },
};

function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function postContentPreview(p: { content?: string | null; title?: string | null }): string {
    return (p.title || p.content || 'Scheduled post').replace(/\s+/g, ' ').slice(0, 40);
}

function postTimeAndPlatforms(p: any): string {
    const platforms = getPostPlatforms(p).map((pl) => PLATFORM_SHORT[pl] || pl).filter(Boolean);
    const time = p.scheduledAt ? formatTime(new Date(p.scheduledAt)) : '';
    const parts: string[] = [];
    if (time) parts.push(time);
    if (platforms.length) parts.push(platforms.join(', '));
    return parts.join(' · ') || 'Scheduled';
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

const HOURS_START = 6;
const HOURS_END = 24;

export default function CalendarPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const appData = useAppData();
    const [view, setView] = useState<'week' | 'month'>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fromCache = appData?.getScheduledPosts?.();
        if (fromCache !== undefined && Array.isArray(fromCache) && fromCache.length >= 0) {
            setPosts(fromCache as any[]);
            setLoading(false);
            return;
        }
        const fetchPosts = async () => {
            try {
                const res = await api.get('/posts');
                const list = Array.isArray(res.data) ? res.data : [];
                setPosts(list);
                appData?.setScheduledPosts?.(list);
            } catch (err) {
                console.error('Failed to fetch posts');
            } finally {
                setLoading(false);
            }
        };
        fetchPosts();
    }, [appData]);

    const weekStart = getWeekStart(currentDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

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
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium ${view === 'week' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            <LayoutGrid size={16} />
                            Week
                        </button>
                        <button
                            onClick={() => setView('month')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium ${view === 'month' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
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
                            <button onClick={goToday} className="ml-1 px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded">Today</button>
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
                            <div className="max-h-[70vh] overflow-y-auto">
                                {Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i).map((hour) => (
                                    <div key={hour} className="grid grid-cols-[56px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-gray-100 min-h-[52px]">
                                        <div className="py-1 pr-2 text-right text-[11px] font-medium text-gray-400 border-r border-gray-100 bg-gray-50/50">
                                            {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour === 0 ? 12 : hour} AM`}
                                        </div>
                                        {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                                            const slotPosts = getPostsForSlot(dayIndex, hour);
                                            return (
                                                <div
                                                    key={dayIndex}
                                                    className="p-1 border-r border-gray-100 last:border-r-0 bg-white min-h-[52px]"
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
                                                                    className={`block rounded-md border px-1.5 py-1.5 ${style.bg} ${style.border} ${style.text} hover:opacity-95 transition-all`}
                                                                >
                                                                    <div className="flex items-center gap-1 mb-1">
                                                                        <div className="flex items-center -space-x-1">
                                                                            {platforms.slice(0, 3).map((pl: string) => (
                                                                                <span key={pl} className="flex shrink-0 rounded-full bg-white/80 p-0.5 border border-white">
                                                                                    <PlatformIcon platform={pl as keyof typeof PLATFORM_ICON_MAP} size={11} className="opacity-95" />
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                        <span className="ml-auto text-[9px] font-medium shrink-0">{formatTime(new Date(p.scheduledAt))}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        {thumb && (
                                                                            <img
                                                                                src={thumb}
                                                                                alt="Post thumbnail"
                                                                                className="h-6 w-6 rounded object-cover border border-white/70 shrink-0"
                                                                                loading="lazy"
                                                                            />
                                                                        )}
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="text-[10px] leading-tight truncate font-medium" title={postContentPreview(p)}>
                                                                                {postContentPreview(p)}
                                                                            </div>
                                                                        </div>
                                                                        <span className="text-[9px] font-semibold rounded bg-white/80 px-1 py-0.5 shrink-0">Edit</span>
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
                            <div key={i} className={`min-h-[140px] border-b border-r border-gray-100 p-2 ${day === null ? 'bg-gray-50' : 'bg-white'}`}>
                                {day && (
                                    <>
                                        <span className="text-sm font-medium text-gray-400">{day}</span>
                                        <div className="mt-2 space-y-1.5">
                                            {getPostsForDay(day).map((p: any) => {
                                                const platforms = getPostPlatforms(p);
                                                const style = getPrimaryPlatformStyle(platforms);
                                                const thumb = toSafeImageSrc(getPostThumbnail(p));
                                                return (
                                                    <Link
                                                        key={p.id}
                                                        href={`/composer?edit=${p.id}`}
                                                        className={`block p-1.5 rounded-md border ${style.bg} ${style.border} ${style.text} hover:opacity-95 transition-all`}
                                                    >
                                                        <div className="flex items-start gap-1.5">
                                                            {thumb ? (
                                                                <img
                                                                    src={thumb}
                                                                    alt="Post thumbnail"
                                                                    className="h-6 w-6 rounded object-cover border border-white/70 shrink-0 mt-0.5"
                                                                    loading="lazy"
                                                                />
                                                            ) : (
                                                                <Clock size={12} className="shrink-0 mt-0.5 opacity-80" />
                                                            )}
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1 mb-0.5">
                                                                    {platforms.slice(0, 3).map((pl: string) => (
                                                                        <PlatformIcon key={pl} platform={pl as keyof typeof PLATFORM_ICON_MAP} size={10} className="opacity-90" />
                                                                    ))}
                                                                </div>
                                                                <div className="text-[10px] font-medium leading-tight truncate" title={postContentPreview(p)}>{postContentPreview(p)}</div>
                                                                <div className="text-[9px] opacity-80 mt-0.5 font-medium">{postTimeAndPlatforms(p)}</div>
                                                            </div>
                                                            <span className="text-[9px] font-semibold rounded bg-white/80 px-1 py-0.5 shrink-0">Edit</span>
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
