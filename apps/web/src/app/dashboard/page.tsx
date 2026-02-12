'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import api from '@/lib/api';
import {
    Users,
    Calendar,
    CheckCircle,
    Clock,
    AlertCircle,
    Plus
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
    const { user } = useAuth();
    const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: undefined };
    const [stats, setStats] = useState(() => ({
        accounts: (typeof cachedAccounts !== 'undefined' ? cachedAccounts.length : 0),
        scheduled: 0,
        posted: 0,
        failed: 0,
    }));
    const [recentPosts, setRecentPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setStats((s) => ({ ...s, accounts: cachedAccounts.length }));
    }, [cachedAccounts.length]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const accountsRes = await api.get('/social/accounts').catch(() => ({ data: [] }));
                const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
                setCachedAccounts?.(accounts);
                setStats((s) => ({ ...s, accounts: accounts.length }));

                const postsRes = await api.get('/posts').catch(() => ({ data: [] }));
                const posts = Array.isArray(postsRes.data) ? postsRes.data : [];
                setStats((s) => ({
                    ...s,
                    scheduled: posts.filter((p: any) => p.status === 'SCHEDULED' || p.status === 'POSTING').length,
                    posted: posts.filter((p: any) => p.status === 'POSTED').length,
                    failed: posts.filter((p: any) => p.status === 'FAILED').length,
                }));
                setRecentPosts(posts.slice(0, 5));
            } catch (err) {
                console.error('Failed to fetch dashboard data', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [setCachedAccounts]);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name || 'there'}!</h1>
                <p className="text-gray-500">Here's what's happening with your social media today.</p>
            </div>

            <h2 className="text-lg font-semibold text-gray-900">Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Accounts"
                    value={stats.accounts}
                    icon={<Users size={20} className="text-neutral-600" />}
                    bg="bg-neutral-100"
                />
                <StatCard
                    title="Scheduled"
                    value={stats.scheduled}
                    icon={<Calendar size={20} className="text-neutral-600" />}
                    bg="bg-neutral-100"
                />
                <StatCard
                    title="Posted"
                    value={stats.posted}
                    icon={<CheckCircle size={20} className="text-neutral-600" />}
                    bg="bg-neutral-100"
                />
                <StatCard
                    title="Failed"
                    value={stats.failed}
                    icon={<AlertCircle size={20} className="text-red-500" />}
                    bg="bg-red-50"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-gray-900">Recent Posts</h2>
                        <Link href="/composer" className="btn-primary flex items-center space-x-2 text-sm">
                            <Plus size={18} />
                            <span>Create Post</span>
                        </Link>
                    </div>

                    <div className="card !p-0 overflow-hidden">
                        {loading ? (
                            <div className="p-8 text-center text-gray-500">Loading posts...</div>
                        ) : recentPosts.length > 0 ? (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platforms</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {recentPosts.map((post: any) => (
                                        <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{post.title || post.content}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex -space-x-2">
                                                    {post.targets.map((t: any) => (
                                                        <div key={t.id} title={t.platform} className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                                                            {t.platform[0]}
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${post.status === 'POSTED' ? 'bg-green-100 text-green-800' :
                                                        post.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                                            'bg-indigo-100 text-indigo-800'
                                                    }`}>
                                                    {post.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString() : 'Draft'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="p-12 text-center">
                                <div className="mb-4 flex justify-center text-gray-400">
                                    <Clock size={48} strokeWidth={1} />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900">No posts yet</h3>
                                <p className="text-gray-500 mt-1">Start by creating your first scheduled post.</p>
                                <div className="mt-6">
                                    <Link href="/composer" className="btn-primary">Create First Post</Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900">Connections</h2>
                    <div className="card space-y-4">
                        <p className="text-sm text-gray-500">Manage your linked social media accounts.</p>
                        {/* This would list connected accounts with status */}
                        <Link href="/accounts" className="block w-full text-center py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                            Manage Accounts
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, bg }: any) {
    return (
        <div className="card">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
                </div>
                <div className={`p-3 rounded-xl ${bg}`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}
