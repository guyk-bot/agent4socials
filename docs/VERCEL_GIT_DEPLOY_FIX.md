# Why pushes to main don't create Vercel deployments (and how to fix it)

## Root cause: Commit author not recognized by Vercel

Vercel only starts a deployment when the **commit author** can be matched to a GitHub user who has access to the Vercel project. Commits made from Cursor, automation, or with a local/machine email (e.g. `guykogen@guys-MacBook-Air.local`) are not linked to a GitHub account, so Vercel **does not create a deployment** for those pushes.

---

## Recommended fix: Deploy Hook + GitHub Action (works for every push)

This makes **every** push to `main` trigger a Vercel deployment, regardless of who authored the commit.

### 1. Create a Deploy Hook in Vercel

1. Open [Vercel](https://vercel.com) → your **web** project (the Next.js app).
2. **Settings** → **Git** → scroll to **Deploy Hooks**.
3. Click **Create Hook**. Name it e.g. **GitHub Push**, branch **main**, then **Create**.
4. **Copy the generated URL** (e.g. `https://api.vercel.com/v1/integrations/deploy/...`). Treat it like a password; don’t commit it.

### 2. Add the URL as a GitHub secret

1. Open **GitHub** → repo **guyk-bot/agent4socials** → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**: name = **`VERCEL_DEPLOY_HOOK_URL`**, value = the URL from step 1.

### 3. Add the workflow file (one-time)

GitHub only allows creating/updating workflow files with a token that has **workflow** scope. If the workflow file is not yet in the repo, create it in GitHub:

1. **GitHub** → repo → **Add file** → **Create new file**.
2. Name the file: **`.github/workflows/trigger-vercel-deploy.yml`** (include the path).
3. Paste the contents below, then **Commit changes** → **Commit directly to main**.

```yaml
name: Trigger Vercel deploy

on:
  push:
    branches: [main]

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Vercel Deploy Hook
        run: |
          if [ -n "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}" ]; then
            curl -fsS -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}"
            echo "Vercel deploy triggered."
          else
            echo "VERCEL_DEPLOY_HOOK_URL not set. Add it in repo Secrets to trigger deploys on push."
          fi
        env:
          VERCEL_DEPLOY_HOOK_URL: ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}
```

### 4. Done

Once the secret and workflow file are in place, every push to `main` will trigger a new Vercel deployment. No need to change Git author or amend commits.

---

## Alternative: Fix commit author (only works when you push from your machine)

### 1. Set your Git identity to your GitHub account

Use the **same email** that your GitHub account uses (and that is connected to Vercel):

```bash
git config --global user.email "YOUR_GITHUB_EMAIL@example.com"
git config --global user.name "YOUR_GITHUB_USERNAME"
```

To see which email GitHub has for you: GitHub → **Settings** → **Emails** (use the primary or the one you use to log in / that Vercel is linked to).

### 2. Optional: Fix the last commit so it deploys

So the latest push gets a deployment without waiting for the next commit:

```bash
git commit --amend --reset-author --no-edit
git push --force-with-lease origin main
```

That rewrites the last commit to use your configured name/email; then push again. Vercel should trigger a deployment for that push.

### 3. Ensure Vercel for GitHub can see this repo

- **Vercel:** [Account → Authentication](https://vercel.com/account/authentication) – confirm GitHub is connected.
- **GitHub:** The repo is `guyk-bot/agent4socials`. The Vercel GitHub App must have access to this repo:
  - If you use **guyk-bot** as the repo owner: install [Vercel for GitHub](https://github.com/apps/vercel) on the **guyk-bot** account (or the org that owns the repo) and grant access to `agent4socials`.
  - Or in GitHub: **Settings** → **Integrations** → **Applications** → **Vercel** – ensure this repository is allowed.

### 4. If the repo is private and the project is in a Vercel Team

You must be a **member** of that Vercel team (or owner if Hobby). The commit author (after step 1) must be the same GitHub user that is linked to that Vercel account.

---

## Summary

| Fix | When to use |
|-----|-------------|
| **Deploy Hook + GitHub Action** | Best: every push to `main` triggers a deploy (any author). One-time setup: create hook in Vercel, add `VERCEL_DEPLOY_HOOK_URL` in GitHub repo Secrets. |
| **Commit author** | Alternative: set `git config user.email` and `user.name` to your GitHub identity; only pushes you make from that machine will trigger Vercel. |

---
*Last doc update: added GitHub Action + Deploy Hook so pushes from any author trigger Vercel.*
