// Generated from crates/flight-path/tests/path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  PathCommand,
  appendPathArc,
  appendPathCircle,
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathEllipse,
  appendPathEllipticalArcTo,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathPolygon,
  appendPathPolyline,
  appendPathQuadraticCurveTo,
  appendPathRectangle,
  appendPathRoundedRectangle,
  appendPathRoundedRectangleWithCornerRadii,
  appendPathTangentArcTo,
  createPath,
  getPathLastPoint,
  getPathMorphCreationReasonString,
  getPathWindingString,
  getStrokeCapString,
  getStrokeJoinString,
  getStrokePathTessellationReasonString,
  initializePath,
  parsePathMorphCreationReason,
  parsePathWinding,
  parseStrokeCap,
  parseStrokeJoin,
  parseStrokePathTessellationReason,
} from './contract.ts';
import type { PathRaw } from './contract.ts';

function axisValues(path: Readonly<PathRaw>, axis: number): number[] {
  let values: number[] = [] as never[];
  let i = axis;
  while (i < path.data.length) {
    values.push(path.data[i]);
    i += 2;
  }
  return values;
}

function countCommands(path: Readonly<PathRaw>, command: PathCommand): number {
  let count = 0;
  for (const candidate of path.commands) {
    if (candidate === (command & 0xff)) {
      count += 1;
    }
  }
  return count;
}

function maxValue(values: Readonly<number[]>): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    max = Math.max(max, value);
  }
  return max;
}

function minValue(values: Readonly<number[]>): number {
  let min = Number.POSITIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
  }
  return min;
}

function tsWirePath(commands: number[], data: number[]): PathRaw {
  let path = createPath('nonZero');
  path.commands = commands;
  path.data = data;
  return path;
}

describe('appendPathArc', () => {
  it('produces move to and cubic curves for non zero arc', () => {
    let path = createPath('nonZero');
    appendPathArc(path, 0.0, 0.0, 50.0, 0.0, Math.PI / 2.0, false, false);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands.includes(PathCommand.CUBIC_CURVE_TO & 0xff)).toBe(true);
  });
  it('starts at correct point on circle', () => {
    let path = createPath('nonZero');
    appendPathArc(path, 10.0, 20.0, 30.0, 0.0, Math.PI / 2.0, false, false);
    expect(Math.abs(path.data[0] - 40.0) < 0.005).toBe(true);
    expect(Math.abs(path.data[1] - 20.0) < 0.005).toBe(true);
  });
  it('appends nothing for zero radius', () => {
    let path = createPath('nonZero');
    appendPathArc(path, 0.0, 0.0, 0.0, 0.0, Math.PI, false, false);
    expect(path.commands.length).toEqual(0);
  });
  it('ends at correct point for a quarter circle', () => {
    let path = createPath('nonZero');
    appendPathArc(path, 0.0, 0.0, 100.0, 0.0, Math.PI / 2.0, false, false);
    const data = path.data;
    expect(Math.abs(data[data.length - 2] - 0.0) < 0.05).toBe(true);
    expect(Math.abs(data[data.length - 1] - 100.0) < 0.05).toBe(true);
  });
  it('supports anticlockwise arcs', () => {
    let pathCw = createPath('nonZero');
    appendPathArc(pathCw, 0.0, 0.0, 50.0, 0.0, Math.PI, false, false);
    let pathCcw = createPath('nonZero');
    appendPathArc(pathCcw, 0.0, 0.0, 50.0, 0.0, Math.PI, true, false);
    expect(pathCw.commands.includes(PathCommand.CUBIC_CURVE_TO & 0xff)).toBe(true);
    expect(pathCcw.commands.includes(PathCommand.CUBIC_CURVE_TO & 0xff)).toBe(true);
    const cwMaxY: number = maxValue(axisValues(pathCw, 1));
    const ccwMinY: number = minValue(axisValues(pathCcw, 1));
    expect(cwMaxY > 0.0).toBe(true);
    expect(ccwMinY < 0.0).toBe(true);
  });
  it('connect to current appends line to instead of move to', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathArc(path, 100.0, 0.0, 50.0, Math.PI, 0.0, false, true);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[1]).toEqual(PathCommand.LINE_TO & 0xff);
  });
});

describe('appendPathCircle', () => {
  it('produces closed path with four cubic curves', () => {
    let path = createPath('nonZero');
    appendPathCircle(path, 0.0, 0.0, 50.0);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CLOSE & 0xff);
    const cubicCount = countCommands(path, PathCommand.CUBIC_CURVE_TO);
    expect(cubicCount).toEqual(4);
  });
  it('starts at rightmost point', () => {
    let path = createPath('nonZero');
    appendPathCircle(path, 10.0, 20.0, 30.0);
    expect(Math.abs(path.data[0] - 40.0) < 0.005).toBe(true);
    expect(Math.abs(path.data[1] - 20.0) < 0.005).toBe(true);
  });
});

describe('appendPathClose', () => {
  it('appends close command and no data', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathClose(path);
    expect(path.commands).toEqual([PathCommand.MOVE_TO & 0xff, PathCommand.CLOSE & 0xff]);
    expect(path.data).toEqual([0.0, 0.0]);
  });
});

describe('appendPathCubicCurveTo', () => {
  it('appends command and six data values', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathCubicCurveTo(path, 10.0, 20.0, 30.0, 40.0, 50.0, 0.0);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CUBIC_CURVE_TO & 0xff);
    expect(path.data.length).toEqual(8);
  });
  it('pushes the cubic verb and its six coordinates', () => {
    let path = createPath('nonZero');
    appendPathCubicCurveTo(path, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
    expect(path.commands.length).toEqual(1);
    expect(path.commands[0]).toEqual(PathCommand.CUBIC_CURVE_TO & 0xff);
    expect(path.data.length).toEqual(6);
    for (let i = 0; i < 6; i += 1) {
      expect(path.data[i]).toEqual(i + 1);
    }
  });
});

describe('appendPathEllipse', () => {
  it('produces a closed path with four cubic segments', () => {
    let path = createPath('nonZero');
    appendPathEllipse(path, 0.0, 0.0, 100.0, 50.0);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CLOSE & 0xff);
    const cubicCount = countCommands(path, PathCommand.CUBIC_CURVE_TO);
    expect(cubicCount).toEqual(4);
  });
  it('starts at cx plus radius x cy', () => {
    let path = createPath('nonZero');
    appendPathEllipse(path, 10.0, 20.0, 100.0, 50.0);
    expect(Math.abs(path.data[0] - 110.0) < 0.005).toBe(true);
    expect(Math.abs(path.data[1] - 20.0) < 0.005).toBe(true);
  });
});

describe('appendPathEllipticalArcTo', () => {
  it('starts after close from the subpath origin', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 10.0, 20.0);
    appendPathLineTo(path, 30.0, 40.0);
    appendPathClose(path);
    appendPathEllipticalArcTo(path, 10.0, 10.0, 0.0, false, true, 30.0, 20.0);
    let expected = createPath('nonZero');
    appendPathMoveTo(expected, 10.0, 20.0);
    appendPathEllipticalArcTo(expected, 10.0, 10.0, 0.0, false, true, 30.0, 20.0);
    expect(path.data.slice(4)).toEqual(expected.data.slice(2));
  });
  it('appends a line to when radius x is zero', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathEllipticalArcTo(path, 0.0, 10.0, 0.0, false, false, 50.0, 50.0);
    expect(path.commands[1]).toEqual(PathCommand.LINE_TO & 0xff);
    expect(Math.abs(path.data[path.data.length - 2] - 50.0) < 0.005).toBe(true);
    expect(Math.abs(path.data[path.data.length - 1] - 50.0) < 0.005).toBe(true);
  });
  it('does nothing when start equals end', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 10.0, 10.0);
    const beforeLen = path.commands.length;
    appendPathEllipticalArcTo(path, 50.0, 50.0, 0.0, false, false, 10.0, 10.0);
    expect(path.commands.length).toEqual(beforeLen);
  });
  it('produces cubic curves for a non degenerate arc', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 100.0, 0.0);
    appendPathEllipticalArcTo(path, 50.0, 50.0, 0.0, true, false, 100.0, 1.0);
    expect(path.commands.includes(PathCommand.CUBIC_CURVE_TO & 0xff)).toBe(true);
  });
  it('ends at the specified endpoint', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 1.0, 0.0);
    appendPathEllipticalArcTo(path, 1.0, 1.0, 0.0, false, true, 0.0, 1.0);
    const data = path.data;
    expect(Math.abs(data[data.length - 2] - 0.0) < 0.05).toBe(true);
    expect(Math.abs(data[data.length - 1] - 1.0) < 0.05).toBe(true);
  });
});

describe('appendPathLineTo', () => {
  it('appends command and two data values', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 20.0);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.LINE_TO & 0xff);
    expect(path.data.length).toEqual(4);
  });
  it('pushes the line verb and its point', () => {
    let path = createPath('nonZero');
    appendPathLineTo(path, 7.0, 8.0);
    expect(path.commands.length).toEqual(1);
    expect(path.commands[0]).toEqual(PathCommand.LINE_TO & 0xff);
    expect(path.data.length).toEqual(2);
    expect(path.data[0]).toEqual(7.0);
    expect(path.data[1]).toEqual(8.0);
  });
});

describe('appendPathMoveTo', () => {
  it('appends command and two data values', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 5.0, 10.0);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.data[0]).toEqual(5.0);
    expect(path.data[1]).toEqual(10.0);
  });
  it('pushes the move verb and its point', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 9.0, 10.0);
    expect(path.commands.length).toEqual(1);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.data.length).toEqual(2);
    expect(path.data[0]).toEqual(9.0);
    expect(path.data[1]).toEqual(10.0);
  });
});

describe('appendPathPolygon', () => {
  it('appends a closed polygon from a flat coordinate array', () => {
    let path = createPath('nonZero');
    appendPathPolygon(path, [0.0, 0.0, 100.0, 0.0, 100.0, 100.0]);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CLOSE & 0xff);
    expect(path.data[0]).toEqual(0.0);
    expect(path.data[1]).toEqual(0.0);
  });
  it('creates closed polygon from points', () => {
    let path = createPath('nonZero');
    appendPathPolygon(path, [0.0, 0.0, 100.0, 0.0, 50.0, 100.0]);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CLOSE & 0xff);
  });
  it('ignores fewer than three points', () => {
    let path = createPath('nonZero');
    appendPathPolygon(path, [0.0, 0.0, 10.0, 10.0]);
    expect(path.commands.length).toEqual(0);
  });
});

describe('appendPathPolyline', () => {
  it('appends an open polyline with no close', () => {
    let path = createPath('nonZero');
    appendPathPolyline(path, [0.0, 0.0, 10.0, 0.0, 10.0, 10.0]);
    expect(path.commands).toEqual([PathCommand.MOVE_TO & 0xff, PathCommand.LINE_TO & 0xff, PathCommand.LINE_TO & 0xff]);
    expect(!path.commands.includes(PathCommand.CLOSE & 0xff)).toBe(true);
  });
  it('does nothing when fewer than two points are provided', () => {
    let path = createPath('nonZero');
    appendPathPolyline(path, [0.0, 0.0]);
    expect(path.commands.length).toEqual(0);
  });
});

describe('appendPathQuadraticCurveTo', () => {
  it('pushes the quadratic verb and its four coordinates', () => {
    let path = createPath('nonZero');
    appendPathQuadraticCurveTo(path, 1.0, 2.0, 3.0, 4.0);
    expect(path.commands).toEqual([PathCommand.QUADRATIC_CURVE_TO & 0xff]);
    expect(path.data).toEqual([1.0, 2.0, 3.0, 4.0]);
  });
});

describe('appendPathRectangle', () => {
  it('creates closed rectangle', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 50.0);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CLOSE & 0xff);
    const lineCount = countCommands(path, PathCommand.LINE_TO);
    expect(lineCount).toEqual(3);
  });
  it('produces a closed rectangle with four corners', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 10.0, 20.0, 100.0, 50.0);
    expect(path.commands.length).toEqual(5);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[1]).toEqual(PathCommand.LINE_TO & 0xff);
    expect(path.commands[2]).toEqual(PathCommand.LINE_TO & 0xff);
    expect(path.commands[3]).toEqual(PathCommand.LINE_TO & 0xff);
    expect(path.commands[4]).toEqual(PathCommand.CLOSE & 0xff);
    expect(path.data.length).toEqual(8);
    expect(path.data[0]).toEqual(10.0);
    expect(path.data[1]).toEqual(20.0);
    expect(path.data[2]).toEqual(110.0);
    expect(path.data[3]).toEqual(20.0);
    expect(path.data[4]).toEqual(110.0);
    expect(path.data[5]).toEqual(70.0);
    expect(path.data[6]).toEqual(10.0);
    expect(path.data[7]).toEqual(70.0);
  });
});

describe('appendPathRoundedRectangle', () => {
  it('produces a closed path for a uniformly rounded rectangle', () => {
    let path = createPath('nonZero');
    appendPathRoundedRectangle(path, 0.0, 0.0, 100.0, 50.0, 10.0);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CLOSE & 0xff);
  });
  it('contains cubic curves for the corner arcs', () => {
    let path = createPath('nonZero');
    appendPathRoundedRectangle(path, 0.0, 0.0, 100.0, 50.0, 10.0);
    expect(path.commands.includes(PathCommand.CUBIC_CURVE_TO & 0xff)).toBe(true);
  });
  it('uses authored radius directly', () => {
    let path = createPath('nonZero');
    appendPathRoundedRectangle(path, 0.0, 0.0, 100.0, 50.0, 20.0);
    expect(path.data.slice(0, 4)).toEqual([20.0, 0.0, 80.0, 0.0]);
  });
  it('produces a rectangle when radius is zero', () => {
    let path = createPath('nonZero');
    appendPathRoundedRectangle(path, 0.0, 0.0, 100.0, 50.0, 0.0);
    expect(!path.commands.includes(PathCommand.CUBIC_CURVE_TO & 0xff)).toBe(true);
    expect(path.commands[0]).toEqual(PathCommand.MOVE_TO & 0xff);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CLOSE & 0xff);
    const xs: number[] = axisValues(path, 0);
    const ys: number[] = axisValues(path, 1);
    expect(Math.abs(minValue(xs) - 0.0) < 0.005).toBe(true);
    expect(Math.abs(maxValue(xs) - 100.0) < 0.005).toBe(true);
    expect(Math.abs(minValue(ys) - 0.0) < 0.005).toBe(true);
    expect(Math.abs(maxValue(ys) - 50.0) < 0.005).toBe(true);
  });
  it('clamps oversized radii to half the edge length', () => {
    let path = createPath('nonZero');
    appendPathRoundedRectangle(path, 0.0, 0.0, 40.0, 20.0, 1000.0);
    expect(path.commands[path.commands.length - 1]).toEqual(PathCommand.CLOSE & 0xff);
  });
});

describe('appendPathRoundedRectangleWithCornerRadii', () => {
  it('uses per corner radii in tl tr br bl order', () => {
    let path = createPath('nonZero');
    appendPathRoundedRectangleWithCornerRadii(path, 0.0, 0.0, 100.0, 100.0, 10.0, 20.0, 30.0, 40.0);
    expect(path.commands).toEqual([
      PathCommand.MOVE_TO & 0xff,
      PathCommand.LINE_TO & 0xff,
      PathCommand.CUBIC_CURVE_TO & 0xff,
      PathCommand.LINE_TO & 0xff,
      PathCommand.CUBIC_CURVE_TO & 0xff,
      PathCommand.LINE_TO & 0xff,
      PathCommand.CUBIC_CURVE_TO & 0xff,
      PathCommand.LINE_TO & 0xff,
      PathCommand.CUBIC_CURVE_TO & 0xff,
      PathCommand.CLOSE & 0xff,
    ]);
    expect(path.data.slice(0, 4)).toEqual([10.0, 0.0, 80.0, 0.0]);
    expect(path.data.slice(8, 12)).toEqual([100.0, 20.0, 100.0, 70.0]);
    expect(path.data.slice(16, 20)).toEqual([70.0, 100.0, 40.0, 100.0]);
    expect(Math.abs(path.data[24] - 0.0) < 0.005).toBe(true);
    expect(Math.abs(path.data[25] - 60.0) < 0.005).toBe(true);
    expect(path.data.slice(26, 28)).toEqual([0.0, 10.0]);
    expect(Math.abs(path.data[32] - 10.0) < 0.005).toBe(true);
    expect(Math.abs(path.data[33] - 0.0) < 0.005).toBe(true);
  });
});

describe('appendPathTangentArcTo', () => {
  it('emits line to and cubic curves for a right angle corner', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 100.0, 0.0);
    appendPathTangentArcTo(path, 100.0, 100.0, 0.0, 100.0, 20.0);
    expect(path.commands.includes(PathCommand.LINE_TO & 0xff)).toBe(true);
    expect(path.commands.includes(PathCommand.CUBIC_CURVE_TO & 0xff)).toBe(true);
  });
  it('selects the short sweep for a clockwise right angle', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathTangentArcTo(path, 100.0, 0.0, 100.0, 100.0, 20.0);
    const last = getPathLastPoint(path)!;
    expect(Math.abs(last[0] - 100.0) < 5e-7).toBe(true);
    expect(Math.abs(last[1] - 20.0) < 5e-7).toBe(true);
  });
  it('selects the short sweep for a counterclockwise right angle', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathTangentArcTo(path, 0.0, 100.0, 100.0, 100.0, 20.0);
    const last = getPathLastPoint(path)!;
    expect(Math.abs(last[0] - 20.0) < 5e-7).toBe(true);
    expect(Math.abs(last[1] - 100.0) < 5e-7).toBe(true);
  });
  it('falls back to a line to when tangent lines are collinear', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathTangentArcTo(path, 50.0, 0.0, 100.0, 0.0, 20.0);
    expect(path.commands[1]).toEqual(PathCommand.LINE_TO & 0xff);
    let cubicCount = 0;
    for (let i = 0; i < path.commands.length; i += 1) {
      if (path.commands[i] === (PathCommand.CUBIC_CURVE_TO & 0xff)) {
        cubicCount += 1;
      }
    }
    expect(cubicCount).toEqual(0);
  });
  it('falls back to line to when tangent has zero length', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 100.0, 100.0);
    appendPathTangentArcTo(path, 100.0, 100.0, 0.0, 100.0, 20.0);
    expect(path.commands[1]).toEqual(PathCommand.LINE_TO & 0xff);
    const cubicCount = countCommands(path, PathCommand.CUBIC_CURVE_TO);
    expect(cubicCount).toEqual(0);
  });
  it('falls back to line to when radius is zero', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathTangentArcTo(path, 100.0, 0.0, 100.0, 100.0, 0.0);
    expect(path.commands[1]).toEqual(PathCommand.LINE_TO & 0xff);
    const cubicCount = countCommands(path, PathCommand.CUBIC_CURVE_TO);
    expect(cubicCount).toEqual(0);
  });
  it('handles an obtuse angle with a short arc', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathTangentArcTo(path, 100.0, 0.0, 150.0, 100.0, 20.0);
    expect(getPathLastPoint(path) !== null).toBe(true);
    const cubicCount = countCommands(path, PathCommand.CUBIC_CURVE_TO);
    expect(cubicCount).toEqual(1);
  });
});

describe('createPath', () => {
  it('path command codes are the ts wire codes', () => {
    expect(PathCommand.NO_OP & 0xff).toEqual(0);
    expect(PathCommand.MOVE_TO & 0xff).toEqual(1);
    expect(PathCommand.LINE_TO & 0xff).toEqual(2);
    expect(PathCommand.QUADRATIC_CURVE_TO & 0xff).toEqual(3);
    expect(PathCommand.WIDE_MOVE_TO & 0xff).toEqual(4);
    expect(PathCommand.WIDE_LINE_TO & 0xff).toEqual(5);
    expect(PathCommand.CUBIC_CURVE_TO & 0xff).toEqual(6);
    expect(PathCommand.CLOSE & 0xff).toEqual(7);
  });
  it('writers emit the ts serialized command bytes', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 0.0);
    appendPathQuadraticCurveTo(path, 15.0, 5.0, 10.0, 10.0);
    appendPathCubicCurveTo(path, 8.0, 12.0, 2.0, 12.0, 0.0, 10.0);
    appendPathClose(path);
    expect(path.commands).toEqual([1, 2, 3, 6, 7]);
    expect(path.data).toEqual([0.0, 0.0, 10.0, 0.0, 15.0, 5.0, 10.0, 10.0, 8.0, 12.0, 2.0, 12.0, 0.0, 10.0]);
  });
  it('returns empty path with given winding', () => {
    const path = createPath('evenOdd');
    expect(path.commands.length === 0).toBe(true);
    expect(path.data.length === 0).toBe(true);
    expect(path.winding).toEqual('evenOdd');
  });
  it('defaults to non zero winding', () => {
    const path = createPath('nonZero');
    expect(path.winding).toEqual('nonZero');
    expect(path.commands.length === 0).toBe(true);
    expect(path.data.length === 0).toBe(true);
  });
});

describe('getPathLastPoint', () => {
  it('walks back over ts no op bytes to the subpath start after close', () => {
    const path = tsWirePath([1, 0, 2, 0, 7], [3.0, 4.0, 9.0, 9.0]);
    expect(getPathLastPoint(path)).toEqual([3.0, 4.0]);
  });
  it('returns none for empty path', () => {
    const path = createPath('nonZero');
    expect(getPathLastPoint(path) === null).toBe(true);
  });
  it('returns last line to point', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 10.0, 20.0);
    const pt = getPathLastPoint(path)!;
    expect(pt[0]).toEqual(10.0);
    expect(pt[1]).toEqual(20.0);
  });
  it('returns move to origin after close', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 5.0, 10.0);
    appendPathLineTo(path, 20.0, 30.0);
    appendPathClose(path);
    const pt = getPathLastPoint(path)!;
    expect(pt[0]).toEqual(5.0);
    expect(pt[1]).toEqual(10.0);
  });
  it('returns the point after move to', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 10.0, 20.0);
    const pt = getPathLastPoint(path)!;
    expect(pt[0]).toEqual(10.0);
    expect(pt[1]).toEqual(20.0);
  });
  it('returns the anchor after quadratic curve to', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathQuadraticCurveTo(path, 5.0, 5.0, 50.0, 60.0);
    const pt = getPathLastPoint(path)!;
    expect(pt[0]).toEqual(50.0);
    expect(pt[1]).toEqual(60.0);
  });
  it('returns the anchor after cubic curve to', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathCubicCurveTo(path, 1.0, 2.0, 3.0, 4.0, 70.0, 80.0);
    const pt = getPathLastPoint(path)!;
    expect(pt[0]).toEqual(70.0);
    expect(pt[1]).toEqual(80.0);
  });
  it('returns the move to origin after rectangle', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 10.0, 20.0, 100.0, 50.0);
    const pt = getPathLastPoint(path)!;
    expect(pt[0]).toEqual(10.0);
    expect(pt[1]).toEqual(20.0);
  });
  it('returns the endpoint after arc', () => {
    let path = createPath('nonZero');
    appendPathArc(path, 0.0, 0.0, 100.0, 0.0, Math.PI / 2.0, false, false);
    const pt = getPathLastPoint(path)!;
    expect(Math.abs(pt[0] - 0.0) < 0.05).toBe(true);
    expect(Math.abs(pt[1] - 100.0) < 0.05).toBe(true);
  });
  it('returns the endpoint after circle', () => {
    let path = createPath('nonZero');
    appendPathCircle(path, 10.0, 20.0, 30.0);
    const pt = getPathLastPoint(path)!;
    expect(Math.abs(pt[0] - 40.0) < 0.005).toBe(true);
    expect(Math.abs(pt[1] - 20.0) < 0.005).toBe(true);
  });
  it('returns the move to origin after polygon', () => {
    let path = createPath('nonZero');
    appendPathPolygon(path, [0.0, 0.0, 100.0, 0.0, 100.0, 100.0]);
    const pt = getPathLastPoint(path)!;
    expect(pt[0]).toEqual(0.0);
    expect(pt[1]).toEqual(0.0);
  });
  it('returns the last point after polyline', () => {
    let path = createPath('nonZero');
    appendPathPolyline(path, [0.0, 0.0, 50.0, 60.0, 70.0, 80.0]);
    const pt = getPathLastPoint(path)!;
    expect(pt[0]).toEqual(70.0);
    expect(pt[1]).toEqual(80.0);
  });
});

describe('getPathMorphCreationReasonString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathMorphCreationReasonString('ok')).toEqual('ok');
    expect(getPathMorphCreationReasonString('winding-mismatch')).toEqual('winding-mismatch');
    expect(getPathMorphCreationReasonString('contour-count-mismatch')).toEqual('contour-count-mismatch');
    expect(getPathMorphCreationReasonString('contour-closedness-mismatch')).toEqual('contour-closedness-mismatch');
    expect(getPathMorphCreationReasonString('contour-orientation-mismatch')).toEqual('contour-orientation-mismatch');
  });
});

describe('getPathWindingString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathWindingString('nonZero')).toEqual('nonZero');
    expect(getPathWindingString('evenOdd')).toEqual('evenOdd');
  });
});

describe('getStrokeCapString', () => {
  it('returns the exact ts strings', () => {
    expect(getStrokeCapString('butt')).toEqual('butt');
    expect(getStrokeCapString('round')).toEqual('round');
    expect(getStrokeCapString('square')).toEqual('square');
  });
});

describe('getStrokeJoinString', () => {
  it('returns the exact ts strings', () => {
    expect(getStrokeJoinString('miter')).toEqual('miter');
    expect(getStrokeJoinString('bevel')).toEqual('bevel');
    expect(getStrokeJoinString('round')).toEqual('round');
  });
});

describe('getStrokePathTessellationReasonString', () => {
  it('returns the exact ts strings', () => {
    expect(getStrokePathTessellationReasonString('ok')).toEqual('ok');
    expect(getStrokePathTessellationReasonString('invalid-style')).toEqual('invalid-style');
    expect(getStrokePathTessellationReasonString('invalid-path')).toEqual('invalid-path');
    expect(getStrokePathTessellationReasonString('self-intersecting-centerline')).toEqual(
      'self-intersecting-centerline',
    );
    expect(getStrokePathTessellationReasonString('reversing-join')).toEqual('reversing-join');
    expect(getStrokePathTessellationReasonString('self-intersecting-outline')).toEqual('self-intersecting-outline');
  });
});

describe('initializePath', () => {
  // Rust-only: keeps the entity identity
  it('clears existing data', () => {
    let path = createPath('nonZero');
    path.winding = 'evenOdd';
    appendPathMoveTo(path, 1.0, 2.0);
    initializePath(path, 'nonZero');
    expect(path.commands.length === 0).toBe(true);
    expect(path.data.length === 0).toBe(true);
    expect(path.winding).toEqual('nonZero');
  });
});

describe('parsePathMorphCreationReason', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathMorphCreationReason('ok')).toEqual('ok');
    expect(parsePathMorphCreationReason('winding-mismatch')).toEqual('winding-mismatch');
    expect(parsePathMorphCreationReason('contour-count-mismatch')).toEqual('contour-count-mismatch');
    expect(parsePathMorphCreationReason('contour-closedness-mismatch')).toEqual('contour-closedness-mismatch');
    expect(parsePathMorphCreationReason('contour-orientation-mismatch')).toEqual('contour-orientation-mismatch');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathMorphCreationReason('OK')).toEqual(undefined);
    expect(parsePathMorphCreationReason('')).toEqual(undefined);
  });
});

describe('parsePathWinding', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathWinding('nonZero')).toEqual('nonZero');
    expect(parsePathWinding('evenOdd')).toEqual('evenOdd');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathWinding('NONZERO')).toEqual(undefined);
    expect(parsePathWinding('')).toEqual(undefined);
  });
});

describe('parseStrokeCap', () => {
  it('parses the exact ts strings', () => {
    expect(parseStrokeCap('butt')).toEqual('butt');
    expect(parseStrokeCap('round')).toEqual('round');
    expect(parseStrokeCap('square')).toEqual('square');
  });
  it('rejects other text and wrong casing', () => {
    expect(parseStrokeCap('BUTT')).toEqual(undefined);
    expect(parseStrokeCap('')).toEqual(undefined);
  });
});

describe('parseStrokeJoin', () => {
  it('parses the exact ts strings', () => {
    expect(parseStrokeJoin('miter')).toEqual('miter');
    expect(parseStrokeJoin('bevel')).toEqual('bevel');
    expect(parseStrokeJoin('round')).toEqual('round');
  });
  it('rejects other text and wrong casing', () => {
    expect(parseStrokeJoin('MITER')).toEqual(undefined);
    expect(parseStrokeJoin('')).toEqual(undefined);
  });
});

describe('parseStrokePathTessellationReason', () => {
  it('parses the exact ts strings', () => {
    expect(parseStrokePathTessellationReason('ok')).toEqual('ok');
    expect(parseStrokePathTessellationReason('invalid-style')).toEqual('invalid-style');
    expect(parseStrokePathTessellationReason('invalid-path')).toEqual('invalid-path');
    expect(parseStrokePathTessellationReason('self-intersecting-centerline')).toEqual('self-intersecting-centerline');
    expect(parseStrokePathTessellationReason('reversing-join')).toEqual('reversing-join');
    expect(parseStrokePathTessellationReason('self-intersecting-outline')).toEqual('self-intersecting-outline');
  });
  it('rejects other text and wrong casing', () => {
    expect(parseStrokePathTessellationReason('OK')).toEqual(undefined);
    expect(parseStrokePathTessellationReason('')).toEqual(undefined);
  });
});
