import type { Physics2DWorld } from '@flighthq/types/contract';

import { registerPhysics2DJointSolver } from './jointRegistry';
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
} from './joints';

// Installs Flight's complete built-in joint bank into one world. Kept as an explicit assembly rather
// than part of createPhysics2DWorld: importing or constructing a world still links no solver math, and
// a caller may register only the kinds it uses. Importing this function opts into all nine at once.
export function registerBuiltInPhysics2DJointSolvers(world: Physics2DWorld): void {
  registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
  registerPhysics2DJointSolver(world, Physics2DGearJointKind, physics2DGearJointSolver);
  registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
  registerPhysics2DJointSolver(world, Physics2DPrismaticJointKind, physics2DPrismaticJointSolver);
  registerPhysics2DJointSolver(world, Physics2DPulleyJointKind, physics2DPulleyJointSolver);
  registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
  registerPhysics2DJointSolver(world, Physics2DRopeJointKind, physics2DRopeJointSolver);
  registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
  registerPhysics2DJointSolver(world, Physics2DWheelJointKind, physics2DWheelJointSolver);
}
