// Generated from crates/flight-path/tests/get_path_curvature_at_distance_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  appendPathCircle,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  createPath,
  getPathCurvatureAtDistance,
  getPathLength,
} from './contract.ts';

describe('getPathCurvatureAtDistance', () => {
  it('returns zero for empty path', () => {
    const path = createPath('nonZero');
    const curvature = getPathCurvatureAtDistance(path, 0.0, 0.25);
    expect(curvature).toEqual(0.0);
  });
  it('returns zero for straight line', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    const curvature = getPathCurvatureAtDistance(path, 50.0, 0.25);
    expect(curvature).toEqual(0.0);
  });
  it('returns nonzero curvature on a curved path', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 50.0, 100.0, 100.0, 0.0);
    const k = getPathCurvatureAtDistance(path, 50.0, 0.25);
    expect(k !== 0.0).toBe(true);
  });
  it('returns nonzero curvature on curved path', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 50.0, 100.0, 100.0, 0.0);
    const k = getPathCurvatureAtDistance(path, 50.0, 0.01);
    expect(k !== 0.0).toBe(true);
  });
  it('returns approximately 1 r for a circle of known radius', () => {
    const r = 50.0;
    let path = createPath('nonZero');
    appendPathCircle(path, 0.0, 0.0, r);
    const circumference = 2.0 * Math.PI * r;
    const k = getPathCurvatureAtDistance(path, circumference / 4.0, 0.25);
    expect(Math.abs(Math.abs(k) - 1.0 / r) < 0.05).toBe(true);
  });
  it('returns approximately inverse radius for circle', () => {
    const r = 50.0;
    let path = createPath('nonZero');
    appendPathCircle(path, 0.0, 0.0, r);
    const circumference = 2.0 * Math.PI * r;
    const k = getPathCurvatureAtDistance(path, circumference / 4.0, 0.01);
    expect(Math.abs(Math.abs(k) - 1.0 / r) < 0.1).toBe(true);
  });
  it('clamps at end for distances beyond length', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 50.0, 100.0, 100.0, 0.0);
    const tolerance = 0.01;
    const length = getPathLength(path, tolerance);
    const kEnd = getPathCurvatureAtDistance(path, length, tolerance);
    const kBeyond = getPathCurvatureAtDistance(path, length + 100.0, tolerance);
    expect(kEnd !== 0.0).toBe(true);
    expect(Math.abs(kEnd - kBeyond) < 5e-13).toBe(true);
  });
});
