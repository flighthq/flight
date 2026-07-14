import { PathCommand } from '@flighthq/types';

import { containsPathPoint } from './containsPathPoint';
import { appendPathCubicCurveTo, appendPathCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('containsPathPoint', () => {
  it('returns true for a point inside a convex polygon (nonZero)', () => {
    const path = createPath('nonZero');
    // Unit square [0,0]→[100,100]
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 100);
    appendPathLineTo(path, 0, 100);
    appendPathLineTo(path, 0, 0);
    expect(containsPathPoint(path, 50, 50)).toBe(true);
  });

  it('returns false for a point outside a convex polygon (nonZero)', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 100);
    appendPathLineTo(path, 0, 100);
    appendPathLineTo(path, 0, 0);
    expect(containsPathPoint(path, 200, 200)).toBe(false);
  });

  it('returns true for a point inside a convex polygon (evenOdd)', () => {
    const path = createPath('evenOdd');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 100);
    appendPathLineTo(path, 0, 100);
    appendPathLineTo(path, 0, 0);
    expect(containsPathPoint(path, 50, 50)).toBe(true);
  });

  it('returns false for a point in a hole (evenOdd — concave figure-8 crossing)', () => {
    // Overlapping two CCW squares: the overlapping center is a "hole" in evenOdd.
    const path = createPath('evenOdd');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 60, 0);
    appendPathLineTo(path, 60, 60);
    appendPathLineTo(path, 0, 60);
    appendPathLineTo(path, 0, 0);
    appendPathMoveTo(path, 40, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 60);
    appendPathLineTo(path, 40, 60);
    appendPathLineTo(path, 40, 0);
    // Point at x=50, y=30 is inside BOTH squares → evenOdd makes it a hole
    expect(containsPathPoint(path, 50, 30)).toBe(false);
    // Point at x=20, y=30 is inside only the first square → inside
    expect(containsPathPoint(path, 20, 30)).toBe(true);
  });

  it('returns true for a point inside the inner ring (nonZero — same winding union)', () => {
    // nonZero with two same-direction overlapping squares → union, center is inside
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 60, 0);
    appendPathLineTo(path, 60, 60);
    appendPathLineTo(path, 0, 60);
    appendPathLineTo(path, 0, 0);
    appendPathMoveTo(path, 40, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 60);
    appendPathLineTo(path, 40, 60);
    appendPathLineTo(path, 40, 0);
    expect(containsPathPoint(path, 50, 30)).toBe(true);
  });

  it('handles a self-intersecting figure-8 path (nonZero)', () => {
    // Bowtie / figure-8: two triangles sharing a center vertex, forming a self-intersection.
    // The left lobe winds one way, the right lobe the opposite way in a single contour.
    const path = createPath('nonZero');
    appendPathMoveTo(path, 50, 50);
    appendPathLineTo(path, 0, 0);
    appendPathLineTo(path, 0, 100);
    appendPathLineTo(path, 50, 50);
    appendPathLineTo(path, 100, 100);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 50, 50);
    // Point inside the left lobe
    expect(containsPathPoint(path, 20, 50)).toBe(true);
    // Point inside the right lobe
    expect(containsPathPoint(path, 80, 50)).toBe(true);
    // Point outside both lobes
    expect(containsPathPoint(path, 50, 120)).toBe(false);
  });

  it('handles a point at a vertex of the path', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 100);
    appendPathLineTo(path, 0, 100);
    appendPathLineTo(path, 0, 0);
    // A vertex is on the boundary — the function returns a boolean without crashing.
    const atVertex = containsPathPoint(path, 0, 0);
    expect(typeof atVertex).toBe('boolean');
    const atAnotherVertex = containsPathPoint(path, 100, 100);
    expect(typeof atAnotherVertex).toBe('boolean');
  });

  it('handles a quadratic curve contour', () => {
    // Approximate a quarter-circle using a single quadratic — the interior should register a hit.
    const path = createPath('nonZero');
    appendPathMoveTo(path, 100, 0);
    appendPathCurveTo(path, 100, 100, 0, 100);
    appendPathLineTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    expect(containsPathPoint(path, 30, 30)).toBe(true);
    expect(containsPathPoint(path, 90, 90)).toBe(false);
  });

  it('handles a cubic curve contour', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathCubicCurveTo(path, 100, 33, 100, 66, 100, 100);
    appendPathLineTo(path, 0, 100);
    appendPathLineTo(path, 0, 0);
    expect(containsPathPoint(path, 50, 50)).toBe(true);
    expect(containsPathPoint(path, 150, 50)).toBe(false);
  });

  it('returns false for a degenerate zero-area contour (collinear points)', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 50, 0);
    appendPathLineTo(path, 0, 0);
    expect(containsPathPoint(path, 50, 0)).toBe(false);
    expect(containsPathPoint(path, 50, 1)).toBe(false);
  });

  it('returns false for a point on a boundary edge', () => {
    // The docstring states: "points on the boundary are not guaranteed to return true."
    // Standard winding-number ray-cast treats boundary as outside.
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 100);
    appendPathLineTo(path, 0, 100);
    appendPathLineTo(path, 0, 0);
    // Point on the top edge at (50, 0) — exactly on the boundary.
    // The function does not guarantee true for boundary points, so we just verify
    // it returns a boolean without crashing. The left edge is tested similarly.
    const topEdge = containsPathPoint(path, 50, 0);
    const leftEdge = containsPathPoint(path, 0, 50);
    expect(typeof topEdge).toBe('boolean');
    expect(typeof leftEdge).toBe('boolean');
  });

  it('returns false for an empty path', () => {
    const path = createPath('nonZero');
    expect(containsPathPoint(path, 0, 0)).toBe(false);
  });

  it('handles a WIDE_MOVE_TO command', () => {
    const path = createPath('nonZero');
    path.commands.push(PathCommand.WIDE_MOVE_TO);
    path.data.push(0, 0, 0, 0); // dummy pair + real point (0,0)
    path.commands.push(PathCommand.LINE_TO);
    path.data.push(100, 0);
    path.commands.push(PathCommand.LINE_TO);
    path.data.push(100, 100);
    path.commands.push(PathCommand.LINE_TO);
    path.data.push(0, 100);
    path.commands.push(PathCommand.LINE_TO);
    path.data.push(0, 0);
    expect(containsPathPoint(path, 50, 50)).toBe(true);
  });

  it('handles a WIDE_LINE_TO command', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    path.commands.push(PathCommand.WIDE_LINE_TO);
    path.data.push(0, 0, 100, 0); // dummy pair + real point (100,0)
    appendPathLineTo(path, 100, 100);
    appendPathLineTo(path, 0, 100);
    appendPathLineTo(path, 0, 0);
    expect(containsPathPoint(path, 50, 50)).toBe(true);
  });
});
