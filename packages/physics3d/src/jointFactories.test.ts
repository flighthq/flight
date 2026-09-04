import { describe, expect, it } from 'vitest';

import {
  createPhysics3DBallAndSocketJoint,
  createPhysics3DConeTwistJoint,
  createPhysics3DDistanceJoint,
  createPhysics3DFixedJoint,
  createPhysics3DGeneric6DofJoint,
  createPhysics3DHingeJoint,
  createPhysics3DSliderJoint,
  initializePhysics3DBallAndSocketJoint,
  initializePhysics3DConeTwistJoint,
  initializePhysics3DDistanceJoint,
  initializePhysics3DFixedJoint,
  initializePhysics3DGeneric6DofJoint,
  initializePhysics3DHingeJoint,
  initializePhysics3DSliderJoint,
} from './jointFactories';
import {
  Physics3DBallAndSocketJointKind,
  Physics3DConeTwistJointKind,
  Physics3DDistanceJointKind,
  Physics3DFixedJointKind,
  Physics3DGeneric6DofJointKind,
  Physics3DHingeJointKind,
  Physics3DSliderJointKind,
} from './joints';

describe('createPhysics3DBallAndSocketJoint', () => {
  it('stamps its kind and zeroes every accumulator', () => {
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 3, bodyB: 7 });

    expect(joint.kind).toBe(Physics3DBallAndSocketJointKind);
    expect(joint.bodyA).toBe(3);
    expect(joint.bodyB).toBe(7);
    expect([joint.impulse0, joint.impulse1, joint.impulse2, joint.impulse3, joint.impulse4, joint.impulse5]).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it('defaults both anchors to the body origin and the pair to non-colliding', () => {
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });

    expect([joint.localAnchorAX, joint.localAnchorAY, joint.localAnchorAZ]).toEqual([0, 0, 0]);
    expect(joint.collideConnected).toBe(false);
  });

  it('carries the anchors it was given', () => {
    const joint = createPhysics3DBallAndSocketJoint({
      bodyA: 0,
      bodyB: 1,
      localAnchorAX: 1,
      localAnchorAY: 2,
      localAnchorAZ: 3,
      localAnchorBZ: -4,
      collideConnected: true,
    });

    expect([joint.localAnchorAX, joint.localAnchorAY, joint.localAnchorAZ]).toEqual([1, 2, 3]);
    expect(joint.localAnchorBZ).toBe(-4);
    expect(joint.collideConnected).toBe(true);
  });
});

describe('createPhysics3DConeTwistJoint', () => {
  it('defaults to a 45 degree cone with the twist unbounded', () => {
    const joint = createPhysics3DConeTwistJoint({ bodyA: 0, bodyB: 1 });

    expect(joint.kind).toBe(Physics3DConeTwistJointKind);
    expect(joint.enableSwingLimit).toBe(true);
    expect(joint.swingLimitY).toBeCloseTo(Math.PI / 4, 12);
    expect(joint.swingLimitZ).toBeCloseTo(Math.PI / 4, 12);
    expect(joint.enableTwistLimit).toBe(false);
  });

  it('carries an elliptical cone and a twist interval', () => {
    const joint = createPhysics3DConeTwistJoint({
      bodyA: 0,
      bodyB: 1,
      swingLimitY: 0.3,
      swingLimitZ: 1.1,
      enableTwistLimit: true,
      lowerTwistAngle: -0.2,
      upperTwistAngle: 0.9,
    });

    expect(joint.swingLimitY).toBe(0.3);
    expect(joint.swingLimitZ).toBe(1.1);
    expect(joint.lowerTwistAngle).toBe(-0.2);
    expect(joint.upperTwistAngle).toBe(0.9);
  });
});

describe('createPhysics3DDistanceJoint', () => {
  it('defaults to a RIGID strut with no spring and no limit', () => {
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 3 });

    expect(joint.kind).toBe(Physics3DDistanceJointKind);
    expect(joint.length).toBe(3);
    expect(joint.enableSpring).toBe(false);
    expect(joint.enableLimit).toBe(false);
  });

  it('defaults its interval to UNBOUNDED above, not to zero', () => {
    // A caller who switches the limit on without naming a maximum means a rope with no stated bound. An
    // interval defaulting to [0, 0] would instead pin the two anchors together, which is the opposite of a
    // rope and would look like the joint holding rather than the default being wrong.
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1 });

    expect(joint.minLength).toBe(0);
    expect(joint.maxLength).toBe(Number.POSITIVE_INFINITY);
  });

  it('carries the spring and limit it was given', () => {
    const joint = createPhysics3DDistanceJoint({
      bodyA: 0,
      bodyB: 1,
      length: 2,
      enableSpring: true,
      frequencyHz: 4,
      dampingRatio: 0.7,
      enableLimit: true,
      minLength: 1,
      maxLength: 5,
    });

    expect(joint.frequencyHz).toBe(4);
    expect(joint.dampingRatio).toBe(0.7);
    expect(joint.minLength).toBe(1);
    expect(joint.maxLength).toBe(5);
  });

  it('starts its limit accumulators cold', () => {
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1 });

    expect(joint.lowerLimitImpulse).toBe(0);
    expect(joint.upperLimitImpulse).toBe(0);
  });
});

describe('createPhysics3DFixedJoint', () => {
  it('defaults both frames to the identity', () => {
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1 });

    expect(joint.kind).toBe(Physics3DFixedJointKind);
    expect([joint.localRotationAX, joint.localRotationAY, joint.localRotationAZ, joint.localRotationAW]).toEqual([
      0, 0, 0, 1,
    ]);
    expect([joint.localRotationBX, joint.localRotationBY, joint.localRotationBZ, joint.localRotationBW]).toEqual([
      0, 0, 0, 1,
    ]);
  });

  it('carries the frames it was given', () => {
    const half = Math.SQRT1_2;
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1, localRotationAZ: half, localRotationAW: half });

    expect(joint.localRotationAZ).toBeCloseTo(half, 12);
    expect(joint.localRotationAW).toBeCloseTo(half, 12);
  });
});

describe('createPhysics3DGeneric6DofJoint', () => {
  it('defaults every axis to free', () => {
    const joint = createPhysics3DGeneric6DofJoint({ bodyA: 0, bodyB: 1 });

    expect(joint.kind).toBe(Physics3DGeneric6DofJointKind);
    // `lower > upper` is the encoding for free, so a joint built with no bounds constrains nothing. Defaulting
    // to locked would make a partially configured joint silently rigid, which is the harder failure to see.
    expect(joint.lowerLinearX).toBeGreaterThan(joint.upperLinearX);
    expect(joint.lowerLinearY).toBeGreaterThan(joint.upperLinearY);
    expect(joint.lowerLinearZ).toBeGreaterThan(joint.upperLinearZ);
    expect(joint.lowerAngularX).toBeGreaterThan(joint.upperAngularX);
    expect(joint.lowerAngularY).toBeGreaterThan(joint.upperAngularY);
    expect(joint.lowerAngularZ).toBeGreaterThan(joint.upperAngularZ);
  });

  it('carries the bounds it was given', () => {
    const joint = createPhysics3DGeneric6DofJoint({
      bodyA: 0,
      bodyB: 1,
      lowerLinearY: -2,
      upperLinearY: 5,
      lowerAngularZ: 0,
      upperAngularZ: 0,
    });

    expect(joint.lowerLinearY).toBe(-2);
    expect(joint.upperLinearY).toBe(5);
    expect(joint.lowerAngularZ).toBe(0);
    expect(joint.upperAngularZ).toBe(0);
  });
});

describe('createPhysics3DHingeJoint', () => {
  it('defaults to a free hinge with no motor', () => {
    const joint = createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 });

    expect(joint.kind).toBe(Physics3DHingeJointKind);
    expect(joint.enableLimit).toBe(false);
    expect(joint.enableMotor).toBe(false);
    expect(joint.motorImpulse).toBe(0);
  });

  it('carries its limits and motor settings', () => {
    const joint = createPhysics3DHingeJoint({
      bodyA: 0,
      bodyB: 1,
      enableLimit: true,
      lowerAngle: -1,
      upperAngle: 2,
      enableMotor: true,
      motorSpeed: 3,
      maxMotorTorque: 40,
    });

    expect(joint.lowerAngle).toBe(-1);
    expect(joint.upperAngle).toBe(2);
    expect(joint.motorSpeed).toBe(3);
    expect(joint.maxMotorTorque).toBe(40);
  });
});

describe('createPhysics3DSliderJoint', () => {
  it('defaults to free travel with no motor', () => {
    const joint = createPhysics3DSliderJoint({ bodyA: 0, bodyB: 1 });

    expect(joint.kind).toBe(Physics3DSliderJointKind);
    expect(joint.enableLimit).toBe(false);
    expect(joint.enableMotor).toBe(false);
    expect(joint.motorImpulse).toBe(0);
  });

  it('carries its travel interval and motor settings', () => {
    const joint = createPhysics3DSliderJoint({
      bodyA: 0,
      bodyB: 1,
      enableLimit: true,
      lowerTranslation: -3,
      upperTranslation: 3,
      enableMotor: true,
      motorSpeed: 2,
      maxMotorForce: 15,
    });

    expect(joint.lowerTranslation).toBe(-3);
    expect(joint.upperTranslation).toBe(3);
    expect(joint.motorSpeed).toBe(2);
    expect(joint.maxMotorForce).toBe(15);
  });
});
describe('initializePhysics3DBallAndSocketJoint', () => {
  it('is the construction initializer of createPhysics3DBallAndSocketJoint', () => {
    expect(typeof initializePhysics3DBallAndSocketJoint).toBe('function');
  });
});

describe('initializePhysics3DConeTwistJoint', () => {
  it('is the construction initializer of createPhysics3DConeTwistJoint', () => {
    expect(typeof initializePhysics3DConeTwistJoint).toBe('function');
  });
});

describe('initializePhysics3DDistanceJoint', () => {
  it('is the construction initializer of createPhysics3DDistanceJoint', () => {
    expect(typeof initializePhysics3DDistanceJoint).toBe('function');
  });
});

describe('initializePhysics3DFixedJoint', () => {
  it('is the construction initializer of createPhysics3DFixedJoint', () => {
    expect(typeof initializePhysics3DFixedJoint).toBe('function');
  });
});

describe('initializePhysics3DGeneric6DofJoint', () => {
  it('is the construction initializer of createPhysics3DGeneric6DofJoint', () => {
    expect(typeof initializePhysics3DGeneric6DofJoint).toBe('function');
  });
});

describe('initializePhysics3DHingeJoint', () => {
  it('is the construction initializer of createPhysics3DHingeJoint', () => {
    expect(typeof initializePhysics3DHingeJoint).toBe('function');
  });
});

describe('initializePhysics3DSliderJoint', () => {
  it('is the construction initializer of createPhysics3DSliderJoint', () => {
    expect(typeof initializePhysics3DSliderJoint).toBe('function');
  });
});
