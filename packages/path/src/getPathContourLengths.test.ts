import { getPathContourLengths } from './getPathContourLengths';
import { getPathLength } from './getPathLength';
import { appendPathClose, appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path';

describe('getPathContourLengths', () => {
  it('returns an empty array for an empty path', () => {
    expect(getPathContourLengths(createPath())).toStrictEqual([]);
  });

  it('returns a single length matching getPathLength for a single contour', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 50);
    const lengths = getPathContourLengths(path);
    expect(lengths).toHaveLength(1);
    expect(lengths[0]).toBeCloseTo(getPathLength(path));
  });

  it('returns per-contour lengths for a multi-contour path', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 30, 0);
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 0, 40);
    const lengths = getPathContourLengths(path);
    expect(lengths).toHaveLength(2);
    expect(lengths[0]).toBeCloseTo(30);
    expect(lengths[1]).toBeCloseTo(40);
  });

  it('accounts for closed contours', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 50);
    const lengths = getPathContourLengths(path);
    expect(lengths).toHaveLength(1);
    expect(lengths[0]).toBeCloseTo(300);
  });

  it('sums per-contour lengths to match total getPathLength', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 0, 20);
    appendPathClose(path);
    const lengths = getPathContourLengths(path);
    const sum = lengths.reduce((s, l) => s + l, 0);
    expect(sum).toBeCloseTo(getPathLength(path));
  });
});
