# Google Search Console – Security issues ("Deceptive pages")

If Google flags agent4socials.com with **"Deceptive pages"**, it is often because crawlers hit OAuth or login callback URLs that redirect quickly. Those pages can look like "tricking" users (e.g. redirect after coming from another site). The site is legitimate; the following changes reduce the chance of false positives and help when you request a review.

## What we changed in the codebase

1. **robots.txt**
   - **Disallow `/api/`** – Prevents crawlers from indexing API routes, including OAuth callbacks (`/api/social/oauth/.../callback`).
   - **Disallow `/auth/callback`** – Prevents indexing the auth callback page that handles sign-in redirects.

2. **OAuth callback HTML (API route)**
   - Every HTML response from the social OAuth callback now includes:
     - **`<meta name="robots" content="noindex, nofollow">`** – Asks crawlers not to index the page.
     - **`<title>Agent4Socials – [context]</title>`** – Clear app name (e.g. "Agent4Socials – Account connected").
     - **Visible "Agent4Socials" in the body** – So any crawler that does see the page sees it’s our product, not a generic redirect.
   - Error pages use the same head (noindex + title "Agent4Socials – Connection failed").

3. **Auth callback page (`/auth/callback`)**
   - A layout was added that sets **`robots: { index: false, follow: false }`** so the sign-in callback page is not indexed.

## After deploying

1. **Deploy** these changes so production serves the updated `robots.txt` and callback HTML.
2. In **Google Search Console** → **Security & Manual Actions** → **Security issues**:
   - Click **"REQUEST REVIEW"**.
   - In the form, you can use text like the sample below.

## Sample "Request Review" text (copy and adjust)

You can paste something like this when requesting a review (shorten if there’s a character limit):

```
Agent4Socials (agent4socials.com) is a legitimate social media scheduling and analytics product. We do not host deceptive content.

The flagged "Deceptive pages" are likely our OAuth and login callback URLs. When users connect their Instagram, Facebook, TikTok, YouTube, Twitter, or LinkedIn accounts, or sign in with email/Google, they are redirected back to our domain on callback pages that then send them to the dashboard. These are standard OAuth 2.0 / OpenID Connect flows, not phishing.

We have:
- Updated robots.txt to disallow /api/ and /auth/callback so these technical URLs are not crawled.
- Added noindex and clear "Agent4Socials" branding to all OAuth callback HTML responses.
- Public Privacy Policy (https://agent4socials.com/privacy) and Terms of Service (https://agent4socials.com/terms).

We request that you re-scan and remove the security warning. Thank you.
```

## If the issue persists

- **Re-check Safe Browsing**: [Google Safe Browsing status](https://transparencyreport.google.com/safe-browsing/search?url=agent4socials.com)
- **No open redirects**: Our OAuth callbacks only redirect to our own dashboard URL (from env); we do not redirect to user-controlled URLs.
- **No phishing**: Login is via Supabase (email/password and Google OAuth); we do not collect passwords for other services. Social connections use each platform’s official OAuth with user consent.

If Google still shows sample URLs after a review, use those to see which path was flagged and add extra noindex or disallow rules for that path if needed.
