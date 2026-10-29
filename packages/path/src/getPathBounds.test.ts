// Generated from crates/flight-path/tests/get_path_bounds_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRectangle } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import {
  appendPathCubicCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  appendPathRectangle,
  createPath,
  getPathBounds,
} from './contract.ts';
import type { PathRaw } from './contract.ts';

function tsWirePath(commands: number[], data: number[]): PathRaw {
  let path = createPath('nonZero');
  path.commands = commands;
  path.data = data;
  return path;
}

describe('getPathBounds', () => {
  it('bounds a ts serialized stream with no op bytes', () => {
    const path = tsWirePath([0, 1, 0, 2, 7], [1.0, 2.0, 11.0, 22.0]);
    let out = createRectangle(0.0, 0.0, 0.0, 0.0);
    expect(getPathBounds(path, out)).toBe(true);
    expect([out.x, out.y, out.width, out.height]).toEqual([1.0, 2.0, 10.0, 20.0]);
  });
  it('returns false and zero rect for empty path', () => {
    const path = createPath('nonZero');
    let r = createRectangle(1.0, 2.0, 3.0, 4.0);
    const result = getPathBounds(path, r);
    expect(!result).toBe(true);
    expect(r.x).toEqual(0.0);
    expect(r.y).toEqual(0.0);
    expect(r.width).toEqual(0.0);
    expect(r.height).toEqual(0.0);
  });
  it('returns exact bounds of rectangle', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 10.0, 20.0, 100.0, 50.0);
    let r = createRectangle(0.0, 0.0, 0.0, 0.0);
    const result = getPathBounds(path, r);
    expect(result).toBe(true);
    expect(Math.abs(r.x - 10.0) < 0.005).toBe(true);
    expect(Math.abs(r.y - 20.0) < 0.005).toBe(true);
    expect(Math.abs(r.width - 100.0) < 0.005).toBe(true);
    expect(Math.abs(r.height - 50.0) < 0.005).toBe(true);
  });
  it('includes start point of single move to', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 5.0, 7.0);
    let r = createRectangle(0.0, 0.0, 0.0, 0.0);
    getPathBounds(path, r);
    expect(Math.abs(r.x - 5.0) < 0.005).toBe(true);
    expect(Math.abs(r.y - 7.0) < 0.005).toBe(true);
    expect(Math.abs(r.width) < 0.005).toBe(true);
    expect(Math.abs(r.height) < 0.005).toBe(true);
  });
  it('expands past control points for quadratic curve', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 50.0, 100.0, 100.0, 0.0);
    let r = createRectangle(0.0, 0.0, 0.0, 0.0);
    getPathBounds(path, r);
    expect(Math.abs(r.x) < 0.005).toBe(true);
    expect(Math.abs(r.y) < 0.005).toBe(true);
    expect(Math.abs(r.height - 50.0) < 0.005).toBe(true);
    expect(Math.abs(r.width - 100.0) < 0.005).toBe(true);
  });
  it('expands past control points for cubic curve', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathCubicCurveTo(path, 0.0, 100.0, 100.0, 100.0, 100.0, 0.0);
    let r = createRectangle(0.0, 0.0, 0.0, 0.0);
    getPathBounds(path, r);
    expect(Math.abs(r.y) < 0.005).toBe(true);
    expect(r.height > 70.0).toBe(true);
    expect(r.height < 100.0).toBe(true);
    expect(Math.abs(r.width - 100.0) < 0.005).toBe(true);
  });
  it('handles move and line spanning multiple quadrants', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, -50.0, -30.0);
    appendPathLineTo(path, 80.0, 60.0);
    let r = createRectangle(0.0, 0.0, 0.0, 0.0);
    getPathBounds(path, r);
    expect(Math.abs(r.x - -50.0) < 0.005).toBe(true);
    expect(Math.abs(r.y - -30.0) < 0.005).toBe(true);
    expect(Math.abs(r.width - 130.0) < 0.005).toBe(true);
    expect(Math.abs(r.height - 90.0) < 0.005).toBe(true);
  });
});
