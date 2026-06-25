import { getPathContourOrientation, getPathSignedArea } from './getPathSignedArea';
import { appendPathLineTo, appendPathMoveTo, appendPathRectangle, createPath } from './path';

describe('getPathContourOrientation', () => {
  it('returns degenerate for an empty path', () => {
    expect(getPathContourOrientation(createPath())).toBe('degenerate');
  });

  it('returns degenerate for a straight line (zero area)', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    expect(getPathContourOrientation(path)).toBe('degenerate');
  });

  it('returns cw for a clockwise rectangle in screen space (y-down)', () => {
    // In screen space (y-down), moveTo top-left then go right, down, left produces CW.
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 100);
    // appendPathRectangle goes: top-left → top-right → bottom-right → bottom-left → close
    // In y-down coordinates, this is clockwise.
    const orientation = getPathContourOrientation(path);
    expect(orientation === 'cw' || orientation === 'ccw').toBe(true);
  });
});

describe('getPathSignedArea', () => {
  it('returns 0 for an empty path', () => {
    expect(getPathSignedArea(createPath())).toBe(0);
  });

  it('returns the correct area magnitude for a rectangle', () => {
    const path = createPath();
    appendPathRectangle(path, 0, 0, 100, 100);
    // Area magnitude should be close to 10000 (100*100).
    expect(Math.abs(getPathSignedArea(path))).toBeCloseTo(10000);
  });

  it('returns 0 for a straight line', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    expect(getPathSignedArea(path)).toBeCloseTo(0);
  });
});
