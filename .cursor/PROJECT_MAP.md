# Agent4Socials – Project map

Use this map to go straight to the right files. Prefer **targeted reads** and **grep** in these paths over broad codebase search.

## Repo layout

- **apps/web** – Next.js frontend (App Router) + Prisma
- **apps/api** – NestJS backend (Vercel serverless)
- **docs/** – FAVICON.md, etc.

---

## Web app – by feature

### Dashboard & connect

| What | Where |
|------|--------|
| Dashboard home, sidebar, connect/disconnect | `apps/web/src/app/dashboard/page.tsx` |
| Connect flow UI (per-platform) | `apps/web/src/components/dashboard/ConnectView.tsx` |
| Branded full-page loader (logo loading video) for account select screens | `apps/web/src/components/BrandedPageLoader.tsx` (`public/logo-loading-page.mp4`) |
| Sidebar | `apps/web/src/components/Sidebar.tsx` |
| App header (nav, logo) | `apps/web/src/components/AppHeader.tsx` |
| Funnel / landing wordmark + header mark | `BrandWordmark.tsx` (`HeroHeadlineMultiplierX` hero only); `SiteHeader` / `SiteFooter` use `/favicon.svg` (vector mark; `logo.svg` is separate full asset) |

### Inbox (DMs, comments)

| What | Where |
|------|--------|
| Inbox page, conversations, messages | `apps/web/src/app/dashboard/inbox/page.tsx` |
| X DM debug API | `apps/web/src/app/api/social/accounts/[id]/x-dm-debug/route.ts` |
| Facebook Graph raw JSON debug (read_insights, page, posts, etc.) | `apps/web/src/app/api/social/accounts/[id]/facebook-graph-debug/route.ts` |
| Facebook analytics debug (discovery lists, stored row counts, gaps) | `apps/web/src/app/api/social/accounts/[id]/facebook-analytics-debug/route.ts` |
| Conversations list API | `apps/web/src/app/api/social/accounts/[id]/conversations/route.ts` |
| Messages in conversation | `apps/web/src/app/api/social/accounts/[id]/conversations/[conversationId]/messages/route.ts` |
| Comments / reply / delete | `apps/web/src/app/api/social/accounts/[id]/comments/route.ts`, `comments/reply/`, `comments/delete/` |
| Inbox engagement tab | `apps/web/src/app/api/social/accounts/[id]/engagement/route.ts` |
| Inbox read state | `apps/web/src/lib/inbox-read-state.ts` |
| Accounts cache (refresh after disconnect) | `apps/web/src/context/AccountsCacheContext.tsx` |

### Composer & posts

| What | Where |
|------|--------|
| Composer UI | `apps/web/src/app/composer/page.tsx` |
| Posts API (CRUD, publish) | `apps/web/src/app/api/posts/route.ts`, `posts/[id]/route.ts`, `posts/[id]/publish/route.ts` |
| Publish target logic | `apps/web/src/lib/publish-target.ts` |

### Analytics & summary

| What | Where |
|------|--------|
| Summary dashboard | `apps/web/src/app/dashboard/summary/page.tsx` |
| Summary UI components | `apps/web/src/components/dashboard/summary/` (SummaryDashboard, KPICardsGrid, GrowthChartTabs, etc.) |
| Insights API | `apps/web/src/app/api/social/accounts/[id]/insights/route.ts` |
| Meta Graph: single version for Page REST + insights + OAuth dialog (default v22; env `META_GRAPH_API_VERSION`) | `apps/web/src/lib/meta-graph-insights.ts` (`facebookGraphBaseUrl`) |
| Facebook analytics (discovery, resilient insights, fetchers, frontend bundle) | `apps/web/src/lib/facebook/` (`discovery-db.ts` gates cache if `FacebookMetricDiscovery` missing) |
| Facebook capability map / implementation report | `docs/FACEBOOK_ANALYTICS_CAPABILITY_MAP.md`, `docs/FACEBOOK_ANALYTICS_IMPLEMENTATION_REPORT.md` |
| Facebook live JSON audit (notifications invalid, insights comma-list, version mix) | `docs/FACEBOOK_JSON_AUDIT_REPORT.md` |
| Facebook pipeline validation script (page insights DB, post insights, comments/reactions; needs `DATABASE_URL`) | `apps/web/scripts/facebook-pipeline-validation.ts`, `docs/FACEBOOK_PIPELINE_VALIDATION.md` (`npm run validate:facebook-pipeline` in `apps/web`) |
| Facebook **storage evidence** (DB rows, optional `storageProof=1` upsert readback) | `GET .../facebook-storage-evidence`, `docs/FACEBOOK_STORAGE_EVIDENCE.md` |
| Facebook Page/profile + conversations + reviews DB cache (sync with posts) | `apps/web/src/lib/facebook/sync-extras.ts`, Prisma `FacebookPageCache`, `FacebookConversationCache`, `FacebookReviewCache` |
| Analytics types & fetchers | `apps/web/src/types/analytics.ts`, `apps/web/src/lib/analytics/extended-fetchers.ts` |
| **Follower/following history (IG & FB only)** | `apps/web/src/lib/analytics/metric-snapshots.ts` – snapshots, bootstrap, getAccountHistorySeries; insights route injects series; **YouTube excluded** |
| **Daily metric snapshot cron** | `apps/web/src/app/api/cron/metric-snapshots/route.ts` (X-Cron-Secret); see `docs/METRIC_SNAPSHOTS_AND_HISTORY.md` |

### Auth & layout

| What | Where |
|------|--------|
| Root layout, metadata, favicon | `apps/web/src/app/layout.tsx` |
| Auth context | `apps/web/src/context/AuthContext.tsx` |
| Auth modal / login | `apps/web/src/components/auth/AuthModal.tsx`, `AuthModalOpener.tsx` |
| Login/signup pages | `apps/web/src/app/(auth)/login/page.tsx`, `(auth)/signup/page.tsx` |
| Auth callback | `apps/web/src/app/auth/callback/route.ts` |
| Middleware | `apps/web/src/middleware.ts` |

### OAuth & social accounts

| What | Where |
|------|--------|
| OAuth start/callback (generic) | `apps/web/src/app/api/social/oauth/[platform]/start/route.ts`, `callback/route.ts` (includes Pinterest v5) |
| Pinterest token refresh | `apps/web/src/lib/pinterest-token.ts` |
| Pinterest setup doc | `docs/PINTEREST_SETUP.md` |
| Twitter 1OA | `apps/web/src/app/api/social/oauth/twitter-1oa/start/route.ts`, `callback/route.ts` |
| Instagram connect | `apps/web/src/app/api/social/instagram/connect-account/route.ts`, `pending/route.ts` |
| Facebook connect | `apps/web/src/app/api/social/facebook/connect-page/route.ts`, `pending/route.ts` |
| Accounts list (connected only) / soft disconnect | `apps/web/src/app/api/social/accounts/route.ts`, `accounts/[id]/route.ts` – disconnect sets status + disconnectedAt; firstConnectedAt preserved for IG/FB history |

### Other pages & API

| What | Where |
|------|--------|
| Landing | `apps/web/src/app/page.tsx` |
| Help / knowledge base | `apps/web/src/app/help/page.tsx` |
| Reel Analyzer | `apps/web/src/app/reel-analyzer/page.tsx`, `apps/web/src/components/ReelAnalyzer.tsx`, `apps/web/src/lib/reel-analysis/` |
| Smart links | `apps/web/src/app/dashboard/smart-links/page.tsx`, `apps/web/src/app/api/smart-links/route.ts`, `apps/web/src/components/smart-links/` |
| Link-in-bio page | `apps/web/src/app/[username]/page.tsx`, `apps/web/src/components/smart-links/LinkPageRenderer.tsx` |
| Automation | `apps/web/src/app/dashboard/automation/page.tsx`, `apps/web/src/app/api/automation/` |
| AI (brand, reply, description) | `apps/web/src/app/api/ai/` |
| Cron jobs | `apps/web/src/app/api/cron/` (process-scheduled, metric-snapshots, etc.) |
| White-label (logo, colors) | `apps/web/src/context/WhiteLabelContext.tsx`, `apps/web/src/app/dashboard/settings/page.tsx` |

### Config & assets

| What | Where |
|------|--------|
| Next config, rewrites | `apps/web/next.config.ts` |
| Env / site URL | `apps/web/src/app/layout.tsx` (metadataBase, siteUrl) |
| Logo, favicon | `apps/web/public/logo.svg`, `logo-48.png`, `logo-192.png`; `docs/FAVICON.md` |
| Manifest | `apps/web/public/manifest.json` |
| Platform icons | `apps/web/src/components/SocialPlatformIcons.tsx` (`public/social-icons/pinterest.svg`) |

---

## Backend (Nest API)

- Entry: `apps/api/src/main.ts`, `apps/api/api/[[...path]].js`
- Auth: `apps/api/src/auth/`
- Social (OAuth, services): `apps/api/src/social/`
- Prisma (shared or API): `apps/api/prisma/` (if used)

---

## How to use this map

1. **Before a task:** Decide which feature area applies (e.g. Inbox, Connect, Composer).
2. **Open only those paths:** Use the table to get exact file paths; use `read_file` on 1–3 files first.
3. **Search narrowly:** Use `grep` in the relevant dir (e.g. `apps/web/src/app/dashboard/inbox/`) instead of repo-wide search.
4. **Use broad search only when:** The task spans multiple areas or isn’t listed above.
