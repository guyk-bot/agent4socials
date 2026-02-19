'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    ChevronLeft,
    ChevronRight,
    Clock
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';

const PLATFORM_SHORT: Record<string, string> = {
    INSTAGRAM: 'IG',
    FACEBOOK: 'FB',
    TWITTER: 'X',
    LINKEDIN: 'LI',
    TIKTOK: 'TT',
    YOUTUBE: 'YT',
};

function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function postContentPreview(p: { content?: string | null; title?: string | null }): string {
    return (p.title || p.content || 'Scheduled post').replace(/\s+/g, ' ').slice(0, 35);
}

function postTimeAndPlatforms(p: { targets?: { platform: string }[]; scheduledAt?: string | Date | null }): string {
    const platforms = (p.targets || []).map((t: { platform: string }) => PLATFORM_SHORT[t.platform] || t.platform).filter(Boolean);
    const time = p.scheduledAt ? formatTime(new Date(p.scheduledAt)) : '';
    const parts: string[] = [];
    if (time) parts.push(time);
    if (platforms.length) parts.push(platforms.join(', '));
    return parts.join(' · ') || 'Scheduled';
}

export default function CalendarPage() {
    const searchParams = useSearchParams();
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

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const prevMonth = () => setCurrentDate(new Date(year, month - 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1));

    const monthName = currentDate.toLocaleString('default', { month: 'long' });

    const days = [];
    const totalDays = daysInMonth(year, month);
    const offset = firstDayOfMonth(year, month);

    // Fill offset days
    for (let i = 0; i < offset; i++) {
        days.push(null);
    }

    // Fill actual days
    for (let i = 1; i <= totalDays; i++) {
        days.push(i);
    }

    const getPostsForDay = (day: number) => {
        return posts.filter((p: any) => {
            if (!p.scheduledAt) return false;
            const d = new Date(p.scheduledAt);
            return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
        });
    };

    const justScheduled = searchParams.get('scheduled') === '1';

    return (
        <div className="space-y-8">
            {justScheduled && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    <p className="font-medium">Post scheduled.</p>
                    <p className="mt-1 text-green-700">The email with the link is sent when the scheduled time is reached. For that to work:</p>
                    <ul className="mt-2 list-disc list-inside text-green-700 space-y-0.5">
                        <li>Set <strong>RESEND_API_KEY</strong> and <strong>CRON_SECRET</strong> in Vercel (Environment Variables).</li>
                        <li>Set up a cron (e.g. <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="underline">cron-job.org</a>) to call <code className="bg-green-100 px-1 rounded">https://agent4socials.com/api/cron/process-scheduled</code> every 5 minutes with header <code className="bg-green-100 px-1 rounded">X-Cron-Secret: your-secret</code>.</li>
                    </ul>
                    <p className="mt-2 text-green-700">Without the cron, no email is sent (Resend will show no sent emails).</p>
                </div>
            )}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
                    <p className="text-gray-500">Visualize your scheduled content strategy.</p>
                </div>
                <div className="flex items-center space-x-4 bg-white p-1 rounded-lg border border-gray-200">
                    <button onClick={prevMonth} className="p-2 hover:bg-gray-50 rounded">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="text-sm font-semibold w-32 text-center">{monthName} {year}</span>
                    <button onClick={nextMonth} className="p-2 hover:bg-gray-50 rounded">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

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
                                        {getPostsForDay(day).map((p: any) => (
                                            <div key={p.id} className="p-2 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-100">
                                                <div className="flex items-start gap-1.5">
                                                    <Clock size={12} className="shrink-0 mt-0.5 text-indigo-500" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[11px] font-medium leading-tight truncate" title={postContentPreview(p)}>{postContentPreview(p)}</div>
                                                        <div className="text-[10px] text-indigo-600 mt-0.5 font-medium">{postTimeAndPlatforms(p)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
