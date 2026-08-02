import {
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathEllipse,
  appendPathLineTo,
  appendPathMoveTo,
  appendPathPolygon,
  appendPathRectangle,
  appendPathRoundRectangle,
  createPath,
} from '@flighthq/path/contract';
import type { Path, RiveArtboardGraph, RiveCoreObject } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Builds one Rive path component's geometry in its own local space.
 *
 * Rive keeps a cubic vertex's handles in **polar** form — an angle and a distance from the vertex —
 * rather than as absolute control points, and the three cubic kinds do not share a sign convention:
 * a mirrored or asymmetric vertex places its incoming handle by *subtracting* its vector, while a
 * detached vertex *adds* its own separately-stated one. Applying one rule to all three bends every
 * detached curve the wrong way.
 *
 * Returns null for a path kind this importer does not build.
 */
export function createRivePath(
  path: Readonly<RiveCoreObject>,
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
): Path | null {
  if (isRiveCoreTypeDerivedFrom(path.typeKey, RIVE_POINTS_COMMON_PATH)) {
    return createRivePointsPath(path, artboard, index);
  }
  if (isRiveCoreTypeDerivedFrom(path.typeKey, RIVE_PARAMETRIC_PATH)) return createRiveParametricPath(path);
  return null;
}

function createRivePointsPath(
  source: Readonly<RiveCoreObject>,
  artboard: Readonly<RiveArtboardGraph>,
  index: number,
): Path {
  const vertices = collectRiveVertices(artboard, index);
  const path = createPath();
  if (vertices.length === 0) return path;

  const closed = readRiveFlag(source, RIVE_IS_CLOSED, false);
  const first = vertices[0];
  appendPathMoveTo(path, first.x, first.y);
  const limit = closed ? vertices.length : vertices.length - 1;
  for (let step = 0; step < limit; step++) {
    const from = vertices[step];
    const to = vertices[(step + 1) % vertices.length];
    // A segment is a line only when neither end states a handle; one handle still curves it.
    if (from.outX === from.x && from.outY === from.y && to.inX === to.x && to.inY === to.y) {
      appendPathLineTo(path, to.x, to.y);
    } else {
      appendPathCubicCurveTo(path, from.outX, from.outY, to.inX, to.inY, to.x, to.y);
    }
  }
  if (closed) appendPathClose(path);
  return path;
}

function createRiveParametricPath(source: Readonly<RiveCoreObject>): Path {
  const path = createPath();
  const width = readRiveDouble(source, RIVE_PARAMETRIC_WIDTH, 0);
  const height = readRiveDouble(source, RIVE_PARAMETRIC_HEIGHT, 0);
  // A parametric path's origin is normalized within its own box, defaulting to the centre, so the
  // box's top-left is offset by that fraction of its size.
  const left = -readRiveDouble(source, RIVE_PARAMETRIC_ORIGIN_X, 0.5) * width;
  const top = -readRiveDouble(source, RIVE_PARAMETRIC_ORIGIN_Y, 0.5) * height;

  if (isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_ELLIPSE)) {
    appendPathEllipse(path, left + width / 2, top + height / 2, width / 2, height / 2);
    return path;
  }
  if (isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_POLYGON)) {
    appendRivePolygonPath(path, source, left, top, width, height);
    return path;
  }
  if (isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_TRIANGLE)) {
    appendPathPolygon(path, [left + width / 2, top, left + width, top + height, left, top + height]);
    return path;
  }
  if (isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_RECTANGLE)) {
    appendRiveRectanglePath(path, source, left, top, width, height);
    return path;
  }
  appendPathRectangle(path, left, top, width, height);
  return path;
}

function appendRiveRectanglePath(
  path: Path,
  source: Readonly<RiveCoreObject>,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  // With the corners linked, the top-left radius is the one that speaks for all four.
  const linked = readRiveFlag(source, RIVE_LINK_CORNER_RADIUS, true);
  const topLeft = readRiveDouble(source, RIVE_CORNER_RADIUS_TL, 0);
  const radii = linked
    ? [topLeft, topLeft, topLeft, topLeft]
    : [
        topLeft,
        readRiveDouble(source, RIVE_CORNER_RADIUS_TR, 0),
        readRiveDouble(source, RIVE_CORNER_RADIUS_BL, 0),
        readRiveDouble(source, RIVE_CORNER_RADIUS_BR, 0),
      ];
  const uniform = radii.every((radius) => radius === radii[0]);
  if (uniform && radii[0] > 0) {
    appendPathRoundRectangle(path, left, top, width, height, radii[0]);
    return;
  }
  if (uniform) {
    appendPathRectangle(path, left, top, width, height);
    return;
  }
  appendRivePerCornerRectangle(path, left, top, width, height, radii);
}

// Flight's rounded rectangle takes one radius, so four distinct corners are emitted directly. Each
// corner is a cubic approximating a quarter turn, which is what the round-rectangle helper does too.
function appendRivePerCornerRectangle(
  path: Path,
  left: number,
  top: number,
  width: number,
  height: number,
  radii: readonly number[],
): void {
  const limit = Math.min(width, height) / 2;
  const [tl, tr, bl, br] = radii.map((radius) => Math.max(0, Math.min(radius, limit)));
  const right = left + width;
  const bottom = top + height;
  const k = CIRCLE_CUBIC_RATIO;
  appendPathMoveTo(path, left + tl, top);
  appendPathLineTo(path, right - tr, top);
  if (tr > 0) appendPathCubicCurveTo(path, right - tr + tr * k, top, right, top + tr - tr * k, right, top + tr);
  appendPathLineTo(path, right, bottom - br);
  if (br > 0) {
    appendPathCubicCurveTo(path, right, bottom - br + br * k, right - br + br * k, bottom, right - br, bottom);
  }
  appendPathLineTo(path, left + bl, bottom);
  if (bl > 0) appendPathCubicCurveTo(path, left + bl - bl * k, bottom, left, bottom - bl + bl * k, left, bottom - bl);
  appendPathLineTo(path, left, top + tl);
  if (tl > 0) appendPathCubicCurveTo(path, left, top + tl - tl * k, left + tl - tl * k, top, left + tl, top);
  appendPathClose(path);
}

function appendRivePolygonPath(
  path: Path,
  source: Readonly<RiveCoreObject>,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  const points = Math.max(3, Math.round(readRiveDouble(source, RIVE_POLYGON_POINTS, 5)));
  const star = isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_STAR);
  const innerRatio = star ? readRiveDouble(source, RIVE_STAR_INNER_RADIUS, 0.5) : 1;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const count = star ? points * 2 : points;
  const vertices: number[] = [];
  for (let index = 0; index < count; index++) {
    // The first point sits at the top, so the sweep starts a quarter turn back.
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    const ratio = star && index % 2 === 1 ? innerRatio : 1;
    vertices.push(centerX + Math.cos(angle) * (width / 2) * ratio, centerY + Math.sin(angle) * (height / 2) * ratio);
  }
  appendPathPolygon(path, vertices);
}

interface RiveVertexPoint {
  inX: number;
  inY: number;
  outX: number;
  outY: number;
  x: number;
  y: number;
}

function collectRiveVertices(artboard: Readonly<RiveArtboardGraph>, pathIndex: number): RiveVertexPoint[] {
  const points: RiveVertexPoint[] = [];
  for (let index = pathIndex + 1; index < artboard.objects.length; index++) {
    if (artboard.parentIndices[index] !== pathIndex) continue;
    const object = artboard.objects[index];
    if (!isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_PATH_VERTEX)) continue;
    points.push(createRiveVertexPoint(object));
  }
  return points;
}

function createRiveVertexPoint(source: Readonly<RiveCoreObject>): RiveVertexPoint {
  const x = readRiveDouble(source, RIVE_VERTEX_X, 0);
  const y = readRiveDouble(source, RIVE_VERTEX_Y, 0);
  const point: RiveVertexPoint = { inX: x, inY: y, outX: x, outY: y, x, y };

  if (isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_CUBIC_DETACHED_VERTEX)) {
    const inRotation = readRiveDouble(source, RIVE_IN_ROTATION, 0);
    const inDistance = readRiveDouble(source, RIVE_IN_DISTANCE, 0);
    const outRotation = readRiveDouble(source, RIVE_OUT_ROTATION, 0);
    const outDistance = readRiveDouble(source, RIVE_OUT_DISTANCE, 0);
    // Detached states each handle independently and ADDS both, unlike its collinear siblings.
    point.inX = x + Math.cos(inRotation) * inDistance;
    point.inY = y + Math.sin(inRotation) * inDistance;
    point.outX = x + Math.cos(outRotation) * outDistance;
    point.outY = y + Math.sin(outRotation) * outDistance;
    return point;
  }
  if (isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_CUBIC_MIRRORED_VERTEX)) {
    const rotation = readRiveDouble(source, RIVE_MIRRORED_ROTATION, 0);
    const distance = readRiveDouble(source, RIVE_MIRRORED_DISTANCE, 0);
    return applyRiveCollinearHandles(point, rotation, distance, distance);
  }
  if (isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_CUBIC_ASYMMETRIC_VERTEX)) {
    const rotation = readRiveDouble(source, RIVE_ASYMMETRIC_ROTATION, 0);
    return applyRiveCollinearHandles(
      point,
      rotation,
      readRiveDouble(source, RIVE_ASYMMETRIC_IN_DISTANCE, 0),
      readRiveDouble(source, RIVE_ASYMMETRIC_OUT_DISTANCE, 0),
    );
  }
  return point;
}

// One angle serves both handles: the outgoing one points along it and the incoming one directly
// opposite, which is what keeps the pair collinear through the vertex.
function applyRiveCollinearHandles(
  point: RiveVertexPoint,
  rotation: number,
  inDistance: number,
  outDistance: number,
): RiveVertexPoint {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  point.inX = point.x - cosine * inDistance;
  point.inY = point.y - sine * inDistance;
  point.outX = point.x + cosine * outDistance;
  point.outY = point.y + sine * outDistance;
  return point;
}

function readRiveDouble(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveFlag(source: Readonly<RiveCoreObject>, key: number, fallback: boolean): boolean {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value !== 0;
}

const CIRCLE_CUBIC_RATIO = 0.5522847498307936;

const RIVE_PATH_VERTEX = 14;
const RIVE_POINTS_COMMON_PATH = 620;
const RIVE_PARAMETRIC_PATH = 15;
const RIVE_RECTANGLE = 7;
const RIVE_ELLIPSE = 4;
const RIVE_TRIANGLE = 8;
const RIVE_POLYGON = 51;
const RIVE_STAR = 52;
const RIVE_CUBIC_DETACHED_VERTEX = 6;
const RIVE_CUBIC_MIRRORED_VERTEX = 35;
const RIVE_CUBIC_ASYMMETRIC_VERTEX = 34;

const RIVE_PARAMETRIC_WIDTH = 20;
const RIVE_PARAMETRIC_HEIGHT = 21;
const RIVE_VERTEX_X = 24;
const RIVE_VERTEX_Y = 25;
const RIVE_IS_CLOSED = 32;
const RIVE_CORNER_RADIUS_TL = 31;
const RIVE_ASYMMETRIC_ROTATION = 79;
const RIVE_ASYMMETRIC_IN_DISTANCE = 80;
const RIVE_ASYMMETRIC_OUT_DISTANCE = 81;
const RIVE_MIRRORED_ROTATION = 82;
const RIVE_MIRRORED_DISTANCE = 83;
const RIVE_IN_ROTATION = 84;
const RIVE_IN_DISTANCE = 85;
const RIVE_OUT_ROTATION = 86;
const RIVE_OUT_DISTANCE = 87;
const RIVE_PARAMETRIC_ORIGIN_X = 123;
const RIVE_PARAMETRIC_ORIGIN_Y = 124;
const RIVE_POLYGON_POINTS = 125;
const RIVE_STAR_INNER_RADIUS = 127;
const RIVE_CORNER_RADIUS_TR = 161;
const RIVE_CORNER_RADIUS_BL = 162;
const RIVE_CORNER_RADIUS_BR = 163;
const RIVE_LINK_CORNER_RADIUS = 164;
