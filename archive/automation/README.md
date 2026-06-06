# Archived automation feature (removed from live app)

Automation (keyword comment replies, welcome DMs, first-incoming DM, follower welcome, Dashboard Automation page, Composer comment automation, iZop in-chat automation) was **removed from the product UI and cron/API surface** on request.

Files here are kept for future restoration. Paths below are relative to `archive/automation/`.

## Dashboard and help

| Original route | Archived file |
|----------------|---------------|
| `/dashboard/automation` | `apps/web/src/app/dashboard/automation/page.tsx` |
| `/help/automation` | `apps/web/src/app/help/automation/page.tsx` |

## API routes

| Original route | Archived file |
|----------------|---------------|
| `GET/PATCH /api/automation/settings` | `apps/web/src/app/api/automation/settings/route.ts` |
| `POST /api/automation/run-comment-automation` | `apps/web/src/app/api/automation/run-comment-automation/route.ts` |
| `GET /api/automation/welcome-readiness` | `apps/web/src/app/api/automation/welcome-readiness/route.ts` |
| `POST /api/automation/reset-welcome-history` | `apps/web/src/app/api/automation/reset-welcome-history/route.ts` |
| `GET/POST /api/cron/comment-automation` | `apps/web/src/app/api/cron/comment-automation/route.ts` |
| `GET/POST /api/cron/dm-first-welcome` | `apps/web/src/app/api/cron/dm-first-welcome/route.ts` |
| `GET/POST /api/cron/welcome-followers` | `apps/web/src/app/api/cron/welcome-followers/route.ts` |
| `POST /api/ai/generate-composer-dm` | `apps/web/src/app/api/ai/generate-composer-dm/route.ts` |

## Core libraries

| File | Purpose |
|------|---------|
| `apps/web/src/lib/comment-automation.ts` | Keyword comment auto-reply engine |
| `apps/web/src/lib/dm-first-welcome.ts` | First incoming DM welcome |
| `apps/web/src/lib/dm-first-welcome-sweep.ts` | Cron sweep for welcome DMs |
| `apps/web/src/lib/automation-welcome-readiness.ts` | Welcome DM readiness checks |
| `apps/web/src/lib/inbox/load-conversation-for-first-welcome.ts` | Inbox load + welcome row extraction |
| `apps/web/src/lib/inbox/twitter-conversation-for-first-welcome.ts` | X DM load for welcome flow |

## iZop AI

| File | Purpose |
|------|---------|
| `apps/web/src/components/aysop/AysopInChatAutomationCard.tsx` | In-chat automation setup card |

Tool definitions lived in `apps/web/src/lib/ai/aysop-tools.ts` (`get_keyword_automation`, `save_keyword_automation_step`).

## Docs and tests

| File | Purpose |
|------|---------|
| `apps/web/docs/COMMENT_AUTOMATION.md` | Keyword automation operator doc |
| `apps/web/src/app/api/cron/__tests__/comment-automation.test.ts` | Cron tests |

## Database (unchanged in live schema)

Prisma still has automation-related fields/tables for existing data:

- `User.automationSettings` (JSON)
- `Post.commentAutomation` (JSON)
- `CommentAutomationReply`, `AutomationFollowerWelcome` models

Migrations: `apps/web/prisma/migrations/20250216120000_*`, `20250219120000_*`, `20250219140000_*`

## Restoring

1. Move files back to original paths under `apps/web/src/`.
2. Re-wire imports in `Sidebar`, Composer, iZop AI, `fast-tick`, inbox messages route.
3. Re-enable external cron URLs (see repo `docs/CRON_SCHEDULES.md`).
