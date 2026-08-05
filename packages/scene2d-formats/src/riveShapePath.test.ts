import type { RiveArtboardGraph, RiveCoreObject } from '@flighthq/types/contract';
import { PathCommand, RiveFieldType } from '@flighthq/types/contract';

import { createRivePath } from './riveShapePath';

// Rive stores a cubic vertex's handles in polar form and the three cubic kinds disagree on sign: a
// mirrored or asymmetric vertex SUBTRACTS its incoming vector, a detached vertex ADDS its own. The
// expectations below are computed from that stated relation, not read back from the builder.

const POINTS_PATH = 16;
const RECTANGLE = 7;
const ELLIPSE = 4;
const TRIANGLE = 8;
const POLYGON = 51;
const STAR = 52;
const SHAPE = 3;
const STRAIGHT_VERTEX = 5;
const CUBIC_DETACHED_VERTEX = 6;
const CUBIC_MIRRORED_VERTEX = 35;
const CUBIC_ASYMMETRIC_VERTEX = 34;

describe('createRivePath', () => {
  it('returns null for a component that is not a path', () => {
    expect(createRivePath(object(SHAPE, {}), artboardOf([object(SHAPE, {})]), 0)).toBeNull();
  });

  it('builds an open polyline from straight vertices', () => {
    const path = pointsPath(false, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 10, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 10, 25: 5 }),
    ]);

    expect(path!.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
    expect(path!.data).toEqual([0, 0, 10, 0, 10, 5]);
  });

  it('closes the contour back to the first vertex when the path says it is closed', () => {
    const open = pointsPath(false, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 10, 25: 0 }),
    ]);
    const closed = pointsPath(true, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 10, 25: 0 }),
    ]);

    expect(open!.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(closed!.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
  });

  it('places a mirrored vertex handle opposite its outgoing one, at the same distance', () => {
    const rotation = 0.7;
    const distance = 4;
    const path = pointsPath(false, [
      object(CUBIC_MIRRORED_VERTEX, { 24: 0, 25: 0, 82: rotation, 83: distance }),
      object(CUBIC_MIRRORED_VERTEX, { 24: 20, 25: 0, 82: rotation, 83: distance }),
    ]);

    expect(path!.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO]);
    // out of the first vertex is +vector; in of the second is -vector.
    expectPoints(path!.data.slice(2, 6), [
      Math.cos(rotation) * distance,
      Math.sin(rotation) * distance,
      20 - Math.cos(rotation) * distance,
      -Math.sin(rotation) * distance,
    ]);
  });

  it('gives an asymmetric vertex one angle and two lengths', () => {
    const rotation = 1.2;
    const path = pointsPath(false, [
      object(CUBIC_ASYMMETRIC_VERTEX, { 24: 0, 25: 0, 79: rotation, 80: 3, 81: 9 }),
      object(CUBIC_ASYMMETRIC_VERTEX, { 24: 30, 25: 0, 79: rotation, 80: 3, 81: 9 }),
    ]);

    expectPoints(path!.data.slice(2, 6), [
      Math.cos(rotation) * 9,
      Math.sin(rotation) * 9,
      30 - Math.cos(rotation) * 3,
      -Math.sin(rotation) * 3,
    ]);
  });

  // The sign that differs. A detached vertex adds both handles, each with its own angle, so applying
  // the collinear rule here would reflect the incoming handle through the vertex.
  it('adds a detached vertex handle rather than subtracting it', () => {
    const inRotation = 2.5;
    const outRotation = 0.4;
    const path = pointsPath(false, [
      object(CUBIC_DETACHED_VERTEX, { 24: 0, 25: 0, 84: inRotation, 85: 2, 86: outRotation, 87: 6 }),
      object(CUBIC_DETACHED_VERTEX, { 24: 40, 25: 0, 84: inRotation, 85: 2, 86: outRotation, 87: 6 }),
    ]);

    expectPoints(path!.data.slice(2, 6), [
      Math.cos(outRotation) * 6,
      Math.sin(outRotation) * 6,
      40 + Math.cos(inRotation) * 2,
      Math.sin(inRotation) * 2,
    ]);
  });

  it('keeps a segment straight only when neither end states a handle', () => {
    const path = pointsPath(false, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(CUBIC_MIRRORED_VERTEX, { 24: 10, 25: 0, 82: 0, 83: 3 }),
      object(STRAIGHT_VERTEX, { 24: 20, 25: 0 }),
    ]);

    // Straight to cubic curves because the second vertex states an incoming handle; cubic to straight
    // curves because the second states an outgoing one.
    expect(path!.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CUBIC_CURVE_TO, PathCommand.CUBIC_CURVE_TO]);
  });

  it('centres a parametric path on its normalized origin', () => {
    const centred = createRivePath(object(RECTANGLE, { 20: 100, 21: 50 }), artboardOf([]), 0)!;
    const cornered = createRivePath(object(RECTANGLE, { 20: 100, 21: 50, 123: 0, 124: 0 }), artboardOf([]), 0)!;

    // The default origin is the centre, so the box straddles zero; an origin of 0,0 puts it below.
    expectPoints(centred.data.slice(0, 2), [-50, -25]);
    expectPoints(cornered.data.slice(0, 2), [0, 0]);
  });

  it('rounds every rectangle corner when the radii are linked', () => {
    const square = createRivePath(object(RECTANGLE, { 20: 100, 21: 100 }), artboardOf([]), 0)!;
    const rounded = createRivePath(object(RECTANGLE, { 20: 100, 21: 100, 31: 10 }), artboardOf([]), 0)!;

    expect(square.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
    expect(rounded.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.LINE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.LINE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.LINE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CLOSE,
    ]);
  });

  it('honours four distinct corner radii when they are unlinked', () => {
    const path = createRivePath(
      object(RECTANGLE, { 20: 100, 21: 100, 31: 10, 161: 0, 162: 20, 163: 0, 164: 0 }),
      artboardOf([]),
      0,
    )!;

    // Two of the four corners are square, so exactly two cubic corners are emitted.
    expect(path.commands.filter((command) => command === PathCommand.CUBIC_CURVE_TO)).toHaveLength(2);
  });

  it('builds ellipse, triangle, polygon and star geometry', () => {
    const ellipse = createRivePath(object(ELLIPSE, { 20: 40, 21: 20 }), artboardOf([]), 0)!;
    const triangle = createRivePath(object(TRIANGLE, { 20: 40, 21: 20 }), artboardOf([]), 0)!;
    const polygon = createRivePath(object(POLYGON, { 20: 40, 21: 40, 125: 6 }), artboardOf([]), 0)!;
    const star = createRivePath(object(STAR, { 20: 40, 21: 40, 125: 5, 127: 0.5 }), artboardOf([]), 0)!;

    expect(ellipse.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CUBIC_CURVE_TO,
      PathCommand.CLOSE,
    ]);
    expect(triangle.data).toEqual([0, -10, 20, 10, -20, 10]);
    expect(polygon.data).toHaveLength(12);
    // A five-pointed star alternates outer and inner vertices, so it carries ten points.
    expect(star.data).toHaveLength(20);
  });

  it('puts a star inner vertex at its stated fraction of the radius', () => {
    const star = createRivePath(object(STAR, { 20: 100, 21: 100, 125: 4, 127: 0.25 }), artboardOf([]), 0)!;
    const radii: number[] = [];
    for (let offset = 0; offset + 1 < star.data.length; offset += 2) {
      radii.push(Math.hypot(star.data[offset], star.data[offset + 1]));
    }

    expect(Math.max(...radii)).toBeCloseTo(50, 4);
    expect(Math.min(...radii)).toBeCloseTo(12.5, 4);
  });

  it('returns an empty path for a points path with no vertices', () => {
    expect(pointsPath(true, [])!.commands).toEqual([]);
  });

  // Corner rounding is checked against the geometry it claims rather than against the formula that
  // produced it: the corner is replaced by tangent points sitting `r` back along each edge, and the
  // curve between them stays inside the original corner.
  it('pulls a rounded corner back along both edges by its radius', () => {
    const radius = 10;
    const path = pointsPath(true, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 0, 26: radius }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 100 }),
    ])!;

    // The right-angle corner at (100,0) becomes an entry at (90,0) and an exit at (100,10).
    const points = pointPairs(path);
    expect(points).toContainEqual([90, 0]);
    expect(points).toContainEqual([100, 10]);
    expect(points).not.toContainEqual([100, 0]);
  });

  it('collapses to the circle ratio at a right angle', () => {
    const radius = 10;
    const path = pointsPath(true, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 0, 26: radius }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 100 }),
    ])!;
    const cubic = cubicAfter(path, [90, 0]);

    // A quarter turn's handles sit 0.5523r from each tangent point, the standard approximation, so
    // the first control is that far along the edge from (90,0) toward the corner.
    expect(cubic![0]).toBeCloseTo(90 + radius * 0.5522847498307936, 4);
    expect(cubic![1]).toBeCloseTo(0, 6);
  });

  it('clamps a radius larger than the edges can carry', () => {
    const path = pointsPath(true, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 20, 25: 0, 26: 1000 }),
      object(STRAIGHT_VERTEX, { 24: 20, 25: 20 }),
    ])!;

    // Half of the shorter adjoining edge is the ceiling, so the tangent points land at the midpoints.
    const points = pointPairs(path);
    expect(points).toContainEqual([10, 0]);
    expect(points).toContainEqual([20, 10]);
  });

  it('turns a negative radius into an inverted corner', () => {
    const radius = 10;
    const path = pointsPath(true, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 0, 26: -radius }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 100 }),
    ])!;
    const points = pointPairs(path);
    const cubic = cubicAfter(path, [90, 0]);

    // The tangent points stay one radius down each adjoining edge, but the cubic bends around the
    // authored vertex rather than toward it. At a right angle that is a concave quarter circle
    // centred on (100,0): its controls leave (90,0) downward and enter (100,10) from the left.
    expect(points).toContainEqual([90, 0]);
    expect(points).toContainEqual([100, 10]);
    expect(cubic![0]).toBeCloseTo(90, 6);
    expect(cubic![1]).toBeCloseTo(radius * 0.5522847498307936, 4);
    expect(cubic![2]).toBeCloseTo(100 - radius * 0.5522847498307936, 4);
    expect(cubic![3]).toBeCloseTo(10, 6);
  });

  it("leaves an open path's endpoints sharp, since a corner needs two edges", () => {
    const path = pointsPath(false, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0, 26: 5 }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 0, 26: 5 }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 100, 26: 5 }),
    ])!;
    const points = pointPairs(path);

    expect(points[0]).toEqual([0, 0]);
    expect(points).toContainEqual([100, 100]);
    // Only the middle vertex rounds, so exactly one corner cubic appears.
    expect(path.commands.filter((command) => command === PathCommand.CUBIC_CURVE_TO)).toHaveLength(1);
  });

  it('leaves a zero radius sharp', () => {
    const sharp = pointsPath(true, [
      object(STRAIGHT_VERTEX, { 24: 0, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 0 }),
      object(STRAIGHT_VERTEX, { 24: 100, 25: 100 }),
    ])!;

    expect(sharp.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
  });
});

// Anchor points only, walked through the verb stream so control points are not mistaken for them.
function pointPairs(path: { commands: number[]; data: number[] }): number[][] {
  const points: number[][] = [];
  let cursor = 0;
  for (const verb of path.commands) {
    if (verb === PathCommand.MOVE_TO || verb === PathCommand.LINE_TO) {
      points.push([path.data[cursor], path.data[cursor + 1]]);
      cursor += 2;
    } else if (verb === PathCommand.CUBIC_CURVE_TO) {
      points.push([path.data[cursor + 4], path.data[cursor + 5]]);
      cursor += 6;
    }
  }
  return points;
}

// The control points of the cubic that begins at the given anchor.
function cubicAfter(path: { commands: number[]; data: number[] }, from: readonly number[]): number[] | null {
  let cursor = 0;
  let current: number[] = [0, 0];
  for (const verb of path.commands) {
    if (verb === PathCommand.MOVE_TO || verb === PathCommand.LINE_TO) {
      current = [path.data[cursor], path.data[cursor + 1]];
      cursor += 2;
    } else if (verb === PathCommand.CUBIC_CURVE_TO) {
      if (current[0] === from[0] && current[1] === from[1]) return path.data.slice(cursor, cursor + 4);
      current = [path.data[cursor + 4], path.data[cursor + 5]];
      cursor += 6;
    }
  }
  return null;
}

function expectPoints(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index++) expect(actual[index]).toBeCloseTo(expected[index], 6);
}

function object(typeKey: number, properties: Readonly<Record<number, number>>): RiveCoreObject {
  return {
    properties: Object.entries(properties).map(([key, value]) => ({
      key: Number(key),
      type: RiveFieldType.Double,
      value,
    })),
    typeKey,
  };
}

function artboardOf(objects: RiveCoreObject[]): RiveArtboardGraph {
  return { objects, parentIndices: objects.map(() => -1), streamEnd: objects.length, streamStart: 0 };
}

// A points path with its vertices as children, matching how the stream numbers them.
function pointsPath(closed: boolean, vertices: RiveCoreObject[]) {
  const path = object(POINTS_PATH, closed ? { 32: 1 } : {});
  const objects = [path, ...vertices];
  const graph: RiveArtboardGraph = {
    objects,
    parentIndices: objects.map((_value, index) => (index === 0 ? -1 : 0)),
    streamEnd: objects.length,
    streamStart: 0,
  };
  return createRivePath(path, graph, 0);
}
