# App Review testing: Threads, Instagram, and X (Twitter)

Use this checklist to turn **"0 of 1 API call(s) required"** into **"1 of 1"** (or **Testing complete**) in Meta and X developer portals, then submit your scope requests.

**Before you start**

1. Log into [developers.facebook.com](https://developers.facebook.com) as an **Administrator** or **Tester** on the app.
2. App mode: **Development** is fine while testing (only app roles can connect).
3. Use production: **https://agent4socials.com** (or your staging URL with the same OAuth redirect URIs configured in Meta / X).
4. After each batch of API calls, wait **2 to 5 minutes**, then refresh **App Review → Testing** (Meta) before assuming a scope failed.

---

## Part A: Instagram (Meta)

Agent4Socials supports two Instagram flows. Match the flow to the permission Meta shows under **Testing**.

### A1. Instagram Login only (`instagram_business_*` scopes)

Shown under permissions like `instagram_business_manage_insights`, `instagram_business_manage_comments`, `instagram_business_manage_messages`.

**Connect**

1. Open **https://agent4socials.com/dashboard/account** (or sidebar **Connect**).
2. Choose **Connect with Instagram only** (not Facebook).
3. Complete OAuth and return with Instagram connected.

**Trigger API calls in the app**

| Permission | What to do in Agent4Socials |
|------------|----------------------------|
| `instagram_business_basic` | Connect completes; profile loads in sidebar. |
| `instagram_business_content_publish` | **Composer** → text + image → select **Instagram** → **Post now**. |
| `instagram_business_manage_insights` | **Dashboard** → select Instagram → open analytics / sync (loads insights). |
| `instagram_business_manage_comments` | **Inbox** → Instagram → **Comments** tab (loads comments). Reply to one comment if you can. |
| `instagram_business_manage_messages` | **Inbox** → Instagram → **Messages** tab (loads DMs). |

**Optional: run the automated script (same DB tokens)**

From your machine (with `apps/web/.env` containing `DATABASE_URL` and a connected Instagram-only account):

```bash
cd apps/web
node scripts/run-meta-app-review-tests.js
```

This hits `instagram_business_manage_insights` and `instagram_business_manage_comments` (and Facebook `pages_manage_engagement` if Facebook is connected). See `docs/RUN_META_APP_REVIEW_TESTS.md`.

**If a scope stays at 0 of 1**

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer/) → app **agent4socials** → **User or Page** token → add the Instagram permission → **Generate token**.
2. Host: **Instagram Graph API** (`graph.instagram.com`) for IG Login tokens, or **Meta Graph API** (`graph.facebook.com`) for Facebook-linked IG.
3. Examples:
   - Insights: `GET me/insights?metric=reach&period=day`
   - Comments: `GET {media-id}/comments`
   - Messages: `GET me/conversations` (if your token has messaging)

---

### A2. Instagram via Facebook Login (`instagram_manage_*` + Page scopes)

Use case in Meta: **"Manage messaging & content on Instagram"** (and related Facebook Page use cases).

**Connect**

1. **Connect Instagram** (Facebook Login) or **Connect Facebook** and pick a Page that has a linked **Instagram Business/Creator** account.
2. On the Facebook consent screen, accept all requested permissions.

**Trigger API calls in the app**

| Permission | What to do in Agent4Socials |
|------------|----------------------------|
| `instagram_basic` | Account appears in sidebar after connect. |
| `instagram_content_publish` | **Composer** → media + caption → **Instagram** → **Post now**. |
| `instagram_manage_insights` | **Dashboard** → Instagram account → analytics / sync. |
| `instagram_manage_comments` | **Inbox** → Instagram → **Comments**; reply once if possible. |
| `instagram_manage_messages` | **Inbox** → Instagram → **Messages**. |
| `pages_manage_posts` | **Composer** → **Facebook** → **Post now**. |
| `pages_manage_engagement` | **Inbox** → Facebook → **Comments** or **Engagement**. |
| `pages_messaging` | **Inbox** → Facebook → **Messages**. |
| `pages_read_user_content` | **Dashboard** or **Posts** → sync / list Facebook Page posts. |
| `read_insights` | **Dashboard** → Facebook Page → analytics. |

**Screen recordings for submission**

Follow `docs/META_TEST_ACCOUNT_SCOPE_RECORDING.md` and `docs/META_APP_REVIEW_VIDEO_SCRIPTS.md` (one flow per scope group).

---

## Part B: Threads (Meta)

Use case: **Access the Threads API**. Default scopes in the app (see `docs/THREADS_SETUP.md`):

`threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_mentions`

**Not requested by the app:** `threads_share_to_instagram` (see B3 below).

### B1. Connect Threads

1. **Dashboard → Account → Connect** → **Threads**, or open  
   `https://agent4socials.com/dashboard?connect=THREADS`
2. Redirect URI in Meta must include:  
   `https://agent4socials.com/api/social/oauth/threads/callback`
3. Finish OAuth; Threads should show in the sidebar.

### B2. Trigger each scope in the app

| Permission | What to do in Agent4Socials |
|------------|----------------------------|
| `threads_basic` | Connect + profile in sidebar (GET `me` on Threads API). |
| `threads_content_publish` | **Composer** → short text (and optional image) → **Threads** → **Post now**. Wait for success. |
| `threads_manage_insights` | **Dashboard** → select **Threads** → open analytics / run sync (calls `me/threads_insights`). |
| `threads_read_replies` | See **B3** (Graph API Explorer) if no reply UI yet. |
| `threads_manage_replies` | Post a test thread, reply from another account, then use Explorer to POST a reply (B3). |
| `threads_manage_mentions` | Mention your Threads handle from another account, then use Explorer (B3). |

### B3. Graph API Explorer (Threads host)

Use when the app UI does not yet call an endpoint, especially **`threads_share_to_instagram` (0 of 1)**.

1. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Select your app.
3. Under **Meta App**, choose the product that exposes **Threads** tokens, or use **Get Token → Get User Access Token** and check the Threads permissions you need.
4. Set the request URL host to **Threads**: base `https://graph.threads.net/v1.0/` (Explorer may label this **Threads API**).

**Suggested calls** (replace `{thread-id}` with a real post id from your test publish):

| Permission | Method and path |
|------------|-----------------|
| `threads_basic` | `GET me?fields=id,username` |
| `threads_content_publish` | Already satisfied if you published from Composer (`POST me/threads` + `POST me/threads_publish`). |
| `threads_manage_insights` | `GET me/threads_insights?metric=views,likes,replies,reposts,quotes` |
| `threads_read_replies` | `GET {thread-id}/replies` |
| `threads_manage_replies` | `POST {thread-id}/replies` with `text=Test reply` |
| `threads_manage_mentions` | `GET me/mentions` (or the mentions endpoint from [Threads API docs](https://developers.facebook.com/docs/threads)) |
| `threads_share_to_instagram` | Only if you need this scope: use Meta’s documented **share to Instagram** endpoint once (not implemented in Agent4Socials today). You can skip it in App Review if Meta marks it optional. |

5. Click **Submit**. Repeat for any permission still at **0 of 1**.
6. Wait 2 to 5 minutes → refresh **App Review → Testing → Access the Threads API**.

---

## Part C: X (Twitter)

X is **not** in the Meta Testing screen. Permissions are managed in the [X Developer Portal](https://developer.x.com/) under your app → **Settings** → **User authentication settings**.

### C1. Default scopes Agent4Socials requests

`tweet.read tweet.write users.read media.write dm.read dm.write offline.access`

(Override with env `TWITTER_OAUTH_SCOPES` if needed.)

### C2. Connect and test in the app

1. **Connect X** from **Dashboard → Account**.
2. Complete OAuth (DM scopes require **Read and write** DMs enabled on the X app).

| Capability | What to do in Agent4Socials |
|------------|----------------------------|
| `users.read` | Profile loads after connect. |
| `tweet.read` | **Dashboard** / **Posts** → sync posts; analytics for X. |
| `tweet.write` | **Composer** → text → **X** → **Post now**. |
| `media.write` | **Composer** → post with **image or video** to X. |
| `dm.read` | **Inbox** → X → **Messages** (conversation list). |
| `dm.write` | **Inbox** → X → open a conversation → **send a reply** (or automation welcome DM if enabled). |

### C3. X App Review / Elevated access

1. In the X Developer Portal, open **App → App details** and complete the use case description (scheduling, inbox, analytics).
2. Attach **screen recordings**: connect X, publish a post, open Inbox messages, optional DM reply.
3. If X asks for example API calls, your production traffic from the steps above counts; you can also show calls in the portal’s **API playground** or logs.

There is no Meta-style **"0 of 1"** counter for X; approval is manual review of your app and policy compliance.

---

## Part D: Submit the review request

### Meta (Instagram + Threads)

1. **App Review → Permissions and Features** (or each **Use case → Testing**): confirm **1 of 1** or **Completed** for every scope you need.
2. For each permission, prepare:
   - **How the app uses it** (see `docs/META_SCOPES_AUDIT.md`).
   - **Screen recording** (see `docs/META_APP_REVIEW_VIDEO_SCRIPTS.md`).
3. Submit **Advanced Access** for each permission.
4. Complete **Business Verification** if Meta prompts you.
5. After approval, switch the app to **Live** so customers get full data.

### X

1. Submit for the access level your features need (often **Elevated** for posting + DMs at scale).
2. Include links to **https://agent4socials.com** and the recordings from Part C.

---

## Quick troubleshooting

| Problem | Fix |
|---------|-----|
| Meta Testing still **0 of 1** after app actions | Wait 5 min, refresh; run Graph API Explorer with the same permission checked on the token. |
| Instagram script **Skipped** | Reconnect **Instagram only** on production, ensure `DATABASE_URL` in local `.env` points at the same DB. |
| Threads connect fails | Check `META_APP_ID`, `META_APP_SECRET`, Threads redirect URI, and `THREADS` in DB enum (`docs/THREADS_SETUP.md`). |
| X Inbox empty / DM error | Reconnect X; confirm app has **Read and write** DMs and scopes include `dm.read` + `dm.write`. |
| `threads_share_to_instagram` stuck | Not used by the app; one manual Explorer call or omit from submission if optional. |

---

## Related docs in this repo

- `docs/RUN_META_APP_REVIEW_TESTS.md` – script for 3 Instagram/Facebook test calls
- `docs/META_TEST_ACCOUNT_SCOPE_RECORDING.md` – test users and recording script
- `docs/META_APP_REVIEW_VIDEO_SCRIPTS.md` – per-scope video narration
- `docs/META_SCOPES_AUDIT.md` – where each Meta scope is used in code
- `docs/THREADS_SETUP.md` – Threads OAuth env vars
- `docs/TESTING_TWITTER_LINKEDIN.md` – Twitter scheduling email flow (separate from scope testing)
