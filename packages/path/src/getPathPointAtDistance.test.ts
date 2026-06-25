import { getPathPointAtDistance, getPathPositionAtDistance, getPathTangentAtDistance } from './getPathPointAtDistance';
import { appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('getPathPointAtDistance', () => {
  it('returns false for an empty path', () => {
    const out = { x: 0, y: 0 };
    expect(getPathPointAtDistance(createPath(), 0, out)).toBe(false);
  });

  it('returns the start point at distance 0', () => {
    const path = createPath();
    appendPathMoveTo(path, 5, 10);
    appendPathLineTo(path, 15, 10);
    const out = { x: 0, y: 0 };
    getPathPointAtDistance(path, 0, out);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(10);
  });

  it('interpolates to the midpoint of a segment', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const out = { x: 0, y: 0 };
    getPathPointAtDistance(path, 50, out);
    expect(out.x).toBeCloseTo(50);
    expect(out.y).toBeCloseTo(0);
  });

  it('clamps to the end when distance exceeds total length', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    const out = { x: 0, y: 0 };
    getPathPointAtDistance(path, 1000, out);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(0);
  });

  it('clamps to start when distance is negative', () => {
    const path = createPath();
    appendPathMoveTo(path, 5, 5);
    appendPathLineTo(path, 15, 5);
    const out = { x: 0, y: 0 };
    getPathPointAtDistance(path, -10, out);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(5);
  });
});

describe('getPathPositionAtDistance', () => {
  it('returns both point and tangent simultaneously', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const pt = { x: 0, y: 0 };
    const tan = { x: 0, y: 0 };
    const result = getPathPositionAtDistance(path, 50, pt, tan);
    expect(result).toBe(true);
    expect(pt.x).toBeCloseTo(50);
    expect(pt.y).toBeCloseTo(0);
    expect(tan.x).toBeCloseTo(1);
    expect(tan.y).toBeCloseTo(0);
  });
});

describe('getPathTangentAtDistance', () => {
  it('returns (1,0) as default tangent for empty path', () => {
    const out = { x: 0, y: 0 };
    getPathTangentAtDistance(createPath(), 0, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
  });

  it('returns a unit tangent along a horizontal line', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const out = { x: 0, y: 0 };
    getPathTangentAtDistance(path, 50, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
  });

  it('returns a unit tangent along a vertical line', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 0, 100);
    const out = { x: 0, y: 0 };
    getPathTangentAtDistance(path, 50, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
  });
});
