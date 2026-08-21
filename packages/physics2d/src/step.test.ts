import { createUniformGridSpatialBackend2D } from '@flighthq/spatial/contract';
import type {
  Physics2DJoint,
  Physics2DWorld,
  RigidBody2D,
  SpatialIndexBackend2D,
  SpatialPair,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry';
import { physics2DDistanceJointSolver, physics2DWeldJointSolver } from './joints';
import {
  setPhysics2DContactIntakeGuard,
  setPhysics2DJointResolutionGuard,
  setPhysics2DStepGuard,
  stepPhysics2D,
} from './step';
import {
  addPhysics2DBody,
  applyPhysics2DForce,
  createPhysics2DCollider,
  createPhysics2DWorld,
  createRigidBody2D,
} from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function ground(world: Physics2DWorld): RigidBody2D {
  const body = createRigidBody2D('static', 0, 0);
  body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -50, minY: -1, maxX: 50, maxY: 0 }, STONE));
  return addPhysics2DBody(world, body);
}

function box(world: Physics2DWorld, x: number, y: number, half = 0.5): RigidBody2D {
  const body = createRigidBody2D('dynamic', x, y);
  body.colliders.push(
    createPhysics2DCollider({ kind: 'aabb', minX: -half, minY: -half, maxX: half, maxY: half }, STONE),
  );
  return addPhysics2DBody(world, body);
}

// A hash of every body's full state, which is what a determinism claim has to be made against — comparing
// only positions would miss a divergence that has entered the velocities and not yet moved anything.
function traceWorld(world: Readonly<Physics2DWorld>): string {
  return world.bodies
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((b) => [b.index, b.x, b.y, b.angle, b.velocityX, b.velocityY, b.angularVelocity].join(':'))
    .join('|');
}

// A broadphase that returns its pairs in reverse order, and one that swaps each pair's two ids. Both
// wrap the real grid, so the candidate SET is identical and only its presentation differs — which is
// what makes them isolate ordering rather than change the simulation.
function createReversedPairBackend(): SpatialIndexBackend2D {
  const inner = createUniformGridSpatialBackend2D(1);
  return {
    ...inner,
    querySpatialPairs(out: SpatialPair[]): void {
      inner.querySpatialPairs(out);
      out.reverse();
    },
  };
}

function createSwappedPairBackend(): SpatialIndexBackend2D {
  const inner = createUniformGridSpatialBackend2D(1);
  return {
    ...inner,
    querySpatialPairs(out: SpatialPair[]): void {
      inner.querySpatialPairs(out);
      for (const pair of out) {
        const a = pair.a;
        pair.a = pair.b;
        pair.b = a;
      }
    },
  };
}

function runSteps(world: Physics2DWorld, count: number): void {
  for (let i = 0; i < count; i++) stepPhysics2D(world, 1 / 60);
}

describe('a body the step declines leaves the broadphase', () => {
  // The divergence filter said the declined body "stops colliding", but it only skipped the index
  // UPDATE — whatever AABB the body had last step stayed indexed, so it kept producing pairs and
  // holding live contacts from its last valid pose. Skipping an update is not withdrawing.
  function dynamicBox(world: Physics2DWorld, x: number): RigidBody2D {
    const body = createRigidBody2D('dynamic', x, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
    return addPhysics2DBody(world, body);
  }

  function widenPastLimit(body: RigidBody2D): void {
    const local = body.colliders[0].local as { maxX: number; maxY: number; minX: number; minY: number };
    local.minX = -1e8;
    local.minY = -1e8;
    local.maxX = 1e8;
    local.maxY = 1e8;
  }

  it('drops the contact of a body that diverges past the simulated extent', () => {
    const world = createPhysics2DWorld(0, 0);
    const diverging = dynamicBox(world, 0);
    dynamicBox(world, 0.5);
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(1);

    widenPastLimit(diverging);
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(0);
  });

  it('leaves the rest of the world simulating after one body diverges', () => {
    // The filter's whole promise: one diverged body stops colliding, everything else carries on.
    const world = createPhysics2DWorld(0, 0);
    const diverging = dynamicBox(world, 0);
    const near = dynamicBox(world, 0.5);
    const other = dynamicBox(world, 20);
    const alsoOther = dynamicBox(world, 20.5);
    stepPhysics2D(world, 1 / 60);
    widenPastLimit(diverging);
    stepPhysics2D(world, 1 / 60);

    // Only the untouched pair still has a contact; the diverged body's is gone.
    const names = world.contacts.map((c) => `${c.bodyA}-${c.bodyB}`);
    expect(names).toEqual([`${other.index}-${alsoOther.index}`]);
    // And "still simulating" means still moving: `near` overlapped the diverging body on the first
    // step and was pushed off it, so asserting it held position would have contradicted this title.
    expect(near.x).toBeGreaterThan(0.5);
    expect(Number.isFinite(near.x)).toBe(true);
  });

  it('withdraws a body whose colliders stop producing bounds from the index', () => {
    // Asserted on the index rather than on contacts. A body with no colliders produces no manifold
    // either way, so a contact-only assertion passes whether or not the withdrawal happens — it would
    // have been a test that agreed with the bug. The index is where the difference actually shows.
    const world = createPhysics2DWorld(0, 0);
    const emptied = dynamicBox(world, 0);
    dynamicBox(world, 0.5);
    stepPhysics2D(world, 1 / 60);

    const before: number[] = [];
    world.index.querySpatialRegion({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, before);
    expect(before).toContain(emptied.index);

    emptied.colliders.length = 0;
    stepPhysics2D(world, 1 / 60);

    const after: number[] = [];
    world.index.querySpatialRegion({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, after);
    expect(after).not.toContain(emptied.index);
    expect(world.contacts).toHaveLength(0);
  });

  it('withdraws a diverged body from the index, not merely from the update', () => {
    const world = createPhysics2DWorld(0, 0);
    const diverging = dynamicBox(world, 0);
    dynamicBox(world, 0.5);
    stepPhysics2D(world, 1 / 60);

    widenPastLimit(diverging);
    stepPhysics2D(world, 1 / 60);

    const after: number[] = [];
    world.index.querySpatialRegion({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, after);
    expect(after).not.toContain(diverging.index);
  });

  it('re-enters the broadphase when the body comes back inside the limit', () => {
    const world = createPhysics2DWorld(0, 0);
    const diverging = dynamicBox(world, 0);
    dynamicBox(world, 0.5);
    stepPhysics2D(world, 1 / 60);
    widenPastLimit(diverging);
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(0);

    const local = diverging.colliders[0].local as { maxX: number; maxY: number; minX: number; minY: number };
    local.minX = -0.5;
    local.minY = -0.5;
    local.maxX = 0.5;
    local.maxY = 0.5;
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(1);
  });
});

describe('bullet continuous collision detection', () => {
  function wall(world: Physics2DWorld, minX: number, maxX: number, restitution = 0, sensor = false): RigidBody2D {
    const body = createRigidBody2D('static', 0, 0);
    body.colliders.push(
      createPhysics2DCollider(
        { kind: 'aabb', minX, minY: -10, maxX, maxY: 10 },
        { density: 1, friction: 0, restitution },
        sensor,
      ),
    );
    return addPhysics2DBody(world, body);
  }

  function projectile(world: Physics2DWorld, speed: number, restitution = 0, bullet = true): RigidBody2D {
    const body = createRigidBody2D('dynamic', 0, 0);
    body.bullet = bullet;
    body.velocityX = speed;
    body.colliders.push(
      createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }, { density: 1, friction: 0, restitution }),
    );
    return addPhysics2DBody(world, body);
  }

  it('stops a bullet at a thin wall that the discrete path tunnels through', () => {
    const continuous = createPhysics2DWorld(0, 0);
    wall(continuous, 5, 5.1);
    const bullet = projectile(continuous, 100);
    stepPhysics2D(continuous, 0.1);
    expect(bullet.x).toBeCloseTo(4.5);
    expect(bullet.velocityX).toBeCloseTo(0);

    const discrete = createPhysics2DWorld(0, 0);
    wall(discrete, 5, 5.1);
    const ordinary = projectile(discrete, 100, 0, false);
    stepPhysics2D(discrete, 0.1);
    expect(ordinary.x).toBeCloseTo(10);
  });

  it('applies restitution at impact and advances through the remaining time', () => {
    const world = createPhysics2DWorld(0, 0);
    wall(world, 5, 5.1, 1);
    const bullet = projectile(world, 100, 1);

    stepPhysics2D(world, 0.1);

    expect(bullet.velocityX).toBeCloseTo(-100);
    expect(bullet.x).toBeCloseTo(-1);
  });

  it('resolves multiple impacts chronologically within the configured bound', () => {
    const world = createPhysics2DWorld(0, 0);
    wall(world, -5.1, -5, 1);
    wall(world, 5, 5.1, 1);
    const bullet = projectile(world, 100, 1);

    stepPhysics2D(world, 0.2);

    expect(bullet.x).toBeGreaterThanOrEqual(-4.5);
    expect(bullet.x).toBeLessThanOrEqual(4.5);
    expect(Math.abs(bullet.velocityX)).toBeCloseTo(100);
  });

  it('uses relative motion, transfers impulse, and wakes a sleeping dynamic target', () => {
    const world = createPhysics2DWorld(0, 0);
    const bullet = projectile(world, 100);
    const target = createRigidBody2D('dynamic', 6, 0);
    target.sleeping = true;
    target.sleepTimer = 5;
    target.colliders.push(
      createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }, { density: 1, friction: 0, restitution: 0 }),
    );
    addPhysics2DBody(world, target);

    stepPhysics2D(world, 0.1);

    expect(target.sleeping).toBe(false);
    expect(target.velocityX).toBeGreaterThan(0);
    expect(bullet.x).toBeLessThan(target.x);
    expect(target.x - bullet.x).toBeCloseTo(1);
  });

  it('honours the world switch and ignores sensor-only crossings', () => {
    const disabled = createPhysics2DWorld(0, 0);
    disabled.config.continuousCollision = false;
    wall(disabled, 5, 5.1);
    const unchecked = projectile(disabled, 100);
    stepPhysics2D(disabled, 0.1);
    expect(unchecked.x).toBeCloseTo(10);

    const sensorWorld = createPhysics2DWorld(0, 0);
    wall(sensorWorld, 5, 5.1, 0, true);
    const sensorBullet = projectile(sensorWorld, 100);
    stepPhysics2D(sensorWorld, 0.1);
    expect(sensorBullet.x).toBeCloseTo(10);
  });

  it('publishes swept impacts through contact lifecycle and solve hooks', () => {
    const world = createPhysics2DWorld(0, 0);
    wall(world, 5, 5.1);
    const bullet = projectile(world, 100);
    const order: string[] = [];
    world.contactHooks.preSolve = (_currentWorld, contact) => {
      order.push('pre');
      expect(contact.points[0].x).toBeCloseTo(5);
    };
    world.contactHooks.postSolve = (_currentWorld, contact) => {
      order.push('post');
      expect(contact.points[0].normalImpulse).toBeGreaterThan(0);
    };

    stepPhysics2D(world, 0.1);

    expect(order).toEqual(['pre', 'post']);
    expect(world.events.began).toEqual([world.contacts[0]]);
    expect(world.events.ended).toHaveLength(0);
    expect(bullet.x).toBeCloseTo(4.5);

    world.contactHooks.preSolve = null;
    world.contactHooks.postSolve = null;
    stepPhysics2D(world, 0.1);
    expect(world.events.ended).toHaveLength(0);
  });

  it('catches a thin bullet rotating through an obstacle between matching endpoint poses', () => {
    const continuous = createPhysics2DWorld(0, 0);
    const obstacle = createRigidBody2D('static', 0, 1.5);
    obstacle.colliders.push(
      createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.15 }, { ...STONE, friction: 0 }),
    );
    addPhysics2DBody(continuous, obstacle);
    const rod = createRigidBody2D('dynamic', 0, 0);
    rod.bullet = true;
    rod.angularVelocity = Math.PI / 0.1;
    rod.colliders.push(
      createPhysics2DCollider(
        { kind: 'aabb', minX: -2, minY: -0.025, maxX: 2, maxY: 0.025 },
        { ...STONE, friction: 0 },
      ),
    );
    addPhysics2DBody(continuous, rod);

    stepPhysics2D(continuous, 0.1);

    expect(continuous.events.began).toHaveLength(1);
    expect(continuous.contacts).toHaveLength(1);
    expect(Math.abs(rod.angularVelocity)).toBeLessThan(Math.PI / 0.1);

    const discrete = createPhysics2DWorld(0, 0);
    const discreteObstacle = createRigidBody2D('static', 0, 1.5);
    discreteObstacle.colliders.push(
      createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.15 }, { ...STONE, friction: 0 }),
    );
    addPhysics2DBody(discrete, discreteObstacle);
    const unchecked = createRigidBody2D('dynamic', 0, 0);
    unchecked.angularVelocity = Math.PI / 0.1;
    unchecked.colliders.push(
      createPhysics2DCollider(
        { kind: 'aabb', minX: -2, minY: -0.025, maxX: 2, maxY: 0.025 },
        { ...STONE, friction: 0 },
      ),
    );
    addPhysics2DBody(discrete, unchecked);

    stepPhysics2D(discrete, 0.1);

    expect(discrete.contacts).toHaveLength(0);
    expect(unchecked.angle).toBeCloseTo(Math.PI);
  });

  it('lets pre-solve disable a swept impact without consuming the CCD budget at zero time', () => {
    const world = createPhysics2DWorld(0, 0);
    wall(world, 5, 5.1);
    const bullet = projectile(world, 100);
    let calls = 0;
    world.contactHooks.preSolve = (_currentWorld, contact) => {
      calls++;
      contact.enabled = false;
    };

    stepPhysics2D(world, 0.1);

    expect(calls).toBe(1);
    expect(bullet.x).toBeCloseTo(10);
    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].enabled).toBe(false);
  });
});

// Every assertion here is against a law of motion rather than against the integrator's arithmetic, so
// none of them can be satisfied by a wrong implementation that happens to be self-consistent. They are
// also the ONLY tests in this package built on an off-centre body: the whole suite passed both before
// and after the defect they pin was fixed, because every other fixture puts its colliders symmetrically
// about the body origin, where origin and centre of mass coincide and the bug is invisible.
describe('centre of mass integration', () => {
  // A collider offset from the body origin, so `centerX`/`centerY` are non-zero and the origin sits on
  // a lever arm from the centre of mass.
  function offCentreBody(world: Physics2DWorld, offsetX: number, offsetY: number): RigidBody2D {
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', x: offsetX, y: offsetY, radius: 0.25 }, STONE));
    return addPhysics2DBody(world, body);
  }

  function centreOfMassX(body: Readonly<RigidBody2D>): number {
    return body.x + body.centerX * Math.cos(body.angle) - body.centerY * Math.sin(body.angle);
  }

  function centreOfMassY(body: Readonly<RigidBody2D>): number {
    return body.y + body.centerX * Math.sin(body.angle) + body.centerY * Math.cos(body.angle);
  }

  it('leaves the centre of mass exactly where it was when a free body only spins', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = offCentreBody(world, 1, 0);
    expect([body.centerX, body.centerY]).toEqual([1, 0]);
    body.angularVelocity = 1;

    for (let step = 0; step < 50; step++) stepPhysics2D(world, 0.1);

    // No gravity, no contacts, no linear velocity: nothing in the world can move this centre. A body
    // that translates here is manufacturing momentum out of its own rotation.
    expect(centreOfMassX(body)).toBeCloseTo(1, 12);
    expect(centreOfMassY(body)).toBeCloseTo(0, 12);
    // The origin, by contrast, must have swung right around the centre — it is one unit away from it.
    expect(body.angle).toBeCloseTo(5, 12);
    expect(body.x).toBeCloseTo(1 - Math.cos(5), 12);
    expect(body.y).toBeCloseTo(-Math.sin(5), 12);
  });

  it('drops an off-centre spinning body along the same path as a centred one', () => {
    // Two bodies, identical mass and gravity, differing only in where their collider sits and how fast
    // they spin. Gravity is a uniform field, so it accelerates a centre of mass without any reference to
    // the body's shape or rotation: the two centres must trace the SAME curve, step for step.
    const world = createPhysics2DWorld(0, -10);
    const spinning = offCentreBody(world, 0.75, -0.5);
    spinning.angularVelocity = 7;
    const centred = offCentreBody(world, 0, 0);

    const startX = centreOfMassX(spinning);
    const startY = centreOfMassY(spinning);
    for (let step = 0; step < 60; step++) stepPhysics2D(world, 1 / 60);

    expect(centreOfMassX(spinning) - startX).toBeCloseTo(centred.x, 12);
    expect(centreOfMassY(spinning) - startY).toBeCloseTo(centred.y, 12);
  });

  it('translates an off-centre body by exactly its velocity when it is not rotating', () => {
    // The general path must reduce to plain addition when there is no rotation to swing the origin
    // around — the case where the centre-preserving correction is required to do nothing at all.
    const world = createPhysics2DWorld(0, 0);
    const body = offCentreBody(world, 2, -3);
    body.velocityX = 5;
    body.velocityY = -2;

    stepPhysics2D(world, 0.25);

    expect(body.x).toBeCloseTo(1.25, 12);
    expect(body.y).toBeCloseTo(-0.5, 12);
    expect(body.angle).toBe(0);
  });

  it('translates a fixed-rotation off-centre body without swinging its origin', () => {
    // `fixedRotation` pins the angle, so the offset from origin to centre never turns and the two move
    // together. Getting this wrong in the other direction — applying a correction anyway — would drag
    // the origin off a body that is not allowed to rotate.
    const world = createPhysics2DWorld(0, 0);
    const body = offCentreBody(world, 1.5, 0.5);
    body.fixedRotation = true;
    body.angularVelocity = 3;
    body.velocityX = 4;

    stepPhysics2D(world, 0.5);

    expect(body.angle).toBe(0);
    expect(body.x).toBeCloseTo(2, 12);
    expect(body.y).toBeCloseTo(0, 12);
  });

  it('never moves the centre of mass sideways when every force on it points straight up', () => {
    // The positional correction pass is the OTHER place a body's transform advances, and it carries the
    // same angular term the integrator does. Here the only thing acting on the body is a flat floor with
    // no friction, no gravity, and no restitution, so every impulse and every correction points along
    // +y — which makes any lateral movement of the centre of mass illegal, at any magnitude.
    const slick = { density: 1, friction: 0, restitution: 0 };
    const world = createPhysics2DWorld(0, 0);
    const floor = createRigidBody2D('static', 0, 0);
    floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -50, minY: -1, maxX: 50, maxY: 0 }, slick));
    addPhysics2DBody(world, floor);

    // The contacting box sits at the body origin, so tilting the body lands it on one corner and gives
    // the correction a real torque; a second, distant collider drags the centre of mass away from that
    // contact, which is what turns the torque into a lateral swing if the origin is moved first.
    const body = createRigidBody2D('dynamic', 0, 0.5);
    body.angle = 0.3;
    body.colliders.push(
      createPhysics2DCollider({ kind: 'polygon', points: [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5] }, slick),
    );
    body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: 3, minY: 3, maxX: 4, maxY: 4 }, slick));
    addPhysics2DBody(world, body);

    const startX = centreOfMassX(body);
    for (let step = 0; step < 8; step++) {
      stepPhysics2D(world, 1 / 60);
      // Exactly equal, not merely close: a purely vertical impulse has no x component to round off.
      expect(centreOfMassX(body)).toBe(startX);
    }
    // The torque is real — the body must actually be rotating, or the test proves nothing.
    expect(body.angle).toBeLessThan(0.29);
  });

  it('conserves the centre of mass of an off-centre body resting on the ground', () => {
    // The positional correction pass pushes bodies apart along a contact normal, and its angular term is
    // a rotation about the centre of mass exactly as the integrator's is. A body settled on the floor
    // should stay settled; if the correction swings the centre instead of the origin, the body creeps
    // sideways along a flat floor with nothing pushing it.
    const world = createPhysics2DWorld(0, -10);
    ground(world);
    const body = createRigidBody2D('dynamic', 0, 1);
    body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: 1.5, minY: -0.5, maxX: 2.5, maxY: 0.5 }, STONE));
    addPhysics2DBody(world, body);
    expect(body.centerX).toBeCloseTo(2, 12);

    for (let step = 0; step < 400; step++) stepPhysics2D(world, 1 / 60);

    // Settled: resting on the floor, not still falling, and not sliding along it.
    expect(centreOfMassY(body)).toBeGreaterThan(0.4);
    expect(centreOfMassY(body)).toBeLessThan(0.6);
    expect(Math.abs(centreOfMassX(body) - 2)).toBeLessThan(0.05);
    expect(Math.abs(body.angle)).toBeLessThan(0.05);
  });
});

describe('collision filtering', () => {
  function filteredBox(
    world: Physics2DWorld,
    type: RigidBody2D['type'],
    categoryBits: number,
    maskBits: number,
    groupIndex = 0,
  ): RigidBody2D {
    const body = createRigidBody2D(type, 0, 0);
    body.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE, false, {
        categoryBits,
        maskBits,
        groupIndex,
      }),
    );
    return addPhysics2DBody(world, body);
  }

  it('requires each collider mask to include the other collider category', () => {
    const world = createPhysics2DWorld(0, 0);
    filteredBox(world, 'static', 0x0001, 0x0002);
    filteredBox(world, 'dynamic', 0x0002, 0x0004);

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(0);
  });

  it('creates a contact when both category and mask tests pass', () => {
    const world = createPhysics2DWorld(0, 0);
    filteredBox(world, 'static', 0x0001, 0x0002);
    filteredBox(world, 'dynamic', 0x0002, 0x0001);

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(1);
  });

  it('forces a matching positive group to collide regardless of masks', () => {
    const world = createPhysics2DWorld(0, 0);
    filteredBox(world, 'static', 0x0001, 0, 7);
    filteredBox(world, 'dynamic', 0x0002, 0, 7);

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(1);
  });

  it('prevents a matching negative group from colliding regardless of masks', () => {
    const world = createPhysics2DWorld(0, 0);
    filteredBox(world, 'static', 0x0001, 0xffffffff, -7);
    filteredBox(world, 'dynamic', 0x0002, 0xffffffff, -7);

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(0);
  });
});

describe('contact solve hooks', () => {
  it('calls pre-solve before post-solve exactly once per solved contact', () => {
    const world = createPhysics2DWorld(0, 0);
    ground(world);
    const crate = box(world, 0, 0.4);
    crate.velocityY = -1;
    const order: string[] = [];
    world.contactHooks.preSolve = (_currentWorld, contact) => {
      order.push('pre');
      contact.friction = 0;
    };
    world.contactHooks.postSolve = (_currentWorld, contact) => {
      order.push('post');
      expect(contact.points.slice(0, contact.pointCount).some((point) => point.normalImpulse > 0)).toBe(true);
    };

    stepPhysics2D(world, 1 / 60);

    expect(order).toEqual(['pre', 'post']);
  });

  it('lets pre-solve disable resolution for one step and resets enabled on the next', () => {
    const world = createPhysics2DWorld(0, 0);
    ground(world);
    const crate = box(world, 0, 0.4);
    let postSolveCalls = 0;
    world.contactHooks.preSolve = (_currentWorld, contact) => {
      contact.enabled = false;
    };
    world.contactHooks.postSolve = () => void postSolveCalls++;

    stepPhysics2D(world, 1 / 60);

    expect(crate.y).toBe(0.4);
    expect(world.contacts[0].enabled).toBe(false);
    expect(postSolveCalls).toBe(0);
    for (const point of world.contacts[0].points) {
      expect(point.normalImpulse).toBe(0);
      expect(point.tangentImpulse).toBe(0);
    }

    world.contactHooks.preSolve = null;
    stepPhysics2D(world, 1 / 60);

    expect(world.contacts[0].enabled).toBe(true);
    expect(crate.y).toBeGreaterThan(0.4);
    expect(postSolveCalls).toBe(1);
  });

  it('does not invoke solve hooks for sensor contacts', () => {
    const world = createPhysics2DWorld(0, 0);
    const trigger = createRigidBody2D('static', 0, 0);
    trigger.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -1, minY: -1, maxX: 1, maxY: 1 }, STONE, true),
    );
    addPhysics2DBody(world, trigger);
    box(world, 0, 0);
    let calls = 0;
    world.contactHooks.preSolve = () => void calls++;
    world.contactHooks.postSolve = () => void calls++;

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].sensor).toBe(true);
    expect(calls).toBe(0);
  });

  it('rejects recursive stepping and releases the guard after the callback fails', () => {
    const world = createPhysics2DWorld(0, 0);
    ground(world);
    box(world, 0, 0.4);
    world.contactHooks.preSolve = (currentWorld) => stepPhysics2D(currentWorld, 1 / 60);

    expect(() => stepPhysics2D(world, 1 / 60)).toThrow(/recursively/);
    expect(world.previousTimestep).toBe(0);

    world.contactHooks.preSolve = null;
    expect(() => stepPhysics2D(world, 1 / 60)).not.toThrow();
    expect(world.previousTimestep).toBe(1 / 60);
  });

  it('rejects topology mutation before a hook can partially add an entity', () => {
    const world = createPhysics2DWorld(0, 0);
    ground(world);
    box(world, 0, 0.4);
    const pending = createRigidBody2D('dynamic', 10, 10);
    world.contactHooks.preSolve = (currentWorld) => {
      addPhysics2DBody(currentWorld, pending);
    };

    expect(() => stepPhysics2D(world, 1 / 60)).toThrow(/while it is stepping/);
    expect(pending.index).toBe(-1);
    expect(world.bodies).toHaveLength(2);

    world.contactHooks.preSolve = null;
    expect(addPhysics2DBody(world, pending)).toBe(pending);
  });

  it('rejects body actions from hooks instead of applying them at a phase-dependent time', () => {
    const world = createPhysics2DWorld(0, 0);
    ground(world);
    const crate = box(world, 0, 0.4);
    world.contactHooks.postSolve = () => {
      applyPhysics2DForce(crate, 10, 0);
    };

    expect(() => stepPhysics2D(world, 1 / 60)).toThrow(/while it is stepping/);
    expect(crate.forceX).toBe(0);

    world.contactHooks.postSolve = null;
    expect(applyPhysics2DForce(crate, 10, 0)).toBe(true);
  });

  it('rejects invalid pre- and post-solve output before it can poison a later step', () => {
    const world = createPhysics2DWorld(0, 0);
    ground(world);
    box(world, 0, 0.4).velocityY = -1;
    world.contactHooks.preSolve = (_currentWorld, contact) => {
      contact.friction = Number.NaN;
    };

    expect(() => stepPhysics2D(world, 1 / 60)).toThrow(/pre-solve hook produced invalid/);
    expect(world.contacts[0].friction).toBeCloseTo(STONE.friction);
    world.contactHooks.preSolve = null;
    world.contactHooks.postSolve = (_currentWorld, contact) => {
      contact.restitution = Number.POSITIVE_INFINITY;
    };

    expect(() => stepPhysics2D(world, 1 / 60)).toThrow(/post-solve hook produced invalid/);
    expect(world.contacts[0].restitution).toBe(STONE.restitution);
    world.contactHooks.postSolve = null;
    expect(() => stepPhysics2D(world, 1 / 60)).not.toThrow();
  });

  it('does not scale a warm cache until pre-solve completes successfully', () => {
    const world = createPhysics2DWorld(0, 0);
    world.config.allowSleeping = false;
    world.config.velocityIterations = 0;
    world.config.positionIterations = 0;
    ground(world);
    box(world, 0, 0.49);
    stepPhysics2D(world, 1 / 60);
    const point = world.contacts[0].points[0];
    point.normalImpulse = 3;
    world.contactHooks.preSolve = () => {
      throw new Error('stop');
    };

    expect(() => stepPhysics2D(world, 1 / 30)).toThrow('stop');
    expect(point.normalImpulse).toBe(3);
    expect(world.previousTimestep).toBe(1 / 60);

    world.contactHooks.preSolve = null;
    stepPhysics2D(world, 1 / 30);
    expect(point.normalImpulse).toBe(6);
  });

  it('commits integration and cleanup before reporting a post-solve exception', () => {
    const world = createPhysics2DWorld(0, 0);
    ground(world);
    const crate = box(world, 0, 0.4);
    crate.velocityX = 1;
    crate.forceX = 2;
    world.contactHooks.postSolve = () => {
      throw new Error('observer failed');
    };

    expect(() => stepPhysics2D(world, 1 / 60)).toThrow('observer failed');
    expect(crate.x).toBeGreaterThan(0);
    expect(crate.forceX).toBe(0);
    expect(world.previousTimestep).toBe(1 / 60);

    world.contactHooks.postSolve = null;
    expect(() => stepPhysics2D(world, 1 / 60)).not.toThrow();
  });
});

describe('sensor reporting between immovable bodies', () => {
  // A sensor is reported, never resolved — the solver already skips sensor contacts. The step's
  // "two immovable bodies have no constraint to solve" shortcut ran before any collider was
  // inspected, so it deleted every sensor overlap between immovable bodies as well. A static trigger
  // volume over static scenery is an ordinary thing to build, and it reported nothing at all.
  function immovable(world: Physics2DWorld, x: number, sensor: boolean): RigidBody2D {
    const body = createRigidBody2D('static', x, 0);
    body.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE, sensor),
    );
    return addPhysics2DBody(world, body);
  }

  it('reports a static sensor overlapping a static collider', () => {
    const world = createPhysics2DWorld(0, 0);
    immovable(world, 0, true);
    immovable(world, 0, false);
    stepPhysics2D(world, 1 / 60);
    expect(world.events.began).toHaveLength(1);
    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].sensor).toBe(true);
  });

  it('still skips two immovable bodies when neither senses', () => {
    // The shortcut is right for the case it was written for, and must survive the fix.
    const world = createPhysics2DWorld(0, 0);
    immovable(world, 0, false);
    immovable(world, 0, false);
    stepPhysics2D(world, 1 / 60);
    expect(world.events.began).toHaveLength(0);
    expect(world.contacts).toHaveLength(0);
  });

  // Every existing case above gives each body exactly one collider, which is why the body-level guard
  // looked sufficient. Owning a sensor ANYWHERE does not make a body's other colliders reportable:
  // these two static bodies overlap solid-on-solid, and the disjoint trigger volume must not smuggle
  // that pair past the immovable shortcut.
  function immovableWithSensorAndSolid(world: Physics2DWorld, x: number): RigidBody2D {
    const body = createRigidBody2D('static', x, 0);
    // A trigger volume far away from the solid part, so it overlaps nothing.
    body.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: 99.5, minY: -0.5, maxX: 100.5, maxY: 0.5 }, STONE, true),
    );
    body.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE, false),
    );
    return addPhysics2DBody(world, body);
  }

  it('reports nothing when the overlapping colliders are both solid and both bodies are immovable', () => {
    const world = createPhysics2DWorld(0, 0);
    immovableWithSensorAndSolid(world, 0);
    immovable(world, 0, false);

    stepPhysics2D(world, 1 / 60);

    expect(world.events.began).toHaveLength(0);
    expect(world.contacts).toHaveLength(0);
  });

  // The other half of the same class: the sensor collider on that body must still report when it is
  // the one actually overlapping, so the pair-level test is not just a blanket suppression.
  it('still reports the sensor collider of a mixed body when that collider overlaps', () => {
    const world = createPhysics2DWorld(0, 0);
    immovableWithSensorAndSolid(world, 0);
    immovable(world, 100, false);

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].sensor).toBe(true);
  });

  // A movable body is unaffected by the immovable test, so its solid contacts still resolve even when
  // the other body carries a sensor.
  it('keeps a solid contact when one body can move', () => {
    const world = createPhysics2DWorld(0, 0);
    immovableWithSensorAndSolid(world, 0);
    box(world, 0, 0);

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts.some((contact) => !contact.sensor)).toBe(true);
  });

  it('resolves nothing for a static sensor pair — reporting is not colliding', () => {
    const world = createPhysics2DWorld(0, 0);
    const sensor = immovable(world, 0, true);
    const scenery = immovable(world, 0, false);
    stepPhysics2D(world, 1 / 60);
    expect(sensor.x).toBe(0);
    expect(scenery.x).toBe(0);
    expect(sensor.velocityX).toBe(0);
  });

  it('ends a static sensor contact when the overlap stops', () => {
    const world = createPhysics2DWorld(0, 0);
    const sensor = immovable(world, 0, true);
    immovable(world, 0, false);
    stepPhysics2D(world, 1 / 60);
    expect(world.events.began).toHaveLength(1);
    sensor.x = 100;
    stepPhysics2D(world, 1 / 60);
    expect(world.events.ended).toHaveLength(1);
    expect(world.contacts).toHaveLength(0);
  });
});

// The seams themselves, tested for installation and removal only. What the installed guards SAY is
// enablePhysics2DGuards.test.ts's subject; what the step promises is that it consults them at the right
// moments and not otherwise.
describe('setPhysics2DContactIntakeGuard', () => {
  afterEach(() => {
    setPhysics2DContactIntakeGuard(null);
  });

  it('consults the seam once per step that will actually run, and not on one that declines', () => {
    const world = createPhysics2DWorld(0, -10);
    box(world, 0, 0);
    let calls = 0;
    setPhysics2DContactIntakeGuard(() => {
      calls++;
    });

    stepPhysics2D(world, 1 / 60);
    stepPhysics2D(world, 1 / 60);
    expect(calls).toBe(2);

    // A declined step builds no contacts, so there is no intake to describe.
    world.config.velocityIterations = -1;
    stepPhysics2D(world, 1 / 60);
    expect(calls).toBe(2);
  });

  it('removes the seam when passed null', () => {
    const world = createPhysics2DWorld(0, -10);
    box(world, 0, 0);
    let calls = 0;
    setPhysics2DContactIntakeGuard(() => {
      calls++;
    });
    setPhysics2DContactIntakeGuard(null);

    stepPhysics2D(world, 1 / 60);

    expect(calls).toBe(0);
  });
});

describe('setPhysics2DJointResolutionGuard', () => {
  afterEach(() => {
    setPhysics2DJointResolutionGuard(null);
  });

  it('consults the seam once per step that will actually run', () => {
    const world = createPhysics2DWorld(0, -10);
    box(world, 0, 0);
    let calls = 0;
    setPhysics2DJointResolutionGuard(() => {
      calls++;
    });

    // No joints at all: nothing to resolve, so nothing to ask about.
    stepPhysics2D(world, 1 / 60);
    expect(calls).toBe(0);

    const joint: Physics2DJoint = {
      kind: 'acme.Unregistered',
      bodyA: world.bodies[0].index,
      bodyB: world.bodies[0].index,
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
    };
    addPhysics2DJoint(world, joint);
    stepPhysics2D(world, 1 / 60);
    stepPhysics2D(world, 1 / 60);
    expect(calls).toBe(2);
  });

  it('leaves the joint seam alone on a step that declines its preconditions', () => {
    const world = createPhysics2DWorld(0, -10);
    box(world, 0, 0);
    addPhysics2DJoint(world, {
      kind: 'acme.Unregistered',
      bodyA: world.bodies[0].index,
      bodyB: world.bodies[0].index,
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
    } satisfies Physics2DJoint);
    world.config.velocityIterations = -1;
    let calls = 0;
    setPhysics2DJointResolutionGuard(() => {
      calls++;
    });

    stepPhysics2D(world, 1 / 60);

    expect(calls).toBe(0);
  });

  it('removes the seam when passed null', () => {
    const world = createPhysics2DWorld(0, -10);
    box(world, 0, 0);
    addPhysics2DJoint(world, {
      kind: 'acme.Unregistered',
      bodyA: world.bodies[0].index,
      bodyB: world.bodies[0].index,
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
    } satisfies Physics2DJoint);
    let calls = 0;
    setPhysics2DJointResolutionGuard(() => {
      calls++;
    });
    setPhysics2DJointResolutionGuard(null);

    stepPhysics2D(world, 1 / 60);

    expect(calls).toBe(0);
  });
});

describe('setPhysics2DStepGuard', () => {
  afterEach(() => {
    setPhysics2DStepGuard(null);
  });

  it('consults the seam with the rejected timestep only when the step declines', () => {
    const world = createPhysics2DWorld(0, -10);
    box(world, 0, 0);
    const seen: number[] = [];
    setPhysics2DStepGuard((_world, dt) => {
      seen.push(dt);
    });

    stepPhysics2D(world, 1 / 60);
    expect(seen).toEqual([]);

    // The guard receives the dt that was rejected, not a sanitized one, or a caller cannot tell which
    // value its own frame loop produced.
    stepPhysics2D(world, Number.NaN);
    expect(seen).toHaveLength(1);
    expect(Number.isNaN(seen[0])).toBe(true);
  });

  it('removes the seam when passed null', () => {
    const world = createPhysics2DWorld(0, -10);
    let calls = 0;
    setPhysics2DStepGuard(() => {
      calls++;
    });
    setPhysics2DStepGuard(null);

    stepPhysics2D(world, -1);

    expect(calls).toBe(0);
  });
});

describe('stepPhysics2D', () => {
  it('keeps step scratch isolated when a broadphase callback steps another world', () => {
    const world = createPhysics2DWorld(0, 0);
    world.config.continuousCollision = false;
    const fixed = ground(world);
    const dynamic = box(world, 0, 0.4);
    const nestedWorld = createPhysics2DWorld(0, 0);
    nestedWorld.config.continuousCollision = false;
    let nestedCalls = 0;
    world.index.querySpatialPairs = (out) => {
      out.length = 0;
      out.push({ a: fixed.index, b: dynamic.index });
      if (nestedCalls === 0) {
        nestedCalls++;
        stepPhysics2D(nestedWorld, 1 / 60);
      }
    };

    stepPhysics2D(world, 1 / 60);

    expect(nestedCalls).toBe(1);
    expect(world.contacts).toHaveLength(1);
  });

  it('rejects invalid solver state before mutating the world', () => {
    const world = createPhysics2DWorld();
    const crate = box(world, 0, 2);
    crate.velocityX = 3;
    crate.forceY = 4;
    world.config.positionCorrection = Number.NaN;

    stepPhysics2D(world, 1 / 60);

    expect(crate.x).toBe(0);
    expect(crate.y).toBe(2);
    expect(crate.velocityX).toBe(3);
    expect(crate.forceY).toBe(4);
    expect(world.contacts).toHaveLength(0);
    expect(world.previousTimestep).toBe(0);
  });

  it('scales cached contact impulses into a changed timestep', () => {
    const world = createPhysics2DWorld(0, 0);
    world.config.allowSleeping = false;
    world.config.velocityIterations = 0;
    world.config.positionIterations = 0;
    ground(world);
    box(world, 0, 0.49);
    stepPhysics2D(world, 1 / 60);
    const point = world.contacts[0].points[0];
    point.normalImpulse = 3;
    point.tangentImpulse = 4;

    stepPhysics2D(world, 1 / 30);

    expect(point.normalImpulse).toBe(6);
    expect(point.tangentImpulse).toBe(8);
    expect(world.previousTimestep).toBe(1 / 30);
  });

  it('rests a box on the ground instead of sinking through it', () => {
    const world = createPhysics2DWorld();
    ground(world);
    const crate = box(world, 0, 2);
    runSteps(world, 180);

    // Half-extent 0.5 above a ground surface at y=0: the resting centre is y=0.5, less the solver's
    // deliberate penetration slop.
    expect(crate.y).toBeGreaterThan(0.48);
    expect(crate.y).toBeLessThan(0.52);
    expect(Math.abs(crate.velocityY)).toBeLessThan(0.05);
  });

  it('keeps a stack standing rather than letting the lower boxes be compressed through each other', () => {
    // The case warm starting exists for. Without it the solver restarts from zero impulse every step, so
    // the bottom box never converges against the weight above it and the stack visibly sinks.
    const world = createPhysics2DWorld();
    ground(world);
    const bottom = box(world, 0, 0.5);
    const middle = box(world, 0, 1.5);
    const top = box(world, 0, 2.5);
    runSteps(world, 240);

    expect(bottom.y).toBeGreaterThan(0.45);
    expect(middle.y).toBeGreaterThan(1.4);
    expect(top.y).toBeGreaterThan(2.35);
    expect(middle.y - bottom.y).toBeGreaterThan(0.9);
    expect(top.y - middle.y).toBeGreaterThan(0.9);
  });

  it('uses positionIterations to project overlap without adding separating velocity', () => {
    const withoutProjection = createPhysics2DWorld(0, 0);
    withoutProjection.config.positionIterations = 0;
    const fixedWithout = createRigidBody2D('static', 0, 0);
    fixedWithout.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE),
    );
    addPhysics2DBody(withoutProjection, fixedWithout);
    const bodyWithout = box(withoutProjection, 0.75, 0);

    const withProjection = createPhysics2DWorld(0, 0);
    withProjection.config.positionIterations = 3;
    const fixedWith = createRigidBody2D('static', 0, 0);
    fixedWith.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE),
    );
    addPhysics2DBody(withProjection, fixedWith);
    const bodyWith = box(withProjection, 0.75, 0);

    stepPhysics2D(withoutProjection, 1 / 60);
    stepPhysics2D(withProjection, 1 / 60);

    expect(bodyWithout.x - fixedWithout.x).toBe(0.75);
    expect(bodyWith.x - fixedWith.x).toBeGreaterThan(0.84);
    expect(bodyWith.velocityX).toBe(0);
  });

  it('clears contact accumulators when warm starting is switched off', () => {
    // Skipping the warm-start APPLICATION is not a cold start by itself. The contact solve clamps each
    // increment against the accumulated total, so a cached impulse that remains in the point still
    // participates in the next solve even when it was not reapplied to the bodies.
    const world = createPhysics2DWorld();
    world.config.allowSleeping = false;
    ground(world);
    box(world, 0, 0.5);
    runSteps(world, 60);
    expect(world.contacts[0].points[0].normalImpulse).toBeGreaterThan(0);

    world.config.warmStarting = false;
    // Zero iterations isolates the reset from any new impulse this step might legitimately accumulate.
    world.config.velocityIterations = 0;
    world.config.positionIterations = 0;
    stepPhysics2D(world, 1 / 60);

    for (const contact of world.contacts) {
      for (let i = 0; i < contact.pointCount; i++) {
        expect(contact.points[i].normalImpulse).toBe(0);
        expect(contact.points[i].tangentImpulse).toBe(0);
      }
    }
  });

  it('produces a bitwise-identical trace for the same scene stepped twice', () => {
    // The golden-trace harness. Determinism for a fixed engine and input order is exact, not approximate:
    // every operation on this path is IEEE-754 exact (+ - * / and sqrt), so anything short of bitwise
    // equality is a real divergence rather than accumulated noise.
    const first = createPhysics2DWorld();
    ground(first);
    box(first, 0.1, 2);
    box(first, -0.3, 3.2);
    runSteps(first, 120);

    const second = createPhysics2DWorld();
    ground(second);
    box(second, 0.1, 2);
    box(second, -0.3, 3.2);
    runSteps(second, 120);

    expect(traceWorld(second)).toBe(traceWorld(first));
  });

  it('produces the same trace when the broadphase reports its pairs in the opposite order', () => {
    // ORDER-INDEPENDENCE, OBLIGATION 2 — the contact LIST sort.
    //
    // The harness injects a broadphase that reverses its pair list, leaving the bodies and their indices
    // untouched. That isolates the variable that matters: `querySpatialPairs2D` walks a Map of Sets, so its
    // order follows insertion and movement history, and a sequential-impulse solver applies each impulse
    // against the velocities the previous ones left. Without the canonical sort the answer would depend
    // on the broadphase's history.
    //
    // Note what this does NOT test, and what an insertion-order shuffle would wrongly claim: reordering
    // INSERTION changes the body indices, hence the canonical solve order, hence — legitimately — the
    // result. Canonical ordering buys DETERMINISM (same input, same output), not invariance to how the
    // scene was built. A harness asserting the latter asserts something false about Gauss-Seidel.
    const plain = createPhysics2DWorld();
    ground(plain);
    const plainLeft = box(plain, -0.9, 0.5);
    const plainRight = box(plain, 0.9, 0.5);
    const plainTop = box(plain, 0, 1.6);

    const reversed = createPhysics2DWorld(0, -9.81, createReversedPairBackend());
    ground(reversed);
    const reversedLeft = box(reversed, -0.9, 0.5);
    const reversedRight = box(reversed, 0.9, 0.5);
    const reversedTop = box(reversed, 0, 1.6);

    runSteps(plain, 90);
    runSteps(reversed, 90);

    expect(traceWorld(reversed)).toBe(traceWorld(plain));
    expect(reversedLeft.y).toBe(plainLeft.y);
    expect(reversedRight.y).toBe(plainRight.y);
    expect(reversedTop.y).toBe(plainTop.y);
  });

  it('orders every contact pair by body index however the broadphase hands it over', () => {
    // ORDER-INDEPENDENCE, OBLIGATION 1 — the per-pair BODY sort, which the harness above cannot see.
    // Reversing the pair LIST does not change which body of a pair reaches the narrow phase first; that
    // follows the pair's own field order. This backend swaps `a` and `b` within every pair, which is the
    // only thing that exercises it. Unordered, collision would resolve contact points on the opposite
    // surface and renumber their feature ids, silently discarding the warm-start cache every step.
    const swapped = createPhysics2DWorld(0, -9.81, createSwappedPairBackend());
    ground(swapped);
    const crate = box(swapped, 0.2, 1.4);
    runSteps(swapped, 120);

    for (const contact of swapped.contacts) expect(contact.bodyA).toBeLessThan(contact.bodyB);

    const plain = createPhysics2DWorld();
    ground(plain);
    const plainCrate = box(plain, 0.2, 1.4);
    runSteps(plain, 120);

    expect(crate.y).toBe(plainCrate.y);
    expect(crate.x).toBe(plainCrate.x);
    expect(crate.angle).toBe(plainCrate.angle);
  });

  it('keeps the contact list in a canonical order after a step', () => {
    const world = createPhysics2DWorld();
    ground(world);
    box(world, -0.9, 0.5);
    box(world, 0.9, 0.5);
    box(world, 0, 1.6);
    runSteps(world, 60);

    expect(world.contacts.length).toBeGreaterThan(1);
    for (let i = 1; i < world.contacts.length; i++) {
      const previous = world.contacts[i - 1];
      const current = world.contacts[i];
      const ordered =
        previous.bodyA < current.bodyA ||
        (previous.bodyA === current.bodyA &&
          (previous.bodyB < current.bodyB ||
            (previous.bodyB === current.bodyB && previous.colliderA <= current.colliderA)));
      expect(ordered).toBe(true);
    }
  });

  it('tips a box that overhangs a ledge instead of sliding off level', () => {
    // The proof that contact points carry torque. With only a minimum-translation vector and no point,
    // the lever arm is zero, the angular term vanishes, and an overhanging box slides off perfectly
    // level — which is what the whole contact-manifold lane exists to prevent.
    const world = createPhysics2DWorld();
    const ledge = createRigidBody2D('static', 0, 0);
    ledge.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -5, minY: -1, maxX: 0, maxY: 0 }, STONE));
    addPhysics2DBody(world, ledge);
    // The centre of mass must be BEYOND the support edge at x=0 for there to be a tipping moment at
    // all; a box whose centre still sits over the ledge is supported and correctly stays level.
    const crate = box(world, 0.2, 0.5);
    runSteps(world, 120);

    expect(Math.abs(crate.angle)).toBeGreaterThan(0.05);
  });

  it('leaves a sensor collider overlapping without pushing anything out of it', () => {
    const world = createPhysics2DWorld();
    const trigger = createRigidBody2D('static', 0, 0);
    trigger.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -2, minY: -2, maxX: 2, maxY: 2 }, STONE, true),
    );
    addPhysics2DBody(world, trigger);
    const crate = box(world, 0, 0);
    runSteps(world, 30);

    expect(world.contacts.some((contact) => contact.sensor)).toBe(true);
    // Gravity keeps pulling it: a sensor reports the overlap and applies no impulse.
    expect(crate.velocityY).toBeLessThan(-0.1);
  });

  it('rejects a non-positive or non-finite timestep before mutating the world', () => {
    const world = createPhysics2DWorld();
    ground(world);
    const crate = box(world, 0, 2);
    const before = traceWorld(world);
    for (const dt of [0, -1 / 60, Number.NaN, Infinity, -Infinity]) {
      stepPhysics2D(world, dt);
      expect(traceWorld(world)).toBe(before);
    }
    expect(crate.y).toBe(2);
  });

  it.each([
    ['velocityIterations', Infinity],
    ['velocityIterations', -1],
    ['velocityIterations', 1.5],
    ['positionIterations', Infinity],
    ['positionIterations', -1],
    ['positionIterations', 1.5],
  ] as const)('rejects invalid %s value %s before mutating the world', (field, value) => {
    const world = createPhysics2DWorld();
    ground(world);
    box(world, 0, 2);
    const before = traceWorld(world);
    world.config[field] = value;

    stepPhysics2D(world, 1 / 60);

    expect(traceWorld(world)).toBe(before);
    expect(world.contacts).toHaveLength(0);
  });
});

describe('stepPhysics2D contact cache identity', () => {
  it('preserves every cached point impulse when manifold feature order changes', () => {
    // A two-point manifold may report the same features in the opposite slot order after a small pose
    // change. The merge writes into the persistent array in place, so reading the second old feature
    // after overwriting the first slot loses it unless both old identities and impulses are snapshotted
    // before either destination is touched.
    const world = createPhysics2DWorld(0, 0);
    world.config.positionIterations = 0;
    world.config.velocityIterations = 0;
    box(world, 0, 0);
    box(world, 0, 0.75);
    stepPhysics2D(world, 1 / 60);
    const contact = world.contacts[0];
    expect(contact.pointCount).toBe(2);
    const expected = new Map<number, { normal: number; tangent: number }>();
    for (let i = 0; i < contact.pointCount; i++) {
      const point = contact.points[i];
      point.normalImpulse = i + 1;
      point.tangentImpulse = -(i + 1);
      expected.set(point.featureId, { normal: point.normalImpulse, tangent: point.tangentImpulse });
    }
    contact.points.reverse();

    stepPhysics2D(world, 1 / 60);

    for (let i = 0; i < contact.pointCount; i++) {
      const point = contact.points[i];
      const cached = expected.get(point.featureId);
      expect(cached).toBeDefined();
      expect(point.normalImpulse).toBe(cached?.normal);
      expect(point.tangentImpulse).toBe(cached?.tangent);
    }
  });
});

describe('stepPhysics2D contact events', () => {
  it('reports a contact beginning and ending, read off the cache transitions', () => {
    const world = createPhysics2DWorld();
    ground(world);
    const crate = box(world, 0, 3);
    runSteps(world, 1);
    expect(world.events.began).toHaveLength(0);

    // Fall until it lands: the step that creates the contact is the begin.
    let began = 0;
    for (let i = 0; i < 200 && began === 0; i++) {
      stepPhysics2D(world, 1 / 60);
      began += world.events.began.length;
    }
    expect(began).toBe(1);

    // Teleport it away: the step that drops the contact is the end.
    crate.y = 50;
    crate.velocityY = 0;
    stepPhysics2D(world, 1 / 60);
    expect(world.events.ended).toHaveLength(1);
    expect(world.contacts).toHaveLength(0);
  });

  it('clears its event buffers each step rather than accumulating', () => {
    const world = createPhysics2DWorld();
    ground(world);
    box(world, 0, 0.4);
    runSteps(world, 5);
    expect(world.events.began).toHaveLength(0);
    expect(world.events.ended).toHaveLength(0);
  });

  it('reports begin and end events for a point sensor without inventing a manifold', () => {
    const world = createPhysics2DWorld(0, 0);
    const trigger = createRigidBody2D('static', 0, 0);
    trigger.colliders.push(createPhysics2DCollider({ kind: 'point', x: 0, y: 0 }, STONE, true));
    addPhysics2DBody(world, trigger);
    const target = createRigidBody2D('static', 0, 0);
    target.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE),
    );
    addPhysics2DBody(world, target);

    stepPhysics2D(world, 1 / 60);

    expect(world.events.began).toHaveLength(1);
    expect(world.contacts[0]).toMatchObject({ pointCount: 0, sensor: true, touching: true });

    target.x = 2;
    stepPhysics2D(world, 1 / 60);

    expect(world.events.ended).toHaveLength(1);
    expect(world.contacts).toHaveLength(0);
  });

  it('reports a segment overlap when the area-bearing collider is the sensor', () => {
    const world = createPhysics2DWorld(0, 0);
    const segment = createRigidBody2D('static', 0, 0);
    segment.colliders.push(createPhysics2DCollider({ kind: 'segment', x0: -2, y0: 0, x1: 2, y1: 0 }, STONE));
    addPhysics2DBody(world, segment);
    const trigger = createRigidBody2D('static', 0, 0);
    trigger.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }, STONE, true));
    addPhysics2DBody(world, trigger);

    stepPhysics2D(world, 1 / 60);

    expect(world.events.began).toHaveLength(1);
    expect(world.contacts[0]).toMatchObject({ pointCount: 0, sensor: true, touching: true });
  });
});

describe('stepPhysics2D with breakable joints', () => {
  const GRAVITY = -10;
  const DT = 1 / 240;

  // A bob hanging from a rigid distance joint. Its weight is the only load, so the threshold can be set
  // relative to a number the test computes rather than to one read off the implementation.
  function hangingWorld(breakForce: number, breakTorque = Number.POSITIVE_INFINITY) {
    const world = createPhysics2DWorld(0, GRAVITY);
    registerPhysics2DJointSolver(world, 'Distance', physics2DDistanceJointSolver);
    const anchor = createRigidBody2D('static', 0, 0);
    anchor.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.1 }, STONE));
    addPhysics2DBody(world, anchor);
    const bob = createRigidBody2D('dynamic', 0, -2);
    bob.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.4 }, STONE));
    addPhysics2DBody(world, bob);
    const joint: Physics2DJoint = {
      kind: 'Distance',
      bodyA: anchor.index,
      bodyB: bob.index,
      localAnchorAX: 0,
      localAnchorAY: 0,
      localAnchorBX: 0,
      localAnchorBY: 0,
      collideConnected: false,
      breakForce,
      breakTorque,
      impulse0: 0,
      impulse1: 0,
      impulse2: 0,
      rAX: 0,
      rAY: 0,
      rBX: 0,
      rBY: 0,
    };
    Object.assign(joint, { length: 2, frequencyHz: 0, dampingRatio: 0 });
    addPhysics2DJoint(world, joint);
    return { world, bob, joint, weight: bob.mass * -GRAVITY };
  }

  it('holds a load under its threshold indefinitely', () => {
    const { world, joint, weight } = hangingWorld(0);
    // Threshold set from the measured weight, so this is "twice what it has to carry" rather than a
    // number that happens to be large.
    joint.breakForce = weight * 2;

    for (let step = 0; step < 600; step++) stepPhysics2D(world, DT);

    expect(world.joints).toHaveLength(1);
    expect(world.jointEvents.broke).toHaveLength(0);
  });

  it('breaks a joint whose load exceeds its threshold and removes it from the world', () => {
    const { world, bob, joint, weight } = hangingWorld(0);
    joint.breakForce = weight / 2;

    stepPhysics2D(world, DT);

    expect(world.joints).toHaveLength(0);
    expect(world.jointEvents.broke).toHaveLength(1);
    expect(world.jointEvents.broke[0].joint).toBe(joint);
    // The recorded load is the one that broke it, not a rounded flag: it is what a caller scales debris,
    // sound, or damage by.
    expect(world.jointEvents.broke[0].forceY).toBeGreaterThan(weight / 2);

    // And it is really gone: the bob falls freely from here.
    const before = bob.y;
    for (let step = 0; step < 60; step++) stepPhysics2D(world, DT);
    expect(bob.y).toBeLessThan(before - 0.01);
  });

  it('never breaks a joint whose thresholds are both infinite, which is the default', () => {
    const { world, joint } = hangingWorld(Number.POSITIVE_INFINITY);
    expect(joint.breakForce).toBe(Number.POSITIVE_INFINITY);

    for (let step = 0; step < 600; step++) stepPhysics2D(world, DT);

    expect(world.joints).toHaveLength(1);
  });

  it('breaks on torque alone, independently of the force threshold', () => {
    // A weld holding an off-centre weight: the force it carries is the weight, and the couple it carries
    // is the moment about the anchor. With an infinite force threshold, only the torque can break it —
    // which is the whole reason the two are separate fields.
    const world = createPhysics2DWorld(0, GRAVITY);
    registerPhysics2DJointSolver(world, 'Weld', physics2DWeldJointSolver);
    const post = createRigidBody2D('static', 0, 0);
    post.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.1 }, STONE));
    addPhysics2DBody(world, post);
    const arm = createRigidBody2D('dynamic', 0, 0);
    arm.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 1.5, y: 0, radius: 0.4 }, STONE));
    addPhysics2DBody(world, arm);
    const moment = arm.mass * -GRAVITY * 1.5;
    const joint: Physics2DJoint = {
      kind: 'Weld',
      bodyA: post.index,
      bodyB: arm.index,
      localAnchorAX: 0,
      localAnchorAY: 0,
      localAnchorBX: 0,
      localAnchorBY: 0,
      collideConnected: false,
      breakForce: Number.POSITIVE_INFINITY,
      breakTorque: moment / 2,
      impulse0: 0,
      impulse1: 0,
      impulse2: 0,
      rAX: 0,
      rAY: 0,
      rBX: 0,
      rBY: 0,
    };
    Object.assign(joint, { referenceAngle: 0 });
    addPhysics2DJoint(world, joint);

    // Stop AT the break: the event list names only the step that produced it, so stepping past would
    // find it already cleared.
    for (let step = 0; step < 240 && world.jointEvents.broke.length === 0; step++) stepPhysics2D(world, DT);

    expect(world.jointEvents.broke).toHaveLength(1);
    expect(Math.abs(world.jointEvents.broke[0].torque)).toBeGreaterThan(moment / 2);
    // Broken by the couple while the force threshold was never in play at all.
    expect(world.jointEvents.broke[0].joint.breakForce).toBe(Number.POSITIVE_INFINITY);
  });

  it('clears the broken list at the start of each step, so it names only this step', () => {
    const { world, weight, joint } = hangingWorld(0);
    joint.breakForce = weight / 2;

    stepPhysics2D(world, DT);
    expect(world.jointEvents.broke).toHaveLength(1);

    stepPhysics2D(world, DT);
    expect(world.jointEvents.broke).toHaveLength(0);
  });

  it('lets a caller re-add a broken joint, because breaking only removes it', () => {
    const { world, joint, weight } = hangingWorld(0);
    joint.breakForce = weight / 2;
    stepPhysics2D(world, DT);
    expect(world.joints).toHaveLength(0);

    joint.breakForce = Number.POSITIVE_INFINITY;
    addPhysics2DJoint(world, joint);
    for (let step = 0; step < 60; step++) stepPhysics2D(world, DT);

    expect(world.joints).toHaveLength(1);
  });
});

describe('stepPhysics2D with joints', () => {
  const DISTANCE = 'Distance';

  function jointedWorld(index?: SpatialIndexBackend2D) {
    const world = createPhysics2DWorld(0, -9.81, index);
    registerPhysics2DJointSolver(world, DISTANCE, physics2DDistanceJointSolver);
    ground(world);
    // Created static, not mutated to static after the fact: mass properties are derived at insertion, so
    // flipping the type afterwards leaves a nonzero inverse mass on a body that never integrates its
    // position — it accumulates velocity forever and drags whatever is jointed to it out of the world.
    const anchorBody = createRigidBody2D('static', 0, 4);
    anchorBody.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE),
    );
    const anchor = addPhysics2DBody(world, anchorBody);
    const left = box(world, -1, 2);
    const right = box(world, 1, 2);
    for (const bob of [left, right]) {
      addPhysics2DJoint(world, {
        kind: DISTANCE,
        bodyA: anchor.index,
        bodyB: bob.index,
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
        length: 2,
        frequencyHz: 0,
        dampingRatio: 0,
      } as never);
    }
    return { left, right, world };
  }

  it('scales common and kind-owned joint impulses into a changed timestep', () => {
    const world = createPhysics2DWorld(0, 0);
    world.config.allowSleeping = false;
    world.config.velocityIterations = 0;
    world.config.positionIterations = 0;
    const first = box(world, 0, 0);
    const second = box(world, 4, 0);
    registerPhysics2DJointSolver(world, 'Scaled', {
      prepare: () => {},
      scaleAccumulatedImpulses: (value, ratio) => {
        const scaled = value as Physics2DJoint & { motorImpulse: number };
        scaled.motorImpulse *= ratio;
      },
      solve: () => {},
      warmStart: () => {},
    });
    const added = addPhysics2DJoint(world, {
      kind: 'Scaled',
      bodyA: first.index,
      bodyB: second.index,
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
      motorImpulse: 0,
      rAX: 0,
      rAY: 0,
      rBX: 0,
      rBY: 0,
    } as Physics2DJoint & { motorImpulse: number }) as Physics2DJoint & { motorImpulse: number };
    stepPhysics2D(world, 1 / 60);
    added.impulse0 = 2;
    added.impulse1 = 3;
    added.impulse2 = 4;
    added.motorImpulse = 5;

    stepPhysics2D(world, 1 / 30);

    expect([added.impulse0, added.impulse1, added.impulse2, added.motorImpulse]).toEqual([4, 6, 8, 10]);
  });

  it('produces the same trace when the broadphase reports its pairs in the opposite order', () => {
    // OBLIGATION 2 EXTENDED TO P2. Joints share the contact list's iteration loop, so the contact sort has
    // to keep holding once joints are also constraining the same bodies — a scene whose contacts reorder
    // now perturbs the joint solve too.
    const plain = jointedWorld();
    const reversed = jointedWorld(createReversedPairBackend());
    runSteps(plain.world, 120);
    runSteps(reversed.world, 120);
    expect(traceWorld(reversed.world)).toBe(traceWorld(plain.world));
  });

  it('orders every contact pair by body index with joints present', () => {
    // OBLIGATION 1 EXTENDED TO P2.
    const { world } = jointedWorld(createSwappedPairBackend());
    runSteps(world, 120);
    for (const contact of world.contacts) expect(contact.bodyA).toBeLessThan(contact.bodyB);
    for (const joint of world.joints) expect(joint.bodyA).toBeLessThan(joint.bodyB);
  });

  it('is bit-for-bit repeatable with joints in the solve list', () => {
    const first = jointedWorld();
    const second = jointedWorld();
    runSteps(first.world, 90);
    runSteps(second.world, 90);
    expect(traceWorld(second.world)).toBe(traceWorld(first.world));
  });

  it('suppresses the contact between jointed bodies unless the joint asks for it', () => {
    // A jointed pair almost always overlaps at the anchor, and resolving that contact fights the
    // constraint holding them together.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, DISTANCE, physics2DDistanceJointSolver);
    const a = box(world, 0, 0);
    const b = box(world, 0.2, 0);
    addPhysics2DJoint(world, {
      kind: DISTANCE,
      bodyA: a.index,
      bodyB: b.index,
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
      length: 0.2,
      frequencyHz: 0,
      dampingRatio: 0,
    } as never);
    runSteps(world, 10);
    expect(world.contacts).toHaveLength(0);
  });

  it('does not suppress collision through a one-body joint placeholder', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, 'OneBody', { prepare: () => {}, solve: () => {}, usesBodyA: false });
    const placeholder = box(world, 0, 0);
    const constrained = box(world, 0.2, 0);
    addPhysics2DJoint(world, {
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
    });

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(1);
  });
});

describe('stepPhysics2D with sleeping', () => {
  it('settles a resting crate to sleep and then holds its pose exactly', () => {
    const world = createPhysics2DWorld();
    ground(world);
    const crate = box(world, 0, 2);
    runSteps(world, 240);
    expect(crate.sleeping).toBe(true);

    const restingY = crate.y;
    runSteps(world, 120);

    // Not "close to" — a sleeping body is skipped by integration outright, so its pose is bit-identical.
    // Even the residual sink of a solved-but-still contact is gone.
    expect(crate.y).toBe(restingY);
    expect(crate.velocityY).toBe(0);
  });

  it('wakes a sleeping crate when another body lands on it', () => {
    const world = createPhysics2DWorld();
    ground(world);
    const settled = box(world, 0, 2);
    runSteps(world, 240);
    expect(settled.sleeping).toBe(true);

    box(world, 0, 4);
    runSteps(world, 60);

    expect(settled.sleeping).toBe(false);
  });

  it('wakes a sleeping crate in the same step a force is applied to it', () => {
    // The zero-latency wake is what the sleep update's placement inside the step buys. Deciding sleep
    // after integration instead would skip this step and start moving one frame late — and because the
    // step clears forces at the end, a single-step push would be swallowed entirely.
    const world = createPhysics2DWorld();
    ground(world);
    const crate = box(world, 0, 2);
    runSteps(world, 240);
    expect(crate.sleeping).toBe(true);

    crate.forceX = 500;
    stepPhysics2D(world, 1 / 60);

    expect(crate.sleeping).toBe(false);
    expect(crate.velocityX).toBeGreaterThan(0);
  });

  it('holds a jointed body still once its island sleeps', () => {
    // Covers the joint half of the solver skip, which the contact tests cannot reach. A joint keeps a
    // converged impulse across steps like a contact does, so warm-starting a pair that is asleep hands
    // a sleeper velocity it will never integrate — and the next stillness test reads that as motion.
    // The pendulum then twitches itself awake every step and never rests.
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Distance', physics2DDistanceJointSolver);
    const anchorBody = createRigidBody2D('static', 0, 4);
    const anchor = addPhysics2DBody(world, anchorBody);
    const bob = box(world, 0, 2);
    addPhysics2DJoint(world, {
      kind: 'Distance',
      bodyA: anchor.index,
      bodyB: bob.index,
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
      length: 2,
      frequencyHz: 0,
      dampingRatio: 0,
    } as never);
    runSteps(world, 600);
    expect(bob.sleeping).toBe(true);

    const restingY = bob.y;
    runSteps(world, 120);

    expect(bob.y).toBe(restingY);
    expect(bob.sleeping).toBe(true);
  });

  it('never leaves a sleeping body holding velocity, however it came to rest', () => {
    // The invariant that licenses skipping a sleeper's integration. Sleep is only safe to implement as
    // "do not integrate" if a sleeping body has nothing left to integrate; a sleeper carrying residual
    // velocity would be motion the simulation has silently paused rather than resolved.
    //
    // Sampled across a scene that settles, is landed on, and settles again, so it covers the sleep,
    // wake-on-new-contact, and re-sleep transitions rather than a single moment.
    const world = createPhysics2DWorld();
    ground(world);
    const settled = box(world, 0, 2);
    runSteps(world, 240);
    expect(settled.sleeping).toBe(true);
    box(world, 0.1, 4);

    let sleepingSamples = 0;
    for (let i = 0; i < 600; i++) {
      stepPhysics2D(world, 1 / 60);
      for (const body of world.bodies) {
        if (!body.sleeping) continue;
        sleepingSamples++;
        expect(body.velocityX).toBe(0);
        expect(body.velocityY).toBe(0);
        expect(body.angularVelocity).toBe(0);
      }
    }

    // Guards the guard: assertions inside a conditional prove nothing if the condition never held.
    expect(sleepingSamples).toBeGreaterThan(0);
  });

  it('invokes no joint solver callback for a pair whose every end is asleep', () => {
    // The joint half of the skip as WIRING rather than as physics. Whether a particular solver's maths
    // happens to produce a zero impulse at rest is that solver's business; the contract is that a joint
    // with no movable end is not consulted at all, which is what a custom kind can assert directly.
    const calls: string[] = [];
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'Recording', {
      prepare: () => calls.push('prepare'),
      warmStart: () => calls.push('warmStart'),
      solve: () => calls.push('solve'),
      clearAccumulatedImpulses: () => calls.push('clear'),
    });
    ground(world);
    const left = box(world, -1, 2);
    const right = box(world, 1, 2);
    // The break thresholds are spelled out even though the rest of the joint is not, because the step's
    // validator reads them: a joint missing them is invalid data, and one invalid joint declines the
    // WHOLE step, so the bodies below would never settle and never fall asleep.
    addPhysics2DJoint(world, {
      kind: 'Recording',
      bodyA: left.index,
      bodyB: right.index,
      collideConnected: true,
      breakForce: Number.POSITIVE_INFINITY,
      breakTorque: Number.POSITIVE_INFINITY,
    } as never);
    runSteps(world, 240);
    expect(left.sleeping).toBe(true);
    expect(right.sleeping).toBe(true);

    calls.length = 0;
    runSteps(world, 30);

    expect(calls).toEqual([]);
  });

  it('never sleeps a resting crate when allowSleeping is off', () => {
    const world = createPhysics2DWorld();
    world.config.allowSleeping = false;
    ground(world);
    const crate = box(world, 0, 2);
    runSteps(world, 240);

    expect(crate.sleeping).toBe(false);
  });
});
