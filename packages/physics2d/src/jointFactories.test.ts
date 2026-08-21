import { describe, expect, it } from 'vitest';

import {
  createPhysics2DDistanceJoint,
  createPhysics2DGearJoint,
  createPhysics2DMouseJoint,
  createPhysics2DPrismaticJoint,
  createPhysics2DPulleyJoint,
  createPhysics2DRevoluteJoint,
  createPhysics2DRopeJoint,
  createPhysics2DWeldJoint,
  createPhysics2DWheelJoint,
} from './jointFactories';

describe('createPhysics2DDistanceJoint', () => {
  it('owns common defaults and solver scratch', () => {
    expect(createPhysics2DDistanceJoint({ bodyA: 1, bodyB: 2, length: 3 })).toEqual({
      kind: 'Distance',
      bodyA: 1,
      bodyB: 2,
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
    });
  });
});

describe('createPhysics2DGearJoint', () => {
  it('requires coordinate semantics and defaults both linear axes', () => {
    expect(
      createPhysics2DGearJoint({
        bodyA: 1,
        bodyB: 2,
        coordinateA: 'angular',
        coordinateB: 'linear',
        constant: 0,
      }),
    ).toMatchObject({ axisAX: 1, axisAY: 0, axisBX: 1, axisBY: 0, kind: 'Gear', ratio: 1 });
  });
});

describe('createPhysics2DMouseJoint', () => {
  it('hides the dummy endpoint and owns stable drag defaults', () => {
    const joint = createPhysics2DMouseJoint({ body: 7, targetX: 3, targetY: 4, maxForce: 100 });
    expect(joint).toMatchObject({ bodyA: 7, bodyB: 7, dampingRatio: 0.7, kind: 'Mouse', frequencyHz: 5 });
  });
});

describe('createPhysics2DPrismaticJoint', () => {
  it('preserves authored controls while initializing motor scratch', () => {
    expect(
      createPhysics2DPrismaticJoint({
        bodyA: 3,
        bodyB: 4,
        localAnchorAX: 1,
        collideConnected: true,
        localAxisAX: 0,
        localAxisAY: -1,
        enableMotor: true,
        motorSpeed: 2,
        maxMotorForce: 8,
        enableLimit: true,
        lowerTranslation: -3,
        upperTranslation: 5,
      }),
    ).toMatchObject({
      collideConnected: true,
      enableLimit: true,
      enableMotor: true,
      kind: 'Prismatic',
      localAnchorAX: 1,
      localAxisAX: 0,
      localAxisAY: -1,
      lowerTranslation: -3,
      maxMotorForce: 8,
      motorImpulse: 0,
      motorSpeed: 2,
      upperTranslation: 5,
    });
  });
});

describe('createPhysics2DPulleyJoint', () => {
  it('defaults the ratio while retaining required world anchors', () => {
    expect(
      createPhysics2DPulleyJoint({
        bodyA: 1,
        bodyB: 2,
        groundAnchorAX: -1,
        groundAnchorAY: 2,
        groundAnchorBX: 1,
        groundAnchorBY: 2,
        constant: 6,
      }),
    ).toMatchObject({ groundAnchorAX: -1, groundAnchorBX: 1, kind: 'Pulley', ratio: 1 });
  });
});

describe('createPhysics2DRevoluteJoint', () => {
  it('starts with inactive motor and limits', () => {
    expect(createPhysics2DRevoluteJoint({ bodyA: 1, bodyB: 2 })).toMatchObject({
      enableLimit: false,
      enableMotor: false,
      kind: 'Revolute',
      motorImpulse: 0,
    });
  });
});

describe('createPhysics2DRopeJoint', () => {
  it('requires the authored maximum length', () => {
    expect(createPhysics2DRopeJoint({ bodyA: 1, bodyB: 2, maxLength: 4 })).toMatchObject({
      kind: 'Rope',
      maxLength: 4,
    });
  });
});

describe('createPhysics2DWeldJoint', () => {
  it('defaults the reference pose to zero relative angle', () => {
    expect(createPhysics2DWeldJoint({ bodyA: 1, bodyB: 2 })).toMatchObject({
      kind: 'Weld',
      referenceAngle: 0,
    });
  });
});

describe('createPhysics2DWheelJoint', () => {
  it('defaults to a vertical free suspension with no motor', () => {
    expect(createPhysics2DWheelJoint({ bodyA: 1, bodyB: 2 })).toMatchObject({
      enableMotor: false,
      kind: 'Wheel',
      localAxisAX: 0,
      localAxisAY: 1,
      motorImpulse: 0,
      frequencyHz: 0,
    });
  });
});
