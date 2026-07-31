import { describe, expect, it } from 'vitest';

import { captureSnapshot, setSnapshotCaptureGuard } from './captureSnapshot';

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

describe('captureSnapshot cyclic and shared structure', () => {
  // The package contract is acyclic, so these are not a supported input — they cover incidental
  // robustness, not a guarantee. Object.isFrozen doubles as the freeze walk's visited mark at no cost,
  // so capture survives a cycle rather than overflowing; the downstream walks deliberately do not, and
  // enableSnapshotGuards reports a cyclic source at capture time.
  it('captures a self-referencing object without overflowing the stack', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node['self'] = node;

    const snapshot = captureSnapshot(node) as Record<string, unknown>;

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot['self']).toBe(snapshot);
  });

  it('captures a mutually-referencing pair', () => {
    const a: Record<string, unknown> = { tag: 'a' };
    const b: Record<string, unknown> = { tag: 'b', a };
    a['b'] = b;

    const snapshot = captureSnapshot(a) as Record<string, Record<string, unknown>>;

    expect(Object.isFrozen(snapshot['b'])).toBe(true);
    expect(snapshot['b']!['a']).toBe(snapshot);
  });

  // A diamond is not a cycle, but shares the visited path: structuredClone keeps the sharing, and the
  // freeze walk must still freeze the shared node rather than skip it.
  it('freezes a shared subtree reached by two paths', () => {
    const shared = { v: 1 };

    const snapshot = captureSnapshot({ left: shared, right: shared }) as { left: object; right: object };

    expect(snapshot.left).toBe(snapshot.right);
    expect(Object.isFrozen(snapshot.left)).toBe(true);
  });
});

describe('setSnapshotCaptureGuard', () => {
  afterEach(() => setSnapshotCaptureGuard(null));

  // The seam exists so the warning text and the @flighthq/log dependency stay in the separately
  // importable guard module; the core path only calls whatever is installed.
  it('passes the capture source to the installed guard', () => {
    const seen: unknown[] = [];
    setSnapshotCaptureGuard((source) => seen.push(source));
    const source = { hp: 1 };

    captureSnapshot(source);

    expect(seen).toEqual([source]);
  });

  it('runs the guard against the source rather than the frozen clone', () => {
    let wasFrozen = true;
    setSnapshotCaptureGuard((source) => (wasFrozen = Object.isFrozen(source)));

    captureSnapshot({ hp: 1 });

    expect(wasFrozen).toBe(false);
  });

  it('stops calling the guard once cleared with null', () => {
    let calls = 0;
    setSnapshotCaptureGuard(() => (calls += 1));
    captureSnapshot({ a: 1 });
    setSnapshotCaptureGuard(null);
    captureSnapshot({ a: 2 });

    expect(calls).toBe(1);
  });
});
