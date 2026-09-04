import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';
import {
  createPhysics2DQueryFilter,
  createPhysics2DQueryResult,
  createPhysics2DRayResult,
  createPhysics2DShapeCastResult,
  initializePhysics2DQueryResult,
  initializePhysics2DRayResult,
  initializePhysics2DShapeCastResult,
  queryPhysics2DPoint,
  queryPhysics2DRay,
  queryPhysics2DRayClosest,
  queryPhysics2DRegion,
  queryPhysics2DShapeCast,
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
    const result = createPhysics2DQueryResult();
    expect(Object.hasOwn(result, EntityRuntimeKey)).toBe(true);
    expect(result).toMatchObject({ hits: [], hitCount: 0 });
  });
});

describe('createPhysics2DRayResult', () => {
  it('starts with no live hits', () => {
    const result = createPhysics2DRayResult();
    expect(Object.hasOwn(result, EntityRuntimeKey)).toBe(true);
    expect(result).toMatchObject({ hits: [], hitCount: 0 });
  });
});

describe('createPhysics2DShapeCastResult', () => {
  it('starts as a miss with nothing referenced', () => {
    const result = createPhysics2DShapeCastResult();
    expect(Object.hasOwn(result, EntityRuntimeKey)).toBe(true);
    expect(result).toMatchObject({
      body: null,
      collider: null,
      colliderIndex: -1,
      hit: false,
      fraction: 0,
      x: 0,
      y: 0,
      normalX: 0,
      normalY: 0,
    });
  });
});

describe('initializePhysics2DQueryResult', () => {
  it('is the construction initializer of createPhysics2DQueryResult', () => {
    expect(typeof initializePhysics2DQueryResult).toBe('function');
  });
});

describe('initializePhysics2DRayResult', () => {
  it('is the construction initializer of createPhysics2DRayResult', () => {
    expect(typeof initializePhysics2DRayResult).toBe('function');
  });
});

describe('initializePhysics2DShapeCastResult', () => {
  it('is the construction initializer of createPhysics2DShapeCastResult', () => {
    expect(typeof initializePhysics2DShapeCastResult).toBe('function');
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

describe('queryPhysics2DShapeCast', () => {
  // A world with one static wall, so the analytic answer for a box sweeping into it is arithmetic the
  // test can do rather than a number read off the implementation.
  function walledWorld(): ReturnType<typeof createPhysics2DWorld> {
    const world = createPhysics2DWorld(0, 0);
    const wall = createRigidBody2D('static', 0, 0);
    wall.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: 5, minY: -10, maxX: 6, maxY: 10 }, STONE));
    addPhysics2DBody(world, wall);
    return world;
  }

  const unitBox = { kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 } as const;

  it('stops the sweep exactly where the shape first touches', () => {
    // The box's leading face starts at x = 0.5 and the wall's near face is at x = 5, so it is free for
    // 4.5 units of a 10-unit sweep. That is 0.45, computed from the geometry and not from the result.
    const world = walledWorld();
    const out = createPhysics2DShapeCastResult();

    queryPhysics2DShapeCast(world, unitBox, 10, 0, out);

    expect(out.hit).toBe(true);
    expect(out.fraction).toBeCloseTo(0.45, 9);
    expect(out.body).toBe(world.bodies[0]);
    expect(out.colliderIndex).toBe(0);
    // Pushing the swept shape back out of the wall, so it points along -x.
    expect(out.normalX).toBeCloseTo(-1, 9);
    expect(out.normalY).toBeCloseTo(0, 9);
  });

  it('reports a clean miss when the sweep is too short to reach anything', () => {
    const world = walledWorld();
    const out = createPhysics2DShapeCastResult();

    queryPhysics2DShapeCast(world, unitBox, 3, 0, out);

    expect(out).toMatchObject({
      body: null,
      collider: null,
      colliderIndex: -1,
      hit: false,
      fraction: 0,
      x: 0,
      y: 0,
      normalX: 0,
      normalY: 0,
    });
  });

  it('reports a hit at fraction zero for a shape that already overlaps where it starts', () => {
    // The honest answer to "can I move from here" when the caller is already inside something. Returning
    // a miss would hand a character controller a clear path out of a wall it is buried in.
    const world = walledWorld();
    const out = createPhysics2DShapeCastResult();

    queryPhysics2DShapeCast(world, { kind: 'aabb', minX: 5.2, minY: -0.5, maxX: 5.8, maxY: 0.5 }, 10, 0, out);

    expect(out.hit).toBe(true);
    expect(out.fraction).toBe(0);
  });

  it('agrees with a brute-force march of the discrete overlap test', () => {
    // The instrument is deliberately not the sweep: it steps the shape along the displacement in small
    // increments and asks the ordinary point-in-shape query where it first overlaps. That shares no code
    // with the continuous sweep, so agreement between them is evidence rather than tautology.
    const world = createPhysics2DWorld(0, 0);
    for (const [x, y] of [
      [4, 0.2],
      [7, -3],
      [9, 0.1],
    ]) {
      const blocker = createRigidBody2D('static', 0, 0);
      blocker.colliders.push(createPhysics2DCollider({ kind: 'circle', x, y, radius: 0.6 }, STONE));
      addPhysics2DBody(world, blocker);
    }
    const out = createPhysics2DShapeCastResult();
    queryPhysics2DShapeCast(world, { kind: 'circle', x: 0, y: 0, radius: 0.3 }, 12, 0, out);

    const SAMPLES = 20000;
    let marchedFraction = -1;
    for (let sample = 0; sample <= SAMPLES && marchedFraction < 0; sample += 1) {
      const fraction = sample / SAMPLES;
      const probe = { kind: 'circle', x: 12 * fraction, y: 0, radius: 0.3 } as const;
      const region = createPhysics2DQueryResult();
      queryPhysics2DRegion(world, { minX: probe.x - 0.3, minY: -0.3, maxX: probe.x + 0.3, maxY: 0.3 }, region);
      for (let at = 0; at < region.hitCount; at += 1) {
        const shape = region.hits[at].collider.world;
        if (shape.kind !== 'circle') continue;
        const dx = shape.x - probe.x;
        const dy = shape.y - probe.y;
        if (dx * dx + dy * dy <= (shape.radius + 0.3) * (shape.radius + 0.3)) marchedFraction = fraction;
      }
    }

    expect(marchedFraction).toBeGreaterThan(0);
    expect(out.hit).toBe(true);
    // Within one march increment, which is what a sampled instrument can resolve.
    expect(Math.abs(out.fraction - marchedFraction)).toBeLessThan(2 / SAMPLES);
  });

  it('breaks a tie between two equally distant colliders by body order, every time', () => {
    // Two identical walls the same distance away. Which one is reported must not depend on broadphase
    // traversal order, or a caller doing anything deterministic with the result drifts between runs.
    const world = createPhysics2DWorld(0, 0);
    for (const y of [-2, 2]) {
      const wall = createRigidBody2D('static', 0, 0);
      wall.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: 5, minY: y - 1, maxX: 6, maxY: y + 1 }, STONE));
      addPhysics2DBody(world, wall);
    }
    const tall = { kind: 'aabb', minX: -0.5, minY: -3, maxX: 0.5, maxY: 3 } as const;
    const out = createPhysics2DShapeCastResult();

    queryPhysics2DShapeCast(world, tall, 10, 0, out);
    const first = out.body;
    for (let repeat = 0; repeat < 5; repeat += 1) {
      queryPhysics2DShapeCast(world, tall, 10, 0, out);
      expect(out.body).toBe(first);
    }
    // And it is the lower body index rather than an arbitrary one.
    expect(first).toBe(world.bodies[0]);
  });

  it('honours maxFraction without changing what a fraction means', () => {
    const world = walledWorld();
    const out = createPhysics2DShapeCastResult();

    queryPhysics2DShapeCast(world, unitBox, 10, 0, out, 0.4);
    expect(out.hit).toBe(false);

    // Still 0.45 of the FULL displacement, not 0.9 of the shortened one.
    queryPhysics2DShapeCast(world, unitBox, 10, 0, out, 0.5);
    expect(out.hit).toBe(true);
    expect(out.fraction).toBeCloseTo(0.45, 9);
  });

  it('applies the query filter to bodies and colliders alike', () => {
    const world = walledWorld();
    const out = createPhysics2DShapeCastResult();
    const filter = createPhysics2DQueryFilter();

    filter.includeStatic = false;
    queryPhysics2DShapeCast(world, unitBox, 10, 0, out, 1, filter);
    expect(out.hit).toBe(false);

    filter.includeStatic = true;
    filter.maskBits = 0;
    queryPhysics2DShapeCast(world, unitBox, 10, 0, out, 1, filter);
    expect(out.hit).toBe(false);
  });

  it('clears a reused result rather than leaving the previous cast in it', () => {
    // The failure this prevents is a loop of casts where a miss silently reports the last hit.
    const world = walledWorld();
    const out = createPhysics2DShapeCastResult();
    queryPhysics2DShapeCast(world, unitBox, 10, 0, out);
    expect(out.hit).toBe(true);

    queryPhysics2DShapeCast(world, unitBox, -10, 0, out);
    expect(out.hit).toBe(false);
    expect(out.body).toBeNull();
    expect(out.collider).toBeNull();
    expect(out.colliderIndex).toBe(-1);
  });

  it('declines a non-finite displacement or a negative maxFraction instead of searching', () => {
    const world = walledWorld();
    const out = createPhysics2DShapeCastResult();

    for (const [dx, dy] of [
      [Number.NaN, 0],
      [0, Number.POSITIVE_INFINITY],
    ]) {
      queryPhysics2DShapeCast(world, unitBox, dx, dy, out);
      expect(out.hit).toBe(false);
    }
    queryPhysics2DShapeCast(world, unitBox, 10, 0, out, -1);
    expect(out.hit).toBe(false);
  });

  it('sweeps backwards as readily as forwards, so the bounds union is not one-sided', () => {
    const world = createPhysics2DWorld(0, 0);
    const wall = createRigidBody2D('static', 0, 0);
    wall.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -6, minY: -10, maxX: -5, maxY: 10 }, STONE));
    addPhysics2DBody(world, wall);
    const out = createPhysics2DShapeCastResult();

    queryPhysics2DShapeCast(world, unitBox, -10, 0, out);

    expect(out.hit).toBe(true);
    expect(out.fraction).toBeCloseTo(0.45, 9);
    expect(out.normalX).toBeCloseTo(1, 9);
  });
});
