import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Signing in – Agent4Socials',
  robots: { index: false, follow: false },
};

export default function AuthCallbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
