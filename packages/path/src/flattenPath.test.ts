// Generated from crates/flight-path/tests/flatten_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import * as flightPath from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  appendPathRectangle,
  createPath,
  flattenPath,
} from './contract.ts';
import type { PathRaw } from './contract.ts';

function flattenedPath(path: Readonly<PathRaw>, tolerance: number | undefined): number[][] {
  const out = flattenPath(path, tolerance);
  return out;
}

function tsWirePath(commands: number[], data: number[]): PathRaw {
  let path = createPath('nonZero');
  path.commands = commands;
  path.data = data;
  return path;
}

describe('flattenPath', () => {
  it('flattens ts serialized bytes like the writer built path', () => {
    const raw = tsWirePath([1, 2, 0, 2, 2, 7], [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
    let built = createPath('nonZero');
    appendPathMoveTo(built, 0.0, 0.0);
    appendPathLineTo(built, 10.0, 0.0);
    appendPathLineTo(built, 10.0, 10.0);
    appendPathLineTo(built, 0.0, 10.0);
    appendPathClose(built);
    expect(flattenedPath(raw, undefined)).toEqual(flattenedPath(built, undefined));
    expect(flattenedPath(raw, undefined).length).toEqual(1);
  });
  it('returns empty for empty path', () => {
    const path = createPath('nonZero');
    const contours = flattenedPath(path, 0.25);
    expect(contours.length === 0).toBe(true);
  });
  it('returns independent contours for each call', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 10.0, 20.0);
    const first = flattenPath(path, 0.25);
    const empty = flattenPath(createPath('nonZero'), 0.25);
    expect(empty.length === 0).toBe(true);
    expect(first.length).toEqual(1);
    expect(first[0]).toEqual([0.0, 0.0, 10.0, 0.0, 10.0, 20.0, 0.0, 20.0, 0.0, 0.0]);
  });
  it('flattens straight line to its two endpoints', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    const contours = flattenedPath(path, 0.25);
    expect(contours).toEqual([[0.0, 0.0, 100.0, 0.0]]);
  });
  it('produces one contour per subpath', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathMoveTo(path, 0.0, 10.0);
    appendPathLineTo(path, 10.0, 10.0);
    const contours = flattenedPath(path, 0.25);
    expect(contours).toEqual([
      [0.0, 0.0, 10.0, 0.0],
      [0.0, 10.0, 10.0, 10.0],
    ]);
  });
  it('collapses quadratic on chord to just the endpoint', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 50.0, 0.0, 100.0, 0.0);
    const contours = flattenedPath(path, 0.25);
    expect(contours).toEqual([[0.0, 0.0, 100.0, 0.0]]);
  });
  it('reads second coordinate pair for wide verbs', () => {
    let path = createPath('nonZero');
    path.commands.push(PathCommand.WIDE_MOVE_TO);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(5.0);
    path.data.push(6.0);
    path.commands.push(PathCommand.WIDE_LINE_TO);
    path.data.push(0.0);
    path.data.push(0.0);
    path.data.push(7.0);
    path.data.push(8.0);
    const contours = flattenedPath(path, 0.25);
    expect(contours).toEqual([[5.0, 6.0, 7.0, 8.0]]);
  });
  it('subdivides genuinely curved quadratic keeping endpoints', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 50.0, 50.0, 100.0, 0.0);
    const contour = flattenedPath(path, 0.25)[0];
    expect(contour.length > 4).toBe(true);
    expect(contour[0]).toEqual(0.0);
    expect(contour[1]).toEqual(0.0);
    expect(contour[contour.length - 2]).toEqual(100.0);
    expect(contour[contour.length - 1]).toEqual(0.0);
  });
  it('emits fewer points at coarser tolerance', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 50.0, 50.0, 100.0, 0.0);
    const fine = flattenedPath(path, 0.1)[0].length;
    const coarse = flattenedPath(path, 50.0)[0].length;
    expect(coarse < fine).toBe(true);
  });
  it('appends start point when close verb is present', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 100.0, 100.0);
    appendPathClose(path);
    const contour = flattenedPath(path, 0.25)[0];
    expect(contour[contour.length - 2]).toEqual(0.0);
    expect(contour[contour.length - 1]).toEqual(0.0);
  });
  it('does not duplicate start when close at same position', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathLineTo(path, 0.0, 0.0);
    appendPathClose(path);
    const contour = flattenedPath(path, 0.25)[0];
    expect(contour.length).toEqual(6);
  });
  it('subdivides cubic curves', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathCubicCurveTo(path, 33.0, 100.0, 66.0, 100.0, 100.0, 0.0);
    const contours = flattenedPath(path, 0.25);
    expect(contours.length).toEqual(1);
    expect(contours[0].length > 4).toBe(true);
  });
});
