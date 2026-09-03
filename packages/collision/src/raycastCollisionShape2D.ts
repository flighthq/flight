import { createEntity } from '@flighthq/entity/contract';
import type { CollisionRaycastHit2D, CollisionBuiltInShape2D } from '@flighthq/types/contract';

import { getCollisionPolygonValidationStatus2D } from './collisionShapeValidation2D';
import { getCollisionShapeContainsPoint2D } from './pointContainment2D';

const RELATIVE_EPSILON = 1e-9;

export function createCollisionRaycastHit2D(): CollisionRaycastHit2D {
  return createEntity({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
}

// Writes the first exact intersection of `origin + direction * fraction` with `shape`. Direction need
// not be normalized; fraction therefore stays in the caller's parameterization. `maxFraction` bounds a
// segment or sweep without changing the ray direction, and defaults to an unbounded forward ray.
export function raycastCollisionShape2D(
  shape: Readonly<CollisionBuiltInShape2D>,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  out: CollisionRaycastHit2D,
  maxFraction = Number.POSITIVE_INFINITY,
): boolean {
  clearRaycastHit(out);
  if (
    !Number.isFinite(originX) ||
    !Number.isFinite(originY) ||
    !Number.isFinite(directionX) ||
    !Number.isFinite(directionY) ||
    Number.isNaN(maxFraction) ||
    maxFraction < 0
  ) {
    return false;
  }
  if (getCollisionShapeContainsPoint2D(shape, originX, originY)) {
    writeRaycastHit(out, originX, originY, directionX, directionY, 0, 0, 0);
    return true;
  }
  const directionLengthSquared = directionX * directionX + directionY * directionY;
  if (!(directionLengthSquared > 0)) return false;

  const scratch = acquireRaycastScratch();
  try {
    switch (shape.kind) {
      case 'circle':
        return raycastCircle(
          shape.x,
          shape.y,
          shape.radius,
          originX,
          originY,
          directionX,
          directionY,
          directionLengthSquared,
          maxFraction,
          out,
        );
      case 'aabb':
        return raycastBox(
          shape.minX,
          shape.minY,
          shape.maxX,
          shape.maxY,
          originX,
          originY,
          directionX,
          directionY,
          maxFraction,
          out,
        );
      case 'capsule':
        return raycastCapsule(
          shape,
          originX,
          originY,
          directionX,
          directionY,
          directionLengthSquared,
          maxFraction,
          out,
          scratch,
        );
      case 'obb':
        return raycastObb(shape, originX, originY, directionX, directionY, maxFraction, out, scratch);
      case 'polygon':
        return raycastPolygon(shape.points, originX, originY, directionX, directionY, maxFraction, out, scratch);
      case 'segment':
        return raycastSegment(
          shape.x0,
          shape.y0,
          shape.x1,
          shape.y1,
          originX,
          originY,
          directionX,
          directionY,
          directionLengthSquared,
          maxFraction,
          out,
          scratch,
        );
      case 'point':
        return raycastPoint(
          shape.x,
          shape.y,
          originX,
          originY,
          directionX,
          directionY,
          directionLengthSquared,
          maxFraction,
          out,
        );
      default:
        return false;
    }
  } finally {
    releaseRaycastScratch(scratch);
  }
}

function raycastCircle(
  centerX: number,
  centerY: number,
  radius: number,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  directionLengthSquared: number,
  maxFraction: number,
  out: CollisionRaycastHit2D,
): boolean {
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !(radius >= 0) || !Number.isFinite(radius)) {
    return false;
  }
  const mx = originX - centerX;
  const my = originY - centerY;
  const projection = mx * directionX + my * directionY;
  const discriminant = projection * projection - directionLengthSquared * (mx * mx + my * my - radius * radius);
  if (discriminant < 0) return false;
  const fraction = (-projection - Math.sqrt(discriminant)) / directionLengthSquared;
  if (fraction < 0 || fraction > maxFraction) return false;
  const x = originX + directionX * fraction;
  const y = originY + directionY * fraction;
  const normalLength = Math.hypot(x - centerX, y - centerY);
  const normalX = normalLength > 0 ? (x - centerX) / normalLength : 0;
  const normalY = normalLength > 0 ? (y - centerY) / normalLength : 0;
  writeRaycastHit(out, originX, originY, directionX, directionY, fraction, normalX, normalY);
  return true;
}

function raycastBox(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maxFraction: number,
  out: CollisionRaycastHit2D,
): boolean {
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    minX > maxX ||
    minY > maxY
  ) {
    return false;
  }
  let lower = 0;
  let upper = maxFraction;
  let normalX = 0;
  let normalY = 0;

  if (directionX === 0) {
    if (originX < minX || originX > maxX) return false;
  } else {
    const inverse = 1 / directionX;
    let first = (minX - originX) * inverse;
    let second = (maxX - originX) * inverse;
    let firstNormalX = -1;
    if (first > second) {
      const swap = first;
      first = second;
      second = swap;
      firstNormalX = 1;
    }
    if (first > lower) {
      lower = first;
      normalX = firstNormalX;
      normalY = 0;
    }
    if (second < upper) upper = second;
    if (lower > upper) return false;
  }

  if (directionY === 0) {
    if (originY < minY || originY > maxY) return false;
  } else {
    const inverse = 1 / directionY;
    let first = (minY - originY) * inverse;
    let second = (maxY - originY) * inverse;
    let firstNormalY = -1;
    if (first > second) {
      const swap = first;
      first = second;
      second = swap;
      firstNormalY = 1;
    }
    if (first > lower) {
      lower = first;
      normalX = 0;
      normalY = firstNormalY;
    }
    if (second < upper) upper = second;
    if (lower > upper) return false;
  }

  if (lower < 0 || lower > maxFraction) return false;
  writeRaycastHit(out, originX, originY, directionX, directionY, lower, normalX, normalY);
  return true;
}

// A capsule is EXACTLY the union of its two end discs and the rectangle between them, so this is the
// nearest of three hits against shapes that already have proven raycasts rather than a fourth quadratic
// written out by hand.
//
// The rectangle's flat END faces are not a leak, which is the only thing that makes the union safe to
// take naively: a ray crossing the face at `x = 0` does so at some `|y| < radius`, and that point is
// inside the first disc — so the disc was entered strictly earlier and wins the minimum. There is no
// case where an end face is the true first surface.
function raycastCapsule(
  shape: Readonly<Extract<CollisionBuiltInShape2D, { kind: 'capsule' }>>,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  directionLengthSquared: number,
  maxFraction: number,
  out: CollisionRaycastHit2D,
  scratch: RaycastScratch,
): boolean {
  if (
    !Number.isFinite(shape.x0) ||
    !Number.isFinite(shape.y0) ||
    !Number.isFinite(shape.x1) ||
    !Number.isFinite(shape.y1) ||
    !Number.isFinite(shape.radius) ||
    !(shape.radius > 0)
  ) {
    return false;
  }

  let best = Number.POSITIVE_INFINITY;
  let hit = false;
  const axisX = shape.x1 - shape.x0;
  const axisY = shape.y1 - shape.y0;
  const length = Math.sqrt(axisX * axisX + axisY * axisY);

  if (length > 0) {
    capsuleRectangleProbe.x = (shape.x0 + shape.x1) / 2;
    capsuleRectangleProbe.y = (shape.y0 + shape.y1) / 2;
    capsuleRectangleProbe.halfW = length / 2;
    capsuleRectangleProbe.halfH = shape.radius;
    capsuleRectangleProbe.rotation = Math.atan2(axisY, axisX);
    if (
      raycastObb(capsuleRectangleProbe, originX, originY, directionX, directionY, maxFraction, capsuleHit, scratch) &&
      capsuleHit.fraction < best
    ) {
      best = capsuleHit.fraction;
      hit = true;
      copyRaycastHit(capsuleHit, out);
    }
  }

  for (const [centerX, centerY] of [
    [shape.x0, shape.y0],
    [shape.x1, shape.y1],
  ]) {
    if (
      raycastCircle(
        centerX,
        centerY,
        shape.radius,
        originX,
        originY,
        directionX,
        directionY,
        directionLengthSquared,
        maxFraction,
        capsuleHit,
      ) &&
      capsuleHit.fraction < best
    ) {
      best = capsuleHit.fraction;
      hit = true;
      copyRaycastHit(capsuleHit, out);
    }
  }
  return hit;
}

function copyRaycastHit(source: Readonly<CollisionRaycastHit2D>, out: CollisionRaycastHit2D): void {
  out.fraction = source.fraction;
  out.x = source.x;
  out.y = source.y;
  out.normalX = source.normalX;
  out.normalY = source.normalY;
}

function raycastObb(
  shape: Readonly<Extract<CollisionBuiltInShape2D, { kind: 'obb' }>>,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maxFraction: number,
  out: CollisionRaycastHit2D,
  scratch: RaycastScratch,
): boolean {
  if (
    !Number.isFinite(shape.x) ||
    !Number.isFinite(shape.y) ||
    !(shape.halfW >= 0) ||
    !Number.isFinite(shape.halfW) ||
    !(shape.halfH >= 0) ||
    !Number.isFinite(shape.halfH) ||
    !Number.isFinite(shape.rotation)
  ) {
    return false;
  }
  const cos = Math.cos(shape.rotation);
  const sin = Math.sin(shape.rotation);
  const offsetX = originX - shape.x;
  const offsetY = originY - shape.y;
  const localOriginX = offsetX * cos + offsetY * sin;
  const localOriginY = -offsetX * sin + offsetY * cos;
  const localDirectionX = directionX * cos + directionY * sin;
  const localDirectionY = -directionX * sin + directionY * cos;
  if (
    !raycastBox(
      -shape.halfW,
      -shape.halfH,
      shape.halfW,
      shape.halfH,
      localOriginX,
      localOriginY,
      localDirectionX,
      localDirectionY,
      maxFraction,
      scratch.localHit,
    )
  ) {
    return false;
  }
  const normalX = scratch.localHit.normalX * cos - scratch.localHit.normalY * sin;
  const normalY = scratch.localHit.normalX * sin + scratch.localHit.normalY * cos;
  writeRaycastHit(out, originX, originY, directionX, directionY, scratch.localHit.fraction, normalX, normalY);
  return true;
}

function raycastPolygon(
  points: readonly number[],
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maxFraction: number,
  out: CollisionRaycastHit2D,
  scratch: RaycastScratch,
): boolean {
  if (getCollisionPolygonValidationStatus2D(points) !== null) return false;
  let bestFraction = maxFraction;
  let bestNormalX = 0;
  let bestNormalY = 0;
  let found = false;
  const count = points.length >> 1;
  polygonCenter(points, count, scratch.polygonCenter);
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const x0 = points[i << 1];
    const y0 = points[(i << 1) + 1];
    const x1 = points[j << 1];
    const y1 = points[(j << 1) + 1];
    if (
      !writeRaySegmentFraction(
        x0,
        y0,
        x1,
        y1,
        originX,
        originY,
        directionX,
        directionY,
        directionX * directionX + directionY * directionY,
        bestFraction,
        scratch.fraction,
      )
    ) {
      continue;
    }
    const edgeX = x1 - x0;
    const edgeY = y1 - y0;
    const length = Math.hypot(edgeX, edgeY);
    if (!(length > 0)) continue;
    let normalX = edgeY / length;
    let normalY = -edgeX / length;
    const middleX = (x0 + x1) * 0.5;
    const middleY = (y0 + y1) * 0.5;
    if (normalX * (scratch.polygonCenter.x - middleX) + normalY * (scratch.polygonCenter.y - middleY) > 0) {
      normalX = -normalX;
      normalY = -normalY;
    }
    bestFraction = scratch.fraction.value;
    bestNormalX = normalX;
    bestNormalY = normalY;
    found = true;
  }
  if (!found) return false;
  writeRaycastHit(out, originX, originY, directionX, directionY, bestFraction, bestNormalX, bestNormalY);
  return true;
}

function polygonCenter(points: readonly number[], count: number, out: { x: number; y: number }): void {
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    x += points[i << 1];
    y += points[(i << 1) + 1];
  }
  out.x = x / count;
  out.y = y / count;
}

function raycastSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  directionLengthSquared: number,
  maxFraction: number,
  out: CollisionRaycastHit2D,
  scratch: RaycastScratch,
): boolean {
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return false;
  if (
    !writeRaySegmentFraction(
      x0,
      y0,
      x1,
      y1,
      originX,
      originY,
      directionX,
      directionY,
      directionLengthSquared,
      maxFraction,
      scratch.fraction,
    )
  ) {
    return false;
  }
  const edgeX = x1 - x0;
  const edgeY = y1 - y0;
  const edgeLength = Math.hypot(edgeX, edgeY);
  let normalX = edgeLength > 0 ? edgeY / edgeLength : 0;
  let normalY = edgeLength > 0 ? -edgeX / edgeLength : 0;
  if (normalX * directionX + normalY * directionY > 0) {
    normalX = -normalX;
    normalY = -normalY;
  }
  writeRaycastHit(out, originX, originY, directionX, directionY, scratch.fraction.value, normalX, normalY);
  return true;
}

function writeRaySegmentFraction(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  directionLengthSquared: number,
  maxFraction: number,
  out: { value: number },
): boolean {
  const edgeX = x1 - x0;
  const edgeY = y1 - y0;
  const offsetX = x0 - originX;
  const offsetY = y0 - originY;
  const denominator = directionX * edgeY - directionY * edgeX;
  const scale = Math.sqrt(directionLengthSquared * (edgeX * edgeX + edgeY * edgeY));
  if (Math.abs(denominator) <= scale * RELATIVE_EPSILON) {
    const cross = offsetX * directionY - offsetY * directionX;
    if (Math.abs(cross) > Math.sqrt(directionLengthSquared) * RELATIVE_EPSILON) return false;
    const first = (offsetX * directionX + offsetY * directionY) / directionLengthSquared;
    const second = ((x1 - originX) * directionX + (y1 - originY) * directionY) / directionLengthSquared;
    const far = Math.max(first, second);
    const fraction = Math.max(0, Math.min(first, second));
    if (far < 0 || fraction > maxFraction) return false;
    out.value = fraction;
    return true;
  }
  const fraction = (offsetX * edgeY - offsetY * edgeX) / denominator;
  const edgeFraction = (offsetX * directionY - offsetY * directionX) / denominator;
  if (
    fraction < -RELATIVE_EPSILON ||
    fraction > maxFraction ||
    edgeFraction < -RELATIVE_EPSILON ||
    edgeFraction > 1 + RELATIVE_EPSILON
  ) {
    return false;
  }
  out.value = fraction < 0 ? 0 : fraction;
  return true;
}

function raycastPoint(
  pointX: number,
  pointY: number,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  directionLengthSquared: number,
  maxFraction: number,
  out: CollisionRaycastHit2D,
): boolean {
  if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return false;
  const offsetX = pointX - originX;
  const offsetY = pointY - originY;
  const fraction = (offsetX * directionX + offsetY * directionY) / directionLengthSquared;
  if (fraction < 0 || fraction > maxFraction) return false;
  const hitX = originX + directionX * fraction;
  const hitY = originY + directionY * fraction;
  // Tolerance follows world extent, not direction magnitude: scaling a direction changes its fraction
  // parameterization but must not turn the same geometric ray from a miss into a hit.
  const epsilon = Math.max(1, Math.hypot(offsetX, offsetY)) * RELATIVE_EPSILON;
  if (Math.hypot(hitX - pointX, hitY - pointY) > epsilon) return false;
  writeRaycastHit(out, originX, originY, directionX, directionY, fraction, 0, 0);
  return true;
}

function writeRaycastHit(
  out: CollisionRaycastHit2D,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  fraction: number,
  normalX: number,
  normalY: number,
): void {
  out.fraction = fraction;
  out.x = originX + directionX * fraction;
  out.y = originY + directionY * fraction;
  out.normalX = normalX;
  out.normalY = normalY;
}

function clearRaycastHit(out: CollisionRaycastHit2D): void {
  out.fraction = 0;
  out.x = 0;
  out.y = 0;
  out.normalX = 0;
  out.normalY = 0;
}

interface RaycastScratch {
  localHit: CollisionRaycastHit2D;
  fraction: { value: number };
  polygonCenter: { x: number; y: number };
}

function acquireRaycastScratch(): RaycastScratch {
  return raycastScratchPool.pop() ?? createRaycastScratch();
}

function createRaycastScratch(): RaycastScratch {
  return {
    localHit: createCollisionRaycastHit2D(),
    fraction: { value: 0 },
    polygonCenter: { x: 0, y: 0 },
  };
}

function releaseRaycastScratch(scratch: RaycastScratch): void {
  raycastScratchPool.push(scratch);
}

const raycastScratchPool: RaycastScratch[] = [createRaycastScratch()];

// Reused across capsule raycasts so the three sub-shape tests allocate nothing. Rebound per call.
const capsuleHit: CollisionRaycastHit2D = createCollisionRaycastHit2D();
const capsuleRectangleProbe: Extract<CollisionBuiltInShape2D, { kind: 'obb' }> = {
  kind: 'obb',
  x: 0,
  y: 0,
  halfW: 0,
  halfH: 0,
  rotation: 0,
};
