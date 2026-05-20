import { mergeInboxSenderRows, mergeStableKeyedList } from '@/lib/inbox/merge-inbox-lists';

describe('mergeInboxSenderRows', () => {
  it('keeps prior name when incoming participant row is blank', () => {
    const merged = mergeInboxSenderRows(
      [{ id: '123', name: 'Alice', username: 'alice', pictureUrl: 'https://a.test/p.jpg' }],
      [{ id: '123', name: undefined, username: undefined, pictureUrl: null }]
    );
    expect(merged[0].name).toBe('Alice');
    expect(merged[0].username).toBe('alice');
    expect(merged[0].pictureUrl).toBe('https://a.test/p.jpg');
  });
});

describe('mergeStableKeyedList', () => {
  it('does not drop rows when incoming is empty', () => {
    const prev = [{ commentId: 'c1', text: 'hi' }];
    const next = mergeStableKeyedList(prev, [], (r) => r.commentId, (a, b) => ({ ...a, ...b }));
    expect(next).toHaveLength(1);
  });
});
