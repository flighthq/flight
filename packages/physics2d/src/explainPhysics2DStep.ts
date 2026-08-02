import type { Physics2DStepExplanation, Physics2DWorld } from '@flighthq/types/contract';

import {
  isPhysics2DBodyStateValid,
  isPhysics2DContactStateValid,
  isPhysics2DGravityValid,
  isPhysics2DJointStateValid,
  isPhysics2DPreviousTimestepValid,
  isPhysics2DSolverConfigValid,
  isPhysics2DTimestepValid,
} from './stepValidation';

// Pure diagnostic twin of stepPhysics2D's early return. Invalid input rejects the whole step rather than
// integrating only the phases that happen to tolerate it: a partial step would be harder to recover from
// than a no-op and could poison persistent contacts or body state before the invalid loop count is read.
export function explainPhysics2DStep(world: Readonly<Physics2DWorld>, dt: number): Physics2DStepExplanation {
  const bodyStateValid = isPhysics2DBodyStateValid(world);
  const contactStateValid = isPhysics2DContactStateValid(world);
  const gravityValid = isPhysics2DGravityValid(world);
  const jointStateValid = isPhysics2DJointStateValid(world);
  const previousTimestepValid = isPhysics2DPreviousTimestepValid(world);
  const solverConfigValid = isPhysics2DSolverConfigValid(world.config);
  const timestepValid = isPhysics2DTimestepValid(dt);
  const velocityIterationsValid =
    Number.isSafeInteger(world.config.velocityIterations) && world.config.velocityIterations >= 0;
  const positionIterationsValid =
    Number.isSafeInteger(world.config.positionIterations) && world.config.positionIterations >= 0;
  const ready =
    bodyStateValid &&
    contactStateValid &&
    gravityValid &&
    jointStateValid &&
    previousTimestepValid &&
    solverConfigValid &&
    timestepValid &&
    velocityIterationsValid &&
    positionIterationsValid;
  return {
    bodyStateValid,
    contactStateValid,
    gravityValid,
    jointStateValid,
    timestepValid,
    velocityIterationsValid,
    positionIterationsValid,
    previousTimestepValid,
    solverConfigValid,
    status: ready ? 'ready' : 'invalid-step',
  };
}
