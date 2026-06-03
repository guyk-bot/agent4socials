import { redirect } from 'next/navigation';

/** Legacy preview URL: redirect to the full-page consent route. */
export default async function LinkedInConsentPreviewRedirect({
  searchParams,
}: {
  searchParams: Promise<{ method?: string }>;
}) {
  const params = await searchParams;
  const method = params.method === 'personal' ? 'personal' : 'page';
  redirect(
    `/connect/linkedin/consent?method=${method}&returnTo=${encodeURIComponent('/dashboard?connect=LINKEDIN')}`
  );
}
