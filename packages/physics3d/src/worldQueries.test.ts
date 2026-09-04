import { createCollisionTriangleMesh3D, registerBuiltInCollisionSupports3D } from '@flighthq/collision/contract';
import type { CollisionBuiltInShape3D, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
} from './world';
import {
  createPhysics3DQueryFilter,
  createPhysics3DQueryResult,
  createPhysics3DRayResult,
  createPhysics3DShapeCastResult,
  initializePhysics3DQueryResult,
  initializePhysics3DRayResult,
  initializePhysics3DShapeCastResult,
  queryPhysics3DPoint,
  queryPhysics3DRay,
  queryPhysics3DRayClosest,
  queryPhysics3DRegion,
  queryPhysics3DShapeCast,
} from './worldQueries';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

function unitBox(): CollisionBuiltInShape3D {
  return { kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 };
}

function addBoxBody(
  world: Physics3DWorld,
  x: number,
  y: number,
  z: number,
  type: RigidBody3D['type'] = 'dynamic',
  sensor = false,
): RigidBody3D {
  const body = createRigidBody3D(type);
  body.x = x;
  body.y = y;
  body.z = z;
  addPhysics3DBody(world, body);
  addPhysics3DCollider(world, body, createPhysics3DCollider(unitBox(), undefined, undefined, sensor));
  return body;
}

describe('createPhysics3DQueryFilter', () => {
  it('admits everything by default, so a filter is opt-out rather than opt-in', () => {
    expect(createPhysics3DQueryFilter()).toEqual({
      categoryBits: 0xffffffff,
      maskBits: 0xffffffff,
      includeSensors: true,
      includeDynamic: true,
      includeKinematic: true,
      includeStatic: true,
    });
  });
});

describe('createPhysics3DQueryResult', () => {
  it('starts empty', () => {
    expect(createPhysics3DQueryResult()).toMatchObject({ hits: [], hitCount: 0 });
  });
});

describe('createPhysics3DRayResult', () => {
  it('starts empty', () => {
    expect(createPhysics3DRayResult()).toMatchObject({ hits: [], hitCount: 0 });
  });
});

describe('createPhysics3DShapeCastResult', () => {
  it('starts as a miss with no body', () => {
    const out = createPhysics3DShapeCastResult();
    expect(out.hit).toBe(false);
    expect(out.body).toBeNull();
    expect(out.collider).toBeNull();
    expect(out.colliderIndex).toBe(-1);
  });
});

describe('initializePhysics3DQueryResult', () => {
  it('is the construction initializer of createPhysics3DQueryResult', () => {
    expect(typeof initializePhysics3DQueryResult).toBe('function');
  });
});

describe('initializePhysics3DRayResult', () => {
  it('is the construction initializer of createPhysics3DRayResult', () => {
    expect(typeof initializePhysics3DRayResult).toBe('function');
  });
});

describe('initializePhysics3DShapeCastResult', () => {
  it('is the construction initializer of createPhysics3DShapeCastResult', () => {
    expect(typeof initializePhysics3DShapeCastResult).toBe('function');
  });
});

describe('queryPhysics3DPoint', () => {
  it('finds the collider containing the point', () => {
    const world = createPhysics3DWorld();
    const body = addBoxBody(world, 0, 0, 0);
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, 0.1, 0.1, 0.1, out);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0].body).toBe(body);
    expect(out.hits[0].colliderIndex).toBe(0);
  });

  it('finds nothing at a point in empty space', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, 5, 5, 5, out);

    expect(out.hitCount).toBe(0);
  });

  it('separates on Z, so a point out of plane does not hit', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, 0, 0, 5, out);

    expect(out.hitCount).toBe(0);
  });

  it('sees the CURRENT pose without needing a step first', () => {
    // The synchronize-first rule. A caller that moves a body and picks immediately must not query the
    // pose the last step published.
    const world = createPhysics3DWorld();
    const body = addBoxBody(world, 0, 0, 0);
    const out = createPhysics3DQueryResult();

    body.x = 10;
    queryPhysics3DPoint(world, 10, 0, 0, out);

    expect(out.hitCount).toBe(1);
    queryPhysics3DPoint(world, 0, 0, 0, out);
    expect(out.hitCount).toBe(0);
  });

  it('excludes a body type the filter turned off', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0, 'static');
    const filter = createPhysics3DQueryFilter();
    filter.includeStatic = false;
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, 0, 0, 0, out, filter);

    expect(out.hitCount).toBe(0);
  });

  it('excludes sensors when the filter says so', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0, 'dynamic', true);
    const filter = createPhysics3DQueryFilter();
    filter.includeSensors = false;
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, 0, 0, 0, out, filter);

    expect(out.hitCount).toBe(0);
  });

  it('excludes a collider whose category the filter mask does not select', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    addPhysics3DBody(world, body);
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider(unitBox(), undefined, { categoryBits: 2, maskBits: 2, groupIndex: 0 }),
    );
    const filter = createPhysics3DQueryFilter();
    filter.categoryBits = 1;
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, 0, 0, 0, out, filter);

    expect(out.hitCount).toBe(0);
  });

  it('orders hits by body index rather than by broadphase history', () => {
    const world = createPhysics3DWorld();
    const first = addBoxBody(world, 0, 0, 0);
    const second = addBoxBody(world, 0, 0, 0);
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, 0, 0, 0, out);

    expect(out.hitCount).toBe(2);
    expect(out.hits[0].body.index).toBeLessThan(out.hits[1].body.index);
    expect([first.index, second.index]).toContain(out.hits[0].body.index);
  });

  it('declines a non-finite point rather than reporting a hit', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, Number.NaN, 0, 0, out);

    expect(out.hitCount).toBe(0);
  });

  it('reuses hit records across calls, so a picking loop allocates nothing after its first frame', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const out = createPhysics3DQueryResult();

    queryPhysics3DPoint(world, 0, 0, 0, out);
    const record = out.hits[0];
    queryPhysics3DPoint(world, 5, 5, 5, out);
    expect(out.hitCount).toBe(0);
    queryPhysics3DPoint(world, 0, 0, 0, out);

    expect(out.hits[0]).toBe(record);
    // The stale record above the live prefix is retained on purpose and must not be published.
    expect(out.hits.length).toBeGreaterThanOrEqual(out.hitCount);
  });
});

describe('queryPhysics3DRay', () => {
  it('raycasts static triangle mesh surfaces', () => {
    const world = createPhysics3DWorld();
    const terrain = createRigidBody3D('static');
    terrain.colliders.push(
      createPhysics3DCollider(createCollisionTriangleMesh3D([-5, 0, -5, 5, 0, -5, 0, 0, 5], [0, 1, 2])),
    );
    addPhysics3DBody(world, terrain);
    const out = createPhysics3DRayResult();

    queryPhysics3DRay(world, 0, 2, 0, 0, -1, 0, out);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0].body).toBe(terrain);
    expect(out.hits[0].fraction).toBeCloseTo(2, 12);
  });

  it('finds every collider along the ray, nearest first', () => {
    const world = createPhysics3DWorld();
    const far = addBoxBody(world, 10, 0, 0);
    const near = addBoxBody(world, 5, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRay(world, -10, 0, 0, 1, 0, 0, out);

    expect(out.hitCount).toBe(2);
    expect(out.hits[0].body).toBe(near);
    expect(out.hits[1].body).toBe(far);
    expect(out.hits[0].fraction).toBeLessThan(out.hits[1].fraction);
  });

  it('reports the hit point on the ray in the caller parameterization', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 5, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRay(world, -10, 0, 0, 2, 0, 0, out);

    const hit = out.hits[0];
    expect(hit.x).toBeCloseTo(-10 + 2 * hit.fraction, 9);
    expect(hit.normalX).toBeCloseTo(-1, 9);
  });

  it('bounds the ray with maxFraction', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 5, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRay(world, 0, 0, 0, 1, 0, 0, out, 4);
    expect(out.hitCount).toBe(0);
    queryPhysics3DRay(world, 0, 0, 0, 1, 0, 0, out, 5);
    expect(out.hitCount).toBe(1);
  });

  it('finds nothing when the ray points away', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 5, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRay(world, 0, 0, 0, -1, 0, 0, out);

    expect(out.hitCount).toBe(0);
  });

  it('respects the filter', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 5, 0, 0, 'static');
    const filter = createPhysics3DQueryFilter();
    filter.includeStatic = false;
    const out = createPhysics3DRayResult();

    queryPhysics3DRay(world, 0, 0, 0, 1, 0, 0, out, Number.POSITIVE_INFINITY, filter);

    expect(out.hitCount).toBe(0);
  });

  it('declines a non-finite ray', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 5, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRay(world, 0, 0, 0, Number.NaN, 0, 0, out);

    expect(out.hitCount).toBe(0);
  });

  it('sorts only the live prefix, leaving stale records above hitCount unpublished', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 5, 0, 0);
    addBoxBody(world, 10, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRay(world, 0, 0, 0, 1, 0, 0, out);
    expect(out.hitCount).toBe(2);
    queryPhysics3DRay(world, 0, 0, 0, 1, 0, 0, out, 6);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0].fraction).toBeCloseTo(4.5, 6);
  });
});
describe('queryPhysics3DRayClosest', () => {
  it('writes only the nearest hit', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 10, 0, 0);
    const near = addBoxBody(world, 5, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRayClosest(world, -10, 0, 0, 1, 0, 0, out);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0].body).toBe(near);
  });

  it('breaks an exact tie by body index, not by traversal order', () => {
    const world = createPhysics3DWorld();
    // Two identical boxes at the same place: the fractions are exactly equal.
    const first = addBoxBody(world, 5, 0, 0);
    addBoxBody(world, 5, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRayClosest(world, 0, 0, 0, 1, 0, 0, out);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0].body).toBe(first);
  });

  it('finds nothing when the ray misses everything', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 5, 0, 0);
    const out = createPhysics3DRayResult();

    queryPhysics3DRayClosest(world, 0, 50, 0, 1, 0, 0, out);

    expect(out.hitCount).toBe(0);
  });
});

describe('queryPhysics3DRegion', () => {
  it('finds colliders overlapping the region', () => {
    const world = createPhysics3DWorld();
    const inside = addBoxBody(world, 0, 0, 0);
    addBoxBody(world, 50, 0, 0);
    const out = createPhysics3DQueryResult();

    queryPhysics3DRegion(world, { minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 }, out);

    expect(out.hitCount).toBe(1);
    expect(out.hits[0].body).toBe(inside);
  });

  it('refines a compound body per collider, not by its aggregate bounds', () => {
    // The index holds one volume for the whole body, so a region in the empty gap between two colliders
    // is a broadphase candidate. Publishing it would report geometry that is not there.
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    addPhysics3DBody(world, body);
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: -10.5, minY: -0.5, minZ: -0.5, maxX: -9.5, maxY: 0.5, maxZ: 0.5 }),
    );
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: 9.5, minY: -0.5, minZ: -0.5, maxX: 10.5, maxY: 0.5, maxZ: 0.5 }),
    );
    const out = createPhysics3DQueryResult();

    queryPhysics3DRegion(world, { minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 }, out);

    expect(out.hitCount).toBe(0);
  });

  it('finds both colliders of a compound body when the region covers both', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    addPhysics3DBody(world, body);
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: -2.5, minY: -0.5, minZ: -0.5, maxX: -1.5, maxY: 0.5, maxZ: 0.5 }),
    );
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: 1.5, minY: -0.5, minZ: -0.5, maxX: 2.5, maxY: 0.5, maxZ: 0.5 }),
    );
    const out = createPhysics3DQueryResult();

    queryPhysics3DRegion(world, { minX: -5, minY: -5, minZ: -5, maxX: 5, maxY: 5, maxZ: 5 }, out);

    expect(out.hitCount).toBe(2);
    expect(out.hits.slice(0, 2).map((h) => h.colliderIndex)).toEqual([0, 1]);
  });

  it('declines an inverted or non-finite region', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0);
    const out = createPhysics3DQueryResult();

    queryPhysics3DRegion(world, { minX: 1, minY: -1, minZ: -1, maxX: -1, maxY: 1, maxZ: 1 }, out);
    expect(out.hitCount).toBe(0);
    queryPhysics3DRegion(world, { minX: Number.NaN, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 }, out);
    expect(out.hitCount).toBe(0);
  });

  it('respects the filter', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 0, 0, 'kinematic');
    const filter = createPhysics3DQueryFilter();
    filter.includeKinematic = false;
    const out = createPhysics3DQueryResult();

    queryPhysics3DRegion(world, { minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 }, out);
    expect(out.hitCount).toBe(1);
    queryPhysics3DRegion(world, { minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 }, out, filter);
    expect(out.hitCount).toBe(0);
  });
});

describe('queryPhysics3DShapeCast', () => {
  it('casts convex shapes against static triangle mesh surfaces', () => {
    const world = createPhysics3DWorld();
    const terrain = createRigidBody3D('static');
    terrain.colliders.push(
      createPhysics3DCollider(createCollisionTriangleMesh3D([-5, 0, -5, 5, 0, -5, 0, 0, 5], [0, 1, 2])),
    );
    addPhysics3DBody(world, terrain);
    const out = createPhysics3DShapeCastResult();
    const sphere: CollisionBuiltInShape3D = { kind: 'sphere', x: 0, y: 2, z: 0, radius: 0.25 };

    queryPhysics3DShapeCast(world, sphere, 0, -4, 0, out);

    expect(out.hit).toBe(true);
    expect(out.body).toBe(terrain);
    expect(out.fraction).toBeCloseTo(0.4375, 5);
  });

  it('stops a swept shape at the first collider and reports where', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 10, 0, 0, 'static');
    const out = createPhysics3DShapeCastResult();

    // A unit box at the origin swept 20 along +x. The target's near face is at 9.5 and the caster's own
    // half-extent is 0.5, so contact is at 9 of 20.
    queryPhysics3DShapeCast(world, unitBox(), 20, 0, 0, out);

    expect(out.hit).toBe(true);
    expect(out.fraction).toBeCloseTo(9 / 20, 4);
    expect(out.body?.x).toBe(10);
  });

  it('reports a clean miss when nothing is in the swept path', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 0, 50, 0, 'static');
    const out = createPhysics3DShapeCastResult();

    queryPhysics3DShapeCast(world, unitBox(), 20, 0, 0, out);

    expect(out.hit).toBe(false);
    expect(out.body).toBeNull();
    expect(out.fraction).toBe(0);
  });

  it('finds a collider the sweep reaches but the start position does not touch', () => {
    // The whole reason the broadphase is asked for the SWEPT bounds. Querying the start box alone would
    // return only what the shape is already touching — nothing — and report a miss.
    const world = createPhysics3DWorld();
    addBoxBody(world, 30, 0, 0, 'static');
    const out = createPhysics3DShapeCastResult();

    queryPhysics3DShapeCast(world, unitBox(), 100, 0, 0, out);

    expect(out.hit).toBe(true);
    expect(out.body?.x).toBe(30);
  });

  it('reports the NEAREST of several colliders along the sweep', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 30, 0, 0, 'static');
    const near = addBoxBody(world, 10, 0, 0, 'static');
    addBoxBody(world, 20, 0, 0, 'static');
    const out = createPhysics3DShapeCastResult();

    queryPhysics3DShapeCast(world, unitBox(), 100, 0, 0, out);

    // Added out of order on purpose: the answer must come from the fraction, not from insertion order.
    expect(out.body).toBe(near);
  });

  it('respects maxFraction, stopping short of a collider beyond it', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 10, 0, 0, 'static');
    const out = createPhysics3DShapeCastResult();

    // Contact would be at 0.45 of the full displacement; bounding the sweep at 0.2 must not reach it.
    queryPhysics3DShapeCast(world, unitBox(), 20, 0, 0, out, 0.2);
    expect(out.hit).toBe(false);

    queryPhysics3DShapeCast(world, unitBox(), 20, 0, 0, out, 0.5);
    expect(out.hit).toBe(true);
  });

  it('honours the query filter', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 10, 0, 0, 'static');
    const out = createPhysics3DShapeCastResult();
    const filter = createPhysics3DQueryFilter();
    filter.includeStatic = false;

    queryPhysics3DShapeCast(world, unitBox(), 20, 0, 0, out, 1, filter);
    expect(out.hit).toBe(false);
  });

  it('returns a miss for a non-finite displacement rather than throwing', () => {
    const world = createPhysics3DWorld();
    addBoxBody(world, 10, 0, 0, 'static');
    const out = createPhysics3DShapeCastResult();

    queryPhysics3DShapeCast(world, unitBox(), NaN, 0, 0, out);
    expect(out.hit).toBe(false);
    queryPhysics3DShapeCast(world, unitBox(), 20, 0, 0, out, Number.POSITIVE_INFINITY);
    expect(out.hit).toBe(false);
  });

  it('finds a gap a raycast would pass straight through', () => {
    // The case that justifies the query existing. Two walls leave a 0.8-tall gap that the centre LINE
    // clears; the swept box is 1.0 tall and does not fit. The gap has to be narrower than the caster or
    // the correct answer is a miss — which is what a first version of this test actually asserted
    // against, with a 1.4 gap and a 1.0 box.
    const world = createPhysics3DWorld();
    const low = createRigidBody3D('static');
    low.x = 10;
    low.y = -0.9;
    addPhysics3DBody(world, low);
    addPhysics3DCollider(world, low, createPhysics3DCollider(unitBox()));
    const high = createRigidBody3D('static');
    high.x = 10;
    high.y = 0.9;
    addPhysics3DBody(world, high);
    addPhysics3DCollider(world, high, createPhysics3DCollider(unitBox()));

    const rayOut = createPhysics3DRayResult();
    queryPhysics3DRay(world, 0, 0, 0, 20, 0, 0, rayOut);
    expect(rayOut.hitCount).toBe(0);

    const out = createPhysics3DShapeCastResult();
    queryPhysics3DShapeCast(world, unitBox(), 20, 0, 0, out);
    expect(out.hit).toBe(true);
  });
});
