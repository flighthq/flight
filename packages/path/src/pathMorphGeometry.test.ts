// Generated from crates/flight-path/tests/path_morph_geometry_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  buildPathMorph,
  createPath,
  createPathMorph,
  initializePathMorph,
} from './contract.ts';

describe('buildPathMorph', () => {
  it('succeeds for compatible closed paths', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 100.0, 100.0);
    let end = createPath('nonZero');
    appendPathRectangle(end, 50.0, 50.0, 200.0, 200.0);
    const result = buildPathMorph(start, end);
    expect(result.issue).toEqual('ok');
    expect(result.morph !== undefined).toBe(true);
  });
  it('returns success for compatible open paths', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    appendPathLineTo(start, 1.0, 0.0);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 0.0, 0.0);
    appendPathLineTo(end, 2.0, 0.0);
    const result = buildPathMorph(start, end);
    expect(result.issue).toEqual('ok');
    expect(result.morph !== undefined).toBe(true);
  });
  it('fails for winding mismatch', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 100.0, 100.0);
    let end = createPath('nonZero');
    end.winding = 'evenOdd';
    appendPathRectangle(end, 0.0, 0.0, 100.0, 100.0);
    const result = buildPathMorph(start, end);
    expect(result.issue).toEqual('winding-mismatch');
    expect(result.morph === undefined).toBe(true);
  });
  it('fails for contour count mismatch', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 100.0, 100.0);
    let end = createPath('nonZero');
    appendPathRectangle(end, 0.0, 0.0, 100.0, 100.0);
    appendPathRectangle(end, 200.0, 200.0, 50.0, 50.0);
    const result = buildPathMorph(start, end);
    expect(result.issue).toEqual('contour-count-mismatch');
  });
});

describe('initializePathMorph', () => {
  it('writes commands data and winding', () => {
    let start = createPath('nonZero');
    appendPathRectangle(start, 0.0, 0.0, 10.0, 10.0);
    let end = createPath('nonZero');
    appendPathRectangle(end, 5.0, 5.0, 20.0, 20.0);
    let out = createPathMorph(start, end)!;
    initializePathMorph(out, [1, 6], [0.0, 1.0], [2.0, 3.0], 'evenOdd');
    expect(out.commands).toEqual([1, 6]);
    expect(out.endData).toEqual([0.0, 1.0]);
    expect(out.startData).toEqual([2.0, 3.0]);
    expect(out.winding).toEqual('evenOdd');
  });
});
