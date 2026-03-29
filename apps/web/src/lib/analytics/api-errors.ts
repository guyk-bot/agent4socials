import { NextResponse } from 'next/server';
import type { BreakdownApiErrorBody } from '@/lib/analytics/breakdown-types';

export class AnalyticsApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly exposeMessage: string;

  constructor(opts: { code: string; message: string; httpStatus?: number; exposeMessage?: string }) {
    super(opts.message);
    this.name = 'AnalyticsApiError';
    this.code = opts.code;
    this.httpStatus = opts.httpStatus ?? 502;
    this.exposeMessage = opts.exposeMessage ?? opts.message;
  }

  toJson(): BreakdownApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.exposeMessage,
        status: this.httpStatus,
      },
    };
  }

  toResponse(): NextResponse {
    return NextResponse.json(this.toJson(), { status: this.httpStatus });
  }
}

export function userSafeMessageFromAxios(err: unknown, fallback = 'Something went wrong loading analytics.'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { status?: number; data?: { error?: { message?: string } } } }).response;
    const status = res?.status;
    const msg = res?.data?.error?.message;
    if (status === 401 || status === 403) {
      return 'Authorization failed. Reconnect the account or refresh tokens.';
    }
    if (status === 429) {
      return 'Rate limited by the provider. Try again in a few minutes.';
    }
    if (status && status >= 500) {
      return 'The social platform is temporarily unavailable. Try again later.';
    }
    if (msg && typeof msg === 'string' && msg.length < 200) return msg;
  }
  return fallback;
}
