import { createChildClock, createClock } from './createClock';
import { getClockParent } from './getClockParent';

describe('getClockParent', () => {
  it('returns null for a root clock', () => {
    expect(getClockParent(createClock())).toBeNull();
  });

  it('returns the parent for a child clock', () => {
    const parent = createClock();
    const child = createChildClock(parent);
    expect(getClockParent(child)).toBe(parent);
  });
});
