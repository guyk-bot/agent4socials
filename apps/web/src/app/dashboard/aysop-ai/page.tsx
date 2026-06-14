import { redirect } from 'next/navigation';
import { IZOP_AI_DASHBOARD_PATH } from '@/lib/site-brand-assets';

/** Legacy route: keep bookmarks and funnel redirects working. */
export default async function LegacyAysopAiRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const c = sp.c;
  const chatId = typeof c === 'string' ? c : Array.isArray(c) ? c[0] : undefined;
  redirect(chatId ? `${IZOP_AI_DASHBOARD_PATH}?c=${encodeURIComponent(chatId)}` : IZOP_AI_DASHBOARD_PATH);
}
