import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support ticket | Agent4Socials',
  description: 'Submit a support ticket. We\'ll get back to you at your account email.',
};

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
