import { getPathBounds } from './getPathBounds';
import {
  appendPathCubicCurveTo,
  appendPathCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  createPath,
} from './path';

describe('getPathBounds', () => {
  it('returns false and a zero rect for an empty path', () => {
    const path = createPath();
    const out = { x: 1, y: 2, width: 3, height: 4 };
    const result = getPathBounds(path, out);
    expect(result).toBe(false);
    expect(out).toStrictEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('returns the exact bounds of a rectangle', () => {
    const path = createPath();
    appendPathRectangle(path, 10, 20, 100, 50);
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const result = getPathBounds(path, out);
    expect(result).toBe(true);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(20);
    expect(out.width).toBeCloseTo(100);
    expect(out.height).toBeCloseTo(50);
  });

  it('includes the start point of a single MOVE_TO', () => {
    const path = createPath();
    appendPathMoveTo(path, 5, 7);
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getPathBounds(path, out);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(7);
    expect(out.width).toBeCloseTo(0);
    expect(out.height).toBeCloseTo(0);
  });

  it('expands past control points for a quadratic curve', () => {
    // A quadratic arc: start=(0,0) control=(50,100) end=(100,0)
    // The true Y maximum is at t=0.5: B(0.5)=(25+0.5*50, 50+…) = (50, 50) — 50 not 100.
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 50, 100, 100, 0);
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getPathBounds(path, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    // True Y max for this curve = 50 (at t=0.5), not 100 (the control point)
    expect(out.height).toBeCloseTo(50);
    expect(out.width).toBeCloseTo(100);
  });

  it('expands past control points for a cubic curve', () => {
    // A symmetric cubic: start=(0,0) c1=(0,100) c2=(100,100) end=(100,0).
    // The true Y extremum is somewhere between 0 and 100.
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCubicCurveTo(path, 0, 100, 100, 100, 100, 0);
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getPathBounds(path, out);
    // The maximum y should be ~75 (the bezier peak for this configuration)
    expect(out.y).toBeCloseTo(0);
    expect(out.height).toBeGreaterThan(70);
    expect(out.height).toBeLessThan(100);
    expect(out.width).toBeCloseTo(100);
  });

  it('handles a MOVE_TO + LINE_TO spanning multiple quadrants', () => {
    const path = createPath();
    appendPathMoveTo(path, -50, -30);
    appendPathLineTo(path, 80, 60);
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getPathBounds(path, out);
    expect(out.x).toBeCloseTo(-50);
    expect(out.y).toBeCloseTo(-30);
    expect(out.width).toBeCloseTo(130);
    expect(out.height).toBeCloseTo(90);
  });
});
