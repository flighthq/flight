// Generated from crates/flight-path/tests/get_path_contour_lengths_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import * as flightPath from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  createPath,
  getPathContourLengths,
  getPathLength,
} from './contract.ts';
import type { PathRaw } from './contract.ts';

function pathContourLengths(path: Readonly<PathRaw>, tolerance: number | undefined): number[] {
  const out = getPathContourLengths(path, tolerance);
  return out;
}

describe('getPathContourLengths', () => {
  it('returns empty for empty path', () => {
    const path = createPath('nonZero');
    const lengths = pathContourLengths(path, 0.25);
    expect(lengths.length === 0).toBe(true);
  });
  it('returns independent lengths for each call', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 3.0, 4.0);
    const first = getPathContourLengths(path, 0.25);
    const empty = getPathContourLengths(createPath('nonZero'), 0.25);
    expect(empty.length === 0).toBe(true);
    expect(first).toEqual([5.0]);
  });
  it('returns single length matching total for single contour', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 50.0);
    const lengths = pathContourLengths(path, 0.25);
    expect(lengths.length).toEqual(1);
    const total = getPathLength(path, 0.25);
    expect(Math.abs(lengths[0] - total) < 0.005).toBe(true);
  });
  it('returns per contour lengths for multi contour path', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 30.0, 0.0);
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 0.0, 40.0);
    const lengths = pathContourLengths(path, 0.25);
    expect(lengths.length).toEqual(2);
    expect(Math.abs(lengths[0] - 30.0) < 0.005).toBe(true);
    expect(Math.abs(lengths[1] - 40.0) < 0.005).toBe(true);
  });
  it('accounts for closed contours', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 50.0);
    const lengths = pathContourLengths(path, 0.25);
    expect(lengths.length).toEqual(1);
    expect(Math.abs(lengths[0] - 300.0) < 0.005).toBe(true);
  });
  it('sums per contour lengths to match total', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 0.0, 20.0);
    appendPathClose(path);
    const lengths = pathContourLengths(path, 0.25);
    const sum: number = lengths.reduce((sum, value) => sum + value, 0);
    const total = getPathLength(path, 0.25);
    expect(Math.abs(sum - total) < 0.005).toBe(true);
  });
});
