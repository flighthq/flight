import {
  createCollisionHeightfield3D,
  createCollisionTriangleMesh3D,
  getCollisionHeightfieldValidationStatus3D,
  getCollisionShapeValidationStatus3D,
  getCollisionTriangleMeshValidationStatus3D,
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionPairTests3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  addPhysics3DJoint,
  applyPhysics3DForce,
  applyPhysics3DForceAtPoint,
  applyPhysics3DLinearImpulse,
  applyPhysics3DLinearImpulseAtPoint,
  applyPhysics3DTorque,
  createPhysics3DBallAndSocketJoint,
  createPhysics3DCollider,
  createPhysics3DConeTwistJoint,
  createPhysics3DDistanceJoint,
  createPhysics3DFixedJoint,
  createPhysics3DGeneric6DofJoint,
  createPhysics3DHingeJoint,
  createPhysics3DJointReaction,
  createPhysics3DQueryResult,
  createPhysics3DRayResult,
  createPhysics3DShapeCastResult,
  createPhysics3DSliderJoint,
  createPhysics3DWorld,
  createRigidBody3D,
  isPhysics3DBodyStateValid,
  isPhysics3DColliderStateValid,
  isPhysics3DContactStateValid,
  isPhysics3DGravityValid,
  isPhysics3DJointStateValid,
  isPhysics3DPositionIterationsValid,
  isPhysics3DSolverConfigValid,
  isPhysics3DSubstepsValid,
  isPhysics3DTimestepValid,
  isPhysics3DVelocityIterationsValid,
  queryPhysics3DPoint,
  queryPhysics3DRay,
  queryPhysics3DRayClosest,
  queryPhysics3DRegion,
  queryPhysics3DShapeCast,
  refreshRigidBody3DWorldInertia,
  registerBuiltInPhysics3DJointSolvers,
  removePhysics3DBody,
  removePhysics3DCollider,
  removePhysics3DJoint,
  setPhysics3DBodyBullet,
  setPhysics3DBodyFixedRotation,
  setPhysics3DBodySleepEnabled,
  setPhysics3DBodyTransform,
  setPhysics3DBodyType,
  setRigidBody3DMassData,
  stepPhysics3D,
  wakePhysics3DBody,
  writePhysics3DJointReaction,
} from '@flighthq/physics3d/contract';
import type { EntityConstruction } from '@flighthq/types/contract';
import type {
  CollisionColliderShape3D,
  Physics3DAbi,
  Physics3DAbiBodyBuffer,
  Physics3DAbiCommandBuffer,
  Physics3DAbiContactBuffer,
  Physics3DAbiContactHooks,
  Physics3DAbiContactSelection,
  Physics3DAbiExecutionResult,
  Physics3DAbiExecutionStatus,
  Physics3DAbiJointBuffer,
  Physics3DAbiQueryBuffer,
  Physics3DAbiStepStatus,
  Physics3DAbiWorldHandle,
  Physics3DAbiWorldStatus,
  Physics3DCollider,
  Physics3DContact,
  Physics3DContactCallback,
  Physics3DJoint,
  Physics3DMassData,
  Physics3DWorld,
  RigidBody3D,
} from '@flighthq/types/contract';

import {
  Physics3DAbiBodyFlag,
  Physics3DAbiBodyType,
  Physics3DAbiBodyValueStride,
  Physics3DAbiCapability,
  Physics3DAbiCommandByteLength,
  Physics3DAbiCommandHeaderByteLength,
  Physics3DAbiCommandKind,
  Physics3DAbiCommandMagic,
  Physics3DAbiCommandRecordHeaderByteLength,
  Physics3DAbiContactFlag,
  Physics3DAbiContactIdStride,
  Physics3DAbiContactPointValueStride,
  Physics3DAbiContactValueStride,
  Physics3DAbiJointFlag,
  Physics3DAbiJointKind,
  Physics3DAbiJointValueStride,
  Physics3DAbiMaxContactPoints,
  Physics3DAbiQueryValueStride,
  Physics3DAbiSetColliderPayloadOffset,
  Physics3DAbiShapeHeaderByteLength,
  Physics3DAbiShapeKind,
  Physics3DAbiVersion,
} from './physics3DAbiLayout';

export function createReferencePhysics3DAbi(): Physics3DAbi {
  const out = allocateEntity<Physics3DAbi>();
  initializeReferencePhysics3DAbi(out);
  return finishEntity(out);
}

export function initializeReferencePhysics3DAbi(out: EntityConstruction<Physics3DAbi>): void {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionPairTests3D();
  registerBuiltInCollisionFaceQueries3D();
  const worlds = new Map<number, ReferencePhysics3DAbiWorld>();
  let nextWorldHandle = 1;
  out.version = Physics3DAbiVersion;
  out.capabilities =
    Physics3DAbiCapability.ContactHooks |
    Physics3DAbiCapability.PersistentWorlds |
    Physics3DAbiCapability.Queries |
    Physics3DAbiCapability.SelectiveReadback;
  out.createWorld = (): Physics3DAbiWorldHandle => {
    if (nextWorldHandle > 0xffffffff) return 0;
    const handle = nextWorldHandle;
    nextWorldHandle += 1;
    const world = createPhysics3DWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    worlds.set(handle, createReferenceWorld(world));
    return handle;
  };
  out.destroyWorld = (handle): boolean => {
    if (worlds.get(handle)?.stepping === true) return false;
    return worlds.delete(handle);
  };
  out.getWorldStatus = (handle): Physics3DAbiWorldStatus => {
    const state = worlds.get(handle);
    if (state === undefined) return 'Stale';
    return state.stepping ? 'Busy' : 'Ready';
  };
  out.execute = (handle, commands, out): boolean => {
    const state = worlds.get(handle);
    if (state === undefined) return failExecution(out, 'StaleWorld', 0, Physics3DAbiCommandHeaderByteLength, 0);
    if (state.stepping) return failExecution(out, 'BusyWorld', 0, Physics3DAbiCommandHeaderByteLength, 0);
    return executeCommands(state, commands, out);
  };
  out.step = (handle, dt, hooks): Physics3DAbiStepStatus => {
    const state = worlds.get(handle);
    if (state === undefined) return 'StaleWorld';
    if (state.stepping) return 'BusyWorld';
    return stepReferenceWorld(state, dt, hooks);
  };
  out.readBodies = (handle, bodyIds, out): boolean => {
    const state = worlds.get(handle);
    if (state === undefined || state.stepping) return false;
    readBodies(state, bodyIds, out);
    return true;
  };
  out.readContacts = (handle, selection, out): boolean => {
    const state = worlds.get(handle);
    if (state === undefined || state.stepping) return false;
    readContacts(state, selection, out);
    return true;
  };
  out.readJoints = (handle, out): boolean => {
    const state = worlds.get(handle);
    if (state === undefined || state.stepping) return false;
    readJoints(state, out);
    return true;
  };
  out.queryPoint = (handle, x, y, z, filter, out): boolean => {
    const state = worlds.get(handle);
    if (state === undefined || state.stepping) return false;
    queryPhysics3DPoint(state.world, x, y, z, state.query, filter ?? undefined);
    writeQueryHits(state, state.query, out);
    return true;
  };
  out.queryRay = (
    handle,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    maxFraction,
    closest,
    filter,
    out,
  ) => {
    const state = worlds.get(handle);
    if (state === undefined || state.stepping) return false;
    const query = closest ? queryPhysics3DRayClosest : queryPhysics3DRay;
    query(
      state.world,
      originX,
      originY,
      originZ,
      directionX,
      directionY,
      directionZ,
      state.ray,
      maxFraction,
      filter ?? undefined,
    );
    writeRayHits(state, out);
    return true;
  };
  out.queryRegion = (handle, region, filter, out): boolean => {
    const state = worlds.get(handle);
    if (state === undefined || state.stepping) return false;
    queryPhysics3DRegion(state.world, region, state.query, filter ?? undefined);
    writeQueryHits(state, state.query, out);
    return true;
  };
  out.queryShapeCast = (handle, shape, dx, dy, dz, maxFraction, filter, out): boolean => {
    const state = worlds.get(handle);
    if (state === undefined || state.stepping) return false;
    queryPhysics3DShapeCast(state.world, shape, dx, dy, dz, state.shapeCast, maxFraction, filter ?? undefined);
    writeShapeCastHit(state, out);
    return true;
  };
}

interface ReferencePhysics3DAbiCollider {
  readonly bodyId: number;
  readonly collider: Physics3DCollider;
}

interface ReferencePhysics3DAbiWorld {
  readonly world: Physics3DWorld;
  readonly bodyById: Map<number, RigidBody3D>;
  readonly idByBody: Map<RigidBody3D, number>;
  readonly bodyIds: number[];
  readonly colliderById: Map<number, ReferencePhysics3DAbiCollider>;
  readonly idByCollider: Map<Physics3DCollider, number>;
  readonly jointById: Map<number, Physics3DJoint>;
  readonly idByJoint: Map<Physics3DJoint, number>;
  readonly jointIds: number[];
  readonly query: ReturnType<typeof createPhysics3DQueryResult>;
  readonly ray: ReturnType<typeof createPhysics3DRayResult>;
  readonly shapeCast: ReturnType<typeof createPhysics3DShapeCastResult>;
  readonly reaction: ReturnType<typeof createPhysics3DJointReaction>;
  readonly bodyValues: number[];
  readonly jointCommonValues: number[];
  readonly jointKindValues: number[];
  activeHooks: Readonly<Physics3DAbiContactHooks> | null;
  stepping: boolean;
  readonly preSolveHook: Physics3DContactCallback;
  readonly postSolveHook: Physics3DContactCallback;
}

interface CommandRecord {
  readonly view: DataView;
  readonly start: number;
  readonly payload: number;
  readonly byteLength: number;
  readonly kind: number;
  readonly objectId: number;
  readonly relatedId: number;
}

function createReferenceWorld(world: Physics3DWorld): ReferencePhysics3DAbiWorld {
  let state: ReferencePhysics3DAbiWorld;
  state = {
    world,
    bodyById: new Map(),
    idByBody: new Map(),
    bodyIds: [],
    colliderById: new Map(),
    idByCollider: new Map(),
    jointById: new Map(),
    idByJoint: new Map(),
    jointIds: [],
    query: createPhysics3DQueryResult(),
    ray: createPhysics3DRayResult(),
    shapeCast: createPhysics3DShapeCastResult(),
    reaction: createPhysics3DJointReaction(),
    bodyValues: new Array<number>(Physics3DAbiBodyValueStride).fill(0),
    jointCommonValues: new Array<number>(16).fill(0),
    jointKindValues: new Array<number>(14).fill(0),
    activeHooks: null,
    stepping: false,
    preSolveHook(_world, contact): void {
      const hooks = state.activeHooks;
      if (hooks?.preSolve !== null && hooks?.preSolve !== undefined) {
        invokeContactHook(state, contact, hooks.buffer, hooks.preSolve);
      }
    },
    postSolveHook(_world, contact): void {
      const hooks = state.activeHooks;
      if (hooks?.postSolve !== null && hooks?.postSolve !== undefined) {
        invokeContactHook(state, contact, hooks.buffer, hooks.postSolve);
      }
    },
  };
  return state;
}

function executeCommands(
  state: ReferencePhysics3DAbiWorld,
  commands: Readonly<Physics3DAbiCommandBuffer>,
  out: Physics3DAbiExecutionResult,
): boolean {
  if (!isCommandBufferValid(commands)) {
    return failExecution(out, 'InvalidBuffer', 0, Physics3DAbiCommandHeaderByteLength, 0);
  }

  const view = new DataView(commands.data.buffer, commands.data.byteOffset, commands.data.byteLength);
  let byteOffset = Physics3DAbiCommandHeaderByteLength;
  for (let commandIndex = 0; commandIndex < commands.commandCount; commandIndex += 1) {
    if (byteOffset + Physics3DAbiCommandRecordHeaderByteLength > commands.byteLength) {
      return failExecution(out, 'InvalidBuffer', commandIndex, byteOffset, 0);
    }
    const kind = view.getUint32(byteOffset, true);
    const byteLength = view.getUint32(byteOffset + 4, true);
    if (
      byteLength < Physics3DAbiCommandRecordHeaderByteLength ||
      byteLength % 8 !== 0 ||
      byteOffset + byteLength > commands.byteLength
    ) {
      return failExecution(out, 'InvalidBuffer', commandIndex, byteOffset, kind);
    }
    const record: CommandRecord = {
      view,
      start: byteOffset,
      payload: byteOffset + Physics3DAbiCommandRecordHeaderByteLength,
      byteLength,
      kind,
      objectId: view.getUint32(byteOffset + 8, true),
      relatedId: view.getUint32(byteOffset + 12, true),
    };
    const status = executeCommand(state, record);
    if (status !== 'Complete') return failExecution(out, status, commandIndex, byteOffset, kind);
    byteOffset += byteLength;
  }
  if (byteOffset !== commands.byteLength) {
    return failExecution(out, 'InvalidBuffer', commands.commandCount, byteOffset, 0);
  }
  out.status = 'Complete';
  out.commandIndex = commands.commandCount;
  out.byteOffset = byteOffset;
  out.commandKind = 0;
  return true;
}

function executeCommand(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (command.kind === Physics3DAbiCommandKind.SetGravity) return executeSetGravity(state, command);
  if (command.kind === Physics3DAbiCommandKind.SetSolverConfig) return executeSetSolverConfig(state, command);
  if (command.kind === Physics3DAbiCommandKind.SetBody) return executeSetBody(state, command);
  if (command.kind === Physics3DAbiCommandKind.DestroyBody) return executeDestroyBody(state, command);
  if (command.kind === Physics3DAbiCommandKind.SetCollider) return executeSetCollider(state, command);
  if (command.kind === Physics3DAbiCommandKind.DestroyCollider) return executeDestroyCollider(state, command);
  if (command.kind === Physics3DAbiCommandKind.SetJoint) return executeSetJoint(state, command);
  if (command.kind === Physics3DAbiCommandKind.DestroyJoint) return executeDestroyJoint(state, command);
  if (command.kind === Physics3DAbiCommandKind.ApplyForce)
    return executeBodyAction(state, command, applyPhysics3DForce);
  if (command.kind === Physics3DAbiCommandKind.ApplyForceAtPoint) {
    return executeBodyPointAction(state, command, applyPhysics3DForceAtPoint);
  }
  if (command.kind === Physics3DAbiCommandKind.ApplyLinearImpulse) {
    return executeBodyAction(state, command, applyPhysics3DLinearImpulse);
  }
  if (command.kind === Physics3DAbiCommandKind.ApplyLinearImpulseAtPoint) {
    return executeBodyPointAction(state, command, applyPhysics3DLinearImpulseAtPoint);
  }
  if (command.kind === Physics3DAbiCommandKind.ApplyTorque)
    return executeBodyAction(state, command, applyPhysics3DTorque);
  if (command.kind === Physics3DAbiCommandKind.WakeBody) return executeWakeBody(state, command);
  return 'InvalidCommand';
}

function executeSetGravity(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.SetGravity ||
    command.objectId !== 0 ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const x = command.view.getFloat64(command.payload, true);
  const y = command.view.getFloat64(command.payload + 8, true);
  const z = command.view.getFloat64(command.payload + 16, true);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 'RejectedMutation';
  state.world.gravityX = x;
  state.world.gravityY = y;
  state.world.gravityZ = z;
  return 'Complete';
}

function executeSetSolverConfig(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.SetSolverConfig ||
    command.objectId !== 0 ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const flags = command.view.getUint32(command.payload, true);
  if (
    (flags & 0b111) !== flags ||
    command.view.getUint32(command.payload + 24, true) !== 0 ||
    command.view.getUint32(command.payload + 28, true) !== 0
  ) {
    return 'InvalidCommand';
  }
  const config = {
    allowSleeping: (flags & 1) !== 0,
    continuousCollision: (flags & (1 << 1)) !== 0,
    substeps: command.view.getUint32(command.payload + 4, true),
    maxCcdSubsteps: command.view.getUint32(command.payload + 8, true),
    maxCcdRotationSubsteps: command.view.getUint32(command.payload + 12, true),
    sleepLinearThreshold: command.view.getFloat64(command.payload + 32, true),
    sleepAngularThreshold: command.view.getFloat64(command.payload + 40, true),
    timeToSleep: command.view.getFloat64(command.payload + 48, true),
    sequentialImpulse: {
      velocityIterations: command.view.getUint32(command.payload + 16, true),
      positionIterations: command.view.getUint32(command.payload + 20, true),
      penetrationSlop: command.view.getFloat64(command.payload + 56, true),
      positionCorrection: command.view.getFloat64(command.payload + 64, true),
      restitutionThreshold: command.view.getFloat64(command.payload + 72, true),
      warmStarting: (flags & (1 << 2)) !== 0,
    },
  };
  if (
    !isPhysics3DSubstepsValid(config) ||
    !isPhysics3DVelocityIterationsValid(config) ||
    !isPhysics3DPositionIterationsValid(config) ||
    !isPhysics3DSolverConfigValid(config)
  ) {
    return 'RejectedMutation';
  }
  state.world.config = config;
  return 'Complete';
}

function executeSetBody(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.SetBody ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const flags = command.view.getUint32(command.payload, true);
  if ((flags & PHYSICS3D_ABI_BODY_FLAG_MASK) !== flags || command.view.getUint32(command.payload + 4, true) !== 0) {
    return 'InvalidCommand';
  }
  const type = decodeBodyType(flags & Physics3DAbiBodyFlag.TypeMask);
  const values = readFloat64Values(command, 8, state.bodyValues);
  if (type === null || !isBodyValueBlockValid(values)) return 'RejectedMutation';

  let body = state.bodyById.get(command.objectId);
  const added = body === undefined;
  body ??= createRigidBody3D(type);
  if (!setPhysics3DBodyType(body, type)) return 'RejectedMutation';
  if (!setPhysics3DBodyFixedRotation(body, (flags & Physics3DAbiBodyFlag.FixedRotation) !== 0)) {
    return 'RejectedMutation';
  }
  if (!setPhysics3DBodyBullet(body, (flags & Physics3DAbiBodyFlag.Bullet) !== 0)) return 'RejectedMutation';
  if (!setPhysics3DBodySleepEnabled(body, (flags & Physics3DAbiBodyFlag.SleepEnabled) !== 0)) {
    return 'RejectedMutation';
  }
  if (!setPhysics3DBodyTransform(body, values[0], values[1], values[2], values[3], values[4], values[5], values[6])) {
    return 'RejectedMutation';
  }
  setRigidBody3DMassData(
    body,
    (() => {
      const out = allocateEntity<Physics3DMassData>();
      out.mass = values[19];
      out.inertiaXX = values[20];
      out.inertiaYY = values[21];
      out.inertiaZZ = values[22];
      out.inertiaXY = values[23];
      out.inertiaXZ = values[24];
      out.inertiaYZ = values[25];
      out.centerX = values[26];
      out.centerY = values[27];
      out.centerZ = values[28];
      return finishEntity(out);
    })(),
  );
  refreshRigidBody3DWorldInertia(body);
  writeBodyDynamicValues(body, values, flags);

  if (added) {
    addPhysics3DBody(state.world, body);
    state.bodyById.set(command.objectId, body);
    state.idByBody.set(body, command.objectId);
    insertSorted(state.bodyIds, command.objectId);
  }
  return 'Complete';
}

function executeDestroyBody(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.DestroyBody ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.objectId);
  if (body === undefined) return 'MissingBody';
  for (const [id, held] of state.colliderById) {
    if (held.bodyId !== command.objectId) continue;
    state.colliderById.delete(id);
    state.idByCollider.delete(held.collider);
  }
  for (const [id, joint] of state.jointById) {
    if (joint.bodyA !== body.index && joint.bodyB !== body.index) continue;
    state.jointById.delete(id);
    state.idByJoint.delete(joint);
    removeSorted(state.jointIds, id);
  }
  removePhysics3DBody(state.world, body);
  state.bodyById.delete(command.objectId);
  state.idByBody.delete(body);
  removeSorted(state.bodyIds, command.objectId);
  return 'Complete';
}

function executeSetCollider(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    !isObjectId(command.objectId) ||
    !isObjectId(command.relatedId) ||
    command.byteLength < Physics3DAbiCommandByteLength.SetColliderMinimum
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.relatedId);
  if (body === undefined) return 'MissingBody';
  const colliderFlags = command.view.getUint32(command.payload, true);
  if ((colliderFlags & 1) !== colliderFlags) return 'InvalidCommand';
  const shapeCode = command.view.getUint32(command.payload + Physics3DAbiSetColliderPayloadOffset.Shape, true);
  if (shapeCode < Physics3DAbiShapeKind.Sphere || shapeCode > Physics3DAbiShapeKind.Heightfield) {
    return 'UnsupportedShape';
  }
  const shape = readShape(command, command.payload + Physics3DAbiSetColliderPayloadOffset.Shape);
  if (shape === null) return 'InvalidCommand';
  if (!isShapeValid(shape)) return 'RejectedMutation';
  if (body.type !== 'static' && (shape.kind === 'triangle-mesh' || shape.kind === 'heightfield')) {
    return 'RejectedMutation';
  }
  const density = command.view.getFloat64(command.payload + 16, true);
  const friction = command.view.getFloat64(command.payload + 24, true);
  const restitution = command.view.getFloat64(command.payload + 32, true);
  const categoryBits = command.view.getUint32(command.payload + 4, true);
  const maskBits = command.view.getUint32(command.payload + 8, true);
  const groupIndex = command.view.getInt32(command.payload + 12, true);
  if (![density, friction, restitution].every((value) => Number.isFinite(value) && value >= 0)) {
    return 'RejectedMutation';
  }
  const collider = createPhysics3DCollider(
    shape,
    { density, friction, restitution },
    { categoryBits, maskBits, groupIndex },
    (colliderFlags & 1) !== 0,
  );
  const previous = state.colliderById.get(command.objectId);
  if (previous !== undefined) {
    const previousBody = state.bodyById.get(previous.bodyId);
    if (previousBody === undefined) return 'MissingBody';
    removePhysics3DCollider(state.world, previousBody, previous.collider);
    state.idByCollider.delete(previous.collider);
  }
  addPhysics3DCollider(state.world, body, collider);
  state.colliderById.set(command.objectId, { bodyId: command.relatedId, collider });
  state.idByCollider.set(collider, command.objectId);
  return 'Complete';
}

function executeDestroyCollider(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.DestroyCollider ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const held = state.colliderById.get(command.objectId);
  if (held === undefined) return 'MissingCollider';
  const body = state.bodyById.get(held.bodyId);
  if (body === undefined || !removePhysics3DCollider(state.world, body, held.collider)) return 'MissingBody';
  state.colliderById.delete(command.objectId);
  state.idByCollider.delete(held.collider);
  return 'Complete';
}

function executeSetJoint(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.SetJoint ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const kind = command.view.getUint32(command.payload, true);
  if (kind < Physics3DAbiJointKind.BallAndSocket || kind > Physics3DAbiJointKind.Generic6Dof) {
    return 'UnsupportedJoint';
  }
  const bodyAId = command.view.getUint32(command.payload + 4, true);
  const bodyBId = command.view.getUint32(command.payload + 8, true);
  if (!isObjectId(bodyAId) || !isObjectId(bodyBId)) return 'InvalidCommand';
  const bodyA = state.bodyById.get(bodyAId);
  const bodyB = state.bodyById.get(bodyBId);
  if (bodyA === undefined || bodyB === undefined) return 'MissingBody';
  const flags = command.view.getUint32(command.payload + 12, true);
  if ((flags & getJointFlagMask(kind)) !== flags) return 'InvalidCommand';
  const common = readFloat64Values(command, 16, state.jointCommonValues);
  const values = readFloat64Values(command, 144, state.jointKindValues);
  if (!isJointValueBlockValid(kind, common, values)) return 'RejectedMutation';
  const joint = createJoint(kind, bodyA.index, bodyB.index, flags, common, values);
  if (joint === null) return 'UnsupportedJoint';
  joint.broken = (flags & (1 << 1)) !== 0;
  const previous = state.jointById.get(command.objectId);
  if (previous !== undefined) {
    removePhysics3DJoint(state.world, previous);
    state.idByJoint.delete(previous);
  }
  addPhysics3DJoint(state.world, joint);
  state.jointById.set(command.objectId, joint);
  state.idByJoint.set(joint, command.objectId);
  if (previous === undefined) insertSorted(state.jointIds, command.objectId);
  return 'Complete';
}

function executeDestroyJoint(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.DestroyJoint ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const joint = state.jointById.get(command.objectId);
  if (joint === undefined) return 'MissingJoint';
  removePhysics3DJoint(state.world, joint);
  state.jointById.delete(command.objectId);
  state.idByJoint.delete(joint);
  removeSorted(state.jointIds, command.objectId);
  return 'Complete';
}

function executeBodyAction(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
  action: (body: RigidBody3D, x: number, y: number, z: number) => boolean,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.BodyAction ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.objectId);
  if (body === undefined) return 'MissingBody';
  return action(
    body,
    command.view.getFloat64(command.payload, true),
    command.view.getFloat64(command.payload + 8, true),
    command.view.getFloat64(command.payload + 16, true),
  )
    ? 'Complete'
    : 'RejectedMutation';
}

function executeBodyPointAction(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
  action: (
    body: RigidBody3D,
    x: number,
    y: number,
    z: number,
    pointX: number,
    pointY: number,
    pointZ: number,
  ) => boolean,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.BodyAction ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.objectId);
  if (body === undefined) return 'MissingBody';
  return action(
    body,
    command.view.getFloat64(command.payload, true),
    command.view.getFloat64(command.payload + 8, true),
    command.view.getFloat64(command.payload + 16, true),
    command.view.getFloat64(command.payload + 24, true),
    command.view.getFloat64(command.payload + 32, true),
    command.view.getFloat64(command.payload + 40, true),
  )
    ? 'Complete'
    : 'RejectedMutation';
}

function executeWakeBody(
  state: ReferencePhysics3DAbiWorld,
  command: Readonly<CommandRecord>,
): Physics3DAbiExecutionStatus {
  if (
    command.byteLength !== Physics3DAbiCommandByteLength.WakeBody ||
    !isObjectId(command.objectId) ||
    command.relatedId !== 0
  ) {
    return 'InvalidCommand';
  }
  const body = state.bodyById.get(command.objectId);
  if (body === undefined) return 'MissingBody';
  wakePhysics3DBody(body);
  return 'Complete';
}

function createJoint(
  kind: number,
  bodyA: number,
  bodyB: number,
  flags: number,
  common: Readonly<number[]>,
  values: Readonly<number[]>,
): Physics3DJoint | null {
  const options = {
    bodyA,
    bodyB,
    localAnchorAX: common[0],
    localAnchorAY: common[1],
    localAnchorAZ: common[2],
    localAnchorBX: common[3],
    localAnchorBY: common[4],
    localAnchorBZ: common[5],
    breakForce: common[6],
    breakTorque: common[7],
    collideConnected: (flags & 1) !== 0,
  };
  const frames = {
    ...options,
    localRotationAX: common[8],
    localRotationAY: common[9],
    localRotationAZ: common[10],
    localRotationAW: common[11],
    localRotationBX: common[12],
    localRotationBY: common[13],
    localRotationBZ: common[14],
    localRotationBW: common[15],
  };
  if (kind === Physics3DAbiJointKind.BallAndSocket) return createPhysics3DBallAndSocketJoint(options);
  if (kind === Physics3DAbiJointKind.Distance) {
    return createPhysics3DDistanceJoint({
      ...options,
      length: values[0],
      frequencyHz: values[1],
      dampingRatio: values[2],
      minLength: values[3],
      maxLength: values[4],
      enableSpring: (flags & (1 << 2)) !== 0,
      enableLimit: (flags & (1 << 3)) !== 0,
    });
  }
  if (kind === Physics3DAbiJointKind.Fixed) return createPhysics3DFixedJoint(frames);
  if (kind === Physics3DAbiJointKind.Hinge) {
    return createPhysics3DHingeJoint({
      ...frames,
      lowerAngle: values[0],
      upperAngle: values[1],
      motorSpeed: values[2],
      maxMotorTorque: values[3],
      limitFrequencyHz: values[4],
      limitDampingRatio: values[5],
      enableLimit: (flags & (1 << 2)) !== 0,
      enableMotor: (flags & (1 << 3)) !== 0,
      enableLimitSpring: (flags & (1 << 4)) !== 0,
    });
  }
  if (kind === Physics3DAbiJointKind.Slider) {
    return createPhysics3DSliderJoint({
      ...frames,
      lowerTranslation: values[0],
      upperTranslation: values[1],
      motorSpeed: values[2],
      maxMotorForce: values[3],
      limitFrequencyHz: values[4],
      limitDampingRatio: values[5],
      enableLimit: (flags & (1 << 2)) !== 0,
      enableMotor: (flags & (1 << 3)) !== 0,
      enableLimitSpring: (flags & (1 << 4)) !== 0,
    });
  }
  if (kind === Physics3DAbiJointKind.ConeTwist) {
    return createPhysics3DConeTwistJoint({
      ...frames,
      swingLimitY: values[0],
      swingLimitZ: values[1],
      lowerTwistAngle: values[2],
      upperTwistAngle: values[3],
      limitFrequencyHz: values[4],
      limitDampingRatio: values[5],
      enableSwingLimit: (flags & (1 << 2)) !== 0,
      enableTwistLimit: (flags & (1 << 3)) !== 0,
      enableLimitSpring: (flags & (1 << 4)) !== 0,
    });
  }
  if (kind === Physics3DAbiJointKind.Generic6Dof) {
    return createPhysics3DGeneric6DofJoint({
      ...frames,
      lowerLinearX: values[0],
      lowerLinearY: values[1],
      lowerLinearZ: values[2],
      upperLinearX: values[3],
      upperLinearY: values[4],
      upperLinearZ: values[5],
      lowerAngularX: values[6],
      lowerAngularY: values[7],
      lowerAngularZ: values[8],
      upperAngularX: values[9],
      upperAngularY: values[10],
      upperAngularZ: values[11],
      limitFrequencyHz: values[12],
      limitDampingRatio: values[13],
      enableLimitSpring: (flags & (1 << 2)) !== 0,
    });
  }
  return null;
}

function readShape(command: Readonly<CommandRecord>, byteOffset: number): CollisionColliderShape3D | null {
  if (byteOffset + Physics3DAbiShapeHeaderByteLength > command.start + command.byteLength) return null;
  const kind = command.view.getUint32(byteOffset, true);
  const scalarCount = command.view.getUint32(byteOffset + 4, true);
  const integerCount = command.view.getUint32(byteOffset + 8, true);
  const version = command.view.getUint32(byteOffset + 12, true);
  if (kind !== Physics3DAbiShapeKind.TriangleMesh && kind !== Physics3DAbiShapeKind.Heightfield && version !== 0) {
    return null;
  }
  const scalarOffset = byteOffset + Physics3DAbiShapeHeaderByteLength;
  const integerOffset = scalarOffset + scalarCount * 8;
  const unalignedShapeEnd = integerOffset + integerCount * 4;
  const shapeEnd = align8(unalignedShapeEnd);
  if (shapeEnd !== command.start + command.byteLength) return null;
  for (let i = unalignedShapeEnd; i < shapeEnd; i += 1) {
    if (command.view.getUint8(i) !== 0) return null;
  }
  const values = new Array<number>(scalarCount);
  for (let i = 0; i < scalarCount; i += 1) values[i] = command.view.getFloat64(scalarOffset + i * 8, true);
  if (!areFinite(values)) return null;
  const integers = new Array<number>(integerCount);
  for (let i = 0; i < integerCount; i += 1) integers[i] = command.view.getUint32(integerOffset + i * 4, true);

  if (kind === Physics3DAbiShapeKind.Sphere && scalarCount === 4 && integerCount === 0) {
    return { kind: 'sphere', x: values[0], y: values[1], z: values[2], radius: values[3] };
  }
  if (kind === Physics3DAbiShapeKind.Aabb && scalarCount === 6 && integerCount === 0) {
    return {
      kind: 'aabb',
      minX: values[0],
      minY: values[1],
      minZ: values[2],
      maxX: values[3],
      maxY: values[4],
      maxZ: values[5],
    };
  }
  if (kind === Physics3DAbiShapeKind.Box && scalarCount === 10 && integerCount === 0) {
    return {
      kind: 'box',
      x: values[0],
      y: values[1],
      z: values[2],
      halfX: values[3],
      halfY: values[4],
      halfZ: values[5],
      rotationX: values[6],
      rotationY: values[7],
      rotationZ: values[8],
      rotationW: values[9],
    };
  }
  if (
    (kind === Physics3DAbiShapeKind.Capsule || kind === Physics3DAbiShapeKind.Cylinder) &&
    scalarCount === 7 &&
    integerCount === 0
  ) {
    const shape = {
      x0: values[0],
      y0: values[1],
      z0: values[2],
      x1: values[3],
      y1: values[4],
      z1: values[5],
      radius: values[6],
    };
    return kind === Physics3DAbiShapeKind.Capsule ? { kind: 'capsule', ...shape } : { kind: 'cylinder', ...shape };
  }
  if (kind === Physics3DAbiShapeKind.Cone && scalarCount === 7 && integerCount === 0) {
    return {
      kind: 'cone',
      apexX: values[0],
      apexY: values[1],
      apexZ: values[2],
      baseX: values[3],
      baseY: values[4],
      baseZ: values[5],
      radius: values[6],
    };
  }
  if (kind === Physics3DAbiShapeKind.Convex && integerCount === 0) return { kind: 'convex', points: values };
  if (kind === Physics3DAbiShapeKind.TriangleMesh && scalarCount >= 7) {
    const mesh = createCollisionTriangleMesh3D(values.slice(7), integers);
    mesh.version = version;
    mesh.x = values[0];
    mesh.y = values[1];
    mesh.z = values[2];
    mesh.rotationX = values[3];
    mesh.rotationY = values[4];
    mesh.rotationZ = values[5];
    mesh.rotationW = values[6];
    return mesh;
  }
  if (kind === Physics3DAbiShapeKind.Heightfield && scalarCount >= 9 && integerCount === 2) {
    const heightfield = createCollisionHeightfield3D(integers[0], integers[1], values.slice(9), values[0], values[1]);
    heightfield.version = version;
    heightfield.x = values[2];
    heightfield.y = values[3];
    heightfield.z = values[4];
    heightfield.rotationX = values[5];
    heightfield.rotationY = values[6];
    heightfield.rotationZ = values[7];
    heightfield.rotationW = values[8];
    return heightfield;
  }
  return null;
}

function isShapeValid(shape: Readonly<CollisionColliderShape3D>): boolean {
  if (shape.kind === 'triangle-mesh') return getCollisionTriangleMeshValidationStatus3D(shape) === null;
  if (shape.kind === 'heightfield') return getCollisionHeightfieldValidationStatus3D(shape) === null;
  return getCollisionShapeValidationStatus3D(shape) === null;
}

function stepReferenceWorld(
  state: ReferencePhysics3DAbiWorld,
  dt: number,
  hooks: Readonly<Physics3DAbiContactHooks> | null,
): Physics3DAbiStepStatus {
  const world = state.world;
  if (!canStep(world, dt)) return 'Declined';
  if (hooks !== null && (hooks.preSolve !== null || hooks.postSolve !== null) && !hasHookCapacity(hooks.buffer)) {
    return 'InsufficientHookBuffer';
  }

  const previousPreSolve = world.contactHooks.preSolve;
  const previousPostSolve = world.contactHooks.postSolve;
  state.stepping = true;
  state.activeHooks = hooks;
  world.contactHooks.preSolve = hooks?.preSolve === null || hooks === null ? null : state.preSolveHook;
  world.contactHooks.postSolve = hooks?.postSolve === null || hooks === null ? null : state.postSolveHook;
  try {
    stepPhysics3D(world, dt);
  } finally {
    world.contactHooks.preSolve = previousPreSolve;
    world.contactHooks.postSolve = previousPostSolve;
    state.activeHooks = null;
    state.stepping = false;
  }
  return 'Complete';
}

function canStep(world: Readonly<Physics3DWorld>, dt: number): boolean {
  return (
    isPhysics3DTimestepValid(dt) &&
    isPhysics3DSubstepsValid(world.config) &&
    isPhysics3DVelocityIterationsValid(world.config) &&
    isPhysics3DPositionIterationsValid(world.config) &&
    isPhysics3DSolverConfigValid(world.config) &&
    isPhysics3DGravityValid(world) &&
    isPhysics3DBodyStateValid(world) &&
    isPhysics3DColliderStateValid(world) &&
    isPhysics3DContactStateValid(world) &&
    isPhysics3DJointStateValid(world)
  );
}

function hasHookCapacity(buffer: Readonly<Physics3DAbiContactBuffer>): boolean {
  return (
    getContactCapacity(buffer) >= 1 &&
    buffer.pointFeatureIds.length >= Physics3DAbiMaxContactPoints &&
    buffer.pointValues.length >= Physics3DAbiMaxContactPoints * Physics3DAbiContactPointValueStride
  );
}

function invokeContactHook(
  state: ReferencePhysics3DAbiWorld,
  contact: Physics3DContact,
  buffer: Physics3DAbiContactBuffer,
  hook: (contact: Physics3DAbiContactBuffer) => void,
): void {
  clearContactBuffer(buffer);
  writeContact(state, contact, buffer, 0, 0);
  buffer.count = 1;
  buffer.pointCount = contact.pointCount;
  buffer.requiredCount = 1;
  buffer.requiredPointCount = contact.pointCount;
  hook(buffer);
  const values = 0;
  const flags = buffer.flags[0];
  const friction = buffer.values[values + 3];
  const restitution = buffer.values[values + 4];
  if (!Number.isFinite(friction) || friction < 0 || !Number.isFinite(restitution) || restitution < 0) {
    throw new Error('Physics3D ABI contact hook produced invalid contact values');
  }
  contact.enabled = (flags & Physics3DAbiContactFlag.Enabled) !== 0;
  contact.friction = friction;
  contact.restitution = restitution;
}

function readBodies(
  state: ReferencePhysics3DAbiWorld,
  bodyIds: Readonly<Uint32Array<ArrayBufferLike>> | null,
  out: Physics3DAbiBodyBuffer,
): void {
  out.count = 0;
  out.requiredCount = 0;
  const capacity = Math.min(
    out.ids.length,
    out.flags.length,
    Math.floor(out.values.length / Physics3DAbiBodyValueStride),
  );
  if (bodyIds === null) {
    out.requiredCount = state.bodyIds.length;
    for (let i = 0; i < state.bodyIds.length && out.count < capacity; i += 1) {
      const id = state.bodyIds[i];
      const body = state.bodyById.get(id);
      if (body === undefined) continue;
      writeBody(id, body, out, out.count);
      out.count += 1;
    }
    return;
  }
  for (let i = 0; i < bodyIds.length; i += 1) {
    const id = bodyIds[i];
    const body = state.bodyById.get(id);
    if (body === undefined) continue;
    out.requiredCount += 1;
    if (out.count >= capacity) continue;
    writeBody(id, body, out, out.count);
    out.count += 1;
  }
}

function readContacts(
  state: ReferencePhysics3DAbiWorld,
  selection: Physics3DAbiContactSelection,
  out: Physics3DAbiContactBuffer,
): void {
  clearContactBuffer(out);
  const contacts =
    selection === 'All'
      ? state.world.contacts
      : selection === 'Began'
        ? state.world.events.began
        : state.world.events.ended;
  const contactCapacity = getContactCapacity(out);
  const pointCapacity = Math.min(
    out.pointFeatureIds.length,
    Math.floor(out.pointValues.length / Physics3DAbiContactPointValueStride),
  );
  let prefixFits = true;
  for (let i = 0; i < contacts.length; i += 1) {
    const contact = contacts[i];
    out.requiredCount += 1;
    out.requiredPointCount += contact.pointCount;
    if (!prefixFits || out.count >= contactCapacity || out.pointCount + contact.pointCount > pointCapacity) {
      prefixFits = false;
      continue;
    }
    writeContact(state, contact, out, out.count, out.pointCount);
    out.count += 1;
    out.pointCount += contact.pointCount;
  }
}

function readJoints(state: ReferencePhysics3DAbiWorld, out: Physics3DAbiJointBuffer): void {
  out.count = 0;
  out.requiredCount = state.jointIds.length;
  const capacity = Math.min(
    out.ids.length,
    out.flags.length,
    Math.floor(out.values.length / Physics3DAbiJointValueStride),
  );
  for (let i = 0; i < state.jointIds.length; i += 1) {
    if (out.count >= capacity) break;
    const id = state.jointIds[i];
    const joint = state.jointById.get(id);
    if (joint === undefined) continue;
    const at = out.count;
    out.ids[at] = id;
    out.flags[at] = joint.broken ? Physics3DAbiJointFlag.Broken : 0;
    writePhysics3DJointReaction(state.world, joint, state.world.previousTimestep, state.reaction);
    const valueAt = at * Physics3DAbiJointValueStride;
    out.values[valueAt] = state.reaction.forceX;
    out.values[valueAt + 1] = state.reaction.forceY;
    out.values[valueAt + 2] = state.reaction.forceZ;
    out.values[valueAt + 3] = state.reaction.torqueX;
    out.values[valueAt + 4] = state.reaction.torqueY;
    out.values[valueAt + 5] = state.reaction.torqueZ;
    out.count += 1;
  }
}

function writeBody(id: number, body: Readonly<RigidBody3D>, out: Physics3DAbiBodyBuffer, at: number): void {
  out.ids[at] = id;
  out.flags[at] = encodeBodyFlags(body);
  const valueAt = at * Physics3DAbiBodyValueStride;
  out.values[valueAt] = body.x;
  out.values[valueAt + 1] = body.y;
  out.values[valueAt + 2] = body.z;
  out.values[valueAt + 3] = body.orientationX;
  out.values[valueAt + 4] = body.orientationY;
  out.values[valueAt + 5] = body.orientationZ;
  out.values[valueAt + 6] = body.orientationW;
  out.values[valueAt + 7] = body.velocityX;
  out.values[valueAt + 8] = body.velocityY;
  out.values[valueAt + 9] = body.velocityZ;
  out.values[valueAt + 10] = body.angularVelocityX;
  out.values[valueAt + 11] = body.angularVelocityY;
  out.values[valueAt + 12] = body.angularVelocityZ;
  out.values[valueAt + 13] = body.forceX;
  out.values[valueAt + 14] = body.forceY;
  out.values[valueAt + 15] = body.forceZ;
  out.values[valueAt + 16] = body.torqueX;
  out.values[valueAt + 17] = body.torqueY;
  out.values[valueAt + 18] = body.torqueZ;
  out.values[valueAt + 19] = body.mass;
  out.values[valueAt + 20] = body.inertiaXX;
  out.values[valueAt + 21] = body.inertiaYY;
  out.values[valueAt + 22] = body.inertiaZZ;
  out.values[valueAt + 23] = body.inertiaXY;
  out.values[valueAt + 24] = body.inertiaXZ;
  out.values[valueAt + 25] = body.inertiaYZ;
  out.values[valueAt + 26] = body.centerX;
  out.values[valueAt + 27] = body.centerY;
  out.values[valueAt + 28] = body.centerZ;
  out.values[valueAt + 29] = body.linearDamping;
  out.values[valueAt + 30] = body.angularDamping;
  out.values[valueAt + 31] = body.gravityScale;
  out.values[valueAt + 32] = body.sleepTimer;
}

function writeContact(
  state: ReferencePhysics3DAbiWorld,
  contact: Readonly<Physics3DContact>,
  out: Physics3DAbiContactBuffer,
  at: number,
  pointAt: number,
): void {
  const bodyA = state.world.bodyByIndex.get(contact.bodyA);
  const bodyB = state.world.bodyByIndex.get(contact.bodyB);
  const colliderA = bodyA?.colliders[contact.colliderA];
  const colliderB = bodyB?.colliders[contact.colliderB];
  const idAt = at * Physics3DAbiContactIdStride;
  out.ids[idAt] = bodyA === undefined ? 0 : (state.idByBody.get(bodyA) ?? 0);
  out.ids[idAt + 1] = bodyB === undefined ? 0 : (state.idByBody.get(bodyB) ?? 0);
  out.ids[idAt + 2] = colliderA === undefined ? 0 : (state.idByCollider.get(colliderA) ?? 0);
  out.ids[idAt + 3] = colliderB === undefined ? 0 : (state.idByCollider.get(colliderB) ?? 0);
  let flags = 0;
  if (contact.enabled) flags |= Physics3DAbiContactFlag.Enabled;
  if (contact.sensor) flags |= Physics3DAbiContactFlag.Sensor;
  if (contact.touching) flags |= Physics3DAbiContactFlag.Touching;
  out.flags[at] = flags;
  out.pointStarts[at] = pointAt;
  out.pointCounts[at] = contact.pointCount;
  const valueAt = at * Physics3DAbiContactValueStride;
  out.values[valueAt] = contact.normalX;
  out.values[valueAt + 1] = contact.normalY;
  out.values[valueAt + 2] = contact.normalZ;
  out.values[valueAt + 3] = contact.friction;
  out.values[valueAt + 4] = contact.restitution;
  for (let i = 0; i < contact.pointCount; i += 1) {
    const point = contact.points[i];
    const destination = pointAt + i;
    out.pointFeatureIds[destination] = point.featureId >>> 0;
    const pointValueAt = destination * Physics3DAbiContactPointValueStride;
    out.pointValues[pointValueAt] = point.x;
    out.pointValues[pointValueAt + 1] = point.y;
    out.pointValues[pointValueAt + 2] = point.z;
    out.pointValues[pointValueAt + 3] = point.depth;
    out.pointValues[pointValueAt + 4] = point.rAX;
    out.pointValues[pointValueAt + 5] = point.rAY;
    out.pointValues[pointValueAt + 6] = point.rAZ;
    out.pointValues[pointValueAt + 7] = point.rBX;
    out.pointValues[pointValueAt + 8] = point.rBY;
    out.pointValues[pointValueAt + 9] = point.rBZ;
  }
}

function clearContactBuffer(out: Physics3DAbiContactBuffer): void {
  out.count = 0;
  out.pointCount = 0;
  out.requiredCount = 0;
  out.requiredPointCount = 0;
}

function getContactCapacity(out: Readonly<Physics3DAbiContactBuffer>): number {
  return Math.min(
    out.flags.length,
    out.pointStarts.length,
    out.pointCounts.length,
    Math.floor(out.ids.length / Physics3DAbiContactIdStride),
    Math.floor(out.values.length / Physics3DAbiContactValueStride),
  );
}

function writeQueryHits(
  state: ReferencePhysics3DAbiWorld,
  source: ReturnType<typeof createPhysics3DQueryResult>,
  out: Physics3DAbiQueryBuffer,
): void {
  clearQueryBuffer(out, source.hitCount);
  const capacity = getQueryCapacity(out);
  for (let i = 0; i < source.hitCount && i < capacity; i += 1) {
    const hit = source.hits[i];
    writeQueryIdentity(state, hit.body, hit.collider, out, i);
    clearQueryValues(out, i);
    out.count += 1;
  }
}

function writeRayHits(state: ReferencePhysics3DAbiWorld, out: Physics3DAbiQueryBuffer): void {
  clearQueryBuffer(out, state.ray.hitCount);
  const capacity = getQueryCapacity(out);
  for (let i = 0; i < state.ray.hitCount && i < capacity; i += 1) {
    const hit = state.ray.hits[i];
    writeQueryIdentity(state, hit.body, hit.collider, out, i);
    writeQueryValues(out, i, hit.fraction, hit.x, hit.y, hit.z, hit.normalX, hit.normalY, hit.normalZ);
    out.count += 1;
  }
}

function writeShapeCastHit(state: ReferencePhysics3DAbiWorld, out: Physics3DAbiQueryBuffer): void {
  const hit = state.shapeCast;
  clearQueryBuffer(out, hit.hit ? 1 : 0);
  if (!hit.hit || getQueryCapacity(out) === 0 || hit.body === null || hit.collider === null) return;
  writeQueryIdentity(state, hit.body, hit.collider, out, 0);
  writeQueryValues(out, 0, hit.fraction, hit.x, hit.y, hit.z, hit.normalX, hit.normalY, hit.normalZ);
  out.count = 1;
}

function writeQueryIdentity(
  state: ReferencePhysics3DAbiWorld,
  body: RigidBody3D,
  collider: Physics3DCollider,
  out: Physics3DAbiQueryBuffer,
  at: number,
): void {
  out.bodyIds[at] = state.idByBody.get(body) ?? 0;
  out.colliderIds[at] = state.idByCollider.get(collider) ?? 0;
}

function clearQueryBuffer(out: Physics3DAbiQueryBuffer, requiredCount: number): void {
  out.count = 0;
  out.requiredCount = requiredCount;
}

function clearQueryValues(out: Physics3DAbiQueryBuffer, at: number): void {
  const valueAt = at * Physics3DAbiQueryValueStride;
  for (let i = 0; i < Physics3DAbiQueryValueStride; i += 1) out.values[valueAt + i] = 0;
}

function writeQueryValues(
  out: Physics3DAbiQueryBuffer,
  at: number,
  fraction: number,
  x: number,
  y: number,
  z: number,
  normalX: number,
  normalY: number,
  normalZ: number,
): void {
  const valueAt = at * Physics3DAbiQueryValueStride;
  out.values[valueAt] = fraction;
  out.values[valueAt + 1] = x;
  out.values[valueAt + 2] = y;
  out.values[valueAt + 3] = z;
  out.values[valueAt + 4] = normalX;
  out.values[valueAt + 5] = normalY;
  out.values[valueAt + 6] = normalZ;
}

function getQueryCapacity(out: Readonly<Physics3DAbiQueryBuffer>): number {
  return Math.min(
    out.bodyIds.length,
    out.colliderIds.length,
    Math.floor(out.values.length / Physics3DAbiQueryValueStride),
  );
}

function isCommandBufferValid(commands: Readonly<Physics3DAbiCommandBuffer>): boolean {
  if (
    commands.data.byteLength < Physics3DAbiCommandHeaderByteLength ||
    !Number.isSafeInteger(commands.byteLength) ||
    commands.byteLength < Physics3DAbiCommandHeaderByteLength ||
    commands.byteLength > commands.data.byteLength ||
    !Number.isSafeInteger(commands.commandCount) ||
    commands.commandCount < 0 ||
    commands.commandCount >
      Math.floor(
        (commands.byteLength - Physics3DAbiCommandHeaderByteLength) / Physics3DAbiCommandRecordHeaderByteLength,
      )
  ) {
    return false;
  }
  const view = new DataView(commands.data.buffer, commands.data.byteOffset, commands.data.byteLength);
  return (
    view.getUint32(0, true) === Physics3DAbiCommandMagic &&
    view.getUint32(4, true) === Physics3DAbiVersion &&
    view.getUint32(8, true) === commands.byteLength &&
    view.getUint32(12, true) === commands.commandCount
  );
}

function failExecution(
  out: Physics3DAbiExecutionResult,
  status: Physics3DAbiExecutionStatus,
  commandIndex: number,
  byteOffset: number,
  commandKind: number,
): false {
  out.status = status;
  out.commandIndex = commandIndex;
  out.byteOffset = byteOffset;
  out.commandKind = commandKind;
  return false;
}

function readFloat64Values(command: Readonly<CommandRecord>, payloadByteOffset: number, values: number[]): number[] {
  const byteOffset = command.payload + payloadByteOffset;
  for (let i = 0; i < values.length; i += 1) values[i] = command.view.getFloat64(byteOffset + i * 8, true);
  return values;
}

function decodeBodyType(type: number): RigidBody3D['type'] | null {
  if (type === Physics3DAbiBodyType.Dynamic) return 'dynamic';
  if (type === Physics3DAbiBodyType.Kinematic) return 'kinematic';
  if (type === Physics3DAbiBodyType.Static) return 'static';
  return null;
}

function encodeBodyFlags(body: Readonly<RigidBody3D>): number {
  let flags =
    body.type === 'kinematic'
      ? Physics3DAbiBodyType.Kinematic
      : body.type === 'static'
        ? Physics3DAbiBodyType.Static
        : 0;
  if (body.fixedRotation) flags |= Physics3DAbiBodyFlag.FixedRotation;
  if (body.bullet) flags |= Physics3DAbiBodyFlag.Bullet;
  if (body.sleeping) flags |= Physics3DAbiBodyFlag.Sleeping;
  if (body.sleepEnabled) flags |= Physics3DAbiBodyFlag.SleepEnabled;
  return flags;
}

function writeBodyDynamicValues(body: RigidBody3D, values: Readonly<number[]>, flags: number): void {
  const movable = body.type !== 'static';
  const dynamic = body.type === 'dynamic';
  const rotates = movable && !body.fixedRotation;
  body.velocityX = movable ? values[7] : 0;
  body.velocityY = movable ? values[8] : 0;
  body.velocityZ = movable ? values[9] : 0;
  body.angularVelocityX = rotates ? values[10] : 0;
  body.angularVelocityY = rotates ? values[11] : 0;
  body.angularVelocityZ = rotates ? values[12] : 0;
  body.forceX = dynamic ? values[13] : 0;
  body.forceY = dynamic ? values[14] : 0;
  body.forceZ = dynamic ? values[15] : 0;
  body.torqueX = dynamic && rotates ? values[16] : 0;
  body.torqueY = dynamic && rotates ? values[17] : 0;
  body.torqueZ = dynamic && rotates ? values[18] : 0;
  body.linearDamping = values[29];
  body.angularDamping = values[30];
  body.gravityScale = values[31];
  body.sleepTimer = movable && body.sleepEnabled ? values[32] : 0;
  body.sleeping = movable && body.sleepEnabled && (flags & Physics3DAbiBodyFlag.Sleeping) !== 0;
}

function isBodyValueBlockValid(values: Readonly<number[]>): boolean {
  if (!areFinite(values)) return false;
  if (values[19] < 0 || values[29] < 0 || values[30] < 0 || values[32] < 0) return false;
  const orientationLengthSquared =
    values[3] * values[3] + values[4] * values[4] + values[5] * values[5] + values[6] * values[6];
  return orientationLengthSquared > 0;
}

function isJointValueBlockValid(kind: number, common: Readonly<number[]>, values: Readonly<number[]>): boolean {
  for (let i = 0; i < common.length; i += 1) {
    if ((i === 6 || i === 7) && common[i] === Number.POSITIVE_INFINITY) continue;
    if (!Number.isFinite(common[i])) return false;
  }
  for (let i = 0; i < values.length; i += 1) {
    if (kind === Physics3DAbiJointKind.Distance && i === 4 && values[i] === Number.POSITIVE_INFINITY) continue;
    if (!Number.isFinite(values[i])) return false;
  }
  return true;
}

function areFinite(values: Readonly<number[]>): boolean {
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) return false;
  }
  return true;
}

function isObjectId(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

function getJointFlagMask(kind: number): number {
  if (kind === Physics3DAbiJointKind.Distance) return 0b1111;
  if (
    kind === Physics3DAbiJointKind.Hinge ||
    kind === Physics3DAbiJointKind.Slider ||
    kind === Physics3DAbiJointKind.ConeTwist
  ) {
    return 0b11111;
  }
  if (kind === Physics3DAbiJointKind.Generic6Dof) return 0b111;
  return 0b11;
}

function insertSorted(values: number[], value: number): void {
  let at = values.length;
  while (at > 0 && values[at - 1] > value) at -= 1;
  values.splice(at, 0, value);
}

function removeSorted(values: number[], value: number): void {
  const at = values.indexOf(value);
  if (at >= 0) values.splice(at, 1);
}

function align8(value: number): number {
  return Math.ceil(value / 8) * 8;
}

const PHYSICS3D_ABI_BODY_FLAG_MASK =
  Physics3DAbiBodyFlag.TypeMask |
  Physics3DAbiBodyFlag.FixedRotation |
  Physics3DAbiBodyFlag.Bullet |
  Physics3DAbiBodyFlag.Sleeping |
  Physics3DAbiBodyFlag.SleepEnabled;
