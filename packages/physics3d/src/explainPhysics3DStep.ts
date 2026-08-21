import type { Physics3DStepExplanation, Physics3DWorld } from '@flighthq/types/contract';

import {
  isPhysics3DBodyStateValid,
  isPhysics3DColliderStateValid,
  isPhysics3DContactStateValid,
  isPhysics3DGravityValid,
  isPhysics3DJointStateValid,
  isPhysics3DPositionIterationsValid,
  isPhysics3DSolverConfigValid,
  isPhysics3DSubstepsValid,
  isPhysics3DTimestepValid,
  isPhysics3DVelocityIterationsValid,
} from './stepValidation';

// Why `stepPhysics3D(world, dt)` would advance nothing, as plain data.
//
// The step declines silently on any failed precondition, because a NaN velocity or a zero timestep is a
// state a caller reaches by writing a field and not a reason to take down a frame loop. This is the seam
// that makes that silence readable, and it is separately importable so a shipping build that never asks
// never links it.
//
// It asks the SAME predicates the step asks, in the same order, so the two cannot disagree about what
// "steppable" means. Every flag is reported rather than short-circuiting at the first false: a world with
// two faults would otherwise be repaired one frame at a time, each fix revealing the next.
//
// Pure — it reads the world as it stands and retains nothing. Calling it never changes whether the next
// step runs.
export function explainPhysics3DStep(world: Readonly<Physics3DWorld>, dt: number): Physics3DStepExplanation {
  const config = world.config;
  const bodyStateValid = isPhysics3DBodyStateValid(world);
  const colliderStateValid = isPhysics3DColliderStateValid(world);
  const contactStateValid = isPhysics3DContactStateValid(world);
  const gravityValid = isPhysics3DGravityValid(world);
  const jointStateValid = isPhysics3DJointStateValid(world);
  const solverConfigValid = isPhysics3DSolverConfigValid(config);
  const substepsValid = isPhysics3DSubstepsValid(config);
  const timestepValid = isPhysics3DTimestepValid(dt);
  const velocityIterationsValid = isPhysics3DVelocityIterationsValid(config);
  const positionIterationsValid = isPhysics3DPositionIterationsValid(config);

  const ready =
    bodyStateValid &&
    colliderStateValid &&
    contactStateValid &&
    gravityValid &&
    jointStateValid &&
    solverConfigValid &&
    substepsValid &&
    timestepValid &&
    velocityIterationsValid &&
    positionIterationsValid;

  return {
    bodyStateValid,
    colliderStateValid,
    contactStateValid,
    gravityValid,
    jointStateValid,
    solverConfigValid,
    substepsValid,
    timestepValid,
    velocityIterationsValid,
    positionIterationsValid,
    status: ready ? 'ready' : 'invalid-step',
  };
}
