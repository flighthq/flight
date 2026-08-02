import { describe, expect, it } from 'vitest';

import { synchronizePhysics2DBroadphase } from './broadphase';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

describe('synchronizePhysics2DBroadphase', () => {
  it('publishes a body at its current pose', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 2, 3);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, body);
    const found: number[] = [];

    synchronizePhysics2DBroadphase(world);
    world.index.querySpatialPoint(2, 3, found);

    expect(found).toEqual([body.index]);
  });
});
