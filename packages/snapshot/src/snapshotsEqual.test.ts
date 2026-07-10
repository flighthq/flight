import { describe, expect, it } from 'vitest';

import { captureSnapshot } from './captureSnapshot';
import { snapshotsEqual } from './snapshotsEqual';

describe('snapshotsEqual', () => {
  it('is true for deep-equal snapshots', () => {
    const a = captureSnapshot({ x: 1, nested: { y: 2 }, items: [3, 4] });
    const b = captureSnapshot({ x: 1, nested: { y: 2 }, items: [3, 4] });
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('is false for a differing leaf value', () => {
    const a = captureSnapshot({ x: 1, nested: { y: 2 } });
    const b = captureSnapshot({ x: 1, nested: { y: 3 } });
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('is false for a differing shape', () => {
    const a = captureSnapshot({ x: 1 } as Record<string, number>);
    const b = captureSnapshot({ x: 1, y: 2 } as Record<string, number>);
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('is false for arrays of differing length', () => {
    const a = captureSnapshot({ items: [1, 2] });
    const b = captureSnapshot({ items: [1, 2, 3] });
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('is true for two empty objects', () => {
    expect(snapshotsEqual(captureSnapshot({}), captureSnapshot({}))).toBe(true);
  });

  it('distinguishes null from a value at the same key', () => {
    const a = captureSnapshot({ tag: null as number | null });
    const b = captureSnapshot({ tag: 0 as number | null });
    expect(snapshotsEqual(a, b)).toBe(false);
  });
});
