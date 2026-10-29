// Generated from crates/flight-path/tests/reverse_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  createPath,
  reversePath,
} from './contract.ts';

describe('reversePath', () => {
  it('reverses simple open polyline', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 0.0);
    appendPathLineTo(source, 10.0, 10.0);
    let out = createPath('nonZero');
    reversePath(source, out);
    expect(out.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
    expect(out.data).toEqual([10.0, 10.0, 10.0, 0.0, 0.0, 0.0]);
  });
  it('preserves closed flag', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 0.0);
    appendPathLineTo(source, 10.0, 10.0);
    appendPathClose(source);
    let out = createPath('nonZero');
    reversePath(source, out);
    expect(out.commands[out.commands.length - 1]).toEqual(PathCommand.CLOSE);
  });
  it('copies winding rule', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 1.0, 0.0);
    let out = createPath('nonZero');
    reversePath(source, out);
    expect(out.winding).toEqual('evenOdd');
  });
  it('is alias safe when out is same as source', () => {
    let path = createPath('nonZero');
    path.winding = 'evenOdd';
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathLineTo(path, 20.0, 10.0);
    appendPathClose(path);
    let expected = createPath('nonZero');
    reversePath(path, expected);
    reversePath(path, path);
    expect(path.commands).toEqual(expected.commands);
    expect(path.data).toEqual(expected.data);
    expect(path.winding).toEqual(expected.winding);
  });
});
