import { describe, expect, it } from 'vitest';

import { getPhysics3DJointSolver } from './jointRegistry';
import {
  physics3DBallAndSocketJointSolver,
  physics3DConeTwistJointSolver,
  physics3DDistanceJointSolver,
  physics3DFixedJointSolver,
  physics3DGeneric6DofJointSolver,
  physics3DHingeJointSolver,
  physics3DSliderJointSolver,
  Physics3DBallAndSocketJointKind,
  Physics3DConeTwistJointKind,
  Physics3DDistanceJointKind,
  Physics3DFixedJointKind,
  Physics3DGeneric6DofJointKind,
  Physics3DHingeJointKind,
  Physics3DSliderJointKind,
} from './joints';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import { createPhysics3DWorld } from './world';

describe('registerBuiltInPhysics3DJointSolvers', () => {
  it('binds every built-in kind to its own solver', () => {
    const world = createPhysics3DWorld();

    registerBuiltInPhysics3DJointSolvers(world);

    expect(getPhysics3DJointSolver(world, Physics3DBallAndSocketJointKind)).toBe(physics3DBallAndSocketJointSolver);
    expect(getPhysics3DJointSolver(world, Physics3DConeTwistJointKind)).toBe(physics3DConeTwistJointSolver);
    expect(getPhysics3DJointSolver(world, Physics3DDistanceJointKind)).toBe(physics3DDistanceJointSolver);
    expect(getPhysics3DJointSolver(world, Physics3DFixedJointKind)).toBe(physics3DFixedJointSolver);
    expect(getPhysics3DJointSolver(world, Physics3DGeneric6DofJointKind)).toBe(physics3DGeneric6DofJointSolver);
    expect(getPhysics3DJointSolver(world, Physics3DHingeJointKind)).toBe(physics3DHingeJointSolver);
    expect(getPhysics3DJointSolver(world, Physics3DSliderJointKind)).toBe(physics3DSliderJointSolver);
  });

  it('registers the whole bank and nothing else', () => {
    const world = createPhysics3DWorld();

    registerBuiltInPhysics3DJointSolvers(world);

    expect(world.jointSolvers.size).toBe(7);
  });

  it('leaves a world that never calls it with no solvers at all', () => {
    // Registration is explicit rather than part of world construction, so constructing a world links no
    // constraint math and a caller may register only the kinds it uses.
    expect(createPhysics3DWorld().jointSolvers.size).toBe(0);
  });
});
