# Why pushes to main don't create Vercel deployments (and how to fix it)

## Root cause: Commit author not recognized by Vercel

Vercel only starts a deployment when the **commit author** can be matched to a GitHub user who has access to the Vercel project. Your recent commits use:

- **Author email:** `guykogen@guys-MacBook-Air.local` (local hostname, not a GitHub email)

Because that email is not associated with any GitHub account, Vercel cannot verify you and **does not create a deployment** for those pushes. Production branch and repo connection are correct; the blocker is author identity.

## Fix (do this once)

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

| Check | Status |
|-------|--------|
| Production branch = main | OK (you confirmed) |
| Repo connected = guyk-bot/agent4socials | OK (dashboard shows it) |
| **Commit author = GitHub email** | **Fix: set `user.email` and `user.name`** |
| Vercel GitHub App has repo access | Verify on GitHub / Vercel Auth |

After fixing the commit author and (if needed) repo access, every push to `main` from that identity should create a new deployment. No deploy hook needed for normal pushes.

---
*Last doc update: git post-push hook installed - deploys automatically on every push.*
