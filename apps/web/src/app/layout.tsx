import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { WhiteLabelProvider } from "@/context/WhiteLabelContext";

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

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "Agent4Socials | Schedule Posts & Analytics for Instagram, YouTube, TikTok, Facebook, Twitter & LinkedIn",
    template: "%s | Agent4Socials",
  },
  description: "Schedule posts and get analytics across Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn. 7-day free trial. From $2.99/mo.",
  keywords: ["social media scheduler", "schedule Instagram posts", "schedule TikTok", "social media analytics", "post scheduler", "Instagram analytics", "TikTok scheduler", "Facebook scheduler", "LinkedIn scheduler"],
  authors: [{ name: "Agent4Socials" }],
  creator: "Agent4Socials",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Agent4Socials",
    title: "Agent4Socials | Schedule Posts & Analytics for All Major Social Platforms",
    description: "Schedule posts and get analytics across Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn. 7-day free trial.",
    images: [{ url: "/logo.svg", width: 512, height: 512, alt: "Agent4Socials" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent4Socials | Schedule Posts & Analytics",
    description: "One dashboard for scheduling and analytics. 7-day free trial.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=window.location.pathname,h=window.location.hash;if(p==='/'&&h&&h.indexOf('access_token')!==-1){window.location.replace('/auth/callback'+h);}})();`,
          }}
        />
        <AuthProvider>
          <WhiteLabelProvider>
            {children}
          </WhiteLabelProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
