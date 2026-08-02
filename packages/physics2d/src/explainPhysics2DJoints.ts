import type {
  Physics2DJointResolution,
  Physics2DJointResolutionExplanation,
  Physics2DJointResolutionStatus,
  Physics2DWorld,
} from '@flighthq/types/contract';

import { findPhysics2DBody } from './world';

// Pure diagnostic twin of the step's silent joint skips. It re-walks the world as it exists now and
// retains nothing, letting callers distinguish an intentionally extensible unknown kind from missing
// body endpoints without adding messages or allocations to the solver path.
export function explainPhysics2DJoints(world: Readonly<Physics2DWorld>): Physics2DJointResolutionExplanation {
  const joints: Physics2DJointResolution[] = [];
  let readyCount = 0;
  for (let jointIndex = 0; jointIndex < world.joints.length; jointIndex++) {
    const joint = world.joints[jointIndex];
    const solver = world.jointSolvers.get(joint.kind);
    const solverRegistered = solver !== undefined;
    const bodyAUsed = solver?.usesBodyA !== false;
    const bodyAFound = findPhysics2DBody(world, joint.bodyA) !== null;
    const bodyBFound = findPhysics2DBody(world, joint.bodyB) !== null;
    const status = getJointResolutionStatus(solverRegistered, bodyAUsed, bodyAFound, bodyBFound);
    if (status === 'ready') readyCount++;
    joints.push({
      bodyA: joint.bodyA,
      bodyAFound,
      bodyAUsed,
      bodyB: joint.bodyB,
      bodyBFound,
      jointIndex,
      kind: joint.kind,
      solverRegistered,
      status,
    });
  }
  return { joints, readyCount, status: readyCount === joints.length ? 'complete' : 'unresolved-joints' };
}

function getJointResolutionStatus(
  solverRegistered: boolean,
  bodyAUsed: boolean,
  bodyAFound: boolean,
  bodyBFound: boolean,
): Physics2DJointResolutionStatus {
  if (!solverRegistered) return 'solver-unregistered';
  if (bodyAUsed && !bodyAFound && !bodyBFound) return 'bodies-missing';
  if (bodyAUsed && !bodyAFound) return 'body-a-missing';
  if (!bodyBFound) return 'body-b-missing';
  return 'ready';
}
