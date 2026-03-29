/** Facebook Page daily insights: `end_time` is end-of-day Pacific (often next calendar day in UTC). Map to metric date YYYY-MM-DD. */
export function facebookMetricDateFromEndTime(endTime: string): string {
  const d = new Date(endTime);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
