'use client';

import React, { useState, useEffect } from 'react';
import { Instagram, Facebook, Youtube, Twitter, Linkedin, Github, Globe, Mail, Phone, ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import type { LinkPageDesign } from './themes';
import { getDefaultDesign } from './themes';

type LinkItem = {
  id: string;
  type: string;
  label?: string | null;
  url?: string | null;
  icon?: string | null;
  order: number;
  isVisible: boolean;
};

type LinkPageData = {
  slug: string;
  title?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  design?: LinkPageDesign | null;
  links: LinkItem[];
};

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  instagram: <Instagram size={20} />,
  facebook: <Facebook size={20} />,
  youtube: <Youtube size={20} />,
  twitter: <Twitter size={20} />,
  x: <Twitter size={20} />,
  tiktok: <Music2 size={20} />,
  linkedin: <Linkedin size={20} />,
  github: <Github size={20} />,
  website: <Globe size={20} />,
  email: <Mail size={20} />,
  phone: <Phone size={20} />,
};

function getButtonClasses(style?: string, isGlass?: boolean, size?: 'small' | 'medium' | 'large'): string {
  const sizeClasses =
    size === 'small'
      ? 'py-2.5 px-4 text-sm'
      : size === 'large'
        ? 'py-4 px-6 text-lg'
        : 'py-3.5 px-6 text-base';
  const base = `w-full ${sizeClasses} font-medium transition-all duration-200 flex items-center justify-center gap-3 text-center`;
  switch (style) {
    case 'pill':
      return `${base} rounded-full`;
    case 'square':
      return `${base} rounded-none`;
    case 'outline':
      return `${base} rounded-xl border-2 bg-transparent hover:scale-[1.02]`;
    case 'shadow':
      return `${base} rounded-xl hover:scale-[1.02] [box-shadow:0_12px_40px_-8px_rgba(0,0,0,0.45),0_4px_16px_-4px_rgba(0,0,0,0.3)]`;
    case 'glass':
      return `${base} rounded-xl backdrop-blur-md border border-white/40 hover:scale-[1.02] [background:rgba(255,255,255,0.2)]`;
    case 'filled':
    case 'rounded':
    default:
      return `${base} rounded-xl hover:scale-[1.02] hover:shadow-lg`;
  }
}

function getAnimationClass(animation?: string, index?: number): string {
  const delay = index ? `${index * 80}ms` : '0ms';
  switch (animation) {
    case 'fade':
      return 'animate-[fade-in_0.5s_ease-out_both]';
    case 'slide':
      return 'animate-[slide-up_0.4s_ease-out_both]';
    case 'scale':
      return 'animate-[scale-in_0.3s_ease-out_both]';
    case 'stagger':
      return 'animate-[slide-up_0.4s_ease-out_both]';
    default:
      return '';
  }
}

function Carousel({
  imageUrls,
  linkUrl,
  label,
  animationClass,
  animationDelay,
  isPreview,
  autoplay = true,
}: {
  imageUrls: string[];
  linkUrl?: string | null;
  label?: string | null;
  animationClass: string;
  animationDelay?: string;
  isPreview: boolean;
  autoplay?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const n = Math.max(1, imageUrls.length);

  useEffect(() => {
    if (!autoplay || n <= 1 || isPreview) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % n), 4000);
    return () => clearInterval(t);
  }, [autoplay, n, isPreview]);

  if (imageUrls.length === 0) {
    return (
      <div className={`w-full aspect-video rounded-xl bg-white/20 flex items-center justify-center text-sm ${animationClass}`} style={{ animationDelay }}>
        Add images to carousel
      </div>
    );
  }

  const current = imageUrls[index % imageUrls.length];
  const content = (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden">
      <img
        src={current}
        alt={label || `Slide ${index + 1}`}
        className="w-full h-full object-cover"
      />
      {imageUrls.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIndex((i) => (i - 1 + n) % n);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIndex((i) => (i + 1) % n);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
            aria-label="Next"
          >
            <ChevronRight size={20} />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {imageUrls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIndex(i);
                }}
                className={`w-2 h-2 rounded-full transition-colors ${i === index % imageUrls.length ? 'bg-white' : 'bg-white/50'}`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (linkUrl && !isPreview) {
    return (
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-full ${animationClass}`}
        style={{ animationDelay }}
      >
        {content}
        {label ? (
          <p className="text-sm font-medium mt-1.5 text-center opacity-95" style={{ color: 'inherit' }}>
            {label}
          </p>
        ) : null}
      </a>
    );
  }
  return (
    <div className={`block w-full ${animationClass}`} style={{ animationDelay }}>
      {content}
      {label ? (
        <p className="text-sm font-medium mt-1.5 text-center opacity-95" style={{ color: 'inherit' }}>
          {label}
        </p>
      ) : null}
    </div>
  );
}

export function LinkPageRenderer({
  data,
  isPreview = false,
}: {
  data: LinkPageData;
  isPreview?: boolean;
}) {
  const design: LinkPageDesign = (data.design && typeof data.design === 'object')
    ? { ...getDefaultDesign(), ...data.design }
    : getDefaultDesign();
  const linksArray = Array.isArray(data.links) ? data.links : [];
  const visibleLinks = linksArray
    .filter((l) => l && typeof l === 'object' && l.isVisible !== false)
    .sort((a, b) => (Number(a.order) ?? 0) - (Number(b.order) ?? 0));

  const bgStyle: React.CSSProperties = {};
  if (design.bgType === 'gradient') {
    if (design.bgGradientColors && design.bgGradientColors.length >= 2) {
      const [c1, c2, c3] = design.bgGradientColors;
      bgStyle.background = c3
        ? `linear-gradient(135deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`
        : `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
    } else if (design.bgGradient) {
      bgStyle.background = design.bgGradient;
    }
  } else if (design.bgType === 'image' && design.bgImageUrl) {
    bgStyle.backgroundImage = `url(${design.bgImageUrl})`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
    bgStyle.backgroundRepeat = 'no-repeat';
  } else if (design.bgColor) {
    bgStyle.backgroundColor = design.bgColor;
  }

  const buttonStyle: React.CSSProperties = {
    backgroundColor:
      design.buttonStyle === 'outline'
        ? 'transparent'
        : design.buttonStyle === 'glass'
          ? 'rgba(255,255,255,0.25)'
          : design.buttonColor,
    color: design.buttonTextColor ?? '#ffffff',
    borderColor: design.buttonStyle === 'outline' ? design.buttonColor : undefined,
    fontWeight: design.buttonTextBold ? 700 : undefined,
    ...(design.buttonStyle === 'shadow'
      ? { boxShadow: '0 12px 40px -8px rgba(0,0,0,0.45), 0 4px 16px -4px rgba(0,0,0,0.3)' }
      : {}),
    ...(design.buttonStyle === 'glass'
      ? { border: '1px solid rgba(255,255,255,0.4)', backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.2)' }
      : {}),
  };

  const containerClasses = isPreview
    ? 'w-full h-full overflow-auto'
    : 'min-h-screen min-h-dvh';

  return (
    <div
      className={`${containerClasses} flex flex-col items-center`}
      style={{ ...bgStyle, fontFamily: design.fontFamily, color: design.textColor }}
    >
      {design.bgType === 'video' && design.bgVideoUrl && (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover -z-10"
          src={design.bgVideoUrl}
        />
      )}

      <div className="w-full max-w-md px-6 py-12 flex flex-col items-center gap-6">
        {/* Avatar */}
        {data.avatarUrl && (
          <div
            className={`w-24 h-24 rounded-full overflow-hidden shadow-lg ${getAnimationClass(design.animation, 0)}`}
          >
            <img
              src={data.avatarUrl}
              alt={data.title || 'Profile'}
              className="w-full h-full object-cover object-center"
              style={{
                transform: `scale(${Math.max(0.5, Math.min(2, design.avatarScale ?? 1))})`,
              }}
            />
          </div>
        )}

        {/* Title & Bio */}
        <div className={`text-center ${getAnimationClass(design.animation, 1)}`}>
          {data.title && (
            <h1 className="text-2xl font-bold mb-2">{data.title}</h1>
          )}
          {data.bio && (
            <p className="text-sm opacity-80 max-w-xs">{data.bio}</p>
          )}
        </div>

        {/* Links */}
        <div className="w-full flex flex-col gap-3 mt-4">
          {visibleLinks.map((link, idx) => {
            const linkId = (link && typeof link === 'object' && link.id) ? String(link.id) : `link-${idx}`;
            const linkType = (link && typeof link === 'object' && link.type) ? String(link.type) : 'link';
            const stableKey = `link-${idx}`;
            if (linkType === 'header') {
              return (
                <div
                  key={stableKey}
                  className={`text-center py-2 text-sm font-semibold opacity-70 ${getAnimationClass(design.animation, idx + 2)}`}
                  style={{ animationDelay: design.animation === 'stagger' ? `${(idx + 2) * 80}ms` : undefined }}
                >
                  {link.label}
                </div>
              );
            }

            if (linkType === 'divider') {
              return (
                <div
                  key={stableKey}
                  className={`w-full h-px bg-current opacity-20 my-2 ${getAnimationClass(design.animation, idx + 2)}`}
                  style={{ animationDelay: design.animation === 'stagger' ? `${(idx + 2) * 80}ms` : undefined }}
                />
              );
            }

            if (linkType === 'image') {
              const imageUrl = link.icon || link.url;
              return (
                <a
                  key={stableKey}
                  href={link.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full overflow-hidden rounded-xl ${getAnimationClass(design.animation, idx + 2)}`}
                  style={{ animationDelay: design.animation === 'stagger' ? `${(idx + 2) * 80}ms` : undefined }}
                  onClick={(e) => {
                    if (isPreview) e.preventDefault();
                  }}
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={link.label || 'Link'}
                      className="w-full aspect-video object-cover hover:scale-[1.02] transition-transform"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-white/20 flex items-center justify-center text-sm">
                      Add image URL
                    </div>
                  )}
                  {link.label && (
                    <p className="text-sm font-medium mt-1.5 text-center opacity-90">{link.label}</p>
                  )}
                </a>
              );
            }

            if (linkType === 'carousel') {
              let urls: string[] = [];
              try {
                if (typeof link.icon === 'string' && link.icon.startsWith('[')) {
                  urls = JSON.parse(link.icon) as string[];
                }
              } catch {
                urls = [];
              }
              return (
                <Carousel
                  key={stableKey}
                  imageUrls={urls}
                  linkUrl={link.url}
                  label={link.label}
                  animationClass={getAnimationClass(design.animation, idx + 2)}
                  animationDelay={design.animation === 'stagger' ? `${(idx + 2) * 80}ms` : undefined}
                  isPreview={isPreview}
                  autoplay={design.carouselAutoplay !== false}
                />
              );
            }

            if (linkType === 'socials') {
              let socialUrls: Record<string, string> = {};
              let customIcons: Record<string, string> = {};
              try {
                if (typeof link.url === 'string' && link.url.startsWith('{')) {
                  socialUrls = JSON.parse(link.url) as Record<string, string>;
                }
              } catch {
                socialUrls = {};
              }
              try {
                if (typeof link.icon === 'string' && link.icon.startsWith('{')) {
                  customIcons = JSON.parse(link.icon) as Record<string, string>;
                }
              } catch {
                customIcons = {};
              }
              const entries = Object.entries(socialUrls).filter(([, u]) => u && String(u).trim());
              return (
                <div
                  key={stableKey}
                  className={`flex flex-wrap justify-center gap-3 py-2 ${getAnimationClass(design.animation, idx + 2)}`}
                  style={{ animationDelay: design.animation === 'stagger' ? `${(idx + 2) * 80}ms` : undefined }}
                >
                  {entries.map(([platform, url]) => {
                    const customIconUrl = customIcons[platform];
                    return (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-11 h-11 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 text-current transition-colors overflow-hidden"
                        onClick={(e) => {
                          if (isPreview) e.preventDefault();
                        }}
                        aria-label={platform}
                      >
                        {customIconUrl ? (
                          <img src={customIconUrl} alt="" className="w-6 h-6 object-contain" />
                        ) : (
                          SOCIAL_ICONS[platform.toLowerCase()] ?? <Globe size={20} />
                        )}
                      </a>
                    );
                  })}
                </div>
              );
            }

            const isCustomIconUrl = link.icon?.startsWith('http');
            const icon = isCustomIconUrl ? (
              <img src={link.icon!} alt="" className="w-5 h-5 object-contain shrink-0" />
            ) : link.icon ? SOCIAL_ICONS[link.icon.toLowerCase()] : null;

            return (
              <a
                key={stableKey}
                href={link.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={`${getButtonClasses(design.buttonStyle, design.buttonStyle === 'glass', design.buttonSize)} ${getAnimationClass(design.animation, idx + 2)}`}
                style={{
                  ...buttonStyle,
                  animationDelay: design.animation === 'stagger' ? `${(idx + 2) * 80}ms` : undefined,
                }}
                onClick={(e) => {
                  if (isPreview) e.preventDefault();
                }}
              >
                {icon}
                <span>{link.label || link.url}</span>
              </a>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className={`mt-8 text-xs opacity-50 ${getAnimationClass(design.animation, visibleLinks.length + 3)}`}
          style={{ animationDelay: design.animation === 'stagger' ? `${(visibleLinks.length + 3) * 80}ms` : undefined }}
        >
          <a
            href="https://agent4socials.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity"
            onClick={(e) => {
              if (isPreview) e.preventDefault();
            }}
          >
            Made with Agent4Socials
          </a>
        </div>
      </div>
    </div>
  );
}
