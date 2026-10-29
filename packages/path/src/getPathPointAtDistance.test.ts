// Generated from crates/flight-path/tests/get_path_point_at_distance_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createVector2 } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import {
  appendPathLineTo,
  appendPathMoveTo,
  createPath,
  getPathPointAtDistance,
  getPathPositionAtDistance,
  getPathTangentAtDistance,
} from './contract.ts';

describe('getPathPointAtDistance', () => {
  it('returns false for empty path', () => {
    const path = createPath('nonZero');
    let out = createVector2(0.0, 0.0);
    const result = getPathPointAtDistance(path, 0.0, out, 0.25);
    expect(!result).toBe(true);
  });
  it('returns start point at distance zero', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 5.0, 10.0);
    appendPathLineTo(path, 15.0, 10.0);
    let out = createVector2(0.0, 0.0);
    getPathPointAtDistance(path, 0.0, out, 0.25);
    expect(Math.abs(out.x - 5.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 10.0) < 0.005).toBe(true);
  });
  it('interpolates to midpoint of segment', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let out = createVector2(0.0, 0.0);
    getPathPointAtDistance(path, 50.0, out, 0.25);
    expect(Math.abs(out.x - 50.0) < 0.005).toBe(true);
    expect(Math.abs(out.y) < 0.005).toBe(true);
  });
  it('clamps to end when distance exceeds length', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    let out = createVector2(0.0, 0.0);
    getPathPointAtDistance(path, 1000.0, out, 0.25);
    expect(Math.abs(out.x - 10.0) < 0.005).toBe(true);
    expect(Math.abs(out.y) < 0.005).toBe(true);
  });
  it('clamps to start when distance is negative', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 5.0, 5.0);
    appendPathLineTo(path, 15.0, 5.0);
    let out = createVector2(0.0, 0.0);
    getPathPointAtDistance(path, -10.0, out, 0.25);
    expect(Math.abs(out.x - 5.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 5.0) < 0.005).toBe(true);
  });
});

describe('getPathPositionAtDistance', () => {
  it('returns both point and tangent simultaneously', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let point = createVector2(0.0, 0.0);
    let tangent = createVector2(0.0, 0.0);
    const result = getPathPositionAtDistance(path, 50.0, point, tangent, 0.25);
    expect(result).toBe(true);
    expect(Math.abs(point.x - 50.0) < 0.005).toBe(true);
    expect(Math.abs(point.y) < 0.005).toBe(true);
    expect(Math.abs(tangent.x - 1.0) < 0.005).toBe(true);
    expect(Math.abs(tangent.y) < 0.005).toBe(true);
  });
});

describe('getPathTangentAtDistance', () => {
  it('returns default tangent for empty path', () => {
    const path = createPath('nonZero');
    let out = createVector2(0.0, 0.0);
    getPathTangentAtDistance(path, 0.0, out, 0.25);
    expect(Math.abs(out.x - 1.0) < 0.005).toBe(true);
    expect(Math.abs(out.y) < 0.005).toBe(true);
  });
  it('returns unit tangent along horizontal line', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const result = getPathTangentAtDistance(path, 50.0, out, 0.25);
    expect(result).toBe(true);
    expect(Math.abs(out.x - 1.0) < 0.005).toBe(true);
    expect(Math.abs(out.y) < 0.005).toBe(true);
  });
  it('returns unit tangent along vertical line', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 0.0, 100.0);
    let out = createVector2(0.0, 0.0);
    const result = getPathTangentAtDistance(path, 50.0, out, 0.25);
    expect(result).toBe(true);
    expect(Math.abs(out.x) < 0.005).toBe(true);
    expect(Math.abs(out.y - 1.0) < 0.005).toBe(true);
  });
});
