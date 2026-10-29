// Generated from crates/flight-path/tests/clean_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { PathCommand, appendPathClose, appendPathLineTo, appendPathMoveTo, cleanPath, createPath } from './contract.ts';

describe('cleanPath', () => {
  it('removes consecutive duplicate points', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 0.0);
    appendPathLineTo(source, 10.0, 0.0);
    appendPathLineTo(source, 10.0, 10.0);
    let out = createPath('nonZero');
    cleanPath(source, 0.001, out, 0.25);
    expect(out.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
    expect(out.data).toEqual([0.0, 0.0, 10.0, 0.0, 10.0, 10.0]);
  });
  it('collapses a near collinear run to its endpoints', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 25.0, 0.1);
    appendPathLineTo(source, 50.0, -0.1);
    appendPathLineTo(source, 75.0, 0.05);
    appendPathLineTo(source, 100.0, 0.0);
    let out = createPath('nonZero');
    cleanPath(source, 1.0, out, 0.25);
    expect(out.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(out.data).toEqual([0.0, 0.0, 100.0, 0.0]);
  });
  it('keeps a vertex whose deviation just exceeds tolerance', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 1.5);
    appendPathLineTo(source, 20.0, 0.0);
    let out = createPath('nonZero');
    cleanPath(source, 1.0, out, 0.25);
    expect(out.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
    expect(out.data).toEqual([0.0, 0.0, 10.0, 1.5, 20.0, 0.0]);
  });
  it('removes a vertex whose deviation is within tolerance', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 0.5);
    appendPathLineTo(source, 20.0, 0.0);
    let out = createPath('nonZero');
    cleanPath(source, 1.0, out, 0.25);
    expect(out.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(out.data).toEqual([0.0, 0.0, 20.0, 0.0]);
  });
  it('keeps a closed contour closed', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 0.0);
    appendPathLineTo(source, 10.0, 10.0);
    appendPathLineTo(source, 0.0, 10.0);
    appendPathClose(source);
    let out = createPath('nonZero');
    cleanPath(source, 0.001, out, 0.25);
    expect(out.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    expect(out.data).toEqual([0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
  });
  it('keeps non collinear spike as genuine feature', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 0.0);
    appendPathLineTo(source, 10.0, 10.0);
    appendPathLineTo(source, 6.0, 10.0);
    appendPathLineTo(source, 5.0, 20.0);
    appendPathLineTo(source, 4.0, 10.0);
    appendPathLineTo(source, 0.0, 10.0);
    appendPathClose(source);
    let out = createPath('nonZero');
    cleanPath(source, 0.001, out, 0.25);
    expect(out.data).toEqual([0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 6.0, 10.0, 5.0, 20.0, 4.0, 10.0, 0.0, 10.0]);
  });
  it('preserves non degenerate closed triangle', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 100.0, 0.0);
    appendPathLineTo(source, 50.0, 100.0);
    appendPathClose(source);
    let out = createPath('nonZero');
    cleanPath(source, 0.5, out, 0.25);
    expect(out.commands.includes(PathCommand.CLOSE)).toBe(true);
  });
  it('cleans in place when out is the same object as source', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 5.0, 0.0);
    appendPathLineTo(path, 5.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathLineTo(path, 10.0, 10.0);
    appendPathLineTo(path, 0.0, 10.0);
    appendPathClose(path);
    const source = path;
    cleanPath(source, 0.001, path, 0.25);
    expect(path.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    expect(path.data).toEqual([0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
  });
  it('removes zero area out and back spike', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 0.0);
    appendPathLineTo(source, 10.0, 10.0);
    appendPathLineTo(source, 5.0, 10.0);
    appendPathLineTo(source, 5.0, 15.0);
    appendPathLineTo(source, 5.0, 10.0);
    appendPathLineTo(source, 0.0, 10.0);
    appendPathClose(source);
    let out = createPath('nonZero');
    cleanPath(source, 0.001, out, 0.25);
    expect(out.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    expect(out.data).toEqual([0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
  });
});
