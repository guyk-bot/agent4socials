'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import api from '@/lib/api';
import {
    Send,
    Calendar,
    Image as ImageIcon,
    Video,
    X,
    Plus,
    Hash,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Sparkles,
    Loader2,
    Download,
    HelpCircle,
    Play,
    Pause,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppData } from '@/context/AppDataContext';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon, PinterestIcon } from '@/components/SocialPlatformIcons';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';

const COMPOSER_DRAFT_KEY = 'agent4socials_composer_draft';

type MediaItem = { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string };
type PlatformKey = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'TWITTER' | 'LINKEDIN' | 'PINTEREST';

function PlatformGlyph({ platform, size = 14 }: { platform: PlatformKey; size?: number }) {
    switch (platform) {
        case 'INSTAGRAM': return <InstagramIcon size={size} />;
        case 'FACEBOOK': return <FacebookIcon size={size} />;
        case 'TIKTOK': return <TikTokIcon size={size} />;
        case 'YOUTUBE': return <YoutubeIcon size={size} />;
        case 'TWITTER': return <XTwitterIcon size={size} className="text-neutral-800" />;
        case 'LINKEDIN': return <LinkedinIcon size={size} />;
        case 'PINTEREST': return <PinterestIcon size={size} />;
        default: return <Video size={size} className="text-neutral-500" />;
    }
}

type ComposerDraft = {
    platforms: string[];
    content: string;
    contentByPlatform: Record<string, string>;
    differentContentPerPlatform: boolean;
    mediaType: MediaTypeChoice;
    mediaList: MediaItem[];
    mediaByPlatform: Record<string, MediaItem[]>;
    differentMediaPerPlatform: boolean;
    differentThumbnailPerPlatform?: boolean;
    thumbnailByPlatform?: Record<string, string>;
    thumbnailChoice?: 'none' | 'upload' | 'frame';
    scheduledAt: string;
    scheduleDelivery: 'auto' | 'email_links';
    selectedHashtags: string[];
    differentHashtagsPerPlatform: boolean;
    selectedHashtagsByPlatform: Record<string, string[]>;
    commentAutomationEnabled: boolean;
    commentAutomationKeywords: string;
    commentAutomationReplyTemplate: string;
    commentAutomationReplyByPlatform?: Record<string, string>;
    commentAutomationReplyOnComment?: boolean;
    commentAutomationInstagramPublicReply: boolean;
    commentAutomationInstagramPrivateReply: boolean;
    commentAutomationInstagramDmMessage?: string;
    commentAutomationTagCommenter?: boolean;
};

function isPersistableMediaUrl(url: string): boolean {
    return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

/** Use proxy for R2 URLs so the browser gets correct Content-Type and avoids CORB. */
function mediaDisplayUrl(fileUrl: string): string {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) return fileUrl;
    if (fileUrl.includes('r2.dev') || fileUrl.includes('cloudflarestorage.com')) {
        return `/api/media/proxy?url=${encodeURIComponent(fileUrl)}`;
    }
    return fileUrl;
}

/**
 * URL suitable for canvas readback (frame picker).
 * R2/Cloudflare URLs go through our same-origin proxy so the canvas is not tainted (CORS).
 * The proxy supports Range requests for video so seeking works when moving the slider.
 * Use together with crossOrigin="anonymous" on the <video> element.
 */
function mediaCanvasUrl(fileUrl: string): string {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) return fileUrl;
    if (fileUrl.includes('r2.dev') || fileUrl.includes('cloudflarestorage.com')) {
        return `/api/media/proxy?url=${encodeURIComponent(fileUrl)}`;
    }
    return fileUrl;
}

/** Live frame preview in PostPreview while "Pick a frame from video" is selected (seeks with slider). */
function ComposerScrubVideoPreview({
    src,
    timeSec,
    className,
}: {
    src: string;
    timeSec: number;
    className?: string;
}) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const v = ref.current;
        if (!v) return;
        const seek = () => {
            if (!Number.isFinite(timeSec) || timeSec < 0) return;
            const d = v.duration;
            const cap = Number.isFinite(d) && d > 0.08 ? Math.min(timeSec, d - 0.05) : timeSec;
            try {
                if (Math.abs(v.currentTime - cap) > 0.04) v.currentTime = cap;
            } catch {
                /* seek can throw before metadata */
            }
        };
        seek();
        v.addEventListener('loadedmetadata', seek);
        return () => v.removeEventListener('loadedmetadata', seek);
    }, [src, timeSec]);
    return (
        <video
            ref={ref}
            src={src}
            className={className}
            muted
            playsInline
            preload="auto"
            crossOrigin={src.startsWith('blob:') ? undefined : 'anonymous'}
        />
    );
}

function formatPeekTimeSec(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Small composer preview: fixed box size (parent overflow-hidden + aspect ratio).
 * No native `controls` (they grow layout). Custom play + scrub bar.
 */
const ComposerMediaPeekPlayer = React.forwardRef<
    HTMLVideoElement,
    {
        src: string;
        active: boolean;
        fitClass: string;
        crossOrigin?: 'anonymous';
        /** Mirror main frame slider while open (frame-picker mode). */
        frameSyncTime?: number;
        /** When false, used as the only layer (plain video): show first frame when idle. */
        variant?: 'overlay' | 'inline';
    }
>(function ComposerMediaPeekPlayer(
    { src, active, fitClass, crossOrigin, frameSyncTime, variant = 'overlay' },
    forwardedRef,
) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const setVideoRef = useCallback(
        (el: HTMLVideoElement | null) => {
            videoRef.current = el;
            if (typeof forwardedRef === 'function') forwardedRef(el);
            else if (forwardedRef && typeof forwardedRef === 'object') {
                (forwardedRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
            }
        },
        [forwardedRef],
    );
    const [duration, setDuration] = useState(1);
    const [displayTime, setDisplayTime] = useState(0);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const onMeta = () => {
            const d = v.duration;
            setDuration(Number.isFinite(d) && d > 0 ? d : 1);
        };
        const onTime = () => setDisplayTime(v.currentTime);
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        v.addEventListener('loadedmetadata', onMeta);
        v.addEventListener('timeupdate', onTime);
        v.addEventListener('play', onPlay);
        v.addEventListener('pause', onPause);
        onMeta();
        return () => {
            v.removeEventListener('loadedmetadata', onMeta);
            v.removeEventListener('timeupdate', onTime);
            v.removeEventListener('play', onPlay);
            v.removeEventListener('pause', onPause);
        };
    }, [src]);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (!active) {
            v.pause();
            setPlaying(false);
            if (variant === 'inline') {
                try {
                    v.currentTime = 0;
                } catch {
                    /* */
                }
            }
            return;
        }
        void v.play().catch(() => {});
    }, [active, src, variant]);

    /** Scrub main frame slider while hover preview is open (frame-picker mode). */
    useEffect(() => {
        if (!active || frameSyncTime === undefined) return;
        const v = videoRef.current;
        if (!v) return;
        try {
            if (Math.abs(v.currentTime - frameSyncTime) > 0.12) {
                v.currentTime = frameSyncTime;
            }
        } catch {
            /* */
        }
    }, [frameSyncTime, active]);

    const togglePlay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) void v.play();
        else v.pause();
    }, []);

    const onScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = videoRef.current;
        if (!v) return;
        const t = parseFloat(e.target.value);
        v.currentTime = t;
        setDisplayTime(t);
    }, []);

    const dim = Math.max(0.01, duration);
    const rangeVal = Math.min(Math.max(0, displayTime), dim);

    return (
        <div
            className={`absolute inset-0 z-[3] flex flex-col justify-end overflow-hidden ${
                variant === 'overlay' ? 'bg-black' : 'bg-neutral-900'
            }`}
        >
            <video
                ref={setVideoRef}
                src={src}
                className={`absolute inset-0 z-[1] h-full w-full ${fitClass}`}
                playsInline
                muted
                preload="metadata"
                crossOrigin={crossOrigin}
            />
            {active ? (
                <>
                    {!playing ? (
                        <button
                            type="button"
                            className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40"
                            onClick={(e) => {
                                e.stopPropagation();
                                togglePlay();
                            }}
                            aria-label="Play video"
                        >
                            <span className="rounded-full bg-black/70 p-3 shadow-lg">
                                <Play className="h-8 w-8 text-white" fill="currentColor" aria-hidden />
                            </span>
                        </button>
                    ) : null}
                    <div className="relative z-30 flex flex-col gap-1 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-2 pb-1.5 pt-6">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="rounded-md bg-white/20 p-1.5 text-white hover:bg-white/30"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    togglePlay();
                                }}
                                aria-label={playing ? 'Pause' : 'Play'}
                            >
                                {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" fill="currentColor" aria-hidden />}
                            </button>
                            <span className="text-[10px] tabular-nums text-white/90">
                                {formatPeekTimeSec(displayTime)} / {formatPeekTimeSec(duration)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={dim}
                            step={0.01}
                            value={rangeVal}
                            onChange={onScrub}
                            className="h-1.5 w-full cursor-pointer accent-[var(--primary)]"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Seek video"
                        />
                    </div>
                </>
            ) : null}
        </div>
    );
});
ComposerMediaPeekPlayer.displayName = 'ComposerMediaPeekPlayer';

const PLATFORM_LABELS: Record<string, string> = {
    INSTAGRAM: 'Instagram',
    TIKTOK: 'TikTok',
    YOUTUBE: 'YouTube',
    FACEBOOK: 'Facebook',
    TWITTER: 'Twitter/X',
    LINKEDIN: 'LinkedIn',
    PINTEREST: 'Pinterest',
};

// Platforms that support comment-automation (replies to keyword comments)
const COMMENT_AUTOMATION_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);
const TWITTER_AI_MAX_CHARS = 230;

const HASHTAG_POOL_KEY = 'agent4socials_hashtag_pool';
const MAX_HASHTAGS_PER_POST = 5;

type MediaTypeChoice = 'photo' | 'video' | 'reel' | 'carousel';

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/x-ms-asf,video/x-msvideo,video/x-matroska,video/mpeg,video/webm,.mp4,.mov,.asf,.avi,.mkv,.mpeg,.mpg,.m4v,.webm';

const MEDIA_RECOMMENDATIONS: Record<MediaTypeChoice, { label: string; accept: string; multiple: boolean; hint: string; formatsHint?: string }> = {
    photo: { label: 'Photo', accept: 'image/*', multiple: false, hint: 'Recommended: 1080×1080 (square) or 1080×1350 (portrait). Works on all platforms.' },
    video: {
        label: 'Video',
        accept: VIDEO_ACCEPT,
        multiple: false,
        hint: 'YouTube: MP4, MOV up to 256GB, any length. X: MP4, MOV up to 512MB, 2m20s. LinkedIn: MP4 up to 5GB, 10 min. 1:1, 16:9, or 9:16.',
        formatsHint: 'MP4, MOV, ASF, AVI, MKV, MPEG-1/4, WebM',
    },
    reel: {
        label: 'Reel / Short',
        accept: VIDEO_ACCEPT,
        multiple: false,
        hint: 'Reels/TikTok: 1080×1920 (9:16), 15–90 sec. YouTube Shorts: 1080×1920, up to 60 sec. X best: 1080×1080 or 1080×1920, under 60s.',
        formatsHint: 'MP4, MOV, ASF, AVI, MKV, MPEG-1/4, WebM',
    },
    carousel: { label: 'Carousel', accept: 'image/*', multiple: true, hint: 'Add multiple images (2–10). Recommended: 1080×1080 per slide. Instagram, Facebook, X, and LinkedIn support carousels.' },
};

function normalizeHashtag(t: string): string {
    const s = t.trim().replace(/^#+/, '');
    return s ? `#${s}` : '';
}

/** Extract hashtags from text (e.g. stored post content) for pre-filling selection when opening from History. */
function extractHashtagsFromText(text: string | null | undefined): string[] {
    if (!text || typeof text !== 'string') return [];
    const matches = text.match(/#[\w]+/g) ?? [];
    const normalized = [...new Set(matches.map((m) => normalizeHashtag(m)).filter(Boolean))];
    return normalized.slice(0, MAX_HASHTAGS_PER_POST);
}

/** Extract up to 5 hashtags from a post's content and contentByPlatform (so opening from History shows them as selected). */
function extractHashtagsFromPost(post: { content?: string | null; contentByPlatform?: Record<string, string> | null }): string[] {
    const texts: string[] = [];
    if (post.content && typeof post.content === 'string') texts.push(post.content);
    if (post.contentByPlatform && typeof post.contentByPlatform === 'object') {
        for (const v of Object.values(post.contentByPlatform)) {
            if (typeof v === 'string' && v.trim()) texts.push(v);
        }
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const text of texts) {
        const matches = text.match(/#[\w]+/g) ?? [];
        for (const m of matches) {
            const tag = normalizeHashtag(m);
            if (tag && !seen.has(tag)) {
                seen.add(tag);
                out.push(tag);
                if (out.length >= MAX_HASHTAGS_PER_POST) return out;
            }
        }
    }
    return out;
}

/** Remove trailing hashtags from content so we can store caption and selectedHashtags separately (avoid duplicate in preview). */
function stripTrailingHashtags(text: string): string {
    return text.replace(/(?:\s+#[\w]+)+\s*$/, '').trimEnd();
}

function toLocalDateTimeInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function minSchedulableDateTimeLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 1, 0, 0);
    return toLocalDateTimeInputValue(d);
}

const MEDIA_SPECS: Record<string, { platform: PlatformKey; name: string; specs: { label: string; value: string; tag?: string }[] }[]> = {
    photo: [
        { platform: 'INSTAGRAM', name: 'Instagram', specs: [{ label: 'Square', value: '1080×1080 (1:1)', tag: 'Safe for all' }, { label: 'Portrait', value: '1080×1350 (4:5)', tag: 'Best reach' }, { label: 'Landscape', value: '1080×566 (1.91:1)' }] },
        { platform: 'FACEBOOK', name: 'Facebook', specs: [{ label: 'Portrait', value: '1080×1350 (4:5)', tag: 'Best reach' }, { label: 'Square', value: '1080×1080 (1:1)' }, { label: 'Landscape', value: '1200×630 (1.91:1)' }] },
        { platform: 'LINKEDIN', name: 'LinkedIn', specs: [{ label: 'Portrait', value: '1080×1350 (4:5)', tag: 'Best reach' }, { label: 'Square', value: '1200×1200 (1:1)' }, { label: 'Landscape', value: '1200×627 (1.91:1)' }] },
        { platform: 'TWITTER', name: 'Twitter/X', specs: [{ label: 'Landscape', value: '1600×900 (16:9)', tag: 'Recommended' }, { label: 'Square', value: '1080×1080 (1:1)' }] },
    ],
    video: [
        { platform: 'YOUTUBE', name: 'YouTube', specs: [{ label: 'Standard', value: '1920×1080 (16:9)', tag: 'Recommended' }, { label: 'Thumbnail', value: '1280×720 (16:9)' }] },
        { platform: 'LINKEDIN', name: 'LinkedIn', specs: [{ label: 'Landscape', value: '1920×1080 (16:9)', tag: 'Recommended' }, { label: 'Square', value: '1080×1080 (1:1)' }, { label: 'Vertical', value: '1080×1920 (9:16)' }] },
        { platform: 'TWITTER', name: 'Twitter/X', specs: [{ label: 'Landscape', value: '1280×720 (16:9)', tag: 'Recommended' }] },
        { platform: 'FACEBOOK', name: 'Facebook', specs: [{ label: 'Portrait', value: '1080×1350 (4:5)', tag: 'Best reach' }, { label: 'Landscape', value: '1200×630 (1.91:1)' }] },
    ],
    reel: [
        { platform: 'INSTAGRAM', name: 'Instagram Reels', specs: [{ label: 'Vertical', value: '1080×1920 (9:16)', tag: 'Required' }] },
        { platform: 'TIKTOK', name: 'TikTok', specs: [{ label: 'Vertical', value: '1080×1920 (9:16)', tag: 'Required' }] },
        { platform: 'YOUTUBE', name: 'YouTube Shorts', specs: [{ label: 'Vertical', value: '1080×1920 (9:16)', tag: 'Required' }, { label: 'Max duration', value: '60 sec' }] },
        { platform: 'FACEBOOK', name: 'Facebook Reels', specs: [{ label: 'Vertical', value: '1080×1920 (9:16)', tag: 'Recommended' }] },
        { platform: 'LINKEDIN', name: 'LinkedIn', specs: [{ label: 'Vertical', value: '1080×1920 (9:16)', tag: 'Supported' }] },
        { platform: 'PINTEREST', name: 'Pinterest', specs: [{ label: 'Vertical', value: '1080×1920 (9:16)', tag: 'Recommended' }] },
        { platform: 'TWITTER', name: 'Twitter/X', specs: [{ label: 'Square', value: '1080×1080 (1:1)', tag: 'Best' }, { label: 'Vertical', value: '1080×1920 (9:16)', tag: 'Under 60s' }] },
    ],
    carousel: [
        { platform: 'INSTAGRAM', name: 'Instagram', specs: [{ label: 'Per slide', value: '1080×1080 (1:1)', tag: 'Recommended' }, { label: 'Slides', value: '2–10 images' }] },
        { platform: 'FACEBOOK', name: 'Facebook', specs: [{ label: 'Per slide', value: '1080×1080 (1:1)', tag: 'Recommended' }] },
        { platform: 'LINKEDIN', name: 'LinkedIn', specs: [{ label: 'Per slide', value: '1080×1080 (1:1)', tag: 'Recommended' }] },
        { platform: 'TWITTER', name: 'Twitter/X', specs: [{ label: 'Per slide', value: '1080×1080 (1:1)' }] },
    ],
};

function MediaRequirementsHint({ mediaType }: { mediaType: keyof typeof MEDIA_SPECS }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const specs = MEDIA_SPECS[mediaType] ?? [];

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const tagColor = (tag?: string) => {
        if (!tag) return '';
        if (tag === 'Required') return 'bg-red-50 text-red-600 border border-red-200';
        if (tag === 'Best' || tag === 'Best reach' || tag === 'Recommended') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
        return 'bg-neutral-100 text-neutral-500 border border-neutral-200';
    };

    return (
        <div className="relative flex items-center gap-1.5">
            <span className="text-xs text-neutral-500">Ensure your media meets platform requirements.</span>
            <button
                ref={btnRef}
                type="button"
                className="shrink-0 text-neutral-400 hover:text-neutral-600 transition-colors"
                onClick={() => setOpen((v) => !v)}
                aria-label="View platform media specifications"
            >
                <HelpCircle size={13} />
            </button>
            {open && (
                <div
                    ref={popoverRef}
                    className="absolute left-0 top-full mt-1.5 z-50 w-80 rounded-xl border border-neutral-200 bg-white shadow-xl overflow-hidden"
                >
                    <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between">
                        <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Platform specs</span>
                        <button type="button" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                            <X size={13} />
                        </button>
                    </div>
                    <div className="divide-y divide-neutral-100 max-h-72 overflow-y-auto">
                        {specs.map((platform) => (
                            <div key={platform.name} className="px-4 py-2.5">
                                <p className="text-xs font-semibold text-neutral-700 mb-1.5 flex items-center gap-1.5">
                                    <PlatformGlyph platform={platform.platform} size={14} />
                                    {platform.name}
                                </p>
                                <div className="space-y-1">
                                    {platform.specs.map((s) => (
                                        <div key={s.label} className="flex items-center justify-between gap-2">
                                            <span className="text-xs text-neutral-500">{s.label}</span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-xs font-medium text-neutral-700">{s.value}</span>
                                                {s.tag && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tagColor(s.tag)}`}>{s.tag}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ComposerPage() {
    const router = useRouter();
    const appData = useAppData();
    const searchParams = useSearchParams();
    const editPostId = searchParams.get('edit');
    const [platforms, setPlatforms] = useState<string[]>([]);
    const [content, setContent] = useState('');
    const [contentByPlatform, setContentByPlatform] = useState<Record<string, string>>({});
    const [differentContentPerPlatform, setDifferentContentPerPlatform] = useState(false);
    const [mediaList, setMediaList] = useState<MediaItem[]>([]);
    const [mediaByPlatform, setMediaByPlatform] = useState<Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>>({});
    const [differentMediaPerPlatform, setDifferentMediaPerPlatform] = useState(false);
    const [mediaUploading, setMediaUploading] = useState(false);
    const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
    const [mediaType, setMediaType] = useState<MediaTypeChoice>('photo');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const thumbnailFileInputRef = useRef<HTMLInputElement>(null);
    const videoThumbnailRef = useRef<HTMLVideoElement>(null);
    const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);
    const ignoreTimeUpdateUntilRef = useRef<number>(0);
    const autoThumbnailDoneForRef = useRef<string | null>(null);
    const justAutoGeneratedThumbRef = useRef(false);
    /** Hover playback layer for the small media preview (thumbnail / frame / plain video). */
    const mediaPeekPlayRef = useRef<HTMLVideoElement>(null);
    const [mediaPeekHover, setMediaPeekHover] = useState(false);
    const [thumbnailPickerTime, setThumbnailPickerTime] = useState(0);
    const [thumbnailVideoDuration, setThumbnailVideoDuration] = useState(1);
    const [thumbnailPicking, setThumbnailPicking] = useState(false);
    const fileInputByPlatformRef = useRef<Record<string, HTMLInputElement | null>>({});
    const [scheduledAt, setScheduledAt] = useState('');
    const [scheduleDelivery, setScheduleDelivery] = useState<'auto' | 'email_links'>('auto');
    const [accounts, setAccounts] = useState<{ id: string; platform: string }[]>([]);
    const [accountsFetched, setAccountsFetched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [sectionOpen, setSectionOpen] = useState({ platforms: true, media: true, content: false, commentAutomation: false, hashtags: false, schedule: false });
    const toggleSection = (key: keyof typeof sectionOpen) => setSectionOpen((s) => ({ ...s, [key]: !s[key] }));


    // Resizable right preview panel (px); min 300, max 920
    const [previewWidthPx, setPreviewWidthPx] = useState(600);
    const previewResizeRef = useRef<{ startX: number; startW: number } | null>(null);
    const saveAsDraftRef = useRef(false);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const r = previewResizeRef.current;
            if (!r) return;
            const delta = r.startX - e.clientX;
            setPreviewWidthPx((w) => Math.min(920, Math.max(300, r.startW + delta)));
        };
        const onUp = () => { previewResizeRef.current = null; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    // Thumbnail source: which single option is selected (none = use video default, upload = custom image, frame = pick from video)
    const [thumbnailChoice, setThumbnailChoice] = useState<'none' | 'upload' | 'frame'>('none');
    const [thumbnailVideoLoadState, setThumbnailVideoLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
    const [differentThumbnailPerPlatform, setDifferentThumbnailPerPlatform] = useState(false);
    const [thumbnailByPlatform, setThumbnailByPlatform] = useState<Record<string, string>>({});
    const [selectedPlatformForThumbnail, setSelectedPlatformForThumbnail] = useState<string>('');


    // When platforms change, keep selected platform for thumbnail in sync
    useEffect(() => {
        if (platforms.length === 0) return;
        setSelectedPlatformForThumbnail((prev) => (platforms.includes(prev) ? prev : platforms[0]));
    }, [platforms]);
    // Keep only currently selected platforms in per-platform thumbnail map.
    useEffect(() => {
        setThumbnailByPlatform((prev) => {
            const next: Record<string, string> = {};
            for (const p of platforms) {
                if (prev[p]) next[p] = prev[p];
            }
            return next;
        });
    }, [platforms]);

    // When we have a thumbnail (e.g. from draft), show a selected option so UI matches state.
    // Skip if we auto-generated (thumbnailChoice stayed 'none' by design).
    useEffect(() => {
        if (mediaList.length === 1 && mediaList[0].type === 'VIDEO' && mediaList[0].thumbnailUrl && thumbnailChoice === 'none') {
            if (autoThumbnailDoneForRef.current === mediaList[0].fileUrl) return; // auto-generated, keep 'none'
            setThumbnailChoice('upload');
        }
    }, [mediaList.length, mediaList[0]?.type, mediaList[0]?.thumbnailUrl, mediaList[0]?.fileUrl, thumbnailChoice]);

    // Reset thumbnail video load state when source changes or user switches to/from frame picker
    useEffect(() => {
        setThumbnailVideoLoadState('idle');
    }, [thumbnailChoice, mediaList[0]?.fileUrl]);

    useEffect(() => {
        setMediaPeekHover(false);
    }, [mediaList[0]?.fileUrl, thumbnailChoice]);

    const firstVideo = mediaList[0];
    const handleMediaPeekEnter = useCallback(() => {
        if (firstVideo?.type !== 'VIDEO') return;
        setMediaPeekHover(true);
    }, [firstVideo?.type]);

    const handleMediaPeekLeave = useCallback(() => {
        setMediaPeekHover(false);
        mediaPeekPlayRef.current?.pause();
    }, []);

    // Auto-capture video frame for thumbnail when user chose "No custom thumbnail" (for History display only; publish uses video default)
    useEffect(() => {
        const item = mediaList[0];
        if (!item) {
            autoThumbnailDoneForRef.current = null;
            return;
        }
        if (item.type !== 'VIDEO' || thumbnailChoice !== 'none' || item.thumbnailUrl) return;
        if (autoThumbnailDoneForRef.current === item.fileUrl) return;
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        const canvasUrl = mediaCanvasUrl(item.fileUrl);
        const src = canvasUrl.startsWith('http') ? canvasUrl
            : canvasUrl.startsWith('/')
                ? `${typeof window !== 'undefined' ? window.location.origin : ''}${canvasUrl}`
                : canvasUrl;
        video.src = src;
        const onCanPlay = async () => {
            if (autoThumbnailDoneForRef.current === item.fileUrl) return;
            try {
                video.currentTime = Math.min(1, Math.max(0, (video.duration || 1) * 0.05));
                await new Promise<void>((r) => {
                    video.onseeked = () => r();
                    video.onerror = () => r();
                });
                if (autoThumbnailDoneForRef.current === item.fileUrl) return;
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(video, 0, 0);
                const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
                if (!blob) return;
                autoThumbnailDoneForRef.current = item.fileUrl;
                justAutoGeneratedThumbRef.current = true;
                const file = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
                const { fileUrl } = await uploadFile(file);
                setMediaList((prev) => prev.map((m, i) => (i === 0 ? { ...m, thumbnailUrl: fileUrl } : m)));
            } finally {
                video.remove();
            }
        };
        video.addEventListener('canplay', onCanPlay, { once: true });
        video.load();
        return () => {
            video.removeEventListener('canplay', onCanPlay);
            video.remove();
        };
    }, [mediaList, thumbnailChoice]);

    // Hashtags: pool (saved), selection for this post (max 5), per-platform option
    const [hashtagPool, setHashtagPool] = useState<string[]>([]);
    const [newHashtagInput, setNewHashtagInput] = useState('');
    const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
    const [differentHashtagsPerPlatform, setDifferentHashtagsPerPlatform] = useState(false);
    const [selectedHashtagsByPlatform, setSelectedHashtagsByPlatform] = useState<Record<string, string[]>>({});

    // Comment automation (optional): keyword capture + auto-reply for this post (per-platform reply text)
    const [commentAutomationEnabled, setCommentAutomationEnabled] = useState(false);
    const [commentAutomationKeywords, setCommentAutomationKeywords] = useState('');
    const [commentAutomationReplyTemplate, setCommentAutomationReplyTemplate] = useState('');
    const [commentAutomationReplyByPlatform, setCommentAutomationReplyByPlatform] = useState<Record<string, string>>({});
    const [commentAutomationReplyOnComment, setCommentAutomationReplyOnComment] = useState(true);
    const [commentAutomationInstagramPublicReply, setCommentAutomationInstagramPublicReply] = useState(true);
    const [commentAutomationInstagramPrivateReply, setCommentAutomationInstagramPrivateReply] = useState(false);
    const [commentAutomationInstagramDmMessage, setCommentAutomationInstagramDmMessage] = useState('');
    const [commentAutomationTagCommenter, setCommentAutomationTagCommenter] = useState(false);

    // AI description (optional): generate copy from brand context
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiPlatform, setAiPlatform] = useState('');
    const [aiIncludeCtaAndAutomation, setAiIncludeCtaAndAutomation] = useState(false);
    const [aiCtaAutomationPrompt, setAiCtaAutomationPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [dmReplyAiLoading, setDmReplyAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [hasBrandContext, setHasBrandContext] = useState<boolean | null>(null);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        if (!aiModalOpen) return;
        const prevBody = document.body.style.overflow;
        const prevHtml = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevBody;
            document.documentElement.style.overflow = prevHtml;
        };
    }, [aiModalOpen]);

    useEffect(() => {
        try {
            const raw = typeof window !== 'undefined' ? localStorage.getItem(HASHTAG_POOL_KEY) : null;
            if (raw) {
                const parsed = JSON.parse(raw) as string[];
                if (Array.isArray(parsed)) setHashtagPool(parsed);
            }
        } catch (_) { /* ignore */ }
    }, []);

    useEffect(() => {
        if (hashtagPool.length === 0) return;
        try {
            localStorage.setItem(HASHTAG_POOL_KEY, JSON.stringify(hashtagPool));
        } catch (_) { /* ignore */ }
    }, [hashtagPool]);

    // Restore composer draft from localStorage on mount (so progress survives navigation/refresh)
    const [draftRestored, setDraftRestored] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || draftRestored) return;
        if (editPostId) { setDraftRestored(true); return; }
        try {
            const raw = localStorage.getItem(COMPOSER_DRAFT_KEY);
            if (!raw) {
                setDraftRestored(true);
                return;
            }
            const d = JSON.parse(raw) as Partial<ComposerDraft>;
            if (d && typeof d === 'object') {
                if (Array.isArray(d.platforms)) setPlatforms(d.platforms);
                if (typeof d.content === 'string') setContent(d.content);
                if (d.contentByPlatform && typeof d.contentByPlatform === 'object') setContentByPlatform(d.contentByPlatform);
                if (typeof d.differentContentPerPlatform === 'boolean') setDifferentContentPerPlatform(d.differentContentPerPlatform);
                if (d.mediaType === 'photo' || d.mediaType === 'video' || d.mediaType === 'reel' || d.mediaType === 'carousel') setMediaType(d.mediaType);
                if (Array.isArray(d.mediaList)) {
                    const valid = d.mediaList.filter((m) => m && isPersistableMediaUrl(m.fileUrl));
                    if (valid.length) setMediaList(valid);
                }
                if (d.mediaByPlatform && typeof d.mediaByPlatform === 'object') {
                    const cleaned: Record<string, MediaItem[]> = {};
                    for (const [k, arr] of Object.entries(d.mediaByPlatform)) {
                        if (Array.isArray(arr)) {
                            const v = arr.filter((m) => m && isPersistableMediaUrl(m.fileUrl)) as MediaItem[];
                            if (v.length) cleaned[k] = v;
                        }
                    }
                    if (Object.keys(cleaned).length) setMediaByPlatform(cleaned);
                }
                if (typeof d.differentMediaPerPlatform === 'boolean') setDifferentMediaPerPlatform(d.differentMediaPerPlatform);
                if (typeof d.differentThumbnailPerPlatform === 'boolean') setDifferentThumbnailPerPlatform(d.differentThumbnailPerPlatform);
                if (d.thumbnailByPlatform && typeof d.thumbnailByPlatform === 'object') setThumbnailByPlatform(d.thumbnailByPlatform);
                if (d.thumbnailChoice === 'none' || d.thumbnailChoice === 'upload' || d.thumbnailChoice === 'frame') setThumbnailChoice(d.thumbnailChoice);
                if (typeof d.scheduledAt === 'string') {
                    const parsed = new Date(d.scheduledAt);
                    if (!Number.isNaN(parsed.getTime())) {
                        const pad = (n: number) => String(n).padStart(2, '0');
                        setScheduledAt(`${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`);
                    } else setScheduledAt(d.scheduledAt);
                }
                if (d.scheduleDelivery === 'auto' || d.scheduleDelivery === 'email_links') setScheduleDelivery(d.scheduleDelivery);
                if (Array.isArray(d.selectedHashtags)) setSelectedHashtags(d.selectedHashtags);
                if (typeof d.differentHashtagsPerPlatform === 'boolean') setDifferentHashtagsPerPlatform(d.differentHashtagsPerPlatform);
                if (d.selectedHashtagsByPlatform && typeof d.selectedHashtagsByPlatform === 'object') setSelectedHashtagsByPlatform(d.selectedHashtagsByPlatform);
                if (typeof d.commentAutomationEnabled === 'boolean') setCommentAutomationEnabled(d.commentAutomationEnabled);
                if (typeof d.commentAutomationKeywords === 'string') setCommentAutomationKeywords(d.commentAutomationKeywords);
                if (typeof d.commentAutomationReplyTemplate === 'string') setCommentAutomationReplyTemplate(d.commentAutomationReplyTemplate);
                if (d.commentAutomationReplyByPlatform && typeof d.commentAutomationReplyByPlatform === 'object') setCommentAutomationReplyByPlatform(d.commentAutomationReplyByPlatform);
                if (typeof d.commentAutomationReplyOnComment === 'boolean') setCommentAutomationReplyOnComment(d.commentAutomationReplyOnComment);
                if (typeof d.commentAutomationInstagramPublicReply === 'boolean') setCommentAutomationInstagramPublicReply(d.commentAutomationInstagramPublicReply);
                if (typeof d.commentAutomationInstagramPrivateReply === 'boolean') setCommentAutomationInstagramPrivateReply(d.commentAutomationInstagramPrivateReply);
                if (typeof d.commentAutomationInstagramDmMessage === 'string') setCommentAutomationInstagramDmMessage(d.commentAutomationInstagramDmMessage);
                if (typeof d.commentAutomationTagCommenter === 'boolean') setCommentAutomationTagCommenter(d.commentAutomationTagCommenter);
            }
        } catch (_) { /* ignore */ }
        setDraftRestored(true);
    }, [draftRestored]);

    // Load post for editing when ?edit=id is present
    const [editLoaded, setEditLoaded] = useState(false);
    const [editPostAlreadyPosted, setEditPostAlreadyPosted] = useState(false);
    useEffect(() => {
        if (!editPostId || editLoaded) return;
        let cancelled = false;
        api.get(`/posts/${editPostId}`)
            .then((res) => {
                if (cancelled || !res.data) return;
                const p = res.data as {
                    status?: string;
                    title?: string | null;
                    content?: string | null;
                    contentByPlatform?: Record<string, string> | null;
                    media?: { fileUrl: string; type: string }[];
                    mediaByPlatform?: Record<string, { fileUrl: string; type: string }[]>;
                    targets?: {
                        platform?: string;
                        status?: string;
                        error?: string | null;
                        socialAccount?: { id: string; platform?: string };
                    }[];
                    scheduledAt?: string | null;
                    scheduleDelivery?: string | null;
                    commentAutomation?: { keywords?: string[]; replyTemplate?: string; replyTemplateByPlatform?: Record<string, string>; instagramPublicReply?: boolean; instagramPrivateReply?: boolean; instagramDmTemplate?: string } | null;
                };
                // Show stored publish errors from previous attempt so user knows why it failed
                if (p.status === 'FAILED' && Array.isArray(p.targets)) {
                    const failedTargets = p.targets.filter((t) => t.status === 'FAILED' && t.error);
                    if (failedTargets.length > 0) {
                        const errLines = failedTargets.map((t) => `${t.platform ?? 'Platform'}: ${t.error}`).join('\n');
                        const hint = failedTargets.some((t) => t.platform === 'TIKTOK' && typeof t.error === 'string' && (t.error.includes('scope_not_authorized') || t.error.includes('not implemented') || t.error.includes('Publish not implemented')))
                            ? '\n\nFor TikTok: reconnect your TikTok account from the Dashboard (Accounts page) so the new video.publish permission is granted, then try Post now again.'
                            : '';
                        setAlertMessage(`This post failed to publish. Errors from last attempt:\n\n${errLines}${hint}`);
                    }
                }
                setEditPostAlreadyPosted(p.status === 'POSTED');
                const plats = [...new Set((p.targets ?? []).map((t) => t.socialAccount?.platform ?? t.platform ?? '').filter(Boolean))];
                setPlatforms(plats);
                const cp = p.contentByPlatform && typeof p.contentByPlatform === 'object' ? p.contentByPlatform : {};
                const hasPerPlatform = Object.keys(cp).some((k) => (cp[k] ?? '').trim());
                setDifferentContentPerPlatform(hasPerPlatform);
                const rawContent = (p.content ?? '').trim();
                const rawFirstPlatform = (cp[plats[0]] ?? rawContent).trim();
                if (hasPerPlatform) {
                    setContentByPlatform({ ...cp });
                    setContent(stripTrailingHashtags(rawFirstPlatform));
                } else {
                    setContent(stripTrailingHashtags(rawContent));
                }
                const mediaList_ = (p.media ?? []).map((m) => ({
                    fileUrl: m.fileUrl,
                    type: (m.type === 'VIDEO' ? 'VIDEO' : 'IMAGE') as 'IMAGE' | 'VIDEO',
                    thumbnailUrl: (m as { metadata?: { thumbnailUrl?: string } }).metadata?.thumbnailUrl,
                }));
                setMediaList(mediaList_);
                if (mediaList_.length === 1 && mediaList_[0].type === 'VIDEO') setMediaType('reel');
                else if (mediaList_.length === 1) setMediaType('photo');
                else if (mediaList_.length > 1) setMediaType('carousel');
                if (p.mediaByPlatform && Object.keys(p.mediaByPlatform).length > 0) {
                    const cleaned: Record<string, MediaItem[]> = {};
                    for (const [k, arr] of Object.entries(p.mediaByPlatform)) {
                        if (Array.isArray(arr)) cleaned[k] = arr.map((m) => ({
                            fileUrl: m.fileUrl,
                            type: (m.type === 'VIDEO' ? 'VIDEO' : 'IMAGE') as 'IMAGE' | 'VIDEO',
                            thumbnailUrl: (m as { thumbnailUrl?: string }).thumbnailUrl,
                        }));
                    }
                    setMediaByPlatform(cleaned);
                    setDifferentMediaPerPlatform(true);
                }
                if (p.scheduledAt) {
                    const d = new Date(p.scheduledAt);
                    const pad = (n: number) => String(n).padStart(2, '0');
                    setScheduledAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                }
                if (p.scheduleDelivery === 'auto' || p.scheduleDelivery === 'email_links') setScheduleDelivery(p.scheduleDelivery);
                const ca = p.commentAutomation;
                if (ca && Array.isArray(ca.keywords) && ca.keywords.length > 0) {
                    setCommentAutomationEnabled(true);
                    setCommentAutomationKeywords(ca.keywords.join(', '));
                    setCommentAutomationReplyTemplate((ca.replyTemplate ?? '').trim());
                    if (ca.replyTemplateByPlatform && typeof ca.replyTemplateByPlatform === 'object') {
                        setCommentAutomationReplyByPlatform({ ...ca.replyTemplateByPlatform });
                    }
                    if (typeof (ca as { replyOnComment?: boolean }).replyOnComment === 'boolean') {
                        setCommentAutomationReplyOnComment((ca as { replyOnComment: boolean }).replyOnComment);
                    }
                    const caIg = ca as { instagramPublicReply?: boolean; instagramPrivateReply?: boolean; instagramDmTemplate?: string; usePrivateReply?: boolean };
                    if (typeof caIg.instagramPublicReply === 'boolean') setCommentAutomationInstagramPublicReply(caIg.instagramPublicReply);
                    else if (caIg.usePrivateReply) setCommentAutomationInstagramPublicReply(false);
                    if (typeof caIg.instagramPrivateReply === 'boolean') setCommentAutomationInstagramPrivateReply(caIg.instagramPrivateReply);
                    else if (caIg.usePrivateReply) setCommentAutomationInstagramPrivateReply(true);
                    if (typeof caIg.instagramDmTemplate === 'string') setCommentAutomationInstagramDmMessage(caIg.instagramDmTemplate);
                }
                // Pre-fill selected hashtags from post content (and contentByPlatform) so "Select up to 5" shows them as selected
                const tagsFromPost = extractHashtagsFromPost(p);
                if (tagsFromPost.length > 0) {
                    setHashtagPool((prev) => {
                        const combined = [...prev];
                        for (const tag of tagsFromPost) {
                            if (!combined.includes(tag)) combined.push(tag);
                        }
                        return combined.sort();
                    });
                    setSelectedHashtags(tagsFromPost);
                }
                setEditLoaded(true);
            })
            .catch(() => setEditLoaded(true));
        return () => { cancelled = true; };
    }, [editPostId, editLoaded]);

    const clearComposerDraft = useCallback(() => {
        try {
            localStorage.removeItem(COMPOSER_DRAFT_KEY);
        } catch (_) { /* ignore */ }
    }, []);

    const openAiModal = useCallback(() => {
        setAiError(null);
        setAiTopic('');
        setAiPrompt('');
        setAiPlatform(platforms[0] || '');
        setAiModalOpen(true);
        api.get('/ai/brand-context').then((res) => {
            const data = res.data;
            setHasBrandContext(!!(data && typeof data === 'object' && (data.targetAudience ?? data.toneOfVoice ?? data.productDescription)));
        }).catch(() => setHasBrandContext(false));
    }, [platforms]);

    const clampTwitterAiText = useCallback((text: string): string => {
        const raw = text.trim();
        if (raw.length <= TWITTER_AI_MAX_CHARS) return raw;
        const sliced = raw.slice(0, TWITTER_AI_MAX_CHARS);
        const lastSpace = sliced.lastIndexOf(' ');
        return (lastSpace > 120 ? sliced.slice(0, lastSpace) : sliced).trim();
    }, []);

    const handleAiGenerate = useCallback(() => {
        if (!aiTopic.trim()) {
            setAiError('Describe what this post is about.');
            return;
        }
        setAiLoading(true);
        setAiError(null);
        const topic = aiTopic.trim();
        const prompt = aiPrompt.trim() || undefined;

        const applyCtaAndAutomation = (
            data: { content?: string; cta?: string; keywords?: string[]; replyTemplate?: string },
            platformForContent?: string
        ) => {
            if (!data) return;
            if (data.cta && typeof data.content === 'string') {
                const withCta = data.content.trim() + '\n\n' + data.cta.trim();
                const isTwitter = (platformForContent ?? aiPlatform).toUpperCase() === 'TWITTER';
                setContent(isTwitter ? clampTwitterAiText(withCta) : withCta);
            }
            if (Array.isArray(data.keywords) && data.keywords.length > 0) {
                setCommentAutomationEnabled(true);
                setCommentAutomationKeywords(data.keywords.join(', '));
            }
            if (typeof data.replyTemplate === 'string' && data.replyTemplate.trim()) {
                setCommentAutomationReplyTemplate(data.replyTemplate.trim());
            }
        };

        if (differentContentPerPlatform && platforms.length > 0) {
            // Generate one description per selected platform; first call includes CTA + automation
            const firstPlatform = platforms[0];
            const rest = platforms.slice(1);
            const firstPromise = api.post<{ content?: string; cta?: string; keywords?: string[]; replyTemplate?: string }>('/ai/generate-description', {
                topic,
                prompt,
                platform: firstPlatform,
                includeCtaAndAutomation: aiIncludeCtaAndAutomation,
                ctaAutomationPrompt: aiIncludeCtaAndAutomation ? aiCtaAutomationPrompt.trim() || undefined : undefined,
            }).then((res) => ({ platform: firstPlatform, data: res.data }));
            const restPromises = rest.map((p) =>
                api.post<{ content?: string }>('/ai/generate-description', { topic, prompt, platform: p }).then((res) => ({ platform: p, data: res.data }))
            );
            Promise.all([firstPromise, ...restPromises])
                .then((results) => {
                    const first = results[0];
                    const ctaText = aiIncludeCtaAndAutomation ? (first?.data as { cta?: string })?.cta?.trim() ?? '' : '';
                    setContentByPlatform((prev) => {
                        const next = { ...prev };
                        for (const { platform, data: d } of results) {
                            let text = d?.content ?? '';
                            if (aiIncludeCtaAndAutomation && ctaText) {
                                text = text.trim() + '\n\n' + ctaText;
                            }
                            if (platform === 'TWITTER') {
                                text = clampTwitterAiText(text);
                            }
                            next[platform] = text;
                        }
                        return next;
                    });
                    if (aiIncludeCtaAndAutomation && first?.data) applyCtaAndAutomation(first.data, first.platform);
                    setAiModalOpen(false);
                })
                .catch((err) => {
                    const msg = err.response?.data?.message ?? 'Failed to generate for one or more platforms. Try again.';
                    setAiError(msg);
                })
                .finally(() => setAiLoading(false));
        } else {
            api.post<{ content?: string; cta?: string; keywords?: string[]; replyTemplate?: string }>('/ai/generate-description', {
                topic,
                prompt,
                platform: aiPlatform || undefined,
                includeCtaAndAutomation: aiIncludeCtaAndAutomation,
                ctaAutomationPrompt: aiIncludeCtaAndAutomation ? aiCtaAutomationPrompt.trim() || undefined : undefined,
            }).then((res) => {
                const data = res.data;
                const isTwitter = (aiPlatform || '').toUpperCase() === 'TWITTER';
                setContent(isTwitter ? clampTwitterAiText(data?.content ?? '') : (data?.content ?? ''));
                if (aiIncludeCtaAndAutomation && data) applyCtaAndAutomation(data);
                setAiModalOpen(false);
            }).catch((err) => {
                const msg = err.response?.data?.message ?? 'Failed to generate. Try again.';
                setAiError(msg);
            }).finally(() => setAiLoading(false));
        }
    }, [aiTopic, aiPrompt, aiPlatform, aiIncludeCtaAndAutomation, aiCtaAutomationPrompt, differentContentPerPlatform, platforms, clampTwitterAiText]);

    // Persist composer draft when state changes (debounced; shorter delay when only media changed so carousel keeps all images after upload)
    const mediaSignature = mediaList.map((m) => m.fileUrl).join('|');
    const debounceMs = mediaList.some((m) => isPersistableMediaUrl(m.fileUrl)) ? 150 : 400;
    useEffect(() => {
        if (!draftRestored) return;
        const t = setTimeout(() => {
            try {
                const mediaListToSave = mediaList.filter((m) => isPersistableMediaUrl(m.fileUrl)) as MediaItem[];
                const mediaByPlatformToSave: Record<string, MediaItem[]> = {};
                for (const [k, arr] of Object.entries(mediaByPlatform)) {
                    const v = (arr || []).filter((m) => isPersistableMediaUrl(m.fileUrl)) as MediaItem[];
                    if (v.length) mediaByPlatformToSave[k] = v;
                }
                const draft: ComposerDraft = {
                    platforms,
                    content,
                    contentByPlatform,
                    differentContentPerPlatform,
                    mediaType,
                    mediaList: mediaListToSave,
                    mediaByPlatform: mediaByPlatformToSave,
                    differentMediaPerPlatform,
                    differentThumbnailPerPlatform,
                    thumbnailByPlatform,
                    thumbnailChoice,
                    scheduledAt,
                    scheduleDelivery,
                    selectedHashtags,
                    differentHashtagsPerPlatform,
                    selectedHashtagsByPlatform,
                    commentAutomationEnabled,
                    commentAutomationKeywords,
                    commentAutomationReplyTemplate,
                    commentAutomationReplyByPlatform,
                    commentAutomationReplyOnComment,
                    commentAutomationInstagramPublicReply,
                    commentAutomationInstagramPrivateReply,
                    ...(commentAutomationInstagramDmMessage ? { commentAutomationInstagramDmMessage } : {}),
                    commentAutomationTagCommenter,
                };
                localStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify(draft));
            } catch (_) { /* ignore */ }
        }, debounceMs);
        return () => clearTimeout(t);
    }, [
        draftRestored,
        platforms,
        content,
        contentByPlatform,
        differentContentPerPlatform,
        mediaType,
        mediaList,
        mediaByPlatform,
        differentMediaPerPlatform,
        differentThumbnailPerPlatform,
        thumbnailByPlatform,
        thumbnailChoice,
        scheduledAt,
        scheduleDelivery,
        selectedHashtags,
        differentHashtagsPerPlatform,
        selectedHashtagsByPlatform,
        commentAutomationEnabled,
        commentAutomationKeywords,
        commentAutomationReplyTemplate,
        commentAutomationReplyByPlatform,
        commentAutomationReplyOnComment,
        commentAutomationInstagramPublicReply,
        commentAutomationInstagramPrivateReply,
        commentAutomationInstagramDmMessage,
        commentAutomationTagCommenter,
        mediaSignature,
        debounceMs,
    ]);

    useEffect(() => {
        let cancelled = false;
        api.get('/social/accounts')
            .then((res) => {
                if (!cancelled) {
                    setAccounts(Array.isArray(res.data) ? res.data : []);
                }
            })
            .catch(() => {
                if (!cancelled) setAccounts([]);
            })
            .finally(() => {
                if (!cancelled) setAccountsFetched(true);
            });
        return () => { cancelled = true; };
    }, []);

    // Drafts (and edited posts) can list platforms that are no longer connected. Toggles show those as
    // disabled gray, so they look "off" while previews still map `platforms` and show ghost cards.
    useEffect(() => {
        if (!accountsFetched) return;
        const allowed = new Set(accounts.map((a) => a.platform));
        setPlatforms((prev) => {
            const next = prev.filter((p) => allowed.has(p));
            if (next.length === prev.length && next.every((p, i) => p === prev[i])) return prev;
            return next;
        });
    }, [accountsFetched, accounts, platforms]);

    // Photo / Video / Reel: only one item allowed; trim if more
    useEffect(() => {
        const singleFormat = mediaType === 'photo' || mediaType === 'video' || mediaType === 'reel';
        if (singleFormat && mediaList.length > 1) {
            setMediaList([mediaList[0]]);
        }
    }, [mediaType, mediaList.length]);

    const addToHashtagPool = () => {
        const tag = normalizeHashtag(newHashtagInput);
        if (!tag || hashtagPool.includes(tag)) return;
        setHashtagPool((prev) => [...prev, tag].sort());
        setNewHashtagInput('');
    };

    const removeFromHashtagPool = (tag: string) => {
        setHashtagPool((prev) => prev.filter((t) => t !== tag));
        setSelectedHashtags((prev) => prev.filter((t) => t !== tag));
        setSelectedHashtagsByPlatform((prev) => {
            const next = { ...prev };
            for (const p of Object.keys(next)) {
                next[p] = next[p].filter((t) => t !== tag);
            }
            return next;
        });
    };

    const toggleSelectedHashtag = (tag: string) => {
        setSelectedHashtags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < MAX_HASHTAGS_PER_POST ? [...prev, tag] : prev
        );
    };

    const toggleSelectedHashtagForPlatform = (platform: string, tag: string) => {
        setSelectedHashtagsByPlatform((prev) => {
            const list = prev[platform] ?? [];
            const next = list.includes(tag) ? list.filter((t) => t !== tag) : list.length < MAX_HASHTAGS_PER_POST ? [...list, tag] : list;
            return { ...prev, [platform]: next };
        });
    };

    async function uploadFile(file: File): Promise<{ fileUrl: string; type: 'IMAGE' | 'VIDEO' }> {
        const type: 'IMAGE' | 'VIDEO' = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE';
        const res = await api.post<{ uploadUrl: string; fileUrl: string }>('/media/upload-url', {
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
        });
        const { uploadUrl, fileUrl } = res.data;
        await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        return { fileUrl, type };
    }

    /** Seek thumbnail video to target time and wait until frame is ready. */
    async function seekThumbnailVideoTo(targetTime: number): Promise<boolean> {
        const video = videoThumbnailRef.current;
        if (!video || mediaList.length === 0 || mediaList[0].type !== 'VIDEO') return false;
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
        const clamped = duration != null ? Math.min(Math.max(0, targetTime), duration) : Math.max(0, targetTime);
        if (Math.abs(video.currentTime - clamped) < 0.02 && video.readyState >= 2) return true;
        await new Promise<void>((resolve) => {
            const done = () => {
                video.removeEventListener('seeked', done);
                resolve();
            };
            video.addEventListener('seeked', done, { once: true });
            try {
                video.currentTime = clamped;
            } catch {
                resolve();
            }
            setTimeout(done, 450);
        });
        return video.readyState >= 2;
    }

    /** Capture current frame from the frame-picker video (same-origin proxy URL) and upload as JPEG. */
    async function captureFrameFromThumbnailVideo(): Promise<string | null> {
        const video = videoThumbnailRef.current;
        if (!video || mediaList.length === 0 || mediaList[0].type !== 'VIDEO') return null;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return null;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        try {
            ctx.drawImage(video, 0, 0);
        } catch {
            return null;
        }
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) return null;
        const file = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
        try {
            const { fileUrl } = await uploadFile(file);
            return fileUrl;
        } catch {
            return null;
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;
        setMediaUploadError(null);
        setMediaUploading(true);
        const singleFormat = mediaType === 'photo' || mediaType === 'video' || mediaType === 'reel';
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
                const item = await uploadFile(file);
                setMediaList((prev) => (singleFormat ? [item] : [...prev, item]));
                if (singleFormat) break; // only one file for Photo / Video / Reel
            }
        } catch (err: unknown) {
            const msg = err && typeof err === 'object' && 'response' in err && (err.response as { status?: number })?.status === 503
                ? 'Media storage is not configured. Add S3 (or R2) env vars to enable uploads.'
                : 'Upload failed. Try again.';
            setMediaUploadError(msg);
        } finally {
            setMediaUploading(false);
            e.target.value = '';
        }
    };

    const handleFileSelectForPlatform = async (platform: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;
        setMediaUploadError(null);
        setMediaUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
                const item = await uploadFile(file);
                setMediaByPlatform((prev) => ({
                    ...prev,
                    [platform]: [...(prev[platform] || []), item],
                }));
            }
        } catch (err: unknown) {
            const msg = err && typeof err === 'object' && 'response' in err && (err.response as { status?: number })?.status === 503
                ? 'Media storage is not configured. Add S3 (or R2) env vars to enable uploads.'
                : 'Upload failed. Try again.';
            setMediaUploadError(msg);
        } finally {
            setMediaUploading(false);
            e.target.value = '';
        }
    };

    const handleRemoveMedia = (index: number) => {
        setMediaList(mediaList.filter((_, i) => i !== index));
    };

    const handleThumbnailImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        setMediaUploadError(null);
        setMediaUploading(true);
        try {
            const { fileUrl } = await uploadFile(file);
            if (differentThumbnailPerPlatform && selectedPlatformForThumbnail) {
                setThumbnailByPlatform((prev) => ({ ...prev, [selectedPlatformForThumbnail]: fileUrl }));
            } else {
                setMediaList((prev) => prev.map((item, i) => (i === 0 ? { ...item, thumbnailUrl: fileUrl } : item)));
            }
            setThumbnailChoice('upload');
        } catch (err) {
            setMediaUploadError('Thumbnail upload failed. Try again.');
        } finally {
            setMediaUploading(false);
            e.target.value = '';
        }
    };

    const handleUseFrameAsThumbnail = useCallback(async () => {
        if (mediaList.length === 0 || mediaList[0].type !== 'VIDEO') return;
        setMediaUploadError(null);
        setThumbnailPicking(true);
        try {
            const ready = await seekThumbnailVideoTo(thumbnailPickerTime);
            if (!ready) throw new Error('Video frame is not ready yet');
            const fileUrl = await captureFrameFromThumbnailVideo();
            if (!fileUrl) throw new Error('Failed to capture frame');
            setThumbnailChoice('frame');
            if (differentThumbnailPerPlatform && selectedPlatformForThumbnail) {
                setThumbnailByPlatform((prev) => ({ ...prev, [selectedPlatformForThumbnail]: fileUrl }));
            } else {
                setMediaList((prev) => prev.map((item, i) => (i === 0 ? { ...item, thumbnailUrl: fileUrl } : item)));
            }
        } catch {
            setMediaUploadError('Failed to use frame. Try again or upload an image.');
        } finally {
            setThumbnailPicking(false);
        }
    }, [mediaList, differentThumbnailPerPlatform, selectedPlatformForThumbnail, thumbnailPickerTime]);

    const handleRemoveThumbnail = () => {
        if (differentThumbnailPerPlatform && selectedPlatformForThumbnail) {
            setThumbnailByPlatform((prev) => {
                const next = { ...prev };
                delete next[selectedPlatformForThumbnail];
                return next;
            });
        } else {
            setMediaList((prev) => prev.map((item, i) => (i === 0 ? { ...item, thumbnailUrl: undefined } : item)));
        }
        setThumbnailChoice('none');
    };
    const handleDifferentThumbnailToggle = (enabled: boolean) => {
        setDifferentThumbnailPerPlatform(enabled);
        if (!enabled) {
            // Going back to one thumbnail: keep current global thumbnail and clear per-platform overrides.
            setThumbnailByPlatform({});
            return;
        }
        // Turning on per-platform thumbnails: seed selected platforms with current shared thumbnail for easier editing.
        const base = mediaList[0]?.thumbnailUrl;
        if (!base) return;
        setThumbnailByPlatform((prev) => {
            const next = { ...prev };
            for (const p of platforms) {
                if (!next[p]) next[p] = base;
            }
            return next;
        });
    };

    const drawVideoFrameToCanvas = useCallback(() => {
        const paint = () => {
            const video = videoThumbnailRef.current;
            const canvas = thumbnailCanvasRef.current;
            if (!video || !canvas) return;
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (!w || !h) return;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            try {
                ctx.drawImage(video, 0, 0);
            } catch (_) {
                // drawImage can throw if canvas is tainted or video not ready — ignore
            }
        };
        paint();
        requestAnimationFrame(() => {
            requestAnimationFrame(paint);
        });
    }, []);

    const handleThumbnailSliderChange = useCallback((t: number) => {
        setThumbnailPickerTime(t);
        ignoreTimeUpdateUntilRef.current = Date.now() + 800;
        const v = videoThumbnailRef.current;
        if (!v) return;
        const onSeekedOnce = () => {
            v.removeEventListener('seeked', onSeekedOnce);
            drawVideoFrameToCanvas();
        };
        v.addEventListener('seeked', onSeekedOnce);
        const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : undefined;
        const clamped = duration !== undefined ? Math.min(Math.max(0, t), duration) : Math.max(0, t);
        v.currentTime = clamped;
        if (v.readyState >= 2) {
            drawVideoFrameToCanvas();
        }
        setTimeout(() => drawVideoFrameToCanvas(), 120);
        setTimeout(() => drawVideoFrameToCanvas(), 350);
    }, [drawVideoFrameToCanvas]);

    const handleRemoveMediaForPlatform = (platform: string, index: number) => {
        setMediaByPlatform((prev) => ({
            ...prev,
            [platform]: (prev[platform] || []).filter((_, i) => i !== index),
        }));
    };

    const moveCarouselToPosition = (fromIndex: number, toPosition: number) => {
        if (fromIndex === toPosition) return;
        setMediaList((prev) => {
            const arr = [...prev];
            const [item] = arr.splice(fromIndex, 1);
            arr.splice(toPosition, 0, item);
            return arr;
        });
    };

    const [carouselDraggingIndex, setCarouselDraggingIndex] = useState<number | null>(null);
    const handleCarouselDragStart = (e: React.DragEvent, index: number) => {
        setCarouselDraggingIndex(index);
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleCarouselDragEnd = () => setCarouselDraggingIndex(null);
    const handleCarouselDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    const handleCarouselDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        setCarouselDraggingIndex(null);
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
        moveCarouselToPosition(fromIndex, toIndex);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const saveAsDraft = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'draft';
        saveAsDraftRef.current = saveAsDraft;
        if (platforms.length === 0) {
            setAlertMessage('Select at least one platform');
            return;
        }
        const hasMedia =
            mediaList.length > 0 ||
            Object.values(mediaByPlatform).some((arr) => Array.isArray(arr) && arr.length > 0);
        const targets = platforms
            .map((p) => {
                const acc = accounts.find((a: { platform: string }) => a.platform === p);
                if (!acc?.id) return null;
                return { platform: p, socialAccountId: acc.id };
            })
            .filter(Boolean) as { platform: string; socialAccountId: string }[];
        if (targets.length === 0) {
            setAlertMessage('Connect at least one account for the selected platforms (Accounts page).');
            return;
        }

            // Append hashtags after content (per platform when "different hashtags per platform" is on)
            const hashtagSuffix = (tags: string[]) => (tags.length ? ' ' + tags.join(' ') : '');
            let contentFinal = content.trim() + hashtagSuffix(selectedHashtags);

        setLoading(true);
        if (typeof window !== 'undefined') sessionStorage.removeItem('composer_alert');
        try {
            let contentByPlatformFinal: Record<string, string> | undefined;

            if (differentHashtagsPerPlatform) {
                contentByPlatformFinal = platforms.reduce((acc, p) => {
                    const text = (differentContentPerPlatform ? (contentByPlatform[p] ?? '') : content).trim();
                    const tags = selectedHashtagsByPlatform[p] ?? [];
                    acc[p] = text + hashtagSuffix(tags);
                    return acc;
                }, {} as Record<string, string>);
            } else if (differentContentPerPlatform && platforms.some((p) => (contentByPlatform[p] ?? '').trim())) {
                contentByPlatformFinal = platforms.reduce((acc, p) => {
                    const v = (contentByPlatform[p] ?? '').trim() + hashtagSuffix(selectedHashtags);
                    if (v.trim()) acc[p] = v;
                    return acc;
                }, {} as Record<string, string>);
            }

            const TWITTER_CHAR_LIMIT = 230;
            if (platforms.includes('TWITTER')) {
                const twitterText = (contentByPlatformFinal?.['TWITTER'] ?? contentFinal).trim();
                if (twitterText.length > TWITTER_CHAR_LIMIT) {
                    setLoading(false);
                    setAlertMessage(`X (Twitter) limit is ${TWITTER_CHAR_LIMIT} characters (including spaces). Your post for Twitter is ${twitterText.length} characters. Shorten the text or remove Twitter from this post.`);
                    return;
                }
            }

            if (platforms.includes('PINTEREST')) {
                const pinMedia = differentMediaPerPlatform ? (mediaByPlatform['PINTEREST'] ?? []) : mediaList;
                const hasPinImage = pinMedia.some((m) => m.type === 'IMAGE');
                const hasPinVideo = pinMedia.some((m) => m.type === 'VIDEO');
                if (!hasPinImage && !hasPinVideo) {
                    setLoading(false);
                    setAlertMessage(
                        'Pinterest needs at least one image or video for this post. Add media or remove Pinterest from the selected platforms.'
                    );
                    return;
                }
            }

            let pinterestAutoCoverUrl: string | undefined;
            if (platforms.includes('PINTEREST') && !saveAsDraft && thumbnailChoice === 'frame') {
                const pinMedia = differentMediaPerPlatform ? (mediaByPlatform['PINTEREST'] ?? []) : mediaList;
                const pinFirst = pinMedia[0] as MediaItem | undefined;
                if (pinFirst?.type === 'VIDEO') {
                    const hasCover = differentThumbnailPerPlatform
                        ? Boolean(thumbnailByPlatform['PINTEREST'] ?? pinFirst.thumbnailUrl)
                        : Boolean((mediaList[0] as MediaItem | undefined)?.thumbnailUrl);
                    if (!hasCover) {
                        const main = mediaList[0];
                        const sameMainVideo = main?.type === 'VIDEO' && pinFirst.fileUrl === main.fileUrl;
                        if (!sameMainVideo) {
                            setLoading(false);
                            setAlertMessage(
                                'Pinterest needs a cover image for video Pins. Upload a thumbnail for your Pinterest video, or use the same video in the main composer so a frame can be captured.'
                            );
                            return;
                        }
                        setThumbnailPicking(true);
                        setMediaUploadError(null);
                        const captured = await captureFrameFromThumbnailVideo();
                        setThumbnailPicking(false);
                        if (!captured) {
                            setLoading(false);
                            setAlertMessage(
                                'Pinterest needs a video cover. Move the frame slider until the preview updates, then click "Use this frame", or upload a thumbnail image.'
                            );
                            return;
                        }
                        pinterestAutoCoverUrl = captured;
                        setMediaList((prev) =>
                            prev.map((item, i) => (i === 0 && item.type === 'VIDEO' ? { ...item, thumbnailUrl: captured } : item))
                        );
                        if (differentThumbnailPerPlatform) {
                            setThumbnailByPlatform((prev) => ({ ...prev, PINTEREST: captured }));
                        }
                    }
                }
            }

            const payload: {
                title?: string;
                content: string;
                contentByPlatform?: Record<string, string>;
                media: { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[];
                mediaByPlatform?: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[]>;
                targets: { platform: string; socialAccountId: string }[];
                scheduledAt?: string;
                scheduleDelivery?: 'auto' | 'email_links';
                commentAutomation?: { keywords: string[]; replyTemplate: string; replyOnComment?: boolean; usePrivateReply?: boolean; tagCommenter?: boolean } | null;
            } = {
                content: contentFinal,
                media: mediaList.map((m, i) => {
                    if (i === 0 && m.type === 'VIDEO') {
                        return {
                            ...m,
                            thumbnailUrl: pinterestAutoCoverUrl ?? (m as MediaItem).thumbnailUrl,
                            useVideoDefaultForPublish: thumbnailChoice === 'none',
                        };
                    }
                    return m;
                }),
                targets,
                scheduledAt: scheduledAt || undefined,
                scheduleDelivery: scheduledAt ? scheduleDelivery : undefined,
            };
            if (contentByPlatformFinal && Object.keys(contentByPlatformFinal).length > 0) {
                payload.contentByPlatform = contentByPlatformFinal;
            }
            // Send scheduled time as UTC ISO so server stores correct moment (datetime-local is in user's local time)
            if (saveAsDraft) {
                payload.scheduledAt = undefined;
                payload.scheduleDelivery = undefined;
            } else if (scheduledAt && scheduledAt.trim()) {
                try {
                    const localDate = new Date(scheduledAt.trim());
                    if (!Number.isNaN(localDate.getTime())) {
                        if (localDate.getTime() <= Date.now()) {
                            setLoading(false);
                            setAlertMessage('Please choose a future date/time for scheduling.');
                            return;
                        }
                        payload.scheduledAt = localDate.toISOString();
                    } else payload.scheduledAt = scheduledAt.trim();
                } catch {
                    payload.scheduledAt = scheduledAt.trim();
                }
                if (payload.scheduledAt) payload.scheduleDelivery = scheduleDelivery;
            } else {
                payload.scheduledAt = undefined;
            }
            if (commentAutomationEnabled && commentAutomationKeywords.trim()) {
                const keywords = commentAutomationKeywords
                    .split(/[\n,]+/)
                    .map((k) => k.trim().toLowerCase())
                    .filter(Boolean);
                const defaultReply = commentAutomationReplyTemplate.trim();
                const supportedPlatforms = platforms.filter((p) => COMMENT_AUTOMATION_PLATFORMS.has(p));
                const byPlatform: Record<string, string> = {};
                for (const p of supportedPlatforms) {
                    const t = (commentAutomationReplyByPlatform[p] ?? defaultReply).trim();
                    if (t) byPlatform[p] = t;
                }
                const hasReply = defaultReply || Object.keys(byPlatform).length > 0;
                const hasInstagram = supportedPlatforms.includes('INSTAGRAM');
                const replyOnComment = true;
                const instagramPublicReply = commentAutomationInstagramPublicReply;
                const instagramPrivateReply = hasInstagram && commentAutomationInstagramPrivateReply;
                if (keywords.length > 0 && hasReply) {
                    if (hasInstagram && !instagramPublicReply && !instagramPrivateReply) {
                        setAlertMessage('Comment automation: enable at least one reply option (public or DM) for Instagram.');
                        setLoading(false);
                        return;
                    }
                    const instagramDmTemplate = commentAutomationInstagramPrivateReply
                        ? (commentAutomationInstagramDmMessage.trim() || (byPlatform['INSTAGRAM'] ?? defaultReply).trim())
                        : undefined;
                    payload.commentAutomation = {
                        keywords,
                        replyTemplate: defaultReply || (byPlatform[supportedPlatforms[0]] ?? ''),
                        ...(Object.keys(byPlatform).length > 0 ? { replyTemplateByPlatform: byPlatform } : {}),
                        replyOnComment,
                        tagCommenter: commentAutomationTagCommenter,
                        ...(hasInstagram ? { instagramPublicReply, instagramPrivateReply, ...(instagramPrivateReply ? { instagramDmTemplate } : {}) } : {}),
                    };
                }
            }
            if (differentMediaPerPlatform) {
                payload.mediaByPlatform = platforms.reduce((acc, p) => {
                    let list = mediaByPlatform[p];
                    if (list?.length) {
                        if (p === 'PINTEREST' && pinterestAutoCoverUrl && list[0]?.type === 'VIDEO') {
                            list = list.map((m, idx) =>
                                idx === 0 && m.type === 'VIDEO' ? { ...m, thumbnailUrl: pinterestAutoCoverUrl } : m
                            );
                        }
                        acc[p] = list;
                    }
                    return acc;
                }, {} as Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[]>);
                const firstWithMedia = platforms.find((p) => (mediaByPlatform[p]?.length ?? 0) > 0);
                const baseMedia = firstWithMedia ? mediaByPlatform[firstWithMedia]! : mediaList;
                payload.media = baseMedia.map((m, i) => {
                    if (i === 0 && m.type === 'VIDEO') {
                        const first = mediaList[0] as MediaItem;
                        return {
                            ...m,
                            thumbnailUrl: pinterestAutoCoverUrl ?? first?.thumbnailUrl,
                            useVideoDefaultForPublish: thumbnailChoice === 'none',
                        };
                    }
                    return m;
                });
            } else if (differentThumbnailPerPlatform && (mediaType === 'video' || mediaType === 'reel') && mediaList.length > 0) {
                payload.mediaByPlatform = platforms.reduce((acc, p) => {
                    acc[p] = mediaList.map((m, i) => {
                        if (i === 0 && m.type === 'VIDEO') {
                            const platformThumb = thumbnailByPlatform[p];
                            const finalThumb = platformThumb ?? (m as MediaItem).thumbnailUrl;
                            return {
                                ...m,
                                ...(finalThumb ? { thumbnailUrl: finalThumb } : {}),
                                useVideoDefaultForPublish: !finalThumb && thumbnailChoice === 'none',
                            };
                        }
                        return m;
                    });
                    return acc;
                }, {} as Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[]>);
            }
            // If editing an already-posted post, create a new post (and publish/schedule) instead of updating the original
            const updateExisting = editPostId && !editPostAlreadyPosted;
            if (updateExisting) {
                await api.patch(`/posts/${editPostId}`, payload);
                clearComposerDraft();
                if (saveAsDraft) {
                    router.push('/posts?draft_saved=1');
                    setLoading(false);
                    return;
                }
                if (scheduledAt) {
                    const schedParams = new URLSearchParams({ scheduled: '1', delivery: scheduleDelivery === 'email_links' ? 'email' : 'auto', platforms: platforms.join(','), at: new Date(scheduledAt).toISOString() });
                    router.push(`/calendar?${schedParams.toString()}`);
                } else {
                    // Post now: publish immediately after update (same as create + Post now)
                    try {
                        const debug = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('publish_debug') === '1';
                        if (debug) sessionStorage.removeItem('publish_debug');
                        const publishRes = await api.post<{ ok: boolean; results?: { platform: string; ok: boolean; error?: string; mediaSkipped?: boolean }[]; message?: string; debugInfo?: { mediaUrlsByPlatform?: Record<string, string>; fullErrors?: Record<string, string> } }>(
                            `/posts/${editPostId}/publish${debug ? '?debug=1' : ''}`,
                            {},
                            { timeout: 330_000 }
                        );
                        const results = publishRes.data?.results;
                        if (publishRes.data?.debugInfo) console.log('[Publish Debug]', publishRes.data.debugInfo);
                        if (results?.some((r) => !r.ok)) {
                            const failed = results.filter((r) => !r.ok).map((r) => `${r.platform}: ${r.error || 'failed'}`).join('; ');
                            let hint = '';
                            if (failed.includes('TWITTER')) {
                                if (failed.includes('Credits Depleted') || failed.includes('credits')) hint = ' Your X (Twitter) account has no API credits. Add credits in your X account billing or upgrade your plan.';
                                else if (failed.includes('403') || failed.includes('media')) hint = ' Enable image upload from the Dashboard (select your X account and click "Enable image upload"), then reconnect.';
                                else if (failed.includes('401') || failed.includes('Unauthorized')) hint = ' Your Twitter session may have expired. Reconnect the Twitter account in the Accounts page, then try again.';
                                else if (failed.includes('socket hang up') || failed.includes('ECONNRESET')) hint = ' Connection to X dropped (often temporary). Check your X profile to see if the post went through; if not, open the post from History and try Post now again.';
                                else if (failed.includes('timeout')) hint = ' X took too long (e.g. image upload). Open the post from History and try Post now again, or try a smaller image.';
                            }
                            if (failed.includes('INSTAGRAM') && (failed.includes('2207082') || failed.includes('2207076') || failed.includes('Media upload'))) hint = (hint ? hint + ' ' : '') + 'For Instagram: reconnect from Dashboard → Accounts so the app has publish permission; try a different image, under 8MB, and ensure the image URL is publicly accessible (HTTPS).';
                            if (failed.includes('INSTAGRAM') && (failed.includes('Request processing failed') || failed.includes('ProcessingFailedError'))) hint = (hint ? hint + ' ' : '') + 'For Instagram: the media URL must be publicly reachable by Meta (HTTPS). For Reels use 9:16, 15-90 sec, MP4. Set S3_PUBLIC_URL and CRON_SECRET in Vercel so media is served correctly; or try a different image/video.';
                            if (failed.includes('TIKTOK')) {
                                if (failed.includes('unaudited_client_can_only_post_to_private_accounts')) hint = (hint ? hint + ' ' : '') + 'For TikTok: your app has not passed TikTok\'s content posting audit, so it cannot post to public accounts. Apply for the Content Posting API audit in the TikTok Developer Portal.';
                                else if (failed.includes('scope_not_authorized')) hint = (hint ? hint + ' ' : '') + 'For TikTok: reconnect your TikTok account from the Dashboard to grant the video.publish permission.';
                                else if ((failed.includes('spam_risk') || failed.includes('too many pending')) && !failed.includes('TikTok sandbox')) hint = (hint ? hint + ' ' : '') + 'For TikTok sandbox: open TikTok mobile app on the same connected account, check Inbox and Drafts, and accept or delete all pending items. Then try again.';
                                else hint = (hint ? hint + ' ' : '') + 'For TikTok: ensure your app has Content Posting API access and the video meets requirements (MP4, under 10 min). Reconnect the account from Dashboard if needed.';
                            }
                            if (failed.includes('PINTEREST') && (failed.includes('"code":29') || failed.includes('Trial access'))) {
                                hint = (hint ? hint + ' ' : '') + 'For Pinterest: your app may still be in Trial access. Request Standard access in the Pinterest Developer Platform to publish Pins to your live profile.';
                            }
                            setAlertMessage(`Post updated but some platforms failed: ${failed}. ${hint}`);
                            return;
                        }
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const mediaSkipped = (results as any[])?.filter((r) => r.mediaSkipped).map((r) => r.platform as string);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const inboxPlatforms = (results as any[])?.filter((r) => r.sentToInbox).map((r) => r.platform as string);
                        let msg = 'Post updated and published.';
                        if (mediaSkipped?.length) msg += ` Note: ${mediaSkipped.join(', ')} posted as text only (image upload was not allowed).`;
                        if (inboxPlatforms?.length) msg += ` TikTok: video posted as Private (TikTok restricts unaudited apps to private only). Open TikTok app, Profile, tap the video and set visibility to Public. After app approval, posts can go public automatically.`;
                        setAlertMessage(msg);
                        try {
                            const listRes = await api.get('/posts');
                            const list = Array.isArray(listRes.data) ? listRes.data : [];
                            appData?.setScheduledPosts?.(list);
                        } catch (_) {}
                        router.push(`/posts?published=1&highlight=${encodeURIComponent(editPostId)}`);
                    } catch (err: unknown) {
                        const res = err && typeof err === 'object' && 'response' in err ? (err as { response?: { status?: number; data?: { message?: string } } }).response : undefined;
                        const status = res?.status;
                        const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
                        const isTimeout = code === 'ECONNABORTED' || (typeof (err as Error)?.message === 'string' && (err as Error).message.includes('timeout'));
                        const msg = res?.data?.message ?? (status === 401 ? 'Session expired. Sign in again, then open the post from History and try Post now.' : isTimeout ? 'Publish is taking longer than usual (e.g. uploading media). Open the post from History and try Post now again; it may have already gone through.' : 'Publish failed. Open the post from History and try Post now again.');
                        setAlertMessage(msg);
                        return;
                    }
                }
            } else {
            const createRes = await api.post<{ id: string }>('/posts', payload);
            const postId = createRes.data?.id;
                clearComposerDraft();
                if (saveAsDraft) {
                    router.push('/posts?draft_saved=1');
                    setLoading(false);
                    return;
                }
            if (postId && !scheduledAt) {
                try {
                        const debug = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('publish_debug') === '1';
                        if (debug) sessionStorage.removeItem('publish_debug');
                        const publishRes = await api.post<{ ok: boolean; results?: { platform: string; ok: boolean; error?: string; mediaSkipped?: boolean }[]; message?: string; debugInfo?: { mediaUrlsByPlatform?: Record<string, string>; fullErrors?: Record<string, string> } }>(
                            `/posts/${postId}/publish${debug ? '?debug=1' : ''}`,
                            {},
                            { timeout: 330_000 }
                        );
                    const results = publishRes.data?.results;
                        if (publishRes.data?.debugInfo) console.log('[Publish Debug]', publishRes.data.debugInfo);
                    if (results?.some((r) => !r.ok)) {
                        const failed = results.filter((r) => !r.ok).map((r) => `${r.platform}: ${r.error || 'failed'}`).join('; ');
                            let hint = '';
                            if (failed.includes('TWITTER')) {
                                if (failed.includes('Credits Depleted') || failed.includes('credits')) hint = ' Your X (Twitter) account has no API credits. Add credits in your X account billing or upgrade your plan.';
                                else if (failed.includes('403') || failed.includes('media')) hint = ' Enable image upload from the Dashboard (select your X account and click "Enable image upload"), then reconnect.';
                                else if (failed.includes('401') || failed.includes('Unauthorized')) hint = ' Your Twitter session may have expired. Reconnect the Twitter account in the Accounts page, then try again.';
                                else if (failed.includes('socket hang up') || failed.includes('ECONNRESET')) hint = ' Connection to X dropped (often temporary). Check your X profile to see if the post went through; if not, open the post from History and try Post now again.';
                                else if (failed.includes('timeout')) hint = ' X took too long (e.g. image upload). Open the post from History and try Post now again, or try a smaller image.';
                            }
                            if (failed.includes('INSTAGRAM') && (failed.includes('2207082') || failed.includes('2207076') || failed.includes('Media upload'))) hint = (hint ? hint + ' ' : '') + 'For Instagram: reconnect from Dashboard → Accounts so the app has publish permission; try a different image, under 8MB, and ensure the image URL is publicly accessible (HTTPS).';
                            if (failed.includes('INSTAGRAM') && (failed.includes('Request processing failed') || failed.includes('ProcessingFailedError'))) hint = (hint ? hint + ' ' : '') + 'For Instagram: the media URL must be publicly reachable by Meta (HTTPS). For Reels use 9:16, 15-90 sec, MP4. Set S3_PUBLIC_URL and CRON_SECRET in Vercel so media is served correctly; or try a different image/video.';
                            if (failed.includes('TIKTOK')) {
                                if (failed.includes('unaudited_client_can_only_post_to_private_accounts')) hint = (hint ? hint + ' ' : '') + 'For TikTok: your app has not passed TikTok\'s content posting audit, so it cannot post to public accounts. Apply for the Content Posting API audit in the TikTok Developer Portal.';
                                else if (failed.includes('scope_not_authorized')) hint = (hint ? hint + ' ' : '') + 'For TikTok: reconnect your TikTok account from the Dashboard to grant the video.publish permission.';
                                else if ((failed.includes('spam_risk') || failed.includes('too many pending')) && !failed.includes('TikTok sandbox')) hint = (hint ? hint + ' ' : '') + 'For TikTok sandbox: open TikTok mobile app on the same connected account, check Inbox and Drafts, and accept or delete all pending items. Then try again.';
                                else hint = (hint ? hint + ' ' : '') + 'For TikTok: ensure your app has Content Posting API access and the video meets requirements (MP4, under 10 min). Reconnect the account from Dashboard if needed.';
                            }
                            if (failed.includes('PINTEREST') && (failed.includes('"code":29') || failed.includes('Trial access'))) {
                                hint = (hint ? hint + ' ' : '') + 'For Pinterest: your app may still be in Trial access. Request Standard access in the Pinterest Developer Platform to publish Pins to your live profile.';
                            }
                            setAlertMessage(`Post created but some platforms failed: ${failed}. ${hint}`);
                            return;
                        }
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const mediaSkippedCreate = (results as any[])?.filter((r) => r.mediaSkipped).map((r) => r.platform as string);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const inboxCreate = (results as any[])?.filter((r) => r.sentToInbox).map((r) => r.platform as string);
                        let createMsg = 'Post published.';
                        if (mediaSkippedCreate?.length) createMsg += ` Note: ${mediaSkippedCreate.join(', ')} posted as text only (image upload was not allowed).`;
                        if (inboxCreate?.length) createMsg += ` TikTok: video posted as Private (TikTok restricts unaudited apps to private only). Open TikTok app, Profile, tap the video and set visibility to Public. After app approval, posts can go public automatically.`;
                        setAlertMessage(createMsg);
                    } catch (err: unknown) {
                        const res = err && typeof err === 'object' && 'response' in err ? (err as { response?: { status?: number; data?: { message?: string } } }).response : undefined;
                        const status = res?.status;
                        const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
                        const isTimeout = code === 'ECONNABORTED' || (typeof (err as Error)?.message === 'string' && (err as Error).message.includes('timeout'));
                        const msg = res?.data?.message ?? (status === 401 ? 'Session expired. Sign in again, then open the post from History and try Post now.' : isTimeout ? 'Publish is taking longer than usual (e.g. uploading media). Open the post from History and try Post now again; it may have already gone through.' : 'Publish failed. Open the post from History and try Post now again.');
                        setAlertMessage(msg);
                        return;
                    }
                }
                if (!postId && !scheduledAt) {
                    setAlertMessage('Post was created but we could not publish it. Open it from History and try Post now.');
                    try {
                        const listRes = await api.get('/posts');
                        const list = Array.isArray(listRes.data) ? listRes.data : [];
                        appData?.setScheduledPosts?.(list);
                    } catch (_) {}
                    router.push('/posts');
                    return;
                }
                if (scheduledAt) {
                    const schedParams = new URLSearchParams({ scheduled: '1', delivery: scheduleDelivery === 'email_links' ? 'email' : 'auto', platforms: platforms.join(','), at: new Date(scheduledAt).toISOString() });
                    router.push(`/calendar?${schedParams.toString()}`);
                } else {
                    try {
                        const listRes = await api.get('/posts');
                        const list = Array.isArray(listRes.data) ? listRes.data : [];
                        appData?.setScheduledPosts?.(list);
                    } catch (_) {}
                    router.push(`/posts?published=1&highlight=${encodeURIComponent(postId)}`);
                }
            }
        } catch (err: unknown) {
            let msg = 'Failed to create post';
            if (err && typeof err === 'object' && 'response' in err) {
                const res = (err as { response?: { data?: unknown; status?: number } }).response;
                const status = res?.status;
                const data = res?.data;
                if (typeof window !== 'undefined') console.error('[Composer] Create post error:', { status, data, err });
                if (status === 401) {
                    msg = 'Session expired or not logged in. Please sign in again.';
                } else if (status === 400) {
                    msg = typeof data === 'object' && data !== null && 'message' in data ? String((data as { message: unknown }).message) : 'Invalid request. Connect at least one account for the selected platforms in Accounts.';
                } else if (data != null) {
                    if (typeof data === 'string') msg = data;
                    else if (typeof data === 'object' && data !== null && 'message' in data && typeof (data as { message: unknown }).message === 'string') msg = (data as { message: string }).message;
                    else if (typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string') msg = (data as { error: string }).error;
                }
            } else {
                if (err instanceof Error) msg = err.message;
                if (typeof window !== 'undefined') console.error('[Composer] Create post error (no response):', err);
            }
            if (msg === 'Failed to create post') msg += ' Open the browser console (F12 → Console) for details.';
            setAlertMessage(msg);
        } finally {
            saveAsDraftRef.current = false;
            setLoading(false);
        }
    };

    const composerReady = draftRestored && (!editPostId || editLoaded) && accountsFetched;

    const composerFramePreview =
        (mediaType === 'video' || mediaType === 'reel') &&
        mediaList.length === 1 &&
        mediaList[0]?.type === 'VIDEO' &&
        thumbnailChoice === 'frame'
            ? { timeSec: thumbnailPickerTime, videoSrc: mediaCanvasUrl(mediaList[0].fileUrl) }
            : undefined;

    // After load: show any alert passed from a redirect (e.g. publish failure) so user always sees status
    useEffect(() => {
        if (!composerReady || typeof window === 'undefined') return;
        const stored = sessionStorage.getItem('composer_alert');
        if (stored) {
            sessionStorage.removeItem('composer_alert');
            setAlertMessage(stored);
        }
    }, [composerReady]);

    if (!composerReady) {
    return (
            <>
                <LoadingVideoOverlay loading={true} />
                <div className="max-w-6xl mx-auto px-2 sm:px-4 flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 size={40} className="animate-spin text-[var(--primary)]" aria-hidden />
                        <p className="text-neutral-600 font-medium">Loading composer…</p>
                        <p className="text-sm text-neutral-400">Restoring your draft and accounts</p>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-2 sm:px-4 space-y-6">
            {loading && typeof document !== 'undefined' && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(23,23,23,0.82)' }} role="status" aria-live="polite">
                    <Loader2 size={48} className="animate-spin text-white mb-4" aria-hidden />
                    <p className="text-white font-medium text-lg">Publishing to {platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')}…</p>
                    <p className="text-neutral-300 text-sm mt-1">Do not close this page. This may take a minute.</p>
                </div>,
                document.body,
            )}
            <ConfirmModal
                open={alertMessage !== null}
                onClose={() => setAlertMessage(null)}
                message={alertMessage ?? ''}
                variant="alert"
                confirmLabel="OK"
            />
            {aiModalOpen && typeof document !== 'undefined' && createPortal(
                <>
                    <div
                        className="fixed z-[10050] min-h-screen min-h-[100dvh] min-h-[100lvh] w-screen bg-neutral-900/50 backdrop-blur-sm"
                        style={{ top: 0, left: 0, right: 0, bottom: 0 }}
                        onClick={() => !aiLoading && setAiModalOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        className="fixed inset-0 z-[10051] flex items-center justify-center p-4 pointer-events-none"
                        role="dialog"
                        aria-modal="true"
                    >
                    <div className="pointer-events-auto relative w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-neutral-900">Generate with AI</h3>
                        {hasBrandContext === false && (
                            <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                                Set up your brand context first in <Link href="/dashboard/ai-assistant" className="underline font-medium">Dashboard → AI Assistant</Link> so the AI can match your voice and audience.
                            </p>
                        )}
                        {hasBrandContext === true && (
                            <>
                                <label className="mt-4 block text-sm font-medium text-neutral-700">What&apos;s this post about?</label>
                                <input
                                    type="text"
                                    value={aiTopic}
                                    onChange={(e) => setAiTopic(e.target.value)}
                                    placeholder="e.g. New feature launch, tip of the week"
                                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                />
                                <label className="mt-3 block text-sm font-medium text-neutral-700">Extra instructions (optional)</label>
                                <textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    placeholder="e.g. Keep it under 230 chars for X, add a CTA"
                                    rows={2}
                                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                />
                                <label className="mt-3 flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={aiIncludeCtaAndAutomation}
                                        onChange={(e) => setAiIncludeCtaAndAutomation(e.target.checked)}
                                        className="rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                    />
                                    <span className="text-sm text-neutral-700">Also generate CTA and comment automation (keyword + reply)</span>
                                </label>
                                {aiIncludeCtaAndAutomation && (
                                    <>
                                        <label className="mt-2 block text-sm font-medium text-neutral-700">Describe the CTA, keyword(s), and reply you want</label>
                                        <textarea
                                            value={aiCtaAutomationPrompt}
                                            onChange={(e) => setAiCtaAutomationPrompt(e.target.value)}
                                            placeholder="e.g. CTA: invite people to comment 'demo' for a 30-day free trial. Keywords: demo, yes. Reply: Thanks! We'll DM you the coupon code."
                                            rows={3}
                                            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400"
                                        />
                                    </>
                                )}
                                {platforms.length > 1 && (
                                    <label className="mt-2 flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={differentContentPerPlatform}
                                            onChange={(e) => setDifferentContentPerPlatform(e.target.checked)}
                                            className="rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                        />
                                        <span className="text-sm text-neutral-700">Use different content per platform</span>
                                    </label>
                                )}
                                {differentContentPerPlatform && platforms.length > 0 ? (
                                    <p className="mt-3 text-sm text-neutral-600">
                                        We&apos;ll generate a separate description for each selected platform: {platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(', ')}.
                                    </p>
                                ) : platforms.length > 0 ? (
                                    <>
                                        <label className="mt-3 block text-sm font-medium text-neutral-700">Platform (optional)</label>
                                        <select
                                            value={aiPlatform}
                                            onChange={(e) => setAiPlatform(e.target.value)}
                                            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                        >
                                            <option value="">Any</option>
                                            {platforms.map((p) => (
                                                <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                                            ))}
                                        </select>
                                    </>
                                ) : null}
                                {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
                                {aiLoading && differentContentPerPlatform && platforms.length > 1 && (
                                    <p className="mt-2 text-sm text-neutral-500">Generating for {platforms.length} platforms…</p>
                                )}
                                <div className="mt-6 flex flex-wrap justify-end gap-3">
                                    <button type="button" onClick={() => !aiLoading && setAiModalOpen(false)} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
                                    <button type="button" onClick={handleAiGenerate} disabled={aiLoading} className="inline-flex items-center gap-2 rounded-lg bg-[var(--button)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--button-hover)] disabled:opacity-50">
                                        {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                        Generate
                                    </button>
                                </div>
                            </>
                        )}
                        {hasBrandContext === null && (
                            <div className="mt-4 flex items-center gap-2 text-neutral-500">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-sm">Checking brand context…</span>
                            </div>
                        )}
                    </div>
                    </div>
                </>,
                document.body,
            )}
            <div>
                <h1 className="text-2xl font-bold text-neutral-900">{editPostId ? 'Edit Post' : 'Create Post'}</h1>
                {!editPostId && <p className="text-neutral-500 mt-1">Draft, preview and schedule your content across platforms.</p>}
            </div>

            <div className="flex flex-col lg:flex-row gap-0 lg:gap-0 items-stretch">
                <form onSubmit={handleSubmit} className="space-y-4 min-w-0 flex-1 lg:min-w-0">
                    <div className="card">
                        <button type="button" onClick={() => toggleSection('platforms')} className="w-full flex items-center justify-between text-left">
                            <h3 className="font-semibold text-neutral-900">Select Platforms</h3>
                            {sectionOpen.platforms ? <ChevronUp size={20} className="text-neutral-400 shrink-0" /> : <ChevronDown size={20} className="text-neutral-400 shrink-0" />}
                        </button>
                        {sectionOpen.platforms && (
                        <>
                        <div className="pt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                            {(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'LINKEDIN', 'PINTEREST', 'TWITTER'] as const).map((p) => {
                                const connected = accounts.some((a) => a.platform === p);
                                const icons: Record<string, React.ReactNode> = {
                                    INSTAGRAM: <InstagramIcon size={26} />,
                                    TIKTOK: <TikTokIcon size={26} />,
                                    YOUTUBE: <YoutubeIcon size={26} />,
                                    FACEBOOK: <FacebookIcon size={26} />,
                                    TWITTER: <XTwitterIcon size={26} className="text-neutral-800" />,
                                    LINKEDIN: <LinkedinIcon size={26} />,
                                    PINTEREST: <PinterestIcon size={26} />,
                                };
                                const labels: Record<string, string> = { INSTAGRAM: 'Instagram', TIKTOK: 'TikTok', YOUTUBE: 'YouTube', FACEBOOK: 'Facebook', TWITTER: 'Twitter/X', LINKEDIN: 'LinkedIn', PINTEREST: 'Pinterest' };
                                return (
                            <PlatformToggle
                                        key={p}
                                        platform={p}
                                        label={labels[p]}
                                        icon={icons[p]}
                                        active={platforms.includes(p)}
                                        connected={connected}
                                        onClick={() => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                                    />
                                );
                            })}
                        </div>
                        </>
                        )}
                    </div>

                    <div className="card border border-neutral-200/80 shadow-sm">
                        <button type="button" onClick={() => toggleSection('media')} className="w-full flex items-center justify-between text-left">
                            <h3 className="font-semibold text-neutral-900 text-base">Media</h3>
                            {sectionOpen.media ? <ChevronUp size={20} className="text-neutral-400 shrink-0" /> : <ChevronDown size={20} className="text-neutral-400 shrink-0" />}
                        </button>
                        {sectionOpen.media && (
                        <div className="pt-4 space-y-5">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={differentMediaPerPlatform}
                                onChange={(e) => setDifferentMediaPerPlatform(e.target.checked)}
                                className="rounded border-neutral-300 text-neutral-500 focus:ring-neutral-400"
                            />
                            <span className="text-sm text-neutral-700">Use different media per platform</span>
                        </label>
                        {!differentMediaPerPlatform ? (
                            <>
                                <p className="text-sm font-medium text-neutral-700">Choose what to upload</p>
                                <div className="flex flex-wrap gap-2 p-1 bg-neutral-100/80 rounded-xl w-fit">
                                    {(['photo', 'video', 'reel', 'carousel'] as const).map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => {
                                                if (type !== mediaType) {
                                                    setMediaType(type);
                                                    setMediaList([]);
                                                    setMediaByPlatform((prev) => {
                                                        const next = { ...prev };
                                                        for (const p of Object.keys(next)) next[p] = [];
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${mediaType === type
                                                ? 'bg-white text-neutral-700 shadow-sm ring-1 ring-neutral-200'
                                                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
                                                }`}
                                        >
                                            {MEDIA_RECOMMENDATIONS[type].label}
                                        </button>
                                    ))}
                                </div>
                                <MediaRequirementsHint mediaType={mediaType} />
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={MEDIA_RECOMMENDATIONS[mediaType].accept}
                                    multiple={MEDIA_RECOMMENDATIONS[mediaType].multiple}
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={mediaUploading}
                                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all border-2 border-dashed border-neutral-300 hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/15/50 text-neutral-700 hover:text-[var(--primary)] disabled:opacity-50 disabled:border-neutral-200"
                                    >
                                        <ImageIcon size={18} className="shrink-0" />
                                        {mediaType === 'carousel'
                                            ? 'Add images for carousel'
                                            : <>Add {MEDIA_RECOMMENDATIONS[mediaType].label.toLowerCase()} from <span className="sm:hidden">library</span><span className="hidden sm:inline">computer</span></>}
                                    </button>
                                    {mediaUploading && <span className="text-sm text-neutral-500">Uploading…</span>}
                                </div>
                                {mediaUploadError && <p className="text-sm text-red-600">{mediaUploadError}</p>}
                                {(mediaType === 'video' || mediaType === 'reel') && mediaList.length === 1 && mediaList[0].type === 'VIDEO' ? (
                                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-start">
                                        <div className="p-4 rounded-2xl bg-gradient-to-b from-neutral-50 to-white border border-neutral-200/90 shadow-sm space-y-3 shrink-0 min-w-0">
                                            <div>
                                                <h4 className="text-sm font-semibold text-neutral-800">Thumbnail (optional)</h4>
                                                <p className="text-xs text-neutral-500 mt-0.5">{mediaType === 'reel' ? '9:16 (1080×1920) for best results.' : 'Cover for your video.'}</p>
                                                {platforms.length > 1 && (
                                                    <label className="mt-3 flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={differentThumbnailPerPlatform}
                                                            onChange={(e) => handleDifferentThumbnailToggle(e.target.checked)}
                                                            className="rounded border-neutral-300 text-neutral-500 focus:ring-neutral-300"
                                                        />
                                                        <span className="text-sm text-neutral-700">Use different thumbnail per platform</span>
                                                    </label>
                                                )}
                                                {differentThumbnailPerPlatform && platforms.length > 1 && (
                                                    <div className="mt-2">
                                                        <label className="text-xs font-medium text-neutral-500">Platform thumbnails (click to edit):</label>
                                                        <div className="mt-1.5 grid grid-cols-1 gap-2">
                                                            {platforms.map((p) => {
                                                                const active = selectedPlatformForThumbnail === p;
                                                                const hasThumb = Boolean(thumbnailByPlatform[p]);
                                                                const thumb = thumbnailByPlatform[p] ?? mediaList[0].thumbnailUrl;
                                                                return (
                                                                    <button
                                                                        key={p}
                                                                        type="button"
                                                                        onClick={() => setSelectedPlatformForThumbnail(p)}
                                                                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                                                                            active
                                                                                ? 'border-violet-300 bg-violet-50 text-violet-700'
                                                                                : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                                                                        }`}
                                                                    >
                                                                        <PlatformGlyph platform={p as PlatformKey} size={14} />
                                                                        <span className="font-medium">{PLATFORM_LABELS[p] ?? p}</span>
                                                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${hasThumb ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                                                                        {thumb ? (
                                                                            <img src={mediaDisplayUrl(thumb)} alt="" className="ml-auto h-7 w-7 rounded object-cover border border-neutral-200" />
                                                                        ) : (
                                                                            <span className="ml-auto text-[10px] text-neutral-400">No thumb</span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        <p className="mt-1 text-[11px] text-neutral-500">Each platform keeps its own thumbnail with the same options below.</p>
                                                    </div>
                                                )}
                                                <p className="text-xs text-neutral-400 mt-1 font-medium">Choose one option:</p>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${thumbnailChoice === 'none' ? 'border-neutral-400 bg-neutral-100' : 'border-neutral-200 hover:border-neutral-300'}`}>
                                                    <input type="radio" name="thumbnailOption" checked={thumbnailChoice === 'none'} onChange={() => { setThumbnailChoice('none'); handleRemoveThumbnail(); }} className="text-neutral-500 focus:ring-neutral-300" />
                                                    <span className="text-sm font-medium text-neutral-800">No custom thumbnail</span>
                                                    <span className="text-xs text-neutral-500">(use video default)</span>
                                                </label>
                                                <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${thumbnailChoice === 'upload' ? 'border-neutral-400 bg-neutral-100' : 'border-neutral-200 hover:border-neutral-300'}`}>
                                                    <input type="radio" name="thumbnailOption" checked={thumbnailChoice === 'upload'} onChange={() => setThumbnailChoice('upload')} className="text-neutral-500 focus:ring-neutral-300" />
                                                    <span className="text-sm font-medium text-neutral-800">Upload image</span>
                                                </label>
                                                {thumbnailChoice === 'upload' && (
                                                    <div className="ml-6 flex flex-wrap items-center gap-2">
                                                        <input ref={thumbnailFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleThumbnailImageSelect} />
                                                        <button type="button" onClick={() => thumbnailFileInputRef.current?.click()} disabled={mediaUploading} className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 disabled:opacity-50">
                                                            <ImageIcon size={14} />
                                                            Choose file
                                                        </button>
                                                        {(differentThumbnailPerPlatform && selectedPlatformForThumbnail ? thumbnailByPlatform[selectedPlatformForThumbnail] : mediaList[0].thumbnailUrl) && (
                                                            <button type="button" onClick={handleRemoveThumbnail} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50">Remove</button>
                                                        )}
                                                    </div>
                                                )}
                                                <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${thumbnailChoice === 'frame' ? 'border-neutral-400 bg-neutral-100' : 'border-neutral-200 hover:border-neutral-300'}`}>
                                                    <input type="radio" name="thumbnailOption" checked={thumbnailChoice === 'frame'} onChange={() => setThumbnailChoice('frame')} className="text-neutral-500 focus:ring-neutral-300" />
                                                    <span className="text-sm font-medium text-neutral-800">Pick a frame from video</span>
                                                </label>
                                                {thumbnailChoice === 'frame' && (
                                                    <div className="ml-6 flex flex-col gap-1.5">
                                                        <input type="range" min={0} max={Math.max(0.01, Number.isFinite(thumbnailVideoDuration) && thumbnailVideoDuration > 0 ? thumbnailVideoDuration : 0.01)} step={0.01} value={Math.min(thumbnailPickerTime, Math.max(0.01, Number.isFinite(thumbnailVideoDuration) && thumbnailVideoDuration > 0 ? thumbnailVideoDuration : 0.01))} onChange={(e) => handleThumbnailSliderChange(parseFloat(e.target.value))} onInput={(e) => handleThumbnailSliderChange(parseFloat((e.target as HTMLInputElement).value))} className="w-full max-w-[240px] h-2 rounded-full accent-neutral-500" />
                                                        <button type="button" onClick={handleUseFrameAsThumbnail} disabled={thumbnailPicking || mediaUploading} className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--button)] hover:bg-[var(--button-hover)] text-white rounded-lg text-xs font-medium disabled:opacity-50 w-fit">
                                                            {thumbnailPicking ? <Loader2 size={14} className="animate-spin shrink-0" /> : <ImageIcon size={14} className="shrink-0" />}
                                                            Use this frame
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="shrink-0 sm:pt-0 pt-0">
                                            <div
                                                className={`relative group min-h-0 self-start overflow-hidden rounded-lg border-2 border-neutral-200 bg-neutral-100 shrink-0 ${mediaType === 'video' ? 'aspect-video w-64 max-w-full' : (mediaType === 'reel' ? 'aspect-[9/16] w-44' : 'aspect-video w-52')}`}
                                                onMouseEnter={handleMediaPeekEnter}
                                                onMouseLeave={handleMediaPeekLeave}
                                            >
                                                {(() => {
                                                    const effectiveThumbnail = differentThumbnailPerPlatform && selectedPlatformForThumbnail
                                                        ? (thumbnailByPlatform[selectedPlatformForThumbnail] ?? mediaList[0].thumbnailUrl)
                                                        : mediaList[0].thumbnailUrl;
                                                    const fitClass = mediaType === 'reel' ? 'object-cover' : 'object-contain';
                                                    const cors = mediaList[0].fileUrl.startsWith('blob:') ? undefined : 'anonymous' as const;
                                                    return thumbnailChoice === 'frame' ? (
                                                    <div className="absolute inset-0 w-full h-full bg-neutral-900 flex items-center justify-center">
                                                        <video
                                                            ref={videoThumbnailRef}
                                                            src={mediaCanvasUrl(mediaList[0].fileUrl)}
                                                            className={`absolute inset-0 w-full h-full ${fitClass} pointer-events-none opacity-0`}
                                                            style={{ zIndex: 0 }}
                                                            crossOrigin={cors}
                                                            muted
                                                            playsInline
                                                            preload="auto"
                                                            key={mediaList[0].fileUrl}
                                                            onLoadStart={() => setThumbnailVideoLoadState('loading')}
                                                            onLoadedMetadata={(e) => {
                                                                const v = e.currentTarget;
                                                                const d = v.duration;
                                                                setThumbnailVideoDuration(Number.isFinite(d) && d > 0 ? d : 1);
                                                                setThumbnailPickerTime(0);
                                                            }}
                                                            onLoadedData={() => {
                                                                setThumbnailVideoLoadState('loaded');
                                                                drawVideoFrameToCanvas();
                                                            }}
                                                            onSeeked={drawVideoFrameToCanvas}
                                                            onTimeUpdate={(e) => {
                                                                if (Date.now() < ignoreTimeUpdateUntilRef.current) return;
                                                                setThumbnailPickerTime(e.currentTarget.currentTime);
                                                            }}
                                                            onError={() => setThumbnailVideoLoadState('error')}
                                                        />
                                                        {thumbnailVideoLoadState === 'loading' && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80 z-20">
                                                                <Loader2 size={28} className="animate-spin text-white" />
                                                            </div>
                                                        )}
                                                        {thumbnailVideoLoadState === 'error' && (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/95 z-20 p-3 text-center">
                                                                <p className="text-sm text-white font-medium">Video failed to load</p>
                                                                <p className="text-xs text-neutral-400 mt-1">Try re-uploading or choose another thumbnail option.</p>
                                                            </div>
                                                        )}
                                                        <canvas ref={thumbnailCanvasRef} className={`absolute inset-0 w-full h-full ${fitClass} pointer-events-none z-10 transition-opacity duration-75 ${mediaPeekHover ? 'opacity-0' : 'opacity-100'}`} style={{ width: '100%', height: '100%' }} aria-hidden />
                                                        <div className={`absolute inset-0 z-[15] transition-opacity duration-100 ${mediaPeekHover ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
                                                            <ComposerMediaPeekPlayer
                                                                ref={mediaPeekPlayRef}
                                                                key={`peek-frame-${mediaList[0].fileUrl}`}
                                                                src={mediaCanvasUrl(mediaList[0].fileUrl)}
                                                                active={mediaPeekHover}
                                                                fitClass={fitClass}
                                                                crossOrigin={cors}
                                                                frameSyncTime={thumbnailPickerTime}
                                                                variant="overlay"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : effectiveThumbnail ? (
                                                    <>
                                                        <img src={mediaDisplayUrl(effectiveThumbnail)} alt="Thumbnail" className={`absolute inset-0 w-full h-full ${fitClass} z-[1] ${mediaPeekHover ? 'opacity-0' : 'opacity-100'}`} />
                                                        <div className={`absolute inset-0 z-[4] transition-opacity duration-100 ${mediaPeekHover ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
                                                            <ComposerMediaPeekPlayer
                                                                ref={mediaPeekPlayRef}
                                                                key={`peek-thumb-${mediaList[0].fileUrl}`}
                                                                src={mediaCanvasUrl(mediaList[0].fileUrl)}
                                                                active={mediaPeekHover}
                                                                fitClass={fitClass}
                                                                crossOrigin={cors}
                                                                variant="overlay"
                                                            />
                                                        </div>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveMedia(0); }} className="absolute top-1 right-1 z-[5] p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow"><X size={12} /></button>
                                                        <a href={mediaList[0].fileUrl} download target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="absolute bottom-1 right-1 z-[5] p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow" title="Download"><Download size={12} /></a>
                                                    </>
                                                ) : (
                                                    <>
                                                        <ComposerMediaPeekPlayer
                                                            ref={mediaPeekPlayRef}
                                                            key={`peek-inline-${mediaList[0].fileUrl}`}
                                                            src={mediaDisplayUrl(mediaList[0].fileUrl)}
                                                            active={mediaPeekHover}
                                                            fitClass={fitClass}
                                                            crossOrigin={cors}
                                                            variant="inline"
                                                        />
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveMedia(0); }} className="absolute top-1 right-1 z-[5] p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow"><X size={12} /></button>
                                                        <a href={mediaList[0].fileUrl} download target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="absolute bottom-1 right-1 z-[5] p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow" title="Download"><Download size={12} /></a>
                                                    </>
                                                );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                <div className="grid grid-cols-4 gap-3">
                                    {mediaList.map((m, i) => (
                                        <div
                                            key={i}
                                            className={`relative group rounded-xl overflow-hidden bg-neutral-100 border-2 ${mediaType === 'reel' || mediaType === 'video' ? 'aspect-[9/16]' : 'aspect-square'} ${mediaType === 'carousel' ? 'cursor-grab active:cursor-grabbing border-neutral-300 hover:border-[var(--primary)]/60' : 'border-neutral-200'} ${carouselDraggingIndex === i ? 'opacity-50 ring-2 ring-[var(--primary)]/60' : ''}`}
                                            onClick={mediaType === 'carousel' ? () => moveCarouselToPosition(i, 0) : undefined}
                                            role={mediaType === 'carousel' ? 'button' : undefined}
                                            draggable={mediaType === 'carousel'}
                                            onDragStart={mediaType === 'carousel' ? (e) => handleCarouselDragStart(e, i) : undefined}
                                            onDragEnd={mediaType === 'carousel' ? handleCarouselDragEnd : undefined}
                                            onDragOver={mediaType === 'carousel' ? handleCarouselDragOver : undefined}
                                            onDrop={mediaType === 'carousel' ? (e) => handleCarouselDrop(e, i) : undefined}
                                        >
                                            {m.type === 'VIDEO' ? (
                                                (m as MediaItem).thumbnailUrl ? (
                                                    <img src={mediaDisplayUrl((m as MediaItem).thumbnailUrl!)} alt="Video cover" className="object-cover w-full h-full pointer-events-none" />
                                                ) : (
                                                    <video src={mediaDisplayUrl(m.fileUrl)} className="object-cover w-full h-full pointer-events-none" muted playsInline />
                                                )
                                            ) : (
                                                <img src={mediaDisplayUrl(m.fileUrl)} alt="media" className="object-cover w-full h-full pointer-events-none" draggable={false} />
                                            )}
                                            {mediaType === 'carousel' && (
                                                <span className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-black/70 text-white text-sm font-bold flex items-center justify-center pointer-events-none">
                                                    {i + 1}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleRemoveMedia(i); }}
                                                className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                            >
                                                <X size={14} />
                                            </button>
                                            <a
                                                href={m.fileUrl}
                                                download
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute bottom-1.5 right-1.5 p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                                title="Download"
                                            >
                                                <Download size={14} />
                                            </a>
                                        </div>
                                    ))}
                                </div>
                                )}
                                {mediaType === 'carousel' && mediaList.length > 1 && (
                                    <p className="text-xs text-neutral-500">Drag images to reorder. Click an image to move it to position 1.</p>
                                )}
                            </>
                        ) : (
                            <div className="space-y-4">
                                {platforms.map((p) => (
                                    <div key={p} className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                                        <p className="text-sm font-medium text-neutral-700">{PLATFORM_LABELS[p] || p}</p>
                                        <input
                                            ref={(el) => { fileInputByPlatformRef.current[p] = el; }}
                                            type="file"
                                            accept={`image/*,${VIDEO_ACCEPT}`}
                                            multiple
                                            className="hidden"
                                            onChange={(ev) => handleFileSelectForPlatform(p, ev)}
                                        />
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => fileInputByPlatformRef.current[p]?.click()}
                                                disabled={mediaUploading}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                            >
                                                <Plus size={16} />
                                                <span className="sm:hidden">Add from library</span>
                                                <span className="hidden sm:inline">Add from computer</span>
                                            </button>
                                            {mediaUploading && <span className="text-xs text-neutral-500">Uploading…</span>}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(mediaByPlatform[p] || []).map((m, i) => (
                                                <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden bg-neutral-200 shrink-0">
                                                    {m.type === 'VIDEO' ? (
                                                        <video src={mediaDisplayUrl(m.fileUrl)} className="w-full h-full object-cover" muted playsInline />
                                                    ) : (
                                                        <img src={mediaDisplayUrl(m.fileUrl)} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                    <button type="button" onClick={() => handleRemoveMediaForPlatform(p, i)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded text-xs">×</button>
                                                    <a href={m.fileUrl} download target="_blank" rel="noopener noreferrer" className="absolute bottom-0.5 right-0.5 p-1 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity" title="Download"><Download size={12} /></a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {platforms.length === 0 && <p className="text-sm text-neutral-500">Select platforms above first.</p>}
                                {mediaUploadError && <p className="text-sm text-red-600">{mediaUploadError}</p>}
                            </div>
                        )}
                            </div>
                        )}
                    </div>


                    <div className="card space-y-4">
                        <button type="button" onClick={() => toggleSection('content')} className="w-full flex items-center justify-between text-left">
                            <h3 className="font-semibold text-neutral-900">Content</h3>
                            {sectionOpen.content ? <ChevronUp size={20} className="text-neutral-400 shrink-0" /> : <ChevronDown size={20} className="text-neutral-400 shrink-0" />}
                        </button>
                        {sectionOpen.content && (
                        <div className="pt-4 space-y-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={differentContentPerPlatform}
                                onChange={(e) => setDifferentContentPerPlatform(e.target.checked)}
                                className="rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                            <span className="text-sm text-neutral-700">Use different content per platform</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={openAiModal}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--primary)]/15 text-[var(--primary)] hover:bg-[var(--primary)]/20 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Sparkles size={16} />
                                Generate with AI
                            </button>
                            <span className="text-xs text-neutral-500">Optional. Set brand context in Dashboard → AI Assistant first.</span>
                        </div>
                        {!differentContentPerPlatform ? (
                            <div>
                            <textarea
                                value={content}
                                    onChange={(e) => { setContent(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                    onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                placeholder="What's on your mind?..."
                                    rows={5}
                                    className="w-full min-h-[7rem] p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] resize-none overflow-hidden"
                                />
                                {platforms.includes('TWITTER') && (() => {
                                    const withTags = content.trim() + (selectedHashtags.length ? ' ' + selectedHashtags.join(' ') : '');
                                    return (
                                        <div className="mt-1 space-y-0.5">
                                            <p className={`text-xs ${withTags.length > 230 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>
                                                X (Twitter) limit: 230 chars (including spaces + emojis). Current (with hashtags): {withTags.length}
                                            </p>
                                            {mediaList.length > 0 && (
                                                <p className="text-xs text-neutral-400">Image on X: if upload is not allowed for your app, the post will go out as text only.</p>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {platforms.map((p) => {
                                    const tags = differentHashtagsPerPlatform ? (selectedHashtagsByPlatform[p] ?? []) : selectedHashtags;
                                    const fullLength = (contentByPlatform[p] ?? '').trim().length + (tags.length ? ' ' + tags.join(' ') : '').length;
                                    return (
                                    <div key={p} className="space-y-1">
                                        <label className="text-sm font-medium text-neutral-700">{PLATFORM_LABELS[p] || p}</label>
                                        <textarea
                                            value={contentByPlatform[p] ?? ''}
                                                onChange={(e) => { setContentByPlatform((prev) => ({ ...prev, [p]: e.target.value })); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                            placeholder="Content for this platform..."
                                                rows={4}
                                                className="w-full min-h-[6rem] p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] text-sm resize-none overflow-hidden"
                                        />
                                            {p === 'TWITTER' && (
                                                <p className={`text-xs ${fullLength > 230 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>
                                                    X limit: 230 (including spaces + emojis). Current (with hashtags): {fullLength}
                                                </p>
                                            )}
                                    </div>
                                    );
                                })}
                                {platforms.length === 0 && <p className="text-sm text-neutral-500">Select platforms above first.</p>}
                            </div>
                        )}
                            </div>
                        )}
                    </div>

                    {platforms.some((p) => COMMENT_AUTOMATION_PLATFORMS.has(p)) && <div className="card space-y-4">
                        <button type="button" onClick={() => toggleSection('commentAutomation')} className="w-full flex items-center justify-between text-left">
                            <h3 className="font-semibold text-neutral-900">Comment automation</h3>
                            {sectionOpen.commentAutomation ? <ChevronUp size={20} className="text-neutral-400 shrink-0" /> : <ChevronDown size={20} className="text-neutral-400 shrink-0" />}
                        </button>
                        {sectionOpen.commentAutomation && (
                        <div className="pt-4 space-y-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={commentAutomationEnabled}
                                onChange={(e) => setCommentAutomationEnabled(e.target.checked)}
                                className="rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                            />
                            <span className="text-sm font-medium text-neutral-700">Enable keyword comment automation</span>
                        </label>
                        <p className="text-sm text-neutral-500">When comments contain your keywords on this post, we automatically reply. Set a default reply and/or a different reply per platform below. Replies are sent on Instagram, Facebook, and X. Settings are saved with the post.</p>
                        {commentAutomationEnabled && (
                            <div className="space-y-4 pt-2 border-t border-neutral-100">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Keywords (one per line or comma-separated)</label>
                                    <textarea
                                        value={commentAutomationKeywords}
                                        onChange={(e) => setCommentAutomationKeywords(e.target.value)}
                                        placeholder="e.g. price, discount, help"
                                        rows={2}
                                        className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Default reply (used if no platform-specific reply is set)</label>
                                    <textarea
                                        value={commentAutomationReplyTemplate}
                                        onChange={(e) => setCommentAutomationReplyTemplate(e.target.value)}
                                        placeholder="e.g. Thanks for your interest!"
                                        rows={2}
                                        className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] text-sm"
                                    />
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={commentAutomationTagCommenter}
                                        onChange={(e) => setCommentAutomationTagCommenter(e.target.checked)}
                                        className="rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                    />
                                    <span className="text-sm text-neutral-700">Tag the commenter in the reply (e.g. &quot;Hi @username, thanks!&quot;)</span>
                                </label>
                                {platforms.some((p) => COMMENT_AUTOMATION_PLATFORMS.has(p)) && (
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-700 mb-2">Reply per platform (optional)</label>
                                        <div className="space-y-3">
                                            {platforms.filter((p) => COMMENT_AUTOMATION_PLATFORMS.has(p)).map((p) => (
                                                <div key={p} className="space-y-1">
                                                    <span className="text-sm font-medium text-neutral-600">{PLATFORM_LABELS[p] || p}</span>
                                                    {p === 'INSTAGRAM' ? (
                                                        <>
                                                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={commentAutomationInstagramPublicReply}
                                                                        onChange={(e) => setCommentAutomationInstagramPublicReply(e.target.checked)}
                                                                        className="rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                                                    />
                                                                    <span className="text-sm text-neutral-700">Send public reply</span>
                                                                </label>
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={commentAutomationInstagramPrivateReply}
                                                                        onChange={(e) => setCommentAutomationInstagramPrivateReply(e.target.checked)}
                                                                        className="rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                                                                    />
                                                                    <span className="text-sm text-neutral-700">Send a private reply (DM)</span>
                                                                </label>
                                                            </div>
                                                            <textarea
                                                                value={commentAutomationReplyByPlatform[p] ?? ''}
                                                                onChange={(e) => setCommentAutomationReplyByPlatform((prev) => ({ ...prev, [p]: e.target.value }))}
                                                                placeholder={commentAutomationReplyTemplate.trim() || 'e.g. Thanks for commenting!'}
                                                                rows={2}
                                                                className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] text-sm"
                                                            />
                                                            {commentAutomationInstagramPrivateReply && (
                                                                <div className="mt-2 space-y-1">
                                                                    <label className="block text-xs font-medium text-neutral-600">DM message</label>
                                                                    <div className="flex gap-2">
                                                                        <textarea
                                                                            value={commentAutomationInstagramDmMessage}
                                                                            onChange={(e) => setCommentAutomationInstagramDmMessage(e.target.value)}
                                                                            placeholder="e.g. Thanks! I'll send you the link via DM."
                                                                            rows={2}
                                                                            className="flex-1 p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] text-sm"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                try {
                                                                                    setDmReplyAiLoading(true);
                                                                                    const res = await api.post<{ content?: string }>('/ai/generate-description', {
                                                                                        topic: 'Comment reply',
                                                                                        prompt: 'Short, friendly Instagram DM reply when someone comments with interest. Keep under 200 characters.',
                                                                                        platform: 'INSTAGRAM',
                                                                                    });
                                                                                    const text = res.data?.content?.trim();
                                                                                    if (text) setCommentAutomationInstagramDmMessage(text);
                                                                                } catch (_) {}
                                                                                finally { setDmReplyAiLoading(false); }
                                                                            }}
                                                                            disabled={dmReplyAiLoading}
                                                                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--primary)]/15 text-[var(--primary)] hover:bg-[var(--primary)]/20 rounded-lg text-sm font-medium disabled:opacity-50"
                                                                        >
                                                                            {dmReplyAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                                                            Generate with AI
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <textarea
                                                            value={commentAutomationReplyByPlatform[p] ?? ''}
                                                            onChange={(e) => setCommentAutomationReplyByPlatform((prev) => ({ ...prev, [p]: e.target.value }))}
                                                            placeholder={commentAutomationReplyTemplate.trim() || 'e.g. Thanks for commenting!'}
                                                            rows={2}
                                                            className="w-full p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] text-sm"
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        </div>
                        )}
                    </div>}

                    <div className="card space-y-4">
                        <button type="button" onClick={() => toggleSection('hashtags')} className="w-full flex items-center justify-between text-left">
                        <h3 className="font-semibold text-neutral-900 flex items-center gap-2">
                            <Hash size={20} className="text-neutral-500" />
                                Hashtags
                        </h3>
                            {sectionOpen.hashtags ? <ChevronUp size={20} className="text-neutral-400 shrink-0" /> : <ChevronDown size={20} className="text-neutral-400 shrink-0" />}
                        </button>
                        {sectionOpen.hashtags && (
                        <div className="pt-4 space-y-4">
                        <p className="text-sm text-neutral-500">Add hashtags to your pool, then choose up to 5 per post. They will be added after your content.</p>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newHashtagInput}
                                    onChange={(e) => setNewHashtagInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToHashtagPool())}
                                    placeholder="e.g. travel or #travel"
                                    className="flex-1 p-2.5 border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                                />
                                <button type="button" onClick={addToHashtagPool} className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition-colors">
                                    Add to pool
                                </button>
                            </div>
                            {hashtagPool.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {hashtagPool.map((tag) => (
                                        <span key={tag} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-neutral-100 rounded-full text-sm text-neutral-700">
                                            {tag}
                                            <button type="button" onClick={() => removeFromHashtagPool(tag)} className="p-0.5 rounded-full hover:bg-neutral-200 text-neutral-500" aria-label={`Remove ${tag}`}>
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        {hashtagPool.length > 0 && (
                            <>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={differentHashtagsPerPlatform} onChange={(e) => setDifferentHashtagsPerPlatform(e.target.checked)} className="rounded border-neutral-300 text-[var(--primary)] focus:ring-[var(--primary)]" />
                                    <span className="text-sm font-medium text-neutral-700">Use different hashtags per platform</span>
                                </label>
                                {!differentHashtagsPerPlatform ? (
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-neutral-700">Select up to 5 for this post</p>
                                        <div className="flex flex-wrap gap-2">
                                            {hashtagPool.map((tag) => {
                                                const selected = selectedHashtags.includes(tag);
                                                return (
                                                    <button key={tag} type="button" onClick={() => toggleSelectedHashtag(tag)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selected ? 'bg-[var(--button)] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                                                        {tag}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {selectedHashtags.length > 0 && <p className="text-xs text-neutral-500">{selectedHashtags.length} selected (max 5)</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {platforms.map((p) => {
                                            const list = selectedHashtagsByPlatform[p] ?? [];
                                            return (
                                                <div key={p} className="space-y-2">
                                                    <p className="text-sm font-medium text-neutral-700">{PLATFORM_LABELS[p] || p} — up to 5</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {hashtagPool.map((tag) => {
                                                            const selected = list.includes(tag);
                                                            return (
                                                                <button key={tag} type="button" onClick={() => toggleSelectedHashtagForPlatform(p, tag)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selected ? 'bg-[var(--button)] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                                                                    {tag}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    {list.length > 0 && <p className="text-xs text-neutral-500">{list.length} selected</p>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                        </div>
                        )}
                    </div>

                    <div className="card space-y-4">
                        <button type="button" onClick={() => toggleSection('schedule')} className="w-full flex items-center justify-between text-left">
                            <h3 className="font-semibold text-neutral-900">Schedule</h3>
                            {sectionOpen.schedule ? <ChevronUp size={20} className="text-neutral-400 shrink-0" /> : <ChevronDown size={20} className="text-neutral-400 shrink-0" />}
                        </button>
                        {sectionOpen.schedule && (
                        <div className="pt-4 space-y-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="scheduleMode"
                                    checked={!scheduledAt || scheduledAt.trim() === ''}
                                    onChange={() => setScheduledAt('')}
                                    className="text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <span className="text-sm font-medium text-neutral-800">Post now</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="scheduleMode"
                                    checked={scheduledAt.trim() !== ''}
                                    onChange={() => { if (!scheduledAt.trim()) setScheduledAt(minSchedulableDateTimeLocal()); }}
                                    className="text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <span className="text-sm font-medium text-neutral-800">Schedule for later</span>
                            </label>
                        </div>
                        {scheduledAt.trim() !== '' && (
                        <>
                        <div className="flex items-center gap-3">
                            <Calendar size={22} className="text-neutral-400 shrink-0" />
                            <input
                                type="datetime-local"
                                value={scheduledAt}
                                onChange={(e) => setScheduledAt(e.target.value)}
                                min={minSchedulableDateTimeLocal()}
                                className="flex-1 p-3 border border-neutral-200 rounded-xl text-neutral-900 focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                            />
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-neutral-700">
                                At scheduled time:
                            </p>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="scheduleDelivery"
                                    checked={scheduleDelivery === 'auto'}
                                    onChange={() => setScheduleDelivery('auto')}
                                    className="text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <span className="text-sm text-neutral-800">Post automatically to all platforms</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="scheduleDelivery"
                                    checked={scheduleDelivery === 'email_links'}
                                    onChange={() => setScheduleDelivery('email_links')}
                                    className="text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <span className="text-sm text-neutral-800">Email me a link per platform so I can open each one, edit or add sound, and publish manually</span>
                            </label>
                            {scheduleDelivery === 'email_links' && scheduledAt && (
                                <p className="text-xs text-neutral-500 mt-1 ml-6">You will receive the email when the scheduled time is reached (usually within a few minutes).</p>
                            )}
                        </div>
                        </>
                        )}
                        </div>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                    <button
                        type="submit"
                            value="publish"
                        disabled={loading}
                            className="flex-1 btn-primary flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin shrink-0" />
                                    <span>{saveAsDraftRef.current ? 'Saving…' : scheduledAt?.trim() ? 'Scheduling…' : 'Posting…'}</span>
                                </>
                            ) : (
                                <>
                        <Send size={20} />
                                    <span>{editPostId ? (editPostAlreadyPosted ? (scheduledAt?.trim() ? 'Create new post & Schedule' : 'Create new post & Post Now') : (scheduledAt?.trim() ? 'Update & Schedule' : 'Update & Post Now')) : (scheduledAt?.trim() ? 'Schedule Post' : 'Post Now')}</span>
                                </>
                            )}
                    </button>
                        {scheduledAt?.trim() ? (
                        <button
                            type="submit"
                            value="draft"
                            disabled={loading}
                            className="shrink-0 px-6 py-3.5 rounded-xl border-2 border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 font-medium disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? <Loader2 size={20} className="animate-spin" /> : 'Save draft'}
                        </button>
                        ) : null}
                    </div>
                </form>

                {/* Resizable preview panel: drag the handle to change width */}
                <div
                    className="hidden lg:block shrink-0 w-2 cursor-col-resize bg-neutral-200 hover:bg-[var(--primary)]/40 active:bg-[var(--primary)]/50 transition-colors rounded-full my-2 self-stretch"
                    role="separator"
                    aria-label="Resize preview"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        previewResizeRef.current = { startX: e.clientX, startW: previewWidthPx };
                    }}
                />
                <div
                    className="hidden lg:flex flex-col flex-shrink-0 space-y-3 lg:pl-2"
                    style={{ width: `${previewWidthPx}px`, minWidth: 300, maxWidth: 920 }}
                >
                    <h2 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Preview</h2>
                    <div className="sticky top-6 space-y-3 overflow-y-auto max-h-[calc(100vh-8rem)]">
                        {platforms.length === 0 ? (
                            <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/50 flex flex-col items-center justify-center py-8 text-neutral-400">
                                {mediaList.length > 0 ? (
                                    <>
                                        <div className={`w-full max-w-[min(100%,480px)] mx-auto rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 ${(mediaType === 'video' && mediaList[0].type === 'VIDEO') ? 'aspect-video' : (mediaType === 'reel' && mediaList[0].type === 'VIDEO') ? 'aspect-[9/16]' : 'aspect-square'} ${mediaType === 'reel' ? 'border-0 ring-0' : ''}`}>
                                            {mediaList[0].type === 'VIDEO' ? (
                                                (mediaList[0] as MediaItem).thumbnailUrl ? (
                                                    <img src={mediaDisplayUrl((mediaList[0] as MediaItem).thumbnailUrl!)} alt="Video" className="w-full h-full object-contain" />
                                                ) : (
                                                    <video src={mediaDisplayUrl(mediaList[0].fileUrl)} className="w-full h-full object-contain" muted playsInline />
                                                )
                                            ) : (
                                                <img src={mediaDisplayUrl(mediaList[0].fileUrl)} alt="Preview" className="w-full h-full object-contain" />
                                            )}
                            </div>
                                        <p className="mt-3 text-xs font-medium text-neutral-500">Select platforms above to see per-platform preview</p>
                                    </>
                                ) : (
                                    <>
                                        <ImageIcon size={28} strokeWidth={1.5} className="text-neutral-300" />
                                        <p className="mt-2 text-xs font-medium">Select platforms</p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {platforms.map(p => {
                                const baseContent = differentContentPerPlatform ? (contentByPlatform[p] ?? '') : content;
                                const tags = differentHashtagsPerPlatform ? (selectedHashtagsByPlatform[p] ?? []) : selectedHashtags;
                                const contentWithHashtags = baseContent.trim() + (tags.length ? ' ' + tags.join(' ') : '');
                                    const accountForPlatform = accounts.find((a: { platform: string }) => a.platform === p) as { username?: string; profilePicture?: string } | undefined;
                                    const mediaForPlatform = differentMediaPerPlatform ? (mediaByPlatform[p] ?? []) : mediaList;
                                    const effectiveMedia = (mediaType === 'video' || mediaType === 'reel') && mediaForPlatform.length === 1 && differentThumbnailPerPlatform
                                        ? mediaForPlatform.map((m, i) => (i === 0 && m.type === 'VIDEO' ? { ...m, thumbnailUrl: thumbnailByPlatform[p] ?? (m as MediaItem).thumbnailUrl } : m))
                                        : mediaForPlatform;
                                return (
                                    <PostPreview
                                        key={p}
                                        platform={p}
                                            profileName={accountForPlatform?.username ?? ''}
                                            profilePicture={accountForPlatform?.profilePicture ?? undefined}
                                        content={contentWithHashtags}
                                            media={effectiveMedia}
                                            mediaType={mediaType}
                                            compact={platforms.length > 1}
                                            mediaUploading={mediaUploading}
                                            composerFramePreview={composerFramePreview}
                                    />
                                );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                {/* Mobile: preview below form (no resize) */}
                <div className="lg:hidden w-full mt-6 space-y-3">
                    <h2 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">Preview</h2>
                    <div className="space-y-3">
                        {platforms.length === 0 ? (
                            <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/50 flex flex-col items-center justify-center py-8 text-neutral-400">
                                {mediaList.length > 0 ? (
                                    <>
                                        <div className={`w-full max-w-[min(100%,480px)] mx-auto rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 ${(mediaType === 'video' && mediaList[0].type === 'VIDEO') ? 'aspect-video' : (mediaType === 'reel' && mediaList[0].type === 'VIDEO') ? 'aspect-[9/16]' : 'aspect-square'} ${mediaType === 'reel' ? 'border-0 ring-0' : ''}`}>
                                            {mediaList[0].type === 'VIDEO' ? (
                                                (mediaList[0] as MediaItem).thumbnailUrl ? (
                                                    <img src={mediaDisplayUrl((mediaList[0] as MediaItem).thumbnailUrl!)} alt="Video" className="w-full h-full object-contain" />
                                                ) : (
                                                    <video src={mediaDisplayUrl(mediaList[0].fileUrl)} className="w-full h-full object-contain" muted playsInline />
                                                )
                                            ) : (
                                                <img src={mediaDisplayUrl(mediaList[0].fileUrl)} alt="Preview" className="w-full h-full object-contain" />
                                            )}
            </div>
                                        <p className="mt-3 text-xs font-medium text-neutral-500">Select platforms above to see per-platform preview</p>
                                    </>
                                ) : (
                                    <>
                                        <ImageIcon size={28} strokeWidth={1.5} className="text-neutral-300" />
                                        <p className="mt-2 text-xs font-medium">Select platforms</p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {platforms.map(p => {
                                    const baseContent = differentContentPerPlatform ? (contentByPlatform[p] ?? '') : content;
                                    const tags = differentHashtagsPerPlatform ? (selectedHashtagsByPlatform[p] ?? []) : selectedHashtags;
                                    const contentWithHashtags = baseContent.trim() + (tags.length ? ' ' + tags.join(' ') : '');
                                    const accountForPlatform = accounts.find((a: { platform: string }) => a.platform === p) as { username?: string; profilePicture?: string } | undefined;
                                    const mediaForPlatform = differentMediaPerPlatform ? (mediaByPlatform[p] ?? []) : mediaList;
                                    const effectiveMedia = (mediaType === 'video' || mediaType === 'reel') && mediaForPlatform.length === 1 && differentThumbnailPerPlatform
                                        ? mediaForPlatform.map((m, i) => (i === 0 && m.type === 'VIDEO' ? { ...m, thumbnailUrl: thumbnailByPlatform[p] ?? (m as MediaItem).thumbnailUrl } : m))
                                        : mediaForPlatform;
                                        return (
                                        <PostPreview
                                            key={p}
                                            platform={p}
                                            profileName={accountForPlatform?.username ?? ''}
                                            profilePicture={accountForPlatform?.profilePicture ?? undefined}
                                            content={contentWithHashtags}
                                            media={effectiveMedia}
                                            mediaType={mediaType}
                                            compact={platforms.length > 1}
                                            mediaUploading={mediaUploading}
                                            composerFramePreview={composerFramePreview}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlatformToggle({ platform, label, icon, active, onClick, connected }: { platform: string; label: string; icon: React.ReactNode; active: boolean; onClick: () => void; connected: boolean }) {
    return (
        <div className="relative flex flex-col items-center gap-1">
        <button
            type="button"
                onClick={connected ? onClick : undefined}
                title={connected ? label : `Connect ${label} first in the sidebar`}
                aria-label={label}
                className={`w-full aspect-square rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-200 ${
                    !connected
                        ? 'border-neutral-100 bg-neutral-50 text-neutral-300 cursor-not-allowed opacity-50'
                        : active
                    ? 'border-neutral-400 bg-neutral-100 text-neutral-700 shadow-sm'
                    : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
        >
                <span className="flex items-center justify-center w-9 h-9 shrink-0">{icon}</span>
        </button>
        </div>
    );
}

function PostPreview({
    platform,
    profileName,
    profilePicture,
    content,
    media,
    mediaType = 'photo',
    compact = false,
    mediaUploading = false,
    composerFramePreview,
}: {
    platform: string;
    profileName: string;
    profilePicture?: string;
    content: string;
    media: { fileUrl: string; type: string; thumbnailUrl?: string }[];
    mediaType?: MediaTypeChoice;
    compact?: boolean;
    mediaUploading?: boolean;
    /** When set with a single video, preview seeks with the composer frame slider. */
    composerFramePreview?: { timeSec: number; videoSrc: string };
}) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const slideIndex = media.length > 0 ? Math.min(currentSlide, media.length - 1) : 0;
    const currentMedia = media[slideIndex];
    const isVideoMedia = currentMedia?.type === 'VIDEO';
    const useLiveFrameScrub = Boolean(
        composerFramePreview && isVideoMedia && media.length === 1 && slideIndex === 0
    );

    const PlatformIcon = () => {
        switch (platform) {
            case 'INSTAGRAM': return <InstagramIcon size={compact ? 16 : 22} />;
            case 'YOUTUBE': return <YoutubeIcon size={compact ? 16 : 22} />;
            case 'TIKTOK': return <TikTokIcon size={compact ? 16 : 22} />;
            case 'FACEBOOK': return <FacebookIcon size={compact ? 16 : 22} />;
            case 'TWITTER': return <XTwitterIcon size={compact ? 16 : 22} className="text-neutral-800" />;
            case 'LINKEDIN': return <LinkedinIcon size={compact ? 16 : 22} />;
            case 'PINTEREST': return <PinterestIcon size={compact ? 16 : 22} />;
            default: return <Video size={compact ? 16 : 22} className="text-neutral-500" />;
        }
    };
    const reelPreview = mediaType === 'reel';
    const aspectBase =
        mediaType === 'video'
            ? 'aspect-video'
            : mediaType === 'reel' || (media.length === 1 && media[0]?.type === 'VIDEO')
              ? 'aspect-[9/16]'
              : 'aspect-square';
    const mediaShellClass =
        `${reelPreview ? 'bg-black' : 'bg-neutral-50'} flex items-center justify-center relative overflow-hidden ` + aspectBase;
    const videoVisualClass = 'w-full h-full object-contain';

    return (
        <div
            className={`rounded-xl overflow-hidden bg-white shadow-sm ${reelPreview ? '' : 'border border-neutral-200'} ${compact ? 'max-w-[260px]' : 'w-full max-w-none mx-auto shadow-lg'}`}
        >
            <div className={`${reelPreview ? '' : 'border-b border-neutral-100'} flex items-center gap-1.5 ${compact ? 'p-1.5' : 'p-3'}`}>
                <div className={`rounded-full bg-neutral-200 flex items-center justify-center shrink-0 overflow-hidden ${compact ? 'w-6 h-6' : 'w-9 h-9'}`}>
                    {profilePicture ? (
                        <img src={profilePicture} alt="" className="w-full h-full object-cover" />
                    ) : (
                    <PlatformIcon />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`truncate text-neutral-900 ${compact ? 'text-[10px] font-semibold' : 'text-sm font-semibold'}`}>{profileName || 'Your profile'}</p>
                    <p className={`truncate text-neutral-500 ${compact ? 'text-[9px]' : 'text-xs'}`}>{PLATFORM_LABELS[platform] || platform}</p>
                </div>
            </div>
            <div className={mediaShellClass}>
                {mediaUploading && !currentMedia ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 animate-pulse">
                        <Loader2 size={compact ? 18 : 28} className="animate-spin text-neutral-400" />
                        <span className={`text-neutral-400 font-medium ${compact ? 'text-[9px]' : 'text-xs'}`}>Uploading…</span>
                    </div>
                ) : currentMedia ? (
                    <>
                        {currentMedia.type === 'VIDEO' ? (
                            useLiveFrameScrub && composerFramePreview ? (
                                <ComposerScrubVideoPreview
                                    src={composerFramePreview.videoSrc}
                                    timeSec={composerFramePreview.timeSec}
                                    className={videoVisualClass}
                                />
                            ) : (currentMedia as { thumbnailUrl?: string }).thumbnailUrl ? (
                                <img
                                    src={mediaDisplayUrl((currentMedia as { thumbnailUrl?: string }).thumbnailUrl!)}
                                    alt="Video cover"
                                    className={videoVisualClass}
                                />
                            ) : (
                                <video
                                    src={mediaDisplayUrl(currentMedia.fileUrl)}
                                    className={videoVisualClass}
                                    muted
                                    playsInline
                                />
                            )
                        ) : (
                            <img src={mediaDisplayUrl(currentMedia.fileUrl)} alt="preview" className="w-full h-full object-cover" />
                        )}
                        {media.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setCurrentSlide((s) => (s <= 0 ? media.length - 1 : s - 1)); }}
                                    className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center shadow ${compact ? 'left-0.5 w-6 h-6' : 'left-2 w-9 h-9'}`}
                                    aria-label="Previous"
                                >
                                    <ChevronLeft size={compact ? 14 : 22} />
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setCurrentSlide((s) => (s >= media.length - 1 ? 0 : s + 1)); }}
                                    className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center shadow ${compact ? 'right-0.5 w-6 h-6' : 'right-2 w-9 h-9'}`}
                                    aria-label="Next"
                                >
                                    <ChevronRight size={compact ? 14 : 22} />
                                </button>
                                <span className={`absolute bottom-1 right-1 rounded bg-black/60 text-white font-medium ${compact ? 'px-1 py-0.5 text-[9px]' : 'bottom-2 right-2 px-2 py-0.5 text-xs'}`}>
                                    {slideIndex + 1} / {media.length}
                                </span>
                            </>
                        )}
                    </>
                ) : mediaUploading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 animate-pulse">
                        <Loader2 size={compact ? 18 : 28} className="animate-spin text-neutral-400" />
                        <span className={`text-neutral-400 font-medium ${compact ? 'text-[9px]' : 'text-xs'}`}>Uploading…</span>
            </div>
                ) : (
                    <ImageIcon size={compact ? 20 : 36} className="text-neutral-200" strokeWidth={1.5} />
                )}
            </div>
            <div className={compact ? 'p-1.5' : 'p-3 space-y-2'}>
                <p className={`text-neutral-800 whitespace-pre-wrap break-words overflow-y-auto ${compact ? 'text-[10px] max-h-16' : 'text-sm max-h-48'}`}>
                    {content || (compact ? '…' : 'Your caption will appear here...')}
                </p>
            </div>
        </div>
    );
}
