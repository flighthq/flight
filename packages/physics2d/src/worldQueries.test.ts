import { describe, expect, it } from 'vitest';

import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';
import { createPhysics2DQueryResult, queryPhysics2DPoint, queryPhysics2DRegion } from './worldQueries';

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

describe('queryPhysics2DRegion', () => {
  it('refines aggregate body candidates to overlapping collider bounds', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(
      createPhysics2DCollider({ kind: 'circle', radius: 1, x: -5, y: 0 }, STONE),
      createPhysics2DCollider({ kind: 'circle', radius: 1, x: 5, y: 0 }, STONE),
    );
    addPhysics2DBody(world, body);
    const out = createPhysics2DQueryResult();

    queryPhysics2DRegion(world, { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, out);
    expect(out.hitCount).toBe(0);

    queryPhysics2DRegion(world, { minX: 4.5, minY: -0.5, maxX: 5.5, maxY: 0.5 }, out);
    expect(out.hitCount).toBe(1);
    expect(out.hits[0]).toEqual({ body, collider: body.colliders[1], colliderIndex: 1 });
  });

  it('uses current poses and preserves deterministic body/collider order', () => {
    const world = createPhysics2DWorld(0, 0);
    const first = createRigidBody2D('dynamic', -10, 0);
    first.colliders.push(
      createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE),
      createPhysics2DCollider({ kind: 'circle', radius: 0.5, x: 0, y: 0 }, STONE),
    );
    const second = createRigidBody2D('dynamic', 0, 0);
    second.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, first);
    addPhysics2DBody(world, second);
    first.x = 0;
    const out = createPhysics2DQueryResult();

    queryPhysics2DRegion(world, { minX: -0.25, minY: -0.25, maxX: 0.25, maxY: 0.25 }, out);

    expect(out.hits.slice(0, out.hitCount).map((hit) => [hit.body.index, hit.colliderIndex])).toEqual([
      [first.index, 0],
      [first.index, 1],
      [second.index, 0],
    ]);
  });

  it('clears live hits for an empty region while retaining high-water storage', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DQueryResult();
    queryPhysics2DRegion(world, { minX: -1, minY: -1, maxX: 1, maxY: 1 }, out);
    const retained = out.hits[0];

    queryPhysics2DRegion(world, { minX: 10, minY: 10, maxX: 11, maxY: 11 }, out);

    expect(out.hitCount).toBe(0);
    expect(out.hits[0]).toBe(retained);
  });
});
