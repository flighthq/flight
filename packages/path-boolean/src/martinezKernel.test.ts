// Generated from crates/flight-path-boolean/tests/martinez_kernel_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  createMartinezPathBooleanKernel,
  getPathBooleanFillRuleString,
  getPathBooleanOperationString,
  initializeMartinezPathBooleanKernel,
  parsePathBooleanFillRule,
  parsePathBooleanOperation,
} from './contract.ts';
import type { PathBooleanContour, PathBooleanFillRule, PathBooleanOperation } from './contract.ts';

function computeEmptyTestPathBoolean(
  _subject: Readonly<PathBooleanContour[]>,
  _clip: Readonly<PathBooleanContour[]>,
  _operation: PathBooleanOperation,
  _fillRule: PathBooleanFillRule,
): PathBooleanContour[] {
  return [] as never[];
}

function square(x: number, y: number, s: number): number[] {
  return [x, y, x + s, y, x + s, y + s, x, y + s];
}

function donut(x: number, y: number, outer: number, inset: number, inner: number): number[][] {
  const ix = x + inset;
  const iy = y + inset;
  return [square(x, y, outer), [ix, iy, ix, iy + inner, ix + inner, iy + inner, ix + inner, iy]];
}

function netArea(rings: Readonly<number[][]>): number {
  let total: number = 0.0;
  for (const ring of rings) {
    total += signedAreaRing(ring);
  }
  return Math.abs(total);
}

function overlap(s: number): number[][] {
  return [square(0.0, 0.0, 10.0 * s), square(5.0 * s, 5.0 * s, 10.0 * s)];
}

function signedAreaRing(ring: Readonly<number[]>): number {
  let area: number = 0.0;
  const n = ring.length >> 1;
  let j = n - 1;
  for (let i = 0; i < n; i += 1) {
    area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    j = i;
  }
  return area / 2.0;
}

function boundsOf(rings: Readonly<number[][]>): readonly [number, number, number, number] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    let i = 0;
    while (i < ring.length) {
      if (ring[i] < minX) {
        minX = ring[i];
      }
      if (ring[i] > maxX) {
        maxX = ring[i];
      }
      if (ring[i + 1] < minY) {
        minY = ring[i + 1];
      }
      if (ring[i + 1] > maxY) {
        maxY = ring[i + 1];
      }
      i += 2;
    }
  }
  return [minX, minY, maxX, maxY];
}

function fillContains(rings: Readonly<number[][]>, x: number, y: number): boolean {
  let winding: number = 0;
  for (const ring of rings) {
    const n = ring.length >> 1;
    let j = n - 1;
    for (let i = 0; i < n; i += 1) {
      const xi = ring[i * 2];
      const yi = ring[i * 2 + 1];
      const xj = ring[j * 2];
      const yj = ring[j * 2 + 1];
      if (yi <= y ? yj > y : yj <= y) {
        const t = (y - yi) / (yj - yi);
        if (x < xi + t * (xj - xi)) {
          winding += yj > yi ? 1 : -1;
        }
      }
      j = i;
    }
  }
  return winding !== 0;
}

function run(
  subject: Readonly<number[][]>,
  clip: Readonly<number[][]>,
  operation: PathBooleanOperation,
  fillRule: PathBooleanFillRule,
): number[][] {
  const kernel = createMartinezPathBooleanKernel();
  return kernel.computePathBoolean(subject, clip, operation, fillRule);
}

describe('createMartinezPathBooleanKernel', () => {
  it('creates a kernel that computes boolean operations', () => {
    const kernel = createMartinezPathBooleanKernel();
    const result = kernel.computePathBoolean([square(0.0, 0.0, 10.0)], [square(5.0, 5.0, 10.0)], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 175.0) < 0.1).toBe(true);
  });
  it('unions two squares sharing a full edge into one rectangle', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(10.0, 0.0, 10.0)], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 200.0) < 5e-7).toBe(true);
    const [minX, minY, maxX, maxY] = boundsOf(result);
    expect(Math.abs(minX - 0.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 20.0) < 5e-7).toBe(true);
    expect(Math.abs(minY - 0.0) < 5e-7).toBe(true);
    expect(Math.abs(maxY - 10.0) < 5e-7).toBe(true);
    expect(fillContains(result, 10.0, 5.0)).toBe(true);
  });
  it('intersects two squares sharing an edge to nothing', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(10.0, 0.0, 10.0)], 'intersection', 'nonZero');
    expect(netArea(result) < 5e-7).toBe(true);
  });
  it('handles a partially overlapping shared edge', () => {
    const result = run([square(0.0, 0.0, 10.0)], [[10.0, 5.0, 20.0, 5.0, 20.0, 15.0, 10.0, 15.0]], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 200.0) < 5e-7).toBe(true);
    expect(fillContains(result, 10.0, 7.0)).toBe(true);
  });
  it('collapses two identical squares under union to a single square', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(0.0, 0.0, 10.0)], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 100.0) < 5e-7).toBe(true);
  });
  it('collapses two identical squares under intersection to the same square', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(0.0, 0.0, 10.0)], 'intersection', 'nonZero');
    expect(Math.abs(netArea(result) - 100.0) < 5e-7).toBe(true);
  });
  it('empties two identical squares under xor', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(0.0, 0.0, 10.0)], 'xor', 'nonZero');
    expect(netArea(result) < 5e-7).toBe(true);
  });
  it('empties a square differenced against an identical square', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(0.0, 0.0, 10.0)], 'difference', 'nonZero');
    expect(netArea(result) < 5e-7).toBe(true);
  });
  it('cuts a hole when the clip is fully contained', () => {
    const result = run([square(0.0, 0.0, 30.0)], [square(10.0, 10.0, 10.0)], 'difference', 'nonZero');
    expect(Math.abs(netArea(result) - 800.0) < 5e-7).toBe(true);
    expect(result.length).toEqual(2);
    expect(fillContains(result, 2.0, 2.0)).toBe(true);
    expect(!fillContains(result, 15.0, 15.0)).toBe(true);
  });
  it('subtracts a partial overlap', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(5.0, 5.0, 10.0)], 'difference', 'nonZero');
    expect(Math.abs(netArea(result) - 75.0) < 5e-7).toBe(true);
    expect(fillContains(result, 2.0, 2.0)).toBe(true);
    expect(!fillContains(result, 7.0, 7.0)).toBe(true);
  });
  it('is empty when subtracting a superset', () => {
    const result = run([square(10.0, 10.0, 10.0)], [square(0.0, 0.0, 30.0)], 'difference', 'nonZero');
    expect(netArea(result) < 5e-7).toBe(true);
  });
  it('unions disjoint squares into two rings', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(20.0, 20.0, 10.0)], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 200.0) < 5e-7).toBe(true);
    expect(result.length).toEqual(2);
  });
  it('intersects disjoint squares to nothing', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(20.0, 20.0, 10.0)], 'intersection', 'nonZero');
    expect(netArea(result) < 5e-7).toBe(true);
  });
  it('xors disjoint squares to both squares', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(20.0, 20.0, 10.0)], 'xor', 'nonZero');
    expect(Math.abs(netArea(result) - 200.0) < 5e-7).toBe(true);
  });
  it('returns empty for two empty operands', () => {
    const result = run([], [], 'union', 'nonZero');
    expect(result.length === 0).toBe(true);
  });
  it('passes the subject through union with an empty clip', () => {
    const result = run([square(0.0, 0.0, 10.0)], [], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 100.0) < 5e-7).toBe(true);
  });
  it('empties intersection with an empty clip', () => {
    const result = run([square(0.0, 0.0, 10.0)], [], 'intersection', 'nonZero');
    expect(netArea(result) < 5e-7).toBe(true);
  });
  it('ignores a zero area collinear contour', () => {
    const degenerate = [0.0, 0.0, 10.0, 0.0, 5.0, 0.0];
    const result = run([square(0.0, 0.0, 10.0)], [degenerate], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 100.0) < 5e-7).toBe(true);
  });
  it('ignores a single point contour', () => {
    const result = run([square(0.0, 0.0, 10.0)], [[5.0, 5.0, 5.0, 5.0, 5.0, 5.0]], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 100.0) < 5e-7).toBe(true);
  });
  it('ignores a contour with too few points', () => {
    const result = run([square(0.0, 0.0, 10.0)], [[1.0, 1.0, 2.0, 2.0]], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 100.0) < 5e-7).toBe(true);
  });
  it('unions a donut with an overlapping square filling part of the hole', () => {
    const result = run(donut(0.0, 0.0, 30.0, 10.0, 10.0), [square(12.0, 12.0, 20.0)], 'union', 'nonZero');
    expect(fillContains(result, 15.0, 15.0)).toBe(true);
    expect(!fillContains(result, 11.0, 11.0)).toBe(true);
  });
  it('intersects a donut with a square covering its hole to a frame', () => {
    const result = run(donut(0.0, 0.0, 30.0, 10.0, 10.0), [square(5.0, 5.0, 20.0)], 'intersection', 'nonZero');
    expect(!fillContains(result, 15.0, 15.0)).toBe(true);
    expect(fillContains(result, 8.0, 8.0)).toBe(true);
  });
  it('differences a square from a donut deepening the hole', () => {
    const result = run(donut(0.0, 0.0, 30.0, 5.0, 20.0), [square(10.0, 10.0, 10.0)], 'difference', 'nonZero');
    expect(!fillContains(result, 15.0, 15.0)).toBe(true);
    expect(fillContains(result, 2.0, 2.0)).toBe(true);
  });
  it('fills the overlap of two same wound squares under non zero', () => {
    const result = run([square(0.0, 0.0, 10.0), square(5.0, 5.0, 10.0)], [], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 175.0) < 5e-7).toBe(true);
    expect(fillContains(result, 7.0, 7.0)).toBe(true);
    expect(result.length).toEqual(1);
  });
  it('holes out the overlap of two same wound squares under even odd', () => {
    const result = run([square(0.0, 0.0, 10.0), square(5.0, 5.0, 10.0)], [], 'union', 'evenOdd');
    expect(Math.abs(netArea(result) - 150.0) < 5e-7).toBe(true);
    expect(!fillContains(result, 7.0, 7.0)).toBe(true);
    expect(fillContains(result, 2.0, 2.0)).toBe(true);
  });
  it('treats a bowtie contour under non zero as its two filled lobes', () => {
    const bowtie = [0.0, 0.0, 10.0, 0.0, 0.0, 10.0, 10.0, 10.0];
    const result = run([bowtie], [], 'union', 'nonZero');
    expect(fillContains(result, 5.0, 1.0)).toBe(true);
    expect(fillContains(result, 5.0, 9.0)).toBe(true);
    expect(!fillContains(result, 1.0, 5.0)).toBe(true);
  });
  it('keeps a counter clockwise region under positive fill drops it under negative', () => {
    const ccw = square(0.0, 0.0, 10.0);
    expect(Math.abs(netArea(run([ccw.slice()], [], 'union', 'positive')) - 100.0) < 5e-7).toBe(true);
    expect(netArea(run([ccw], [], 'union', 'negative')) < 5e-7).toBe(true);
  });
  it('mirrors that for a clockwise region', () => {
    const cw = [0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 10.0, 0.0];
    expect(Math.abs(netArea(run([cw.slice()], [], 'union', 'negative')) - 100.0) < 5e-7).toBe(true);
    expect(netArea(run([cw], [], 'union', 'positive')) < 5e-7).toBe(true);
  });
  it('dissolves a same wound self overlap under positive fill', () => {
    const result = run([square(0.0, 0.0, 10.0), square(5.0, 5.0, 10.0)], [], 'union', 'positive');
    expect(Math.abs(netArea(result) - 175.0) < 5e-7).toBe(true);
    expect(result.length).toEqual(1);
    expect(fillContains(result, 7.0, 7.0)).toBe(true);
  });
  it('resolves the same topology across coordinate scales', () => {
    const small = run(overlap(1e-3), [], 'union', 'nonZero');
    const mid = run(overlap(1.0), [], 'union', 'nonZero');
    const large = run(overlap(1e6), [], 'union', 'nonZero');
    expect(small.length).toEqual(mid.length);
    expect(large.length).toEqual(mid.length);
    expect(Math.abs(netArea(mid) - 175.0) < 5e-7).toBe(true);
    expect(Math.abs(netArea(small) / 1e-6 - 175.0) < 5e-5).toBe(true);
    expect(Math.abs(netArea(large) / 1e12 - 175.0) < 5e-5).toBe(true);
  });
  it('unions two corner touching squares to their combined area', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(10.0, 10.0, 10.0)], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 200.0) < 5e-7).toBe(true);
    expect(fillContains(result, 5.0, 5.0)).toBe(true);
    expect(fillContains(result, 15.0, 15.0)).toBe(true);
  });
  it('intersects two corner touching squares to nothing', () => {
    const result = run([square(0.0, 0.0, 10.0)], [square(10.0, 10.0, 10.0)], 'intersection', 'nonZero');
    expect(netArea(result) < 5e-7).toBe(true);
  });
  it('unions commute', () => {
    const a = square(0.0, 0.0, 10.0);
    const b = square(5.0, 5.0, 10.0);
    const ab = netArea(run([a.slice()], [b.slice()], 'union', 'nonZero'));
    const ba = netArea(run([b], [a], 'union', 'nonZero'));
    expect(Math.abs(ab - ba) < 5e-7).toBe(true);
  });
  it('intersections commute', () => {
    const a = square(0.0, 0.0, 10.0);
    const b = square(3.0, 4.0, 10.0);
    const ab = netArea(run([a.slice()], [b.slice()], 'intersection', 'nonZero'));
    const ba = netArea(run([b], [a], 'intersection', 'nonZero'));
    expect(Math.abs(ab - ba) < 5e-7).toBe(true);
  });
  it('xor is symmetric', () => {
    const a = square(0.0, 0.0, 10.0);
    const b = square(4.0, 4.0, 10.0);
    const ab = netArea(run([a.slice()], [b.slice()], 'xor', 'nonZero'));
    const ba = netArea(run([b], [a], 'xor', 'nonZero'));
    expect(Math.abs(ab - ba) < 5e-7).toBe(true);
  });
  it('unions contained to the outer square', () => {
    const result = run([square(0.0, 0.0, 30.0)], [square(10.0, 10.0, 10.0)], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 900.0) < 5e-7).toBe(true);
  });
  it('intersects contained to the inner square', () => {
    const result = run([square(0.0, 0.0, 30.0)], [square(10.0, 10.0, 10.0)], 'intersection', 'nonZero');
    expect(Math.abs(netArea(result) - 100.0) < 5e-7).toBe(true);
  });
  it('xors contained to the outer with hole frame', () => {
    const result = run([square(0.0, 0.0, 30.0)], [square(10.0, 10.0, 10.0)], 'xor', 'nonZero');
    expect(Math.abs(netArea(result) - 800.0) < 5e-7).toBe(true);
    expect(!fillContains(result, 15.0, 15.0)).toBe(true);
    expect(fillContains(result, 2.0, 2.0)).toBe(true);
  });
  it('unions two triangles sharing a diagonal into a square', () => {
    const lower = [0.0, 0.0, 10.0, 0.0, 10.0, 10.0];
    const upper = [0.0, 0.0, 10.0, 10.0, 0.0, 10.0];
    const result = run([lower], [upper], 'union', 'nonZero');
    expect(Math.abs(netArea(result) - 100.0) < 5e-7).toBe(true);
    expect(fillContains(result, 5.0, 5.0)).toBe(true);
  });
  it('intersects two diagonal sharing triangles to nothing', () => {
    const lower = [0.0, 0.0, 10.0, 0.0, 10.0, 10.0];
    const upper = [0.0, 0.0, 10.0, 10.0, 0.0, 10.0];
    const result = run([lower], [upper], 'intersection', 'nonZero');
    expect(netArea(result) < 5e-7).toBe(true);
  });
  it('intersects a diamond overlapping a square', () => {
    const diamond = [5.0, 5.0, 10.0, 0.0, 15.0, 5.0, 10.0, 10.0];
    const result = run([square(0.0, 0.0, 10.0)], [diamond], 'intersection', 'nonZero');
    expect(Math.abs(netArea(result) - 25.0) < 5e-7).toBe(true);
    expect(fillContains(result, 8.0, 5.0)).toBe(true);
    expect(!fillContains(result, 12.0, 5.0)).toBe(true);
  });
  it('unions a rotated square with an overlapping axis square', () => {
    const diamond = [0.0, 10.0, 10.0, 0.0, 20.0, 10.0, 10.0, 20.0];
    const result = run([square(0.0, 0.0, 12.0)], [diamond], 'union', 'nonZero');
    expect(fillContains(result, 2.0, 2.0)).toBe(true);
    expect(fillContains(result, 18.0, 10.0)).toBe(true);
    expect(!fillContains(result, 19.0, 19.0)).toBe(true);
  });
});

describe('getPathBooleanFillRuleString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathBooleanFillRuleString('evenOdd')).toEqual('evenOdd');
    expect(getPathBooleanFillRuleString('nonZero')).toEqual('nonZero');
    expect(getPathBooleanFillRuleString('negative')).toEqual('negative');
    expect(getPathBooleanFillRuleString('positive')).toEqual('positive');
  });
});

describe('getPathBooleanOperationString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathBooleanOperationString('difference')).toEqual('difference');
    expect(getPathBooleanOperationString('intersection')).toEqual('intersection');
    expect(getPathBooleanOperationString('union')).toEqual('union');
    expect(getPathBooleanOperationString('xor')).toEqual('xor');
  });
});

describe('initializeMartinezPathBooleanKernel', () => {
  it('is the construction initializer of create martinez path boolean kernel', () => {
    let kernel = createMartinezPathBooleanKernel();
    kernel.computePathBoolean = computeEmptyTestPathBoolean;
    initializeMartinezPathBooleanKernel(kernel);
    expect(kernel).toEqual(createMartinezPathBooleanKernel());
    const result = kernel.computePathBoolean(
      [square(0.0, 0.0, 10.0)],
      [square(5.0, 5.0, 10.0)],
      'intersection',
      'nonZero',
    );
    expect(Math.abs(netArea(result) - 25.0) < 0.1).toBe(true);
  });
});

describe('parsePathBooleanFillRule', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathBooleanFillRule('evenOdd')).toEqual('evenOdd');
    expect(parsePathBooleanFillRule('nonZero')).toEqual('nonZero');
    expect(parsePathBooleanFillRule('negative')).toEqual('negative');
    expect(parsePathBooleanFillRule('positive')).toEqual('positive');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathBooleanFillRule('EVENODD')).toEqual(undefined);
    expect(parsePathBooleanFillRule('')).toEqual(undefined);
  });
});

describe('parsePathBooleanOperation', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathBooleanOperation('difference')).toEqual('difference');
    expect(parsePathBooleanOperation('intersection')).toEqual('intersection');
    expect(parsePathBooleanOperation('union')).toEqual('union');
    expect(parsePathBooleanOperation('xor')).toEqual('xor');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathBooleanOperation('DIFFERENCE')).toEqual(undefined);
    expect(parsePathBooleanOperation('')).toEqual(undefined);
  });
});
