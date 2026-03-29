# Instagram 2207076: How to Capture Debug Info

When Instagram publish fails with error 2207076, use this guide to collect information so we can find the root cause.

**Quick steps:** 1) Screenshot the error. 2) Open DevTools Console, run `sessionStorage.setItem('publish_debug', '1');`, click Publish again. 3) When it fails, check Console for `[Publish Debug]` — copy the media URL and full error. 4) Run the test script with that URL. 5) Send the screenshot + debug output.

---

## 1. Screenshot the Error

Take a screenshot of the full error modal (e.g. "Post updated but some platforms failed: INSTAGRAM: Error: Media upload has failed with error code 2207076."). Include the full text.

---

## 2. Enable Debug Mode and Retry

1. Open the post in Composer (Post History → Open in Composer)
2. Open DevTools: **F12** or **Right-click → Inspect**
3. Go to the **Console** tab
4. Paste this and press Enter to enable debug mode for the next publish:

```javascript
sessionStorage.setItem('publish_debug', '1');
```

5. Click **Post now** (or **Publish**) again
6. When it fails, go to the **Console** tab again. You should see a log like:
   ```
   [Publish Debug] { mediaUrlsByPlatform: { INSTAGRAM: "https://..." }, fullErrors: { INSTAGRAM: "Media upload has failed..." } }
   ```

7. **Screenshot that console output** or copy the full error text. The media URL is what we send to Meta; the full error is Meta's exact response

---

## 3. Capture the Network Response

1. In DevTools, open the **Network** tab
2. Clear it (trash icon)
3. Click **Post now** again
4. Find the request: **publish** (or filter by "publish")
5. Click it → **Response** tab
6. Look for `results` — each failed platform has an `error` field
7. **Screenshot the Response** or copy the JSON

---

## 4. Test the Media URL

If you got a media URL from step 2, test it:

```bash
cd apps/web && npm run test:instagram-media -- "PASTE_THE_MEDIA_URL_HERE"
```

- If it says **PASS: Got 200 OK** → the URL is reachable; the issue may be Meta-side (format, size, etc.)
- If it says **FAIL: Got 206** → our Range fix didn’t deploy; redeploy
- If it says **SKIP: Got 403/404** → the URL may be wrong or expired (tokens expire in 1 hour)

---

## 5. Vercel Logs (if you have access)

1. Vercel Dashboard → your project
2. **Logs** (or **Functions** → **Logs**)
3. Trigger a publish, then filter by `publish` or the time of the request
4. Look for `[Publish] Meta API error:` — that shows the full Meta response

---

## What to Send

Share:

1. Screenshot of the error modal
2. The **media URL** we sent (from step 2 or the network response)
3. The **full error text** from Meta (from step 2 or 3)
4. Output of the test script (step 4) if you ran it

That will narrow down whether the problem is: URL unreachable, 206 vs 200, image format/size, or something else.
