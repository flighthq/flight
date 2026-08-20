import type { CollisionShape2D, CollisionTestStatus } from '@flighthq/types/contract';

// Validates the flat polygon contract and distinguishes zero-area/malformed input from a real but
// non-convex polygon. Winding and collinear vertices are accepted when the polygon still has area.
export function getCollisionPolygonValidationStatus2D(points: readonly number[]): CollisionTestStatus | null {
  if (points.length < 6 || (points.length & 1) !== 0) return 'degenerate-shape';
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'degenerate-shape';
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  if (!(extent > 0)) return 'degenerate-shape';
  const crossEpsilon = extent * extent * RELATIVE_EPSILON;
  const xOrigin = points[0];
  const yOrigin = points[1];
  let areaTwice = 0;
  let turnSign = 0;
  const count = points.length >> 1;
  for (let i = 0; i < count; i++) {
    const previous = (i + count - 1) % count;
    const next = (i + 1) % count;
    const x = points[i << 1] - xOrigin;
    const y = points[(i << 1) + 1] - yOrigin;
    const nextX = points[next << 1] - xOrigin;
    const nextY = points[(next << 1) + 1] - yOrigin;
    areaTwice += x * nextY - y * nextX;

    const ax = x - (points[previous << 1] - xOrigin);
    const ay = y - (points[(previous << 1) + 1] - yOrigin);
    const bx = nextX - x;
    const by = nextY - y;
    const cross = ax * by - ay * bx;
    if (Math.abs(cross) <= crossEpsilon) continue;
    const sign = cross > 0 ? 1 : -1;
    if (turnSign !== 0 && sign !== turnSign) return 'non-convex-polygon';
    turnSign = sign;
  }
  return Math.abs(areaTwice) <= crossEpsilon || turnSign === 0 ? 'degenerate-shape' : null;
}

// Returns the invalid/unsupported status that prevents a shape from participating in a manifold,
// or null when it is a finite, positive-area member of the supported manifold shape set.
export function getCollisionShapeValidationStatus2D(shape: Readonly<CollisionShape2D>): CollisionTestStatus | null {
  switch (shape.kind) {
    case 'circle':
      return Number.isFinite(shape.x) && Number.isFinite(shape.y) && Number.isFinite(shape.radius) && shape.radius > 0
        ? null
        : 'degenerate-shape';
    case 'aabb':
      return Number.isFinite(shape.minX) &&
        Number.isFinite(shape.minY) &&
        Number.isFinite(shape.maxX) &&
        Number.isFinite(shape.maxY) &&
        shape.maxX > shape.minX &&
        shape.maxY > shape.minY
        ? null
        : 'degenerate-shape';
    case 'obb':
      return Number.isFinite(shape.x) &&
        Number.isFinite(shape.y) &&
        Number.isFinite(shape.halfW) &&
        Number.isFinite(shape.halfH) &&
        Number.isFinite(shape.rotation) &&
        shape.halfW > 0 &&
        shape.halfH > 0
        ? null
        : 'degenerate-shape';
    case 'polygon':
      return getCollisionPolygonValidationStatus2D(shape.points);
    case 'segment':
      return Number.isFinite(shape.x0) &&
        Number.isFinite(shape.y0) &&
        Number.isFinite(shape.x1) &&
        Number.isFinite(shape.y1) &&
        (shape.x0 !== shape.x1 || shape.y0 !== shape.y1)
        ? 'unsupported-shape-kind'
        : 'degenerate-shape';
    case 'point':
      return Number.isFinite(shape.x) && Number.isFinite(shape.y) ? 'unsupported-shape-kind' : 'degenerate-shape';
    default:
      return 'unsupported-shape-kind';
  }
}

const RELATIVE_EPSILON = 1e-12;
