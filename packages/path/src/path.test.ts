import { PathCommand } from '@flighthq/types';

import {
  appendPathArc,
  appendPathArcTo,
  appendPathCircle,
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathCurveTo,
  appendPathEllipse,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathPolygon,
  appendPathPolyline,
  appendPathRectangle,
  appendPathRoundRectangle,
  createPath,
  getPathLastPoint,
} from './path';

describe('appendPathArc', () => {
  it('produces a MOVE_TO and at least one CUBIC_CURVE_TO for a non-zero arc', () => {
    const path = createPath();
    appendPathArc(path, 0, 0, 50, 0, Math.PI / 2);
    expect(path.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(path.commands).toContain(PathCommand.CUBIC_CURVE_TO);
  });

  it('starts at the correct point on the circle (angle=0 → rightmost)', () => {
    const path = createPath();
    appendPathArc(path, 10, 20, 30, 0, Math.PI / 2);
    // MOVE_TO at (cx + radius*cos(0), cy + radius*sin(0)) = (40, 20)
    expect(path.data[0]).toBeCloseTo(40);
    expect(path.data[1]).toBeCloseTo(20);
  });

  it('ends at the correct point for a quarter circle', () => {
    const path = createPath();
    appendPathArc(path, 0, 0, 100, 0, Math.PI / 2);
    // The last CUBIC_CURVE_TO anchor should be near (cos(π/2)*100, sin(π/2)*100) = (0, 100)
    const data = path.data;
    expect(data[data.length - 2]).toBeCloseTo(0, 1);
    expect(data[data.length - 1]).toBeCloseTo(100, 1);
  });

  it('supports anticlockwise arcs', () => {
    const pathCW = createPath();
    appendPathArc(pathCW, 0, 0, 50, 0, Math.PI, false);
    const pathCCW = createPath();
    appendPathArc(pathCCW, 0, 0, 50, 0, Math.PI, true);
    // Both arcs should contain cubic curves but the y-extremes differ.
    expect(pathCW.commands).toContain(PathCommand.CUBIC_CURVE_TO);
    expect(pathCCW.commands).toContain(PathCommand.CUBIC_CURVE_TO);
    // CW goes through negative y; CCW goes through positive y (in screen coords).
    const cwMaxY = Math.max(...pathCW.data.filter((_, i) => i % 2 === 1));
    const ccwMinY = Math.min(...pathCCW.data.filter((_, i) => i % 2 === 1));
    expect(cwMaxY).toBeGreaterThan(0);
    expect(ccwMinY).toBeLessThan(0);
  });

  it('connectToCurrent=true appends a LINE_TO instead of MOVE_TO', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathArc(path, 100, 0, 50, Math.PI, 0, false, true);
    expect(path.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(path.commands[1]).toBe(PathCommand.LINE_TO);
  });

  it('appends nothing for zero radius', () => {
    const path = createPath();
    appendPathArc(path, 0, 0, 0, 0, Math.PI);
    expect(path.commands.length).toBe(0);
  });
});

describe('appendPathArcTo', () => {
  it('appends a LINE_TO when radiusX is 0', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathArcTo(path, 0, 10, 0, false, false, 50, 50);
    expect(path.commands[1]).toBe(PathCommand.LINE_TO);
    expect(path.data[path.data.length - 2]).toBeCloseTo(50);
    expect(path.data[path.data.length - 1]).toBeCloseTo(50);
  });

  it('does nothing when start equals end', () => {
    const path = createPath();
    appendPathMoveTo(path, 10, 10);
    const beforeLen = path.commands.length;
    appendPathArcTo(path, 50, 50, 0, false, false, 10, 10);
    expect(path.commands.length).toBe(beforeLen);
  });

  it('produces cubic curves for a non-degenerate arc', () => {
    const path = createPath();
    appendPathMoveTo(path, 100, 0);
    // Full circle: from (100,0) back to (100,0) via a large arc
    appendPathArcTo(path, 50, 50, 0, true, false, 100, 1);
    expect(path.commands).toContain(PathCommand.CUBIC_CURVE_TO);
  });

  it('ends at the specified endpoint (non-rotated, unit circle)', () => {
    // Quarter circle from (1,0) to (0,1) using a radius-1 circle centered at origin.
    const path = createPath();
    appendPathMoveTo(path, 1, 0);
    appendPathArcTo(path, 1, 1, 0, false, true, 0, 1);
    const data = path.data;
    // Last anchor point of the last cubic should be close to (0,1).
    expect(data[data.length - 2]).toBeCloseTo(0, 1);
    expect(data[data.length - 1]).toBeCloseTo(1, 1);
  });
});

describe('appendPathCircle', () => {
  it('produces a closed path with a MOVE_TO, four CUBIC_CURVE_TO, and a CLOSE', () => {
    const path = createPath();
    appendPathCircle(path, 0, 0, 50);
    expect(path.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(path.commands[path.commands.length - 1]).toBe(PathCommand.CLOSE);
    expect(path.commands.filter((c) => c === PathCommand.CUBIC_CURVE_TO).length).toBe(4);
  });

  it('starts at the rightmost point of the circle', () => {
    const path = createPath();
    appendPathCircle(path, 10, 20, 30);
    // MOVE_TO at (cx+radius, cy) = (40, 20)
    expect(path.data[0]).toBeCloseTo(40);
    expect(path.data[1]).toBeCloseTo(20);
  });
});

describe('appendPathClose', () => {
  it('appends a CLOSE command and no data', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathClose(path);
    expect(path.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.CLOSE]);
    expect(path.data).toStrictEqual([0, 0]);
  });
});

describe('appendPathCubicCurveTo', () => {
  it('pushes the cubic verb and its six coordinates', () => {
    const path = createPath();
    appendPathCubicCurveTo(path, 1, 2, 3, 4, 5, 6);
    expect(path.commands).toStrictEqual([PathCommand.CUBIC_CURVE_TO]);
    expect(path.data).toStrictEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('appendPathCurveTo', () => {
  it('pushes the quadratic verb and its four coordinates', () => {
    const path = createPath();
    appendPathCurveTo(path, 1, 2, 3, 4);
    expect(path.commands).toStrictEqual([PathCommand.CURVE_TO]);
    expect(path.data).toStrictEqual([1, 2, 3, 4]);
  });
});

describe('appendPathEllipse', () => {
  it('produces a closed path with four cubic segments', () => {
    const path = createPath();
    appendPathEllipse(path, 0, 0, 100, 50);
    expect(path.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(path.commands[path.commands.length - 1]).toBe(PathCommand.CLOSE);
    expect(path.commands.filter((c) => c === PathCommand.CUBIC_CURVE_TO).length).toBe(4);
  });

  it('starts at (cx+radiusX, cy)', () => {
    const path = createPath();
    appendPathEllipse(path, 10, 20, 100, 50);
    expect(path.data[0]).toBeCloseTo(110);
    expect(path.data[1]).toBeCloseTo(20);
  });
});

describe('appendPathLineTo', () => {
  it('pushes the line verb and its point', () => {
    const path = createPath();
    appendPathLineTo(path, 7, 8);
    expect(path.commands).toStrictEqual([PathCommand.LINE_TO]);
    expect(path.data).toStrictEqual([7, 8]);
  });
});

describe('appendPathMoveTo', () => {
  it('pushes the move verb and its point', () => {
    const path = createPath();
    appendPathMoveTo(path, 9, 10);
    expect(path.commands).toStrictEqual([PathCommand.MOVE_TO]);
    expect(path.data).toStrictEqual([9, 10]);
  });
});

describe('appendPathPolygon', () => {
  it('appends a closed polygon from a flat coordinate array', () => {
    const path = createPath();
    appendPathPolygon(path, [0, 0, 100, 0, 100, 100]);
    expect(path.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(path.commands[path.commands.length - 1]).toBe(PathCommand.CLOSE);
    expect(path.data[0]).toBe(0);
    expect(path.data[1]).toBe(0);
  });

  it('does nothing when fewer than 3 points are provided', () => {
    const path = createPath();
    appendPathPolygon(path, [0, 0, 10, 10]);
    expect(path.commands.length).toBe(0);
  });
});

describe('appendPathPolyline', () => {
  it('appends an open polyline with no CLOSE', () => {
    const path = createPath();
    appendPathPolyline(path, [0, 0, 10, 0, 10, 10]);
    expect(path.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
    expect(path.commands).not.toContain(PathCommand.CLOSE);
  });

  it('does nothing when fewer than 2 points are provided', () => {
    const path = createPath();
    appendPathPolyline(path, [0, 0]);
    expect(path.commands.length).toBe(0);
  });
});

describe('appendPathRectangle', () => {
  it('produces a closed rectangle with four corners', () => {
    const path = createPath();
    appendPathRectangle(path, 10, 20, 100, 50);
    expect(path.commands).toStrictEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    expect(path.data).toStrictEqual([10, 20, 110, 20, 110, 70, 10, 70]);
  });
});

describe('appendPathRoundRectangle', () => {
  it('produces a closed path for a uniformly rounded rectangle', () => {
    const path = createPath();
    appendPathRoundRectangle(path, 0, 0, 100, 50, 10);
    expect(path.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(path.commands[path.commands.length - 1]).toBe(PathCommand.CLOSE);
  });

  it('contains cubic curves for the corner arcs', () => {
    const path = createPath();
    appendPathRoundRectangle(path, 0, 0, 100, 50, 10);
    expect(path.commands).toContain(PathCommand.CUBIC_CURVE_TO);
  });

  it('produces a rectangle (no arcs) when radius is 0', () => {
    const round = createPath();
    appendPathRoundRectangle(round, 0, 0, 100, 50, 0);
    // No arcs when radius is 0.
    expect(round.commands).not.toContain(PathCommand.CUBIC_CURVE_TO);
    // Must start with MOVE_TO and end with CLOSE.
    expect(round.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(round.commands[round.commands.length - 1]).toBe(PathCommand.CLOSE);
    // All four corners should appear in the data.
    const xs = round.data.filter((_, i) => i % 2 === 0);
    const ys = round.data.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(100);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(50);
  });

  it('accepts per-corner radii as a 4-tuple', () => {
    const path = createPath();
    appendPathRoundRectangle(path, 0, 0, 100, 100, [10, 20, 30, 40]);
    expect(path.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(path.commands[path.commands.length - 1]).toBe(PathCommand.CLOSE);
    expect(path.commands).toContain(PathCommand.CUBIC_CURVE_TO);
  });

  it('clamps oversized radii to half the edge length', () => {
    const path = createPath();
    // Radius of 1000 on a 40×20 rectangle should be clamped to min(40/2, 20/2) = 10.
    appendPathRoundRectangle(path, 0, 0, 40, 20, 1000);
    // Should not throw and should produce a valid closed path.
    expect(path.commands[path.commands.length - 1]).toBe(PathCommand.CLOSE);
  });
});

describe('createPath', () => {
  it('defaults to an empty nonZero path', () => {
    const path = createPath();
    expect(path.commands).toStrictEqual([]);
    expect(path.data).toStrictEqual([]);
    expect(path.winding).toStrictEqual('nonZero');
  });

  it('accepts an evenOdd winding', () => {
    expect(createPath('evenOdd').winding).toStrictEqual('evenOdd');
  });
});

describe('getPathLastPoint', () => {
  it('returns null for an empty path', () => {
    expect(getPathLastPoint(createPath())).toBeNull();
  });

  it('returns the point after appendPathMoveTo', () => {
    const path = createPath();
    appendPathMoveTo(path, 10, 20);
    expect(getPathLastPoint(path)).toStrictEqual([10, 20]);
  });

  it('returns the point after appendPathLineTo', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 30, 40);
    expect(getPathLastPoint(path)).toStrictEqual([30, 40]);
  });

  it('returns the anchor after appendPathCurveTo', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 5, 5, 50, 60);
    expect(getPathLastPoint(path)).toStrictEqual([50, 60]);
  });

  it('returns the anchor after appendPathCubicCurveTo', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCubicCurveTo(path, 1, 2, 3, 4, 70, 80);
    expect(getPathLastPoint(path)).toStrictEqual([70, 80]);
  });

  it('returns the last anchor after appendPathClose', () => {
    const path = createPath();
    appendPathMoveTo(path, 10, 20);
    appendPathLineTo(path, 30, 40);
    appendPathClose(path);
    expect(getPathLastPoint(path)).toStrictEqual([30, 40]);
  });

  it('returns the last point after appendPathRectangle', () => {
    const path = createPath();
    appendPathRectangle(path, 10, 20, 100, 50);
    expect(getPathLastPoint(path)).toStrictEqual([10, 70]);
  });

  it('returns the endpoint after appendPathArc', () => {
    const path = createPath();
    appendPathArc(path, 0, 0, 100, 0, Math.PI / 2);
    const last = getPathLastPoint(path)!;
    expect(last[0]).toBeCloseTo(0, 1);
    expect(last[1]).toBeCloseTo(100, 1);
  });

  it('returns the endpoint after appendPathCircle', () => {
    const path = createPath();
    appendPathCircle(path, 10, 20, 30);
    const last = getPathLastPoint(path)!;
    expect(last[0]).toBeCloseTo(40);
    expect(last[1]).toBeCloseTo(20);
  });

  it('returns the last point after appendPathPolygon', () => {
    const path = createPath();
    appendPathPolygon(path, [0, 0, 100, 0, 100, 100]);
    expect(getPathLastPoint(path)).toStrictEqual([100, 100]);
  });

  it('returns the last point after appendPathPolyline', () => {
    const path = createPath();
    appendPathPolyline(path, [0, 0, 50, 60, 70, 80]);
    expect(getPathLastPoint(path)).toStrictEqual([70, 80]);
  });
});
