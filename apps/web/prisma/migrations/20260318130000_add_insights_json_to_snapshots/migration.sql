-- Store per-day API metrics (impressions, reach, profile_views, page_impressions, etc.) so we retain full history beyond Meta 28/90-day window.
ALTER TABLE "AccountMetricSnapshot" ADD COLUMN IF NOT EXISTS "insightsJson" JSONB;
