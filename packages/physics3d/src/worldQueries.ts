import {
  createCollisionRaycastHit3D,
  getCollisionShapeContainsPoint3D,
  raycastCollisionShape3D,
} from '@flighthq/collision/contract';
import type {
  CollisionRaycastHit3D,
  Physics3DCollider,
  Physics3DQueryFilter,
  Physics3DQueryResult,
  Physics3DRayHit,
  Physics3DRayResult,
  Physics3DWorld,
  RigidBody3D,
  SpatialAabb3D,
} from '@flighthq/types/contract';

import { synchronizePhysics3DBroadphase } from './broadphase';
import { writePhysics3DColliderBounds } from './colliderTransform';

// Queries against the world's CURRENT pose. Every one of them synchronizes the broadphase first, so a
// query made between steps — or before the first step — observes where the caller just put a body
// rather than the snapshot the most recent contact set was built from.
//
// Results are ordered by body index and then collider index rather than by backend traversal history,
// which is what makes a pick deterministic: a uniform grid walks a Map whose order follows insertion and
// movement, so two runs of the same scene would otherwise disagree about which of two overlapping
// colliders came first.

export function createPhysics3DQueryFilter(): Physics3DQueryFilter {
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
// rewrite them and publish only `hitCount`, so picking can run each frame without garbage.
export function createPhysics3DQueryResult(): Physics3DQueryResult {
  return { hits: [], hitCount: 0 };
}

export function createPhysics3DRayResult(): Physics3DRayResult {
  return { hits: [], hitCount: 0 };
}

// Writes every collider containing the world-space point. Broadphase candidates are confirmed by the
// collision package's exact shape predicate, so a rotated box does not report the empty corners of its
// bounding volume.
export function queryPhysics3DPoint(
  world: Physics3DWorld,
  x: number,
  y: number,
  z: number,
  out: Physics3DQueryResult,
  filter?: Readonly<Physics3DQueryFilter>,
): void {
  out.hitCount = 0;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  const scratch = acquirePhysics3DQueryScratch();
  try {
    synchronizePhysics3DBroadphase(world);
    world.index.querySpatialPoint(x, y, z, scratch.candidateBodies);
    scratch.candidateBodies.sort(compareNumbers);

    for (const bodyIndex of scratch.candidateBodies) {
      const body = world.bodyByIndex.get(bodyIndex);
      if (body === undefined || !passesBodyFilter(body, filter)) continue;
      for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex += 1) {
        const collider = body.colliders[colliderIndex];
        if (!passesColliderFilter(collider, filter)) continue;
        if (!getCollisionShapeContainsPoint3D(collider.world, x, y, z)) continue;
        writeQueryHit(out, body, collider, colliderIndex);
      }
    }
  } finally {
    releasePhysics3DQueryScratch(scratch);
  }
}

// Writes every exact collider intersection with `origin + direction * fraction`, ordered nearest first.
// `maxFraction` turns the unbounded ray into a finite sweep without requiring direction to be
// normalized.
export function queryPhysics3DRay(
  world: Physics3DWorld,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: Physics3DRayResult,
  maxFraction = Number.POSITIVE_INFINITY,
  filter?: Readonly<Physics3DQueryFilter>,
): void {
  queryPhysics3DRayInternal(
    world,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    out,
    maxFraction,
    filter,
    false,
  );
}

// Writes at most the nearest exact hit — the ground check, the hitscan shot. Ties use the same
// body-then-collider ordering as the all-hits query, so the selected result is deterministic rather than
// broadphase-history dependent.
export function queryPhysics3DRayClosest(
  world: Physics3DWorld,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: Physics3DRayResult,
  maxFraction = Number.POSITIVE_INFINITY,
  filter?: Readonly<Physics3DQueryFilter>,
): void {
  queryPhysics3DRayInternal(
    world,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    out,
    maxFraction,
    filter,
    true,
  );
}

// Writes every collider whose current world-space bounds overlap `region`. The spatial index holds
// aggregate BODY bounds, so its candidates are refined per collider before publication: a region in the
// empty gap between two colliders on one body must not report either of them.
export function queryPhysics3DRegion(
  world: Physics3DWorld,
  region: Readonly<SpatialAabb3D>,
  out: Physics3DQueryResult,
  filter?: Readonly<Physics3DQueryFilter>,
): void {
  out.hitCount = 0;
  if (!isValidRegion(region)) return;
  const scratch = acquirePhysics3DQueryScratch();
  try {
    synchronizePhysics3DBroadphase(world);
    world.index.querySpatialRegion(region, scratch.candidateBodies);
    scratch.candidateBodies.sort(compareNumbers);

    for (const bodyIndex of scratch.candidateBodies) {
      const body = world.bodyByIndex.get(bodyIndex);
      if (body === undefined || !passesBodyFilter(body, filter)) continue;
      for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex += 1) {
        const collider = body.colliders[colliderIndex];
        if (!passesColliderFilter(collider, filter)) continue;
        writePhysics3DColliderBounds(collider, scratch.colliderBounds);
        if (!boundsOverlap(scratch.colliderBounds, region)) continue;
        writeQueryHit(out, body, collider, colliderIndex);
      }
    }
  } finally {
    releasePhysics3DQueryScratch(scratch);
  }
}

function queryPhysics3DRayInternal(
  world: Physics3DWorld,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: Physics3DRayResult,
  maxFraction: number,
  filter: Readonly<Physics3DQueryFilter> | undefined,
  closestOnly: boolean,
): void {
  out.hitCount = 0;
  if (
    !Number.isFinite(originX) ||
    !Number.isFinite(originY) ||
    !Number.isFinite(originZ) ||
    !Number.isFinite(directionX) ||
    !Number.isFinite(directionY) ||
    !Number.isFinite(directionZ) ||
    Number.isNaN(maxFraction) ||
    maxFraction < 0
  ) {
    return;
  }
  const scratch = acquirePhysics3DQueryScratch();
  try {
    synchronizePhysics3DBroadphase(world);
    world.index.querySpatialRay(originX, originY, originZ, directionX, directionY, directionZ, scratch.candidateBodies);
    scratch.candidateBodies.sort(compareNumbers);

    for (const bodyIndex of scratch.candidateBodies) {
      const body = world.bodyByIndex.get(bodyIndex);
      if (body === undefined || !passesBodyFilter(body, filter)) continue;
      for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex += 1) {
        const collider = body.colliders[colliderIndex];
        if (!passesColliderFilter(collider, filter)) continue;
        if (
          !raycastCollisionShape3D(
            collider.world,
            originX,
            originY,
            originZ,
            directionX,
            directionY,
            directionZ,
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
    releasePhysics3DQueryScratch(scratch);
  }
}

function boundsOverlap(a: Readonly<SpatialAabb3D>, b: Readonly<SpatialAabb3D>): boolean {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ
  );
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

function compareRayHits(a: Readonly<Physics3DRayHit>, b: Readonly<Physics3DRayHit>): number {
  if (a.fraction !== b.fraction) return a.fraction - b.fraction;
  if (a.body.index !== b.body.index) return a.body.index - b.body.index;
  return a.colliderIndex - b.colliderIndex;
}

function isValidRegion(region: Readonly<SpatialAabb3D>): boolean {
  return (
    Number.isFinite(region.minX) &&
    Number.isFinite(region.minY) &&
    Number.isFinite(region.minZ) &&
    Number.isFinite(region.maxX) &&
    Number.isFinite(region.maxY) &&
    Number.isFinite(region.maxZ) &&
    region.minX <= region.maxX &&
    region.minY <= region.maxY &&
    region.minZ <= region.maxZ
  );
}

function passesBodyFilter(body: Readonly<RigidBody3D>, filter: Readonly<Physics3DQueryFilter> | undefined): boolean {
  if (filter === undefined) return true;
  if (body.type === 'dynamic') return filter.includeDynamic;
  if (body.type === 'kinematic') return filter.includeKinematic;
  return filter.includeStatic;
}

function passesColliderFilter(
  collider: Readonly<Physics3DCollider>,
  filter: Readonly<Physics3DQueryFilter> | undefined,
): boolean {
  if (filter === undefined) return true;
  if (!filter.includeSensors && collider.sensor) return false;
  return (
    (collider.filter.categoryBits & filter.categoryBits) !== 0 && (collider.filter.maskBits & filter.maskBits) !== 0
  );
}

// Insertion-sort only the LIVE high-water prefix. `Array.sort` would include the retained stale entries
// above `hitCount` and either publish them or displace reusable records unpredictably.
function sortLiveRayHits(out: Physics3DRayResult): void {
  for (let i = 1; i < out.hitCount; i += 1) {
    const value = out.hits[i];
    let at = i;
    while (at > 0 && compareRayHits(value, out.hits[at - 1]) < 0) {
      out.hits[at] = out.hits[at - 1];
      at -= 1;
    }
    out.hits[at] = value;
  }
}

function writeClosestRayHit(
  out: Physics3DRayResult,
  body: RigidBody3D,
  collider: Physics3DCollider,
  colliderIndex: number,
  source: Readonly<CollisionRaycastHit3D>,
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
  current.normalZ = source.normalZ;
  current.x = source.x;
  current.y = source.y;
  current.z = source.z;
}

function writeQueryHit(
  out: Physics3DQueryResult,
  body: RigidBody3D,
  collider: Physics3DCollider,
  colliderIndex: number,
): void {
  const hit = out.hits[out.hitCount];
  if (hit === undefined) out.hits.push({ body, collider, colliderIndex });
  else {
    hit.body = body;
    hit.collider = collider;
    hit.colliderIndex = colliderIndex;
  }
  out.hitCount += 1;
}

function writeRayHit(
  out: Physics3DRayResult,
  body: RigidBody3D,
  collider: Physics3DCollider,
  colliderIndex: number,
  source: Readonly<CollisionRaycastHit3D>,
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
      normalZ: source.normalZ,
      x: source.x,
      y: source.y,
      z: source.z,
    });
  } else {
    hit.body = body;
    hit.collider = collider;
    hit.colliderIndex = colliderIndex;
    hit.fraction = source.fraction;
    hit.normalX = source.normalX;
    hit.normalY = source.normalY;
    hit.normalZ = source.normalZ;
    hit.x = source.x;
    hit.y = source.y;
    hit.z = source.z;
  }
  out.hitCount += 1;
}

interface Physics3DQueryScratch {
  candidateBodies: number[];
  colliderBounds: SpatialAabb3D;
  raycastHit: CollisionRaycastHit3D;
}

function acquirePhysics3DQueryScratch(): Physics3DQueryScratch {
  const scratch = physics3DQueryScratchPool.pop() ?? createPhysics3DQueryScratch();
  scratch.candidateBodies.length = 0;
  return scratch;
}

function createPhysics3DQueryScratch(): Physics3DQueryScratch {
  return {
    candidateBodies: [],
    colliderBounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
    raycastHit: createCollisionRaycastHit3D(),
  };
}

function releasePhysics3DQueryScratch(scratch: Physics3DQueryScratch): void {
  scratch.candidateBodies.length = 0;
  physics3DQueryScratchPool.push(scratch);
}

const physics3DQueryScratchPool: Physics3DQueryScratch[] = [createPhysics3DQueryScratch()];
