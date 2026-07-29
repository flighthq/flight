import { createUniformGridSpatialBackend } from '@flighthq/spatial/contract';
import type { Physics2DWorld, RigidBody2D, SpatialIndexBackend, SpatialPair } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { stepPhysics2D } from './step';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function ground(world: Physics2DWorld): RigidBody2D {
  const body = createRigidBody2D('static', 0, 0);
  body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -50, minY: -1, maxX: 50, maxY: 0 }, STONE));
  return addPhysics2DBody(world, body);
}

function box(world: Physics2DWorld, x: number, y: number, half = 0.5): RigidBody2D {
  const body = createRigidBody2D('dynamic', x, y);
  body.colliders.push(
    createPhysics2DCollider({ kind: 'aabb', minX: -half, minY: -half, maxX: half, maxY: half }, STONE),
  );
  return addPhysics2DBody(world, body);
}

// A hash of every body's full state, which is what a determinism claim has to be made against — comparing
// only positions would miss a divergence that has entered the velocities and not yet moved anything.
function traceWorld(world: Readonly<Physics2DWorld>): string {
  return world.bodies
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((b) => [b.index, b.x, b.y, b.angle, b.velocityX, b.velocityY, b.angularVelocity].join(':'))
    .join('|');
}

// A broadphase that returns its pairs in reverse order, and one that swaps each pair's two ids. Both
// wrap the real grid, so the candidate SET is identical and only its presentation differs — which is
// what makes them isolate ordering rather than change the simulation.
function createReversedPairBackend(): SpatialIndexBackend {
  const inner = createUniformGridSpatialBackend(1);
  return {
    ...inner,
    querySpatialPairs(out: SpatialPair[]): void {
      inner.querySpatialPairs(out);
      out.reverse();
    },
  };
}

function createSwappedPairBackend(): SpatialIndexBackend {
  const inner = createUniformGridSpatialBackend(1);
  return {
    ...inner,
    querySpatialPairs(out: SpatialPair[]): void {
      inner.querySpatialPairs(out);
      for (const pair of out) {
        const a = pair.a;
        pair.a = pair.b;
        pair.b = a;
      }
    },
  };
}

function runSteps(world: Physics2DWorld, count: number): void {
  for (let i = 0; i < count; i++) stepPhysics2D(world, 1 / 60);
}

describe('stepPhysics2D', () => {
  it('rests a box on the ground instead of sinking through it', () => {
    const world = createPhysics2DWorld();
    ground(world);
    const crate = box(world, 0, 2);
    runSteps(world, 180);

    // Half-extent 0.5 above a ground surface at y=0: the resting centre is y=0.5, less the solver's
    // deliberate penetration slop.
    expect(crate.y).toBeGreaterThan(0.48);
    expect(crate.y).toBeLessThan(0.52);
    expect(Math.abs(crate.velocityY)).toBeLessThan(0.05);
  });

  it('keeps a stack standing rather than letting the lower boxes be compressed through each other', () => {
    // The case warm starting exists for. Without it the solver restarts from zero impulse every step, so
    // the bottom box never converges against the weight above it and the stack visibly sinks.
    const world = createPhysics2DWorld();
    ground(world);
    const bottom = box(world, 0, 0.5);
    const middle = box(world, 0, 1.5);
    const top = box(world, 0, 2.5);
    runSteps(world, 240);

    expect(bottom.y).toBeGreaterThan(0.45);
    expect(middle.y).toBeGreaterThan(1.4);
    expect(top.y).toBeGreaterThan(2.35);
    expect(middle.y - bottom.y).toBeGreaterThan(0.9);
    expect(top.y - middle.y).toBeGreaterThan(0.9);
  });

  it('produces a bitwise-identical trace for the same scene stepped twice', () => {
    // The golden-trace harness. Determinism for a fixed engine and input order is exact, not approximate:
    // every operation on this path is IEEE-754 exact (+ - * / and sqrt), so anything short of bitwise
    // equality is a real divergence rather than accumulated noise.
    const first = createPhysics2DWorld();
    ground(first);
    box(first, 0.1, 2);
    box(first, -0.3, 3.2);
    runSteps(first, 120);

    const second = createPhysics2DWorld();
    ground(second);
    box(second, 0.1, 2);
    box(second, -0.3, 3.2);
    runSteps(second, 120);

    expect(traceWorld(second)).toBe(traceWorld(first));
  });

  it('produces the same trace when the broadphase reports its pairs in the opposite order', () => {
    // ORDER-INDEPENDENCE, OBLIGATION 2 — the contact LIST sort.
    //
    // The harness injects a broadphase that reverses its pair list, leaving the bodies and their indices
    // untouched. That isolates the variable that matters: `querySpatialPairs` walks a Map of Sets, so its
    // order follows insertion and movement history, and a sequential-impulse solver applies each impulse
    // against the velocities the previous ones left. Without the canonical sort the answer would depend
    // on the broadphase's history.
    //
    // Note what this does NOT test, and what an insertion-order shuffle would wrongly claim: reordering
    // INSERTION changes the body indices, hence the canonical solve order, hence — legitimately — the
    // result. Canonical ordering buys DETERMINISM (same input, same output), not invariance to how the
    // scene was built. A harness asserting the latter asserts something false about Gauss-Seidel.
    const plain = createPhysics2DWorld();
    ground(plain);
    const plainLeft = box(plain, -0.9, 0.5);
    const plainRight = box(plain, 0.9, 0.5);
    const plainTop = box(plain, 0, 1.6);

    const reversed = createPhysics2DWorld(0, -9.81, createReversedPairBackend());
    ground(reversed);
    const reversedLeft = box(reversed, -0.9, 0.5);
    const reversedRight = box(reversed, 0.9, 0.5);
    const reversedTop = box(reversed, 0, 1.6);

    runSteps(plain, 90);
    runSteps(reversed, 90);

    expect(traceWorld(reversed)).toBe(traceWorld(plain));
    expect(reversedLeft.y).toBe(plainLeft.y);
    expect(reversedRight.y).toBe(plainRight.y);
    expect(reversedTop.y).toBe(plainTop.y);
  });

  it('orders every contact pair by body index however the broadphase hands it over', () => {
    // ORDER-INDEPENDENCE, OBLIGATION 1 — the per-pair BODY sort, which the harness above cannot see.
    // Reversing the pair LIST does not change which body of a pair reaches the narrow phase first; that
    // follows the pair's own field order. This backend swaps `a` and `b` within every pair, which is the
    // only thing that exercises it. Unordered, collision would resolve contact points on the opposite
    // surface and renumber their feature ids, silently discarding the warm-start cache every step.
    const swapped = createPhysics2DWorld(0, -9.81, createSwappedPairBackend());
    ground(swapped);
    const crate = box(swapped, 0.2, 1.4);
    runSteps(swapped, 120);

    for (const contact of swapped.contacts) expect(contact.bodyA).toBeLessThan(contact.bodyB);

    const plain = createPhysics2DWorld();
    ground(plain);
    const plainCrate = box(plain, 0.2, 1.4);
    runSteps(plain, 120);

    expect(crate.y).toBe(plainCrate.y);
    expect(crate.x).toBe(plainCrate.x);
    expect(crate.angle).toBe(plainCrate.angle);
  });

  it('keeps the contact list in a canonical order after a step', () => {
    const world = createPhysics2DWorld();
    ground(world);
    box(world, -0.9, 0.5);
    box(world, 0.9, 0.5);
    box(world, 0, 1.6);
    runSteps(world, 60);

    expect(world.contacts.length).toBeGreaterThan(1);
    for (let i = 1; i < world.contacts.length; i++) {
      const previous = world.contacts[i - 1];
      const current = world.contacts[i];
      const ordered =
        previous.bodyA < current.bodyA ||
        (previous.bodyA === current.bodyA &&
          (previous.bodyB < current.bodyB ||
            (previous.bodyB === current.bodyB && previous.colliderA <= current.colliderA)));
      expect(ordered).toBe(true);
    }
  });

  it('tips a box that overhangs a ledge instead of sliding off level', () => {
    // The proof that contact points carry torque. With only a minimum-translation vector and no point,
    // the lever arm is zero, the angular term vanishes, and an overhanging box slides off perfectly
    // level — which is what the whole contact-manifold lane exists to prevent.
    const world = createPhysics2DWorld();
    const ledge = createRigidBody2D('static', 0, 0);
    ledge.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -5, minY: -1, maxX: 0, maxY: 0 }, STONE));
    addPhysics2DBody(world, ledge);
    // The centre of mass must be BEYOND the support edge at x=0 for there to be a tipping moment at
    // all; a box whose centre still sits over the ledge is supported and correctly stays level.
    const crate = box(world, 0.2, 0.5);
    runSteps(world, 120);

    expect(Math.abs(crate.angle)).toBeGreaterThan(0.05);
  });

  it('leaves a sensor collider overlapping without pushing anything out of it', () => {
    const world = createPhysics2DWorld();
    const trigger = createRigidBody2D('static', 0, 0);
    trigger.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -2, minY: -2, maxX: 2, maxY: 2 }, STONE, true),
    );
    addPhysics2DBody(world, trigger);
    const crate = box(world, 0, 0);
    runSteps(world, 30);

    expect(world.contacts.some((contact) => contact.sensor)).toBe(true);
    // Gravity keeps pulling it: a sensor reports the overlap and applies no impulse.
    expect(crate.velocityY).toBeLessThan(-0.1);
  });

  it('ignores a non-positive timestep rather than integrating backwards', () => {
    const world = createPhysics2DWorld();
    ground(world);
    const crate = box(world, 0, 2);
    const before = traceWorld(world);
    stepPhysics2D(world, 0);
    stepPhysics2D(world, -1 / 60);
    expect(traceWorld(world)).toBe(before);
    expect(crate.y).toBe(2);
  });
});
