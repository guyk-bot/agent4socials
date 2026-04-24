import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { AuthModalProvider } from "@/context/AuthModalContext";
import { WhiteLabelProvider } from "@/context/WhiteLabelContext";
import { AccountsCacheProvider } from "@/context/AccountsCacheContext";
import { SelectedAccountProvider } from "@/context/SelectedAccountContext";
import { AppDataProvider } from "@/context/AppDataContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AuthModal from "@/components/auth/AuthModal";
import AuthModalOpener from "@/components/auth/AuthModalOpener";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

function getMetadataBase(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://agent4socials.com");
  } catch {
    return new URL("https://agent4socials.com");
  }
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agent4socials.com";

// Organization JSON-LD so Google can show the correct logo in search results (favicon + optional Knowledge Panel).
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Agent4Socials",
  url: siteUrl,
  logo: {
    "@type": "ImageObject",
    url: `${siteUrl.replace(/\/+$/, "")}/logo-192.png`,
    width: 192,
    height: 192,
  },
};

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "Agent4Socials | Schedule Posts & Analytics for Instagram, YouTube, TikTok, Facebook, Twitter & LinkedIn",
    template: "%s | Agent4Socials",
  },
  description: "Schedule posts and get analytics across Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn. Try for free. From $15/mo.",
  keywords: ["social media scheduler", "schedule Instagram posts", "schedule TikTok", "social media analytics", "post scheduler", "Instagram analytics", "TikTok scheduler", "Facebook scheduler", "LinkedIn scheduler"],
  authors: [{ name: "Agent4Socials" }],
  creator: "Agent4Socials",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Agent4Socials",
    title: "Agent4Socials | Schedule Posts & Analytics for All Major Social Platforms",
    description: "Schedule posts and get analytics across Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn. Try for free.",
    images: [{ url: "/logo-192.png", width: 192, height: 192, alt: "Agent4Socials" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent4Socials | Schedule Posts & Analytics",
    description: "One dashboard for scheduling and analytics. Try for free.",
    images: ["/logo-192.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  // Tab favicon only (browser tab / Google): use favicon.svg. Header and footer logos are unchanged (logo.svg, etc.).
  icons: {
    icon: [
      { url: "/favicon.svg?v=10", type: "image/svg+xml" },
      { url: "/favicon-48.png?v=10", sizes: "48x48", type: "image/png" },
      { url: "/favicon.ico?v=10", sizes: "any", type: "image/x-icon" },
    ],
    apple: [{ url: "/favicon-192.png?v=10", sizes: "192x192", type: "image/png" }],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Agent4Socials",
  },
};

export const viewport: Viewport = {
  themeColor: "#22FF88",
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
            __html: `(function(){var t=localStorage.getItem('agent4socials-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);})();`,
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
