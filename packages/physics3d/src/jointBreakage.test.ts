import type { Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { breakPhysics3DJoint, evaluatePhysics3DJointBreakage, isPhysics3DJointBreakable } from './jointBreakage';
import { createPhysics3DBallAndSocketJoint } from './jointFactories';
import { addPhysics3DJoint } from './jointRegistry';
import { createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import { stepPhysics3D } from './step';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D } from './world';

describe('breakPhysics3DJoint', () => {
  it('marks the joint and records the break', () => {
    const scene = createHangingScene(3, 10, Number.POSITIVE_INFINITY);

    breakPhysics3DJoint(scene.world, scene.joint);

    expect(scene.joint.broken).toBe(true);
    expect(scene.world.jointEvents.broke).toContain(scene.joint);
  });

  it('reports a break ONCE, however many times it is asked', () => {
    // The event list is a record of transitions, and a joint can only cross from whole to broken once.
    const scene = createHangingScene(3, 10, Number.POSITIVE_INFINITY);

    breakPhysics3DJoint(scene.world, scene.joint);
    breakPhysics3DJoint(scene.world, scene.joint);

    expect(scene.world.jointEvents.broke).toHaveLength(1);
  });

  it('leaves the joint in the world for the caller to deal with', () => {
    // Breaking is not removal. What a break MEANS — debris, a callback, a respawn — is the caller's, and
    // a joint that deleted itself would leave nothing to inspect.
    const scene = createHangingScene(3, 10, Number.POSITIVE_INFINITY);

    breakPhysics3DJoint(scene.world, scene.joint);

    expect(scene.world.joints).toContain(scene.joint);
  });
});

describe('evaluatePhysics3DJointBreakage', () => {
  it('BREAKS A JOINT THE LOAD EXCEEDS, AND SPARES ONE IT DOES NOT', () => {
    // A 3 kg body under gravity 10 hangs 30 newtons off its joint. The pair of thresholds either side of
    // that is the whole claim, and testing both is what separates a working threshold from a joint that
    // breaks unconditionally.
    const weak = createHangingScene(3, 10, 20);
    const strong = createHangingScene(3, 10, 60);

    stepPhysics3D(weak.world, 1 / 60);
    stepPhysics3D(strong.world, 1 / 60);

    expect(weak.joint.broken).toBe(true);
    expect(strong.joint.broken).toBe(false);
  });

  it('stops constraining once broken, so the body falls free', () => {
    const scene = createHangingScene(3, 10, 20);

    for (let step = 0; step < 30; step += 1) stepPhysics3D(scene.world, 1 / 60);

    // Held, it would hang at its anchor; broken, gravity has it.
    expect(scene.body.y).toBeLessThan(-0.5);
  });

  it('reports the break through the world event lane', () => {
    const scene = createHangingScene(3, 10, 20);

    stepPhysics3D(scene.world, 1 / 60);

    expect(scene.world.jointEvents.broke).toContain(scene.joint);
  });

  it('clears the event lane on the NEXT step, so a break is reported once', () => {
    const scene = createHangingScene(3, 10, 20);

    stepPhysics3D(scene.world, 1 / 60);
    expect(scene.world.jointEvents.broke).toHaveLength(1);
    stepPhysics3D(scene.world, 1 / 60);

    expect(scene.world.jointEvents.broke).toHaveLength(0);
  });

  it('leaves an unbreakable joint alone whatever it carries', () => {
    const scene = createHangingScene(1000, 10, Number.POSITIVE_INFINITY);

    stepPhysics3D(scene.world, 1 / 60);

    expect(scene.joint.broken).toBe(false);
  });

  it('runs without a solved joint rather than throwing', () => {
    const scene = createHangingScene(3, 10, 20);

    evaluatePhysics3DJointBreakage(scene.world, 1 / 60);

    // No sub-interval has been solved, so there is no reaction to read and nothing may break on a guess.
    expect(scene.joint.broken).toBe(false);
  });
});

describe('isPhysics3DJointBreakable', () => {
  it('is false for the infinite defaults', () => {
    expect(isPhysics3DJointBreakable(createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }))).toBe(false);
  });

  it('is true once either threshold is finite', () => {
    expect(isPhysics3DJointBreakable(createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1, breakForce: 5 }))).toBe(
      true,
    );
    expect(isPhysics3DJointBreakable(createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1, breakTorque: 5 }))).toBe(
      true,
    );
  });
});

interface HangingScene {
  world: Physics3DWorld;
  body: RigidBody3D;
  joint: ReturnType<typeof createPhysics3DBallAndSocketJoint>;
}

function createHangingScene(mass: number, gravity: number, breakForce: number): HangingScene {
  const world = createPhysics3DWorld();
  world.gravityY = -gravity;
  registerBuiltInPhysics3DJointSolvers(world);
  const anchor = createRigidBody3D('static');
  addPhysics3DBody(world, anchor);

  const body = createRigidBody3D('dynamic');
  const data = createPhysics3DMassData();
  data.mass = mass;
  data.inertiaXX = mass;
  data.inertiaYY = mass;
  data.inertiaZZ = mass;
  setRigidBody3DMassData(body, data);
  addPhysics3DBody(world, body);

  const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1, breakForce });
  addPhysics3DJoint(world, joint);
  return { world, body, joint };
}
