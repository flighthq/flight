import type { Physics3DJointResolutionGuard, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';

import { findPhysics3DBody } from './world';

// Rebuilds deterministic contiguous lists for the awake solve islands.
//
// The sleep reduction already owns the union-find graph, so solving consumes that same graph rather
// than discovering connectivity a second way. Roots are admitted in body order, and bodies, contacts,
// and joints retain their canonical world-list order inside each root. Disconnected islands therefore
// cannot perturb one another's iteration order, and sleeping constraints cost no solver scans. Every
// array and map is world-owned high-water workspace and is cleared and refilled in place.
//
// Runs after `updatePhysics3DSleep`, never before: the workspace admits only awake bodies, so building
// it against an unresolved sleep state would hand the solver islands it is about to put to sleep.
export function buildPhysics3DSolveIslands(world: Physics3DWorld): void {
  physics3DJointResolutionGuard?.(world);
  const roots = world.solveIslandRoots;
  const byRoot = world.solveIslandByRoot;
  const bodyCounts = world.solveIslandBodyCounts;
  const contactCounts = world.solveIslandContactCounts;
  const jointCounts = world.solveIslandJointCounts;
  roots.length = 0;
  byRoot.clear();
  bodyCounts.length = 0;
  contactCounts.length = 0;
  jointCounts.length = 0;

  for (let bodyIndex = 0; bodyIndex < world.bodies.length; bodyIndex += 1) {
    const body = world.bodies[bodyIndex];
    if (body.type === 'static' || body.sleeping) continue;
    const root = islandRootOf(world.islandParents, body.index);
    let island = byRoot.get(root);
    if (island === undefined) {
      island = roots.length;
      roots.push(root);
      byRoot.set(root, island);
      bodyCounts.push(0);
      contactCounts.push(0);
      jointCounts.push(0);
    }
    bodyCounts[island] += 1;
  }

  for (let contactIndex = 0; contactIndex < world.contacts.length; contactIndex += 1) {
    const contact = world.contacts[contactIndex];
    if (!contact.enabled || contact.sensor) continue;
    const island = solveIslandForPair(world, contact.bodyA, contact.bodyB);
    if (island >= 0) contactCounts[island] += 1;
  }
  for (let jointIndex = 0; jointIndex < world.joints.length; jointIndex += 1) {
    const joint = world.joints[jointIndex];
    const solver = world.jointSolvers.get(joint.kind);
    if (solver === undefined || joint.broken) continue;
    const island =
      solver.usesBodyA === false
        ? solveIslandForBody(world, joint.bodyB)
        : solveIslandForPair(world, joint.bodyA, joint.bodyB);
    if (island >= 0) jointCounts[island] += 1;
  }

  prepareIslandSlices(world.solveIslandBodyStarts, bodyCounts, world.solveIslandCursors);
  prepareIslandSlices(world.solveIslandContactStarts, contactCounts, world.solveIslandCursors);
  prepareIslandSlices(world.solveIslandJointStarts, jointCounts, world.solveIslandCursors);

  world.solveIslandBodyIndices.length = islandItemCount(world.solveIslandBodyStarts, bodyCounts);
  world.solveIslandContactIndices.length = islandItemCount(world.solveIslandContactStarts, contactCounts);
  world.solveIslandJointIndices.length = islandItemCount(world.solveIslandJointStarts, jointCounts);

  copyIslandStarts(world.solveIslandCursors, world.solveIslandBodyStarts);
  for (let i = 0; i < world.bodies.length; i += 1) {
    const body = world.bodies[i];
    if (body.type === 'static' || body.sleeping) continue;
    const island = byRoot.get(islandRootOf(world.islandParents, body.index));
    if (island !== undefined) {
      world.solveIslandBodyIndices[world.solveIslandCursors[island]] = i;
      world.solveIslandCursors[island] += 1;
    }
  }

  copyIslandStarts(world.solveIslandCursors, world.solveIslandContactStarts);
  for (let i = 0; i < world.contacts.length; i += 1) {
    const contact = world.contacts[i];
    if (!contact.enabled || contact.sensor) continue;
    const island = solveIslandForPair(world, contact.bodyA, contact.bodyB);
    if (island >= 0) {
      world.solveIslandContactIndices[world.solveIslandCursors[island]] = i;
      world.solveIslandCursors[island] += 1;
    }
  }

  copyIslandStarts(world.solveIslandCursors, world.solveIslandJointStarts);
  for (let i = 0; i < world.joints.length; i += 1) {
    const joint = world.joints[i];
    const solver = world.jointSolvers.get(joint.kind);
    if (solver === undefined || joint.broken) continue;
    const island =
      solver.usesBodyA === false
        ? solveIslandForBody(world, joint.bodyB)
        : solveIslandForPair(world, joint.bodyA, joint.bodyB);
    if (island >= 0) {
      world.solveIslandJointIndices[world.solveIslandCursors[island]] = i;
      world.solveIslandCursors[island] += 1;
    }
  }
}

// Whether a constraint between these two bodies still has anything to solve.
//
// A constraint is live only while at least one of its ends can still move this step. Two sleeping
// bodies, a sleeper against static scenery, or two static bodies all resolve to nothing: every impulse
// the solver could compute would be applied to a body that is not being integrated.
//
// Skipping is not merely an optimisation, and this is the reason sleep needs a solver-side test at all
// rather than only an integrator-side one. A resting contact usually carries penetration beyond the
// slop, so the position pass would move a sleeping pair, and the end-of-step stillness test would then
// read that motion and wake them again. A stack would twitch itself awake every step and never rest.
export function isRigidBody3DPairAwake(a: Readonly<RigidBody3D>, b: Readonly<RigidBody3D>): boolean {
  return isBodyLive(a) || isBodyLive(b);
}

// Installs the optional diagnostics seam consulted before unresolved joints are omitted from the solve
// workspace. Null by default and set only by `enablePhysics3DGuards`.
export function setPhysics3DJointResolutionGuard(guard: Physics3DJointResolutionGuard | null): void {
  physics3DJointResolutionGuard = guard;
}

// Advances every body's sleep state for one step.
//
// Sleep is decided per ISLAND, not per body. Two dynamic bodies are in the same island when a contact
// or a joint connects them, transitively — so a stack, a chain of links, and a pile all settle or wake
// as one unit. Deciding per body instead produces the visible failure this exists to prevent: a crate
// that has stopped moving falls asleep while the crate it rests on is still sliding out from under it,
// and the sleeper hangs in the air until something happens to wake it.
//
// Static bodies are excluded entirely. They never move, so they are neither awake nor asleep, and
// crucially they do NOT join islands: every dynamic body resting on the same ground would otherwise be
// transitively connected into one world-sized island that can only sleep when the last object in the
// level stops moving.
//
// An island sleeps only once EVERY member has been continuously below both thresholds for
// `timeToSleep`. Any member exceeding a threshold resets its own timer, and because the island's timer
// is the minimum across its members, one moving body keeps the whole island awake.
export function updatePhysics3DSleep(world: Physics3DWorld, dt: number): void {
  const config = world.config;
  const bodies = world.bodies;
  const parents = world.islandParents;
  const islandTimers = world.islandSleepTimers;
  parents.clear();
  islandTimers.clear();

  // Build the active constraint graph even when sleeping is disabled. The same union-find owns the
  // solve islands below; clearing it and returning here would split every awake body into a singleton
  // and assign a multi-body constraint to only the first of those artificial components.
  for (let contactIndex = 0; contactIndex < world.contacts.length; contactIndex += 1) {
    const contact = world.contacts[contactIndex];
    if (!contact.enabled || contact.sensor) continue;
    unionDynamicPair(world, parents, contact.bodyA, contact.bodyB);
  }
  for (let jointIndex = 0; jointIndex < world.joints.length; jointIndex += 1) {
    const joint = world.joints[jointIndex];
    const solver = world.jointSolvers.get(joint.kind);
    if (solver === undefined || joint.broken || solver.usesBodyA === false) continue;
    unionDynamicPair(world, parents, joint.bodyA, joint.bodyB);
  }

  if (!config.allowSleeping) {
    // The mechanism is off, so nothing may be left asleep from when it was on — a body that stayed
    // asleep here would never be integrated again and would look frozen for the rest of the session.
    for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
      const body = bodies[bodyIndex];
      body.sleeping = false;
      body.sleepTimer = 0;
    }
    return;
  }

  // Per-body stillness first: each body's own timer, independent of who it is touching.
  for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
    const body = bodies[bodyIndex];
    if (body.type === 'static') continue;
    if (!body.sleepEnabled) {
      body.sleeping = false;
      body.sleepTimer = 0;
      continue;
    }
    if (isBodyStill(body, config.sleepLinearThreshold, config.sleepAngularThreshold)) {
      body.sleepTimer += dt;
    } else {
      body.sleepTimer = 0;
    }
  }

  // A constraint driven by state outside the simulation cannot infer that its next target write is
  // coming, so its solver declares that participating bodies stay awake for the constraint's lifetime.
  // Reset after the stillness pass so even a timestep longer than timeToSleep cannot put one to sleep.
  for (let jointIndex = 0; jointIndex < world.joints.length; jointIndex += 1) {
    const joint = world.joints[jointIndex];
    const solver = world.jointSolvers.get(joint.kind);
    if (solver?.keepsBodiesAwake !== true || joint.broken) continue;
    if (solver.usesBodyA !== false) keepBodyAwake(world, joint.bodyA);
    keepBodyAwake(world, joint.bodyB);
  }

  // The island's timer is the MINIMUM across its members: the least-settled body decides.
  for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
    const body = bodies[bodyIndex];
    if (body.type === 'static') continue;
    const root = islandRootOf(parents, body.index);
    const current = islandTimers.get(root);
    islandTimers.set(root, current === undefined ? body.sleepTimer : Math.min(current, body.sleepTimer));
  }

  for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
    const body = bodies[bodyIndex];
    if (body.type === 'static') continue;
    const islandTimer = islandTimers.get(islandRootOf(parents, body.index)) ?? body.sleepTimer;
    const shouldSleep = body.sleepEnabled && islandTimer >= config.timeToSleep;
    if (!shouldSleep && body.sleeping) {
      // Waking clears the timer so a woken island must earn its rest again from zero rather than
      // falling straight back asleep on the next step.
      body.sleepTimer = 0;
    }
    body.sleeping = shouldSleep;
    if (shouldSleep) {
      // Zeroed rather than merely small. A sleeping body is not integrated, so any residual velocity is
      // motion that will be silently resumed the moment it wakes — a crate that settled ten steps ago
      // would twitch on waking. Zeroing also makes the stillness test trivially true next step, so a
      // body cannot oscillate across the threshold while asleep.
      body.velocityX = 0;
      body.velocityY = 0;
      body.velocityZ = 0;
      body.angularVelocityX = 0;
      body.angularVelocityY = 0;
      body.angularVelocityZ = 0;
    }
  }
}

function copyIslandStarts(cursors: number[], starts: readonly number[]): void {
  cursors.length = starts.length;
  for (let i = 0; i < starts.length; i += 1) cursors[i] = starts[i];
}

// A body the solver can still move: dynamic or kinematic, and awake. Static bodies are never live —
// their inverse mass is zero, so an impulse against them changes nothing regardless of sleep state.
function isBodyLive(body: Readonly<RigidBody3D>): boolean {
  return body.type !== 'static' && !body.sleeping;
}

function isBodyStill(body: Readonly<RigidBody3D>, linearThreshold: number, angularThreshold: number): boolean {
  // A body someone has applied force or torque to is not at rest, whatever its velocity currently
  // reads. Velocity alone would miss it: force is applied during the step, so a sleeper skips the
  // integration that would have turned it into motion, and the force is cleared at the end of the step —
  // the push would be silently swallowed and the body would stay asleep under continuous load.
  if (body.forceX !== 0 || body.forceY !== 0 || body.forceZ !== 0) return false;
  if (body.torqueX !== 0 || body.torqueY !== 0 || body.torqueZ !== 0) return false;

  const speedSquared =
    body.velocityX * body.velocityX + body.velocityY * body.velocityY + body.velocityZ * body.velocityZ;
  if (speedSquared > linearThreshold * linearThreshold) return false;

  // Compared as a magnitude, not per axis. Three axes each just under the threshold describe a body
  // tumbling at sqrt(3) times it, which per-axis tests would call still.
  const angularSquared =
    body.angularVelocityX * body.angularVelocityX +
    body.angularVelocityY * body.angularVelocityY +
    body.angularVelocityZ * body.angularVelocityZ;
  return angularSquared <= angularThreshold * angularThreshold;
}

function islandItemCount(starts: readonly number[], counts: readonly number[]): number {
  const last = counts.length - 1;
  return last < 0 ? 0 : starts[last] + counts[last];
}

// Union-find with path compression. An index with no entry is its own root, so a body touching nothing
// is an island of one without needing to be inserted first.
function islandRootOf(parents: Map<number, number>, index: number): number {
  let root = index;
  for (;;) {
    const parent = parents.get(root);
    if (parent === undefined || parent === root) break;
    root = parent;
  }
  let walk = index;
  for (;;) {
    const parent = parents.get(walk);
    if (parent === undefined || parent === walk) break;
    parents.set(walk, root);
    walk = parent;
  }
  return root;
}

function keepBodyAwake(world: Readonly<Physics3DWorld>, bodyIndex: number): void {
  const body = findPhysics3DBody(world, bodyIndex);
  if (body !== null && body.type !== 'static') body.sleepTimer = 0;
}

function prepareIslandSlices(starts: number[], counts: readonly number[], cursors: number[]): void {
  starts.length = counts.length;
  cursors.length = counts.length;
  let start = 0;
  for (let i = 0; i < counts.length; i += 1) {
    starts[i] = start;
    start += counts[i];
  }
}

function solveIslandForBody(world: Physics3DWorld, bodyIndex: number): number {
  const body = findPhysics3DBody(world, bodyIndex);
  if (body === null || body.type === 'static' || body.sleeping) return -1;
  return world.solveIslandByRoot.get(islandRootOf(world.islandParents, body.index)) ?? -1;
}

function solveIslandForPair(world: Physics3DWorld, bodyA: number, bodyB: number): number {
  const islandA = solveIslandForBody(world, bodyA);
  if (islandA >= 0) return islandA;
  return solveIslandForBody(world, bodyB);
}

// Joins two bodies into one island, but only when BOTH are dynamic. A static body is not a member of
// any island, so it cannot act as a bridge — otherwise the ground would merge every stack in the level
// into a single island that sleeps only when nothing anywhere is moving.
//
// Kinematic bodies deliberately do NOT break islands, even though the solver cannot move them either.
// A kinematic body joins the islands it touches, and a moving one has its stillness timer reset every
// step, so the island minimum stays zero and everything riding it stays awake. Excluding it the way
// static bodies are excluded would let a crate fall asleep on a lift that is still travelling.
function unionDynamicPair(world: Readonly<Physics3DWorld>, parents: Map<number, number>, a: number, b: number): void {
  const first = findPhysics3DBody(world, a);
  const second = findPhysics3DBody(world, b);
  if (first === null || second === null) return;
  if (first.type === 'static' || second.type === 'static') return;
  const rootA = islandRootOf(parents, a);
  const rootB = islandRootOf(parents, b);
  if (rootA !== rootB) parents.set(rootA, rootB);
}

let physics3DJointResolutionGuard: Physics3DJointResolutionGuard | null = null;
