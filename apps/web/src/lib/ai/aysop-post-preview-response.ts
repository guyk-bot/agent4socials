import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';

/** Drop connect noise and empty assistant copy when a post preview card is shown. */
export function polishPostPreviewChatResponse(result: {
  reply: string;
  artifacts: AysopArtifact[];
}): { reply: string; artifacts: AysopArtifact[] } {
  const drafts = result.artifacts.filter(
    (a): a is Extract<AysopArtifact, { type: 'composer_post_draft' }> =>
      a.type === 'composer_post_draft'
  );
  if (!drafts.length) return result;

  const artifacts = result.artifacts.filter(
    (a) => a.type !== 'connect_platforms' && a.type !== 'accounts'
  );

  return {
    reply: '',
    artifacts,
  };
}
