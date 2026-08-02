import { describe, expect, it } from 'vitest';

import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';
import { createPhysics2DQueryResult, queryPhysics2DPoint } from './worldQueries';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

describe('createPhysics2DQueryResult', () => {
  it('starts with no live hits', () => {
    expect(createPhysics2DQueryResult()).toEqual({ hits: [], hitCount: 0 });
  });
});

describe('queryPhysics2DPoint', () => {
  it('returns exact collider hits rather than broadphase-only body hits', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0, Math.PI / 4);
    body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -2, minY: -0.25, maxX: 2, maxY: 0.25 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DQueryResult();

    queryPhysics2DPoint(world, 1, 0, out);
    expect(out.hitCount).toBe(0);
    queryPhysics2DPoint(world, 1, 1, out);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0]).toEqual({ body, collider: body.colliders[0], colliderIndex: 0 });
  });

  it('observes current poses and reuses its high-water hit object', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DQueryResult();

    queryPhysics2DPoint(world, 0, 0, out);
    const retainedHit = out.hits[0];
    body.x = 5;
    queryPhysics2DPoint(world, 0, 0, out);
    expect(out.hitCount).toBe(0);
    queryPhysics2DPoint(world, 5, 0, out);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0]).toBe(retainedHit);
  });

  it('reports every containing collider in deterministic order', () => {
    const world = createPhysics2DWorld(0, 0);
    const first = createRigidBody2D('dynamic', 0, 0);
    first.colliders.push(
      createPhysics2DCollider({ kind: 'circle', radius: 2, x: 0, y: 0 }, STONE),
      createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE),
    );
    const second = createRigidBody2D('dynamic', 0, 0);
    second.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, first);
    addPhysics2DBody(world, second);
    const out = createPhysics2DQueryResult();

    queryPhysics2DPoint(world, 0, 0, out);

    expect(out.hits.slice(0, out.hitCount).map((hit) => [hit.body.index, hit.colliderIndex])).toEqual([
      [first.index, 0],
      [first.index, 1],
      [second.index, 0],
    ]);
  });
});
