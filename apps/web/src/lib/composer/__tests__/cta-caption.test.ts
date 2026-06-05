import { captionContainsCta, dedupeTrailingParagraphs, mergeCaptionWithCta } from '../cta-caption';

describe('mergeCaptionWithCta', () => {
  const cta = 'Try iZop for free today! Comment AI and I will send you the link.';

  it('does not append when CTA is already the last paragraph', () => {
    const body = `Main post text.\n\n${cta}`;
    expect(mergeCaptionWithCta(body, cta)).toBe(body);
  });

  it('appends CTA once when missing', () => {
    const body = 'Main post text only.';
    expect(mergeCaptionWithCta(body, cta)).toBe(`${body}\n\n${cta}`);
  });

  it('dedupes identical trailing paragraphs', () => {
    const dup = `${cta}\n\n${cta}`;
    expect(dedupeTrailingParagraphs(dup)).toBe(cta);
  });

  it('collapses duplicated CTA blocks to one closing line', () => {
    const body = `Ready to level up?\n\n${cta}\n\n${cta}`;
    expect(mergeCaptionWithCta(body, cta)).toBe(`Ready to level up?\n\n${cta}`);
  });

  it('treats quoted keyword CTA as the same line', () => {
    const quoted =
      "Try iZop for free today! Comment 'AI' and I will send you the link.";
    const body = `Hook line.\n\n${quoted}\n\n${cta}`;
    expect(mergeCaptionWithCta(body, cta)).toBe(`Hook line.\n\n${cta}`);
  });
});

describe('captionContainsCta', () => {
  it('matches case-insensitive substring', () => {
    expect(
      captionContainsCta('Hello. COMMENT ai and I will send you the link.', 'comment AI and I will send you the link')
    ).toBe(true);
  });
});
