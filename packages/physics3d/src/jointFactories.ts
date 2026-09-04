import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Physics3DBallAndSocketJoint,
  Physics3DBallAndSocketJointOptions,
  Physics3DConeTwistJoint,
  Physics3DConeTwistJointOptions,
  Physics3DDistanceJoint,
  Physics3DDistanceJointOptions,
  Physics3DFixedJoint,
  Physics3DFixedJointOptions,
  Physics3DGeneric6DofJoint,
  Physics3DGeneric6DofJointOptions,
  Physics3DHingeJoint,
  Physics3DHingeJointOptions,
  Physics3DJoint,
  Physics3DJointFrameOptions,
  Physics3DJointFrames,
  Physics3DJointOptions,
  Physics3DSliderJoint,
  Physics3DSliderJointOptions,
} from '@flighthq/types/contract';

import {
  Physics3DBallAndSocketJointKind,
  Physics3DConeTwistJointKind,
  Physics3DDistanceJointKind,
  Physics3DFixedJointKind,
  Physics3DGeneric6DofJointKind,
  Physics3DHingeJointKind,
  Physics3DSliderJointKind,
} from './joints';

// Joint factories allocate plain data, take one readonly options object, and make only authoring choices.
// Registration and world membership stay explicit operations, so constructing a joint links no solver math
// and touches no world.
//
// The two shared helpers are also the boundary that keeps solver-owned cache out of every public options
// type: a caller names anchors, frames, and limits, and never the accumulators.
export function createPhysics3DBallAndSocketJoint(
  options: Readonly<Physics3DBallAndSocketJointOptions>,
): Physics3DBallAndSocketJoint {
  const out = allocateEntity<Physics3DBallAndSocketJoint>();
  out.kind = Physics3DBallAndSocketJointKind;
  initJointBase(out, options);
  return finishEntity(out);
}

// Defaults to a cone of 45 degrees in both directions and a free twist. A cone-twist with no limits at all is
// a ball-and-socket that costs more, so the swing limit defaults ON and the twist limit — which has no
// natural neutral range — defaults off.
export function createPhysics3DConeTwistJoint(
  options: Readonly<Physics3DConeTwistJointOptions>,
): Physics3DConeTwistJoint {
  const out = allocateEntity<Physics3DConeTwistJoint>();
  out.kind = Physics3DConeTwistJointKind;
  initJointBase(out, options);
  initJointFrames(out, options);
  out.enableSwingLimit = options.enableSwingLimit ?? true;
  out.swingLimitY = options.swingLimitY ?? Math.PI / 4;
  out.swingLimitZ = options.swingLimitZ ?? Math.PI / 4;
  out.enableTwistLimit = options.enableTwistLimit ?? false;
  out.lowerTwistAngle = options.lowerTwistAngle ?? 0;
  out.upperTwistAngle = options.upperTwistAngle ?? 0;
  out.enableLimitSpring = options.enableLimitSpring ?? false;
  out.limitFrequencyHz = options.limitFrequencyHz ?? 0;
  out.limitDampingRatio = options.limitDampingRatio ?? 0;
  out.swingLimitImpulse = 0;
  out.lowerTwistImpulse = 0;
  out.upperTwistImpulse = 0;
  return finishEntity(out);
}

// Defaults to a RIGID strut: no spring, no limit, and a rest length of zero, which holds the two anchors
// coincident until a caller names a length. The limit interval defaults to `[0, Infinity]` so that switching
// `enableLimit` on alone gives a rope with no stated bound rather than one pinned to zero length.
export function createPhysics3DDistanceJoint(options: Readonly<Physics3DDistanceJointOptions>): Physics3DDistanceJoint {
  const out = allocateEntity<Physics3DDistanceJoint>();
  out.kind = Physics3DDistanceJointKind;
  initJointBase(out, options);
  out.length = options.length ?? 0;
  out.enableSpring = options.enableSpring ?? false;
  out.frequencyHz = options.frequencyHz ?? 0;
  out.dampingRatio = options.dampingRatio ?? 0;
  out.enableLimit = options.enableLimit ?? false;
  out.minLength = options.minLength ?? 0;
  out.maxLength = options.maxLength ?? Number.POSITIVE_INFINITY;
  out.lowerLimitImpulse = 0;
  out.upperLimitImpulse = 0;
  return finishEntity(out);
}

export function createPhysics3DFixedJoint(options: Readonly<Physics3DFixedJointOptions>): Physics3DFixedJoint {
  const out = allocateEntity<Physics3DFixedJoint>();
  out.kind = Physics3DFixedJointKind;
  initJointBase(out, options);
  initJointFrames(out, options);
  return finishEntity(out);
}

// Defaults every axis to FREE, so a joint built with no bounds constrains nothing and each axis is opted into
// by naming its interval. The alternative — defaulting to locked — would make a partially configured joint
// silently rigid, which is the harder failure to see.
export function createPhysics3DGeneric6DofJoint(
  options: Readonly<Physics3DGeneric6DofJointOptions>,
): Physics3DGeneric6DofJoint {
  const out = allocateEntity<Physics3DGeneric6DofJoint>();
  out.kind = Physics3DGeneric6DofJointKind;
  initJointBase(out, options);
  initJointFrames(out, options);
  out.lowerLinearX = options.lowerLinearX ?? 1;
  out.lowerLinearY = options.lowerLinearY ?? 1;
  out.lowerLinearZ = options.lowerLinearZ ?? 1;
  out.upperLinearX = options.upperLinearX ?? -1;
  out.upperLinearY = options.upperLinearY ?? -1;
  out.upperLinearZ = options.upperLinearZ ?? -1;
  out.lowerAngularX = options.lowerAngularX ?? 1;
  out.lowerAngularY = options.lowerAngularY ?? 1;
  out.lowerAngularZ = options.lowerAngularZ ?? 1;
  out.upperAngularX = options.upperAngularX ?? -1;
  out.upperAngularY = options.upperAngularY ?? -1;
  out.upperAngularZ = options.upperAngularZ ?? -1;
  out.enableLimitSpring = options.enableLimitSpring ?? false;
  out.limitFrequencyHz = options.limitFrequencyHz ?? 0;
  out.limitDampingRatio = options.limitDampingRatio ?? 0;
  out.lowerLimitImpulses = [0, 0, 0, 0, 0, 0];
  out.upperLimitImpulses = [0, 0, 0, 0, 0, 0];
  return finishEntity(out);
}

export function createPhysics3DHingeJoint(options: Readonly<Physics3DHingeJointOptions>): Physics3DHingeJoint {
  const out = allocateEntity<Physics3DHingeJoint>();
  out.kind = Physics3DHingeJointKind;
  initJointBase(out, options);
  initJointFrames(out, options);
  out.enableLimit = options.enableLimit ?? false;
  out.lowerAngle = options.lowerAngle ?? 0;
  out.upperAngle = options.upperAngle ?? 0;
  out.enableMotor = options.enableMotor ?? false;
  out.motorSpeed = options.motorSpeed ?? 0;
  out.maxMotorTorque = options.maxMotorTorque ?? 0;
  out.enableLimitSpring = options.enableLimitSpring ?? false;
  out.limitFrequencyHz = options.limitFrequencyHz ?? 0;
  out.limitDampingRatio = options.limitDampingRatio ?? 0;
  out.motorImpulse = 0;
  out.lowerLimitImpulse = 0;
  out.upperLimitImpulse = 0;
  return finishEntity(out);
}

export function createPhysics3DSliderJoint(options: Readonly<Physics3DSliderJointOptions>): Physics3DSliderJoint {
  const out = allocateEntity<Physics3DSliderJoint>();
  out.kind = Physics3DSliderJointKind;
  initJointBase(out, options);
  initJointFrames(out, options);
  out.enableLimit = options.enableLimit ?? false;
  out.lowerTranslation = options.lowerTranslation ?? 0;
  out.upperTranslation = options.upperTranslation ?? 0;
  out.enableMotor = options.enableMotor ?? false;
  out.motorSpeed = options.motorSpeed ?? 0;
  out.maxMotorForce = options.maxMotorForce ?? 0;
  out.enableLimitSpring = options.enableLimitSpring ?? false;
  out.limitFrequencyHz = options.limitFrequencyHz ?? 0;
  out.limitDampingRatio = options.limitDampingRatio ?? 0;
  out.motorImpulse = 0;
  out.lowerLimitImpulse = 0;
  out.upperLimitImpulse = 0;
  return finishEntity(out);
}

function initJointBase(out: Physics3DJoint, options: Readonly<Physics3DJointOptions>): void {
  out.bodyA = options.bodyA;
  out.bodyB = options.bodyB;
  out.localAnchorAX = options.localAnchorAX ?? 0;
  out.localAnchorAY = options.localAnchorAY ?? 0;
  out.localAnchorAZ = options.localAnchorAZ ?? 0;
  out.localAnchorBX = options.localAnchorBX ?? 0;
  out.localAnchorBY = options.localAnchorBY ?? 0;
  out.localAnchorBZ = options.localAnchorBZ ?? 0;
  out.collideConnected = options.collideConnected ?? false;
  out.breakForce = options.breakForce ?? Number.POSITIVE_INFINITY;
  out.breakTorque = options.breakTorque ?? Number.POSITIVE_INFINITY;
  out.broken = false;
  out.impulse0 = 0;
  out.impulse1 = 0;
  out.impulse2 = 0;
  out.impulse3 = 0;
  out.impulse4 = 0;
  out.impulse5 = 0;
  out.rAX = 0;
  out.rAY = 0;
  out.rAZ = 0;
  out.rBX = 0;
  out.rBY = 0;
  out.rBZ = 0;
}

function initJointFrames(out: Physics3DJointFrames, options: Readonly<Physics3DJointFrameOptions>): void {
  out.localRotationAX = options.localRotationAX ?? 0;
  out.localRotationAY = options.localRotationAY ?? 0;
  out.localRotationAZ = options.localRotationAZ ?? 0;
  out.localRotationAW = options.localRotationAW ?? 1;
  out.localRotationBX = options.localRotationBX ?? 0;
  out.localRotationBY = options.localRotationBY ?? 0;
  out.localRotationBZ = options.localRotationBZ ?? 0;
  out.localRotationBW = options.localRotationBW ?? 1;
}
