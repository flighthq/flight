// Generated from crates/flight-path/tests/contains_path_point_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathCubicCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  containsPathPoint,
  createPath,
} from './contract.ts';
import type { PathRaw } from './contract.ts';

function tsWirePath(commands: number[], data: number[]): PathRaw {
  let path = createPath('nonZero');
  path.commands = commands;
  path.data = data;
  return path;
}

describe('containsPathPoint', () => {
  it('hit tests a ts serialized square with no op bytes', () => {
    const path = tsWirePath([0, 1, 2, 0, 2, 2, 7], [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
    expect(containsPathPoint(path, 5.0, 5.0, undefined)).toBe(true);
    expect(!containsPathPoint(path, 15.0, 5.0, undefined)).toBe(true);
  });
  it('returns true for point inside convex polygon nonzero', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    expect(containsPathPoint(path, 50.0, 50.0, 0.25)).toBe(true);
  });
  it('returns false for point outside convex polygon nonzero', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    expect(!containsPathPoint(path, 200.0, 200.0, 0.25)).toBe(true);
  });
  it('returns true for point inside convex polygon even odd', () => {
    let path = createPath('nonZero');
    path.winding = 'evenOdd';
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    expect(containsPathPoint(path, 50.0, 50.0, 0.25)).toBe(true);
  });
  it('returns false for point in hole with even odd winding', () => {
    let path = createPath('nonZero');
    path.winding = 'evenOdd';
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 60.0, 0.0);
    appendPathLineTo(path, 60.0, 60.0);
    appendPathLineTo(path, 0.0, 60.0);
    appendPathLineTo(path, 0.0, 0.0);
    appendPathMoveTo(path, 40.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 60.0);
    appendPathLineTo(path, 40.0, 60.0);
    appendPathLineTo(path, 40.0, 0.0);
    expect(!containsPathPoint(path, 50.0, 30.0, 0.25)).toBe(true);
    expect(containsPathPoint(path, 20.0, 30.0, 0.25)).toBe(true);
  });
  it('returns true for point inside inner ring with nonzero same winding', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 60.0, 0.0);
    appendPathLineTo(path, 60.0, 60.0);
    appendPathLineTo(path, 0.0, 60.0);
    appendPathLineTo(path, 0.0, 0.0);
    appendPathMoveTo(path, 40.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 60.0);
    appendPathLineTo(path, 40.0, 60.0);
    appendPathLineTo(path, 40.0, 0.0);
    expect(containsPathPoint(path, 50.0, 30.0, 0.25)).toBe(true);
  });
  it('handles self intersecting figure eight path nonzero', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 50.0, 50.0);
    appendPathLineTo(path, 0.0, 0.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 50.0, 50.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 50.0, 50.0);
    expect(containsPathPoint(path, 20.0, 50.0, 0.25)).toBe(true);
    expect(containsPathPoint(path, 80.0, 50.0, 0.25)).toBe(true);
    expect(!containsPathPoint(path, 50.0, 120.0, 0.25)).toBe(true);
  });
  it('handles quadratic curve contour', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 100.0, 0.0);
    appendPathQuadraticCurveTo(path, 100.0, 100.0, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    expect(containsPathPoint(path, 30.0, 30.0, 0.25)).toBe(true);
    expect(!containsPathPoint(path, 90.0, 90.0, 0.25)).toBe(true);
  });
  it('handles cubic curve contour', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathCubicCurveTo(path, 100.0, 33.0, 100.0, 66.0, 100.0, 100.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    expect(containsPathPoint(path, 50.0, 50.0, 0.25)).toBe(true);
    expect(!containsPathPoint(path, 150.0, 50.0, 0.25)).toBe(true);
  });
  it('returns false for degenerate zero area contour', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 50.0, 0.0);
    appendPathLineTo(path, 0.0, 0.0);
    expect(!containsPathPoint(path, 50.0, 0.0, 0.25)).toBe(true);
    expect(!containsPathPoint(path, 50.0, 1.0, 0.25)).toBe(true);
  });
  it('returns false for point on boundary edge', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    const TopEdge = containsPathPoint(path, 50.0, 0.0, 0.25);
    const LeftEdge = containsPathPoint(path, 0.0, 50.0, 0.25);
  });
  it('returns false for empty path', () => {
    const path = createPath('nonZero');
    expect(!containsPathPoint(path, 0.0, 0.0, 0.25)).toBe(true);
  });
  it('handles wide line to command', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    path.commands.push(PathCommand.WIDE_LINE_TO);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(100.0);
    path.data.push(0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    expect(containsPathPoint(path, 50.0, 50.0, 0.25)).toBe(true);
  });
  it('handles wide move to command', () => {
    let path = createPath('nonZero');
    path.commands.push(PathCommand.WIDE_MOVE_TO);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    expect(containsPathPoint(path, 50.0, 50.0, 0.25)).toBe(true);
  });
  it('handles point at vertex without crashing', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathLineTo(path, 0.0, 100.0);
    appendPathLineTo(path, 0.0, 0.0);
    const AtVertex = containsPathPoint(path, 0.0, 0.0, 0.25);
    const AtAnother = containsPathPoint(path, 100.0, 100.0, 0.25);
  });
});
