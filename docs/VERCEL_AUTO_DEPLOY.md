# Auto-deploy to Vercel on every push

So that you don't have to do anything after pushing, a GitHub Action can trigger your Vercel deploy hook on every push to `main`.

## One-time setup (do this in the browser)

GitHub only allows creating/editing workflow files when using a token with "workflow" scope. To avoid changing your push credentials, add the workflow once from the GitHub website:

1. **Add the repo secret**
   - Open your repo on GitHub → **Settings** → **Secrets and variables** → **Actions**
   - **New repository secret**
   - Name: `VERCEL_DEPLOY_HOOK`
   - Value: your Vercel deploy hook URL (from Vercel project → Settings → Git → Deploy Hooks)

2. **Create the workflow file**
   - In the repo, click **Add file** → **Create new file**
   - File path: `.github/workflows/trigger-vercel-deploy.yml`
   - Paste the contents of **docs/trigger-vercel-deploy-workflow.yml** (same folder as this doc)
   - Commit to `main`

After that, every push to `main` will run the action and trigger the deploy hook, so Vercel redeploys automatically.
