import { describe, expect, it } from 'vitest';

import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';
import {
  createPhysics2DQueryFilter,
  createPhysics2DQueryResult,
  createPhysics2DRayResult,
  queryPhysics2DPoint,
  queryPhysics2DRay,
  queryPhysics2DRayClosest,
  queryPhysics2DRegion,
} from './worldQueries';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

describe('createPhysics2DQueryFilter', () => {
  it('includes every body kind, sensor, category, and mask by default', () => {
    expect(createPhysics2DQueryFilter()).toEqual({
      categoryBits: 0xffffffff,
      maskBits: 0xffffffff,
      includeSensors: true,
      includeDynamic: true,
      includeKinematic: true,
      includeStatic: true,
    });
  });
});

describe('createPhysics2DQueryResult', () => {
  it('starts with no live hits', () => {
    expect(createPhysics2DQueryResult()).toEqual({ hits: [], hitCount: 0 });
  });
});

describe('createPhysics2DRayResult', () => {
  it('starts with no live hits', () => {
    expect(createPhysics2DRayResult()).toEqual({ hits: [], hitCount: 0 });
  });
});

describe('queryPhysics2DPoint', () => {
  it('keeps broadphase candidates isolated when a filter getter starts a nested query', () => {
    const world = createPhysics2DWorld(0, 0);
    const first = createRigidBody2D('dynamic', 0, 0);
    const second = createRigidBody2D('dynamic', 0, 0);
    first.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    second.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, first);
    addPhysics2DBody(world, second);
    const nestedWorld = createPhysics2DWorld(0, 0);
    const filter = createPhysics2DQueryFilter();
    let nestedCalls = 0;
    Object.defineProperty(filter, 'includeDynamic', {
      configurable: true,
      enumerable: true,
      get() {
        if (nestedCalls === 0) {
          nestedCalls++;
          queryPhysics2DPoint(nestedWorld, 0, 0, createPhysics2DQueryResult());
        }
        return true;
      },
    });
    const out = createPhysics2DQueryResult();

    queryPhysics2DPoint(world, 0, 0, out, filter);

    expect(nestedCalls).toBe(1);
    expect(out.hits.slice(0, out.hitCount).map((hit) => hit.body)).toEqual([first, second]);
  });

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

  it('queries transformed point and segment colliders at their current pose', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 3, 4, Math.PI / 2);
    body.colliders.push(
      createPhysics2DCollider({ kind: 'point', x: 2, y: 0 }, STONE),
      createPhysics2DCollider({ kind: 'segment', x0: 0, y0: 0, x1: 2, y1: 0 }, STONE),
    );
    addPhysics2DBody(world, body);
    const out = createPhysics2DQueryResult();

    queryPhysics2DPoint(world, 3, 6, out);

    expect(out.hits.slice(0, out.hitCount).map((hit) => hit.colliderIndex)).toEqual([0, 1]);
  });

  it('filters body participation, sensors, collider categories, and collider masks', () => {
    const world = createPhysics2DWorld(0, 0);
    const dynamic = createRigidBody2D('dynamic', 0, 0);
    dynamic.colliders.push(
      createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE, true, {
        categoryBits: 0x2,
        maskBits: 0x4,
        groupIndex: 0,
      }),
    );
    const fixed = createRigidBody2D('static', 0, 0);
    fixed.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, dynamic);
    addPhysics2DBody(world, fixed);
    const filter = createPhysics2DQueryFilter();
    filter.categoryBits = 0x2;
    filter.maskBits = 0x4;
    filter.includeSensors = false;
    filter.includeStatic = false;
    const out = createPhysics2DQueryResult();

    queryPhysics2DPoint(world, 0, 0, out, filter);
    expect(out.hitCount).toBe(0);
    filter.includeSensors = true;
    queryPhysics2DPoint(world, 0, 0, out, filter);
    expect(out.hits.slice(0, out.hitCount).map((hit) => hit.body)).toEqual([dynamic]);
  });
});

describe('queryPhysics2DRay', () => {
  it('returns exact intersections nearest-first rather than body insertion order', () => {
    const world = createPhysics2DWorld(0, 0);
    const far = createRigidBody2D('dynamic', 5, 0);
    far.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    const near = createRigidBody2D('dynamic', 2, 0);
    near.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -1, maxX: 0.5, maxY: 1 }, STONE));
    addPhysics2DBody(world, far);
    addPhysics2DBody(world, near);
    const out = createPhysics2DRayResult();

    queryPhysics2DRay(world, 0, 0, 1, 0, out);

    expect(out.hitCount).toBe(2);
    expect(out.hits.slice(0, out.hitCount).map((hit) => hit.body)).toEqual([near, far]);
    expect(out.hits[0]).toMatchObject({ colliderIndex: 0, fraction: 1.5, normalX: -1, normalY: 0, x: 1.5, y: 0 });
    expect(out.hits[1].fraction).toBeCloseTo(4);
  });

  it('refines broadphase candidates against rotated shape geometry', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0, Math.PI / 4);
    body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -2, minY: -0.25, maxX: 2, maxY: 0.25 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DRayResult();

    queryPhysics2DRay(world, -1.5, 1.4, 0.2, 0, out, 1);

    expect(out.hitCount).toBe(0);
  });

  it('honours maxFraction and reuses retained hit objects', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 3, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DRayResult();
    queryPhysics2DRay(world, 0, 0, 1, 0, out);
    const retained = out.hits[0];

    queryPhysics2DRay(world, 0, 0, 1, 0, out, 1);
    expect(out.hitCount).toBe(0);
    queryPhysics2DRay(world, 0, 0, 1, 0, out, 2);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0]).toBe(retained);
  });

  it('degenerates a zero direction to an exact point query', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 3, 4);
    body.colliders.push(createPhysics2DCollider({ kind: 'point', x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DRayResult();

    queryPhysics2DRay(world, 3, 4, 0, 0, out);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0]).toMatchObject({ body, fraction: 0, normalX: 0, normalY: 0, x: 3, y: 4 });
  });
});

describe('queryPhysics2DRayClosest', () => {
  it('writes only the deterministic nearest filtered hit and reuses its retained record', () => {
    const world = createPhysics2DWorld(0, 0);
    const far = createRigidBody2D('dynamic', 5, 0);
    far.colliders.push(
      createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE, false, {
        categoryBits: 0x2,
        maskBits: 0x2,
        groupIndex: 0,
      }),
    );
    const near = createRigidBody2D('dynamic', 2, 0);
    near.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 0.5, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, far);
    addPhysics2DBody(world, near);
    const out = createPhysics2DRayResult();

    queryPhysics2DRayClosest(world, 0, 0, 1, 0, out);
    expect(out.hitCount).toBe(1);
    expect(out.hits[0].body).toBe(near);
    const retained = out.hits[0];

    const filter = createPhysics2DQueryFilter();
    filter.categoryBits = 0x2;
    filter.maskBits = 0x2;
    queryPhysics2DRayClosest(world, 0, 0, 1, 0, out, Number.POSITIVE_INFINITY, filter);
    expect(out.hitCount).toBe(1);
    expect(out.hits[0]).toBe(retained);
    expect(out.hits[0].body).toBe(far);
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

  it('applies the same reusable filter and rejects invalid regions', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('kinematic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, body);
    const filter = createPhysics2DQueryFilter();
    filter.includeKinematic = false;
    const out = createPhysics2DQueryResult();

    queryPhysics2DRegion(world, { minX: -1, minY: -1, maxX: 1, maxY: 1 }, out, filter);
    expect(out.hitCount).toBe(0);
    filter.includeKinematic = true;
    queryPhysics2DRegion(world, { minX: 1, minY: 1, maxX: -1, maxY: -1 }, out, filter);
    expect(out.hitCount).toBe(0);
    queryPhysics2DRegion(world, { minX: -1, minY: -1, maxX: 1, maxY: 1 }, out, filter);
    expect(out.hits.slice(0, out.hitCount).map((hit) => hit.body)).toEqual([body]);
  });
});
