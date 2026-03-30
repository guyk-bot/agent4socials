# Agent4Socials – Project map

**Read this first.** The repo is large; do not repo-wide search until this map fails you. Companion: **`docs/CODEBASE_MAP.md`** — compact API-route index + “where do I change X?” table.

Use this map to go straight to the right files. Prefer **targeted reads** and **grep** in these paths over broad codebase search.

1. **Pick the row** in [Task → files](#task--files-first) or the feature table below.
2. **Open 1–3 paths** with `read_file`; **grep** only inside that folder (e.g. `apps/web/src/app/composer`).
3. **Update this file** when you add a user-facing feature or a new important API surface.

---

## Task → files (first)

| Task | Primary files |
|------|----------------|
| Composer UI, previews, AI modal, media | `apps/web/src/app/composer/page.tsx` |
| Publish to platforms (incl. Pinterest) | `apps/web/src/lib/publish-target.ts`, `apps/web/src/app/api/posts/[id]/publish/route.ts` |
| Imported posts list, sync, Pinterest thumbnails | `apps/web/src/app/api/social/accounts/[id]/posts/route.ts` |
| Insights JSON for dashboard | `apps/web/src/app/api/social/accounts/[id]/insights/route.ts` |
| Facebook / IG analytics UI (posts table, reels, charts) | `apps/web/src/components/analytics/facebook/FacebookAnalyticsView.tsx`, `types.ts` |
| Dashboard home, posts table, sync button | `apps/web/src/app/dashboard/page.tsx` |
| OAuth connect, accounts CRUD | `apps/web/src/app/api/social/oauth/`, `apps/web/src/app/api/social/accounts/`, `ConnectView.tsx` |
| Pinterest token | `apps/web/src/lib/pinterest-token.ts` |
| Inbox | `apps/web/src/app/dashboard/inbox/page.tsx`, `api/social/accounts/[id]/conversations/`, `comments/` |
| Auth, shell layout | `AuthContext.tsx`, `AuthenticatedShell.tsx`, `middleware.ts`, `app/api/auth/` |
| Media upload / proxy (R2) | `apps/web/src/app/api/media/`, `instagram-media-r2.ts` |
| Prisma DB access | `apps/web/prisma/schema.prisma`, `apps/web/src/lib/db.ts` |
| Cron | `apps/web/src/app/api/cron/` |

---

## Repo layout (top level)

| Path | Role |
|------|------|
| `apps/web/` | **Main product:** Next.js App Router, Prisma, most APIs |
| `apps/api/` | Nest-style API (Vercel); use map section at bottom |
| `docs/` | Setup guides, audit reports, capability maps |
| `.cursor/` | Rules and this map |
| `package.json` (root) | May wire workspaces; check `apps/web/package.json` for scripts |

---

## `apps/web/src` – folder roles

| Folder | Role |
|--------|------|
| `app/` | Routes: `page.tsx`, `layout.tsx`, `route.ts` under `app/api/` |
| `components/` | Shared UI: `analytics/`, `dashboard/`, `auth/`, `landing/`, `smart-links/` |
| `context/` | React context (auth, theme, accounts, selected account, app data) |
| `lib/` | Server and shared logic: `facebook/`, `analytics/`, `metric-format.ts` (full KPI numbers), publish, tokens, DB |
| `types/` | Shared TS types (e.g. analytics) |
| `middleware.ts` | Edge middleware |

---

## App Router – main `page.tsx` routes

| Route (under `app/`) | File |
|----------------------|------|
| `/` landing | `page.tsx` |
| `/composer` | `composer/page.tsx` |
| `/calendar` | `calendar/page.tsx` |
| `/posts` | `posts/page.tsx` |
| `/dashboard` | `dashboard/page.tsx` |
| `/dashboard/inbox` | `dashboard/inbox/page.tsx` |
| `/dashboard/accounts` | `dashboard/accounts/page.tsx` |
| `/dashboard/settings` | `dashboard/settings/page.tsx` |
| `/dashboard/automation` | `dashboard/automation/page.tsx` |
| `/dashboard/smart-links` | `dashboard/smart-links/page.tsx` |
| `/dashboard/summary` | `dashboard/summary/page.tsx` |
| `/dashboard/ai-assistant` | `dashboard/ai-assistant/page.tsx` |
| `/dashboard/hashtag-pool` | `dashboard/hashtag-pool/page.tsx` |
| `/dashboard/analytics` | `dashboard/analytics/page.tsx` |
| `/dashboard/analytics/traffic-audience` | `dashboard/analytics/traffic-audience/page.tsx` |
| `/login`, `/signup` | `(auth)/login/page.tsx`, `(auth)/signup/page.tsx` |
| `/pricing` | `pricing/page.tsx` |
| `/help` | `help/page.tsx`, `help/support/page.tsx` |
| `/reel-analyzer` | `reel-analyzer/page.tsx` |
| `/[username]` link-in-bio | `[username]/page.tsx` |
| `/post/[id]/open` email open | `post/[id]/open/page.tsx` |

Layouts worth knowing: `composer/layout.tsx` uses `AuthenticatedShell`.

---

## API routes (`apps/web/src/app/api/`) – groups

**Social (per account id `[id]`):** under `social/accounts/[id]/`

- `insights/route.ts` – dashboard bundle, platform branches (FB, IG, Pinterest, etc.)
- `posts/route.ts` – list + sync imported posts (Pinterest thumbnail logic here)
- `conversations/`, `conversations/[conversationId]/messages/`
- `comments/`, `comments/reply/`, `comments/delete/`
- `engagement/`
- Debug: `facebook-graph-debug`, `facebook-analytics-debug`, `instagram-graph-debug`, `pinterest-debug`, `x-dm-debug`, `token-debug`, `facebook-storage-evidence`, `refresh`

**Social global:** `social/accounts/route.ts`, `social/accounts/[id]/route.ts`, `social/oauth/[platform]/start|callback`, `social/oauth/twitter-1oa/`, `social/instagram/`, `social/facebook/`, `social/notifications/`

**Posts:** `posts/route.ts`, `posts/[id]/route.ts`, `posts/[id]/publish/route.ts`, `posts/[id]/open/route.ts`

**Media:** `media/upload-url`, `media/proxy`, `media/serve`

**AI:** `ai/brand-context`, `ai/generate-description`, `ai/generate-inbox-reply`

**Automation / cron:** `automation/`, `cron/process-scheduled`, `cron/metric-snapshots`, `cron/comment-automation`, etc.

**Auth / user:** `auth/signup`, `auth/verify-otp`, `auth/profile`, `create-profile`, `user/can-connect-twitter`

**Other:** `post-image`, `proxy-image`, `smart-links`, `support`, `reels/analyze`, `reels/generate-caption`

---

## `lib/` – high-signal files

| Area | Paths |
|------|--------|
| Publish | `publish-target.ts`, `post-open.ts` |
| Pinterest | `pinterest-token.ts`, `pinterest-analytics-bundle.ts` |
| Facebook analytics | `facebook/` (`fetchers.ts`, `discovery-db.ts`, `frontend-analytics-bundle.ts`, `sync-extras.ts`, `constants.ts`) |
| Meta Graph | `meta-graph-insights.ts` |
| Calendar / dates | `calendar-date.ts` |
| Analytics helpers | `analytics/extended-fetchers.ts`, `metric-snapshots.ts`, `client-fetch.ts` |
| DB / auth prisma user | `db.ts`, `get-prisma-user.ts` |
| Inbox | `inbox-read-state.ts`, `comment-automation.ts` |
| YouTube token | `youtube-token.ts` |
| Media | `media-to-jpeg.ts`, `instagram-media-r2.ts`, `media-serve-token.ts` |
| Email | `resend.ts` |
| Client API helper | `api.ts` |
| Reel analyzer | `reel-analysis/` |

---

## Components – high-signal

| Area | Paths |
|------|--------|
| Shell | `AuthenticatedShell.tsx`, `AppHeader.tsx`, `Sidebar.tsx`, `ConfirmModal.tsx` |
| Connect | `dashboard/ConnectView.tsx` |
| FB analytics UI | `analytics/facebook/FacebookAnalyticsView.tsx` (+ `FacebookReadInsightsPanel`, tabs) |
| Summary dashboard | `dashboard/summary/*` |
| Landing | `landing/SiteHeader.tsx`, `SiteFooter.tsx`, `landing/pricing/*` |
| Smart links | `smart-links/LinkPageRenderer.tsx` |
| Auth | `auth/AuthModal.tsx`, `LoginFormContent.tsx`, `SignupFormContent.tsx` |
| Charts | `charts/GrowthLineChart.tsx`, `InteractiveLineChart.tsx` |
| Shared analytics widgets | `analytics/AnalyticsDateRangePicker.tsx`, `AnalyticsUpgradeGate.tsx`, etc. |

---

## Web app – by feature (detail)

### Dashboard & connect

| What | Where |
|------|--------|
| Dashboard home, sidebar, connect/disconnect | `apps/web/src/app/dashboard/page.tsx` |
| Connect flow UI (per-platform) | `apps/web/src/components/dashboard/ConnectView.tsx` |
| Branded full-page loader | `apps/web/src/components/BrandedPageLoader.tsx` (`public/logo-loading-page.mp4`) |
| Sidebar | `apps/web/src/components/Sidebar.tsx` |
| App header | `apps/web/src/components/AppHeader.tsx` |
| Funnel / landing | `BrandWordmark.tsx`, `app/page.tsx`, `SiteHeader` / `SiteFooter` |

### Inbox (DMs, comments)

| What | Where |
|------|--------|
| Inbox page | `apps/web/src/app/dashboard/inbox/page.tsx` |
| X DM debug API | `apps/web/src/app/api/social/accounts/[id]/x-dm-debug/route.ts` |
| Facebook Graph debug | `apps/web/src/app/api/social/accounts/[id]/facebook-graph-debug/route.ts` |
| Facebook analytics debug | `apps/web/src/app/api/social/accounts/[id]/facebook-analytics-debug/route.ts` |
| Conversations, messages | `apps/web/src/app/api/social/accounts/[id]/conversations/`, `.../messages/route.ts` |
| Comments | `apps/web/src/app/api/social/accounts/[id]/comments/route.ts`, `reply/`, `delete/` |
| Engagement tab | `apps/web/src/app/api/social/accounts/[id]/engagement/route.ts` |
| Read state | `apps/web/src/lib/inbox-read-state.ts` |
| Accounts cache | `apps/web/src/context/AccountsCacheContext.tsx` |

### Composer & posts

| What | Where |
|------|--------|
| Composer UI | `apps/web/src/app/composer/page.tsx` |
| Posts API | `apps/web/src/app/api/posts/route.ts`, `posts/[id]/route.ts`, `posts/[id]/publish/route.ts` |
| Publish target logic | `apps/web/src/lib/publish-target.ts` |

### Analytics & summary

| What | Where |
|------|--------|
| Summary dashboard | `apps/web/src/app/dashboard/summary/page.tsx` |
| Summary UI components | `apps/web/src/components/dashboard/summary/` (SummaryDashboard, KPICardsGrid, GrowthChartTabs, etc.) |
| Insights API (account-level: FB Page bundle, IG impressions series, demographics, TikTok user stats) | `apps/web/src/app/api/social/accounts/[id]/insights/route.ts` |
| **Imported posts API** (sync `?sync=1`, IG/FB/Pinterest media, `platformMetadata`, live insight refresh on GET) | `apps/web/src/app/api/social/accounts/[id]/posts/route.ts` |
| **Local calendar dates** (YYYY-MM-DD in user TZ; presets, default range, FB post filter, chart axis) | `apps/web/src/lib/calendar-date.ts` |
| Premium Facebook analytics UI (sticky Overview/Traffic/Posts/Reels, dark workspace, post detail drawer, reels intelligence) | `apps/web/src/components/analytics/facebook/FacebookAnalyticsView.tsx` |
| Meta Graph: single version for Page REST + insights + OAuth dialog (default v22; env `META_GRAPH_API_VERSION`) | `apps/web/src/lib/meta-graph-insights.ts` (`facebookGraphBaseUrl`) |
| Facebook analytics (discovery, resilient insights, fetchers, frontend bundle) | `apps/web/src/lib/facebook/` (`discovery-db.ts` gates cache if `FacebookMetricDiscovery` missing) |
| Facebook capability map / implementation report | `docs/FACEBOOK_ANALYTICS_CAPABILITY_MAP.md`, `docs/FACEBOOK_ANALYTICS_IMPLEMENTATION_REPORT.md` |
| Facebook live JSON audit | `docs/FACEBOOK_JSON_AUDIT_REPORT.md` |
| Facebook pipeline validation | `apps/web/scripts/facebook-pipeline-validation.ts`, `docs/FACEBOOK_PIPELINE_VALIDATION.md` |
| Facebook **storage evidence** | `GET .../facebook-storage-evidence`, `docs/FACEBOOK_STORAGE_EVIDENCE.md` |
| Facebook **read_insights** App Review panel (dashboard) | `FacebookReadInsightsPanel.tsx`, scroll nav **Page insights (API)** on `dashboard` when account is Facebook |
| Facebook Page/profile + conversations + reviews DB cache (sync with posts) | `apps/web/src/lib/facebook/sync-extras.ts`, Prisma `FacebookPageCache`, `FacebookConversationCache`, `FacebookReviewCache` |
| Analytics types & fetchers | `apps/web/src/types/analytics.ts`, `apps/web/src/lib/analytics/extended-fetchers.ts` |
| **Follower/following history (IG & FB only)** | `apps/web/src/lib/analytics/metric-snapshots.ts`; **YouTube excluded** |
| **Daily metric snapshot cron** | `apps/web/src/app/api/cron/metric-snapshots/route.ts` (X-Cron-Secret); `docs/METRIC_SNAPSHOTS_AND_HISTORY.md` |

### Auth & layout

| What | Where |
|------|--------|
| Root layout, metadata | `apps/web/src/app/layout.tsx` |
| Auth context | `apps/web/src/context/AuthContext.tsx` |
| Auth modal | `apps/web/src/components/auth/AuthModal.tsx`, `AuthModalOpener.tsx` |
| Login/signup | `apps/web/src/app/(auth)/login/page.tsx`, `(auth)/signup/page.tsx` |
| Callback | `apps/web/src/app/auth/callback/route.ts` |
| Middleware | `apps/web/src/middleware.ts` |

### OAuth & social accounts

| What | Where |
|------|--------|
| OAuth start/callback (generic) | `apps/web/src/app/api/social/oauth/[platform]/start/route.ts`, `callback/route.ts` (includes Pinterest v5) |
| Pinterest token refresh | `apps/web/src/lib/pinterest-token.ts` |
| Pinterest setup doc | `docs/PINTEREST_SETUP.md` |
| TikTok raw API JSON (user info, video list, creator_info) on Accounts page | `GET .../social/accounts/[id]/tiktok-debug`, `docs/TIKTOK_CONNECT_SETUP.md` |
| Twitter 1OA | `apps/web/src/app/api/social/oauth/twitter-1oa/start/route.ts`, `callback/route.ts` |
| Instagram connect | `apps/web/src/app/api/social/instagram/connect-account/route.ts`, `pending/route.ts` |
| Facebook connect | `apps/web/src/app/api/social/facebook/connect-page/route.ts`, `pending/route.ts` |
| Accounts list (connected only) / soft disconnect | `apps/web/src/app/api/social/accounts/route.ts`, `accounts/[id]/route.ts` – disconnect sets status + disconnectedAt; firstConnectedAt preserved for IG/FB history |

### Other pages & API

| What | Where |
|------|--------|
| Help | `apps/web/src/app/help/page.tsx` |
| Reel Analyzer | `apps/web/src/app/reel-analyzer/page.tsx`, `components/ReelAnalyzer.tsx`, `lib/reel-analysis/` |
| Smart links | `apps/web/src/app/dashboard/smart-links/page.tsx`, `app/api/smart-links/`, `components/smart-links/` |
| Automation | `apps/web/src/app/dashboard/automation/page.tsx`, `app/api/automation/` |
| AI APIs | `apps/web/src/app/api/ai/` |
| White-label | `apps/web/src/context/WhiteLabelContext.tsx`, `dashboard/settings/page.tsx` |

### Config & assets

| What | Where |
|------|--------|
| Next config | `apps/web/next.config.ts` |
| Public assets | `apps/web/public/` (`logo.svg`, `favicon.svg`, `manifest.json`) |
| Platform icons | `apps/web/src/components/SocialPlatformIcons.tsx` |
| Favicon doc | `docs/FAVICON.md` |

---

## Backend (`apps/api`)

| What | Where |
|------|--------|
| Entry | `apps/api/src/main.ts`, `apps/api/api/[[...path]].js` |
| Auth | `apps/api/src/auth/` |
| Social | `apps/api/src/social/` |
| Prisma (if used) | `apps/api/prisma/` |

---

## How to use this map (agents)

1. **Match the task** to [Task → files](#task--files-first) or a feature table.
2. **Read** only those files; **grep** within the smallest directory that contains them.
3. **Use codebase_search** only when the task is cross-cutting or unlisted.
4. **After adding** a major route, API, or feature entry point, add one line to the right section above.
