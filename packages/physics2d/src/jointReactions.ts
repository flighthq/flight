import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  Physics2DJoint,
  Physics2DJointReaction,
  Physics2DWorld,
} from '@flighthq/types/contract';

export function createPhysics2DJointReaction(): Physics2DJointReaction {
  const out = allocateEntity<Physics2DJointReaction>();
  initializePhysics2DJointReaction(out);
  return finishEntity(out);
}

// An all-zero reaction, for a caller that wants somewhere to write.
export function initializePhysics2DJointReaction(out: EntityConstruction<Physics2DJointReaction>): void {
  out.forceX = 0;
  out.forceY = 0;
  out.torque = 0;
}

// Writes the force and couple `joint` applied to body B on the step that just ran, in world space.
//
// Reads the accumulators the solver converged on, so it reports what the constraint ACTUALLY did rather
// than what it would ideally do — a joint whose iterations ran out short reports the impulse it managed,
// which is the number a breakage threshold or a strain readout has to be compared against.
//
// It is therefore a query about the LAST STEP, and `dt` must be that step's timestep or the forces are
// scaled wrong. `world.previousTimestep` is that value; passing the timestep about to be used instead is
// correct only while the step size is constant.
//
// Returns false and leaves `out` zeroed when there is no answer to give: before the first step, for a
// joint whose bodies have gone missing, for a kind with no registered solver, and for a kind whose solver
// declines to report one. `explainPhysics2DJoints(world)` distinguishes the middle cases; the last is a
// property of the kind, and the gear joint is the built-in example — it couples two scalar coordinates
// that need not share units, so no single force describes it.
export function writePhysics2DJointReaction(
  world: Readonly<Physics2DWorld>,
  joint: Readonly<Physics2DJoint>,
  dt: number,
  out: Physics2DJointReaction,
): boolean {
  out.forceX = 0;
  out.forceY = 0;
  out.torque = 0;
  if (!(dt > 0) || !Number.isFinite(dt)) return false;
  const solver = world.jointSolvers.get(joint.kind);
  if (solver?.writeReaction === undefined) return false;
  return solver.writeReaction(world, joint, 1 / dt, out);
}
