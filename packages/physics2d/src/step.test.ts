import { createUniformGridSpatialBackend } from '@flighthq/spatial/contract';
import type { Physics2DWorld, RigidBody2D, SpatialIndexBackend, SpatialPair } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry';
import { physics2DDistanceJointSolver } from './joints';
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

describe('a body the step declines leaves the broadphase', () => {
  // The divergence filter said the declined body "stops colliding", but it only skipped the index
  // UPDATE — whatever AABB the body had last step stayed indexed, so it kept producing pairs and
  // holding live contacts from its last valid pose. Skipping an update is not withdrawing.
  function dynamicBox(world: Physics2DWorld, x: number): RigidBody2D {
    const body = createRigidBody2D('dynamic', x, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
    return addPhysics2DBody(world, body);
  }

  function widenPastLimit(body: RigidBody2D): void {
    const local = body.colliders[0].local as { maxX: number; maxY: number; minX: number; minY: number };
    local.minX = -1e8;
    local.minY = -1e8;
    local.maxX = 1e8;
    local.maxY = 1e8;
  }

  it('drops the contact of a body that diverges past the simulated extent', () => {
    const world = createPhysics2DWorld(0, 0);
    const diverging = dynamicBox(world, 0);
    dynamicBox(world, 0.5);
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(1);

    widenPastLimit(diverging);
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(0);
  });

  it('leaves the rest of the world simulating after one body diverges', () => {
    // The filter's whole promise: one diverged body stops colliding, everything else carries on.
    const world = createPhysics2DWorld(0, 0);
    const diverging = dynamicBox(world, 0);
    const near = dynamicBox(world, 0.5);
    const other = dynamicBox(world, 20);
    const alsoOther = dynamicBox(world, 20.5);
    stepPhysics2D(world, 1 / 60);
    widenPastLimit(diverging);
    stepPhysics2D(world, 1 / 60);

    // Only the untouched pair still has a contact; the diverged body's is gone.
    const names = world.contacts.map((c) => `${c.bodyA}-${c.bodyB}`);
    expect(names).toEqual([`${other.index}-${alsoOther.index}`]);
    // And "still simulating" means still moving: `near` overlapped the diverging body on the first
    // step and was pushed off it, so asserting it held position would have contradicted this title.
    expect(near.x).toBeGreaterThan(0.5);
    expect(Number.isFinite(near.x)).toBe(true);
  });

  it('withdraws a body whose colliders stop producing bounds from the index', () => {
    // Asserted on the index rather than on contacts. A body with no colliders produces no manifold
    // either way, so a contact-only assertion passes whether or not the withdrawal happens — it would
    // have been a test that agreed with the bug. The index is where the difference actually shows.
    const world = createPhysics2DWorld(0, 0);
    const emptied = dynamicBox(world, 0);
    dynamicBox(world, 0.5);
    stepPhysics2D(world, 1 / 60);

    const before: number[] = [];
    world.index.querySpatialRegion({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, before);
    expect(before).toContain(emptied.index);

    emptied.colliders.length = 0;
    stepPhysics2D(world, 1 / 60);

    const after: number[] = [];
    world.index.querySpatialRegion({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, after);
    expect(after).not.toContain(emptied.index);
    expect(world.contacts).toHaveLength(0);
  });

  it('withdraws a diverged body from the index, not merely from the update', () => {
    const world = createPhysics2DWorld(0, 0);
    const diverging = dynamicBox(world, 0);
    dynamicBox(world, 0.5);
    stepPhysics2D(world, 1 / 60);

    widenPastLimit(diverging);
    stepPhysics2D(world, 1 / 60);

    const after: number[] = [];
    world.index.querySpatialRegion({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, after);
    expect(after).not.toContain(diverging.index);
  });

  it('re-enters the broadphase when the body comes back inside the limit', () => {
    const world = createPhysics2DWorld(0, 0);
    const diverging = dynamicBox(world, 0);
    dynamicBox(world, 0.5);
    stepPhysics2D(world, 1 / 60);
    widenPastLimit(diverging);
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(0);

    const local = diverging.colliders[0].local as { maxX: number; maxY: number; minX: number; minY: number };
    local.minX = -0.5;
    local.minY = -0.5;
    local.maxX = 0.5;
    local.maxY = 0.5;
    stepPhysics2D(world, 1 / 60);
    expect(world.contacts).toHaveLength(1);
  });
});

describe('sensor reporting between immovable bodies', () => {
  // A sensor is reported, never resolved — the solver already skips sensor contacts. The step's
  // "two immovable bodies have no constraint to solve" shortcut ran before any collider was
  // inspected, so it deleted every sensor overlap between immovable bodies as well. A static trigger
  // volume over static scenery is an ordinary thing to build, and it reported nothing at all.
  function immovable(world: Physics2DWorld, x: number, sensor: boolean): RigidBody2D {
    const body = createRigidBody2D('static', x, 0);
    body.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE, sensor),
    );
    return addPhysics2DBody(world, body);
  }

  it('reports a static sensor overlapping a static collider', () => {
    const world = createPhysics2DWorld(0, 0);
    immovable(world, 0, true);
    immovable(world, 0, false);
    stepPhysics2D(world, 1 / 60);
    expect(world.events.began).toHaveLength(1);
    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].sensor).toBe(true);
  });

  it('still skips two immovable bodies when neither senses', () => {
    // The shortcut is right for the case it was written for, and must survive the fix.
    const world = createPhysics2DWorld(0, 0);
    immovable(world, 0, false);
    immovable(world, 0, false);
    stepPhysics2D(world, 1 / 60);
    expect(world.events.began).toHaveLength(0);
    expect(world.contacts).toHaveLength(0);
  });

  // Every existing case above gives each body exactly one collider, which is why the body-level guard
  // looked sufficient. Owning a sensor ANYWHERE does not make a body's other colliders reportable:
  // these two static bodies overlap solid-on-solid, and the disjoint trigger volume must not smuggle
  // that pair past the immovable shortcut.
  function immovableWithSensorAndSolid(world: Physics2DWorld, x: number): RigidBody2D {
    const body = createRigidBody2D('static', x, 0);
    // A trigger volume far away from the solid part, so it overlaps nothing.
    body.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: 99.5, minY: -0.5, maxX: 100.5, maxY: 0.5 }, STONE, true),
    );
    body.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE, false),
    );
    return addPhysics2DBody(world, body);
  }

  it('reports nothing when the overlapping colliders are both solid and both bodies are immovable', () => {
    const world = createPhysics2DWorld(0, 0);
    immovableWithSensorAndSolid(world, 0);
    immovable(world, 0, false);

    stepPhysics2D(world, 1 / 60);

    expect(world.events.began).toHaveLength(0);
    expect(world.contacts).toHaveLength(0);
  });

  // The other half of the same class: the sensor collider on that body must still report when it is
  // the one actually overlapping, so the pair-level test is not just a blanket suppression.
  it('still reports the sensor collider of a mixed body when that collider overlaps', () => {
    const world = createPhysics2DWorld(0, 0);
    immovableWithSensorAndSolid(world, 0);
    immovable(world, 100, false);

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts).toHaveLength(1);
    expect(world.contacts[0].sensor).toBe(true);
  });

  // A movable body is unaffected by the immovable test, so its solid contacts still resolve even when
  // the other body carries a sensor.
  it('keeps a solid contact when one body can move', () => {
    const world = createPhysics2DWorld(0, 0);
    immovableWithSensorAndSolid(world, 0);
    box(world, 0, 0);

    stepPhysics2D(world, 1 / 60);

    expect(world.contacts.some((contact) => !contact.sensor)).toBe(true);
  });

  it('resolves nothing for a static sensor pair — reporting is not colliding', () => {
    const world = createPhysics2DWorld(0, 0);
    const sensor = immovable(world, 0, true);
    const scenery = immovable(world, 0, false);
    stepPhysics2D(world, 1 / 60);
    expect(sensor.x).toBe(0);
    expect(scenery.x).toBe(0);
    expect(sensor.velocityX).toBe(0);
  });

  it('ends a static sensor contact when the overlap stops', () => {
    const world = createPhysics2DWorld(0, 0);
    const sensor = immovable(world, 0, true);
    immovable(world, 0, false);
    stepPhysics2D(world, 1 / 60);
    expect(world.events.began).toHaveLength(1);
    sensor.x = 100;
    stepPhysics2D(world, 1 / 60);
    expect(world.events.ended).toHaveLength(1);
    expect(world.contacts).toHaveLength(0);
  });
});

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

describe('stepPhysics2D contact events', () => {
  it('reports a contact beginning and ending, read off the cache transitions', () => {
    const world = createPhysics2DWorld();
    ground(world);
    const crate = box(world, 0, 3);
    runSteps(world, 1);
    expect(world.events.began).toHaveLength(0);

    // Fall until it lands: the step that creates the contact is the begin.
    let began = 0;
    for (let i = 0; i < 200 && began === 0; i++) {
      stepPhysics2D(world, 1 / 60);
      began += world.events.began.length;
    }
    expect(began).toBe(1);

    // Teleport it away: the step that drops the contact is the end.
    crate.y = 50;
    crate.velocityY = 0;
    stepPhysics2D(world, 1 / 60);
    expect(world.events.ended).toHaveLength(1);
    expect(world.contacts).toHaveLength(0);
  });

  it('clears its event buffers each step rather than accumulating', () => {
    const world = createPhysics2DWorld();
    ground(world);
    box(world, 0, 0.4);
    runSteps(world, 5);
    expect(world.events.began).toHaveLength(0);
    expect(world.events.ended).toHaveLength(0);
  });
});

describe('stepPhysics2D with joints', () => {
  const DISTANCE = 'Distance';

  function jointedWorld(index?: SpatialIndexBackend) {
    const world = createPhysics2DWorld(0, -9.81, index);
    registerPhysics2DJointSolver(world, DISTANCE, physics2DDistanceJointSolver);
    ground(world);
    // Created static, not mutated to static after the fact: mass properties are derived at insertion, so
    // flipping the type afterwards leaves a nonzero inverse mass on a body that never integrates its
    // position — it accumulates velocity forever and drags whatever is jointed to it out of the world.
    const anchorBody = createRigidBody2D('static', 0, 4);
    anchorBody.colliders.push(
      createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE),
    );
    const anchor = addPhysics2DBody(world, anchorBody);
    const left = box(world, -1, 2);
    const right = box(world, 1, 2);
    for (const bob of [left, right]) {
      addPhysics2DJoint(world, {
        kind: DISTANCE,
        bodyA: anchor.index,
        bodyB: bob.index,
        localAnchorAX: 0,
        localAnchorAY: 0,
        localAnchorBX: 0,
        localAnchorBY: 0,
        collideConnected: false,
        impulse0: 0,
        impulse1: 0,
        impulse2: 0,
        rAX: 0,
        rAY: 0,
        rBX: 0,
        rBY: 0,
        length: 2,
        stiffness: 0,
        damping: 0,
      } as never);
    }
    return { left, right, world };
  }

  it('produces the same trace when the broadphase reports its pairs in the opposite order', () => {
    // OBLIGATION 2 EXTENDED TO P2. Joints share the contact list's iteration loop, so the contact sort has
    // to keep holding once joints are also constraining the same bodies — a scene whose contacts reorder
    // now perturbs the joint solve too.
    const plain = jointedWorld();
    const reversed = jointedWorld(createReversedPairBackend());
    runSteps(plain.world, 120);
    runSteps(reversed.world, 120);
    expect(traceWorld(reversed.world)).toBe(traceWorld(plain.world));
  });

  it('orders every contact pair by body index with joints present', () => {
    // OBLIGATION 1 EXTENDED TO P2.
    const { world } = jointedWorld(createSwappedPairBackend());
    runSteps(world, 120);
    for (const contact of world.contacts) expect(contact.bodyA).toBeLessThan(contact.bodyB);
    for (const joint of world.joints) expect(joint.bodyA).toBeLessThan(joint.bodyB);
  });

  it('is bit-for-bit repeatable with joints in the solve list', () => {
    const first = jointedWorld();
    const second = jointedWorld();
    runSteps(first.world, 90);
    runSteps(second.world, 90);
    expect(traceWorld(second.world)).toBe(traceWorld(first.world));
  });

  it('suppresses the contact between jointed bodies unless the joint asks for it', () => {
    // A jointed pair almost always overlaps at the anchor, and resolving that contact fights the
    // constraint holding them together.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, DISTANCE, physics2DDistanceJointSolver);
    const a = box(world, 0, 0);
    const b = box(world, 0.2, 0);
    addPhysics2DJoint(world, {
      kind: DISTANCE,
      bodyA: a.index,
      bodyB: b.index,
      localAnchorAX: 0,
      localAnchorAY: 0,
      localAnchorBX: 0,
      localAnchorBY: 0,
      collideConnected: false,
      impulse0: 0,
      impulse1: 0,
      impulse2: 0,
      rAX: 0,
      rAY: 0,
      rBX: 0,
      rBY: 0,
      length: 0.2,
      stiffness: 0,
      damping: 0,
    } as never);
    runSteps(world, 10);
    expect(world.contacts).toHaveLength(0);
  });
});
