# Google YouTube scope verification – minimum scopes and video guidelines

Use this to fix the **Request minimum scopes** and **App functionality (video)** feedback from Google.

---

## 1. Request only the scopes you need

Your app requests **four** scopes so users can: connect their channel and see full channel details, upload videos from the Composer, reply to comments from the Inbox, and view YouTube Analytics.

In **Google Cloud Console → Google Auth Platform → Data Access**, keep exactly these four in “Your sensitive scopes” (and add **YouTube Analytics API** scope if it appears under a separate section):

### Keep (all required)

| Scope | Why you need it |
|-------|------------------|
| **youtube.readonly** | View the user’s YouTube channel and account: channel name, avatar, subscriber count, video count, and other channel details in the dashboard. List comments on videos so the user can see and reply to them in the Inbox. Read-only; no posting. |
| **youtube.upload** | Publish videos to the user’s channel from the Composer: user creates a post with a video, selects YouTube, and schedules or posts now; the app uploads the video on their behalf. |
| **youtube.force-ssl** | Reply to comments from within the Inbox. The YouTube Data API requires this scope for `comments.insert` (posting replies). We use it only to send replies the user writes in our app; we do not edit or delete the user’s existing videos or comments beyond what the user explicitly does in the UI. |
| **yt-analytics.readonly** | View YouTube Analytics reports for the connected channel: views, watch time, demographics, traffic sources, retention, and other metrics in the dashboard. Read-only; no changes to the channel. |

### Remove (not used by the app)

Remove these from “Your sensitive scopes” if present:

- **youtube** (Manage your YouTube account) – Broader than needed; we use specific readonly, upload, and force-ssl scopes instead.
- **youtubepartner** – Partner/content-owner features. Not used.
- **youtubepartner-channel-audit** – Audit with a YouTube partner. Not used.
- **youtube.channel-memberships.creator** – Channel members list. Not used.
- **youtube.third-party-link.creator** – Link apps to channel. Not used.

Optional: **yt-analytics-monetary.readonly** only if you need revenue/monetization reports; otherwise do not request it.

---

## 2. Scope justification (copy into “How will the scopes be used?”)

Use this (or adapt it) in **Data Access → Enter justification here**. Stay under the character limit (e.g. 1000); shorten the bullet text if needed.

**Suggested justification:**

> Agent4Socials is a social media management dashboard (like Metricool or Hootsuite). Users connect their YouTube channel to: view channel details and analytics, publish videos from the Composer, and view and reply to comments from the Inbox.
>
> **youtube.readonly** – We use this to connect the user’s channel and display full channel details in the dashboard (channel name, avatar, subscriber count, video count) and to list comments on their videos so they can view and reply in our Inbox. Read-only; no posting.
>
> **youtube.upload** – Users publish new videos to their channel from our Composer (create post, attach video, select YouTube, schedule or post now). We only upload new videos the user creates in our app; we do not edit or delete existing videos.
>
> **youtube.force-ssl** – Required by the YouTube Data API to post replies to comments. In our Inbox, the user selects a comment and writes a reply; we call comments.insert on their behalf. We use this scope only for posting the user’s replies; we do not edit or delete their existing videos or comments elsewhere.
>
> **yt-analytics.readonly** – We display YouTube Analytics for the connected channel in the dashboard (views, watch time, demographics, traffic sources, retention). Read-only reports; no changes to the channel.
>
> We do not use youtubepartner, channel-memberships, or third-party-link scopes.

**Shorter version (if character limit is tight):**

> Agent4Socials is a social media dashboard. Users connect YouTube to: see channel details and analytics, publish videos from the Composer, and reply to comments from the Inbox.
>
> **youtube.readonly** – Connect channel, show channel details (name, subscribers, etc.), and list comments in the Inbox. **youtube.upload** – Upload videos from Composer (schedule or post now). **youtube.force-ssl** – Post replies to comments from the Inbox (API requires this for comments.insert). **yt-analytics.readonly** – Show Analytics reports (views, watch time, demographics, traffic) in the dashboard. We do not use partner, channel-memberships, or third-party-link scopes.

---

## 3. Video guidelines (App functionality)

Google said:

1. The demo video does **not show the OAuth consent flow**.
2. The demo video does **not sufficiently demonstrate the functionality** of the app.

Your video should do both, in order.

### Part A: Show the OAuth consent flow (required)

1. **Start on your app** (e.g. Dashboard or Accounts).
2. **Click “Connect” (or equivalent) for YouTube** so the user is sent to Google’s sign-in and consent screen.
3. **Show the Google consent screen** (account picker and the list of requested permissions, e.g. “View your YouTube account” and “Manage your YouTube videos”).
4. **Show the user clicking “Continue” or “Allow”** to grant access.
5. **Show the redirect back to your app** and that the YouTube account is now connected (e.g. channel name or “Connected” in the dashboard).

Use a single continuous recording (or clear cuts) so reviewers see: your app → Google → back to your app. Do not skip the consent screen.

### Part B: Show app functionality (required)

Demonstrate how the app uses the four scopes:

1. **youtube.readonly**  
   Show the connected YouTube channel in the dashboard (channel name, avatar, subscriber count, or “Connected” state). Show the Inbox with YouTube selected and comments listed (reading comments).

2. **youtube.upload**  
   Show the Composer: create a post, add a video, select YouTube, schedule or “Post now” (you can say you are not actually publishing in the demo).

3. **youtube.force-ssl**  
   In the Inbox, select a YouTube comment and show the reply box; type a reply and send (or explain that the user would click Send to post the reply via the API).

4. **yt-analytics.readonly**  
   Show the Analytics (or Dashboard) view for the YouTube channel with metrics (views, watch time, or other reports if already built).

Keep the video short (e.g. 1–3 minutes). Use clear captions or narration: “Connecting YouTube,” “Google consent screen,” “Back in the app,” “Channel details,” “Inbox comments,” “Reply to comment,” “Analytics,” etc.

### Checklist for your video

- [ ] User starts in your app and clicks to connect YouTube.
- [ ] Google sign-in and **consent screen are clearly visible** (permissions listed).
- [ ] User approves; redirect back to your app is shown.
- [ ] Connected YouTube channel and channel details are shown (readonly).
- [ ] Inbox: YouTube comments listed; user selects a comment and replies (force-ssl).
- [ ] Composer: create post, video, select YouTube, schedule or post (upload).
- [ ] Analytics/dashboard with YouTube metrics shown if available (yt-analytics.readonly).
- [ ] No cuts that hide the consent flow or the main actions.

---

## 4. After you change scopes

1. In **Data Access**, keep only the four scopes above (youtube.readonly, youtube.upload, youtube.force-ssl, yt-analytics.readonly). Remove youtubepartner, youtubepartner-channel-audit, channel-memberships, third-party-link. Add **yt-analytics.readonly** in the Console if it appears under a separate “YouTube Analytics API” or similar section.
2. Ensure your **OAuth consent screen** includes exactly these four scopes (and no extra ones).
3. Re-record the demo video to include the OAuth flow and the four functionalities (channel details, Inbox comments + reply, Composer upload, Analytics).
4. Resubmit in the **Verification Center** with the new video and updated justification.

Your app’s OAuth URL in code requests these four scopes in `apps/web/src/app/api/social/oauth/[platform]/start/route.ts`. After verification, implement or complete the YouTube Inbox (fetch comments, reply via API) and YouTube Analytics in the dashboard if not already done.
