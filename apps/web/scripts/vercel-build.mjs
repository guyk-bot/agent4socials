/**
 * Vercel build: prisma generate → migrate deploy → next build.
 * If migrate fails (e.g. Supabase "Tenant or user not found" on pooler), set
 * SKIP_PRISMA_MIGRATE_ON_VERCEL=1 in Vercel to ship the build, then fix
 * DATABASE_DIRECT_URL or run SQL migrations manually (see apps/web/MIGRATE.md).
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: appRoot, env: process.env });
  return r.status ?? 1;
}

let code = run('npx', ['prisma', 'generate']);
if (code !== 0) process.exit(code);

code = run('npx', ['prisma', 'migrate', 'deploy']);
if (code !== 0) {
  console.error(
    '\n[build] prisma migrate deploy failed. Common fix (Supabase): set DATABASE_DIRECT_URL in Vercel to the URI from ' +
      'Dashboard → Settings → Database → Connection string → Session mode (or Direct), usually port 5432 with the user format they show. ' +
      'Do not use the Transaction pooler (6543) string as DATABASE_DIRECT_URL. See apps/web/MIGRATE.md.\n'
  );
  if (process.env.SKIP_PRISMA_MIGRATE_ON_VERCEL === '1') {
    console.warn(
      '[build] SKIP_PRISMA_MIGRATE_ON_VERCEL=1: continuing without migrations. Apply pending migrations via SQL or a local prisma migrate deploy with a working direct URL.\n'
    );
  } else {
    console.error(
      '[build] To deploy anyway (not recommended long term), set SKIP_PRISMA_MIGRATE_ON_VERCEL=1 in Vercel Environment Variables.\n'
    );
    process.exit(code);
  }
}

process.exit(run('npx', ['next', 'build']));
