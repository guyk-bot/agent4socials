# Vercel Deploy Checklist – Why Deployments Might Not Show or Succeed

Use this to track down why the web app isn’t deploying.

---

## 1. GitHub → Vercel connection

- **Vercel** → **Settings** → **Git**
- **Connected Git Repository** must show **guyk-bot/agent4socials** and “Connected”.
- If it says “Disconnect” only and no repo, click **Connect Git Repository**, choose **GitHub**, then **guyk-bot/agent4socials**.
- **Production Branch** must be **main** (not `master` or something else).

---

## 2. Root Directory (critical)

- **Settings** → **Build and Deployment**
- **Root Directory** must be **`apps/web`** (no leading slash).
- If it’s empty or `.`, Vercel builds from repo root and won’t see the Next.js app → build fails or no deployment.

---

## 3. Build and install commands

With Root Directory = `apps/web`, leave these as default unless you have a reason to change:

- **Build Command:** `npm run build` (or leave default)
- **Install Command:** `npm install` (or leave default)
- **Output Directory:** leave default (Vercel uses `.next` for Next.js)

---

## 4. See all deployments (no filters)

- Go to **Deployments**.
- Click **“Clear Filters”** or set:
  - **All Branches**
  - **All Environments**
  - **All** statuses (not only “Production” or “Ready”).
- Check if any deployment appears (Building, Error, Canceled, Ready). If one is **Error** or **Canceled**, open it and read the **Build Logs** or **Logs** tab.

---

## 5. GitHub App / repo access

- On **GitHub**: **Settings** (of the repo) → **Integrations** → **Applications** → **Vercel**.
- Ensure Vercel has access to **guyk-bot/agent4socials**.
- If the repo is under an organization (**guyk-bot**), in **GitHub** go to the org **Settings** → **Third-party access** / **Installed GitHub Apps** and ensure **Vercel** is allowed for this org/repo.

---

## 6. Trigger a deploy from the repo

From your machine (in the project folder):

```bash
cd /Users/guykogen/Desktop/Agent4socials
git add -A && git status
git commit -m "Trigger Vercel deploy" --allow-empty
git push origin main
```

Then in Vercel:

- Wait 30–60 seconds and refresh **Deployments** (with filters cleared).
- You should see a new deployment (e.g. “Building” then “Ready” or “Error”).

---

## 7. Deploy from your machine with Vercel CLI (to see errors)

If the dashboard still shows no deployment or only failures, run a deploy locally to see the real error:

```bash
cd /Users/guykogen/Desktop/Agent4socials/apps/web
npx vercel
```

Log in if asked, then follow the prompts (link to the existing **agent4socials** project if you want). The CLI will run the build on your machine (or stream logs) and show any build failure.

---

## 8. Environment variables

- **Settings** → **Environment Variables**
- For the **web** app you only need **NEXT_PUBLIC_API_URL** = `https://api.agent4socials.com` (for Production).
- Don’t rely on `vercel.json` env like `@api_url` unless you created a variable named `api_url`; the repo’s `vercel.json` was simplified so the dashboard value is used.

---

## Summary of common causes

| Symptom | Likely cause |
|--------|----------------|
| “No deployments” / list empty | Wrong **Production Branch**, or GitHub not connected / no access. |
| Deployments list empty even after push | Filters hiding them → **Clear Filters** and check **All** statuses/branches. |
| Build fails immediately | **Root Directory** not set to **apps/web**. |
| Build fails in logs | Missing env, or install/build command wrong; run **npx vercel** in **apps/web** to see logs. |

After changing **Root Directory** or **Production Branch**, trigger a new deploy with a push to **main** and refresh **Deployments** with filters cleared.
