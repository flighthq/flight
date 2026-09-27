import { describe, expect, it } from 'vitest';

import {
  createLottieBezierPath,
  flattenLottieShapePath,
  toLottieShapePath,
  unflattenLottieShapePath,
} from './lottieBezierPath.ts';

// A closed unit square: four vertices, zero tangents.
const SQUARE = {
  c: true,
  i: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  o: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  v: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
};

describe('createLottieBezierPath', () => {
  it('emits a command per vertex and closes a closed path', () => {
    const closed = createLottieBezierPath(SQUARE);
    const open = createLottieBezierPath({ ...SQUARE, c: false });
    expect(closed.commands.length).toBeGreaterThan(open.commands.length);
  });

  it('produces an empty path for a path with no vertices', () => {
    expect(createLottieBezierPath({ c: false, i: [], o: [], v: [] }).commands).toHaveLength(0);
  });
});

describe('flattenLottieShapePath', () => {
  // ★ THE FLAT LENGTH IS THE ANIMATION CONTRACT. A keyframed path is sampled as one flat number array, so the layout
  // here — six numbers a vertex, covering the point and both tangents — is what the channel's component count and the
  // core's "a keyframe changed the vertex count" check are both derived from.
  it('lays out six numbers per vertex', () => {
    expect(flattenLottieShapePath(SQUARE)).toHaveLength(SQUARE.v.length * 6);
  });

  it('round-trips through unflatten', () => {
    const flat = flattenLottieShapePath(SQUARE);
    const restored = unflattenLottieShapePath(SQUARE, flat);
    expect(restored.v).toEqual(SQUARE.v);
    expect(restored.i).toEqual(SQUARE.i);
    expect(restored.o).toEqual(SQUARE.o);
    expect(restored.c).toBe(SQUARE.c);
  });
});

describe('toLottieShapePath', () => {
  // ★ THE WRAPPER FORM IS THE MAJORITY IN REAL EXPORTS. A static path is the object; an animated keyframe wraps it in
  // a single-element array. Reading only the bare form fails on most files, which is the whole reason this reader
  // exists rather than a cast at each call site.
  it('reads the bare object and the single-element array form', () => {
    expect(toLottieShapePath(SQUARE)).toBe(SQUARE);
    expect(toLottieShapePath([SQUARE])).toBe(SQUARE);
  });

  it('answers undefined for anything that is not a shape path', () => {
    expect(toLottieShapePath(undefined)).toBeUndefined();
    expect(toLottieShapePath([])).toBeUndefined();
    expect(toLottieShapePath(42)).toBeUndefined();
    expect(toLottieShapePath({ nope: true })).toBeUndefined();
  });
});

describe('unflattenLottieShapePath', () => {
  it('reads the flat values back into the template shape', () => {
    const flat = flattenLottieShapePath(SQUARE);
    flat[0] = 5;
    const moved = unflattenLottieShapePath(SQUARE, flat);
    expect(moved.v[0][0]).toBe(5);
    // The template is not mutated: the core rebuilds a path on every sample and must not accumulate.
    expect(SQUARE.v[0][0]).toBe(0);
  });
});
