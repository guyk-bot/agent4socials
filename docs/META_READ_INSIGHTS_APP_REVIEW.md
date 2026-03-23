# Meta App Review: `read_insights` (screen recording)

## Where the data appears in Agent4Socials

1. Log in and open **Dashboard**.
2. Select your **Facebook Page** account in the sidebar (Account tab).
3. In the analytics sub-nav, click **Page insights (API)** (or scroll to the blue-tinted block **Page insights from Facebook** at the top of the Facebook analytics area).

That section lists totals and Graph metric names loaded via **Page Insights** (`GET /{page-id}/insights`), which requires **`read_insights`** on the Page token.

Other parts of the same view (Growth, **Page analytics** cards, **Impressions & Posts**, **Clicks / Traffic**) also use insights-backed series merged with your stored history.

## Suggested video flow

- Show the app URL, log in, select the Facebook Page.
- Open **Page insights (API)** and pan across the metric cards and the **Graph metrics included** list.
- Optionally change the date range and show numbers updating after refresh.
