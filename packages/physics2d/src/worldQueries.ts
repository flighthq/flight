import { getCollisionShapeContainsPoint } from '@flighthq/collision/contract';
import type {
  Physics2DCollider,
  Physics2DQueryResult,
  Physics2DWorld,
  RigidBody2D,
  SpatialAabb,
} from '@flighthq/types/contract';

import { synchronizePhysics2DBroadphase } from './broadphase';
import { writePhysics2DColliderBounds } from './colliderTransform';
import { findPhysics2DBody } from './world';

// Allocates a reusable query buffer. Entries stay allocated at their high-water mark; query functions
// rewrite them and publish only `hitCount`, so pointer picking can run each frame without garbage.
export function createPhysics2DQueryResult(): Physics2DQueryResult {
  return { hits: [], hitCount: 0 };
}

// Writes every collider containing the world-space point. Broadphase candidates are confirmed by the
// collision package's exact shape predicate, so rotated boxes and convex polygons do not report their
// empty bounding-box corners. Results are ordered by body identity and collider array index rather than
// backend traversal history.
export function queryPhysics2DPoint(world: Physics2DWorld, x: number, y: number, out: Physics2DQueryResult): void {
  out.hitCount = 0;
  synchronizePhysics2DBroadphase(world);
  world.index.querySpatialPoint(x, y, candidateBodyScratch);
  candidateBodyScratch.sort(compareNumbers);

  for (const bodyIndex of candidateBodyScratch) {
    const body = findPhysics2DBody(world, bodyIndex);
    if (body === null) continue;
    for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex++) {
      const collider = body.colliders[colliderIndex];
      if (!getCollisionShapeContainsPoint(collider.world, x, y)) continue;
      writeQueryHit(out, body, collider, colliderIndex);
    }
  }
}

// Writes every collider whose current world-space AABB overlaps `region`. The spatial index is over
// aggregate BODY bounds, so its candidates are refined per collider before publication: a region in
// the empty gap between two colliders on one body must not report either collider as a hit.
export function queryPhysics2DRegion(
  world: Physics2DWorld,
  region: Readonly<SpatialAabb>,
  out: Physics2DQueryResult,
): void {
  out.hitCount = 0;
  synchronizePhysics2DBroadphase(world);
  world.index.querySpatialRegion(region, candidateBodyScratch);
  candidateBodyScratch.sort(compareNumbers);

  for (const bodyIndex of candidateBodyScratch) {
    const body = findPhysics2DBody(world, bodyIndex);
    if (body === null) continue;
    for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex++) {
      const collider = body.colliders[colliderIndex];
      writePhysics2DColliderBounds(collider, colliderBoundsScratch);
      if (!boundsOverlap(colliderBoundsScratch, region)) continue;
      writeQueryHit(out, body, collider, colliderIndex);
    }
  }
}

function writeQueryHit(
  out: Physics2DQueryResult,
  body: RigidBody2D,
  collider: Physics2DCollider,
  colliderIndex: number,
): void {
  const hit = out.hits[out.hitCount];
  if (hit === undefined) out.hits.push({ body, collider, colliderIndex });
  else {
    hit.body = body;
    hit.collider = collider;
    hit.colliderIndex = colliderIndex;
  }
  out.hitCount++;
}

function boundsOverlap(a: Readonly<SpatialAabb>, b: Readonly<SpatialAabb>): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

const candidateBodyScratch: number[] = [];
const colliderBoundsScratch: SpatialAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
