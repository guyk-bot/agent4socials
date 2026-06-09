import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { AuthModalProvider } from "@/context/AuthModalContext";
import { WhiteLabelProvider } from "@/context/WhiteLabelContext";
import { AccountsCacheProvider } from "@/context/AccountsCacheContext";
import { SelectedAccountProvider } from "@/context/SelectedAccountContext";
import { BrandAccountMoveHost } from "@/components/account/BrandAccountMoveHost";
import { AppDataProvider } from "@/context/AppDataContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AuthModal from "@/components/auth/AuthModal";
import AuthModalOpener from "@/components/auth/AuthModalOpener";
import { siteTabIcons } from "@/lib/site-tab-icons";
import { SITE_LOGO_V } from "@/lib/site-brand-assets";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

function getMetadataBase(): URL {
  try {
    return new URL(resolveAppBaseUrl());
  } catch {
    return new URL("https://www.izop.io");
  }
}

const siteUrl = resolveAppBaseUrl();

// Organization JSON-LD so Google can show the correct logo in search results (favicon + optional Knowledge Panel).
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "iZop",
  url: siteUrl,
  logo: {
    "@type": "ImageObject",
    url: `${siteUrl.replace(/\/+$/, "")}/logo-192.png?v=${SITE_LOGO_V}`,
    width: 192,
    height: 192,
  },
};

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "iZop | Schedule Posts & Analytics for Instagram, YouTube, TikTok, Facebook, Twitter & LinkedIn",
    template: "%s | iZop",
  },
  description: "Schedule posts and get analytics across Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn. Try for free. From $29/mo.",
  keywords: ["social media scheduler", "schedule Instagram posts", "schedule TikTok", "social media analytics", "post scheduler", "Instagram analytics", "TikTok scheduler", "Facebook scheduler", "LinkedIn scheduler"],
  authors: [{ name: "iZop" }],
  creator: "iZop",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://izop.io",
    siteName: "iZop",
    title: "iZop — Your AI Social Media Manager",
    description:
      "Schedule posts, bulk reply to comments, extract leads, and get analytics — just by talking to iZop AI.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "iZop — Your AI Social Media Manager" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "iZop — Your AI Social Media Manager",
    description:
      "Schedule posts, bulk reply to comments, extract leads, and get analytics — just by talking to iZop AI.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  // Tab favicon: PNGs / ICO / SVG (see SITE_TAB_FAVICON_V). Google / OG logo: logo-192 (black square, matches logo-mark).
  icons: siteTabIcons,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "iZop",
  },
};

export const viewport: Viewport = {
  themeColor: "#7C3AED",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
      <body className="antialiased min-h-screen min-h-dvh">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('izop-theme')||localStorage.getItem('agent4socials-theme');if(t!=='dark'&&t!=='light')t='dark';document.documentElement.setAttribute('data-theme',t);})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=window.location.pathname,h=window.location.hash;if(p==='/'&&h&&h.indexOf('access_token')!==-1){window.location.replace('/auth/callback'+h);}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var key='chunk_reload';window.addEventListener('error',function(e){var msg=(e.message||'');var isChunk=/Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed/i.test(msg)||(e.filename||'').indexOf('_next/static/chunks')!==-1;if(isChunk&&!sessionStorage.getItem(key)){sessionStorage.setItem(key,'1');window.location.reload();}});})();`,
          }}
        />
        <AuthProvider>
          <ThemeProvider>
          <AccountsCacheProvider>
            <SelectedAccountProvider>
            <BrandAccountMoveHost />
            <AppDataProvider>
            <AuthModalProvider>
              <WhiteLabelProvider>
                {children}
              <Analytics />
              <AuthModalOpener />
              <AuthModal />
              </WhiteLabelProvider>
            </AuthModalProvider>
            </AppDataProvider>
            </SelectedAccountProvider>
          </AccountsCacheProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
