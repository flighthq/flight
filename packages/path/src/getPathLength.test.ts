// Generated from crates/flight-path/tests/get_path_length_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath, getPathLength } from './contract.ts';

describe('getPathLength', () => {
  it('returns zero for empty path', () => {
    const path = createPath('nonZero');
    const length = getPathLength(path, 0.25);
    expect(length).toEqual(0.0);
  });
  it('returns correct length of diagonal line', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 30.0, 40.0);
    const length = getPathLength(path, 0.25);
    expect(Math.abs(length - 50.0) < 0.005).toBe(true);
  });
  it('returns perimeter of rectangle', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 50.0);
    const length = getPathLength(path, 0.25);
    expect(Math.abs(length - 300.0) < 0.005).toBe(true);
  });
  it('sums lengths across multiple subpaths', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 0.0, 5.0);
    const length = getPathLength(path, 0.25);
    expect(Math.abs(length - 15.0) < 0.005).toBe(true);
  });
});
