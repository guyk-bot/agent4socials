# Screen Recording Script: pages_manage_engagement

Step-by-step guide for recording the screencast to submit to Meta App Review for the **pages_manage_engagement** permission.

---

## Before you record

- Set your browser language to **English**.
- Resolution: **1440px wide or less**, 1080p or better.
- Increase your mouse cursor size (System Settings → Accessibility → Display → Cursor size).
- Use **QuickTime** (File → New Screen Recording) or **OBS** (free). No audio needed.
- Record only the browser window (not the full desktop).
- Add **text annotations** (captions) at each step. If using QuickTime, add them afterward in iMovie. If using OBS, use the text overlay feature.

---

## Recording script (follow these steps in order)

### Scene 1: Show Agent4socials logged out (5 sec)

1. Open **https://agent4socials.com** in Chrome.
2. Show the landing page (logged out). Pause briefly so the reviewer sees the app name and URL.
3. **Annotation:** "Agent4socials, a social media management app"

### Scene 2: Log in without Facebook (10 sec)

1. Click **Log in** (or **Sign up** if showing first-time flow).
2. Enter your email and password (the app's own login, not Facebook).
3. Submit and wait for the dashboard to load.
4. **Annotation:** "User logs in with email/password (no Facebook Login required)"

### Scene 3: Navigate to the Dashboard (5 sec)

1. Show the dashboard with the sidebar visible (Instagram, Facebook, TikTok, YouTube, Twitter/X, LinkedIn icons).
2. **Annotation:** "Dashboard showing connected social accounts"

### Scene 4: Connect Facebook (Facebook Login flow) (20 sec)

1. In the sidebar, click the **+** button next to **Facebook** (or click "Facebook" if not connected).
2. The app redirects to Facebook's OAuth dialog.
3. **Annotation:** "User clicks 'Connect Facebook' to start Facebook Login"
4. On the Facebook dialog, show the permissions being requested. Slowly scroll so the reviewer can see **pages_manage_engagement** (or "Manage engagement with your Pages") listed.
5. **Annotation:** "Facebook Login dialog requesting pages_manage_engagement and other Page permissions"
6. Select the **Facebook Page** you want to grant access to (check the box next to your Page name).
7. **Annotation:** "User selects which Page(s) the app can access"
8. Click **Continue** / **Done** to grant permissions.
9. The app redirects back to Agent4socials and shows the Facebook account as connected.
10. **Annotation:** "Facebook account connected successfully"

### Scene 5: Show the Inbox with engagement data (15 sec)

1. Click **Inbox** in the top navigation bar.
2. Click the **Facebook** icon in the left sidebar to select Facebook.
3. Click the **Engagement** tab (next to Messages and Comments).
4. **Annotation:** "Inbox → Facebook → Engagement tab, showing engagement data from the connected Page (uses pages_manage_engagement)"
5. Pause briefly to show the engagement view.

### Scene 6: Show the Inbox with comments (15 sec)

1. Still in the Inbox, click the **Comments** tab.
2. Show comments loading (or the empty state if no comments yet).
3. **Annotation:** "Comments on Facebook Page posts, read using pages_manage_engagement"

### Scene 7: Show posts with engagement metrics (15 sec)

1. Navigate to the **Dashboard** (click the account/dashboard link).
2. Show the connected Facebook Page's overview, which displays post engagement (likes, comments, shares).
3. **Annotation:** "Dashboard shows Page post engagement (likes, comments, shares) retrieved via pages_manage_engagement"

### Scene 8: Compose and publish a post to the Facebook Page (30 sec)

1. Click **Composer** in the top navigation bar.
2. Type a short post (e.g. "Testing post engagement for app review").
3. Under the platform targets, check **Facebook** (your connected Page).
4. **Annotation:** "User creates a new post in the Composer targeting their Facebook Page"
5. Click **Post Now** (or **Schedule** if preferred).
6. Wait for the post to be published (the status changes to "Posted").
7. **Annotation:** "Post published to the Facebook Page using pages_manage_posts. Engagement on this post (likes, comments, shares) will be read using pages_manage_engagement."

### Scene 9: View the published post (10 sec)

1. Open the Facebook Page in a new tab (or click the external link from the dashboard).
2. Show the post appearing on the Page.
3. **Annotation:** "Published post visible on the Facebook Page"

### Scene 10: End (3 sec)

1. Return to the Agent4socials dashboard.
2. **Annotation:** "End of pages_manage_engagement demo"

---

## Total estimated length: 2 to 3 minutes

---

## Key points for the reviewer

- The app uses **pages_manage_engagement** to:
  1. Read engagement (likes, comments, shares) on Facebook Page posts in the Inbox and Dashboard.
  2. Display comment threads from Page posts so the user can view and reply.
  3. Show engagement metrics (reactions, shares) on published posts.
- The permission is requested during the **Facebook Login** OAuth flow (Scene 4).
- The data is shown only to the account owner within the app.

---

## Checklist before submitting

- [ ] Recording is in English (or has English captions/annotations).
- [ ] Recording is 1080p or better.
- [ ] Shows: logged-out state → login → connect Facebook → Page selection → data usage.
- [ ] Every annotation references **pages_manage_engagement** where relevant.
- [ ] No audio (Meta reviewers will not listen to it).
- [ ] File format: MP4 or MOV.
- [ ] Upload the recording to the App Review submission form under the **pages_manage_engagement** permission.

---

## Annotation text (copy-paste ready)

Use these as text overlays at each step:

1. "Agent4socials: social media management app (agent4socials.com)"
2. "User logs in with email/password (no Facebook Login required)"
3. "Dashboard showing connected social accounts"
4. "User clicks 'Connect Facebook' to start Facebook Login"
5. "Facebook Login dialog requesting pages_manage_engagement"
6. "User selects which Page(s) the app can access"
7. "Facebook account connected successfully"
8. "Inbox → Facebook → Engagement tab (uses pages_manage_engagement to read Page engagement)"
9. "Comments on Facebook Page posts (read via pages_manage_engagement)"
10. "Dashboard: Page post engagement metrics (likes, comments, shares)"
11. "Composer: creating a post targeting Facebook Page"
12. "Post published. Engagement will be tracked via pages_manage_engagement"
13. "Published post visible on Facebook Page"
14. "End of pages_manage_engagement demo"
