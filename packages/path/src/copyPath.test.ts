// Generated from crates/flight-path/tests/copy_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  clonePath,
  copyPath,
  createPath,
} from './contract.ts';

describe('clonePath', () => {
  // Rust-only: allocates independent storage and entity identity
  it('returns new path with same commands and data', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    appendPathRectangle(source, 0.0, 0.0, 100.0, 50.0);
    const cloned = clonePath(source);
    expect(cloned.commands).toEqual(source.commands);
    expect(cloned.data).toEqual(source.data);
    expect(cloned.winding).toEqual('evenOdd');
  });
  it('mutations to clone do not affect source', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    let cloned = clonePath(source);
    cloned.commands.push(99);
    expect(source.commands.length).toEqual(1);
  });
});

describe('copyPath', () => {
  // Rust-only: preserves destination identity and existing field storage
  // Rust-only: supports geometry clone form for source and output
  it('writes into required out with same contents', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 5.0, 10.0);
    let result = createPath('nonZero');
    copyPath(result, source);
    expect(result.commands).toEqual(source.commands);
    expect(result.data).toEqual(source.data);
  });
  it('clears existing data when source is empty', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    let out = createPath('nonZero');
    appendPathRectangle(out, 10.0, 20.0, 30.0, 40.0);
    copyPath(out, source);
    expect(out.commands.length === 0).toBe(true);
    expect(out.data.length === 0).toBe(true);
    expect(out.winding).toEqual('evenOdd');
  });
  it('writes into out', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 1.0, 2.0);
    appendPathLineTo(source, 3.0, 4.0);
    let out = createPath('evenOdd');
    copyPath(out, source);
    expect(out.commands.length).toEqual(2);
    expect(out.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(out.commands[1]).toEqual(PathCommand.LINE_TO & 0xff);
    expect(out.data.length).toEqual(4);
    for (let i = 0; i < 4; i += 1) {
      expect(out.data[i]).toEqual(source.data[i]);
    }
    expect(out.winding).toEqual('nonZero');
  });
  it('writes into out with correct winding', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    appendPathMoveTo(source, 1.0, 2.0);
    appendPathLineTo(source, 3.0, 4.0);
    let out = createPath('nonZero');
    copyPath(out, source);
    expect(out.commands).toEqual(source.commands);
    expect(out.data).toEqual(source.data);
    expect(out.winding).toEqual('evenOdd');
  });
  it('preserves contents when copying a snapshot', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 7.0, 8.0);
    const cmdsBefore = source.commands.slice();
    const dataBefore = source.data.slice();
    const snapshot = source;
    copyPath(source, snapshot);
    expect(source.commands).toEqual(cmdsBefore);
    expect(source.data).toEqual(dataBefore);
  });
  it('copies into existing path', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    appendPathMoveTo(source, 5.0, 6.0);
    let out = createPath('nonZero');
    copyPath(out, source);
    expect(out.commands).toEqual(source.commands);
    expect(out.data).toEqual(source.data);
    expect(out.winding).toEqual('evenOdd');
  });
});
