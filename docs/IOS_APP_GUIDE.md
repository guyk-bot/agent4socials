# Agent4Socials – iOS App Guide

You have two ways to get the app on iPhone: **Progressive Web App (PWA)** or **native-style app on the App Store** using a wrapper. This guide covers both.

---

## Option 1: Progressive Web App (PWA) – No App Store

Users install from Safari (“Add to Home Screen”). No Apple review, no Xcode. Best for a fast win.

### Step 1: Add a web manifest

Create `apps/web/public/manifest.json`:

```json
{
  "name": "Agent4Socials",
  "short_name": "Agent4Socials",
  "description": "Schedule posts and get analytics across Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8FAFC",
  "theme_color": "#22FF88",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

(If you add PNG icons later, e.g. 192x192 and 512x512, reference them here.)

### Step 2: Link the manifest and set meta tags

In `apps/web/src/app/layout.tsx`, inside `<head>` (or in a root layout that renders `<head>`), add:

- `<link rel="manifest" href="/manifest.json" />`
- `<meta name="theme-color" content="#22FF88" />`
- `<meta name="apple-mobile-web-app-capable" content="yes" />`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
- `<meta name="apple-mobile-web-app-title" content="Agent4Socials" />`
- Optional: `<link rel="apple-touch-icon" href="/icon.svg" />` (or a 180x180 PNG)

Next.js 13+ App Router: add these in the root `layout.tsx` via the `metadata` export and/or a `<link>` in the layout body, or use `next/head` in a client component if needed.

### Step 3: Deploy and test on iPhone

1. Deploy the web app (e.g. Vercel) so it’s served over **HTTPS**.
2. On iPhone, open **Safari** and go to your site (e.g. `https://agent4socials.com`).
3. Tap the Share button → **Add to Home Screen** → name it “Agent4Socials” → Add.
4. Open the icon from the home screen; it should open in standalone mode (no Safari UI).

**Pros:** No Xcode, no App Store review. **Cons:** Not in the App Store, some iOS limitations (e.g. push notifications need extra setup, some APIs differ from native).

---

## Option 2: App Store app (Capacitor wrapper)

This gives you an actual iOS app in the App Store that opens your existing web app in a full-screen WebView (using your live site URL). You’ll use **Capacitor** and **Xcode**.

### Prerequisites

- **Mac** with **Xcode** (from the Mac App Store).
- **Apple Developer account** (you have this).
- Web app **deployed and working over HTTPS** (e.g. `https://agent4socials.com`).

### Step 1: Install Xcode (if needed)

1. Open the **Mac App Store** and install **Xcode**.
2. Open Xcode once and accept the license; optionally install extra components when prompted.

### Step 2: Install Capacitor in the web app

From the **web app** directory (e.g. `apps/web`):

```bash
cd apps/web
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Agent4Socials" "com.agent4socials.app"
```

Use your real bundle ID if you already have one (e.g. `com.yourcompany.agent4socials`).

### Step 3: Configure Capacitor to load your live site

Edit `apps/web/capacitor.config.ts` (create it if `cap init` didn’t):

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agent4socials.app',
  appName: 'Agent4Socials',
  webDir: 'out',
  server: {
    url: 'https://agent4socials.com',
    cleartext: false,
  },
};
```

- `server.url`: your production URL. The app will load this in the WebView.
- `webDir`: can stay `out`; with `server.url` set, the app doesn’t need to bundle local HTML (it’s a “live” wrapper).

Save the file.

### Step 4: Add the iOS platform

Still in `apps/web`:

```bash
npx cap add ios
```

This creates an `ios/` folder with an Xcode project.

### Step 5: Open the project in Xcode

```bash
npx cap open ios
```

Xcode will open with the **Agent4Socials** project.

### Step 6: Signing and team

1. In Xcode, select the **Agent4Socials** project in the left sidebar.
2. Select the **Agent4Socials** target.
3. Open the **Signing & Capabilities** tab.
4. Check **Automatically manage signing**.
5. Choose your **Team** (your Apple Developer account).  
   - If you don’t see it: **Xcode → Settings → Accounts** → add your Apple ID and select the team.
6. Set **Bundle Identifier** to something unique (e.g. `com.agent4socials.app`). It must match what you’ll use in App Store Connect.

### Step 7: Run on a real device (optional but recommended)

1. Connect your iPhone with a cable.
2. In Xcode’s top bar, choose your **iPhone** as the run destination.
3. On the iPhone: **Settings → General → VPN & Device Management** (or **Profiles**) and trust your developer certificate if prompted.
4. In Xcode, click **Run** (play button). The app installs and opens on the device and should load your site.

### Step 8: Create the app in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com) and sign in.
2. **My Apps** → **+** → **New App**.
3. Choose **iOS**, enter:
   - **Name:** Agent4Socials  
   - **Primary Language**  
   - **Bundle ID:** pick the one you used in Xcode (e.g. `com.agent4socials.app`). If it’s not listed, create it in [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) under **Identifiers**.
   - **SKU:** e.g. `agent4socials-ios-1`
4. Create the app and open its **App Information** and **Pricing and Availability** as needed.

### Step 9: Archive and upload the build

1. In Xcode, set the run destination to **Any iOS Device (arm64)** (not a simulator).
2. Menu: **Product → Archive**.
3. When the archive finishes, the **Organizer** window opens. Select the new archive.
4. Click **Distribute App** → **App Store Connect** → **Upload**.
5. Follow the prompts (signing, options). When the upload completes, wait 10–30 minutes for processing.

### Step 10: Submit for review

1. In App Store Connect, open your app → **TestFlight** to see the build when it’s processed.
2. Go to the app’s **App Store** tab (or the version you’re preparing).
3. Under **Build**, select the uploaded build.
4. Fill in **What’s New**, **Description**, **Keywords**, **Screenshots** (required for each device size), **Privacy Policy URL**, **Category**, etc.
5. Click **Submit for Review**. Apple typically reviews within 24–48 hours.

---

## Summary

| Goal                         | Path    | Steps                                              |
|-----------------------------|---------|----------------------------------------------------|
| Install on iPhone quickly   | PWA     | Manifest + meta tags → deploy → Add to Home Screen |
| App in the App Store        | Capacitor | Capacitor + iOS → Xcode signing → Archive → Upload → Submit |

## Notes

- **Auth / cookies:** Your web app uses Supabase and cookies. Loading the same HTTPS URL in the Capacitor WebView should behave like Safari; test login and OAuth on a real device.
- **Deep links / universal links:** If you want links (e.g. password reset) to open in the app when installed, you’ll add associated domains and handle URLs in Capacitor later.
- **Push notifications:** For native iOS push you’d add a native plugin (e.g. Firebase or OneSignal) and configure capabilities in Xcode; that’s a separate follow-up.

If you tell me whether you want **PWA only** or **App Store (Capacitor)**, I can give you the exact file edits (e.g. for `layout.tsx` and `capacitor.config.ts`) tailored to your repo.
