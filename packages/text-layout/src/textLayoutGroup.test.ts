import { describe, expect, it } from 'vitest';

import { createTextLayoutGroup } from './textLayoutGroup';

describe('createTextLayoutGroup', () => {
  it('initializes with zero metrics', () => {
    const fmt = { size: 16 };
    const group = createTextLayoutGroup(fmt, 0, 5);
    expect(group.ascent).toBe(0);
    expect(group.descent).toBe(0);
    expect(group.height).toBe(0);
    expect(group.leading).toBe(0);
    expect(group.lineIndex).toBe(0);
    expect(group.offsetX).toBe(0);
    expect(group.offsetY).toBe(0);
    expect(group.width).toBe(0);
    expect(group.positions).toEqual([]);
  });

  it('stores the provided format, startIndex, and endIndex', () => {
    const fmt = { size: 24 };
    const group = createTextLayoutGroup(fmt, 3, 10);
    expect(group.format).toBe(fmt);
    expect(group.startIndex).toBe(3);
    expect(group.endIndex).toBe(10);
  });

  it('returns a new object each call', () => {
    const fmt = {};
    expect(createTextLayoutGroup(fmt, 0, 1)).not.toBe(createTextLayoutGroup(fmt, 0, 1));
  });
});
