/**
 * PDF report generator for Agent4Socials.
 * Uses jsPDF with canvas drawing to produce professional, styled reports.
 */
import type { UnifiedSummaryResponse, UnifiedHistoryPost } from '@/lib/analytics/unified-metrics-types';
import type { jsPDF as JsPDFType } from 'jspdf';

// ─── Palette & Fonts ──────────────────────────────────────────────────────────
const C = {
  orange: [249, 115, 22] as [number, number, number],
  orangeDark: [194, 65, 12] as [number, number, number],
  orangeLight: [255, 237, 213] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  black: [17, 24, 39] as [number, number, number],
  gray900: [17, 24, 39] as [number, number, number],
  gray700: [55, 65, 81] as [number, number, number],
  gray500: [107, 114, 128] as [number, number, number],
  gray200: [229, 231, 235] as [number, number, number],
  gray100: [243, 244, 246] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  greenLight: [220, 252, 231] as [number, number, number],
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

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtFull(n: number): string {
  return Intl.NumberFormat('en-US').format(n);
}

function pct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
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
  if (ctx.y + needed > ctx.pageH - ctx.margin) {
    ctx.pdf.addPage();
    ctx.y = ctx.margin;
    // Redraw subtle header line on each page
    setFill(ctx.pdf, C.orange);
    ctx.pdf.rect(0, 0, ctx.pageW, 4, 'F');
  }
}

function drawHeader(ctx: Ctx, title: string, subtitle: string, dateRange: string, accountLine: string) {
  const { pdf, pageW, margin } = ctx;

  // Top bar gradient simulation
  setFill(pdf, C.orange);
  pdf.rect(0, 0, pageW, 72, 'F');

  // Decorative circles
  setFill(pdf, C.orangeDark);
  pdf.circle(pageW - 40, 20, 50, 'F');
  setFill(pdf, [249, 115, 22]);
  pdf.circle(pageW - 80, 60, 30, 'F');

  // Logo / brand text
  setTxtColor(pdf, C.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('AGENT4SOCIALS', margin, 16);

  // Report title
  pdf.setFontSize(22);
  pdf.text(title, margin, 42);

  // Subtitle
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(subtitle, margin, 56);

  // Meta bar below header
  setFill(pdf, C.gray100);
  pdf.rect(0, 72, pageW, 28, 'F');
  setTxtColor(pdf, C.gray700);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Date range: ${dateRange}`, margin, 82);
  pdf.text(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, margin, 92);
  pdf.text(accountLine, pageW / 2, 87, { align: 'center' });

  ctx.y = 114;
}

function drawSectionTitle(ctx: Ctx, text: string) {
  ensureSpace(ctx, 28);
  const { pdf, margin } = ctx;

  // Left accent bar
  setFill(pdf, C.orange);
  pdf.rect(margin, ctx.y, 3, 16, 'F');

  setTxtColor(pdf, C.gray900);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(text, margin + 10, ctx.y + 12);
  ctx.y += 24;
}

function drawKpiCards(ctx: Ctx, cards: { label: string; value: string; sub?: string; growth?: number }[]) {
  ensureSpace(ctx, 70);
  const { pdf, pageW, margin } = ctx;
  const cols = Math.min(cards.length, 4);
  const gutter = 10;
  const usableW = pageW - margin * 2;
  const cardW = (usableW - gutter * (cols - 1)) / cols;

  cards.slice(0, 4).forEach((card, i) => {
    const x = margin + i * (cardW + gutter);
    const y = ctx.y;

    // Card background
    setFill(pdf, C.white);
    setDraw(pdf, C.gray200);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(x, y, cardW, 60, 4, 4, 'FD');

    // Orange top strip
    setFill(pdf, C.orange);
    pdf.roundedRect(x, y, cardW, 4, 4, 4, 'F');
    pdf.rect(x, y + 1, cardW, 3, 'F'); // fill corners

    // Label
    setTxtColor(pdf, C.gray500);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(card.label.toUpperCase(), x + 10, y + 18);

    // Value
    setTxtColor(pdf, C.gray900);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(card.value, x + 10, y + 38);

    // Growth badge
    if (card.growth !== undefined) {
      const isPos = card.growth >= 0;
      setFill(pdf, isPos ? C.greenLight : [254, 226, 226]);
      pdf.roundedRect(x + 10, y + 44, 48, 10, 2, 2, 'F');
      setTxtColor(pdf, isPos ? C.green : [220, 38, 38]);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.text(pct(card.growth), x + 12, y + 51);
      setTxtColor(pdf, C.gray500);
      pdf.setFont('helvetica', 'normal');
      pdf.text('vs prev period', x + 34, y + 51);
    } else if (card.sub) {
      setTxtColor(pdf, C.gray500);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text(card.sub, x + 10, y + 51);
    }
  });
  ctx.y += 70;
}

function drawBarChart(ctx: Ctx, title: string, rows: { label: string; value: number; color?: [number, number, number] }[]) {
  if (rows.length === 0) return;
  ensureSpace(ctx, 130);
  const { pdf, pageW, margin } = ctx;

  drawSectionTitle(ctx, title);
  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  const chartH = 90;
  const barAreaW = pageW - margin * 2;
  const barW = Math.min(36, (barAreaW / rows.length) * 0.55);
  const gap = barAreaW / rows.length;
  const baseY = ctx.y + chartH;

  // Grid lines
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const gy = baseY - chartH * f;
    setDraw(pdf, C.gray200);
    pdf.setLineWidth(0.3);
    pdf.line(margin, gy, pageW - margin, gy);
    setTxtColor(pdf, C.gray500);
    pdf.setFontSize(6);
    pdf.text(fmt(maxVal * f), margin - 2, gy + 2, { align: 'right' });
  });

  rows.forEach((row, i) => {
    const barH = Math.max(2, (row.value / maxVal) * chartH);
    const bx = margin + i * gap + (gap - barW) / 2;
    const by = baseY - barH;

    const clr = row.color ?? C.platformColors[row.label] ?? C.orange;
    setFill(pdf, clr);
    pdf.roundedRect(bx, by, barW, barH, 2, 2, 'F');

    // Value on top
    setTxtColor(pdf, C.gray700);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.text(fmt(row.value), bx + barW / 2, by - 3, { align: 'center' });

    // Label below
    setTxtColor(pdf, C.gray500);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    const short = row.label.length > 8 ? row.label.slice(0, 7) + '.' : row.label;
    pdf.text(short, bx + barW / 2, baseY + 10, { align: 'center' });
  });

  ctx.y = baseY + 22;
}

function drawTopPosts(ctx: Ctx, posts: UnifiedSummaryResponse['topPosts']) {
  if (posts.length === 0) return;
  const { pdf, pageW, margin } = ctx;
  const shown = posts.slice(0, 3);

  ensureSpace(ctx, 20 + shown.length * 55);
  drawSectionTitle(ctx, 'Top Performing Posts');

  shown.forEach((post, i) => {
    ensureSpace(ctx, 55);
    const rowY = ctx.y;

    // Row background
    setFill(pdf, i % 2 === 0 ? C.gray100 : C.white);
    pdf.rect(margin, rowY, pageW - margin * 2, 50, 'F');

    // Rank badge
    setFill(pdf, C.orange);
    pdf.circle(margin + 14, rowY + 14, 10, 'F');
    setTxtColor(pdf, C.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(String(i + 1), margin + 14, rowY + 17, { align: 'center' });

    // Platform pill
    const plColor = C.platformColors[post.platform] ?? C.orange;
    setFill(pdf, plColor);
    pdf.roundedRect(margin + 28, rowY + 6, 48, 14, 3, 3, 'F');
    setTxtColor(pdf, C.white);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text(post.platform, margin + 32, rowY + 15);

    // Caption
    setTxtColor(pdf, C.gray700);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    const cap = post.caption?.slice(0, 90) || 'No caption';
    const capLines = pdf.splitTextToSize(cap, pageW - margin * 2 - 85);
    pdf.text(capLines, margin + 82, rowY + 14);

    // Stats row
    const statY = rowY + 34;
    const stats: { icon: string; val: string }[] = [
      { icon: '❤', val: fmt(post.likes) },
      { icon: '💬', val: fmt(post.comments) },
      { icon: '↗', val: fmt(post.shares) },
      { icon: '👁', val: fmt(post.impressions) },
    ];
    stats.forEach((s, j) => {
      setTxtColor(pdf, C.gray500);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${s.icon} ${s.val}`, margin + 82 + j * 70, statY);
    });

    // Engagement total
    setFill(pdf, C.orangeLight);
    pdf.roundedRect(pageW - margin - 68, rowY + 8, 66, 16, 3, 3, 'F');
    setTxtColor(pdf, C.orangeDark);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(`${fmt(post.totalEngagement)} eng.`, pageW - margin - 64, rowY + 19);

    ctx.y += 54;
  });
  ctx.y += 6;
}

function drawPlatformTable(ctx: Ctx, rollups: PlatformRollup[]) {
  if (rollups.length === 0) return;
  ensureSpace(ctx, 24 + rollups.length * 20 + 30);
  const { pdf, pageW, margin } = ctx;

  drawSectionTitle(ctx, 'Platform Performance Breakdown');

  const cols = ['Platform', 'Posts', 'Impressions', 'Engagement', 'Likes', 'Comments', 'Shares'];
  const colW = (pageW - margin * 2) / cols.length;

  // Header
  setFill(pdf, C.gray900);
  pdf.rect(margin, ctx.y, pageW - margin * 2, 16, 'F');
  setTxtColor(pdf, C.white);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  cols.forEach((col, i) => {
    pdf.text(col, margin + i * colW + 4, ctx.y + 10);
  });
  ctx.y += 18;

  rollups.forEach((row, ri) => {
    ensureSpace(ctx, 18);
    setFill(pdf, ri % 2 === 0 ? C.gray100 : C.white);
    pdf.rect(margin, ctx.y, pageW - margin * 2, 16, 'F');

    const values = [row.platform, fmtFull(row.posts), fmtFull(row.impressions), fmtFull(row.engagement), fmtFull(row.likes), fmtFull(row.comments), fmtFull(row.shares)];

    values.forEach((val, i) => {
      if (i === 0) {
        // Platform name with color dot
        const clr = C.platformColors[val] ?? C.gray500;
        setFill(pdf, clr);
        pdf.circle(margin + 6, ctx.y + 8, 3, 'F');
        setTxtColor(pdf, C.gray900);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.text(val, margin + 12, ctx.y + 11);
      } else {
        setTxtColor(pdf, C.gray700);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.text(val, margin + i * colW + 4, ctx.y + 11);
      }
    });
    ctx.y += 17;
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
    if (mt.includes('VIDEO') || mt.includes('REEL') || mt.includes('REELS')) key = 'Video';
    else if (mt.includes('CAROUSEL') || mt.includes('ALBUM')) key = 'Carousel';
    else if (mt.includes('IMAGE') || mt.includes('PHOTO') || mt.includes('PICTURE')) key = 'Image';
    buckets[key].posts += 1;
    buckets[key].eng += h.totalEngagement;
    buckets[key].imp += h.impressions;
  }

  const rows = Object.entries(buckets)
    .filter(([, v]) => v.posts > 0)
    .map(([label, v]) => ({
      label,
      posts: v.posts,
      eng: v.eng,
      avgEng: v.posts > 0 ? Math.round(v.eng / v.posts) : 0,
    }))
    .sort((a, b) => b.avgEng - a.avgEng);

  if (rows.length === 0) return;
  ensureSpace(ctx, 24 + rows.length * 20 + 30);
  const { pdf, pageW, margin } = ctx;

  drawSectionTitle(ctx, 'Content Type Performance');

  const typeColors: Record<string, [number, number, number]> = {
    Video: [239, 68, 68],
    Carousel: [139, 92, 246],
    Image: [16, 185, 129],
    Other: [107, 114, 128],
  };

  const maxAvg = Math.max(...rows.map((r) => r.avgEng), 1);
  const barMaxW = pageW - margin * 2 - 200;

  rows.forEach((row) => {
    ensureSpace(ctx, 28);
    const clr = typeColors[row.label] ?? C.orange;
    setFill(pdf, clr);
    pdf.circle(margin + 6, ctx.y + 10, 5, 'F');
    setTxtColor(pdf, C.gray900);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(row.label, margin + 16, ctx.y + 13);

    // Bar
    const bw = Math.max(2, (row.avgEng / maxAvg) * barMaxW);
    setFill(pdf, clr);
    pdf.setFillColor(clr[0], clr[1], clr[2], 0.2);
    pdf.roundedRect(margin + 80, ctx.y + 5, bw, 10, 2, 2, 'F');
    setFill(pdf, clr);
    pdf.roundedRect(margin + 80, ctx.y + 5, Math.min(8, bw), 10, 2, 2, 'F');

    setTxtColor(pdf, C.gray700);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(`${row.posts} posts · avg ${fmt(row.avgEng)} eng`, margin + 80 + bw + 6, ctx.y + 12);

    ctx.y += 22;
  });
  ctx.y += 8;
}

function drawAudienceGrowthChart(ctx: Ctx, audienceChart: UnifiedSummaryResponse['audienceChart']) {
  const points = audienceChart.filter((p) => {
    const total = Object.entries(p)
      .filter(([k]) => k !== 'date')
      .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
    return total > 0;
  });
  if (points.length < 2) return;

  ensureSpace(ctx, 140);
  const { pdf, pageW, margin } = ctx;
  drawSectionTitle(ctx, 'Audience Growth Trend');

  const chartH = 90;
  const chartW = pageW - margin * 2;
  const baseY = ctx.y + chartH;

  const totals = points.map((p) =>
    Object.entries(p)
      .filter(([k]) => k !== 'date')
      .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0)
  );
  const maxVal = Math.max(...totals, 1);

  // Grid
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const gy = baseY - chartH * f;
    setDraw(pdf, C.gray200);
    pdf.setLineWidth(0.3);
    pdf.line(margin, gy, pageW - margin, gy);
    if (f > 0) {
      setTxtColor(pdf, C.gray500);
      pdf.setFontSize(6);
      pdf.text(fmt(maxVal * f), margin - 2, gy + 2, { align: 'right' });
    }
  });

  // Fill area
  const ptCoords = points.map((p, i) => {
    const t = totals[i];
    const x = margin + (i / (points.length - 1)) * chartW;
    const y = baseY - (t / maxVal) * chartH;
    return { x, y };
  });

  // Area fill
  setFill(pdf, C.orangeLight);
  const pathPts = [
    [ptCoords[0].x, baseY],
    ...ptCoords.map((p) => [p.x, p.y]),
    [ptCoords[ptCoords.length - 1].x, baseY],
  ];
  // Simulate fill with rects
  for (let i = 0; i < ptCoords.length - 1; i++) {
    const a = ptCoords[i];
    const b = ptCoords[i + 1];
    const minY = Math.min(a.y, b.y);
    const h = baseY - minY;
    const w = b.x - a.x;
    setFill(pdf, [255, 237, 213]);
    pdf.rect(a.x, minY, w, h, 'F');
  }

  // Line
  setDraw(pdf, C.orange);
  pdf.setLineWidth(1.5);
  for (let i = 0; i < ptCoords.length - 1; i++) {
    pdf.line(ptCoords[i].x, ptCoords[i].y, ptCoords[i + 1].x, ptCoords[i + 1].y);
  }

  // Dots + date labels
  ptCoords.forEach((pt, i) => {
    setFill(pdf, C.white);
    pdf.circle(pt.x, pt.y, 3, 'F');
    setFill(pdf, C.orange);
    pdf.circle(pt.x, pt.y, 2, 'F');

    if (i % Math.max(1, Math.floor(points.length / 8)) === 0) {
      setTxtColor(pdf, C.gray500);
      pdf.setFontSize(5.5);
      const dateStr = points[i].date?.slice(5) ?? '';
      pdf.text(dateStr, pt.x, baseY + 10, { align: 'center' });
    }
  });

  ctx.y = baseY + 22;
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
      `Prioritize ${topPlatformByEng.platform}: It delivers the highest engagement (${fmtFull(topPlatformByEng.engagement)} total). Increase posting frequency here by 20% next month.`
    );
  }
  if (summary.kpi.impressionsGrowthPercentage < 0) {
    recs.push('Reach is declining. Experiment with Reels and short-form video formats on Instagram and TikTok, which typically generate 2x the organic reach of static posts.');
  } else if (topPlatformByImp && topPlatformByImp.platform !== topPlatformByEng?.platform) {
    recs.push(`${topPlatformByImp.platform} drives the most impressions (${fmtFull(topPlatformByImp.impressions)}). Cross-promote top-performing content from ${topPlatformByEng?.platform ?? 'other platforms'} there.`);
  }
  if (avgEng < 50) {
    recs.push('Engagement per post is low. Add a clear call-to-action in every caption, ask questions, and respond to every comment in the first hour of posting to boost algorithmic reach.');
  } else {
    recs.push(`Strong avg. engagement of ${fmt(avgEng)} per post. Analyze your top 3 posts for common themes (format, topic, posting time) and build your next content calendar around those patterns.`);
  }
  if (summary.kpi.audienceGrowthPercentage > 0) {
    recs.push(`Audience is growing at ${pct(summary.kpi.audienceGrowthPercentage)}. Capitalize on momentum by adding a lead magnet or link-in-bio offer to convert new followers.`);
  } else {
    recs.push('Follower growth is flat or negative. Run a targeted collaboration with a creator in your niche, or launch a giveaway campaign to re-ignite discovery.');
  }
  recs.push('Consistency beats virality. Aim for a minimum 3x/week posting schedule across your primary platform and use Agent4Socials Scheduler to queue content in advance.');

  recs.slice(0, 5).forEach((rec, i) => {
    ensureSpace(ctx, 44);
    const rowY = ctx.y;

    setFill(pdf, C.orangeLight);
    pdf.roundedRect(margin, rowY, pageW - margin * 2, 38, 4, 4, 'F');

    setFill(pdf, C.orange);
    pdf.roundedRect(margin, rowY, 28, 38, 4, 4, 'F');
    pdf.rect(margin + 20, rowY, 8, 38, 'F');

    setTxtColor(pdf, C.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(String(i + 1), margin + 14, rowY + 24, { align: 'center' });

    setTxtColor(pdf, C.gray900);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    const lines = pdf.splitTextToSize(rec, pageW - margin * 2 - 40);
    const lineH = 9;
    const startY = rowY + (38 - Math.min(lines.length, 4) * lineH) / 2 + lineH;
    lines.slice(0, 4).forEach((line: string, li: number) => {
      pdf.text(line, margin + 34, startY + li * lineH);
    });

    ctx.y += 44;
  });
  ctx.y += 8;
}

function drawFooter(ctx: Ctx, pageNum: number) {
  const { pdf, pageW, pageH } = ctx;
  setFill(pdf, C.gray100);
  pdf.rect(0, pageH - 24, pageW, 24, 'F');
  setTxtColor(pdf, C.gray500);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Agent4Socials Analytics Report  ·  agent4socials.com', 40, pageH - 9);
  pdf.text(`Page ${pageNum}`, pageW - 40, pageH - 9, { align: 'right' });
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
  const accountLine = accounts
    .slice(0, 5)
    .map((a) => `${a.platform}${a.username ? ` (@${a.username})` : ''}`)
    .join('  ·  ');

  drawHeader(ctx, 'Analytics Report', 'Performance snapshot for all connected accounts', `${dateRange.start}  →  ${dateRange.end}`, accountLine);

  drawKpiCards(ctx, [
    { label: 'Total Posts', value: fmtFull(summary.kpi.totalPosts), growth: summary.kpi.postsGrowthPercentage },
    { label: 'Total Impressions', value: fmt(summary.kpi.totalImpressions), growth: summary.kpi.impressionsGrowthPercentage },
    { label: 'Total Engagement', value: fmt(summary.kpi.totalEngagement), growth: summary.kpi.engagementGrowthPercentage },
    { label: 'Audience', value: fmt(summary.kpi.totalAudience), growth: summary.kpi.audienceGrowthPercentage },
  ]);

  ctx.y += 8;
  drawTopPosts(ctx, summary.topPosts);
  ctx.y += 6;
  drawBarChart(ctx, 'Impressions by Platform', rollups.map((r) => ({ label: r.platform, value: r.impressions })));
  drawBarChart(ctx, 'Engagement by Platform', rollups.map((r) => ({ label: r.platform, value: r.engagement })));

  // Page numbers
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawFooter(ctx, i);
  }

  pdf.save(`agent4socials-simple-report-${dateRange.start}-to-${dateRange.end}.pdf`);
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
  const accountLine = accounts
    .slice(0, 5)
    .map((a) => `${a.platform}${a.username ? ` (@${a.username})` : ''}`)
    .join('  ·  ');

  drawHeader(ctx, 'Advanced Analytics Report', 'Comprehensive performance analysis with AI recommendations', `${dateRange.start}  →  ${dateRange.end}`, accountLine);

  // Page 1: KPIs
  drawKpiCards(ctx, [
    { label: 'Total Posts', value: fmtFull(summary.kpi.totalPosts), growth: summary.kpi.postsGrowthPercentage },
    { label: 'Total Impressions', value: fmt(summary.kpi.totalImpressions), growth: summary.kpi.impressionsGrowthPercentage },
    { label: 'Total Engagement', value: fmt(summary.kpi.totalEngagement), growth: summary.kpi.engagementGrowthPercentage },
    { label: 'Audience', value: fmt(summary.kpi.totalAudience), growth: summary.kpi.audienceGrowthPercentage },
  ]);
  ctx.y += 6;
  drawTopPosts(ctx, summary.topPosts);

  // Page 2: Platform detail
  ctx.y += 12;
  drawPlatformTable(ctx, rollups);
  drawBarChart(ctx, 'Impressions by Platform', rollups.map((r) => ({ label: r.platform, value: r.impressions })));
  drawBarChart(ctx, 'Engagement by Platform', rollups.map((r) => ({ label: r.platform, value: r.engagement })));

  // Page 3: Audience growth + content type
  ctx.y += 8;
  drawAudienceGrowthChart(ctx, summary.audienceChart);
  drawPostTypeBreakdown(ctx, summary.history);

  // Page 4+: AI recommendations
  ctx.y += 12;
  drawRecommendations(ctx, summary, rollups);

  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawFooter(ctx, i);
  }

  pdf.save(`agent4socials-advanced-report-${dateRange.start}-to-${dateRange.end}.pdf`);
}
