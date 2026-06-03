import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

export type LinkedInOAuthStartStep = 'identify' | 'consent';

export async function startLinkedInConnectAfterConsent(
  previewId: string,
  returnTo: string
): Promise<{ ok: true; redirect: string } | { ok: false; message: string }> {
  try {
    const supabase = getSupabaseBrowser();
    const { data: sessionData } = await supabase.auth.getSession();
    const bearer = sessionData.session?.access_token ?? '';
    const startRes = await fetch('/api/social/linkedin/consent-allow', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ previewId, returnTo }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await startRes.json().catch(() => ({}))) as { redirect?: string; message?: string };
    if (!startRes.ok) {
      return { ok: false, message: data?.message ?? 'Could not connect LinkedIn.' };
    }
    const redirect = data?.redirect;
    if (redirect && typeof redirect === 'string') {
      return { ok: true, redirect };
    }
    return { ok: false, message: 'Invalid response from server.' };
  } catch (err: unknown) {
    const aborted =
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError');
    if (aborted) {
      return { ok: false, message: 'Request timed out. Try again.' };
    }
    return { ok: false, message: 'Network error. Try again.' };
  }
}

export async function startLinkedInOAuth(
  method: LinkedInConnectMethod,
  options?: { step?: LinkedInOAuthStartStep }
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    const supabase = getSupabaseBrowser();
    const { data: sessionData } = await supabase.auth.getSession();
    const bearer = sessionData.session?.access_token ?? '';
    const params = new URLSearchParams({ method, step: options?.step ?? 'consent' });
    const qs = `?${params.toString()}`;
    const startRes = await fetch(`/api/social/oauth/linkedin/start${qs}`, {
      headers: { Authorization: `Bearer ${bearer}` },
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await startRes.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!startRes.ok) {
      return { ok: false, message: data?.message ?? 'Could not start LinkedIn sign-in.' };
    }
    const url = data?.url;
    if (url && typeof url === 'string') {
      return { ok: true, url };
    }
    return { ok: false, message: 'Invalid response from server.' };
  } catch (err: unknown) {
    const aborted =
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError');
    if (aborted) {
      return { ok: false, message: 'Request timed out. Try again.' };
    }
    return { ok: false, message: 'Network error. Try again.' };
  }
}
