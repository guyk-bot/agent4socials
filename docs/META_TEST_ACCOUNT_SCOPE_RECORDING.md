# Meta App Review: Test Account Setup and Screen Recording by Scope

This guide explains how to **add a test account** in Meta for Developers and how to **show the actual user experience** for each permission in your screen recordings so reviewers see real usage.

---

## Part 1: Add a test user (so you can demo without going Live)

1. Go to [Meta for Developers](https://developers.facebook.com/) and open your app.
2. In the **left sidebar**, under **App settings**, click **App roles** (it appears under "Basic" and "Advanced"). Do not use **Create test app** (that creates a separate test app; you want to add testers to this app).
3. Under **App roles** you’ll see **Roles** and **Test users** (or **Testers**):
   - Click **Add Testers**.
   - Enter the **Facebook account email** (or Facebook user name) of the person who will perform the demo. That person must have a **Facebook account** and, for Instagram, an **Instagram Business/Creator account** linked to a **Facebook Page**.
4. Send the invite; the test user accepts it from their Facebook account (often under Settings → Apps and Websites → App Invites or from the email invite).
5. Keep your app in **Development** mode while recording. In Development mode, only you, admins, and test users can use the app, and they will see the full permission dialog and flows.

**For Instagram (via Facebook):** The test user must:
- Have a **Facebook account**.
- Create or use a **Facebook Page** and link an **Instagram Business or Creator account** to that Page (Facebook Page → Settings → Instagram → Connect account).

**For Instagram-only login** (if you use “Connect with Instagram”): Add the same person as a test user; they connect with their Instagram account when you choose that method.

---

## Administrator vs Tester: when you need each

**If you are the Administrator**  
You do **not** need to add yourself as Tester. Admins can already test all permissions, generate tokens, and use all features in Development mode. You're covered for recording with your own account.

**When you actually need a Tester**
- Meta reviewers may need test accounts (they do **not** use your admin account; they need a clear screencast and test instructions).
- You want someone else (teammate, QA) to test the app.
- You're testing permissions in Development mode with a non-admin flow.
- You need an **Instagram Tester** specifically (for Instagram Basic Display or Instagram features): add the person as **Instagram Tester** in App roles and have them **accept the invite in the Instagram app** (Settings → Apps and Websites or the invite notification).

**Two different things**
1. **App roles** (Roles tab): Administrator, Developer, **Tester**, **Instagram Tester** – real people you invite; they need a Facebook Developer Account to be added.
2. **Test users** (Test users tab): "Create Test Facebook Accounts" creates **synthetic** (fake) accounts for development only; not used for App Review screencasts.

**For Meta App Review**  
Adding yourself as Tester does not affect approval. Meta reviewers require a clear screencast, real business usage, and test instructions. **Meta sometimes prefers screencasts that show a non-admin account** (a Tester) going through the flow.

**Recommendation for Agent4Socials**  
- Keep yourself as Administrator.  
- Add **one separate real Facebook account** as **Tester** (and as **Instagram Tester** if you demo Instagram); that person must have a Facebook Developer Account and accept the invite.  
- Record the screencast with that Tester account (or with your Admin account; both are valid). If Meta has asked for test accounts, use the Tester for the recording.

---

## Why some scopes don't appear in "Create Test Facebook Accounts"

The **"Create Test Facebook Accounts"** modal (under App roles → Test users) creates **synthetic** test accounts. The **Login permissions** dropdown there only lists a limited set of permissions and often **does not include**:

- **instagram_business_manage_messages** – This is an **Instagram** scope (Instagram Login / Instagram Graph API). The "Create Test Facebook Accounts" flow is for **Facebook** login only, so Instagram scopes usually do not appear there.
- **pages_read_user_content** – May not appear until the permission is added to your app (App Review → Permissions and features) or may be under a different label. It also may not be offered in the synthetic test-user permission list.
- **pages_manage_posts** – Sometimes only appears after the permission is added to the app under App Review → Permissions and features (or Use cases → Facebook Login → Customize).

**You do not need to select these scopes in that modal for your screen recording.** For App Review you should use **real people as Testers**, not synthetic test users:

1. In **App roles** → **Test users**, use **Add Testers** (invite a real person by email/Facebook account). Do not rely on "Create test users" for the permission list.
2. When a **Tester** (real person) opens your app and clicks "Connect Facebook" or "Connect Instagram", they go through the **real OAuth flow**. The consent screen shows **exactly the scopes your app requests** in code (e.g. in `apps/web/src/app/api/social/oauth/[platform]/start/route.ts`). You do not pick those scopes in the Meta dashboard; your app's OAuth URL already includes them.
3. So: add the permissions to your app under **App Review → Permissions and features** (or **Use cases** → Facebook Login / Instagram → Customize), then ensure your **OAuth scope string** in the code includes `pages_manage_posts`, `pages_read_user_content` (if you use it), and `instagram_business_manage_messages` (for Instagram-only login). After that, when a Tester connects, they will see and grant those scopes in the real login dialog.

---

## Part 2: One test account, one recording (recommended)

Use **one test account** (your own or a teammate’s) that has:
- A **Facebook account**
- A **Facebook Page** (admin)
- An **Instagram Business/Creator account** linked to that Page

Then record **one continuous flow** that touches all the scopes you’re requesting. That way the reviewer sees a single, coherent user journey instead of disjointed clips.

---

## Part 3: What to show for each scope

For each permission, the recording must show: **(1)** the user granting the permission (OAuth dialog) and **(2)** the feature in your app that uses that permission. Use the table below to know where each scope appears and what to show.

| Scope | Where it's requested | What to show in the app (user experience) |
|-------|---------------------|--------------------------------------------|
| **pages_read_user_content** | Facebook Login (if you add it) | User sees **Page posts** (e.g. Dashboard or History listing their Page’s posts). Show: open Dashboard or Post History, select Facebook, show the list of posts from the Page. |
| **pages_manage_posts** | Facebook Login | **Publish a post to the Facebook Page.** Show: Composer → write caption → select Facebook → Post Now → confirm post appears in History / on the Page. |
| **pages_manage_engagement** | Facebook Login | **Engagement on Page posts:** Inbox → Facebook → **Engagement** tab (likes, comments, shares). Also: **Comments** tab for Page post comments. Optionally Dashboard with post engagement metrics. |
| **pages_messaging** | Facebook Login | **Page DMs (Inbox).** Show: Inbox → Facebook → **Messages** tab; show conversations (or empty state with “Messages” clearly visible). |
| **instagram_content_publish** | Instagram via Facebook (same Facebook Login) | **Publish a post to Instagram.** Show: Composer → select **Instagram** (connected via Facebook) → add photo/caption → Post Now → confirm on Instagram or in History. |
| **instagram_manage_comments** | Instagram via Facebook | **Instagram comments** in your app. Show: Inbox → Instagram → **Comments** tab; show comments on IG posts (or empty state). |
| **instagram_manage_messages** | Instagram via Facebook | **Instagram DMs.** Show: Inbox → Instagram → **Messages** tab; show conversations (or empty state). |
| **instagram_business_manage_messages** | Instagram-only Login (separate flow) | Same as above but when connecting via **“Connect with Instagram”** (no Facebook). Show: connect Instagram → then Inbox → Instagram → Messages. |

---

## Part 4: Suggested recording script (one flow that covers all scopes)

Do this with the **test account** in a **single browser session**, with annotations so the reviewer knows which permission they’re seeing.

1. **Intro (5 s)**  
   - Open https://agent4socials.com.  
   - Annotation: “Agent4Socials – social media management (agent4socials.com)”.

2. **Login (10 s)**  
   - Log in with email/password (no Facebook Login).  
   - Annotation: “User logs in with email/password”.

3. **Dashboard (5 s)**  
   - Show sidebar with connected accounts (or empty).  
   - Annotation: “Dashboard”.

4. **Connect Facebook (and Instagram via Facebook) (30 s)**  
   - Click Connect **Facebook** (or the + next to Facebook).  
   - On the **Facebook OAuth dialog**, slowly scroll so every requested permission is visible (e.g. pages_read_user_content, pages_manage_posts, pages_manage_engagement, pages_messaging, and for Instagram: instagram_content_publish, instagram_manage_comments, instagram_manage_messages).  
   - Annotation: “User connects Facebook; permissions requested: [list the ones you’re asking for]”.  
   - Select the **Page** (and ensure Instagram is linked to that Page).  
   - Complete the flow; return to Agent4Socials with Facebook (and Instagram) connected.  
   - Annotation: “Facebook and Instagram connected”.

5. **Publish to Facebook – pages_manage_posts (25 s)**  
   - Composer → write a short caption → select **Facebook** → Post Now.  
   - Annotation: “Publishing to Facebook Page (pages_manage_posts)”.  
   - Show success and, if possible, the post in History or on the Page.  
   - Annotation: “Post published to Facebook Page”.

6. **Publish to Instagram – instagram_content_publish (25 s)**  
   - Composer → add photo → caption → select **Instagram** → Post Now.  
   - Annotation: “Publishing to Instagram (instagram_content_publish)”.  
   - Show success and/or the post in History.  
   - Annotation: “Post published to Instagram”.

7. **Page engagement and comments – pages_manage_engagement (20 s)**  
   - Inbox → select **Facebook** → open **Engagement** tab (show likes/comments/shares if any).  
   - Annotation: “Page engagement (pages_manage_engagement)”.  
   - Open **Comments** tab; show comments on Page posts (or “No comments” state).  
   - Annotation: “Page post comments (pages_manage_engagement)”.

8. **Page messages – pages_messaging (15 s)**  
   - Inbox → Facebook → **Messages** tab.  
   - Show conversations or “No conversations” / “Messages” UI.  
   - Annotation: “Page messages / Inbox (pages_messaging)”.

9. **Instagram comments – instagram_manage_comments (15 s)**  
   - Inbox → select **Instagram** → **Comments** tab.  
   - Show comments on IG posts or empty state.  
   - Annotation: “Instagram comments (instagram_manage_comments)”.

10. **Instagram messages – instagram_manage_messages (15 s)**  
    - Inbox → Instagram → **Messages** tab.  
    - Show conversations or empty state.  
    - Annotation: “Instagram messages (instagram_manage_messages)”.

11. **Page content (if you use pages_read_user_content) (10 s)**  
    - Dashboard or History → Facebook → show list of **Page posts**.  
    - Annotation: “Page posts (pages_read_user_content)”.

12. **End (3 s)**  
    - Annotation: “End of demo – all permissions shown in real user flow”.

---

## Part 5: If you use “Connect with Instagram” (no Facebook)

For **instagram_business_manage_messages** (and other instagram_business_* scopes):

1. Use an account that is a **test user** of your app.
2. In Agent4Socials, start **Connect Instagram** and choose the option that uses **Instagram’s own login** (not “Connect with Facebook”).
3. Complete Instagram OAuth; then show **Inbox → Instagram → Messages** (and Comments if you use instagram_business_manage_comments).
4. In the same recording (or a second one), add a short segment: “Connect with Instagram (no Facebook)” → OAuth dialog → then Inbox → Instagram → Messages.  
   Annotation: “Instagram DM inbox (instagram_business_manage_messages)”.

---

## Part 6: Recording tips (so it’s clearly “actual user experience”)

- **Show the real UI:** Always show your actual app (agent4socials.com) and real clicks (Connect Facebook, Composer, Inbox tabs). Avoid static mockups or slides.
- **Show the permission dialog:** For each flow (Facebook Login, or Instagram Login), show the OAuth screen and scroll so the requested permissions are visible.
- **Show the result:** After “Post Now”, show the post in History or on the platform; for Inbox, show the Messages/Comments/Engagement tabs with real (or empty) data.
- **Annotations:** Use on-screen text for each step (e.g. “Publishing to Facebook (pages_manage_posts)”) so reviewers can match the permission to the feature.
- **One continuous flow:** Prefer one 2–4 minute recording that walks through login → connect → publish → inbox, rather than separate clips that don’t show a full user journey.
- **Language:** Use **English** for UI and annotations (or add English captions).
- **Technical:** 1080p or better; record browser only; no audio needed; export MP4 or MOV.

---

## Part 7: Ensure scopes are requested in your app

Your app must **request** each permission in the OAuth URL; otherwise the token won’t have it and the feature won’t work (and reviewers won’t see it).

- **Facebook** (Connect Facebook):  
  Current scope in `apps/web/src/app/api/social/oauth/[platform]/start/route.ts` (case `'FACEBOOK'`) is:  
  `pages_read_engagement,pages_show_list,pages_manage_posts,read_insights,business_management`.  
  If you need **pages_manage_engagement**, **pages_messaging**, or **pages_read_user_content**, add them to that scope string and redeploy. Then reconnect Facebook so the new token includes them.

- **Instagram via Facebook:**  
  Same route, case `'INSTAGRAM'` (when not `method === 'instagram'`) already includes e.g. `instagram_content_publish`, `instagram_manage_messages`, `instagram_manage_insights`, …  
  If you need **instagram_manage_comments**, add it to that scope string, then reconnect Instagram (via Facebook).

- **Instagram-only:**  
  The `method === 'instagram'` branch already requests `instagram_business_manage_messages` (and others). No change unless you add more instagram_business_* scopes.

After changing scopes: **disconnect and reconnect** the affected account in Agent4Socials so the stored token has the new permissions. Then run through the recording again.

---

## Part 8: Checklist before submitting

- [ ] Test user added in Meta for Developers and invite accepted.
- [ ] Test user has a Facebook Page and an Instagram Business/Creator account linked to that Page.
- [ ] App is in Development mode; recording is done with the test account.
- [ ] Recording shows: login → connect Facebook (and Instagram) → OAuth dialog with permissions visible → publish to Facebook → publish to Instagram → Inbox (Engagement, Comments, Messages for both Facebook and Instagram).
- [ ] Every scope you’re submitting has a clear moment in the video (annotation + UI).
- [ ] OAuth scope strings in code include all permissions you’re requesting (and you’ve reconnected after any change).
- [ ] File is MP4 or MOV, 1080p+, English, no audio (or with English captions).

Using this flow, reviewers see a **real user** connecting an account, publishing content, and using Inbox (engagement, comments, messages), which matches what each requested scope is used for.
