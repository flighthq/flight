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

  it('is a no-op for a primitive top-level snapshot', () => {
    const snapshot = captureSnapshot(42 as unknown as Record<string, unknown>);
    const target: Record<string, unknown> = { x: 1 };
    restoreSnapshot(snapshot, target);
    expect(target).toEqual({ x: 1 });
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

  it('preserves extra keys in the target that are not in the snapshot', () => {
    const snapshot = captureSnapshot({ x: 10 } as Record<string, number>);
    const target = { x: 0, y: 5, z: 99 } as Record<string, number>;
    restoreSnapshot(snapshot, target);
    expect(target.x).toBe(10);
    expect(target.y).toBe(5);
    expect(target.z).toBe(99);
  });

  it('replaces a nested container when the type changes from object to array', () => {
    const snapshot = captureSnapshot({ data: [1, 2, 3] as unknown });
    const target = { data: { a: 1 } as unknown };
    restoreSnapshot(snapshot, target);
    expect(target.data).toEqual([1, 2, 3]);
    expect(Array.isArray(target.data)).toBe(true);
  });

  it('replaces a nested container when the type changes from array to object', () => {
    const snapshot = captureSnapshot({ data: { a: 1 } as unknown });
    const target = { data: [1, 2, 3] as unknown };
    restoreSnapshot(snapshot, target);
    expect(target.data).toEqual({ a: 1 });
    expect(Array.isArray(target.data)).toBe(false);
  });

  it('resizes the target array to the snapshot array length', () => {
    const snapshot = captureSnapshot({ items: [1, 2] });
    const target = { items: [9, 9, 9, 9] };
    restoreSnapshot(snapshot, target);
    expect(target.items).toEqual([1, 2]);
  });
});
