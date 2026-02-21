'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    Calendar as CalendarIcon,
    LayoutGrid,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PlatformIcon, PLATFORM_ICON_MAP } from '@/components/SocialPlatformIcons';

const PLATFORM_SHORT: Record<string, string> = {
    INSTAGRAM: 'IG',
    FACEBOOK: 'FB',
    TWITTER: 'X',
    LINKEDIN: 'LI',
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

function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function postContentPreview(p: { content?: string | null; title?: string | null }): string {
    return (p.title || p.content || 'Scheduled post').replace(/\s+/g, ' ').slice(0, 40);
}

function postTimeAndPlatforms(p: { targets?: { platform: string }[]; scheduledAt?: string | Date | null }): string {
    const platforms = (p.targets || []).map((t: { platform: string }) => PLATFORM_SHORT[t.platform] || t.platform).filter(Boolean);
    const time = p.scheduledAt ? formatTime(new Date(p.scheduledAt)) : '';
    const parts: string[] = [];
    if (time) parts.push(time);
    if (platforms.length) parts.push(platforms.join(', '));
    return parts.join(' · ') || 'Scheduled';
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
    const [view, setView] = useState<'week' | 'month'>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const res = await api.get('/posts');
                setPosts(Array.isArray(res.data) ? res.data : []);
            } catch (err) {
                console.error('Failed to fetch posts');
            } finally {
                setLoading(false);
            }
        };
        fetchPosts();
    }, []);

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

    return (
        <div className="space-y-6">
            {justScheduled && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    <p className="font-medium">Post scheduled.</p>
                    <p className="mt-1 text-green-700">The email with the link is sent when the scheduled time is reached. For that to work:</p>
                    <ul className="mt-2 list-disc list-inside text-green-700 space-y-0.5">
                        <li>Set <strong>RESEND_API_KEY</strong> and <strong>CRON_SECRET</strong> in Vercel (Environment Variables).</li>
                        <li>Set up a cron (e.g. <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="underline">cron-job.org</a>) to call <code className="bg-green-100 px-1 rounded">https://agent4socials.com/api/cron/process-scheduled</code> every 1 minute with header <code className="bg-green-100 px-1 rounded">X-Cron-Secret: your-secret</code> (must match Vercel exactly).</li>
                        <li>In Composer, choose &quot;Email me a link when it&apos;s time&quot; for the post.</li>
                    </ul>
                    <p className="mt-2 text-green-700">Without the cron, no email is sent (Resend will show no sent emails).</p>
                    <p className="mt-2 text-green-800 text-xs">Not getting the email? Check: (1) <strong>RESEND_FROM_EMAIL</strong> in Vercel matches your verified domain exactly (e.g. agent4socials.com, not agent4social.com). (2) Post scheduled time has already passed. (3) CRON_SECRET set and external cron (e.g. cron-job.org) calls the endpoint every 1–5 min. (4) Test with: <code className="bg-green-100 px-1 rounded">/api/cron/test-email?to=your@email.com</code> plus X-Cron-Secret header. See <code className="bg-green-100 px-1 rounded">docs/EMAIL_SCHEDULING_SETUP.md</code>.</p>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
                    <p className="text-gray-500">Visualize your scheduled content. Week view shows posts by day and time.</p>
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
                                                            const style = STATUS_STYLE[p.status] || STATUS_STYLE.SCHEDULED;
                                                            const platforms = (p.targets || []).map((t: { platform: string }) => t.platform).filter(Boolean);
                                                            return (
                                                                <Link
                                                                    key={p.id}
                                                                    href={`/composer?edit=${p.id}`}
                                                                    className={`block rounded-lg border p-2 ${style.bg} ${style.border} ${style.text} hover:opacity-90 transition-opacity`}
                                                                >
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        {platforms.slice(0, 3).map((pl: string) => (
                                                                            <span key={pl} className="flex shrink-0">
                                                                                <PlatformIcon platform={pl as keyof typeof PLATFORM_ICON_MAP} size={14} className="opacity-90" />
                                                                            </span>
                                                                        ))}
                                                                        {platforms.length > 3 && <span className="text-[10px]">+{platforms.length - 3}</span>}
                                                                        <span className="ml-auto text-[10px] font-medium shrink-0">{formatTime(new Date(p.scheduledAt))}</span>
                                                                    </div>
                                                                    <div className="text-[11px] leading-tight truncate" title={postContentPreview(p)}>
                                                                        {postContentPreview(p)}
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
                                                const style = STATUS_STYLE[p.status] || STATUS_STYLE.SCHEDULED;
                                                return (
                                                    <Link
                                                        key={p.id}
                                                        href={`/composer?edit=${p.id}`}
                                                        className={`block p-2 rounded-lg border ${style.bg} ${style.border} ${style.text}`}
                                                    >
                                                        <div className="flex items-start gap-1.5">
                                                            <Clock size={12} className="shrink-0 mt-0.5 opacity-80" />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-[11px] font-medium leading-tight truncate" title={postContentPreview(p)}>{postContentPreview(p)}</div>
                                                                <div className="text-[10px] opacity-80 mt-0.5 font-medium">{postTimeAndPlatforms(p)}</div>
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
