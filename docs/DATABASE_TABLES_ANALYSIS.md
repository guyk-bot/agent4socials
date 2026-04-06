# Database Tables Analysis

## Summary

Your database has **20+ tables**. After analysis:
- **14 tables are ESSENTIAL** (core functionality)
- **4 tables are OBSERVABILITY** (debugging/logs, can be pruned)
- **2 tables are LEGACY** (from old Supabase migrations)

---

## Essential Tables (DO NOT DELETE)

| Table | Purpose | Used By |
|-------|---------|---------|
| `User` | User accounts | Auth, all features |
| `SocialAccount` | Connected social accounts (FB, IG, YT, etc.) | OAuth, posting, analytics |
| `Post` | Scheduled/draft posts | Composer, Calendar |
| `PostTarget` | Which platforms a post targets | Publishing |
| `MediaAsset` | Images/videos attached to posts | Composer, Publishing |
| `ImportedPost` | Posts imported from platforms | Analytics, Posts tab |
| `AccountMetricSnapshot` | Daily follower/metric history | Analytics charts |
| `facebook_page_insight_daily` | Daily Page insights (views, impressions) | Facebook analytics |
| `PendingConnection` | Temporary OAuth state | Connect flow |
| `CommentAutomationReply` | Tracks auto-replied comments | Comment automation |
| `AutomationFollowerWelcome` | Tracks welcomed followers | DM automation |
| `LinkPage` | Smart Links pages | Smart Links feature |
| `LinkItem` | Links within Smart Links | Smart Links feature |
| `_prisma_migrations` | Prisma migration tracking | Deployments |

---

## Observability Tables (Can Be Pruned, Not Deleted)

| Table | Purpose | Recommendation |
|-------|---------|----------------|
| `sync_jobs` | Logs every sync operation | Keep last 30 days |
| `FacebookSyncRun` | Logs FB sync runs | Keep last 30 days |
| `FacebookMetricDiscovery` | Caches valid Graph metrics | Keep last 30 days |
| `DeployTriggerState` | CI deploy tracking | Keep (single row) |

---

## Cache Tables (Could Be Consolidated, But Safe to Keep)

| Table | Purpose | Notes |
|-------|---------|-------|
| `facebook_pages` | Cached Page profile JSON | Used by insights, could be JSON field on SocialAccount |
| `facebook_conversations` | Cached Messenger conversations | Used by Inbox |
| `facebook_reviews` | Cached Page reviews/ratings | Low usage but harmless |

---

## Legacy/Supabase Tables (Not in Prisma Schema)

| Table | Purpose | Recommendation |
|-------|---------|----------------|
| `verification_codes` | Email OTP signup | **KEEP** - used by signup flow |
| `users` | Old Supabase migration | Check if empty, may be duplicate of `User` |
| `user_profiles` | Old Supabase migration | Check if empty, may be unused |

---

## "UNRESTRICTED" Warning Explained

Supabase shows "UNRESTRICTED" when a table doesn't have Row Level Security (RLS) policies. This is **fine for your app** because:

1. You access the database via **server-side API** (Next.js API routes)
2. Your API uses the **service_role key** (full access)
3. **Client-side** never directly accesses the database

The cleanup script adds RLS policies to remove the warnings (best practice).

---

## Data Flow

```
User connects Facebook
  → SocialAccount created (stores token)
  → ImportedPost rows created (posts from FB)
  → AccountMetricSnapshot rows created (daily followers)
  → facebook_page_insight_daily rows created (page views, etc.)
  → sync_jobs log row created (observability)

User views dashboard
  → Read from ImportedPost (posts tab)
  → Read from AccountMetricSnapshot (growth chart)
  → Read from facebook_page_insight_daily (insights)
  → NO live API call if data is fresh (< 30 min old)
```

---

## Recommendations

### 1. Run the cleanup script
Adds RLS policies and prunes old data:
```
apps/web/prisma/cleanup-and-secure.sql
```

### 2. Check legacy tables
Run this in Supabase SQL Editor to see if `users` table has data:
```sql
SELECT COUNT(*) as count, 'users' as table_name FROM users
UNION ALL
SELECT COUNT(*), 'user_profiles' FROM user_profiles;
```

If both are empty, you can drop them:
```sql
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
```

### 3. Do NOT consolidate yet
The Facebook cache tables (`facebook_pages`, `facebook_conversations`, `facebook_reviews`) could theoretically be JSON fields on `SocialAccount`, but:
- They work fine as separate tables
- Changing them requires code changes + migration
- Low risk / low reward

---

## Why Prisma Errors Occurred

The error you saw:
```
The column `ImportedPost.platformPostInsights` does not exist
```

This means:
1. Code expects a column that doesn't exist in production DB
2. Migrations haven't run on production
3. **Fix**: Redeploy triggers `prisma migrate deploy` which adds missing columns

If migrations keep failing, check:
- `DATABASE_URL` uses **Transaction pooler** (port 6543)
- `DATABASE_DIRECT_URL` is set (same as DATABASE_URL for Supabase)
