import {
  addLogSink,
  clearLogOnceKeys,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogEntry, Physics2DDistanceJoint, Physics2DWorld, RigidBody2D } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { arePhysics2DGuardsEnabled, disablePhysics2DGuards, enablePhysics2DGuards } from './enablePhysics2DGuards';
import { addPhysics2DJoint } from './jointRegistry';
import { Physics2DDistanceJointKind } from './joints';
import { registerBuiltInPhysics2DJointSolvers } from './registerBuiltInPhysics2DJointSolvers';
import { stepPhysics2D } from './step';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function ball(world: Physics2DWorld, type: RigidBody2D['type'], x: number, y: number): RigidBody2D {
  const body = createRigidBody2D(type, x, y);
  body.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }, STONE));
  return addPhysics2DBody(world, body);
}

// A world with one distance joint and NO solver registered for it — the exact shape of the mistake the
// joint guard exists for, since registration is opt-in so that unused solvers tree-shake away.
function unregisteredJointWorld(): Physics2DWorld {
  const world = createPhysics2DWorld(0, -10);
  const anchor = ball(world, 'static', 0, 0);
  const bob = ball(world, 'dynamic', 0, -3);
  const joint: Physics2DDistanceJoint = {
    kind: Physics2DDistanceJointKind,
    bodyA: anchor.index,
    bodyB: bob.index,
    localAnchorAX: 0,
    localAnchorAY: 0,
    localAnchorBX: 0,
    localAnchorBY: 0,
    collideConnected: false,
    breakForce: Number.POSITIVE_INFINITY,
    breakTorque: Number.POSITIVE_INFINITY,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
    length: 3,
    frequencyHz: 0,
    dampingRatio: 0,
  };
  addPhysics2DJoint(world, joint);
  return world;
}

beforeEach(() => {
  // `logOnce` keys are process-global and this file deliberately provokes the same faults repeatedly.
  clearLogOnceKeys();
});

afterEach(() => {
  disablePhysics2DGuards();
});

describe('arePhysics2DGuardsEnabled', () => {
  it('reports the current module guard state', () => {
    expect(arePhysics2DGuardsEnabled()).toBe(false);
    enablePhysics2DGuards();
    expect(arePhysics2DGuardsEnabled()).toBe(true);
    disablePhysics2DGuards();
    expect(arePhysics2DGuardsEnabled()).toBe(false);
  });
});

describe('disablePhysics2DGuards', () => {
  it('removes both seams so a declined step and an unsolved joint are silent again', () => {
    enablePhysics2DGuards();
    disablePhysics2DGuards();
    const declining = createPhysics2DWorld(0, -10);
    declining.config.positionIterations = -3;

    const entries = captureLog(() => {
      stepPhysics2D(declining, 1 / 60);
      stepPhysics2D(unregisteredJointWorld(), 1 / 60);
    });

    expect(entries).toHaveLength(0);
  });
});

describe('enablePhysics2DGuards', () => {
  it('reports a collider kind the contact dispatcher has no arm for', () => {
    // The third seam, and the one that stops a capsule from being a silent trap: it is a valid collider
    // the type system admits and the solver cannot see, so without this a body carrying one falls
    // through the world with nothing failing anywhere.
    enablePhysics2DGuards();
    const world = createPhysics2DWorld(0, -10);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'capsule', x0: 0, y0: 0, x1: 1, y1: 0, radius: 0.4 }, STONE));
    addPhysics2DBody(world, body);

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    expect(entries).toHaveLength(1);
    const data = entries[0].data as { kinds: string[]; message: string; status: string };
    expect(data.status).toBe('missing-contact-support');
    expect(data.kinds).toEqual(['capsule']);
    // Named as a gap rather than as a modelling mistake, which is the distinction a caller acts on.
    expect(data.message).toContain('no pair functions');
    expect(data.message).not.toContain('no area');
  });

  it('tells an area-less collider apart from an unimplemented one', () => {
    enablePhysics2DGuards();
    const world = createPhysics2DWorld(0, -10);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 0 }, STONE));
    addPhysics2DBody(world, body);

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    const data = entries[0].data as { message: string };
    expect(data.message).toContain('no area');
    expect(data.message).not.toContain('no pair functions');
  });

  it('says nothing about colliders the dispatcher does answer for', () => {
    enablePhysics2DGuards();
    const world = createPhysics2DWorld(0, -10);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 0.5 }, STONE));
    addPhysics2DBody(world, body);

    expect(captureLog(() => stepPhysics2D(world, 1 / 60))).toHaveLength(0);
  });

  it('says nothing while a healthy world steps', () => {
    enablePhysics2DGuards();
    const world = createPhysics2DWorld(0, -10);
    ball(world, 'static', 0, 0);
    ball(world, 'dynamic', 0, 2);

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    // A guard that fired on a healthy step would be worse than none: the message is supposed to mean
    // something has stopped working.
    expect(entries).toHaveLength(0);
  });

  it('says nothing about joints once their solvers are registered', () => {
    enablePhysics2DGuards();
    const world = unregisteredJointWorld();
    registerBuiltInPhysics2DJointSolvers(world);

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    expect(entries).toHaveLength(0);
  });

  it('names every failing precondition at once, not only the first', () => {
    // The step's own condition short-circuits, so surfacing one fault per frame would cost a round trip
    // per fault. The explain seam exists to avoid exactly that and the guard must not reintroduce it.
    enablePhysics2DGuards();
    const world = createPhysics2DWorld(Number.NaN, -10);
    world.config.positionIterations = -3;

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    expect(entries).toHaveLength(1);
    const data = entries[0].data as { failing: string[]; status: string };
    expect(data.status).toBe('invalid-step');
    expect(data.failing).toContain('gravityValid');
    expect(data.failing).toContain('positionIterationsValid');
  });

  it('reports a joint whose kind has no registered solver, on a step that otherwise succeeds', () => {
    // The case the whole second seam is for. The world steps, the bob falls, nothing fails — and the
    // rope it is supposed to be hanging from is simply not there.
    enablePhysics2DGuards();
    const world = unregisteredJointWorld();

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    expect(entries).toHaveLength(1);
    const data = entries[0].data as { faults: string[]; status: string };
    expect(data.status).toBe('unresolved-joints');
    expect(data.faults).toEqual(['Distance:solver-unregistered']);
    expect(String(entries[0].data && (entries[0].data as { message: string }).message)).toContain(
      'registerBuiltInPhysics2DJointSolvers',
    );
    // The step really did run — this is a warning about a world that is otherwise working, which is what
    // makes it hard to notice without the guard.
    expect(world.bodies[1].velocityY).toBeLessThan(0);
  });

  it('reports a joint whose endpoint body is gone with endpoint advice, not registration advice', () => {
    enablePhysics2DGuards();
    const world = unregisteredJointWorld();
    registerBuiltInPhysics2DJointSolvers(world);
    world.joints[0].bodyB = 9999;

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    expect(entries).toHaveLength(1);
    const data = entries[0].data as { faults: string[]; message: string };
    expect(data.faults).toEqual(['Distance:body-b-missing']);
    expect(data.message).toContain('removed with the body');
    expect(data.message).not.toContain('registerBuiltInPhysics2DJointSolvers');
  });

  it('collapses many identically broken joints into one report', () => {
    // A ragdoll with a dozen unregistered joints of the same kind is ONE mistake. Listing twelve indices
    // would read as twelve, and re-keying per index would defeat logOnce entirely.
    enablePhysics2DGuards();
    const world = unregisteredJointWorld();
    for (let extra = 0; extra < 11; extra++) {
      addPhysics2DJoint(world, { ...world.joints[0], impulse0: 0 });
    }
    expect(world.joints).toHaveLength(12);

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    expect(entries).toHaveLength(1);
    expect((entries[0].data as { faults: string[] }).faults).toEqual(['Distance:solver-unregistered']);
    expect((entries[0].data as { message: string }).message).toContain('12 of 12');
  });

  it('warns once for a repeated fault rather than once per frame', () => {
    enablePhysics2DGuards();
    const world = unregisteredJointWorld();

    const entries = captureLog(() => {
      for (let step = 0; step < 60; step++) stepPhysics2D(world, 1 / 60);
    });

    expect(entries).toHaveLength(1);
  });

  it('still speaks when a second, different fault appears after the first', () => {
    // The counterpart risk of keying on the fault set: a world that develops a new problem must not be
    // silenced by having already reported the old one.
    enablePhysics2DGuards();
    const world = unregisteredJointWorld();

    const entries = captureLog(() => {
      stepPhysics2D(world, 1 / 60);
      registerBuiltInPhysics2DJointSolvers(world);
      world.joints[0].bodyA = 9999;
      stepPhysics2D(world, 1 / 60);
    });

    expect(entries).toHaveLength(2);
    expect((entries[1].data as { faults: string[] }).faults).toEqual(['Distance:body-a-missing']);
  });

  it('does not add the joint complaint on top of a declined step', () => {
    // A declined step advanced nothing at all, so its own message is the whole story. Repeating the joint
    // finding underneath it would bury the reason the world is frozen.
    enablePhysics2DGuards();
    const world = unregisteredJointWorld();
    world.config.velocityIterations = -1;

    const entries = captureLog(() => stepPhysics2D(world, 1 / 60));

    expect(entries).toHaveLength(1);
    expect((entries[0].data as { status: string }).status).toBe('invalid-step');
  });
});
