import type { Physics3DWorld, SpatialAabb3D } from '@flighthq/types/contract';

import { updatePhysics3DColliderWorldShape, writePhysics3DColliderBounds } from './colliderTransform';

// Refreshes every collider's world shape and republishes its body's bounds to the broadphase index. The
// step and the public world queries share this path, so a query observes the body's current authored
// pose rather than the pre-integration snapshot the most recent contact set was built from.
export function synchronizePhysics3DBroadphase(world: Physics3DWorld): void {
  const scratch = acquirePhysics3DBroadphaseScratch();
  try {
    synchronizePhysics3DBroadphaseWithScratch(world, scratch);
  } finally {
    releasePhysics3DBroadphaseScratch(scratch);
  }
}

// The BODY is what the index holds, not the collider: a `SpatialObjectId` is one number, and the pair
// query returns pairs of them. Indexing colliders would need a composite id, and the step already
// refines a body pair down to its collider pairs — which is where the filter and sensor decisions live
// anyway.
function synchronizePhysics3DBroadphaseWithScratch(world: Physics3DWorld, scratch: Physics3DBroadphaseScratch): void {
  for (const body of world.bodies) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const collider of body.colliders) {
      updatePhysics3DColliderWorldShape(collider, body);
      writePhysics3DColliderBounds(collider, scratch.bounds);
      if (scratch.bounds.minX < minX) minX = scratch.bounds.minX;
      if (scratch.bounds.minY < minY) minY = scratch.bounds.minY;
      if (scratch.bounds.minZ < minZ) minZ = scratch.bounds.minZ;
      if (scratch.bounds.maxX > maxX) maxX = scratch.bounds.maxX;
      if (scratch.bounds.maxY > maxY) maxY = scratch.bounds.maxY;
      if (scratch.bounds.maxZ > maxZ) maxZ = scratch.bounds.maxZ;
    }
    if (minX > maxX) {
      // No collider produced bounds, so there is nothing to index. Withdraw rather than skip: the id may
      // have been indexed on a previous step, and stale bounds would keep returning a body that has since
      // lost its geometry.
      world.index.removeSpatialObject(body.index);
      continue;
    }
    // The spatial package bounds its own indexing cost. This second limit expresses the physics world's
    // stricter judgement that a non-finite or ten-million-unit body has diverged and should no longer
    // participate in collision or queries.
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(minZ) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY) ||
      !Number.isFinite(maxZ) ||
      maxX - minX > MAX_SIMULATED_EXTENT ||
      maxY - minY > MAX_SIMULATED_EXTENT ||
      maxZ - minZ > MAX_SIMULATED_EXTENT
    ) {
      world.index.removeSpatialObject(body.index);
      continue;
    }
    scratch.bodyBounds.minX = minX;
    scratch.bodyBounds.minY = minY;
    scratch.bodyBounds.minZ = minZ;
    // Spatial cells use half-open containment while collision point tests include a shape's boundary.
    // Publish a minimally conservative upper corner so an exact query at the maximum remains a broadphase
    // candidate, and so a degenerate zero-volume collider still spans a non-empty indexed cell.
    scratch.bodyBounds.maxX = paddedUpperBound(maxX);
    scratch.bodyBounds.maxY = paddedUpperBound(maxY);
    scratch.bodyBounds.maxZ = paddedUpperBound(maxZ);
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

interface Physics3DBroadphaseScratch {
  bounds: SpatialAabb3D;
  bodyBounds: SpatialAabb3D;
}

function acquirePhysics3DBroadphaseScratch(): Physics3DBroadphaseScratch {
  return physics3DBroadphaseScratchPool.pop() ?? createPhysics3DBroadphaseScratch();
}

function createPhysics3DBroadphaseScratch(): Physics3DBroadphaseScratch {
  return {
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
    bodyBounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
  };
}

function releasePhysics3DBroadphaseScratch(scratch: Physics3DBroadphaseScratch): void {
  physics3DBroadphaseScratchPool.push(scratch);
}

const physics3DBroadphaseScratchPool: Physics3DBroadphaseScratch[] = [createPhysics3DBroadphaseScratch()];
