import type { Physics2DWorld, SpatialAabb } from '@flighthq/types/contract';

import { updatePhysics2DColliderWorldShape, writePhysics2DColliderBounds } from './colliderTransform';

// Refreshes every collider's world shape and republishes its bounds to the broadphase index. The step
// and public world queries share this path so a query observes the body's current authored pose, not
// the pre-integration snapshot used to build the most recent contact set.
export function synchronizePhysics2DBroadphase(world: Physics2DWorld): void {
  for (const body of world.bodies) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const collider of body.colliders) {
      updatePhysics2DColliderWorldShape(collider, body);
      writePhysics2DColliderBounds(collider, boundsScratch);
      if (boundsScratch.minX < minX) minX = boundsScratch.minX;
      if (boundsScratch.minY < minY) minY = boundsScratch.minY;
      if (boundsScratch.maxX > maxX) maxX = boundsScratch.maxX;
      if (boundsScratch.maxY > maxY) maxY = boundsScratch.maxY;
    }
    if (minX > maxX) {
      // No collider produced bounds, so there is nothing to index. Withdraw rather than skip: the id
      // may have been indexed on a previous step, and stale bounds would keep returning an empty body.
      world.index.removeSpatialObject(body.index);
      continue;
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
    bodyBounds.minX = minX;
    bodyBounds.minY = minY;
    // Spatial cells use half-open rectangle containment while collision point tests include a shape's
    // boundary. Publish a minimally conservative upper edge so an exact query at maxX/maxY remains a
    // broadphase candidate. This also gives a point or axis-aligned segment a non-empty indexed span;
    // collider-level refinement still reads its exact, zero-area bounds.
    bodyBounds.maxX = paddedUpperBound(maxX);
    bodyBounds.maxY = paddedUpperBound(maxY);
    world.index.updateSpatialObject(body.index, bodyBounds);
  }
}

function paddedUpperBound(value: number): number {
  const padded = value + Math.max(1, Math.abs(value)) * Number.EPSILON * 4;
  return Number.isFinite(padded) ? padded : value;
}

// The widest body this world still treats as simulating. Named for what it bounds — the simulation's
// tolerance for divergence — not for the index, which bounds its own insert cost independently.
const MAX_SIMULATED_EXTENT = 1e7;
const boundsScratch: SpatialAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const bodyBounds: SpatialAabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
