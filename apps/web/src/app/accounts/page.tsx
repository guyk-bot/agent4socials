'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    Instagram,
    Youtube,
    Facebook,
    Twitter,
    Linkedin,
    Plus,
    RefreshCw,
    Trash2,
    ExternalLink,
    ShieldCheck
} from 'lucide-react';

export default function AccountsPage() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const res = await api.get('/social/accounts');
            setAccounts(res.data);
        } catch (err) {
            console.error('Failed to fetch accounts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    const handleConnect = async (platform: string) => {
        try {
            const res = await api.get(`/social/oauth/${platform}/start`);
            // In a real app, this would redirect. Here we'll open in a new tab.
            window.open(res.data.url, '_blank', 'width=600,height=600');
        } catch (err) {
            alert(
                'Failed to start OAuth flow. Social connections require the Agent4Socials API to be deployed and reachable. Set NEXT_PUBLIC_API_URL in Vercel (web project) to your API URL, then redeploy.'
            );
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Social Accounts</h1>
                    <p className="text-slate-400">Connect and manage your social media profiles.</p>
                </div>
                <button onClick={fetchAccounts} className="p-2 text-slate-400 hover:text-emerald-500 transition-colors">
                    <RefreshCw size={20} />
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <PlatformCard
                    name="Instagram"
                    platform="INSTAGRAM"
                    description="Schedule posts, reels and stories to your Business or Creator account."
                    icon={<Instagram size={24} className="text-pink-600" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'INSTAGRAM')}
                    onConnect={() => handleConnect('instagram')}
                />
                <PlatformCard
                    name="TikTok"
                    platform="TIKTOK"
                    description="Publish your creative videos directly to TikTok."
                    icon={<div className="font-bold text-lg">TT</div>}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'TIKTOK')}
                    onConnect={() => handleConnect('tiktok')}
                />
                <PlatformCard
                    name="YouTube"
                    platform="YOUTUBE"
                    description="Upload and schedule videos to your YouTube channel."
                    icon={<Youtube size={24} className="text-red-600" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'YOUTUBE')}
                    onConnect={() => handleConnect('youtube')}
                />
                <PlatformCard
                    name="Facebook"
                    platform="FACEBOOK"
                    description="Post to your Facebook Page and reach your audience."
                    icon={<Facebook size={24} className="text-blue-600" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'FACEBOOK')}
                    onConnect={() => handleConnect('facebook')}
                />
                <PlatformCard
                    name="X (Twitter)"
                    platform="TWITTER"
                    description="Schedule tweets and threads to your X profile."
                    icon={<Twitter size={24} className="text-sky-500" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'TWITTER')}
                    onConnect={() => handleConnect('twitter')}
                />
                <PlatformCard
                    name="LinkedIn"
                    platform="LINKEDIN"
                    description="Share posts and articles to your LinkedIn profile."
                    icon={<Linkedin size={24} className="text-blue-700" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'LINKEDIN')}
                    onConnect={() => handleConnect('linkedin')}
                />
            </div>
        </div>
    );
}

function PlatformCard({ name, description, icon, connectedAccounts, onConnect }: any) {
    return (
        <div className="card">
            <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                    <div className="p-3 bg-slate-800/50 rounded-xl">
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">{name}</h3>
                        <p className="text-sm text-slate-400 max-w-md mt-1">{description}</p>
                    </div>
                </div>
                <button
                    onClick={onConnect}
                    className="btn-primary flex items-center space-x-2 text-sm"
                >
                    <Plus size={18} />
                    <span>Connect</span>
                </button>
            </div>

            {connectedAccounts.length > 0 && (
                <div className="mt-6 border-t border-slate-700 pt-4 space-y-3">
                    {connectedAccounts.map((acc: any) => (
                        <div key={acc.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs">
                                    {acc.username[0]}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">{acc.username}</p>
                                    <div className="flex items-center space-x-2">
                                        <span className="flex items-center text-[10px] text-green-600 font-semibold uppercase">
                                            <ShieldCheck size={10} className="mr-1" />
                                            Connected
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
