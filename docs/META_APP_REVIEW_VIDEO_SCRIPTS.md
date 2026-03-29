# Meta App Review: Video Scripts by Scope

Copy each block below into the video description (or as notes) when submitting the corresponding scope. Record the steps so reviewers see the permission in use.

---

## 1. instagram_business_manage_messages

**Scope:** instagram_business_manage_messages  
**Use case:** Agent4Socials lets users manage their Instagram Direct Messages (DMs) from the dashboard Inbox when they connect via "Connect with Instagram only" (Instagram Login, no Facebook).

**What to show in the video:**
1. Open Agent4Socials Dashboard. In the left sidebar, click to add an account and choose "Connect with Instagram only" (Instagram Login flow).
2. Complete the OAuth consent screen (this scope appears there). After connecting, the Instagram account appears in the sidebar.
3. Go to **Inbox**. Select the connected Instagram account.
4. Show the list of Instagram DM conversations (and optionally open a conversation to show messages). This uses the instagram_business_manage_messages permission to read Instagram DMs via the Instagram Messaging API.

---

## 2. pages_read_user_content

**Scope:** pages_read_user_content  
**Use case:** Agent4Socials syncs and displays the Facebook Page’s published posts so users can see their content and performance in one place.

**What to show in the video:**
1. Connect a Facebook Page to Agent4Socials (Connect Facebook → choose Page). Complete the consent screen where this scope is shown.
2. Go to **Analytics** or the account view where "Total content" or post list is shown.
3. Trigger a sync or open the list of posts from the connected Facebook Page. Show that the app displays the Page’s published posts (titles, dates, or thumbnails). This uses pages_read_user_content to call the Graph API for the Page’s published_posts.

---

## 3. pages_manage_posts

**Scope:** pages_manage_posts  
**Use case:** Agent4Socials lets users create and publish posts to their Facebook Page feed from the Composer (schedule or publish now).

**What to show in the video:**
1. Ensure a Facebook Page is connected (Connect Facebook → choose Page). The consent screen for Facebook includes this scope.
2. Go to **Composer**. Create a new post: add text and optionally an image or video. Select the Facebook Page (and any other platforms).
3. Click **Publish** (or Schedule). Confirm the post appears on the Facebook Page (e.g. open the Page in another tab or show the success state in the app). This uses pages_manage_posts to POST to the Page’s feed via the Graph API.

---

## 4. pages_manage_engagement

**Scope:** pages_manage_engagement  
**Use case:** Agent4Socials lets users view and reply to comments on their Facebook Page posts, and run keyword-based comment automation (auto-reply when comments contain certain words).

**What to show in the video:**
1. Connect a Facebook Page (Connect Facebook → choose Page). Consent screen shows this scope.
2. Go to a post that has comments (or use a test post and add a comment on Facebook). In the app, open **Comments** for that post (or the account’s comments view) and show the list of comments fetched from the Page.
3. Optionally reply to a comment from the app to show write access. If you use **Comment automation** in Composer (keywords + reply text), show that settings screen and briefly explain that the app uses this permission to read comments and post replies on the Page. This uses pages_manage_engagement for GET comments and POST comment replies.

---

## 5. instagram_manage_comments

**Scope:** instagram_manage_comments  
**Use case:** Agent4Socials lets users view and reply to comments on their Instagram posts, and run keyword-based comment automation (auto-reply or send a DM when comments contain certain words).

**What to show in the video:**
1. Connect Instagram (via Facebook Login and choose a Page with linked Instagram, or Connect with Instagram only). Complete the consent screen where this scope appears.
2. Go to **Comments** for an Instagram post (or the account view that lists comments). Show comments loaded from Instagram.
3. Optionally reply to a comment from the app. If you use **Comment automation** in Composer (keywords + public reply and/or "Send a private reply (DM)"), show that section and explain the app uses this permission to read comments and post replies (and optional Instagram DM). This uses instagram_manage_comments for GET comments and POST replies/private_reply.

---

## 6. pages_messaging

**Scope:** pages_messaging  
**Use case:** Agent4Socials lets users view and manage their Facebook Page’s Messenger conversations (Page inbox) in the dashboard Inbox.

**What to show in the video:**
1. Connect a Facebook Page (Connect Facebook → choose Page). The consent screen includes pages_messaging.
2. Go to **Inbox**. Select the connected Facebook Page (Facebook account).
3. Show the list of Messenger conversations for the Page (and optionally open one to show messages). This uses pages_messaging to call the Graph API for the Page’s conversations (Messenger inbox).

---

## 7. instagram_content_publish

**Scope:** instagram_content_publish  
**Use case:** Agent4Socials lets users publish photos and Reels to their Instagram account from the Composer when they connect Instagram via Facebook Login.

**What to show in the video:**
1. Connect Instagram via "Connect Instagram" (Facebook Login) and choose a Page with a linked Instagram Business/Creator account. Complete the consent screen where instagram_content_publish appears.
2. Go to **Composer**. Create a post: add caption and media (image or video/Reel). Select the connected Instagram account (and optionally other platforms).
3. Click **Publish** (or Schedule). Confirm the post appears on Instagram (e.g. check Instagram app or instagram.com). This uses instagram_content_publish to create media containers and publish to Instagram via the Graph API.

---

## 8. instagram_manage_messages

**Scope:** instagram_manage_messages  
**Use case:** Agent4Socials lets users view and manage their Instagram Direct Messages (DMs) in the dashboard Inbox when they connect Instagram via Facebook Login.

**What to show in the video:**
1. Connect Instagram via "Connect Instagram" (Facebook Login) and choose a Page with linked Instagram. Complete the OAuth consent screen (this scope is included).
2. Go to **Inbox**. Select the connected Instagram account.
3. Show the list of Instagram DM conversations (and optionally open a conversation to show messages). This uses instagram_manage_messages to read Instagram DMs via the Instagram Messaging API (same feature as instagram_business_manage_messages but for the "Connect with Facebook" flow).

---

## Quick reference: which flow to use

| Scope | Use "Connect Instagram" (Facebook) | Use "Connect Facebook" | Use "Connect with Instagram only" |
|-------|-----------------------------------|-------------------------|-----------------------------------|
| instagram_business_manage_messages | — | — | Yes |
| instagram_manage_messages | Yes | — | — |
| instagram_content_publish | Yes | — | — |
| instagram_manage_comments | Yes | — | Yes (same feature) |
| pages_read_user_content | — | Yes | — |
| pages_manage_posts | — | Yes | — |
| pages_manage_engagement | — | Yes | — |
| pages_messaging | — | Yes | — |

For Instagram scopes (instagram_*): show the flow that requests that scope (Facebook Login for instagram_manage_*, instagram_content_publish, instagram_manage_comments; Instagram-only for instagram_business_manage_messages). For Page scopes (pages_*): show "Connect Facebook" and then the feature on the connected Page.
