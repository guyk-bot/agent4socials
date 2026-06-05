/**
 * PDF report generator for iZop.
 * Uses jsPDF (Helvetica only). All user text is sanitized; no emoji icons in PDF.
 */
import type { UnifiedSummaryResponse, UnifiedHistoryPost } from '@/lib/analytics/unified-metrics-types';
import type { jsPDF as JsPDFType } from 'jspdf';

// ─── Palette ───────────────────────────────────────────────────────────────────
const C = {
  orange: [249, 115, 22] as [number, number, number],
  orangeDark: [194, 65, 12] as [number, number, number],
  orangeLight: [255, 237, 213] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  gray900: [17, 24, 39] as [number, number, number],
  gray700: [55, 65, 81] as [number, number, number],
  gray500: [107, 114, 128] as [number, number, number],
  gray200: [229, 231, 235] as [number, number, number],
  gray100: [243, 244, 246] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  greenLight: [220, 252, 231] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  redLight: [254, 226, 226] as [number, number, number],
  platformColors: {
    Instagram: [225, 48, 108] as [number, number, number],
    Meta: [24, 119, 242] as [number, number, number],
    X: [91, 127, 166] as [number, number, number],
    LinkedIn: [10, 102, 194] as [number, number, number],
    YouTube: [255, 0, 0] as [number, number, number],
    TikTok: [105, 201, 208] as [number, number, number],
    Pinterest: [230, 0, 35] as [number, number, number],
  } as Record<string, [number, number, number]>,
};

type Ctx = {
  pdf: JsPDFType;
  pageW: number;
  pageH: number;
  margin: number;
  y: number;
};

// ─── Text helpers (jsPDF Helvetica cannot render emoji) ────────────────────────

/** Strip emoji and non-ASCII chars that render as garbage in PDF. */
function sanitizePdfText(text: string, maxLen = 180): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtFull(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Intl.NumberFormat('en-US').format(Math.round(n));
}

/** Cap extreme growth values so labels do not overlap in KPI cards. */
function pctDisplay(n: number): string {
  if (!Number.isFinite(n)) return '0.0%';
  const capped = Math.max(-999, Math.min(999, n));
  const sign = capped > 0 ? '+' : '';
  return `${sign}${capped.toFixed(1)}%`;
}

function engagementRate(engagement: number, impressions: number): string {
  if (impressions <= 0) return 'n/a';
  return `${((engagement / impressions) * 100).toFixed(2)}%`;
}

function setFill(pdf: JsPDFType, rgb: [number, number, number]) {
  pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(pdf: JsPDFType, rgb: [number, number, number]) {
  pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
}
function setTxtColor(pdf: JsPDFType, rgb: [number, number, number]) {
  pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y + needed > ctx.pageH - ctx.margin - 28) {
    ctx.pdf.addPage();
    ctx.y = ctx.margin;
    setFill(ctx.pdf, C.orange);
    ctx.pdf.rect(0, 0, ctx.pageW, 4, 'F');
  }
}

function drawLines(
  pdf: JsPDFType,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  maxLines: number
): number {
  const shown = lines.slice(0, maxLines);
  shown.forEach((line, i) => {
    pdf.text(line, x, y + i * lineHeight);
  });
  return shown.length * lineHeight;
}

// ─── Layout blocks ───────────────────────────────────────────────────────────

function drawHeader(
  ctx: Ctx,
  title: string,
  subtitle: string,
  dateRange: string,
  accounts: { platform: string; username?: string | null }[]
) {
  const { pdf, pageW, margin } = ctx;

  setFill(pdf, C.orange);
  pdf.rect(0, 0, pageW, 68, 'F');

  setFill(pdf, C.orangeDark);
  pdf.circle(pageW - 36, 18, 42, 'F');

  setTxtColor(pdf, C.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('AGENT4SOCIALS', margin, 14);

  pdf.setFontSize(20);
  pdf.text(title, margin, 38);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const subLines = pdf.splitTextToSize(sanitizePdfText(subtitle, 120), pageW - margin * 2);
  pdf.text(subLines.slice(0, 2), margin, 54);

  // Meta block (no overlapping center text)
  const metaTop = 76;
  setFill(pdf, C.gray100);
  const accountRows = accounts.slice(0, 6).map((a) => {
    const u = a.username ? `@${sanitizePdfText(a.username, 40)}` : '';
    return sanitizePdfText(`${a.platform}${u ? ` ${u}` : ''}`, 60);
  });
  const metaH = 22 + Math.min(accountRows.length, 3) * 10;
  pdf.rect(0, metaTop, pageW, metaH, 'F');

  setTxtColor(pdf, C.gray700);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Date range: ${dateRange}`, margin, metaTop + 12);
  pdf.text(
    `Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    margin,
    metaTop + 22
  );

  if (accountRows.length > 0) {
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Connected accounts:', margin, metaTop + 34);
    pdf.setFont('helvetica', 'normal');
    accountRows.slice(0, 3).forEach((row, i) => {
      pdf.text(row, margin + 4, metaTop + 44 + i * 10);
    });
    if (accountRows.length > 3) {
      pdf.text(`+${accountRows.length - 3} more`, margin + 4, metaTop + 44 + 3 * 10);
    }
  }

  ctx.y = metaTop + metaH + 14;
}

function drawSectionTitle(ctx: Ctx, text: string) {
  ensureSpace(ctx, 28);
  const { pdf, margin } = ctx;
  setFill(pdf, C.orange);
  pdf.rect(margin, ctx.y, 3, 14, 'F');
  setTxtColor(pdf, C.gray900);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(text, margin + 10, ctx.y + 11);
  ctx.y += 22;
}

function drawKpiCards(ctx: Ctx, cards: { label: string; value: string; growth?: number; sub?: string }[]) {
  ensureSpace(ctx, 78);
  const { pdf, pageW, margin } = ctx;
  const cols = Math.min(cards.length, 4);
  const gutter = 8;
  const cardW = (pageW - margin * 2 - gutter * (cols - 1)) / cols;
  const cardH = 72;

  cards.slice(0, 4).forEach((card, i) => {
    const x = margin + i * (cardW + gutter);
    const y = ctx.y;

    setFill(pdf, C.white);
    setDraw(pdf, C.gray200);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(x, y, cardW, cardH, 4, 4, 'FD');

    setFill(pdf, C.orange);
    pdf.roundedRect(x, y, cardW, 3, 2, 2, 'F');

    setTxtColor(pdf, C.gray500);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    const labelLines = pdf.splitTextToSize(card.label.toUpperCase(), cardW - 16);
    pdf.text(labelLines.slice(0, 1), x + 8, y + 14);

    setTxtColor(pdf, C.gray900);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    const valLines = pdf.splitTextToSize(card.value, cardW - 16);
    pdf.text(valLines.slice(0, 1), x + 8, y + 36);

    if (card.growth !== undefined) {
      const isPos = card.growth >= 0;
      setTxtColor(pdf, isPos ? C.green : C.red);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(pctDisplay(card.growth), x + 8, y + 50);
      setTxtColor(pdf, C.gray500);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      pdf.text('vs prev', x + 8, y + 60);
    } else if (card.sub) {
      setTxtColor(pdf, C.gray500);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.text(sanitizePdfText(card.sub, 40), x + 8, y + 52);
    }
  });

  ctx.y += cardH + 12;
}

function drawExecutiveSummary(ctx: Ctx, summary: UnifiedSummaryResponse, rollups: PlatformRollup[]) {
  ensureSpace(ctx, 70);
  const { pdf, pageW, margin } = ctx;
  const k = summary.kpi;
  const engRate = engagementRate(k.totalEngagement, k.totalImpressions);
  const avgEngPerPost = k.totalPosts > 0 ? k.totalEngagement / k.totalPosts : 0;
  const avgImpPerPost = k.totalPosts > 0 ? k.totalImpressions / k.totalPosts : 0;
  const top = rollups[0];

  drawSectionTitle(ctx, 'Executive Summary');

  const bullets = [
    `You published ${fmtFull(k.totalPosts)} posts and reached ${fmt(k.totalImpressions)} impressions in this period.`,
    `Total engagement: ${fmtFull(k.totalEngagement)} (${engRate} engagement rate).`,
    `Average per post: ${fmt(avgEngPerPost)} engagements, ${fmt(avgImpPerPost)} impressions.`,
    top
      ? `Strongest platform by engagement: ${top.platform} (${fmtFull(top.engagement)} total).`
      : 'Connect more platforms to compare performance side by side.',
  ];

  setFill(pdf, C.orangeLight);
  pdf.roundedRect(margin, ctx.y, pageW - margin * 2, 8 + bullets.length * 14, 4, 4, 'F');

  setTxtColor(pdf, C.gray700);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  let by = ctx.y + 14;
  bullets.forEach((b) => {
    pdf.text(`- ${sanitizePdfText(b, 200)}`, margin + 10, by);
    by += 14;
  });
  ctx.y = by + 10;
}

function drawBarChart(
  ctx: Ctx,
  title: string,
  rows: { label: string; value: number; color?: [number, number, number] }[]
) {
  if (rows.length === 0) return;
  ensureSpace(ctx, 120);
  const { pdf, pageW, margin } = ctx;

  drawSectionTitle(ctx, title);
  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  const chartH = 72;
  const barAreaW = pageW - margin * 2 - 28;
  const baseY = ctx.y + chartH;
  const gap = barAreaW / rows.length;
  const barW = Math.min(32, gap * 0.5);

  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const gy = baseY - chartH * f;
    setDraw(pdf, C.gray200);
    pdf.setLineWidth(0.3);
    pdf.line(margin + 24, gy, pageW - margin, gy);
    setTxtColor(pdf, C.gray500);
    pdf.setFontSize(5.5);
    pdf.text(fmt(maxVal * f), margin + 20, gy + 2, { align: 'right' });
  });

  rows.forEach((row, i) => {
    const barH = Math.max(2, (row.value / maxVal) * chartH);
    const bx = margin + 24 + i * gap + (gap - barW) / 2;
    const by = baseY - barH;
    const clr = row.color ?? C.platformColors[row.label] ?? C.orange;
    setFill(pdf, clr);
    pdf.roundedRect(bx, by, barW, barH, 2, 2, 'F');

    setTxtColor(pdf, C.gray700);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.text(fmt(row.value), bx + barW / 2, by - 4, { align: 'center' });

    setTxtColor(pdf, C.gray500);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    const short = row.label.length > 9 ? `${row.label.slice(0, 8)}.` : row.label;
    pdf.text(short, bx + barW / 2, baseY + 12, { align: 'center' });
  });

  ctx.y = baseY + 24;
}

function drawTopPosts(
  ctx: Ctx,
  posts: UnifiedSummaryResponse['topPosts'],
  limit = 3
) {
  const shown = posts.slice(0, limit);
  if (shown.length === 0) return;

  const { pdf, pageW, margin } = ctx;
  drawSectionTitle(ctx, limit > 3 ? `Top ${limit} Performing Posts` : 'Top Performing Posts');

  shown.forEach((post, i) => {
    const cap = sanitizePdfText(post.caption || 'No caption', 120);
    const capLines = pdf.splitTextToSize(cap, pageW - margin * 2 - 100);
    const lineCount = Math.min(capLines.length, 2);
    const rowH = 36 + lineCount * 10 + 14;

    ensureSpace(ctx, rowH + 4);
    const rowY = ctx.y;

    setFill(pdf, i % 2 === 0 ? C.gray100 : C.white);
    pdf.rect(margin, rowY, pageW - margin * 2, rowH, 'F');

    setFill(pdf, C.orange);
    pdf.circle(margin + 12, rowY + 14, 9, 'F');
    setTxtColor(pdf, C.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(String(i + 1), margin + 12, rowY + 17, { align: 'center' });

    const plColor = C.platformColors[post.platform] ?? C.orange;
    setFill(pdf, plColor);
    pdf.roundedRect(margin + 26, rowY + 6, 52, 12, 2, 2, 'F');
    setTxtColor(pdf, C.white);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(sanitizePdfText(post.platform, 12), margin + 30, rowY + 14);

    setTxtColor(pdf, C.gray900);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    drawLines(pdf, capLines, margin + 84, rowY + 12, 10, 2);

    const statY = rowY + 12 + lineCount * 10 + 4;
    setTxtColor(pdf, C.gray500);
    pdf.setFontSize(6.5);
    pdf.text(
      `Likes ${fmt(post.likes)}  |  Comments ${fmt(post.comments)}  |  Shares ${fmt(post.shares)}  |  Views ${fmt(post.impressions)}`,
      margin + 84,
      statY
    );

    setFill(pdf, C.orangeLight);
    pdf.roundedRect(pageW - margin - 62, rowY + 8, 58, 14, 2, 2, 'F');
    setTxtColor(pdf, C.orangeDark);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(`${fmt(post.totalEngagement)} eng`, pageW - margin - 58, rowY + 17);

    ctx.y += rowH + 4;
  });
  ctx.y += 6;
}

function drawPlatformTable(ctx: Ctx, rollups: PlatformRollup[], advanced = false) {
  if (rollups.length === 0) return;

  const cols = advanced
    ? ['Platform', 'Posts', 'Impr.', 'Eng.', 'Rate', 'Likes', 'Cmts', 'Shares']
    : ['Platform', 'Posts', 'Impressions', 'Engagement', 'Likes', 'Comments', 'Shares'];

  ensureSpace(ctx, 24 + rollups.length * 18 + 20);
  const { pdf, pageW, margin } = ctx;
  drawSectionTitle(ctx, 'Platform Performance Breakdown');

  const colW = (pageW - margin * 2) / cols.length;

  setFill(pdf, C.gray900);
  pdf.rect(margin, ctx.y, pageW - margin * 2, 14, 'F');
  setTxtColor(pdf, C.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  cols.forEach((col, i) => {
    pdf.text(col, margin + i * colW + 3, ctx.y + 9);
  });
  ctx.y += 16;

  rollups.forEach((row, ri) => {
    ensureSpace(ctx, 16);
    setFill(pdf, ri % 2 === 0 ? C.gray100 : C.white);
    pdf.rect(margin, ctx.y, pageW - margin * 2, 14, 'F');

    const values = advanced
      ? [
          row.platform,
          fmtFull(row.posts),
          fmt(row.impressions),
          fmt(row.engagement),
          engagementRate(row.engagement, row.impressions),
          fmtFull(row.likes),
          fmtFull(row.comments),
          fmtFull(row.shares),
        ]
      : [
          row.platform,
          fmtFull(row.posts),
          fmtFull(row.impressions),
          fmtFull(row.engagement),
          fmtFull(row.likes),
          fmtFull(row.comments),
          fmtFull(row.shares),
        ];

    values.forEach((val, i) => {
      if (i === 0) {
        const clr = C.platformColors[val] ?? C.gray500;
        setFill(pdf, clr);
        pdf.circle(margin + 5, ctx.y + 7, 2.5, 'F');
        setTxtColor(pdf, C.gray900);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.text(val, margin + 10, ctx.y + 9);
      } else {
        setTxtColor(pdf, C.gray700);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.text(val, margin + i * colW + 3, ctx.y + 9);
      }
    });
    ctx.y += 15;
  });
  ctx.y += 8;
}

function drawPostTypeBreakdown(ctx: Ctx, history: UnifiedHistoryPost[]) {
  const buckets: Record<string, { posts: number; eng: number; imp: number }> = {
    Video: { posts: 0, eng: 0, imp: 0 },
    Carousel: { posts: 0, eng: 0, imp: 0 },
    Image: { posts: 0, eng: 0, imp: 0 },
    Other: { posts: 0, eng: 0, imp: 0 },
  };

  for (const h of history) {
    const mt = (h.mediaType ?? '').toUpperCase();
    let key = 'Other';
    if (mt.includes('VIDEO') || mt.includes('REEL')) key = 'Video';
    else if (mt.includes('CAROUSEL') || mt.includes('ALBUM')) key = 'Carousel';
    else if (mt.includes('IMAGE') || mt.includes('PHOTO')) key = 'Image';
    buckets[key].posts += 1;
    buckets[key].eng += h.totalEngagement;
    buckets[key].imp += h.impressions;
  }

  const rows = Object.entries(buckets)
    .filter(([, v]) => v.posts > 0)
    .map(([label, v]) => ({
      label,
      posts: v.posts,
      avgEng: v.posts > 0 ? Math.round(v.eng / v.posts) : 0,
      rate: engagementRate(v.eng, v.imp),
    }))
    .sort((a, b) => b.avgEng - a.avgEng);

  if (rows.length === 0) return;
  ensureSpace(ctx, 24 + rows.length * 22);
  const { pdf, pageW, margin } = ctx;
  drawSectionTitle(ctx, 'Content Type Performance');

  const typeColors: Record<string, [number, number, number]> = {
    Video: [239, 68, 68],
    Carousel: [139, 92, 246],
    Image: [16, 185, 129],
    Other: [107, 114, 128],
  };
  const maxAvg = Math.max(...rows.map((r) => r.avgEng), 1);
  const barMaxW = pageW - margin * 2 - 210;

  rows.forEach((row) => {
    ensureSpace(ctx, 24);
    const clr = typeColors[row.label] ?? C.orange;
    setFill(pdf, clr);
    pdf.circle(margin + 5, ctx.y + 8, 4, 'F');
    setTxtColor(pdf, C.gray900);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(row.label, margin + 14, ctx.y + 11);

    const bw = Math.max(4, (row.avgEng / maxAvg) * barMaxW);
    setFill(pdf, clr);
    pdf.roundedRect(margin + 70, ctx.y + 4, bw, 8, 2, 2, 'F');

    setTxtColor(pdf, C.gray700);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(
      `${row.posts} posts  |  avg ${fmt(row.avgEng)} eng  |  rate ${row.rate}`,
      margin + 70 + bw + 8,
      ctx.y + 10
    );
    ctx.y += 20;
  });
  ctx.y += 6;
}

function drawLineChartFromPoints(
  ctx: Ctx,
  title: string,
  points: { label: string; value: number }[]
) {
  if (points.length < 2) return;
  ensureSpace(ctx, 130);
  const { pdf, pageW, margin } = ctx;
  drawSectionTitle(ctx, title);

  const chartH = 72;
  const chartW = pageW - margin * 2 - 24;
  const baseY = ctx.y + chartH;
  const maxVal = Math.max(...points.map((p) => p.value), 1);

  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const gy = baseY - chartH * f;
    setDraw(pdf, C.gray200);
    pdf.setLineWidth(0.3);
    pdf.line(margin + 24, gy, pageW - margin, gy);
    setTxtColor(pdf, C.gray500);
    pdf.setFontSize(5.5);
    pdf.text(fmt(maxVal * f), margin + 20, gy + 2, { align: 'right' });
  });

  const coords = points.map((p, i) => ({
    x: margin + 24 + (i / (points.length - 1)) * chartW,
    y: baseY - (p.value / maxVal) * chartH,
  }));

  setDraw(pdf, C.orange);
  pdf.setLineWidth(1.2);
  for (let i = 0; i < coords.length - 1; i++) {
    pdf.line(coords[i].x, coords[i].y, coords[i + 1].x, coords[i + 1].y);
  }

  coords.forEach((pt, i) => {
    setFill(pdf, C.orange);
    pdf.circle(pt.x, pt.y, 2, 'F');
    if (i % Math.max(1, Math.floor(points.length / 6)) === 0) {
      setTxtColor(pdf, C.gray500);
      pdf.setFontSize(5);
      pdf.text(points[i].label.slice(5), pt.x, baseY + 10, { align: 'center' });
    }
  });

  ctx.y = baseY + 22;
}

function drawAudienceGrowthChart(ctx: Ctx, audienceChart: UnifiedSummaryResponse['audienceChart']) {
  const points = audienceChart
    .map((p) => {
      const total = Object.entries(p)
        .filter(([k]) => k !== 'date')
        .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
      return { label: p.date ?? '', value: total };
    })
    .filter((p) => p.value > 0);

  drawLineChartFromPoints(ctx, 'Audience Growth Trend', points);
}

function drawEngagementTrend(ctx: Ctx, breakdown: UnifiedSummaryResponse['engagementBreakdown']) {
  const points = breakdown
    .map((d) => ({
      label: d.date,
      value: (d.likes || 0) + (d.comments || 0) + (d.shares || 0) + (d.reposts || 0),
    }))
    .filter((p) => p.value > 0);

  if (points.length < 2) return;
  drawLineChartFromPoints(ctx, 'Daily Engagement Trend', points);
}

function drawPostingHeatmap(ctx: Ctx, history: UnifiedHistoryPost[]) {
  const hours = new Array(24).fill(0) as number[];
  for (const h of history) {
    if (!h.postedAt) continue;
    const hour = new Date(h.postedAt).getUTCHours();
    hours[hour] += 1;
  }
  const total = hours.reduce((a, b) => a + b, 0);
  if (total === 0) return;

  ensureSpace(ctx, 100);
  const { pdf, pageW, margin } = ctx;
  drawSectionTitle(ctx, 'Best Posting Times (UTC hour)');

  const maxH = Math.max(...hours, 1);
  const gridW = pageW - margin * 2;
  const cellW = gridW / 24;
  const baseY = ctx.y + 50;

  hours.forEach((count, hour) => {
    const intensity = count / maxH;
    const r = Math.round(255 - intensity * (255 - 249));
    const g = Math.round(255 - intensity * (255 - 115));
    const b = Math.round(255 - intensity * (255 - 22));
    setFill(pdf, [r, g, b]);
    pdf.rect(margin + hour * cellW, baseY - 40 * intensity - 4, cellW - 1, 40 * intensity + 4, 'F');

    setTxtColor(pdf, C.gray500);
    pdf.setFontSize(5);
    if (hour % 3 === 0) {
      pdf.text(String(hour), margin + hour * cellW + cellW / 2, baseY + 12, { align: 'center' });
    }
  });

  const bestHour = hours.indexOf(maxH);
  setTxtColor(pdf, C.gray700);
  pdf.setFontSize(7);
  pdf.text(
    `Peak activity: ${bestHour}:00 UTC (${hours[bestHour]} posts). Schedule high-priority content within 1 hour of this window.`,
    margin,
    baseY + 28
  );
  ctx.y = baseY + 40;
}

function buildContentPillars(history: UnifiedHistoryPost[]) {
  const map = new Map<string, { posts: number; engagement: number }>();
  for (const h of history) {
    const tags = (h.caption ?? '').match(/#[A-Za-z0-9_]+/g) ?? [];
    const unique = [...new Set(tags.map((t) => t.toLowerCase()))].slice(0, 5);
    for (const tag of unique) {
      const prev = map.get(tag) ?? { posts: 0, engagement: 0 };
      prev.posts += 1;
      prev.engagement += h.totalEngagement || 0;
      map.set(tag, prev);
    }
  }
  return Array.from(map.entries())
    .map(([tag, v]) => ({ tag: tag.replace(/^#/, ''), ...v, avg: v.posts > 0 ? Math.round(v.engagement / v.posts) : 0 }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 8);
}

function drawContentPillars(ctx: Ctx, history: UnifiedHistoryPost[]) {
  const pillars = buildContentPillars(history);
  if (pillars.length === 0) return;

  ensureSpace(ctx, 24 + pillars.length * 18);
  const { pdf, pageW, margin } = ctx;
  drawSectionTitle(ctx, 'Content Pillars (top hashtags)');

  const maxEng = Math.max(...pillars.map((p) => p.engagement), 1);
  const barMax = pageW - margin * 2 - 160;

  pillars.forEach((p, i) => {
    ensureSpace(ctx, 18);
    setTxtColor(pdf, C.gray900);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text(`#${sanitizePdfText(p.tag, 30)}`, margin, ctx.y + 9);

    const bw = Math.max(4, (p.engagement / maxEng) * barMax);
    setFill(pdf, C.orange);
    pdf.roundedRect(margin + 90, ctx.y + 2, bw, 8, 2, 2, 'F');

    setTxtColor(pdf, C.gray500);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.text(`${p.posts} posts  |  ${fmt(p.engagement)} eng  |  avg ${fmt(p.avg)}`, margin + 90 + bw + 6, ctx.y + 8);
    ctx.y += 16;
  });
  ctx.y += 6;
}

function drawEngagementMix(ctx: Ctx, rollups: PlatformRollup[]) {
  const likes = rollups.reduce((s, r) => s + r.likes, 0);
  const comments = rollups.reduce((s, r) => s + r.comments, 0);
  const shares = rollups.reduce((s, r) => s + r.shares, 0);
  const total = likes + comments + shares;
  if (total === 0) return;

  ensureSpace(ctx, 56);
  const { pdf, pageW, margin } = ctx;
  drawSectionTitle(ctx, 'Engagement Mix');

  const items = [
    { label: 'Likes', value: likes, color: C.orange },
    { label: 'Comments', value: comments, color: [59, 130, 246] as [number, number, number] },
    { label: 'Shares', value: shares, color: C.green },
  ];

  let x = margin;
  const barTotalW = pageW - margin * 2;
  items.forEach((item) => {
    const w = (item.value / total) * barTotalW;
    setFill(pdf, item.color);
    pdf.rect(x, ctx.y, w, 14, 'F');
    x += w;
  });

  ctx.y += 22;
  items.forEach((item, i) => {
    setFill(pdf, item.color);
    pdf.rect(margin + i * 120, ctx.y, 8, 8, 'F');
    setTxtColor(pdf, C.gray700);
    pdf.setFontSize(7);
    pdf.text(`${item.label}: ${fmtFull(item.value)} (${((item.value / total) * 100).toFixed(0)}%)`, margin + i * 120 + 12, ctx.y + 7);
  });
  ctx.y += 18;
}

function drawRecommendations(ctx: Ctx, summary: UnifiedSummaryResponse, rollups: PlatformRollup[]) {
  ensureSpace(ctx, 30);
  drawSectionTitle(ctx, 'AI-Powered Recommendations');

  const { pdf, pageW, margin } = ctx;
  const avgEng = summary.kpi.totalPosts > 0 ? summary.kpi.totalEngagement / summary.kpi.totalPosts : 0;
  const topPlatformByEng = [...rollups].sort((a, b) => b.engagement - a.engagement)[0];
  const topPlatformByImp = [...rollups].sort((a, b) => b.impressions - a.impressions)[0];

  const recs: string[] = [];
  if (topPlatformByEng) {
    recs.push(
      `Prioritize ${topPlatformByEng.platform}: highest engagement (${fmtFull(topPlatformByEng.engagement)}). Aim for 20% more posts there next month.`
    );
  }
  if (summary.kpi.impressionsGrowthPercentage < 0) {
    recs.push('Reach is declining. Test short-form video on Instagram and TikTok; they often earn 2x the reach of static posts.');
  } else if (topPlatformByImp && topPlatformByImp.platform !== topPlatformByEng?.platform) {
    recs.push(
      `${topPlatformByImp.platform} leads impressions (${fmtFull(topPlatformByImp.impressions)}). Repurpose top ${topPlatformByEng?.platform ?? 'performing'} posts there.`
    );
  }
  if (avgEng < 50) {
    recs.push('Engagement per post is low. Use questions in captions, reply to comments in the first hour, and add a clear CTA.');
  } else {
    recs.push(`Solid avg engagement (${fmt(avgEng)} per post). Double down on formats and topics from your top 5 posts.`);
  }
  if (summary.kpi.audienceGrowthPercentage > 0) {
    recs.push(`Audience grew ${pctDisplay(summary.kpi.audienceGrowthPercentage)}. Add a link-in-bio offer to convert new followers.`);
  } else {
    recs.push('Follower growth is flat. Try a collab post or a simple giveaway to restart discovery.');
  }
  recs.push('Post consistently (3x per week minimum) and queue ahead with iZop Scheduler.');

  recs.slice(0, 5).forEach((rec, i) => {
    const lines = pdf.splitTextToSize(sanitizePdfText(rec, 300), pageW - margin * 2 - 44);
    const boxH = Math.max(36, 14 + Math.min(lines.length, 4) * 9);
    ensureSpace(ctx, boxH + 6);

    const rowY = ctx.y;
    setFill(pdf, C.orangeLight);
    pdf.roundedRect(margin, rowY, pageW - margin * 2, boxH, 4, 4, 'F');
    setFill(pdf, C.orange);
    pdf.roundedRect(margin, rowY, 24, boxH, 4, 4, 'F');
    pdf.rect(margin + 16, rowY, 8, boxH, 'F');

    setTxtColor(pdf, C.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(String(i + 1), margin + 12, rowY + boxH / 2 + 3, { align: 'center' });

    setTxtColor(pdf, C.gray900);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    drawLines(pdf, lines, margin + 30, rowY + 12, 9, 4);

    ctx.y += boxH + 6;
  });
  ctx.y += 6;
}

function drawFooter(ctx: Ctx, pageNum: number) {
  const { pdf, pageW, pageH } = ctx;
  setFill(pdf, C.gray100);
  pdf.rect(0, pageH - 22, pageW, 22, 'F');
  setTxtColor(pdf, C.gray500);
  pdf.setFontSize(6.5);
  pdf.setFont('helvetica', 'normal');
  pdf.text('iZop Analytics Report  |  agent4socials.com', 40, pageH - 8);
  pdf.text(`Page ${pageNum}`, pageW - 40, pageH - 8, { align: 'right' });
}

function finishPdf(ctx: Ctx, filename: string) {
  const totalPages = ctx.pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    ctx.pdf.setPage(i);
    drawFooter(ctx, i);
  }
  ctx.pdf.save(filename);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type PlatformRollup = {
  platform: string;
  posts: number;
  impressions: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
};

export function buildPlatformRollups(summary: UnifiedSummaryResponse): PlatformRollup[] {
  const map = new Map<string, PlatformRollup>();
  for (const row of summary.history) {
    const k = row.platform || 'Unknown';
    const prev = map.get(k) ?? { platform: k, posts: 0, impressions: 0, engagement: 0, likes: 0, comments: 0, shares: 0 };
    prev.posts += 1;
    prev.impressions += row.impressions || 0;
    prev.engagement += row.totalEngagement || 0;
    prev.likes += row.likes || 0;
    prev.comments += row.comments || 0;
    prev.shares += row.shares || 0;
    map.set(k, prev);
  }
  return Array.from(map.values()).sort((a, b) => b.engagement - a.engagement);
}

export async function generateSimpleReport(
  summary: UnifiedSummaryResponse,
  accounts: { id: string; platform: string; username?: string | null }[],
  dateRange: { start: string; end: string }
) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const ctx: Ctx = { pdf, pageW, pageH, margin, y: margin };

  const rollups = buildPlatformRollups(summary);
  const engRate = engagementRate(summary.kpi.totalEngagement, summary.kpi.totalImpressions);

  drawHeader(ctx, 'Analytics Report', 'Performance snapshot for all connected accounts', `${dateRange.start} to ${dateRange.end}`, accounts);

  drawKpiCards(ctx, [
    { label: 'Total Posts', value: fmtFull(summary.kpi.totalPosts), growth: summary.kpi.postsGrowthPercentage },
    { label: 'Total Impressions', value: fmt(summary.kpi.totalImpressions), growth: summary.kpi.impressionsGrowthPercentage },
    { label: 'Total Engagement', value: fmt(summary.kpi.totalEngagement), growth: summary.kpi.engagementGrowthPercentage },
    { label: 'Engagement Rate', value: engRate, sub: `Audience ${fmt(summary.kpi.totalAudience)}` },
  ]);

  drawTopPosts(ctx, summary.topPosts, 3);
  drawBarChart(ctx, 'Impressions by Platform', rollups.map((r) => ({ label: r.platform, value: r.impressions })));
  drawPostingHeatmap(ctx, summary.history);

  finishPdf(ctx, `agent4socials-simple-report-${dateRange.start}-to-${dateRange.end}.pdf`);
}

export async function generateAdvancedReport(
  summary: UnifiedSummaryResponse,
  accounts: { id: string; platform: string; username?: string | null }[],
  dateRange: { start: string; end: string }
) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const ctx: Ctx = { pdf, pageW, pageH, margin, y: margin };

  const rollups = buildPlatformRollups(summary);
  const engRate = engagementRate(summary.kpi.totalEngagement, summary.kpi.totalImpressions);

  drawHeader(
    ctx,
    'Advanced Analytics Report',
    'Comprehensive performance analysis with trends, content insights, and AI recommendations',
    `${dateRange.start} to ${dateRange.end}`,
    accounts
  );

  drawKpiCards(ctx, [
    { label: 'Total Posts', value: fmtFull(summary.kpi.totalPosts), growth: summary.kpi.postsGrowthPercentage },
    { label: 'Total Impressions', value: fmt(summary.kpi.totalImpressions), growth: summary.kpi.impressionsGrowthPercentage },
    { label: 'Total Engagement', value: fmt(summary.kpi.totalEngagement), growth: summary.kpi.engagementGrowthPercentage },
    { label: 'Engagement Rate', value: engRate, growth: summary.kpi.audienceGrowthPercentage, sub: `Audience ${fmt(summary.kpi.totalAudience)}` },
  ]);

  drawExecutiveSummary(ctx, summary, rollups);
  drawTopPosts(ctx, summary.topPosts, 5);
  drawPlatformTable(ctx, rollups, true);
  drawEngagementMix(ctx, rollups);
  drawBarChart(ctx, 'Impressions by Platform', rollups.map((r) => ({ label: r.platform, value: r.impressions })));
  drawBarChart(ctx, 'Engagement by Platform', rollups.map((r) => ({ label: r.platform, value: r.engagement })));
  drawEngagementTrend(ctx, summary.engagementBreakdown);
  drawAudienceGrowthChart(ctx, summary.audienceChart);
  drawPostTypeBreakdown(ctx, summary.history);
  drawContentPillars(ctx, summary.history);
  drawPostingHeatmap(ctx, summary.history);
  drawRecommendations(ctx, summary, rollups);

  finishPdf(ctx, `agent4socials-advanced-report-${dateRange.start}-to-${dateRange.end}.pdf`);
}
