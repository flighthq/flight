import { PathCommand } from '@flighthq/types';

import { cleanPath } from './cleanPath';
import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('cleanPath', () => {
  it('removes consecutive duplicate points', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 0);
    appendPathLineTo(source, 10, 0);
    appendPathLineTo(source, 10, 10);
    const out = createPath();
    cleanPath(source, 0.001, out);
    expect(out.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
    expect(out.data).toStrictEqual([0, 0, 10, 0, 10, 10]);
  });

  it('collapses a near-collinear run to its endpoints', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 25, 0.1);
    appendPathLineTo(source, 50, -0.1);
    appendPathLineTo(source, 75, 0.05);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    cleanPath(source, 1, out);
    expect(out.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(out.data).toStrictEqual([0, 0, 100, 0]);
  });

  it('removes a zero-area out-and-back spike', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 0);
    appendPathLineTo(source, 10, 10);
    appendPathLineTo(source, 5, 10);
    appendPathLineTo(source, 5, 15);
    appendPathLineTo(source, 5, 10);
    appendPathLineTo(source, 0, 10);
    appendPathClose(source);
    const out = createPath();
    cleanPath(source, 0.001, out);
    // The spike (5,15) and the now-collinear (5,10) points on the top edge collapse away, leaving the
    // clean unit square outline.
    expect(out.commands).toStrictEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    expect(out.data).toStrictEqual([0, 0, 10, 0, 10, 10, 0, 10]);
  });

  it('keeps a non-collinear spike as a genuine feature', () => {
    // A triangular spike whose tip (5, 20) sits 10 units off the y=10 top edge, between distinct,
    // non-coincident neighbors (6, 10) and (4, 10). This is a real protrusion, not vertex noise, so
    // cleanPath (a within-tolerance dedup, not an angle-based needle remover) preserves every vertex.
    // Removing acute needles is a separate simplification concern, deliberately out of cleanPath's scope.
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 0);
    appendPathLineTo(source, 10, 10);
    appendPathLineTo(source, 6, 10);
    appendPathLineTo(source, 5, 20);
    appendPathLineTo(source, 4, 10);
    appendPathLineTo(source, 0, 10);
    appendPathClose(source);
    const out = createPath();
    cleanPath(source, 0.001, out);
    expect(out.data).toStrictEqual([0, 0, 10, 0, 10, 10, 6, 10, 5, 20, 4, 10, 0, 10]);
  });

  it('keeps a vertex whose deviation just exceeds tolerance', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 1.5);
    appendPathLineTo(source, 20, 0);
    const out = createPath();
    cleanPath(source, 1, out);
    // Perpendicular deviation of (10, 1.5) is 1.5 > tolerance 1, so it is retained.
    expect(out.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
    expect(out.data).toStrictEqual([0, 0, 10, 1.5, 20, 0]);
  });

  it('removes a vertex whose deviation is within tolerance', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 0.5);
    appendPathLineTo(source, 20, 0);
    const out = createPath();
    cleanPath(source, 1, out);
    // Perpendicular deviation of (10, 0.5) is 0.5 < tolerance 1, so it is dropped.
    expect(out.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(out.data).toStrictEqual([0, 0, 20, 0]);
  });

  it('keeps a closed contour closed', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 0);
    appendPathLineTo(source, 10, 10);
    appendPathLineTo(source, 0, 10);
    appendPathClose(source);
    const out = createPath();
    cleanPath(source, 0.001, out);
    expect(out.commands).toStrictEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    expect(out.data).toStrictEqual([0, 0, 10, 0, 10, 10, 0, 10]);
  });

  it('cleans in place when out is the same object as source', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 5, 0);
    appendPathLineTo(path, 5, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 10, 10);
    appendPathLineTo(path, 0, 10);
    appendPathClose(path);
    cleanPath(path, 0.001, path);
    // The duplicate and collinear points on the bottom edge collapse; the clean square remains.
    expect(path.commands).toStrictEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    expect(path.data).toStrictEqual([0, 0, 10, 0, 10, 10, 0, 10]);
  });
});
