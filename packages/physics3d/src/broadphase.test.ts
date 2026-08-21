import { setSpatialIndexingGuard } from '@flighthq/spatial/contract';
import type {
  CollisionBuiltInShape3D,
  Physics3DWorld,
  RigidBody3D,
  SpatialIndexingNotice,
  SpatialPair,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { synchronizePhysics3DBroadphase, synchronizePhysics3DSweptBroadphase } from './broadphase';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
  removePhysics3DBody,
} from './world';

afterEach(() => {
  setSpatialIndexingGuard(null);
});

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
  it('uses insert, update, and remove without false missing-id lifecycle notices', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');

    addPhysics3DBody(world, body);
    for (let step = 0; step < 100; step += 1) synchronizePhysics3DBroadphase(world);
    addPhysics3DCollider(world, body, createPhysics3DCollider(unitBox()));
    synchronizePhysics3DBroadphase(world);
    body.colliders.length = 0;
    synchronizePhysics3DBroadphase(world);
    synchronizePhysics3DBroadphase(world);
    removePhysics3DBody(world, body);

    expect(notices.filter((notice) => notice.reason === 'missing-id')).toEqual([]);
  });

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

describe('synchronizePhysics3DSweptBroadphase', () => {
  it('pairs bodies that will only meet PART WAY through the interval', () => {
    // The whole reason a swept publication exists: at the current pose these two are 20 apart, so an
    // ordinary sync reports no candidate and a continuous pass would never even test the pair.
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const mover = addBoxBody(world, 20, 0, 0);
    mover.velocityX = -1200;
    synchronizePhysics3DBroadphase(world);
    expect(pairs(world)).toHaveLength(0);

    synchronizePhysics3DSweptBroadphase(world, 1 / 60);

    expect(pairs(world)).toHaveLength(1);
  });

  it('leaves a body that is not moving where it was', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    addBoxBody(world, 20, 0, 0);

    synchronizePhysics3DSweptBroadphase(world, 1 / 60);

    expect(pairs(world)).toHaveLength(0);
  });

  it('does not widen a STATIC body, which cannot move however fast its velocity field reads', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const stuck = createRigidBody3D('static');
    stuck.x = 20;
    stuck.velocityX = -1200;
    addPhysics3DBody(world, stuck);
    addPhysics3DCollider(world, stuck, createPhysics3DCollider(unitBox()));

    synchronizePhysics3DSweptBroadphase(world, 1 / 60);

    expect(pairs(world)).toHaveLength(0);
  });

  it('does not widen a SLEEPING body', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const asleep = addBoxBody(world, 20, 0, 0);
    asleep.velocityX = -1200;
    asleep.sleeping = true;

    synchronizePhysics3DSweptBroadphase(world, 1 / 60);

    expect(pairs(world)).toHaveLength(0);
  });

  it('covers every orientation a SPINNING body could reach, not just its translation', () => {
    // A rotating body's colliders swing through space its straight-line sweep never enters, so the
    // widened volume has to be the sphere its geometry can reach rather than the box it currently fills.
    const world = createPhysics3DWorld();
    const spinner = createRigidBody3D('dynamic');
    addPhysics3DBody(world, spinner);
    // A long arm reaching out along x; spun about y its far end sweeps to z.
    addPhysics3DCollider(
      world,
      spinner,
      createPhysics3DCollider({ kind: 'aabb', minX: -0.25, minY: -0.25, minZ: -0.25, maxX: 4, maxY: 0.25, maxZ: 0.25 }),
    );
    spinner.angularVelocityY = 30;
    addBoxBody(world, 0, 0, 3.5);

    synchronizePhysics3DBroadphase(world);
    expect(pairs(world)).toHaveLength(0);
    synchronizePhysics3DSweptBroadphase(world, 1 / 60);

    expect(pairs(world)).toHaveLength(1);
  });

  it('restores the ordinary bounds when the plain sync runs after it', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const mover = addBoxBody(world, 20, 0, 0);
    mover.velocityX = -1200;

    synchronizePhysics3DSweptBroadphase(world, 1 / 60);
    expect(pairs(world)).toHaveLength(1);
    synchronizePhysics3DBroadphase(world);

    expect(pairs(world)).toHaveLength(0);
  });
});
