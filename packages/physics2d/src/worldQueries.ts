import {
  createCollisionRaycastHit2D,
  getCollisionShapeContainsPoint2D,
  raycastCollisionShape2D,
} from '@flighthq/collision/contract';
import type {
  CollisionRaycastHit2D,
  Physics2DCollider,
  Physics2DQueryFilter,
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

export function createPhysics2DQueryFilter(): Physics2DQueryFilter {
  return {
    categoryBits: 0xffffffff,
    maskBits: 0xffffffff,
    includeSensors: true,
    includeDynamic: true,
    includeKinematic: true,
    includeStatic: true,
  };
}

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
export function queryPhysics2DPoint(
  world: Physics2DWorld,
  x: number,
  y: number,
  out: Physics2DQueryResult,
  filter?: Readonly<Physics2DQueryFilter>,
): void {
  out.hitCount = 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const scratch = acquirePhysics2DQueryScratch();
  try {
    synchronizePhysics2DBroadphase(world);
    world.index.querySpatialPoint(x, y, scratch.candidateBodies);
    scratch.candidateBodies.sort(compareNumbers);

    for (const bodyIndex of scratch.candidateBodies) {
      const body = findPhysics2DBody(world, bodyIndex);
      if (body === null || !passesBodyFilter(body, filter)) continue;
      for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex++) {
        const collider = body.colliders[colliderIndex];
        if (!passesColliderFilter(collider, filter)) continue;
        if (!getCollisionShapeContainsPoint2D(collider.world, x, y)) continue;
        writeQueryHit(out, body, collider, colliderIndex);
      }
    }
  } finally {
    releasePhysics2DQueryScratch(scratch);
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
  filter?: Readonly<Physics2DQueryFilter>,
): void {
  queryPhysics2DRayInternal(world, originX, originY, directionX, directionY, out, maxFraction, filter, false);
}

// Writes at most the nearest exact hit. Ties use the same persistent body/collider ordering as the
// all-hits query, so the selected result is deterministic rather than broadphase-history dependent.
export function queryPhysics2DRayClosest(
  world: Physics2DWorld,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  out: Physics2DRayResult,
  maxFraction = Number.POSITIVE_INFINITY,
  filter?: Readonly<Physics2DQueryFilter>,
): void {
  queryPhysics2DRayInternal(world, originX, originY, directionX, directionY, out, maxFraction, filter, true);
}

function queryPhysics2DRayInternal(
  world: Physics2DWorld,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  out: Physics2DRayResult,
  maxFraction: number,
  filter: Readonly<Physics2DQueryFilter> | undefined,
  closestOnly: boolean,
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
  const scratch = acquirePhysics2DQueryScratch();
  try {
    synchronizePhysics2DBroadphase(world);
    world.index.querySpatialRay(originX, originY, directionX, directionY, scratch.candidateBodies);
    scratch.candidateBodies.sort(compareNumbers);

    for (const bodyIndex of scratch.candidateBodies) {
      const body = findPhysics2DBody(world, bodyIndex);
      if (body === null || !passesBodyFilter(body, filter)) continue;
      for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex++) {
        const collider = body.colliders[colliderIndex];
        if (!passesColliderFilter(collider, filter)) continue;
        if (
          !raycastCollisionShape2D(
            collider.world,
            originX,
            originY,
            directionX,
            directionY,
            scratch.raycastHit,
            maxFraction,
          )
        ) {
          continue;
        }
        if (closestOnly) writeClosestRayHit(out, body, collider, colliderIndex, scratch.raycastHit);
        else writeRayHit(out, body, collider, colliderIndex, scratch.raycastHit);
      }
    }
    if (!closestOnly) sortLiveRayHits(out);
  } finally {
    releasePhysics2DQueryScratch(scratch);
  }
}

// Writes every collider whose current world-space AABB overlaps `region`. The spatial index is over
// aggregate BODY bounds, so its candidates are refined per collider before publication: a region in
// the empty gap between two colliders on one body must not report either collider as a hit.
export function queryPhysics2DRegion(
  world: Physics2DWorld,
  region: Readonly<SpatialAabb>,
  out: Physics2DQueryResult,
  filter?: Readonly<Physics2DQueryFilter>,
): void {
  out.hitCount = 0;
  if (!isValidRegion(region)) return;
  const scratch = acquirePhysics2DQueryScratch();
  try {
    synchronizePhysics2DBroadphase(world);
    world.index.querySpatialRegion(region, scratch.candidateBodies);
    scratch.candidateBodies.sort(compareNumbers);

    for (const bodyIndex of scratch.candidateBodies) {
      const body = findPhysics2DBody(world, bodyIndex);
      if (body === null || !passesBodyFilter(body, filter)) continue;
      for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex++) {
        const collider = body.colliders[colliderIndex];
        if (!passesColliderFilter(collider, filter)) continue;
        writePhysics2DColliderBounds(collider, scratch.colliderBounds);
        if (!boundsOverlap(scratch.colliderBounds, region)) continue;
        writeQueryHit(out, body, collider, colliderIndex);
      }
    }
  } finally {
    releasePhysics2DQueryScratch(scratch);
  }
}

function writeClosestRayHit(
  out: Physics2DRayResult,
  body: RigidBody2D,
  collider: Physics2DCollider,
  colliderIndex: number,
  source: Readonly<CollisionRaycastHit2D>,
): void {
  if (out.hitCount === 0) {
    writeRayHit(out, body, collider, colliderIndex, source);
    return;
  }
  const current = out.hits[0];
  if (
    source.fraction > current.fraction ||
    (source.fraction === current.fraction &&
      (body.index > current.body.index ||
        (body.index === current.body.index && colliderIndex >= current.colliderIndex)))
  ) {
    return;
  }
  current.body = body;
  current.collider = collider;
  current.colliderIndex = colliderIndex;
  current.fraction = source.fraction;
  current.normalX = source.normalX;
  current.normalY = source.normalY;
  current.x = source.x;
  current.y = source.y;
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
  source: Readonly<CollisionRaycastHit2D>,
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

function passesBodyFilter(body: Readonly<RigidBody2D>, filter: Readonly<Physics2DQueryFilter> | undefined): boolean {
  if (filter === undefined) return true;
  if (body.type === 'dynamic') return filter.includeDynamic;
  if (body.type === 'kinematic') return filter.includeKinematic;
  return filter.includeStatic;
}

function passesColliderFilter(
  collider: Readonly<Physics2DCollider>,
  filter: Readonly<Physics2DQueryFilter> | undefined,
): boolean {
  if (filter === undefined) return true;
  if (!filter.includeSensors && collider.sensor) return false;
  return (
    (collider.filter.categoryBits & filter.categoryBits) !== 0 && (collider.filter.maskBits & filter.maskBits) !== 0
  );
}

function isValidRegion(region: Readonly<SpatialAabb>): boolean {
  return (
    Number.isFinite(region.minX) &&
    Number.isFinite(region.minY) &&
    Number.isFinite(region.maxX) &&
    Number.isFinite(region.maxY) &&
    region.minX <= region.maxX &&
    region.minY <= region.maxY
  );
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

interface Physics2DQueryScratch {
  candidateBodies: number[];
  colliderBounds: SpatialAabb;
  raycastHit: CollisionRaycastHit2D;
}

function acquirePhysics2DQueryScratch(): Physics2DQueryScratch {
  const scratch = physics2DQueryScratchPool.pop() ?? createPhysics2DQueryScratch();
  scratch.candidateBodies.length = 0;
  return scratch;
}

function createPhysics2DQueryScratch(): Physics2DQueryScratch {
  return {
    candidateBodies: [],
    colliderBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    raycastHit: createCollisionRaycastHit2D(),
  };
}

function releasePhysics2DQueryScratch(scratch: Physics2DQueryScratch): void {
  scratch.candidateBodies.length = 0;
  physics2DQueryScratchPool.push(scratch);
}

const physics2DQueryScratchPool: Physics2DQueryScratch[] = [createPhysics2DQueryScratch()];
