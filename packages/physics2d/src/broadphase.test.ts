import { describe, expect, it } from 'vitest';

import { synchronizePhysics2DBroadphase, synchronizePhysics2DSweptBroadphase } from './broadphase';
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

  it('keeps zero-area shapes and inclusive upper edges queryable', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 2, 3);
    body.colliders.push(createPhysics2DCollider({ kind: 'point', x: 1, y: 1 }, STONE));
    addPhysics2DBody(world, body);
    const found: number[] = [];

    synchronizePhysics2DBroadphase(world);
    world.index.querySpatialPoint(3, 4, found);

    expect(found).toEqual([body.index]);
  });
});

describe('synchronizePhysics2DSweptBroadphase', () => {
  it('emits a pair separated now but overlapping during relative translation', () => {
    const world = createPhysics2DWorld(0, 0);
    const first = createRigidBody2D('dynamic', 0, 0);
    first.velocityX = 10;
    first.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }));
    addPhysics2DBody(world, first);
    const second = createRigidBody2D('kinematic', 10, 0);
    second.velocityX = -10;
    second.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }));
    addPhysics2DBody(world, second);
    const pairs: { a: number; b: number }[] = [];

    synchronizePhysics2DBroadphase(world);
    world.index.querySpatialPairs(pairs);
    expect(pairs).toHaveLength(0);

    synchronizePhysics2DSweptBroadphase(world, 0.5);
    world.index.querySpatialPairs(pairs);
    expect(pairs).toEqual([{ a: first.index, b: second.index }]);
  });
});
