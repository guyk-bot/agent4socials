/**
 * Vercel build: prisma generate → migrate deploy → next build.
 *
 * Supabase often breaks prisma migrate deploy when DATABASE_DIRECT_URL uses the wrong
 * pooler user (FATAL: Tenant or user not found). On Vercel we continue the build by
 * default so deploys succeed; fix DATABASE_DIRECT_URL and set STRICT_PRISMA_MIGRATE_ON_VERCEL=1
 * to require migrations. Locally, migrate failure fails the build unless SKIP_PRISMA_MIGRATE_ON_VERCEL=1.
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');

const isVercel = Boolean(process.env.VERCEL);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: appRoot, env: process.env });
  return r.status ?? 1;
}

let code = run('npx', ['prisma', 'generate']);
if (code !== 0) process.exit(code);

code = run('npx', ['prisma', 'migrate', 'deploy']);
if (code !== 0) {
  console.error(
    '\n[build] prisma migrate deploy failed. Supabase: set DATABASE_DIRECT_URL in Vercel to the URI from ' +
      'Dashboard → Settings → Database → Connection string → Session pooler or Direct (correct username, often postgres.PROJECTREF). ' +
      'See apps/web/MIGRATE.md.\n'
  );

  const strict = process.env.STRICT_PRISMA_MIGRATE_ON_VERCEL === '1';
  const skipExplicit = process.env.SKIP_PRISMA_MIGRATE_ON_VERCEL === '1';

  if (strict) {
    console.error('[build] STRICT_PRISMA_MIGRATE_ON_VERCEL=1: failing build because migrate did not succeed.\n');
    process.exit(code);
  }

  if (isVercel || skipExplicit) {
    console.warn(
      '[build] Continuing without successful migrations. Apply pending changes in Supabase SQL or fix DATABASE_DIRECT_URL. ' +
        'When migrate works, set STRICT_PRISMA_MIGRATE_ON_VERCEL=1 in Vercel to fail the build if migrate ever breaks again.\n'
    );
  } else {
    console.error(
      '[build] Local build: fix the DB URL or run SKIP_PRISMA_MIGRATE_ON_VERCEL=1 for one-off builds.\n'
    );
    process.exit(code);
  }
}

process.exit(run('npx', ['next', 'build']));
