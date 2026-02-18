# Meta App Review: Run 3 Required API Tests

Meta requires **at least 1 successful API call** for each of these before you can submit:

1. **pages_manage_engagement**
2. **instagram_business_manage_insights**
3. **instagram_business_manage_comments**

Use **Graph API Explorer**: https://developers.facebook.com/tools/explorer/

---

## 1. pages_manage_engagement (Facebook)

**Token:** User Token with **pages_manage_engagement** (you already have this).

**Step A – Get your Page ID and Page access token**

- **GET** `me/accounts?fields=id,name,access_token`
- Click **Submit**.
- Copy one Page’s **id** and **access_token** (use the **access_token** value for that page).

**Step B – Call an endpoint that uses pages_manage_engagement**

- **GET** `{page-id}/posts?fields=id,message,comments.summary(true)&limit=5`
  - Replace `{page-id}` with the Page **id** from Step A (e.g. `123456789`).
- **Access Token:** Use the **Page access_token** from Step A (not the User Token).
- Click **Submit**.
- A **200** response with JSON (e.g. `data` array) = test passed. Meta will record that you used `pages_manage_engagement`.

---

## 2. instagram_business_manage_insights (Instagram Login)

**Token:** You need an **Instagram access token** (Instagram Login), not the Facebook User Token.

**How to get an Instagram token in Explorer**

- In the right panel, look for **“User or Page”** and see if there is an option like **“Instagram”** or **“Generate Instagram Access Token”**.
- If your app has the **Instagram Login** product: use **Generate Access Token** and ensure **instagram_business_manage_insights** (or “Read Instagram insights”) is in the requested permissions, then generate and copy the token.
- If you only have Facebook Login: add the **Instagram** product to your app (App Dashboard → Add Product → Instagram), then in Explorer you may get an option to generate an Instagram token. Otherwise, connect via your app’s “Connect with Instagram” (Instagram-only) flow and copy the token from your app/DB for testing.

**Run the test**

- **GET** `{ig-user-id}/insights?metric=impressions&period=day`
  - Replace `{ig-user-id}` with your **Instagram Business/Creator account ID** (numeric). You can get it: from your app after connecting Instagram, or via **GET** `me/accounts?fields=id,instagram_business_account` with a User Token, then use `instagram_business_account.id` if present.
- **Access Token:** The **Instagram** (or User) token that has **instagram_business_manage_insights**.
- Click **Submit**.
- **200** with a `data` array (metrics) = test passed.

---

## 3. instagram_business_manage_comments (Instagram Login)

**Token:** Same **Instagram** token as in step 2 (must have **instagram_business_manage_comments**).

**Step A – Get a media ID**

- **GET** `{ig-user-id}/media?fields=id,caption&limit=1`
  - Replace `{ig-user-id}` with your Instagram user ID.
- Copy the **id** of the first media (e.g. `17889455560051444`).

**Step B – Call comments endpoint**

- **GET** `{ig-media-id}/comments?fields=username,text,timestamp`
  - Replace `{ig-media-id}` with the id from Step A.
- **Access Token:** Same Instagram token.
- Click **Submit**.
- **200** (even with `data: []`) = test passed. Meta will record use of `instagram_business_manage_comments`.

---

## Summary

| Permission | Endpoint to call | Token |
|------------|------------------|--------|
| pages_manage_engagement | `GET {page-id}/posts?fields=id,message,comments.summary(true)&limit=5` | Page access_token from `me/accounts` |
| instagram_business_manage_insights | `GET {ig-user-id}/insights?metric=impressions&period=day` | Instagram token with that scope |
| instagram_business_manage_comments | `GET {ig-media-id}/comments?fields=username,text,timestamp` | Same Instagram token |

After each successful **200** response, wait a few minutes and refresh the **Review → Testing** page; the “0 of 1” should change to “1 of 1” for that permission.
