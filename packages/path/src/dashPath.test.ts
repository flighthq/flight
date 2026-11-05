// Generated from crates/flight-path/tests/dash_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { PathCommand, appendPathClose, appendPathLineTo, appendPathMoveTo, createPath, dashPath } from './contract.ts';
import type { Path } from './contract.ts';

function countCommands(path: Readonly<Path>, command: PathCommand): number {
  let count = 0;
  for (const candidate of path.commands) {
    if (candidate === (command & 0xff)) {
      count += 1;
    }
  }
  return count;
}

describe('dashPath', () => {
  it('starts inside a later dash entry when the offset passes the first', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 40, 0);
    let out = createPath('nonZero');
    dashPath(source, [10, 10], 15, out, 0.25);
    expect(countCommands(out, PathCommand.MOVE_TO)).toEqual(2);
    expect(out.data).toEqual([5, 0, 15, 0, 25, 0, 35, 0]);
  });
  it('produces dashed segments from simple line', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    let out = createPath('nonZero');
    dashPath(source, [10, 5], 0, out, 0.25);
    const moveCount = countCommands(out, PathCommand.MOVE_TO);
    expect(moveCount >= 6).toBe(true);
    expect(!out.commands.includes(PathCommand.CLOSE & 0xff)).toBe(true);
  });
  it('copies unchanged for empty dash array', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 50, 50);
    let out = createPath('nonZero');
    dashPath(source, [], 0, out, 0.25);
    expect(out.commands).toEqual(source.commands);
    expect(out.data).toEqual(source.data);
  });
  it('handles closed path', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    appendPathLineTo(source, 100, 100);
    appendPathClose(source);
    let out = createPath('nonZero');
    dashPath(source, [20, 10], 0, out, 0.25);
    const moveCount = countCommands(out, PathCommand.MOVE_TO);
    expect(moveCount >= 2).toBe(true);
  });
  it('applies dash offset correctly', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    let noOffset = createPath('nonZero');
    dashPath(source, [10, 10], 0, noOffset, 0.25);
    let withOffset = createPath('nonZero');
    dashPath(source, [10, 10], 5, withOffset, 0.25);
    expect(withOffset.data).not.toEqual(noOffset.data);
  });
  it('handles zero length segments in dash array', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 50, 0);
    let out = createPath('nonZero');
    dashPath(source, [10, 0], 0, out, 0.25);
    expect(out.commands.length !== 0).toBe(true);
  });
  it('is alias safe when source and out are same', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 100);
    let expected = createPath('nonZero');
    dashPath(path, [15, 10], 0, expected, 0.25);
    dashPath(path, [15, 10], 0, path, 0.25);
    expect(path.commands).toEqual(expected.commands);
    expect(path.data).toEqual(expected.data);
  });
  it('does not mutate source', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    appendPathLineTo(source, 100, 100);
    const originalCommands = source.commands.slice();
    const originalData = source.data.slice();
    let out = createPath('nonZero');
    dashPath(source, [15, 10], 0, out, 0.25);
    expect(source.commands).toEqual(originalCommands);
    expect(source.data).toEqual(originalData);
  });
  it('preserves winding rule', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    let out = createPath('nonZero');
    dashPath(source, [10, 5], 0, out, 0.25);
    expect(out.winding).toEqual('evenOdd');
  });
  it('produces multiple segments for multiline path', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    appendPathLineTo(source, 100, 100);
    let out = createPath('nonZero');
    dashPath(source, [15, 10], 0, out, 0.25);
    const moveCount = countCommands(out, PathCommand.MOVE_TO);
    expect(moveCount >= 2).toBe(true);
  });
});
