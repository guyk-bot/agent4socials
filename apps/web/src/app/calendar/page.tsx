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

function postLabel(p: { content?: string | null; title?: string | null; targets?: { platform: string }[]; scheduleDelivery?: string | null; scheduledAt?: string | Date | null }): string {
    const text = (p.title || p.content || 'Scheduled post').slice(0, 28);
    const platforms = (p.targets || []).map((t: { platform: string }) => PLATFORM_SHORT[t.platform] || t.platform).filter(Boolean);
    const time = p.scheduledAt ? formatTime(new Date(p.scheduledAt)) : '';
    const parts = [text];
    if (platforms.length) parts.push(platforms.join(', '));
    if (time) parts.push(time);
    return parts.join(' · ');
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
                    <p className="mt-1 text-green-700">You will receive an email with a link to post when the scheduled time is reached (our cron runs every few minutes). Check your inbox at that time.</p>
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
                        <div key={i} className={`min-h-[120px] border-b border-r border-gray-100 p-2 ${day === null ? 'bg-gray-50' : 'bg-white'}`}>
                            {day && (
                                <>
                                    <span className="text-sm font-medium text-gray-400">{day}</span>
                                    <div className="mt-2 space-y-1">
                                        {getPostsForDay(day).map((p: any) => (
                                            <div key={p.id} className="p-1.5 px-2 text-[10px] font-medium rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-start gap-1">
                                                <Clock size={10} className="mt-0.5 shrink-0" />
                                                <span className="truncate" title={postLabel(p)}>{postLabel(p)}</span>
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
