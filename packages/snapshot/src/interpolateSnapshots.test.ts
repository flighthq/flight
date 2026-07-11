import { describe, expect, it } from 'vitest';

import { captureSnapshot } from './captureSnapshot';
import { interpolateSnapshots } from './interpolateSnapshots';

describe('interpolateSnapshots', () => {
  it('lerps numerics and snaps the string at t=0.5', () => {
    const a = captureSnapshot({ x: 0, y: 10, name: 'a' });
    const b = captureSnapshot({ x: 10, y: 0, name: 'b' });
    const out = { x: 0, y: 0, name: '' };
    interpolateSnapshots(a, b, 0.5, out);
    expect(out).toEqual({ x: 5, y: 5, name: 'b' });
  });

  it('returns a numerics at t=0 and b numerics at t=1', () => {
    const a = captureSnapshot({ x: 0, y: 10 });
    const b = captureSnapshot({ x: 10, y: 0 });
    const atStart = { x: -1, y: -1 };
    const atEnd = { x: -1, y: -1 };
    interpolateSnapshots(a, b, 0, atStart);
    interpolateSnapshots(a, b, 1, atEnd);
    expect(atStart).toEqual({ x: 0, y: 10 });
    expect(atEnd).toEqual({ x: 10, y: 0 });
  });

  it('interpolates only schema-listed paths and snaps the rest to b', () => {
    const a = captureSnapshot({ x: 0, y: 10 });
    const b = captureSnapshot({ x: 10, y: 0 });
    const out = { x: 0, y: 0 };
    interpolateSnapshots(a, b, 0.5, out, ['x']);
    expect(out).toEqual({ x: 5, y: 0 });
  });

  it('lerps nested numeric fields', () => {
    const a = captureSnapshot({ pos: { x: 0, y: 0 } });
    const b = captureSnapshot({ pos: { x: 100, y: 40 } });
    const out = { pos: { x: 0, y: 0 } };
    interpolateSnapshots(a, b, 0.25, out);
    expect(out.pos).toEqual({ x: 25, y: 10 });
  });

  it('clamps t below 0 and above 1', () => {
    const a = captureSnapshot({ x: 0 });
    const b = captureSnapshot({ x: 10 });
    const under = { x: -1 };
    const over = { x: -1 };
    interpolateSnapshots(a, b, -5, under);
    interpolateSnapshots(a, b, 5, over);
    expect(under.x).toBe(0);
    expect(over.x).toBe(10);
  });

  it('lerps arrays of numbers element-wise', () => {
    const a = captureSnapshot({ points: [0, 100] });
    const b = captureSnapshot({ points: [10, 0] });
    const out = { points: [0, 0] };
    interpolateSnapshots(a, b, 0.5, out);
    expect(out.points).toEqual([5, 50]);
  });

  it('snaps a null field to b', () => {
    const a = captureSnapshot({ value: 1, tag: null as number | null });
    const b = captureSnapshot({ value: 3, tag: null as number | null });
    const out = { value: 0, tag: 7 as number | null };
    interpolateSnapshots(a, b, 0.5, out);
    expect(out.value).toBe(2);
    expect(out.tag).toBeNull();
  });
});
