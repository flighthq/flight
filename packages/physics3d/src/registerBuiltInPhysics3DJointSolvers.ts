import type { Physics3DWorld } from '@flighthq/types/contract';

import { registerPhysics3DJointSolver } from './jointRegistry';
import {
  physics3DBallAndSocketJointSolver,
  physics3DConeTwistJointSolver,
  physics3DFixedJointSolver,
  physics3DGeneric6DofJointSolver,
  physics3DHingeJointSolver,
  physics3DSliderJointSolver,
  Physics3DBallAndSocketJointKind,
  Physics3DConeTwistJointKind,
  Physics3DFixedJointKind,
  Physics3DGeneric6DofJointKind,
  Physics3DHingeJointKind,
  Physics3DSliderJointKind,
} from './joints';

// Installs the complete built-in joint bank into one world. Kept as an explicit assembly rather than as part
// of `createPhysics3DWorld`: importing or constructing a world still links no constraint math, and a caller
// may register only the kinds it uses. Importing this function opts into all six at once.
export function registerBuiltInPhysics3DJointSolvers(world: Physics3DWorld): void {
  registerPhysics3DJointSolver(world, Physics3DBallAndSocketJointKind, physics3DBallAndSocketJointSolver);
  registerPhysics3DJointSolver(world, Physics3DConeTwistJointKind, physics3DConeTwistJointSolver);
  registerPhysics3DJointSolver(world, Physics3DFixedJointKind, physics3DFixedJointSolver);
  registerPhysics3DJointSolver(world, Physics3DGeneric6DofJointKind, physics3DGeneric6DofJointSolver);
  registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);
  registerPhysics3DJointSolver(world, Physics3DSliderJointKind, physics3DSliderJointSolver);
}
