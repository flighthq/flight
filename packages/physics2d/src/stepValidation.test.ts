import { describe, expect, it } from 'vitest';

import { addPhysics2DJoint } from './jointRegistry';
import {
  isPhysics2DBodyStateValid,
  isPhysics2DContactStateValid,
  isPhysics2DGravityValid,
  isPhysics2DJointStateValid,
  isPhysics2DPreviousTimestepValid,
  isPhysics2DSolverConfigValid,
  isPhysics2DTimestepValid,
} from './stepValidation';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function bodyWorld() {
  const world = createPhysics2DWorld();
  const body = createRigidBody2D('dynamic', 0, 0);
  body.colliders.push(createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, STONE));
  addPhysics2DBody(world, body);
  return { body, world };
}

describe('isPhysics2DBodyStateValid', () => {
  it('accepts coherent world bodies and rejects invalid numeric or lookup state', () => {
    const { body, world } = bodyWorld();
    expect(isPhysics2DBodyStateValid(world)).toBe(true);
    body.linearDamping = -1;
    expect(isPhysics2DBodyStateValid(world)).toBe(false);
    body.linearDamping = 0;
    world.bodyByIndex.delete(body.index);
    expect(isPhysics2DBodyStateValid(world)).toBe(false);
  });
});

describe('isPhysics2DContactStateValid', () => {
  it('accepts an empty cache and rejects a non-finite cached contact', () => {
    const world = createPhysics2DWorld();
    expect(isPhysics2DContactStateValid(world)).toBe(true);
    world.contacts.push({ normalX: Number.NaN, pointCount: 0, points: [] } as never);
    expect(isPhysics2DContactStateValid(world)).toBe(false);
  });
});

describe('isPhysics2DGravityValid', () => {
  it('requires finite world acceleration', () => {
    const world = createPhysics2DWorld();
    expect(isPhysics2DGravityValid(world)).toBe(true);
    world.gravityY = Number.POSITIVE_INFINITY;
    expect(isPhysics2DGravityValid(world)).toBe(false);
  });
});

describe('isPhysics2DJointStateValid', () => {
  it('rejects a non-finite authored or accumulated joint number', () => {
    const { body, world } = bodyWorld();
    const joint = addPhysics2DJoint(world, {
      kind: 'Unknown',
      bodyA: body.index,
      bodyB: body.index,
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
    });
    expect(isPhysics2DJointStateValid(world)).toBe(true);
    joint.impulse0 = Number.NaN;
    expect(isPhysics2DJointStateValid(world)).toBe(false);
  });
});

describe('isPhysics2DPreviousTimestepValid', () => {
  it('accepts the initial sentinel and a positive finite completed step', () => {
    const world = createPhysics2DWorld();
    expect(isPhysics2DPreviousTimestepValid(world)).toBe(true);
    world.previousTimestep = 1 / 60;
    expect(isPhysics2DPreviousTimestepValid(world)).toBe(true);
    world.previousTimestep = -1;
    expect(isPhysics2DPreviousTimestepValid(world)).toBe(false);
  });
});

describe('isPhysics2DSolverConfigValid', () => {
  it('rejects unsafe ranges and non-finite solver coefficients', () => {
    const world = createPhysics2DWorld();
    expect(isPhysics2DSolverConfigValid(world.config)).toBe(true);
    world.config.positionCorrection = 2;
    expect(isPhysics2DSolverConfigValid(world.config)).toBe(false);
    world.config.positionCorrection = 0.2;
    world.config.penetrationSlop = Number.NaN;
    expect(isPhysics2DSolverConfigValid(world.config)).toBe(false);
  });
});

describe('isPhysics2DTimestepValid', () => {
  it('accepts only positive finite intervals', () => {
    expect(isPhysics2DTimestepValid(1 / 60)).toBe(true);
    expect(isPhysics2DTimestepValid(0)).toBe(false);
    expect(isPhysics2DTimestepValid(Number.NaN)).toBe(false);
  });
});
