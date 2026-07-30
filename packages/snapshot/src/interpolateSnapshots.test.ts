import { describe, expect, it } from 'vitest';

import { captureSnapshot } from './captureSnapshot';
import { interpolateSnapshots } from './interpolateSnapshots';
import { restoreSnapshot } from './restoreSnapshot';

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

  it('interpolates only dotted-path schema-listed nested fields', () => {
    const a = captureSnapshot({ pos: { x: 0, y: 0 }, hp: 100 });
    const b = captureSnapshot({ pos: { x: 100, y: 200 }, hp: 0 });
    const out = { pos: { x: 0, y: 0 }, hp: 0 };
    interpolateSnapshots(a, b, 0.5, out, ['pos.x']);
    expect(out.pos.x).toBe(50);
    expect(out.pos.y).toBe(200);
    expect(out.hp).toBe(0);
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

  it('assigns keys present only in b and ignores keys present only in a', () => {
    const a = captureSnapshot({ x: 10, onlyA: 99 } as Record<string, unknown>);
    const b = captureSnapshot({ x: 20, onlyB: 'hello' } as Record<string, unknown>);
    const out = { x: 0 } as Record<string, unknown>;
    interpolateSnapshots(a, b, 0.5, out);
    expect(out.x).toBe(15);
    expect(out.onlyB).toBe('hello');
    expect(out).not.toHaveProperty('onlyA');
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

  it('snaps to b when a has a number but b has a non-number at the same key', () => {
    const a = captureSnapshot({ x: 5 } as Record<string, unknown>);
    const b = captureSnapshot({ x: 'hello' } as Record<string, unknown>);
    const out = { x: 0 } as Record<string, unknown>;
    interpolateSnapshots(a, b, 0.5, out);
    expect(out.x).toBe('hello');
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

describe('interpolateSnapshots schema paths', () => {
  // A schema listing an array-indexed path is the case the dotted-path walk exists for: array
  // elements are addressed by index, so 'players.0.health' interpolates while 'players.1.health' —
  // absent from the schema — snaps to b.
  it('interpolates only the array-indexed path listed in the schema', () => {
    const a = captureSnapshot({ players: [{ health: 0 }, { health: 0 }] });
    const b = captureSnapshot({ players: [{ health: 100 }, { health: 100 }] });
    const out = { players: [{ health: 0 }, { health: 0 }] };

    interpolateSnapshots(a, b, 0.5, out, ['players.0.health']);

    expect(out.players[0]!.health).toBe(50);
    expect(out.players[1]!.health).toBe(100);
  });

  // An empty schema is not the same as no schema: it lists nothing, so nothing interpolates and every
  // numeric leaf snaps to b. Collapsing the two would silently invert the caller's intent.
  it('treats an empty schema as "interpolate nothing", not "interpolate everything"', () => {
    const a = captureSnapshot({ hp: 0 });
    const b = captureSnapshot({ hp: 100 });
    const out = { hp: 0 };

    interpolateSnapshots(a, b, 0.5, out, []);

    expect(out.hp).toBe(100);
  });

  it('interpolates every numeric leaf when no schema is given', () => {
    const a = captureSnapshot({ hp: 0, mp: 0 });
    const b = captureSnapshot({ hp: 100, mp: 50 });
    const out = { hp: 0, mp: 0 };

    interpolateSnapshots(a, b, 0.5, out);

    expect(out.hp).toBe(50);
    expect(out.mp).toBe(25);
  });

  // The documented use: out is the caller's live render-state object, interpolated each frame and
  // later restored from a snapshot. The two operations must not fight over the same object.
  it('interpolates into an out object that is later restored into', () => {
    const a = captureSnapshot({ pos: { x: 0, y: 0 }, tag: 'a' });
    const b = captureSnapshot({ pos: { x: 10, y: 20 }, tag: 'b' });
    const live = { pos: { x: 0, y: 0 }, tag: 'a' };

    interpolateSnapshots(a, b, 0.5, live);
    expect(live.pos).toEqual({ x: 5, y: 10 });
    expect(live.tag).toBe('b');

    restoreSnapshot(a, live);
    expect(live.pos).toEqual({ x: 0, y: 0 });
    expect(live.tag).toBe('a');
  });
});
