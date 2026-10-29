// Generated from crates/flight-path/tests/transform_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createMatrix } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import {
  appendPathCubicCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  createPath,
  transformPath,
  translatePath,
} from './contract.ts';
import type { PathRaw } from './contract.ts';

function tsWirePath(commands: number[], data: number[]): PathRaw {
  let path = createPath('nonZero');
  path.commands = commands;
  path.data = data;
  return path;
}

describe('transformPath', () => {
  it('identity matrix leaves all coordinates unchanged', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 10.0, 20.0);
    appendPathLineTo(source, 30.0, 40.0);
    const identity = createMatrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let out = createPath('nonZero');
    transformPath(source, identity, out);
    expect(out.data).toEqual([10.0, 20.0, 30.0, 40.0]);
  });
  it('applies translation to move and line points', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 0.0);
    const matrix = createMatrix(1.0, 0.0, 0.0, 1.0, 5.0, 3.0);
    let out = createPath('nonZero');
    transformPath(source, matrix, out);
    expect(out.data).toEqual([5.0, 3.0, 15.0, 3.0]);
  });
  it('applies scale to quadratic curve control and anchor points', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathQuadraticCurveTo(source, 10.0, 20.0, 30.0, 0.0);
    const matrix = createMatrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0);
    let out = createPath('nonZero');
    transformPath(source, matrix, out);
    expect(out.data).toEqual([0.0, 0.0, 20.0, 40.0, 60.0, 0.0]);
  });
  it('applies scale to cubic curve points', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathCubicCurveTo(source, 10.0, 0.0, 20.0, 0.0, 30.0, 0.0);
    const matrix = createMatrix(3.0, 0.0, 0.0, 3.0, 0.0, 0.0);
    let out = createPath('nonZero');
    transformPath(source, matrix, out);
    expect(out.data).toEqual([0.0, 0.0, 30.0, 0.0, 60.0, 0.0, 90.0, 0.0]);
  });
  it('is alias safe when out is same as source', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 5.0, 10.0);
    appendPathLineTo(path, 15.0, 20.0);
    const matrix = createMatrix(1.0, 0.0, 0.0, 1.0, 100.0, 200.0);
    transformPath(path, matrix, path);
    expect(path.data).toEqual([105.0, 210.0, 115.0, 220.0]);
  });
  it('copies winding and commands from source', () => {
    let source = createPath('nonZero');
    source.winding = 'evenOdd';
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 1.0, 1.0);
    const identity = createMatrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let out = createPath('nonZero');
    transformPath(source, identity, out);
    expect(out.winding).toEqual('evenOdd');
    expect(out.commands).toEqual(source.commands);
  });
  it('applies scale', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 10.0, 20.0);
    const matrix = createMatrix(2.0, 0.0, 0.0, 3.0, 0.0, 0.0);
    let out = createPath('nonZero');
    transformPath(source, matrix, out);
    expect(Math.abs(out.data[0] - 20.0) < 0.01).toBe(true);
    expect(Math.abs(out.data[1] - 60.0) < 0.01).toBe(true);
  });
});

describe('translatePath', () => {
  it('keeps ts no op bytes and moves only real coordinates', () => {
    const source = tsWirePath([1, 0, 2], [1.0, 1.0, 2.0, 2.0]);
    let out = createPath('nonZero');
    translatePath(source, 10.0, 0.0, out);
    expect(out.commands).toEqual([1, 0, 2]);
    expect(out.data).toEqual([11.0, 1.0, 12.0, 2.0]);
  });
  it('shifts all points by dx dy', () => {
    let source = createPath('nonZero');
    appendPathMoveTo(source, 0.0, 0.0);
    appendPathLineTo(source, 10.0, 10.0);
    let out = createPath('nonZero');
    translatePath(source, 5.0, -3.0, out);
    expect(out.data).toEqual([5.0, -3.0, 15.0, 7.0]);
  });
  it('is alias safe', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 1.0, 2.0);
    translatePath(path, 10.0, 20.0, path);
    expect(path.data).toEqual([11.0, 22.0]);
  });
});
