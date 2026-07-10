import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './relativeTime';

describe('formatRelativeTime', () => {
  it('phrases a future offset in en-US', () => {
    expect(formatRelativeTime(2, 'day', 'en-US')).toBe('in 2 days');
  });

  it('phrases a past offset in en-US', () => {
    expect(formatRelativeTime(-1, 'day', 'en-US')).toBe('1 day ago');
  });
});
