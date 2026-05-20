import { captionContainsCta, dedupeTrailingParagraphs, mergeCaptionWithCta } from '../cta-caption';

describe('mergeCaptionWithCta', () => {
  const cta = 'Try Agent4Socials for free today! Comment AI and I will send you the link.';

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
});

describe('captionContainsCta', () => {
  it('matches case-insensitive substring', () => {
    expect(
      captionContainsCta('Hello. COMMENT ai and I will send you the link.', 'comment AI and I will send you the link')
    ).toBe(true);
  });
});
