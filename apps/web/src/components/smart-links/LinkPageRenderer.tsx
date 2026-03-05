'use client';

import React from 'react';
import { Instagram, Facebook, Youtube, Twitter, Linkedin, Github, Globe, Mail, Phone } from 'lucide-react';
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
  linkedin: <Linkedin size={20} />,
  github: <Github size={20} />,
  website: <Globe size={20} />,
  email: <Mail size={20} />,
  phone: <Phone size={20} />,
};

function getButtonClasses(style?: string, isGlass?: boolean): string {
  const base = 'w-full py-3.5 px-6 font-medium transition-all duration-200 flex items-center justify-center gap-3 text-center';
  switch (style) {
    case 'pill':
      return `${base} rounded-full`;
    case 'square':
      return `${base} rounded-none`;
    case 'outline':
      return `${base} rounded-xl border-2 bg-transparent hover:scale-[1.02]`;
    case 'shadow':
      return `${base} rounded-xl shadow-lg shadow-current/20 hover:shadow-xl hover:scale-[1.02]`;
    case 'glass':
      return `${base} rounded-xl backdrop-blur-md border border-white/20 hover:scale-[1.02]`;
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

export function LinkPageRenderer({
  data,
  isPreview = false,
}: {
  data: LinkPageData;
  isPreview?: boolean;
}) {
  const design: LinkPageDesign = data.design ?? getDefaultDesign();
  const visibleLinks = data.links.filter((l) => l.isVisible).sort((a, b) => a.order - b.order);

  const bgStyle: React.CSSProperties = {};
  if (design.bgType === 'gradient' && design.bgGradient) {
    bgStyle.background = design.bgGradient;
  } else if (design.bgType === 'image' && design.bgImageUrl) {
    bgStyle.backgroundImage = `url(${design.bgImageUrl})`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
  } else if (design.bgColor) {
    bgStyle.backgroundColor = design.bgColor;
  }

  const buttonStyle: React.CSSProperties = {
    backgroundColor: design.buttonStyle === 'outline' ? 'transparent' : design.buttonColor,
    color: design.buttonTextColor,
    borderColor: design.buttonStyle === 'outline' ? design.buttonColor : undefined,
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
            className={`w-24 h-24 rounded-full overflow-hidden border-4 border-white/30 shadow-xl ${getAnimationClass(design.animation, 0)}`}
          >
            <img
              src={data.avatarUrl}
              alt={data.title || 'Profile'}
              className="w-full h-full object-cover"
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
            if (link.type === 'header') {
              return (
                <div
                  key={link.id}
                  className={`text-center py-2 text-sm font-semibold opacity-70 ${getAnimationClass(design.animation, idx + 2)}`}
                  style={{ animationDelay: design.animation === 'stagger' ? `${(idx + 2) * 80}ms` : undefined }}
                >
                  {link.label}
                </div>
              );
            }

            if (link.type === 'divider') {
              return (
                <div
                  key={link.id}
                  className={`w-full h-px bg-current opacity-20 my-2 ${getAnimationClass(design.animation, idx + 2)}`}
                  style={{ animationDelay: design.animation === 'stagger' ? `${(idx + 2) * 80}ms` : undefined }}
                />
              );
            }

            const icon = link.icon ? SOCIAL_ICONS[link.icon.toLowerCase()] : null;

            return (
              <a
                key={link.id}
                href={link.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={`${getButtonClasses(design.buttonStyle, design.buttonStyle === 'glass')} ${getAnimationClass(design.animation, idx + 2)}`}
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
