import { describe, expect, it } from 'vitest';

import { captureSnapshot } from './captureSnapshot';
import { equalsSnapshot } from './equalsSnapshot';

describe('equalsSnapshot', () => {
  it('is true for deep-equal snapshots', () => {
    const a = captureSnapshot({ x: 1, nested: { y: 2 }, items: [3, 4] });
    const b = captureSnapshot({ x: 1, nested: { y: 2 }, items: [3, 4] });
    expect(equalsSnapshot(a, b)).toBe(true);
  });

  it('is false for a differing leaf value', () => {
    const a = captureSnapshot({ x: 1, nested: { y: 2 } });
    const b = captureSnapshot({ x: 1, nested: { y: 3 } });
    expect(equalsSnapshot(a, b)).toBe(false);
  });

  it('is false for a differing shape', () => {
    const a = captureSnapshot({ x: 1 } as Record<string, number>);
    const b = captureSnapshot({ x: 1, y: 2 } as Record<string, number>);
    expect(equalsSnapshot(a, b)).toBe(false);
  });

  it('is false for arrays of differing length', () => {
    const a = captureSnapshot({ items: [1, 2] });
    const b = captureSnapshot({ items: [1, 2, 3] });
    expect(equalsSnapshot(a, b)).toBe(false);
  });

  it('is true for two empty objects', () => {
    expect(equalsSnapshot(captureSnapshot({}), captureSnapshot({}))).toBe(true);
  });

  it('is false for an array compared to an object with the same indexed values', () => {
    const a = captureSnapshot([1, 2] as unknown as object);
    const b = captureSnapshot({ 0: 1, 1: 2 } as unknown as object);
    expect(equalsSnapshot(a, b)).toBe(false);
  });

  it('is false when objects differ three levels deep', () => {
    const a = captureSnapshot({ level1: { level2: { level3: { value: 1 } } } });
    const b = captureSnapshot({ level1: { level2: { level3: { value: 2 } } } });
    expect(equalsSnapshot(a, b)).toBe(false);
  });

  it('is true when objects are equal three levels deep', () => {
    const a = captureSnapshot({ level1: { level2: { level3: { value: 42 } } } });
    const b = captureSnapshot({ level1: { level2: { level3: { value: 42 } } } });
    expect(equalsSnapshot(a, b)).toBe(true);
  });

  it('distinguishes null from a value at the same key', () => {
    const a = captureSnapshot({ tag: null as number | null });
    const b = captureSnapshot({ tag: 0 as number | null });
    expect(equalsSnapshot(a, b)).toBe(false);
  });
});
