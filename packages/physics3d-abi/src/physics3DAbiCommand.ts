import {
  Physics3DBallAndSocketJointKind,
  Physics3DConeTwistJointKind,
  Physics3DDistanceJointKind,
  Physics3DFixedJointKind,
  Physics3DGeneric6DofJointKind,
  Physics3DHingeJointKind,
  Physics3DSliderJointKind,
} from '@flighthq/physics3d/contract';
import type {
  CollisionColliderShape3D,
  Physics3DAbiCommandBuffer,
  Physics3DAbiObjectId,
  Physics3DCollider,
  Physics3DConeTwistJoint,
  Physics3DDistanceJoint,
  Physics3DGeneric6DofJoint,
  Physics3DHingeJoint,
  Physics3DJoint,
  Physics3DJointFrames,
  Physics3DSliderJoint,
  Physics3DSolverConfig,
  RigidBody3D,
} from '@flighthq/types/contract';

import {
  Physics3DAbiBodyFlag,
  Physics3DAbiBodyType,
  Physics3DAbiCommandByteLength,
  Physics3DAbiCommandHeaderByteLength,
  Physics3DAbiCommandKind,
  Physics3DAbiCommandMagic,
  Physics3DAbiCommandRecordHeaderByteLength,
  Physics3DAbiJointKind,
  Physics3DAbiSetColliderPayloadOffset,
  Physics3DAbiShapeHeaderByteLength,
  Physics3DAbiShapeKind,
  Physics3DAbiVersion,
} from './physics3DAbiLayout';

export function getPhysics3DAbiSetColliderCommandByteLength(collider: Readonly<Physics3DCollider>): number {
  const shapeByteLength = getShapeByteLength(collider.local);
  if (shapeByteLength < 0) return -1;
  const byteLength =
    Physics3DAbiCommandRecordHeaderByteLength + Physics3DAbiSetColliderPayloadOffset.Shape + shapeByteLength;
  return Number.isSafeInteger(byteLength) && byteLength <= 0xffffffff ? byteLength : -1;
}

export function writePhysics3DAbiApplyForceAtPointCommand(
  out: Physics3DAbiCommandBuffer,
  bodyId: Physics3DAbiObjectId,
  x: number,
  y: number,
  z: number,
  pointX: number,
  pointY: number,
  pointZ: number,
): boolean {
  return writeBodyAction(out, Physics3DAbiCommandKind.ApplyForceAtPoint, bodyId, x, y, z, pointX, pointY, pointZ);
}

export function writePhysics3DAbiApplyForceCommand(
  out: Physics3DAbiCommandBuffer,
  bodyId: Physics3DAbiObjectId,
  x: number,
  y: number,
  z: number,
): boolean {
  return writeBodyAction(out, Physics3DAbiCommandKind.ApplyForce, bodyId, x, y, z, 0, 0, 0);
}

export function writePhysics3DAbiApplyLinearImpulseAtPointCommand(
  out: Physics3DAbiCommandBuffer,
  bodyId: Physics3DAbiObjectId,
  x: number,
  y: number,
  z: number,
  pointX: number,
  pointY: number,
  pointZ: number,
): boolean {
  return writeBodyAction(
    out,
    Physics3DAbiCommandKind.ApplyLinearImpulseAtPoint,
    bodyId,
    x,
    y,
    z,
    pointX,
    pointY,
    pointZ,
  );
}

export function writePhysics3DAbiApplyLinearImpulseCommand(
  out: Physics3DAbiCommandBuffer,
  bodyId: Physics3DAbiObjectId,
  x: number,
  y: number,
  z: number,
): boolean {
  return writeBodyAction(out, Physics3DAbiCommandKind.ApplyLinearImpulse, bodyId, x, y, z, 0, 0, 0);
}

export function writePhysics3DAbiApplyTorqueCommand(
  out: Physics3DAbiCommandBuffer,
  bodyId: Physics3DAbiObjectId,
  x: number,
  y: number,
  z: number,
): boolean {
  return writeBodyAction(out, Physics3DAbiCommandKind.ApplyTorque, bodyId, x, y, z, 0, 0, 0);
}

export function writePhysics3DAbiDestroyBodyCommand(
  out: Physics3DAbiCommandBuffer,
  bodyId: Physics3DAbiObjectId,
): boolean {
  return writeEmptyCommand(out, Physics3DAbiCommandKind.DestroyBody, bodyId);
}

export function writePhysics3DAbiDestroyColliderCommand(
  out: Physics3DAbiCommandBuffer,
  colliderId: Physics3DAbiObjectId,
): boolean {
  return writeEmptyCommand(out, Physics3DAbiCommandKind.DestroyCollider, colliderId);
}

export function writePhysics3DAbiDestroyJointCommand(
  out: Physics3DAbiCommandBuffer,
  jointId: Physics3DAbiObjectId,
): boolean {
  return writeEmptyCommand(out, Physics3DAbiCommandKind.DestroyJoint, jointId);
}

export function writePhysics3DAbiSetBodyCommand(
  out: Physics3DAbiCommandBuffer,
  bodyId: Physics3DAbiObjectId,
  body: Readonly<RigidBody3D>,
): boolean {
  if (!isObjectId(bodyId)) return false;
  const type = encodeBodyType(body.type);
  if (type < 0) return false;
  const record = beginCommand(out, Physics3DAbiCommandKind.SetBody, Physics3DAbiCommandByteLength.SetBody, bodyId, 0);
  if (record === null) return false;

  let flags = type;
  if (body.fixedRotation) flags |= Physics3DAbiBodyFlag.FixedRotation;
  if (body.bullet) flags |= Physics3DAbiBodyFlag.Bullet;
  if (body.sleeping) flags |= Physics3DAbiBodyFlag.Sleeping;
  if (body.sleepEnabled) flags |= Physics3DAbiBodyFlag.SleepEnabled;
  record.view.setUint32(record.payload, flags, true);
  record.view.setUint32(record.payload + 4, 0, true);

  writeBodyValues(record.view, record.payload + 8, body);
  finishCommand(out, record);
  return true;
}

export function writePhysics3DAbiSetColliderCommand(
  out: Physics3DAbiCommandBuffer,
  colliderId: Physics3DAbiObjectId,
  bodyId: Physics3DAbiObjectId,
  collider: Readonly<Physics3DCollider>,
): boolean {
  if (
    !isObjectId(colliderId) ||
    !isObjectId(bodyId) ||
    !isUint32(collider.filter.categoryBits) ||
    !isUint32(collider.filter.maskBits) ||
    !isInt32(collider.filter.groupIndex)
  ) {
    return false;
  }
  const shapeByteLength = getShapeByteLength(collider.local);
  if (shapeByteLength < 0) return false;
  const record = beginCommand(
    out,
    Physics3DAbiCommandKind.SetCollider,
    Physics3DAbiCommandRecordHeaderByteLength + Physics3DAbiSetColliderPayloadOffset.Shape + shapeByteLength,
    colliderId,
    bodyId,
  );
  if (record === null) return false;

  record.view.setUint32(record.payload, collider.sensor ? 1 : 0, true);
  record.view.setUint32(record.payload + 4, collider.filter.categoryBits >>> 0, true);
  record.view.setUint32(record.payload + 8, collider.filter.maskBits >>> 0, true);
  record.view.setInt32(record.payload + 12, collider.filter.groupIndex | 0, true);
  record.view.setFloat64(record.payload + 16, collider.material.density, true);
  record.view.setFloat64(record.payload + 24, collider.material.friction, true);
  record.view.setFloat64(record.payload + 32, collider.material.restitution, true);
  writeShape(record.view, record.payload + Physics3DAbiSetColliderPayloadOffset.Shape, collider.local);
  finishCommand(out, record);
  return true;
}

export function writePhysics3DAbiSetGravityCommand(
  out: Physics3DAbiCommandBuffer,
  x: number,
  y: number,
  z: number,
): boolean {
  const record = beginCommand(out, Physics3DAbiCommandKind.SetGravity, Physics3DAbiCommandByteLength.SetGravity, 0, 0);
  if (record === null) return false;
  record.view.setFloat64(record.payload, x, true);
  record.view.setFloat64(record.payload + 8, y, true);
  record.view.setFloat64(record.payload + 16, z, true);
  finishCommand(out, record);
  return true;
}

export function writePhysics3DAbiSetJointCommand(
  out: Physics3DAbiCommandBuffer,
  jointId: Physics3DAbiObjectId,
  joint: Readonly<Physics3DJoint>,
): boolean {
  if (!isObjectId(jointId) || !isObjectId(joint.bodyA) || !isObjectId(joint.bodyB)) return false;
  const kind = encodeJointKind(joint.kind);
  if (kind === 0) return false;
  const record = beginCommand(
    out,
    Physics3DAbiCommandKind.SetJoint,
    Physics3DAbiCommandByteLength.SetJoint,
    jointId,
    0,
  );
  if (record === null) return false;

  const flags = encodeJointFlags(joint, kind);
  record.view.setUint32(record.payload, kind, true);
  record.view.setUint32(record.payload + 4, joint.bodyA, true);
  record.view.setUint32(record.payload + 8, joint.bodyB, true);
  record.view.setUint32(record.payload + 12, flags, true);

  const frames = hasJointFrames(joint) ? joint : null;
  writeFloat64Values(record.view, record.payload + 16, [
    joint.localAnchorAX,
    joint.localAnchorAY,
    joint.localAnchorAZ,
    joint.localAnchorBX,
    joint.localAnchorBY,
    joint.localAnchorBZ,
    joint.breakForce,
    joint.breakTorque,
    frames?.localRotationAX ?? 0,
    frames?.localRotationAY ?? 0,
    frames?.localRotationAZ ?? 0,
    frames?.localRotationAW ?? 1,
    frames?.localRotationBX ?? 0,
    frames?.localRotationBY ?? 0,
    frames?.localRotationBZ ?? 0,
    frames?.localRotationBW ?? 1,
  ]);
  writeFloat64Values(record.view, record.payload + 144, getJointKindValues(joint, kind));
  finishCommand(out, record);
  return true;
}

export function writePhysics3DAbiSetSolverConfigCommand(
  out: Physics3DAbiCommandBuffer,
  config: Readonly<Physics3DSolverConfig>,
): boolean {
  if (
    !isUint32(config.substeps) ||
    !isUint32(config.maxCcdSubsteps) ||
    !isUint32(config.maxCcdRotationSubsteps) ||
    !isUint32(config.sequentialImpulse.velocityIterations) ||
    !isUint32(config.sequentialImpulse.positionIterations)
  ) {
    return false;
  }
  const record = beginCommand(
    out,
    Physics3DAbiCommandKind.SetSolverConfig,
    Physics3DAbiCommandByteLength.SetSolverConfig,
    0,
    0,
  );
  if (record === null) return false;
  let flags = 0;
  if (config.allowSleeping) flags |= 1;
  if (config.continuousCollision) flags |= 1 << 1;
  if (config.sequentialImpulse.warmStarting) flags |= 1 << 2;
  record.view.setUint32(record.payload, flags, true);
  record.view.setUint32(record.payload + 4, config.substeps, true);
  record.view.setUint32(record.payload + 8, config.maxCcdSubsteps, true);
  record.view.setUint32(record.payload + 12, config.maxCcdRotationSubsteps, true);
  record.view.setUint32(record.payload + 16, config.sequentialImpulse.velocityIterations, true);
  record.view.setUint32(record.payload + 20, config.sequentialImpulse.positionIterations, true);
  record.view.setUint32(record.payload + 24, 0, true);
  record.view.setUint32(record.payload + 28, 0, true);
  writeFloat64Values(record.view, record.payload + 32, [
    config.sleepLinearThreshold,
    config.sleepAngularThreshold,
    config.timeToSleep,
    config.sequentialImpulse.penetrationSlop,
    config.sequentialImpulse.positionCorrection,
    config.sequentialImpulse.restitutionThreshold,
  ]);
  finishCommand(out, record);
  return true;
}

export function writePhysics3DAbiWakeBodyCommand(
  out: Physics3DAbiCommandBuffer,
  bodyId: Physics3DAbiObjectId,
): boolean {
  return writeEmptyCommand(out, Physics3DAbiCommandKind.WakeBody, bodyId);
}

interface PendingCommand {
  readonly view: DataView;
  readonly start: number;
  readonly payload: number;
  readonly byteLength: number;
}

function beginCommand(
  out: Physics3DAbiCommandBuffer,
  kind: number,
  byteLength: number,
  objectId: number,
  relatedId: number,
): PendingCommand | null {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < Physics3DAbiCommandRecordHeaderByteLength ||
    byteLength > 0xffffffff ||
    byteLength % 8 !== 0 ||
    !Number.isSafeInteger(out.byteLength) ||
    out.byteLength < Physics3DAbiCommandHeaderByteLength ||
    !Number.isSafeInteger(out.commandCount) ||
    out.commandCount < 0 ||
    !Number.isSafeInteger(out.byteLength + byteLength) ||
    out.byteLength + byteLength > out.data.byteLength
  ) {
    return null;
  }
  const view = new DataView(out.data.buffer, out.data.byteOffset, out.data.byteLength);
  if (
    view.getUint32(0, true) !== Physics3DAbiCommandMagic ||
    view.getUint32(4, true) !== Physics3DAbiVersion ||
    view.getUint32(8, true) !== out.byteLength ||
    view.getUint32(12, true) !== out.commandCount
  ) {
    return null;
  }
  const start = out.byteLength;
  view.setUint32(start, kind, true);
  view.setUint32(start + 4, byteLength, true);
  view.setUint32(start + 8, objectId >>> 0, true);
  view.setUint32(start + 12, relatedId >>> 0, true);
  return { view, start, payload: start + Physics3DAbiCommandRecordHeaderByteLength, byteLength };
}

function encodeBodyType(type: RigidBody3D['type']): number {
  if (type === 'dynamic') return Physics3DAbiBodyType.Dynamic;
  if (type === 'kinematic') return Physics3DAbiBodyType.Kinematic;
  if (type === 'static') return Physics3DAbiBodyType.Static;
  return -1;
}

function encodeJointFlags(joint: Readonly<Physics3DJoint>, kind: number): number {
  let flags = joint.collideConnected ? 1 : 0;
  if (joint.broken) flags |= 1 << 1;
  if (kind === Physics3DAbiJointKind.Distance) {
    const distance = joint as Readonly<Physics3DDistanceJoint>;
    if (distance.enableSpring) flags |= 1 << 2;
    if (distance.enableLimit) flags |= 1 << 3;
  } else if (kind === Physics3DAbiJointKind.Hinge) {
    const hinge = joint as Readonly<Physics3DHingeJoint>;
    if (hinge.enableLimit) flags |= 1 << 2;
    if (hinge.enableMotor) flags |= 1 << 3;
    if (hinge.enableLimitSpring) flags |= 1 << 4;
  } else if (kind === Physics3DAbiJointKind.Slider) {
    const slider = joint as Readonly<Physics3DSliderJoint>;
    if (slider.enableLimit) flags |= 1 << 2;
    if (slider.enableMotor) flags |= 1 << 3;
    if (slider.enableLimitSpring) flags |= 1 << 4;
  } else if (kind === Physics3DAbiJointKind.ConeTwist) {
    const cone = joint as Readonly<Physics3DConeTwistJoint>;
    if (cone.enableSwingLimit) flags |= 1 << 2;
    if (cone.enableTwistLimit) flags |= 1 << 3;
    if (cone.enableLimitSpring) flags |= 1 << 4;
  } else if (kind === Physics3DAbiJointKind.Generic6Dof) {
    if ((joint as Readonly<Physics3DGeneric6DofJoint>).enableLimitSpring) flags |= 1 << 2;
  }
  return flags;
}

function encodeJointKind(kind: string): number {
  if (kind === Physics3DBallAndSocketJointKind) return Physics3DAbiJointKind.BallAndSocket;
  if (kind === Physics3DDistanceJointKind) return Physics3DAbiJointKind.Distance;
  if (kind === Physics3DFixedJointKind) return Physics3DAbiJointKind.Fixed;
  if (kind === Physics3DHingeJointKind) return Physics3DAbiJointKind.Hinge;
  if (kind === Physics3DSliderJointKind) return Physics3DAbiJointKind.Slider;
  if (kind === Physics3DConeTwistJointKind) return Physics3DAbiJointKind.ConeTwist;
  if (kind === Physics3DGeneric6DofJointKind) return Physics3DAbiJointKind.Generic6Dof;
  return 0;
}

function encodeShapeKind(shape: Readonly<CollisionColliderShape3D>): number {
  if (shape.kind === 'sphere') return Physics3DAbiShapeKind.Sphere;
  if (shape.kind === 'aabb') return Physics3DAbiShapeKind.Aabb;
  if (shape.kind === 'box') return Physics3DAbiShapeKind.Box;
  if (shape.kind === 'capsule') return Physics3DAbiShapeKind.Capsule;
  if (shape.kind === 'cylinder') return Physics3DAbiShapeKind.Cylinder;
  if (shape.kind === 'cone') return Physics3DAbiShapeKind.Cone;
  if (shape.kind === 'convex') return Physics3DAbiShapeKind.Convex;
  if (shape.kind === 'triangle-mesh') return Physics3DAbiShapeKind.TriangleMesh;
  if (shape.kind === 'heightfield') return Physics3DAbiShapeKind.Heightfield;
  return 0;
}

function finishCommand(out: Physics3DAbiCommandBuffer, command: Readonly<PendingCommand>): void {
  out.byteLength = command.start + command.byteLength;
  out.commandCount += 1;
  command.view.setUint32(8, out.byteLength, true);
  command.view.setUint32(12, out.commandCount, true);
}

function getJointKindValues(joint: Readonly<Physics3DJoint>, kind: number): number[] {
  const values = new Array<number>(14).fill(0);
  if (kind === Physics3DAbiJointKind.Distance) {
    const value = joint as Readonly<Physics3DDistanceJoint>;
    values[0] = value.length;
    values[1] = value.frequencyHz;
    values[2] = value.dampingRatio;
    values[3] = value.minLength;
    values[4] = value.maxLength;
  } else if (kind === Physics3DAbiJointKind.Hinge) {
    const value = joint as Readonly<Physics3DHingeJoint>;
    values[0] = value.lowerAngle;
    values[1] = value.upperAngle;
    values[2] = value.motorSpeed;
    values[3] = value.maxMotorTorque;
    values[4] = value.limitFrequencyHz;
    values[5] = value.limitDampingRatio;
  } else if (kind === Physics3DAbiJointKind.Slider) {
    const value = joint as Readonly<Physics3DSliderJoint>;
    values[0] = value.lowerTranslation;
    values[1] = value.upperTranslation;
    values[2] = value.motorSpeed;
    values[3] = value.maxMotorForce;
    values[4] = value.limitFrequencyHz;
    values[5] = value.limitDampingRatio;
  } else if (kind === Physics3DAbiJointKind.ConeTwist) {
    const value = joint as Readonly<Physics3DConeTwistJoint>;
    values[0] = value.swingLimitY;
    values[1] = value.swingLimitZ;
    values[2] = value.lowerTwistAngle;
    values[3] = value.upperTwistAngle;
    values[4] = value.limitFrequencyHz;
    values[5] = value.limitDampingRatio;
  } else if (kind === Physics3DAbiJointKind.Generic6Dof) {
    const value = joint as Readonly<Physics3DGeneric6DofJoint>;
    values[0] = value.lowerLinearX;
    values[1] = value.lowerLinearY;
    values[2] = value.lowerLinearZ;
    values[3] = value.upperLinearX;
    values[4] = value.upperLinearY;
    values[5] = value.upperLinearZ;
    values[6] = value.lowerAngularX;
    values[7] = value.lowerAngularY;
    values[8] = value.lowerAngularZ;
    values[9] = value.upperAngularX;
    values[10] = value.upperAngularY;
    values[11] = value.upperAngularZ;
    values[12] = value.limitFrequencyHz;
    values[13] = value.limitDampingRatio;
  }
  return values;
}

function getShapeByteLength(shape: Readonly<CollisionColliderShape3D>): number {
  const kind = encodeShapeKind(shape);
  if (kind === 0) return -1;
  if (
    (shape.kind === 'triangle-mesh' && (!isUint32(shape.version) || shape.indices.some((index) => !isUint32(index)))) ||
    (shape.kind === 'heightfield' && (!isUint32(shape.version) || !isUint32(shape.columns) || !isUint32(shape.rows)))
  ) {
    return -1;
  }
  const scalarCount = getShapeScalarCount(shape);
  const integerCount = getShapeIntegerCount(shape);
  const unaligned = Physics3DAbiShapeHeaderByteLength + scalarCount * 8 + integerCount * 4;
  if (!Number.isSafeInteger(unaligned) || unaligned > 0xffffffff) return -1;
  return align8(unaligned);
}

function getShapeIntegerCount(shape: Readonly<CollisionColliderShape3D>): number {
  if (shape.kind === 'triangle-mesh') return shape.indices.length;
  if (shape.kind === 'heightfield') return 2;
  return 0;
}

function getShapeScalarCount(shape: Readonly<CollisionColliderShape3D>): number {
  if (shape.kind === 'sphere') return 4;
  if (shape.kind === 'aabb') return 6;
  if (shape.kind === 'box') return 10;
  if (shape.kind === 'capsule' || shape.kind === 'cylinder' || shape.kind === 'cone') return 7;
  if (shape.kind === 'convex') return shape.points.length;
  if (shape.kind === 'triangle-mesh') return 7 + shape.points.length;
  return 9 + shape.heights.length;
}

function hasJointFrames(joint: Readonly<Physics3DJoint>): joint is Readonly<Physics3DJoint & Physics3DJointFrames> {
  return 'localRotationAX' in joint;
}

function isObjectId(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function writeBodyAction(
  out: Physics3DAbiCommandBuffer,
  kind: number,
  bodyId: Physics3DAbiObjectId,
  x: number,
  y: number,
  z: number,
  pointX: number,
  pointY: number,
  pointZ: number,
): boolean {
  if (!isObjectId(bodyId)) return false;
  const record = beginCommand(out, kind, Physics3DAbiCommandByteLength.BodyAction, bodyId, 0);
  if (record === null) return false;
  record.view.setFloat64(record.payload, x, true);
  record.view.setFloat64(record.payload + 8, y, true);
  record.view.setFloat64(record.payload + 16, z, true);
  record.view.setFloat64(record.payload + 24, pointX, true);
  record.view.setFloat64(record.payload + 32, pointY, true);
  record.view.setFloat64(record.payload + 40, pointZ, true);
  finishCommand(out, record);
  return true;
}

function writeEmptyCommand(out: Physics3DAbiCommandBuffer, kind: number, objectId: number): boolean {
  if (!isObjectId(objectId)) return false;
  const record = beginCommand(out, kind, Physics3DAbiCommandRecordHeaderByteLength, objectId, 0);
  if (record === null) return false;
  finishCommand(out, record);
  return true;
}

function writeBodyValues(view: DataView, byteOffset: number, body: Readonly<RigidBody3D>): void {
  view.setFloat64(byteOffset, body.x, true);
  view.setFloat64(byteOffset + 8, body.y, true);
  view.setFloat64(byteOffset + 16, body.z, true);
  view.setFloat64(byteOffset + 24, body.orientationX, true);
  view.setFloat64(byteOffset + 32, body.orientationY, true);
  view.setFloat64(byteOffset + 40, body.orientationZ, true);
  view.setFloat64(byteOffset + 48, body.orientationW, true);
  view.setFloat64(byteOffset + 56, body.velocityX, true);
  view.setFloat64(byteOffset + 64, body.velocityY, true);
  view.setFloat64(byteOffset + 72, body.velocityZ, true);
  view.setFloat64(byteOffset + 80, body.angularVelocityX, true);
  view.setFloat64(byteOffset + 88, body.angularVelocityY, true);
  view.setFloat64(byteOffset + 96, body.angularVelocityZ, true);
  view.setFloat64(byteOffset + 104, body.forceX, true);
  view.setFloat64(byteOffset + 112, body.forceY, true);
  view.setFloat64(byteOffset + 120, body.forceZ, true);
  view.setFloat64(byteOffset + 128, body.torqueX, true);
  view.setFloat64(byteOffset + 136, body.torqueY, true);
  view.setFloat64(byteOffset + 144, body.torqueZ, true);
  view.setFloat64(byteOffset + 152, body.mass, true);
  view.setFloat64(byteOffset + 160, body.inertiaXX, true);
  view.setFloat64(byteOffset + 168, body.inertiaYY, true);
  view.setFloat64(byteOffset + 176, body.inertiaZZ, true);
  view.setFloat64(byteOffset + 184, body.inertiaXY, true);
  view.setFloat64(byteOffset + 192, body.inertiaXZ, true);
  view.setFloat64(byteOffset + 200, body.inertiaYZ, true);
  view.setFloat64(byteOffset + 208, body.centerX, true);
  view.setFloat64(byteOffset + 216, body.centerY, true);
  view.setFloat64(byteOffset + 224, body.centerZ, true);
  view.setFloat64(byteOffset + 232, body.linearDamping, true);
  view.setFloat64(byteOffset + 240, body.angularDamping, true);
  view.setFloat64(byteOffset + 248, body.gravityScale, true);
  view.setFloat64(byteOffset + 256, body.sleepTimer, true);
}

function writeFloat64Values(view: DataView, byteOffset: number, values: Readonly<number[]>): void {
  for (let i = 0; i < values.length; i += 1) view.setFloat64(byteOffset + i * 8, values[i], true);
}

function writeShape(view: DataView, byteOffset: number, shape: Readonly<CollisionColliderShape3D>): void {
  const scalarCount = getShapeScalarCount(shape);
  const integerCount = getShapeIntegerCount(shape);
  view.setUint32(byteOffset, encodeShapeKind(shape), true);
  view.setUint32(byteOffset + 4, scalarCount, true);
  view.setUint32(byteOffset + 8, integerCount, true);
  view.setUint32(byteOffset + 12, 'version' in shape ? shape.version : 0, true);
  const scalarOffset = byteOffset + Physics3DAbiShapeHeaderByteLength;
  writeShapeScalars(view, scalarOffset, shape);
  const integerOffset = scalarOffset + scalarCount * 8;
  if (shape.kind === 'triangle-mesh') {
    for (let i = 0; i < shape.indices.length; i += 1) {
      view.setUint32(integerOffset + i * 4, shape.indices[i], true);
    }
  } else if (shape.kind === 'heightfield') {
    view.setUint32(integerOffset, shape.columns, true);
    view.setUint32(integerOffset + 4, shape.rows, true);
  }
  const unalignedEnd = integerOffset + integerCount * 4;
  const alignedEnd = align8(unalignedEnd);
  for (let i = unalignedEnd; i < alignedEnd; i += 1) view.setUint8(i, 0);
}

function writeShapeScalars(view: DataView, byteOffset: number, shape: Readonly<CollisionColliderShape3D>): void {
  if (shape.kind === 'sphere') {
    writeFloat64Values(view, byteOffset, [shape.x, shape.y, shape.z, shape.radius]);
  } else if (shape.kind === 'aabb') {
    writeFloat64Values(view, byteOffset, [shape.minX, shape.minY, shape.minZ, shape.maxX, shape.maxY, shape.maxZ]);
  } else if (shape.kind === 'box') {
    writeFloat64Values(view, byteOffset, [
      shape.x,
      shape.y,
      shape.z,
      shape.halfX,
      shape.halfY,
      shape.halfZ,
      shape.rotationX,
      shape.rotationY,
      shape.rotationZ,
      shape.rotationW,
    ]);
  } else if (shape.kind === 'capsule' || shape.kind === 'cylinder') {
    writeFloat64Values(view, byteOffset, [shape.x0, shape.y0, shape.z0, shape.x1, shape.y1, shape.z1, shape.radius]);
  } else if (shape.kind === 'cone') {
    writeFloat64Values(view, byteOffset, [
      shape.apexX,
      shape.apexY,
      shape.apexZ,
      shape.baseX,
      shape.baseY,
      shape.baseZ,
      shape.radius,
    ]);
  } else if (shape.kind === 'convex') {
    writeFloat64Values(view, byteOffset, shape.points);
  } else if (shape.kind === 'triangle-mesh') {
    writeFloat64Values(view, byteOffset, [
      shape.x,
      shape.y,
      shape.z,
      shape.rotationX,
      shape.rotationY,
      shape.rotationZ,
      shape.rotationW,
    ]);
    writeFloat64Values(view, byteOffset + 7 * 8, shape.points);
  } else {
    writeFloat64Values(view, byteOffset, [
      shape.cellSizeX,
      shape.cellSizeZ,
      shape.x,
      shape.y,
      shape.z,
      shape.rotationX,
      shape.rotationY,
      shape.rotationZ,
      shape.rotationW,
    ]);
    writeFloat64Values(view, byteOffset + 9 * 8, shape.heights);
  }
}

function align8(value: number): number {
  return Math.ceil(value / 8) * 8;
}
