import { createEntity } from '@flighthq/entity/contract';
import type { CollisionBuiltInShape2D, Entity, Physics2DCollider, RigidBody2D } from '@flighthq/types/contract';

// Allocates the world-space shape a collider needs for `local`, choosing the kind the transform can
// actually express. Every field is filled at creation so the shape is never read half-initialised, and
// polygon storage is sized once here so the per-step transform can write in place.
export function createPhysics2DColliderWorldShape(
  local: Readonly<CollisionBuiltInShape2D>,
): CollisionBuiltInShape2D & Entity {
  switch (local.kind) {
    case 'circle':
      return createEntity({ kind: 'circle', x: local.x, y: local.y, radius: local.radius });
    case 'aabb':
    case 'obb':
      return createEntity({ kind: 'obb', x: 0, y: 0, halfW: 0, halfH: 0, rotation: 0 });
    case 'capsule':
      return createEntity({ kind: 'capsule', x0: 0, y0: 0, x1: 0, y1: 0, radius: local.radius });
    case 'polygon':
      return createEntity({ kind: 'polygon', points: local.points.slice() });
    case 'segment':
      return createEntity({ kind: 'segment', x0: local.x0, y0: local.y0, x1: local.x1, y1: local.y1 });
    case 'point':
      return createEntity({ kind: 'point', x: local.x, y: local.y });
    default:
      return createEntity({ kind: 'point', x: 0, y: 0 });
  }
}

// Rewrites `collider.world` from its local shape and the body's current transform. Called once per
// collider per step, before the narrow phase — never per contact test, because a body with four
// colliders against a hundred broadphase candidates would otherwise transform the same shape a hundred
// times to produce the same answer.
//
// The world shape is preallocated at collider creation and mutated in place, so a step allocates
// nothing. Polygon points are the only variable-length part, and the world array is sized once from the
// local one; `invalidatePhysics2DCollider` replaces that storage after an authored shape changes.
export function updatePhysics2DColliderWorldShape(collider: Physics2DCollider, body: Readonly<RigidBody2D>): void {
  const local = collider.local;
  const world = collider.world;
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);

  if (local.kind === 'circle' && world.kind === 'circle') {
    world.x = body.x + local.x * cos - local.y * sin;
    world.y = body.y + local.x * sin + local.y * cos;
    world.radius = local.radius;
    return;
  }

  // An axis-aligned box promotes to an oriented box in world space: rotate it and it is no longer
  // axis-aligned, and silently keeping the `aabb` kind would grow the box to its bounding extent the
  // first time the body turned.
  if (local.kind === 'aabb' && world.kind === 'obb') {
    const centerX = (local.minX + local.maxX) / 2;
    const centerY = (local.minY + local.maxY) / 2;
    world.x = body.x + centerX * cos - centerY * sin;
    world.y = body.y + centerX * sin + centerY * cos;
    world.halfW = (local.maxX - local.minX) / 2;
    world.halfH = (local.maxY - local.minY) / 2;
    world.rotation = body.angle;
    return;
  }

  if (local.kind === 'obb' && world.kind === 'obb') {
    world.x = body.x + local.x * cos - local.y * sin;
    world.y = body.y + local.x * sin + local.y * cos;
    world.halfW = local.halfW;
    world.halfH = local.halfH;
    world.rotation = body.angle + local.rotation;
    return;
  }

  if (local.kind === 'polygon' && world.kind === 'polygon') {
    const source = local.points;
    const target = world.points as number[];
    for (let i = 0; i < source.length; i += 2) {
      const x = source[i];
      const y = source[i + 1];
      target[i] = body.x + x * cos - y * sin;
      target[i + 1] = body.y + x * sin + y * cos;
    }
    return;
  }

  // A capsule transforms by moving its two endpoints, and `radius` is untouched: a rotation cannot
  // change a distance, so unlike the box below there is no promotion to a different kind and no extent
  // to recompute.
  if (local.kind === 'capsule' && world.kind === 'capsule') {
    world.x0 = body.x + local.x0 * cos - local.y0 * sin;
    world.y0 = body.y + local.x0 * sin + local.y0 * cos;
    world.x1 = body.x + local.x1 * cos - local.y1 * sin;
    world.y1 = body.y + local.x1 * sin + local.y1 * cos;
    world.radius = local.radius;
    return;
  }

  if (local.kind === 'segment' && world.kind === 'segment') {
    world.x0 = body.x + local.x0 * cos - local.y0 * sin;
    world.y0 = body.y + local.x0 * sin + local.y0 * cos;
    world.x1 = body.x + local.x1 * cos - local.y1 * sin;
    world.y1 = body.y + local.x1 * sin + local.y1 * cos;
    return;
  }

  if (local.kind === 'point' && world.kind === 'point') {
    world.x = body.x + local.x * cos - local.y * sin;
    world.y = body.y + local.x * sin + local.y * cos;
  }
}

// Writes `collider.world`'s axis-aligned bounds into `out` — the broadphase's view of the collider.
// Bounds are computed from the WORLD shape rather than by transforming local bounds, because rotating
// an extent and rotating a shape's bounds are different boxes: the second is the bound of the first and
// grows without limit as the body spins.
export function writePhysics2DColliderBounds(
  collider: Readonly<Physics2DCollider>,
  out: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  const shape = collider.world;
  switch (shape.kind) {
    case 'circle':
      out.minX = shape.x - shape.radius;
      out.minY = shape.y - shape.radius;
      out.maxX = shape.x + shape.radius;
      out.maxY = shape.y + shape.radius;
      return;
    case 'aabb':
      out.minX = shape.minX;
      out.minY = shape.minY;
      out.maxX = shape.maxX;
      out.maxY = shape.maxY;
      return;
    case 'obb': {
      const cos = Math.abs(Math.cos(shape.rotation));
      const sin = Math.abs(Math.sin(shape.rotation));
      const extentX = shape.halfW * cos + shape.halfH * sin;
      const extentY = shape.halfW * sin + shape.halfH * cos;
      out.minX = shape.x - extentX;
      out.minY = shape.y - extentY;
      out.maxX = shape.x + extentX;
      out.maxY = shape.y + extentY;
      return;
    }
    case 'polygon': {
      const points = shape.points;
      if (points.length < 2) {
        out.minX = 0;
        out.minY = 0;
        out.maxX = 0;
        out.maxY = 0;
        return;
      }
      let minX = points[0];
      let minY = points[1];
      let maxX = minX;
      let maxY = minY;
      for (let i = 2; i < points.length; i += 2) {
        const x = points[i];
        const y = points[i + 1];
        if (x < minX) minX = x;
        else if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        else if (y > maxY) maxY = y;
      }
      out.minX = minX;
      out.minY = minY;
      out.maxX = maxX;
      out.maxY = maxY;
      return;
    }
    case 'capsule':
      out.minX = Math.min(shape.x0, shape.x1) - shape.radius;
      out.minY = Math.min(shape.y0, shape.y1) - shape.radius;
      out.maxX = Math.max(shape.x0, shape.x1) + shape.radius;
      out.maxY = Math.max(shape.y0, shape.y1) + shape.radius;
      return;
    case 'segment':
      out.minX = Math.min(shape.x0, shape.x1);
      out.minY = Math.min(shape.y0, shape.y1);
      out.maxX = Math.max(shape.x0, shape.x1);
      out.maxY = Math.max(shape.y0, shape.y1);
      return;
    case 'point':
      out.minX = shape.x;
      out.minY = shape.y;
      out.maxX = shape.x;
      out.maxY = shape.y;
      return;
    default:
      out.minX = 0;
      out.minY = 0;
      out.maxX = 0;
      out.maxY = 0;
  }
}
