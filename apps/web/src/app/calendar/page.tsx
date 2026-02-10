'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    ChevronLeft,
    ChevronRight,
    Clock
} from 'lucide-react';

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const res = await api.get('/posts');
                setPosts(res.data);
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

    return (
        <div className="space-y-8">
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
                                            <div key={p.id} className="p-1 px-2 text-[10px] font-medium rounded-md bg-indigo-50 text-indigo-600 truncate border border-indigo-100 flex items-center">
                                                <Clock size={10} className="mr-1" />
                                                {p.title || p.content}
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
