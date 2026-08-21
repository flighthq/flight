import {
  createCollisionRaycastHit2D,
  createCollisionTimeOfImpact2D,
  getCollisionShapeContainsPoint2D,
  raycastCollisionShape2D,
  sweepCollisionShape2D,
} from '@flighthq/collision/contract';
import type {
  CollisionBuiltInShape2D,
  CollisionRaycastHit2D,
  CollisionTimeOfImpact2D,
  Physics2DCollider,
  Physics2DQueryFilter,
  Physics2DQueryResult,
  Physics2DRayHit,
  Physics2DRayResult,
  Physics2DShapeCastResult,
  Physics2DWorld,
  RigidBody2D,
  SpatialAabb2D,
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

// A reusable shape-cast result, starting as a miss.
export function createPhysics2DShapeCastResult(): Physics2DShapeCastResult {
  return { body: null, collider: null, colliderIndex: -1, hit: false, fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 };
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

// Writes every collider whose current world-space AABB overlaps `region`. The spatial index is over
// aggregate BODY bounds, so its candidates are refined per collider before publication: a region in
// the empty gap between two colliders on one body must not report either collider as a hit.
export function queryPhysics2DRegion(
  world: Physics2DWorld,
  region: Readonly<SpatialAabb2D>,
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

// Sweeps `shape` along (`dx`,`dy`) and writes where it first touches the world.
//
// The shape is given in WORLD space and is not attached to any body, so this asks "if something this
// shape were here and moved that way, what would it hit first" — the query a character controller, a
// projectile, or a camera probe is built on. It is translational; see `Physics2DShapeCastResult` for what
// that excludes and for the fraction-0 meaning of starting overlapped.
//
// Broadphase is the AABB of the shape UNION its swept displacement, which is conservative in exactly the
// way it must be: a candidate the swept box misses cannot be reached anywhere along the sweep. Each
// candidate is then confirmed by the collision package's exact linear sweep, so a rotated box's empty
// bounding corners never produce a hit.
//
// Ties are broken by body index and then by collider array index, because the candidate list is sorted
// and a later equal fraction never displaces an earlier one. Two colliders exactly the same distance away
// therefore resolve the same way on every run and on every backend, which a caller doing anything
// deterministic with the result depends on.
//
// `maxFraction` shortens the sweep without changing what a fraction means: it still measures along the
// full (`dx`,`dy`), so passing 0.5 tests half of it and can only report fractions up to 0.5.
export function queryPhysics2DShapeCast(
  world: Physics2DWorld,
  shape: Readonly<CollisionBuiltInShape2D>,
  dx: number,
  dy: number,
  out: Physics2DShapeCastResult,
  maxFraction = 1,
  filter?: Readonly<Physics2DQueryFilter>,
): void {
  clearShapeCastResult(out);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  if (!Number.isFinite(maxFraction) || maxFraction < 0) return;

  const scratch = acquirePhysics2DQueryScratch();
  try {
    synchronizePhysics2DBroadphase(world);
    if (!writeSweptShapeBounds(shape, dx * maxFraction, dy * maxFraction, scratch.colliderBounds)) return;
    world.index.querySpatialRegion(scratch.colliderBounds, scratch.candidateBodies);
    scratch.candidateBodies.sort(compareNumbers);

    let bestFraction = Number.POSITIVE_INFINITY;
    for (const bodyIndex of scratch.candidateBodies) {
      const body = findPhysics2DBody(world, bodyIndex);
      if (body === null || !passesBodyFilter(body, filter)) continue;
      for (let colliderIndex = 0; colliderIndex < body.colliders.length; colliderIndex += 1) {
        const collider = body.colliders[colliderIndex];
        if (!passesColliderFilter(collider, filter)) continue;
        // The collider is stationary for the duration of the cast: this is a question about the world as
        // it stands, not a prediction of where it will be after the next step.
        if (!sweepCollisionShape2D(shape, dx, dy, collider.world, 0, 0, scratch.timeOfImpact, maxFraction)) {
          continue;
        }
        // Strictly less, so the first candidate at a given fraction keeps the slot and the sorted order
        // above is what decides a tie.
        if (scratch.timeOfImpact.fraction >= bestFraction) continue;
        bestFraction = scratch.timeOfImpact.fraction;
        out.hit = true;
        out.body = body;
        out.collider = collider;
        out.colliderIndex = colliderIndex;
        out.fraction = scratch.timeOfImpact.fraction;
        out.x = scratch.timeOfImpact.x;
        out.y = scratch.timeOfImpact.y;
        out.normalX = scratch.timeOfImpact.normalX;
        out.normalY = scratch.timeOfImpact.normalY;
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

// Resets a result to a clean miss. Every field, not only `hit`: a caller reusing one result across a
// loop of casts must not read the previous cast's body back out of a miss.
function clearShapeCastResult(out: Physics2DShapeCastResult): void {
  out.body = null;
  out.collider = null;
  out.colliderIndex = -1;
  out.hit = false;
  out.fraction = 0;
  out.x = 0;
  out.y = 0;
  out.normalX = 0;
  out.normalY = 0;
}

// The AABB of the shape at its start position UNION the same box displaced by the sweep — the region the
// shape can occupy at any point along it. Extending only the leading side per axis is what makes it the
// union rather than a box twice too big in both directions.
function writeSweptShapeBounds(
  shape: Readonly<CollisionBuiltInShape2D>,
  dx: number,
  dy: number,
  out: SpatialAabb2D,
): boolean {
  shapeCastProbe.world = shape as CollisionBuiltInShape2D;
  writePhysics2DColliderBounds(shapeCastProbe, out);
  if (!Number.isFinite(out.minX) || !Number.isFinite(out.maxY)) return false;

  if (dx < 0) out.minX += dx;
  else out.maxX += dx;
  if (dy < 0) out.minY += dy;
  else out.maxY += dy;
  return true;
}

function boundsOverlap(a: Readonly<SpatialAabb2D>, b: Readonly<SpatialAabb2D>): boolean {
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

function isValidRegion(region: Readonly<SpatialAabb2D>): boolean {
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
  colliderBounds: SpatialAabb2D;
  raycastHit: CollisionRaycastHit2D;
  timeOfImpact: CollisionTimeOfImpact2D;
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
    timeOfImpact: createCollisionTimeOfImpact2D(),
  };
}

function releasePhysics2DQueryScratch(scratch: Physics2DQueryScratch): void {
  scratch.candidateBodies.length = 0;
  physics2DQueryScratchPool.push(scratch);
}

const physics2DQueryScratchPool: Physics2DQueryScratch[] = [createPhysics2DQueryScratch()];

// A stand-in collider so a bare shape can reuse the collider bounds writer. Its `world` shape is REBOUND
// per call rather than copied, so this never retains the caller's shape past the call, and its material
// and filter are never read on this path.
const shapeCastProbe: Physics2DCollider = {
  local: { kind: 'point', x: 0, y: 0 },
  world: { kind: 'point', x: 0, y: 0 },
  material: { density: 0, friction: 0, restitution: 0 },
  filter: { categoryBits: 1, maskBits: 0xffffffff, groupIndex: 0 },
  sensor: false,
};
