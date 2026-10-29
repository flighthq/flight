// Generated from crates/flight-path-boolean/tests/resolve_path_regions_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createPath, flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { createMartinezPathBooleanKernel, resolvePathRegions } from './contract.ts';

function flattenedPath(path: Readonly<Path>, tolerance: number | undefined): number[][] {
  const out = flattenPath(path, tolerance);
  return out;
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

describe('resolvePathRegions', () => {
  it('returns an empty path for no rings', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    resolvePathRegions(out, kernel, [], 'nonZero');
    expect(out.commands.length).toEqual(0);
    expect(out.data.length).toEqual(0);
    expect(out.winding).toEqual('nonZero');
  });
  it('self unions overlapping rings into one outline under non zero', () => {
    const kernel = createMartinezPathBooleanKernel();
    const squareA = [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0];
    const squareB = [2.0, 2.0, 6.0, 2.0, 6.0, 6.0, 2.0, 6.0];
    let out = createPath('nonZero');
    resolvePathRegions(out, kernel, [squareA, squareB], 'nonZero');
    expect(ringCount(out)).toEqual(1);
    expect(Math.abs(pathArea(out) - 28.0) < 5e-7).toBe(true);
  });
  it('applies the fill rule to self overlap under even odd', () => {
    const kernel = createMartinezPathBooleanKernel();
    const squareA = [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0];
    const squareB = [2.0, 2.0, 6.0, 2.0, 6.0, 6.0, 2.0, 6.0];
    let out = createPath('nonZero');
    resolvePathRegions(out, kernel, [squareA, squareB], 'evenOdd');
    expect(Math.abs(pathArea(out) - 24.0) < 5e-7).toBe(true);
    expect(ringCount(out) > 1).toBe(true);
  });
});
