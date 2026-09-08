import { getPathCurvatureAtDistance } from './getPathCurvatureAtDistance';
import { appendPathCircle, appendPathCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('getPathCurvatureAtDistance', () => {
  it('returns zero for an empty path', () => {
    expect(getPathCurvatureAtDistance(createPath(), 0)).toBe(0);
  });

  it('returns zero for a straight line', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    expect(getPathCurvatureAtDistance(path, 50)).toBe(0);
  });

  it('returns nonzero curvature on a curved path', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 50, 100, 100, 0);
    const k = getPathCurvatureAtDistance(path, 50);
    expect(k).not.toBe(0);
  });

  it('returns approximately 1/r for a circle of known radius', () => {
    const r = 50;
    const path = createPath();
    appendPathCircle(path, 0, 0, r);
    const circumference = 2 * Math.PI * r;
    const k = getPathCurvatureAtDistance(path, circumference / 4);
    expect(Math.abs(k)).toBeCloseTo(1 / r, 1);
  });

  it('clamps at the end of the path for distances beyond length', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 50, 100, 100, 0);
    const kEnd = getPathCurvatureAtDistance(path, 9999);
    expect(typeof kEnd).toBe('number');
  });
});
