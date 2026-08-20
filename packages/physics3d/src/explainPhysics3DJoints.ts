import type { Physics3DJointExplanation, Physics3DWorld } from '@flighthq/types/contract';

import { findPhysics3DBody } from './world';

// Which joints the step will actually solve, and why the others are skipped.
//
// The step skips a joint in TOTAL SILENCE in two cases, and they need telling apart. An unregistered kind
// is not a fault — a scene deserialized ahead of the code that solves it is explicitly supported, and the
// joint is meant to sit inert until someone registers its solver. A joint whose body index no longer
// resolves is a fault, usually a joint outliving a `removePhysics3DBody` that missed it. Both look
// identical from outside: a constraint that holds nothing.
//
// One entry per joint, in world-list order, so `index` is a handle back into `world.joints`. Pure — it
// re-walks the world as it stands and retains nothing.
export function explainPhysics3DJoints(world: Readonly<Physics3DWorld>): Physics3DJointExplanation[] {
  const explanations: Physics3DJointExplanation[] = [];
  for (let index = 0; index < world.joints.length; index += 1) {
    const joint = world.joints[index];
    const solver = world.jointSolvers.get(joint.kind);
    const hasSolver = solver !== undefined;
    // A one-body kind never reads bodyA, so a placeholder index there is not a fault. Asking the solver
    // rather than assuming two endpoints is what keeps this honest for a kind the package does not own.
    const bodyAResolvable = solver?.usesBodyA === false || findPhysics3DBody(world, joint.bodyA) !== null;
    const bodiesResolvable = bodyAResolvable && findPhysics3DBody(world, joint.bodyB) !== null;
    explanations.push({
      kind: joint.kind,
      index,
      hasSolver,
      bodiesResolvable,
      status: !hasSolver ? 'unregistered-kind' : bodiesResolvable ? 'solvable' : 'invalid-bodies',
    });
  }
  return explanations;
}
