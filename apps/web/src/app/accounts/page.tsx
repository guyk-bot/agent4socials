'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
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
    ShieldCheck,
    Copy,
    Check,
    Loader2
} from 'lucide-react';

export default function AccountsPage() {
    const { user } = useAuth();
    const { setCachedAccounts } = useAccountsCache() ?? {};
    const [accounts, setAccounts] = useState<{ id: string; platform: string; username?: string; profilePicture?: string | null }[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState(false);
    const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
    const userId = user?.id ?? '';

    const copyUserId = () => {
        if (!userId) return;
        navigator.clipboard.writeText(userId);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
    };

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const res = await api.get('/social/accounts');
            const data = Array.isArray(res.data) ? res.data : [];
            setAccounts(data);
            setCachedAccounts?.(data);
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
        const getMessage = (err: unknown): string | null => {
            if (!err || typeof err !== 'object' || !('response' in err)) return null;
            const res = (err as { response?: { data?: { message?: string } } }).response;
            return res?.data?.message ?? null;
        };
        setConnectingPlatform(platform);
        try {
            // Sync profile first so Prisma User row exists (required for OAuth start). If you just added DATABASE_URL or signed in before it was set, this creates the User.
            await api.get('/auth/profile').catch(() => null);
            let res;
            try {
                res = await api.get(`/social/oauth/${platform}/start`);
            } catch (firstErr: unknown) {
                if ((firstErr as { response?: { status?: number } })?.response?.status === 401) {
                    await api.get('/auth/profile').catch(() => null);
                    res = await api.get(`/social/oauth/${platform}/start`);
                } else {
                    throw firstErr;
                }
            }
            const url = res?.data?.url;
            if (url && typeof url === 'string') {
                const popup = window.open(url, '_blank', 'width=600,height=600');
                if (popup) {
                    const interval = setInterval(() => {
                        if (popup.closed) {
                            clearInterval(interval);
                            fetchAccounts();
                        }
                    }, 500);
                }
                return;
            }
            alert('Invalid response from server. Check server logs.');
        } catch (err: unknown) {
            const msg = getMessage(err);
            if (msg) {
                if (msg.includes('META_APP_ID') || msg.includes('META_APP_SECRET')) {
                    alert('Instagram/Facebook: set META_APP_ID and META_APP_SECRET for Production in Vercel → Environment Variables. If already set, ensure they’re enabled for Production and redeploy.');
                } else if (msg === 'Unauthorized') {
                    alert('Account not synced. Sign out, sign back in, then try Connect again.');
                } else {
                    alert(msg);
                }
            } else {
                alert('Failed to start OAuth. Check Vercel → Logs for the error, and DATABASE_URL (pooler 6543), META_APP_ID and META_APP_SECRET for Instagram.');
            }
        } finally {
            setConnectingPlatform(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Social Accounts</h1>
                    <p className="text-neutral-500">Connect and manage your social media profiles.</p>
                    {userId && (
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-neutral-500">User ID (for support):</span>
                            <code className="text-xs bg-neutral-100 px-2 py-1 rounded font-mono text-neutral-700">{userId}</code>
                            <button
                                type="button"
                                onClick={copyUserId}
                                className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
                                title="Copy User ID"
                            >
                                {copiedId ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                            </button>
                        </div>
                    )}
                </div>
                <button onClick={fetchAccounts} className="p-2 text-neutral-500 hover:text-neutral-700 transition-colors">
                    <RefreshCw size={20} />
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <PlatformCard
                    name="Instagram"
                    platform="INSTAGRAM"
                    description="Schedule posts, reels and stories to your Business or Creator account. Connects via Facebook — you'll sign in with Facebook; we use the Instagram account linked to your Page."
                    icon={<Instagram size={24} className="text-pink-600" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'INSTAGRAM')}
                    onConnect={() => handleConnect('instagram')}
                    onRefreshProfile={fetchAccounts}
                    onDisconnect={fetchAccounts}
                    connecting={connectingPlatform === 'instagram'}
                />
                <PlatformCard
                    name="TikTok"
                    platform="TIKTOK"
                    description="Publish your creative videos directly to TikTok."
                    icon={<div className="font-bold text-lg">TT</div>}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'TIKTOK')}
                    onConnect={() => handleConnect('tiktok')}
                    onDisconnect={fetchAccounts}
                    connecting={connectingPlatform === 'tiktok'}
                />
                <PlatformCard
                    name="YouTube"
                    platform="YOUTUBE"
                    description="Upload and schedule videos to your YouTube channel."
                    icon={<Youtube size={24} className="text-red-600" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'YOUTUBE')}
                    onConnect={() => handleConnect('youtube')}
                    onDisconnect={fetchAccounts}
                    connecting={connectingPlatform === 'youtube'}
                />
                <PlatformCard
                    name="Facebook"
                    platform="FACEBOOK"
                    description="Post to your Facebook Page and reach your audience."
                    icon={<Facebook size={24} className="text-blue-600" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'FACEBOOK')}
                    onConnect={() => handleConnect('facebook')}
                    onDisconnect={fetchAccounts}
                    connecting={connectingPlatform === 'facebook'}
                />
                <PlatformCard
                    name="X (Twitter)"
                    platform="TWITTER"
                    description="Schedule tweets and threads to your X profile."
                    icon={<Twitter size={24} className="text-sky-500" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'TWITTER')}
                    onConnect={() => handleConnect('twitter')}
                    onDisconnect={fetchAccounts}
                    connecting={connectingPlatform === 'twitter'}
                />
                <PlatformCard
                    name="LinkedIn"
                    platform="LINKEDIN"
                    description="Share posts and articles to your LinkedIn profile."
                    icon={<Linkedin size={24} className="text-blue-700" />}
                    connectedAccounts={accounts.filter((a: any) => a.platform === 'LINKEDIN')}
                    onConnect={() => handleConnect('linkedin')}
                    onDisconnect={fetchAccounts}
                    connecting={connectingPlatform === 'linkedin'}
                />
            </div>
        </div>
    );
}

function PlatformCard({ name, description, icon, connectedAccounts, onConnect, onRefreshProfile, onDisconnect, connecting }: any) {
    const isConnected = connectedAccounts.length > 0;
    const primaryAccount = connectedAccounts[0];
    const [refreshing, setRefreshing] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const canRefresh = primaryAccount?.platform === 'INSTAGRAM' && !primaryAccount?.profilePicture && onRefreshProfile;

    const [actionError, setActionError] = useState<string | null>(null);

    const handleRefreshProfile = async () => {
        if (!primaryAccount?.id || !onRefreshProfile) return;
        setActionError(null);
        setRefreshing(true);
        try {
            await api.patch(`/social/accounts/${primaryAccount.id}/refresh`);
            onRefreshProfile();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setActionError(msg || 'Refresh failed. Try disconnecting and reconnecting.');
        } finally {
            setRefreshing(false);
        }
    };

    const handleDisconnect = async () => {
        if (!primaryAccount?.id || !onDisconnect) return;
        if (!window.confirm(`Disconnect ${name}? You can connect again anytime.`)) return;
        setActionError(null);
        setDisconnecting(true);
        try {
            await api.delete(`/social/accounts/${primaryAccount.id}`);
            onDisconnect();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setActionError(msg || 'Disconnect failed. Try again.');
        } finally {
            setDisconnecting(false);
        }
    };

    return (
        <div className="card">
            <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4 flex-1 min-w-0">
                    <div className="p-3 bg-neutral-100 rounded-xl flex-shrink-0">
                        {icon}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-neutral-900">{name}</h3>
                        <p className="text-sm text-neutral-500 max-w-md mt-1">{description}</p>
                        {isConnected && primaryAccount && (
                            <div className="flex items-center gap-3 mt-3 flex-wrap">
                                <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-sm overflow-hidden flex-shrink-0">
                                    {primaryAccount.profilePicture ? (
                                        <img src={primaryAccount.profilePicture} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        (primaryAccount.username || name)[0].toUpperCase()
                                    )}
                                </div>
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium text-neutral-900 truncate">{primaryAccount.username || name}</span>
                                    <span className="flex items-center shrink-0 text-[10px] text-green-600 font-semibold uppercase">
                                        <ShieldCheck size={10} className="mr-1" />
                                        Connected
                                    </span>
                                    {canRefresh && (
                                        <button
                                            type="button"
                                            onClick={handleRefreshProfile}
                                            disabled={refreshing}
                                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                            {refreshing ? 'Refreshing…' : 'Refresh profile'}
                                        </button>
                                    )}
                                    {actionError && (
                                        <span className="text-xs text-red-600" role="alert">{actionError}</span>
                                    )}
                                    {primaryAccount?.platform === 'INSTAGRAM' && !primaryAccount?.profilePicture && (
                                        <span className="text-xs text-neutral-500">Link an Instagram Business or Creator account to a Facebook Page to see your username and photo here.</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {isConnected ? (
                        <>
                            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium">
                                <ShieldCheck size={16} />
                                Connected
                            </span>
                            <button
                                type="button"
                                onClick={handleDisconnect}
                                disabled={disconnecting}
                                className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Disconnect"
                                aria-label="Disconnect account"
                            >
                                {disconnecting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onConnect}
                            disabled={connecting}
                            className="btn-primary flex items-center space-x-2 text-sm disabled:opacity-70 disabled:cursor-wait"
                        >
                            {connecting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                            <span>{connecting ? 'Connecting…' : 'Connect'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
