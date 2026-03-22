/** Single metric series row as returned by Graph (merged across per-metric fetches). */
export type FacebookInsightMetricRow = {
  name: string;
  values?: Array<{ value: number | string; end_time?: string }>;
  total_value?: { value?: number };
};

export type FacebookSyncSummary = {
  endpoints?: string[];
  metricsFetched?: string[];
  metricsInvalid?: string[];
  metricsDeprecated?: string[];
  recordsUpserted?: number;
  paginationPages?: number;
  lastCursor?: string | null;
  graphInsightsVersion?: string;
};
