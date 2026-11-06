import { describe, expect, it } from 'vitest';

import { KeyModifier } from './contract.ts';

describe('KeyModifier', () => {
  it('combines left and right modifier bits into side-agnostic masks', () => {
    expect(KeyModifier.SHIFT).toBe(KeyModifier.LEFT_SHIFT | KeyModifier.RIGHT_SHIFT);
    expect(KeyModifier.CTRL).toBe(KeyModifier.LEFT_CTRL | KeyModifier.RIGHT_CTRL);
    expect(KeyModifier.ALT).toBe(KeyModifier.LEFT_ALT | KeyModifier.RIGHT_ALT);
    expect(KeyModifier.META).toBe(KeyModifier.LEFT_META | KeyModifier.RIGHT_META);
  });

  it('gives every single-side and lock modifier a distinct bit', () => {
    const bits = [
      KeyModifier.LEFT_SHIFT,
      KeyModifier.RIGHT_SHIFT,
      KeyModifier.LEFT_CTRL,
      KeyModifier.RIGHT_CTRL,
      KeyModifier.LEFT_ALT,
      KeyModifier.RIGHT_ALT,
      KeyModifier.LEFT_META,
      KeyModifier.RIGHT_META,
      KeyModifier.NUM_LOCK,
      KeyModifier.CAPS_LOCK,
      KeyModifier.MODE,
    ];
    expect(bits.reduce((mask, bit) => mask | bit, 0)).toBe(bits.reduce((sum, bit) => sum + bit, 0));
    expect(KeyModifier.NONE).toBe(0);
  });
});
