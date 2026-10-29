// Generated from crates/flight-path-boolean/tests/offset_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  PathCommand,
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  createPath,
  flattenPath,
} from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  createMartinezPathBooleanKernel,
  getPathOffsetEndString,
  getPathOffsetJoinString,
  offsetPath,
  parsePathOffsetEnd,
  parsePathOffsetJoin,
  simplifyPath,
} from './contract.ts';
import type { PathBooleanOptions, PathOffsetOptions } from './contract.ts';

const UNIT_SQUARE: Float64Array = new Float64Array([0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]);

function flattenedPath(path: Readonly<Path>, tolerance: number | undefined): number[][] {
  const out = flattenPath(path, tolerance);
  return out;
}

function polygonPath(vertices: Readonly<number[]>, closed: boolean): Path {
  let path = createPath('nonZero');
  appendPathMoveTo(path, vertices[0], vertices[1]);
  let i = 2;
  while (i < vertices.length) {
    appendPathLineTo(path, vertices[i], vertices[i + 1]);
    i += 2;
  }
  if (closed) {
    appendPathClose(path);
  }
  return path;
}

function pathBounds(path: Readonly<Path>): readonly [number, number, number, number] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ring of flattenedPath(path, 0.25)) {
    let i = 0;
    while (i < ring.length) {
      if (ring[i] < minX) {
        minX = ring[i];
      }
      if (ring[i + 1] < minY) {
        minY = ring[i + 1];
      }
      if (ring[i] > maxX) {
        maxX = ring[i];
      }
      if (ring[i + 1] > maxY) {
        maxY = ring[i + 1];
      }
      i += 2;
    }
  }
  return [minX, minY, maxX, maxY];
}

function lShape(s: number): number[] {
  return [0.0, 0.0, 2.0 * s, 0.0, 2.0 * s, 2.0 * s, s, 2.0 * s, s, s, 0.0, s];
}

function pathArea(path: Readonly<Path>): number {
  let total: number = 0.0;
  for (const ring of flattenedPath(path, 0.25)) {
    let area: number = 0.0;
    const n = ring.length >> 1;
    let j = n - 1;
    for (let i = 0; i < n; i += 1) {
      area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
      j = i;
    }
    total += area / 2.0;
  }
  return Math.abs(total);
}

function _pathVertexCount(path: Readonly<Path>): number {
  let count: number = 0;
  for (const ring of flattenedPath(path, 0.25)) {
    count += Math.trunc(ring.length / 2);
  }
  return count;
}

function ringCount(path: Readonly<Path>): number {
  return flattenedPath(path, 0.25).length;
}

describe('getPathOffsetEndString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathOffsetEndString('butt')).toEqual('butt');
    expect(getPathOffsetEndString('round')).toEqual('round');
    expect(getPathOffsetEndString('square')).toEqual('square');
  });
});

describe('getPathOffsetJoinString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathOffsetJoinString('bevel')).toEqual('bevel');
    expect(getPathOffsetJoinString('miter')).toEqual('miter');
    expect(getPathOffsetJoinString('round')).toEqual('round');
    expect(getPathOffsetJoinString('square')).toEqual('square');
  });
});

describe('offsetPath', () => {
  it('writes into an existing output using a distinct source snapshot', () => {
    const kernel = createMartinezPathBooleanKernel();
    let path = polygonPath([0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0], true);
    const pathClone = path;
    offsetPath(path, kernel, pathClone, 1.0, undefined);
    const [minX, minY, maxX, maxY] = pathBounds(path);
    expect(Math.abs(minX - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(minY - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 5.0) < 5e-7).toBe(true);
    expect(Math.abs(maxY - 5.0) < 5e-7).toBe(true);
  });
  it('inflates a closed square by delta on every side with a miter join', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath(Array.from(UNIT_SQUARE), true), 1.0, undefined);
    const [minX, minY, maxX, maxY] = pathBounds(out);
    expect(Math.abs(minX - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(minY - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 2.0) < 5e-7).toBe(true);
    expect(Math.abs(maxY - 2.0) < 5e-7).toBe(true);
    expect(Math.abs(pathArea(out) - 9.0) < 5e-5).toBe(true);
  });
  it('deflates a closed square on a negative delta', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath([0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0], true), -1.0, undefined);
    const [minX, minY, maxX, maxY] = pathBounds(out);
    expect(Math.abs(minX - 1.0) < 5e-7).toBe(true);
    expect(Math.abs(minY - 1.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 3.0) < 5e-7).toBe(true);
    expect(Math.abs(maxY - 3.0) < 5e-7).toBe(true);
    expect(Math.abs(pathArea(out) - 4.0) < 5e-5).toBe(true);
  });
  it('emits an empty path when deflation collapses the region', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath(Array.from(UNIT_SQUARE), true), -1.0, undefined);
    expect(out.commands.length).toEqual(0);
    expect(Math.abs(pathArea(out) - 0.0) < 5e-7).toBe(true);
  });
  it('chamfers corners with a bevel join', () => {
    const kernel = createMartinezPathBooleanKernel();
    const opts: PathOffsetOptions = {
      join: 'bevel',
      end: undefined,
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: undefined,
    } as const;
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath(Array.from(UNIT_SQUARE), true), 1.0, opts);
    const [minX, , maxX] = pathBounds(out);
    expect(Math.abs(minX - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 2.0) < 5e-7).toBe(true);
    expect(Math.abs(pathArea(out) - 7.0) < 5e-5).toBe(true);
  });
  it('rounds corners with a round join', () => {
    const kernel = createMartinezPathBooleanKernel();
    const opts: PathOffsetOptions = {
      join: 'round',
      end: undefined,
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: undefined,
    } as const;
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath(Array.from(UNIT_SQUARE), true), 1.0, opts);
    const [minX, , maxX] = pathBounds(out);
    expect(Math.abs(minX - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 2.0) < 5e-7).toBe(true);
    const fineOpts: PathOffsetOptions = {
      join: 'round',
      end: undefined,
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: 0.001,
    } as const;
    let fine = createPath('nonZero');
    offsetPath(fine, kernel, polygonPath(Array.from(UNIT_SQUARE), true), 1.0, fineOpts);
    const fineArea = pathArea(fine);
    expect(Math.abs(fineArea - (5.0 + Math.PI)) < 0.2).toBe(true);
  });
  it('falls back to a bevel when a sharp miter exceeds the miter limit', () => {
    const kernel = createMartinezPathBooleanKernel();
    const wedge = [0.0, 0.0, 4.0, 0.5, 4.0, -0.5];
    const clippedOpts: PathOffsetOptions = {
      join: undefined,
      end: undefined,
      miterLimit: 2.0,
      tolerance: undefined,
      arcTolerance: undefined,
    };
    const sharpOpts: PathOffsetOptions = {
      join: undefined,
      end: undefined,
      miterLimit: 50.0,
      tolerance: undefined,
      arcTolerance: undefined,
    };
    let clipped = createPath('nonZero');
    let sharp = createPath('nonZero');
    offsetPath(clipped, kernel, polygonPath(wedge, true), 1.0, clippedOpts);
    offsetPath(sharp, kernel, polygonPath(wedge, true), 1.0, sharpOpts);
    const [clippedMinX, , ,] = pathBounds(clipped);
    const [sharpMinX, , ,] = pathBounds(sharp);
    expect(clippedMinX > sharpMinX + 3.0).toBe(true);
    expect(sharpMinX < -5.0).toBe(true);
  });
  it('squares corners with a square join', () => {
    const kernel = createMartinezPathBooleanKernel();
    const opts: PathOffsetOptions = {
      join: 'square',
      end: undefined,
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: undefined,
    } as const;
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath(Array.from(UNIT_SQUARE), true), 1.0, opts);
    const [minX, , maxX] = pathBounds(out);
    expect(Math.abs(minX - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 2.0) < 5e-7).toBe(true);
    expect(Math.abs(pathArea(out) - 9.0) < 5e-5).toBe(true);
    const bevelOpts: PathOffsetOptions = {
      join: 'bevel',
      end: undefined,
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: undefined,
    } as const;
    let bevel = createPath('nonZero');
    offsetPath(bevel, kernel, polygonPath(Array.from(UNIT_SQUARE), true), 1.0, bevelOpts);
    expect(pathArea(out) > pathArea(bevel)).toBe(true);
  });
  it('cleans a concave corner into a single valid outline', () => {
    const kernel = createMartinezPathBooleanKernel();
    const lShape = [0.0, 0.0, 2.0, 0.0, 2.0, 2.0, 1.0, 2.0, 1.0, 1.0, 0.0, 1.0];
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath(lShape, true), 0.25, undefined);
    const [minX, minY, maxX, maxY] = pathBounds(out);
    expect(Math.abs(minX - -0.25) < 5e-7).toBe(true);
    expect(Math.abs(minY - -0.25) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 2.25) < 5e-7).toBe(true);
    expect(Math.abs(maxY - 2.25) < 5e-7).toBe(true);
    let moveCount = 0;
    for (const command of out.commands) {
      if (command === PathCommand.MOVE_TO) {
        moveCount += 1;
      }
    }
    expect(moveCount).toEqual(1);
    expect(pathArea(out) > 3.0).toBe(true);
  });
  it('closes a concave slot narrower than two delta into a valid outline', () => {
    const kernel = createMartinezPathBooleanKernel();
    const uShape = [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 5.5, 10.0, 5.5, 3.0, 4.5, 3.0, 4.5, 10.0, 0.0, 10.0];
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath(uShape, true), 1.0, undefined);
    expect(ringCount(out)).toEqual(1);
    const [minX, minY, maxX, maxY] = pathBounds(out);
    expect(Math.abs(minX - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 11.0) < 5e-7).toBe(true);
    expect(Math.abs(minY - -1.0) < 5e-7).toBe(true);
    expect(Math.abs(maxY - 11.0) < 5e-7).toBe(true);
    let simplified = createPath('nonZero');
    const simplifyOpts: PathBooleanOptions = { fillRule: 'nonZero', tolerance: undefined } as const;
    simplifyPath(simplified, kernel, out, simplifyOpts);
    expect(ringCount(simplified)).toEqual(ringCount(out));
    expect(Math.abs(pathArea(simplified) - pathArea(out)) < 5e-5).toBe(true);
  });
  it('strokes an open path into a butt capped rectangle', () => {
    const kernel = createMartinezPathBooleanKernel();
    const opts: PathOffsetOptions = {
      join: undefined,
      end: 'butt',
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: undefined,
    } as const;
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath([0.0, 0.0, 2.0, 0.0], false), 0.5, opts);
    const [minX, minY, maxX, maxY] = pathBounds(out);
    expect(Math.abs(minX - 0.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 2.0) < 5e-7).toBe(true);
    expect(Math.abs(minY - -0.5) < 5e-7).toBe(true);
    expect(Math.abs(maxY - 0.5) < 5e-7).toBe(true);
    expect(Math.abs(pathArea(out) - 2.0) < 5e-5).toBe(true);
  });
  it('extends an open path past its ends with a square cap', () => {
    const kernel = createMartinezPathBooleanKernel();
    const opts: PathOffsetOptions = {
      join: undefined,
      end: 'square',
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: undefined,
    } as const;
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath([0.0, 0.0, 2.0, 0.0], false), 0.5, opts);
    const [minX, , maxX] = pathBounds(out);
    expect(Math.abs(minX - -0.5) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 2.5) < 5e-7).toBe(true);
    expect(Math.abs(pathArea(out) - 3.0) < 5e-5).toBe(true);
  });
  it('caps an open path with half circles on a round end', () => {
    const kernel = createMartinezPathBooleanKernel();
    const opts: PathOffsetOptions = {
      join: undefined,
      end: 'round',
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: 0.001,
    } as const;
    let out = createPath('nonZero');
    offsetPath(out, kernel, polygonPath([0.0, 0.0, 2.0, 0.0], false), 0.5, opts);
    const [minX, , maxX] = pathBounds(out);
    expect(Math.abs(minX - -0.5) < 0.005).toBe(true);
    expect(Math.abs(maxX - 2.5) < 0.005).toBe(true);
    expect(Math.abs(pathArea(out) - (2.0 + Math.PI * 0.25)) < 0.005).toBe(true);
  });
  it('offsets the same vertices differently as open vs closed', () => {
    const kernel = createMartinezPathBooleanKernel();
    const vertices = [0.0, 0.0, 2.0, 0.0, 2.0, 2.0, 0.0, 2.0];
    let closedOut = createPath('nonZero');
    offsetPath(closedOut, kernel, polygonPath(vertices, true), 0.5, undefined);
    const buttOpts: PathOffsetOptions = {
      join: undefined,
      end: 'butt',
      miterLimit: undefined,
      tolerance: undefined,
      arcTolerance: undefined,
    } as const;
    let openOut = createPath('nonZero');
    offsetPath(openOut, kernel, polygonPath(vertices, false), 0.5, buttOpts);
    expect(Math.abs(pathArea(closedOut) - 9.0) < 5e-5).toBe(true);
    expect(pathArea(openOut) < pathArea(closedOut)).toBe(true);
  });
  it('offsets consistently across coordinate scales', () => {
    const kernel = createMartinezPathBooleanKernel();
    let small = createPath('nonZero');
    let mid = createPath('nonZero');
    let large = createPath('nonZero');
    offsetPath(small, kernel, polygonPath(lShape(1e-3), true), 0.25e-3, undefined);
    offsetPath(mid, kernel, polygonPath(lShape(1.0), true), 0.25, undefined);
    offsetPath(large, kernel, polygonPath(lShape(1e6), true), 0.25e6, undefined);
    expect(ringCount(small)).toEqual(ringCount(mid));
    expect(ringCount(large)).toEqual(ringCount(mid));
    expect(Math.abs(pathArea(small) / 1e-6 - pathArea(mid)) < 0.1).toBe(true);
    expect(Math.abs(pathArea(large) / 1e12 - pathArea(mid)) < 0.1).toBe(true);
  });
});

describe('parsePathOffsetEnd', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathOffsetEnd('butt')).toEqual('butt');
    expect(parsePathOffsetEnd('round')).toEqual('round');
    expect(parsePathOffsetEnd('square')).toEqual('square');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathOffsetEnd('BUTT')).toEqual(undefined);
    expect(parsePathOffsetEnd('')).toEqual(undefined);
  });
});

describe('parsePathOffsetJoin', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathOffsetJoin('bevel')).toEqual('bevel');
    expect(parsePathOffsetJoin('miter')).toEqual('miter');
    expect(parsePathOffsetJoin('round')).toEqual('round');
    expect(parsePathOffsetJoin('square')).toEqual('square');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathOffsetJoin('BEVEL')).toEqual(undefined);
    expect(parsePathOffsetJoin('')).toEqual(undefined);
  });
});
