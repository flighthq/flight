import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { flattenPath } from './flattenPath';
import { appendPathClose, appendPathCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('flattenPath', () => {
  it('flattens a straight line to its two endpoints', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    expect(flattenPath(path)).toStrictEqual([[0, 0, 100, 0]]);
  });

  it('produces one contour per subpath', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathMoveTo(path, 0, 10);
    appendPathLineTo(path, 10, 10);
    const contours = flattenPath(path);
    expect(contours).toStrictEqual([
      [0, 0, 10, 0],
      [0, 10, 10, 10],
    ]);
  });

  it('collapses a quadratic whose control lies on the chord to just the endpoint', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 50, 0, 100, 0);
    expect(flattenPath(path)).toStrictEqual([[0, 0, 100, 0]]);
  });

  it('subdivides a genuinely curved quadratic, keeping the endpoints', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 50, 50, 100, 0);
    const contour = flattenPath(path)[0];
    expect(contour.length).toBeGreaterThan(4); // more than just start + end
    expect(contour[0]).toBe(0);
    expect(contour[1]).toBe(0);
    expect(contour[contour.length - 2]).toBe(100);
    expect(contour[contour.length - 1]).toBe(0);
  });

  it('reads the second coordinate pair for WIDE_ verbs', () => {
    const path: Path = {
      commands: [PathCommand.WIDE_MOVE_TO, PathCommand.WIDE_LINE_TO],
      data: [0, 0, 5, 6, 0, 0, 7, 8],
      winding: 'nonZero',
    };
    expect(flattenPath(path)).toStrictEqual([[5, 6, 7, 8]]);
  });

  it('emits fewer points at a coarser tolerance', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 50, 50, 100, 0);
    const fine = flattenPath(path, 0.1)[0].length;
    const coarse = flattenPath(path, 50)[0].length;
    expect(coarse).toBeLessThan(fine);
  });

  it('appends the start point when a CLOSE verb is present and position differs', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 100, 100);
    appendPathClose(path);
    const contour = flattenPath(path)[0];
    // Should end at the start point (0,0)
    expect(contour[contour.length - 2]).toBe(0);
    expect(contour[contour.length - 1]).toBe(0);
  });

  it('does not duplicate the start point when CLOSE is at the same position', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 100, 0);
    appendPathLineTo(path, 0, 0); // already at start
    appendPathClose(path);
    const contour = flattenPath(path)[0];
    // Length should be 6: (0,0), (100,0), (0,0) — no duplicate close point
    expect(contour.length).toBe(6);
  });
});
