import { z } from 'zod';
import type { BreakdownResponse } from '@/lib/analytics/breakdown-types';
import { breakdownResponseSchema } from '@/lib/analytics/breakdown-zod';

const errorBodySchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});

/** Browser fetch + Zod validation for breakdown API JSON. */
export async function fetchBreakdownResponse(url: string): Promise<BreakdownResponse> {
  const res = await fetch(url);
  const json: unknown = await res.json();
  if (!res.ok) {
    const e = errorBodySchema.safeParse(json);
    throw new Error(e.success ? e.data.error.message : `Request failed (${res.status})`);
  }
  return breakdownResponseSchema.parse(json);
}
