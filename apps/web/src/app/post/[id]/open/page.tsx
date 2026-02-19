import { Metadata } from 'next';
import Link from 'next/link';
import { getPostForOpen } from '@/lib/post-open';
import PostOpenClient from './PostOpenClient';

const baseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { t } = await searchParams;
  if (!t?.trim()) return {};
  const data = await getPostForOpen(id, t);
  if (!data) return {};
  const desc = data.bestDescription || data.content || 'Scheduled post from Agent4Socials';
  const title = desc.slice(0, 60) + (desc.length > 60 ? '…' : '') || 'Your post';
  const images = data.allImageUrls.length > 0
    ? data.allImageUrls.map((url) => ({ url }))
    : data.firstImageUrl ? [{ url: data.firstImageUrl }] : [];
  return {
    title: title || 'Your post',
    description: desc.slice(0, 200) || 'Scheduled post from Agent4Socials',
    openGraph: {
      title: title || 'Your post',
      description: desc.slice(0, 200) || 'Scheduled post from Agent4Socials',
      ...(images.length > 0 ? { images } : {}),
    },
    twitter: {
      card: images.length > 0 ? 'summary_large_image' : 'summary',
      title: title || 'Your post',
      description: desc.slice(0, 200) || 'Scheduled post from Agent4Socials',
      ...(images.length > 0 ? { images } : {}),
    },
  };
}

function ExpiredLink() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center">
        <p className="text-neutral-600">Link expired or invalid</p>
        <Link href="/" className="mt-4 inline-block text-indigo-600 font-medium">Go to Agent4Socials</Link>
      </div>
    </div>
  );
}

export default async function PostOpenPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!id || !t?.trim()) {
    return <ExpiredLink />;
  }
  const data = await getPostForOpen(id, t);
  if (!data) {
    return <ExpiredLink />;
  }
  const url = baseUrl();
  const pageUrl = `${url}/post/${id}/open?t=${encodeURIComponent(t)}`;
  return <PostOpenClient data={data} baseUrl={url} pageUrl={pageUrl} />;
}
