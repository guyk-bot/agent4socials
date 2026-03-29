import type { Metadata } from 'next';
import AuthenticatedShell from '@/components/AuthenticatedShell';

export const metadata: Metadata = {
  title: 'Help & Knowledge Base | Agent4Socials',
  description: 'Connect Facebook, Instagram, TikTok, YouTube, X (Twitter), and LinkedIn. Learn analytics limitations, inbox rules, Reel Analyzer, Composer, and get support.',
  openGraph: {
    title: 'Help & Knowledge Base | Agent4Socials',
    description: 'Guides for connecting accounts, platform limitations, analytics, inbox, and support.',
  },
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
