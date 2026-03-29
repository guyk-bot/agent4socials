export type BreakdownItem = {
  key: string;
  label: string;
  value: number;
  percent: number;
  colorToken?: string;
};

export type BreakdownResponse = {
  provider: 'instagram' | 'youtube';
  metric: 'audience_by_country' | 'traffic_sources';
  total: number;
  items: BreakdownItem[];
  dateRange: {
    start: string;
    end: string;
    label: string;
  };
  meta?: Record<string, unknown>;
};

export type BreakdownApiErrorBody = {
  error: {
    code: string;
    message: string;
    status?: number;
  };
};

export const INSTAGRAM_DEMOGRAPHICS_EMPTY_MESSAGE =
  'Instagram audience demographics are only available when Meta has enough audience data.';
