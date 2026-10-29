// Generated from crates/flight-path-boolean/tests/fuzz_invariants_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath, flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  createMartinezPathBooleanKernel,
  differencePaths,
  offsetPath,
  simplifyPath,
  unionAllPaths,
  unionPaths,
} from './contract.ts';
import type { PathBooleanOptions, PathOffsetOptions } from './contract.ts';

interface FuzzRandom {
  state: number;
}

function flattenedPath(path: Readonly<Path>, tolerance: number | undefined): number[][] {
  const out = flattenPath(path, tolerance);
  return out;
}

function makeRandom(seed: number): FuzzRandom {
  return { state: seed !== 0 ? seed : 1 };
}

function nextRandom(random: FuzzRandom): number {
  let state: number = random.state;
  state = (state ^ (state << 13)) >>> 0;
  state = (state ^ (state >>> 17)) >>> 0;
  state = (state ^ (state << 5)) >>> 0;
  random.state = state;
  return state / 4294967296.0;
}

function polygonPath(vertices: Readonly<number[]>): Path {
  let path = createPath('nonZero');
  appendPathMoveTo(path, vertices[0], vertices[1]);
  let i = 2;
  while (i < vertices.length) {
    appendPathLineTo(path, vertices[i], vertices[i + 1]);
    i += 2;
  }
  appendPathClose(path);
  return path;
}

function randomSimplePolygon(random: FuzzRandom, count: number): number[] {
  let angles: number[] = [] as never[];
  for (let _ = 0; _ < count; _ += 1) {
    angles.push(nextRandom(random) * Math.PI * 2.0);
  }
  angles.sort((a, b) => a - b!);
  let vertices: number[] = [] as never[];
  for (const angle of angles) {
    const radius = 20.0 + nextRandom(random) * 30.0;
    vertices.push(50.0 + radius * Math.cos(angle));
    vertices.push(50.0 + radius * Math.sin(angle));
  }
  return vertices;
}

function randomConvexPolygon(random: FuzzRandom, count: number): number[] {
  let points: Float64Array[] = [] as never[];
  for (let _ = 0; _ < count; _ += 1) {
    points.push(new Float64Array([10.0 + nextRandom(random) * 80.0, 10.0 + nextRandom(random) * 80.0]));
  }
  return convexHull(points);
}

function randomMessyPolygon(random: FuzzRandom, count: number): number[] {
  let vertices: number[] = [] as never[];
  for (let _ = 0; _ < count; _ += 1) {
    vertices.push(nextRandom(random) * 100.0);
    vertices.push(nextRandom(random) * 100.0);
  }
  return vertices;
}

function hullCross(o: Readonly<Float64Array>, a: Readonly<Float64Array>, b: Readonly<Float64Array>): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: Readonly<Float64Array[]>): number[] {
  let sorted = [...points];
  sorted.sort((a, b) => {
    if (a[0] !== b[0]) {
      return a[0] - b[0]!;
    }
    return a[1] - b[1]!;
  });
  let lower: Float64Array[] = [] as never[];
  let lowerLength: number = 0;
  for (const p of sorted) {
    while (lowerLength >= 2 && hullCross(lower[lowerLength - 2], lower[lowerLength - 1], p) <= 0.0) {
      lowerLength -= 1;
    }
    if (lowerLength < lower.length) {
      lower[lowerLength] = p;
    } else {
      lower.push(p);
    }
    lowerLength += 1;
  }
  let upper: Float64Array[] = [] as never[];
  let upperLength: number = 0;
  let i = sorted.length;
  while (i > 0) {
    i -= 1;
    const p = sorted[i];
    while (upperLength >= 2 && hullCross(upper[upperLength - 2], upper[upperLength - 1], p) <= 0.0) {
      upperLength -= 1;
    }
    if (upperLength < upper.length) {
      upper[upperLength] = p;
    } else {
      upper.push(p);
    }
    upperLength += 1;
  }
  let flat: number[] = [] as never[];
  for (let index = 0; index < lowerLength - 1; index += 1) {
    flat.push(lower[index][0]);
    flat.push(lower[index][1]);
  }
  for (let index = 0; index < upperLength - 1; index += 1) {
    flat.push(upper[index][0]);
    flat.push(upper[index][1]);
  }
  return flat;
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

function ringCount(path: Readonly<Path>): number {
  return flattenedPath(path, 0.25).length;
}

function areasClose(a: number, b: number, relative: number, absolute: number): boolean {
  return Math.abs(a - b) <= absolute + relative * Math.max(Math.abs(a), Math.abs(b));
}

describe('fuzzInvariants', () => {
  it('same winding self overlap diverges between non zero and even odd', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x51a3e00d);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const vertices = randomConvexPolygon(random, 5 + (iteration % 8));
      if (!(vertices.length < 6)) {
        let path = createPath('nonZero');
        appendPathMoveTo(path, vertices[0], vertices[1]);
        for (let repeat = 0; repeat < 2; repeat += 1) {
          const start = repeat === 0 ? 2 : 0;
          let i = start;
          while (i < vertices.length) {
            appendPathLineTo(path, vertices[i], vertices[i + 1]);
            i += 2;
          }
        }
        appendPathClose(path);
        const nzOpts: PathBooleanOptions = { fillRule: 'nonZero', tolerance: undefined } as const;
        const eoOpts: PathBooleanOptions = { fillRule: 'evenOdd', tolerance: undefined } as const;
        let nonZero = createPath('nonZero');
        simplifyPath(nonZero, kernel, path, nzOpts);
        let evenOdd = createPath('nonZero');
        simplifyPath(evenOdd, kernel, path, eoOpts);
        expect(pathArea(nonZero) > 0.0).toBe(true);
        expect(pathArea(evenOdd) < 1e-6).toBe(true);
      }
    }
  });
  it('union is commutative', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x1234abcd);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const a = polygonPath(randomSimplePolygon(random, 3 + (iteration % 6)));
      const b = polygonPath(randomSimplePolygon(random, 3 + ((iteration + 3) % 6)));
      let ab = createPath('nonZero');
      unionPaths(ab, kernel, a, b, undefined);
      let ba = createPath('nonZero');
      unionPaths(ba, kernel, b, a, undefined);
      expect(areasClose(pathArea(ab), pathArea(ba), 1e-3, 1e-3)).toBe(true);
      expect(ringCount(ab)).toEqual(ringCount(ba));
    }
  });
  it('self difference is empty', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x55aa33cc);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const a = polygonPath(randomMessyPolygon(random, 4 + (iteration % 5)));
      let result = createPath('nonZero');
      differencePaths(result, kernel, a, a, undefined);
      expect(pathArea(result) < 1e-6).toBe(true);
    }
  });
  it('self union equals simplify', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x0f0f0f0f);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const a = polygonPath(randomSimplePolygon(random, 3 + (iteration % 6)));
      let unionResult = createPath('nonZero');
      unionPaths(unionResult, kernel, a, a, undefined);
      let simplified = createPath('nonZero');
      simplifyPath(simplified, kernel, a, undefined);
      expect(areasClose(pathArea(unionResult), pathArea(simplified), 1e-3, 1e-3)).toBe(true);
      expect(ringCount(unionResult)).toEqual(ringCount(simplified));
    }
  });
  it('simplify is idempotent', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x7e577e57);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const a = polygonPath(randomMessyPolygon(random, 4 + (iteration % 6)));
      let once = createPath('nonZero');
      simplifyPath(once, kernel, a, undefined);
      let twice = createPath('nonZero');
      simplifyPath(twice, kernel, once, undefined);
      expect(areasClose(pathArea(once), pathArea(twice), 1e-3, 1e-3)).toBe(true);
      expect(ringCount(once)).toEqual(ringCount(twice));
    }
  });
  it('union all paths of one path equals its simplification', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x13571357);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const a = polygonPath(randomMessyPolygon(random, 4 + (iteration % 6)));
      let unionResult = createPath('nonZero');
      unionAllPaths(unionResult, kernel, [a], undefined);
      let simplified = createPath('nonZero');
      simplifyPath(simplified, kernel, a, undefined);
      expect(areasClose(pathArea(unionResult), pathArea(simplified), 1e-3, 1e-3)).toBe(true);
      expect(ringCount(unionResult)).toEqual(ringCount(simplified));
    }
  });
  it('offset identity zero delta approximates original', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x2468ace0);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const vertices = randomSimplePolygon(random, 3 + (iteration % 6));
      const a = polygonPath(vertices);
      let zeroOffset = createPath('nonZero');
      offsetPath(zeroOffset, kernel, a, 0.0, undefined);
      expect(areasClose(pathArea(zeroOffset), pathArea(a), 1e-2, 1e-2)).toBe(true);
      expect(ringCount(zeroOffset)).toEqual(1);
    }
  });
  it('double offset stability recovers convex shape within tolerance', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x0badf00d);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const vertices = randomConvexPolygon(random, 5 + (iteration % 8));
      if (!(vertices.length < 8)) {
        const a = polygonPath(vertices);
        const baseArea = pathArea(a);
        if (!(baseArea < 50.0)) {
          const growOpts: PathOffsetOptions = {
            join: 'miter',
            end: undefined,
            miterLimit: 100.0,
            tolerance: undefined,
            arcTolerance: undefined,
          } as const;
          let grown = createPath('nonZero');
          offsetPath(grown, kernel, a, 3.0, growOpts);
          const shrinkOpts: PathOffsetOptions = {
            join: 'miter',
            end: undefined,
            miterLimit: 100.0,
            tolerance: undefined,
            arcTolerance: undefined,
          } as const;
          let recovered = createPath('nonZero');
          offsetPath(recovered, kernel, grown, -3.0, shrinkOpts);
          expect(ringCount(recovered)).toEqual(1);
          expect(areasClose(pathArea(recovered), baseArea, 3e-2, 1.0)).toBe(true);
        }
      }
    }
  });
  it('concave offset validity no self intersections', () => {
    const kernel = createMartinezPathBooleanKernel();
    let random = makeRandom(0x0c0ffee0);
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const a = polygonPath(randomSimplePolygon(random, 5 + (iteration % 8)));
      let offsetResult = createPath('nonZero');
      offsetPath(offsetResult, kernel, a, 4.0, undefined);
      if (!(offsetResult.commands.length === 0)) {
        const nzOpts: PathBooleanOptions = { fillRule: 'nonZero', tolerance: undefined } as const;
        let simplified = createPath('nonZero');
        simplifyPath(simplified, kernel, offsetResult, nzOpts);
        expect(areasClose(pathArea(simplified), pathArea(offsetResult), 1e-2, 1e-2)).toBe(true);
        expect(ringCount(simplified)).toEqual(ringCount(offsetResult));
      }
    }
  });
});
