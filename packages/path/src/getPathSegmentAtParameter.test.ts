// Generated from crates/flight-path/tests/get_path_segment_at_parameter_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createVector2 } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import {
  appendPathCubicCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathQuadraticCurveTo,
  createPath,
  getCubicBezierCurvature,
  getCubicBezierPoint,
  getCubicBezierTangent,
  getPathSegmentCurvatureAtParameter,
  getPathSegmentPointAtParameter,
  getPathSegmentTangentAtParameter,
  getQuadraticBezierCurvature,
  getQuadraticBezierPoint,
  getQuadraticBezierTangent,
} from './contract.ts';

describe('getCubicBezierCurvature', () => {
  it('returns zero for a straight cubic', () => {
    const c = getCubicBezierCurvature(0.0, 0.0, 1.0, 0.0, 2.0, 0.0, 3.0, 0.0, 0.5);
    expect(c).toEqual(0.0);
  });
  it('returns nonzero curvature for a curved cubic', () => {
    const c = getCubicBezierCurvature(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.5);
    expect(c !== 0.0).toBe(true);
  });
  it('returns a known curvature for a circular arc approximation', () => {
    const k = getCubicBezierCurvature(1.0, 0.0, 1.0, 0.5523, 0.5523, 1.0, 0.0, 1.0, 0.5);
    expect(Math.abs(Math.abs(k) - 1.0) < 0.05).toBe(true);
  });
});

describe('getCubicBezierPoint', () => {
  it('returns the start point at t zero', () => {
    let out = createVector2(0.0, 0.0);
    getCubicBezierPoint(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 0.0, out);
    expect(Math.abs(out.x - 1.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 2.0) < 0.005).toBe(true);
  });
  it('returns the end point at t one', () => {
    let out = createVector2(0.0, 0.0);
    getCubicBezierPoint(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 1.0, out);
    expect(Math.abs(out.x - 7.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 8.0) < 0.005).toBe(true);
  });
  it('interpolates a straight cubic at midpoint', () => {
    let out = createVector2(0.0, 0.0);
    getCubicBezierPoint(0.0, 0.0, 1.0, 0.0, 2.0, 0.0, 3.0, 0.0, 0.5, out);
    expect(Math.abs(out.x - 1.5) < 0.005).toBe(true);
    expect(Math.abs(out.y - 0.0) < 0.005).toBe(true);
  });
});

describe('getCubicBezierTangent', () => {
  it('returns the forward tangent at t zero', () => {
    let out = createVector2(0.0, 0.0);
    getCubicBezierTangent(0.0, 0.0, 3.0, 0.0, 6.0, 0.0, 9.0, 0.0, 0.0, out);
    expect(Math.abs(out.x - 9.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 0.0) < 0.005).toBe(true);
  });
  it('returns the backward tangent at t one', () => {
    let out = createVector2(0.0, 0.0);
    getCubicBezierTangent(0.0, 0.0, 0.0, 0.0, 6.0, 0.0, 9.0, 0.0, 1.0, out);
    expect(Math.abs(out.x - 9.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 0.0) < 0.005).toBe(true);
  });
});

describe('getPathSegmentCurvatureAtParameter', () => {
  it('returns none for out of range segment index', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 1.0, 0.0);
    expect(getPathSegmentCurvatureAtParameter(path, 5, 0.5) === null).toBe(true);
  });
  it('returns zero for a line segment', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    const result = getPathSegmentCurvatureAtParameter(path, 0, 0.5);
    expect(result).toEqual(0.0);
  });
  it('returns nonzero for a quadratic bezier segment', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 50.0, 100.0, 100.0, 0.0);
    const result = getPathSegmentCurvatureAtParameter(path, 0, 0.5);
    expect(result !== null).toBe(true);
    expect(result! !== 0.0).toBe(true);
  });
  it('returns nonzero for a cubic bezier segment', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathCubicCurveTo(path, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0);
    const result = getPathSegmentCurvatureAtParameter(path, 0, 0.5);
    expect(result !== null).toBe(true);
    expect(result! !== 0.0).toBe(true);
  });
});

describe('getPathSegmentPointAtParameter', () => {
  it('returns false for out of range segment index', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 1.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const result = getPathSegmentPointAtParameter(path, 5, 0.5, out);
    expect(!result).toBe(true);
  });
  it('evaluates midpoint of a line segment', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const result = getPathSegmentPointAtParameter(path, 0, 0.5, out);
    expect(result).toBe(true);
    expect(Math.abs(out.x - 5.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 0.0) < 0.005).toBe(true);
  });
  it('evaluates start and end of a line segment', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 2.0, 3.0);
    appendPathLineTo(path, 8.0, 9.0);
    let start = createVector2(0.0, 0.0);
    let end = createVector2(0.0, 0.0);
    getPathSegmentPointAtParameter(path, 0, 0.0, start);
    getPathSegmentPointAtParameter(path, 0, 1.0, end);
    expect(Math.abs(start.x - 2.0) < 0.005).toBe(true);
    expect(Math.abs(start.y - 3.0) < 0.005).toBe(true);
    expect(Math.abs(end.x - 8.0) < 0.005).toBe(true);
    expect(Math.abs(end.y - 9.0) < 0.005).toBe(true);
  });
  it('selects the correct segment by index in a multi segment path', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathLineTo(path, 10.0, 10.0);
    appendPathLineTo(path, 0.0, 10.0);
    let out = createVector2(0.0, 0.0);
    getPathSegmentPointAtParameter(path, 1, 0.5, out);
    expect(Math.abs(out.x - 10.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 5.0) < 0.005).toBe(true);
  });
  it('evaluates midpoint of a quadratic bezier', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 1.0, 2.0, 2.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const result = getPathSegmentPointAtParameter(path, 0, 0.5, out);
    expect(result).toBe(true);
    expect(Math.abs(out.x - 1.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 1.0) < 0.005).toBe(true);
  });
  it('evaluates midpoint of a cubic bezier', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathCubicCurveTo(path, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const result = getPathSegmentPointAtParameter(path, 0, 0.5, out);
    expect(result).toBe(true);
    expect(Math.abs(out.x - 0.5) < 0.005).toBe(true);
    expect(Math.abs(out.y - 0.75) < 0.005).toBe(true);
  });
});

describe('getPathSegmentTangentAtParameter', () => {
  it('returns false for out of range segment index', () => {
    const path = createPath('nonZero');
    let out = createVector2(0.0, 0.0);
    const result = getPathSegmentTangentAtParameter(path, 0, 0.5, out);
    expect(!result).toBe(true);
  });
  it('returns the tangent direction for a horizontal line', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const result = getPathSegmentTangentAtParameter(path, 0, 0.5, out);
    expect(result).toBe(true);
    expect(out.x > 0.0).toBe(true);
    expect(Math.abs(out.y) < 0.005).toBe(true);
  });
  it('returns a non zero tangent at t zero for a cubic bezier', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathCubicCurveTo(path, 1.0, 3.0, 2.0, 3.0, 3.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const result = getPathSegmentTangentAtParameter(path, 0, 0.0, out);
    expect(result).toBe(true);
    expect(Math.abs(out.x - 3.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 9.0) < 0.005).toBe(true);
  });
});

describe('getQuadraticBezierCurvature', () => {
  it('returns zero for a straight quadratic', () => {
    const c = getQuadraticBezierCurvature(0.0, 0.0, 5.0, 0.0, 10.0, 0.0, 0.5);
    expect(c).toEqual(0.0);
  });
  it('returns nonzero for a curved quadratic', () => {
    const k = getQuadraticBezierCurvature(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 0.5);
    expect(k !== 0.0).toBe(true);
  });
  it('returns consistent sign for a right turning curve', () => {
    const k = getQuadraticBezierCurvature(0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 0.5);
    expect(k < 0.0).toBe(true);
  });
});

describe('getQuadraticBezierPoint', () => {
  it('returns midpoint at t half for a known quadratic curve', () => {
    let out = createVector2(0.0, 0.0);
    getQuadraticBezierPoint(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 0.5, out);
    expect(Math.abs(out.x - 50.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 50.0) < 0.005).toBe(true);
  });
  it('returns start at t zero', () => {
    let out = createVector2(0.0, 0.0);
    getQuadraticBezierPoint(0.0, 1.0, 5.0, 5.0, 10.0, 1.0, 0.0, out);
    expect(Math.abs(out.x - 0.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 1.0) < 0.005).toBe(true);
  });
  it('returns end at t one', () => {
    let out = createVector2(0.0, 0.0);
    getQuadraticBezierPoint(0.0, 1.0, 5.0, 5.0, 10.0, 1.0, 1.0, out);
    expect(Math.abs(out.x - 10.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 1.0) < 0.005).toBe(true);
  });
});

describe('getQuadraticBezierTangent', () => {
  it('returns the end tangent direction at t one', () => {
    let out = createVector2(0.0, 0.0);
    getQuadraticBezierTangent(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 1.0, out);
    expect(Math.abs(out.x - 100.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - -200.0) < 0.005).toBe(true);
  });
  it('returns the midpoint tangent at t half', () => {
    let out = createVector2(0.0, 0.0);
    getQuadraticBezierTangent(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 0.5, out);
    expect(Math.abs(out.x - 100.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 0.0) < 0.005).toBe(true);
  });
  it('returns the start tangent direction at t zero', () => {
    let out = createVector2(0.0, 0.0);
    getQuadraticBezierTangent(0.0, 0.0, 4.0, 0.0, 8.0, 0.0, 0.0, out);
    expect(Math.abs(out.x - 8.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 0.0) < 0.005).toBe(true);
  });
});
