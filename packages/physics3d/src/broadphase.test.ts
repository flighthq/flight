import type { CollisionBuiltInShape3D, Physics3DWorld, RigidBody3D, SpatialPair } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { synchronizePhysics3DBroadphase } from './broadphase';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
} from './world';

function unitBox(): CollisionBuiltInShape3D {
  return { kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 };
}

function addBoxBody(world: Physics3DWorld, x: number, y: number, z: number): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  body.x = x;
  body.y = y;
  body.z = z;
  addPhysics3DBody(world, body);
  addPhysics3DCollider(world, body, createPhysics3DCollider(unitBox()));
  return body;
}

function pairs(world: Readonly<Physics3DWorld>): SpatialPair[] {
  const out: SpatialPair[] = [];
  world.index.querySpatialPairs(out);
  return out;
}

describe('synchronizePhysics3DBroadphase', () => {
  it('publishes a body so an overlapping neighbour becomes a candidate pair', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    addBoxBody(world, 0.25, 0, 0);

    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(1);
  });

  it('reports no pair for bodies that are far apart', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    addBoxBody(world, 500, 0, 0);

    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(0);
  });

  it('separates bodies along Z, not only along X and Y', () => {
    // The dimension the 2D index cannot see. A seam that quietly dropped Z would report this pair.
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    addBoxBody(world, 0, 0, 500);

    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(0);
  });

  it('follows a body that moves, rather than holding its bounds at insertion', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const mover = addBoxBody(world, 500, 0, 0);
    synchronizePhysics3DBroadphase(world);
    expect(pairs(world)).toHaveLength(0);

    mover.x = 0.25;
    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(1);
  });

  it('withdraws a body that has no colliders rather than leaving stale bounds', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const ghost = addBoxBody(world, 0.25, 0, 0);
    synchronizePhysics3DBroadphase(world);
    expect(pairs(world)).toHaveLength(1);

    // Emptied directly rather than through `removePhysics3DCollider`, so this tests the sync's own
    // withdrawal rather than the lifecycle helper's.
    ghost.colliders.length = 0;
    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(0);
  });

  it('withdraws a body that has diverged to a non-finite position', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const diverged = addBoxBody(world, 0.25, 0, 0);

    diverged.x = Number.NaN;
    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(0);
  });

  it('withdraws a body whose bounds exceed the simulated extent', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const huge = createRigidBody3D('dynamic');
    addPhysics3DBody(world, huge);
    addPhysics3DCollider(
      world,
      huge,
      createPhysics3DCollider({ kind: 'aabb', minX: -1e9, minY: -1, minZ: -1, maxX: 1e9, maxY: 1, maxZ: 1 }),
    );

    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(0);
  });

  it('refreshes each collider world shape as a side effect, so the narrow phase reads current poses', () => {
    const world = createPhysics3DWorld();
    const body = addBoxBody(world, 0, 0, 0);

    body.x = 7;
    synchronizePhysics3DBroadphase(world);

    expect(body.colliders[0].world.kind === 'box' && body.colliders[0].world.x).toBeCloseTo(7, 9);
  });

  it('unions a compound body into one indexed volume', () => {
    const world = createPhysics3DWorld();
    const compound = createRigidBody3D('dynamic');
    addPhysics3DBody(world, compound);
    addPhysics3DCollider(world, compound, createPhysics3DCollider(unitBox()));
    addPhysics3DCollider(
      world,
      compound,
      createPhysics3DCollider({ kind: 'aabb', minX: 9.5, minY: -0.5, minZ: -0.5, maxX: 10.5, maxY: 0.5, maxZ: 0.5 }),
    );
    // Sits beside the FAR collider, which is only a candidate if the body's bounds covered both.
    addBoxBody(world, 10, 0, 0);

    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(1);
  });
});
