import { getPathNearestPoint } from './getPathNearestPoint';
import { appendPathCircle, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('getPathNearestPoint', () => {
  it('returns -1 for an empty path', () => {
    const out = { x: 0, y: 0 };
    expect(getPathNearestPoint(createPath(), 5, 5, out)).toBe(-1);
  });

  it('returns 0 for a point on the path', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const out = { x: 0, y: 0 };
    const dist = getPathNearestPoint(path, 50, 0, out);
    expect(dist).toBeCloseTo(0);
    expect(out.x).toBeCloseTo(50);
    expect(out.y).toBeCloseTo(0);
  });

  it('returns the perpendicular distance for a point off the path', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    const out = { x: 0, y: 0 };
    const dist = getPathNearestPoint(path, 50, 30, out);
    expect(dist).toBeCloseTo(30);
    expect(out.x).toBeCloseTo(50);
    expect(out.y).toBeCloseTo(0);
  });

  it('picks the closest contour in a multi-contour path', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathMoveTo(path, 0, 10);
    appendPathLineTo(path, 100, 10);
    const out = { x: 0, y: 0 };
    const dist = getPathNearestPoint(path, 50, 8, out);
    expect(dist).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(10);
  });

  it('clamps to an endpoint when the projection falls outside the segment', () => {
    const path = createPath();
    appendPathMoveTo(path, 10, 0);
    appendPathLineTo(path, 90, 0);
    const out = { x: 0, y: 0 };
    const dist = getPathNearestPoint(path, 0, 0, out);
    expect(dist).toBeCloseTo(10);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(0);
  });

  it('works with curved paths', () => {
    const path = createPath();
    appendPathCircle(path, 0, 0, 50);
    const out = { x: 0, y: 0 };
    const dist = getPathNearestPoint(path, 100, 0, out);
    expect(dist).toBeCloseTo(50, 0);
    expect(out.x).toBeCloseTo(50, 0);
    expect(out.y).toBeCloseTo(0, 0);
  });
});
