import type { Metadata } from 'next';
import { FontPreviewCatalog } from '@/components/fonts/FontPreviewCatalog';

export const metadata: Metadata = {
  title: 'Font preview (temporary)',
  robots: { index: false, follow: false },
};

export default function FontPreviewPage() {
  return <FontPreviewCatalog />;
}
