import { describe, expect, it } from 'vitest';

import { synchronizePhysics2DBroadphase, synchronizePhysics2DSweptBroadphase } from './broadphase';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

describe('synchronizePhysics2DBroadphase', () => {
  it('keeps published bounds isolated when an index callback synchronizes another world', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 2, 3);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, body);

    const nestedWorld = createPhysics2DWorld(0, 0);
    const nestedBody = createRigidBody2D('dynamic', 100, 200);
    nestedBody.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 5, x: 0, y: 0 }, STONE));
    addPhysics2DBody(nestedWorld, nestedBody);

    let nestedCalls = 0;
    let published = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    world.index.updateSpatialObject = (_id, bounds) => {
      nestedCalls++;
      synchronizePhysics2DBroadphase(nestedWorld);
      published = { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
      return true;
    };

    synchronizePhysics2DBroadphase(world);

    expect(nestedCalls).toBe(1);
    expect(published.minX).toBe(1);
    expect(published.minY).toBe(2);
    expect(published.maxX).toBeCloseTo(3);
    expect(published.maxY).toBeCloseTo(4);
  });

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
    first.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }, STONE));
    addPhysics2DBody(world, first);
    const second = createRigidBody2D('kinematic', 10, 0);
    second.velocityX = -10;
    second.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }, STONE));
    addPhysics2DBody(world, second);
    const pairs: { a: number; b: number }[] = [];

    synchronizePhysics2DBroadphase(world);
    world.index.querySpatialPairs(pairs);
    expect(pairs).toHaveLength(0);

    synchronizePhysics2DSweptBroadphase(world, 0.5);
    world.index.querySpatialPairs(pairs);
    expect(pairs).toEqual([{ a: first.index, b: second.index }]);
  });

  it('conservatively indexes the full rotation radius of an angular body', () => {
    const world = createPhysics2DWorld(0, 0);
    const rod = createRigidBody2D('dynamic', 0, 0);
    rod.angularVelocity = Math.PI;
    rod.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -2, minY: -0.05, maxX: 2, maxY: 0.05 }, STONE));
    addPhysics2DBody(world, rod);
    const obstacle = createRigidBody2D('static', 0, 1.5);
    obstacle.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.1 }, STONE));
    addPhysics2DBody(world, obstacle);
    const pairs: { a: number; b: number }[] = [];

    synchronizePhysics2DBroadphase(world);
    world.index.querySpatialPairs(pairs);
    expect(pairs).toHaveLength(0);

    synchronizePhysics2DSweptBroadphase(world, 0.5);
    world.index.querySpatialPairs(pairs);
    expect(pairs).toEqual([{ a: rod.index, b: obstacle.index }]);
  });
});
