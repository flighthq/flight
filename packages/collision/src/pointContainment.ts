import type { CollisionShape } from '@flighthq/types';

const EPS = 1e-9;

// Whether the point (`x`,`y`) lies inside a collider. Boundary-inclusive: a point exactly on the
// edge of any shape counts as contained. For the area-less kinds this degrades to an on-shape test —
// `segment` returns true when the point lies on the segment (within epsilon), `point` when the two
// points coincide (within epsilon). Unknown kinds return false. The polygon is assumed convex.
export function getCollisionShapeContainsPoint(shape: Readonly<CollisionShape>, x: number, y: number): boolean {
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
    case 'polygon':
      return isPointInConvexPolygon(x, y, shape.points, shape.points.length >> 1);
    case 'segment': {
      const dx = shape.x1 - shape.x0;
      const dy = shape.y1 - shape.y0;
      const lengthSquared = dx * dx + dy * dy;
      let t = 0;
      if (lengthSquared > EPS) {
        t = ((x - shape.x0) * dx + (y - shape.y0) * dy) / lengthSquared;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      const closestX = shape.x0 + t * dx;
      const closestY = shape.y0 + t * dy;
      const ddx = x - closestX;
      const ddy = y - closestY;
      return ddx * ddx + ddy * ddy <= EPS;
    }
    case 'point': {
      const dx = x - shape.x;
      const dy = y - shape.y;
      return dx * dx + dy * dy <= EPS;
    }
    default:
      return false;
  }
}

// Convex point-in-polygon by sign consistency of the edge cross products. Winding-agnostic: the
// point is inside when it lies on the same side of (or on) every edge. `pn` is the vertex count.
function isPointInConvexPolygon(x: number, y: number, px: readonly number[], pn: number): boolean {
  let positive = false;
  let negative = false;
  for (let i = 0; i < pn; i++) {
    const j = (i + 1) % pn;
    const x0 = px[i << 1];
    const y0 = px[(i << 1) + 1];
    const x1 = px[j << 1];
    const y1 = px[(j << 1) + 1];
    const cross = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
    if (cross > EPS) positive = true;
    else if (cross < -EPS) negative = true;
    if (positive && negative) return false;
  }
  return true;
}
