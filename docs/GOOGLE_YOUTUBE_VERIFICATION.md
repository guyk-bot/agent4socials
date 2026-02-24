# Google YouTube scope verification – minimum scopes and video guidelines

Use this to fix the **Request minimum scopes** and **App functionality (video)** feedback from Google.

---

## 1. Request only the scopes you need

Your app’s OAuth flow already requests only two scopes in code:

- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`

In **Google Cloud Console → Google Auth Platform → Data Access** you currently have extra sensitive scopes. Remove everything except these two.

### Keep (required)

| Scope | Why you need it |
|-------|------------------|
| **youtube.readonly** | So users can connect their YouTube channel and the app can show which channel is connected and basic account/channel info in the dashboard (e.g. channel name, connection status). Read-only; no posting or editing. |
| **youtube.upload** | So users can publish videos to YouTube from the Composer: schedule or post now, and the app uploads the video to the connected channel. No edit/delete of existing videos; only upload of new videos the user creates in the app. |

### Remove (not used by the app)

Remove these from “Your sensitive scopes” in Data Access so they are not requested:

- **youtube** (Manage your YouTube account) – Broader than needed; you only need readonly + upload.
- **youtube.force-ssl** – Edit/delete existing videos. The app only uploads new videos and does not edit or delete existing ones.
- **youtubepartner** – Partner/content-owner features. Not used.
- **youtubepartner-channel-audit** – Audit with a YouTube partner. Not used.
- **youtube.channel-memberships.creator** – Channel members list. Not used.
- **youtube.third-party-link.creator** – Link apps to channel. Not used.

After removing them, only **youtube.readonly** and **youtube.upload** should remain in “Your sensitive scopes”.

---

## 2. Scope justification (copy into “How will the scopes be used?”)

Use this (or adapt it) in **Data Access → Enter justification here** so Google sees a clear, detailed explanation. Stay under the character limit (e.g. 1000); shorten if needed.

**Suggested justification:**

> Agent4Socials is a social media management dashboard (like Metricool or Hootsuite). Users connect their YouTube channel once, then create and schedule posts (including videos) from one place alongside Instagram, Facebook, X, LinkedIn, and TikTok.
>
> **youtube.readonly**  
> We use this so the user can connect their YouTube channel and we can show which channel is connected and basic channel/account information in the dashboard (e.g. channel name, connection status). We do not access private or sensitive data beyond what is needed to display the connected channel. We do not use broader “manage” or “edit” scopes because we only need to read connection and basic channel info.
>
> **youtube.upload**  
> We use this so the user can publish videos to their connected YouTube channel from our Composer: they create a post, optionally attach a video, select YouTube as a destination, and either schedule or publish now. Our app then uploads that video to their channel on their behalf. We do not edit, delete, or manage existing videos on the channel; we only upload new videos that the user has created in our app. We therefore do not request youtube.force-ssl or other edit/delete scopes.
>
> We do not use youtubepartner, channel-memberships, or third-party-link scopes; our app does not access partner features, member lists, or link external apps to the channel. We request only these two scopes so users can connect their channel (readonly) and publish new videos from our dashboard (upload).

If the field has a strict character limit, use this shorter version:

> Agent4Socials is a social media management app. Users connect their YouTube channel and publish videos from our Composer alongside other platforms.
>
> **youtube.readonly** – Used only to connect the user’s channel and show which channel is connected and basic channel info in the dashboard. We do not need “manage” or edit scopes for this.
>
> **youtube.upload** – Used so users can publish new videos to their channel from our Composer (schedule or post now). We only upload new videos created in our app; we do not edit or delete existing videos, so we do not request youtube.force-ssl or other edit/delete scopes. We do not use partner, channel-memberships, or third-party-link scopes.

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

Demonstrate how the app uses the two scopes:

1. **youtube.readonly**  
   Show the connected YouTube channel in the dashboard (e.g. channel name, avatar, or “Connected” state). Optionally show that the user can disconnect or see that the channel is linked.

2. **youtube.upload**  
   Show the Composer:
   - Create a new post.
   - Add a video (or at least show the video option).
   - Select YouTube as a destination.
   - Either schedule the post or use “Post now” (you can say in the video that for the demo you will not actually publish, to avoid test uploads).
   - Optionally show the History/Posts list with a YouTube post or “scheduled for YouTube”.

Keep the video short (e.g. 1–3 minutes). Use clear captions or narration: “Connecting YouTube,” “Google consent screen,” “Back in the app,” “Creating a post for YouTube,” etc.

### Checklist for your video

- [ ] User starts in your app and clicks to connect YouTube.
- [ ] Google sign-in and **consent screen are clearly visible** (permissions listed).
- [ ] User approves; redirect back to your app is shown.
- [ ] Connected YouTube channel is shown in the app (readonly usage).
- [ ] Composer is shown: create post, attach video, select YouTube, schedule or post (upload usage).
- [ ] No cuts that hide the consent flow or the main actions.

---

## 4. After you change scopes

1. In **Data Access**, remove the extra sensitive scopes and save the new justification.
2. Ensure your **OAuth consent screen** only includes the two scopes (youtube.readonly and youtube.upload). If you had added others in “Scopes for Google APIs,” remove them so the consent screen matches.
3. Re-record the demo video to include the OAuth flow and the functionality above.
4. Resubmit in the **Verification Center** with the new video and, if asked, a short note that you reduced scopes to youtube.readonly and youtube.upload and updated the justification.

Your app’s OAuth URL in code already uses only these two scopes (`apps/web/src/app/api/social/oauth/[platform]/start/route.ts`). The change is in the Google Cloud Console (Data Access and OAuth consent screen), not in the codebase.
