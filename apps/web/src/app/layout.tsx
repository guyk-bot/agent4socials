import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { WhiteLabelProvider } from "@/context/WhiteLabelContext";

export const metadata: Metadata = {
  title: "Agent4Socials | Schedule, Analyze & Grow on Instagram, YouTube & TikTok",
  description: "One dashboard to schedule posts, track analytics, and use AI to find the best times to post and write captions. From $2.99/mo.",
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <WhiteLabelProvider>
            {children}
          </WhiteLabelProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
