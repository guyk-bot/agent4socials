#!/bin/bash
# Run this once from your machine to add the Vercel deploy workflow and push it.
# GitHub only allows creating/updating workflow files when the push uses a token
# with "workflow" scope (e.g. your normal git credentials). This script does
# that one-time add + push. After that, every push to main will trigger Vercel.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p .github/workflows
cat > .github/workflows/trigger-vercel-deploy.yml << 'WORKFLOW'
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
WORKFLOW

git add .github/workflows/trigger-vercel-deploy.yml
if git diff --cached --quiet; then
  echo "Workflow already committed. Nothing to push."
  exit 0
fi
git commit -m "Add workflow to trigger Vercel deploy on every push to main"
git push origin main
echo ""
echo "Done. Next: create a Deploy Hook in Vercel and add VERCEL_DEPLOY_HOOK_URL in GitHub repo Secrets (see docs/VERCEL_GIT_DEPLOY_FIX.md)."
