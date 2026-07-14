import {
  getCubicBezierPoint,
  getCubicBezierTangent,
  getPathSegmentPointAtParameter,
  getPathSegmentTangentAtParameter,
  getQuadraticBezierPoint,
  getQuadraticBezierTangent,
} from './getPathSegmentAtParameter';
import { appendPathCubicCurveTo, appendPathCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('getCubicBezierPoint', () => {
  it('returns the start point at t=0', () => {
    const out = { x: 0, y: 0 };
    getCubicBezierPoint(1, 2, 3, 4, 5, 6, 7, 8, 0, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(2);
  });

  it('returns the end point at t=1', () => {
    const out = { x: 0, y: 0 };
    getCubicBezierPoint(1, 2, 3, 4, 5, 6, 7, 8, 1, out);
    expect(out.x).toBeCloseTo(7);
    expect(out.y).toBeCloseTo(8);
  });

  it('interpolates a straight cubic at midpoint', () => {
    // Straight line P0=(0,0), C1=(1,0), C2=(2,0), P1=(3,0)
    const out = { x: 0, y: 0 };
    getCubicBezierPoint(0, 0, 1, 0, 2, 0, 3, 0, 0.5, out);
    expect(out.x).toBeCloseTo(1.5);
    expect(out.y).toBeCloseTo(0);
  });
});

describe('getCubicBezierTangent', () => {
  it('returns the forward tangent at t=0 (C1 - P0)', () => {
    const out = { x: 0, y: 0 };
    getCubicBezierTangent(0, 0, 3, 0, 6, 0, 9, 0, 0, out);
    // B'(0) = 3*(C1-P0) = 3*(3,0) = (9,0)
    expect(out.x).toBeCloseTo(9);
    expect(out.y).toBeCloseTo(0);
  });

  it('returns the backward tangent at t=1 (P1 - C2)', () => {
    const out = { x: 0, y: 0 };
    getCubicBezierTangent(0, 0, 0, 0, 6, 0, 9, 0, 1, out);
    // B'(1) = 3*(P1-C2) = 3*(9-6,0) = (9,0)
    expect(out.x).toBeCloseTo(9);
    expect(out.y).toBeCloseTo(0);
  });
});

describe('getPathSegmentPointAtParameter', () => {
  it('returns false for out-of-range segment index', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 1, 0);
    const out = { x: 0, y: 0 };
    expect(getPathSegmentPointAtParameter(path, 5, 0.5, out)).toBe(false);
  });

  it('evaluates midpoint of a line segment', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    const out = { x: 0, y: 0 };
    expect(getPathSegmentPointAtParameter(path, 0, 0.5, out)).toBe(true);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(0);
  });

  it('evaluates start and end of a line segment', () => {
    const path = createPath();
    appendPathMoveTo(path, 2, 3);
    appendPathLineTo(path, 8, 9);
    const start = { x: 0, y: 0 };
    const end = { x: 0, y: 0 };
    getPathSegmentPointAtParameter(path, 0, 0, start);
    getPathSegmentPointAtParameter(path, 0, 1, end);
    expect(start.x).toBeCloseTo(2);
    expect(start.y).toBeCloseTo(3);
    expect(end.x).toBeCloseTo(8);
    expect(end.y).toBeCloseTo(9);
  });

  it('selects the correct segment by index in a multi-segment path', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0); // segment 0
    appendPathLineTo(path, 10, 10); // segment 1
    appendPathLineTo(path, 0, 10); // segment 2
    const out = { x: 0, y: 0 };
    getPathSegmentPointAtParameter(path, 1, 0.5, out);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(5);
  });

  it('evaluates midpoint of a quadratic bezier', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 1, 2, 2, 0); // parabola-like
    const out = { x: 0, y: 0 };
    expect(getPathSegmentPointAtParameter(path, 0, 0.5, out)).toBe(true);
    // B(0.5) = 0.25*(0,0) + 2*0.5*0.5*(1,2) + 0.25*(2,0) = (0,0)*0.25 + (0.5,1) + (0.5,0) = (1, 1)
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(1);
  });

  it('evaluates midpoint of a cubic bezier', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCubicCurveTo(path, 0, 1, 1, 1, 1, 0); // S-curve style
    const out = { x: 0, y: 0 };
    expect(getPathSegmentPointAtParameter(path, 0, 0.5, out)).toBe(true);
    // B(0.5) for symmetric S-curve from (0,0) ctrl (0,1),(1,1) to (1,0):
    // = 0.125*(0,0) + 3*0.25*0.5*(0,1) + 3*0.5*0.25*(1,1) + 0.125*(1,0)
    // = (0,0) + (0, 0.375) + (0.375, 0.375) + (0.125, 0) = (0.5, 0.75)
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(0.75);
  });
});

describe('getPathSegmentTangentAtParameter', () => {
  it('returns false for out-of-range segment index', () => {
    const path = createPath();
    const out = { x: 0, y: 0 };
    expect(getPathSegmentTangentAtParameter(path, 0, 0.5, out)).toBe(false);
  });

  it('returns the tangent direction for a horizontal line', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    const out = { x: 0, y: 0 };
    expect(getPathSegmentTangentAtParameter(path, 0, 0.5, out)).toBe(true);
    // Direction (10,0); not normalized.
    expect(out.x).toBeGreaterThan(0);
    expect(out.y).toBeCloseTo(0);
  });

  it('returns a non-zero tangent at t=0 for a cubic bezier', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCubicCurveTo(path, 1, 3, 2, 3, 3, 0);
    const out = { x: 0, y: 0 };
    expect(getPathSegmentTangentAtParameter(path, 0, 0, out)).toBe(true);
    // At t=0: B'(0) = 3*(C1-P0) = 3*(1,3) = (3,9)
    expect(out.x).toBeCloseTo(3);
    expect(out.y).toBeCloseTo(9);
  });
});

describe('getQuadraticBezierPoint', () => {
  it('returns midpoint at t=0.5 for a known quadratic curve', () => {
    // P0=(0,0), C=(50,100), P1=(100,0)
    // B(0.5) = 0.25*(0,0) + 2*0.25*(50,100) + 0.25*(100,0) = (50, 50)
    const out = { x: 0, y: 0 };
    getQuadraticBezierPoint(0, 0, 50, 100, 100, 0, 0.5, out);
    expect(out.x).toBeCloseTo(50);
    expect(out.y).toBeCloseTo(50);
  });

  it('returns start at t=0', () => {
    const out = { x: 0, y: 0 };
    getQuadraticBezierPoint(0, 1, 5, 5, 10, 1, 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
  });

  it('returns end at t=1', () => {
    const out = { x: 0, y: 0 };
    getQuadraticBezierPoint(0, 1, 5, 5, 10, 1, 1, out);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(1);
  });
});

describe('getQuadraticBezierTangent', () => {
  it('returns the end tangent direction at t=1', () => {
    const out = { x: 0, y: 0 };
    // P0=(0,0), C=(50,100), P1=(100,0)
    // B'(1) = 2*(P1-C) = 2*(100-50, 0-100) = (100, -200)
    getQuadraticBezierTangent(0, 0, 50, 100, 100, 0, 1, out);
    expect(out.x).toBeCloseTo(100);
    expect(out.y).toBeCloseTo(-200);
  });

  it('returns the midpoint tangent at t=0.5', () => {
    const out = { x: 0, y: 0 };
    // P0=(0,0), C=(50,100), P1=(100,0)
    // B'(0.5) = 2*(0.5*(C-P0) + 0.5*(P1-C)) = 2*(0.5*(50,100) + 0.5*(50,-100))
    //         = 2*((25,50) + (25,-50)) = 2*(50,0) = (100, 0)
    getQuadraticBezierTangent(0, 0, 50, 100, 100, 0, 0.5, out);
    expect(out.x).toBeCloseTo(100);
    expect(out.y).toBeCloseTo(0);
  });

  it('returns the start tangent direction at t=0', () => {
    const out = { x: 0, y: 0 };
    // P0=(0,0), C=(4,0), P1=(8,0) — straight horizontal
    getQuadraticBezierTangent(0, 0, 4, 0, 8, 0, 0, out);
    // B'(0) = 2*(C-P0) = 2*(4,0) = (8,0)
    expect(out.x).toBeCloseTo(8);
    expect(out.y).toBeCloseTo(0);
  });
});
