// Generated from crates/flight-path/tests/explain_path_morph_creation_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  createPath,
  explainPathMorphCreation,
} from './contract.ts';

describe('explainPathMorphCreation', () => {
  it('reports a contour count mismatch', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    const end = createPath('nonZero');
    const result = explainPathMorphCreation(start, end);
    expect(!result.supported).toBe(true);
    expect(result.reason).toEqual('contour-count-mismatch');
    expect(result.contour === null).toBe(true);
  });
  it('reports a winding mismatch', () => {
    const start = createPath('nonZero');
    const end = createPath('evenOdd');
    const result = explainPathMorphCreation(start, end);
    expect(!result.supported).toBe(true);
    expect(result.reason).toEqual('winding-mismatch');
    expect(result.contour === null).toBe(true);
  });
  it('reports compatible pair', () => {
    const start = createPath('nonZero');
    const end = createPath('nonZero');
    const result = explainPathMorphCreation(start, end);
    expect(result.supported).toBe(true);
    expect(result.reason).toEqual('ok');
    expect(result.contour === null).toBe(true);
  });
  it('reports first contour with different closedness', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    appendPathLineTo(start, 1.0, 0.0);
    appendPathMoveTo(start, 10.0, 10.0);
    appendPathLineTo(start, 11.0, 10.0);
    appendPathClose(start);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 0.0, 0.0);
    appendPathLineTo(end, 1.0, 0.0);
    appendPathMoveTo(end, 10.0, 10.0);
    appendPathLineTo(end, 11.0, 10.0);
    const result = explainPathMorphCreation(start, end);
    expect(!result.supported).toBe(true);
    expect(result.reason).toEqual('contour-closedness-mismatch');
    expect(result.contour).toEqual(1);
  });
  it('reports contour orientation mismatch for reversed subset', () => {
    let start = createPath('nonZero');
    appendPathMoveTo(start, 0.0, 0.0);
    appendPathLineTo(start, 20.0, 0.0);
    appendPathLineTo(start, 20.0, 20.0);
    appendPathLineTo(start, 0.0, 20.0);
    appendPathClose(start);
    appendPathMoveTo(start, 5.0, 5.0);
    appendPathLineTo(start, 15.0, 5.0);
    appendPathLineTo(start, 15.0, 15.0);
    appendPathLineTo(start, 5.0, 15.0);
    appendPathClose(start);
    let end = createPath('nonZero');
    appendPathMoveTo(end, 0.0, 0.0);
    appendPathLineTo(end, 20.0, 0.0);
    appendPathLineTo(end, 20.0, 20.0);
    appendPathLineTo(end, 0.0, 20.0);
    appendPathClose(end);
    appendPathMoveTo(end, 5.0, 5.0);
    appendPathLineTo(end, 5.0, 15.0);
    appendPathLineTo(end, 15.0, 15.0);
    appendPathLineTo(end, 15.0, 5.0);
    appendPathClose(end);
    const result = explainPathMorphCreation(start, end);
    expect(!result.supported).toBe(true);
    expect(result.reason).toEqual('contour-orientation-mismatch');
    expect(result.contour).toEqual(1);
  });
});
