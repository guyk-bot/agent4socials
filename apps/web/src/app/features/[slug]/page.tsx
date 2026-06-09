import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FeatureDetailView from '@/components/landing/FeatureDetailView';
import {
  FUNNEL_FEATURE_PAGES,
  getFunnelFeaturePage,
} from '@/lib/funnel-feature-pages';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FUNNEL_FEATURE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getFunnelFeaturePage(slug);
  if (!page) return {};
  return {
    title: `${page.title} | iZop`,
    description: page.tagline,
  };
}

export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  const page = getFunnelFeaturePage(slug);
  if (!page) notFound();
  return <FeatureDetailView page={page} />;
}
