import { z } from 'zod';

export const instagramAudienceQuerySchema = z.object({
  accountId: z.string().min(1, 'accountId is required'),
  range: z.enum(['7d', '14d', '30d', '90d']).default('30d'),
});

export const youtubeAudienceQuerySchema = z.object({
  channelId: z.string().min(1, 'channelId is required'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
  primaryMetric: z.enum(['views', 'estimatedMinutesWatched']).default('views'),
});

export const youtubeTrafficQuerySchema = z.object({
  channelId: z.string().min(1, 'channelId is required'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
});

export const breakdownItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  percent: z.number(),
  colorToken: z.string().optional(),
});

export const breakdownResponseSchema = z.object({
  provider: z.enum(['instagram', 'youtube']),
  metric: z.enum(['audience_by_country', 'traffic_sources']),
  total: z.number(),
  items: z.array(breakdownItemSchema),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
    label: z.string(),
  }),
  // Zod 4 requires key + value schemas; two-arg form is valid in Zod 3.22+ as well.
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** Meta Graph API: Instagram insights with breakdown */
export const metaIgInsightEnvelopeSchema = z.object({
  data: z
    .array(
      z.object({
        name: z.string().optional(),
        total_value: z
          .object({
            value: z.number().optional(),
            breakdowns: z
              .array(
                z.object({
                  dimension_keys: z.array(z.string()).optional(),
                  results: z
                    .array(
                      z.object({
                        dimension_values: z.array(z.string()).optional(),
                        value: z.number().optional(),
                      })
                    )
                    .optional(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
  error: z
    .object({
      message: z.string(),
      code: z.number().optional(),
      type: z.string().optional(),
    })
    .optional(),
});

export const youtubeReportEnvelopeSchema = z.object({
  error: z.object({ message: z.string().optional(), code: z.number().optional() }).optional(),
  columnHeaders: z
    .array(
      z.object({
        name: z.string(),
        columnType: z.string().optional(),
        dataType: z.string().optional(),
      })
    )
    .optional(),
  rows: z.array(z.array(z.union([z.string(), z.number()]))).optional(),
  errors: z
    .array(
      z.object({
        domain: z.string().optional(),
        reason: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .optional(),
});

export function parseYoutubeQueryDates(startDate: string, endDate: string): { ok: true } | { ok: false; message: string } {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: 'Invalid date range.' };
  }
  if (end < start) {
    return { ok: false, message: 'endDate must be on or after startDate.' };
  }
  return { ok: true };
}
