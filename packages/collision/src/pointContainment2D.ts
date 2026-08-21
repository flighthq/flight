import type { CollisionBuiltInShape2D } from '@flighthq/types/contract';

import { getCollisionPolygonValidationStatus2D } from './collisionShapeValidation2D';

const RELATIVE_EPSILON = 1e-9;

// Whether the point (`x`,`y`) lies inside a collider. Boundary-inclusive: a point exactly on the
// edge of any shape counts as contained. For the area-less kinds this degrades to an on-shape test —
// `segment` returns true when the point lies on the segment (within epsilon), `point` when the two
// points coincide (within epsilon). Unknown kinds return false. The polygon is assumed convex.
export function getCollisionShapeContainsPoint2D(
  shape: Readonly<CollisionBuiltInShape2D>,
  x: number,
  y: number,
): boolean {
  switch (shape.kind) {
    case 'circle': {
      const dx = x - shape.x;
      const dy = y - shape.y;
      return dx * dx + dy * dy <= shape.radius * shape.radius;
    }
    case 'aabb':
      return x >= shape.minX && x <= shape.maxX && y >= shape.minY && y <= shape.maxY;
    case 'obb': {
      const cos = Math.cos(shape.rotation);
      const sin = Math.sin(shape.rotation);
      const dx = x - shape.x;
      const dy = y - shape.y;
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      return Math.abs(localX) <= shape.halfW && Math.abs(localY) <= shape.halfH;
    }
    case 'capsule': {
      // Distance to the SEGMENT, not to a rectangle plus two discs: the capsule is by definition the set
      // of points within `radius` of it, so one clamped projection answers the body and both caps at
      // once with no seam between them to get wrong.
      const dx = shape.x1 - shape.x0;
      const dy = shape.y1 - shape.y0;
      const lengthSquared = dx * dx + dy * dy;
      let t = 0;
      if (lengthSquared > 0) {
        t = ((x - shape.x0) * dx + (y - shape.y0) * dy) / lengthSquared;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      const cx = x - (shape.x0 + t * dx);
      const cy = y - (shape.y0 + t * dy);
      return cx * cx + cy * cy <= shape.radius * shape.radius;
    }
    case 'polygon':
      if (getCollisionPolygonValidationStatus2D(shape.points) !== null) return false;
      return isPointInConvexPolygon(x, y, shape.points, shape.points.length >> 1);
    case 'segment': {
      const dx = shape.x1 - shape.x0;
      const dy = shape.y1 - shape.y0;
      const lengthSquared = dx * dx + dy * dy;
      let t = 0;
      if (lengthSquared > 0) {
        t = ((x - shape.x0) * dx + (y - shape.y0) * dy) / lengthSquared;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      const closestX = shape.x0 + t * dx;
      const closestY = shape.y0 + t * dy;
      const ddx = x - closestX;
      const ddy = y - closestY;
      const epsilon = relativeEpsilon(Math.sqrt(lengthSquared));
      return ddx * ddx + ddy * ddy <= epsilon * epsilon;
    }
    case 'point': {
      const dx = x - shape.x;
      const dy = y - shape.y;
      const epsilon = Number.EPSILON * Math.max(1, Math.abs(x), Math.abs(y), Math.abs(shape.x), Math.abs(shape.y));
      return dx * dx + dy * dy <= epsilon * epsilon;
    }
    default:
      return false;
  }
}

// Convex point-in-polygon by sign consistency of the edge cross products. Winding-agnostic: the
// point is inside when it lies on the same side of (or on) every edge. `pn` is the vertex count.
function isPointInConvexPolygon(x: number, y: number, px: readonly number[], pn: number): boolean {
  const epsilon = relativeEpsilon(getPolygonExtent(px, pn));
  let positive = false;
  let negative = false;
  for (let i = 0; i < pn; i++) {
    const j = (i + 1) % pn;
    const x0 = px[i << 1];
    const y0 = px[(i << 1) + 1];
    const x1 = px[j << 1];
    const y1 = px[(j << 1) + 1];
    const cross = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
    const edgeEpsilon = Math.hypot(x1 - x0, y1 - y0) * epsilon;
    if (cross > edgeEpsilon) positive = true;
    else if (cross < -edgeEpsilon) negative = true;
    if (positive && negative) return false;
  }
  return true;
}

function getPolygonExtent(points: readonly number[], count: number): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = points[i << 1];
    const y = points[(i << 1) + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

function relativeEpsilon(extent: number): number {
  return extent > 0 ? extent * RELATIVE_EPSILON : Number.EPSILON;
}
