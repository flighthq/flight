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
} from '@flighthq/physics2d/contract';
import type {
  CollisionBuiltInShape2D,
  Physics2DAbiCommandBuffer,
  Physics2DAbiObjectId,
  Physics2DCollider,
  Physics2DDistanceJoint,
  Physics2DGearJoint,
  Physics2DJoint,
  Physics2DMouseJoint,
  Physics2DPrismaticJoint,
  Physics2DPulleyJoint,
  Physics2DRevoluteJoint,
  Physics2DRopeJoint,
  Physics2DSolverConfig,
  Physics2DWeldJoint,
  Physics2DWheelJoint,
  RigidBody2D,
} from '@flighthq/types/contract';

import {
  Physics2DAbiBodyFlag,
  Physics2DAbiBodyType,
  Physics2DAbiCommandByteLength,
  Physics2DAbiCommandHeaderByteLength,
  Physics2DAbiCommandKind,
  Physics2DAbiCommandMagic,
  Physics2DAbiCommandRecordHeaderByteLength,
  Physics2DAbiJointFlag,
  Physics2DAbiJointKind,
  Physics2DAbiJointKindValueCount,
  Physics2DAbiSetColliderPayloadOffset,
  Physics2DAbiSetJointPayloadOffset,
  Physics2DAbiShapeHeaderByteLength,
  Physics2DAbiShapeKind,
  Physics2DAbiSolverConfigFlag,
  Physics2DAbiVersion,
} from './physics2DAbiLayout';

export function getPhysics2DAbiSetColliderCommandByteLength(collider: Readonly<Physics2DCollider>): number {
  const shapeByteLength = getShapeByteLength(collider.local);
  if (shapeByteLength < 0) return -1;
  const byteLength =
    Physics2DAbiCommandRecordHeaderByteLength + Physics2DAbiSetColliderPayloadOffset.Shape + shapeByteLength;
  return Number.isSafeInteger(byteLength) && byteLength <= 0xffffffff ? byteLength : -1;
}

export function writePhysics2DAbiApplyForceAtPointCommand(
  out: Physics2DAbiCommandBuffer,
  bodyId: Physics2DAbiObjectId,
  x: number,
  y: number,
  pointX: number,
  pointY: number,
): boolean {
  return writeBodyAction(out, Physics2DAbiCommandKind.ApplyForceAtPoint, bodyId, x, y, pointX, pointY);
}

export function writePhysics2DAbiApplyForceCommand(
  out: Physics2DAbiCommandBuffer,
  bodyId: Physics2DAbiObjectId,
  x: number,
  y: number,
): boolean {
  return writeBodyAction(out, Physics2DAbiCommandKind.ApplyForce, bodyId, x, y, 0, 0);
}

export function writePhysics2DAbiApplyLinearImpulseAtPointCommand(
  out: Physics2DAbiCommandBuffer,
  bodyId: Physics2DAbiObjectId,
  x: number,
  y: number,
  pointX: number,
  pointY: number,
): boolean {
  return writeBodyAction(out, Physics2DAbiCommandKind.ApplyLinearImpulseAtPoint, bodyId, x, y, pointX, pointY);
}

export function writePhysics2DAbiApplyLinearImpulseCommand(
  out: Physics2DAbiCommandBuffer,
  bodyId: Physics2DAbiObjectId,
  x: number,
  y: number,
): boolean {
  return writeBodyAction(out, Physics2DAbiCommandKind.ApplyLinearImpulse, bodyId, x, y, 0, 0);
}

// A plane's torque is one scalar, so this carries a single value where the 3D record carries a vector.
// It still travels in the shared body-action record with the unused slots zeroed, so every body action
// has one fixed length and a reader needs no per-kind size table.
export function writePhysics2DAbiApplyTorqueCommand(
  out: Physics2DAbiCommandBuffer,
  bodyId: Physics2DAbiObjectId,
  torque: number,
): boolean {
  return writeBodyAction(out, Physics2DAbiCommandKind.ApplyTorque, bodyId, torque, 0, 0, 0);
}

export function writePhysics2DAbiDestroyBodyCommand(
  out: Physics2DAbiCommandBuffer,
  bodyId: Physics2DAbiObjectId,
): boolean {
  return writeEmptyCommand(out, Physics2DAbiCommandKind.DestroyBody, bodyId);
}

export function writePhysics2DAbiDestroyColliderCommand(
  out: Physics2DAbiCommandBuffer,
  colliderId: Physics2DAbiObjectId,
): boolean {
  return writeEmptyCommand(out, Physics2DAbiCommandKind.DestroyCollider, colliderId);
}

export function writePhysics2DAbiDestroyJointCommand(
  out: Physics2DAbiCommandBuffer,
  jointId: Physics2DAbiObjectId,
): boolean {
  return writeEmptyCommand(out, Physics2DAbiCommandKind.DestroyJoint, jointId);
}

export function writePhysics2DAbiSetBodyCommand(
  out: Physics2DAbiCommandBuffer,
  bodyId: Physics2DAbiObjectId,
  body: Readonly<RigidBody2D>,
): boolean {
  if (!isObjectId(bodyId)) return false;
  const type = encodeBodyType(body.type);
  if (type < 0) return false;
  const record = beginCommand(out, Physics2DAbiCommandKind.SetBody, Physics2DAbiCommandByteLength.SetBody, bodyId, 0);
  if (record === null) return false;

  let flags = type;
  if (body.fixedRotation) flags |= Physics2DAbiBodyFlag.FixedRotation;
  if (body.bullet) flags |= Physics2DAbiBodyFlag.Bullet;
  if (body.sleeping) flags |= Physics2DAbiBodyFlag.Sleeping;
  if (body.sleepEnabled) flags |= Physics2DAbiBodyFlag.SleepEnabled;
  record.view.setUint32(record.payload, flags, true);
  record.view.setUint32(record.payload + 4, 0, true);

  writeFloat64Values(record.view, record.payload + 8, [
    body.x,
    body.y,
    body.angle,
    body.velocityX,
    body.velocityY,
    body.angularVelocity,
    body.forceX,
    body.forceY,
    body.torque,
    body.mass,
    body.inertia,
    body.centerX,
    body.centerY,
    body.linearDamping,
    body.angularDamping,
    body.gravityScale,
    body.sleepTimer,
  ]);
  finishCommand(out, record);
  return true;
}

export function writePhysics2DAbiSetColliderCommand(
  out: Physics2DAbiCommandBuffer,
  colliderId: Physics2DAbiObjectId,
  bodyId: Physics2DAbiObjectId,
  collider: Readonly<Physics2DCollider>,
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
    Physics2DAbiCommandKind.SetCollider,
    Physics2DAbiCommandRecordHeaderByteLength + Physics2DAbiSetColliderPayloadOffset.Shape + shapeByteLength,
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
  writeShape(record.view, record.payload + Physics2DAbiSetColliderPayloadOffset.Shape, collider.local);
  finishCommand(out, record);
  return true;
}

export function writePhysics2DAbiSetGravityCommand(out: Physics2DAbiCommandBuffer, x: number, y: number): boolean {
  const record = beginCommand(out, Physics2DAbiCommandKind.SetGravity, Physics2DAbiCommandByteLength.SetGravity, 0, 0);
  if (record === null) return false;
  record.view.setFloat64(record.payload, x, true);
  record.view.setFloat64(record.payload + 8, y, true);
  finishCommand(out, record);
  return true;
}

export function writePhysics2DAbiSetJointCommand(
  out: Physics2DAbiCommandBuffer,
  jointId: Physics2DAbiObjectId,
  bodyAId: Physics2DAbiObjectId,
  bodyBId: Physics2DAbiObjectId,
  joint: Readonly<Physics2DJoint>,
): boolean {
  if (!isObjectId(jointId) || !isObjectId(bodyAId) || !isObjectId(bodyBId)) return false;
  const kind = encodeJointKind(joint.kind);
  if (kind < 0) return false;
  const record = beginCommand(
    out,
    Physics2DAbiCommandKind.SetJoint,
    Physics2DAbiCommandByteLength.SetJoint,
    jointId,
    0,
  );
  if (record === null) return false;

  record.view.setUint32(record.payload + Physics2DAbiSetJointPayloadOffset.Kind, kind, true);
  record.view.setUint32(record.payload + Physics2DAbiSetJointPayloadOffset.BodyA, bodyAId >>> 0, true);
  record.view.setUint32(record.payload + Physics2DAbiSetJointPayloadOffset.BodyB, bodyBId >>> 0, true);
  record.view.setUint32(record.payload + Physics2DAbiSetJointPayloadOffset.Flags, encodeJointFlags(joint, kind), true);

  writeFloat64Values(record.view, record.payload + Physics2DAbiSetJointPayloadOffset.CommonValues, [
    joint.localAnchorAX,
    joint.localAnchorAY,
    joint.localAnchorBX,
    joint.localAnchorBY,
    joint.breakForce,
    joint.breakTorque,
  ]);
  writeFloat64Values(
    record.view,
    record.payload + Physics2DAbiSetJointPayloadOffset.KindValues,
    getJointKindValues(joint, kind),
  );
  finishCommand(out, record);
  return true;
}

export function writePhysics2DAbiSetSolverConfigCommand(
  out: Physics2DAbiCommandBuffer,
  config: Readonly<Physics2DSolverConfig>,
): boolean {
  if (
    !isUint32(config.velocityIterations) ||
    !isUint32(config.positionIterations) ||
    !isUint32(config.maxCcdSubsteps) ||
    !isUint32(config.maxCcdRotationSubsteps)
  ) {
    return false;
  }
  const record = beginCommand(
    out,
    Physics2DAbiCommandKind.SetSolverConfig,
    Physics2DAbiCommandByteLength.SetSolverConfig,
    0,
    0,
  );
  if (record === null) return false;

  let flags = 0;
  if (config.allowSleeping) flags |= Physics2DAbiSolverConfigFlag.AllowSleeping;
  if (config.continuousCollision) flags |= Physics2DAbiSolverConfigFlag.ContinuousCollision;
  if (config.warmStarting) flags |= Physics2DAbiSolverConfigFlag.WarmStarting;
  record.view.setUint32(record.payload, flags, true);
  record.view.setUint32(record.payload + 4, 0, true);
  record.view.setUint32(record.payload + 8, config.maxCcdSubsteps >>> 0, true);
  record.view.setUint32(record.payload + 12, config.maxCcdRotationSubsteps >>> 0, true);
  record.view.setUint32(record.payload + 16, config.velocityIterations >>> 0, true);
  record.view.setUint32(record.payload + 20, config.positionIterations >>> 0, true);
  record.view.setUint32(record.payload + 24, 0, true);
  record.view.setUint32(record.payload + 28, 0, true);

  writeFloat64Values(record.view, record.payload + 32, [
    config.sleepLinearThreshold,
    config.sleepAngularThreshold,
    config.timeToSleep,
    config.penetrationSlop,
    config.positionCorrection,
    config.restitutionThreshold,
  ]);
  finishCommand(out, record);
  return true;
}

export function writePhysics2DAbiWakeBodyCommand(
  out: Physics2DAbiCommandBuffer,
  bodyId: Physics2DAbiObjectId,
): boolean {
  return writeEmptyCommand(out, Physics2DAbiCommandKind.WakeBody, bodyId);
}

function beginCommand(
  out: Physics2DAbiCommandBuffer,
  kind: number,
  byteLength: number,
  objectId: number,
  relatedId: number,
): PendingCommand | null {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < Physics2DAbiCommandRecordHeaderByteLength ||
    byteLength > 0xffffffff ||
    byteLength % 8 !== 0 ||
    !Number.isSafeInteger(out.byteLength) ||
    out.byteLength < Physics2DAbiCommandHeaderByteLength ||
    !Number.isSafeInteger(out.commandCount) ||
    out.commandCount < 0 ||
    !Number.isSafeInteger(out.byteLength + byteLength) ||
    out.byteLength + byteLength > out.data.byteLength
  ) {
    return null;
  }
  const view = new DataView(out.data.buffer, out.data.byteOffset, out.data.byteLength);
  // The stream header is re-read rather than trusted, so a buffer mutated behind the record's back —
  // or one never initialized by `clearPhysics2DAbiCommandBuffer` — is refused instead of producing a
  // stream whose header disagrees with its contents.
  if (
    view.getUint32(0, true) !== Physics2DAbiCommandMagic ||
    view.getUint32(4, true) !== Physics2DAbiVersion ||
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
  return { view, start, payload: start + Physics2DAbiCommandRecordHeaderByteLength, byteLength };
}

function encodeBodyType(type: RigidBody2D['type']): number {
  if (type === 'dynamic') return Physics2DAbiBodyType.Dynamic;
  if (type === 'kinematic') return Physics2DAbiBodyType.Kinematic;
  if (type === 'static') return Physics2DAbiBodyType.Static;
  return -1;
}

// The Broken bit is deliberately never set here. A 2D joint has no `broken` field, because breaking
// REMOVES the joint from the world and records it in `world.jointEvents.broke`; the bit exists only on
// the readback side, where it is the sole way a buffer-based caller can learn that a joint it owns is
// gone. A SetJoint record carrying it is rejected rather than ignored.
function encodeJointFlags(joint: Readonly<Physics2DJoint>, kind: number): number {
  let flags = joint.collideConnected ? Physics2DAbiJointFlag.CollideConnected : 0;
  if (kind === Physics2DAbiJointKind.Revolute) {
    const value = joint as Readonly<Physics2DRevoluteJoint>;
    if (value.enableMotor) flags |= Physics2DAbiJointFlag.EnableMotor;
    if (value.enableLimit) flags |= Physics2DAbiJointFlag.EnableLimit;
    if (value.enableLimitSpring) flags |= Physics2DAbiJointFlag.EnableLimitSpring;
  } else if (kind === Physics2DAbiJointKind.Prismatic) {
    const value = joint as Readonly<Physics2DPrismaticJoint>;
    if (value.enableMotor) flags |= Physics2DAbiJointFlag.EnableMotor;
    if (value.enableLimit) flags |= Physics2DAbiJointFlag.EnableLimit;
    if (value.enableLimitSpring) flags |= Physics2DAbiJointFlag.EnableLimitSpring;
  } else if (kind === Physics2DAbiJointKind.Wheel) {
    if ((joint as Readonly<Physics2DWheelJoint>).enableMotor) flags |= Physics2DAbiJointFlag.EnableMotor;
  } else if (kind === Physics2DAbiJointKind.Gear) {
    const value = joint as Readonly<Physics2DGearJoint>;
    if (value.coordinateA === 'linear') flags |= Physics2DAbiJointFlag.LinearCoordinateA;
    if (value.coordinateB === 'linear') flags |= Physics2DAbiJointFlag.LinearCoordinateB;
  }
  return flags;
}

function encodeJointKind(kind: string): number {
  if (kind === Physics2DDistanceJointKind) return Physics2DAbiJointKind.Distance;
  if (kind === Physics2DRevoluteJointKind) return Physics2DAbiJointKind.Revolute;
  if (kind === Physics2DPrismaticJointKind) return Physics2DAbiJointKind.Prismatic;
  if (kind === Physics2DWeldJointKind) return Physics2DAbiJointKind.Weld;
  if (kind === Physics2DWheelJointKind) return Physics2DAbiJointKind.Wheel;
  if (kind === Physics2DRopeJointKind) return Physics2DAbiJointKind.Rope;
  if (kind === Physics2DMouseJointKind) return Physics2DAbiJointKind.Mouse;
  if (kind === Physics2DPulleyJointKind) return Physics2DAbiJointKind.Pulley;
  if (kind === Physics2DGearJointKind) return Physics2DAbiJointKind.Gear;
  return -1;
}

function encodeShapeKind(shape: Readonly<CollisionBuiltInShape2D>): number {
  if (shape.kind === 'circle') return Physics2DAbiShapeKind.Circle;
  if (shape.kind === 'aabb') return Physics2DAbiShapeKind.Aabb;
  if (shape.kind === 'obb') return Physics2DAbiShapeKind.Obb;
  if (shape.kind === 'capsule') return Physics2DAbiShapeKind.Capsule;
  if (shape.kind === 'polygon') return Physics2DAbiShapeKind.Polygon;
  if (shape.kind === 'segment') return Physics2DAbiShapeKind.Segment;
  return Physics2DAbiShapeKind.Point;
}

function finishCommand(out: Physics2DAbiCommandBuffer, command: Readonly<PendingCommand>): void {
  out.byteLength = command.start + command.byteLength;
  out.commandCount += 1;
  command.view.setUint32(8, out.byteLength, true);
  command.view.setUint32(12, out.commandCount, true);
}

function getJointKindValues(joint: Readonly<Physics2DJoint>, kind: number): number[] {
  const values = new Array<number>(Physics2DAbiJointKindValueCount).fill(0);
  if (kind === Physics2DAbiJointKind.Distance) {
    const value = joint as Readonly<Physics2DDistanceJoint>;
    values[0] = value.length;
    values[1] = value.frequencyHz;
    values[2] = value.dampingRatio;
  } else if (kind === Physics2DAbiJointKind.Revolute) {
    const value = joint as Readonly<Physics2DRevoluteJoint>;
    values[0] = value.lowerAngle;
    values[1] = value.upperAngle;
    values[2] = value.referenceAngle;
    values[3] = value.motorSpeed;
    values[4] = value.maxMotorTorque;
    values[5] = value.limitFrequencyHz;
    values[6] = value.limitDampingRatio;
  } else if (kind === Physics2DAbiJointKind.Prismatic) {
    const value = joint as Readonly<Physics2DPrismaticJoint>;
    values[0] = value.localAxisAX;
    values[1] = value.localAxisAY;
    values[2] = value.referenceAngle;
    values[3] = value.lowerTranslation;
    values[4] = value.upperTranslation;
    values[5] = value.motorSpeed;
    values[6] = value.maxMotorForce;
    values[7] = value.limitFrequencyHz;
    values[8] = value.limitDampingRatio;
  } else if (kind === Physics2DAbiJointKind.Weld) {
    values[0] = (joint as Readonly<Physics2DWeldJoint>).referenceAngle;
  } else if (kind === Physics2DAbiJointKind.Wheel) {
    const value = joint as Readonly<Physics2DWheelJoint>;
    values[0] = value.localAxisAX;
    values[1] = value.localAxisAY;
    values[2] = value.restTranslation;
    values[3] = value.frequencyHz;
    values[4] = value.dampingRatio;
    values[5] = value.motorSpeed;
    values[6] = value.maxMotorTorque;
  } else if (kind === Physics2DAbiJointKind.Rope) {
    values[0] = (joint as Readonly<Physics2DRopeJoint>).maxLength;
  } else if (kind === Physics2DAbiJointKind.Mouse) {
    const value = joint as Readonly<Physics2DMouseJoint>;
    values[0] = value.targetX;
    values[1] = value.targetY;
    values[2] = value.maxForce;
    values[3] = value.frequencyHz;
    values[4] = value.dampingRatio;
  } else if (kind === Physics2DAbiJointKind.Pulley) {
    const value = joint as Readonly<Physics2DPulleyJoint>;
    values[0] = value.groundAnchorAX;
    values[1] = value.groundAnchorAY;
    values[2] = value.groundAnchorBX;
    values[3] = value.groundAnchorBY;
    values[4] = value.ratio;
    values[5] = value.constant;
  } else if (kind === Physics2DAbiJointKind.Gear) {
    const value = joint as Readonly<Physics2DGearJoint>;
    values[0] = value.axisAX;
    values[1] = value.axisAY;
    values[2] = value.axisBX;
    values[3] = value.axisBY;
    values[4] = value.ratio;
    values[5] = value.constant;
  }
  return values;
}

function getShapeByteLength(shape: Readonly<CollisionBuiltInShape2D>): number {
  const scalarCount = getShapeScalarCount(shape);
  if (scalarCount < 0) return -1;
  return Physics2DAbiShapeHeaderByteLength + scalarCount * 8;
}

// Every 2D built-in is a fixed field list or a flat point list, so no shape carries an integer payload
// and none needs end padding: a Float64 block is already eight-aligned. The integer count stays in the
// header rather than being dropped, because a reader shared with the 3D stream must not need a
// dimension-specific header parser.
function getShapeScalarCount(shape: Readonly<CollisionBuiltInShape2D>): number {
  if (shape.kind === 'circle') return 3;
  if (shape.kind === 'aabb') return 4;
  if (shape.kind === 'obb') return 5;
  if (shape.kind === 'capsule') return 5;
  if (shape.kind === 'polygon') {
    const count = shape.points.length;
    return Number.isSafeInteger(count) && count >= 0 && count % 2 === 0 ? count : -1;
  }
  if (shape.kind === 'segment') return 4;
  return 2;
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
}

function isObjectId(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function writeBodyAction(
  out: Physics2DAbiCommandBuffer,
  kind: number,
  bodyId: Physics2DAbiObjectId,
  x: number,
  y: number,
  pointX: number,
  pointY: number,
): boolean {
  if (!isObjectId(bodyId)) return false;
  const record = beginCommand(out, kind, Physics2DAbiCommandByteLength.BodyAction, bodyId, 0);
  if (record === null) return false;
  writeFloat64Values(record.view, record.payload, [x, y, pointX, pointY]);
  finishCommand(out, record);
  return true;
}

function writeEmptyCommand(out: Physics2DAbiCommandBuffer, kind: number, objectId: number): boolean {
  if (!isObjectId(objectId)) return false;
  const record = beginCommand(out, kind, Physics2DAbiCommandRecordHeaderByteLength, objectId, 0);
  if (record === null) return false;
  finishCommand(out, record);
  return true;
}

function writeFloat64Values(view: DataView, byteOffset: number, values: Readonly<number[]>): void {
  for (let i = 0; i < values.length; i += 1) view.setFloat64(byteOffset + i * 8, values[i], true);
}

function writeShape(view: DataView, byteOffset: number, shape: Readonly<CollisionBuiltInShape2D>): void {
  const scalarCount = getShapeScalarCount(shape);
  view.setUint32(byteOffset, encodeShapeKind(shape), true);
  view.setUint32(byteOffset + 4, scalarCount, true);
  view.setUint32(byteOffset + 8, 0, true);
  view.setUint32(byteOffset + 12, 0, true);
  writeShapeScalars(view, byteOffset + Physics2DAbiShapeHeaderByteLength, shape);
}

function writeShapeScalars(view: DataView, byteOffset: number, shape: Readonly<CollisionBuiltInShape2D>): void {
  if (shape.kind === 'circle') {
    writeFloat64Values(view, byteOffset, [shape.x, shape.y, shape.radius]);
  } else if (shape.kind === 'aabb') {
    writeFloat64Values(view, byteOffset, [shape.minX, shape.minY, shape.maxX, shape.maxY]);
  } else if (shape.kind === 'obb') {
    writeFloat64Values(view, byteOffset, [shape.x, shape.y, shape.halfW, shape.halfH, shape.rotation]);
  } else if (shape.kind === 'capsule') {
    writeFloat64Values(view, byteOffset, [shape.x0, shape.y0, shape.x1, shape.y1, shape.radius]);
  } else if (shape.kind === 'polygon') {
    writeFloat64Values(view, byteOffset, [...shape.points]);
  } else if (shape.kind === 'segment') {
    writeFloat64Values(view, byteOffset, [shape.x0, shape.y0, shape.x1, shape.y1]);
  } else {
    writeFloat64Values(view, byteOffset, [shape.x, shape.y]);
  }
}

interface PendingCommand {
  view: DataView;
  start: number;
  payload: number;
  byteLength: number;
}
