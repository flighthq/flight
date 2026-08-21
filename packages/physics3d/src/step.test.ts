import {
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { Physics3DContact, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildPhysics3DContacts } from './contactIntake';
import { refreshRigidBody3DWorldInertia } from './integrate';
import { createPhysics3DFixedJoint, createPhysics3DHingeJoint } from './jointFactories';
import { addPhysics3DJoint, removePhysics3DJoint } from './jointRegistry';
import { createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import { setPhysics3DStepGuard, stepPhysics3D, stepPhysics3DInterval } from './step';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  applyPhysics3DForce,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
  removePhysics3DBody,
  setPhysics3DBodyType,
} from './world';

// Contact generation dispatches through the collision registries, so a world whose supports were never
// registered detects nothing at all — see `explainPhysics3DCollision`.
beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

describe('setPhysics3DStepGuard', () => {
  it('is consulted only when the step declines, and only while installed', () => {
    const seen: number[] = [];
    setPhysics3DStepGuard((_world, dt) => seen.push(dt));
    try {
      const world = createPhysics3DWorld();
      addPhysics3DBody(world, createRigidBody3D('dynamic'));

      // A step that runs must not reach the seam: the guard's message means the simulation stopped, so
      // firing it on a healthy step would make the one signal it carries meaningless.
      stepPhysics3D(world, 1 / 60);
      expect(seen).toEqual([]);

      stepPhysics3D(world, 0);
      expect(seen).toEqual([0]);

      setPhysics3DStepGuard(null);
      stepPhysics3D(world, 0);
      expect(seen).toEqual([0]);
    } finally {
      setPhysics3DStepGuard(null);
    }
  });
});

describe('stepPhysics3D', () => {
  it('advances a free body by gravity over the interval', () => {
    const world = createTestWorld();
    const body = addUnitBody(world);

    stepPhysics3D(world, 1 / 60);

    expect(body.velocityY).toBeCloseTo(world.gravityY / 60, 12);
    expect(body.y).toBeCloseTo((world.gravityY / 60) * (1 / 60), 12);
  });

  it('refuses to run inside itself', () => {
    const world = createTestWorld();
    const ground = addUnitBody(world);
    addRestingContact(world, addUnitBody(world), ground);
    world.contactHooks.preSolve = (inner) => stepPhysics3D(inner, 1 / 60);

    expect(() => stepPhysics3D(world, 1 / 60)).toThrow(/recursively/);
  });

  it('declines silently rather than throwing on an unusable timestep', () => {
    const world = createTestWorld();
    const body = addUnitBody(world);

    expect(() => stepPhysics3D(world, 0)).not.toThrow();
    expect(() => stepPhysics3D(world, Number.NaN)).not.toThrow();
    expect(body.velocityY).toBe(0);
    expect(body.y).toBe(0);
  });

  it('declines on a body carrying a non-finite field', () => {
    const world = createTestWorld();
    const body = addUnitBody(world);
    const other = addUnitBody(world);
    other.velocityX = Number.POSITIVE_INFINITY;

    stepPhysics3D(world, 1 / 60);

    // One invalid body stops the whole step, because a NaN reaches every constraint its body touches.
    expect(body.velocityY).toBe(0);
  });

  it('declines before an invalid collider can generate a poisoned contact', () => {
    const world = createTestWorld();
    const body = addUnitBody(world);
    const collider = createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 1 });
    addPhysics3DCollider(world, body, collider);
    collider.material.friction = Number.NaN;

    stepPhysics3D(world, 1 / 60);

    expect(body.velocityY).toBe(0);
    expect(world.contacts).toHaveLength(0);
  });

  it('declines when substeps would advance nothing', () => {
    const world = createTestWorld();
    const body = addUnitBody(world);
    world.config.substeps = 0;

    stepPhysics3D(world, 1 / 60);

    expect(body.velocityY).toBe(0);
  });

  it('clears the force accumulators so a force applied once acts once', () => {
    const world = createTestWorld();
    world.gravityY = 0;
    const body = addUnitBody(world);
    applyPhysics3DForce(body, 10, 0, 0);

    stepPhysics3D(world, 1 / 60);
    const afterOne = body.velocityX;
    stepPhysics3D(world, 1 / 60);

    expect(afterOne).toBeCloseTo(10 / 60, 12);
    expect(body.velocityX).toBeCloseTo(afterOne, 12);
  });

  it('records the SUB-interval as the previous timestep, not the whole step', () => {
    const world = createTestWorld();
    addUnitBody(world);
    world.config.substeps = 4;

    stepPhysics3D(world, 1 / 60);

    // The warm-start cache is built by a sub-interval's iterations, so scaling it next step has to compare
    // against that interval. Recording the whole step would rescale by the substep count.
    expect(world.previousTimestep).toBeCloseTo(1 / 240, 12);
  });

  it('integrates more accurately with more substeps over the same interval', () => {
    const coarse = createTestWorld();
    const coarseBody = addUnitBody(coarse);
    stepPhysics3D(coarse, 1 / 60);

    const fine = createTestWorld();
    fine.config.substeps = 8;
    const fineBody = addUnitBody(fine);
    stepPhysics3D(fine, 1 / 60);

    // Both reach the same velocity — constant acceleration over the same total time — but the finer
    // division tracks the exact 0.5*g*t^2 displacement more closely.
    const exact = 0.5 * fine.gravityY * (1 / 60) * (1 / 60);
    expect(fineBody.velocityY).toBeCloseTo(coarseBody.velocityY, 12);
    expect(Math.abs(fineBody.y - exact)).toBeLessThan(Math.abs(coarseBody.y - exact));
  });

  it('resolves a generated contact so a falling body does not pass through the ground', () => {
    const world = createTestWorld();
    const ground = addUnitBody(world);
    setPhysics3DBodyType(ground, 'static');
    refreshRigidBody3DWorldInertia(ground);
    const box = addUnitBody(world);
    box.velocityY = -10;
    addRestingContact(world, box, ground);

    stepPhysics3D(world, 1 / 60);

    expect(box.velocityY).toBeGreaterThan(-1e-6);
  });

  it('holds two bodies together through a joint across many steps', () => {
    const world = createTestWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const anchor = addUnitBody(world);
    setPhysics3DBodyType(anchor, 'static');
    refreshRigidBody3DWorldInertia(anchor);
    const hanging = addUnitBody(world);
    hanging.x = 1;
    addPhysics3DJoint(
      world,
      createPhysics3DFixedJoint({ bodyA: anchor.index, bodyB: hanging.index, localAnchorBX: -1 }),
    );

    for (let i = 0; i < 120; i += 1) stepPhysics3D(world, 1 / 60);

    // Gravity pulls for two seconds; without the joint the body would be roughly 20 units down.
    expect(Math.abs(hanging.y)).toBeLessThan(0.05);
    expect(hanging.x).toBeCloseTo(1, 1);
  });

  it('lets a hinge motor drive a body it is anchored to', () => {
    const world = createTestWorld();
    world.gravityY = 0;
    registerBuiltInPhysics3DJointSolvers(world);
    const anchor = addUnitBody(world);
    setPhysics3DBodyType(anchor, 'static');
    refreshRigidBody3DWorldInertia(anchor);
    const arm = addUnitBody(world);
    addPhysics3DJoint(
      world,
      createPhysics3DHingeJoint({
        bodyA: anchor.index,
        bodyB: arm.index,
        enableMotor: true,
        motorSpeed: 2,
        maxMotorTorque: 1000,
      }),
    );

    for (let i = 0; i < 30; i += 1) stepPhysics3D(world, 1 / 60);

    expect(arm.angularVelocityX).toBeCloseTo(2, 4);
  });

  it('stops integrating a settled island, even under gravity', () => {
    const world = createTestWorld();
    world.gravityY = 0;
    const body = addUnitBody(world);
    for (let i = 0; i < 60; i += 1) stepPhysics3D(world, 1 / 60);
    expect(body.sleeping).toBe(true);

    const restingY = body.y;
    world.gravityY = -10;
    stepPhysics3D(world, 1 / 60);

    // The whole point of the sleeping skip: a settled pile costs no integration, so gravity cannot
    // accelerate it and it does not drift.
    expect(body.y).toBe(restingY);
    expect(body.velocityY).toBe(0);
    expect(body.sleeping).toBe(true);
  });

  it('wakes a sleeping body the caller writes a velocity onto', () => {
    const world = createTestWorld();
    world.gravityY = 0;
    const body = addUnitBody(world);
    for (let i = 0; i < 60; i += 1) stepPhysics3D(world, 1 / 60);
    expect(body.sleeping).toBe(true);

    body.velocityY = 5;
    stepPhysics3D(world, 1 / 60);

    // Stillness is re-read from the CURRENT velocities at the top of every step, so writing one is enough
    // to wake the island — a caller does not have to remember `wakePhysics3DBody` as well.
    expect(body.sleeping).toBe(false);
    expect(body.y).toBeCloseTo(5 / 60, 12);
  });

  it('lets a pre-solve hook disable a contact for the step', () => {
    const world = createTestWorld();
    const ground = addUnitBody(world);
    setPhysics3DBodyType(ground, 'static');
    refreshRigidBody3DWorldInertia(ground);
    const box = addUnitBody(world);
    box.velocityY = -10;
    addRestingContact(world, box, ground);
    world.contactHooks.preSolve = (_inner, contact) => {
      contact.enabled = false;
    };

    stepPhysics3D(world, 1 / 60);

    expect(box.velocityY).toBeLessThan(-9);
  });

  it('runs the post-solve hook once the step has committed', () => {
    const world = createTestWorld();
    const ground = addUnitBody(world);
    setPhysics3DBodyType(ground, 'static');
    refreshRigidBody3DWorldInertia(ground);
    const box = addUnitBody(world);
    box.velocityY = -10;
    addRestingContact(world, box, ground);
    let observed = Number.NaN;
    world.contactHooks.postSolve = () => {
      observed = box.velocityY;
    };

    stepPhysics3D(world, 1 / 60);

    expect(observed).toBeCloseTo(box.velocityY, 12);
  });

  it('rejects a lifecycle mutation attempted from inside a hook', () => {
    const world = createTestWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const ground = addUnitBody(world);
    const box = addUnitBody(world);
    addRestingContact(world, box, ground);
    // `collideConnected` matters here: a joint suppresses its own pair's contact by default, and this test
    // needs BOTH a joint to remove and a contact for the hook to run over.
    const joint = addPhysics3DJoint(
      world,
      createPhysics3DFixedJoint({ bodyA: ground.index, bodyB: box.index, collideConnected: true }),
    );
    world.contactHooks.preSolve = (inner) => removePhysics3DJoint(inner, joint);

    expect(() => stepPhysics3D(world, 1 / 60)).toThrow(/stepping/);
  });

  it('restores the fields a throwing hook touched before the failure propagates', () => {
    const world = createTestWorld();
    const ground = addUnitBody(world);
    const box = addUnitBody(world);
    const contact = addRestingContact(world, box, ground, 0.5);
    world.contactHooks.preSolve = (_inner, edited) => {
      edited.friction = 9;
      throw new Error('hook failed');
    };

    expect(() => stepPhysics3D(world, 1 / 60)).toThrow(/hook failed/);
    // Not exact: the pair's friction is the geometric mean of the two materials', and sqrt(0.5)*sqrt(0.5)
    // lands one ulp off.
    expect(contact.friction).toBeCloseTo(0.5, 12);
    expect(ground.index).toBe(0);
  });

  it('rejects a hook that leaves a contact the step cannot use', () => {
    const world = createTestWorld();
    const ground = addUnitBody(world);
    const contact = addRestingContact(world, addUnitBody(world), ground);
    world.contactHooks.preSolve = (_inner, edited) => {
      edited.friction = Number.NaN;
    };

    expect(() => stepPhysics3D(world, 1 / 60)).toThrow(/invalid contact state/);
    expect(contact.friction).toBe(0);
  });

  it('clears the stepping flag after a hook throws, so the next step still runs', () => {
    const world = createTestWorld();
    const body = addUnitBody(world);
    addRestingContact(world, addUnitBody(world), body);
    world.contactHooks.preSolve = () => {
      throw new Error('hook failed');
    };

    expect(() => stepPhysics3D(world, 1 / 60)).toThrow();
    world.contactHooks.preSolve = null;

    expect(() => stepPhysics3D(world, 1 / 60)).not.toThrow();
    expect(body.velocityY).toBeLessThan(0);
  });

  it('survives a body removed while a joint still names it', () => {
    const world = createTestWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const anchor = addUnitBody(world);
    const hanging = addUnitBody(world);
    addPhysics3DJoint(world, createPhysics3DFixedJoint({ bodyA: anchor.index, bodyB: hanging.index }));
    removePhysics3DBody(world, hanging);

    expect(() => stepPhysics3D(world, 1 / 60)).not.toThrow();
    expect(Number.isFinite(anchor.y)).toBe(true);
  });
});

describe('stepPhysics3DInterval', () => {
  it('advances one sub-interval without touching the force accumulators', () => {
    const world = createTestWorld();
    const body = addUnitBody(world);
    applyPhysics3DForce(body, 6, 0, 0);
    // The island workspace is built by the step; a caller assembling its own loop builds it too.
    stepPhysics3D(world, 1 / 60);
    applyPhysics3DForce(body, 6, 0, 0);
    const before = body.velocityX;

    stepPhysics3DInterval(world, 1 / 60);

    // The force is still there afterwards, because clearing it belongs to the step and not to the
    // interval — a substep loop that cleared forces would apply them once and then integrate zeros.
    expect(body.velocityX).toBeCloseTo(before + 6 / 60, 12);
    expect(body.forceX).toBe(6);
  });
});

// A resting contact between `box` and `ground`, with the normal oriented from the geometry rather than
// assumed.
//
// The normal points so that resolving pushes A out of B — and A is whichever body holds the LOWER INDEX,
// which the caller does not choose. Writing `normalY = 1` because "the ground is below" is right only when
// the box happens to have been added first; the other way round it pushes the GROUND up out of the box,
// which for a static ground is a no-op and reads as a solver that silently ignores the contact.
// Puts real geometry on both bodies, overlapping slightly, and lets the step's own intake generate the
// contact between them.
//
// Pushing a hand-built contact onto `world.contacts` USED to work here and must not be reintroduced:
// contact lifetime belongs to intake, which retires every contact it does not re-find. A supplied one is
// deleted by the very step it was meant to affect, and the hook under test never sees it.
function addRestingContact(
  world: Physics3DWorld,
  box: RigidBody3D,
  ground: RigidBody3D,
  friction = 0,
): Physics3DContact {
  // A unit box spans half a unit either side of its centre, so this leaves the two overlapping by 0.01 —
  // the same shallow resting penetration the hand-built fixture used to assert.
  ground.y = box.y - 0.99;
  attachUnitBoxCollider(world, box, friction);
  attachUnitBoxCollider(world, ground, friction);
  buildPhysics3DContacts(world);
  return world.contacts[0];
}

// Gives a body a unit box and then puts the UNIT mass properties back.
//
// The restore is the load-bearing half. Mass is derived from geometry, and a unit box of density 1 has
// mass 1 but inertia 1/6 — so leaving the derived tensor in place would move every angular expectation in
// this file for a reason that has nothing to do with what those tests check.
function attachUnitBoxCollider(world: Physics3DWorld, body: RigidBody3D, friction: number): void {
  addPhysics3DCollider(
    world,
    body,
    createPhysics3DCollider(
      { kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 },
      {
        density: 1,
        friction,
        restitution: 0,
      },
    ),
  );
  const data = createPhysics3DMassData();
  data.mass = 1;
  data.inertiaXX = 1;
  data.inertiaYY = 1;
  data.inertiaZZ = 1;
  setRigidBody3DMassData(body, data);
  refreshRigidBody3DWorldInertia(body);
}

function addUnitBody(world: Physics3DWorld): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  const data = createPhysics3DMassData();
  data.mass = 1;
  data.inertiaXX = 1;
  data.inertiaYY = 1;
  data.inertiaZZ = 1;
  setRigidBody3DMassData(body, data);
  addPhysics3DBody(world, body);
  return body;
}

function createTestWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  world.gravityY = -10;
  return world;
}
