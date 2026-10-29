// Generated from crates/flight-path-boolean/tests/simplify_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath, flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { createMartinezPathBooleanKernel, simplifyPath } from './contract.ts';
import type { PathBooleanOptions } from './contract.ts';

const BOWTIE: Float64Array = new Float64Array([0.0, 0.0, 2.0, 2.0, 2.0, 0.0, 0.0, 2.0]);

const UNIT_SQUARE: Float64Array = new Float64Array([0.0, 0.0, 3.0, 0.0, 3.0, 3.0, 0.0, 3.0]);

function flattenedPath(path: Readonly<Path>, tolerance: number | undefined): number[][] {
  const out = flattenPath(path, tolerance);
  return out;
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

function ringCount(path: Readonly<Path>): number {
  return flattenedPath(path, 0.25).length;
}

function pentagramPath(radius: number): Path {
  const order = [0, 2, 4, 1, 3];
  let vertices: number[] = [] as never[];
  for (const k of order) {
    const angle = -(Math.PI / 2.0) + (k * 2.0 * Math.PI) / 5.0;
    vertices.push(radius * Math.cos(angle));
    vertices.push(radius * Math.sin(angle));
  }
  return polygonPath(vertices);
}

describe('simplifyPath', () => {
  it('writes into an existing output using a distinct source snapshot', () => {
    const kernel = createMartinezPathBooleanKernel();
    let path = polygonPath(Array.from(BOWTIE));
    const pathClone = path;
    simplifyPath(path, kernel, pathClone, undefined);
    expect(ringCount(path)).toEqual(2);
    expect(Math.abs(pathArea(path) - 2.0) < 5e-7).toBe(true);
  });
  it('resolves a self intersecting bowtie into two triangles', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    simplifyPath(out, kernel, polygonPath(Array.from(BOWTIE)), undefined);
    expect(ringCount(out)).toEqual(2);
    expect(Math.abs(pathArea(out) - 2.0) < 5e-7).toBe(true);
  });
  it('fills a self overlapping region solid under non zero', () => {
    const kernel = createMartinezPathBooleanKernel();
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 4.0, 0.0);
    appendPathLineTo(path, 4.0, 4.0);
    appendPathLineTo(path, 0.0, 4.0);
    appendPathClose(path);
    appendPathMoveTo(path, 2.0, 2.0);
    appendPathLineTo(path, 6.0, 2.0);
    appendPathLineTo(path, 6.0, 6.0);
    appendPathLineTo(path, 2.0, 6.0);
    appendPathClose(path);
    const opts: PathBooleanOptions = { fillRule: 'nonZero', tolerance: undefined } as const;
    let out = createPath('nonZero');
    simplifyPath(out, kernel, path, opts);
    expect(ringCount(out)).toEqual(1);
    expect(Math.abs(pathArea(out) - 28.0) < 5e-7).toBe(true);
  });
  it('punches an even odd hole through a self overlapping region', () => {
    const kernel = createMartinezPathBooleanKernel();
    let path = createPath('nonZero');
    path.winding = 'evenOdd';
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 4.0, 0.0);
    appendPathLineTo(path, 4.0, 4.0);
    appendPathLineTo(path, 0.0, 4.0);
    appendPathClose(path);
    appendPathMoveTo(path, 2.0, 2.0);
    appendPathLineTo(path, 6.0, 2.0);
    appendPathLineTo(path, 6.0, 6.0);
    appendPathLineTo(path, 2.0, 6.0);
    appendPathClose(path);
    const opts: PathBooleanOptions = { fillRule: 'evenOdd', tolerance: undefined } as const;
    let out = createPath('nonZero');
    simplifyPath(out, kernel, path, opts);
    expect(Math.abs(pathArea(out) - 24.0) < 5e-7).toBe(true);
    expect(ringCount(out) > 1).toBe(true);
  });
  it('fills a pentagram solid under non zero but hollow under even odd', () => {
    const kernel = createMartinezPathBooleanKernel();
    const nzOpts: PathBooleanOptions = { fillRule: 'nonZero', tolerance: undefined } as const;
    const eoOpts: PathBooleanOptions = { fillRule: 'evenOdd', tolerance: undefined } as const;
    let solid = createPath('nonZero');
    let hollow = createPath('nonZero');
    simplifyPath(solid, kernel, pentagramPath(10.0), nzOpts);
    simplifyPath(hollow, kernel, pentagramPath(10.0), eoOpts);
    expect(ringCount(solid)).toEqual(1);
    expect(Math.abs(pathArea(solid) - 112.257) < 0.005).toBe(true);
    expect(ringCount(hollow) > 1).toBe(true);
    expect(Math.abs(pathArea(hollow) - 77.568) < 0.005).toBe(true);
    expect(pathArea(hollow) < pathArea(solid)).toBe(true);
  });
  it('passes an already simple convex path through unchanged', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    simplifyPath(out, kernel, polygonPath(Array.from(UNIT_SQUARE)), undefined);
    expect(ringCount(out)).toEqual(1);
    expect(Math.abs(pathArea(out) - 9.0) < 5e-7).toBe(true);
    const [minX, minY, maxX, maxY] = pathBounds(out);
    expect(Math.abs(minX - 0.0) < 5e-7).toBe(true);
    expect(Math.abs(minY - 0.0) < 5e-7).toBe(true);
    expect(Math.abs(maxX - 3.0) < 5e-7).toBe(true);
    expect(Math.abs(maxY - 3.0) < 5e-7).toBe(true);
  });
  it('returns an empty path for empty input', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    simplifyPath(out, kernel, createPath('nonZero'), undefined);
    expect(out.commands.length).toEqual(0);
    expect(out.data.length).toEqual(0);
  });
  it('returns an empty path for a degenerate zero area contour', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    simplifyPath(out, kernel, polygonPath([0.0, 0.0, 5.0, 0.0, 10.0, 0.0]), undefined);
    expect(out.commands.length).toEqual(0);
    expect(out.data.length).toEqual(0);
  });
});
