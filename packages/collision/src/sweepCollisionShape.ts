import type { CollisionShape, CollisionTimeOfImpact } from '@flighthq/types/contract';

import { collideContactManifold } from './collideContactManifold';
import { getCollisionShapeValidationStatus } from './collisionShapeValidation';
import { createCollisionContactManifold } from './contactManifold';
import { writeAabbVertices, writeObbVertices } from './convexVertices';

export function createCollisionTimeOfImpact(): CollisionTimeOfImpact {
  return { fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 };
}

// Finds the exact first contact under LINEAR TRANSLATION of both shapes. Circle-circle uses its
// quadratic root, circle-polygon uses the polygon's rounded face/vertex expansion, and polygon pairs
// use continuous SAT. Those are the complete convex area-shape combinations supported by the discrete
// manifold dispatcher; point/segment and invalid/custom kinds fail closed and fully clear `out`.
export function sweepCollisionShape(
  shapeA: Readonly<CollisionShape>,
  translationAX: number,
  translationAY: number,
  shapeB: Readonly<CollisionShape>,
  translationBX: number,
  translationBY: number,
  out: CollisionTimeOfImpact,
  maxFraction = 1,
): boolean {
  clearCollisionTimeOfImpact(out);
  if (
    !Number.isFinite(translationAX) ||
    !Number.isFinite(translationAY) ||
    !Number.isFinite(translationBX) ||
    !Number.isFinite(translationBY) ||
    !Number.isFinite(maxFraction) ||
    maxFraction < 0 ||
    getCollisionShapeValidationStatus(shapeA) !== null ||
    getCollisionShapeValidationStatus(shapeB) !== null
  ) {
    return false;
  }

  const scratch = acquireCollisionSweepScratch();
  try {
    return sweepCollisionShapeWithScratch(
      shapeA,
      translationAX,
      translationAY,
      shapeB,
      translationBX,
      translationBY,
      out,
      maxFraction,
      scratch,
    );
  } finally {
    releaseCollisionSweepScratch(scratch);
  }
}

function sweepCollisionShapeWithScratch(
  shapeA: Readonly<CollisionShape>,
  translationAX: number,
  translationAY: number,
  shapeB: Readonly<CollisionShape>,
  translationBX: number,
  translationBY: number,
  out: CollisionTimeOfImpact,
  maxFraction: number,
  scratch: CollisionSweepScratch,
): boolean {
  if (collideContactManifold(shapeA, shapeB, scratch.manifold)) {
    out.normalX = canonicalZero(scratch.manifold.normalX);
    out.normalY = canonicalZero(scratch.manifold.normalY);
    writeShapeASupport(shapeA, 0, 0, out, scratch);
    return true;
  }

  const relativeX = translationAX - translationBX;
  const relativeY = translationAY - translationBY;
  let hit = false;
  if (shapeA.kind === 'circle') {
    if (shapeB.kind === 'circle') {
      hit = sweepCircleCircle(
        shapeA.x,
        shapeA.y,
        shapeA.radius,
        shapeB.x,
        shapeB.y,
        shapeB.radius,
        relativeX,
        relativeY,
        out,
      );
    } else {
      const verticesB = writeShapeVertices(shapeB, scratch.verticesB);
      if (verticesB !== null) {
        hit = sweepCirclePolygon(shapeA.x, shapeA.y, shapeA.radius, verticesB, relativeX, relativeY, out);
      }
    }
  } else if (shapeB.kind === 'circle') {
    const verticesA = writeShapeVertices(shapeA, scratch.verticesA);
    if (verticesA !== null) {
      hit = sweepCirclePolygon(shapeB.x, shapeB.y, shapeB.radius, verticesA, -relativeX, -relativeY, out);
      if (hit) {
        out.normalX = -out.normalX;
        out.normalY = -out.normalY;
      }
    }
  } else {
    const verticesA = writeShapeVertices(shapeA, scratch.verticesA);
    const verticesB = writeShapeVertices(shapeB, scratch.verticesB);
    if (verticesA !== null && verticesB !== null) {
      hit = sweepPolygonPolygon(verticesA, verticesB, relativeX, relativeY, maxFraction, out, scratch);
    }
  }

  if (!hit || out.fraction < 0 || out.fraction > maxFraction) {
    clearCollisionTimeOfImpact(out);
    return false;
  }
  out.normalX = canonicalZero(out.normalX);
  out.normalY = canonicalZero(out.normalY);
  writeShapeASupport(shapeA, translationAX * out.fraction, translationAY * out.fraction, out, scratch);
  return true;
}

function sweepCircleCircle(
  ax: number,
  ay: number,
  radiusA: number,
  bx: number,
  by: number,
  radiusB: number,
  velocityX: number,
  velocityY: number,
  out: CollisionTimeOfImpact,
): boolean {
  const offsetX = ax - bx;
  const offsetY = ay - by;
  const radius = radiusA + radiusB;
  const a = velocityX * velocityX + velocityY * velocityY;
  if (!(a > 0)) return false;
  const b = 2 * (offsetX * velocityX + offsetY * velocityY);
  const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;
  const fraction = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (fraction < 0) return false;
  const normalX = offsetX + velocityX * fraction;
  const normalY = offsetY + velocityY * fraction;
  const length = Math.hypot(normalX, normalY);
  if (!(length > 0)) return false;
  out.fraction = fraction;
  out.normalX = normalX / length;
  out.normalY = normalY / length;
  return true;
}

function sweepCirclePolygon(
  centerX: number,
  centerY: number,
  radius: number,
  vertices: ArrayLike<number>,
  velocityX: number,
  velocityY: number,
  out: CollisionTimeOfImpact,
): boolean {
  let bestFraction = Number.POSITIVE_INFINITY;
  let bestNormalX = 0;
  let bestNormalY = 0;
  const count = vertices.length >> 1;
  const winding = polygonAreaTwice(vertices) >= 0 ? 1 : -1;

  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const x0 = vertices[i << 1];
    const y0 = vertices[(i << 1) + 1];
    const x1 = vertices[next << 1];
    const y1 = vertices[(next << 1) + 1];
    const edgeX = x1 - x0;
    const edgeY = y1 - y0;
    const edgeLength = Math.hypot(edgeX, edgeY);
    if (!(edgeLength > 0)) continue;
    const normalX = (winding * edgeY) / edgeLength;
    const normalY = (-winding * edgeX) / edgeLength;
    const speed = normalX * velocityX + normalY * velocityY;
    const separation = normalX * (centerX - x0) + normalY * (centerY - y0);
    if (speed < 0 && separation >= radius) {
      const fraction = (radius - separation) / speed;
      const hitCenterX = centerX + velocityX * fraction;
      const hitCenterY = centerY + velocityY * fraction;
      const edgeFraction = ((hitCenterX - x0) * edgeX + (hitCenterY - y0) * edgeY) / (edgeLength * edgeLength);
      if (fraction >= 0 && edgeFraction >= 0 && edgeFraction <= 1 && fraction < bestFraction) {
        bestFraction = fraction;
        bestNormalX = normalX;
        bestNormalY = normalY;
      }
    }

    const vertexFraction = rayCircleFraction(centerX, centerY, velocityX, velocityY, x0, y0, radius);
    if (vertexFraction >= 0 && vertexFraction < bestFraction) {
      const hitX = centerX + velocityX * vertexFraction;
      const hitY = centerY + velocityY * vertexFraction;
      const normalLength = Math.hypot(hitX - x0, hitY - y0);
      if (normalLength > 0) {
        bestFraction = vertexFraction;
        bestNormalX = (hitX - x0) / normalLength;
        bestNormalY = (hitY - y0) / normalLength;
      }
    }
  }

  if (!Number.isFinite(bestFraction)) return false;
  out.fraction = bestFraction;
  out.normalX = bestNormalX;
  out.normalY = bestNormalY;
  return true;
}

function sweepPolygonPolygon(
  verticesA: ArrayLike<number>,
  verticesB: ArrayLike<number>,
  velocityX: number,
  velocityY: number,
  maxFraction: number,
  out: CollisionTimeOfImpact,
  scratch: CollisionSweepScratch,
): boolean {
  scratch.entry = Number.NEGATIVE_INFINITY;
  scratch.exit = maxFraction;
  scratch.normalX = 0;
  scratch.normalY = 0;
  if (!sweepPolygonAxes(verticesA, verticesA, verticesB, velocityX, velocityY, scratch)) return false;
  if (!sweepPolygonAxes(verticesB, verticesA, verticesB, velocityX, velocityY, scratch)) return false;
  if (scratch.entry < 0 || scratch.entry > scratch.exit || scratch.entry > maxFraction) return false;
  out.fraction = scratch.entry;
  out.normalX = scratch.normalX;
  out.normalY = scratch.normalY;
  return true;
}

function sweepPolygonAxes(
  axes: ArrayLike<number>,
  verticesA: ArrayLike<number>,
  verticesB: ArrayLike<number>,
  velocityX: number,
  velocityY: number,
  scratch: CollisionSweepScratch,
): boolean {
  const count = axes.length >> 1;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const edgeX = axes[next << 1] - axes[i << 1];
    const edgeY = axes[(next << 1) + 1] - axes[(i << 1) + 1];
    const length = Math.hypot(edgeX, edgeY);
    if (!(length > 0)) continue;
    const axisX = -edgeY / length;
    const axisY = edgeX / length;
    projectVertices(verticesA, axisX, axisY, scratch);
    const minA = scratch.projectionMin;
    const maxA = scratch.projectionMax;
    projectVertices(verticesB, axisX, axisY, scratch);
    const minB = scratch.projectionMin;
    const maxB = scratch.projectionMax;
    const speed = velocityX * axisX + velocityY * axisY;
    if (speed === 0) {
      if (maxA < minB || maxB < minA) return false;
      continue;
    }
    let entry = (minB - maxA) / speed;
    let exit = (maxB - minA) / speed;
    let normalX = -axisX;
    let normalY = -axisY;
    if (entry > exit) {
      const swap = entry;
      entry = exit;
      exit = swap;
      normalX = axisX;
      normalY = axisY;
    }
    if (entry > scratch.entry) {
      scratch.entry = entry;
      scratch.normalX = normalX;
      scratch.normalY = normalY;
    }
    if (exit < scratch.exit) scratch.exit = exit;
    if (scratch.entry > scratch.exit) return false;
  }
  return true;
}

function rayCircleFraction(
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  centerX: number,
  centerY: number,
  radius: number,
): number {
  const a = directionX * directionX + directionY * directionY;
  if (!(a > 0)) return -1;
  const offsetX = originX - centerX;
  const offsetY = originY - centerY;
  const b = 2 * (offsetX * directionX + offsetY * directionY);
  const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return -1;
  return (-b - Math.sqrt(discriminant)) / (2 * a);
}

function writeShapeVertices(shape: Readonly<CollisionShape>, scratch: Float64Array): ArrayLike<number> | null {
  switch (shape.kind) {
    case 'aabb':
      writeAabbVertices(shape, scratch);
      return scratch;
    case 'obb':
      writeObbVertices(shape, scratch);
      return scratch;
    case 'polygon':
      return shape.points;
    default:
      return null;
  }
}

function writeShapeASupport(
  shape: Readonly<CollisionShape>,
  translationX: number,
  translationY: number,
  out: CollisionTimeOfImpact,
  scratch: CollisionSweepScratch,
): void {
  if (shape.kind === 'circle') {
    out.x = shape.x + translationX - out.normalX * shape.radius;
    out.y = shape.y + translationY - out.normalY * shape.radius;
    return;
  }
  const vertices = writeShapeVertices(shape, scratch.verticesA);
  if (vertices === null) return;
  let best = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < vertices.length; i += 2) {
    const projection = -out.normalX * vertices[i] - out.normalY * vertices[i + 1];
    if (projection > best) best = projection;
  }
  // A face has two equally extreme vertices. Choosing whichever appears first turns an ordinary
  // face impact into an arbitrary corner impact and hands a rigid-body solver a fictitious lever arm.
  // Average the complete tied support feature; a vertex remains itself, a face becomes its midpoint.
  const epsilon = 1e-9 * Math.max(1, Math.abs(best));
  let count = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < vertices.length; i += 2) {
    const projection = -out.normalX * vertices[i] - out.normalY * vertices[i + 1];
    if (Math.abs(projection - best) > epsilon) continue;
    x += vertices[i];
    y += vertices[i + 1];
    count++;
  }
  if (count > 0) {
    out.x = x / count + translationX;
    out.y = y / count + translationY;
  }
}

function projectVertices(
  vertices: ArrayLike<number>,
  axisX: number,
  axisY: number,
  scratch: CollisionSweepScratch,
): void {
  scratch.projectionMin = Number.POSITIVE_INFINITY;
  scratch.projectionMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < vertices.length; i += 2) {
    const projection = vertices[i] * axisX + vertices[i + 1] * axisY;
    if (projection < scratch.projectionMin) scratch.projectionMin = projection;
    if (projection > scratch.projectionMax) scratch.projectionMax = projection;
  }
}

function polygonAreaTwice(vertices: ArrayLike<number>): number {
  let area = 0;
  const count = vertices.length >> 1;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    area += vertices[i << 1] * vertices[(next << 1) + 1] - vertices[next << 1] * vertices[(i << 1) + 1];
  }
  return area;
}

function clearCollisionTimeOfImpact(out: CollisionTimeOfImpact): void {
  out.fraction = 0;
  out.x = 0;
  out.y = 0;
  out.normalX = 0;
  out.normalY = 0;
}

function canonicalZero(value: number): number {
  return value === 0 ? 0 : value;
}

interface CollisionSweepScratch {
  manifold: ReturnType<typeof createCollisionContactManifold>;
  verticesA: Float64Array;
  verticesB: Float64Array;
  projectionMin: number;
  projectionMax: number;
  entry: number;
  exit: number;
  normalX: number;
  normalY: number;
}

function acquireCollisionSweepScratch(): CollisionSweepScratch {
  return collisionSweepScratchPool.pop() ?? createCollisionSweepScratch();
}

function createCollisionSweepScratch(): CollisionSweepScratch {
  return {
    manifold: createCollisionContactManifold(),
    verticesA: new Float64Array(8),
    verticesB: new Float64Array(8),
    projectionMin: 0,
    projectionMax: 0,
    entry: 0,
    exit: 0,
    normalX: 0,
    normalY: 0,
  };
}

function releaseCollisionSweepScratch(scratch: CollisionSweepScratch): void {
  collisionSweepScratchPool.push(scratch);
}

const collisionSweepScratchPool: CollisionSweepScratch[] = [createCollisionSweepScratch()];
