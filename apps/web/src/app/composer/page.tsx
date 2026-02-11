'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import {
    Instagram,
    Youtube,
    Facebook,
    Twitter,
    Linkedin,
    Send,
    Calendar,
    Image as ImageIcon,
    Video,
    X,
    Plus
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ComposerPage() {
    const router = useRouter();
    const [platforms, setPlatforms] = useState<string[]>([]);
    const [content, setContent] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaList, setMediaList] = useState<{ fileUrl: string, type: 'IMAGE' | 'VIDEO' }[]>([]);
    const [scheduledAt, setScheduledAt] = useState('');
    const [accounts, setAccounts] = useState<{ id: string; platform: string }[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const res = await api.get('/social/accounts');
                setAccounts(res.data);
            } catch (err) {
                console.error('Failed to fetch accounts');
            }
        };
        fetchAccounts();
    }, []);

    const handleAddMedia = () => {
        if (!mediaUrl) return;
        const type = mediaUrl.match(/\.(mp4|webm|mov)$/i) ? 'VIDEO' : 'IMAGE';
        setMediaList([...mediaList, { fileUrl: mediaUrl, type: type as any }]);
        setMediaUrl('');
    };

    const handleRemoveMedia = (index: number) => {
        setMediaList(mediaList.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (platforms.length === 0) return alert('Select at least one platform');
        const targets = platforms
            .map((p) => {
                const acc = accounts.find((a: { platform: string }) => a.platform === p);
                return acc?.id ? { platform: p, socialAccountId: acc.id } : null;
            })
            .filter(Boolean) as { platform: string; socialAccountId: string }[];
        if (targets.length === 0) {
            alert('Connect at least one account for the selected platforms (Accounts page).');
            return;
        }

        setLoading(true);
        try {
            await api.post('/posts', {
                content,
                media: mediaList,
                targets,
                scheduledAt: scheduledAt || undefined,
            });

            router.push('/dashboard');
        } catch (err) {
            alert('Failed to create post');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Create Post</h1>
                <p className="text-gray-500">Draft, preview and schedule your content across platforms.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="card space-y-4">
                        <h3 className="font-semibold text-gray-900">1. Select Platforms</h3>
                        <div className="flex space-x-4">
                            <PlatformToggle
                                platform="INSTAGRAM"
                                icon={<Instagram size={20} />}
                                active={platforms.includes('INSTAGRAM')}
                                onClick={() => setPlatforms(prev => prev.includes('INSTAGRAM') ? prev.filter(p => p !== 'INSTAGRAM') : [...prev, 'INSTAGRAM'])}
                            />
                            <PlatformToggle
                                platform="TIKTOK"
                                icon={<div className="font-bold text-xs">TT</div>}
                                active={platforms.includes('TIKTOK')}
                                onClick={() => setPlatforms(prev => prev.includes('TIKTOK') ? prev.filter(p => p !== 'TIKTOK') : [...prev, 'TIKTOK'])}
                            />
                            <PlatformToggle
                                platform="YOUTUBE"
                                icon={<Youtube size={20} />}
                                active={platforms.includes('YOUTUBE')}
                                onClick={() => setPlatforms(prev => prev.includes('YOUTUBE') ? prev.filter(p => p !== 'YOUTUBE') : [...prev, 'YOUTUBE'])}
                            />
                            <PlatformToggle
                                platform="FACEBOOK"
                                icon={<Facebook size={20} />}
                                active={platforms.includes('FACEBOOK')}
                                onClick={() => setPlatforms(prev => prev.includes('FACEBOOK') ? prev.filter(p => p !== 'FACEBOOK') : [...prev, 'FACEBOOK'])}
                            />
                            <PlatformToggle
                                platform="TWITTER"
                                icon={<Twitter size={20} />}
                                active={platforms.includes('TWITTER')}
                                onClick={() => setPlatforms(prev => prev.includes('TWITTER') ? prev.filter(p => p !== 'TWITTER') : [...prev, 'TWITTER'])}
                            />
                            <PlatformToggle
                                platform="LINKEDIN"
                                icon={<Linkedin size={20} />}
                                active={platforms.includes('LINKEDIN')}
                                onClick={() => setPlatforms(prev => prev.includes('LINKEDIN') ? prev.filter(p => p !== 'LINKEDIN') : [...prev, 'LINKEDIN'])}
                            />
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-semibold text-gray-900">2. Content</h3>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="What's on your mind?..."
                            className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-semibold text-gray-900">3. Media</h3>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                value={mediaUrl}
                                onChange={(e) => setMediaUrl(e.target.value)}
                                placeholder="Paste image or video URL..."
                                className="flex-1 p-2 border border-gray-300 rounded-lg sm:text-sm"
                            />
                            <button type="button" onClick={handleAddMedia} className="p-2 bg-indigo-600 text-white rounded-lg">
                                <Plus size={20} />
                            </button>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {mediaList.map((m, i) => (
                                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                                    <img src={m.fileUrl} alt="media" className="object-cover w-full h-full" />
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveMedia(i)}
                                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card space-y-4">
                        <h3 className="font-semibold text-gray-900">4. Schedule</h3>
                        <div className="flex items-center space-x-3">
                            <Calendar size={20} className="text-gray-400" />
                            <input
                                type="datetime-local"
                                value={scheduledAt}
                                onChange={(e) => setScheduledAt(e.target.value)}
                                className="flex-1 p-2 border border-gray-300 rounded-lg sm:text-sm"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full btn-primary flex items-center justify-center space-x-2 py-3"
                    >
                        <Send size={20} />
                        <span>{scheduledAt ? 'Schedule Post' : 'Post Now'}</span>
                    </button>
                </form>

                <div className="hidden lg:block space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900">Preview</h2>
                    <div className="sticky top-8 space-y-8">
                        {platforms.length === 0 ? (
                            <div className="card bg-gray-50 border-dashed border-2 flex flex-col items-center justify-center py-20 text-gray-400">
                                <ImageIcon size={48} strokeWidth={1} />
                                <p className="mt-4">Select a platform to see preview</p>
                            </div>
                        ) : (
                            platforms.map(p => (
                                <PostPreview key={p} platform={p} content={content} media={mediaList} />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlatformToggle({ platform, icon, active, onClick }: any) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center space-y-2 transition-all ${active
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                    : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                }`}
        >
            {icon}
            <span className="text-[10px] font-bold">{platform}</span>
        </button>
    );
}

function PostPreview({ platform, content, media }: any) {
    return (
        <div className="card overflow-hidden !p-0 max-w-sm mx-auto shadow-xl">
            <div className="p-3 border-b border-gray-100 flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-gray-200" />
                <div className="flex-1">
                    <div className="h-2 w-20 bg-gray-200 rounded" />
                    <div className="h-2 w-12 bg-gray-100 rounded mt-1" />
                </div>
            </div>
            <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                {media.length > 0 ? (
                    <img src={media[0].fileUrl} alt="preview" className="w-full h-full object-cover" />
                ) : (
                    <ImageIcon size={32} className="text-gray-200" />
                )}
            </div>
            <div className="p-3 space-y-2">
                <div className="flex space-x-3 text-gray-700">
                    {platform === 'INSTAGRAM' && <Instagram size={22} />}
                    {platform === 'YOUTUBE' && <Youtube size={22} />}
                    {platform === 'TIKTOK' && <Video size={22} />}
                    {platform === 'FACEBOOK' && <Facebook size={22} />}
                    {platform === 'TWITTER' && <Twitter size={22} />}
                    {platform === 'LINKEDIN' && <Linkedin size={22} />}
                </div>
                <p className="text-sm text-gray-800 line-clamp-3">
                    {content || 'Your caption will appear here...'}
                </p>
            </div>
        </div>
    );
}
