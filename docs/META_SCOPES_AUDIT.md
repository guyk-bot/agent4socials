# Meta (Facebook & Instagram) Scopes Audit

This document lists every Meta scope we request in the OAuth flow and where it is used in the app. All listed scopes are **in use**; none are requested without a corresponding API call.

---

## Scopes we request

### Instagram (via Facebook) – when user clicks "Connect Instagram" (Facebook Login)

| Scope | Purpose (Meta) | Where we use it |
|-------|----------------|------------------|
| **instagram_basic** | Read IG profile (username, profile pic, followers_count) | `insights/route.ts`: GET `/{ig-user-id}` with `fields=followers_count`. `posts/route.ts`: sync uses `/{ig-user-id}/media` (media list can require basic). |
| **instagram_content_publish** | Publish photos/reels to Instagram | `publish-target.ts`: POST `/{ig-user-id}/media` and `/{ig-user-id}/media_publish` for images and reels. |
| **instagram_manage_messages** | Read/send Instagram DMs | `conversations/route.ts`: GET `/{ig-user-id}/conversations` when account is INSTAGRAM. |
| **instagram_manage_insights** | Read IG insights (reach, views, profile_views) | `insights/route.ts`: GET `/{ig-user-id}/insights` with `metric=reach,profile_views,views`. |
| **instagram_manage_comments** | Read and reply to IG comments | `comments/route.ts`: GET `/{media-id}/comments`. `comments/reply/route.ts`: POST `/{comment-id}/replies`. `comment-automation/route.ts`: GET comments, POST replies and private_reply. |
| **pages_read_engagement** | Read Page engagement (reactions, etc.) | Used with Page token for engagement data; also required with other Page scopes when connecting via Facebook. |
| **pages_show_list** | List Pages (me/accounts) | OAuth callback, `connect-page`, `refresh`, `publish-target`: GET `me/accounts` to list/select Page and get Page token. |
| **pages_manage_posts** | Publish to Page feed | `publish-target.ts`: POST `/{page-id}/feed` when publishing to Facebook. |
| **pages_manage_engagement** | Read/manage Page comments and engagement | `comments/route.ts`: GET `/{post-id}/comments` for Facebook. `comments/reply/route.ts`: POST `/{comment-id}/comments`. `comment-automation/route.ts`: GET comments, POST comments/replies and private_reply for Facebook. |
| **pages_messaging** | Page inbox (Messenger) | `conversations/route.ts`: GET `/{page-id}/conversations` when account is FACEBOOK. |
| **pages_read_user_content** | Read Page content (e.g. posts) | `posts/route.ts`: GET `/{page-id}/published_posts` when syncing Facebook posts. |
| **business_management** | Manage business assets (list Pages) | OAuth callback, `connect-page`, `refresh`, `publish-target`: GET `me/accounts` (required in v19+ to get Page list and tokens). |

### Facebook – when user clicks "Connect Facebook"

| Scope | Purpose (Meta) | Where we use it |
|-------|----------------|------------------|
| **pages_read_engagement** | Read Page engagement | Engagement metrics; used together with insights and comments. |
| **pages_show_list** | List Pages | Same as above: `me/accounts` in callback, connect-page, refresh, publish-target. |
| **pages_manage_posts** | Publish to Page feed | `publish-target.ts`: POST `/{page-id}/feed`. |
| **pages_manage_engagement** | Read/manage Page comments | `comments/route.ts`, `comments/reply/route.ts`, `comment-automation/route.ts` (Facebook branch). |
| **pages_messaging** | Page inbox | `conversations/route.ts` for FACEBOOK account. |
| **pages_read_user_content** | Read Page posts | `posts/route.ts`: GET `/{page-id}/published_posts`. |
| **read_insights** | Page insights | `insights/route.ts`: GET `/{page-id}/insights` with `page_impressions`, `page_views_total`, `page_fan_reach`. |
| **business_management** | List/manage Pages | `me/accounts` in callback, connect-page, refresh, publish-target. |

### Instagram-only login – when user uses "Connect with Instagram" (no Facebook)

| Scope | Purpose (Meta) | Where we use it |
|-------|----------------|------------------|
| **instagram_business_basic** | IG profile (Instagram Graph API) | Profile and media list when using IG-only token. |
| **instagram_business_content_publish** | Publish to IG | Same publish flow via `publish-target.ts` (IG media endpoints). |
| **instagram_business_manage_messages** | IG DMs | `conversations/route.ts` for INSTAGRAM account. |
| **instagram_business_manage_insights** | IG insights | `insights/route.ts` for INSTAGRAM (same endpoints, token from IG Login). |
| **instagram_business_manage_comments** | IG comments | Same as instagram_manage_comments but for IG-only token: comments route, reply, comment-automation. |

---

## File reference (quick lookup)

| File | Scopes used (via API) |
|------|------------------------|
| `apps/web/src/app/api/social/oauth/[platform]/start/route.ts` | Defines which scopes we request (no API calls). |
| `apps/web/src/app/api/social/oauth/[platform]/callback/route.ts` | `me/accounts` → business_management, pages_show_list. |
| `apps/web/src/app/api/social/facebook/connect-page/route.ts` | `me/accounts` → business_management, pages_show_list. |
| `apps/web/src/app/api/social/accounts/[id]/refresh/route.ts` | `me/accounts`, page profile → business_management, pages_show_list. |
| `apps/web/src/app/api/social/accounts/[id]/insights/route.ts` | Page/IG profile + insights → read_insights (FB), instagram_manage_insights (IG), instagram_basic. |
| `apps/web/src/app/api/social/accounts/[id]/posts/route.ts` | `published_posts` (FB), `media` (IG) → pages_read_user_content, instagram_basic. |
| `apps/web/src/app/api/social/accounts/[id]/conversations/route.ts` | `/{id}/conversations` → pages_messaging (FB), instagram_manage_messages (IG). |
| `apps/web/src/app/api/social/accounts/[id]/comments/route.ts` | `/{post-id}/comments` → pages_manage_engagement (FB), instagram_manage_comments (IG). |
| `apps/web/src/app/api/social/accounts/[id]/comments/reply/route.ts` | `/{comment-id}/replies` or `comments` → pages_manage_engagement, instagram_manage_comments. |
| `apps/web/src/app/api/cron/comment-automation/route.ts` | Comments + replies + private_reply → pages_manage_engagement, instagram_manage_comments. |
| `apps/web/src/lib/publish-target.ts` | `me/accounts`, `/{page-id}/feed`, `/{ig-id}/media`, `media_publish` → pages_manage_posts, instagram_content_publish, business_management, pages_show_list. |

---

## Summary

- **All** Meta scopes we request are used in the codebase for the features listed above.
- If you remove a scope, the corresponding feature (e.g. Inbox, Comments, Insights, Publish, or Page list) will fail with permission errors until the scope is restored or the feature is removed.
- For App Review, you can point reviewers to this audit and to the specific routes in the "Where we use it" column to show each permission in use.

---

## Why Metricool shows more data (Inbox, full analytics, demographics)

We request the **same permissions** Metricool uses (e.g. `instagram_manage_messages`, `instagram_manage_insights`, `pages_messaging`, `read_insights`) and call the **same Meta APIs**. The difference is **Meta's access level**, not our code.

- **Standard Access**: Meta grants these permissions only to **app roles** (admins, developers, testers). Other users get restricted or empty data. No App Review needed.
- **Advanced Access**: After **App Review** (and, for many permissions, **Business Verification**), Meta grants full access to **any user** who connects. Metricool has gone through App Review and has Advanced Access for messaging, insights, and engagement.

So:

| Feature | Why Metricool has it | Why we might not (yet) |
|--------|----------------------|-------------------------|
| **Inbox (DMs)** | Advanced Access for `instagram_manage_messages` / `pages_messaging` | App in Development: only test users get full inbox; others get 400 or empty. |
| **Views, reach, impressions** | Advanced Access for `instagram_manage_insights` / `read_insights` | Same: full data only for app roles or after App Review. |
| **Followers** | Works with `instagram_basic` (often Standard Access) | We show this because it does not require Advanced Access. |
| **Demographics (age, gender, country)** | Extra endpoints and/or Marketing API / insights products | We do not call demographic endpoints yet; some may need additional permissions or approval. |

**What to do:** To get Metricool-level data (inbox, full insights, posts) for all users:

1. In [Meta for Developers](https://developers.facebook.com/) go to your app, then **App Review**.
2. Request **Advanced Access** for each permission you need (e.g. Instagram Manage Messages, Instagram Manage Insights, Page Messaging, Read Page Insights). Add the permissions under **App Review > Permissions and Features** first if they are not there.
3. Complete **Business Verification** if Meta requires it for those permissions.
4. Submit for **App Review** with screen recordings and a clear explanation of how each permission is used (this audit and the file reference above are enough for the "where we use it" part).
5. After approval, switch the app to **Live** so all users get full tokens.

Until then, only accounts that have a **role on the app** (admin/developer/tester) will get full Inbox and analytics; other users will see followers and possibly partial or empty data.
