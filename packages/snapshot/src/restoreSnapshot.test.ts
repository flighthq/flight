import { describe, expect, it } from 'vitest';

import { captureSnapshot } from './captureSnapshot';
import { restoreSnapshot } from './restoreSnapshot';

describe('restoreSnapshot', () => {
  it('writes a snapshot back into a live target', () => {
    const snapshot = captureSnapshot({ x: 1, y: 2 });
    const target = { x: 0, y: 0 };
    restoreSnapshot(snapshot, target);
    expect(target).toEqual({ x: 1, y: 2 });
  });

  it('restores nested objects and arrays', () => {
    const snapshot = captureSnapshot({ nested: { a: 1 }, items: [1, 2, 3] });
    const target = { nested: { a: 0 }, items: [0] };
    restoreSnapshot(snapshot, target);
    expect(target.nested).toEqual({ a: 1 });
    expect(target.items).toEqual([1, 2, 3]);
  });

  it('keeps the target object identity, mutating in place', () => {
    const snapshot = captureSnapshot({ x: 1 });
    const target = { x: 0 };
    const before = target;
    restoreSnapshot(snapshot, target);
    expect(target).toBe(before);
  });

  it('reuses a compatible nested container rather than replacing it', () => {
    const snapshot = captureSnapshot({ nested: { a: 1 } });
    const target = { nested: { a: 0 } };
    const nestedBefore = target.nested;
    restoreSnapshot(snapshot, target);
    expect(target.nested).toBe(nestedBefore);
    expect(target.nested.a).toBe(1);
  });

  it('leaves the restored target mutable and unaliased from the frozen snapshot', () => {
    const snapshot = captureSnapshot({ nested: { a: 1 } });
    const target = { nested: { a: 0 } } as { nested: { a: number } };
    restoreSnapshot(snapshot, target);
    target.nested.a = 42;
    expect(target.nested.a).toBe(42);
    expect(snapshot.nested.a).toBe(1);
  });

  it('resizes the target array to the snapshot array length', () => {
    const snapshot = captureSnapshot({ items: [1, 2] });
    const target = { items: [9, 9, 9, 9] };
    restoreSnapshot(snapshot, target);
    expect(target.items).toEqual([1, 2]);
  });
});
