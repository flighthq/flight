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
  return { kind: Physics3DBallAndSocketJointKind, ...createJointBase(options) };
}

// Defaults to a cone of 45 degrees in both directions and a free twist. A cone-twist with no limits at all is
// a ball-and-socket that costs more, so the swing limit defaults ON and the twist limit — which has no
// natural neutral range — defaults off.
export function createPhysics3DConeTwistJoint(
  options: Readonly<Physics3DConeTwistJointOptions>,
): Physics3DConeTwistJoint {
  return {
    kind: Physics3DConeTwistJointKind,
    ...createJointBase(options),
    ...createJointFrames(options),
    enableSwingLimit: options.enableSwingLimit ?? true,
    swingLimitY: options.swingLimitY ?? Math.PI / 4,
    swingLimitZ: options.swingLimitZ ?? Math.PI / 4,
    enableTwistLimit: options.enableTwistLimit ?? false,
    lowerTwistAngle: options.lowerTwistAngle ?? 0,
    upperTwistAngle: options.upperTwistAngle ?? 0,
    enableLimitSpring: options.enableLimitSpring ?? false,
    limitFrequencyHz: options.limitFrequencyHz ?? 0,
    limitDampingRatio: options.limitDampingRatio ?? 0,
    swingLimitImpulse: 0,
    lowerTwistImpulse: 0,
    upperTwistImpulse: 0,
  };
}

// Defaults to a RIGID strut: no spring, no limit, and a rest length of zero, which holds the two anchors
// coincident until a caller names a length. The limit interval defaults to `[0, Infinity]` so that switching
// `enableLimit` on alone gives a rope with no stated bound rather than one pinned to zero length.
export function createPhysics3DDistanceJoint(options: Readonly<Physics3DDistanceJointOptions>): Physics3DDistanceJoint {
  return {
    kind: Physics3DDistanceJointKind,
    ...createJointBase(options),
    length: options.length ?? 0,
    enableSpring: options.enableSpring ?? false,
    frequencyHz: options.frequencyHz ?? 0,
    dampingRatio: options.dampingRatio ?? 0,
    enableLimit: options.enableLimit ?? false,
    minLength: options.minLength ?? 0,
    maxLength: options.maxLength ?? Number.POSITIVE_INFINITY,
    lowerLimitImpulse: 0,
    upperLimitImpulse: 0,
  };
}

export function createPhysics3DFixedJoint(options: Readonly<Physics3DFixedJointOptions>): Physics3DFixedJoint {
  return { kind: Physics3DFixedJointKind, ...createJointBase(options), ...createJointFrames(options) };
}

// Defaults every axis to FREE, so a joint built with no bounds constrains nothing and each axis is opted into
// by naming its interval. The alternative — defaulting to locked — would make a partially configured joint
// silently rigid, which is the harder failure to see.
export function createPhysics3DGeneric6DofJoint(
  options: Readonly<Physics3DGeneric6DofJointOptions>,
): Physics3DGeneric6DofJoint {
  return {
    kind: Physics3DGeneric6DofJointKind,
    ...createJointBase(options),
    ...createJointFrames(options),
    lowerLinearX: options.lowerLinearX ?? 1,
    lowerLinearY: options.lowerLinearY ?? 1,
    lowerLinearZ: options.lowerLinearZ ?? 1,
    upperLinearX: options.upperLinearX ?? -1,
    upperLinearY: options.upperLinearY ?? -1,
    upperLinearZ: options.upperLinearZ ?? -1,
    lowerAngularX: options.lowerAngularX ?? 1,
    lowerAngularY: options.lowerAngularY ?? 1,
    lowerAngularZ: options.lowerAngularZ ?? 1,
    upperAngularX: options.upperAngularX ?? -1,
    upperAngularY: options.upperAngularY ?? -1,
    upperAngularZ: options.upperAngularZ ?? -1,
    enableLimitSpring: options.enableLimitSpring ?? false,
    limitFrequencyHz: options.limitFrequencyHz ?? 0,
    limitDampingRatio: options.limitDampingRatio ?? 0,
    lowerLimitImpulses: [0, 0, 0, 0, 0, 0],
    upperLimitImpulses: [0, 0, 0, 0, 0, 0],
  };
}

export function createPhysics3DHingeJoint(options: Readonly<Physics3DHingeJointOptions>): Physics3DHingeJoint {
  return {
    kind: Physics3DHingeJointKind,
    ...createJointBase(options),
    ...createJointFrames(options),
    enableLimit: options.enableLimit ?? false,
    lowerAngle: options.lowerAngle ?? 0,
    upperAngle: options.upperAngle ?? 0,
    enableMotor: options.enableMotor ?? false,
    motorSpeed: options.motorSpeed ?? 0,
    maxMotorTorque: options.maxMotorTorque ?? 0,
    enableLimitSpring: options.enableLimitSpring ?? false,
    limitFrequencyHz: options.limitFrequencyHz ?? 0,
    limitDampingRatio: options.limitDampingRatio ?? 0,
    motorImpulse: 0,
    lowerLimitImpulse: 0,
    upperLimitImpulse: 0,
  };
}

export function createPhysics3DSliderJoint(options: Readonly<Physics3DSliderJointOptions>): Physics3DSliderJoint {
  return {
    kind: Physics3DSliderJointKind,
    ...createJointBase(options),
    ...createJointFrames(options),
    enableLimit: options.enableLimit ?? false,
    lowerTranslation: options.lowerTranslation ?? 0,
    upperTranslation: options.upperTranslation ?? 0,
    enableMotor: options.enableMotor ?? false,
    motorSpeed: options.motorSpeed ?? 0,
    maxMotorForce: options.maxMotorForce ?? 0,
    enableLimitSpring: options.enableLimitSpring ?? false,
    limitFrequencyHz: options.limitFrequencyHz ?? 0,
    limitDampingRatio: options.limitDampingRatio ?? 0,
    motorImpulse: 0,
    lowerLimitImpulse: 0,
    upperLimitImpulse: 0,
  };
}

function createJointBase(options: Readonly<Physics3DJointOptions>): Omit<Physics3DJoint, 'kind'> {
  return {
    bodyA: options.bodyA,
    bodyB: options.bodyB,
    localAnchorAX: options.localAnchorAX ?? 0,
    localAnchorAY: options.localAnchorAY ?? 0,
    localAnchorAZ: options.localAnchorAZ ?? 0,
    localAnchorBX: options.localAnchorBX ?? 0,
    localAnchorBY: options.localAnchorBY ?? 0,
    localAnchorBZ: options.localAnchorBZ ?? 0,
    collideConnected: options.collideConnected ?? false,
    breakForce: options.breakForce ?? Number.POSITIVE_INFINITY,
    breakTorque: options.breakTorque ?? Number.POSITIVE_INFINITY,
    broken: false,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    impulse3: 0,
    impulse4: 0,
    impulse5: 0,
    rAX: 0,
    rAY: 0,
    rAZ: 0,
    rBX: 0,
    rBY: 0,
    rBZ: 0,
  };
}

function createJointFrames(options: Readonly<Physics3DJointFrameOptions>): Physics3DJointFrames {
  return {
    localRotationAX: options.localRotationAX ?? 0,
    localRotationAY: options.localRotationAY ?? 0,
    localRotationAZ: options.localRotationAZ ?? 0,
    localRotationAW: options.localRotationAW ?? 1,
    localRotationBX: options.localRotationBX ?? 0,
    localRotationBY: options.localRotationBY ?? 0,
    localRotationBZ: options.localRotationBZ ?? 0,
    localRotationBW: options.localRotationBW ?? 1,
  };
}
