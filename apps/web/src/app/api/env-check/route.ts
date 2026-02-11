import { NextResponse } from 'next/server';

/**
 * Returns which env vars the running deployment can see (booleans only, no values).
 * Use: curl https://agent4socials.com/api/env-check
 * (In-browser may redirect if you have Vercel Deployment Protection / auth.)
 */
export async function GET() {
  const vars = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL?.trim()),
    META_APP_ID: Boolean(process.env.META_APP_ID?.trim()),
    META_APP_SECRET: Boolean(process.env.META_APP_SECRET?.trim()),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
  };
  const ok = vars.DATABASE_URL && vars.META_APP_ID && vars.META_APP_SECRET;
  return NextResponse.json({ ok, vars }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
