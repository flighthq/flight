import { describe, expect, it } from 'vitest';

import { captureSnapshot } from './captureSnapshot';

describe('captureSnapshot', () => {
  it('returns a deep-equal copy of the source', () => {
    const source = { x: 1, nested: { y: 2 }, items: [3, 4] };
    const snapshot = captureSnapshot(source);
    expect(snapshot).toEqual(source);
  });

  it('deep-freezes every nested object and array', () => {
    const snapshot = captureSnapshot({ x: 1, nested: { y: 2, points: [{ z: 3 }] } });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nested)).toBe(true);
    expect(Object.isFrozen(snapshot.nested.points)).toBe(true);
    expect(Object.isFrozen(snapshot.nested.points[0])).toBe(true);
  });

  it('is unaffected by mutating the source after capture', () => {
    const source = { x: 1, nested: { y: 2 }, items: [3, 4] };
    const snapshot = captureSnapshot(source);
    source.x = 99;
    source.nested.y = 99;
    source.items.push(5);
    expect(snapshot.x).toBe(1);
    expect(snapshot.nested.y).toBe(2);
    expect(snapshot.items).toEqual([3, 4]);
  });

  it('copies nested arrays rather than sharing the reference', () => {
    const source = { items: [1, 2, 3] };
    const snapshot = captureSnapshot(source);
    expect(snapshot.items).not.toBe(source.items);
    expect(snapshot.items).toEqual([1, 2, 3]);
  });

  it('captures an empty object', () => {
    const snapshot = captureSnapshot({});
    expect(snapshot).toEqual({});
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('captures null and undefined leaf fields', () => {
    const snapshot = captureSnapshot({ a: null, b: undefined, c: 1 });
    expect(snapshot.a).toBeNull();
    expect(snapshot.b).toBeUndefined();
    expect(snapshot.c).toBe(1);
  });
});
