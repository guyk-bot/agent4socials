import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { emptyBrandContextDraft } from '@/lib/funnel-chat-flow';

export type ThreadsBrandInput = {
  bio: string;
  postTexts: string[];
  replyTexts: string[];
};

export type ThreadsBrandOutput = {
  draft: BrandContextRecord;
  hashtagPool: string[];
  hasUsableDraft: boolean;
};

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function joinLines(lines: string[], maxItems: number, maxLen: number): string {
  return lines
    .filter(Boolean)
    .slice(0, maxItems)
    .map((l) => clip(l.trim(), maxLen))
    .join('\n');
}

const PROMO_RE =
  /\b(stay tuned|coming soon|launch(ing)? soon|something (big|exciting)|get ready|transform how|big things|launch that will)\b/i;

function isTeaserPost(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return true;
  return PROMO_RE.test(t) && t.length < 420;
}

function corpus(input: ThreadsBrandInput): string {
  return `${input.bio} ${input.postTexts.join(' ')}`.toLowerCase();
}

export function extractHashtagsFromTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    const matches = text.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g);
    if (!matches) continue;
    for (const raw of matches) {
      const tag = raw.toLowerCase();
      if (tag.length < 2 || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
  }
  return out.slice(0, 24);
}

function synthesizeOffer(bio: string, posts: string[]): string {
  const cleanBio = bio.trim();
  if (cleanBio.length >= 28 && !isTeaserPost(cleanBio)) {
    return clip(cleanBio, 500);
  }

  const c = `${bio} ${posts.join(' ')}`.toLowerCase();
  let core = '';
  if (/social media|content plan|schedule|scheduling|multi-?platform|cross-?platform/.test(c)) {
    core = 'Social media planning and scheduling';
  } else if (/saas|software|platform|tool|app/.test(c)) {
    core = 'Software platform';
  } else if (/ai |automation|workflow|productivity/.test(c)) {
    core = 'Workflow automation product';
  }

  const forParts: string[] = [];
  if (/small business|smb|entrepreneur|solopreneur/.test(c)) forParts.push('small businesses');
  if (/creator|influencer|content creator/.test(c)) forParts.push('creators');

  if (core && forParts.length > 0) {
    return clip(`${core} for ${forParts.join(' and ')}.`, 480);
  }
  if (core) return clip(`${core}.`, 480);

  if (cleanBio.length >= 12 && !isTeaserPost(cleanBio)) {
    return clip(cleanBio, 500);
  }

  return '';
}

function inferTargetAudience(input: ThreadsBrandInput): string {
  const c = corpus(input);
  const parts: string[] = [];

  if (/small business|smb|entrepreneur|solopreneur|startup/.test(c)) {
    parts.push('small business owners');
  }
  if (/creator|influencer|content creator/.test(c)) {
    parts.push('content creators');
  }
  if (/social media manager|marketing team|marketer/.test(c)) {
    parts.push('social media managers');
  }
  if (/agency|freelanc/.test(c)) {
    parts.push('marketing freelancers and agencies');
  }
  if (/brand owner|ecommerce|online store|shopify/.test(c)) {
    parts.push('online brand owners');
  }

  const unique = [...new Set(parts)];
  if (unique.length === 0) return '';
  if (unique.length === 1) {
    return clip(`${unique[0][0]!.toUpperCase()}${unique[0].slice(1)}.`, 280);
  }
  return clip(`${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}.`, 320);
}

function inferToneOfVoice(posts: string[]): string {
  if (posts.length === 0) return '';
  const joined = posts.join(' ').toLowerCase();
  const traits: string[] = [];

  if (/!|🚀|✨|💡|🔥/.test(joined)) traits.push('Enthusiastic');
  if (/\?/.test(joined)) traits.push('Conversational');
  if (/\b(you|your)\b/.test(joined)) traits.push('Direct');
  if (/\b(we|our|help|platform|tool|solution)\b/.test(joined)) traits.push('Professional');
  if (/\b(free|save time|easy|simple|streamline)\b/.test(joined)) traits.push('Benefit-led');
  if (PROMO_RE.test(joined)) traits.push('Promotional');

  const unique = [...new Set(traits)];
  return unique.slice(0, 4).join(', ');
}

function buildReplyExamples(replies: string[], max: number): string {
  const own = replies.filter((r) => !r.startsWith('@'));
  const source = own.length > 0 ? own : replies;
  return joinLines(source, max, 220);
}

export function synthesizeThreadsBrandContext(input: ThreadsBrandInput): ThreadsBrandOutput {
  const { bio, postTexts, replyTexts } = input;
  const hashtagPool = extractHashtagsFromTexts([...postTexts, ...replyTexts, bio]);
  const productDescription = synthesizeOffer(bio, postTexts);
  const targetAudience = inferTargetAudience(input);
  const toneOfVoice = inferToneOfVoice(postTexts);

  const captionSamples = postTexts.filter((p) => p.trim().length >= 12).slice(0, 4);
  const toneExamples = captionSamples.length > 0 ? joinLines(captionSamples, 4, 180) : '';

  const inboxReplyExamples = buildReplyExamples(replyTexts, 3);
  const commentReplyExamples = buildReplyExamples(replyTexts, 3);

  const filledCount = [productDescription, targetAudience, toneOfVoice, toneExamples].filter(
    (v) => v.trim().length >= 12
  ).length;

  const hasUsableDraft = filledCount >= 2 || (productDescription.length >= 20 && targetAudience.length >= 10);

  if (!hasUsableDraft && postTexts.length === 0 && !bio.trim()) {
    return {
      hasUsableDraft: false,
      hashtagPool,
      draft: {
        ...emptyBrandContextDraft(),
        toneExamples: toneExamples || null,
        inboxReplyExamples: inboxReplyExamples || null,
        commentReplyExamples: commentReplyExamples || null,
      },
    };
  }

  return {
    hasUsableDraft,
    hashtagPool,
    draft: {
      productDescription: productDescription || null,
      targetAudience: targetAudience || null,
      toneOfVoice: toneOfVoice || null,
      toneExamples: toneExamples || null,
      additionalContext: null,
      inboxReplyExamples: inboxReplyExamples || null,
      commentReplyExamples: commentReplyExamples || null,
    },
  };
}
