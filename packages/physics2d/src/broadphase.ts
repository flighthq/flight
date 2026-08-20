import type { Physics2DWorld, SpatialAabb2D } from '@flighthq/types/contract';

import { updatePhysics2DColliderWorldShape, writePhysics2DColliderBounds } from './colliderTransform';

// Refreshes every collider's world shape and republishes its bounds to the broadphase index. The step
// and public world queries share this path so a query observes the body's current authored pose, not
// the pre-integration snapshot used to build the most recent contact set.
export function synchronizePhysics2DBroadphase(world: Physics2DWorld): void {
  synchronizePhysics2DBroadphaseBounds(world, 0);
}

// Publishes the union of every body's current and linearly translated bounds for one CCD interval.
// The ordinary index is reused deliberately: a step queries the candidate pairs immediately and then
// restores current bounds, avoiding a second hidden index while retaining the backend swap point.
export function synchronizePhysics2DSweptBroadphase(world: Physics2DWorld, dt: number): void {
  synchronizePhysics2DBroadphaseBounds(world, dt);
}

function synchronizePhysics2DBroadphaseBounds(world: Physics2DWorld, dt: number): void {
  const scratch = acquirePhysics2DBroadphaseScratch();
  try {
    synchronizePhysics2DBroadphaseBoundsWithScratch(world, dt, scratch);
  } finally {
    releasePhysics2DBroadphaseScratch(scratch);
  }
}

function synchronizePhysics2DBroadphaseBoundsWithScratch(
  world: Physics2DWorld,
  dt: number,
  scratch: Physics2DBroadphaseScratch,
): void {
  for (const body of world.bodies) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let rotationRadiusSquared = 0;
    for (const collider of body.colliders) {
      updatePhysics2DColliderWorldShape(collider, body);
      writePhysics2DColliderBounds(collider, scratch.bounds);
      if (scratch.bounds.minX < minX) minX = scratch.bounds.minX;
      if (scratch.bounds.minY < minY) minY = scratch.bounds.minY;
      if (scratch.bounds.maxX > maxX) maxX = scratch.bounds.maxX;
      if (scratch.bounds.maxY > maxY) maxY = scratch.bounds.maxY;
      const radiusX = Math.max(Math.abs(scratch.bounds.minX - body.x), Math.abs(scratch.bounds.maxX - body.x));
      const radiusY = Math.max(Math.abs(scratch.bounds.minY - body.y), Math.abs(scratch.bounds.maxY - body.y));
      const radiusSquared = radiusX * radiusX + radiusY * radiusY;
      if (radiusSquared > rotationRadiusSquared) rotationRadiusSquared = radiusSquared;
    }
    if (minX > maxX) {
      // No collider produced bounds, so there is nothing to index. Withdraw rather than skip: the id
      // may have been indexed on a previous step, and stale bounds would keep returning an empty body.
      world.index.removeSpatialObject(body.index);
      continue;
    }
    if (dt > 0 && body.type !== 'static' && !body.sleeping) {
      const translationX = body.velocityX * dt;
      const translationY = body.velocityY * dt;
      if (body.angularVelocity !== 0) {
        // A circle around the body origin encloses every orientation of every collider. Sweeping that
        // circle along the origin's translation is conservative for arbitrary rotation, including an
        // offset circle whose centre follows an arc rather than the linear path used by shape sweep.
        const radius = Math.sqrt(rotationRadiusSquared);
        minX = Math.min(minX, body.x - radius, body.x + translationX - radius);
        minY = Math.min(minY, body.y - radius, body.y + translationY - radius);
        maxX = Math.max(maxX, body.x + radius, body.x + translationX + radius);
        maxY = Math.max(maxY, body.y + radius, body.y + translationY + radius);
      } else {
        if (translationX < 0) minX += translationX;
        else maxX += translationX;
        if (translationY < 0) minY += translationY;
        else maxY += translationY;
      }
    }
    // The spatial package bounds its own indexing cost. This second limit expresses the physics
    // world's stricter judgement that a non-finite or ten-million-unit body has diverged and should no
    // longer participate in collision or queries.
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY) ||
      maxX - minX > MAX_SIMULATED_EXTENT ||
      maxY - minY > MAX_SIMULATED_EXTENT
    ) {
      world.index.removeSpatialObject(body.index);
      continue;
    }
    scratch.bodyBounds.minX = minX;
    scratch.bodyBounds.minY = minY;
    // Spatial cells use half-open rectangle containment while collision point tests include a shape's
    // boundary. Publish a minimally conservative upper edge so an exact query at maxX/maxY remains a
    // broadphase candidate. This also gives a point or axis-aligned segment a non-empty indexed span;
    // collider-level refinement still reads its exact, zero-area bounds.
    scratch.bodyBounds.maxX = paddedUpperBound(maxX);
    scratch.bodyBounds.maxY = paddedUpperBound(maxY);
    world.index.updateSpatialObject(body.index, scratch.bodyBounds);
  }
}

function paddedUpperBound(value: number): number {
  const padded = value + Math.max(1, Math.abs(value)) * Number.EPSILON * 4;
  return Number.isFinite(padded) ? padded : value;
}

// The widest body this world still treats as simulating. Named for what it bounds — the simulation's
// tolerance for divergence — not for the index, which bounds its own insert cost independently.
const MAX_SIMULATED_EXTENT = 1e7;

interface Physics2DBroadphaseScratch {
  bounds: SpatialAabb2D;
  bodyBounds: SpatialAabb2D;
}

function acquirePhysics2DBroadphaseScratch(): Physics2DBroadphaseScratch {
  return physics2DBroadphaseScratchPool.pop() ?? createPhysics2DBroadphaseScratch();
}

function createPhysics2DBroadphaseScratch(): Physics2DBroadphaseScratch {
  return {
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    bodyBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}

function releasePhysics2DBroadphaseScratch(scratch: Physics2DBroadphaseScratch): void {
  physics2DBroadphaseScratchPool.push(scratch);
}

const physics2DBroadphaseScratchPool: Physics2DBroadphaseScratch[] = [createPhysics2DBroadphaseScratch()];
