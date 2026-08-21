import type {
  Physics3DContact,
  Physics3DContactCallback,
  Physics3DJoint,
  Physics3DJointSolver,
  Physics3DStepGuard,
  Physics3DWorld,
  RigidBody3D,
} from '@flighthq/types/contract';

import { buildPhysics3DContacts, refreshPhysics3DContacts } from './contactIntake';
import { hasActivePhysics3DBullet, integratePhysics3DContinuous } from './continuous';
import {
  clearRigidBody3DForces,
  integrateRigidBody3DPose,
  integrateRigidBody3DVelocity,
  refreshRigidBody3DWorldInertia,
} from './integrate';
import { buildPhysics3DSolveIslands, updatePhysics3DSleep } from './islands';
import { evaluatePhysics3DJointBreakage } from './jointBreakage';
import { steppingPhysics3DWorlds } from './ownership';
import {
  preparePhysics3DContactConstraints,
  solvePhysics3DContactPositions,
  solvePhysics3DContactVelocities,
  warmStartPhysics3DContacts,
} from './solver';
import {
  isPhysics3DBodyStateValid,
  isPhysics3DColliderStateValid,
  isPhysics3DContactStateValid,
  isPhysics3DContactValid,
  isPhysics3DGravityValid,
  isPhysics3DJointStateValid,
  isPhysics3DPositionIterationsValid,
  isPhysics3DSolverConfigValid,
  isPhysics3DSubstepsValid,
  isPhysics3DTimestepValid,
  isPhysics3DVelocityIterationsValid,
} from './stepValidation';

// Installs the optional diagnostics seam consulted when a step declines its preconditions. Null by
// default and set only by `enablePhysics3DGuards`, so a build that never enables guards links neither the
// message text nor `@flighthq/log`.
export function setPhysics3DStepGuard(guard: Physics3DStepGuard | null): void {
  physics3DStepGuard = guard;
}

// Advances the simulation by `dt` seconds. Everything the step does, it does because the caller asked:
// no implicit accumulation, no fixed-timestep loop hidden inside, and no allocation once the world's
// bodies, contacts, and joints exist.
//
// It declines SILENTLY on any failed precondition rather than throwing, because a NaN velocity or a zero
// timestep is a state a caller reaches by writing a field, and a throw from inside the step would take
// down a frame loop for something the caller can inspect and repair. `explainPhysics3DStep` is how a
// caller finds out which precondition failed, and it is separately importable so a shipping build that
// never asks never links it.
//
// Recursion IS a throw, because it is API misuse rather than data: reaching this from inside a contact
// hook would run a whole nested step against the arrays the outer one is midway through.
export function stepPhysics3D(world: Physics3DWorld, dt: number): void {
  if (steppingPhysics3DWorlds.has(world)) {
    throw new Error('Cannot step a physics world recursively');
  }
  const config = world.config;
  if (
    !isPhysics3DTimestepValid(dt) ||
    !isPhysics3DSubstepsValid(config) ||
    !isPhysics3DVelocityIterationsValid(config) ||
    !isPhysics3DPositionIterationsValid(config) ||
    !isPhysics3DSolverConfigValid(config) ||
    !isPhysics3DGravityValid(world) ||
    !isPhysics3DBodyStateValid(world) ||
    !isPhysics3DColliderStateValid(world) ||
    !isPhysics3DContactStateValid(world) ||
    !isPhysics3DJointStateValid(world)
  ) {
    // The one place the silent decline is observable from outside. The seam takes the world and the
    // timestep rather than a reason, so the guard asks `explainPhysics3DStep` for ALL of them — a world
    // with two faults reported one at a time would be repaired one frame at a time.
    physics3DStepGuard?.(world, dt);
    return;
  }

  // The flag is set and cleared in exactly one place, whatever the body does or throws. It is what makes
  // every world lifecycle and joint lifecycle helper reject a call from inside a contact hook: the hook's
  // sole mutation surface is the contact fields its contract names.
  steppingPhysics3DWorlds.add(world);
  try {
    stepValidatedPhysics3D(world, dt);
  } finally {
    steppingPhysics3DWorlds.delete(world);
  }
}

// One sub-interval of a step: integrate velocities, solve the constraints, integrate poses, repair
// penetration.
//
// Exported because the solver ruling requires the step to ship as a composition of named functions rather
// than a monolith. A caller assembling its own loop wants exactly this piece, and a second solver would
// replace this while `stepPhysics3D` above it stays as it is.
//
// The substep loop is the OUTER loop, which is the whole reason this is a separate function. A solver
// that integrates once and then iterates cannot be turned into one that substeps without restructuring
// everything that reads the step, so the shape is reserved from the first release even at `substeps: 1`.
//
// The ordering is not arbitrary, and one piece of it is a trap. `refreshRigidBody3DWorldInertia` runs at
// the TOP, before the velocity integration reads the world tensor, and AGAIN once the poses have moved,
// before the position pass reads it. Integrating angular velocity against the previous sub-interval's
// world tensor is wrong in a way that shows only on a rotating asymmetric body — a slow, plausible
// precession no single-step assertion catches.
export function stepPhysics3DInterval(world: Physics3DWorld, dt: number): void {
  const sequential = world.config.sequentialImpulse;

  forEachSolveIslandBody(world, refreshRigidBody3DWorldInertia);
  forEachSolveIslandBody(world, (body) =>
    integrateRigidBody3DVelocity(body, world.gravityX, world.gravityY, world.gravityZ, dt),
  );

  preparePhysics3DContactConstraints(world);
  forEachSolveIslandJoint(world, (joint, solver) => solver.prepare(world, joint, dt));

  if (sequential.warmStarting) {
    warmStartPhysics3DContacts(world);
    // Warm starting is a per-KIND capability as well as a per-world preference. A kind that declares no
    // `warmStart` never reapplies its accumulator, so that accumulator has to be cleared even while the
    // world IS warm starting — an impulse that is never reapplied must be cleared, or it is neither warm
    // nor cold, and it grows without ever acting.
    forEachSolveIslandJoint(world, (joint, solver) => {
      if (solver.warmStart !== undefined) solver.warmStart(world, joint);
      else clearJointAccumulators(joint, solver);
    });
  } else {
    // Contacts need no clearing here: `preparePhysics3DContactConstraints` carries an accumulator across
    // only when the flag is set, so the constraint it just built is already cold.
    forEachSolveIslandJoint(world, clearJointAccumulators);
  }

  // Joints and contacts share one iteration count and one interleaved pass. Solving them in separate
  // passes would let each undo the other's correction — a hinge under load creeps if the contacts beneath
  // it get a whole pass to themselves between joint iterations.
  for (let iteration = 0; iteration < sequential.velocityIterations; iteration += 1) {
    forEachSolveIslandJoint(world, (joint, solver) => solver.solve(world, joint, dt));
    solvePhysics3DContactVelocities(world);
  }

  evaluatePhysics3DJointBreakage(world, dt);

  forEachSolveIslandPose(world, dt);

  for (let iteration = 0; iteration < sequential.positionIterations; iteration += 1) {
    solvePhysics3DContactPositions(world);
  }
}

function clearJointAccumulators(joint: Physics3DJoint, solver: Readonly<Physics3DJointSolver>): void {
  solver.clearAccumulatedImpulses?.(joint);
  joint.impulse0 = 0;
  joint.impulse1 = 0;
  joint.impulse2 = 0;
  joint.impulse3 = 0;
  joint.impulse4 = 0;
  joint.impulse5 = 0;
}

// Visits every body the solve islands admit, in island-major order.
//
// The workspace holds only awake, non-static bodies, so this is also the sleeping skip — and the skip is
// a COST saving rather than a behavioural one, which is worth having in writing: a sleeping body's
// velocity is zeroed when it falls asleep and nothing can hand it more, because any awake neighbour puts
// it in an awake island before this point. What the skip buys is that a settled thousand-body pile costs
// no integration at all, which is the entire reason sleep exists.
function forEachSolveIslandBody(world: Physics3DWorld, visit: (body: RigidBody3D) => void): void {
  for (let island = 0; island < world.solveIslandRoots.length; island += 1) {
    const start = world.solveIslandBodyStarts[island];
    const end = start + world.solveIslandBodyCounts[island];
    for (let at = start; at < end; at += 1) visit(world.bodies[world.solveIslandBodyIndices[at]]);
  }
}

// Visits every joint the solve islands admit, paired with its registered solver. The workspace already
// excluded unregistered kinds and sleeping islands, so the callback never has to ask again.
function forEachSolveIslandJoint(
  world: Physics3DWorld,
  visit: (joint: Physics3DJoint, solver: Readonly<Physics3DJointSolver>) => void,
): void {
  for (let island = 0; island < world.solveIslandRoots.length; island += 1) {
    const start = world.solveIslandJointStarts[island];
    const end = start + world.solveIslandJointCounts[island];
    for (let at = start; at < end; at += 1) {
      const joint = world.joints[world.solveIslandJointIndices[at]];
      const solver = world.jointSolvers.get(joint.kind);
      if (solver !== undefined) visit(joint, solver);
    }
  }
}

// Moves every awake body by its solved velocity, then refreshes the world inertia the position pass is
// about to read. Two passes rather than one, because a body's pose must not move between another body's
// integration and its own: a single fused loop would have the second body's constraint arms measured
// against a world the first body had already left.
//
// Routes through the CONTINUOUS path when the world asks for it and some body is actually flagged. That
// path integrates in chronological order of impact instead of in one jump, which is the only way a body
// fast enough to cross a wall within the interval generates a contact at all. It is checked here rather
// than inside the continuous pass so a world with the config on and no bullets pays one scan of the body
// list rather than a swept broadphase.
function forEachSolveIslandPose(world: Physics3DWorld, dt: number): void {
  if (world.config.continuousCollision && hasActivePhysics3DBullet(world)) {
    integratePhysics3DContinuous(world, dt);
    return;
  }
  forEachSolveIslandBody(world, (body) => integrateRigidBody3DPose(body, dt));
  forEachSolveIslandBody(world, refreshRigidBody3DWorldInertia);
}

function restoreContactHookFields(
  contact: Physics3DContact,
  friction: number,
  restitution: number,
  enabled: boolean,
  sensor: boolean,
): void {
  contact.friction = friction;
  contact.restitution = restitution;
  contact.enabled = enabled;
  contact.sensor = sensor;
}

// Runs a contact hook over every resolvable contact, putting back the fields it may touch if it
// misbehaves.
//
// Sensors are skipped, because they produce no constraint to solve and there is nothing for a hook to
// adjust. A hook that throws, or that leaves a contact the step cannot use, has its four mutable fields
// restored before the failure propagates — otherwise a caller catching the error would resume against a
// world the hook half-edited.
function runPhysics3DContactHook(world: Physics3DWorld, hook: Physics3DContactCallback | null, phase: string): void {
  if (hook === null) return;
  for (const contact of world.contacts) {
    if (contact.sensor) continue;
    const friction = contact.friction;
    const restitution = contact.restitution;
    const enabled = contact.enabled;
    const sensor = contact.sensor;
    try {
      hook(world, contact);
    } catch (error) {
      restoreContactHookFields(contact, friction, restitution, enabled, sensor);
      throw error;
    }
    if (!isPhysics3DContactValid(contact)) {
      restoreContactHookFields(contact, friction, restitution, enabled, sensor);
      throw new Error(`Physics3D ${phase} hook produced invalid contact state`);
    }
  }
}

// Expresses every cached impulse in the interval it is about to be reapplied over.
//
// An accumulated impulse has force-times-time units. Reusing one unchanged across a different interval
// applies the wrong force before the first iteration can correct it, which presents as a stack or a motor
// kicking whenever a frame changes cadence. The comparison is against the previous SUB-interval rather
// than the previous whole step, because a sub-interval's iterations are what built the cache — which is
// also why changing `substeps` between steps rescales correctly rather than silently by the wrong factor.
//
// A non-finite ratio clears the cache rather than seeding infinity from two otherwise-valid timesteps.
function scalePhysics3DWarmStartCaches(world: Physics3DWorld, dt: number): void {
  const previous = world.previousTimestep;
  if (!(previous > 0) || previous === dt) return;
  const divided = dt / previous;
  const timestepRatio = Number.isFinite(divided) ? divided : 0;

  for (const constraint of world.solver.constraints) {
    for (let i = 0; i < constraint.pointCount; i += 1) {
      const point = constraint.points[i];
      point.normalImpulse *= timestepRatio;
      point.tangentImpulse0 *= timestepRatio;
      point.tangentImpulse1 *= timestepRatio;
    }
  }
  for (const joint of world.joints) {
    joint.impulse0 *= timestepRatio;
    joint.impulse1 *= timestepRatio;
    joint.impulse2 *= timestepRatio;
    joint.impulse3 *= timestepRatio;
    joint.impulse4 *= timestepRatio;
    joint.impulse5 *= timestepRatio;
    world.jointSolvers.get(joint.kind)?.scaleAccumulatedImpulses?.(joint, timestepRatio);
  }
}

// The body of one step whose preconditions already hold.
function stepValidatedPhysics3D(world: Physics3DWorld, dt: number): void {
  const substepDt = dt / world.config.substeps;

  // Break events are cleared once per STEP, not per sub-interval, so a joint that parted during the first
  // substep is still reported after the last one. Clearing inside the substep loop would drop every break
  // but the final sub-interval's, and would do it silently — the joint stays broken either way, so the
  // simulation would look right and only the notification would go missing.
  world.jointEvents.broke.length = 0;

  // Contacts are generated FIRST, from the poses the previous step left behind. The pre-solve hook is
  // one transaction per public step: it runs before any interval commits, so a throw cannot leave half a
  // substepped frame behind. Later interval refreshes retain its four mutable fields.
  buildPhysics3DContacts(world);

  // Pre-solve runs before anything is scaled or prepared, so a hook that disables a contact for this step
  // does so before the constraint that would have resolved it is built.
  runPhysics3DContactHook(world, world.contactHooks.preSolve, 'pre-solve');
  // Scale only after pre-solve succeeds. A callback may throw, and scaling first would leave the cache
  // expressed in the new interval while `previousTimestep` still described the old one; a retry would
  // then scale an already-scaled cache a second time.
  scalePhysics3DWarmStartCaches(world, substepDt);

  // Sleep TIME is advanced once per step; later refreshes pass zero merely to rebuild the constraint
  // graph and wake a sleeper reached by a body during an earlier interval. This preserves the meaning of
  // `timeToSleep` while making a newly connected island live in the interval that discovered it.
  updatePhysics3DSleep(world, dt);
  buildPhysics3DSolveIslands(world);

  for (let substep = 0; substep < world.config.substeps; substep += 1) {
    if (substep > 0) {
      // A substep that only re-runs the solver against the outer step's original contact list is not a
      // smaller timestep: bodies can cross into a collider in interval one and remain invisible through
      // every interval after it. Refreshing here makes N substeps topologically equivalent to N calls at
      // the sub-interval, while aggregating begin/end events across the one public call.
      refreshPhysics3DContacts(world);
      updatePhysics3DSleep(world, 0);
      buildPhysics3DSolveIslands(world);
    }
    stepPhysics3DInterval(world, substepDt);
  }

  for (const body of world.bodies) clearRigidBody3DForces(body);
  world.previousTimestep = substepDt;

  // Post-solve observes a committed step. A hook that throws here cannot prevent pose integration, force
  // cleanup, or the timestep agreement above, so the next call never resumes a half-finished step.
  runPhysics3DContactHook(world, world.contactHooks.postSolve, 'post-solve');
}

let physics3DStepGuard: Physics3DStepGuard | null = null;
