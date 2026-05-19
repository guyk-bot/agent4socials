import { messageBodyFromRow, type IgMessageRow } from '../load-meta-conversation-messages';

describe('messageBodyFromRow', () => {
  it('returns plain text when present', () => {
    expect(messageBodyFromRow({ id: '1', message: 'Hello there' })).toBe('Hello there');
  });

  it('returns empty caption when image URL will render in UI', () => {
    const row: IgMessageRow = {
      id: '1',
      attachments: { data: [{ image_data: { url: 'https://cdn.example/x.jpg' } }] },
    };
    expect(messageBodyFromRow(row)).toBe('');
  });

  it('labels shared reels', () => {
    const row: IgMessageRow = {
      id: '1',
      shares: { data: [{ type: 'ig_reel', name: 'My reel' }] },
    };
    expect(messageBodyFromRow(row)).toBe('(Shared reel: My reel)');
  });

  it('labels reactions', () => {
    const row: IgMessageRow = {
      id: '1',
      reactions: { data: [{ reaction: '❤️', users: [{ id: 'u1' }] }] },
    };
    expect(messageBodyFromRow(row)).toBe('(Reaction ❤️)');
  });
});
