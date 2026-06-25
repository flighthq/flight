import { getPathLength } from './getPathLength';
import { appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path';

describe('getPathLength', () => {
  it('returns 0 for an empty path', () => {
    expect(getPathLength(createPath())).toBe(0);
  });

  it('returns the correct length of a straight line', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 30, 40);
    // Euclidean: sqrt(30^2 + 40^2) = 50
    expect(getPathLength(path)).toBeCloseTo(50);
  });

  it('returns the perimeter of a rectangle (excluding the closing segment)', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 50);
    // Perimeter of 100x50 rectangle: 2*(100+50)=300. The flattenPath closes with a segment back
    // to the start, so the total is 300.
    expect(getPathLength(path)).toBeCloseTo(300);
  });

  it('sums lengths across multiple subpaths', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0); // length 10
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 0, 5); // length 5
    expect(getPathLength(path)).toBeCloseTo(15);
  });
});
