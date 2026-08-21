import type {
  Physics2DDistanceJoint,
  Physics2DDistanceJointOptions,
  Physics2DGearJoint,
  Physics2DGearJointOptions,
  Physics2DJoint,
  Physics2DJointOptions,
  Physics2DMouseJoint,
  Physics2DMouseJointOptions,
  Physics2DPrismaticJoint,
  Physics2DPrismaticJointOptions,
  Physics2DPulleyJoint,
  Physics2DPulleyJointOptions,
  Physics2DRevoluteJoint,
  Physics2DRevoluteJointOptions,
  Physics2DRopeJoint,
  Physics2DRopeJointOptions,
  Physics2DWeldJoint,
  Physics2DWeldJointOptions,
  Physics2DWheelJoint,
  Physics2DWheelJointOptions,
} from '@flighthq/types/contract';

import {
  Physics2DDistanceJointKind,
  Physics2DGearJointKind,
  Physics2DMouseJointKind,
  Physics2DPrismaticJointKind,
  Physics2DPulleyJointKind,
  Physics2DRevoluteJointKind,
  Physics2DRopeJointKind,
  Physics2DWeldJointKind,
  Physics2DWheelJointKind,
} from './joints';

type Physics2DJointBase = Omit<Physics2DJoint, 'kind'>;

// Joint factories mirror Flight's other descriptor factories: they allocate plain data, accept one
// readonly options object, and make only authoring choices. Registration and world mutation remain
// explicit operations. The common helper is also the boundary that keeps solver-owned cache out of
// every public options type.
function createJointBase(options: Readonly<Physics2DJointOptions>): Physics2DJointBase {
  return {
    bodyA: options.bodyA,
    bodyB: options.bodyB,
    localAnchorAX: options.localAnchorAX ?? 0,
    localAnchorAY: options.localAnchorAY ?? 0,
    localAnchorBX: options.localAnchorBX ?? 0,
    localAnchorBY: options.localAnchorBY ?? 0,
    collideConnected: options.collideConnected ?? false,
    // Unbreakable unless the caller says otherwise: a joint that silently failed under load would be a
    // worse default than one that never does.
    breakForce: options.breakForce ?? Number.POSITIVE_INFINITY,
    breakTorque: options.breakTorque ?? Number.POSITIVE_INFINITY,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
  };
}

export function createPhysics2DDistanceJoint(options: Readonly<Physics2DDistanceJointOptions>): Physics2DDistanceJoint {
  return {
    kind: Physics2DDistanceJointKind,
    ...createJointBase(options),
    length: options.length,
    frequencyHz: options.frequencyHz ?? 0,
    dampingRatio: options.dampingRatio ?? 0,
  };
}

export function createPhysics2DGearJoint(options: Readonly<Physics2DGearJointOptions>): Physics2DGearJoint {
  return {
    kind: Physics2DGearJointKind,
    ...createJointBase(options),
    coordinateA: options.coordinateA,
    coordinateB: options.coordinateB,
    axisAX: options.axisAX ?? 1,
    axisAY: options.axisAY ?? 0,
    axisBX: options.axisBX ?? 1,
    axisBY: options.axisBY ?? 0,
    ratio: options.ratio ?? 1,
    constant: options.constant,
  };
}

export function createPhysics2DMouseJoint(options: Readonly<Physics2DMouseJointOptions>): Physics2DMouseJoint {
  return {
    kind: Physics2DMouseJointKind,
    bodyA: options.body,
    bodyB: options.body,
    localAnchorAX: 0,
    localAnchorAY: 0,
    localAnchorBX: options.localAnchorX ?? 0,
    localAnchorBY: options.localAnchorY ?? 0,
    collideConnected: false,
    breakForce: options.breakForce ?? Number.POSITIVE_INFINITY,
    breakTorque: options.breakTorque ?? Number.POSITIVE_INFINITY,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
    targetX: options.targetX,
    targetY: options.targetY,
    maxForce: options.maxForce,
    frequencyHz: options.frequencyHz ?? 5,
    dampingRatio: options.dampingRatio ?? 0.7,
  };
}

export function createPhysics2DPrismaticJoint(
  options: Readonly<Physics2DPrismaticJointOptions>,
): Physics2DPrismaticJoint {
  return {
    kind: Physics2DPrismaticJointKind,
    ...createJointBase(options),
    localAxisAX: options.localAxisAX ?? 1,
    localAxisAY: options.localAxisAY ?? 0,
    referenceAngle: options.referenceAngle ?? 0,
    enableMotor: options.enableMotor ?? false,
    motorSpeed: options.motorSpeed ?? 0,
    maxMotorForce: options.maxMotorForce ?? 0,
    motorImpulse: 0,
    enableLimit: options.enableLimit ?? false,
    lowerTranslation: options.lowerTranslation ?? 0,
    upperTranslation: options.upperTranslation ?? 0,
  };
}

export function createPhysics2DPulleyJoint(options: Readonly<Physics2DPulleyJointOptions>): Physics2DPulleyJoint {
  return {
    kind: Physics2DPulleyJointKind,
    ...createJointBase(options),
    groundAnchorAX: options.groundAnchorAX,
    groundAnchorAY: options.groundAnchorAY,
    groundAnchorBX: options.groundAnchorBX,
    groundAnchorBY: options.groundAnchorBY,
    ratio: options.ratio ?? 1,
    constant: options.constant,
  };
}

export function createPhysics2DRevoluteJoint(options: Readonly<Physics2DRevoluteJointOptions>): Physics2DRevoluteJoint {
  return {
    kind: Physics2DRevoluteJointKind,
    ...createJointBase(options),
    enableMotor: options.enableMotor ?? false,
    motorSpeed: options.motorSpeed ?? 0,
    maxMotorTorque: options.maxMotorTorque ?? 0,
    motorImpulse: 0,
    enableLimit: options.enableLimit ?? false,
    lowerAngle: options.lowerAngle ?? 0,
    upperAngle: options.upperAngle ?? 0,
    referenceAngle: options.referenceAngle ?? 0,
  };
}

export function createPhysics2DRopeJoint(options: Readonly<Physics2DRopeJointOptions>): Physics2DRopeJoint {
  return {
    kind: Physics2DRopeJointKind,
    ...createJointBase(options),
    maxLength: options.maxLength,
  };
}

export function createPhysics2DWeldJoint(options: Readonly<Physics2DWeldJointOptions>): Physics2DWeldJoint {
  return {
    kind: Physics2DWeldJointKind,
    ...createJointBase(options),
    referenceAngle: options.referenceAngle ?? 0,
  };
}

export function createPhysics2DWheelJoint(options: Readonly<Physics2DWheelJointOptions>): Physics2DWheelJoint {
  return {
    kind: Physics2DWheelJointKind,
    ...createJointBase(options),
    localAxisAX: options.localAxisAX ?? 0,
    localAxisAY: options.localAxisAY ?? 1,
    restTranslation: options.restTranslation ?? 0,
    frequencyHz: options.frequencyHz ?? 0,
    dampingRatio: options.dampingRatio ?? 0,
    enableMotor: options.enableMotor ?? false,
    motorSpeed: options.motorSpeed ?? 0,
    maxMotorTorque: options.maxMotorTorque ?? 0,
    motorImpulse: 0,
  };
}
