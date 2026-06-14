import type { Metadata, Viewport } from "next";
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
import { ProductAnalyticsBootstrap } from "@/components/ProductAnalyticsBootstrap";
import { siteTabIcons } from "@/lib/site-tab-icons";
import { SITE_LOGO_V } from "@/lib/site-brand-assets";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

const siteUrl = resolveAppBaseUrl();

function getMetadataBase(): URL {
  try {
    return new URL(resolveAppBaseUrl());
  } catch {
    return new URL("https://www.izop.ai");
  }
}

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
    default: "iZop AI | Your Personal AI Social Media Manager.",
    template: "%s | iZop",
  },
  description:
    "Stop managing social media. Start talking to it. iZop AI schedules posts, replies to comments, extracts leads and pulls analytics. Free plan.",
  keywords: ["social media scheduler", "schedule Instagram posts", "schedule TikTok", "social media analytics", "post scheduler", "Instagram analytics", "TikTok scheduler", "Facebook scheduler", "LinkedIn scheduler"],
  authors: [{ name: "iZop" }],
  creator: "iZop",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "iZop",
    title: "iZop AI | Your Personal AI Social Media Manager.",
    description:
      "Stop managing social media. Start talking to it. iZop AI schedules posts, replies to comments, extracts leads and pulls analytics. Free plan.",
    images: [{ url: `/logo-192.png?v=${SITE_LOGO_V}`, width: 192, height: 192, alt: "iZop" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "iZop AI | Your Personal AI Social Media Manager.",
    description:
      "Stop managing social media. Start talking to it. iZop AI schedules posts, replies to comments, extracts leads and pulls analytics. Free plan.",
    images: [`/logo-192.png?v=${SITE_LOGO_V}`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  // Tab favicon: squircle PNGs (SITE_TAB_FAVICON_V). JSON-LD / Google logo: logo-192 (circle export).
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen min-h-dvh">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=localStorage.getItem('agent4socials-theme');if(p!=='dark'&&p!=='light'&&p!=='auto')p='light';var applied=p;if(p==='auto'){var h=new Date().getHours();applied=(h>=6&&h<18)?'light':'dark';}document.documentElement.setAttribute('data-theme',applied);})();`,
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
              <ProductAnalyticsBootstrap />
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
