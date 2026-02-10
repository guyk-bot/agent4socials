# Getting Agent4Socials on Google

The site is set up for search engines. Here’s what’s in place and what you do next.

## What’s already in the codebase

- **Meta tags** – Title, description, and keywords for search and sharing.
- **Open Graph & Twitter cards** – Better previews when the site is shared on social.
- **Sitemap** – `https://agent4socials.com/sitemap.xml` lists public pages (home, pricing, privacy, terms, login, signup) so Google can discover them.
- **robots.txt** – `https://agent4socials.com/robots.txt` allows crawling of the site and points to the sitemap; dashboard and app areas are disallowed from indexing.

## Set the site URL (recommended)

In Vercel (or your host), set:

- **`NEXT_PUBLIC_SITE_URL`** = `https://agent4socials.com`

So the sitemap and `robots.txt` use the correct domain. If unset, the code falls back to `https://agent4socials.com`.

## Get indexed on Google: Google Search Console

1. **Open Google Search Console**  
   https://search.google.com/search-console

2. **Add a property**  
   - Choose “URL prefix”.
   - Enter: `https://agent4socials.com`
   - Click “Continue”.

3. **Verify ownership** (pick one):
   - **HTML tag:** Search Console will give you a meta tag like  
     `<meta name="google-site-verification" content="…" />`  
     Add that to the app (e.g. in `apps/web/src/app/layout.tsx` under `metadata`, add  
     `verification: { google: "paste-the-content-value-here" }`).
   - **DNS:** Add the TXT record they show to your domain’s DNS (where you manage agent4socials.com).
   - **HTML file:** Download the file they provide and put it in `apps/web/public/`, then redeploy.

4. **Submit the sitemap**  
   - In Search Console, go to “Sitemaps”.
   - Enter: `sitemap.xml`
   - Submit. Google will start crawling the URLs in it.

5. **Optional: request indexing for the homepage**  
   - Use “URL Inspection” for `https://agent4socials.com`.
   - Click “Request indexing” so the homepage is picked up quickly.

## After that

- **Indexing** can take a few days to a few weeks. Check “Coverage” or “Pages” in Search Console to see what’s indexed.
- **Queries** – Use “Performance” in Search Console to see search queries and clicks once data is available.
- **Content** – Keep the homepage and pricing clear and keyword-friendly (e.g. “schedule posts”, “social media analytics”). The current meta description and keywords are already aimed at that.

## Optional: Bing Webmaster Tools

For Bing (and some other search engines), add the site at  
https://www.bing.com/webmasters  
and submit the same sitemap URL: `https://agent4socials.com/sitemap.xml`.
