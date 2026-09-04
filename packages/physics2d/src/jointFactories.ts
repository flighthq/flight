import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
    const out = allocateEntity<Physics2DJointBase>();
  out.bodyA = options.bodyA;
  out.bodyB = options.bodyB;
  out.localAnchorAX = options.localAnchorAX ?? 0;
  out.localAnchorAY = options.localAnchorAY ?? 0;
  out.localAnchorBX = options.localAnchorBX ?? 0;
  out.localAnchorBY = options.localAnchorBY ?? 0;
  out.collideConnected = options.collideConnected ?? false;
  out.breakForce = options.breakForce ?? Number.POSITIVE_INFINITY;
  out.breakTorque = options.breakTorque ?? Number.POSITIVE_INFINITY;
  out.impulse0 = 0;
  out.impulse1 = 0;
  out.impulse2 = 0;
  out.rAX = 0;
  out.rAY = 0;
  out.rBX = 0;
  out.rBY = 0;
  return finishEntity(out);
}

export function createPhysics2DDistanceJoint(options: Readonly<Physics2DDistanceJointOptions>): Physics2DDistanceJoint {
  return createEntity({
    kind: Physics2DDistanceJointKind,
    ...createJointBase(options),
    length: options.length,
    frequencyHz: options.frequencyHz ?? 0,
    dampingRatio: options.dampingRatio ?? 0,
  });
}

export function createPhysics2DGearJoint(options: Readonly<Physics2DGearJointOptions>): Physics2DGearJoint {
  return createEntity({
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
  });
}

export function createPhysics2DMouseJoint(options: Readonly<Physics2DMouseJointOptions>): Physics2DMouseJoint {
    const out = allocateEntity<Physics2DDistanceJoint>();
  out.kind = Physics2DMouseJointKind;
  out.bodyA = options.body;
  out.bodyB = options.body;
  out.localAnchorAX = 0;
  out.localAnchorAY = 0;
  out.localAnchorBX = options.localAnchorX ?? 0;
  out.localAnchorBY = options.localAnchorY ?? 0;
  out.collideConnected = false;
  out.breakForce = options.breakForce ?? Number.POSITIVE_INFINITY;
  out.breakTorque = options.breakTorque ?? Number.POSITIVE_INFINITY;
  out.impulse0 = 0;
  out.impulse1 = 0;
  out.impulse2 = 0;
  out.rAX = 0;
  out.rAY = 0;
  out.rBX = 0;
  out.rBY = 0;
  out.targetX = options.targetX;
  out.targetY = options.targetY;
  out.maxForce = options.maxForce;
  out.frequencyHz = options.frequencyHz ?? 5;
  out.dampingRatio = options.dampingRatio ?? 0.7;
  return finishEntity(out);
}

export function createPhysics2DPrismaticJoint(
  options: Readonly<Physics2DPrismaticJointOptions>,
): Physics2DPrismaticJoint {
  return createEntity({
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
    enableLimitSpring: options.enableLimitSpring ?? false,
    limitFrequencyHz: options.limitFrequencyHz ?? 0,
    limitDampingRatio: options.limitDampingRatio ?? 0,
  });
}

export function createPhysics2DPulleyJoint(options: Readonly<Physics2DPulleyJointOptions>): Physics2DPulleyJoint {
  return createEntity({
    kind: Physics2DPulleyJointKind,
    ...createJointBase(options),
    groundAnchorAX: options.groundAnchorAX,
    groundAnchorAY: options.groundAnchorAY,
    groundAnchorBX: options.groundAnchorBX,
    groundAnchorBY: options.groundAnchorBY,
    ratio: options.ratio ?? 1,
    constant: options.constant,
  });
}

export function createPhysics2DRevoluteJoint(options: Readonly<Physics2DRevoluteJointOptions>): Physics2DRevoluteJoint {
  return createEntity({
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
    enableLimitSpring: options.enableLimitSpring ?? false,
    limitFrequencyHz: options.limitFrequencyHz ?? 0,
    limitDampingRatio: options.limitDampingRatio ?? 0,
  });
}

export function createPhysics2DRopeJoint(options: Readonly<Physics2DRopeJointOptions>): Physics2DRopeJoint {
  return createEntity({
    kind: Physics2DRopeJointKind,
    ...createJointBase(options),
    maxLength: options.maxLength,
  });
}

export function createPhysics2DWeldJoint(options: Readonly<Physics2DWeldJointOptions>): Physics2DWeldJoint {
  return createEntity({
    kind: Physics2DWeldJointKind,
    ...createJointBase(options),
    referenceAngle: options.referenceAngle ?? 0,
  });
}

export function createPhysics2DWheelJoint(options: Readonly<Physics2DWheelJointOptions>): Physics2DWheelJoint {
  return createEntity({
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
  });
}
