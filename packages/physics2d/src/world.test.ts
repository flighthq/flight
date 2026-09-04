import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, Physics2DJoint } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry';
import { stepPhysics2D } from './step';
import {
  addPhysics2DBody,
  addPhysics2DCollider,
  applyPhysics2DForce,
  applyPhysics2DForceAtPoint,
  applyPhysics2DLinearImpulse,
  applyPhysics2DLinearImpulseAtPoint,
  applyPhysics2DTorque,
  findPhysics2DBody,
  createPhysics2DCollider,
  createPhysics2DSolverConfig,
  createPhysics2DWorld,
  createRigidBody2D,
  hydratePhysics2DWorld,
  invalidatePhysics2DCollider,
  isPhysics2DPairOrdered,
  removePhysics2DBody,
  removePhysics2DCollider,
  setPhysics2DBodyFixedRotation,
  setPhysics2DBodyBullet,
  setPhysics2DBodySleepEnabled,
  setPhysics2DBodyTransform,
  setPhysics2DBodyType,
  Physics2DWorldVersion,
} from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function entityJoint(fields: Omit<Physics2DJoint, keyof Entity>): Physics2DJoint {
  return (() => {
    const out = allocateEntity<unknown>();
    Object.assign(out, fields);
    return finishEntity(out);
  })();
}

function boxBody(x: number, y: number) {
  const body = createRigidBody2D('dynamic', x, y);
  body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
  return body;
}

describe('addPhysics2DBody', () => {
  it('rejects duplicate and cross-world insertion without corrupting either world', () => {
    const firstWorld = createPhysics2DWorld();
    const secondWorld = createPhysics2DWorld();
    const body = addPhysics2DBody(firstWorld, boxBody(0, 0));
    const index = body.index;

    expect(() => addPhysics2DBody(firstWorld, body)).toThrow();
    expect(() => addPhysics2DBody(secondWorld, body)).toThrow();
    expect(firstWorld.bodies).toEqual([body]);
    expect(firstWorld.bodyByIndex.get(index)).toBe(body);
    expect(secondWorld.bodies).toHaveLength(0);
  });

  it('rejects a collider instance shared by two pre-authored bodies', () => {
    const world = createPhysics2DWorld();
    const collider = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE);
    const first = createRigidBody2D('dynamic', 0, 0);
    const second = createRigidBody2D('dynamic', 2, 0);
    first.colliders.push(collider);
    second.colliders.push(collider);

    addPhysics2DBody(world, first);
    expect(() => addPhysics2DBody(world, second)).toThrow();
    expect(second.index).toBe(-1);
    expect(world.bodies).toEqual([first]);
  });

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
    expect(world.bodyByIndex.get(second.index)).toBe(second);
    expect(world.bodyByIndex.get(third.index)).toBe(third);
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
  it('rejects duplicate, shared, and foreign-world collider mutation', () => {
    const firstWorld = createPhysics2DWorld();
    const secondWorld = createPhysics2DWorld();
    const first = addPhysics2DBody(firstWorld, createRigidBody2D('dynamic', 0, 0));
    const second = addPhysics2DBody(firstWorld, createRigidBody2D('dynamic', 2, 0));
    const collider = addPhysics2DCollider(
      firstWorld,
      first,
      createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE),
    );

    expect(() => addPhysics2DCollider(firstWorld, first, collider)).toThrow();
    expect(() => addPhysics2DCollider(firstWorld, second, collider)).toThrow();
    expect(() =>
      addPhysics2DCollider(
        secondWorld,
        first,
        createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 2 }, STONE),
      ),
    ).toThrow();
    expect(first.colliders).toEqual([collider]);
    expect(second.colliders).toHaveLength(0);
  });

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

describe('applyPhysics2DForce', () => {
  it('accumulates force and wakes a dynamic body', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(10, 20));
    body.sleeping = true;
    body.sleepTimer = 5;

    expect(applyPhysics2DForce(body, 3, 4)).toBe(true);
    expect(body.forceX).toBe(3);
    expect(body.forceY).toBe(4);
    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
  });

  it('reports a rejected non-dynamic force without mutating the body', () => {
    const body = createRigidBody2D('static', 0, 0);
    expect(applyPhysics2DForce(body, 1, 2)).toBe(false);
    expect(body.forceX).toBe(0);
  });
});

describe('applyPhysics2DForceAtPoint', () => {
  it('accumulates force and its moment from a world-space point', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(10, 20));
    expect(applyPhysics2DForceAtPoint(body, 2, 0, 10, 21)).toBe(true);
    expect(body.forceX).toBe(2);
    expect(body.torque).toBeCloseTo(-2);
  });
});

describe('applyPhysics2DLinearImpulse', () => {
  it('changes linear velocity immediately from derived inverse mass', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(0, 0));
    expect(applyPhysics2DLinearImpulse(body, 1, 2)).toBe(true);
    expect(body.velocityX).toBeCloseTo(1);
    expect(body.velocityY).toBeCloseTo(2);
  });
});

describe('applyPhysics2DLinearImpulseAtPoint', () => {
  it('changes linear and angular velocity from a world-space point', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(10, 20));
    expect(applyPhysics2DLinearImpulseAtPoint(body, 1, 0, 10, 21)).toBe(true);
    expect(body.velocityX).toBeCloseTo(1);
    expect(body.angularVelocity).toBeCloseTo(-6);
  });
});

describe('applyPhysics2DTorque', () => {
  it('accumulates torque and wakes a dynamic body', () => {
    const body = createRigidBody2D('dynamic', 0, 0);
    body.sleeping = true;
    body.sleepTimer = 5;
    expect(applyPhysics2DTorque(body, 3)).toBe(true);
    expect(body.torque).toBe(3);
    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
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

  it('owns shape storage and material values independently of authoring templates and sibling colliders', () => {
    const points = [0, 0, 2, 0, 0, 2];
    const local = { kind: 'polygon' as const, points };
    const material = { density: 1, friction: 0.25, restitution: 0.5 };
    const first = createPhysics2DCollider(local, material);
    const second = createPhysics2DCollider(local, material);

    expect(first.local).not.toBe(local);
    expect(second.local).not.toBe(local);
    expect(first.material).not.toBe(material);
    expect(second.material).not.toBe(material);
    expect(first.local.kind).toBe('polygon');
    expect(second.local.kind).toBe('polygon');
    if (first.local.kind !== 'polygon' || second.local.kind !== 'polygon') throw new Error('expected polygons');
    expect(first.local.points).not.toBe(points);
    expect(second.local.points).not.toBe(points);

    points[0] = 100;
    material.density = 9;
    (first.local.points as number[])[1] = 50;
    first.material.friction = 0.75;

    expect(first.local.points[0]).toBe(0);
    expect(second.local.points).toEqual([0, 0, 2, 0, 0, 2]);
    expect(first.material.density).toBe(1);
    expect(second.material).toEqual({ density: 1, friction: 0.25, restitution: 0.5 });
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
    expect(world.bodyByIndex.size).toBe(0);
    expect(world.contacts).toHaveLength(0);
    expect(world.contactHooks).toEqual({ preSolve: null, postSolve: null });
    expect(world.index).toBeDefined();
    expect(world.gravityY).toBeLessThan(0);
    expect(world.previousTimestep).toBe(0);
  });
});

describe('createRigidBody2D', () => {
  it('creates a body at rest with no mass until a world derives it from the colliders', () => {
    const body = createRigidBody2D('dynamic', 3, 4, 0.5);
    expect(body.x).toBe(3);
    expect(body.angle).toBe(0.5);
    expect(body.mass).toBe(0);
    expect(body.index).toBe(-1);
    expect(body.fixedRotation).toBe(false);
    expect(body.bullet).toBe(false);
    expect(body.sleepEnabled).toBe(true);
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
    expect(world.bodyByIndex.has(first.index)).toBe(false);
  });
});

describe('hydratePhysics2DWorld', () => {
  it('upgrades pre-CCD body and solver records with canonical defaults', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(0, 0));
    const legacyWorld = world as unknown as {
      version?: number;
      config: { continuousCollision?: boolean; maxCcdRotationSubsteps?: number; maxCcdSubsteps?: number };
    };
    const legacyBody = body as unknown as {
      bullet?: boolean;
      fixedRotation?: boolean;
      sleepEnabled?: boolean;
    };
    delete legacyWorld.version;
    delete legacyWorld.config.continuousCollision;
    delete legacyWorld.config.maxCcdRotationSubsteps;
    delete legacyWorld.config.maxCcdSubsteps;
    delete legacyBody.bullet;
    delete legacyBody.fixedRotation;
    delete legacyBody.sleepEnabled;

    expect(hydratePhysics2DWorld(world)).toBe(true);

    expect(world.version).toBe(Physics2DWorldVersion);
    expect(world.config.continuousCollision).toBe(true);
    expect(world.config.maxCcdSubsteps).toBe(8);
    expect(world.config.maxCcdRotationSubsteps).toBe(64);
    expect(body.bullet).toBe(false);
    expect(body.fixedRotation).toBe(false);
    expect(body.sleepEnabled).toBe(true);
    expect(() => stepPhysics2D(world, 1 / 60)).not.toThrow();
  });

  it('preserves current values and rejects unknown future versions', () => {
    const current = createPhysics2DWorld();
    current.config.continuousCollision = false;
    current.config.maxCcdSubsteps = 2;
    expect(hydratePhysics2DWorld(current)).toBe(true);
    expect(current.config.continuousCollision).toBe(false);
    expect(current.config.maxCcdSubsteps).toBe(2);

    const future = createPhysics2DWorld();
    future.version = Physics2DWorldVersion + 1;
    expect(hydratePhysics2DWorld(future)).toBe(false);
    expect(future.version).toBe(Physics2DWorldVersion + 1);
  });
});

describe('invalidatePhysics2DCollider', () => {
  it('rebuilds changed shape storage, mass data, and broadphase bounds', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(0, 0));
    const collider = body.colliders[0];
    const oldWorldShape = collider.world;
    collider.local = { kind: 'circle', x: 4, y: 0, radius: 2 };
    collider.material = { ...collider.material, density: 2 };
    body.sleeping = true;
    body.sleepTimer = 5;

    expect(invalidatePhysics2DCollider(world, body, collider)).toBe(true);

    const oldLocation: number[] = [];
    const newLocation: number[] = [];
    world.index.querySpatialPoint(0, 0, oldLocation);
    world.index.querySpatialPoint(4, 0, newLocation);
    expect(collider.world).not.toBe(oldWorldShape);
    expect(collider.world.kind).toBe('circle');
    expect(body.mass).toBeCloseTo(8 * Math.PI);
    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
    expect(oldLocation).toEqual([]);
    expect(newLocation).toEqual([body.index]);
  });

  it('invalidates contacts after filter and sensor changes', () => {
    const world = createPhysics2DWorld(0, 0);
    const first = addPhysics2DBody(world, boxBody(0, 0));
    const second = addPhysics2DBody(world, boxBody(0.75, 0));
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(1);

    first.colliders[0].sensor = true;
    expect(invalidatePhysics2DCollider(world, first, first.colliders[0])).toBe(true);
    expect(world.contacts).toHaveLength(0);
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts[0].sensor).toBe(true);

    first.colliders[0].filter.maskBits = 0;
    expect(invalidatePhysics2DCollider(world, first, first.colliders[0])).toBe(true);
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(0);
    expect(second.sleeping).toBe(false);
  });

  it('reports false when the body does not own the collider', () => {
    const world = createPhysics2DWorld();
    const body = addPhysics2DBody(world, boxBody(0, 0));
    const absent = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE);
    expect(invalidatePhysics2DCollider(world, body, absent)).toBe(false);
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
  it('releases ownership and assigns a fresh persistent identity when reinserted', () => {
    const world = createPhysics2DWorld();
    const body = addPhysics2DBody(world, boxBody(0, 0));
    const firstIndex = body.index;

    removePhysics2DBody(world, body);
    addPhysics2DBody(world, body);

    expect(firstIndex).toBe(0);
    expect(body.index).toBe(1);
    expect(world.bodyByIndex.has(firstIndex)).toBe(false);
    expect(world.bodyByIndex.get(body.index)).toBe(body);
  });

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

  it('retains a one-body joint when only its unused bodyA placeholder is removed', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'OneBody', { prepare: () => {}, solve: () => {}, usesBodyA: false });
    const placeholder = addPhysics2DBody(world, boxBody(0, 0));
    const constrained = addPhysics2DBody(world, boxBody(2, 0));
    const joint = addPhysics2DJoint(
      world,
      entityJoint({
        kind: 'OneBody',
        bodyA: placeholder.index,
        bodyB: constrained.index,
        localAnchorAX: 0,
        localAnchorAY: 0,
        localAnchorBX: 0,
        localAnchorBY: 0,
        collideConnected: false,
        breakForce: Number.POSITIVE_INFINITY,
        breakTorque: Number.POSITIVE_INFINITY,
        impulse0: 0,
        impulse1: 0,
        impulse2: 0,
        rAX: 0,
        rAY: 0,
        rBX: 0,
        rBY: 0,
      }),
    );

    removePhysics2DBody(world, placeholder);

    expect(world.joints).toEqual([joint]);
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

describe('setPhysics2DBodyBullet', () => {
  it('changes CCD policy and wakes the owned body', () => {
    const world = createPhysics2DWorld();
    const body = addPhysics2DBody(world, boxBody(0, 0));
    body.sleeping = true;
    body.sleepTimer = 5;

    expect(setPhysics2DBodyBullet(world, body, true)).toBe(true);

    expect(body.bullet).toBe(true);
    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);
  });

  it('reports false for a body outside the world', () => {
    expect(setPhysics2DBodyBullet(createPhysics2DWorld(), boxBody(0, 0), true)).toBe(false);
  });
});

describe('setPhysics2DBodyFixedRotation', () => {
  it('preserves linear mass while clearing spin, torque, angular response, and cached contacts', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(0, 0));
    const other = addPhysics2DBody(world, boxBody(0.75, 0));
    stepPhysics2D(world, 1 / 60);
    body.angularVelocity = 4;
    body.torque = 7;
    const mass = body.mass;
    other.sleeping = true;

    expect(setPhysics2DBodyFixedRotation(world, body, true)).toBe(true);

    expect(body.mass).toBe(mass);
    expect(body.inverseMass).toBeGreaterThan(0);
    expect(body.inverseInertia).toBe(0);
    expect(body.angularVelocity).toBe(0);
    expect(body.torque).toBe(0);
    expect(world.contacts).toHaveLength(0);
    expect(other.sleeping).toBe(false);
    expect(applyPhysics2DTorque(body, 10)).toBe(false);
    expect(applyPhysics2DForceAtPoint(body, 1, 0, body.x, body.y + 1)).toBe(true);
    expect(body.torque).toBe(0);
    expect(applyPhysics2DLinearImpulseAtPoint(body, 1, 0, body.x, body.y + 1)).toBe(true);
    expect(body.angularVelocity).toBe(0);
    body.angularVelocity = 100;
    const angle = body.angle;
    stepPhysics2D(world, 1 / 60);
    expect(body.angle).toBe(angle);
    expect(body.angularVelocity).toBe(0);

    expect(setPhysics2DBodyFixedRotation(world, body, false)).toBe(true);
    expect(body.inverseInertia).toBeGreaterThan(0);
  });

  it('reports false for a body outside the world', () => {
    expect(setPhysics2DBodyFixedRotation(createPhysics2DWorld(), boxBody(0, 0), true)).toBe(false);
  });
});

describe('setPhysics2DBodySleepEnabled', () => {
  it('wakes on either transition and requires a new stillness interval when re-enabled', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(0, 0));
    body.sleeping = true;
    body.sleepTimer = 5;

    expect(setPhysics2DBodySleepEnabled(world, body, false)).toBe(true);
    expect(body.sleepEnabled).toBe(false);
    expect(body.sleeping).toBe(false);
    expect(body.sleepTimer).toBe(0);

    body.sleepTimer = 5;
    expect(setPhysics2DBodySleepEnabled(world, body, true)).toBe(true);
    expect(body.sleepEnabled).toBe(true);
    expect(body.sleepTimer).toBe(0);
  });

  it('reports false for a body outside the world', () => {
    expect(setPhysics2DBodySleepEnabled(createPhysics2DWorld(), boxBody(0, 0), false)).toBe(false);
  });
});

describe('setPhysics2DBodyTransform', () => {
  it('invalidates pose caches, wakes connected bodies, and republishes bounds', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, 'Cached', { prepare: () => {}, solve: () => {} });
    const first = addPhysics2DBody(world, boxBody(0, 0));
    const second = addPhysics2DBody(world, boxBody(0.75, 0));
    const joint = addPhysics2DJoint(
      world,
      entityJoint({
        kind: 'Cached',
        bodyA: first.index,
        bodyB: second.index,
        localAnchorAX: 0,
        localAnchorAY: 0,
        localAnchorBX: 0,
        localAnchorBY: 0,
        collideConnected: true,
        breakForce: Number.POSITIVE_INFINITY,
        breakTorque: Number.POSITIVE_INFINITY,
        impulse0: 3,
        impulse1: 4,
        impulse2: 5,
        rAX: 0,
        rAY: 0,
        rBX: 0,
        rBY: 0,
      }),
    );
    stepPhysics2D(world, 1 / 60);
    joint.impulse0 = 3;
    joint.impulse1 = 4;
    joint.impulse2 = 5;
    first.sleeping = true;
    second.sleeping = true;

    expect(setPhysics2DBodyTransform(world, first, 4, 2, 0.25)).toBe(true);

    const movedLocation: number[] = [];
    world.index.querySpatialPoint(4, 2, movedLocation);
    expect(world.contacts).toHaveLength(0);
    expect(world.events.began).toHaveLength(0);
    expect([joint.impulse0, joint.impulse1, joint.impulse2]).toEqual([0, 0, 0]);
    expect(first.sleeping).toBe(false);
    expect(second.sleeping).toBe(false);
    expect(movedLocation).toEqual([first.index]);
  });

  it('reports invalid transforms without changing the body', () => {
    const world = createPhysics2DWorld();
    const body = addPhysics2DBody(world, boxBody(1, 2));
    expect(setPhysics2DBodyTransform(world, body, Number.NaN, 3, 0)).toBe(false);
    expect(setPhysics2DBodyTransform(createPhysics2DWorld(), body, 4, 5, 0)).toBe(false);
    expect([body.x, body.y, body.angle]).toEqual([1, 2, 0]);
  });
});

describe('setPhysics2DBodyType', () => {
  it('rebuilds mass and clears incompatible state across type transitions', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = addPhysics2DBody(world, boxBody(0, 0));
    const other = addPhysics2DBody(world, boxBody(0.75, 0));
    stepPhysics2D(world, 1 / 60);
    body.velocityX = 2;
    body.velocityY = 3;
    body.angularVelocity = 4;
    body.forceX = 5;
    body.forceY = 6;
    body.torque = 7;
    other.sleeping = true;

    expect(setPhysics2DBodyType(world, body, 'static')).toBe(true);
    expect(body.mass).toBe(0);
    expect(body.inverseMass).toBe(0);
    expect([body.velocityX, body.velocityY, body.angularVelocity]).toEqual([0, 0, 0]);
    expect([body.forceX, body.forceY, body.torque]).toEqual([0, 0, 0]);
    expect(world.contacts).toHaveLength(0);
    expect(other.sleeping).toBe(false);

    expect(setPhysics2DBodyType(world, body, 'dynamic')).toBe(true);
    expect(body.mass).toBeCloseTo(1);
    expect(body.inverseMass).toBeCloseTo(1);
  });

  it('reports false for a body outside the world', () => {
    expect(setPhysics2DBodyType(createPhysics2DWorld(), boxBody(0, 0), 'static')).toBe(false);
  });
});
