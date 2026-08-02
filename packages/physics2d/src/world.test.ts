import { describe, expect, it } from 'vitest';

import { stepPhysics2D } from './step';
import {
  addPhysics2DBody,
  addPhysics2DCollider,
  findPhysics2DBody,
  createPhysics2DCollider,
  createPhysics2DSolverConfig,
  createPhysics2DWorld,
  createRigidBody2D,
  isPhysics2DPairOrdered,
  removePhysics2DBody,
  removePhysics2DCollider,
} from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function boxBody(x: number, y: number) {
  const body = createRigidBody2D('dynamic', x, y);
  body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
  return body;
}

describe('addPhysics2DBody', () => {
  it('assigns indices from a monotonic counter, so a removed body never hands its identity on', () => {
    // Reusing an array slot as identity would let a stale contact be revived against whichever body
    // inherited it, warm-starting a pair with a force that belonged to something else.
    const world = createPhysics2DWorld();
    const first = addPhysics2DBody(world, boxBody(0, 0));
    const second = addPhysics2DBody(world, boxBody(1, 0));
    removePhysics2DBody(world, first);
    const third = addPhysics2DBody(world, boxBody(2, 0));

    expect(second.index).toBe(1);
    expect(third.index).toBe(2);
    expect(third.index).not.toBe(first.index);
  });

  it('derives mass properties on insertion so a body is never simulated massless', () => {
    const world = createPhysics2DWorld();
    const body = addPhysics2DBody(world, boxBody(0, 0));
    expect(body.mass).toBeCloseTo(1);
    expect(body.inverseMass).toBeCloseTo(1);
    expect(body.inertia).toBeGreaterThan(0);
  });
});

describe('addPhysics2DCollider', () => {
  it('recomputes mass, wakes the body, and publishes bounds immediately', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, createRigidBody2D('dynamic', 3, 4));
    body.sleeping = true;
    body.sleepTimer = 5;
    const collider = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE);

    expect(addPhysics2DCollider(world, body, collider)).toBe(collider);

    const found: number[] = [];
    world.index.querySpatialPoint(3, 4, found);
    expect(body.mass).toBeCloseTo(Math.PI);
    expect(body.sleeping).toBe(false);
    expect(found).toEqual([body.index]);
  });

  it('invalidates old contact impulses and events while waking both solid ends', () => {
    const world = createPhysics2DWorld(0, 0);
    const first = addPhysics2DBody(world, boxBody(0, 0));
    const second = addPhysics2DBody(world, boxBody(0.75, 0));
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(1);
    expect(world.events.began).toHaveLength(1);
    first.sleeping = true;
    second.sleeping = true;

    addPhysics2DCollider(world, first, createPhysics2DCollider({ kind: 'circle', x: 2, y: 0, radius: 0.25 }, STONE));

    expect(world.contacts).toHaveLength(0);
    expect(world.events.began).toHaveLength(0);
    expect(first.sleeping).toBe(false);
    expect(second.sleeping).toBe(false);
  });

  it('can author a body before insertion without assigning world identity', () => {
    const world = createPhysics2DWorld();
    const body = createRigidBody2D('dynamic', 0, 0);
    addPhysics2DCollider(world, body, createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE));
    expect(body.index).toBe(-1);
    expect(body.mass).toBeCloseTo(Math.PI);
    expect(world.bodies).toHaveLength(0);
  });
});

describe('createPhysics2DCollider', () => {
  it('allocates a world shape up front so the step transforms in place', () => {
    const collider = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE);
    expect(collider.world).toBeDefined();
    expect(collider.sensor).toBe(false);
  });

  it('marks a sensor collider so the solver reports its overlaps without resolving them', () => {
    expect(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE, true).sensor).toBe(true);
  });

  it('owns a permissive default collision filter and clones a supplied one', () => {
    const defaulted = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE);
    expect(defaulted.filter).toEqual({ categoryBits: 1, maskBits: 0xffffffff, groupIndex: 0 });

    const supplied = { categoryBits: 2, maskBits: 4, groupIndex: -3 };
    const filtered = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE, false, supplied);
    expect(filtered.filter).toEqual(supplied);
    expect(filtered.filter).not.toBe(supplied);
  });
});

describe('createPhysics2DSolverConfig', () => {
  it('defaults to a tuning that converges for game-scale stacks', () => {
    const config = createPhysics2DSolverConfig();
    expect(config.velocityIterations).toBeGreaterThanOrEqual(8);
    expect(config.warmStarting).toBe(true);
    expect(config.penetrationSlop).toBeGreaterThan(0);
    expect(config.positionCorrection).toBeGreaterThan(0);
    expect(config.positionCorrection).toBeLessThan(1);
  });
});

describe('createPhysics2DWorld', () => {
  it('starts empty with a default broadphase index', () => {
    const world = createPhysics2DWorld();
    expect(world.bodies).toHaveLength(0);
    expect(world.contacts).toHaveLength(0);
    expect(world.contactHooks).toEqual({ preSolve: null, postSolve: null });
    expect(world.index).toBeDefined();
    expect(world.gravityY).toBeLessThan(0);
  });
});

describe('createRigidBody2D', () => {
  it('creates a body at rest with no mass until a world derives it from the colliders', () => {
    const body = createRigidBody2D('dynamic', 3, 4, 0.5);
    expect(body.x).toBe(3);
    expect(body.angle).toBe(0.5);
    expect(body.mass).toBe(0);
    expect(body.index).toBe(-1);
  });
});

describe('findPhysics2DBody', () => {
  it('resolves a contact stored index back to its body', () => {
    const world = createPhysics2DWorld();
    const first = addPhysics2DBody(world, boxBody(0, 0));
    const second = addPhysics2DBody(world, boxBody(1, 0));
    expect(findPhysics2DBody(world, first.index)).toBe(first);
    expect(findPhysics2DBody(world, second.index)).toBe(second);
  });

  it('reports null once the body is gone rather than resurrecting a slot', () => {
    // Contacts hold indices, not references, so a lookup after removal has to fail cleanly — returning
    // whatever now occupies the position would warm-start a pair with a stranger's impulse.
    const world = createPhysics2DWorld();
    const first = addPhysics2DBody(world, boxBody(0, 0));
    addPhysics2DBody(world, boxBody(1, 0));
    removePhysics2DBody(world, first);
    expect(findPhysics2DBody(world, first.index)).toBeNull();
  });
});

describe('isPhysics2DPairOrdered', () => {
  it('orders by persistent index, which is the only key that survives motion', () => {
    const world = createPhysics2DWorld();
    const first = addPhysics2DBody(world, boxBody(0, 0));
    const second = addPhysics2DBody(world, boxBody(1, 0));
    expect(isPhysics2DPairOrdered(first, second)).toBe(true);
    expect(isPhysics2DPairOrdered(second, first)).toBe(false);

    // Moving a body past the other must not change the order — geometry-derived orderings flip here.
    first.x = 100;
    expect(isPhysics2DPairOrdered(first, second)).toBe(true);
  });
});

describe('removePhysics2DBody', () => {
  it('drops every contact naming the removed body', () => {
    const world = createPhysics2DWorld();
    const floor = createRigidBody2D('static', 0, 0);
    floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 }, STONE));
    addPhysics2DBody(world, floor);
    const crate = addPhysics2DBody(world, boxBody(0, 0.4));
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts.length).toBeGreaterThan(0);

    expect(removePhysics2DBody(world, crate)).toBe(true);
    expect(world.contacts).toHaveLength(0);
    expect(world.bodies).toHaveLength(1);
  });

  it('reports false for a body the world does not hold', () => {
    expect(removePhysics2DBody(createPhysics2DWorld(), boxBody(0, 0))).toBe(false);
  });

  it('wakes a sleeping body when its supporting contact is removed with the other body', () => {
    const world = createPhysics2DWorld();
    const floor = createRigidBody2D('static', 0, 0);
    floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 }, STONE));
    addPhysics2DBody(world, floor);
    const crate = addPhysics2DBody(world, boxBody(0, 0.5));
    for (let i = 0; i < 180; i++) stepPhysics2D(world, 1 / 60);
    expect(crate.sleeping).toBe(true);
    const restingY = crate.y;

    removePhysics2DBody(world, floor);

    expect(crate.sleeping).toBe(false);
    expect(crate.sleepTimer).toBe(0);
    stepPhysics2D(world, 1 / 60);
    expect(crate.y).toBeLessThan(restingY);
  });

  it('does not wake a sleeper when only a sensor overlap is removed', () => {
    const world = createPhysics2DWorld(0, 0);
    const trigger = createRigidBody2D('static', 0, 0);
    trigger.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -1, minY: -1, maxX: 1, maxY: 1 }, STONE, true),
    );
    addPhysics2DBody(world, trigger);
    const crate = addPhysics2DBody(world, boxBody(0, 0));
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts[0].sensor).toBe(true);
    crate.sleeping = true;
    crate.sleepTimer = 5;

    removePhysics2DBody(world, trigger);

    expect(crate.sleeping).toBe(true);
    expect(crate.sleepTimer).toBe(5);
  });
});

describe('removePhysics2DCollider', () => {
  it('recomputes mass, shifts collider identity safely, and republishes bounds', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0);
    const left = createPhysics2DCollider({ kind: 'circle', x: -4, y: 0, radius: 1 }, STONE);
    const right = createPhysics2DCollider({ kind: 'circle', x: 4, y: 0, radius: 2 }, STONE);
    body.colliders.push(left, right);
    addPhysics2DBody(world, body);
    const originalMass = body.mass;

    expect(removePhysics2DCollider(world, body, left)).toBe(true);

    const removedLocation: number[] = [];
    const retainedLocation: number[] = [];
    world.index.querySpatialPoint(-4, 0, removedLocation);
    world.index.querySpatialPoint(4, 0, retainedLocation);
    expect(body.colliders).toEqual([right]);
    expect(body.mass).toBeLessThan(originalMass);
    expect(removedLocation).toEqual([]);
    expect(retainedLocation).toEqual([body.index]);
  });

  it('reports false without changing mass when the collider is absent', () => {
    const world = createPhysics2DWorld();
    const body = addPhysics2DBody(world, boxBody(0, 0));
    const mass = body.mass;
    const absent = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE);
    expect(removePhysics2DCollider(world, body, absent)).toBe(false);
    expect(body.mass).toBe(mass);
  });
});
