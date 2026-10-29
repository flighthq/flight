// Generated from crates/flight-path-boolean/tests/write_path_boolean_contours_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { PathCommand, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { writePathBooleanContours } from './contract.ts';

describe('writePathBooleanContours', () => {
  it('rebuilds into a supplied path without allocation', () => {
    let out = createPath('nonZero');
    out.winding = 'evenOdd';
    writePathBooleanContours(out, [[0.0, 0.0, 1.0, 0.0, 0.0, 1.0]]);
    expect(out.winding).toEqual('nonZero');
    expect(out.commands.length).toEqual(4);
  });
  it('skips rings with fewer than three vertices', () => {
    let out = createPath('nonZero');
    writePathBooleanContours(out, [[0.0, 0.0, 1.0, 1.0]]);
    expect(out.commands.length).toEqual(0);
    expect(out.data.length).toEqual(0);
  });
  it('converts multiple rings to separate sub paths', () => {
    let out = createPath('nonZero');
    writePathBooleanContours(out, [
      [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
      [20.0, 20.0, 30.0, 20.0, 30.0, 30.0],
    ]);
    let moveCount = 0;
    for (const command of out.commands) {
      if (command === PathCommand.MOVE_TO) {
        moveCount += 1;
      }
    }
    let closeCount = 0;
    for (const command of out.commands) {
      if (command === PathCommand.CLOSE) {
        closeCount += 1;
      }
    }
    expect(moveCount).toEqual(2);
    expect(closeCount).toEqual(2);
  });
  it('clears existing content before writing', () => {
    let out = createPath('nonZero');
    appendPathMoveTo(out, 99.0, 99.0);
    appendPathLineTo(out, 100.0, 100.0);
    writePathBooleanContours(out, [[0.0, 0.0, 1.0, 0.0, 0.0, 1.0]]);
    expect(out.commands.length).toEqual(4);
  });
});
