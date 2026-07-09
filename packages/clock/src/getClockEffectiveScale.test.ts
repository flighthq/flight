import { createChildClock, createClock } from './createClock';
import { getClockEffectiveScale } from './getClockEffectiveScale';

describe('getClockEffectiveScale', () => {
  it('returns the local scale for a root', () => {
    expect(getClockEffectiveScale(createClock({ scale: 2 }))).toBe(2);
  });

  it('multiplies through the ancestor chain', () => {
    const a = createClock({ scale: 2 });
    const b = createChildClock(a, { scale: 0.5 });
    const c = createChildClock(b, { scale: 3 });
    expect(getClockEffectiveScale(c)).toBe(3); // 2 * 0.5 * 3
  });
});
