# Agent4Socials — compact codebase index

**Full feature-by-feature map:** `../.cursor/PROJECT_MAP.md` (canonical; inbox, OAuth, analytics narrative).

This file is a **short structural index** for agents who need route lists and one-glance “where to edit” without re-scanning the tree.

---

## Monorepo layout

| Path | Role |
|------|------|
| `package.json` | Workspaces: `apps/*`. Scripts: `dev:web`, `build:web`, Prisma via `api` workspace. |
| `apps/web/` | **Primary app**: Next.js UI, `src/app/api/*` route handlers, Prisma schema at `apps/web/prisma/schema.prisma`. |
| `apps/api/` | NestJS: `auth`, `posts` (scheduler/processor), `social`, `media`, `users`. Prisma at `apps/api/prisma/schema.prisma`. |
| `docs/` | Runbooks, Meta/TikTok/Pinterest setup, analytics audits, **this map**. |
| `scripts/` | Shell/JS/Python helpers (Vercel workflow, Meta tests, X DMs experiment). |
| `.cursor/` | Cursor project config (if present). |

**Scale:** ~250 TS/TSX files under `apps/web/src` (not counting `node_modules`).

---

## `apps/web` — app routes (`src/app`)

| Area | Path pattern | Notes |
|------|----------------|-------|
| Landing / marketing | `page.tsx`, `pricing/`, `terms/`, `privacy/`, `help/` | |
| Auth | `(auth)/login`, `(auth)/signup` | |
| Dashboard hub | `dashboard/page.tsx` | Analytics tabs, account selection, `FacebookAnalyticsView`, posts/insights fetch. |
| Dashboard subpages | `dashboard/accounts/`, `dashboard/inbox/`, `dashboard/analytics/`, `dashboard/summary/`, `dashboard/smart-links/`, `dashboard/automation/`, `settings/` | |
| Composer / calendar | `composer/`, `calendar/` | |
| Posts | `posts/`, `post/[id]/open/` | |
| Public profile | `[username]/` | |
| Reel tools | `reel-analyzer/` | Uses `src/lib/reel-analysis/*`. |
| Account linking UX | `accounts/`, `accounts/facebook/select/`, `accounts/instagram/select/` | |

---

## `apps/web` — API routes (`src/app/api`)

Grouped by domain (67 `route.ts` files). **Social + analytics fixes usually touch the first two blocks.**

### Social accounts & Meta

- `social/accounts/route.ts`, `social/accounts/[id]/route.ts` — CRUD / account record.
- **`social/accounts/[id]/posts/route.ts`** — Imported post sync (Facebook, **Instagram** media+tags, Pinterest, etc.), serialization, live insight refresh.
- **`social/accounts/[id]/insights/route.ts`** — Account-level insights (FB Page bundle, **IG** impressions series, demographics `extended=1`).
- `social/accounts/[id]/engagement/route.ts`, `comments/*`, `conversations/*`, `page-reviews/route.ts`.
- Debug: `facebook-graph-debug`, `instagram-graph-debug`, `facebook-analytics-debug`, `token-debug`, `pinterest-debug`, `x-dm-debug`.

### OAuth

- `social/oauth/[platform]/start|callback` — Platform connects.
- `social/oauth/twitter-1oa/*` — Twitter 1.0a.
- `social/facebook/connect-page`, `social/instagram/*` — Link flows.

### Posts & publishing

- `posts/route.ts`, `posts/[id]/route.ts`, `posts/[id]/publish/route.ts`, `posts/[id]/open/route.ts`.

### Media & images

- `media/upload-url`, `media/serve`, `media/proxy`, `post-image`, `proxy-image`, `favicon`.

### Analytics (extra endpoints)

- `analytics/youtube/*`, `analytics/instagram/audience-by-country`.

### Automation & cron

- `automation/*`, `cron/*` (scheduled posts, metric snapshots, comment automation, migrations, email).

### Auth & user

- `auth/*`, `create-profile`, `user/*`, `ai/*`, `reels/*`, `smart-links/*`, `support`, `debug/*`, `env-check`.

---

## `apps/web` — libraries (`src/lib`)

| Folder | Purpose |
|--------|---------|
| **`lib/facebook/*`** | Page fetchers, insights persistence, `frontend-analytics-bundle.ts`, sync extras, resilient insights. |
| **`lib/analytics/*`** | Metric snapshots, extended fetchers (`fetchInstagramDemographics`), breakdown Zod/types, YouTube/IG providers. |
| `lib/meta-graph-insights.ts` | Graph API version + `facebookGraphBaseUrl` (used across FB/IG). |
| `lib/facebook/constants.ts` | `fbRestBaseUrl` (same version as insights). |
| `lib/pinterest-*` | Pinterest tokens + analytics bundle. |
| `lib/youtube-token.ts`, `get-prisma-user.ts`, `db.ts` | Tokens, Prisma client, auth user resolution. |
| `lib/reel-analysis/*` | Reel analyzer scoring/prompts. |
| `lib/supabase/*` | Supabase server/client. |
| `lib/publish-target.ts` | Publishing helpers. |

---

## `apps/web` — components (`src/components`)

| Folder | Purpose |
|--------|---------|
| **`components/analytics/facebook/*`** | **`FacebookAnalyticsView.tsx`** (main dashboard charts), `types.ts`, tabs (`FacebookOverviewTab`, `FacebookPostsTab`, …). |
| `components/analytics/*` | Shared charts, KPI cards, upgrade gates, `AnalyticsGrid`, watermarked charts. |
| `components/dashboard/*` | Summary dashboard, connect view, platform breakdown. |
| `components/charts/*` | Recharts wrappers. |
| `Sidebar.tsx`, `AuthenticatedShell.tsx`, `composer` pieces, `landing/*`, `auth/*` | Shell and marketing. |

---

## Data model

- **Prisma (web):** `apps/web/prisma/schema.prisma` — `SocialAccount`, `ImportedPost`, `Post`, `PostTarget`, Facebook cache tables, etc.
- **Prisma (api):** `apps/api/prisma/schema.prisma` — keep in sync with deployment story (root scripts point migrations at `api` workspace).

---

## Docs worth opening for specific tasks

| Task | Doc |
|------|-----|
| Instagram / Graph debugging | `docs/INSTAGRAM_DEBUG_GUIDE.md` |
| Facebook analytics shape | `docs/FACEBOOK_ANALYTICS_CAPABILITY_MAP.md`, `FACEBOOK_ANALYTICS_IMPLEMENTATION_REPORT.md` |
| Metric history / snapshots | `docs/METRIC_SNAPSHOTS_AND_HISTORY.md`, `DEPLOY_METRIC_SNAPSHOTS.md` |
| Meta scopes / app review | `docs/META_SCOPES_AUDIT.md`, `RUN_META_APP_REVIEW_TESTS.md` |
| Migrations | `docs/DATABASE_MIGRATIONS.md` |

---

## Quick “where do I change X?”

| Goal | Start here |
|------|------------|
| IG/FB post list, sync, thumbnails, per-post insights JSON | `apps/web/src/app/api/social/accounts/[id]/posts/route.ts` |
| Account-level impressions, IG 28-day window, `pageViewsTimeSeries` | `apps/web/src/app/api/social/accounts/[id]/insights/route.ts` |
| Dashboard charts, IG synthetic `facebookAnalytics` bundle | `apps/web/src/components/analytics/facebook/FacebookAnalyticsView.tsx` + `lib/facebook/frontend-analytics-bundle.ts` |
| Insights types for UI | `apps/web/src/components/analytics/facebook/types.ts` |
| Fetch posts + insights on dashboard | `apps/web/src/app/dashboard/page.tsx` (state, `api.get` to `/social/accounts/:id/posts` and `/insights`) |
| OAuth / connect | `apps/web/src/app/api/social/oauth/*`, `Sidebar` / `ConnectView` |
| Scheduled publishing | `apps/api` posts processor/scheduler + `apps/web` cron routes |

---

## Efficiency tips for AI / future sessions

1. **Do not search the whole repo** for API changes: start with `apps/web/src/app/api/social/accounts/[id]/` and `components/analytics/facebook/`.
2. **Instagram vs Facebook:** IG logic is split between **`posts/route.ts`** (media + media insights) and **`insights/route.ts`** (account insights); UI glue is **`FacebookAnalyticsView.tsx`**.
3. **Two Prisma schemas:** confirm which app your deployment uses before migrations.
4. **This map** lives at `docs/CODEBASE_MAP.md` — update it when you add a major feature area or move API routes.
