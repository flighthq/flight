import type { Physics3DJointReaction, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics3DBallAndSocketJoint, createPhysics3DDistanceJoint } from './jointFactories';
import {
  accumulatePhysics3DJointRowReaction,
  clearPhysics3DJointReaction,
  createPhysics3DJointReaction,
  getPhysics3DJointReactionForce,
  getPhysics3DJointReactionTorque,
  initializePhysics3DJointReaction,
  writePhysics3DJointReaction,
} from './jointReaction';
import { addPhysics3DJoint } from './jointRegistry';
import { createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import { stepPhysics3D } from './step';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D } from './world';

describe('accumulatePhysics3DJointRowReaction', () => {
  it('reads a LINEAR row as pure force, with no torque at the anchor', () => {
    // The subtraction that makes the two readings independent. This row acts along +x through an anchor
    // offset in +y, so it exerts a real torque about the centre of mass — but none about the ANCHOR, and
    // a breakTorque must not fire on it.
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });
    joint.rBX = 0;
    joint.rBY = 2;
    joint.rBZ = 0;
    // direction +x, armB = rB x direction = (2,0,0) x ... = (0*0-0*0, 0*1-0*0, 0*0-2*1) = (0,0,-2)
    const state = [1, 0, 0, 0, 0, 0, 0, 0, -2];
    const out = createPhysics3DJointReaction();

    accumulatePhysics3DJointRowReaction(joint, state, 0, 5, out);

    expect(out.forceX).toBeCloseTo(5, 9);
    expect(getPhysics3DJointReactionTorque(out)).toBeCloseTo(0, 9);
  });

  it('reads a purely ANGULAR row as pure torque', () => {
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });
    joint.rBX = 3;
    joint.rBY = 1;
    joint.rBZ = -2;
    // A zero direction leaves the lever term zero however the anchor is placed.
    const state = [0, 0, 0, 0, 1, 0, 0, 1, 0];
    const out = createPhysics3DJointReaction();

    accumulatePhysics3DJointRowReaction(joint, state, 0, 4, out);

    expect(getPhysics3DJointReactionForce(out)).toBeCloseTo(0, 9);
    expect(out.torqueY).toBeCloseTo(4, 9);
  });

  it('adds rather than overwrites, so several rows sum into one reaction', () => {
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });
    const out = createPhysics3DJointReaction();
    const state = [1, 0, 0, 0, 0, 0, 0, 0, 0];

    accumulatePhysics3DJointRowReaction(joint, state, 0, 2, out);
    accumulatePhysics3DJointRowReaction(joint, state, 0, 3, out);

    expect(out.forceX).toBeCloseTo(5, 9);
  });

  it('ignores a zero impulse', () => {
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });
    const out = createPhysics3DJointReaction();
    out.forceX = 9;

    accumulatePhysics3DJointRowReaction(joint, [1, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0, out);

    expect(out.forceX).toBe(9);
  });
});

describe('clearPhysics3DJointReaction', () => {
  it('zeroes every component', () => {
    const out = createPhysics3DJointReaction();
    out.forceX = 1;
    out.torqueZ = 2;

    clearPhysics3DJointReaction(out);

    expect(out).toMatchObject({ forceX: 0, forceY: 0, forceZ: 0, torqueX: 0, torqueY: 0, torqueZ: 0 });
  });
});

describe('createPhysics3DJointReaction', () => {
  it('starts zeroed', () => {
    expect(createPhysics3DJointReaction()).toMatchObject({
      forceX: 0,
      forceY: 0,
      forceZ: 0,
      torqueX: 0,
      torqueY: 0,
      torqueZ: 0,
    });
  });
});

describe('getPhysics3DJointReactionForce', () => {
  it('is the magnitude of the force triple', () => {
    const out = createPhysics3DJointReaction();
    out.forceX = 3;
    out.forceY = 4;

    expect(getPhysics3DJointReactionForce(out)).toBeCloseTo(5, 9);
  });
});

describe('getPhysics3DJointReactionTorque', () => {
  it('is the magnitude of the torque triple', () => {
    const out = createPhysics3DJointReaction();
    out.torqueY = 6;
    out.torqueZ = 8;

    expect(getPhysics3DJointReactionTorque(out)).toBeCloseTo(10, 9);
  });
});

describe('initializePhysics3DJointReaction', () => {
  it('is the construction initializer of createPhysics3DJointReaction', () => {
    expect(typeof initializePhysics3DJointReaction).toBe('function');
  });
});

interface HangingScene {
  world: Physics3DWorld;
  joint: ReturnType<typeof createPhysics3DBallAndSocketJoint>;
}

// One body hanging from a static anchor by a ball-and-socket, which is the simplest arrangement whose
// reaction has a value known without reference to the solver: it is the hanging weight.
function createHangingScene(mass: number, gravity: number): HangingScene {
  const world = createPhysics3DWorld();
  world.gravityY = -gravity;
  registerBuiltInPhysics3DJointSolvers(world);
  const anchor = createRigidBody3D('static');
  addPhysics3DBody(world, anchor);
  const hanging = createUnitBody(mass);
  addPhysics3DBody(world, hanging);
  const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });
  addPhysics3DJoint(world, joint);
  return { world, joint };
}

function createUnitBody(mass: number): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  const data = createPhysics3DMassData();
  data.mass = mass;
  data.inertiaXX = mass;
  data.inertiaYY = mass;
  data.inertiaZZ = mass;
  setRigidBody3DMassData(body, data);
  return body;
}
describe('writePhysics3DJointReaction', () => {
  it('MEASURES THE WEIGHT A JOINT IS HOLDING UP', () => {
    // The reading that makes the API worth having, checked against a number derived from outside the
    // solver: a 3 kg body hanging under gravity 10 loads its joint with 30 newtons and nothing else.
    const scene = createHangingScene(3, 10);

    stepPhysics3D(scene.world, 1 / 60);

    const out = createPhysics3DJointReaction();
    expect(writePhysics3DJointReaction(scene.world, scene.joint, 1 / 60, out)).toBe(true);
    expect(getPhysics3DJointReactionForce(out)).toBeCloseTo(30, 0);
  });

  it('scales with the hanging mass', () => {
    const light = createHangingScene(1, 10);
    const heavy = createHangingScene(4, 10);
    stepPhysics3D(light.world, 1 / 60);
    stepPhysics3D(heavy.world, 1 / 60);

    const out = createPhysics3DJointReaction();
    writePhysics3DJointReaction(light.world, light.joint, 1 / 60, out);
    const lightForce = getPhysics3DJointReactionForce(out);
    writePhysics3DJointReaction(heavy.world, heavy.joint, 1 / 60, out);

    expect(getPhysics3DJointReactionForce(out) / lightForce).toBeCloseTo(4, 0);
  });

  it('reports a FORCE, so the reading does not move with the timestep', () => {
    // The reason this divides by dt at all. An impulse would read twice as large at half the rate, and a
    // breakForce tuned at 60Hz would behave differently at 120.
    const coarse = createHangingScene(3, 10);
    const fine = createHangingScene(3, 10);
    stepPhysics3D(coarse.world, 1 / 60);
    stepPhysics3D(fine.world, 1 / 120);

    const out = createPhysics3DJointReaction();
    writePhysics3DJointReaction(coarse.world, coarse.joint, 1 / 60, out);
    const coarseForce = getPhysics3DJointReactionForce(out);
    writePhysics3DJointReaction(fine.world, fine.joint, 1 / 120, out);

    expect(getPhysics3DJointReactionForce(out)).toBeCloseTo(coarseForce, 0);
  });

  it('declines a joint whose kind has no registered solver', () => {
    const scene = createHangingScene(3, 10);
    scene.world.jointSolvers.clear();
    const out = createPhysics3DJointReaction();

    expect(writePhysics3DJointReaction(scene.world, scene.joint, 1 / 60, out)).toBe(false);
    expect(getPhysics3DJointReactionForce(out)).toBe(0);
  });

  it('declines a joint that has not been solved yet', () => {
    const scene = createHangingScene(3, 10);
    const out = createPhysics3DJointReaction();

    expect(writePhysics3DJointReaction(scene.world, scene.joint, 1 / 60, out)).toBe(false);
  });

  it('declines a non-positive timestep rather than dividing by it', () => {
    const scene = createHangingScene(3, 10);
    stepPhysics3D(scene.world, 1 / 60);
    const out = createPhysics3DJointReaction();

    expect(writePhysics3DJointReaction(scene.world, scene.joint, 0, out)).toBe(false);
    expect(Number.isFinite(getPhysics3DJointReactionForce(out))).toBe(true);
  });

  it('reads a DISTANCE joint, whose one slot is an axial scalar rather than a world triple', () => {
    // The kind that proves the reaction has to be the solver's to report: reading `impulse0..2` off this
    // one generically would take a scalar along an axis for an x component.
    const world = createPhysics3DWorld();
    world.gravityY = -10;
    registerBuiltInPhysics3DJointSolvers(world);
    const anchor = createRigidBody3D('static');
    addPhysics3DBody(world, anchor);
    const hanging = createUnitBody(2);
    hanging.y = -3;
    addPhysics3DBody(world, hanging);
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 3 });
    addPhysics3DJoint(world, joint);

    stepPhysics3D(world, 1 / 60);

    const out = createPhysics3DJointReaction();
    expect(writePhysics3DJointReaction(world, joint, 1 / 60, out)).toBe(true);
    // The rope hangs straight down, so the load is along y and nowhere else.
    expect(getPhysics3DJointReactionForce(out)).toBeCloseTo(20, 0);
    expect(Math.abs(out.forceY)).toBeCloseTo(20, 0);
  });
});
