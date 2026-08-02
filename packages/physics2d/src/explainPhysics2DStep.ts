import type { Physics2DStepExplanation, Physics2DWorld } from '@flighthq/types/contract';

// Pure diagnostic twin of stepPhysics2D's early return. Invalid input rejects the whole step rather than
// integrating only the phases that happen to tolerate it: a partial step would be harder to recover from
// than a no-op and could poison persistent contacts or body state before the invalid loop count is read.
export function explainPhysics2DStep(world: Readonly<Physics2DWorld>, dt: number): Physics2DStepExplanation {
  const timestepValid = Number.isFinite(dt) && dt > 0;
  const velocityIterationsValid =
    Number.isSafeInteger(world.config.velocityIterations) && world.config.velocityIterations >= 0;
  const positionIterationsValid =
    Number.isSafeInteger(world.config.positionIterations) && world.config.positionIterations >= 0;
  return {
    timestepValid,
    velocityIterationsValid,
    positionIterationsValid,
    status: timestepValid && velocityIterationsValid && positionIterationsValid ? 'ready' : 'invalid-step',
  };
}
