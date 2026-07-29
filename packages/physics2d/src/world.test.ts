import { describe, expect, it } from 'vitest';

import { stepPhysics2D } from './step';
import {
  addPhysics2DBody,
  findPhysics2DBody,
  createPhysics2DCollider,
  createPhysics2DSolverConfig,
  createPhysics2DWorld,
  createRigidBody2D,
  isPhysics2DPairOrdered,
  removePhysics2DBody,
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

describe('createPhysics2DCollider', () => {
  it('allocates a world shape up front so the step transforms in place', () => {
    const collider = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE);
    expect(collider.world).toBeDefined();
    expect(collider.sensor).toBe(false);
  });

  it('marks a sensor collider so the solver reports its overlaps without resolving them', () => {
    expect(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE, true).sensor).toBe(true);
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
});
