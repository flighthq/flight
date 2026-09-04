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
  EntityConstruction,
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

// Joint factories mirror Flight's other descriptor factories: they allocate plain data, accept one
// readonly options object, and make only authoring choices. Registration and world mutation remain
// explicit operations. The common helper is also the boundary that keeps solver-owned cache out of
// every public options type.
function initJointBase(out: Physics2DJoint, options: Readonly<Physics2DJointOptions>): void {
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
}

export function createPhysics2DDistanceJoint(options: Readonly<Physics2DDistanceJointOptions>): Physics2DDistanceJoint {
  const out = allocateEntity<Physics2DDistanceJoint>();
  initializePhysics2DDistanceJoint(out, options);
  return finishEntity(out);
}

export function createPhysics2DGearJoint(options: Readonly<Physics2DGearJointOptions>): Physics2DGearJoint {
  const out = allocateEntity<Physics2DGearJoint>();
  initializePhysics2DGearJoint(out, options);
  return finishEntity(out);
}

export function createPhysics2DMouseJoint(options: Readonly<Physics2DMouseJointOptions>): Physics2DMouseJoint {
  const out = allocateEntity<Physics2DMouseJoint>();
  initializePhysics2DMouseJoint(out, options);
  return finishEntity(out);
}

export function createPhysics2DPrismaticJoint(
  options: Readonly<Physics2DPrismaticJointOptions>,
): Physics2DPrismaticJoint {
  const out = allocateEntity<Physics2DPrismaticJoint>();
  initializePhysics2DPrismaticJoint(out, options);
  return finishEntity(out);
}

export function createPhysics2DPulleyJoint(options: Readonly<Physics2DPulleyJointOptions>): Physics2DPulleyJoint {
  const out = allocateEntity<Physics2DPulleyJoint>();
  initializePhysics2DPulleyJoint(out, options);
  return finishEntity(out);
}

export function createPhysics2DRevoluteJoint(options: Readonly<Physics2DRevoluteJointOptions>): Physics2DRevoluteJoint {
  const out = allocateEntity<Physics2DRevoluteJoint>();
  initializePhysics2DRevoluteJoint(out, options);
  return finishEntity(out);
}

export function createPhysics2DRopeJoint(options: Readonly<Physics2DRopeJointOptions>): Physics2DRopeJoint {
  const out = allocateEntity<Physics2DRopeJoint>();
  initializePhysics2DRopeJoint(out, options);
  return finishEntity(out);
}

export function createPhysics2DWeldJoint(options: Readonly<Physics2DWeldJointOptions>): Physics2DWeldJoint {
  const out = allocateEntity<Physics2DWeldJoint>();
  initializePhysics2DWeldJoint(out, options);
  return finishEntity(out);
}

export function createPhysics2DWheelJoint(options: Readonly<Physics2DWheelJointOptions>): Physics2DWheelJoint {
  const out = allocateEntity<Physics2DWheelJoint>();
  initializePhysics2DWheelJoint(out, options);
  return finishEntity(out);
}

export function initializePhysics2DDistanceJoint(
  out: EntityConstruction<Physics2DDistanceJoint>,
  options: Readonly<Physics2DDistanceJointOptions>,
): void {
  out.kind = Physics2DDistanceJointKind;
  initJointBase(out, options);
  out.length = options.length;
  out.frequencyHz = options.frequencyHz ?? 0;
  out.dampingRatio = options.dampingRatio ?? 0;
}

export function initializePhysics2DGearJoint(
  out: EntityConstruction<Physics2DGearJoint>,
  options: Readonly<Physics2DGearJointOptions>,
): void {
  out.kind = Physics2DGearJointKind;
  initJointBase(out, options);
  out.coordinateA = options.coordinateA;
  out.coordinateB = options.coordinateB;
  out.axisAX = options.axisAX ?? 1;
  out.axisAY = options.axisAY ?? 0;
  out.axisBX = options.axisBX ?? 1;
  out.axisBY = options.axisBY ?? 0;
  out.ratio = options.ratio ?? 1;
  out.constant = options.constant;
}

export function initializePhysics2DMouseJoint(
  out: EntityConstruction<Physics2DMouseJoint>,
  options: Readonly<Physics2DMouseJointOptions>,
): void {
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
}

export function initializePhysics2DPrismaticJoint(
  out: EntityConstruction<Physics2DPrismaticJoint>,
  options: Readonly<Physics2DPrismaticJointOptions>,
): void {
  out.kind = Physics2DPrismaticJointKind;
  initJointBase(out, options);
  out.localAxisAX = options.localAxisAX ?? 1;
  out.localAxisAY = options.localAxisAY ?? 0;
  out.referenceAngle = options.referenceAngle ?? 0;
  out.enableMotor = options.enableMotor ?? false;
  out.motorSpeed = options.motorSpeed ?? 0;
  out.maxMotorForce = options.maxMotorForce ?? 0;
  out.motorImpulse = 0;
  out.enableLimit = options.enableLimit ?? false;
  out.lowerTranslation = options.lowerTranslation ?? 0;
  out.upperTranslation = options.upperTranslation ?? 0;
  out.enableLimitSpring = options.enableLimitSpring ?? false;
  out.limitFrequencyHz = options.limitFrequencyHz ?? 0;
  out.limitDampingRatio = options.limitDampingRatio ?? 0;
}

export function initializePhysics2DPulleyJoint(
  out: EntityConstruction<Physics2DPulleyJoint>,
  options: Readonly<Physics2DPulleyJointOptions>,
): void {
  out.kind = Physics2DPulleyJointKind;
  initJointBase(out, options);
  out.groundAnchorAX = options.groundAnchorAX;
  out.groundAnchorAY = options.groundAnchorAY;
  out.groundAnchorBX = options.groundAnchorBX;
  out.groundAnchorBY = options.groundAnchorBY;
  out.ratio = options.ratio ?? 1;
  out.constant = options.constant;
}

export function initializePhysics2DRevoluteJoint(
  out: EntityConstruction<Physics2DRevoluteJoint>,
  options: Readonly<Physics2DRevoluteJointOptions>,
): void {
  out.kind = Physics2DRevoluteJointKind;
  initJointBase(out, options);
  out.enableMotor = options.enableMotor ?? false;
  out.motorSpeed = options.motorSpeed ?? 0;
  out.maxMotorTorque = options.maxMotorTorque ?? 0;
  out.motorImpulse = 0;
  out.enableLimit = options.enableLimit ?? false;
  out.lowerAngle = options.lowerAngle ?? 0;
  out.upperAngle = options.upperAngle ?? 0;
  out.referenceAngle = options.referenceAngle ?? 0;
  out.enableLimitSpring = options.enableLimitSpring ?? false;
  out.limitFrequencyHz = options.limitFrequencyHz ?? 0;
  out.limitDampingRatio = options.limitDampingRatio ?? 0;
}

export function initializePhysics2DRopeJoint(
  out: EntityConstruction<Physics2DRopeJoint>,
  options: Readonly<Physics2DRopeJointOptions>,
): void {
  out.kind = Physics2DRopeJointKind;
  initJointBase(out, options);
  out.maxLength = options.maxLength;
}

export function initializePhysics2DWeldJoint(
  out: EntityConstruction<Physics2DWeldJoint>,
  options: Readonly<Physics2DWeldJointOptions>,
): void {
  out.kind = Physics2DWeldJointKind;
  initJointBase(out, options);
  out.referenceAngle = options.referenceAngle ?? 0;
}

export function initializePhysics2DWheelJoint(
  out: EntityConstruction<Physics2DWheelJoint>,
  options: Readonly<Physics2DWheelJointOptions>,
): void {
  out.kind = Physics2DWheelJointKind;
  initJointBase(out, options);
  out.localAxisAX = options.localAxisAX ?? 0;
  out.localAxisAY = options.localAxisAY ?? 1;
  out.restTranslation = options.restTranslation ?? 0;
  out.frequencyHz = options.frequencyHz ?? 0;
  out.dampingRatio = options.dampingRatio ?? 0;
  out.enableMotor = options.enableMotor ?? false;
  out.motorSpeed = options.motorSpeed ?? 0;
  out.maxMotorTorque = options.maxMotorTorque ?? 0;
  out.motorImpulse = 0;
}
