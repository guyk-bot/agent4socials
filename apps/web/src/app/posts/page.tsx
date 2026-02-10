'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    Search,
    Filter,
    MoreVertical,
    Instagram,
    Youtube,
    Video,
    ExternalLink,
    ChevronRight
} from 'lucide-react';

export default function PostsPage() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');

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

    const filteredPosts = posts.filter((p: any) => {
        if (filter === 'ALL') return true;
        return p.status === filter;
    });

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Post History</h1>
                    <p className="text-gray-500">Track and manage all your social media content.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search posts..."
                            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                    </div>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white cursor-pointer"
                    >
                        <option value="ALL">All Status</option>
                        <option value="POSTED">Posted</option>
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="FAILED">Failed</option>
                    </select>
                </div>
            </div>

            <div className="card !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-500">Loading history...</div>
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
                                <tr key={post.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-3">
                                            {post.media?.[0] && (
                                                <div className="w-10 h-10 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                                                    <img src={post.media[0].fileUrl} alt="" className="w-full h-full object-cover" />
                                                </div>
                                            )}
                                            <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                                                {post.title || post.content}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex space-x-2">
                                            {post.targets.map((t: any) => (
                                                <div key={t.id} title={t.status} className={`p-1 rounded bg-gray-100 ${t.status === 'POSTED' ? 'text-green-600' : t.status === 'FAILED' ? 'text-red-600' : 'text-gray-400'
                                                    }`}>
                                                    {t.platform === 'INSTAGRAM' && <Instagram size={16} />}
                                                    {t.platform === 'YOUTUBE' && <Youtube size={16} />}
                                                    {t.platform === 'TIKTOK' && <Video size={16} />}
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
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-gray-400 hover:text-indigo-600 transition-colors">
                                            <ChevronRight size={20} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-20 text-center">
                        <p className="text-gray-500">No posts found with this filter.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
