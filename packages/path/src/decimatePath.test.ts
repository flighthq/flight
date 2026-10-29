// Generated from crates/flight-path/tests/decimate_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import * as flightPath from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  createPath,
  decimatePath,
  flattenPath,
} from './contract.ts';
import type { PathRaw } from './contract.ts';

function flattenedPath(path: Readonly<PathRaw>, tolerance: number | undefined): number[][] {
  const out = flattenPath(path, tolerance);
  return out;
}

describe('decimatePath', () => {
  it('keeps a straight line unchanged', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 50.0, 0.0);
    appendPathLineTo(source, 100.0, 0.0);
    let out = createPath('nonZero');
    decimatePath(source, 1.0, out, 0.25);
    expect(out.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(out.data).toEqual([0.0, 0.0, 100.0, 0.0]);
  });
  it('simplifies a noisy straight line', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 25.0, 0.1);
    appendPathLineTo(source, 50.0, -0.1);
    appendPathLineTo(source, 75.0, 0.05);
    appendPathLineTo(source, 100.0, 0.0);
    let out = createPath('nonZero');
    decimatePath(source, 1.0, out, 0.25);
    expect(out.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(out.data[0]).toEqual(0.0);
    expect(out.data[2]).toEqual(100.0);
  });
  it('keeps all points when tolerance is zero', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 50.0, 10.0);
    appendPathLineTo(source, 100.0, 0.0);
    let out = createPath('nonZero');
    decimatePath(source, 0.0, out, 0.25);
    expect(out.commands.length).toEqual(3);
    expect(out.data).toEqual([0.0, 0.0, 50.0, 10.0, 100.0, 0.0]);
  });
  it('preserves closed paths', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 100.0, 0.0);
    appendPathLineTo(source, 100.0, 100.0);
    appendPathLineTo(source, 0.0, 100.0);
    appendPathClose(source);
    let out = createPath('nonZero');
    decimatePath(source, 1.0, out, 0.25);
    expect(out.commands[out.commands.length - 1]).toEqual(PathCommand.CLOSE);
  });
  it('preserves winding rule', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 100.0, 0.0);
    let out = createPath('nonZero');
    decimatePath(source, 1.0, out, 0.25);
    expect(out.winding).toEqual('evenOdd');
  });
  it('handles empty path', () => {
    const source = createPath('nonZero');
    let out = createPath('nonZero');
    decimatePath(source, 1.0, out, 0.25);
    expect(out.commands.length === 0).toBe(true);
  });
  it('is alias safe when source and out are same', () => {
    let path = createPath('nonZero');
    path.winding = 'evenOdd';
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 25.0, 0.1);
    appendPathLineTo(path, 50.0, -0.1);
    appendPathLineTo(path, 100.0, 0.0);
    let expected = createPath('nonZero');
    decimatePath(path, 1.0, expected, 0.25);
    decimatePath(path, 1.0, path, 0.25);
    expect(path.commands).toEqual(expected.commands);
    expect(path.data).toEqual(expected.data);
    expect(path.winding).toEqual(expected.winding);
  });
  it('preserves distinct corners', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 100.0, 0.0);
    appendPathLineTo(source, 100.0, 100.0);
    let out = createPath('nonZero');
    decimatePath(source, 1.0, out, 0.25);
    const contours = flattenedPath(out, 0.25);
    expect(Math.trunc(contours[0].length / 2)).toEqual(3);
  });
});
