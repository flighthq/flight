import type { Physics2DWorld, RigidBody2D } from '@flighthq/types/contract';

import { findPhysics2DBody } from './world';

/** Whether a constraint between these two bodies still has anything to solve.
 *
 *  A constraint is live only while at least one of its ends can still move this step. Two sleeping
 *  bodies, a sleeper against static scenery, or two static bodies all resolve to nothing: every impulse
 *  the solver could compute would be applied to a body that is not being integrated.
 *
 *  Skipping is not merely an optimisation, and this is the reason sleep needs a solver-side test at all
 *  rather than only an integrator-side one. A resting contact usually carries penetration beyond the
 *  slop, so its positional bias is non-zero; solved, it hands the sleeping pair a velocity, which the
 *  end-of-step stillness test then reads as motion and wakes them again. A stack would twitch itself
 *  awake every step and never rest. */
export function isRigidBody2DPairAwake(a: Readonly<RigidBody2D>, b: Readonly<RigidBody2D>): boolean {
  return _isBodyLive(a) || _isBodyLive(b);
}

/** Advances every body's sleep state for one step, and returns whether any body is awake.
 *
 *  Sleep is decided per ISLAND, not per body. Two dynamic bodies are in the same island when a contact
 *  or a joint connects them, transitively — so a stack, a chain of links, and a pile all settle or wake
 *  as one unit. Deciding per body instead produces the visible failure this exists to prevent: a crate
 *  that has stopped moving falls asleep while the crate it rests on is still sliding out from under it,
 *  and the sleeper hangs in the air until something happens to wake it.
 *
 *  Static bodies are excluded entirely. They never move, so they are neither awake nor asleep, and
 *  crucially they do NOT join islands: every dynamic body resting on the same ground would otherwise be
 *  transitively connected into one world-sized island that can only sleep when the last object in the
 *  level stops moving.
 *
 *  An island sleeps only once EVERY member has been continuously below both thresholds for
 *  `timeToSleep`. Any member exceeding a threshold resets its own timer, and because the island's timer
 *  is the minimum across its members, one moving body keeps the whole island awake. */
export function updatePhysics2DSleep(world: Physics2DWorld, dt: number): void {
  const config = world.config;
  const bodies = world.bodies;

  if (!config.allowSleeping) {
    // The mechanism is off, so nothing may be left asleep from when it was on — a body that stayed
    // asleep here would never be integrated again and would look frozen for the rest of the session.
    for (const body of bodies) {
      body.sleeping = false;
      body.sleepTimer = 0;
    }
    return;
  }

  // Per-body stillness first: each body's own timer, independent of who it is touching.
  for (const body of bodies) {
    if (body.type === 'static') continue;
    if (_isBodyStill(body, config.sleepLinearThreshold, config.sleepAngularThreshold)) {
      body.sleepTimer += dt;
    } else {
      body.sleepTimer = 0;
    }
  }

  // Then the island reduction. `_islandRootOf` is union-find over the contact and joint graph, so the
  // root is a stable representative for the connected component.
  const parents = new Map<number, number>();
  for (const contact of world.contacts) {
    if (!contact.enabled || contact.sensor) continue;
    _unionDynamicPair(world, parents, contact.bodyA, contact.bodyB);
  }
  for (const joint of world.joints) {
    _unionDynamicPair(world, parents, joint.bodyA, joint.bodyB);
  }

  // The island's timer is the MINIMUM across its members: the least-settled body decides.
  const islandTimers = new Map<number, number>();
  for (const body of bodies) {
    if (body.type === 'static') continue;
    const root = _islandRootOf(parents, body.index);
    const current = islandTimers.get(root);
    islandTimers.set(root, current === undefined ? body.sleepTimer : Math.min(current, body.sleepTimer));
  }

  for (const body of bodies) {
    if (body.type === 'static') continue;
    const islandTimer = islandTimers.get(_islandRootOf(parents, body.index)) ?? body.sleepTimer;
    const shouldSleep = islandTimer >= config.timeToSleep;
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
      body.angularVelocity = 0;
    }
  }
}

/** Wakes `body` and clears its stillness timer, so it is simulated again from this step.
 *
 *  The caller wakes a body; the island reduction then keeps its neighbours awake too, because a woken
 *  body's zeroed timer becomes the minimum for its island on the next step. Waking is what any external
 *  change to a sleeping body must do — applying a force, teleporting it, or removing what it rested on —
 *  since a sleeping body is skipped by integration and would otherwise ignore the change entirely. */
export function wakePhysics2DBody(body: RigidBody2D): void {
  body.sleeping = false;
  body.sleepTimer = 0;
}

// A body the solver can still move: dynamic or kinematic, and awake. Static bodies are never live —
// their inverse mass is zero, so an impulse against them changes nothing regardless of sleep state.
function _isBodyLive(body: Readonly<RigidBody2D>): boolean {
  return body.type !== 'static' && !body.sleeping;
}

function _isBodyStill(body: Readonly<RigidBody2D>, linearThreshold: number, angularThreshold: number): boolean {
  // A body someone has applied force or torque to is not at rest, whatever its velocity currently reads.
  // Velocity alone would miss it: force is applied during the step, so a sleeper skips the integration
  // that would have turned it into motion, and the force is cleared at the end of the step — the push
  // would be silently swallowed and the body would stay asleep under continuous load.
  if (body.forceX !== 0 || body.forceY !== 0 || body.torque !== 0) return false;
  const speedSquared = body.velocityX * body.velocityX + body.velocityY * body.velocityY;
  if (speedSquared > linearThreshold * linearThreshold) return false;
  return Math.abs(body.angularVelocity) <= angularThreshold;
}

// Joins two bodies into one island, but only when BOTH are dynamic. A static body is not a member of
// any island, so it cannot act as a bridge — otherwise the ground would merge every stack in the level
// into a single island that sleeps only when nothing anywhere is moving.
function _unionDynamicPair(world: Physics2DWorld, parents: Map<number, number>, a: number, b: number): void {
  const first = findPhysics2DBody(world, a);
  const second = findPhysics2DBody(world, b);
  if (first === null || second === null) return;
  if (first.type === 'static' || second.type === 'static') return;
  const rootA = _islandRootOf(parents, a);
  const rootB = _islandRootOf(parents, b);
  if (rootA !== rootB) parents.set(rootA, rootB);
}

// Union-find with path compression. An index with no entry is its own root, so a body touching nothing
// is an island of one without needing to be inserted first.
function _islandRootOf(parents: Map<number, number>, index: number): number {
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
