import type { Physics2DContact, Physics2DContactPoint, Physics2DWorld, RigidBody2D } from '@flighthq/types/contract';

import { isRigidBody2DPairAwake } from './islands';
import { findPhysics2DBody } from './world';

// Applies equal and opposite impulses at the pair's contact point. The angular term is the lever arm
// crossed with the impulse — the reason an off-centre contact spins a body instead of only shoving it.
// A static body's zero inverse mass and inverse inertia make both of its updates no-ops without a branch.
//
// A POSITIVE impulse pushes A along the contact normal and B against it, because `@flighthq/collision`
// documents its manifold normal as the direction that separates **A out of B**. That is the opposite of
// the A-to-B convention most sequential-impulse literature is written in, and getting it backwards does
// not look like a sign error — it looks like gravity working, since the solver then drives bodies
// together and a resting box settles below the floor instead of on it.
export function applyPhysics2DImpulse(
  bodyA: RigidBody2D,
  bodyB: RigidBody2D,
  rAX: number,
  rAY: number,
  rBX: number,
  rBY: number,
  impulseX: number,
  impulseY: number,
): void {
  bodyA.velocityX += impulseX * bodyA.inverseMass;
  bodyA.velocityY += impulseY * bodyA.inverseMass;
  bodyA.angularVelocity += bodyA.inverseInertia * (rAX * impulseY - rAY * impulseX);
  bodyB.velocityX -= impulseX * bodyB.inverseMass;
  bodyB.velocityY -= impulseY * bodyB.inverseMass;
  bodyB.angularVelocity -= bodyB.inverseInertia * (rBX * impulseY - rBY * impulseX);
}

export function relativeNormalVelocity(
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  point: Readonly<Physics2DContactPoint>,
  normalX: number,
  normalY: number,
): number {
  const vax = bodyA.velocityX - bodyA.angularVelocity * point.rAY;
  const vay = bodyA.velocityY + bodyA.angularVelocity * point.rAX;
  const vbx = bodyB.velocityX - bodyB.angularVelocity * point.rBY;
  const vby = bodyB.velocityY + bodyB.angularVelocity * point.rBX;
  return (vax - vbx) * normalX + (vay - vby) * normalY;
}

// One contact's velocity constraint: friction first, then the normal.
//
// Friction is solved BEFORE the normal on each pass, and the order is deliberate. The friction bound is
// Coulomb's — the tangential impulse cannot exceed the normal impulse times the coefficient — so it needs
// a normal impulse to bound against. Using the value the previous iteration converged on is standard and
// stable; using the one this iteration is about to produce would make the bound depend on a number that
// does not exist yet.
function solvePhysics2DContact(contact: Physics2DContact, bodyA: RigidBody2D, bodyB: RigidBody2D): void {
  const normalX = contact.normalX;
  const normalY = contact.normalY;
  const tangentX = -normalY;
  const tangentY = normalX;

  for (let i = 0; i < contact.pointCount; i++) {
    const point = contact.points[i];

    const tangentVelocity = relativeAxisVelocity(
      bodyA,
      bodyB,
      point.rAX,
      point.rAY,
      point.rBX,
      point.rBY,
      tangentX,
      tangentY,
    );
    let tangentImpulse = -point.tangentMass * tangentVelocity;
    const limit = contact.friction * point.normalImpulse;
    const clampedTangent = Math.max(-limit, Math.min(limit, point.tangentImpulse + tangentImpulse));
    tangentImpulse = clampedTangent - point.tangentImpulse;
    point.tangentImpulse = clampedTangent;
    applyPhysics2DImpulse(
      bodyA,
      bodyB,
      point.rAX,
      point.rAY,
      point.rBX,
      point.rBY,
      tangentImpulse * tangentX,
      tangentImpulse * tangentY,
    );

    const normalVelocity = relativeNormalVelocity(bodyA, bodyB, point, normalX, normalY);
    let normalImpulse = -point.normalMass * (normalVelocity + point.bias);
    const clampedNormal = Math.max(0, point.normalImpulse + normalImpulse);
    normalImpulse = clampedNormal - point.normalImpulse;
    point.normalImpulse = clampedNormal;
    applyPhysics2DImpulse(
      bodyA,
      bodyB,
      point.rAX,
      point.rAY,
      point.rBX,
      point.rBY,
      normalImpulse * normalX,
      normalImpulse * normalY,
    );
  }
}

// One pass over one solve island's flattened contact slice. The index list belongs to the world and is
// rebuilt once per step, so this adds no transient filtering array to the iteration hot path.
export function solvePhysics2DContactIndicesOnce(
  world: Physics2DWorld,
  indices: number[],
  start: number,
  count: number,
): void {
  const end = start + count;
  for (let i = start; i < end; i++) _solvePhysics2DContactAt(world, indices[i]);
}

// The sequential-impulse velocity solve: projected Gauss-Seidel over the contact list, `velocityIterations`
// times.
//
// "Sequential" is the whole method — each impulse is applied immediately, so the next constraint sees the
// velocities the previous one left behind. That is why the solver converges, and equally why contact
// ORDER changes the result: the list is sorted canonically before it gets here for exactly that reason.
//
// The accumulated impulse, not the incremental one, is what gets clamped. Clamping each increment would
// let a contact pull bodies together on any iteration where the incremental impulse came out negative;
// clamping the accumulation lets an iteration correct an earlier overshoot while keeping the total
// non-negative, which is the difference between a stable stack and one that vibrates.
export function solvePhysics2DContacts(world: Physics2DWorld): void {
  const iterations = world.config.velocityIterations;
  for (let iteration = 0; iteration < iterations; iteration++) solvePhysics2DContactsOnce(world);
}

// One pass over the contact list. Split out so the step can interleave it with the joint pass inside a
// single iteration loop: joints and contacts constrain the same bodies, and giving either a whole pass to
// itself lets it undo what the other just corrected.
export function solvePhysics2DContactsOnce(world: Physics2DWorld): void {
  for (let i = 0; i < world.contacts.length; i++) _solvePhysics2DContactAt(world, i);
}

// Warm-starts one solve island's flattened contact slice.
export function warmStartPhysics2DContactIndices(
  world: Physics2DWorld,
  indices: number[],
  start: number,
  count: number,
): void {
  const end = start + count;
  for (let i = start; i < end; i++) _warmStartPhysics2DContactAt(world, indices[i]);
}

// Applies each contact's cached impulses before the first iteration — the warm start.
//
// This is what makes a stack settle rather than visibly sink. A sequential-impulse solver converges
// toward the correct impulse over its iterations; starting each step from zero throws away everything
// the previous step learned, so a tall stack never reaches equilibrium within a frame's budget and the
// bottom box is compressed by everything above it. Re-applying last step's converged impulse starts the
// iteration from an answer that was nearly right, and a handful of iterations finishes the job.
//
// The cached impulses were matched by feature id when the contact was merged, so a point that is no
// longer the same feature arrives here with zero rather than a stranger's force.
export function warmStartPhysics2DContacts(world: Physics2DWorld): void {
  for (let i = 0; i < world.contacts.length; i++) _warmStartPhysics2DContactAt(world, i);
}

function _solvePhysics2DContactAt(world: Physics2DWorld, contactIndex: number): void {
  const contact = world.contacts[contactIndex];
  if (contact === undefined || !contact.enabled || contact.sensor) return;
  const bodyA = findPhysics2DBody(world, contact.bodyA);
  const bodyB = findPhysics2DBody(world, contact.bodyB);
  if (bodyA === null || bodyB === null || !isRigidBody2DPairAwake(bodyA, bodyB)) return;
  solvePhysics2DContact(contact, bodyA, bodyB);
}

function _warmStartPhysics2DContactAt(world: Physics2DWorld, contactIndex: number): void {
  const contact = world.contacts[contactIndex];
  if (contact === undefined || !contact.enabled || contact.sensor) return;
  const bodyA = findPhysics2DBody(world, contact.bodyA);
  const bodyB = findPhysics2DBody(world, contact.bodyB);
  if (bodyA === null || bodyB === null || !isRigidBody2DPairAwake(bodyA, bodyB)) return;

  const normalX = contact.normalX;
  const normalY = contact.normalY;
  const tangentX = -normalY;
  const tangentY = normalX;
  for (let i = 0; i < contact.pointCount; i++) {
    const point = contact.points[i];
    const impulseX = point.normalImpulse * normalX + point.tangentImpulse * tangentX;
    const impulseY = point.normalImpulse * normalY + point.tangentImpulse * tangentY;
    applyPhysics2DImpulse(bodyA, bodyB, point.rAX, point.rAY, point.rBX, point.rBY, impulseX, impulseY);
  }
}

function relativeAxisVelocity(
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  rAX: number,
  rAY: number,
  rBX: number,
  rBY: number,
  axisX: number,
  axisY: number,
): number {
  const vax = bodyA.velocityX - bodyA.angularVelocity * rAY;
  const vay = bodyA.velocityY + bodyA.angularVelocity * rAX;
  const vbx = bodyB.velocityX - bodyB.angularVelocity * rBY;
  const vby = bodyB.velocityY + bodyB.angularVelocity * rBX;
  // A's velocity relative to B, matching the normal's "separates A out of B" direction: negative means
  // the pair is closing along that axis.
  return (vax - vbx) * axisX + (vay - vby) * axisY;
}
