// Generated from crates/flight-path/tests/get_path_signed_area_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  createPath,
  getPathContourOrientation,
  getPathSignedArea,
} from './contract.ts';

describe('getPathContourOrientation', () => {
  it('returns degenerate for empty path', () => {
    const path = createPath('nonZero');
    const orientation = getPathContourOrientation(path, 0.25);
    expect(orientation).toEqual('degenerate');
  });
  it('returns degenerate for straight line', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    const orientation = getPathContourOrientation(path, 0.25);
    expect(orientation).toEqual('degenerate');
  });
  it('detects orientation for rectangle', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 100.0);
    const orientation = getPathContourOrientation(path, 0.25);
    expect(orientation === 'ccw' || orientation === 'cw').toBe(true);
  });
});

describe('getPathSignedArea', () => {
  it('returns zero for empty path', () => {
    const path = createPath('nonZero');
    const area = getPathSignedArea(path, 0.25);
    expect(area).toEqual(0.0);
  });
  it('returns correct area magnitude for rectangle', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 100.0);
    const area = getPathSignedArea(path, 0.25);
    expect(Math.abs(Math.abs(area) - 10000.0) < 0.005).toBe(true);
  });
  it('returns zero for straight line', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    const area = getPathSignedArea(path, 0.25);
    expect(Math.abs(area) < 0.001).toBe(true);
  });
});
