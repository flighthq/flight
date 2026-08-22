import {
  addPhysics2DBody,
  createPhysics2DCollider,
  createPhysics2DRevoluteJoint,
  createPhysics2DWorld,
  createRigidBody2D,
  registerBuiltInPhysics2DJointSolvers,
  addPhysics2DJoint,
  stepPhysics2D,
} from '@flighthq/physics2d/contract';
import type { CollisionBuiltInShape2D, Physics2DAbiCommandBuffer, RigidBody2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics2DAbi, readPhysics2DAbiBodies, stepPhysics2DAbiWorld } from './physics2DAbi';
import {
  createPhysics2DAbiBodyBuffer,
  createPhysics2DAbiCommandBuffer,
  createPhysics2DAbiExecutionResult,
  createPhysics2DAbiJointBuffer,
} from './physics2DAbiBuffer';
import {
  writePhysics2DAbiApplyLinearImpulseCommand,
  writePhysics2DAbiSetBodyCommand,
  writePhysics2DAbiSetColliderCommand,
  writePhysics2DAbiSetGravityCommand,
  writePhysics2DAbiSetJointCommand,
} from './physics2DAbiCommand';
import { Physics2DAbiBodyValue, Physics2DAbiJointFlag } from './physics2DAbiLayout';

const MATERIAL = { density: 1, friction: 0.3, restitution: 0 };

function box(halfW: number, halfH: number): CollisionBuiltInShape2D {
  return { kind: 'aabb', minX: -halfW, minY: -halfH, maxX: halfW, maxY: halfH };
}

function publish(commands: Physics2DAbiCommandBuffer, bodies: readonly Readonly<RigidBody2D>[]): void {
  let colliderId = 1;
  for (let i = 0; i < bodies.length; i += 1) {
    expect(writePhysics2DAbiSetBodyCommand(commands, i + 1, bodies[i])).toBe(true);
    for (const collider of bodies[i].colliders) {
      expect(writePhysics2DAbiSetColliderCommand(commands, colliderId++, i + 1, collider)).toBe(true);
    }
  }
}

describe('createReferencePhysics2DAbi', () => {
  // The load-bearing test of the whole package. Every other test here checks that the ABI is
  // self-consistent; this one checks it means what Physics2D means, by running the SAME scene through
  // the standard object API and asserting the trajectories agree to the bit. A wire contract that
  // round-trips perfectly and simulates something else is worthless.
  it('reproduces the standard solver exactly, over a settling stack', () => {
    const shapes = [box(6, 0.5), box(0.5, 0.5), box(0.5, 0.5), box(0.5, 0.5)];
    const poses: [RigidBody2D['type'], number, number][] = [
      ['static', 0, -0.5],
      ['dynamic', 0, 0.5],
      ['dynamic', 0.2, 1.6],
      ['dynamic', -0.1, 2.7],
    ];

    const world = createPhysics2DWorld();
    registerBuiltInPhysics2DJointSolvers(world);
    const bodies = poses.map(([type, x, y], i) => {
      const body = createRigidBody2D(type, x, y);
      body.colliders.push(createPhysics2DCollider(shapes[i], MATERIAL));
      addPhysics2DBody(world, body);
      return body;
    });

    const abi = createPhysics2DAbi();
    const handle = abi.createWorld();
    const commands = createPhysics2DAbiCommandBuffer(8192);
    publish(commands, bodies);
    const result = createPhysics2DAbiExecutionResult();
    expect(abi.execute(handle, commands, result)).toBe(true);

    const out = createPhysics2DAbiBodyBuffer(8);
    for (let step = 0; step < 120; step += 1) {
      stepPhysics2D(world, 1 / 60);
      expect(stepPhysics2DAbiWorld(abi, handle, 1 / 60)).toBe('Complete');
    }
    expect(readPhysics2DAbiBodies(abi, handle, null, out)).toBe(true);
    expect(out.count).toBe(4);

    for (let i = 0; i < bodies.length; i += 1) {
      const base = i * 17;
      expect(out.values[base + Physics2DAbiBodyValue.X], `body ${String(i)} x`).toBe(bodies[i].x);
      expect(out.values[base + Physics2DAbiBodyValue.Y], `body ${String(i)} y`).toBe(bodies[i].y);
      expect(out.values[base + Physics2DAbiBodyValue.Angle], `body ${String(i)} angle`).toBe(bodies[i].angle);
      expect(out.values[base + Physics2DAbiBodyValue.VelocityX]).toBe(bodies[i].velocityX);
      expect(out.values[base + Physics2DAbiBodyValue.VelocityY]).toBe(bodies[i].velocityY);
      expect(out.values[base + Physics2DAbiBodyValue.AngularVelocity]).toBe(bodies[i].angularVelocity);
    }
    // The stack must actually have done something, or bit-equality is a statement about two worlds
    // that both did nothing.
    expect(bodies[3].y).toBeLessThan(2.7);
  });

  it('derives mass from colliders rather than from the wire', () => {
    // Mass is the one body block the mutation path deliberately ignores, so a command carrying a
    // fabricated mass must not produce a body that weighs it. Physics2D derives mass from collider
    // geometry and density, and the ABI keeps that the single source.
    const source = createRigidBody2D('dynamic', 0, 0);
    source.colliders.push(createPhysics2DCollider(box(1, 1), MATERIAL));
    const world = createPhysics2DWorld();
    addPhysics2DBody(world, source);
    const derivedMass = source.mass;
    expect(derivedMass).toBeGreaterThan(0);

    const abi = createPhysics2DAbi();
    const handle = abi.createWorld();
    const commands = createPhysics2DAbiCommandBuffer(4096);
    source.mass = 12345;
    expect(writePhysics2DAbiSetBodyCommand(commands, 1, source)).toBe(true);
    expect(writePhysics2DAbiSetColliderCommand(commands, 1, 1, source.colliders[0])).toBe(true);
    expect(abi.execute(handle, commands, createPhysics2DAbiExecutionResult())).toBe(true);

    const out = createPhysics2DAbiBodyBuffer(1);
    expect(readPhysics2DAbiBodies(abi, handle, null, out)).toBe(true);
    expect(out.values[Physics2DAbiBodyValue.Mass]).toBe(derivedMass);
    expect(out.values[Physics2DAbiBodyValue.Mass]).not.toBe(12345);
  });

  it('reports a joint that broke, which the world no longer holds', () => {
    // A 2D joint does not carry a `broken` field: breaking REMOVES it. So the readback flag is the
    // only channel by which a caller holding an id can learn its joint is gone, and it must arrive
    // with the load that did it.
    const anchor = createRigidBody2D('static', 0, 0);
    const hanging = createRigidBody2D('dynamic', 0, -1);
    hanging.colliders.push(createPhysics2DCollider(box(0.5, 0.5), MATERIAL));
    const joint = createPhysics2DRevoluteJoint({ bodyA: 0, bodyB: 1, breakForce: 0.001 });

    const abi = createPhysics2DAbi();
    const handle = abi.createWorld();
    const commands = createPhysics2DAbiCommandBuffer(4096);
    publish(commands, [anchor, hanging]);
    expect(writePhysics2DAbiSetJointCommand(commands, 1, 1, 2, joint)).toBe(true);
    expect(abi.execute(handle, commands, createPhysics2DAbiExecutionResult())).toBe(true);

    expect(stepPhysics2DAbiWorld(abi, handle, 1 / 60)).toBe('Complete');
    const joints = createPhysics2DAbiJointBuffer(4);
    expect(abi.readJoints(handle, joints)).toBe(true);
    expect(joints.count).toBe(1);
    expect(joints.ids[0]).toBe(1);
    expect(joints.flags[0] & Physics2DAbiJointFlag.Broken).toBe(Physics2DAbiJointFlag.Broken);
    expect(Math.hypot(joints.values[0], joints.values[1])).toBeGreaterThan(0);
  });

  it('keeps a joint reported and unbroken while it holds', () => {
    const anchor = createRigidBody2D('static', 0, 0);
    const hanging = createRigidBody2D('dynamic', 0, -1);
    hanging.colliders.push(createPhysics2DCollider(box(0.5, 0.5), MATERIAL));
    const joint = createPhysics2DRevoluteJoint({ bodyA: 0, bodyB: 1 });

    const abi = createPhysics2DAbi();
    const handle = abi.createWorld();
    const commands = createPhysics2DAbiCommandBuffer(4096);
    publish(commands, [anchor, hanging]);
    expect(writePhysics2DAbiSetJointCommand(commands, 7, 1, 2, joint)).toBe(true);
    expect(abi.execute(handle, commands, createPhysics2DAbiExecutionResult())).toBe(true);
    expect(stepPhysics2DAbiWorld(abi, handle, 1 / 60)).toBe('Complete');

    const joints = createPhysics2DAbiJointBuffer(4);
    expect(abi.readJoints(handle, joints)).toBe(true);
    expect(joints.count).toBe(1);
    expect(joints.ids[0]).toBe(7);
    expect(joints.flags[0] & Physics2DAbiJointFlag.Broken).toBe(0);
  });

  it('applies an impulse through the wire exactly as the standard helper does', () => {
    const direct = createRigidBody2D('dynamic', 0, 0);
    direct.colliders.push(createPhysics2DCollider(box(0.5, 0.5), MATERIAL));
    const world = createPhysics2DWorld();
    world.gravityY = 0;
    addPhysics2DBody(world, direct);

    const abi = createPhysics2DAbi();
    const handle = abi.createWorld();
    const commands = createPhysics2DAbiCommandBuffer(4096);
    expect(writePhysics2DAbiSetGravityCommand(commands, 0, 0)).toBe(true);
    publish(commands, [direct]);
    expect(writePhysics2DAbiApplyLinearImpulseCommand(commands, 1, 3, -2)).toBe(true);
    expect(abi.execute(handle, commands, createPhysics2DAbiExecutionResult())).toBe(true);

    direct.velocityX += 3 / direct.mass;
    direct.velocityY += -2 / direct.mass;

    const out = createPhysics2DAbiBodyBuffer(1);
    expect(readPhysics2DAbiBodies(abi, handle, null, out)).toBe(true);
    expect(out.values[Physics2DAbiBodyValue.VelocityX]).toBeCloseTo(direct.velocityX, 12);
    expect(out.values[Physics2DAbiBodyValue.VelocityY]).toBeCloseTo(direct.velocityY, 12);
  });

  it('declines a step the standard world would also decline', () => {
    const abi = createPhysics2DAbi();
    const handle = abi.createWorld();
    expect(stepPhysics2DAbiWorld(abi, handle, Number.NaN)).toBe('Declined');
    expect(stepPhysics2DAbiWorld(abi, handle, -1)).toBe('Declined');
  });

  it('reports a destroyed world as stale rather than failing silently', () => {
    const abi = createPhysics2DAbi();
    const handle = abi.createWorld();
    expect(abi.destroyWorld(handle)).toBe(true);
    expect(abi.getWorldStatus(handle)).toBe('Stale');
    expect(stepPhysics2DAbiWorld(abi, handle, 1 / 60)).toBe('StaleWorld');
    expect(readPhysics2DAbiBodies(abi, handle, null, createPhysics2DAbiBodyBuffer(1))).toBe(false);
  });

  it('adds a joint the standard world also accepts', () => {
    const world = createPhysics2DWorld();
    registerBuiltInPhysics2DJointSolvers(world);
    const a = createRigidBody2D('static', 0, 0);
    const b = createRigidBody2D('dynamic', 0, -1);
    b.colliders.push(createPhysics2DCollider(box(0.5, 0.5), MATERIAL));
    addPhysics2DBody(world, a);
    addPhysics2DBody(world, b);
    addPhysics2DJoint(world, createPhysics2DRevoluteJoint({ bodyA: a.index, bodyB: b.index }));
    for (let step = 0; step < 60; step += 1) stepPhysics2D(world, 1 / 60);

    const abi = createPhysics2DAbi();
    const handle = abi.createWorld();
    const commands = createPhysics2DAbiCommandBuffer(4096);
    publish(commands, [a, b]);
    expect(
      writePhysics2DAbiSetJointCommand(commands, 1, 1, 2, createPhysics2DRevoluteJoint({ bodyA: 0, bodyB: 1 })),
    ).toBe(true);
    expect(abi.execute(handle, commands, createPhysics2DAbiExecutionResult())).toBe(true);
    const joints = createPhysics2DAbiJointBuffer(4);
    expect(abi.readJoints(handle, joints)).toBe(true);
    expect(joints.count).toBe(1);
  });
});
