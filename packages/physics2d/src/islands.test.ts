import type { Physics2DWorld, RigidBody2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { isRigidBody2DPairAwake, updatePhysics2DSleep, wakePhysics2DBody } from './islands';
import { addPhysics2DBody, createPhysics2DWorld, createRigidBody2D } from './world';

// A contact carries no mass properties and no geometry that sleep cares about — only which two bodies it
// links — so the island tests build the linkage directly rather than dropping shapes on each other and
// hoping the narrow phase produces the pair under test.
function link(world: Physics2DWorld, a: Readonly<RigidBody2D>, b: Readonly<RigidBody2D>, sensor = false): void {
  world.contacts.push({
    bodyA: Math.min(a.index, b.index),
    bodyB: Math.max(a.index, b.index),
    colliderA: 0,
    colliderB: 0,
    normalX: 0,
    normalY: 1,
    pointCount: 0,
    points: [],
    friction: 0,
    restitution: 0,
    sensor,
    touching: true,
  });
}

function still(world: Physics2DWorld, x = 0): RigidBody2D {
  return addPhysics2DBody(world, createRigidBody2D('dynamic', x, 0));
}

function moving(world: Physics2DWorld, x = 0): RigidBody2D {
  const body = addPhysics2DBody(world, createRigidBody2D('dynamic', x, 0));
  body.velocityX = 5;
  return body;
}

describe('isRigidBody2DPairAwake', () => {
  it('reports a pair awake when one end is an awake dynamic body', () => {
    const world = createPhysics2DWorld();
    const anchor = addPhysics2DBody(world, createRigidBody2D('static', 0, 0));
    const crate = still(world);

    expect(isRigidBody2DPairAwake(anchor, crate)).toBe(true);
  });

  it('reports a pair asleep when both ends are sleeping', () => {
    const world = createPhysics2DWorld();
    const first = still(world, 0);
    const second = still(world, 1);
    first.sleeping = true;
    second.sleeping = true;

    expect(isRigidBody2DPairAwake(first, second)).toBe(false);
  });

  it('reports a sleeper anchored to static scenery asleep', () => {
    const world = createPhysics2DWorld();
    const anchor = addPhysics2DBody(world, createRigidBody2D('static', 0, 0));
    const crate = still(world);
    crate.sleeping = true;

    expect(isRigidBody2DPairAwake(anchor, crate)).toBe(false);
  });
});

describe('updatePhysics2DSleep', () => {
  it('sleeps a body that has been still for the full timeToSleep', () => {
    const world = createPhysics2DWorld();
    const crate = still(world);

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(crate.sleeping).toBe(true);
  });

  it('leaves a still body awake until timeToSleep has elapsed', () => {
    const world = createPhysics2DWorld();
    const crate = still(world);

    updatePhysics2DSleep(world, world.config.timeToSleep - 0.01);

    expect(crate.sleeping).toBe(false);
    expect(crate.sleepTimer).toBeCloseTo(world.config.timeToSleep - 0.01);
  });

  it('resets the timer of a body moving faster than the linear threshold', () => {
    const world = createPhysics2DWorld();
    const crate = still(world);
    updatePhysics2DSleep(world, 0.4);
    crate.velocityX = world.config.sleepLinearThreshold * 10;

    updatePhysics2DSleep(world, 0.4);

    expect(crate.sleepTimer).toBe(0);
    expect(crate.sleeping).toBe(false);
  });

  it('resets the timer of a body spinning faster than the angular threshold', () => {
    const world = createPhysics2DWorld();
    const crate = still(world);
    updatePhysics2DSleep(world, 0.4);
    crate.angularVelocity = world.config.sleepAngularThreshold * 10;

    updatePhysics2DSleep(world, 0.4);

    expect(crate.sleepTimer).toBe(0);
    expect(crate.sleeping).toBe(false);
  });

  it('treats a body carrying an applied force as moving even at zero velocity', () => {
    const world = createPhysics2DWorld();
    const crate = still(world);
    crate.forceX = 100;

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(crate.sleeping).toBe(false);
    expect(crate.sleepTimer).toBe(0);
  });

  it('treats a body carrying an applied torque as moving even at zero velocity', () => {
    const world = createPhysics2DWorld();
    const crate = still(world);
    crate.torque = 100;

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(crate.sleeping).toBe(false);
  });

  it('zeroes the velocity of a body it puts to sleep', () => {
    const world = createPhysics2DWorld();
    const crate = still(world);
    // Under both thresholds, so it still qualifies as at rest — but not exactly zero, which is the drift
    // a sleeping body would otherwise resume on waking.
    crate.velocityX = world.config.sleepLinearThreshold / 2;
    crate.angularVelocity = world.config.sleepAngularThreshold / 2;

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(crate.sleeping).toBe(true);
    expect(crate.velocityX).toBe(0);
    expect(crate.angularVelocity).toBe(0);
  });

  it('keeps a contact island awake while any one member is moving', () => {
    const world = createPhysics2DWorld();
    const settled = still(world, 0);
    const shoved = moving(world, 1);
    link(world, settled, shoved);

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(shoved.sleeping).toBe(false);
    expect(settled.sleeping).toBe(false);
  });

  it('keeps a transitively linked member awake through an intermediate body', () => {
    const world = createPhysics2DWorld();
    const settled = still(world, 0);
    const middle = still(world, 1);
    const shoved = moving(world, 2);
    link(world, settled, middle);
    link(world, middle, shoved);

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(settled.sleeping).toBe(false);
  });

  it('keeps a joint island awake while any one member is moving', () => {
    const world = createPhysics2DWorld();
    const settled = still(world, 0);
    const shoved = moving(world, 1);
    world.joints.push({ kind: 'test', bodyA: settled.index, bodyB: shoved.index, collideConnected: false } as never);

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(settled.sleeping).toBe(false);
  });

  it('does not let a shared static body merge two islands', () => {
    // The failure this prevents is world-sized: every crate in a level rests on the same ground, so a
    // static bridge would make the whole level one island that sleeps only when nothing anywhere moves.
    const world = createPhysics2DWorld();
    const ground = addPhysics2DBody(world, createRigidBody2D('static', 0, 0));
    const settled = still(world, 0);
    const shoved = moving(world, 20);
    link(world, ground, settled);
    link(world, ground, shoved);

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(settled.sleeping).toBe(true);
    expect(shoved.sleeping).toBe(false);
  });

  it('does not let a sensor contact merge two islands', () => {
    // A sensor reports overlap and resolves nothing, so it transmits no motion between the bodies it
    // reports on and must not hold a settled body awake.
    const world = createPhysics2DWorld();
    const settled = still(world, 0);
    const shoved = moving(world, 1);
    link(world, settled, shoved, true);

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(settled.sleeping).toBe(true);
  });

  it('leaves static bodies neither asleep nor accumulating a timer', () => {
    const world = createPhysics2DWorld();
    const ground = addPhysics2DBody(world, createRigidBody2D('static', 0, 0));

    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    expect(ground.sleeping).toBe(false);
    expect(ground.sleepTimer).toBe(0);
  });

  it('wakes everything already asleep when allowSleeping is turned off', () => {
    // A body left asleep after the mechanism is disabled would never be integrated again, so it would
    // hang frozen for the rest of the session.
    const world = createPhysics2DWorld();
    const crate = still(world);
    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);
    expect(crate.sleeping).toBe(true);

    world.config.allowSleeping = false;
    updatePhysics2DSleep(world, 0.016);

    expect(crate.sleeping).toBe(false);
    expect(crate.sleepTimer).toBe(0);
  });

  it('clears the timer of a body it wakes so rest has to be earned again', () => {
    const world = createPhysics2DWorld();
    const settled = still(world, 0);
    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);
    expect(settled.sleeping).toBe(true);

    const shoved = moving(world, 1);
    link(world, settled, shoved);
    updatePhysics2DSleep(world, 0.016);

    expect(settled.sleeping).toBe(false);
    expect(settled.sleepTimer).toBe(0);
  });
});

describe('wakePhysics2DBody', () => {
  it('clears both the sleeping flag and the stillness timer', () => {
    const world = createPhysics2DWorld();
    const crate = still(world);
    updatePhysics2DSleep(world, world.config.timeToSleep + 0.01);

    wakePhysics2DBody(crate);

    expect(crate.sleeping).toBe(false);
    expect(crate.sleepTimer).toBe(0);
  });
});
