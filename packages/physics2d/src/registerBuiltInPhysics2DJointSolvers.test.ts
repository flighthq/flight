import { describe, expect, it } from 'vitest';

import { createPhysics2DDistanceJoint } from './jointFactories.ts';
import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry.ts';
import {
  Physics2DDistanceJointKind,
  Physics2DGearJointKind,
  Physics2DMouseJointKind,
  Physics2DPrismaticJointKind,
  Physics2DPulleyJointKind,
  Physics2DRevoluteJointKind,
  Physics2DRopeJointKind,
  Physics2DWeldJointKind,
  Physics2DWheelJointKind,
  physics2DDistanceJointSolver,
  physics2DGearJointSolver,
  physics2DMouseJointSolver,
  physics2DPrismaticJointSolver,
  physics2DPulleyJointSolver,
  physics2DRevoluteJointSolver,
  physics2DRopeJointSolver,
  physics2DWeldJointSolver,
  physics2DWheelJointSolver,
} from './joints.ts';
import { registerBuiltInPhysics2DJointSolvers } from './registerBuiltInPhysics2DJointSolvers.ts';
import { addPhysics2DBody, createPhysics2DWorld, createRigidBody2D } from './world.ts';

describe('registerBuiltInPhysics2DJointSolvers', () => {
  it('installs the complete built-in bank under its public kinds', () => {
    const world = createPhysics2DWorld();

    registerBuiltInPhysics2DJointSolvers(world);

    for (const [kind, solver] of [
      [Physics2DDistanceJointKind, physics2DDistanceJointSolver],
      [Physics2DGearJointKind, physics2DGearJointSolver],
      [Physics2DMouseJointKind, physics2DMouseJointSolver],
      [Physics2DPrismaticJointKind, physics2DPrismaticJointSolver],
      [Physics2DPulleyJointKind, physics2DPulleyJointSolver],
      [Physics2DRevoluteJointKind, physics2DRevoluteJointSolver],
      [Physics2DRopeJointKind, physics2DRopeJointSolver],
      [Physics2DWeldJointKind, physics2DWeldJointSolver],
      [Physics2DWheelJointKind, physics2DWheelJointSolver],
    ] as const) {
      expect(world.jointSolvers.get(kind), kind).toBe(solver);
    }
  });

  it('preserves vendor registrations and restores built-ins on repeat calls', () => {
    const world = createPhysics2DWorld();
    const custom = { prepare: () => {}, solve: () => {} };
    registerPhysics2DJointSolver(world, 'acme.Conveyor', custom);
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, custom);

    registerBuiltInPhysics2DJointSolvers(world);
    registerBuiltInPhysics2DJointSolvers(world);

    expect(world.jointSolvers.get('acme.Conveyor')).toBe(custom);
    expect(world.jointSolvers.get(Physics2DDistanceJointKind)).toBe(physics2DDistanceJointSolver);
    const builtIns = createPhysics2DWorld();
    registerBuiltInPhysics2DJointSolvers(builtIns);
    expect(world.jointSolvers.size).toBe(builtIns.jointSolvers.size + 1);
  });

  it('activates factory-created joints that were loaded before the bank', () => {
    const world = createPhysics2DWorld();
    const first = addPhysics2DBody(world, createRigidBody2D('dynamic', 0, 0));
    const second = addPhysics2DBody(world, createRigidBody2D('dynamic', 1, 0));
    first.sleeping = true;
    second.sleeping = true;
    addPhysics2DJoint(world, createPhysics2DDistanceJoint({ bodyA: first.index, bodyB: second.index, length: 1 }));

    registerBuiltInPhysics2DJointSolvers(world);

    expect(first.sleeping).toBe(false);
    expect(second.sleeping).toBe(false);
  });
});
