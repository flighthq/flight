import {
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { Physics3DContact, Physics3DContactPoint, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildPhysics3DContacts } from './contactIntake';
import { refreshRigidBody3DWorldInertia } from './integrate';
import { buildPhysics3DSolveIslands, updatePhysics3DSleep } from './islands';
import { computePhysics3DBoxMassData, createPhysics3DMassData } from './massProperties';
import { setRigidBody3DMassData } from './massProperties';
import {
  createPhysics3DContactConstraint,
  createPhysics3DContactConstraintPoint,
  preparePhysics3DContactConstraints,
  solvePhysics3DContactPositions,
  solvePhysics3DContactVelocities,
  warmStartPhysics3DContacts,
} from './solver';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
  setPhysics3DBodyType,
} from './world';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

describe('createPhysics3DContactConstraint', () => {
  it('allocates an unbound constraint with no points', () => {
    const constraint = createPhysics3DContactConstraint();
    expect(constraint.contact).toBe(-1);
    expect(constraint.pointCount).toBe(0);
    expect(constraint.points).toHaveLength(0);
  });
});

describe('createPhysics3DContactConstraintPoint', () => {
  it('zeroes every accumulator so a new contact warm-starts from nothing', () => {
    const point = createPhysics3DContactConstraintPoint();
    expect(point.normalImpulse).toBe(0);
    expect(point.tangentImpulse0).toBe(0);
    expect(point.tangentImpulse1).toBe(0);
    expect(point.bias).toBe(0);
  });
});

describe('preparePhysics3DContactConstraints', () => {
  it('builds a friction basis orthonormal to the contact normal', () => {
    const world = createFallingBoxWorld();
    preparePhysics3DContactConstraints(world);

    const constraint = world.solver.constraints[0];
    const contact = world.contacts[0];
    const dot0 =
      constraint.tangent0X * contact.normalX +
      constraint.tangent0Y * contact.normalY +
      constraint.tangent0Z * contact.normalZ;
    const dot1 =
      constraint.tangent1X * contact.normalX +
      constraint.tangent1Y * contact.normalY +
      constraint.tangent1Z * contact.normalZ;
    const dotTangents =
      constraint.tangent0X * constraint.tangent1X +
      constraint.tangent0Y * constraint.tangent1Y +
      constraint.tangent0Z * constraint.tangent1Z;

    expect(dot0).toBeCloseTo(0, 12);
    expect(dot1).toBeCloseTo(0, 12);
    expect(dotTangents).toBeCloseTo(0, 12);
    expect(Math.hypot(constraint.tangent0X, constraint.tangent0Y, constraint.tangent0Z)).toBeCloseTo(1, 12);
    expect(Math.hypot(constraint.tangent1X, constraint.tangent1Y, constraint.tangent1Z)).toBeCloseTo(1, 12);
  });

  it('produces a basis orthonormal to the normal for every axis-aligned normal', () => {
    // The seed-axis choice flips at 1/sqrt(3); a normal aligned to the seed would cross to zero.
    for (const [nx, ny, nz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const world = createFallingBoxWorld();
      const contact = world.contacts[0];
      contact.normalX = nx;
      contact.normalY = ny;
      contact.normalZ = nz;
      preparePhysics3DContactConstraints(world);

      const constraint = world.solver.constraints[0];
      expect(Math.hypot(constraint.tangent0X, constraint.tangent0Y, constraint.tangent0Z)).toBeCloseTo(1, 12);
      expect(Math.hypot(constraint.tangent1X, constraint.tangent1Y, constraint.tangent1Z)).toBeCloseTo(1, 12);
      expect(constraint.tangent0X * nx + constraint.tangent0Y * ny + constraint.tangent0Z * nz).toBeCloseTo(0, 12);
      expect(constraint.tangent1X * nx + constraint.tangent1Y * ny + constraint.tangent1Z * nz).toBeCloseTo(0, 12);
    }
  });

  it('sets the effective normal mass to the inverse mass sum for a centred contact', () => {
    // Lever arm along the normal contributes no angular term, so the denominator is the mass sum alone.
    const world = createFallingBoxWorld();
    const contact = world.contacts[0];
    contact.points[0].rAX = 0;
    contact.points[0].rAY = -0.5;
    contact.points[0].rAZ = 0;
    preparePhysics3DContactConstraints(world);

    const inverseMassSum = world.bodies[0].inverseMass + world.bodies[1].inverseMass;
    expect(world.solver.constraints[0].points[0].normalMass).toBeCloseTo(1 / inverseMassSum, 9);
  });

  it('captures restitution from the approach speed before any impulse is applied', () => {
    const world = createFallingBoxWorld();
    world.contacts[0].restitution = 0.5;
    world.bodies[0].velocityY = -10;
    preparePhysics3DContactConstraints(world);

    expect(world.solver.constraints[0].points[0].bias).toBeCloseTo(5, 9);
  });

  it('drops restitution below the threshold so a ball does not bounce forever', () => {
    const world = createFallingBoxWorld();
    world.contacts[0].restitution = 0.9;
    world.config.sequentialImpulse.restitutionThreshold = 1;
    world.bodies[0].velocityY = -0.1;
    preparePhysics3DContactConstraints(world);

    expect(world.solver.constraints[0].points[0].bias).toBe(0);
  });

  it('skips a non-touching contact, which is its own filter to apply', () => {
    // `touching` is prepare's to check, because it can change without anything the island workspace
    // watches changing: the same pair stays in the same island while the narrow phase reports it apart.
    const world = createFallingBoxWorld();
    world.contacts[0].touching = false;
    preparePhysics3DContactConstraints(world);
    expect(world.solver.constraints).toHaveLength(0);
  });

  it('skips disabled and sensor contacts, which the island workspace excludes upstream', () => {
    for (const mutate of [
      (c: Physics3DContact) => {
        c.enabled = false;
      },
      (c: Physics3DContact) => {
        c.sensor = true;
      },
    ]) {
      const world = createFallingBoxWorld();
      mutate(world.contacts[0]);
      // Rebuilt because these two are read when the islands are built, not when prepare runs. A real
      // step gets this for free: the pre-solve hook — the supported place to disable a contact — runs
      // before `buildPhysics3DSolveIslands`, so a contact it turns off is gone from the slices.
      buildSolveWorkspace(world);
      preparePhysics3DContactConstraints(world);
      expect(world.solver.constraints).toHaveLength(0);
    }
  });

  it('skips a contact between two bodies that can neither translate nor rotate', () => {
    const world = createFallingBoxWorld();
    setPhysics3DBodyType(world.bodies[0], 'static');
    setPhysics3DBodyType(world.bodies[1], 'static');
    preparePhysics3DContactConstraints(world);
    expect(world.solver.constraints).toHaveLength(0);
  });

  it('carries accumulators across steps by featureId, not by point index', () => {
    const world = createFallingBoxWorld();
    preparePhysics3DContactConstraints(world);
    world.solver.constraints[0].points[0].normalImpulse = 7;

    // The narrow phase reports the same physical corner second this time.
    const contact = world.contacts[0];
    const moved = contact.points[0];
    contact.points = [createContactPoint(99, 0.01), moved];
    contact.pointCount = 2;
    preparePhysics3DContactConstraints(world);

    expect(world.solver.constraints[0].points[0].normalImpulse).toBe(0);
    expect(world.solver.constraints[0].points[1].normalImpulse).toBe(7);
  });

  it('keeps compound-collider accumulators with their own contact', () => {
    const world = createFallingBoxWorld();
    const second = createContact(world.bodies[0].index, world.bodies[1].index);
    second.colliderA = 1;
    second.colliderB = 1;
    world.contacts.push(second);
    buildSolveWorkspace(world);
    preparePhysics3DContactConstraints(world);
    world.solver.constraints[0].points[0].normalImpulse = 3;
    world.solver.constraints[1].points[0].normalImpulse = 11;

    preparePhysics3DContactConstraints(world);

    expect(world.solver.constraints[0].points[0].normalImpulse).toBe(3);
    expect(world.solver.constraints[1].points[0].normalImpulse).toBe(11);
  });

  it('does not carry accumulators when warm starting is disabled', () => {
    const world = createFallingBoxWorld();
    preparePhysics3DContactConstraints(world);
    world.solver.constraints[0].points[0].normalImpulse = 7;
    world.config.sequentialImpulse.warmStarting = false;
    preparePhysics3DContactConstraints(world);

    expect(world.solver.constraints[0].points[0].normalImpulse).toBe(0);
  });

  it('retains every steady-topology constraint workspace object', () => {
    const world = createFallingBoxWorld();
    const constraints = world.solver.constraints;
    const byContact = world.solver.constraintByContact;
    preparePhysics3DContactConstraints(world);
    const constraint = constraints[0];
    const points = constraint.points;
    const point = points[0];

    preparePhysics3DContactConstraints(world);

    expect(world.solver.constraints).toBe(constraints);
    expect(world.solver.constraintByContact).toBe(byContact);
    expect(world.solver.constraints[0]).toBe(constraint);
    expect(world.solver.constraints[0].points).toBe(points);
    expect(world.solver.constraints[0].points[0]).toBe(point);
  });
});

describe('solvePhysics3DContactPositions', () => {
  it('pushes a penetrating body out along the normal', () => {
    // Real geometry, overlapping by 0.1. The position pass regenerates the contact from the shapes each
    // iteration, so a hand-written `depth` on a body with no colliders describes nothing it can read.
    const world = createOverlappingBoxWorld(0.1);
    preparePhysics3DContactConstraints(world);

    const before = world.bodies[0].y;
    solvePhysics3DContactPositions(world);
    expect(world.bodies[0].y).toBeGreaterThan(before);
  });

  it('leaves the slop unresolved so a resting body does not twitch', () => {
    const world = createFallingBoxWorld();
    world.contacts[0].points[0].depth = world.config.sequentialImpulse.penetrationSlop;
    preparePhysics3DContactConstraints(world);

    const before = world.bodies[0].y;
    solvePhysics3DContactPositions(world);
    expect(world.bodies[0].y).toBe(before);
  });

  it('reports the deepest remaining penetration so a caller can stop iterating', () => {
    const world = createOverlappingBoxWorld(0.25);
    preparePhysics3DContactConstraints(world);

    const deepest = solvePhysics3DContactPositions(world);
    expect(deepest).toBeCloseTo(0.25 - world.config.sequentialImpulse.penetrationSlop, 6);
  });

  it('converges toward the slop over repeated iterations', () => {
    // The pass re-measures from the shapes, so repeated iterations genuinely converge rather than
    // re-applying one stale correction. Nothing here has to feed the depth back by hand.
    const world = createOverlappingBoxWorld(0.2);
    preparePhysics3DContactConstraints(world);

    let remaining = 0.2;
    for (let i = 0; i < 40; i += 1) remaining = solvePhysics3DContactPositions(world);

    expect(remaining).toBeLessThan(0.01);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  it('never moves a static body', () => {
    const world = createBoxOnGroundWorld();
    world.contacts[0].points[0].depth = 0.1;
    preparePhysics3DContactConstraints(world);
    const ground = world.bodies[1];
    solvePhysics3DContactPositions(world);

    expect(ground.y).toBe(0);
    expect(ground.orientationW).toBe(1);
  });
});

describe('solvePhysics3DContactVelocities', () => {
  it('removes the approach velocity of a body resting on static ground', () => {
    const world = createBoxOnGroundWorld();
    world.bodies[0].velocityY = -5;
    preparePhysics3DContactConstraints(world);
    for (let i = 0; i < 8; i += 1) solvePhysics3DContactVelocities(world);

    expect(world.bodies[0].velocityY).toBeCloseTo(0, 9);
  });

  it('applies restitution so a bouncing body leaves at the expected fraction', () => {
    const world = createBoxOnGroundWorld();
    world.contacts[0].restitution = 0.5;
    world.bodies[0].velocityY = -10;
    preparePhysics3DContactConstraints(world);
    for (let i = 0; i < 8; i += 1) solvePhysics3DContactVelocities(world);

    expect(world.bodies[0].velocityY).toBeCloseTo(5, 6);
  });

  it('never pulls two bodies together — the normal impulse stays non-negative', () => {
    const world = createBoxOnGroundWorld();
    world.bodies[0].velocityY = 5; // already separating
    preparePhysics3DContactConstraints(world);
    for (let i = 0; i < 4; i += 1) solvePhysics3DContactVelocities(world);

    expect(world.solver.constraints[0].points[0].normalImpulse).toBe(0);
    expect(world.bodies[0].velocityY).toBeCloseTo(5, 12);
  });

  it('leaves a frictionless body sliding at its full tangential speed', () => {
    const world = createBoxOnGroundWorld();
    world.contacts[0].friction = 0;
    world.bodies[0].velocityX = 3;
    world.bodies[0].velocityY = -1;
    preparePhysics3DContactConstraints(world);
    for (let i = 0; i < 8; i += 1) solvePhysics3DContactVelocities(world);

    expect(world.bodies[0].velocityX).toBeCloseTo(3, 9);
  });

  it('opposes tangential motion when friction is present', () => {
    const world = createBoxOnGroundWorld();
    world.contacts[0].friction = 0.5;
    world.bodies[0].velocityX = 3;
    world.bodies[0].velocityY = -1;
    preparePhysics3DContactConstraints(world);
    for (let i = 0; i < 8; i += 1) solvePhysics3DContactVelocities(world);

    expect(world.bodies[0].velocityX).toBeLessThan(3);
    expect(world.bodies[0].velocityX).toBeGreaterThan(0);
  });

  it('applies friction to a new impact in its first velocity iteration', () => {
    // A new point has no carried normal impulse. Friction must therefore run after the normal row in
    // the same iteration; solving it first gives a zero Coulomb limit and a frictionless first impact.
    const world = createBoxOnGroundWorld();
    world.contacts[0].friction = 1;
    world.bodies[0].velocityX = 3;
    world.bodies[0].velocityY = -1;
    preparePhysics3DContactConstraints(world);

    solvePhysics3DContactVelocities(world);

    expect(world.solver.constraints[0].points[0].normalImpulse).toBeGreaterThan(0);
    expect(world.bodies[0].velocityX).toBeLessThan(3);
  });

  it('clamps the two tangents as a coupled cone, not independently', () => {
    // The defect this guards: clamping each tangent to mu*normalImpulse on its own permits a combined
    // magnitude of sqrt(2)*mu*normalImpulse, so a box slides faster on the diagonal than on either axis.
    // Compare a diagonal slide against an axis-aligned one of the same speed.
    const speed = 3;
    const axisWorld = createBoxOnGroundWorld();
    axisWorld.contacts[0].friction = 0.3;
    axisWorld.bodies[0].velocityX = speed;
    axisWorld.bodies[0].velocityY = -1;
    preparePhysics3DContactConstraints(axisWorld);
    for (let i = 0; i < 8; i += 1) solvePhysics3DContactVelocities(axisWorld);
    const axisRemaining = Math.hypot(axisWorld.bodies[0].velocityX, axisWorld.bodies[0].velocityZ);

    const diagonalWorld = createBoxOnGroundWorld();
    diagonalWorld.contacts[0].friction = 0.3;
    diagonalWorld.bodies[0].velocityX = speed / Math.SQRT2;
    diagonalWorld.bodies[0].velocityZ = speed / Math.SQRT2;
    diagonalWorld.bodies[0].velocityY = -1;
    preparePhysics3DContactConstraints(diagonalWorld);
    for (let i = 0; i < 8; i += 1) solvePhysics3DContactVelocities(diagonalWorld);
    const diagonalRemaining = Math.hypot(diagonalWorld.bodies[0].velocityX, diagonalWorld.bodies[0].velocityZ);

    expect(diagonalRemaining).toBeCloseTo(axisRemaining, 9);
  });

  it('spins a body when the impulse acts off its centre of mass', () => {
    const world = createBoxOnGroundWorld();
    world.contacts[0].points[0].rAX = 0.5;
    world.contacts[0].points[0].rAY = -0.5;
    world.bodies[0].velocityY = -5;
    preparePhysics3DContactConstraints(world);
    for (let i = 0; i < 8; i += 1) solvePhysics3DContactVelocities(world);

    expect(Math.abs(world.bodies[0].angularVelocityZ)).toBeGreaterThan(1e-6);
  });

  it('applies no impulse to a static body', () => {
    const world = createBoxOnGroundWorld();
    world.bodies[0].velocityY = -5;
    preparePhysics3DContactConstraints(world);
    const ground = world.bodies[1];
    for (let i = 0; i < 8; i += 1) solvePhysics3DContactVelocities(world);

    expect(ground.velocityX).toBe(0);
    expect(ground.velocityY).toBe(0);
    expect(ground.angularVelocityZ).toBe(0);
  });

  it('shares the separation between two equal dynamic bodies', () => {
    const world = createTwoDynamicBodyWorld();
    world.bodies[0].velocityY = -4;
    preparePhysics3DContactConstraints(world);
    for (let i = 0; i < 12; i += 1) solvePhysics3DContactVelocities(world);

    // Equal masses in a head-on contact end with the same normal velocity: momentum is conserved and
    // the approach is removed.
    expect(world.bodies[0].velocityY).toBeCloseTo(world.bodies[1].velocityY, 6);
    expect(world.bodies[0].velocityY + world.bodies[1].velocityY).toBeCloseTo(-4, 6);
  });
});

describe('warmStartPhysics3DContacts', () => {
  it('replays a carried normal impulse onto the body', () => {
    const world = createBoxOnGroundWorld();
    preparePhysics3DContactConstraints(world);
    world.solver.constraints[0].points[0].normalImpulse = 3;

    warmStartPhysics3DContacts(world);
    expect(world.bodies[0].velocityY).toBeCloseTo(3 * world.bodies[0].inverseMass, 12);
  });

  it('does nothing when warm starting is disabled', () => {
    const world = createBoxOnGroundWorld();
    preparePhysics3DContactConstraints(world);
    world.solver.constraints[0].points[0].normalImpulse = 3;
    world.config.sequentialImpulse.warmStarting = false;

    warmStartPhysics3DContacts(world);
    expect(world.bodies[0].velocityY).toBe(0);
  });

  it('reaches the resting impulse in fewer iterations than a cold solve', () => {
    const converged = createBoxOnGroundWorld();
    converged.bodies[0].velocityY = -5;
    preparePhysics3DContactConstraints(converged);
    for (let i = 0; i < 30; i += 1) solvePhysics3DContactVelocities(converged);
    const target = converged.solver.constraints[0].points[0].normalImpulse;

    const warm = createBoxOnGroundWorld();
    warm.bodies[0].velocityY = -5;
    preparePhysics3DContactConstraints(warm);
    warm.solver.constraints[0].points[0].normalImpulse = target;
    warmStartPhysics3DContacts(warm);
    solvePhysics3DContactVelocities(warm);

    const cold = createBoxOnGroundWorld();
    cold.bodies[0].velocityY = -5;
    preparePhysics3DContactConstraints(cold);
    solvePhysics3DContactVelocities(cold);

    expect(Math.abs(warm.bodies[0].velocityY)).toBeLessThanOrEqual(Math.abs(cold.bodies[0].velocityY));
  });
});

function createContactPoint(featureId: number, depth: number): Physics3DContactPoint {
  return {
    depth,
    featureId,
    rAX: 0,
    rAY: -0.5,
    rAZ: 0,
    rBX: 0,
    rBY: 0.5,
    rBZ: 0,
    x: 0,
    y: 0,
    z: 0,
  };
}

function createContact(bodyA: number, bodyB: number): Physics3DContact {
  return {
    bodyA,
    bodyB,
    colliderA: 0,
    colliderB: 0,
    enabled: true,
    friction: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    pointCount: 1,
    points: [createContactPoint(1, 0.01)],
    restitution: 0,
    sensor: false,
    touching: true,
  };
}

function createUnitBox(world: Physics3DWorld): RigidBody3D {
  const body = createRigidBody3D();
  const mass = createPhysics3DMassData();
  computePhysics3DBoxMassData(0.5, 0.5, 0.5, 1, mass);
  setRigidBody3DMassData(body, mass);
  refreshRigidBody3DWorldInertia(body);
  addPhysics3DBody(world, body);
  return body;
}

// The solver reads the SOLVE ISLAND contact slices rather than `world.contacts`, so a world assembled
// by hand needs the same workspace `stepPhysics3D` builds before it reaches the solver. Without it every
// prepare finds nothing to do — which is the correct answer for a world with no awake islands, and the
// reason this is a factory step rather than something prepare rebuilds for itself.
//
// A test that changes what belongs in an island AFTER this — putting a body to sleep, disabling a
// contact, making a body static — has to call it again, exactly as a real step rebuilds every step.
function buildSolveWorkspace(world: Physics3DWorld): Physics3DWorld {
  updatePhysics3DSleep(world, 1 / 60);
  buildPhysics3DSolveIslands(world);
  return world;
}

// One dynamic box whose single contact point references a body that is not in the world's contact
// partner slot — used for the basis and mass-denominator tests, where only body A matters.
function createFallingBoxWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  const box = createUnitBox(world);
  const other = createUnitBox(world);
  world.contacts.push(createContact(box.index, other.index));
  return buildSolveWorkspace(world);
}

// Two unit boxes with REAL colliders, overlapping vertically by `depth`, with contacts generated the
// way a step generates them. The position pass reads geometry, so this is the only fixture shape its
// tests can be written against.
function createOverlappingBoxWorld(depth: number): Physics3DWorld {
  const world = createPhysics3DWorld();
  const upper = createUnitBox(world);
  const lower = createUnitBox(world);
  setPhysics3DBodyType(lower, 'static');
  for (const body of [upper, lower]) {
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 }),
    );
  }
  upper.y = 1 - depth;
  buildPhysics3DContacts(world);
  return buildSolveWorkspace(world);
}

function createBoxOnGroundWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  const box = createUnitBox(world);
  const ground = createUnitBox(world);
  setPhysics3DBodyType(ground, 'static');
  world.contacts.push(createContact(box.index, ground.index));
  return buildSolveWorkspace(world);
}

function createTwoDynamicBodyWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  const upper = createUnitBox(world);
  const lower = createUnitBox(world);
  world.contacts.push(createContact(upper.index, lower.index));
  return buildSolveWorkspace(world);
}
