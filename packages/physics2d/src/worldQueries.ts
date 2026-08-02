import {
  createCollisionRaycastHit,
  getCollisionShapeContainsPoint,
  raycastCollisionShape,
} from '@flighthq/collision/contract';
import type {
  CollisionRaycastHit,
  Physics2DCollider,
  Physics2DQueryResult,
  Physics2DRayHit,
  Physics2DRayResult,
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

export function createPhysics2DRayResult(): Physics2DRayResult {
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

// Writes every exact collider intersection with `origin + direction * fraction`, ordered nearest
// first. `maxFraction` turns the unbounded ray into a finite sweep without requiring direction to be
// normalized. Spatial body candidates are refined by collision's per-shape raycast.
export function queryPhysics2DRay(
  world: Physics2DWorld,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  out: Physics2DRayResult,
  maxFraction = Number.POSITIVE_INFINITY,
): void {
  out.hitCount = 0;
  if (
    !Number.isFinite(originX) ||
    !Number.isFinite(originY) ||
    !Number.isFinite(directionX) ||
    !Number.isFinite(directionY) ||
    Number.isNaN(maxFraction) ||
    maxFraction < 0
  ) {
    return;
  }
  synchronizePhysics2DBroadphase(world);
  world.index.querySpatialRay(originX, originY, directionX, directionY, candidateBodyScratch);
  candidateBodyScratch.sort(compareNumbers);

  for (const bodyIndex of candidateBodyScratch) {
    const body = findPhysics2DBody(world, bodyIndex);
    if (body === null) continue;
    for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex++) {
      const collider = body.colliders[colliderIndex];
      if (
        !raycastCollisionShape(collider.world, originX, originY, directionX, directionY, raycastHitScratch, maxFraction)
      ) {
        continue;
      }
      writeRayHit(out, body, collider, colliderIndex, raycastHitScratch);
    }
  }
  sortLiveRayHits(out);
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

function writeRayHit(
  out: Physics2DRayResult,
  body: RigidBody2D,
  collider: Physics2DCollider,
  colliderIndex: number,
  source: Readonly<CollisionRaycastHit>,
): void {
  const hit = out.hits[out.hitCount];
  if (hit === undefined) {
    out.hits.push({
      body,
      collider,
      colliderIndex,
      fraction: source.fraction,
      normalX: source.normalX,
      normalY: source.normalY,
      x: source.x,
      y: source.y,
    });
  } else {
    hit.body = body;
    hit.collider = collider;
    hit.colliderIndex = colliderIndex;
    hit.fraction = source.fraction;
    hit.normalX = source.normalX;
    hit.normalY = source.normalY;
    hit.x = source.x;
    hit.y = source.y;
  }
  out.hitCount++;
}

// Insertion-sort only the live high-water prefix. Array.sort would include retained stale entries
// above hitCount and either publish them or displace reusable records unpredictably.
function sortLiveRayHits(out: Physics2DRayResult): void {
  for (let i = 1; i < out.hitCount; i++) {
    const value = out.hits[i];
    let at = i;
    while (at > 0 && compareRayHits(value, out.hits[at - 1]) < 0) {
      out.hits[at] = out.hits[at - 1];
      at--;
    }
    out.hits[at] = value;
  }
}

function compareRayHits(a: Readonly<Physics2DRayHit>, b: Readonly<Physics2DRayHit>): number {
  if (a.fraction !== b.fraction) return a.fraction - b.fraction;
  if (a.body.index !== b.body.index) return a.body.index - b.body.index;
  return a.colliderIndex - b.colliderIndex;
}

function boundsOverlap(a: Readonly<SpatialAabb>, b: Readonly<SpatialAabb>): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

const candidateBodyScratch: number[] = [];
const colliderBoundsScratch: SpatialAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const raycastHitScratch = createCollisionRaycastHit();
