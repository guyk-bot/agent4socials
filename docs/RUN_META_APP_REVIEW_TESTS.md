# How to Run the Meta App Review Tests (Step by Step)

This runs the 3 API calls that Meta needs to see so the permissions show "1 of 1" in App Review.

---

## What you need first

1. You already connected Instagram with "Connect with Instagram only" (so the app has the right token).
2. Your project is open in Cursor (or any editor) and you have the folder on your computer.

---

## Steps

### Step 1: Open Terminal

- In Cursor: menu **Terminal** → **New Terminal** (or press **Ctrl+`** / **Cmd+`**).
- A terminal panel will open at the bottom.

### Step 2: Go to the web app folder

Type this and press **Enter**:

```bash
cd apps/web
```

(That means: "go into the `apps/web` folder" where the script and `.env` live.)

### Step 3: Run the test script

Type this and press **Enter**:

```bash
node scripts/run-meta-app-review-tests.js
```

### Step 4: What you should see

You should see something like:

```
--- Meta App Review: 3 required API tests (using DB tokens) ---

1. pages_manage_engagement
   OK – GET /.../posts

2. instagram_business_manage_insights
   OK – GET /.../insights

3. instagram_business_manage_comments
   OK – GET /.../comments

Refresh Review → Testing in a few minutes to see "1 of 1" for each.
```

- If you see **OK** for all three: you're done. Go to Step 5.
- If you see **Skipped** or **Failed**: the script will say why (e.g. no Instagram in DB, or wrong token). Fix that (e.g. connect Instagram again with "Connect with Instagram only") and run the same command again.

### Step 5: Tell Meta the tests ran

1. Open your browser and go to [developers.facebook.com](https://developers.facebook.com).
2. Open your app → **App Review** → **Permissions and Features** (or the page where you see the list of permissions with "0 of 1" or "1 of 1").
3. Wait **2–5 minutes**, then **refresh the page** (F5 or the refresh button).
4. The two Instagram permissions should now show **"1 of 1 API call(s) required"** instead of "0 of 1".

---

## If something goes wrong

**"DATABASE_URL is missing or invalid"**

- The script needs the database URL from `apps/web/.env`.
- Make sure you are in the `apps/web` folder when you run the command (Step 2).
- Make sure the file `apps/web/.env` exists and has a line like `DATABASE_URL=postgresql://...`.

**"Skipped (no connected Instagram account in DB)"**

- Connect Instagram again from the app: Dashboard → sidebar → **Connect with Instagram only** → complete login, then run the script again.

**"Failed" next to one of the tests**

- Read the short message after "Failed:" (e.g. token expired, wrong permission). Usually reconnecting that account in the app and running the script again fixes it.

---

## Summary

1. Open Terminal.
2. `cd apps/web`
3. `node scripts/run-meta-app-review-tests.js`
4. Wait for three "OK"s.
5. Refresh Meta App Review in the browser after a few minutes.

That's it.
