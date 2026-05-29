/**
 * Map known "schema ahead of database" Prisma errors to a short operator message.
 * (Vercel builds can skip migrate when DATABASE_DIRECT_URL is wrong; see MIGRATE.md.)
 */
export function friendlyMessageIfPrismaSchemaDrift(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('linkedInPublishByAccountId') && msg.includes('does not exist')) {
    return (
      'Database is missing the LinkedIn publish settings column. In Supabase: SQL Editor → run ' +
      'apps/web/prisma/migrations/20260529180000_post_linkedin_publish_settings/migration.sql, then redeploy.'
    );
  }
  if (msg.includes('tiktokPublishByAccountId') && msg.includes('does not exist')) {
    return (
      'Database is missing the TikTok post settings column. In Supabase: SQL Editor → run the script ' +
      'apps/web/scripts/ensure-post-tiktok-publish-column.sql. Then set DATABASE_DIRECT_URL on Vercel and redeploy ' +
      'so migrations apply. Details: apps/web/MIGRATE.md (section: tiktokPublishByAccountId).'
    );
  }
  if (msg.includes('threadsShareToInstagram') && msg.includes('does not exist')) {
    return (
      'Database is missing the Threads share column. In Supabase: SQL Editor → run ' +
      'apps/web/scripts/ensure-post-threads-share-to-instagram-column.sql, then redeploy.'
    );
  }
  if (msg.includes('alsoPostToStory') && msg.includes('does not exist')) {
    return (
      'Database is missing the alsoPostToStory column. In Supabase: SQL Editor → run ' +
      'apps/web/scripts/ensure-post-also-post-to-story-column.sql, or POST /api/admin/apply-pending-migrations with X-Cron-Secret.'
    );
  }
  return null;
}
